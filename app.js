// --- 1. CONFIGURACIÓN Y BASES DE DATOS ---
const URLS = {
    pois: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQhcyPAmVSPAxciRkNPergJLMSIwcTWSZiQKNkWcJDmzjvGp1xK8v9Ho2MNOWL8P6meG5GWr9JGueme/pub?gid=0&output=csv',
    bici: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRAqPw_lnSBWloX_sMUUBgUIouLYnQVDtkK5BZrEPUyp4KuAceto_9CJYHFjDYJSNkYLOksqsiz7mB-/pub?gid=0&output=csv',
    paseo: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSxOG367O04AVZmVsikJkcsU0cho0R1RAkDdcvxrLZ1XRiq-wXTl0RN8aEzaRfS57ZHUJn-OB4r_TDa/pub?gid=0&output=csv'
};
const URL_DUENDES = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTwHHhTmV0CvkquPjDRyco_59SNSnIWgBsHVtpjfJsonJU47XvREHMBjLxIeHU7-dbdEkFGYE8_MwKp/pub?output=csv";

let db = { pois: [], bici: [], paseo: [] };
let duendes = [];
let duendesCapturados = JSON.parse(localStorage.getItem('duendesCapturados')) || [];
let map = null;      // Mapa para POIs y Rutas
let gameMap = null;  // Mapa para el Juego
let userCoords = null; // <--- AÑADE ESTA LÍNEA

// --- CONFIGURACIÓN JUEGO (TIMER Y OPTIMIZACIÓN) ---
const CAPTURE_RANGE = 40; // 100km para test
const GAME_TICK_MS = 10000;   // Timer programable (10 segundos)
let gameTimer = null;         // Guardará el setInterval
let currentClosestIdx = -1;   // Índice del duende actual para optimización
let lastDistance = Infinity;  // Distancia anterior para comparar si nos acercamos

// --- HELPER: GESTIÓN DE UTM PARA DOMINIO PROPIO ---
function formatPwaUrl(url) {
    if (!url || !url.includes("elnidodepinares.es")) return url;

    // Si ya tiene el UTM de la APP antigua, lo sustituimos
    if (url.includes("utm_source=APP")) {
        return url.replace("utm_source=APP", "utm_source=PWA");
    }
    
    // Si no tiene fuente, la añadimos respetando parámetros existentes
    if (!url.includes("utm_source=")) {
        const separator = url.includes("?") ? "&" : "/?";
        return url + separator + "utm_source=PWA";
    }
    
    return url;
}

// --- 2. CARGA INICIAL ---
window.onload = async () => {
    window.history.replaceState({ screen: 'home' }, '');
    
    for (let key in URLS) {
        Papa.parse(URLS[key], {
            download: true, header: false, skipEmptyLines: true,
            complete: (results) => { db[key] = results.data.slice(1); }
        });
    }

    Papa.parse(URL_DUENDES, {
        download: true, header: false, skipEmptyLines: true,
        complete: (results) => { 
            let duendesDelSheet = results.data.slice(1);
            // Solo cargamos los que NO están capturados
            duendes = duendesDelSheet.filter(d => 
                !duendesCapturados.some(c => c[0] === d[0])
            );
        }
    });
};

// --- 3. NAVEGACIÓN (CONTROL DEL BOTÓN ATRÁS) ---
window.onpopstate = function(event) {
    // 1. Ocultamos todas las pantallas de golpe
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));

    // 2. Comprobamos a qué estado estamos volviendo
    if (event.state && event.state.screen === 'album') {
        // Caso A: Volvemos al Álbum (poco común, pero posible)
        document.getElementById('album-screen').classList.remove('hidden');
    } 
    else if (event.state && event.state.screen === 'juego') {
        // Caso B: Volvemos al Juego desde el Álbum
        document.getElementById('game-screen').classList.remove('hidden');
        
        // Reiniciamos el bucle del GPS si estaba parado
        if (userCoords) {
            requestLocation();
        }
    } 
    else {
        // Caso C: No hay estado o volvemos al Home
        document.getElementById('home-screen').classList.remove('hidden');
        
        // IMPORTANTE: Detener el GPS para ahorrar batería al salir del juego
        if (gameTimer) { 
            clearTimeout(gameTimer); 
            gameTimer = null; 
        }
    }
};

