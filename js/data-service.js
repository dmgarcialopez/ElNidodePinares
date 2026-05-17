// js/data-service.js
import { CONFIG } from './config.js';
import { state } from './state.js';

// Nombres de las dos bases de datos independientes
const DB_PERSISTENTE_NAME = 'DB_App_Persistente';
const DB_DOWNLOADS_NAME = 'DB_Cache_Descargas';

const DB_VERSION_FIJA = 1;

// 1. Inicializador de la Base de Datos Persistente (Configuraciones y usuario)
async function initPersistenteDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_PERSISTENTE_NAME, DB_VERSION_FIJA);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('config')) {
                db.createObjectStore('config'); // Aquí se guardará la versión de la app
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// 2. Inicializador de la Base de Datos de Descargas (Vídeos, Tracks KML, Iconos)
// Reemplaza conceptualmente a tu antiguo 'initDB' para apuntar a la DB volátil
export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_DOWNLOADS_NAME, DB_VERSION_FIJA);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files'); // Mismo almacén 'files' para no romper compatibilidad
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// --- MÉTODOS DE CONTROL DE VERSIONES (Para app.js) ---

export async function getVersionGuardada() {
    const db = await initPersistenteDB();
    return new Promise((resolve) => {
        const tx = db.transaction('config', 'readonly');
        const req = tx.objectStore('config').get('app_version');
        req.onsuccess = () => resolve(req.result || "0.0.0");
    });
}

export async function saveVersionPersistente(versionString) {
    const db = await initPersistenteDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('config', 'readwrite');
        tx.objectStore('config').put(versionString, 'app_version');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Modificación en js/data-service.js
export async function borrarDBCacheDescargas() {
    // 1. Forzamos el cierre de cualquier conexión activa en este hilo
    try {
        const db = await initDB();
        db.close(); 
        console.log("🔌 Conexión local a DB_Cache_Descargas cerrada para permitir borrado.");
    } catch (e) {
        // Si no se podía abrir o no existía, ignoramos el error y procedemos
    }

    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_DOWNLOADS_NAME);
        req.onsuccess = () => {
            console.log(`🗑️ Base de datos ${DB_DOWNLOADS_NAME} eliminada con éxito.`);
            resolve();
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
            // Si llega aquí, es porque OTRA pestaña o el Service Worker la están bloqueando
            console.warn("⚠️ Borrado bloqueado por otra conexión activa. Forzando continuación...");
            resolve();
        };
    });
}

// --- MÉTODOS EXISTENTES MANTENIDOS EXACTAMENTE IGUAL ---

export async function getVideoUrl(videoName) {
    // Buscamos el archivo en IndexedDB usando la ruta que usamos en la sincronización
    const blob = await getFile(`/videos/${videoName}.mp4`);
    if (!blob) return null;
    return URL.createObjectURL(blob);
}

export async function saveFile(key, blob) {
    const db = await initDB(); // Abre automáticamente DB_Cache_Descargas
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getFile(key) {
    const db = await initDB(); // Abre automáticamente DB_Cache_Descargas
    return new Promise((resolve) => {
        const tx = db.transaction('files', 'readonly');
        const request = tx.objectStore('files').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null); // Seguridad añadida en caso de error de lectura
    });
}

export function formatPwaUrl(url) {
    if (!url || !url.includes("elnidodepinares.es")) return url;
    const separator = url.includes("?") ? "&" : "?";
    return url.includes("utm_source=") ? url.replace(/utm_source=[^&]*/, "utm_source=PWA") : `${url}${separator}utm_source=PWA`;
}

export async function loadAllData() {
    // Aseguramos que ambas bases de datos estén creadas y listas
    await initPersistenteDB();
    await initDB();

    const promesasCarga = [];

    for (let key in CONFIG.URLS) {
        const promesaCsv = new Promise(async (resolve) => {
            // 1. Intentamos leer el CSV guardado en IndexedDB usando su 'key'
            const csvGuardado = await getFile(`csv_${key}`);

            if (csvGuardado) {
                // Si existe localmente, parseamos directamente el texto guardado
                Papa.parse(csvGuardado, {
                    complete: (results) => {
                        procesarDatosCSV(key, results.data);
                        resolve();
                    },
                    error: (err) => {
                        console.error(`Error parseando CSV local (${key}):`, err);
                        resolve();
                    }
                });
            } else {
                // 2. SALVAVIDAS: Si no existiera en la DB, lo descarga (solo pasará si algo se corrompe)
                console.warn(`⚠️ CSV de ${key} no encontrado en IndexedDB. Descargando de emergencia...`);
                Papa.parse(CONFIG.URLS[key], {
                    download: true,
                    downloadRequest: {
                        headers: { 'Accept': 'text/csv' },
                        mode: 'cors' 
                    },
                    complete: async (results) => {
                        procesarDatosCSV(key, results.data);
                        // Convertimos los datos de nuevo a texto CSV para guardarlos limpios
                        const csvTexto = Papa.unparse(results.data);
                        await saveFile(`csv_${key}`, new Blob([csvTexto], { type: 'text/csv' }));
                        resolve();
                    },
                    error: (err) => {
                        console.error(`Error en descarga de emergencia CSV (${key}):`, err);
                        resolve();
                    }
                });
            }
        });

        promesasCarga.push(promesaCsv);
    }

    await Promise.all(promesasCarga);
    console.log("⚙️ Todos los datos se han cargado desde IndexedDB.");
}

// Función auxiliar interna para no repetir código de asignación de datos
function procesarDatosCSV(key, data) {
    if (key === 'duendes') {
        const capturados = state.game?.captured || [];
        state.db.duendes = data.slice(1).filter(d => 
            !capturados.some(c => c[0] === d[0])
        );
        console.log(`✓ Duendes listos: ${state.db.duendes.length}`);
    } else {
        state.db[key] = data.slice(1);
        console.log(`✓ Datos de ${key} cargados`);
    }
}




