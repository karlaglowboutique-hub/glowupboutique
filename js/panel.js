// ===== PANEL CLÍNICO (panel.html) =====
import { db, COLECCION } from "./firebase-init.js";
import { requerirSesion, cerrarSesion } from "./auth-guard.js";
import {
    collection, doc, onSnapshot, getDoc, setDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    esc, validarRut, rutClave, formatearRut, fechaHoyLocal, fechaBonita,
    nuevoId, mensajeErrorFirestore
} from "./utils.js";
import { abrirFichaEstetica } from "./ficha-estetica.js";
import { iniciarAgenda, actualizarClientesAgenda, abrirNuevaCita, htmlProximasCitas } from "./agenda.js";
import { htmlFotos, hidratarFotos, abrirSubirFotos, abrirVisor, abrirComparar } from "./fotos.js";
import { iniciarAvisos } from "./avisos.js";

const usuario = await requerirSesion();

const $ = (id) => document.getElementById(id);
const panelView = $("panelView");
const vistaFicha = $("vistaFichaCompleta");
const contenedorFicha = $("contenedorFicha");
const listaClientes = $("listaClientes");
const formDiag = $("formDiagnosticoAnesi");
const formNuevo = $("formNuevo");
const paso1 = $("paso1_datosPersonales");
const paso2 = $("paso2_datosMedicos");
const modal = $("modalEliminar");

let clientes = {};            // copia en vivo de Firestore
let rutFichaActual = null;    // cliente que se ve en la pestaña "Buscar"
let pendienteAbrir = null;    // RUT recién creado: al llegar a la caché se abre su ficha
let soloLectura = false;
let formModificado = false;
let eliminacion = null;       // { rut, id }

// ---------------------------------------------------------------
// Agenda (calendario de citas)
// ---------------------------------------------------------------
iniciarAgenda({
    alCambiar: () => { // si hay una ficha de cliente a la vista, actualiza sus "Próximas citas"
        if (rutFichaActual && clientes[rutFichaActual]) mostrarFichaCliente(clientes[rutFichaActual]);
    }
});

// Avisos de citas (notificaciones en este dispositivo)
iniciarAvisos();

// ---------------------------------------------------------------
// Datos en vivo
// ---------------------------------------------------------------
onSnapshot(
    collection(db, COLECCION),
    (snap) => {
        const nuevo = {};
        snap.forEach((d) => { nuevo[d.id] = { ...d.data(), rut: d.id }; });
        clientes = nuevo;
        actualizarClientesAgenda(clientes);
        renderListaClientes();

        if (pendienteAbrir && clientes[pendienteAbrir]) {
            const rut = pendienteAbrir;
            pendienteAbrir = null;
            rutFichaActual = rut;
            mostrarFichaCliente(clientes[rut]);
            ofrecerFichaEstetica(rut);
        } else if (rutFichaActual) {
            if (clientes[rutFichaActual]) mostrarFichaCliente(clientes[rutFichaActual]);
            else { rutFichaActual = null; contenedorFicha.innerHTML = ""; }
        }
    },
    (err) => {
        console.error(err);
        listaClientes.innerHTML = `<div class="lista-vacia">${esc(mensajeErrorFirestore(err))}</div>`;
    }
);

// ---------------------------------------------------------------
// Sesión y pestañas
// ---------------------------------------------------------------
$("btnLogout").addEventListener("click", cerrarSesion);

function activarTab(nombre) {
    document.querySelectorAll(".tab-btn").forEach((b) => {
        const activa = b.dataset.tab === nombre;
        b.classList.toggle("active", activa);
        b.setAttribute("aria-selected", activa ? "true" : "false");
    });
    document.querySelectorAll(".tab-content").forEach((c) => {
        c.classList.toggle("active", c.id === "tab-" + nombre);
    });
}
document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => activarTab(btn.dataset.tab));
});