// --- 4. FUNCIONALIDAD DE POIS Y RUTAS ---

function showMap(tipo) {
    window.history.pushState({ screen: 'mapa' }, '');
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('view-screen').classList.remove('hidden');
    document.getElementById('map-container').classList.remove('hidden');
    document.getElementById('list-container').classList.add('hidden');

    const centro = [41.854035, -2.933603];
    if (!map) {
        map = L.map('map-container').setView(centro, 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    } else {
        map.setView(centro, 11);
        map.eachLayer(layer => { if (layer instanceof L.Marker) map.removeLayer(layer); });
    }

    db[tipo].forEach((f) => {
        const nombre = f[0];
        const blogUrl = formatPwaUrl(f[1]); // <--- APLICADO UTM
        const lat = parseFloat(f[4]), lng = parseFloat(f[5]), videoUrlOriginal = f[8];
        
        if (!isNaN(lat) && !isNaN(lng)) {
            let videoUrlFinal = videoUrlOriginal;
            if (videoUrlOriginal && videoUrlOriginal.includes('v=')) {
                const videoId = videoUrlOriginal.split('v=')[1].split('&')[0];
                videoUrlFinal = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
            }
            const popup = `<div style="text-align:center; min-width:160px;">
                <a href="${blogUrl}" target="_blank" style="font-weight:bold; color:#1b5e20;">${nombre}</a>
                <div style="display:flex; justify-content:center; gap:10px; margin-top:8px;">
                    <button onclick="window.open('https://www.google.com/maps?q=${lat},${lng}', '_blank')" style="background:none; border:none; width:35px;"><img src="icons/coche.png" style="width:100%;"></button>
                    ${blogUrl ? `<button onclick="shareContent('${nombre}', '${blogUrl}')" style="background:none; border:none; width:35px;"><img src="icons/compartir.png" style="width:100%;"></button>` : ''}
                    ${videoUrlOriginal ? `<button onclick="window.open('${videoUrlFinal}', '_blank')" style="background:none; border:none; width:35px;"><img src="icons/video.png" style="width:100%;"></button>` : ''}
                </div>
            </div>`;
            L.marker([lat, lng]).addTo(map).bindPopup(popup);
        }
    });
}

function showList(tipo, colNombre, colUrl, colTrack, colLat, colLng) {
    if (!db[tipo] || db[tipo].length === 0) return;
    window.history.pushState({ screen: 'lista' }, '');
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('view-screen').classList.remove('hidden');
    document.getElementById('map-container').classList.add('hidden');
    const list = document.getElementById('list-container');
    list.classList.remove('hidden');

    const titulo = tipo === 'bici' ? 'Rutas en Bici' : 'Rutas de Paseo';
    let html = `<h2 class="lista-titulo">${titulo}</h2>`;
    html += db[tipo].map(f => {
        const nombre = f[colNombre];
        const url = formatPwaUrl(f[colUrl]); // <--- APLICADO UTM
        const track = f[colTrack], lat = f[colLat], lng = f[colLng];
        return `<div class="lista-item">
            <div class="lista-acciones-left">
                ${(lat && lng) ? `<button class="btn-accion" onclick="window.open('https://www.google.com/maps?q=${lat},${lng}', '_blank')"><img src="icons/coche.png"></button>` : ''}
                <button class="btn-accion" onclick="shareTrack('${track}', '${nombre}')"><img src="icons/ruta.png"></button>
                <button class="btn-accion" onclick="shareContent('${nombre}', '${url}')"><img src="icons/compartir.png"></button>
            </div>
            <div class="lista-info" onclick="window.open('${url}', '_blank')"><span>${nombre}</span></div>
        </div>`;
    }).join('');
    list.innerHTML = html;
}

// [Mantenemos shareTrack, shareContent y getDistance igual...]

// --- 5. LÓGICA DEL JUEGO ---

function showGame() {
    window.history.pushState({ screen: 'juego' }, '');
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    if (!gameMap) {
        gameMap = L.map('game-map', { zoomControl: false }).setView([41.84253, -3.003343], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(gameMap);
    }
    setTimeout(() => { gameMap.invalidateSize(); }, 400);

    // IMPORTANTE: Limpiamos cualquier timer previo y lanzamos la primera búsqueda
    if (gameTimer) clearTimeout(gameTimer);
    requestLocation(); 
}

function requestLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(updateGameStatus, null, { enableHighAccuracy: true });
    }
}

