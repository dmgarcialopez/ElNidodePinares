// js/app.js
import * as UI from './ui-manager.js';
import * as Game from './game-engine.js';
import * as Data from './data-service.js';
import { state } from './state.js';
import * as Nav from './nav-engine.js';
import { CONFIG } from './config.js';

// --- FUNCIONES PARA LA RUEDA DE CARGA INICIAL ---
function mostrarCargandoInicial() {
    // 1. Bloquear clics en los botones principales
    const botones = document.querySelectorAll('.menu-principal .btn-circle');
    botones.forEach(btn => {
        btn.disabled = true;
        btn.style.cursor = 'wait';
    });

    if (document.getElementById('app-spinner-global')) return;

    // 2. Crear la capa y la rueda animada por encima de todo
    const spinnerContainer = document.createElement('div');
    spinnerContainer.id = 'app-spinner-global';
    
    Object.assign(spinnerContainer.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.3)', zIndex: '99999', pointerEvents: 'auto'
    });

    spinnerContainer.innerHTML = `
        <div style="text-align: center;">
            <svg width="60" height="60" viewBox="0 0 50 50" style="animation: spin 1s linear infinite;">
                <circle cx="25" cy="25" r="20" fill="none" stroke="#a5d6a7" stroke-width="5" stroke-dasharray="31.4 31.4" stroke-linecap="round"></circle>
            </svg>
            <p style="color: white; font-weight: bold; margin-top: 15px; text-shadow: 2px 2px 4px black; font-family: sans-serif;">
                Cargando Datos...
            </p>
        </div>
        <style>
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    `;
    document.body.appendChild(spinnerContainer);
}

function ocultarCargandoInicial() {
    // 1. Reactivar los botones
    const botones = document.querySelectorAll('.menu-principal .btn-circle');
    botones.forEach(btn => {
        btn.disabled = false;
        btn.style.cursor = 'pointer';
    });

    // 2. Quitar la rueda de la pantalla
    const spinner = document.getElementById('app-spinner-global');
    if (spinner) spinner.remove();
}

// ⚙️ FUNCIÓN AISLADA: Gestiona el control inteligente de versiones
async function gestionarControlVersiones() {
    try {
        await Data.loadAllData();

        let cacheNameDelSW = 'ENDP.1.0'; 
        try {
            const cacheKeys = await caches.keys();
            const miCacheApp = cacheKeys.find(key => key.startsWith('ENDP.'));
            if (miCacheApp) {
                const cacheAbierta = await caches.open(miCacheApp);
                const respuestaVersion = await cacheAbierta.match('/pwa-version.txt');
                if (respuestaVersion) {
                    cacheNameDelSW = await respuestaVersion.text();
                }
            }
        } catch (e) {
            console.warn("⚠️ No se pudo leer la versión de la caché aún, usando fallback.");
        }

        const versionActualApp = cacheNameDelSW.replace('ENDP.', ''); 
        const versionElement = document.getElementById('app-version');
        if (versionElement) {
           versionElement.innerText = `v${versionActualApp}`;
        }
        let versionGuardadaDB = await Data.getVersionGuardada();

        if (versionGuardadaDB && versionGuardadaDB.split('.').length > 2) {
            versionGuardadaDB = "0.0"; 
        }
        if (!versionGuardadaDB) {
            versionGuardadaDB = "0.0";
        }

        console.log(`🔍 Control de Versiones -> Detectada desde SW: ${versionActualApp} | Local Almacenado: ${versionGuardadaDB}`);

        if (versionActualApp !== versionGuardadaDB) {
            const partesActuales = versionActualApp.toUpperCase().replace('V', '').split('.');
            const partesGuardadas = versionGuardadaDB.toUpperCase().replace('V', '').split('.');

            const majorActual = Number(partesActuales[0]) || 0;
            const minorActual = Number(partesActuales[1]) || 0;

            const majorGuardada = Number(partesGuardadas[0]) || 0;
            const minorGuardada = Number(partesGuardadas[1]) || 0;

            if (majorActual !== majorGuardada || versionGuardadaDB === "0.0") {
                console.log(`🚨 DETECTADO CAMBIO MAYOR (${majorGuardada}.x ➡️ ${majorActual}.x). Purgando descargas...`);
                
                await Data.borrarDBCacheDescargas();
                await descargarYGuardarGoogleSheets();
                await Data.loadAllData(); 
                
                console.log("📥 Iniciando descarga e indexación del nuevo paquete masivo de datos...");
                await syncHeavyFiles();
                ocultarCargandoInicial();
            } 
            else {
                console.log(`⚙️ Detectado cambio Menor (${majorGuardada}.${minorGuardada} ➡️ ${majorActual}.${minorActual}). Se respetan los archivos existentes.`);
                await descargarYGuardarGoogleSheets();
                await syncHeavyFiles();
                ocultarCargandoInicial();
            }

            await Data.saveVersionPersistente(versionActualApp);
            console.log(`✅ Registro de versión actualizado localmente a: ${versionActualApp}`);

        } else {
            console.log("✅ La aplicación local ya coincide con la última versión del servidor. Saltando limpiezas.");
            await syncHeavyFiles();
            ocultarCargandoInicial();
        }

    } catch (err) {
        console.error("❌ Error crítico gestionando el control de versiones de las bases de datos:", err);
        ocultarCargandoInicial();
    }
}

