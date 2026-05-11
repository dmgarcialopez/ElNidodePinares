const URLS = {
    pois: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQhcyPAmVSPAxciRkNPergJLMSIwcTWSZiQKNkWcJDmzjvGp1xK8v9Ho2MNOWL8P6meG5GWr9JGueme/pub?gid=0&output=csv',
    bici: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRAqPw_lnSBWloX_sMUUBgUIouLYnQVDtkK5BZrEPUyp4KuAceto_9CJYHFjDYJSNkYLOksqsiz7mB-/pub?gid=0&output=csv',
    paseo: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSxOG367O04AVZmVsikJkcsU0cho0R1RAkDdcvxrLZ1XRiq-wXTl0RN8aEzaRfS57ZHUJn-OB4r_TDa/pub?gid=0&output=csv'
};

let db = { pois: [], bici: [], paseo: [] };
let map = null;

window.onload = async () => {
    window.history.replaceState({ screen: 'home' }, '');
    for (let key in URLS) {
        Papa.parse(URLS[key], {
            download: true, header: false, skipEmptyLines: true,
            complete: (results) => { db[key] = results.data.slice(1); }
        });
    }
};

window.onpopstate = function(event) {
    if (event.state && event.state.screen === 'home') {
        document.getElementById('view-screen').classList.add('hidden');
        document.getElementById('home-screen').classList.remove('hidden');
    }
};

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
        const blogUrl = f[1];
        const lat = parseFloat(f[4]); 
        const lng = parseFloat(f[5]);
        const videoUrlOriginal = f[8]; // Columna I

        if (!isNaN(lat) && !isNaN(lng)) {
            // Lógica para limpiar la URL de YouTube y que se vea "limpia"
            let videoUrlFinal = videoUrlOriginal;
            if (videoUrlOriginal && videoUrlOriginal.includes('youtube.com/watch?v=')) {
                const videoId = videoUrlOriginal.split('v=')[1].split('&')[0];
                videoUrlFinal = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
            } else if (videoUrlOriginal && videoUrlOriginal.includes('youtu.be/')) {
                const videoId = videoUrlOriginal.split('youtu.be/')[1].split('?')[0];
                videoUrlFinal = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
            }

            const popup = `
                <div style="text-align:center; color:#333; min-width:160px; padding:2px;">
                    <a href="${blogUrl}" target="_blank" style="text-decoration:underline; color:#1b5e20; font-size:15px; font-weight:bold; display:block; margin-bottom:8px;">${nombre}</a>
                    
                    <div style="display:flex; justify-content:center; gap:10px;">
                        <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}', '_blank')" 
                                style="background:none; border:none; cursor:pointer; width:38px; padding:0;">
                            <img src="icons/coche.png" style="width:100%;" alt="Coche">
                        </button>

                        ${blogUrl ? `
                        <button onclick="shareContent('${nombre}', '${blogUrl}')" 
                                style="background:none; border:none; cursor:pointer; width:38px; padding:0;">
                            <img src="icons/compartir.png" style="width:100%;" alt="Compartir">
                        </button>` : ''}

                        ${videoUrlOriginal && videoUrlOriginal.trim() !== "" ? `
                        <button onclick="window.open('${videoUrlFinal}', '_blank')" 
                                style="background:none; border:none; cursor:pointer; width:38px; padding:0;">
                            <img src="icons/video.png" style="width:100%;" alt="Vídeo">
                        </button>` : ''}
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
        const url = f[colUrl];
        const trackFile = f[colTrack];
        const lat = f[colLat];
        const lng = f[colLng];

        // Construcción de botones condicionales
        let btnCoche = (lat && lng) ? `
            <button class="btn-accion" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}', '_blank')">
                <img src="icons/coche.png">
            </button>` : '';

        return `
            <div class="lista-item">
                <div class="lista-acciones-left">
                    ${btnCoche}
                    <button class="btn-accion" onclick="shareTrack('${trackFile}', '${nombre}')">
                        <img src="icons/ruta.png">
                    </button>
                    <button class="btn-accion" onclick="shareContent('${nombre}', '${url}')">
                        <img src="icons/compartir.png">
                    </button>
                </div>
                <div class="lista-info" onclick="window.open('${url}', '_blank')">
                    <span class="nombre-ruta">${nombre}</span>
                </div>
            </div>
        `;
    }).join('');
    list.innerHTML = html;
}

async function shareTrack(fileName, rutaNombre) {
    const clean = fileName ? fileName.trim() : "";
    if (!clean) return;
    
    // URL cruda (raw) del archivo en GitHub
    const fileUrl = `tracks/${clean}`;

    try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error("Archivo no encontrado");
        const blob = await response.blob();

        // PASO 1: Intentar compartir el ARCHIVO REAL (Para que aparezca GPX Viewer)
        // Usamos el MIME type genérico que menos problemas da
        const file = new File([blob], clean, { type: 'application/octet-stream' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: rutaNombre
            });
        } else {
            // PASO 2: Si el navegador bloquea el compartido, FORZAMOS la descarga
            // Al descargarse, el móvil notificará "Archivo descargado"
            // Cuando el usuario pulse esa notificación, SÍ aparecerán solo las apps de mapas
            lanzarDescarga(blob, clean);
        }
    } catch (e) {
        // Si todo falla, intentamos la descarga directa por enlace
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = clean;
        a.click();
    }
}

function lanzarDescarga(blob, name) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}

// Función auxiliar para descargar
function ejecutarDescarga(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.target = '_blank'; // Ayuda en algunos navegadores móviles
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function shareContent(titulo, url) {
    if (navigator.share) {
        try { await navigator.share({ title: titulo, url: url }); } catch (e) {}
    } else { alert("Enlace: " + url); }
}

function startVoiceSearch() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return;
    const rec = new Speech();
    const status = document.getElementById('mic-status');
    rec.onstart = () => status.innerText = "Escuchando...";
    rec.onresult = (e) => {
        const text = e.results[0][0].transcript.toLowerCase();
        status.innerText = 'Buscando: ' + text;
        ejecutarBusqueda(text);
    };
    rec.onend = () => setTimeout(() => status.innerText = "", 2000);
    rec.start();
}

function ejecutarBusqueda(query) {
    for (let key in db) {
        let item = db[key].find(f => f.some(c => c && c.toLowerCase().includes(query)));
        if (item) {
            if (key === 'pois') showMap(key);
            else showList(key, 0, 4, 5, 6, 7); // Ajusta índices por defecto si es necesario
            return;
        }
    }
}