// ---------------------------------------------------------------
// Buscar cliente
// ---------------------------------------------------------------
$("formBuscar").addEventListener("submit", (e) => {
    e.preventDefault();
    const bruto = $("buscarRut").value.trim();
    const error = $("errorBuscar");

    if (!bruto) {
        error.textContent = "Ingresa un RUT.";
        contenedorFicha.innerHTML = "";
        rutFichaActual = null;
        return;
    }
    const clave = rutClave(bruto);
    if (clientes[clave]) {
        error.textContent = "";
        rutFichaActual = clave;
        mostrarFichaCliente(clientes[clave]);
    } else {
        error.textContent = validarRut(bruto)
            ? "No se encontró un cliente con ese RUT."
            : "No se encontró el cliente y el RUT no parece válido. Revisa el número y el dígito verificador.";
        contenedorFicha.innerHTML = "";
        rutFichaActual = null;
    }
});

// ---------------------------------------------------------------
// Cliente nuevo (asistente de 2 pasos)
// ---------------------------------------------------------------
const msgNuevo = $("msgNuevo");

function mensajeNuevo(texto, tipo) {
    msgNuevo.textContent = texto;
    msgNuevo.className = tipo === "ok" ? "success-msg" : "error-msg";
}

function irPaso(n) {
    paso1.hidden = n !== 1;
    paso2.hidden = n !== 2;
    mensajeNuevo("", "error");
    if (n === 1) $("nNombre").focus(); else $("nAlergias").focus();
}

function validarPaso1() {
    if ($("nNombre").value.trim().length < 3) return "Ingresa el nombre completo.";
    if (!validarRut($("nRut").value)) return "El RUT no es válido. Revisa el número y el dígito verificador.";
    const edad = Number($("nEdad").value);
    if ($("nEdad").value === "" || !Number.isInteger(edad) || edad < 0 || edad > 120) return "La edad debe ser un número entero entre 0 y 120.";
    if (!/^\+?[\d\s-]{8,15}$/.test($("nTelefono").value.trim())) return "El teléfono no es válido. Ejemplo: +56 9 1234 5678.";
    if (!$("nEmail").value.trim() || !$("nEmail").checkValidity()) return "El correo no es válido.";
    return "";
}

function validarPaso2() {
    if (!$("nAlergias").value.trim()) return "Indica las alergias (si no tiene, escribe “Ninguna”).";
    if (!$("nMorbidos").value.trim()) return "Indica enfermedades previas o actuales (si no tiene, escribe “Ninguna”).";
    if (!$("nMedicamentos").value.trim()) return "Indica los medicamentos actuales (si no toma, escribe “Ninguno”).";
    if (!$("nEmbarazo").value) return "Responde si hay embarazo o lactancia.";
    if (!$("nPiel").value) return "Selecciona el tipo de piel.";
    if (!$("nFototipo").value) return "Selecciona el fototipo.";
    if (!$("nCirugias").value.trim()) return "Indica cirugías estéticas previas (si no hay, escribe “Ninguna”).";
    if (!$("nConsentimiento").checked) return "Debes confirmar el consentimiento del cliente.";
    return "";
}

$("btnVolverPaso1").addEventListener("click", () => irPaso(1));
formNuevo.addEventListener("input", () => { msgNuevo.textContent = ""; });

