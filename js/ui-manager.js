import { state } from './state.js';
import * as Game from './game-engine.js';
import { releaseWakeLock } from './nav-engine.js';
import * as Data from './data-service.js';

export function mostrarToast(msg) {
    const t = document.getElementById('toast-aviso');
    document.getElementById('toast-text').innerText = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 4000);
}

export function mostrarSelectorEscenarioRuta(mensaje) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-scenario-modal');
        const texto = document.getElementById('scenario-text');
        const btnContinuar = document.getElementById('scenario-btn-continuar');
        const btnGuardar = document.getElementById('scenario-btn-guardar');
        const btnBorrar = document.getElementById('scenario-btn-borrar');

        if (!modal || !texto) {
            resolve(null);
            return;
        }

        texto.innerText = mensaje;
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        // Función auxiliar interna para cerrar y resolver la promesa
        const cerrar = (opcion) => {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            resolve(opcion); // Devolvemos la opción elegida de forma síncrona
        };

        // Asignamos los clics
        btnContinuar.onclick = () => cerrar('continuar');
        btnGuardar.onclick = () => cerrar('guardar');
        btnBorrar.onclick = () => cerrar('borrar');
    });
}

// Aseguramos exposición global por si acaso
window.mostrarSelectorEscenarioRuta = mostrarSelectorEscenarioRuta;


export function toggleMapMenu() {
    const menu = document.getElementById('map-selector');
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

// CRÍTICO: Exponerla para que el onclick del index.html funcione
window.toggleMapMenu = toggleMapMenu;

export function mostrarConfirmacion(mensaje, callbackAceptar) {
    // Sincronizamos con los IDs de tu index.html
    const modal = document.getElementById('custom-confirm'); // Antes era 'confirmacion-modal'
    const texto = document.getElementById('confirm-text');    // Antes era 'confirmacion-texto'
    const btnAceptar = document.getElementById('confirm-si');  // Antes era 'confirmacion-aceptar'
    const btnCancelar = document.getElementById('confirm-no'); // Antes era 'confirmacion-cancelar'

    if (!modal || !texto) {
        console.error("No se encontró el modal de confirmación en el HTML");
        return;
    }

    texto.innerText = mensaje;
    modal.classList.remove('hidden');

    // Limpiamos eventos previos para evitar ejecuciones múltiples
    btnAceptar.onclick = null;
    btnAceptar.onclick = () => {
        modal.classList.add('hidden');
        if (typeof callbackAceptar === 'function') {
            callbackAceptar();
        }
    };

    btnCancelar.onclick = () => {
        modal.classList.add('hidden');
    };
}

// Aseguramos la visibilidad global
window.mostrarConfirmacion = mostrarConfirmacion;

export function mostrarPromptRuta(valorDefecto, callbackGuardar) {
    const modal = document.getElementById('custom-prompt');
    const input = document.getElementById('prompt-input');
    const btnGuardar = document.getElementById('prompt-save');
    const btnCancelar = document.getElementById('prompt-cancel');

    if (!modal || !input) return;

    input.value = valorDefecto || ""; 
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    setTimeout(() => input.select(), 100);

    btnGuardar.onclick = () => {
        const nombre = input.value.trim() || valorDefecto;
        modal.classList.add('hidden');
        modal.style.display = 'none';
        if (typeof callbackGuardar === 'function') callbackGuardar(nombre);
    };

    btnCancelar.onclick = () => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        // CRÍTICO: Avisamos al motor de navegación que se canceló el flujo
        if (typeof callbackGuardar === 'function') callbackGuardar(null);
    };
}

// Lo exponemos para que nav-engine lo vea
window.mostrarPromptRuta = mostrarPromptRuta;

