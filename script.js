// ===== USUARIO DE LOGIN =====
const USUARIO_VALIDO = { nombre: "Carla", rut: "15699047-7", password: "Carla" };

function limpiarRut(rut) { return rut.replace(/\./g, '').trim(); }
function formatearRut(rut) {
    if (rut.length <= 1) return rut;
    let cuerpo = rut.slice(0, -2);
    let dv = rut.slice(-2);
    return new Intl.NumberFormat('es-CL').format(cuerpo) + dv;
}

// ===== BASE DE DATOS =====
let clientes = JSON.parse(localStorage.getItem("clientesClinica")) || {};
function guardarClientes() { localStorage.setItem("clientesClinica", JSON.stringify(clientes)); }

// ===== ELEMENTOS =====
const loginForm = document.getElementById("loginForm");
const errorMsg = document.getElementById("errorMsg");
const loginView = document.getElementById("loginView");
const panelView = document.getElementById("panelView");
const vistaFichaCompleta = document.getElementById("vistaFichaCompleta");
const contenedorFicha = document.getElementById("contenedorFicha");
const formDiagnostico = document.getElementById("formDiagnosticoAnesi");

// Variables para el modal de eliminación
let rutAEliminar = null;
let idAEliminar = null;
let tipoEliminacion = null; // "atencion" o "cliente"

// ===== LOGIN =====
loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const nombre = document.getElementById("nombre").value.trim();
    const rut = limpiarRut(document.getElementById("rut").value);
    const password = document.getElementById("password").value;

    if (nombre.toLowerCase() === USUARIO_VALIDO.nombre.toLowerCase() && rut === USUARIO_VALIDO.rut && password === USUARIO_VALIDO.password) {
        loginView.style.display = "none";
        panelView.style.display = "block";
        errorMsg.textContent = "";
        loginForm.reset();
        renderListaClientes();
    } else {
        errorMsg.textContent = "Datos incorrectos. Usa RUT: 12345678-9 y Contraseña: 123.";
    }
});

// ===== LOGOUT =====
document.getElementById("btnLogout").addEventListener("click", () => {
    panelView.style.display = "none";
    loginView.style.display = "block";
    contenedorFicha.innerHTML = "";
});

// ===== PESTAÑAS =====
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
});

// ===== BUSCAR CLIENTE =====
document.getElementById("btnBuscar").addEventListener("click", () => {
    const rut = limpiarRut(document.getElementById("buscarRut").value);
    const errorBuscar = document.getElementById("errorBuscar");
    
    if (!rut) { errorBuscar.textContent = "Ingrese un RUT."; contenedorFicha.innerHTML = ""; return; }

    const cliente = clientes[rut];
    if (cliente) {
        errorBuscar.textContent = "";
        mostrarFichaCliente(cliente);
    } else {
        errorBuscar.textContent = "No se encontró un cliente con ese RUT.";
        contenedorFicha.innerHTML = "";
    }
});

