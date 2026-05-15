// 1. Nombre de la memoria (Caché) - Cámbialo si haces cambios grandes en el futuro
const CACHE_NAME = 'ENDP.1.0.11';

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
'/icons/AddSetas.png',
'/icons/Aparcar.png',
'/icons/bici.png',
'/icons/BuscaDuendes.png',
'/icons/BuscaSetas.png',
'/icons/CapDuende.png',
'/icons/climb.png',
'/icons/coche.png',
'/icons/compartir.png',
'/icons/FondoDuendes.png',
'/icons/food.png',
'/icons/FreeDuende.png',
'/icons/hotel.png',
'/icons/logo-hotel.png',
'/icons/logo-hotelpq.png',
'/icons/logo-small.png',
'/icons/Maplayer.png',
'/icons/microfono.png',
'/icons/Navegacion.png',
'/icons/NOREC.png',
'/icons/photos.png',
'/icons/poimapa.png',
'/icons/poi.png',
'/icons/Rec.png',
'/icons/ruta.png',
'/icons/SaveFile.png',
'/icons/TND05.png',
'/icons/TND10.png',
'/icons/TND15.png',
'/icons/TND20.png',
'/icons/TND25.png',
'/icons/TND30.png',
'/icons/TND35.png',
'/icons/TND40.png',
'/icons/TND45.png',
'/icons/TND50.png',
'/icons/Ver.png',
'/icons/video.png',
'/icons/walk.png',
'/icons/wood.png',
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

// --- INSTALACIÓN SECUENCIAL (EL MÉTODO ANTIGUO SEGURO) ---
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log("🚀 Instalando archivos uno a uno...");
            for (const url of assets) {
                try {
                    // Descarga y guarda individualmente
                    const response = await fetch(url);
                    if (response.ok) {
                        await cache.put(url, response);
                        console.log(`✅ Guardado: ${url}`);
                    } else {
                        console.error(`❌ Fallo (Status ${response.status}): ${url}`);
                    }
                } catch (err) {
                    console.error(`❌ Error de red en: ${url}`);
                }
            }
            console.log("🏁 Proceso de instalación finalizado");
            enviarMensaje("📲 App lista para usar offline");
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

// --- FETCH (GESTIÓN DE PETICIONES) ---
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Google Sheets (Network First)
    if (url.hostname.includes('docs.google.com')) {
        event.respondWith(
            fetch(request)
                .then(res => {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(request, copy));
                    return res;
                })
                .catch(() => caches.match(request))
        );
        return;
    } 

    // 3. Resto de assets (Cache First)
    event.respondWith(
        caches.match(request).then(res => res || fetch(request))
    );
});

