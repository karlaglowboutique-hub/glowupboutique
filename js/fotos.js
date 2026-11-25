// ===== FOTOS DE SEGUIMIENTO =====
// Las imágenes se guardan en Firebase Storage (carpeta "fotos/<RUT>/") y en el cliente solo se guarda
// la lista de fotos (ruta, fecha, vista, sesión, nota) dentro del campo "fotos".
// Antes de subirlas se reducen de tamaño y se vuelven a codificar en el navegador: esto ahorra espacio
// y elimina los datos ocultos de la foto (ubicación GPS, modelo del teléfono, etc.).
import { auth, db, storage, COLECCION } from "./firebase-init.js";
import {
    doc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    ref, uploadBytes, getDownloadURL, getBlob, deleteObject
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { esc, fechaHoyLocal, fechaBonita, nuevoId, mensajeErrorFirestore } from "./utils.js";

const $ = (id) => document.getElementById(id);

const VISTAS = { frente: "Frente", izquierdo: "Perfil izquierdo", derecho: "Perfil derecho", otra: "Otra" };
const ORDEN_VISTA = ["frente", "izquierdo", "derecho", "otra"];
const SESIONES = [
    "Inicial (antes del tratamiento)", "2º estudio", "3º estudio", "4º estudio", "5º estudio",
    "6º estudio", "7º estudio", "8º estudio", "9º estudio", "Control"
];
const MAX_ORIGINAL_MB = 25;   // tamaño máximo de la foto que elige el usuario (antes de reducirla)
const MAX_POR_VEZ = 12;       // fotos por subida
const LADO_FOTO = 1600;       // píxeles del lado más largo
const LADO_MINI = 400;

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
const cacheUrls = new Map(); // ruta -> Promise<url>
let usarBlob = true;         // más privado: descarga con tu sesión (requiere CORS, ver guía); si falla, usa enlace

function urlFoto(ruta) {
    if (!cacheUrls.has(ruta)) {
        cacheUrls.set(ruta, (async () => {
            const r = ref(storage, ruta);
            if (usarBlob) {
                try { return URL.createObjectURL(await getBlob(r)); } catch (e) { usarBlob = false; }
            }
            return await getDownloadURL(r);
        })().catch((err) => { cacheUrls.delete(ruta); throw err; }));
    }
    return cacheUrls.get(ruta);
}

function porVista(a, b) { return ORDEN_VISTA.indexOf(a.vista) - ORDEN_VISTA.indexOf(b.vista); }
function cronologico(a, b) {
    return (a.fecha + String(ORDEN_VISTA.indexOf(a.vista))).localeCompare(b.fecha + String(ORDEN_VISTA.indexOf(b.vista)));
}
function etiquetaFoto(f) {
    return `${fechaBonita(f.fecha)} · ${VISTAS[f.vista] || "Otra"}${f.sesion ? " · " + f.sesion : ""}`;
}
function listaDe(cliente) { return Array.isArray(cliente && cliente.fotos) ? cliente.fotos : []; }
function esErrorNoExiste(err) { return err && err.code === "storage/object-not-found"; }

// Reduce y recodifica la imagen en el navegador (resultado: JPEG sin datos ocultos)
async function procesarImagen(file, lado, calidad) {
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * escala));
        const h = Math.max(1, Math.round(img.naturalHeight * escala));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return await new Promise((ok, mal) =>
            canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo procesar la imagen."))), "image/jpeg", calidad)
        );
    } catch (e) {
        throw new Error(`No se pudo leer “${file.name}”. Prueba con otra foto (formato JPG o PNG).`);
    } finally {
        URL.revokeObjectURL(url);
    }
}

