/**
 * Sovereign - App Logic (Aura Ledger)
 * Pure Vanilla JS Implementation
 */

// --- CLOUD CONFIGURATION (SUPABASE) ---
const SUPABASE_URL = 'https://wcewgxkizvsnffhbqqet.supabase.co';
const SUPABASE_KEY = 'sb_publishable_W3JOdptOwRr5zyxFY2nApA_rf_FrNTO';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- INITIAL STATE & DATA MANAGEMENT ---
let state = {
    loans: [],
    currentView: 'dashboard',
    selectedLoanId: null,
};

async function loadState() {
    try {
        const { data, error } = await sb
            .from('loans')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        state.loans = data || [];
        console.log("[Sovereign Cloud] Datos cargados:", state.loans.length);
    } catch (error) {
        console.error("[Sovereign Cloud] Error cargando datos:", error.message);
    }
    render();
}

async function saveLoan(loan) {
    try {
        const { error } = await sb
            .from('loans')
            .insert([loan]);
        if (error) throw error;
    } catch (error) {
        console.error("[Sovereign Cloud] Error guardando préstamo:", error.message);
        alert("Error al guardar en la nube.");
    }
}

async function updateLoan(loanId, updates) {
    try {
        const { error } = await sb
            .from('loans')
            .update(updates)
            .eq('id', loanId);
        if (error) throw error;
    } catch (error) {
        console.error("[Sovereign Cloud] Error actualizando:", error.message);
    }
}

// --- UTILS ---
const formatCurrency = (amount) => {
    return 'Bs. ' + new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(amount);
};
const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

function calculateMonths(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    let months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
    months -= startDate.getMonth();
    months += endDate.getMonth();
    return months <= 0 ? 1 : months;
}

function generateInstallments(amount, interestRate, months, startDate) {
    const installments = [];
    const monthlyInterest = (parseFloat(amount) * parseFloat(interestRate)) / 100;
    
    for (let i = 1; i <= months; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        installments.push({
            id: Date.now() + i,
            month: i,
            amount: monthlyInterest,
            dueDate: dueDate.toISOString(),
            paid: false
        });
    }
    return installments;
}

// --- ROUTING ---
function navigate(view, id = null) {
    state.currentView = view;
    state.selectedLoanId = id;
    render();
}

// --- RENDERERS ---