// ===== MOSTRAR FICHA DEL CLIENTE (BASE) =====
function mostrarFichaCliente(cliente) {
    let rutBonito = formatearRut(cliente.rut);
    let historialHTML = "";
    
    if (cliente.atenciones && cliente.atenciones.length > 0) {
        const atencionesOrdenadas = [...cliente.atenciones].reverse();
        
        atencionesOrdenadas.forEach(at => {
            let diagTexto = at.diagnostico ? at.diagnostico.join(", ") : "No especificado";
            let comedonesTexto = at.comedones ? at.comedones.join(", ") : "Ninguno";

            historialHTML += `
                <div class="atencion-card">
                    <div class="atencion-card-header">
                        <strong>Diagnóstico Facial</strong>
                        <span>${at.fecha}</span>
                    </div>
                    <div class="atencion-info-grid">
                        <div><span>Tipo de Piel:</span> ${diagTexto}</div>
                        <div><span>Comedones/Manchas:</span> ${comedonesTexto}</div>
                        <div style="grid-column: 1 / -1;"><span>Tratamiento en cabina:</span> ${at.tratamientoCabina || 'N/A'}</div>
                        <div style="grid-column: 1 / -1;"><span>Tratamiento en casa:</span> ${at.higiene || 'N/A'} / ${at.cuidadoDiario || 'N/A'}</div>
                    </div>
                    <div class="card-acciones">
                        <button class="btn-ver-detalle" data-rut="${cliente.rut}" data-id="${at.id}">👁️ Ver</button>
                        <button class="btn-edit" data-rut="${cliente.rut}" data-id="${at.id}">✏️ Editar</button>
                        <button class="btn-delete" data-rut="${cliente.rut}" data-id="${at.id}">🗑️ Eliminar</button>
                    </div>
                </div>
            `;
        });
    } else {
        historialHTML = '<div class="lista-vacia">No hay atenciones registradas.</div>';
    }

    contenedorFicha.innerHTML = `
        <div class="ficha">
            <div class="ficha-header">
                <div>
                    <h3>✨ Ficha del Paciente</h3>
                    <p>Clínica Estética - Datos Base</p>
                </div>
                <div style="display: flex; gap: 10px; flex-direction: column;">
                    <button class="btn-secondary" id="btnNuevoDiag" style="margin-top: 0;">➕ Nuevo Diagnóstico</button>
                    <button class="btn-delete-cliente" style="background: #ffebee; color: #c62828; border: 1px solid #ffcdd2; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; transition: 0.2s;">🗑️ Borrar Cliente</button>
                </div>
            </div>
            
            <h4>Datos Personales</h4>
            <div class="ficha-grid">
                <div class="ficha-item"><span>Nombre Completo</span><strong>${cliente.nombre}</strong></div>
                <div class="ficha-item"><span>RUT</span><strong>${rutBonito}</strong></div>
                <div class="ficha-item"><span>Edad</span><strong>${cliente.edad} años</strong></div>
                <div class="ficha-item"><span>Teléfono</span><strong>${cliente.telefono}</strong></div>
                <div class="ficha-item ficha-full"><span>Email</span><strong>${cliente.email}</strong></div>
            </div>

            <h4>Información Base</h4>
            <div class="ficha-grid">
                <div class="ficha-item"><span>Tipo de Piel</span><strong>${cliente.piel}</strong></div>
                <div class="ficha-item"><span>Alergias</span><strong>${cliente.alergias}</strong></div>
            </div>
        </div>

        <div class="historial-container">
            <h4 style="color:#6a1b9a; font-size:16px;">📋 Historial de Diagnósticos</h4>
            ${historialHTML}
        </div>
    `;

    // Asignar eventos a los botones
    document.getElementById("btnNuevoDiag").addEventListener("click", () => abrirFichaAnesi(cliente.rut, null, false));
    
    // Botón para borrar cliente entero
    document.querySelector(".btn-delete-cliente").addEventListener("click", () => {
        abrirModalEliminar(cliente.rut, null, "cliente");
    });

    document.querySelectorAll(".btn-ver-detalle").forEach(btn => {
        btn.addEventListener("click", (e) => {
            abrirFichaAnesi(e.target.getAttribute("data-rut"), e.target.getAttribute("data-id"), true);
        });
    });

    document.querySelectorAll(".btn-edit").forEach(btn => {
        btn.addEventListener("click", (e) => {
            abrirFichaAnesi(e.target.getAttribute("data-rut"), e.target.getAttribute("data-id"), false);
        });
    });

    document.querySelectorAll(".btn-delete").forEach(btn => {
        btn.addEventListener("click", (e) => {
            abrirModalEliminar(e.target.getAttribute("data-rut"), e.target.getAttribute("data-id"), "atencion");
        });
    });
}

// ===== INGRESAR CLIENTE NUEVO =====
document.getElementById("formNuevo").addEventListener("submit", (e) => {
    e.preventDefault();
    const rut = limpiarRut(document.getElementById("nRut").value);
    const msgNuevo = document.getElementById("msgNuevo");

    if (clientes[rut]) {
        msgNuevo.style.color = "#e53935";
        msgNuevo.textContent = "Ya existe un cliente con ese RUT.";
        return;
    }

    clientes[rut] = {
        nombre: document.getElementById("nNombre").value.trim(),
        rut: rut,
        edad: document.getElementById("nEdad").value,
        telefono: document.getElementById("nTelefono").value.trim(),
        email: document.getElementById("nEmail").value.trim(),
        piel: document.getElementById("nPiel").value,
        alergias: document.getElementById("nAlergias").value.trim(),
        atenciones: []
    };

    guardarClientes();
    renderListaClientes();

    msgNuevo.style.color = "#2e7d32";
    msgNuevo.textContent = "✅ Cliente guardado exitosamente.";
    document.getElementById("formNuevo").reset();
});