// ---------------------------------------------------------------
// Sección dentro de la ficha del cliente
// ---------------------------------------------------------------
export function htmlFotos(c) {
    const fotos = listaDe(c);
    const cabecera = `
        <h4>Fotos de seguimiento</h4>
        <div class="fotos-barra">
            <span class="nota-fotos">${fotos.length ? `${fotos.length} foto${fotos.length > 1 ? "s" : ""} registrada${fotos.length > 1 ? "s" : ""}` : "Registro fotográfico de la evolución del tratamiento"}</span>
            <div class="fotos-acciones">
                <button type="button" class="btn-primary btn-inline" data-accion="fotos-subir">📷 Subir fotos</button>
                ${fotos.length >= 2 ? '<button type="button" class="btn-edit" data-accion="fotos-comparar">↔ Comparar antes y después</button>' : ""}
            </div>
        </div>`;
    if (!fotos.length) return cabecera + '<p class="nota-auto">Aún no hay fotos. Sube la primera para comenzar el registro.</p>';

    const grupos = {};
    fotos.forEach((f) => { const k = `${f.fecha}|${f.sesion || ""}`; (grupos[k] = grupos[k] || []).push(f); });
    const cuerpo = Object.keys(grupos).sort().reverse().map((k) => {
        const [fecha, sesion] = k.split("|");
        const miniaturas = grupos[k].sort(porVista).map((f) => `
            <button type="button" class="foto-thumb" data-accion="foto-ver" data-id="${esc(f.id)}" aria-label="Ver foto: ${esc(etiquetaFoto(f))}">
                <img alt="${esc(etiquetaFoto(f))}" data-ruta="${esc(f.rutaMini || f.ruta)}">
                <span class="foto-badge">${esc(VISTAS[f.vista] || "Otra")}</span>
            </button>`).join("");
        return `<div class="fotos-grupo"><h5>${esc(fechaBonita(fecha))}${sesion ? " · " + esc(sesion) : ""}</h5><div class="fotos-grid">${miniaturas}</div></div>`;
    }).join("");
    return cabecera + cuerpo;
}

// Carga las miniaturas (llamar después de insertar el HTML)
export function hidratarFotos(raiz) {
    raiz.querySelectorAll("img[data-ruta]").forEach((img) => {
        urlFoto(img.dataset.ruta)
            .then((u) => { img.src = u; })
            .catch(() => { img.classList.add("foto-error"); });
    });
}

// ---------------------------------------------------------------
// Subir fotos
// ---------------------------------------------------------------
const modalFotos = $("modalFotos");
const formFotos = $("formFotos");
let clienteSubida = null;
let seleccion = []; // [{ file, url, vista, nota }]

function abrirModalFotos() { modalFotos.classList.add("active"); }
function cerrarModalFotos() {
    seleccion.forEach((s) => URL.revokeObjectURL(s.url));
    seleccion = [];
    modalFotos.classList.remove("active");
}

export function abrirSubirFotos(cliente) {
    if (!cliente) return;
    clienteSubida = cliente;
    formFotos.reset();
    seleccion.forEach((s) => URL.revokeObjectURL(s.url));
    seleccion = [];
    $("errorFotos").textContent = "";
    $("fotosProgreso").textContent = "";
    $("fotosClienteNombre").textContent = `Cliente: ${cliente.nombre}`;
    $("fotoFecha").value = fechaHoyLocal();
    $("fotoFecha").max = fechaHoyLocal();
    $("fotoSesion").innerHTML = SESIONES.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    $("fotoSesion").value = listaDe(cliente).length ? "Control" : SESIONES[0];
    
    // Corrección: forzar el consentimiento a mostrarse si no existe previamente
    const bloqueConsent = $("bloqueConsentimientoFotos");
    if (cliente.consentimientoFotos) {
        bloqueConsent.hidden = true;
        bloqueConsent.style.display = "none";
    } else {
        bloqueConsent.hidden = false;
        bloqueConsent.removeAttribute("hidden");
        bloqueConsent.style.display = "flex";
    }

    renderPrevias();
    abrirModalFotos();
}

