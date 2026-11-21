// ===== APLICACIÓN INSTALABLE + ACTUALIZACIÓN AUTOMÁTICA =====
// 1) Registra el service worker.
// 2) Vigila GitHub: cada pocos minutos (y al volver a abrir la app) revisa si los archivos cambiaron.
//    Si hay una versión nueva, avisa con un cartel "Actualizar ahora" (o se actualiza sola en pantallas sin datos).
// 3) Muestra el botón "Instalar aplicación" cuando el navegador lo permite.

const MINUTOS_REVISION = 5;
const ARCHIVOS_VIGILADOS = [
    "index.html", "panel.html", "programador.html", "privacidad.html", "styles.css", "sw.js",
    "js/pwa.js", "js/firebase-init.js", "js/utils.js", "js/auth-guard.js", "js/login.js",
    "js/panel.js", "js/programador.js", "js/ficha-estetica.js", "js/agenda.js", "js/fotos.js"
];

let registro = null;
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("sw.js", { updateViaCache: "none" }) // sw.js siempre se revisa en internet
            .then((reg) => { registro = reg; })
            .catch((err) => console.warn("No se pudo registrar el service worker:", err));
        iniciarVigilancia();
    });
}

// ---------------------------------------------------------------
// Detección de versión nueva
// ---------------------------------------------------------------
async function firma() {
    const partes = await Promise.all(ARCHIVOS_VIGILADOS.map(async (a) => {
        try {
            const r = await fetch(a, { method: "HEAD", cache: "no-store" });
            return `${a}:${r.status}:${r.headers.get("etag") || r.headers.get("last-modified") || r.headers.get("content-length") || ""}`;
        } catch (e) {
            return null; // sin conexión
        }
    }));
    return partes.includes(null) ? null : partes.join("|");
}

let base = null;          // "huella" de la versión con la que se abrió la app
let ultimaRevision = 0;
let avisoDescartadoHasta = 0;

async function iniciarVigilancia() {
    base = await firma();
    setInterval(revisar, MINUTOS_REVISION * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) revisar(); });
    window.addEventListener("online", revisar);
}

async function revisar() {
    if (document.hidden || Date.now() - ultimaRevision < 60 * 1000) return;
    ultimaRevision = Date.now();
    if (registro) registro.update().catch(() => {});

    const actual = await firma();
    if (!actual) return;                        // sin conexión: no se compara
    if (!base) { base = actual; return; }       // primera lectura exitosa
    if (actual === base) return;

    // Confirma el cambio una segunda vez (evita falsas alarmas por el servidor)
    await new Promise((ok) => setTimeout(ok, 8000));
    const confirmada = await firma();
    if (confirmada && confirmada === actual && confirmada !== base) hayVersionNueva();
}

function hayVersionNueva() {
    // Pantallas sin datos de trabajo: se actualizan solas
    const login = document.getElementById("loginForm");
    if (!document.getElementById("panelView") && !document.getElementById("dashboardProg")) {
        const escribiendo = login && (document.getElementById("email").value || document.getElementById("password").value);
        if (!escribiendo) { actualizarAhora(); return; }
    }
    mostrarAviso();
}

function mostrarAviso() {
    if (Date.now() < avisoDescartadoHasta || document.getElementById("avisoActualizacion")) return;
    const caja = document.createElement("div");
    caja.id = "avisoActualizacion";
    caja.setAttribute("role", "status");
    caja.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:99998;max-width:calc(100% - 32px);" +
        "background:#111;color:#fff;border:1px solid #d4af37;border-radius:12px;padding:14px 18px;box-shadow:0 10px 30px rgba(0,0,0,.45);" +
        "font:14px/1.4 'Segoe UI',Tahoma,sans-serif;display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center";

    const texto = document.createElement("span");
    texto.textContent = "🔄 Hay una versión nueva de la aplicación. Guarda lo que estés haciendo y actualiza.";

    const bAct = document.createElement("button");
    bAct.type = "button";
    bAct.textContent = "Actualizar ahora";
    bAct.style.cssText = "background:#d4af37;color:#111;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer";
    bAct.addEventListener("click", actualizarAhora);

    const bDespues = document.createElement("button");
    bDespues.type = "button";
    bDespues.textContent = "Más tarde";
    bDespues.style.cssText = "background:transparent;color:#fff;border:1px solid #777;border-radius:8px;padding:9px 16px;cursor:pointer";
    bDespues.addEventListener("click", () => {
        avisoDescartadoHasta = Date.now() + 30 * 60 * 1000; // vuelve a avisar en 30 minutos
        caja.remove();
    });

    caja.append(texto, bAct, bDespues);
    document.body.appendChild(caja);
}

async function actualizarAhora() {
    try {
        if (registro) await registro.update();
        else if ("serviceWorker" in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) await reg.update();
        }
    } catch (e) { /* si falla, igual se recarga */ }
    location.reload();
}

// ---------------------------------------------------------------
// Botón "Instalar aplicación"
// ---------------------------------------------------------------
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