function updateGameStatus(pos) {
    const uLat = pos.coords.latitude;
    const uLng = pos.coords.longitude;
    
    // GUARDAMOS LA POSICIÓN GLOBAL
    userCoords = { lat: uLat, lng: uLng }; 

    let searchNeeded = true;

    if (currentClosestIdx !== -1 && duendes[currentClosestIdx]) {
        const d = duendes[currentClosestIdx];
        const dLat = parseFloat(String(d[1]).replace(',', '.'));
        const dLng = parseFloat(String(d[2]).replace(',', '.'));
        const newDist = getDistance(uLat, uLng, dLat, dLng);
        if (newDist <= lastDistance) {
            lastDistance = newDist;
            searchNeeded = false;
        }
    }

    if (searchNeeded) {
        let closestDist = Infinity;
        let closestIdx = -1;
        duendes.forEach((d, i) => {
            const dLat = parseFloat(String(d[1]).replace(',', '.'));
            const dLng = parseFloat(String(d[2]).replace(',', '.'));
            if (!isNaN(dLat)) {
                const dist = getDistance(uLat, uLng, dLat, dLng);
                if (dist < closestDist) { closestDist = dist; closestIdx = i; }
            }
        });
        currentClosestIdx = closestIdx;
        lastDistance = closestDist;
    }

    const closestDuende = duendes[currentClosestIdx];

    if (gameMap) {
        gameMap.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.CircleMarker) gameMap.removeLayer(l); });
    }
    L.circleMarker([uLat, uLng], { color: '#2196F3', radius: 8, fillOpacity: 1 }).addTo(gameMap);

    // --- DIBUJAR DUENDES EN EL MAPA CON ETIQUETAS ---
    duendes.forEach((d, i) => {
        const dLat = parseFloat(String(d[1]).replace(',', '.'));
        const dLng = parseFloat(String(d[2]).replace(',', '.'));
        
        if (!isNaN(dLat)) {
            const nombre = d[0];
            const puntos = d[3] || "0";
            const urlDuende = formatPwaUrl(d[6] || "#"); // Usamos la columna 6 para la URL
            
            // Creamos el contenido de la etiqueta al estilo POI
            const popupContent = `
                <div style="text-align:center; min-width:120px;">
                    <a href="${urlDuende}" target="_blank" style="font-weight:bold; color:#1b5e20; text-decoration:none;">
                        ${nombre} - ${puntos}P
                    </a>
                </div>`;

            if (i === currentClosestIdx) {
                const redIcon = new L.Icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    iconSize: [25, 41], 
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34]
                });
                L.marker([dLat, dLng], {icon: redIcon}).addTo(gameMap).bindPopup(popupContent);
            } else {
                L.marker([dLat, dLng]).addTo(gameMap).bindPopup(popupContent);
            }
        }
    });

    const info = document.getElementById('closest-info');
    const name = document.getElementById('duende-name');
    const video = document.getElementById('game-video');
    const container = document.getElementById('video-container');

    // --- LÓGICA DE TEXTOS Y VÍDEO ACTUALIZADA ---
    if (closestDuende) {
        // Mostramos SIEMPRE el nombre del duende más cercano
        name.innerText = closestDuende[0];

        if (lastDistance < CAPTURE_RANGE) {
            // ESTADO: EN RANGO DE CAPTURA
            info.innerText = "¡Duende a la Vista!";
            const tipo = closestDuende[4] ? closestDuende[4].trim() : "Radar";
            
            // Cambiamos al vídeo del duende específico
            if (!video.src.includes(tipo)) { 
                video.src = `videos/${tipo}.mp4`; 
                video.play().catch(()=>{}); 
            }
            // Activamos el click para capturar
            container.onclick = () => capturar(currentClosestIdx);
            
        } else {
            // ESTADO: BUSCANDO (Fuera de rango)
            info.innerText = `Duende a ${Math.round(lastDistance)}m`;
            
            // Mantenemos el vídeo del Radar
            if (!video.src.includes("Radar")) { 
                video.src = "videos/Radar.mp4"; 
                video.play().catch(()=>{}); 
            }
            // Desactivamos el click para que no capturen desde lejos
            container.onclick = null;
        }
    } else {
        // Caso extremo: No quedan duendes en el mundo
        info.innerText = "¡Todos liberados!";
        name.innerText = "Mira en el álbum";
    }
    gameMap.panTo([uLat, uLng]);

    // RE-PROGRAMAR EL TIMER (Recursivo)
    if (gameTimer) clearTimeout(gameTimer);
    gameTimer = setTimeout(requestLocation, GAME_TICK_MS); 
} // <--- Solo una llave aquí para cerrar la función

