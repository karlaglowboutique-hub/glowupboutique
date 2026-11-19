// ===== UTILIDADES COMPARTIDAS =====

// ---------- RUT ----------
// Deja solo dígitos y K, en mayúscula. "15.699.047-7" -> "156990477"
export function normalizarRut(input) {
    return String(input ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

// Dígito verificador por módulo 11
export function calcularDv(cuerpo) {
    let suma = 0;
    let multiplicador = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += Number(cuerpo[i]) * multiplicador;
        multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
    }
    const r = 11 - (suma % 11);
    if (r === 11) return "0";
    if (r === 10) return "K";
    return String(r);
}

export function validarRut(input) {
    const limpio = normalizarRut(input);
    if (!/^\d{6,8}[0-9K]$/.test(limpio)) return false;
    return calcularDv(limpio.slice(0, -1)) === limpio.slice(-1);
}

// Formato canónico para guardar (y usar como ID del documento): "15699047-7"
export function rutClave(input) {
    const limpio = normalizarRut(input);
    if (limpio.length < 2) return limpio;
    return limpio.slice(0, -1) + "-" + limpio.slice(-1);
}

// Formato para mostrar: "15.699.047-7"
export function formatearRut(input) {
    const limpio = normalizarRut(input);
    if (limpio.length < 2) return limpio;
    const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return cuerpo + "-" + limpio.slice(-1);
}

// ---------- Seguridad ----------
export function esc(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

// ---------- Fechas (hora local, no UTC) ----------
export function fechaHoyLocal() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "2026-11-17" -> "17-11-2026"
export function fechaBonita(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
}

export function nuevoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Mensajes de error ----------
export function mensajeErrorAuth(err) {
    switch (err && err.code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
        case "auth/invalid-login-credentials":
            return "Correo o contraseña incorrectos.";
        case "auth/invalid-email":
            return "El correo no tiene un formato válido.";
        case "auth/user-disabled":
            return "Esta cuenta está deshabilitada. Contacta al administrador.";
        case "auth/too-many-requests":
            return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
        case "auth/network-request-failed":
            return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
        default:
            return "No se pudo iniciar sesión. Inténtalo de nuevo.";
    }
}

export function mensajeErrorFirestore(err) {
    switch (err && err.code) {
        case "permission-denied":
            return "No tienes permisos para realizar esta acción.";
        case "unavailable":
        case "deadline-exceeded":
            return "Sin conexión con el servidor. Inténtalo de nuevo.";
        case "unauthenticated":
            return "Tu sesión expiró. Vuelve a ingresar.";
        default:
            return (err && err.message) ? err.message : "Ocurrió un error inesperado.";
    }
}