formNuevo.addEventListener("submit", async (e) => {
    e.preventDefault(); // el formulario tiene novalidate: validamos nosotros, en ambos pasos

    if (!paso1.hidden) { // Enter o botón "Siguiente"
        const err = validarPaso1();
        if (err) { mensajeNuevo(err, "error"); return; }
        irPaso(2);
        return;
    }

    const err1 = validarPaso1();
    if (err1) { irPaso(1); mensajeNuevo(err1, "error"); return; }
    const err2 = validarPaso2();
    if (err2) { mensajeNuevo(err2, "error"); return; }

    const clave = rutClave($("nRut").value);
    const btn = $("btnGuardarNuevo");
    btn.disabled = true;
    try {
        const ref = doc(db, COLECCION, clave);
        if ((await getDoc(ref)).exists()) {   // comprobación en el servidor, no en la caché
            mensajeNuevo("Ya existe un cliente con ese RUT.", "error");
            return;
        }
        await setDoc(ref, {
            nombre: $("nNombre").value.trim(),
            edad: String($("nEdad").value),
            telefono: $("nTelefono").value.trim(),
            email: $("nEmail").value.trim(),
            alergias: $("nAlergias").value.trim(),
            morbidos: $("nMorbidos").value.trim(),
            medicamentos: $("nMedicamentos").value.trim(),
            embarazo: $("nEmbarazo").value,
            piel: $("nPiel").value,
            fototipo: $("nFototipo").value,
            cirugias: $("nCirugias").value.trim(),
            consentimiento: true,
            fechaConsentimiento: serverTimestamp(), // hora del servidor, no del equipo
            creadoPor: usuario.uid,
            atenciones: []
        });
        formNuevo.reset();
        paso2.hidden = true;
        paso1.hidden = false;
        mensajeNuevo("", "ok");
        activarTab("buscar");
        $("buscarRut").value = formatearRut(clave);
        $("errorBuscar").textContent = "";
        pendienteAbrir = clave;                // se abrirá la ficha apenas llegue a la caché
        if (clientes[clave]) {                 // por si ya llegó
            const rut = pendienteAbrir; pendienteAbrir = null;
            rutFichaActual = rut;
            mostrarFichaCliente(clientes[rut]);
            ofrecerFichaEstetica(rut);
        }
    } catch (err) {
        console.error(err);
        mensajeNuevo(mensajeErrorFirestore(err), "error");
    } finally {
        btn.disabled = false;
    }
});

// ---------------------------------------------------------------
// Lista de clientes
// ---------------------------------------------------------------
$("filtroLista").addEventListener("input", renderListaClientes);

function renderListaClientes() {
    const filtro = $("filtroLista").value.trim().toLowerCase();
    const filtroRut = filtro.replace(/[^0-9k]/g, "");

    let lista = Object.values(clientes).sort((a, b) =>
        (a.nombre || "").localeCompare(b.nombre || "", "es")
    );
    if (filtro) {
        lista = lista.filter((c) =>
            (c.nombre || "").toLowerCase().includes(filtro) ||
            (filtroRut && c.rut.replace(/[^0-9K]/g, "").toLowerCase().includes(filtroRut))
        );
    }

    if (lista.length === 0) {
        listaClientes.innerHTML = `<div class="lista-vacia">${
            Object.keys(clientes).length === 0 ? "Sin clientes." : "Sin resultados."
        }</div>`;
        return;
    }

    listaClientes.innerHTML = lista.map((c) => `
        <div class="cliente-card">
            <div class="info">
                <strong>${esc(c.nombre)}</strong>
                <span>RUT: ${esc(formatearRut(c.rut))} · Atenciones: ${Array.isArray(c.atenciones) ? c.atenciones.length : 0}</span>
            </div>
            <button type="button" class="btn-ver" data-rut="${esc(c.rut)}">Ver ficha</button>
        </div>
    `).join("");
}

listaClientes.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-ver");
    if (!btn || !clientes[btn.dataset.rut]) return;
    const c = clientes[btn.dataset.rut];
    activarTab("buscar");
    $("buscarRut").value = formatearRut(c.rut);
    $("errorBuscar").textContent = "";
    rutFichaActual = c.rut;
    mostrarFichaCliente(c);
});

// ---------------------------------------------------------------
// Ficha del cliente + historial
// ---------------------------------------------------------------
function item(titulo, valor, ancho = false) {
    return `<div class="ficha-item${ancho ? " ficha-full" : ""}"><span>${esc(titulo)}</span><strong>${esc(valor || "—")}</strong></div>`;
}

