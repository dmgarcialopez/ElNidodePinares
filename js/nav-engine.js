// js/nav-engine.js
import { state } from './state.js';
import { mostrarPromptRuta, mostrarToast, mostrarSelectorEscenarioRuta } from './ui-manager.js';
import { CONFIG } from './config.js';

let isRecording = false;
let watchId = null;
let currentPath = [];
let polyline = null;
let navWakeLock = null; 
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
    // 🔄 CORRECCIÓN 1: Si el mapa nace desde la señal de GPS, hereda centro y zoom por defecto
    if (!state.maps?.nav) {
        state.maps.nav = L.map('nav-map', { 
            zoomControl: false,
            dragging: true,
            touchZoom: true
        }).setView(CONFIG.MAPA.CENTRO_DEFECTO, CONFIG.MAPA.ZOOM_MAPA_VACIO);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.maps.nav);
    }

    const mapa = state.maps.nav;

    if (!marcadorPosicionUsuario) {
        marcadorPosicionUsuario = L.circleMarker(point, {
            radius: 8,          
            fillColor: CONFIG.MAPA.TRACK_ESTILO.color, // Hereda tu color corporativo
            fillOpacity: 1,
            color: '#FFFFFF',    
            weight: 3,          
            opacity: 1
        }).addTo(mapa);
        
        marcadorPosicionUsuario.bindTooltip("", { permanent: false, direction: 'center' }); 
    } else {
        marcadorPosicionUsuario.setLatLng(point);
    }

    // 🔄 CORRECCIÓN 2: Al seguir activamente la señal, aplicamos tu ZOOM_GPS_ACTIVO
    if (autoCenter) {
        mapa.setView(point, CONFIG.MAPA.ZOOM_GPS_ACTIVO);
    }
}

let currentLayer = null;

export async function toggleRecording() {
    const btn = document.getElementById('btn-record');
    console.log(`\n--- 🔍 [toggleRecording] Pulsado. Estado inicial: isRecording = ${isRecording} ---`);
    
    if (!isRecording) {
        console.log("➡️ Llama a startRecording(btn)");
        // 🔐 Intentamos bloquear la pantalla AQUÍ, aprovechando el clic directo del usuario
        await requestWakeLock();
        startRecording(btn);
    } else {
        console.log("➡️ Llama a stopRecording(btn) desde toggle");
        stopRecording(btn);
        // 🔓 Liberamos la pantalla al detener la grabación
        await releaseWakeLock();
    }
}

