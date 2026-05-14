// js/nav-engine.js
import { state } from './state.js';
import { mostrarPromptRuta, mostrarToast } from './ui-manager.js';

// --- ESTADO ---
let isRecording = false;    // ¿Está grabando un nuevo track?
let autoCenter = false;     // ¿Está siguiendo la ruta (Navegación)?
let watchIdGPS = null;      // Único proceso de lectura GPS
let userMarker = null;      // Punto azul de posición actual
let currentPath = [];       // Puntos de la grabación actual
let recordingPolyline = null; 

// --- MOTOR GPS ---

function iniciarGPS() {
    if (watchIdGPS || !navigator.geolocation) return;
    watchIdGPS = navigator.geolocation.watchPosition(
        (pos) => {
            const latlng = [pos.coords.latitude, pos.coords.longitude];
            actualizarMarcadorUsuario(latlng);

            if (autoCenter && state.maps.nav) {
                state.maps.nav.panTo(latlng);
            }

            if (isRecording) {
                currentPath.push(latlng);
                dibujarRutaGrabada();
            }
        },
        (err) => console.error("Error GPS:", err),
        { enableHighAccuracy: true, distanceFilter: 3 }
    );
}

function actualizarMarcadorUsuario(latlng) {
    if (!state.maps.nav) return;
    if (!userMarker) {
        userMarker = L.circleMarker(latlng, {
            radius: 8, fillColor: '#3388ff', color: '#fff', weight: 3, opacity: 1, fillOpacity: 1
        }).addTo(state.maps.nav);
    } else {
        userMarker.setLatLng(latlng);
    }
}

// --- BOTÓN SEGUIMIENTO (NAVEGACIÓN) ---

export function togglesegir() {
    // REGLA: Si está grabando, no puede seguir
    if (isRecording) {
        mostrarToast("Pare la grabación para activar el seguimiento");
        return;
    }

    const btn = document.getElementById('btn-seguir');
    const img = btn?.querySelector('img');
    
    autoCenter = !autoCenter;
    
    if (autoCenter) {
        iniciarGPS();
        if (img) img.src = 'icons/Seguir.png';
        btn.classList.add('seguimiento-active');
        mostrarToast("Siguiendo ruta...");
    } else {
        if (img) img.src = 'icons/NOSeguir.png';
        btn.classList.remove('seguimiento-active');
        mostrarToast("Mapa libre");
    }
}

// --- BOTÓN GRABACIÓN (RECORDING) ---

export function toggleRecording() {
    const btn = document.getElementById('btn-record');
    const img = btn?.querySelector('img');
    
    if (!isRecording) {
        // --- ACTIVAR GRABACIÓN ---
        
        // 1. Si estaba siguiendo, paramos el seguimiento automáticamente
        if (autoCenter) {
            togglesegir(); 
        }

        // 2. Lógica de continuidad: 
        // Si currentPath ya tiene puntos (de una grabación reciente no borrada), continuamos.
        // Si no, empezamos limpio.
        if (currentPath.length === 0) {
            limpiarMapaDeTracks(); // Borra tracks cargados externamente si empezamos de cero
            mostrarToast("Grabando nueva ruta desde cero");
        } else {
            mostrarToast("Continuando grabación previa...");
        }

        isRecording = true;
        iniciarGPS();
        if (img) img.src = 'icons/Rec.png';
        btn.classList.add('recording-active');
    } else {
        // --- PAUSAR/PARAR GRABACIÓN ---
        isRecording = false;
        if (img) img.src = 'icons/NOREC.png';
        btn.classList.remove('recording-active');
        mostrarToast("Grabación pausada");
    }
}

// --- UTILIDADES DE MAPA ---

function dibujarRutaGrabada() {
    if (!state.maps.nav) return;
    if (!recordingPolyline) {
        recordingPolyline = L.polyline(currentPath, {
            color: '#2e7d32', // Verde corporativo de El Nido
            weight: 6
        }).addTo(state.maps.nav);
    } else {
        recordingPolyline.setLatLngs(currentPath);
    }
}

function limpiarMapaDeTracks() {
    const mapa = state.maps.nav;
    if (!mapa) return;
    mapa.eachLayer(l => {
        // Borramos polilíneas (tracks) y capas GPX/KML externas
        if (l instanceof L.Polyline || l instanceof L.GPX || (window.L.KML && l instanceof L.KML)) {
            mapa.removeLayer(l);
        }
    });
    recordingPolyline = null;
}

export function finalizarYExportar() {
    if (currentPath.length < 2) {
        mostrarToast("No hay ruta suficiente para guardar");
        return;
    }

    mostrarPromptRuta("Mi Ruta en Navaleno", (nombre) => {
        const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="El Nido"><trk><name>${nombre}</name><trkseg>${currentPath.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
        
        const blob = new Blob([gpx], {type: 'application/gpx+xml'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${nombre}.gpx`;
        link.click();
        
        // Tras exportar, vaciamos para que la siguiente sí sea "de cero"
        currentPath = [];
        if (recordingPolyline) state.maps.nav.removeLayer(recordingPolyline);
        recordingPolyline = null;
        mostrarToast("Ruta guardada correctamente");
    });
}

// ... Resto de funciones (ciclarCapas, etc.) se mantienen igual ...

window.togglesegir = togglesegir;
window.toggleRecording = toggleRecording;
window.finalizarYExportar = finalizarYExportar;

