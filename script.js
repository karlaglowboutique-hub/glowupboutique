import { collection, getDocs, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const db = window.firebaseDB; 
const auth = window.firebaseAuth;
let clientes = {}; 

const UID_PROGRAMADOR = 'E19k5YcMkoRksWlOBj0c26PT7zQ2'; 

function limpiarRut(rut) { return rut.replace(/\./g, '').trim(); }
function formatearRut(rut) {
    if (rut.length <= 1) return rut;
    let cuerpo = rut.slice(0, -2); let dv = rut.slice(-2);
    return new Intl.NumberFormat('es-CL').format(cuerpo) + dv;
}
let rutAEliminar = null; let tipoEliminacion = null; 

async function cargarClientesNube(callback) {
    const querySnapshot = await getDocs(collection(db, "clientes"));
    clientes = {};
    querySnapshot.forEach((doc) => { clientes[doc.id] = doc.data(); clientes[doc.id].rut = doc.id; });
    if(callback) callback();
}
async function guardarClienteNube(rut, datos) { await setDoc(doc(db, "clientes", rut), datos); }
async function eliminarClienteNube(rut) { await deleteDoc(doc(db, "clientes", rut)); }

let keysPressed = "";
document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    keysPressed += e.key.toLowerCase();
    if (keysPressed.length > 20) keysPressed = keysPressed.slice(-20);
    if (keysPressed.includes("programador")) { keysPressed = ""; window.location.href = "programador.html"; }
});

// ================= LOGIN =================
if (document.getElementById("loginForm")) {
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, document.getElementById("email").value.trim(), document.getElementById("password").value);
            window.location.href = "panel.html";
        } catch (error) {
            document.getElementById("errorMsg").textContent = "Correo o contraseña incorrectos.";
        }
    });
}

// ================= PANEL CLÍNICA =================
if (document.getElementById("panelView")) {
    onAuthStateChanged(auth, (user) => {
        if (!user) window.location.href = "index.html";
        else iniciarPanel();
    });

    function iniciarPanel() {
        const contenedorFicha = document.getElementById("contenedorFicha");
        cargarClientesNube(() => renderListaClientes());

        document.getElementById("btnLogout").addEventListener("click", async () => { await signOut(auth); window.location.href = "index.html"; });

        document.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
                document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
                btn.classList.add("active"); document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
            });
        });

        // LÓGICA DEL ASISTENTE
        const paso1 = document.getElementById("paso1_datosPersonales");
        const paso2 = document.getElementById("paso2_datosMedicos");

        document.getElementById("btnSiguientePaso").addEventListener("click", () => {
            if (!document.getElementById("nNombre").checkValidity() || !document.getElementById("nRut").checkValidity() || 
                !document.getElementById("nEdad").checkValidity() || !document.getElementById("nTelefono").checkValidity() || 
                !document.getElementById("nEmail").checkValidity()) {
                document.getElementById("formNuevo").reportValidity();
                return;
            }
            paso1.style.display = "none";
            paso2.style.display = "block";
        });

        document.getElementById("btnVolverPaso1").addEventListener("click", () => {
            paso2.style.display = "none";
            paso1.style.display = "block";
        });

        // BUSCAR CLIENTE
        document.getElementById("btnBuscar").addEventListener("click", () => {
            const rut = limpiarRut(document.getElementById("buscarRut").value);
            if (!rut) return;
            const cliente = clientes[rut];
            if (cliente) { document.getElementById("errorBuscar").textContent = ""; mostrarFichaCliente(cliente); } 
            else { document.getElementById("errorBuscar").textContent = "No encontrado."; contenedorFicha.innerHTML = ""; }
        });

        // GUARDAR CLIENTE NUEVO
        document.getElementById("formNuevo").addEventListener("submit", async (e) => {
            e.preventDefault();
            const rut = limpiarRut(document.getElementById("nRut").value);
            if (clientes[rut]) { document.getElementById("msgNuevo").textContent = "RUT ya existe."; return; }
            
            const nuevo = {
                nombre: document.getElementById("nNombre").value.trim(), 
                edad: document.getElementById("nEdad").value,
                telefono: document.getElementById("nTelefono").value.trim(), 
                email: document.getElementById("nEmail").value.trim(),
                
                // Datos Médicos
                alergias: document.getElementById("nAlergias").value.trim(), 
                morbidos: document.getElementById("nMorbidos").value.trim(),
                medicamentos: document.getElementById("nMedicamentos").value.trim(),
                embarazo: document.getElementById("nEmbarazo").value,
                
                // Datos Estéticos
                piel: document.getElementById("nPiel").value, 
                fototipo: document.getElementById("nFototipo").value,
                cirugias: document.getElementById("nCirugias").value.trim(),
                
                consentimiento: true,
                fechaConsentimiento: new Date().toISOString(),
                atenciones: []
            };
            
            await guardarClienteNube(rut, nuevo);
            clientes[rut] = nuevo; clientes[rut].rut = rut;
            
            document.getElementById("formNuevo").reset();
            paso2.style.display = "none";
            paso1.style.display = "block";
            
            renderListaClientes();
            
            // Abrir ficha clínica automáticamente
            mostrarFichaCliente(nuevo);
            window.abrirFichaAnesi(rut);
        });

        function renderListaClientes() {
            const list = document.getElementById("listaClientes");
            list.innerHTML = Object.keys(clientes).length === 0 ? '<div class="lista-vacia">Sin clientes.</div>' : "";
            Object.keys(clientes).forEach(rut => {
                const c = clientes[rut]; const div = document.createElement("div"); div.className = "cliente-card";
                div.innerHTML = `<div class="info"><strong>${c.nombre}</strong><span>RUT: ${formatearRut(c.rut)}</span></div>`;
                const b = document.createElement("button"); b.className = "btn-ver"; b.textContent = "Ver Ficha";
                b.onclick = () => { document.getElementById("buscarRut").value = formatearRut(c.rut); mostrarFichaCliente(c); };
                div.appendChild(b); list.appendChild(div);
            });
        }

        function mostrarFichaCliente(cliente) {
            let html = `<div class="ficha"><h3>Ficha: ${cliente.nombre}</h3><p>RUT: ${formatearRut(cliente.rut)}</p>
                        <p style="margin-top: 10px;"><strong>Alergias:</strong> ${cliente.alergias}</p>
                        <button class="btn-primary" onclick="abrirFichaAnesi('${cliente.rut}')">➕ Nuevo Diagnóstico / Tratamiento</button>
                        <button class="btn-primary" onclick="abrirModalEliminar('${cliente.rut}', null, 'cliente')">🗑️ Borrar Cliente</button></div>`;
            contenedorFicha.innerHTML = html;
        }

        window.abrirFichaAnesi = (rut) => {
            const c = clientes[rut];
            document.getElementById("diagRut").value = rut;
            
            // Llenar datos en la ficha
            document.getElementById("dNombre").value = c.nombre;
            document.getElementById("dTelefono").value = c.telefono || "";
            document.getElementById("dPiel").value = c.piel || "No registrada";
            document.getElementById("dFototipo").value = c.fototipo || "No registrado";
            document.getElementById("dAlergias").value = c.alergias || "Ninguna";
            document.getElementById("dMorbidos").value = c.morbidos || "Ninguna";
            document.getElementById("dMedicamentos").value = c.medicamentos || "Ninguno";
            document.getElementById("dCirugias").value = c.cirugias || "Ninguna";
            
            document.getElementById("diagTipoPiel").value = c.piel || "Normal";
            document.getElementById("diagObservaciones").value = "";
            
            document.getElementById("vistaFichaCompleta").style.display = "block";
        };

        document.getElementById("btnCerrarFicha").onclick = () => document.getElementById("vistaFichaCompleta").style.display = "none";

        document.getElementById("formDiagnosticoAnesi").addEventListener("submit", async (e) => {
            e.preventDefault();
            const rut = document.getElementById("diagRut").value;
            const c = clientes[rut];
            if(!c.atenciones) c.atenciones = [];
            
            const nuevoDiagnostico = { 
                id: Date.now().toString(), 
                fecha: new Date().toISOString().split('T')[0],
                tipoPiel: document.getElementById('diagTipoPiel').value,
                observaciones: document.getElementById('diagObservaciones').value.trim()
            };
            
            c.atenciones.push(nuevoDiagnostico);
            await guardarClienteNube(rut, c);
            
            document.getElementById("vistaFichaCompleta").style.display = "none";
            mostrarFichaCliente(c);
        });

        window.abrirModalEliminar = (rut, id, tipo) => {
            rutAEliminar = rut; tipoEliminacion = tipo;
            document.getElementById("modalEliminar").classList.add("active");
        };

        document.getElementById("btnCancelarEliminar").onclick = () => document.getElementById("modalEliminar").classList.remove("active");
        
        document.getElementById("btnConfirmarEliminar").onclick = async () => {
            if (tipoEliminacion === "cliente") {
                await eliminarClienteNube(rutAEliminar); delete clientes[rutAEliminar];
                renderListaClientes(); contenedorFicha.innerHTML = ""; document.getElementById("buscarRut").value = "";
            }
            document.getElementById("modalEliminar").classList.remove("active");
        };
    }
}

