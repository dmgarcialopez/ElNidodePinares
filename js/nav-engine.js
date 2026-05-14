// js/nav-engine.js
import { state } from './state.js';
import { mostrarPromptRuta, mostrarToast } from './ui-manager.js';

let isRecording = false;
let watchId = null;
let currentPath = [];
let polyline = null;
let navWakeLock = null; // <--- Nueva variable para el mapa
let autoCenter = false; // Por defecto no nos sigue
const ordenCapas = ['osm', 'topo', 'sat'];
let indiceCapaActual = 0;

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

// Variable para rastrear la capa activa actual
let currentLayer = null;

export function toggleRecording() {
    const btn = document.getElementById('btn-record');
    const img = btn?.querySelector('img');
    
    if (!isRecording) {
        // --- ACTIVAR GRABACIÓN ---
        isRecording = true;
        currentPath = [];
        
        if (btn) btn.classList.add('recording-active');
        if (img) img.src = 'icons/Rec.png'; // Cambiamos al icono de grabación activa

        iniciarSeguimientoGPS();
        mostrarToast("Grabando ruta en azul eléctrico...");
    } else {
        // --- DESACTIVAR GRABACIÓN ---
        isRecording = false;
        
        if (btn) btn.classList.remove('recording-active');
        if (img) img.src = 'icons/NOREC.png'; // Volvemos al estado inicial

        detenerSeguimientoGPS();
        mostrarToast("Ruta finalizada");
    }
}

function startRecording(btn) {
    isRecording = true;
    currentPath = [];
    
    if (btn) {
        btn.classList.add('recording-active');
        btn.style.backgroundColor = '#d32f2f'; // Rojo intenso
    }
    
    mostrarToast("Grabación iniciada. ¡Buena ruta!");

    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                const point = [latitude, longitude];
                currentPath.push(point);
                
                actualizarMapa(point);
            },
            (err) => console.error("Error GPS:", err),
            { enableHighAccuracy: true, distanceFilter: 5 }
        );
    }
}

function iniciarSeguimientoGPS() {
    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const point = [pos.coords.latitude, pos.coords.longitude];
                currentPath.push(point);
                actualizarMapa(point);
            },
            (err) => console.error("Error GPS:", err),
            { enableHighAccuracy: true, distanceFilter: 3 }
        );
    }
}

function detenerSeguimientoGPS() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    // Opcional: limpiar la línea para la próxima vez
    polyline = null; 
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
    
    if (watchId) navigator.geolocation.clearWatch(watchId);
    
    mostrarToast("Ruta finalizada y guardada.");
    
    // Aquí podrías guardar la ruta en state.game o localStorage
    if (currentPath.length > 0) {
        const historico = JSON.parse(localStorage.getItem('rutas_guardadas') || '[]');
        historico.push({
            fecha: new Date().toISOString(),
            puntos: currentPath
        });
        localStorage.setItem('rutas_guardadas', JSON.stringify(historico));
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
    const hh = ahora.getHours().toString().padStart(2, '0'); // Añadido: definición de hh
    const min = ahora.getMinutes().toString().padStart(2, '0'); // Añadido: definición de min
    
    const nombrePorDefecto = `TRACK${aa}${mm}${dd}${hh}${min}`;

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
        const fileName = nombreRuta.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        link.href = url;
        link.download = `${fileName}.gpx`;
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
    if ('wakeLock' in navigator) {
        try { 
            navWakeLock = await navigator.wakeLock.request('screen'); 
            console.log("Pantalla bloqueada para navegación");
        } catch (e) {
            console.error("Fallo al bloquear pantalla:", e);
        }
    }
}

export function toggleseguir() {
    const btn = document.getElementById('btn-seguir');
    const img = btn?.querySelector('img');

    // Cambiamos el estado (si era true pasa a false y viceversa)
    autoCenter = !autoCenter;

    if (autoCenter) {
        // --- MODO SEGUIMIENTO ACTIVO ---
        if (img) img.src = 'icons/Seguir.png'; 
        btn.classList.add('seguimiento-active'); // Opcional: para darle un brillo en CSS
        
        // Si ya tenemos posición, centramos al activar
        if (currentPath.length > 0) {
            state.maps.nav.panTo(currentPath[currentPath.length - 1]);
        }
        mostrarToast("Seguimiento GPS activado");
    } else {
        // --- MODO LIBRE ---
        if (img) img.src = 'icons/NOSeguir.png'; 
        btn.classList.remove('seguimiento-active');
        mostrarToast("Mapa libre: explora la ruta");
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
    mostrarToast(`Mapa: ${nombres[tipo]}`);
}

// No olvides exponerla al window
window.ciclarCapas = ciclarCapas;






