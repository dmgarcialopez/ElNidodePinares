// js/nav-engine.js
import { state } from './state.js';
import { mostrarPromptRuta, mostrarToast, mostrarSelectorEscenarioRuta } from './ui-manager.js';

let isRecording = false;
let watchId = null;
let currentPath = [];
let polyline = null;
let navWakeLock = null; // <--- Nueva variable para el mapa
let autoCenter = false; // Por defecto no nos sigue
const ordenCapas = ['osm', 'topo', 'sat'];
let indiceCapaActual = 0;
let marcadorPosicionUsuario = null; // Variable global para rastrear el punto azul
let ultimaPosicion = null; // Guardamos solo el último punto [lat, lng], no un array
let trackActivo = null;
let esGrabacionPrevia = false;

// Definimos los proveedores de mapas
const baseLayers = {
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }),
    'topo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap'
    }),
    'sat': L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        attribution: '© Google Maps'
    })
};

function actualizarPuntoPosicion(point) {
    const mapa = state.maps?.nav;
    if (!mapa) return;

    // Si el marcador NO existe, lo creamos con el estilo del "puntito azul de GPS"
    if (!marcadorPosicionUsuario) {
        marcadorPosicionUsuario = L.circleMarker(point, {
            radius: 8,          // Tamaño del punto central
            fillColor: '#007FFF', // Azul brillante
            fillOpacity: 1,
            color: '#FFFFFF',    // Borde blanco para que resalte
            weight: 3,          // Grosor del borde blanco
            opacity: 1
        }).addTo(mapa);
        
        // OPCIONAL: Añadirle un pulso o sombra suave debajo (Efecto GPS real)
        marcadorPosicionUsuario.bindTooltip("", { permanent: false, direction: 'center' }); 
    } else {
        // Si YA existe, simplemente lo movemos a la nueva coordenada
        marcadorPosicionUsuario.setLatLng(point);
    }
}

// Variable para rastrear la capa activa actual
let currentLayer = null;

export function toggleRecording() {
    const btn = document.getElementById('btn-record');
    const img = btn?.querySelector('img');
    
    if (!isRecording) {
        // --- INTERFAZ: ACTIVAR GRABACIÓN ---
        if (btn) btn.classList.add('recording-active');
        if (img) img.src = 'icons/Rec.png'; // Cambia al icono de grabación activa
        
        // Ejecutamos la lógica inteligente de escenarios
        startRecording(btn);
    } else {
        // --- INTERFAZ: DESACTIVAR GRABACIÓN ---
        if (btn) btn.classList.remove('recording-active');
        if (img) img.src = 'icons/NOREC.png'; // Volvemos al icono inicial
        
        // Ejecutamos la lógica de parada y guardado
        stopRecording(btn);
    }
}

function startRecording(btn) {
    const mapa = window.state.maps?.nav;

    // --- ESCENARIO 2: Hay una grabación previa en el mapa ---
    if (esGrabacionPrevia && currentPath.length > 0) {
        
        // Creamos un diálogo de opciones para el usuario. 
        // Nota: Al ser una PWA, puedes usar un modal personalizado de tu app. 
        // Aquí uso un flujo de confirmaciones nativas para estructurar la lógica:
        
        const continuar = confirm("Tienes una grabación previa en pantalla.\n\n¿Deseas CONTINUAR grabando sobre ella?\n(Aceptar = Continuar / Cancelar = Ver más opciones)");
        
        if (continuar) {
            // Opción: Continuar la grabación previa (No vaciamos currentPath)
            esGrabacionPrevia = false; // Pasa a ser la grabación activa actual
            ejecutarInicioGrabacion(btn);
            mostrarToast("Continuando grabación previa...");
            return;
        }

        const guardarOstart = confirm("¿Deseas GUARDAR la grabación previa en un archivo e iniciar una nueva?\n(Aceptar = Guardar y empezar nueva / Cancelar = Borrar y empezar nueva)");
        
        if (guardarOstart) {
            // Opción: Guardar (Ya se guardó en el LocalStorage al hacer stop, así que solo limpiamos mapa y empezamos)
            limpiarMapaCompleto();
            currentPath = [];
            esGrabacionPrevia = false;
            ejecutarInicioGrabacion(btn);
            return;
        } else {
            // Opción: Borrar y empezar de nuevo
            limpiarMapaCompleto();
            currentPath = [];
            esGrabacionPrevia = false;
            ejecutarInicioGrabacion(btn);
            return;
        }
    }

    // --- ESCENARIO 1: Hay un track externo cargado (KML/GPX) ---
    if (trackActivo && mapa) {
        limpiarMapaCompleto();
        currentPath = [];
        esGrabacionPrevia = false;
        ejecutarInicioGrabacion(btn);
        return;
    }

    // --- ESCENARIO 3: El mapa está limpio ---
    currentPath = [];
    esGrabacionPrevia = false;
    ejecutarInicioGrabacion(btn);
}

