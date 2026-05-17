// js/nav-engine.js
import { state } from './state.js';
import { mostrarPromptRuta, mostrarToast, mostrarSelectorEscenarioRuta } from './ui-manager.js';
import { activateScreenLock, releaseScreenLock } from './wakelock-service.js';

let isRecording = false;
let watchId = null;
let currentPath = [];
let polyline = null;
let autoCenter = false; 
const ordenCapas = ['osm', 'topo', 'sat'];
let indiceCapaActual = 0;
let marcadorPosicionUsuario = null; 
let ultimaPosicion = null; 
let trackActivo = null;
let esGrabacionPrevia = false;

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

    if (!marcadorPosicionUsuario) {
        marcadorPosicionUsuario = L.circleMarker(point, {
            radius: 8,          
            fillColor: '#007FFF', 
            fillOpacity: 1,
            color: '#FFFFFF',    
            weight: 3,          
            opacity: 1
        }).addTo(mapa);
        
        marcadorPosicionUsuario.bindTooltip("", { permanent: false, direction: 'center' }); 
    } else {
        marcadorPosicionUsuario.setLatLng(point);
    }
}

let currentLayer = null;

export function toggleRecording() {
    const btn = document.getElementById('btn-record');
    console.log(`\n--- 🔍 [toggleRecording] Pulsado. Estado inicial: isRecording = ${isRecording} ---`);
    
    if (!isRecording) {
        console.log("➡️ Llama a startRecording(btn)");
        startRecording(btn);
    } else {
        console.log("➡️ Llama a stopRecording(btn) desde toggle");
        stopRecording(btn);
    }
}

async function startRecording(btn) {
    const mapa = window.state.maps?.nav;
    console.log(`🔍 [startRecording] Evaluando escenarios. esGrabacionPrevia = ${esGrabacionPrevia}, puntos = ${currentPath.length}`);

    // ESCENARIO A: Existe una grabación previa sin guardar/descartar en pantalla
    if (esGrabacionPrevia && currentPath.length > 0) {
        console.log("⚠️ [startRecording] Escenario A detectado (Grabación previa activa). Abriendo modal...");
        const mensaje = "Tienes una grabación previa en pantalla.\n\n¿Qué deseas hacer con ella?";
        
        const opcionSeleccionada = await mostrarSelectorEscenarioRuta(mensaje);
        console.log(`🎭 [startRecording] Usuario seleccionó opción: [${opcionSeleccionada}]`);
        
        // --- OPCIÓN 1: CONTINUAR ---
        if (opcionSeleccionada === 'continuar') {
            console.log("➡️ Opción CONTINUAR seleccionada.");
            esGrabacionPrevia = false; 
            ejecutarInicioGrabacion(btn);
            mostrarToast("Continuando grabación previa...");
            return;
        } 
        
        // --- OPCIÓN 2: GUARDAR Y EMPEZAR TRACK NUEVO ---
        else if (opcionSeleccionada === 'guardar') {
            console.log("➡️ Opción GUARDAR seleccionada. Iniciando clonación y parada.");
            const pathAVender = JSON.parse(JSON.stringify(currentPath));
            
            console.log("⏸️ Ejecutando stopRecording(btn) previo al guardado...");
            stopRecording(btn); 

            console.log("⏳ Pausa de 150ms para la UI...");
            await new Promise(resolve => setTimeout(resolve, 150));

            console.log("💾 Lanzando promesa finalizarYExportar...");
            const guardadoExitoso = await finalizarYExportar(pathAVender);
            console.log(`💾 Promesa finalizarYExportar resuelta. ¿Éxito? ${guardadoExitoso}`);
            
            if (guardadoExitoso) {
                console.log("🧹 Iniciando limpieza completa del mapa para nuevo track...");
                limpiarMapaCompleto(); 
                currentPath = []; 
                esGrabacionPrevia = false; 

                console.log("⏳ Pausa de 300ms tras la descarga para asentar el navegador...");
                await new Promise(resolve => setTimeout(resolve, 300));

                if (mapa) {
                    console.log("🗺️ Dibujando polilínea vacía inicial en el mapa...");
                    polyline = L.polyline(currentPath, {
                        color: '#007FFF', weight: 8, opacity: 1,          
                        lineJoin: 'round', lineCap: 'round',
                        shadowBlur: 5, shadowColor: '#007FFF' 
                    }).addTo(mapa);
                }

                console.log("🚀 [Flujo Principal] Forzando el inicio de la nueva grabación...");
                isRecording = true;
                autoCenter = true;

                if (btn) {
                    btn.classList.add('recording-active');
                    const img = btn.querySelector('img');
                    if (img) img.src = 'icons/Rec.png'; 
                    console.log("🎨 UI del botón actualizada a REC activada.");
                }

                if (navigator.geolocation) {
                    console.log("🛰️ Llamando a activarSeguimientoContinuo()...");
                    activarSeguimientoContinuo();
                    mostrarToast("🟢 ¡Ruta guardada! Iniciando track nuevo...");
                }

                console.log(`🟢 [FIN FLUJO OPCIÓN 2] Grabación nueva iniciada de forma lineal. isRecording = ${isRecording}`);

            } else {
                console.log("❌ Guardado rechazado o cancelado por el usuario. Reanudando track previo...");
                mostrarToast("Guardado cancelado. Reanudando ruta...");
                ejecutarInicioGrabacion(btn);
                esGrabacionPrevia = true;
            }
            return;
        }

        // --- OPCIÓN 3: BORRAR Y EMPEZAR TRACK NUEVO ---
        else if (opcionSeleccionada === 'borrar') {
            console.log("➡️ Opción BORRAR seleccionada.");
            limpiarMapaCompleto();
            currentPath = [];
            esGrabacionPrevia = false;
            ejecutarInicioGrabacion(btn);
            mostrarToast("Ruta anterior eliminada. Iniciando nueva...");
            return;
        }
        
        return; 
    }

    // ESCENARIO B: Se está siguiendo un track externo (KML/GPX importado)
    if (trackActivo && mapa) {
        console.log("➡️ Escenario B detectado (Siguiendo track externo).");
        currentPath = []; 
        esGrabacionPrevia = false;
        ejecutarInicioGrabacion(btn);
        mostrarToast("Siguiendo ruta externa...");
        return; 
    }

    // ESCENARIO C: No hay rutas previas en pantalla (Grabación directa desde cero)
    console.log("➡️ Escenario C detectado (Grabación directa desde cero).");
    currentPath = [];
    esGrabacionPrevia = false;
    ejecutarInicioGrabacion(btn);
}

