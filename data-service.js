import { CONFIG } from './config.js';
import { state } from './state.js';
const DB_NAME = 'PinaresDB';
const DB_VERSION = 1;

export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveFile(key, blob) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getFile(key) {
    const db = await initDB();
    return new Promise((resolve) => {
        const tx = db.transaction('files', 'readonly');
        const request = tx.objectStore('files').get(key);
        request.onsuccess = () => resolve(request.result);
    });
}

export function formatPwaUrl(url) {
    if (!url || !url.includes("elnidodepinares.es")) return url;
    const separator = url.includes("?") ? "&" : "?";
    return url.includes("utm_source=") ? url.replace(/utm_source=[^&]*/, "utm_source=PWA") : `${url}${separator}utm_source=PWA`;
}

export async function loadAllData() {
    for (let key in CONFIG.URLS) {
        Papa.parse(CONFIG.URLS[key], {
            download: true,
            // AÑADIR ESTO: Configura la petición para que sea compatible con CORS y el SW
            downloadRequest: {
                headers: { 'Accept': 'text/csv' },
                mode: 'cors' 
            },
            complete: (results) => {
                // ... (tu lógica de filtrado de duendes se queda igual)
                if (key === 'duendes') {
                    const capturados = state.game?.captured || [];
                    state.db.duendes = results.data.slice(1).filter(d => 
                        !capturados.some(c => c[0] === d[0])
                    );
                    console.log(`✓ Duendes listos: ${state.db.duendes.length}`);
                } else {
                    state.db[key] = results.data.slice(1);
                    console.log(`✓ Datos de ${key} cargados`);
                }
            },
            error: (err) => {
                console.error(`Error cargando CSV (${key}):`, err);
            }
        });
    }
}