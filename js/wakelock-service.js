// js/wakelock-service.js

let globalWakeLock = null;
let isEnabled = false; 

// Lista de IDs de contenedores HTML que requieren la pantalla encendida
const PANTALLAS_PERMITIDAS = ['nav-map', 'game-map'];

/**
 * Verifica si la pantalla actual en el DOM requiere Wake Lock
 */
function verificarPantallaActual() {
    // Comprobamos si alguno de los contenedores clave está visible en el DOM real
    const necesitaBloqueo = PANTALLAS_PERMITIDAS.some(id => {
        const el = document.getElementById(id);
        // Existe en el DOM y es visible (no tiene hidden, ni display: none)
        return el && el.offsetParent !== null;
    });

    if (necesitaBloqueo) {
        console.log("📍 [WakeLock] Pantalla autorizada detectada en el DOM.");
        activateScreenLock();
    } else {
        console.log("🚶 [WakeLock] Pantalla no autorizada o fuera de ruta. Liberando...");
        releaseScreenLock();
    }
}

export async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (globalWakeLock !== null) return;

    try {
        globalWakeLock = await navigator.wakeLock.request('screen');
        console.log("🟢 [WakeLock] Candado activado globalmente.");

        globalWakeLock.addEventListener('release', () => {
            console.log("🟡 [WakeLock] El sistema operativo liberó el candado.");
            globalWakeLock = null;
        });
    } catch (err) {
        console.error("❌ [WakeLock] Error al solicitar:", err);
        globalWakeLock = null;
    }
}

export async function activateScreenLock() {
    isEnabled = true;
    await requestWakeLock();
}

export async function releaseScreenLock() {
    isEnabled = false;
    if (globalWakeLock) {
        try {
            await globalWakeLock.release();
        } catch (err) {}
        globalWakeLock = null;
        console.log("🔴 [WakeLock] Candado liberado globalmente.");
    }
}

// --- ESCUCHADORES AUTOMÁTICOS DE NAVEGACIÓN (HISTORIAL Y VISIBILIDAD) ---

// 1. Cada vez que el usuario hace 'Back' o 'Forward' en el móvil/navegador
window.addEventListener('popstate', () => {
    console.log("🔄 [WakeLock] Cambio de historial detectado (Back/Forward). Verificando ruta...");
    // Le damos 100ms a tu app para que cambie el DOM antes de verificar qué pantalla quedó activa
    setTimeout(verificarPantallaActual, 100);
});

// 2. Control de visibilidad de la pestaña (Minimizar / Bloquear móvil)
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && isEnabled) {
        console.log("🔄 [WakeLock] App recuperada. Re-solicitando candado...");
        setTimeout(verificarPantallaActual, 200);
    }
});

// Hacemos una exportación por si tus scripts quieren forzar un chequeo manual
export { verificarPantallaActual };

