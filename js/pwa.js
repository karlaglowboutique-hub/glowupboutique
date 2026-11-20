// ===== APLICACIÓN INSTALABLE (PWA) =====
// 1) Registra el service worker. 2) Muestra el botón "Instalar aplicación" cuando el navegador lo permite.
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch((err) => console.warn("No se pudo registrar el service worker:", err));
    });
}

let eventoInstalar = null;
const btnInstalar = document.getElementById("btnInstalar");

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();          // guardamos el aviso para mostrarlo con nuestro botón
    eventoInstalar = e;
    if (btnInstalar) btnInstalar.hidden = false;
});

if (btnInstalar) {
    btnInstalar.addEventListener("click", async () => {
        if (!eventoInstalar) return;
        eventoInstalar.prompt();
        await eventoInstalar.userChoice;
        eventoInstalar = null;
        btnInstalar.hidden = true;
    });
}

window.addEventListener("appinstalled", () => {
    eventoInstalar = null;
    if (btnInstalar) btnInstalar.hidden = true;
});
