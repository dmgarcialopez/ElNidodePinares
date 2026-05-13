import { CONFIG } from './config.js';
import { state } from './state.js';

export function formatPwaUrl(url) {
    if (!url || !url.includes("elnidodepinares.es")) return url;
    const separator = url.includes("?") ? "&" : "?";
    return url.includes("utm_source=") ? url.replace(/utm_source=[^&]*/, "utm_source=PWA") : `${url}${separator}utm_source=PWA`;
}

export async function loadAllData() {
    // Usamos PapaParse (asumiendo que está cargado globalmente en el HTML)
    for (let key in CONFIG.URLS) {
        Papa.parse(CONFIG.URLS[key], {
            download: true,
            complete: (results) => {
                if (key === 'duendes') {
                    const all = results.data.slice(1);
                    
                    // CORRECCIÓN: Accedemos a la nueva ruta del estado con seguridad
                    // Si state.game no existe aún, usamos un array vacío
                    const capturados = state.game?.captured || [];

                    // Guardamos en state.db.duendes para que el motor del juego los encuentre
                    state.db.duendes = all.filter(d => 
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