// ===== LISTADO DE CLIENTES =====
const listaClientes = document.getElementById("listaClientes");
function renderListaClientes() {
    const claves = Object.keys(clientes);
    if (claves.length === 0) {
        listaClientes.innerHTML = '<div class="lista-vacia">Aún no hay clientes registrados.</div>';
        return;
    }

    listaClientes.innerHTML = "";
    claves.forEach(rutGuardado => {
        const c = clientes[rutGuardado];
        const card = document.createElement("div");
        card.className = "cliente-card";
        card.innerHTML = `
            <div class="info">
                <strong>${c.nombre}</strong>
                <span>RUT: ${formatearRut(c.rut)} | Piel: ${c.piel} | Atenciones: ${c.atenciones ? c.atenciones.length : 0}</span>
            </div>
        `;

        const btnVer = document.createElement("button");
        btnVer.className = "btn-ver";
        btnVer.textContent = "Ver Ficha";
        btnVer.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));
            document.querySelector('[data-tab="buscar"]').classList.add("active");
            document.getElementById("tab-buscar").classList.add("active");

            document.getElementById("buscarRut").value = formatearRut(c.rut);
            document.getElementById("errorBuscar").textContent = "";
            mostrarFichaCliente(c);
        });

        card.appendChild(btnVer);
        listaClientes.appendChild(card);
    });
}

// ===== ABRIR FICHA ANESI (MODO VER, EDITAR O NUEVO) =====
function abrirFichaAnesi(rut, idAtencion, soloLectura) {
    const cliente = clientes[rut];
    if (!cliente) return;

    formDiagnostico.reset();
    document.getElementById("diagRut").value = rut;
    document.getElementById("dNombre").value = cliente.nombre;
    document.getElementById("dTelefono").value = cliente.telefono;
    document.getElementById("dEmail").value = cliente.email;

    if (idAtencion) {
        const atencion = cliente.atenciones.find(a => a.id === idAtencion);
        if (atencion) {
            document.getElementById("diagId").value = idAtencion;
            
            document.getElementById("dTratamientosPrevios").value = atencion.tratamientosPrevios || "";
            document.getElementById("dFrecuencia").value = atencion.frecuencia || "";
            document.getElementById("dSientePiel").value = atencion.sientePiel || "";
            document.getElementById("dPreocupacion").value = atencion.preocupacion || "";
            document.getElementById("dTratamientoCabina").value = atencion.tratamientoCabina || "";
            document.getElementById("dHigiene").value = atencion.higiene || "";
            document.getElementById("dCuidadoDiario").value = atencion.cuidadoDiario || "";
            document.getElementById("dEspecificos").value = atencion.especificos || "";

            document.querySelectorAll(".chk-diag").forEach(chk => {
                chk.checked = atencion.diagnostico && atencion.diagnostico.includes(chk.value);
            });
            document.querySelectorAll(".chk-comedon").forEach(chk => {
                chk.checked = atencion.comedones && atencion.comedones.includes(chk.value);
            });
        }
    } else {
        document.getElementById("diagId").value = "";
    }

    const formElements = formDiagnostico.querySelectorAll("input, textarea, select");
    const btnGuardar = formDiagnostico.querySelector("button[type='submit']");

    if (soloLectura) {
        formElements.forEach(el => {
            if (el.type === "checkbox") el.disabled = true;
            else if (el.id !== "diagRut" && el.id !== "diagId" && el.id !== "dNombre" && el.id !== "dTelefono" && el.id !== "dEmail") el.readOnly = true;
        });
        btnGuardar.style.display = "none";
    } else {
        formElements.forEach(el => {
            el.disabled = false;
            el.readOnly = false;
        });
        btnGuardar.style.display = "inline-block";
    }

    panelView.style.display = "none";
    vistaFichaCompleta.style.display = "block";
}