export function renderAlbumContent() {
    const container = document.getElementById('album-content');
    if (!container) return;

    let totalPuntos = 0;
    const capturados = state.game?.captured || [];
    
    // 1. Cabecera con el video (Dejamos el src vacío inicialmente)
    let html = `
        <div id="album-video-container" style="width: 220px; height: 220px; margin: 20px auto; border-radius: 20px; overflow: hidden; border: 3px solid #66bb6a;
           position: relative; background: #000; box-shadow: 0 4px 15px rgba(102, 187, 106, 0.4);">
            <video id="album-video" autoplay muted loop playsinline style="width: 100%; height: 100%; object-fit: fill;">
                </video>
        </div>
        <div class="lista-container-album" style="padding: 0 15px; width: 100%;">
    `;

    // 2. Lista de duendes (CON EL ARREGLO DE MAYÚSCULAS PARA LOS ICONOS)
    capturados.forEach((d, index) => {
        const nombre = d[0];
        let tipo = d[4]?.trim() || "Radar";
        
        // CORRECCIÓN CRÍTICA DE ICONOS: Asegura primera letra en Mayúscula (ej: 'bici' -> 'Bici')
        tipo = tipo.charAt(0).toUpperCase() + tipo.slice(1);

        const puntos = parseInt(d[3]) || 0;
        totalPuntos += puntos;

        html += `
            <div class="lista-item">
                <div class="lista-acciones-left">
                    <button class="btn-accion" onclick="liberarUno(${index})">
                        <img src="icons/FreeDuende.png" style="width:100%;" onerror="this.style.display='none'; this.parentNode.innerText='❌'">
                    </button>
                    <button class="btn-accion" onclick="changeAlbumVideo('${tipo}')">
                        <img src="icons/${tipo}.png" style="width:100%;" onerror="this.src='icons/Radar.png'">
                    </button>
                </div>
                <div class="lista-info" style="flex:1;">
                    <span>${nombre}</span>
                    <span>Puntos: ${puntos}</span>
                </div>
            </div>`;
    });

    if (capturados.length === 0) {
        html += `<p style="color:#a5d6a7; text-align:center; margin: 40px 0; font-weight: bold; font-size: 1.2em; text-shadow: 1px 1px black;">¡Aún no has capturado ningún duende! Explora el bosque y búscalos.</p>`;
    }

    html += `</div>`; 

    // 3. Marcador de puntos
    html += `
        <div style="width: 100%; text-align: center; margin: 35px 0 20px 0; display: flex; flex-direction: column; align-items: center;">
            <span style="font-size: 1.2em; color: #a5d6a7; font-weight: bold;">TUS PUNTOS</span>
            <span style="font-size: 2.8em; color: #ffeb3b; text-shadow: 0 0 10px rgba(255, 235, 59, 0.5); font-weight: bold; line-height: 1.1em;">
                ${totalPuntos}
            </span>
        </div>
    `;

    // 4. Botón de Liberar Todos
    html += `
        <div style="display: flex; justify-content: center; padding-bottom: 60px; padding-top: 10px; width: 100%;">
            <button onclick="liberarTodos()" style="display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 12px; background: #388E3C; color: white; border: 2px solid #a5d6a7; border-radius: 50px; padding: 18px 35px; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,0.6); transition: all 0.2s; outline: none;">
                <span style="font-size: 16px; font-weight: bold; letter-spacing: 1.2px; text-transform: uppercase;">
                    LIBERAR BOSQUE
                </span>
            </button>
        </div>
    `;

    container.innerHTML = html;

    // --- CARGA ASÍNCRONA DEL VÍDEO DESDE INDEXEDDB (IGUAL QUE EL JUEGO) ---
    // Buscamos el vídeo por defecto del álbum ('Troll') dentro de tu almacén local
    Data.getVideoUrl('Troll')
        .then(blobUrl => {
            const albumVideo = document.getElementById('album-video');
            if (albumVideo) {
                if (blobUrl) {
                    albumVideo.src = blobUrl;
                } else {
                    // Fallback si no estuviera en IndexedDB
                    albumVideo.src = 'videos/Troll.mp4';
                }
                albumVideo.play().catch(() => {});
            }
        })
        .catch(err => {
            console.error("Error cargando video del álbum desde IndexedDB:", err);
            const albumVideo = document.getElementById('album-video');
            if (albumVideo) albumVideo.src = 'videos/Troll.mp4';
        });
}


/**
 * Gestiona el cambio de pantallas en la PWA
 * @param {string} screenId - El nombre de la sección (home, game, view, album, nav)
 */