function renderPrevias() {
    $("listaPrevias").innerHTML = seleccion.map((s, i) => `
        <div class="previa" data-i="${i}">
            <img src="${s.url}" alt="Vista previa ${i + 1}">
            <div class="previa-campos">
                <label class="sr-only" for="previaVista${i}">Vista de la foto ${i + 1}</label>
                <select id="previaVista${i}" class="previa-vista" data-i="${i}">
                    ${ORDEN_VISTA.map((v) => `<option value="${v}"${s.vista === v ? " selected" : ""}>${VISTAS[v]}</option>`).join("")}
                </select>
                <label class="sr-only" for="previaNota${i}">Nota de la foto ${i + 1}</label>
                <input type="text" id="previaNota${i}" class="previa-nota" data-i="${i}" maxlength="200" placeholder="Nota (opcional)" value="${esc(s.nota)}">
                <button type="button" class="btn-delete" data-quitar="${i}">Quitar</button>
            </div>
        </div>`).join("");
    $("btnSubirFotos").disabled = seleccion.length === 0;
}

function agregarArchivos(lista) {
    const aviso = $("errorFotos");
    aviso.textContent = "";
    for (const file of lista) {
        if (!file.type || !file.type.startsWith("image/")) { aviso.textContent = `“${file.name}” no es una imagen.`; continue; }
        if (file.size > MAX_ORIGINAL_MB * 1024 * 1024) { aviso.textContent = `“${file.name}” pesa más de ${MAX_ORIGINAL_MB} MB.`; continue; }
        if (seleccion.length >= MAX_POR_VEZ) { aviso.textContent = `Máximo ${MAX_POR_VEZ} fotos por subida.`; break; }
        seleccion.push({ file, url: URL.createObjectURL(file), vista: ORDEN_VISTA[Math.min(seleccion.length, 3)], nota: "" });
    }
    renderPrevias();
}

$("btnFotoCamara").addEventListener("click", () => $("fotoCamara").click());
$("btnFotoGaleria").addEventListener("click", () => $("fotoGaleria").click());
$("fotoCamara").addEventListener("change", (e) => { agregarArchivos(e.target.files); e.target.value = ""; });
$("fotoGaleria").addEventListener("change", (e) => { agregarArchivos(e.target.files); e.target.value = ""; });

$("listaPrevias").addEventListener("input", (e) => {
    const i = Number(e.target.dataset.i);
    if (!seleccion[i]) return;
    if (e.target.classList.contains("previa-nota")) seleccion[i].nota = e.target.value;
});
$("listaPrevias").addEventListener("change", (e) => {
    const i = Number(e.target.dataset.i);
    if (seleccion[i] && e.target.classList.contains("previa-vista")) seleccion[i].vista = e.target.value;
});
$("listaPrevias").addEventListener("click", (e) => {
    const b = e.target.closest("[data-quitar]");
    if (!b) return;
    const i = Number(b.dataset.quitar);
    if (seleccion[i]) { URL.revokeObjectURL(seleccion[i].url); seleccion.splice(i, 1); renderPrevias(); }
});

$("btnCancelarFotos").addEventListener("click", cerrarModalFotos);
modalFotos.addEventListener("click", (e) => { if (e.target === modalFotos) cerrarModalFotos(); });

