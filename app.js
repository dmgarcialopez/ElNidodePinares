const URLS = {
    pois: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQhcyPAmVSPAxciRkNPergJLMSIwcTWSZiQKNkWcJDmzjvGp1xK8v9Ho2MNOWL8P6meG5GWr9JGueme/pub?gid=0&output=csv',
    bici: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRAqPw_lnSBWloX_sMUUBgUIouLYnQVDtkK5BZrEPUyp4KuAceto_9CJYHFjDYJSNkYLOksqsiz7mB-/pub?gid=0&output=csv',
    paseo: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSxOG367O04AVZmVsikJkcsU0cho0R1RAkDdcvxrLZ1XRiq-wXTl0RN8aEzaRfS57ZHUJn-OB4r_TDa/pub?gid=0&output=csv'
};

let db = { pois: [], bici: [], paseo: [] };
let map = null;

window.onload = async () => {
    for (let key in URLS) {
        Papa.parse(URLS[key], {
            download: true, header: false, skipEmptyLines: true,
            complete: (results) => { db[key] = results.data.slice(1); }
        });
    }
};

window.onpopstate = function() { goHome(); };

// --- NAVEGACIÓN ---
function showMap(tipo) {
    history.pushState({ screen: 'view' }, '');
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('view-screen').classList.remove('hidden');
    document.getElementById('list-container').classList.add('hidden');
    document.getElementById('map-container').classList.remove('hidden');

    if (map) map.remove();
    map = L.map('map-container');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    let markerCoords = [];
    db[tipo].forEach(fila => {
        let lat, lng, latCoche, lngCoche, urlPrincipal;
        if (tipo === 'pois') { 
            lat = parseNum(fila[4]); lng = parseNum(fila[5]);
            latCoche = lat; lngCoche = lng;
            urlPrincipal = String(fila[1] || "").trim();
        } else if (tipo === 'paseo') {
            lat = parseNum(fila[2]); lng = parseNum(fila[3]);
            latCoche = parseNum(fila[4]); lngCoche = parseNum(fila[5]);
            urlPrincipal = String(fila[7] || "").trim(); 
        }

        if (lat && lng) {
            const m = L.marker([lat, lng]).addTo(map);
            markerCoords.push([lat, lng]);
            const container = document.createElement('div');
            container.style.textAlign = "center";
            const urlVideo = String(fila[8] || "").trim();
            const title = document.createElement('div');
            title.innerHTML = `<b style="color:#2e7d32; font-size:16px; display:block; margin-bottom:12px; cursor:pointer; text-decoration:underline;">${fila[0]}</b>`;
            title.onclick = () => { if(urlPrincipal.startsWith('http')) window.open(urlPrincipal, '_blank'); };
            container.appendChild(title);
            const actions = document.createElement('div');
            actions.style.display = "flex"; actions.style.justifyContent = "center"; actions.style.gap = "15px";
            const botones = [
                { img: 'coche.png', show: (latCoche && lngCoche), fn: () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${latCoche},${lngCoche}&travelmode=driving`, '_blank') },
                { img: 'compartir.png', show: urlPrincipal.startsWith('http'), fn: () => shareContent(fila[0], urlPrincipal) },
                { img: 'video.png', show: urlVideo.startsWith('http'), fn: () => window.open(urlVideo, '_blank') }
            ];
            botones.forEach(b => {
                if (b.show) {
                    const icon = document.createElement('img');
                    icon.src = `icons/${b.img}`;
                    icon.style.width = "32px"; icon.style.cursor = "pointer";
                    icon.onclick = (e) => { e.stopPropagation(); b.fn(); };
                    actions.appendChild(icon);
                }
            });
            container.appendChild(actions);
            m.bindPopup(container);
        }
    });
    if (markerCoords.length > 0) map.fitBounds(markerCoords, { padding: [50, 50] });
}

function showBiciList() {
    history.pushState({ screen: 'view' }, '');
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('view-screen').classList.remove('hidden');
    document.getElementById('map-container').classList.add('hidden');
    const list = document.getElementById('list-container');
    list.classList.remove('hidden');
    list.innerHTML = `<h2 style="color:white; text-align:center; margin-bottom:20px;">Rutas BTT</h2>`;
    db.bici.forEach(fila => {
        const div = document.createElement('div');
        div.className = 'lista-item';
        div.style.display = "flex"; div.style.alignItems = "center"; div.style.padding = "10px 15px";
        const urlRuta = String(fila[5] || "").trim();
        const shareBtn = document.createElement('img');
        shareBtn.src = 'icons/compartir.png';
        shareBtn.style.width = "28px"; shareBtn.style.marginRight = "15px";
        shareBtn.onclick = (e) => { e.stopPropagation(); if(urlRuta.startsWith('http')) shareContent(fila[0], urlRuta); };
        const nameSpan = document.createElement('span');
        nameSpan.style.flexGrow = "1"; nameSpan.innerHTML = fila[0];
        div.appendChild(shareBtn); div.appendChild(nameSpan);
        div.onclick = () => { if(urlRuta.startsWith('http')) window.open(urlRuta, '_blank'); };
        list.appendChild(div);
    });
}

// --- LÓGICA DE VOZ ---
function startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    const status = document.getElementById('mic-status');
    recognition.onstart = () => { status.innerText = "Escuchando..."; };
    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript.toLowerCase();
        status.innerText = 'Buscando: "' + text + '"';
        processSearch(text);
    };
    recognition.onerror = () => { status.innerText = ""; };
    recognition.start();
}

function processSearch(query) {
    let found = null;
    const q = query.toLowerCase().trim();

    // Regla 1: Si dice "bici", busca en sheet Bici, columna 2 (índice 1)
    if (q.includes("bici")) {
        const searchTerm = q.replace("bici", "").trim();
        db.bici.forEach(fila => {
            if (String(fila[1]).toLowerCase().includes(searchTerm)) {
                const urlRuta = String(fila[5] || "").trim();
                if(urlRuta.startsWith('http')) window.open(urlRuta, '_blank');
                found = true;
            }
        });
    } 
    // Regla 2: Si dice "paseo", busca en sheet Paseo, columna 7 (índice 6)
    else if (q.includes("paseo")) {
        const searchTerm = q.replace("paseo", "").trim();
        db.paseo.forEach(fila => {
            if (String(fila[6]).toLowerCase().includes(searchTerm)) {
                found = { f: fila, tipo: 'paseo' };
            }
        });
    } 
    // Regla 3: En cualquier otro caso, busca en sheet POIs, columna 10 (índice 9)
    else {
        db.pois.forEach(fila => {
            if (String(fila[9]).toLowerCase().includes(q)) {
                found = { f: fila, tipo: 'pois' };
            }
        });
    }

    if (found && found !== true) {
        showMap(found.tipo);
        setTimeout(() => {
            let lat, lng;
            if (found.tipo === 'pois') { lat = parseNum(found.f[4]); lng = parseNum(found.f[5]); }
            else { lat = parseNum(found.f[2]); lng = parseNum(found.f[3]); }
            if (lat && lng) {
                map.setView([lat, lng], 18);
                map.eachLayer(layer => {
                    if (layer instanceof L.Marker && layer.getLatLng().lat === lat) layer.openPopup();
                });
            }
        }, 600);
    } else if (!found) {
        document.getElementById('mic-status').innerText = "Sin resultados";
        setTimeout(() => { document.getElementById('mic-status').innerText = ""; }, 3000);
    }
}

function goHome() {
    document.getElementById('view-screen').classList.add('hidden');
    document.getElementById('home-screen').classList.remove('hidden');
    if(document.getElementById('mic-status')) document.getElementById('mic-status').innerText = "";
}

async function shareContent(titulo, url) {
    if (navigator.share) {
        try { await navigator.share({ title: titulo, text: 'Ruta: ' + titulo, url: url }); } catch (e) {}
    } else { alert("Enlace: " + url); }
}

function parseNum(v) {
    if(!v) return null;
    let n = parseFloat(String(v).replace(',', '.').trim());
    return isNaN(n) ? null : n;
}