// Activar el escudo visual inmediatamente
mostrarCargandoInicial();

// Registro del Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'TOAST') {
            const toast = document.getElementById('pwa-toast');
            if (toast) {
                toast.innerText = event.data.text;
                toast.style.display = 'block';
                setTimeout(() => { toast.style.display = 'none'; }, 5000);
            }
        }
    });

    const swUrl = 'sw.js?v=' + new Date().getTime();

    navigator.serviceWorker.register(swUrl) 
        .then(reg => {
            console.log("✅ SW registrado en el subdominio:", reg.scope);
            
            if (reg.installing) {
                reg.installing.addEventListener('statechange', (e) => {
                    if (e.target.state === 'activated') {
                        console.log("⚡ SW recién instalado pasó a ACTIVO. Ejecutando control de versiones...");
                        gestionarControlVersiones();
                    }
                });
            } else {
                gestionarControlVersiones();
            }

            reg.update();
        })
        .catch(err => {
            console.error("❌ Error en el registro:", err);
            gestionarControlVersiones(); 
        });
}

// Función encargada de las descargas pesadas (Corregida colocación del bucle)
async function syncHeavyFiles() {
    const filesToSync = [
        '/tracks/ABEDULARDEMURIELVIEJO.kml',
        '/tracks/BCAMINODELOSLLANOS.kml',
        '/tracks/BCANONDELRIOLOBOS.kml',
        '/tracks/BCASTROVIEJO.kml',
        '/tracks/BEMBALSEDELACUERDADELPOZO.kml',
        '/tracks/BLAFUENTONA.kml',
        '/tracks/BLAMUEDRA.kml',
        '/tracks/BPINARGRANDE.kml',
        '/tracks/BREFUGIODEPESCADORES.kml',
        '/tracks/BSUBIDAALURBION.kml',
        '/tracks/CALATANAZORYSABINAR.kml',
        '/tracks/CANONDELRIOLOBOSYMIRADORDELAGALIANA.kml',
        '/tracks/CASCADADELACHORLA.kml',
        '/tracks/CASCADADELAMINADELMEDICO.kml',
        '/tracks/CASCASADEFUENTETOBA.kml',
        '/tracks/CASTROVIEJO.kml',
        '/tracks/COVARNANTES.kml',
        '/tracks/CUEVASERENA.kml',
        '/tracks/DESFILADERODELAYECLA.kml',
        '/tracks/ELCHORRON.kml',
        '/tracks/EMBALSEDELACUERDADELPOZOYPLAYAPITA.kml',
        '/tracks/ERMITADESANBAUDELIO.kml',
        '/tracks/FUENTESANZA.kml',
        '/tracks/HABUELOSDELBOSQUE.kml',
        '/tracks/HALTOLOSBARRANCOS.kml',
        '/tracks/HANILLOVERDE.kml',
        '/tracks/HAYEDODECOVALEDA.kml',
        '/tracks/HBRABOJO.kml',
        '/tracks/HCASCADASDECOVALEDA.kml',
        '/tracks/HLAGUNASDEURBION.kml',
        '/tracks/HLAMORRADELFRAILE.kml',
        '/tracks/HLOSLLANOS.kml',
        '/tracks/HMOJONPARDO.kml',
        '/tracks/HOTEROMAYOR.kml',
        '/tracks/HVALDELAHIERBA.kml',
        '/tracks/LAFUENTONA.kml',
        '/tracks/LAGUNANEGRA.kml',
        '/tracks/LAGUNASDENEILA.kml',
        '/tracks/LAGUNAVERDE.kml',
        '/tracks/LAMUEDRA.kml',
        '/tracks/LASCALDERASDELRIOPALAZUELO.kml',
        '/tracks/MIRADORDECABEZAALTA.kml',
        '/tracks/MIRADORDELAGUNANEGRAYLAGUNAHELADA.kml',
        '/tracks/MIRADORDEPENAGORDA.kml',
        '/tracks/NECROPOLISDELALTOARLANZA.kml',
        '/tracks/PICODEURBIONYNACIMIENTODELDUERO.kml',
        '/tracks/POBLADODELACERCA.kml',
        '/tracks/PUNTODENIEVESANTAINES.kml',
        '/tracks/RASODELANAVA.kml',
        '/tracks/REFUGIODEPESCADORES.kml',
        '/tracks/SANTODOMINGODESILOS.kml',
        '/videos/Radar.mp4',
        '/videos/TND05.mp4',
        '/videos/TND10.mp4',
        '/videos/TND15.mp4',
        '/videos/TND20.mp4',
        '/videos/TND25.mp4',
        '/videos/TND30.mp4',
        '/videos/TND35.mp4',
        '/videos/TND40.mp4',
        '/videos/TND45.mp4',
        '/videos/TND50.mp4',
        '/videos/Troll.mp4',
        '/icons/AddSetas.png',
        '/icons/Aparcar.png',
        '/icons/bici.png',
        '/icons/BuscaDuendes.png',
        '/icons/BuscaSetas.png',
        '/icons/CapDuende.png',
        '/icons/climb.png',
        '/icons/coche.png',
        '/icons/compartir.png',
        '/icons/food.png',
        '/icons/FreeDuende.png',
        '/icons/hotel.png',
        '/icons/logo-hotel.png',
        '/icons/logo-hotelpq.png',
        '/icons/logo-small.png',
        '/icons/Maplayer.png',
        '/icons/microfono.png',
        '/icons/Navegacion.png',
        '/icons/NOREC.png',
        '/icons/photos.png',
        '/icons/poimapa.png',
        '/icons/poi.png',
        '/icons/Rec.png',
        '/icons/ruta.png',
        '/icons/SaveFile.png',
        '/icons/TND05.png',
        '/icons/TND10.png',
        '/icons/TND15.png',
        '/icons/TND20.png',
        '/icons/TND25.png',
        '/icons/TND30.png',
        '/icons/TND35.png',
        '/icons/TND40.png',
        '/icons/TND45.png',
        '/icons/TND50.png',
        '/icons/Ver.png',
        '/icons/video.png',
        '/icons/walk.png',
        '/icons/wood.png',
    ];

    for (const url of filesToSync) {
        const exists = await Data.getFile(url);
        if (!exists) {
            console.log(`Descargando para IndexedDB: ${url}`);
            try {
                const res = await fetch(url);
                const originalBlob = await res.blob();

                const extension = url.split('.').pop().toLowerCase();
                let tipoMime = originalBlob.type;

                if (extension === 'kml') {
                    tipoMime = 'application/vnd.google-earth.kml+xml';
                } else if (extension === 'gpx') {
                    tipoMime = 'application/gpx+xml';
                }

                const blobConCabecera = new Blob([originalBlob], { type: tipoMime });
                await Data.saveFile(url, blobConCabecera);
                
            } catch (e) {
                console.error("Error descargando:", url);
            }
        }
    }
}