formFotos.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("errorFotos");
    err.textContent = "";
    if (!clienteSubida) return;
    if (seleccion.length === 0) { err.textContent = "Agrega al menos una foto."; return; }

    const fecha = $("fotoFecha").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > fechaHoyLocal()) { err.textContent = "La fecha de las fotos no es válida."; return; }
    const necesitaConsentimiento = !clienteSubida.consentimientoFotos;
    if (necesitaConsentimiento && !$("fotoConsentimiento").checked) {
        err.textContent = "Debes confirmar la autorización del cliente para tomar y guardar sus fotografías.";
        return;
    }

    const rut = clienteSubida.rut;
    const sesion = $("fotoSesion").value;
    const uid = auth.currentUser ? auth.currentUser.uid : "";
    const btn = $("btnSubirFotos");
    btn.disabled = true;
    $("btnCancelarFotos").disabled = true;

    const nuevas = [];
    const subidos = []; // rutas ya subidas (por si hay que deshacer)
    try {
        for (let i = 0; i < seleccion.length; i++) {
            $("fotosProgreso").textContent = `Subiendo foto ${i + 1} de ${seleccion.length}…`;
            const s = seleccion[i];
            const id = nuevoId();
            const ruta = `fotos/${rut}/${id}.jpg`;
            const rutaMini = `fotos/${rut}/${id}_mini.jpg`;
            const grande = await procesarImagen(s.file, LADO_FOTO, 0.85);
            const mini = await procesarImagen(s.file, LADO_MINI, 0.8);
            await uploadBytes(ref(storage, ruta), grande, { contentType: "image/jpeg" });
            subidos.push(ruta);
            await uploadBytes(ref(storage, rutaMini), mini, { contentType: "image/jpeg" });
            subidos.push(rutaMini);
            nuevas.push({ id, ruta, rutaMini, fecha, sesion, vista: s.vista, nota: (s.nota || "").trim().slice(0, 200), creadaPor: uid });
        }

        $("fotosProgreso").textContent = "Guardando registro…";
        await runTransaction(db, async (tx) => {
            const r = doc(db, COLECCION, rut);
            const snap = await tx.get(r);
            if (!snap.exists()) throw new Error("El cliente ya no existe.");
            const d = snap.data();
            const fotos = Array.isArray(d.fotos) ? [...d.fotos] : [];
            nuevas.forEach((m) => fotos.push(m));
            const cambios = { fotos };
            if (!d.consentimientoFotos) {
                cambios.consentimientoFotos = true;
                cambios.fechaConsentimientoFotos = serverTimestamp();
            }
            tx.update(r, cambios);
        });
        cerrarModalFotos();
    } catch (ex) {
        console.error(ex);
        // Deshacer lo ya subido para no dejar archivos sueltos
        await Promise.allSettled(subidos.map((p) => deleteObject(ref(storage, p))));
        err.textContent = (ex && ex.code && String(ex.code).startsWith("storage/"))
            ? (ex.code === "storage/unauthorized" ? "No tienes permisos para subir fotos. Falta publicar las reglas de Storage (ver la guía)." : "No se pudo subir la foto: " + (ex.message || ex.code))
            : mensajeErrorFirestore(ex);
        $("fotosProgreso").textContent = "";
    } finally {
        btn.disabled = seleccion.length === 0;
        $("btnCancelarFotos").disabled = false;
    }
});

// ---------------------------------------------------------------
// Visor de una foto (con anterior / siguiente y eliminar)
// ---------------------------------------------------------------
const modalVisor = $("modalVisor");
let visor = { lista: [], i: 0, rut: "" };

async function mostrarVisor() {
    const f = visor.lista[visor.i];
    if (!f) return;
    const img = $("visorImg");
    img.removeAttribute("src");
    img.alt = etiquetaFoto(f);
    $("visorInfo").textContent = etiquetaFoto(f);
    $("visorNota").textContent = f.nota || "";
    $("visorPos").textContent = `${visor.i + 1} de ${visor.lista.length}`;
    $("visorError").textContent = "";
    $("btnVisorAnt").disabled = visor.i === 0;
    $("btnVisorSig").disabled = visor.i === visor.lista.length - 1;
    const bEliminar = $("btnVisorEliminar");
    bEliminar.dataset.confirmar = "";
    bEliminar.textContent = "Eliminar foto";
    try {
        const u = await urlFoto(f.ruta);
        if (visor.lista[visor.i] && visor.lista[visor.i].id === f.id) img.src = u;
    } catch (e) {
        $("visorError").textContent = "No se pudo cargar la foto.";
    }
}

export function abrirVisor(cliente, idFoto) {
    const lista = [...listaDe(cliente)].sort(cronologico);
    const i = lista.findIndex((f) => f.id === idFoto);
    if (i < 0) return;
    visor = { lista, i, rut: cliente.rut };
    modalVisor.classList.add("active");
    mostrarVisor();
}

function cerrarVisor() { modalVisor.classList.remove("active"); }
$("btnVisorCerrar").addEventListener("click", cerrarVisor);
modalVisor.addEventListener("click", (e) => { if (e.target === modalVisor) cerrarVisor(); });
$("btnVisorAnt").addEventListener("click", () => { if (visor.i > 0) { visor.i--; mostrarVisor(); } });
$("btnVisorSig").addEventListener("click", () => { if (visor.i < visor.lista.length - 1) { visor.i++; mostrarVisor(); } });