function ejecutarInicioGrabacion(btn) {
    console.log("🟢 [ejecutarInicioGrabacion] Entrando. Estableciendo estados activos...");
    isRecording = true;
    autoCenter = true; 

    if (btn) {
        btn.classList.add('recording-active');
        const img = btn.querySelector('img');
        if (img) img.src = 'icons/Rec.png'; 
        console.log("🎨 UI del botón forzada a REC activo.");
    }

    if (navigator.geolocation) {
        activarSeguimientoContinuo();        
    }
    console.log(`🟢 [ejecutarInicioGrabacion] Terminado. Estado final: isRecording = ${isRecording}`);
}

function activarSeguimientoContinuo() {
    console.log(`🛰️ [activarSeguimientoContinuo] watchId actual: ${watchId}. Reiniciando watchPosition...`);
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        console.log("🛰️ watchId anterior liberado.");
    }

    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            // 🛡️ CONTROL DE SEGURIDAD ANTIFUGAS:
            // Si el cliente hizo "back" y salió de la pantalla del navegador, apagamos el GPS al instante
            const mapContainer = document.getElementById('nav-map');
            if (!mapContainer || mapContainer.offsetParent === null) {
                console.log("🛑 GPS continuo detenido de manera segura (fuera de pantalla de navegación).");
                if (watchId) {
                    navigator.geolocation.clearWatch(watchId);
                    watchId = null;
                }
                return;
            }

            console.log(`📍 [GPS COORDENADA] Recibida: [${pos.coords.latitude}, ${pos.coords.longitude}]. Grabando = ${isRecording}`);
            const point = [pos.coords.latitude, pos.coords.longitude];
            currentPath.push(point);
            actualizarMapa(point); 
        },
        (err) => console.error("❌ Error GPS continuo:", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    console.log(`🛰️ [activarSeguimientoContinuo] Nuevo watchId registrado: ${watchId}`);
}