function mostrarFichaCliente(c) {
    const atenciones = Array.isArray(c.atenciones) ? c.atenciones : [];

    const historial = atenciones.length === 0
        ? '<div class="lista-vacia">No hay atenciones registradas.</div>'
        : [...atenciones].reverse().map((at) => `
            <div class="atencion-card">
                <div class="atencion-card-header">
                    <strong>Diagnóstico</strong>
                    <span>${esc(fechaBonita(at.fecha))}</span>
                </div>
                <div class="atencion-info-grid">
                    <div><span>Piel observada:</span> ${esc(at.tipoPiel || "—")}</div>
                    <div class="ocupa-todo"><span>Observaciones / tratamiento:</span><p class="texto-libre">${esc(at.observaciones || "—")}</p></div>
                </div>
                <div class="card-acciones">
                    <button type="button" class="btn-ver" data-accion="ver" data-id="${esc(at.id)}">Ver</button>
                    <button type="button" class="btn-edit" data-accion="editar" data-id="${esc(at.id)}">Editar</button>
                    <button type="button" class="btn-delete" data-accion="eliminar" data-id="${esc(at.id)}">Eliminar</button>
                </div>
            </div>`).join("");

    const fe = c.fichaEstetica;
    const seccionFE = fe ? `
            <h4>Ficha estética</h4>
            <div class="fe-resumen">
                <div class="fe-resumen-datos">
                    <strong>Ficha estética creada</strong>
                    <span>Creada el ${esc(fechaBonita(fe.creadaEn))} · 1º estudio: ${esc(fechaBonita(fe.estudio1 && fe.estudio1.fecha))} · Estudios de seguimiento: ${Array.isArray(fe.estudios) ? fe.estudios.length : 0} de 8</span>
                </div>
                <div class="fe-resumen-acciones">
                    <button type="button" class="btn-ver" data-accion="fe-ver">Ver</button>
                    <button type="button" class="btn-edit" data-accion="fe-editar">Editar / agregar estudio</button>
                </div>
            </div>` : `
            <h4>Ficha estética</h4>
            <div class="fe-resumen fe-vacia">
                <div class="fe-resumen-datos">
                    <strong>Aún no tiene ficha estética</strong>
                    <span>Se completa sola con los datos que ya están registrados.</span>
                </div>
                <div class="fe-resumen-acciones">
                    <button type="button" class="btn-primary btn-inline" data-accion="fe-crear">Crear ficha estética</button>
                </div>
            </div>`;

    contenedorFicha.innerHTML = `
        <div class="ficha">
            <div class="ficha-header">
                <div>
                    <h3>Ficha: ${esc(c.nombre)}</h3>
                    <p>RUT: ${esc(formatearRut(c.rut))}</p>
                </div>
                <div class="ficha-acciones-header">
                    <button type="button" class="btn-primary btn-inline" data-accion="agendar">📅 Agendar cita</button>
                    <button type="button" class="btn-primary btn-inline" data-accion="nuevo">➕ Nuevo diagnóstico</button>
                </div>
            </div>

            <h4>Contacto</h4>
            <div class="ficha-grid">
                ${item("Edad", c.edad ? c.edad + " años" : "")}
                ${item("Teléfono", c.telefono)}
                ${item("Email", c.email, true)}
            </div>

            <h4>Antecedentes</h4>
            <div class="ficha-grid">
                ${item("Alergias", c.alergias, true)}
                ${item("Enfermedades", c.morbidos)}
                ${item("Medicamentos", c.medicamentos)}
                ${item("Embarazo / lactancia", c.embarazo)}
                ${item("Tipo de piel", c.piel)}
                ${item("Fototipo", c.fototipo)}
                ${item("Cirugías previas", c.cirugias)}
            </div>
            ${seccionFE}

            <h4>Próximas citas</h4>
            ${htmlProximasCitas(c.rut)}

            ${htmlFotos(c)}
        </div>

        <div class="historial-container">
            <h4>Historial de atenciones</h4>
            ${historial}
        </div>`;
    hidratarFotos(contenedorFicha); // carga las miniaturas de las fotos
}