export function showScreen(screenId) {
    const pureId = screenId.replace('-screen', '');

    // --- CONTROL DE WAKE LOCK (PANTALLA ENCENDIDA) ---
    // Si la pantalla de destino NO es navegación, liberamos el bloqueo para volver a la situación original
    if (pureId !== 'nav') {
        releaseWakeLock(); 
    }
   
    
    // 1. Ocultación total
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.add('hidden');
        s.style.display = 'none';
    });

    // 2. Mostrar la elegida
    const target = document.getElementById(`${pureId}-screen`);
    if (target) {
        target.classList.remove('hidden');
        target.style.display = 'block';
        
        if (pureId === 'album') renderAlbumContent();
    }

    // 3. Gestión del Historial (Mantenemos tu lógica de replace/push)
    if (pureId === 'home') {
        window.history.replaceState({ screen: 'home' }, "");
    } else {
        if (!window.history.state || window.history.state.screen !== pureId) {
            window.history.pushState({ screen: pureId }, "");
        }
    }

    // 4. ARREGLO INTEGRADO DE MAPAS
    setTimeout(() => {
        // Mantenemos tus comprobaciones originales
        if (pureId === 'view' && state.maps.main) state.maps.main.invalidateSize();
        if (pureId === 'game' && state.maps.game) state.maps.game.invalidateSize();
        
        // Lógica específica para Navegación (Nav)
        if (pureId === 'nav') {
            // A. Inicializar si no existe
            if (!state.maps.nav) {
                state.maps.nav = L.map('nav-map', { zoomControl: false })
                                  .setView([41.828, -3.005], 14);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.maps.nav);
            }
            
            // B. Primer refresco inmediato
            state.maps.nav.invalidateSize();
            
            // C. RE-INTENTO DE SEGURIDAD (Para evitar el mapa desplazado de la foto)
            // Esperamos un poco más para que el div de madera esté 100% estirado
            setTimeout(() => {
                state.maps.nav.invalidateSize();
                
                state.maps.nav.eachLayer(layer => {
                    if (layer.getBounds && (layer instanceof L.KML || layer instanceof L.GPX || layer instanceof L.Polyline)) {
                        const bounds = layer.getBounds();
                        if (bounds.isValid()) {
                            state.maps.nav.fitBounds(bounds, { padding: [40, 40] });
                        }
                    }
                });
            }, 200); 
        }
    }, 150); 

    window.scrollTo(0, 0);
}

export function showMap(type) {
    // 1. Usamos la función estándar para cambiar de pantalla.
    // Esto ya oculta las demás y gestiona el historial correctamente.
    showScreen('view'); 

    // 2. Ajustamos la visibilidad interna de la pantalla 'view'
    const listContainer = document.getElementById('list-container');
    const mapDiv = document.getElementById('map-container');
    
    if (listContainer) listContainer.classList.add('hidden');
    if (mapDiv) mapDiv.classList.remove('hidden');

    // 3. Inicialización del mapa (solo si no existe)
    if (!state.maps.main) {
        state.maps.main = L.map('map-container', { zoomControl: false }).setView([41.854035, -2.933603], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.maps.main);
    }

    // 4. Renderizado de puntos
    setTimeout(() => {
        if (state.maps.main) {
            state.maps.main.invalidateSize();
            renderPuntosEnMapa(type);
        }
    }, 200);
}

function renderPuntosEnMapa(type) {
    if (!state.maps.main) return;

    // Limpiar capas de marcadores
    state.maps.main.eachLayer(layer => {
        if (layer instanceof L.Marker) state.maps.main.removeLayer(layer);
    });

    const puntos = state.db[type] || [];

    puntos.forEach((f) => {
        const nombre = f[0];
        const blogUrl = f[1]; // Aquí puedes volver a envolverlo en formatPwaUrl si tienes esa función
        const lat = parseFloat(f[4]);
        const lng = parseFloat(f[5]);
        const videoUrlOriginal = f[8];

        if (!isNaN(lat) && !isNaN(lng)) {
            // Lógica de video que tenías
            let videoUrlFinal = videoUrlOriginal;
            if (videoUrlOriginal && videoUrlOriginal.includes('v=')) {
                const videoId = videoUrlOriginal.split('v=')[1].split('&')[0];
                videoUrlFinal = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
            }

            // Construcción del Popup con tus iconos y estilos
            const popupContent = `
                <div style="text-align:center; min-width:160px;">
                    <a href="${blogUrl}" target="_blank" style="font-weight:bold; color:#1b5e20; text-decoration:underline;">${nombre}</a>
                    <div style="display:flex; justify-content:center; gap:10px; margin-top:8px;">
                        <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}', '_blank')" style="background:none; border:none; width:35px; cursor:pointer;">
                            <img src="icons/coche.png" style="width:100%;">
                        </button>
                        ${blogUrl ? `
                        <button onclick="if(navigator.share){navigator.share({title:'${nombre}',url:'${blogUrl}'})}else{window.open('${blogUrl}')}" style="background:none; border:none; width:35px; cursor:pointer;">
                            <img src="icons/compartir.png" style="width:100%;">
                        </button>` : ''}
                        ${videoUrlOriginal ? `
                        <button onclick="window.open('${videoUrlFinal}', '_blank')" style="background:none; border:none; width:35px; cursor:pointer;">
                            <img src="icons/video.png" style="width:100%;">
                        </button>` : ''}
                    </div>
                </div>`;

            L.marker([lat, lng]).addTo(state.maps.main).bindPopup(popupContent);
        }
    });
}

