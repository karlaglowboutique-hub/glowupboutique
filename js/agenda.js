// ===== AGENDA: calendario interactivo de citas =====
// Las citas se guardan en la colección "citas". Si la cita es de un cliente registrado, solo se guarda su RUT
// (el nombre y el teléfono se leen de la ficha del cliente, no se copian). Si es una persona que aún
// no está registrada, se guarda únicamente el nombre escrito.
import { auth, db } from "./firebase-init.js";
import {
    collection, doc, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { esc, formatearRut, fechaHoyLocal, fechaBonita, mensajeErrorFirestore } from "./utils.js";

const COLECCION_CITAS = "citas";

// Sugerencias para el campo "Tipo de cita" (puedes cambiarlas; el campo acepta cualquier texto)
const TIPOS = [
    "Diagnóstico facial", "Limpieza facial", "Hidratación facial", "Peeling",
    "Control / seguimiento", "Masaje facial", "Otro"
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_CAB = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ESTADOS = { pendiente: "Pendiente", confirmada: "Confirmada", realizada: "Realizada", cancelada: "Cancelada" };
const DURACIONES = [15, 30, 45, 60, 75, 90, 120, 150, 180];

const $ = (id) => document.getElementById(id);
const modalCita = $("modalCita");
const formCita = $("formCita");

let clientes = {};          // se actualiza desde panel.js
let citas = {};             // id -> cita (solo las de la ventana de fechas cargada)
let mapaEtiquetas = {};     // "Nombre · RUT" -> rut
let alCambiar = () => {};
let mesVisible = primerDia(new Date());
let diaSeleccionado = fechaHoyLocal();
let cancelarSuscripcion = null;

// ---------------------------------------------------------------
// Fechas (siempre en hora local de Chile, nunca UTC)
// ---------------------------------------------------------------
function pad(n) { return String(n).padStart(2, "0"); }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function desdeIso(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function sumarDias(d, n) { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() + n); return r; }
function primerDia(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function minutos(hora) { const [h, m] = hora.split(":").map(Number); return h * 60 + m; }
function horaFin(hora, dur) { const t = minutos(hora) + dur; return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function fechaLarga(f) {
    const d = desdeIso(f);
    return `${cap(DIAS_LARGO[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function etiquetaRelativa(f) {
    const hoy = fechaHoyLocal();
    if (f === hoy) return "Hoy";
    if (f === iso(sumarDias(desdeIso(hoy), 1))) return "Mañana";
    const d = desdeIso(f);
    return `${DIAS_LARGO[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

// Rango de días que muestra la cuadrícula (semanas completas, lunes a domingo)
function rangoVisible() {
    const primero = primerDia(mesVisible);
    const offset = (primero.getDay() + 6) % 7;
    const ultimo = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0);
    const finOffset = 6 - ((ultimo.getDay() + 6) % 7);
    return { inicio: sumarDias(primero, -offset), fin: sumarDias(ultimo, finOffset) };
}

// Ventana de fechas que se descarga: el mes visible + los próximos 60 días (para "Próximas citas")
function ventana() {
    const { inicio, fin } = rangoVisible();
    const hoy = desdeIso(fechaHoyLocal());
    const limite = sumarDias(hoy, 60);
    return { desde: iso(inicio < hoy ? inicio : hoy), hasta: iso(fin > limite ? fin : limite) };
}

// ---------------------------------------------------------------
// Datos
// ---------------------------------------------------------------
function suscribir() {
    if (cancelarSuscripcion) cancelarSuscripcion();
    const { desde, hasta } = ventana();
    const q = query(collection(db, COLECCION_CITAS), where("fecha", ">=", desde), where("fecha", "<=", hasta));
    cancelarSuscripcion = onSnapshot(
        q,
        (snap) => {
            const nuevas = {};
            snap.forEach((d) => { nuevas[d.id] = { ...d.data(), id: d.id }; });
            citas = nuevas;
            $("errorAgenda").textContent = "";
            renderTodo();
            alCambiar();
        },
        (err) => {
            console.error(err);
            $("errorAgenda").textContent = err && err.code === "permission-denied"
                ? "No se pudo leer la agenda. Falta publicar las reglas de Firestore para “citas” (ver la guía)."
                : mensajeErrorFirestore(err);
        }
    );
}

function irAMes(fechaIso) {
    const d = desdeIso(fechaIso);
    const nuevo = new Date(d.getFullYear(), d.getMonth(), 1);
    if (nuevo.getTime() !== mesVisible.getTime()) {
        mesVisible = nuevo;
        suscribir();
    }
}

export function iniciarAgenda({ alCambiar: cb } = {}) {
    if (cb) alCambiar = cb;
    $("listaTiposCita").innerHTML = TIPOS.map((t) => `<option value="${esc(t)}"></option>`).join("");
    suscribir();
    renderTodo();
}

export function actualizarClientesAgenda(c) {
    clientes = c || {};
    mapaEtiquetas = {};
    const ordenados = Object.values(clientes).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
    $("listaClientesCita").innerHTML = ordenados.map((cl) => {
        const e = etiqueta(cl);
        mapaEtiquetas[e] = cl.rut;
        return `<option value="${esc(e)}"></option>`;
    }).join("");
    renderTodo();
}

function etiqueta(cl) { return `${cl.nombre} · ${formatearRut(cl.rut)}`; }

function nombreDe(c) {
    if (c.clienteRut) {
        const cl = clientes[c.clienteRut];
        return cl ? cl.nombre : `Cliente (${formatearRut(c.clienteRut)})`;
    }
    return c.nombreLibre || "Sin nombre";
}

function claseEstado(e) { return ESTADOS[e] ? e : "pendiente"; }
function ordenar(a, b) { return (a.fecha + a.hora).localeCompare(b.fecha + b.hora); }

function citasPorDia() {
    const mapa = {};
    Object.values(citas).sort(ordenar).forEach((c) => { (mapa[c.fecha] = mapa[c.fecha] || []).push(c); });
    return mapa;
}

// ---------------------------------------------------------------
// Dibujo del calendario
// ---------------------------------------------------------------
function renderMes() {
    $("tituloMes").textContent = `${MESES[mesVisible.getMonth()]} ${mesVisible.getFullYear()}`;
    const { inicio, fin } = rangoVisible();
    const hoy = fechaHoyLocal();
    const porDia = citasPorDia();

    let html = DIAS_CAB.map((d) => `<div class="cal-cab">${d}</div>`).join("");
    for (let d = inicio; d <= fin; d = sumarDias(d, 1)) {
        const f = iso(d);
        const activas = (porDia[f] || []).filter((c) => c.estado !== "cancelada");
        const clases = ["cal-dia"];
        if (d.getMonth() !== mesVisible.getMonth()) clases.push("otro-mes");
        if (f === hoy) clases.push("hoy");
        if (f === diaSeleccionado) clases.push("sel");

        const chips = activas.slice(0, 2).map((c) =>
            `<span class="cal-chip est-${claseEstado(c.estado)}">${esc(c.hora)} ${esc(nombreDe(c))}</span>`
        ).join("");
        const mas = activas.length > 2 ? `<span class="cal-mas">+${activas.length - 2} más</span>` : "";
        const cuenta = activas.length ? `<span class="cal-count">${activas.length}</span>` : "";
        const aria = `${d.getDate()} de ${MESES[d.getMonth()]}${activas.length ? `, ${activas.length} cita${activas.length > 1 ? "s" : ""}` : ""}`;

        html += `<button type="button" class="${clases.join(" ")}" data-fecha="${f}" aria-label="${esc(aria)}"${f === diaSeleccionado ? ' aria-current="date"' : ""}>
            <span class="cal-num">${d.getDate()}</span>${chips}${mas}${cuenta}
        </button>`;
    }
    $("calGrid").innerHTML = html;
}

function enlaceWhatsApp(c) {
    const cl = clientes[c.clienteRut];
    if (!cl || !cl.telefono) return "";
    let n = String(cl.telefono).replace(/\D/g, "");
    if (n.length === 9 && n.startsWith("9")) n = "56" + n;
    if (!(n.length === 11 && n.startsWith("569"))) return "";
    const primerNombre = (cl.nombre || "").split(" ")[0];
    const msg = `Hola ${primerNombre}, te recordamos tu cita en Glow Up Boutique el ${fechaLarga(c.fecha).toLowerCase()} a las ${c.hora}. ¡Te esperamos!`;
    return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
}

function tarjetaCita(c) {
    const e = claseEstado(c.estado);
    const wsp = (e === "pendiente" || e === "confirmada") ? enlaceWhatsApp(c) : "";
    return `
    <div class="cita-card est-borde-${e}">
        <div class="cita-card-top">
            <strong class="cita-hora">${esc(c.hora)} – ${esc(horaFin(c.hora, c.duracion))}</strong>
            <span class="est est-${e}">${ESTADOS[e]}</span>
        </div>
        <div class="cita-nombre">${esc(nombreDe(c))}</div>
        ${c.tipo ? `<div class="cita-tipo">${esc(c.tipo)}</div>` : ""}
        ${c.notas ? `<p class="texto-libre cita-notas">${esc(c.notas)}</p>` : ""}
        <div class="card-acciones">
            ${wsp ? `<a class="btn-wsp" href="${wsp}" target="_blank" rel="noopener">Recordar por WhatsApp</a>` : ""}
            ${e === "pendiente" ? `<button type="button" class="btn-edit" data-accion="estado" data-estado="confirmada" data-id="${esc(c.id)}">Confirmar</button>` : ""}
            ${(e === "pendiente" || e === "confirmada") ? `<button type="button" class="btn-edit" data-accion="estado" data-estado="realizada" data-id="${esc(c.id)}">Marcar realizada</button>
            <button type="button" class="btn-delete" data-accion="estado" data-estado="cancelada" data-id="${esc(c.id)}">Cancelar cita</button>` : ""}
            ${e === "cancelada" ? `<button type="button" class="btn-edit" data-accion="estado" data-estado="pendiente" data-id="${esc(c.id)}">Reabrir</button>` : ""}
            <button type="button" class="btn-ver" data-accion="editar" data-id="${esc(c.id)}">Editar</button>
        </div>
    </div>`;
}

function renderDia() {
    $("tituloDia").textContent = fechaLarga(diaSeleccionado);
    const lista = citasPorDia()[diaSeleccionado] || [];
    $("listaDia").innerHTML = lista.length
        ? lista.map(tarjetaCita).join("")
        : '<div class="lista-vacia">No hay citas este día.</div>';
}

function renderProximas() {
    const hoy = fechaHoyLocal();
    const lista = Object.values(citas)
        .filter((c) => c.fecha >= hoy && (c.estado === "pendiente" || c.estado === "confirmada"))
        .sort(ordenar)
        .slice(0, 8);
    $("listaProximas").innerHTML = lista.length
        ? lista.map((c) => `
            <button type="button" class="proxima" data-fecha="${esc(c.fecha)}">
                <span class="proxima-fecha">${esc(etiquetaRelativa(c.fecha))}<br><strong>${esc(c.hora)}</strong></span>
                <span class="proxima-datos"><strong>${esc(nombreDe(c))}</strong><span>${esc(c.tipo || "Cita")}</span></span>
                <span class="est est-${claseEstado(c.estado)}">${ESTADOS[claseEstado(c.estado)]}</span>
            </button>`).join("")
        : '<div class="lista-vacia">No hay citas próximas.</div>';
}

function renderTodo() {
    renderMes();
    renderDia();
    renderProximas();
}

// Resumen para la ficha de un cliente (lo usa panel.js)
export function htmlProximasCitas(rut) {
    const hoy = fechaHoyLocal();
    const lista = Object.values(citas)
        .filter((c) => c.clienteRut === rut && c.fecha >= hoy && (c.estado === "pendiente" || c.estado === "confirmada"))
        .sort(ordenar)
        .slice(0, 4);
    if (!lista.length) return '<p class="nota-auto">No tiene citas próximas.</p>';
    return `<div class="citas-mini">${lista.map((c) => `
        <div class="cita-mini">
            <strong>${esc(fechaBonita(c.fecha))} · ${esc(c.hora)}</strong>
            <span>${esc(c.tipo || "Cita")}</span>
            <em class="est est-${claseEstado(c.estado)}">${ESTADOS[claseEstado(c.estado)]}</em>
        </div>`).join("")}</div>`;
}

// ---------------------------------------------------------------
// Navegación y clics
// ---------------------------------------------------------------
function seleccionarDia(f) {
    diaSeleccionado = f;
    irAMes(f);
    renderTodo();
    const celda = document.querySelector(`.cal-dia[data-fecha="${f}"]`);
    if (celda) celda.focus();
}

$("calGrid").addEventListener("click", (e) => {
    const btn = e.target.closest(".cal-dia");
    if (btn) seleccionarDia(btn.dataset.fecha);
});
$("calGrid").addEventListener("dblclick", (e) => {
    const btn = e.target.closest(".cal-dia");
    if (btn) abrirModal(null, { fecha: btn.dataset.fecha });
});

$("btnMesAnt").addEventListener("click", () => cambiarMes(-1));
$("btnMesSig").addEventListener("click", () => cambiarMes(1));
function cambiarMes(delta) {
    mesVisible = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + delta, 1);
    const hoy = fechaHoyLocal();
    const sel = desdeIso(diaSeleccionado);
    if (sel.getMonth() !== mesVisible.getMonth() || sel.getFullYear() !== mesVisible.getFullYear()) {
        const hoyD = desdeIso(hoy);
        diaSeleccionado = (hoyD.getMonth() === mesVisible.getMonth() && hoyD.getFullYear() === mesVisible.getFullYear())
            ? hoy : iso(mesVisible);
    }
    suscribir();
    renderTodo();
}

$("btnHoy").addEventListener("click", () => {
    diaSeleccionado = fechaHoyLocal();
    mesVisible = primerDia(new Date());
    suscribir();
    renderTodo();
});

$("btnNuevaCita").addEventListener("click", () => abrirModal(null, { fecha: diaSeleccionado }));
$("btnNuevaCitaDia").addEventListener("click", () => abrirModal(null, { fecha: diaSeleccionado }));

$("listaProximas").addEventListener("click", (e) => {
    const btn = e.target.closest(".proxima");
    if (btn) seleccionarDia(btn.dataset.fecha);
});

$("listaDia").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-accion]");
    if (!btn) return;
    const c = citas[btn.dataset.id];
    if (!c) return;
    if (btn.dataset.accion === "editar") { abrirModal(c); return; }

    btn.disabled = true;
    try {
        await updateDoc(doc(db, COLECCION_CITAS, c.id), {
            estado: btn.dataset.estado,
            actualizadaPor: auth.currentUser ? auth.currentUser.uid : ""
        });
    } catch (err) {
        console.error(err);
        $("errorAgenda").textContent = mensajeErrorFirestore(err);
        btn.disabled = false;
    }
});

// ---------------------------------------------------------------
// Ventana: nueva cita / editar cita
// ---------------------------------------------------------------
function avisoCliente() {
    const txt = $("citaClienteTxt").value.trim();
    const aviso = $("citaClienteAviso");
    if (!txt) { aviso.textContent = ""; return; }
    aviso.textContent = $("citaClienteRut").value
        ? "✔ Cliente registrado: su nombre y teléfono se leen de su ficha."
        : "Persona no registrada: se guardará solo el nombre que escribas.";
}

$("citaClienteTxt").addEventListener("input", () => {
    $("citaClienteRut").value = mapaEtiquetas[$("citaClienteTxt").value.trim()] || "";
    avisoCliente();
});

function abrirModal(cita, pre = {}) {
    formCita.reset();
    $("errorCita").textContent = "";
    $("citaId").value = cita ? cita.id : "";
    $("tituloCita").textContent = cita ? "✏️ Editar cita" : "📅 Nueva cita";

    const rut = cita ? cita.clienteRut : (pre.rut || "");
    if (rut) {
        const cl = clientes[rut];
        $("citaClienteTxt").value = cl ? etiqueta(cl) : `Cliente (${formatearRut(rut)})`;
    } else {
        $("citaClienteTxt").value = cita ? (cita.nombreLibre || "") : "";
    }
    $("citaClienteRut").value = rut || "";
    avisoCliente();

    $("citaFecha").value = cita ? cita.fecha : (pre.fecha || diaSeleccionado);
    $("citaHora").value = cita ? cita.hora : "10:00";

    const dur = cita ? cita.duracion : 60;
    $("citaDuracion").innerHTML = (DURACIONES.includes(dur) ? DURACIONES : [...DURACIONES, dur].sort((a, b) => a - b))
        .map((m) => `<option value="${m}">${m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}` : m + " min"}</option>`).join("");
    $("citaDuracion").value = String(dur);

    $("citaTipo").value = cita ? (cita.tipo || "") : "";
    $("citaEstado").value = cita ? claseEstado(cita.estado) : "pendiente";
    $("citaNotas").value = cita ? (cita.notas || "") : "";

    const bEliminar = $("btnEliminarCita");
    bEliminar.hidden = !cita;
    bEliminar.dataset.confirmar = "";
    bEliminar.textContent = "Eliminar cita";

    modalCita.classList.add("active");
    $("citaClienteTxt").focus();
}

export function abrirNuevaCita({ rut = "", fecha } = {}) {
    abrirModal(null, { rut, fecha: fecha || diaSeleccionado });
}

function cerrarModal() { modalCita.classList.remove("active"); }
$("btnCancelarCita").addEventListener("click", cerrarModal);
modalCita.addEventListener("click", (e) => { if (e.target === modalCita) cerrarModal(); });
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalCita.classList.contains("active")) cerrarModal();
});

function buscarConflicto(datos, idExcluir) {
    const ini = minutos(datos.hora);
    const fin = ini + datos.duracion;
    return Object.values(citas).find((c) =>
        c.id !== idExcluir && c.fecha === datos.fecha && c.estado !== "cancelada" &&
        minutos(c.hora) < fin && ini < minutos(c.hora) + c.duracion
    );
}

formCita.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("errorCita");
    err.textContent = "";

    const rut = $("citaClienteRut").value;
    const texto = $("citaClienteTxt").value.trim();
    if (!rut && texto.length < 2) { err.textContent = "Elige un cliente de la lista o escribe el nombre de la persona."; return; }

    const fecha = $("citaFecha").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { err.textContent = "Indica la fecha de la cita."; return; }
    const hora = $("citaHora").value;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) { err.textContent = "Indica la hora de la cita."; return; }

    const id = $("citaId").value;
    const datos = {
        fecha,
        hora,
        duracion: Number($("citaDuracion").value),
        clienteRut: rut,
        nombreLibre: rut ? "" : texto,
        tipo: $("citaTipo").value.trim().slice(0, 100),
        estado: claseEstado($("citaEstado").value),
        notas: $("citaNotas").value.trim().slice(0, 500)
    };

    if (datos.estado !== "cancelada") {
        const cruce = buscarConflicto(datos, id);
        if (cruce && !confirm(`Esta hora se cruza con la cita de ${cruce.hora} (${nombreDe(cruce)}). ¿Agendar de todos modos?`)) return;
    }

    const btn = $("btnGuardarCita");
    btn.disabled = true;
    try {
        const uid = auth.currentUser ? auth.currentUser.uid : "";
        if (id) {
            await updateDoc(doc(db, COLECCION_CITAS, id), { ...datos, actualizadaPor: uid });
        } else {
            await addDoc(collection(db, COLECCION_CITAS), { ...datos, creadaPor: uid, creadaEn: serverTimestamp() });
        }
        cerrarModal();
        seleccionarDia(fecha); // muestra el día guardado (y carga su mes si hace falta)
    } catch (ex) {
        console.error(ex);
        err.textContent = mensajeErrorFirestore(ex);
    } finally {
        btn.disabled = false;
    }
});

// Eliminar: dos pasos (primer clic pide confirmación, segundo clic elimina)
$("btnEliminarCita").addEventListener("click", async () => {
    const btn = $("btnEliminarCita");
    const id = $("citaId").value;
    if (!id) return;
    if (!btn.dataset.confirmar) {
        btn.dataset.confirmar = "1";
        btn.textContent = "¿Seguro? Presiona de nuevo para eliminar";
        return;
    }
    btn.disabled = true;
    try {
        await deleteDoc(doc(db, COLECCION_CITAS, id));
        cerrarModal();
    } catch (ex) {
        console.error(ex);
        $("errorCita").textContent = mensajeErrorFirestore(ex);
    } finally {
        btn.disabled = false;
    }
});