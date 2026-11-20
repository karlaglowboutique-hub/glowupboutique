// ===== SERVICE WORKER: Glow Up Boutique =====
// Guarda en el dispositivo SOLO los archivos de la aplicación (pantallas, estilos y código).
// NUNCA guarda datos de clientes: esos viajan directo a Firebase y no pasan por esta caché.
const VERSION = "glowup-v1";
const ARCHIVOS = [
    "./", "index.html", "panel.html", "programador.html", "privacidad.html",
    "styles.css", "manifest.json",
    "js/pwa.js", "js/firebase-init.js", "js/utils.js", "js/auth-guard.js",
    "js/login.js", "js/panel.js", "js/programador.js", "js/ficha-estetica.js", "js/agenda.js",
    "imagenes/logo.png", "imagenes/icon-192.png", "imagenes/icon-512.png",
    "imagenes/icon-maskable-512.png", "imagenes/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(VERSION).then((cache) =>
            // Uno por uno: si falta un archivo (por ejemplo el logo), los demás se guardan igual
            Promise.allSettled(ARCHIVOS.map((a) => cache.add(a)))
        ).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((nombres) => Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // Firebase, Google, etc.: nunca se interceptan

    // Primero la red (así siempre ves la última versión que subas a GitHub); sin internet, usa la copia guardada
    event.respondWith(
        fetch(req)
            .then((resp) => {
                if (resp && resp.ok) {
                    const copia = resp.clone();
                    caches.open(VERSION).then((cache) => cache.put(req, copia));
                }
                return resp;
            })
            .catch(() =>
                caches.match(req).then((guardado) =>
                    guardado ||
                    (req.mode === "navigate"
                        ? new Response(
                            "<!DOCTYPE html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
                            "<body style='font-family:Segoe UI,sans-serif;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center'>" +
                            "<div><h2 style='color:#d4af37'>Sin conexión</h2><p>Glow Up Boutique necesita internet para mostrar los datos de los clientes.<br>Revisa tu conexión e inténtalo de nuevo.</p></div></body>",
                            { headers: { "Content-Type": "text/html; charset=utf-8" } })
                        : Response.error())
                )
            )
    );
});