// --- FUNCIÓN PARA RUTAS EN BICI ---
export function renderBiciList() {
    showScreen('view'); 
    
    document.getElementById('map-container').classList.add('hidden');
    const listContainer = document.getElementById('list-container');
    listContainer.classList.remove('hidden');
    const datos = state.db['bici'] || [];
    
    let html = `<h2 class="lista-titulo" style="color:white; text-align:center; margin-bottom:15px; font-weight:bold;">Rutas en Bici</h2>`;
    
    html += datos.map(f => {
        const nombre = f[0];     // Columna A (Nombre)
        const urlWeb = f[5];     // Columna F (Página web)
        const archivoTrack = f[6]; // <--- AQUÍ LO DEFINIMOS (Columna G)
        
        const nombreLimpio = nombre.replace(/'/g, "\\'");
        
        // Ahora sí podemos usar archivoTrack para crear la URL
        const urlCompleta = archivoTrack ? `tracks/${archivoTrack}` : '';
        
        return `
            <div class="lista-item">
                <div class="lista-acciones-left">
                    <button class="btn-accion" onclick="prepararNavegacion('${urlCompleta}')">
                        <img src="icons/ruta.png">
                    </button>
                    <button class="btn-accion" onclick="compartirRuta('${nombreLimpio}', '${urlWeb}')">
                        <img src="icons/compartir.png">
                    </button>
                </div>
                <div class="lista-info" onclick="window.open('${urlWeb}', '_blank')">
                    <span>${nombre}</span>
                </div>
            </div>`;
    }).join('');
    listContainer.innerHTML = html;
}

// 2. Función puente para conectar la lista con el NavEngine
window.prepararNavegacion = async function(urlTrack) {
    console.log("Iniciando navegación: ", urlTrack);

    // 1. Ocultar todas las pantallas con fuerza bruta
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => {
        s.classList.add('hidden');
        s.style.display = 'none';
    });

    // 2. Activar la pantalla de navegación
    const nav = document.getElementById('nav-screen');
    if (nav) {
        nav.classList.remove('hidden');
        nav.style.display = 'flex'; 
    }

    // --- LÓGICA DE CARGA LOCAL MEJORADA (IndexedDB) ---
    try {
        // Detectamos la extensión dinámicamente (kml o gpx)
        const extension = urlTrack.split('.').pop().toLowerCase();
        
        // Buscamos el archivo en la DB
        const blob = await Data.getFile(`/${urlTrack}`); 

        if (blob) {
            console.log(`📍 ${extension.toUpperCase()} encontrado en IndexedDB, procesando contenido...`);
            
            setTimeout(() => {
                // 🔄 PRIORIDAD OFFLINE: Primero intentamos inyectar texto plano.
                if (typeof window.cargarTrackDesdeTexto === 'function') {
                    console.log(`🗺️ Extrayendo texto XML de la DB para window.cargarTrackDesdeTexto...`);
                    blob.text()
                        .then(trackText => {
                            window.cargarTrackDesdeTexto(trackText, extension);
                        })
                        .catch(errText => console.error("❌ Error leyendo texto del blob:", errText));
                } 
                // Fallback A: Si no existe la carga de texto, usamos URL de memoria
                else if (typeof window.cargarTrackExterno === 'function') {
                    const urlTemporalBlob = URL.createObjectURL(blob);
                    window.cargarTrackExterno(urlTemporalBlob);
                    console.log(`🗺️ URL de objeto (${extension.toUpperCase()}) enviada al motor de mapas.`);
                } 
                // Fallback B: Si todo lo demás falla, intenta ir por red tradicional
                else {
                    window.cargarTrackExterno(urlTrack);
                }

                // Forzamos el refresco visual del mapa de Leaflet
                if (window.state && window.state.maps && window.state.maps.nav) {
                    setTimeout(() => {
                        window.state.maps.nav.invalidateSize();
                        console.log("🔄 Mapa de navegación refrescado forzosamente.");
                    }, 150);
                }

            }, 200);
            
        } else {
            console.log("🌐 Track no encontrado en DB, intentando carga normal (Red/SW)...");
            setTimeout(() => {
                if (typeof window.cargarTrackExterno === 'function') {
                    window.cargarTrackExterno(urlTrack);
                }
            }, 200);
        }
    } catch (err) {
        console.error("Error en el puente de navegación local:", err);
        if (typeof window.cargarTrackExterno === 'function') {
            window.cargarTrackExterno(urlTrack);
        }
    }
};


