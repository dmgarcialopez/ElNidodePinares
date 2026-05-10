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
            download: true,
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                db[key] = results.data.slice(1);
            }
        });
    }
};

function showMap(tipo) {
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('view-screen').classList.remove('hidden');
    document.getElementById('list-container').classList.add('hidden');
    document.getElementById('map-container').classList.remove('hidden');

    if (map) map.remove();
    
    map = L.map('map-container').setView([41.838, -3.004], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    db[tipo].forEach(fila => {
        let lat, lng, latCoche, lngCoche;

        if (tipo === 'pois') { 
            lat = parseNum(fila[4]); 
            lng = parseNum(fila[5]);
            latCoche = lat; lngCoche = lng;
        } else if (tipo === 'paseo') {
            lat = parseNum(fila[2]); 
            lng = parseNum(fila[3]);
            latCoche = parseNum(fila[4]);
            lngCoche = parseNum(fila[5]);
        }

        if (lat && lng) {
            const m = L.marker([lat, lng]).addTo(map);
            const container = document.createElement('div');
            container.style.textAlign = "center";
            container.style.minWidth = "165px";

            const urlBlog = String(fila[1] || "").trim();
            const urlVideo = String(fila[8] || "").trim();

            const title = document.createElement('div');
            title.innerHTML = `<b style="color:#2e7d32; font-size:16px; display:block; margin-bottom:12px; cursor:pointer; text-decoration:underline;">${fila[0]}</b>`;
            title.onclick = () => { if(urlBlog.startsWith('http')) window.location.href = urlBlog; };
            container.appendChild(title);

            const actions = document.createElement('div');
            actions.style.display = "flex";
            actions.style.justifyContent = "center";
            actions.style.gap = "15px";

            const botones = [
                { 
                    img: 'coche.png', 
                    show: (latCoche && lngCoche), 
                    fn: () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${latCoche},${lngCoche}`, '_blank') 
                },
                { 
                    img: 'compartir.png', 
                    show: urlBlog.startsWith('http'), 
                    fn: () => shareContent(fila[0], urlBlog)
                },
                { 
                    img: 'video.png', 
                    show: urlVideo.startsWith('http'), 
                    fn: () => window.open(urlVideo, '_blank') 
                }
            ];

            botones.forEach(b => {
                if (b.show) {
                    const icon = document.createElement('img');
                    icon.src = `icons/${b.img}`;
                    icon.style.width = "32px"; icon.style.height = "32px"; icon.style.cursor = "pointer";
                    icon.onclick = (e) => { e.stopPropagation(); b.fn(); };
                    actions.appendChild(icon);
                }
            });

            container.appendChild(actions);
            m.bindPopup(container);
        }
    });
}

// Función genérica para compartir (ahora se usa en mapa y en lista)
async function shareContent(titulo, url) {
    if (navigator.share) {
        try {
            await navigator.share({ title: titulo, url: url });
        } catch (err) { console.log("Compartir cancelado"); }
    } else {
        const dummy = document.createElement('input');
        document.body.appendChild(dummy);
        dummy.value = url; dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);
        alert("Enlace copiado al portapapeles");
    }
}

function showBiciList() {
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('view-screen').classList.remove('hidden');
    document.getElementById('map-container').classList.add('hidden');
    const list = document.getElementById('list-container');
    list.classList.remove('hidden');
    
    list.innerHTML = `<h2 style="color:white; text-align:center; margin-bottom:20px;">Rutas BTT</h2>`;
    
    db.bici.forEach(fila => {
        const div = document.createElement('div');
        div.className = 'lista-item';
        // Ajuste de estilo para que el icono y el texto convivan
        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.justifyContent = "flex-start";
        div.style.padding = "10px 15px";

        const urlRuta = String(fila[5] || "").trim(); // Columna 6 (Índice 5)

        // 1. Icono de compartir
        const shareBtn = document.createElement('img');
        shareBtn.src = 'icons/compartir.png';
        shareBtn.style.width = "28px";
        shareBtn.style.marginRight = "15px";
        shareBtn.style.cursor = "pointer";
        shareBtn.onclick = (e) => {
            e.stopPropagation(); // Evita que al pulsar compartir se abra la ruta
            if(urlRuta.startsWith('http')) shareContent(fila[0], urlRuta);
        };

        // 2. Nombre de la ruta
        const nameSpan = document.createElement('span');
        nameSpan.style.flexGrow = "1";
        nameSpan.style.textAlign = "left";
        nameSpan.innerHTML = fila[0];

        div.appendChild(shareBtn);
        div.appendChild(nameSpan);
        
        div.onclick = () => {
            if (urlRuta.startsWith('http')) {
                window.open(urlRuta, '_blank');
            } else {
                alert("Ruta no disponible actualmente");
            }
        };
        
        list.appendChild(div);
    });
}

function goHome() {
    document.getElementById('view-screen').classList.add('hidden');
    document.getElementById('home-screen').classList.remove('hidden');
}

function parseNum(v) {
    if(!v) return null;
    let n = parseFloat(String(v).replace(',', '.').trim());
    return isNaN(n) ? null : n;
}