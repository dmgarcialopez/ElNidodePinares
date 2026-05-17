export const CONFIG = {
    CAPTURE_RANGE: 100000, // Ajustado a metros reales (en tu original tenías 100km para test)
    GAME_TICK_MS: 3000,
    COLOR_NAV: '#2196F3',
    URLS: {
        pois: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQhcyPAmVSPAxciRkNPergJLMSIwcTWSZiQKNkWcJDmzjvGp1xK8v9Ho2MNOWL8P6meG5GWr9JGueme/pub?gid=0&output=csv',
        bici: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRAqPw_lnSBWloX_sMUUBgUIouLYnQVDtkK5BZrEPUyp4KuAceto_9CJYHFjDYJSNkYLOksqsiz7mB-/pub?gid=0&output=csv',
        paseo: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSxOG367O04AVZmVsikJkcsU0cho0R1RAkDdcvxrLZ1XRiq-wXTl0RN8aEzaRfS57ZHUJn-OB4r_TDa/pub?gid=0&output=csv',
        duendes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwHHhTmV0CvkquPjDRyco_59SNSnIWgBsHVtpjfJsonJU47XvREHMBjLxIeHU7-dbdEkFGYE8_MwKp/pub?output=csv'
    },
    MAPA: {
        CENTRO_DEFECTO: [41.842475, -3.003306], 
        ZOOM_MAPA_VACIO: 14, 
        ZOOM_GPS_ACTIVO: 15, 
        PADDING_ENCUADRE: [40, 40],
        
        // 🎨 ESTILO ÚNICO DEL TRACK (Igual para todas las circunstancias)
        TRACK_ESTILO: {
            color: '#007FFF',     // Tu azul eléctrico característico
            weight: 7,            // El grosor/ancho de la línea en píxeles
            opacity: 1,         // Opacidad (de 0 a 1) para que resalte
            lineJoin: 'round',    // Bordes suavizados en los giros
            lineCap: 'round'      // Extremos de la línea redondeados
        }
    }
};