// Función interna auxiliar que arranca el proceso del GPS
function ejecutarInicioGrabacion(btn) {
    isRecording = true;
    
    // Forzamos el autocentrado para que el mapa acompañe al usuario
    autoCenter = true; 

    if (btn) btn.classList.add('recording-active');

    if (navigator.geolocation) {
        // Obtenemos la primera posición de inmediato para CENTRAR EL MAPA AL INSTANTE
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const point = [pos.coords.latitude, pos.coords.longitude];
                
                // Centramos el mapa de golpe en la ubicación actual
                if (window.state.maps?.nav) {
                    window.state.maps.nav.setView(point, 16); // Centra con un zoom cercano (16) ideal para rutas
                }
                
                // Guardamos el primer punto e inicializamos el dibujo
                currentPath.push(point);
                actualizarMapa(point);
                
                // Una vez centrado el mapa inicial, encendemos el 'watchPosition' para el movimiento continuo
                activarSeguimientoContinuo();
            },
            (err) => {
                console.error("Error al centrar GPS inicial:", err);
                // Si falla el centrado inicial por timeout, intentamos activar el continuo de todos modos
                activarSeguimientoContinuo();
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
        
        mostrarToast("Localizando posición e iniciando grabación...");
    }
}

// Función auxiliar para mantener limpio el código del watchPosition
function activarSeguimientoContinuo() {
    if (watchId) navigator.geolocation.clearWatch(watchId);

    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const point = [pos.coords.latitude, pos.coords.longitude];
            currentPath.push(point);
            
            // actualizarMapa pinta la línea y, como 'autoCenter' es true, 
            // ejecutará internamente el: state.maps.nav.panTo(point)
            actualizarMapa(point); 
        },
        (err) => console.error("Error GPS continuo:", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// Función auxiliar para dejar el mapa totalmente limpio de rutas
function limpiarMapaCompleto() {
    const mapa = window.state.maps?.nav;
    if (!mapa) return;

    // 1. Limpieza de las variables de referencia
    if (trackActivo) {
        mapa.removeLayer(trackActivo);
        trackActivo = null;
    }

    if (polyline) {
        mapa.removeLayer(polyline);
        polyline = null;
    }

    // 2. LIMPIEZA TOTAL (Barrido de seguridad)
    // Esto recorre todas las capas del mapa y borra cualquier Polyline, GPX o KML 
    // que se haya quedado "huérfana" o sin variable asignada.
    mapa.eachLayer(layer => {
        if (layer instanceof L.Polyline || 
            (L.GPX && layer instanceof L.GPX) || 
            (L.KML && layer instanceof L.KML)) {
            mapa.removeLayer(layer);
        }
    });

    // 3. Resetear el array de puntos para que no queden coordenadas guardadas
    currentPath = [];
}


function iniciarSeguimientoGPS() {
    if (navigator.geolocation) {
        if (watchId !== null) return; 

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const point = [pos.coords.latitude, pos.coords.longitude];
                ultimaPosicion = point; // Guardamos la última para el toggle
                
                // 1. Movemos SOLO el puntito azul (sin pintar líneas)
                actualizarPuntoPosicion(point);
                
                // 2. Si el autocentrado está activo, movemos el mapa
                if (autoCenter && state.maps && state.maps.nav) {
                    state.maps.nav.panTo(point);
                }
            },
            (err) => console.error("Error GPS:", err),
            { 
                enableHighAccuracy: true, 
                timeout: 10000,       
                maximumAge: 0         
            }
        );
    }
}