function limpiarMapaCompleto() {
    console.log("🧹 [limpiarMapaCompleto] Iniciando purga de elementos...");
    const mapa = window.state.maps?.nav; 
    if (!mapa) {
        console.log("🧹 [limpiarMapaCompleto] No hay mapa inicializado en state.maps.nav");
        return; 
    }

    try {
        if (trackActivo) { 
            mapa.removeLayer(trackActivo); 
            trackActivo = null; 
            console.log("🧹 Track externo eliminado.");
        } 

        if (polyline) { 
            mapa.removeLayer(polyline); 
            polyline = null; 
            console.log("🧹 Polilínea de grabación eliminada.");
        } 

        mapa.eachLayer(layer => { 
            if (layer instanceof L.Polyline ||  
                (L.GPX && layer instanceof L.GPX) ||  
                (L.KML && layer instanceof L.KML)) { 
                mapa.removeLayer(layer); 
                console.log("🧹 Capa residual purgada.");
            } 
        }); 

        currentPath = []; 
        console.log("🧹 Array currentPath vaciado.");

        // BLINDAJE ANTI-ERRORES PARA LEAFLET
        try { mapa.closePopup(); } catch(e) { console.log("🧹 Nota: No había popups que cerrar."); }
        try { mapa.closeTooltip(); } catch(e) { console.log("🧹 Nota: No había tooltips que cerrar."); }
        
        if (marcadorPosicionUsuario) {
            try { marcadorPosicionUsuario.unbindTooltip(); } catch(e) {}
            try { marcadorPosicionUsuario.unbindPopup(); } catch(e) {}
        }
        
        console.log("🧹 [limpiarMapaCompleto] Terminado con éxito y de forma segura.");

    } catch (error) {
        console.error("⚠️ Error crítico controlado en limpieza de mapa:", error);
    }
}

function iniciarSeguimientoGPS() {
    if (navigator.geolocation) {
        if (watchId !== null) return; 

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                // 🛡️ CONTROL DE SEGURIDAD ANTIFUGAS:
                const mapContainer = document.getElementById('nav-map');
                if (!mapContainer || mapContainer.offsetParent === null) {
                    console.log("🛑 Seguimiento GPS estándar detenido de forma segura.");
                    detenerSeguimientoGPS();
                    return;
                }

                const point = [pos.coords.latitude, pos.coords.longitude];
                ultimaPosicion = point; 
                
                actualizarPuntoPosicion(point);
                
                if (autoCenter && state.maps && state.maps.nav) {
                    state.maps.nav.panTo(point);
                }
            },
            (err) => console.error("Error GPS:", err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }
}

function detenerSeguimientoGPS() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    if (marcadorPosicionUsuario) {
        marcadorPosicionUsuario.remove();
        marcadorPosicionUsuario = null;
    }
}

function actualizarMapa(point) {
    const mapa = state.maps?.nav;
    if (!mapa) return;

    actualizarPuntoPosicion(point);

    if (!polyline) {
        polyline = L.polyline(currentPath, {
            color: '#007FFF',    
            weight: 8,           
            opacity: 1,          
            lineJoin: 'round',
            lineCap: 'round',
            shadowBlur: 5,       
            shadowColor: '#007FFF' 
        }).addTo(mapa);
    } else {
        polyline.setLatLngs(currentPath);
    }

    if (autoCenter) {
        mapa.panTo(point);
    }
}

function stopRecording(btn) {
    console.log(`🔴 [stopRecording] Solicitado. Estado actual: isRecording = ${isRecording}`);
    isRecording = false;
    
    if (btn) {
        btn.classList.remove('recording-active');
        const img = btn.querySelector('img');
        if (img) img.src = 'icons/NOREC.png'; 
        btn.style.backgroundColor = ''; 
        console.log("🎨 UI del botón actualizada a NOREC.");
    }
    
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null; 
        console.log("🛰️ GPS Desactivado (clearWatch ejecutado).");
    }
    
    if (currentPath.length > 0) {
        esGrabacionPrevia = true; 
        console.log(`💾 [stopRecording] Guardando track en localStorage. Puntos acumulados: ${currentPath.length}`);
        const historico = JSON.parse(localStorage.getItem('rutas_guardadas') || '[]');
        historico.push({
            fecha: new Date().toISOString(),
            puntos: currentPath
        });
        localStorage.setItem('rutas_guardadas', JSON.stringify(historico));
        mostrarToast("Ruta finalizada y guardada en el historial.");
    } else {
        console.log("🔴 [stopRecording] Detenido sin puntos acumulados.");       
    }
    console.log(`🔴 [stopRecording] Finalizado. Estado resultante: isRecording = ${isRecording}`);
}