function capturar(idx) {
    if (idx === -1 || !duendes[idx]) return;
    const nombreCapturado = duendes[idx][0];
    alert("¡Has capturado a " + nombreCapturado + "!");
    duendesCapturados.push(duendes[idx]);
    duendes.splice(idx, 1);
    localStorage.setItem('duendesCapturados', JSON.stringify(duendesCapturados));
    currentClosestIdx = -1;
    lastDistance = Infinity;
    requestLocation();
}

// --- 6. ÁLBUM DE CAPTURAS ---

function showCapturedAlbum() {
    window.history.pushState({ screen: 'album' }, ''); // Registramos la entrada al álbum
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('album-screen').classList.remove('hidden');
    renderAlbumContent();
}

function renderAlbumContent() {
    const container = document.getElementById('album-content');
    let totalPuntos = 0;
    
    // 1. Cabecera con el video del álbum
    let html = `
        <div id="album-video-container" style="width: 220px; height: 220px; margin: 15px auto; border-radius: 20px; overflow: hidden; border: 3px solid white; position: relative; background: #000;">
            <video id="album-video" autoplay muted loop playsinline style="width: 100%; height: 100%; object-fit: fill;">
                <source src="videos/Troll.mp4" type="video/mp4">
            </video>
        </div>
        <div class="lista-container-album" style="padding: 10px;">
    `;

    // 2. Generar cada item de la lista usando las clases del CSS
    duendesCapturados.forEach((d, index) => {
        const nombre = d[0];
        const tipo = d[4] ? d[4].trim() : "Radar";
        const puntos = parseInt(d[3]) || 0;
        totalPuntos += puntos;
        
        const urlFinal = formatPwaUrl(d[6] || "#");

        html += `
            <div class="lista-item">
                <div class="lista-acciones-left">
                    <button class="btn-accion" onclick="confirmFreeSingle(${index})">
                        <img src="icons/FreeDuende.png">
                    </button>
                    <button class="btn-accion" onclick="changeAlbumVideo('${tipo}')">
                        <img src="icons/${tipo}.png">
                    </button>
                </div>
                <div class="lista-info" onclick="window.open('${urlFinal}', '_blank')">
                    <span>${nombre}</span>
                </div>
            </div>
        `;
    });

    // 3. Si no hay duendes
    if (duendesCapturados.length === 0) {
        html += `<p style="color:white; text-align:center; margin: 20px 0; font-weight: bold;">¡Aún no has capturado ningún duende!</p>`;
    }

    // 4. Marcador de puntos y botón de liberar todo
    html += `
        </div>
        <div style="text-align: center; margin: 20px 0; font-size: 1.6em; color: #ffeb3b; text-shadow: 2px 2px black; font-weight: bold;">
            Total Puntos: ${totalPuntos}
        </div>
        <div style="text-align: center; padding-bottom: 40px;">
            <button onclick="confirmFreeAll()" style="background:none; border:none; width:100px; cursor: pointer;">
                <img src="icons/FreeDuende.png" style="width:60px;">
                <div style="color:white; font-size: 12px; font-weight: bold; margin-top: 5px;">LIBERAR TODOS</div>
            </button>
        </div>
    `;

    container.innerHTML = html;
}
function changeAlbumVideo(tipo) {
    const video = document.getElementById('album-video');
    video.src = `videos/${tipo}.mp4`;
    video.play();
}

