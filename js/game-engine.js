import { state } from './state.js';
import * as UI from './ui-manager.js';

// --- INICIO DEL JUEGO ---
export async function initGame() {
    requestWakeLock();
    
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
        navigator.geolocation.getCurrentPosition(updateGameStatus, null, { enableHighAccuracy: true });
    }
}

// --- LÓGICA PRINCIPAL (Radar y Duendes) ---
function updateGameStatus(pos) {
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
        name.innerText = closest[0];

        if (state.game.lastDistance < state.game.CAPTURE_RANGE) {
            info.innerText = "¡Duende a la Vista!";
            const tipo = closest[4] ? closest[4].trim() : "Radar";
            if (!video.src.includes(tipo)) {
                video.src = `videos/${tipo}.mp4`;
                video.play().catch(()=>{});
            }
            container.onclick = () => capturar(closest);
        } else {
            info.innerText = `Duende a ${Math.round(state.game.lastDistance)}m`;
            if (!video.src.includes("Radar")) {
                video.src = "videos/Radar.mp4";
                video.play().catch(()=>{});
            }
            container.onclick = null;
        }
    }

    map.panTo([uLat, uLng]);
    state.game.timer = setTimeout(requestLocation, state.game.TICK_MS);
}

// --- CAPTURAR ---
function capturar(duende) {
    state.game.captured.push(duende);
    localStorage.setItem('duendesCapturados', JSON.stringify(state.game.captured));
    UI.mostrarToast("¡Has capturado a " + duende[0] + "!");
    requestLocation(); // Refrescar inmediatamente
}

/**
 * Fuerza una actualización inmediata del radar y el mapa.
 * Útil cuando se liberan duendes desde el álbum.
 */
export function refresh() {
    // Si hay un temporizador en marcha, lo cancelamos para no duplicar procesos
    if (state.game.timer) {
        clearTimeout(state.game.timer);
    }
    // Pedimos la ubicación de nuevo, lo que disparará updateGameStatus
    // y filtrará los duendes según la lista de capturados actualizada.
    requestLocation();
}

// --- UTILIDADES ---
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try { state.game.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
    }
}