// ===== CERRAR FICHA =====
document.getElementById("btnCerrarFicha").addEventListener("click", () => {
    vistaFichaCompleta.style.display = "none";
    panelView.style.display = "block";
    
    formDiagnostico.querySelectorAll("input, textarea, select").forEach(el => {
        el.disabled = false;
        el.readOnly = false;
    });
    formDiagnostico.querySelector("button[type='submit']").style.display = "inline-block";
});

// ===== GUARDAR DIAGNÓSTICO =====
formDiagnostico.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const rut = document.getElementById("diagRut").value;
    const diagId = document.getElementById("diagId").value;
    const cliente = clientes[rut];

    if (!cliente) return;

    let diagnosticos = [];
    document.querySelectorAll(".chk-diag:checked").forEach(chk => diagnosticos.push(chk.value));

    let comedones = [];
    document.querySelectorAll(".chk-comedon:checked").forEach(chk => comedones.push(chk.value));

    const atencionData = {
        id: diagId || Date.now().toString(),
        fecha: new Date().toISOString().split('T')[0],
        diagnostico: diagnosticos,
        comedones: comedones,
        tratamientosPrevios: document.getElementById("dTratamientosPrevios").value,
        frecuencia: document.getElementById("dFrecuencia").value,
        sientePiel: document.getElementById("dSientePiel").value,
        preocupacion: document.getElementById("dPreocupacion").value,
        tratamientoCabina: document.getElementById("dTratamientoCabina").value,
        higiene: document.getElementById("dHigiene").value,
        cuidadoDiario: document.getElementById("dCuidadoDiario").value,
        especificos: document.getElementById("dEspecificos").value
    };

    if (!cliente.atenciones) cliente.atenciones = [];

    if (diagId) {
        const index = cliente.atenciones.findIndex(a => a.id === diagId);
        if (index !== -1) cliente.atenciones[index] = atencionData;
    } else {
        cliente.atenciones.push(atencionData);
    }
    
    guardarClientes();

    vistaFichaCompleta.style.display = "none";
    panelView.style.display = "block";
    mostrarFichaCliente(cliente);
});

// ===== LÓGICA DEL MODAL DE ELIMINACIÓN =====
function abrirModalEliminar(rut, id, tipo) {
    rutAEliminar = rut;
    idAEliminar = id;
    tipoEliminacion = tipo;

    const modalTitle = document.getElementById("modalEliminarTitle");
    const modalText = document.getElementById("modalEliminarText");

    if (tipo === "cliente") {
        modalTitle.textContent = "⚠️ Borrar Cliente Completo";
        modalText.textContent = "¿Estás seguro de que deseas borrar a este cliente y TODAS sus fichas de atención? Esta acción no se puede deshacer.";
    } else {
        modalTitle.textContent = "⚠️ Eliminar Ficha";
        modalText.textContent = "¿Estás seguro de que deseas eliminar este diagnóstico permanentemente? Esta acción no se puede deshacer.";
    }

    document.getElementById("modalEliminar").classList.add("active");
}

document.getElementById("btnCancelarEliminar").addEventListener("click", () => {
    document.getElementById("modalEliminar").classList.remove("active");
    rutAEliminar = null;
    idAEliminar = null;
    tipoEliminacion = null;
});

document.getElementById("btnConfirmarEliminar").addEventListener("click", () => {
    if (!rutAEliminar || !tipoEliminacion) return;

    if (tipoEliminacion === "cliente") {
        // Borrar cliente entero
        delete clientes[rutAEliminar];
        guardarClientes();
        renderListaClientes();
        contenedorFicha.innerHTML = ""; // Limpiar la vista
        document.getElementById("buscarRut").value = "";
    } else if (tipoEliminacion === "atencion") {
        // Borrar solo una ficha
        const cliente = clientes[rutAEliminar];
        if (cliente && cliente.atenciones) {
            cliente.atenciones = cliente.atenciones.filter(a => a.id !== idAEliminar);
            guardarClientes();
            renderListaClientes();
            mostrarFichaCliente(cliente); // Refrescar la ficha del cliente actual
        }
    }

    // Cerrar modal y limpiar variables
    document.getElementById("modalEliminar").classList.remove("active");
    rutAEliminar = null;
    idAEliminar = null;
    tipoEliminacion = null;
});

// Render inicial
renderListaClientes();