export function finalizarYExportar(puntosForzados = null) {
    console.log("📂 [finalizarYExportar] Promesa iniciada.");
    return new Promise((resolve) => {
        const puntosAGuardar = puntosForzados || currentPath;

        if (!puntosAGuardar || puntosAGuardar.length < 2) {
            console.log(`⚠️ [finalizarYExportar] Cancelado por falta de puntos. Longitud: ${puntosAGuardar?.length}`);
            mostrarToast("No hay Ruta Activa.");
            resolve(false); 
            return;
        }

        if (marcadorPosicionUsuario) {
            marcadorPosicionUsuario.unbindTooltip();
        }
        
        const nombrePorDefecto = "TRACK";

        console.log("💬 [finalizarYExportar] Abriendo mostrarPromptRuta...");
        mostrarPromptRuta(nombrePorDefecto, (nombreRuta) => {
            console.log(`💬 [finalizarYExportar] Callback de mostrarPromptRuta disparado. Nombre introducido: "${nombreRuta}"`);
            
            if (nombreRuta === null) {
                console.log("❌ [finalizarYExportar] El usuario canceló el diálogo del nombre.");
                resolve(false);
                return;
            }

            console.log("⚙️ Procesando contenido GPX y forzando descarga de archivo...");
            const lineasGPX = puntosAGuardar.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}" />`).join('\n      ');

            const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="El Nido de Pinares" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${nombreRuta}</name>
    <trkseg>
      ${lineasGPX}
    </trkseg>
  </trk>
</gpx>`;

            const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            
            const ahora = new Date();
            const aa = ahora.getFullYear().toString().slice(-2);
            const mm = (ahora.getMonth() + 1).toString().padStart(2, '0');
            const dd = ahora.getDate().toString().padStart(2, '0');
            const hh = ahora.getHours().toString().padStart(2, '0');

            const nombreLimpio = nombreRuta.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const nombreFicheroFinal = `${aa}${mm}${dd}${hh}${nombreLimpio}`;
            
            link.href = url;
            link.download = `${nombreFicheroFinal}.gpx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log("📥 [finalizarYExportar] Link de descarga pulsado por código.");
            mostrarToast(`Ruta guardada correctamente.`);
            
            console.log("📂 [finalizarYExportar] Ejecutando resolve(true)...");
            resolve(true);
        });
    });
}

export function changeBaseLayer(layerType) {
    const mapa = state.maps.nav;
    if (!mapa) return;

    mapa.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
            mapa.removeLayer(layer);
        }
    });

    currentLayer = baseLayers[layerType];
    currentLayer.addTo(mapa);
    
    const menu = document.getElementById('map-selector');
    if (menu) menu.classList.add('hidden');
}

window.toggleRecording = toggleRecording;
window.finalizarYExportar = finalizarYExportar;
window.changeBaseLayer = changeBaseLayer;

window.toggleMapMenu = function() {
    const menu = document.getElementById('map-selector');
    if (menu) menu.classList.toggle('hidden');
};

export function seleccionarTrack() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml,text/plain,application/octet-stream';

    fileInput.onchange = (evento) => {
        const archivo = evento.target.files[0];
        if (!archivo) return; 

        const ext = archivo.name.split('.').pop().toLowerCase();

        if (ext !== 'gpx' && ext !== 'kml') {
            if (typeof mostrarToast === 'function') {
                mostrarToast("❌ Archivo no válido. Solo se permiten rutas .GPX o .KML");
            }
            return; 
        }

        let urlBlob = URL.createObjectURL(archivo);
        cargarTrackExterno(urlBlob, ext); 
        
        if (typeof mostrarToast === 'function') {
            mostrarToast(`Cargando: ${archivo.name}`);
        }
    };

    fileInput.click();
}

window.seleccionarTrack = seleccionarTrack;