// Listeners de la interfaz de usuario
document.addEventListener('DOMContentLoaded', () => {
    window.history.replaceState({ screen: 'home' }, "", "");
    UI.showScreen('home');
    console.log("Centralita reseteada y en Home.");

    document.getElementById('btn-pois')?.addEventListener('click', () => { UI.showMap('pois'); });
    document.getElementById('btn-bici')?.addEventListener('click', () => { UI.renderBiciList(); });
    document.getElementById('btn-walk')?.addEventListener('click', () => { UI.renderPaseoList(); });
    document.getElementById('btn-game')?.addEventListener('click', () => { 
        UI.showScreen('game'); 
        Game.initGame(); 
        setTimeout(() => {
            if (Game.map && typeof Game.map.invalidateSize === 'function') {
                Game.map.invalidateSize();
            }
        }, 200);
    });
    document.getElementById('btn-nav')?.addEventListener('click', ()  => { UI.showScreen('nav');});

    document.getElementById('btn-album')?.addEventListener('click', () => {
        UI.showScreen('album');
        UI.renderAlbumContent();
    });
    console.log("¡Centralita conectada!");
}); 

// --- EXPOSICIÓN GLOBAL ---
window.liberarUno = (idx) => {
    window.mostrarConfirmacion("¿Quieres liberar a este duende?", () => {
        if (state.game && state.game.captured) {
            state.game.captured.splice(idx, 1);
            localStorage.setItem('duendesCapturados', JSON.stringify(state.game.captured));
            Game.refresh(); 
            UI.renderAlbumContent(); 
            UI.mostrarToast("Duende liberado");
        }
    });
};

