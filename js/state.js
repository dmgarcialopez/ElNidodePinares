// js/state.js

export let state = {
    // Bases de datos de los CSV
    db: { 
        pois: [], 
        bici: [], 
        paseo: [],
        duendes: [] // Añadimos este para el juego
    },
    
    // Gestión de Mapas
    maps: {
        main: null,
        game: null,
        nav: null
    },

    // --- VARIABLES DEL JUEGO DE DUENDES ---
    game: {
        timer: null,
        userCoords: null,
        currentClosestIdx: -1,
        lastDistance: Infinity,
        captured: JSON.parse(localStorage.getItem('duendesCapturados')) || [],
        wakeLock: null,
        CAPTURE_RANGE: 100000, // metros
        TICK_MS: 3000      // refresco cada 3 segundos (estaba en 100.000, ¡demasiado lento!)
    },

    // --- VARIABLES DE NAVEGACIÓN Y GRABACIÓN ---
    puntosRutaGrabada: [],
    puntosRutaArchivo: [],
    isRecording: false,
    activeLayer: null,
    userMarker: null
};

// Función para actualizar el estado de forma limpia
export const updateState = (key, value) => { 
    state[key] = value; 
};

// CRÍTICO: Exponer el estado al objeto global window
window.state = state;