// ================= PANEL PROGRAMADOR =================
if (document.getElementById("loginProgBox")) {
    onAuthStateChanged(auth, (user) => {
        if (user && user.uid === UID_PROGRAMADOR) {
            document.getElementById("loginProgBox").style.display = "none";
            document.getElementById("dashboardProg").style.display = "block";
            cargarClientesNube(() => renderListaClientesProg());
        } else {
            document.getElementById("loginProgBox").style.display = "block";
            document.getElementById("dashboardProg").style.display = "none";
        }
    });

    document.getElementById("btnSalirProg").onclick = async () => { await signOut(auth); window.location.href = "index.html"; };

    document.getElementById("formLoginProg").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            const userCredential = await signInWithEmailAndPassword(auth, document.getElementById("pEmail").value.trim(), document.getElementById("pPass").value);
            if (userCredential.user.uid !== UID_PROGRAMADOR) {
                document.getElementById("errorProg").textContent = "Acceso Denegado. No eres el programador autorizado.";
                await signOut(auth);
            }
        } catch (error) {
            document.getElementById("errorProg").textContent = "Acceso Denegado. Correo o contraseña incorrectos.";
        }
    });

    function renderListaClientesProg() {
        const list = document.getElementById("listaClientesProg");
        list.innerHTML = "";
        Object.keys(clientes).forEach(rut => {
            const c = clientes[rut]; const div = document.createElement("div"); div.className = "admin-card";
            div.innerHTML = `<div class="info"><strong>${c.nombre}</strong><span>RUT: ${formatearRut(c.rut)}</span></div>`;
            const btnD = document.createElement("button"); btnD.className = "btn-primary"; btnD.textContent = "🗑️ Borrar";
            btnD.onclick = async () => { if(confirm(`¿Borrar a ${c.nombre}?`)) { await eliminarClienteNube(rut); delete clientes[rut]; renderListaClientesProg(); } };
            div.appendChild(btnD); list.appendChild(div);
        });
    }
}