contenedorFicha.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-accion]");
    if (!btn || !rutFichaActual) return;
    const { accion, id } = btn.dataset;
    if (accion === "agendar") abrirNuevaCita({ rut: rutFichaActual });
    else if (accion === "nuevo") abrirFichaAnesi(rutFichaActual, null, false);
    else if (accion === "ver") abrirFichaAnesi(rutFichaActual, id, true);
    else if (accion === "editar") abrirFichaAnesi(rutFichaActual, id, false);
    else if (accion === "eliminar") abrirModalEliminar(rutFichaActual, id);
    else if (accion === "fe-crear" || accion === "fe-editar") abrirFichaEstetica(clientes[rutFichaActual], "editar");
    else if (accion === "fe-ver") abrirFichaEstetica(clientes[rutFichaActual], "ver");
    else if (accion === "fotos-subir") abrirSubirFotos(clientes[rutFichaActual]);
    else if (accion === "fotos-comparar") abrirComparar(clientes[rutFichaActual]);
    else if (accion === "foto-ver") abrirVisor(clientes[rutFichaActual], id);
});

// ---------------------------------------------------------------
// Ficha de diagnóstico
// ---------------------------------------------------------------
function aplicarModo(lectura) {
    soloLectura = lectura;
    formDiag.querySelectorAll("input, textarea, select").forEach((el) => {
        if (el.type === "hidden") return;
        if (el.tagName === "SELECT") el.disabled = lectura;
        else el.readOnly = lectura || el.dataset.fijo === "1"; // los datos base nunca se editan aquí
    });
    $("btnGuardarDiag").hidden = lectura;
    $("modoFicha").textContent = lectura ? "Solo lectura" : "";
}

function abrirFichaAnesi(rut, idAtencion, lectura) {
    const c = clientes[rut];
    if (!c) return;
    const atenciones = Array.isArray(c.atenciones) ? c.atenciones : [];
    const at = idAtencion ? atenciones.find((a) => a.id === idAtencion) : null;
    if (idAtencion && !at) return;

    formDiag.reset();
    $("errorDiag").textContent = "";
    $("diagRut").value = rut;
    $("diagId").value = at ? at.id : "";

    $("dNombre").value = c.nombre || "";
    $("dTelefono").value = c.telefono || "";
    $("dAlergias").value = c.alergias || "—";
    $("dMorbidos").value = c.morbidos || "—";
    $("dMedicamentos").value = c.medicamentos || "—";
    $("dPiel").value = c.piel || "—";
    $("dFototipo").value = c.fototipo || "—";
    $("dCirugias").value = c.cirugias || "—";

    $("diagTipoPiel").value = (at && at.tipoPiel) || c.piel || "Normal";
    if ($("diagTipoPiel").value === "") $("diagTipoPiel").value = "Normal";
    $("diagObservaciones").value = at ? (at.observaciones || "") : "";

    aplicarModo(lectura);
    formModificado = false;
    panelView.hidden = true;
    vistaFicha.classList.add("active");
    vistaFicha.scrollTop = 0;
}

function cerrarFicha() {
    vistaFicha.classList.remove("active");
    panelView.hidden = false;
    formModificado = false;
}

formDiag.addEventListener("input", () => { formModificado = true; });
formDiag.addEventListener("change", () => { formModificado = true; });

$("btnCerrarFicha").addEventListener("click", () => {
    if (!soloLectura && formModificado && !confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) return;
    cerrarFicha();
});
$("btnImprimir").addEventListener("click", () => window.print());

async function modificarAtenciones(rut, fn) {
    const ref = doc(db, COLECCION, rut);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("El cliente ya no existe.");
        const actuales = Array.isArray(snap.data().atenciones) ? [...snap.data().atenciones] : [];
        tx.update(ref, { atenciones: fn(actuales) });
    });
}