// --- FUNCIÓN PARA RUTAS DE PASEO ---
export function renderPaseoList() {
    showScreen('view');
    document.getElementById('map-container').classList.add('hidden');
    const listContainer = document.getElementById('list-container');
    listContainer.classList.remove('hidden');

    const datos = state.db['paseo'] || [];
    let html = `<h2 class="lista-titulo" style="color:white; text-align:center; margin-bottom:15px; font-weight:bold;">Rutas de Paseo</h2>`;
    
    html += datos.map(f => {
        const nombre = f[0];     // Columna A (Nombre)
        const trackArchivo = f[8]; // <--- CORREGIDO: Columna I (Índice 8)
        const lat = f[4];        // Columna E (Índice 4)
        const lng = f[5];        // Columna F (Índice 5)
        const urlRuta = f[7];    // Columna H (Índice 7)
        
        const nombreLimpio = nombre.replace(/'/g, "\\'");

        // Construimos la URL para nuestro motor (carpeta /tracks)
        const urlCompleta = trackArchivo ? `tracks/${trackArchivo}` : '';

        // URL de Google Maps para llegar al inicio en coche
        const urlGoogleMaps = `https://www.google.com/maps?q=${lat},${lng}`;

        return `
            <div class="lista-item">
                <div class="lista-acciones-left">                    
                    ${(lat && lng) ? `
                    <button class="btn-accion" onclick="window.open('${urlGoogleMaps}', '_blank')" style="background:none; border:none; width:35px; cursor:pointer;">
                        <img src="icons/coche.png" style="width:100%;">
                    </button>` : ''}
                    
                    <button class="btn-accion" onclick="prepararNavegacion('${urlCompleta}')" style="background:none; border:none; width:35px; cursor:pointer;">
                        <img src="icons/ruta.png" style="width:100%;">
                    </button>

                    <button class="btn-accion" onclick="compartirRuta('${nombreLimpio}', '${urlRuta}')" style="background:none; border:none; width:35px; cursor:pointer;">
                        <img src="icons/compartir.png" style="width:100%;">
                    </button>
                </div>
                
                <div class="lista-info" onclick="window.open('${urlRuta}', '_blank')" style="flex:1; cursor:pointer;">
                    <span>${nombre}</span>
                </div>
            </div>`;
    }).join('');

    listContainer.innerHTML = html;
}

// Buscamos el botón por su ID o clase y le asignamos la función
document.querySelector('[onclick="showGame()"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    showGame(); // La función que vive en este mismo archivo
});

export function showNavigation() {
    // 1. Cambiamos a la pantalla de navegación
    showScreen('nav');

    // 2. Esperamos un poco a que el DOM se asiente
    setTimeout(() => {
        const mapContainer = document.getElementById('nav-map');
        
        // Inicializamos el mapa de navegación si no existe
        if (!state.maps.nav) {
            state.maps.nav = L.map('nav-map', { 
                zoomControl: false 
            }).setView([41.854035, -2.933603], 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.maps.nav);
        }

        // 3. LA CLAVE: Forzamos el refresco del tamaño
        state.maps.nav.invalidateSize();
        
        console.log("Mapa de navegación despertado");
    }, 300);
}

// Hazla visible para que los botones del index puedan verla
window.showNavigation = showNavigation;