$("btnVisorEliminar").addEventListener("click", async () => {
    const btn = $("btnVisorEliminar");
    const f = visor.lista[visor.i];
    if (!f) return;
    if (!btn.dataset.confirmar) {
        btn.dataset.confirmar = "1";
        btn.textContent = "¿Seguro? Presiona de nuevo para eliminar";
        return;
    }
    btn.disabled = true;
    try {
        await runTransaction(db, async (tx) => {
            const r = doc(db, COLECCION, visor.rut);
            const snap = await tx.get(r);
            if (!snap.exists()) throw new Error("El cliente ya no existe.");
            const fotos = (Array.isArray(snap.data().fotos) ? snap.data().fotos : []).filter((x) => x.id !== f.id);
            tx.update(r, { fotos });
        });
        const fallos = [];
        for (const p of [f.ruta, f.rutaMini]) {
            if (!p) continue;
            try { await deleteObject(ref(storage, p)); } catch (e) { if (!esErrorNoExiste(e)) fallos.push(p); }
            cacheUrls.delete(p);
        }
        visor.lista.splice(visor.i, 1);
        if (visor.lista.length === 0) cerrarVisor();
        else { visor.i = Math.min(visor.i, visor.lista.length - 1); mostrarVisor(); }
        if (fallos.length) alert("La foto se quitó del registro, pero no se pudo borrar el archivo. Avisa al programador.");
    } catch (ex) {
        console.error(ex);
        $("visorError").textContent = mensajeErrorFirestore(ex);
    } finally {
        btn.disabled = false;
    }
});

// ---------------------------------------------------------------
// Comparar antes y después
// ---------------------------------------------------------------
const modalComparar = $("modalComparar");
let listaComparar = [];

async function pintarComparacion() {
    for (const lado of ["Antes", "Despues"]) {
        const f = listaComparar[Number($("comp" + lado).value)];
        const img = $("compImg" + lado);
        img.removeAttribute("src");
        if (!f) continue;
        img.alt = etiquetaFoto(f);
        $("compTxt" + lado).textContent = etiquetaFoto(f);
        try {
            const u = await urlFoto(f.ruta);
            if (listaComparar[Number($("comp" + lado).value)] === f) img.src = u;
        } catch (e) {
            $("compTxt" + lado).textContent = "No se pudo cargar la foto.";
        }
    }
}

export function abrirComparar(cliente) {
    listaComparar = [...listaDe(cliente)].sort(cronologico);
    if (listaComparar.length < 2) return;
    const opciones = listaComparar.map((f, i) => `<option value="${i}">${esc(etiquetaFoto(f))}</option>`).join("");
    $("compAntes").innerHTML = opciones;
    $("compDespues").innerHTML = opciones;

    // Por defecto: la foto más antigua y la más reciente de la misma vista
    const primera = 0;
    let ultima = listaComparar.length - 1;
    for (let i = listaComparar.length - 1; i > 0; i--) {
        if (listaComparar[i].vista === listaComparar[primera].vista) { ultima = i; break; }
    }
    $("compAntes").value = String(primera);
    $("compDespues").value = String(ultima);
    modalComparar.classList.add("active");
    pintarComparacion();
}

$("compAntes").addEventListener("change", pintarComparacion);
$("compDespues").addEventListener("change", pintarComparacion);
function cerrarComparar() { modalComparar.classList.remove("active"); }
$("btnCompararCerrar").addEventListener("click", cerrarComparar);
modalComparar.addEventListener("click", (e) => { if (e.target === modalComparar) cerrarComparar(); });

// ---------------------------------------------------------------
// Teclado
// ---------------------------------------------------------------
document.addEventListener("keydown", (e) => {
    if (modalVisor.classList.contains("active")) {
        if (e.key === "Escape") cerrarVisor();
        else if (e.key === "ArrowLeft") $("btnVisorAnt").click();
        else if (e.key === "ArrowRight") $("btnVisorSig").click();
    } else if (e.key === "Escape") {
        if (modalComparar.classList.contains("active")) cerrarComparar();
        else if (modalFotos.classList.contains("active") && !$("btnCancelarFotos").disabled) cerrarModalFotos();
    }
});