function detenerSeguimientoGPS() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    // Si quieres borrar el punto azul al apagar el GPS:
    if (marcadorPosicionUsuario) {
        marcadorPosicionUsuario.remove();
        marcadorPosicionUsuario = null;
    }
}

function actualizarMapa(point) {
    if (!state.maps.nav) return;

    if (!polyline) {
        // AZUL CIAN ELÉCTRICO (Máximo brillo)
        polyline = L.polyline(currentPath, {
            color: '#007FFF',    // Cian eléctrico puro
            weight: 8,           // Un pelín más grueso para ganar presencia
            opacity: 1,          // Sin transparencia para que brille más
            lineJoin: 'round',
            lineCap: 'round',
            shadowBlur: 5,       // Añadimos una pequeña sombra para efecto neón
            shadowColor: '#007FFF' 
        }).addTo(state.maps.nav);
    } else {
        polyline.setLatLngs(currentPath);
    }

    if (autoCenter) {
        state.maps.nav.panTo(point);
    }
}

function stopRecording(btn) {
    isRecording = false;
    if (btn) {
        btn.classList.remove('recording-active');
        btn.style.backgroundColor = ''; 
    }
    
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null; // Buenas prácticas: resetear el ID
    }
    
    // Cambiamos el estado: ahora lo que queda en el mapa es una grabación previa activa
    if (currentPath.length > 0) {
        esGrabacionPrevia = true; 
        
        const historico = JSON.parse(localStorage.getItem('rutas_guardadas') || '[]');
        historico.push({
            fecha: new Date().toISOString(),
            puntos: currentPath
        });
        localStorage.setItem('rutas_guardadas', JSON.stringify(historico));
        mostrarToast("Ruta finalizada y guardada en el historial.");
    } else {
        mostrarToast("Grabación finalizada (sin datos).");
    }
}

export function finalizarYExportar() {
    if (currentPath.length < 2) {
        mostrarToast("No hay ruta que guardar.");
        return;
    }

    const ahora = new Date();
    const aa = ahora.getFullYear().toString().slice(-2);
    const mm = (ahora.getMonth() + 1).toString().padStart(2, '0');
    const dd = ahora.getDate().toString().padStart(2, '0');
    const hh = ahora.getHours().toString().padStart(2, '0');
    
    // 1. CAMBIO: Ahora el valor por defecto en la pantalla es solo "TRACK"
    const nombrePorDefecto = "TRACK";

    mostrarPromptRuta(nombrePorDefecto, (nombreRuta) => {
        if (isRecording) toggleRecording();

        const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="El Nido de Pinares" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${nombreRuta}</name>
    <trkseg>
      ${currentPath.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}"></trkpt>`).join('\n      ')}
    </trkseg>
  </trk>
</gpx>`;

        const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        // Limpiamos el nombre que introdujo el usuario de caracteres raros
        const nombreLimpio = nombreRuta.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        // 2. CAMBIO: Formateamos el nombre del fichero final como AAMMDDHH<Nombre>
        const nombreFicheroFinal = `${aa}${mm}${dd}${hh}${nombreLimpio}`;
        
        link.href = url;
        link.download = `${nombreFicheroFinal}.gpx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        if (polyline) { state.maps.nav.removeLayer(polyline); polyline = null; }
        currentPath = [];
        mostrarToast(`Ruta ${nombreRuta} guardada.`);
    });
}

// LÓGICA DE CAMBIO DE CAPAS REAL
export function changeBaseLayer(layerType) {
    const mapa = state.maps.nav;
    if (!mapa) return;

    // 1. Quitar la capa que esté puesta actualmente
    // Leaflet permite iterar sobre las capas para encontrar el TileLayer
    mapa.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
            mapa.removeLayer(layer);
        }
    });

    // 2. Añadir la nueva
    currentLayer = baseLayers[layerType];
    currentLayer.addTo(mapa);
    
    // 3. Cerrar menú
    const menu = document.getElementById('map-selector');
    if (menu) menu.classList.add('hidden');
    
    console.log("Capa cambiada a:", layerType);
}