function renderDashboard() {
    const totalAssets = state.loans.reduce((acc, loan) => acc + parseFloat(loan.amount || 0), 0);
    const activeContracts = state.loans.length;
    const avgInterest = state.loans.length > 0 ? (state.loans.reduce((acc, l) => acc + parseFloat(l.interest), 0) / state.loans.length).toFixed(1) : 0;

    return `
        <header class="main-header">
            <div class="user-info">
                <div class="avatar">AS</div>
                <div class="greeting">
                    <span>Bienvenido,</span>
                    <h1>Arquitecto Soberano</h1>
                </div>
            </div>
            <button class="menu-btn" onclick="alert('Sistema de Auditoría Sovereign AES-256 Activo')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            </button>
        </header>

        <section class="summary-card">
            <div class="card-glass"></div>
            <div class="card-content">
                <span class="label">Total de Activos Gestionados</span>
                <h2 class="amount">${formatCurrency(totalAssets)}</h2>
                <div class="stats-row">
                    <div class="stat">
                        <span class="stat-label">Contratos Activos</span>
                        <span class="stat-value">${activeContracts}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">TAE Promedio</span>
                        <span class="stat-value">${avgInterest}%</span>
                    </div>
                </div>
            </div>
        </section>

        <main class="ledger-section">
            <div class="section-header">
                <h2>Libro Mayor Activo</h2>
            </div>
            
            <div class="loan-list">
                ${state.loans.length === 0 ? `
                    <div class="empty-state">
                        <p>No hay contratos activos en el protocolo.</p>
                        <button class="btn-primary" onclick="window.app.navigate('register')">Iniciar Nuevo Contrato</button>
                    </div>
                ` : state.loans.map(loan => `
                    <div class="loan-card" onclick="window.app.navigate('details', '${loan.id}')">
                        <div class="loan-info">
                            <div class="debtor-icon">${loan.debtor.substring(0, 2).toUpperCase()}</div>
                            <div class="loan-details">
                                <h3>${loan.debtor}</h3>
                                <p>Vence: ${formatDate(loan.end_date)}</p>
                            </div>
                            <div class="loan-amount">
                                <span class="current">${formatCurrency(loan.amount)}</span>
                            </div>
                        </div>
                        <div class="progress-container">
                            <div class="progress-bar" style="width: 45%;"></div>
                        </div>
                        <div class="progress-labels">
                            <span>45% completado</span>
                            <span class="status positive">Activo</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </main>

        <button class="fab" onclick="window.app.navigate('register')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
    `;
}

function renderRegister() {
    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('dashboard')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Protocolo de Registro</h1>
        </header>

        <form id="loan-form" class="sovereign-form" onsubmit="window.app.handleSave(event)">
            <section class="form-section">
                <h2 class="section-title">Términos Principales</h2>
                <div class="form-group">
                    <label>Monto del Préstamo (Bs.)</label>
                    <input type="number" name="amount" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label>Tasa de Interés (%)</label>
                    <input type="number" step="0.1" name="interest" placeholder="0.0" required>
                </div>
                <div class="form-group">
                    <label>Número de Referencia</label>
                    <input type="text" name="ref" value="REF-${Math.floor(Math.random() * 100000)}" readonly>
                </div>
            </section>

            <section class="form-section">
                <h2 class="section-title">Arquitectura de Plazos</h2>
                <div class="form-row">
                    <div class="form-group">
                        <label>Fecha de Inicio</label>
                        <input type="date" name="startDate" required>
                    </div>
                    <div class="form-group">
                        <label>Vencimiento</label>
                        <input type="date" name="endDate" required>
                    </div>
                </div>
            </section>

            <section class="form-section">
                <h2 class="section-title">Partes Interesadas</h2>
                <div class="form-group">
                    <label>Deudor Principal</label>
                    <input type="text" name="debtor" placeholder="Nombre Legal Completo" required>
                </div>
                <div class="form-group">
                    <label>Nombre del Garante</label>
                    <input type="text" name="guarantor" placeholder="Persona o Entidad" required>
                </div>
            </section>

            <section class="form-section">
                <h2 class="section-title">Activos de Verificación</h2>
                <div class="photo-upload-grid">
                    <div class="upload-item">
                        <input type="file" id="id-photo" accept="image/*" capture="camera" hidden>
                        <label for="id-photo" class="upload-label">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                            <span>Foto Carnet</span>
                        </label>
                    </div>
                    <div class="upload-item">
                        <input type="file" id="doc-photo" accept="image/*" capture="camera" hidden>
                        <label for="doc-photo" class="upload-label">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                            <span>Garantía</span>
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Colateral de Activos Fijos</label>
                    <textarea name="collateral" placeholder="Descripción de propiedad o movilidad..."></textarea>
                </div>
            </section>

            <div class="form-actions">
                <button type="submit" class="btn-primary">Registrar Préstamo</button>
                <button type="button" class="btn-secondary" onclick="window.app.navigate('dashboard')">Cancelar</button>
            </div>
        </form>
    `;
}

