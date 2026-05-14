// 1. Nombre de la memoria (Caché) - Cámbialo si haces cambios grandes en el futuro
const CACHE_NAME = 'elnido-pinares-v2';

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
'/js/map-service.js', 
'/tracks/ABEDULARDEMURIELVIEJO.kml',
'/tracks/BCAMINODELOSLLANOS.kml',
'/tracks/BCAÑONDELRIOLOBOS.kml',
'/tracks/BCASTROVIEJO.kml',
'/tracks/BEMBALSEDELACUERDADELPOZO.kml',
'/tracks/BLAFUENTONA.kml',
'/tracks/BLAMUEDRA.kml',
'/tracks/BPINARGRANDE.kml',
'/tracks/BREFUGIODEPESCADORES.kml',
'/tracks/BSUBIDAALURBION.kml',
'/tracks/CALATAÑAZORYSABINARDECALATAÑAZOR.kml',
'/tracks/CAÑONDELRIOLOBOSYMIRADORDELAGALIANA.kml',
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
'/tracks/MIRADORDEPEÑAGORDA.kml',
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

// EVENTO DE INSTALACIÓN
self.addEventListener('install', event => {
  // Fuerza a este SW a convertirse en el SW activo
  self.skipWaiting(); 
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cacheando archivos de El Nido v2...');
      return cache.addAll(assets);
    })
  );
});

// EVENTO DE ACTIVACIÓN
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Toma el control de todas las pestañas inmediatamente
      self.clients.claim(), 
      // Borra las cachés viejas (v1, etc.)
      caches.keys().then(keys => {
        return Promise.all(
          keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        );
      })
    ])
  );
});

// EVENTO FETCH (Mantén tu lógica de Google Sheets que es correcta)
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.hostname.includes('docs.google.com') || url.hostname.includes('spreadsheets.google.com')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(response => response || fetch(request))
  );
});


