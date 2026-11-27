// ===== CONFIGURACIÓN ÚNICA DE FIREBASE =====
// Antes estaba copiada en index.html, panel.html y programador.html. Ahora vive solo aquí.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyAynA1pU1npXEN_HvXNxTC4Xn7QB_SWyWg",
    authDomain: "glow-up-boutique-bdc0c.firebaseapp.com",
    projectId: "glow-up-boutique-bdc0c",
    storageBucket: "glow-up-boutique-bdc0c.firebasestorage.app",
    messagingSenderId: "372481623830",
    appId: "1:372481623830:web:e93a695c930f6a934ef237"
};

export const app = initializeApp(firebaseConfig);

// ---------------------------------------------------------------
// App Check (OPCIONAL, ver GUIA-PASO-A-PASO.md, paso 9).
// Déjalo vacío hasta que registres la app en App Check y obtengas la "clave del sitio" de reCAPTCHA.
// ---------------------------------------------------------------
const RECAPTCHA_SITE_KEY = "";
if (RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
    });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app); // fotos de seguimiento

// Colección donde están los clientes (cada documento = un RUT con guion, ej: "15699047-7")
export const COLECCION = "clientes";

// UID de Diego (programador). Cópialo desde Firebase > Authentication > Usuarios (botón copiar).
// NO lo escribas a mano: la "I" mayúscula, la "l" minúscula y el "1" se confunden.
// Es solo para mostrar u ocultar el panel; la protección real está en las reglas de Firestore.
export const PROGRAMADOR_UID = "PEGA_AQUI_EL_UID_DE_DIEGO";

// Minutos de inactividad antes de cerrar la sesión automáticamente.
export const MINUTOS_INACTIVIDAD = 20;
