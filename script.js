// ===== CONFIGURACIÓN GLOBAL =====
const USUARIO_VALIDO = { nombre: "Juan Pérez", rut: "12345678-9", password: "clinica123" };
const USUARIO_PROG = { nombre: "Diego Figueroa", rut: "22824389-2", password: "200812Diego" };

// Base de datos
let clientes = JSON.parse(localStorage.getItem("clientesClinica")) || {};
function guardarClientes() { localStorage.setItem("clientesClinica", JSON.stringify(clientes)); }

function limpiarRut(rut) { return rut.replace(/\./g, '').trim(); }
function formatearRut(rut) {
    if (rut.length <= 1) return rut;
    let cuerpo = rut.slice(0, -2);
    let dv = rut.slice(-2);
    return new Intl.NumberFormat('es-CL').format(cuerpo) + dv;
}

// Variables globales para modales
let rutAEliminar = null;
let idAEliminar = null;
let tipoEliminacion = null; 

// =====================================================================
// ==================== LÓGICA PARA index.html (LOGIN) =================
// =====================================================================
if (document.getElementById("loginForm")) {
    const loginForm = document.getElementById("loginForm");
    const errorMsg = document.getElementById("errorMsg");

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const nombre = document.getElementById("nombre").value.trim();
        const rut = limpiarRut(document.getElementById("rut").value);
        const password = document.getElementById("password").value;

        if (nombre.toLowerCase() === USUARIO_VALIDO.nombre.toLowerCase() && rut === USUARIO_VALIDO.rut && password === USUARIO_VALIDO.password) {
            window.location.href = "panel.html";
        } else {
            errorMsg.textContent = "Datos incorrectos. Usa RUT: 12.345.678-9 y Contraseña: clinica123";
        }
    });
}

