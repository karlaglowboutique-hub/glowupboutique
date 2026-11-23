// ===== AVISOS DE CITAS (notificaciones para quien usa la app) =====
// Cada dispositivo que activa los avisos guarda un "token" en la colección "dispositivos".
// Una función programada de Firebase (carpeta funciones-avisos/) revisa la agenda y envía la notificación
// a esos dispositivos, aunque la app esté cerrada.
import { auth, db, app, VAPID_KEY } from "./firebase-init.js";
import { doc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    getMessaging, getToken, deleteToken, onMessage, isSupported
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js";
import { mensajeErrorFirestore } from "./utils.js";

const $ = (id) => document.getElementById(id);
const CLAVE_TOKEN = "glowup_fcm_token";
const CLAVE_PREFS = "glowup_avisos_prefs";

let messaging = null;
let token = localStorage.getItem(CLAVE_TOKEN) || "";

const esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const esAppInstalada = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function estado(texto, clase = "") {
    const el = $("avisosEstado");
    el.textContent = texto;
    el.className = "avisos-estado " + clase;
}
function ayuda(texto) { $("avisosAyuda").textContent = texto || ""; }

function prefsGuardadas() {
    try { return JSON.parse(localStorage.getItem(CLAVE_PREFS)) || {}; } catch (e) { return {}; }
}
function prefsActuales() {
    return {
        avisoMinutos: Number($("avisoMinutos").value) || 30,
        recordatorios: $("avisoRecordatorios").checked,
        resumenDiario: $("avisoResumen").checked
    };
}

function pintarActivado(activo) {
    $("btnAvisosActivar").textContent = activo ? "Desactivar avisos" : "Activar avisos";
    $("btnAvisosActivar").classList.toggle("btn-cancelar", activo);
    $("btnAvisosActivar").classList.toggle("btn-primary", !activo);
    $("avisosOpciones").hidden = !activo;
    $("btnAvisosProbar").hidden = !activo;
    estado(activo ? "✔ Activados en este dispositivo" : "Desactivados en este dispositivo", activo ? "ok" : "");
}

async function guardarDispositivo() {
    const prefs = prefsActuales();
    localStorage.setItem(CLAVE_PREFS, JSON.stringify(prefs));
    await setDoc(doc(db, "dispositivos", token), {
        uid: auth.currentUser.uid,
        ...prefs,
        plataforma: navigator.userAgent.slice(0, 120),
        actualizadoEn: serverTimestamp()
    }, { merge: true });
}

async function activar() {
    if (!VAPID_KEY) { ayuda("Falta configurar la clave VAPID en js/firebase-init.js (ver la guía)."); return; }
    ayuda("");
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
        estado("Bloqueados", "mal");
        ayuda("Las notificaciones están bloqueadas. Permítelas en la configuración del navegador (ícono del candado junto a la dirección) y vuelve a intentar.");
        return;
    }
    const reg = await navigator.serviceWorker.ready;
    token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) throw new Error("No se obtuvo el permiso de envío de este dispositivo.");
    localStorage.setItem(CLAVE_TOKEN, token);
    await guardarDispositivo();
    pintarActivado(true);
}

async function desactivar() {
    try { if (token) await deleteDoc(doc(db, "dispositivos", token)); } catch (e) { console.warn(e); }
    try { await deleteToken(messaging); } catch (e) { console.warn(e); }
    token = "";
    localStorage.removeItem(CLAVE_TOKEN);
    pintarActivado(false);
}

export async function iniciarAvisos() {
    const boton = $("btnAvisosActivar");

    // ¿Este dispositivo puede recibir notificaciones?
    let soportado = false;
    try { soportado = await isSupported(); } catch (e) { soportado = false; }
    if (!soportado || !("Notification" in window)) {
        boton.hidden = true;
        estado("No disponible en este dispositivo", "mal");
        ayuda(esIphone && !esAppInstalada
            ? "En iPhone/iPad: instala la aplicación (Compartir → Agregar a pantalla de inicio) y ábrela desde el ícono para activar los avisos."
            : "Este navegador no admite notificaciones. Prueba con Chrome o Edge, o instala la aplicación.");
        return;
    }
    if (esIphone && !esAppInstalada) {
        boton.hidden = true;
        estado("Instala la aplicación primero", "mal");
        ayuda("En iPhone/iPad los avisos solo funcionan con la app instalada: Compartir → Agregar a pantalla de inicio, y ábrela desde el ícono.");
        return;
    }

    messaging = getMessaging(app);

    // Valores guardados de este dispositivo
    const p = prefsGuardadas();
    if (p.avisoMinutos) $("avisoMinutos").value = String(p.avisoMinutos);
    if (typeof p.recordatorios === "boolean") $("avisoRecordatorios").checked = p.recordatorios;
    if (typeof p.resumenDiario === "boolean") $("avisoResumen").checked = p.resumenDiario;

    if (Notification.permission === "denied") {
        estado("Bloqueados", "mal");
        ayuda("Las notificaciones están bloqueadas. Permítelas en la configuración del navegador y recarga la página.");
    } else if (Notification.permission === "granted" && token && VAPID_KEY) {
        pintarActivado(true);
        // Renueva el registro del dispositivo (los tokens pueden cambiar con el tiempo)
        try {
            const reg = await navigator.serviceWorker.ready;
            const nuevo = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
            if (nuevo && nuevo !== token) {
                try { await deleteDoc(doc(db, "dispositivos", token)); } catch (e) { /* sin problema */ }
                token = nuevo;
                localStorage.setItem(CLAVE_TOKEN, token);
            }
            await guardarDispositivo();
        } catch (e) { console.warn("No se pudo renovar el registro de avisos:", e); }
    } else {
        pintarActivado(false);
        if (!VAPID_KEY) ayuda("Falta configurar la clave VAPID en js/firebase-init.js (ver la guía).");
    }

    boton.addEventListener("click", async () => {
        boton.disabled = true;
        try {
            if (token) await desactivar(); else await activar();
        } catch (err) {
            console.error(err);
            ayuda(err && err.code && String(err.code).startsWith("messaging/")
                ? "No se pudieron activar los avisos: " + (err.message || err.code)
                : mensajeErrorFirestore(err));
        } finally {
            boton.disabled = false;
        }
    });

    ["avisoMinutos", "avisoRecordatorios", "avisoResumen"].forEach((id) => {
        $(id).addEventListener("change", async () => {
            if (!token) return;
            try { await guardarDispositivo(); ayuda("Cambios guardados."); }
            catch (err) { ayuda(mensajeErrorFirestore(err)); }
        });
    });

    $("btnAvisosProbar").addEventListener("click", async () => {
        try {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification("🔔 Aviso de prueba", {
                body: "Así te avisará la aplicación de tus citas.",
                icon: "imagenes/icon-192.png",
                badge: "imagenes/icon-192.png",
                tag: "prueba"
            });
            ayuda("Listo. Si viste la notificación, los avisos funcionan en este dispositivo.");
        } catch (err) {
            ayuda("No se pudo mostrar la notificación de prueba: " + (err.message || err));
        }
    });

    // Si llega un aviso con la app abierta, se muestra igual
    onMessage(messaging, async (payload) => {
        const d = (payload && payload.data) || {};
        try {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(d.titulo || "Glow Up Boutique", {
                body: d.cuerpo || "",
                icon: "imagenes/icon-192.png",
                badge: "imagenes/icon-192.png",
                data: { url: d.url || "panel.html" },
                ...(d.tag ? { tag: d.tag, renotify: true } : {})
            });
        } catch (e) { console.warn(e); }
    });
}