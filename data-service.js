import { CONFIG } from './config.js';
import { state } from './state.js';

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