// EXPOSICIÓN GLOBAL
window.toggleRecording = toggleRecording;
window.finalizarYExportar = finalizarYExportar;
window.changeBaseLayer = changeBaseLayer;
window.toggleMapMenu = function() {
    const menu = document.getElementById('map-selector');
    if (menu) menu.classList.toggle('hidden');
};

export function seleccionarTrack() {
   // 1. Creamos el input invisible en memoria
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    
    // Configuración estricta para móviles (Extensiones + Tipos MIME)
    fileInput.accept = '.gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml';

    fileInput.onchange = (evento) => {
        const archivo = evento.target.files[0];
        if (!archivo) return; 

        // 2. Extraemos la extensión real del archivo (.gpx o .kml)
        const ext = archivo.name.split('.').pop().toLowerCase();

        // 3. Creamos la URL temporal del archivo
        let urlBlob = URL.createObjectURL(archivo);

        // 4. TRUCO: Le pegamos la extensión al final de la URL (ej: blob:http...#file.gpx)
        // Así tu función `cargarTrackExterno` podrá detectar si es GPX o KML usando tu código actual
        urlBlob = `${urlBlob}#file.${ext}`;

        // 5. Se lo pasamos a tu función para que lo dibuje y lo centre en el mapa
        cargarTrackExterno(urlBlob);
        
        if (typeof mostrarToast === 'function') {
            mostrarToast(`Cargando: ${archivo.name}`);
        }
    };

    // Apuntamos el clic al explorador de archivos nativo
    fileInput.click();
}

window.seleccionarTrack = seleccionarTrack;

export function cargarTrackExterno(url) {
    if (!url) return;

    // 1. Asegurar mapa y label
    if (!window.state.maps.nav) {
        window.state.maps.nav = L.map('nav-map', { 
            zoomControl: false,
            dragging: true,
            touchZoom: true
        }).setView([41.828, -3.005], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.state.maps.nav);
    }

    const mapa = window.state.maps.nav;
    const label = document.getElementById('track-name');

    // Limpieza total de rutas previas
    mapa.eachLayer(l => {
        if (l instanceof L.Polyline || (window.L.KML && l instanceof L.KML) || l instanceof L.GPX) {
            mapa.removeLayer(l);
        }
    });

    // Despertar el mapa
    setTimeout(() => mapa.invalidateSize(), 200);

    // 2. EXTRAER NOMBRE (Priorizando el contenido de la ruta sobre el nombre del hotel)
    fetch(url)
        .then(r => r.text())
        .then(strData => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(strData, "text/xml");
            
            // BUSQUEDA SELECTIVA:
            // Intentamos encontrar el name dentro de Placemark (la ruta)
            // Si no hay, buscamos el name dentro de Folder
            // Si no hay, buscamos cualquier name
            const nombreRuta = xmlDoc.querySelector('Placemark > name')?.textContent;
            const nombreCarpeta = xmlDoc.querySelector('Folder > name')?.textContent;
            const nombreCualquiera = xmlDoc.querySelector('name')?.textContent;
            
            let nombreFinal = nombreRuta || nombreCarpeta || nombreCualquiera;
            
            if (!nombreFinal) {
                nombreFinal = url.split('/').pop().replace(/\.(gpx|kml)$/i, '').replace(/[-_]/g, ' ');
            }

            if (label) label.innerText = nombreFinal.trim();
        })
        .catch(e => console.log("Error extrayendo nombre:", e));

    // 3. CARGAR EN EL MAPA (Usamos la URL para evitar errores de objeto)
    const ext = url.split('.').pop().toLowerCase();

    if (ext === 'kml') {
        const trackKml = new L.KML(url); 
        mapa.addLayer(trackKml);
        trackActivo = trackKml;

        trackKml.on("loaded", () => {
            const bounds = trackKml.getBounds();
            if (bounds.isValid()) {
                mapa.fitBounds(bounds, { padding: [40, 40] });
            }
        });
        
        // Refuerzo para asegurar el encuadre
        setTimeout(() => {
            const bounds = trackKml.getBounds();
            if (bounds.isValid()) mapa.fitBounds(bounds, { padding: [40, 40] });
        }, 600);

    } else {
        const gpxTrack = new L.GPX(url, {
            parseElements: ['track'],
            polyline_options: { color: '#007FFF', weight: 6, opacity: 0.8 },
            marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null, wptIconUrls: {} }
        });
        trackActivo = gpxTrack;

        gpxTrack.on('loaded', e => {
            const bounds = e.target.getBounds();
            if (bounds.isValid()) {
                mapa.fitBounds(bounds, { padding: [40, 40] });
            }
        });

        gpxTrack.addTo(mapa);
    }
}

