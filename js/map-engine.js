import { CONFIG } from './config.js';
import { state } from './state.js';

export function initNavMap(centro) {
    state.navMap = L.map('nav-map', { zoomControl: false }).setView(centro, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.navMap);
    
    state.userMarker = L.circleMarker(centro, { 
        radius: 8, color: '#FFFFFF', fillColor: CONFIG.COLOR_RUTA, fillOpacity: 1, weight: 3 
    }).addTo(state.navMap);
}

export function drawRoute(puntos) {
    if (state.activeLayer) state.navMap.removeLayer(state.activeLayer);
    
    state.activeLayer = L.polyline(puntos, {
        color: CONFIG.COLOR_RUTA, weight: 7, lineJoin: 'round', lineCap: 'round', fill: false, noClip: true
    }).addTo(state.navMap);
    
    state.navMap.setView(puntos[puntos.length - 1], CONFIG.ZOOM_NIVEL);
}