window.liberarTodos = () => {
    window.mostrarConfirmacion("¿Seguro que quieres liberar a TODOS los duendes?", () => {
        if (state.game) {
            state.game.captured = [];
            localStorage.removeItem('duendesCapturados');
            Game.refresh(); 
            UI.renderAlbumContent(); 
            UI.mostrarToast("El bosque está libre");
        }
    });
};

window.compartirRuta = async (titulo, url) => {
    if (navigator.share) {
        try {
            await navigator.share({
                title: titulo,
                text: 'Mira esta ruta de El Nido de Pinares: ' + titulo,
                url: url
            });
        } catch (err) {
            console.log('Error al compartir:', err);
        }
    } else {
        window.open(url, '_blank');
    }
};

function showScreenSilently(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const targetId = screenId.includes('-screen') ? screenId : `${screenId}-screen`;
    const target = document.getElementById(targetId);
    if (target) target.classList.remove('hidden');
    window.scrollTo(0, 0);
}

function showScreenFinal(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.add('hidden');
        s.style.display = 'none';
    });
    const target = document.getElementById(`${screenId}-screen`);
    if (target) {
        target.classList.remove('hidden');
        target.style.display = 'block';
    }
}

window.onpopstate = function(event) {
    console.log("Retrocediendo a:", event.state?.screen || 'home');
    if (event.state && event.state.screen) {
        UI.showScreen(event.state.screen);
    } else {
        UI.showScreen('home');
    }
};

async function descargarYGuardarGoogleSheets() {
    console.log("📥 Descargando hojas de Google Sheets actualizadas de Internet...");
    for (let key in Data.CONFIG?.URLS || CONFIG.URLS) {
        const urlGoogle = Data.CONFIG?.URLS[key] || CONFIG.URLS[key];
        try {
            const res = await fetch(urlGoogle, { headers: { 'Accept': 'text/csv' } });
            if (res.ok) {
                const textoCsv = await res.text();
                const blob = new Blob([textoCsv], { type: 'text/csv' });
                await Data.saveFile(`csv_${key}`, blob);
                console.log(`✓ Guardado en IndexedDB: csv_${key}`);
            }
        } catch (e) {
            console.error(`❌ Error descargando Google Sheet para ${key}:`, e);
        }
    }
}