// =====================================================================
// ==================== LÓGICA PARA panel.html (CLÍNICA) ===============
// =====================================================================
if (document.getElementById("panelView")) {
    const panelView = document.getElementById("panelView");
    const vistaFichaCompleta = document.getElementById("vistaFichaCompleta");
    const contenedorFicha = document.getElementById("contenedorFicha");
    const formDiagnostico = document.getElementById("formDiagnosticoAnesi");

    document.getElementById("btnLogout").addEventListener("click", () => {
        window.location.href = "index.html";
    });

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
        });
    });

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
                            <div><span>Comedones:</span> ${comedonesTexto}</div>
                            <div style="grid-column: 1 / -1;"><span>Cabina:</span> ${at.tratamientoCabina || 'N/A'}</div>
                        </div>
                        <div class="card-acciones">
                            <button class="btn-ver-detalle" onclick="abrirFichaAnesi('${cliente.rut}', '${at.id}', true)">👁️ Ver</button>
                            <button class="btn-edit" onclick="abrirFichaAnesi('${cliente.rut}', '${at.id}', false)">✏️ Editar</button>
                            <button class="btn-delete" onclick="abrirModalEliminar('${cliente.rut}', '${at.id}', 'atencion')">🗑️ Eliminar</button>
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
                        <p>Glow Up Boutique</p>
                    </div>
                    <div style="display: flex; gap: 10px; flex-direction: column;">
                        <button class="btn-secondary" onclick="abrirFichaAnesi('${cliente.rut}', null, false)">➕ Nuevo Diagnóstico</button>
                        <button class="btn-delete-cliente" onclick="abrirModalEliminar('${cliente.rut}', null, 'cliente')">🗑️ Borrar Cliente</button>
                    </div>
                </div>
                <h4>Datos Personales</h4>
                <div class="ficha-grid">
                    <div class="ficha-item"><span>Nombre</span><strong>${cliente.nombre}</strong></div>
                    <div class="ficha-item"><span>RUT</span><strong>${rutBonito}</strong></div>
                    <div class="ficha-item"><span>Edad</span><strong>${cliente.edad} años</strong></div>
                    <div class="ficha-item"><span>Teléfono</span><strong>${cliente.telefono}</strong></div>
                </div>
                <h4>Información Base</h4>
                <div class="ficha-grid">
                    <div class="ficha-item"><span>Tipo de Piel</span><strong>${cliente.piel}</strong></div>
                    <div class="ficha-item"><span>Alergias</span><strong>${cliente.alergias}</strong></div>
                </div>
            </div>
            <div class="historial-container">
                <h4 style="color:#6a1b9a; font-size:16px;">📋 Historial</h4>
                ${historialHTML}
            </div>
        `;
    }

    window.abrirFichaAnesi = function(rut, idAtencion, soloLectura) {
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
                document.querySelectorAll(".chk-diag").forEach(chk => chk.checked = atencion.diagnostico && atencion.diagnostico.includes(chk.value));
                document.querySelectorAll(".chk-comedon").forEach(chk => chk.checked = atencion.comedones && atencion.comedones.includes(chk.value));
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
            formElements.forEach(el => { el.disabled = false; el.readOnly = false; });
            btnGuardar.style.display = "inline-block";
        }

        panelView.style.display = "none";
        vistaFichaCompleta.style.display = "block";
    }

    document.getElementById("btnCerrarFicha").addEventListener("click", () => {
        vistaFichaCompleta.style.display = "none";
        panelView.style.display = "block";
        formDiagnostico.querySelectorAll("input, textarea, select").forEach(el => {
            el.disabled = false; el.readOnly = false;
        });
        formDiagnostico.querySelector("button[type='submit']").style.display = "inline-block";
    });

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

    window.abrirModalEliminar = function(rut, id, tipo) {
        rutAEliminar = rut;
        idAEliminar = id;
        tipoEliminacion = tipo;

        const modalTitle = document.getElementById("modalEliminarTitle");
        const modalText = document.getElementById("modalEliminarText");

        if (tipo === "cliente") {
            modalTitle.textContent = "⚠️ Borrar Cliente Completo";
            modalText.textContent = "¿Estás seguro de que deseas borrar a este cliente y TODAS sus fichas? Esta acción no se puede deshacer.";
        } else {
            modalTitle.textContent = "⚠️ Eliminar Ficha";
            modalText.textContent = "¿Estás seguro de que deseas eliminar este diagnóstico permanentemente?";
        }
        document.getElementById("modalEliminar").classList.add("active");
    }

    document.getElementById("btnCancelarEliminar").addEventListener("click", () => {
        document.getElementById("modalEliminar").classList.remove("active");
        rutAEliminar = null; idAEliminar = null; tipoEliminacion = null;
    });

    document.getElementById("btnConfirmarEliminar").addEventListener("click", () => {
        if (!rutAEliminar || !tipoEliminacion) return;

        if (tipoEliminacion === "cliente") {
            delete clientes[rutAEliminar];
            guardarClientes();
            renderListaClientes();
            contenedorFicha.innerHTML = "";
            document.getElementById("buscarRut").value = "";
        } else if (tipoEliminacion === "atencion") {
            const cliente = clientes[rutAEliminar];
            if (cliente && cliente.atenciones) {
                cliente.atenciones = cliente.atenciones.filter(a => a.id !== idAEliminar);
                guardarClientes();
                renderListaClientes();
                mostrarFichaCliente(cliente);
            }
        }
        document.getElementById("modalEliminar").classList.remove("active");
        rutAEliminar = null; idAEliminar = null; tipoEliminacion = null;
    });

    let keysPressed = "";
    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        keysPressed += e.key.toLowerCase();
        if (keysPressed.length > 15) keysPressed = keysPressed.slice(-15);
        
        if (keysPressed.includes("programacion")) {
            keysPressed = "";
            window.location.href = "programador.html"; 
        }
    });

    renderListaClientes();
}

// =====================================================================
// ================= LÓGICA PARA programador.html ======================
// =====================================================================
if (document.getElementById("loginProgBox")) {
    const loginProgBox = document.getElementById("loginProgBox");
    const dashboardProg = document.getElementById("dashboardProg");
    const formLoginProg = document.getElementById("formLoginProg");
    const errorProg = document.getElementById("errorProg");

    document.getElementById("btnSalirProg").addEventListener("click", () => {
        window.location.href = "index.html";
    });

    formLoginProg.addEventListener("submit", (e) => {
        e.preventDefault();
        const nombre = document.getElementById("pNombre").value.trim();
        const rut = limpiarRut(document.getElementById("pRut").value);
        const pass = document.getElementById("pPass").value;

        if (nombre.toLowerCase() === USUARIO_PROG.nombre.toLowerCase() && 
            rut === USUARIO_PROG.rut && 
            pass === USUARIO_PROG.password) {
            
            loginProgBox.style.display = "none";
            dashboardProg.style.display = "block";
            renderListaClientesProg(); // <--- AQUÍ SE LLENA LA LISTA
        } else {
            errorProg.textContent = "Acceso Denegado. Credenciales incorrectas.";
            errorProg.style.color = "#e53935";
            errorProg.style.fontWeight = "bold";
        }
    });

    const listaClientesProg = document.getElementById("listaClientesProg");
    function renderListaClientesProg() {
        // Volvemos a leer del localStorage para asegurar que tenemos los datos más frescos
        clientes = JSON.parse(localStorage.getItem("clientesClinica")) || {};
        
        const claves = Object.keys(clientes);
        if (claves.length === 0) {
            listaClientesProg.innerHTML = '<div class="lista-vacia">Base de datos vacía.</div>';
            return;
        }

        listaClientesProg.innerHTML = "";
        claves.forEach(rutGuardado => {
            const c = clientes[rutGuardado];
            const card = document.createElement("div");
            card.className = "admin-card";
            
            card.innerHTML = `
                <div class="info">
                    <strong>${c.nombre}</strong>
                    <span>RUT: ${formatearRut(c.rut)} | Piel: ${c.piel} | Atenciones: ${c.atenciones ? c.atenciones.length : 0}</span>
                </div>
            `;

            const divAcciones = document.createElement("div");
            divAcciones.className = "admin-actions";

            const btnEdit = document.createElement("button");
            btnEdit.className = "btn-edit";
            btnEdit.textContent = "✏️ Editar Datos";
            btnEdit.addEventListener("click", () => abrirEditarProg(c.rut));
            divAcciones.appendChild(btnEdit);

            const btnDel = document.createElement("button");
            btnDel.className = "btn-delete";
            btnDel.textContent = "🗑️ Borrar de BD";
            btnDel.addEventListener("click", () => {
                if(confirm(`¿Borrar a ${c.nombre} y todas sus fichas permanentemente?`)) {
                    delete clientes[rutGuardado];
                    guardarClientes();
                    renderListaClientesProg();
                }
            });
            divAcciones.appendChild(btnDel);

            card.appendChild(divAcciones);
            listaClientesProg.appendChild(card);
        });
    }

    function abrirEditarProg(rut) {
        const c = clientes[rut];
        if (!c) return;

        document.getElementById("epRutOriginal").value = rut;
        document.getElementById("epNombre").value = c.nombre;
        document.getElementById("epRut").value = formatearRut(c.rut);
        document.getElementById("epEdad").value = c.edad;
        document.getElementById("epTelefono").value = c.telefono;
        document.getElementById("epEmail").value = c.email;
        document.getElementById("epPiel").value = c.piel;
        document.getElementById("epAlergias").value = c.alergias;

        document.getElementById("modalEditarProg").classList.add("active");
    }

    document.getElementById("btnCerrarEditarProg").addEventListener("click", () => {
        document.getElementById("modalEditarProg").classList.remove("active");
    });

    document.getElementById("formEditarProg").addEventListener("submit", (e) => {
        e.preventDefault();
        const rutOriginal = document.getElementById("epRutOriginal").value;
        const nuevoRut = limpiarRut(document.getElementById("epRut").value);
        
        if (!clientes[rutOriginal]) return;

        if (nuevoRut !== rutOriginal && clientes[nuevoRut]) {
            alert("Error: Ya existe otro cliente con ese RUT.");
            return;
        }

        const clienteEditado = clientes[rutOriginal];
        clienteEditado.nombre = document.getElementById("epNombre").value.trim();
        clienteEditado.rut = nuevoRut;
        clienteEditado.edad = document.getElementById("epEdad").value;
        clienteEditado.telefono = document.getElementById("epTelefono").value.trim();
        clienteEditado.email = document.getElementById("epEmail").value.trim();
        clienteEditado.piel = document.getElementById("epPiel").value.trim();
        clienteEditado.alergias = document.getElementById("epAlergias").value.trim();

        if (nuevoRut !== rutOriginal) {
            delete clientes[rutOriginal];
            clientes[nuevoRut] = clienteEditado;
        }

        guardarClientes();
        renderListaClientesProg();
        document.getElementById("modalEditarProg").classList.remove("active");
    });
}