async function startRecording(btn) {
    const mapa = window.state.maps?.nav;
    console.log(`🔍 [startRecording] Evaluando escenarios. esGrabacionPrevia = ${esGrabacionPrevia}, puntos = ${currentPath.length}`);

    // =========================================================================
    // ESCENARIO A: Existe una grabación previa sin guardar/descartar en pantalla
    // =========================================================================
    if (esGrabacionPrevia && currentPath.length > 0) {
        console.log("⚠️ [startRecording] Escenario A detectado (Grabación previa activa). Abriendo modal...");
        const mensaje = "Tienes una grabación previa en pantalla.\n\n¿Qué deseas hacer con ella?";
        
        const opcionSeleccionada = await mostrarSelectorEscenarioRuta(mensaje);
        console.log(`🎭 [startRecording] Usuario seleccionó opción: [${opcionSeleccionada}]`);
        
        if (opcionSeleccionada === 'continuar') {
            console.log("➡️ Opción CONTINUAR seleccionada.");
            esGrabacionPrevia = false; 
            ejecutarInicioGrabacion(btn);
            mostrarToast("Continuando grabación previa...");
            return;
        } 
        
        else if (opcionSeleccionada === 'guardar') {
            console.log("➡️ Opción GUARDAR seleccionada. Iniciando clonación y parada.");
            const pathAVender = JSON.parse(JSON.stringify(currentPath));
            
            stopRecording(btn); 

            await new Promise(resolve => setTimeout(resolve, 150));
            const guardadoExitoso = await finalizarYExportar(pathAVender);
            
            if (guardadoExitoso) {
                limpiarMapaCompleto(); 
                currentPath = []; 
                esGrabacionPrevia = false; 

                await new Promise(resolve => setTimeout(resolve, 300));

                if (mapa) {
                    polyline = L.polyline(currentPath, CONFIG.MAPA.TRACK_ESTILO).addTo(mapa);
                }

                isRecording = true;
                autoCenter = true;

                if (btn) {
                    btn.classList.add('recording-active');
                    const img = btn.querySelector('img');
                    if (img) img.src = 'icons/Rec.png'; 
                }

                if (navigator.geolocation) {
                    activarSeguimientoContinuo();
                    mostrarToast("🟢 ¡Ruta guardada! Iniciando track nuevo...");
                }
            } else {
                mostrarToast("Guardado cancelado. Reanudando ruta...");
                ejecutarInicioGrabacion(btn);
                esGrabacionPrevia = true;
            }
            return;
        }

        else if (opcionSeleccionada === 'borrar') {
            limpiarMapaCompleto();
            currentPath = [];
            esGrabacionPrevia = false;
            ejecutarInicioGrabacion(btn);
            mostrarToast("Ruta anterior eliminada. Iniciando nueva...");
            return;
        }
        
        return; 
    }

    // =========================================================================
    // ESCENARIO C (ÚNICO): Grabación limpia desde cero
    // (Borra automáticamente cualquier track externo importado previo)
    // =========================================================================
    console.log("➡️ Iniciando grabación directa desde cero (Limpiando mapa si hubiera tracks).");
    
    // Al meter limpiarMapaCompleto() aquí, si había un KML/GPX del antiguo escenario B, se desvanece del mapa
    limpiarMapaCompleto(); 
    
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
        
        // 🔄 CORRECCIÓN 3: Al pulsar grabar, si ya hay una posición GPS previa, metemos zoom de acción de inmediato
        if (ultimaPosicion && window.state.maps?.nav) {
            window.state.maps.nav.setView(ultimaPosicion, CONFIG.MAPA.ZOOM_GPS_ACTIVO);
        }
        
        mostrarToast("🟢 Grabación Activa");
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
    console.log("🧹 [limpiarMapaCompleto] Iniciando purga de elements...");
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
                const point = [pos.coords.latitude, pos.coords.longitude];
                ultimaPosicion = point; 
                
                actualizarPuntoPosicion(point);
                
                if (autoCenter && state.maps && state.maps.nav) {
                    state.maps.nav.setView(point, CONFIG.MAPA.ZOOM_GPS_ACTIVO); // 🔄 CORRECCIÓN 4: Fijamos el zoom activo al reposicionar
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

    if (!polyline) {polyline = L.polyline(currentPath, CONFIG.MAPA.TRACK_ESTILO).addTo(mapa);} 
    else {polyline.setLatLngs(currentPath);}

    if (autoCenter) {
        mapa.setView(point, CONFIG.MAPA.ZOOM_GPS_ACTIVO); // 🔄 CORRECCIÓN 5: Mantiene el zoom de grabación estable
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
        mostrarToast("Grabación finalizada (sin datos).");
    };
    releaseWakeLock();
    console.log(`🔴 [stopRecording] Finalizado. Estado resultante: isRecording = ${isRecording}`);
}

export function finalizarYExportar(puntosForzados = null) {
    console.log("📂 [finalizarYExportar] Promesa iniciada.");
    return new Promise((resolve) => {
        const puntosAGuardar = puntosForzados || currentPath;

        if (!puntosAGuardar || puntosAGuardar.length < 2) {
            console.log(`⚠️ [finalizarYExportar] Cancelado por falta de puntos. Longitud: ${puntosAGuardar?.length}`);
            mostrarToast("No hay Ruta Cargada.");
            resolve(false); 
            return;
        }

        const nombrePorDefecto = "TRACK";

        console.log("💬 [finalizarYExportar] Abriendo mostrarPromptRuta...");
        mostrarPromptRuta(nombrePorDefecto, async (nombreRuta) => {
            console.log(`💬 [finalizarYExportar] Callback de mostrarPromptRuta disparado. Nombre introducido: "${nombreRuta}"`);
            
            if (nombreRuta === null) {
                console.log("❌ [finalizarYExportar] El usuario canceló el diálogo del nombre.");
                resolve(false);
                return;
            }

            // 1️⃣ PASO 1: Si se estaba grabando, DETENER la grabación primero
            if (isRecording) {
                console.log("⏸️ Detectada grabación activa durante el guardado. Forzando stopRecording...");
                const btn = document.getElementById('btn-record');
                stopRecording(btn); // Esto cambia isRecording a false y limpia el watchId del GPS
                if (window.releaseWakeLock) await releaseWakeLock(); // Liberamos el bloqueo de pantalla
            }

            // 2️⃣ PASO 2: Procesar contenido GPX y forzar descarga de archivo
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
            
            // 3️⃣ PASO 3: Quitar todo del mapa y resetear estados finales
            console.log("🧹 Purgando mapa y variables tras exportación exitosa...");
            limpiarMapaCompleto();     // Borra polílines, trackActivo, marcadores, etc.
            currentPath = [];          // Vacía los puntos en memoria
            esGrabacionPrevia = false; // Ya se guardó, por lo que no hay nada pendiente en pantalla

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
    
    console.log(`\n--- 🧭 [Omnivore] Cargando track desde URL externa ---`);

    // 🔄 CORRECCIÓN 6: Carga online hereda el centro y zoom del mapa vacío por defecto
    if (!window.state.maps.nav) {
        window.state.maps.nav = L.map('nav-map', { 
            zoomControl: false,
            dragging: true,
            touchZoom: true
        }).setView(CONFIG.MAPA.CENTRO_DEFECTO, CONFIG.MAPA.ZOOM_MAPA_VACIO);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.state.maps.nav);
    }

    const mapa = window.state.maps.nav;
    const label = document.getElementById('track-name');

    mapa.eachLayer(l => {
        if (l instanceof L.Polyline || l.toGeoJSON || (window.L.KML && l instanceof L.KML)) {
            mapa.removeLayer(l);
        }
    });

    setTimeout(() => mapa.invalidateSize(), 200);

    const ext = extForzada || url.split('.').pop().toLowerCase();
    
   
    try {
       let capaOmnivore;

       if (ext === 'kml') {
           console.log("🌐 Omnivore descargando KML externo...");
           capaOmnivore = omnivore.kml(url);
       } else {
           console.log("🌐 Omnivore descargando GPX externo...");
           capaOmnivore = omnivore.gpx(url);
       }

       // 👁️ QUITAMOS el setStyle de aquí arriba y lo metemos en el 'ready'

       capaOmnivore.addTo(mapa);
       trackActivo = capaOmnivore;

       capaOmnivore.on('ready', () => {
          console.log("🏁 Omnivore externo: Archivo descargado y procesado.");
           
          // 🔥 LA CLAVE ONLINE: Aplicamos el estilo de config.js AQUÍ, cuando los datos ya existen
          capaOmnivore.setStyle(CONFIG.MAPA.TRACK_ESTILO);
        
          // Encuadrar el mapa
          const bounds = capaOmnivore.getBounds();
          if (bounds.isValid()) {
            mapa.fitBounds(bounds, { padding: CONFIG.MAPA.PADDING_ENCUADRE });
          }

        // Intentar extraer el nombre del archivo de forma limpia...
        try {
            let nombreDetectado = null;
            capaOmnivore.eachLayer(layer => {
                if (layer.feature && layer.feature.properties && layer.feature.properties.name) {
                    nombreDetectado = layer.feature.properties.name;
                }
            });
            
            let nombreFinal = nombreDetectado || url.split('/').pop().replace(/\.(gpx|kml)$/i, '').replace(/[-_]/g, ' ');
            if (label) label.innerText = nombreFinal.trim();
        } catch (eName) {
            if (label) label.innerText = url.split('/').pop().replace(/\.(gpx|kml)$/i, '');
        }
    });

      } catch (err) {
    console.error("❌ Error en Omnivore externo:", err);
   }
}
window.cargarTrackExterno = cargarTrackExterno;


export function cargarTrackDesdeTexto(strData, extension = 'kml') {
    console.log(`\n--- 🗺️ [Omnivore] Cargando track desde texto plano ---`);
    console.log(`📋 Formato: [${extension}] | Tamaño: ${strData ? strData.length : 0} caracteres`);

    if (!strData) return;

    if (!window.state.maps.nav) {
        window.state.maps.nav = L.map('nav-map', { 
            zoomControl: false,
            dragging: true,
            touchZoom: true
        }).setView(CONFIG.MAPA.CENTRO_DEFECTO, CONFIG.MAPA.ZOOM_MAPA_VACIO);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.state.maps.nav);
    }

    const mapa = window.state.maps.nav;
    const label = document.getElementById('track-name');

    // FORCE CLEAN: Borramos de forma absoluta cualquier polilínea, capa GeoJSON o rastro anterior
    mapa.eachLayer(l => {
        if (l instanceof L.Polyline || l.toGeoJSON || (l.feature)) {
            mapa.removeLayer(l);
        }
    });

    setTimeout(() => mapa.invalidateSize(), 100);

    const matchName = strData.match(/<name>(.*?)<\/name>/);
    let nombreFinal = matchName ? matchName[1] : "Ruta Local";
    if (label) label.innerText = nombreFinal.trim();

    try {
    let capaOmnivore;

    if (extension === 'kml') {
        console.log("🧩 Omnivore procesando string KML local...");
        capaOmnivore = omnivore.kml.parse(strData);
    } else {
        console.log("🧩 Omnivore procesando string GPX local...");
        capaOmnivore = omnivore.gpx.parse(strData);
    }

    // 🚀 TRUCO MAESTRO OFFLINE:
    // Forzamos el estilo tanto a la capa GeoJSON madre como a cada una de las líneas hijas de Leaflet
    capaOmnivore.setStyle(CONFIG.MAPA.TRACK_ESTILO);
    capaOmnivore.eachLayer(layer => {
        if (layer.setStyle) layer.setStyle(CONFIG.MAPA.TRACK_ESTILO);
    });

    capaOmnivore.addTo(mapa);
    trackActivo = capaOmnivore; 

    // Encuadramos inmediatamente usando tus parámetros
    const bounds = capaOmnivore.getBounds();
    if (bounds.isValid()) {
        console.log("🎯 Encuadre inmediato ejecutado con CONFIG.MAPA.PADDING_ENCUADRE");
        mapa.fitBounds(bounds, { padding: CONFIG.MAPA.PADDING_ENCUADRE });
    }

    // Salvavidas por si Leaflet necesita estirar el contenedor
    setTimeout(() => {
        if (capaOmnivore.getBounds && capaOmnivore.getBounds().isValid()) {
            // Volvemos a machacar el estilo por si acaso en el refresco
            capaOmnivore.setStyle(CONFIG.MAPA.TRACK_ESTILO);
            mapa.fitBounds(capaOmnivore.getBounds(), { padding: CONFIG.MAPA.PADDING_ENCUADRE });
            console.log("🔄 Re-encuadre de seguridad offline completado.");
        }
    }, 350);

} catch (err) {
    console.error("❌ Error crítico en el motor Omnivore offline:", err);
}
}
window.cargarTrackDesdeTexto = cargarTrackDesdeTexto;

async function requestWakeLock() {
    if ('wakeLock' in navigator && !navWakeLock) {
        try { 
            navWakeLock = await navigator.wakeLock.request('screen'); 
            console.log("Pantalla bloqueada: No se apagará.");

            navWakeLock.addEventListener('release', () => {
                console.log('Wake Lock liberado por el sistema.');
                navWakeLock = null;
            });
        } catch (e) {
            console.error("Fallo al bloquear pantalla:", e);
        }
    }
}

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

window.releaseWakeLock = releaseWakeLock;

export function toggleseguir() {
    const btn = document.getElementById('btn-seguir');
    const img = btn?.querySelector('img');

    autoCenter = !autoCenter;

    if (autoCenter) {
        if (img) img.src = 'icons/Seguir.png'; 
        
        iniciarSeguimientoGPS();
        
        if (ultimaPosicion && window.state.maps.nav) {
            // 🔄 CORRECCIÓN 12: Al activar seguir manualmente, vuela a la posición con ZOOM_GPS_ACTIVO
            window.state.maps.nav.setView(ultimaPosicion, CONFIG.MAPA.ZOOM_GPS_ACTIVO);
        }
        
        mostrarToast("Seguimiento GPS activado");
    } else {
        if (img) img.src = 'icons/NOSeguir.png'; 
        
        detenerSeguimientoGPS();
        
        const mapa = window.state.maps?.nav;
        if (trackActivo && mapa) {
            const bounds = trackActivo.getBounds();
            
            if (bounds.isValid()) {
                // 🔄 CORRECCIÓN 13: Al soltar mapa, re-encuadra la ruta usando tu PADDING_ENCUADRE y el MAX_ZOOM de config
                mapa.fitBounds(bounds, {
                    padding: CONFIG.MAPA.PADDING_ENCUADRE,
                    maxZoom: CONFIG.MAPA.MAX_ZOOM || 16
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

document.addEventListener('visibilitychange', async () => {
    const mapContainer = document.getElementById('nav-map');
    console.log(`📱 [visibilitychange] Estado de visibilidad modificado a: ${document.visibilityState}`);
    
    // Solo re-solicitamos el bloqueo si vuelve a estar visible Y la app estaba grabando activamente
    if (document.visibilityState === 'visible' && isRecording && mapContainer) {
        await requestWakeLock();
    }
});

