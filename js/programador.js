// ===== PANEL DEL PROGRAMADOR (programador.html) =====
import { auth, db, storage, COLECCION } from "./firebase-init.js";
import { esProgramador, cerrarSesion, iniciarInactividad } from "./auth-guard.js";
import {
    signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
    collection, doc, onSnapshot, deleteDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import {
    esc, validarRut, rutClave, formatearRut, mensajeErrorAuth, mensajeErrorFirestore
} from "./utils.js";

const $ = (id) => document.getElementById(id);
const loginBox = $("loginProgBox");
const dashboard = $("dashboardProg");
const lista = $("listaClientesProg");

let clientes = {};
let cancelarSnapshot = null;
let eliminacion = null;
let inactividadActiva = false;

$("btnSalirProg").addEventListener("click", cerrarSesion);

// ---------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------
function mostrarLogin(mensaje = "") {
    if (cancelarSnapshot) { cancelarSnapshot(); cancelarSnapshot = null; }
    clientes = {};
    dashboard.hidden = true;
    loginBox.hidden = false;
    $("btnSalirProg").hidden = true;
    $("errorProg").textContent = mensaje;
}

function mostrarDashboard() {
    loginBox.hidden = true;
    dashboard.hidden = false;
    $("btnSalirProg").hidden = false;
    if (!inactividadActiva) { iniciarInactividad(); inactividadActiva = true; }
    if (cancelarSnapshot) return;
    cancelarSnapshot = onSnapshot(
        collection(db, COLECCION),
        (snap) => {
            const nuevo = {};
            snap.forEach((d) => { nuevo[d.id] = { ...d.data(), rut: d.id }; });
            clientes = nuevo;
            renderLista();
        },
        (err) => {
            console.error(err);
            lista.innerHTML = `<div class="lista-vacia">${esc(mensajeErrorFirestore(err))}</div>`;
        }
    );
}

onAuthStateChanged(auth, (user) => {
    if (user && esProgramador(user)) mostrarDashboard();
    else mostrarLogin(user ? "Esta cuenta no tiene permisos de programador." : "");
    document.body.classList.remove("cargando");
});

$("formLoginProg").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("btnLoginProg");
    btn.disabled = true;
    try {
        await setPersistence(auth, browserSessionPersistence);
        await signInWithEmailAndPassword(auth, $("pEmail").value.trim(), $("pPass").value);
        $("pPass").value = "";
        // onAuthStateChanged decide si se muestra el panel
    } catch (err) {
        console.error(err);
        $("errorProg").textContent = mensajeErrorAuth(err);
    } finally {
        btn.disabled = false;
    }
});

// ---------------------------------------------------------------
// Lista
// ---------------------------------------------------------------
function renderLista() {
    const filas = Object.values(clientes).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
    if (filas.length === 0) {
        lista.innerHTML = '<div class="lista-vacia">Base de datos vacía.</div>';
        return;
    }
    lista.innerHTML = filas.map((c) => `
        <div class="admin-card">
            <div class="info">
                <strong>${esc(c.nombre)}</strong>
                <span>RUT: ${esc(formatearRut(c.rut))} · Atenciones: ${Array.isArray(c.atenciones) ? c.atenciones.length : 0}</span>
            </div>
            <div class="admin-actions">
                <button type="button" class="btn-edit" data-accion="editar" data-rut="${esc(c.rut)}">Editar datos</button>
                <button type="button" class="btn-delete" data-accion="borrar" data-rut="${esc(c.rut)}">Borrar</button>
            </div>
        </div>
    `).join("");
}

lista.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-accion]");
    if (!btn) return;
    if (btn.dataset.accion === "editar") abrirEditar(btn.dataset.rut);
    else abrirModalEliminar(btn.dataset.rut);
});

// ---------------------------------------------------------------
// Editar cliente
// ---------------------------------------------------------------
const modalEditar = $("modalEditarProg");

// Asigna un valor a un <select>; si el valor guardado no está en la lista (dato antiguo), lo agrega.
function fijarSelect(id, valor) {
    const sel = $(id);
    sel.value = valor || "";
    if (valor && sel.value !== valor) {
        sel.add(new Option(valor, valor));
        sel.value = valor;
    }
}

function abrirEditar(rut) {
    const c = clientes[rut];
    if (!c) return;
    $("errorEditarProg").textContent = "";
    $("epRutOriginal").value = rut;
    $("epNombre").value = c.nombre || "";
    $("epRut").value = formatearRut(c.rut);
    $("epEdad").value = c.edad || "";
    $("epTelefono").value = c.telefono || "";
    $("epEmail").value = c.email || "";
    $("epAlergias").value = c.alergias || "";
    $("epMorbidos").value = c.morbidos || "";
    $("epMedicamentos").value = c.medicamentos || "";
    $("epCirugias").value = c.cirugias || "";
    fijarSelect("epEmbarazo", c.embarazo);
    fijarSelect("epPiel", c.piel);
    fijarSelect("epFototipo", c.fototipo);
    modalEditar.classList.add("active");
    $("epNombre").focus();
}