window.cargarTrackExterno = cargarTrackExterno;

export function cargarTrackDesdeTexto(strData, extension = 'kml') {
    if (!strData) return;

    // 1. Asegurar mapa y estado (Igual que tu original)
    if (!window.state.maps.nav) {
        window.state.maps.nav = L.map('nav-map', { 
            zoomControl: false,
            dragging: true,
            touchZoom: true
        }).setView([41.828, -3.005], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.state.maps.nav);
    }

    const mapa = window.state.maps.nav;
    const label = document.getElementById('track-name');

    // Limpieza total de rutas previas
    mapa.eachLayer(l => {
        if (l instanceof L.Polyline || (window.L.KML && l instanceof L.KML) || l instanceof L.GPX) {
            mapa.removeLayer(l);
        }
    });

    // Despertar el mapa
    setTimeout(() => mapa.invalidateSize(), 200);

    // 2. EXTRAER NOMBRE DEL XML (Funciona para KML y GPX)
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(strData, "text/xml");
    
    const nombreRuta = xmlDoc.querySelector('Placemark > name, trk > name')?.textContent;
    const nombreCarpeta = xmlDoc.querySelector('Folder > name')?.textContent;
    const nombreCualquiera = xmlDoc.querySelector('name')?.textContent;
    
    let nombreFinal = nombreRuta || nombreCarpeta || nombreCualquiera || "Ruta Local";
    if (label) label.innerText = nombreFinal.trim();

    // 3. CARGA SEGÚN FORMATO
    if (extension === 'kml') {
        // L.KML prefiere el documento XML ya parseado
        const trackKml = new L.KML(xmlDoc); 
        mapa.addLayer(trackKml);

        trackKml.on("loaded", () => {
            const bounds = trackKml.getBounds();
            if (bounds.isValid()) mapa.fitBounds(bounds, { padding: [40, 40] });
        });

        // Refuerzo de encuadre (como en tu original)
        setTimeout(() => {
            if (trackKml.getBounds().isValid()) mapa.fitBounds(trackKml.getBounds(), { padding: [40, 40] });
        }, 600);

    } else if (extension === 'gpx') {
        // L.GPX detecta automáticamente si le pasas el string con el XML
        const gpxTrack = new L.GPX(strData, {
            parseElements: ['track'],
            polyline_options: { color: '#007FFF', weight: 6, opacity: 0.8 },
            marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null, wptIconUrls: {} }
        });

        gpxTrack.on('loaded', e => {
            const bounds = e.target.getBounds();
            if (bounds.isValid()) mapa.fitBounds(bounds, { padding: [40, 40] });
        });

        gpxTrack.addTo(mapa);
    }
}

window.cargarTrackDesdeTexto = cargarTrackDesdeTexto;


function asegurarMapaInicializado() {
    if (window.state.maps.nav) return;

    const mapContainer = document.getElementById('nav-map');
    if (!mapContainer) return;

    console.log("Inicializando contenedor de mapa...");

    // Limpiamos el rastro de Leaflet si hubiera quedado algo
    if (mapContainer._leaflet_id) {
        mapContainer._leaflet_id = null;
    }

    try {
        window.state.maps.nav = L.map('nav-map', {
            zoomControl: false,
            dragging: true,
            zoomAnimation: true
        }).setView([41.828, -3.005], 14);

        // Añadimos la capa base inmediatamente
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(window.state.maps.nav);

        console.log("Mapa de navegación listo.");
        requestWakeLock();
    } catch (e) {
        console.error("Error al crear el mapa:", e);
    }
}

