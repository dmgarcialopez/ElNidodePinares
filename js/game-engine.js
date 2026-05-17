// js/game-engine.js
import { state } from './state.js';
import * as UI from './ui-manager.js';
import * as Data from './data-service.js'; // Importación necesaria para getVideoUrl
import { activateScreenLock, releaseScreenLock } from './wakelock-service.js';

// --- INICIO DEL JUEGO ---
export async function initGame() {
    console.log("🎮 Iniciando pantalla del juego...");
    // Activamos el Wake Lock a través de nuestro servicio unificado
    activateScreenLock();
    
    if (!state.maps.game) {
        state.maps.game = L.map('game-map', { zoomControl: false }).setView([41.84253, -3.003343], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.maps.game);
    }
    
    setTimeout(() => { state.maps.game.invalidateSize(); }, 400);

    if (state.game.timer) clearTimeout(state.game.timer);
    requestLocation(); 
}

// --- GEOLOCALIZACIÓN ---
function requestLocation() {
    if (navigator.geolocation) {
        // Cambiamos a getCurrentPosition para que llame a nuestra función async
        navigator.geolocation.getCurrentPosition(updateGameStatus, null, { enableHighAccuracy: true });
    }
}

// --- LÓGICA PRINCIPAL (Radar y Duendes) ---
async function updateGameStatus(pos) {
    // 🛡️ CONTROL DE SEGURIDAD INTERNO:
    // Si el usuario hizo "back" y el mapa ya no está visible en el DOM, abortamos el bucle.
    // Esto evita que el juego siga pidiendo coordenadas GPS infinitamente en segundo plano.
    const gameMapEl = document.getElementById('game-map');
    if (!gameMapEl || gameMapEl.offsetParent === null) {
        console.log("🛑 Bucle de juego detenido de forma segura (pantalla fuera de vista).");
        if (state.game.timer) clearTimeout(state.game.timer);
        return;
    }

    const { latitude: uLat, longitude: uLng } = pos.coords;
    state.game.userCoords = { lat: uLat, lng: uLng }; 

    // 1. Filtrar duendes disponibles (los que no han sido capturados)
    const duendesDisponibles = (state.db['duendes'] || []).filter(d => 
        !state.game.captured.some(c => c[0] === d[0])
    );

    // 2. Buscar el más cercano
    let closestDist = Infinity;
    let closestIdx = -1;

    duendesDisponibles.forEach((d, i) => {
        const dLat = parseFloat(String(d[1]).replace(',', '.'));
        const dLng = parseFloat(String(d[2]).replace(',', '.'));
        const dist = getDistance(uLat, uLng, dLat, dLng);
        if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
        }
    });

    state.game.currentClosestIdx = closestIdx;
    state.game.lastDistance = closestDist;

    // 3. Pintar Mapa
    const map = state.maps.game;
    map.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.CircleMarker) map.removeLayer(l); });
    
    // Posición usuario
    L.circleMarker([uLat, uLng], { color: '#2196F3', radius: 8, fillOpacity: 1 }).addTo(map);

    // Pintar Duendes
    duendesDisponibles.forEach((d, i) => {
        const dLat = parseFloat(String(d[1]).replace(',', '.'));
        const dLng = parseFloat(String(d[2]).replace(',', '.'));
        const popupContent = `<div style="text-align:center;"><b>${d[0]}</b><br>${d[3]}P</div>`;

        if (i === state.game.currentClosestIdx) {
            const redIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                iconSize: [25, 41], iconAnchor: [12, 41]
            });
            L.marker([dLat, dLng], {icon: redIcon}).addTo(map).bindPopup(popupContent);
        } else {
            L.marker([dLat, dLng]).addTo(map).bindPopup(popupContent);
        }
    });

    // 4. Actualizar Interfaz (Vídeo y Radar)
    const info = document.getElementById('closest-info');
    const name = document.getElementById('duende-name');
    const video = document.getElementById('game-video');
    const container = document.getElementById('video-container');

    if (closestIdx !== -1) {
        const closest = duendesDisponibles[closestIdx];
        if (name) name.innerText = closest[0];

        let videoNombre = "Radar"; // Por defecto el radar
        
        if (state.game.lastDistance < state.game.CAPTURE_RANGE) {
            if (info) info.innerText = "¡Duende a la Vista!";
            videoNombre = closest[4] ? closest[4].trim() : "Radar";
            if (container) container.onclick = () => capturar(closest);
        } else {
            if (info) info.innerText = `Duende a ${Math.round(state.game.lastDistance)}m`;
            if (container) container.onclick = null;
        }

        // --- LÓGICA INDEXEDDB PARA VÍDEO ---
        if (video && (!video.dataset.currentType || video.dataset.currentType !== videoNombre)) {
            try {
                const blobUrl = await Data.getVideoUrl(videoNombre);
                
                if (blobUrl) {
                    if (video.src.startsWith('blob:')) {
                        URL.revokeObjectURL(video.src);
                    }
                    video.src = blobUrl;
                    video.dataset.currentType = videoNombre; 
                    video.play().catch(()=>{});
                } else {
                    video.src = `videos/${videoNombre}.mp4`;
                }
            } catch (err) {
                console.error("Error cargando video de IndexedDB:", err);
                video.src = `videos/${videoNombre}.mp4`;
            }
        }
    }

    map.panTo([uLat, uLng]);
    
    // Encadenamos el siguiente frame del radar si seguimos en la pantalla
    state.game.timer = setTimeout(requestLocation, state.game.TICK_MS);
}

// --- CAPTURAR ---
function capturar(duende) {
    state.game.captured.push(duende);
    localStorage.setItem('duendesCapturados', JSON.stringify(state.game.captured));
    UI.mostrarToast("¡Has capturado a " + duende[0] + "!");
    refresh(); 
}

/**
 * Fuerza una actualización inmediata del radar y el mapa.
 */
export function refresh() {
    if (state.game.timer) {
        clearTimeout(state.game.timer);
    }

    if (state.game.userCoords && state.game.userCoords.lat) {
        console.log("Refresco instantáneo con coordenadas guardadas");
        const mockPos = {
            coords: {
                latitude: state.game.userCoords.lat,
                longitude: state.game.userCoords.lng
            }
        };
        updateGameStatus(mockPos);
    } else {
        requestLocation();
    }
}

// --- UTILIDADES ---
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}