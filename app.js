import * as UI from './ui-manager.js';
import * as Game from './game-engine.js';
import * as Data from './data-service.js';
import { state } from './state.js';
import * as Nav from './nav-engine.js';

if ('serviceWorker' in navigator) {
    // 1. Escuchar mensajes ANTES de registrar
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'TOAST') {
            const toast = document.getElementById('pwa-toast');
            if (toast) {
                toast.innerText = event.data.text;
                toast.style.display = 'block';
                setTimeout(() => { toast.style.display = 'none'; }, 5000);
            }
        }
    });

    // 2. Registro con ruta relativa pura
    // Al NO poner '/' delante, el navegador lo busca en la misma carpeta donde está el index.html
    navigator.serviceWorker.register('sw.js') 
        .then(reg => {
            console.log("✅ SW activo en el subdominio:", reg.scope);
        })
        .catch(err => {
            console.error("❌ Error en el registro:", err);
        });
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. LIMPIEZA DE HISTORIAL AL ARRANCAR
    // Esto sobreescribe cualquier "basura" de sesiones anteriores 
    // y dice: "Este es el punto de partida real".
    window.history.replaceState({ screen: 'home' }, "", "");
    
    // Forzamos visualmente la Home
    UI.showScreen('home');

    console.log("Centralita reseteada y en Home.");
    
    // 1. CARGA DE DATOS
    try {
        await Data.loadAllData();
    } catch (err) {
        console.error("Error cargando bases de datos:", err);
    }

    // 2. CONEXIÓN DEL MENÚ PRINCIPAL
    document.getElementById('btn-pois')?.addEventListener('click', () => { UI.showMap('pois'); });
    document.getElementById('btn-bici')?.addEventListener('click', () => { UI.renderBiciList(); });
    document.getElementById('btn-walk')?.addEventListener('click', () => { UI.renderPaseoList(); });
    document.getElementById('btn-game')?.addEventListener('click', () => { UI.showScreen('game'); Game.initGame(); });
    document.getElementById('btn-nav')?.addEventListener('click', ()  => { UI.showScreen('nav');});

    // 3. CONEXIÓN DE PANTALLAS INTERNAS
    document.getElementById('btn-album')?.addEventListener('click', () => {
        UI.showScreen('album');
        UI.renderAlbumContent();
    });
    window.history.replaceState({ screen: 'home' }, "", ""); 
    UI.showScreen('home'); // Forzamos que solo se vea la home al arrancar
    console.log("¡Centralita conectada!");
}); 

// --- 4. EXPOSICIÓN GLOBAL (Fuera del DOMContentLoaded) ---

// --- FUNCIONES DE LIBERACIÓN ---

window.liberarUno = (idx) => {
    // Usamos window. para asegurarnos de que la encuentra siempre
    window.mostrarConfirmacion("¿Quieres liberar a este duende?", () => {
        if (state.game && state.game.captured) {
            state.game.captured.splice(idx, 1);
            localStorage.setItem('duendesCapturados', JSON.stringify(state.game.captured));
            Game.refresh(); // Esto hace que el duende vuelva al mapa del juego ipso facto
            UI.renderAlbumContent(); // Refrescamos
            UI.mostrarToast("Duende liberado");
        }
    });
};

window.liberarTodos = () => {
    window.mostrarConfirmacion("¿Seguro que quieres liberar a TODOS los duendes?", () => {
        if (state.game) {
            state.game.captured = [];
            localStorage.removeItem('duendesCapturados');
            Game.refresh(); // Esto hace que el duende vuelva al mapa del juego ipso facto
            UI.renderAlbumContent(); // Refrescamos
            UI.mostrarToast("El bosque está libre");
        }
    });
};

window.changeAlbumVideo = (videoName) => {
    const video = document.getElementById('album-video');
    if (video) {
        video.src = `videos/${videoName}.mp4`;
        video.play().catch(e => console.log("Esperando interacción para video"));
    }
};

// --- FUNCIÓN GLOBAL PARA COMPARTIR ---
window.compartirRuta = async (titulo, url) => {
    if (navigator.share) {
        try {
            await navigator.share({
                title: titulo,
                text: 'Mira esta ruta de El Nido de Pinares: ' + titulo,
                url: url
            });
        } catch (err) {
            console.log('Error al compartir:', err);
        }
    } else {
        window.open(url, '_blank');
    }
};

function showScreenSilently(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const targetId = screenId.includes('-screen') ? screenId : `${screenId}-screen`;
    const target = document.getElementById(targetId);
    if (target) target.classList.remove('hidden');
    window.scrollTo(0, 0);
}

// Función de renderizado limpio (asegúrate de que oculte TODO)
function showScreenFinal(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.add('hidden');
        s.style.display = 'none';
    });
    
    const target = document.getElementById(`${screenId}-screen`);
    if (target) {
        target.classList.remove('hidden');
        target.style.display = 'block'; // O el display que uses
    }
}

// EL ÚNICO GUARDIÁN DEL BOTÓN ATRÁS
window.onpopstate = function(event) {
    console.log("Retrocediendo a:", event.state?.screen || 'home');
    
    if (event.state && event.state.screen) {
        // Llamamos a la función maestra. 
        // Como el estado ya está en el historial, showScreen no creará bucles.
        UI.showScreen(event.state.screen);
    } else {
        // Si el usuario llega al origen, forzamos la vuelta al menú principal
        UI.showScreen('home');
    }
};