formDiag.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (soloLectura) return; // evita guardar con Enter en modo "Ver"

    const rut = $("diagRut").value;
    const diagId = $("diagId").value;
    const c = clientes[rut];
    if (!c) return;

    const observaciones = $("diagObservaciones").value.trim();
    if (!observaciones) {
        $("errorDiag").textContent = "Escribe las observaciones o el tratamiento.";
        return;
    }

    const existente = diagId ? (c.atenciones || []).find((a) => a.id === diagId) : null;
    const atencion = {
        id: diagId || nuevoId(),
        fecha: (existente && existente.fecha) || fechaHoyLocal(), // conserva la fecha original
        tipoPiel: $("diagTipoPiel").value,
        observaciones,
        creadoPor: (existente && existente.creadoPor) || usuario.uid
    };

    const btn = $("btnGuardarDiag");
    btn.disabled = true; // evita guardar dos veces con doble clic
    $("errorDiag").textContent = "";
    try {
        await modificarAtenciones(rut, (arr) => {
            const i = arr.findIndex((a) => a.id === atencion.id);
            if (i >= 0) arr[i] = atencion; else arr.push(atencion);
            return arr;
        });
        cerrarFicha();
    } catch (err) {
        console.error(err);
        $("errorDiag").textContent = mensajeErrorFirestore(err);
    } finally {
        btn.disabled = false;
    }
});

// ---------------------------------------------------------------
// Modal: eliminar una atención
// ---------------------------------------------------------------
function abrirModalEliminar(rut, id) {
    const c = clientes[rut];
    const at = c && (c.atenciones || []).find((a) => a.id === id);
    if (!at) return;
    eliminacion = { rut, id };
    $("modalEliminarError").textContent = "";
    $("modalEliminarText").textContent =
        `¿Eliminar el diagnóstico del ${fechaBonita(at.fecha)} de ${c.nombre}? Esta acción no se puede deshacer.`;
    modal.classList.add("active");
    $("btnCancelarEliminar").focus();
}

function cerrarModal() {
    modal.classList.remove("active");
    eliminacion = null;
}
$("btnCancelarEliminar").addEventListener("click", cerrarModal);
modal.addEventListener("click", (e) => { if (e.target === modal) cerrarModal(); });

$("btnConfirmarEliminar").addEventListener("click", async () => {
    if (!eliminacion) { cerrarModal(); return; }
    const { rut, id } = eliminacion;
    const btn = $("btnConfirmarEliminar");
    btn.disabled = true;
    try {
        await modificarAtenciones(rut, (arr) => arr.filter((a) => a.id !== id));
        cerrarModal();
    } catch (err) {
        console.error(err);
        $("modalEliminarError").textContent = mensajeErrorFirestore(err);
    } finally {
        btn.disabled = false;
    }
});

// ---------------------------------------------------------------
// Después de guardar un cliente: ofrecer crear su ficha estética
// ---------------------------------------------------------------
const modalOfrecer = $("modalOfrecerFE");
let rutOfrecido = null;

function ofrecerFichaEstetica(rut) {
    const c = clientes[rut];
    if (!c) return;
    rutOfrecido = rut;
    $("ofrecerFETexto").textContent =
        `${c.nombre} quedó registrado(a). ¿Quieres crear ahora su ficha estética? Se completa sola con los datos que ya ingresaste (nombre, RUT, teléfono, correo, tipo de piel y alergias).`;
    modalOfrecer.classList.add("active");
    $("btnOfrecerFECrear").focus();
}

function cerrarOfrecer() {
    modalOfrecer.classList.remove("active");
    rutOfrecido = null;
}

$("btnOfrecerFEDespues").addEventListener("click", cerrarOfrecer);
modalOfrecer.addEventListener("click", (e) => { if (e.target === modalOfrecer) cerrarOfrecer(); });
$("btnOfrecerFECrear").addEventListener("click", () => {
    const c = clientes[rutOfrecido];
    cerrarOfrecer();
    if (c) abrirFichaEstetica(c, "editar");
});

// ---------------------------------------------------------------
// Teclado: Escape cierra el modal; "programador" abre el panel del programador
// ---------------------------------------------------------------
let teclas = "";
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOfrecer.classList.contains("active")) { cerrarOfrecer(); return; }
    if (e.key === "Escape" && modal.classList.contains("active")) { cerrarModal(); return; }

    const t = e.target.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
    if (document.querySelector(".modal-overlay.active, .vista-ficha.active")) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;

    teclas = (teclas + e.key.toLowerCase()).slice(-11);
    if (teclas === "programador") {
        teclas = "";
        location.href = "programador.html";
    }
});