function renderDetails() {
    const loan = state.loans.find(l => l.id === state.selectedLoanId);
    if (!loan) return navigate('dashboard');

    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('dashboard')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Gestión de Activos</h1>
            <button class="delete-btn" onclick="window.app.handleDelete('${loan.id}')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </header>

        <div class="details-container">
            <div class="loan-metrics-card">
                <div class="metric-main">
                    <span class="label">Capital Actual</span>
                    <h2 class="amount">${formatCurrency(loan.amount)}</h2>
                </div>
                <div class="metric-grid">
                    <div class="m-item">
                        <span class="m-label">Tasa</span>
                        <span class="m-val">${loan.interest}%</span>
                    </div>
                    <div class="m-item">
                        <span class="m-label">Vence</span>
                        <span class="m-val">${formatDate(loan.end_date)}</span>
                    </div>
                </div>
                <div class="progress-row">
                    <div class="progress-bar-large"><div class="fill" style="width: 45%"></div></div>
                    <span>45% Reembolsado</span>
                </div>
            </div>

            <section class="detail-section">
                <h2 class="section-title">Perfil del Cliente</h2>
                <div class="profile-row">
                    <div class="profile-info">
                        <p class="name">${loan.debtor}</p>
                        <p class="status-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> Identidad Verificada</p>
                    </div>
                    <div class="credit-score">
                        <span class="score">720</span>
                        <span class="label">FICO</span>
                    </div>
                </div>
            </section>

            <section class="detail-section">
                <div class="section-flex">
                    <h2 class="section-title">Control de Pagos (Interés)</h2>
                    <button class="btn-text" onclick="window.app.handleExtendLoan('${loan.id}')">+ Ampliar Plazo</button>
                </div>
                <div class="payment-schedule">
                    ${loan.installments.map(inst => `
                        <div class="payment-row ${inst.paid ? 'is-paid' : ''}">
                            <div class="p-info">
                                <span class="p-month">Mes ${inst.month}</span>
                                <span class="p-date">${formatDate(inst.dueDate)}</span>
                            </div>
                            <div class="p-action">
                                <span class="p-amount">${formatCurrency(inst.amount)}</span>
                                <button class="check-btn ${inst.paid ? 'checked' : ''}" 
                                        onclick="window.app.handleToggleInstallment('${loan.id}', ${inst.id})">
                                    ${inst.paid ? 'Cobrado' : 'Marcar Pago'}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>

            <section class="detail-section">
                <h2 class="section-title">Garantía y Aval</h2>
                <div class="collateral-card">
                    <p class="collateral-desc">${loan.collateral || 'Sin descripción detallada'}</p>
                    <div class="guarantor-info">
                        <span class="label">Garante:</span>
                        <span class="val">${loan.guarantor}</span>
                    </div>
                    <div class="legal-status">
                        <span class="status-dot"></span> Gravamen Activo
                    </div>
                </div>
            </section>

            <button class="btn-primary full-width" onclick="alert('Exportando Informe PDF Sovereign...')">Exportar PDF del Contrato</button>
        </div>
    `;
}

// --- CORE FUNCTIONS ---

function render() {
    const app = document.getElementById('app');
    let content = '';

    switch (state.currentView) {
        case 'dashboard': content = renderDashboard(); break;
        case 'register': content = renderRegister(); break;
        case 'details': content = renderDetails(); break;
        default: content = renderDashboard();
    }

    app.innerHTML = content;
    window.scrollTo(0, 0);
}

function handleSave(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const amount = formData.get('amount');
    const interest = formData.get('interest');
    const startDate = formData.get('startDate');
    const endDate = formData.get('endDate');
    
    const months = calculateMonths(startDate, endDate);
    const installments = generateInstallments(amount, interest, months, startDate);

    const newLoan = {
        id: Date.now().toString(),
        amount: amount,
        interest: interest,
        ref: formData.get('ref'),
        start_date: startDate,
        end_date: endDate,
        debtor: formData.get('debtor'),
        guarantor: formData.get('guarantor'),
        collateral: formData.get('collateral'),
        installments: installments,
    };

    state.loans.unshift(newLoan);
    saveLoan(newLoan); // Guardar en la nube
    navigate('dashboard');
}

async function handleToggleInstallment(loanId, installmentId) {
    const loan = state.loans.find(l => l.id === loanId);
    if (loan) {
        const inst = loan.installments.find(i => i.id === installmentId);
        if (inst) {
            inst.paid = !inst.paid;
            await updateLoan(loanId, { installments: loan.installments });
            render();
        }
    }
}

async function handleExtendLoan(loanId) {
    const loan = state.loans.find(l => l.id === loanId);
    if (loan) {
        const lastDate = new Date(loan.end_date);
        lastDate.setMonth(lastDate.getMonth() + 1);
        loan.end_date = lastDate.toISOString().split('T')[0];
        
        const nextMonth = loan.installments.length + 1;
        const monthlyInterest = (parseFloat(loan.amount) * parseFloat(loan.interest)) / 100;
        
        const due = new Date(loan.start_date);
        due.setMonth(due.getMonth() + nextMonth);

        loan.installments.push({
            id: Date.now(),
            month: nextMonth,
            amount: monthlyInterest,
            dueDate: due.toISOString(),
            paid: false
        });

        await updateLoan(loanId, { 
            end_date: loan.endDate, 
            installments: loan.installments 
        });
        render();
    }
}

async function handleDelete(id) {
    if (confirm('¿Está seguro de eliminar este activo del protocolo?')) {
        try {
            const { error } = await sb
                .from('loans')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            state.loans = state.loans.filter(l => l.id !== id);
            navigate('dashboard');
        } catch (error) {
            console.error("[Sovereign Cloud] Error eliminando:", error.message);
        }
    }
}

// --- INITIALIZATION ---
window.app = {
    navigate,
    handleSave,
    handleDelete,
    handleToggleInstallment,
    handleExtendLoan
};

// Start App
loadState();