function cerrarEditar() { modalEditar.classList.remove("active"); }
$("btnCerrarEditarProg").addEventListener("click", cerrarEditar);
modalEditar.addEventListener("click", (e) => { if (e.target === modalEditar) cerrarEditar(); });

$("formEditarProg").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("errorEditarProg");
    err.textContent = "";

    const rutOriginal = $("epRutOriginal").value;
    if (!validarRut($("epRut").value)) { err.textContent = "El RUT no es válido. Revisa el dígito verificador."; return; }
    const nuevaClave = rutClave($("epRut").value);

    const edad = Number($("epEdad").value);
    if ($("epEdad").value === "" || !Number.isInteger(edad) || edad < 0 || edad > 120) {
        err.textContent = "La edad debe estar entre 0 y 120."; return;
    }

    const campos = {
        nombre: $("epNombre").value.trim(),
        edad: String(edad),
        telefono: $("epTelefono").value.trim(),
        email: $("epEmail").value.trim(),
        alergias: $("epAlergias").value.trim(),
        morbidos: $("epMorbidos").value.trim(),
        medicamentos: $("epMedicamentos").value.trim(),
        embarazo: $("epEmbarazo").value,
        piel: $("epPiel").value,
        fototipo: $("epFototipo").value,
        cirugias: $("epCirugias").value.trim()
    };
    if (campos.nombre.length < 3) { err.textContent = "Ingresa el nombre completo."; return; }

    const btn = $("btnGuardarEditarProg");
    btn.disabled = true;
    try {
        await runTransaction(db, async (tx) => {
            const refViejo = doc(db, COLECCION, rutOriginal);
            const sViejo = await tx.get(refViejo);
            if (!sViejo.exists()) throw new Error("El cliente ya no existe.");

            if (nuevaClave === rutOriginal) {
                tx.update(refViejo, campos);
                return;
            }
            // El RUT es el ID del documento: cambiarlo implica crear uno nuevo y borrar el anterior.
            const refNuevo = doc(db, COLECCION, nuevaClave);
            const sNuevo = await tx.get(refNuevo);
            if (sNuevo.exists()) throw new Error("Ya existe otro cliente con ese RUT.");
            tx.set(refNuevo, { ...sViejo.data(), ...campos });
            tx.delete(refViejo);
        });
        cerrarEditar();
    } catch (ex) {
        console.error(ex);
        err.textContent = mensajeErrorFirestore(ex);
    } finally {
        btn.disabled = false;
    }
});

// ---------------------------------------------------------------
// Eliminar cliente
// ---------------------------------------------------------------
const modalEliminar = $("modalEliminar");

function abrirModalEliminar(rut) {
    const c = clientes[rut];
    if (!c) return;
    eliminacion = rut;
    $("modalEliminarError").textContent = "";
    $("modalEliminarText").textContent =
        `¿Borrar a ${c.nombre || "este cliente"} (${formatearRut(rut)}) y sus ${Array.isArray(c.atenciones) ? c.atenciones.length : 0} atención(es) y ${Array.isArray(c.fotos) ? c.fotos.length : 0} foto(s) de forma permanente?`;
    modalEliminar.classList.add("active");
    $("btnCancelarEliminar").focus();
}

function cerrarModalEliminar() {
    modalEliminar.classList.remove("active");
    eliminacion = null;
}
$("btnCancelarEliminar").addEventListener("click", cerrarModalEliminar);
modalEliminar.addEventListener("click", (e) => { if (e.target === modalEliminar) cerrarModalEliminar(); });

$("btnConfirmarEliminar").addEventListener("click", async () => {
    if (!eliminacion) { cerrarModalEliminar(); return; }
    const btn = $("btnConfirmarEliminar");
    btn.disabled = true;
    try {
        // Primero se borran las fotos del cliente (si quedaran archivos sueltos, seguirían almacenados)
        const c = clientes[eliminacion];
        const rutas = [];
        (Array.isArray(c && c.fotos) ? c.fotos : []).forEach((f) => { if (f.ruta) rutas.push(f.ruta); if (f.rutaMini) rutas.push(f.rutaMini); });
        const fallidas = [];
        for (const p of rutas) {
            try { await deleteObject(ref(storage, p)); }
            catch (e) { if (!(e && e.code === "storage/object-not-found")) fallidas.push(p); }
        }
        if (fallidas.length) {
            throw new Error(`No se pudieron borrar ${fallidas.length} archivo(s) de fotos. No se borró el cliente para no dejar fotos sueltas. Revisa las reglas de Storage.`);
        }
        await deleteDoc(doc(db, COLECCION, eliminacion));
        cerrarModalEliminar();
    } catch (err) {
        console.error(err);
        $("modalEliminarError").textContent = mensajeErrorFirestore(err);
    } finally {
        btn.disabled = false;
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    cerrarEditar();
    cerrarModalEliminar();
});
