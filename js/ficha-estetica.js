// ===== FICHA ESTÉTICA (Diagnóstico facial ANESI) =====
// Los datos que ya existen en la ficha del cliente (nombre, RUT, teléfono, correo, tipo de piel, alergias)
// se LEEN desde el cliente y se muestran automáticamente. NO se vuelven a guardar dentro de la ficha estética.
// Todo lo demás se guarda dentro del documento del cliente, en el campo "fichaEstetica".
import { auth, db, COLECCION } from "./firebase-init.js";
import {
    doc, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { esc, formatearRut, fechaHoyLocal, mensajeErrorFirestore } from "./utils.js";

const $ = (id) => document.getElementById(id);
const overlay = $("vistaFichaEstetica");
const form = $("formFichaEstetica");
const panelView = $("panelView");

// Códigos de la leyenda de la hoja ANESI (se marcan sobre el dibujo del rostro)
const CODIGOS = [
    ["H", "Deshidratación"], ["N", "Desnutrición"], ["AT", "Atonía cutánea"], ["EO", "Edema orbicular"],
    ["HS", "Hiperseborrea"], ["AC", "Acné"], ["CC", "Cicatrices"], ["M", "Manchas cutáneas"],
    ["D", "Dermatitis"], ["AL", "Alergias"], ["CO", "Couperosis"], ["S", "Piel sensible"]
];
const MAX_SEGUIMIENTO = 8; // la hoja tiene del 2º al 9º estudio

let rutActual = null;
let lectura = false;
let modificada = false;

$("feCodigos").innerHTML = CODIGOS.map(([c, t]) =>
    `<label class="chip-codigo"><input type="checkbox" class="fe-codigo" value="${c}"><strong>${c}</strong><span>${t}</span></label>`
).join("");

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
function marcar(selector, lista) {
    const valores = Array.isArray(lista) ? lista : [];
    document.querySelectorAll(selector).forEach((chk) => { chk.checked = valores.includes(chk.value); });
}

function marcados(selector) {
    return [...document.querySelectorAll(selector + ":checked")].map((c) => c.value);
}

function tieneAlergias(texto) {
    const t = String(texto || "").trim().toLowerCase().replace(/[.\s]+$/g, "");
    if (!t) return false;
    return !/^(ninguna?|no|no tiene|no presenta|sin alergias|ninguna conocida|n\/a|no aplica|-|—)$/.test(t);
}

function validarDiagnostico(dx) {
    if (dx.length === 0) return "Selecciona al menos un estado de la piel en el 1º estudio.";
    const t = (v) => dx.includes(v);
    if (t("Normal") && (t("Grasa") || t("Seca") || t("Mixta"))) return "“Normal” no puede combinarse con Grasa, Seca o Mixta.";
    if (t("Mixta") && (t("Grasa") || t("Seca"))) return "“Mixta” no puede combinarse con Grasa o Seca.";
    if (t("Grasa") && t("Seca")) return "Grasa y Seca a la vez: usa “Mixta”.";
    return "";
}

// ---------------------------------------------------------------
// Estudios de seguimiento (2º al 9º)
// ---------------------------------------------------------------
function filaEstudio(n, fecha, notas) {
    return `
    <div class="estudio-card" data-n="${n}">
        <h4>${n}º ESTUDIO</h4>
        <div class="form-group-inline">
            <label for="feEstFecha${n}">Fecha:</label>
            <input type="date" id="feEstFecha${n}" class="input-print fe-est-fecha" value="${esc(fecha || "")}">
        </div>
        <div class="form-group-inline">
            <label for="feEstNotas${n}">Notas / tratamiento:</label>
            <textarea id="feEstNotas${n}" class="input-print fe-est-notas" rows="3">${esc(notas || "")}</textarea>
        </div>
    </div>`;
}

function leerEstudios() {
    return [...document.querySelectorAll("#feEstudios .estudio-card")].map((card) => ({
        fecha: card.querySelector(".fe-est-fecha").value,
        notas: card.querySelector(".fe-est-notas").value.trim()
    }));
}

function renderEstudios(lista) {
    $("feEstudios").innerHTML = lista.map((e, i) => filaEstudio(i + 2, e.fecha, e.notas)).join("");
    actualizarBotonesEstudios();
}

function actualizarBotonesEstudios() {
    const cantidad = document.querySelectorAll("#feEstudios .estudio-card").length;
    $("btnAgregarEstudio").hidden = lectura || cantidad >= MAX_SEGUIMIENTO;
    $("btnQuitarEstudio").hidden = lectura || cantidad === 0;
    $("feContadorEstudios").textContent = `Estudios de seguimiento: ${cantidad} de ${MAX_SEGUIMIENTO}`;
}

$("btnAgregarEstudio").addEventListener("click", () => {
    const actuales = leerEstudios();
    if (actuales.length >= MAX_SEGUIMIENTO) return;
    actuales.push({ fecha: fechaHoyLocal(), notas: "" });
    renderEstudios(actuales);
    modificada = true;
    const ultima = document.querySelector("#feEstudios .estudio-card:last-child .fe-est-notas");
    if (ultima) ultima.focus();
});

$("btnQuitarEstudio").addEventListener("click", () => {
    const actuales = leerEstudios();
    if (actuales.length === 0) return;
    const ultimo = actuales[actuales.length - 1];
    if ((ultimo.notas) && !confirm("Se eliminará el último estudio con sus notas. ¿Continuar?")) return;
    actuales.pop();
    renderEstudios(actuales);
    modificada = true;
});

// ---------------------------------------------------------------
// Abrir / cerrar
// ---------------------------------------------------------------
function aplicarModo() {
    form.querySelectorAll("input, textarea, select").forEach((el) => {
        if (el.type === "hidden") return;
        if (el.type === "checkbox") el.disabled = lectura;
        else el.readOnly = lectura || el.dataset.fijo === "1"; // los datos del cliente nunca se editan aquí
    });
    $("btnGuardarFE").hidden = lectura;
    actualizarBotonesEstudios();
}

export function abrirFichaEstetica(cliente, modo = "editar") {
    if (!cliente) return;
    rutActual = cliente.rut;
    lectura = modo === "ver";
    form.reset();
    $("errorFE").textContent = "";

    // 1) Datos que YA están registrados: se leen del cliente, no se copian
    $("feNombre").value = cliente.nombre || "";
    $("feRut").value = formatearRut(cliente.rut);
    $("feTelefono").value = cliente.telefono || "";
    $("feEmail").value = cliente.email || "";

    // 2) Datos propios de la ficha estética
    const fe = cliente.fichaEstetica || null;
    const h = (fe && fe.habitos) || {};
    const e1 = (fe && fe.estudio1) || {};
    const consejo = (fe && fe.consejo) || {};

    $("feNacimiento").value = (fe && fe.nacimiento) || "";
    $("feDireccion").value = (fe && fe.direccion) || "";
    $("feLimpieza").value = h.limpieza || "";
    $("feManana").value = h.manana || "";
    $("feNoche").value = h.noche || "";
    $("fePuntuales").value = h.puntuales || "";
    $("feTratamientosPrevios").value = (fe && fe.tratamientosPrevios) || "";
    $("feFrecuencia").value = (fe && fe.frecuencia) || "";
    $("feSientePiel").value = (fe && fe.sientePiel) || "";
    $("fePreocupacion").value = (fe && fe.preocupacion) || "";

    $("feEstudio1Fecha").value = e1.fecha || fechaHoyLocal();
    marcar(".fe-diag", e1.diagnostico);
    marcar(".fe-tacto", e1.tactoGrosor);
    marcar(".fe-lineas", e1.lineasExpresion);
    marcar(".fe-manchas", e1.manchas);
    marcar(".fe-codigo", e1.codigos);
    $("feZonas").value = e1.zonas || "";

    $("feCabina").value = consejo.cabina || "";
    $("feHigiene").value = consejo.higiene || "";
    $("feCuidadoDiario").value = consejo.cuidadoDiario || "";
    $("feEspecificos").value = consejo.especificos || "";

    // 3) Ficha nueva: se marca automáticamente lo que ya sabemos del cliente (editable)
    const nota = $("feNotaAuto");
    nota.hidden = true;
    if (!fe) {
        const auto = [];
        document.querySelectorAll(".fe-diag").forEach((chk) => {
            if (chk.value === cliente.piel) { chk.checked = true; auto.push(`tipo de piel “${cliente.piel}”`); }
        });
        if (tieneAlergias(cliente.alergias)) {
            const al = document.querySelector('.fe-codigo[value="AL"]');
            if (al) { al.checked = true; auto.push("alergias registradas"); }
        }
        if (auto.length) {
            nota.textContent = `Se marcó automáticamente según los datos del cliente (${auto.join(" y ")}). Puedes cambiarlo.`;
            nota.hidden = false;
        }
    }

    renderEstudios(Array.isArray(fe && fe.estudios) ? fe.estudios : []);
    aplicarModo();

    $("modoFE").textContent = lectura ? "Solo lectura" : (fe ? "Editando ficha estética" : "Nueva ficha estética");
    modificada = false;
    panelView.hidden = true;
    overlay.classList.add("active");
    overlay.scrollTop = 0;
}

function cerrar() {
    overlay.classList.remove("active");
    panelView.hidden = false;
    modificada = false;
}

form.addEventListener("input", () => { modificada = true; });
form.addEventListener("change", () => { modificada = true; });

$("btnCerrarFE").addEventListener("click", () => {
    if (!lectura && modificada && !confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) return;
    cerrar();
});
$("btnImprimirFE").addEventListener("click", () => window.print());

// ---------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------
function validar() {
    const hoy = fechaHoyLocal();
    if (!$("feEstudio1Fecha").value) return "Indica la fecha del 1º estudio.";

    const nac = $("feNacimiento").value;
    if (nac && (nac > hoy || nac < "1900-01-01")) return "La fecha de nacimiento no es válida.";

    const errDx = validarDiagnostico(marcados(".fe-diag"));
    if (errDx) return errDx;

    const estudios = leerEstudios();
    for (let i = 0; i < estudios.length; i++) {
        if (!estudios[i].fecha || !estudios[i].notas) {
            return `Completa la fecha y las notas del ${i + 2}º estudio, o quítalo.`;
        }
    }
    return "";
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (lectura) return; // evita guardar con Enter en modo "Ver"

    const err = validar();
    if (err) { $("errorFE").textContent = err; return; }

    const hoy = fechaHoyLocal();
    const uid = auth.currentUser ? auth.currentUser.uid : "";
    const ficha = {
        nacimiento: $("feNacimiento").value,
        direccion: $("feDireccion").value.trim(),
        habitos: {
            limpieza: $("feLimpieza").value.trim(),
            manana: $("feManana").value.trim(),
            noche: $("feNoche").value.trim(),
            puntuales: $("fePuntuales").value.trim()
        },
        tratamientosPrevios: $("feTratamientosPrevios").value.trim(),
        frecuencia: $("feFrecuencia").value.trim(),
        sientePiel: $("feSientePiel").value.trim(),
        preocupacion: $("fePreocupacion").value.trim(),
        estudio1: {
            fecha: $("feEstudio1Fecha").value,
            diagnostico: marcados(".fe-diag"),
            tactoGrosor: marcados(".fe-tacto"),
            lineasExpresion: marcados(".fe-lineas"),
            manchas: marcados(".fe-manchas"),
            codigos: marcados(".fe-codigo"),
            zonas: $("feZonas").value.trim()
        },
        consejo: {
            cabina: $("feCabina").value.trim(),
            higiene: $("feHigiene").value.trim(),
            cuidadoDiario: $("feCuidadoDiario").value.trim(),
            especificos: $("feEspecificos").value.trim()
        },
        estudios: leerEstudios(),
        actualizadaPor: uid,
        actualizadaEn: hoy
    };

    const btn = $("btnGuardarFE");
    btn.disabled = true;
    $("errorFE").textContent = "";
    try {
        await runTransaction(db, async (tx) => {
            const ref = doc(db, COLECCION, rutActual);
            const snap = await tx.get(ref);
            if (!snap.exists()) throw new Error("El cliente ya no existe.");
            const previa = snap.data().fichaEstetica || {};
            ficha.creadaPor = previa.creadaPor || uid;     // se conserva quién y cuándo la creó
            ficha.creadaEn = previa.creadaEn || hoy;
            tx.update(ref, { fichaEstetica: ficha });
        });
        cerrar(); // la ficha del cliente se actualiza sola
    } catch (ex) {
        console.error(ex);
        $("errorFE").textContent = mensajeErrorFirestore(ex);
    } finally {
        btn.disabled = false;
    }
});
