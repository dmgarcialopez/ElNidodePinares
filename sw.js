// 1. Nombre de la memoria (Caché) - Cámbialo si haces cambios grandes en el futuro
const CACHE_NAME = 'ENDP.1.0.7';

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
'/tracks/ABEDULARDEMURIELVIEJO.kml',
'/tracks/BCAMINODELOSLLANOS.kml',
'/tracks/BCANONDELRIOLOBOS.kml',
'/tracks/BCASTROVIEJO.kml',
'/tracks/BEMBALSEDELACUERDADELPOZO.kml',
'/tracks/BLAFUENTONA.kml',
'/tracks/BLAMUEDRA.kml',
'/tracks/BPINARGRANDE.kml',
'/tracks/BREFUGIODEPESCADORES.kml',
'/tracks/BSUBIDAALURBION.kml',
'/tracks/CALATANAZORYSABINAR.kml',
'/tracks/CANONDELRIOLOBOSYMIRADORDELAGALIANA.kml',
'/tracks/CASCADADELACHORLA.kml',
'/tracks/CASCADADELAMINADELMEDICO.kml',
'/tracks/CASCASADEFUENTETOBA.kml',
'/tracks/CASTROVIEJO.kml',
'/tracks/COVARNANTES.kml',
'/tracks/CUEVASERENA.kml',
'/tracks/DESFILADERODELAYECLA.kml',
'/tracks/ELCHORRON.kml',
'/tracks/EMBALSEDELACUERDADELPOZOYPLAYAPITA.kml',
'/tracks/ERMITADESANBAUDELIO.kml',
'/tracks/FUENTESANZA.kml',
'/tracks/HABUELOSDELBOSQUE.kml',
'/tracks/HALTOLOSBARRANCOS.kml',
'/tracks/HANILLOVERDE.kml',
'/tracks/HAYEDODECOVALEDA.kml',
'/tracks/HBRABOJO.kml',
'/tracks/HCASCADASDECOVALEDA.kml',
'/tracks/HLAGUNASDEURBION.kml',
'/tracks/HLAMORRADELFRAILE.kml',
'/tracks/HLOSLLANOS.kml',
'/tracks/HMOJONPARDO.kml',
'/tracks/HOTEROMAYOR.kml',
'/tracks/HVALDELAHIERBA.kml',
'/tracks/LAFUENTONA.kml',
'/tracks/LAGUNANEGRA.kml',
'/tracks/LAGUNASDENEILA.kml',
'/tracks/LAGUNAVERDE.kml',
'/tracks/LAMUEDRA.kml',
'/tracks/LASCALDERASDELRIOPALAZUELO.kml',
'/tracks/MIRADORDECABEZAALTA.kml',
'/tracks/MIRADORDELAGUNANEGRAYLAGUNAHELADA.kml',
'/tracks/MIRADORDEPENAGORDA.kml',
'/tracks/NECROPOLISDELALTOARLANZA.kml',
'/tracks/PICODEURBIONYNACIMIENTODELDUERO.kml',
'/tracks/POBLADODELACERCA.kml',
'/tracks/PUNTODENIEVESANTAINES.kml',
'/tracks/RASODELANAVA.kml',
'/tracks/REFUGIODEPESCADORES.kml',
'/tracks/SANTODOMINGODESILOS.kml',
'/videos/Radar.mp4',
'/videos/TND05.mp4',
'/videos/TND10.mp4',
'/videos/TND15.mp4',
'/videos/TND20.mp4',
'/videos/TND25.mp4',
'/videos/TND30.mp4',
'/videos/TND35.mp4',
'/videos/TND40.mp4',
'/videos/TND45.mp4',
'/videos/TND50.mp4',
'/videos/Troll.mp4',
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

// --- FUNCIÓN PARA MANEJAR VIDEOS (SOPORTE DE RANGOS) ---
async function handleRangeRequest(request, response) {
    const rangeHeader = request.headers.get('Range');
    if (!rangeHeader) return response;

    const arrayBuffer = await response.arrayBuffer();
    const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : arrayBuffer.byteLength - 1;

    const slicedBuffer = arrayBuffer.slice(start, end + 1);
    return new Response(slicedBuffer, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            ...Object.fromEntries(response.headers),
            'Content-Range': `bytes ${start}-${end}/${arrayBuffer.byteLength}`,
            'Content-Length': slicedBuffer.byteLength,
        },
    });
}

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log("🚀 Descargando assets en paralelo...");
            // Usamos Promise.all para que descargue todo a la vez, no uno por uno
            const promises = assets.map(url => 
                fetch(url).then(res => {
                    if (res.ok) return cache.put(url, res);
                    console.error("Fallo en:", url);
                }).catch(err => console.error("Error red:", url))
            );
            await Promise.all(promises);
            enviarMensaje("📲 App lista para usar offline");
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(keys => {
                return Promise.all(
                    keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
                );
            })
        ])
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. GOOGLE SHEETS (Network First)
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

    // 2. VÍDEOS CON RANGOS
    if (url.pathname.endsWith('.mp4')) {
        event.respondWith(
            caches.match(request).then(res => {
                if (res) return handleRangeRequest(request, res);
                return fetch(request);
            })
        );
        return;
    }

    // 3. RESTO (Cache First)
    event.respondWith(
        caches.match(request).then(res => res || fetch(request))
    );
});



