// ===== CONTROL DE SESIÓN =====
import { auth, PROGRAMADOR_UID, MINUTOS_INACTIVIDAD } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

export function esperarUsuario() {
    return new Promise((resolve) => {
        const cancelar = onAuthStateChanged(auth, (user) => {
            cancelar();
            resolve(user);
        });
    });
}

export function esProgramador(user) {
    return !!user && user.uid === PROGRAMADOR_UID;
}

export async function cerrarSesion() {
    try { await signOut(auth); } catch (e) { console.error(e); }
    location.replace("index.html"); // replace: el botón "atrás" no vuelve al panel
}

// Cierra la sesión tras N minutos sin actividad (importante en equipos compartidos con datos de salud).
export function iniciarInactividad() {
    let temporizador;
    const reiniciar = () => {
        clearTimeout(temporizador);
        temporizador = setTimeout(cerrarSesion, MINUTOS_INACTIVIDAD * 60 * 1000);
    };
    ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach((ev) =>
        document.addEventListener(ev, reiniciar, { passive: true })
    );
    reiniciar();
}

// Para páginas protegidas: si no hay sesión, vuelve al login y detiene la carga del módulo.
export async function requerirSesion() {
    const user = await esperarUsuario();
    if (!user) {
        location.replace("index.html");
        return new Promise(() => {});
    }
    document.body.classList.remove("cargando");
    iniciarInactividad();
    return user;
}
