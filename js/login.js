// ===== LOGIN (index.html) =====
import { auth } from "./firebase-init.js";
import {
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged,
    setPersistence,
    browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { mensajeErrorAuth } from "./utils.js";

const form = document.getElementById("loginForm");
const errorMsg = document.getElementById("errorMsg");
const btnLogin = document.getElementById("btnLogin");
const btnOlvide = document.getElementById("btnOlvide");

function mostrar(texto, tipo = "error") {
    errorMsg.textContent = texto;
    errorMsg.className = tipo === "ok" ? "success-msg" : "error-msg";
}

// Si ya hay sesión activa, ir directo al panel.
onAuthStateChanged(auth, (user) => {
    if (user) location.replace("panel.html");
});

form.addEventListener("input", () => mostrar(""));

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
        mostrar("Ingresa tu correo y tu contraseña.");
        return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = "INGRESANDO...";
    try {
        // La sesión se cierra al cerrar la pestaña (recomendado en equipos compartidos con datos de salud).
        // Si prefieres que se mantenga, elimina la siguiente línea.
        await setPersistence(auth, browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        // La redirección la hace onAuthStateChanged.
    } catch (err) {
        console.error(err);
        mostrar(mensajeErrorAuth(err));
        btnLogin.disabled = false;
        btnLogin.textContent = "INGRESAR";
    }
});

btnOlvide.addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    if (!email) {
        mostrar("Escribe tu correo arriba y vuelve a presionar este botón.");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
    } catch (err) {
        // No revelamos si el correo existe o no.
        console.error(err);
    }
    mostrar("Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.", "ok");
});