export function cargarTrackExterno(url, extForzada = null) {
    if (!url) return;

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

    mapa.eachLayer(l => {
        if (l instanceof L.Polyline || (window.L.KML && l instanceof L.KML) || l instanceof L.GPX) {
            mapa.removeLayer(l);
        }
    });

    setTimeout(() => mapa.invalidateSize(), 200);

    fetch(url)
        .then(r => r.text())
        .then(strData => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(strData, "text/xml");
            
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

    const ext = extForzada || url.split('.').pop().toLowerCase();

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
        
        setTimeout(() => {
            const bounds = trackKml.getBounds();
            if (bounds.isValid()) mapa.fitBounds(bounds, { padding: [40, 40] });
        }, 600);

    } else {
        const gpxTrack = new L.GPX(url, {
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

    mapa.eachLayer(l => {
        if (l instanceof L.Polyline || (window.L.KML && l instanceof L.KML) || l instanceof L.GPX) {
            mapa.removeLayer(l);
        }
    });

    setTimeout(() => mapa.invalidateSize(), 200);

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(strData, "text/xml");
    
    const nombreRuta = xmlDoc.querySelector('Placemark > name, trk > name')?.textContent;
    const nombreCarpeta = xmlDoc.querySelector('Folder > name')?.textContent;
    const nombreCualquiera = xmlDoc.querySelector('name')?.textContent;
    
    let nombreFinal = nombreRuta || nombreCarpeta || nombreCualquiera || "Ruta Local";
    if (label) label.innerText = nombreFinal.trim();

    if (extension === 'kml') {
        const trackKml = new L.KML(xmlDoc); 
        mapa.addLayer(trackKml);

        trackKml.on("loaded", () => {
            const bounds = trackKml.getBounds();
            if (bounds.isValid()) mapa.fitBounds(bounds, { padding: [40, 40] });
        });

        setTimeout(() => {
            if (trackKml.getBounds().isValid()) mapa.fitBounds(trackKml.getBounds(), { padding: [40, 40] });
        }, 600);

    } else if (extension === 'gpx') {
        const gpxTrack = new L.GPX(strData, {
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

export function asegurarMapaInicializado() {
    if (window.state.maps.nav) return;

    const mapContainer = document.getElementById('nav-map');
    if (!mapContainer) return;

    console.log("Inicializando contenedor de mapa...");

    if (mapContainer._leaflet_id) {
        mapContainer._leaflet_id = null;
    }

    try {
        window.state.maps.nav = L.map('nav-map', {
            zoomControl: false,
            dragging: true,
            zoomAnimation: true
        }).setView([41.828, -3.005], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(window.state.maps.nav);

        console.log("Mapa de navegación listo.");
        
        // 🔥 LLAMADA UNIFICADA: Registra la entrada a la pantalla del mapa
        activateScreenLock();
    } catch (e) {
        console.error("Error al crear el mapa:", e);
    }
}

export function toggleseguir() {
    const btn = document.getElementById('btn-seguir');
    const img = btn?.querySelector('img');

    autoCenter = !autoCenter;

    if (autoCenter) {
        if (img) img.src = 'icons/Seguir.png'; 
        
        iniciarSeguimientoGPS();
        
        if (ultimaPosicion && window.state.maps.nav) {
            window.state.maps.nav.panTo(ultimaPosicion);
        }
        
        mostrarToast("Seguimiento GPS activado");
    } else {
        if (img) img.src = 'icons/NOSeguir.png'; 
        
        detenerSeguimientoGPS();
        
        const mapa = window.state.maps?.nav;
        if (trackActivo && mapa) {
            const bounds = trackActivo.getBounds();
            
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

window.toggleseguir = toggleseguir;

export function ciclarCapas() {
    const mapa = state.maps.nav;
    if (!mapa) return;

    indiceCapaActual = (indiceCapaActual + 1) % ordenCapas.length;
    const tipo = ordenCapas[indiceCapaActual];

    mapa.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
            mapa.removeLayer(layer);
        }
    });

    const nuevaCapa = baseLayers[tipo];
    nuevaCapa.addTo(mapa);
}

window.ciclarCapas = ciclarCapas;

export async function releaseWakeLock() {
    // 🔥 LLAMADA UNIFICADA: Libera el hardware limpiamente de forma global
    await releaseScreenLock();
}
window.releaseWakeLock = releaseWakeLock;