function confirmFreeSingle(index) {
    if (confirm("¿Quieres liberar a este duende para que vuelva al bosque?")) {
        // 1. Lo eliminamos del array de capturados
        duendesCapturados.splice(index, 1);
        
        // 2. Guardamos la lista actualizada en el móvil
        localStorage.setItem('duendesCapturados', JSON.stringify(duendesCapturados));
        
        // 3. ¡CLAVE! Recargamos la lista de duendes sueltos para que este reaparezca en el mapa
        refreshDuendesDisponibles();

        // 4. Verificamos si la lista se ha quedado vacía
        if (duendesCapturados.length === 0) {
            const iconCaptura = document.getElementById('current-duende-icon');
            if (iconCaptura) iconCaptura.src = "icons/CapDuende.png";
            
            alert("¡Has liberado a todos tus duendes! Volvemos al radar.");
            closeAlbumAndResume(); 
        } else {
            // Si aún quedan, solo refrescamos la lista visual del álbum
            renderAlbumContent();
        }
    }
}

function confirmFreeAll() {
    if (confirm("¿Estás seguro de que quieres liberar a todos los duendes capturados? Volverán a esconderse en el bosque.")) {
        
        // 1. Vaciamos los datos por completo
        duendesCapturados = [];
        localStorage.removeItem('duendesCapturados');
        
        // 2. ¡CLAVE! Recargamos la lista de duendes sueltos para que todos vuelvan al mapa
        refreshDuendesDisponibles();
        
        // 3. Actualizamos la interfaz
        renderAlbumContent();
        
        // 4. Reseteamos el icono de captura en la pantalla de juego
        const iconCaptura = document.getElementById('current-duende-icon');
        if (iconCaptura) {
            iconCaptura.src = "icons/CapDuende.png";
        }

        // 5. Volvemos automáticamente a la pantalla del juego
        closeAlbumAndResume();

        console.log("Todos los duendes liberados y regresando al radar...");
    }
}

function saveAndRefresh() {
    localStorage.setItem('duendesCapturados', JSON.stringify(duendesCapturados));
    renderAlbumContent();
}

// [Funciones shareTrack, shareContent, getDistance y startVoiceSearch se mantienen...]
function shareTrack(fileName, rutaNombre) {
    const clean = fileName ? fileName.trim() : "";
    if (!clean) return;
    const fileUrl = `tracks/${clean}`;
    fetch(fileUrl).then(r => r.blob()).then(blob => {
        const file = new File([blob], clean, { type: 'application/octet-stream' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: rutaNombre });
        } else {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = clean; a.click();
        }
    }).catch(e => window.open(fileUrl, '_blank'));
}

async function shareContent(titulo, url) {
    if (navigator.share) { try { await navigator.share({ title: titulo, url: url }); } catch (e) {} }
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function closeAlbumAndResume() {
    // En lugar de solo ocultar/mostrar, simulamos que el usuario dio atrás
    // Esto disparará el onpopstate y ejecutará la lógica de vuelta al juego
    if (window.history.state && window.history.state.screen === 'album') {
        window.history.back();
    } else {
        // Por si acaso se llama fuera de flujo
        document.getElementById('album-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        requestLocation();
    }
}

async function refreshDuendesDisponibles() {
    // Volvemos a pedir el CSV de duendes para tener la lista completa original
    Papa.parse(URL_DUENDES, {
        download: true, 
        header: false, 
        skipEmptyLines: true,
        complete: (results) => { 
            let duendesDelSheet = results.data.slice(1);
            // Filtramos: solo dejamos fuera los que ESTÉN en duendesCapturados
            duendes = duendesDelSheet.filter(d => 
                !duendesCapturados.some(c => c[0] === d[0])
            );
            
            // Una vez actualizada la lista, pedimos al radar que busque de nuevo
            requestLocation();
        }
    });
}