async function requestWakeLock() {
    // Verificamos si el navegador soporta Wake Lock y si no está ya activo
    if ('wakeLock' in navigator && !navWakeLock) {
        try { 
            navWakeLock = await navigator.wakeLock.request('screen'); 
            console.log("Pantalla bloqueada: No se apagará.");

            // Si el sistema libera el Wake Lock automáticamente (ej. por batería baja), lo reseteamos
            navWakeLock.addEventListener('release', () => {
                console.log('Wake Lock liberado por el sistema.');
                navWakeLock = null;
            });
        } catch (e) {
            console.error("Fallo al bloquear pantalla:", e);
        }
    }
}

// NUEVA FUNCIÓN: Para liberar la pantalla cuando salgamos del mapa
export async function releaseWakeLock() {
    if (navWakeLock) {
        try {
            await navWakeLock.release();
            navWakeLock = null;
            console.log("Pantalla desbloqueada: Volviendo al comportamiento original.");
        } catch (e) {
            console.error("Error al liberar Wake Lock:", e);
        }
    }
}

// Exponer la liberación de pantalla de forma global si la necesitas en tu HTML o UI Manager
window.releaseWakeLock = releaseWakeLock;

export function toggleseguir() {
    const btn = document.getElementById('btn-seguir');
    const img = btn?.querySelector('img');

    autoCenter = !autoCenter;

    if (autoCenter) {
        // --- MODO SEGUIMIENTO ACTIVO ---
        if (img) img.src = 'icons/Seguir.png'; 
        
        iniciarSeguimientoGPS();
        
        if (ultimaPosicion && window.state.maps.nav) {
            window.state.maps.nav.panTo(ultimaPosicion);
        }
        
        mostrarToast("Seguimiento GPS activado");
    } else {
        // --- MODO LIBRE ---
        if (img) img.src = 'icons/NOSeguir.png'; 
        
        // 1. Apagamos el GPS y quitamos el punto azul
        detenerSeguimientoGPS();
        
        // 2. Centramos el mapa sobre el track guardado en la variable global
        const mapa = window.state.maps?.nav;
        if (trackActivo && mapa) {
            const bounds = trackActivo.getBounds();
            
            // Verificamos que los límites sean válidos antes de encuadrar
            if (bounds.isValid()) {
                mapa.fitBounds(bounds, {
                    padding: [50, 50],
                    maxZoom: 16
                });
                mostrarToast("Mapa libre: mostrando ruta completa");
            } else {
                mostrarToast("Mapa libre: explora la ruta");
            }
        } else {
            mostrarToast("Mapa libre: explora la ruta");
        }
    }
}

// Hacerlo disponible para el onclick del HTML
window.togglesegir = toggleseguir;

export function ciclarCapas() {
    const mapa = state.maps.nav;
    if (!mapa) return;

    // Aumentamos el índice y volvemos a 0 si llegamos al final
    indiceCapaActual = (indiceCapaActual + 1) % ordenCapas.length;
    const tipo = ordenCapas[indiceCapaActual];

    // 2. Limpiamos capas previas
    mapa.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
            mapa.removeLayer(layer);
        }
    });

    // 3. Añadimos la nueva capa
    const nuevaCapa = baseLayers[tipo];
    nuevaCapa.addTo(mapa);

    // 4. Feedback visual al usuario
    const nombres = { 'osm': 'Callejero', 'topo': 'Montaña', 'sat': 'Satélite' };
}

// No olvides exponerla al window
window.ciclarCapas = ciclarCapas;

// Escuchar cuando el usuario vuelve a abrir o minimiza la app/pestaña
document.addEventListener('visibilitychange', async () => {
    const mapContainer = document.getElementById('nav-map');
    
    // Solo reactivamos si la app vuelve a estar visible Y el mapa está inicializado en pantalla
    if (document.visibilityState === 'visible' && window.state.maps?.nav && mapContainer) {
        await requestWakeLock();
    }
});








