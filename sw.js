// sw.js

// 1. Nombre de la memoria (Caché) - 🟢 ¡A partir de ahora ESTE es el único sitio donde cambiarás la versión!
const CACHE_NAME = 'ENDP.1.0';

// 2. Lista de archivos críticos para que la App funcione offline
const assets = [
'/',
'/index.html',
'/manifest.json',
'/style.css',
'/js/app.js',
'/js/ui-manager.js', 
'/js/nav-engine.js',
'/js/state.js', 
'/js/game-engine.js',
'/js/data-service.js', 
'/js/config.js',
'/js/map-engine.js', 
];

// Función para enviar mensajes a la ventana (UI)
function enviarMensaje(texto) {
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'TOAST',
                text: texto
            });
        });
    });
}

// --- INSTALACIÓN SECUENCIAL REVISADA ---
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log("🚀 Instalando archivos uno a uno...");
            
            // =========================================================================
            // 👇 NUEVA LÍNEA: Guardamos dinámicamente la versión para que app.js pueda leerla
            // =========================================================================
            await cache.put('/pwa-version.txt', new Response(CACHE_NAME));
            // =========================================================================

            // Creamos un sello de tiempo único para esta instalación
            const versionBuster = new Date().getTime();

            for (const url of assets) {
                try {
                    // SOLUCIÓN AL CONGELAMIENTO: Forzamos a GitHub/IONOS a darnos el archivo JS/CSS real de internet
                    // Si la url es '/' o mapea directorios, manejamos el string con cuidado
                    const separator = url.includes('?') ? '&' : '?';
                    const fetchUrl = url === '/' ? `/?v=${versionBuster}` : `${url}${separator}v=${versionBuster}`;

                    const response = await fetch(fetchUrl);
                    if (response.ok) {
                        // IMPORTANTE: Guardamos en la caché con la ruta LIMPIA (ej: '/js/app.js')
                        // para que coincida exactamente cuando estemos offline
                        await cache.put(url, response);
                        console.log(`✅ Guardado limpio en caché: ${url}`);
                    } else {
                        console.error(`❌ Fallo (Status ${response.status}): ${url}`);
                    }
                } catch (err) {
                    console.error(`❌ Error de red en: ${url}`);
                }
            }
            console.log("🏁 Proceso de instalación finalizado")            
        })
    );
});

// --- ACTIVACIÓN Y LIMPIEZA ---
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// --- FETCH (GESTIÓN DE PETICIONES CORREGIDA) ---
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    // Todos los assets (Cache First) - SOLUCIÓN PARA EL MODO OFFLINE
    event.respondWith(
        // ignoreSearch: true destruye el peligro de los '?v=timestamp' del registro de cara a la caché
        caches.match(request, { ignoreSearch: true }).then(res => res || fetch(request))
    );
});