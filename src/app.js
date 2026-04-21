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
    debts: [], 
    expenses: [], // Mis Pagos
    currentView: 'dashboard',
    selectedLoanId: null,
    isDarkMode: localStorage.getItem('sovereign-theme') === 'dark'
};

function applyTheme() {
    if (state.isDarkMode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

function toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    localStorage.setItem('sovereign-theme', state.isDarkMode ? 'dark' : 'light');
    applyTheme();
    render();
}

async function loadState() {
    try {
        const { data, error } = await sb
            .from('loans')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        const allData = data || [];
        
        // Separar Por Categoría basándose en discriminadores
        state.debts = allData.filter(l => l.ref === 'DEUDA_DIARIA').map(d => ({
            id: d.id,
            person: d.debtor,
            amount: d.amount,
            reason: d.collateral,
            start_date: d.start_date,
            end_date: d.end_date,
            interest: d.interest || 0,
            photo: d.guarantor 
        }));

        state.expenses = allData.filter(l => l.ref === 'MI_PAGO').map(e => ({
            id: e.id,
            name: e.debtor,
            amount: e.amount,
            category: e.guarantor, 
            payDate: e.start_date,
            endDate: e.end_date,
            refNumber: e.collateral,
            installments: e.installments || []
        }));

        // Protocolo (Mapeo v5.9 estable)
        state.loans = allData.filter(l => l.ref !== 'DEUDA_DIARIA' && l.ref !== 'MI_PAGO').map(l => ({
            id: l.id,
            debtor: l.debtor,
            amount: l.amount,
            interest: l.interest_rate,
            start_date: l.start_date,
            end_date: l.end_date,
            collateral: l.collateral,
            guarantor: l.guarantor,
            installments: l.installments || []
        }));

        console.log("[Sovereign Cloud] Ecosistema auditado:", allData.length);
        applyTheme();
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
    const val = parseFloat(amount || 0);
    return isNaN(val) ? 'Bs. 0.00' : 'Bs. ' + new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(val);
};
const formatDate = (dateStr) => {
    if (!dateStr) return 'Pendiente';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

function calculateDaysUntil(dateStr) {
    if (!dateStr) return 0;
    const today = new Date();
    const start = new Date(dateStr);
    if (isNaN(start.getTime())) return 0; // Seguridad para fechas inválidas

    const target = new Date(today.getFullYear(), today.getMonth(), start.getDate());
    if (target < today) target.setMonth(target.getMonth() + 1);
    const diff = target - today;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function calculateMonths(start, end) {
    if (!start || !end) return 1;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 1;
    let months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
    months -= startDate.getMonth();
    months += endDate.getMonth();
    return months <= 0 ? 1 : months;
}

function generateHistoricalMonths(exp) {
    const months = [];
    const start = new Date(exp.payDate);
    if (isNaN(start.getTime())) return [];

    const limit = new Date(); // Hasta hoy
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    
    // Generar últimos 6 meses o desde el inicio
    const count = 6; 
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    for (let i = 0; i < count; i++) {
        const d = new Date(limit.getFullYear(), limit.getMonth() - i, 1);
        if (d < current) break;
        
        months.push({
            id: `${d.getFullYear()}-${d.getMonth() + 1}`,
            name: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
            day: start.getDate()
        });
    }
    return months;
}

function isMonthPaid(exp, monthId) {
    if (!exp.installments) return false;
    return exp.installments.some(i => i.id === monthId && i.paid);
}

function extractProtocolInterests() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    return state.loans.map(loan => {
        if (!loan.installments) return null;
        
        // Buscar la cuota pendiente más antigua o la del mes actual
        const pending = loan.installments.find(i => !i.paid);
        if (!pending) return null;

        return {
            id: `protocol-${loan.id}-${pending.id}`,
            person: loan.debtor,
            amount: pending.amount,
            reason: `Interés Préstamo #${loan.id.substring(0,4)}`,
            interest: loan.interest,
            start_date: loan.start_date,
            isProtocol: true,
            originalLoanId: loan.id
        };
    }).filter(item => item !== null);
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
    const avgInterest = state.loans.length > 0 ? (state.loans.reduce((acc, l) => acc + parseFloat(l.interest_rate || l.interest || 0), 0) / state.loans.length).toFixed(1) : 0;
    
    // Cálculo de ganancias reales (Solo cuotas pagadas)
    const totalInterestEarned = state.loans.reduce((acc, loan) => {
        const paidInterest = (loan.installments || [])
            .filter(inst => inst.paid)
            .reduce((sum, inst) => sum + parseFloat(inst.amount), 0);
        return acc + paidInterest;
    }, 0);

    return `
        <header class="main-header">
            <div class="user-info">
                <div class="avatar">AS</div>
                <div class="greeting">
                    <span>Bienvenido,</span>
                    <h1>Arquitecto Soberano</h1>
                </div>
            </div>
            <div class="header-actions">
                <button class="btn-icon theme-toggle" onclick="window.app.toggleTheme()" title="Cambiar Tema">
                    ${state.isDarkMode ? '☀️' : '🌙'}
                </button>
                <a href="https://drive.google.com/drive/folders/12VwI7kKvTy50t_Q13UngiSHEZ77KpQwu?usp=sharing" target="_blank" class="btn-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </a>
                <button class="menu-btn" onclick="alert('Sistema de Auditoría Sovereign AES-256 Activo')">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="12" x2="12" y2="12"></line><circle cx="12.01" cy="8" r="0.5" fill="currentColor"></circle></svg>
                </button>
            </div>
        </header>

        <section class="summary-card">
            <div class="card-glass"></div>
            <div class="card-content">
                <span class="label">Capital Prestado en Protocolo</span>
                <h2 class="amount">${formatCurrency(totalAssets)}</h2>
                
                <div class="earnings-summary-box">
                    <span class="label-xs">Ganancias por Interés (Cobrado)</span>
                    <span class="val-xs bold highlight">${formatCurrency(totalInterestEarned)}</span>
                </div>

                <div class="stats-row">
                    <div class="stat">
                        <span class="stat-label">Contratos Activos</span>
                        <span class="stat-value">${activeContracts}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Rendimiento Prom.</span>
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
                    <label>Número de Referencia / Teléfono</label>
                    <input type="text" name="ref" placeholder="Ej: +591 7XXXXXXX" required>
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
                    ${(loan.installments || []).map(inst => `
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
                <div class="section-flex">
                    <h2 class="section-title">Garantía y Aval</h2>
                    <a href="https://drive.google.com/drive/folders/12VwI7kKvTy50t_Q13UngiSHEZ77KpQwu?usp=sharing" target="_blank" class="text-link">Ver Documentos ↗</a>
                </div>
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

            <button class="btn-primary full-width" onclick="window.app.exportToPDF('${loan.id}')">Exportar PDF del Contrato</button>
        </div>
    `;
}

// --- CORE FUNCTIONS ---

function render() {
    const app = document.getElementById('app');
    if (!app) return;
    let content = '';

    try {
        switch (state.currentView) {
            case 'dashboard': content = renderDashboard(); break;
            case 'debts': content = renderDebts(); break;
            case 'expenses': content = renderExpenses(); break;
            case 'register': content = renderRegister(); break;
            case 'debtRegister': content = renderDebtRegister(); break;
            case 'expenseRegister': content = renderExpenseRegister(); break;
            case 'details': content = renderDetails(); break;
            case 'debtDetail': content = renderDebtDetail(); break;
            case 'debtEdit': content = renderDebtEdit(); break;
            case 'expenseDetail': content = renderExpenseDetail(); break;
            case 'expenseEdit': content = renderExpenseEdit(); break;
            default: content = renderDashboard();
        }
    } catch (e) {
        console.error("Render Error:", e);
        content = `<div class="empty-state"><p>Error al cargar la vista. Intente de nuevo.</p></div>`;
    }

    app.innerHTML = content + renderTabBar();
    window.scrollTo(0, 0);
}

function renderTabBar() {
    const categories = {
        'dashboard': { label: 'Protocolo', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>' },
        'debts': { label: 'Deudores', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>' },
        'expenses': { label: 'Pagos', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>' }
    };

    return `
        <nav class="bottom-tab-bar">
            <button class="tab-item ${state.currentView === 'dashboard' ? 'active' : ''}" onclick="window.app.navigate('dashboard')">
                ${categories.dashboard.icon}
                <span>${categories.dashboard.label}</span>
            </button>
            <button class="tab-item ${state.currentView === 'debts' ? 'active' : ''}" onclick="window.app.navigate('debts')">
                ${categories.debts.icon}
                <span>${categories.debts.label}</span>
            </button>
            <button class="tab-item ${state.currentView === 'expenses' ? 'active' : ''}" onclick="window.app.navigate('expenses')">
                ${categories.expenses.icon}
                <span>${categories.expenses.label}</span>
            </button>
            <button class="tab-item" onclick="window.open('https://drive.google.com/drive/folders/12VwI7kKvTy50t_Q13UngiSHEZ77KpQwu?usp=sharing')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span>Drive</span>
            </button>
        </nav>
    `;
}

function renderExpenses() {
    const totalMonthlyExpenses = state.expenses.reduce((acc, e) => acc + parseFloat(e.amount || 0), 0);
    const categories = {
        'internet': { title: 'Servicios Digitales', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>' },
        'banco': { title: 'Compromisos Bancarios', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"></path><path d="M3 10h18"></path><path d="M5 6l7-3 7 3"></path><path d="M4 10v11"></path><path d="M20 10v11"></path><path d="M8 14v3"></path><path d="M12 14v3"></path><path d="M16 14v3"></path></svg>' },
        'producto': { title: 'Artículos y Productos', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>' }
    };

    return `
        <header class="main-header">
            <div class="user-info">
                <div class="avatar">MP</div>
                <div class="greeting">
                    <span>Control de</span>
                    <h1>Mis Pagos</h1>
                </div>
            </div>
        </header>

        <section class="summary-card dark-gradient">
            <div class="card-content">
                <span class="label">Total Mensual Proyectado</span>
                <h2 class="amount">${formatCurrency(totalMonthlyExpenses)}</h2>
                <p style="font-size: 0.65rem; opacity: 0.8; margin-top: -10px;">Obligaciones y suscripciones activas</p>
            </div>
        </section>

        <main class="ledger-section">
            <div class="loan-list">
                ${state.expenses.length === 0 ? `
                    <div class="empty-state">
                        <p>No tienes pagos programados registrados.</p>
                        <button class="btn-primary" onclick="window.app.navigate('expenseRegister')">Agregar Primer Pago</button>
                    </div>
                ` : state.expenses.map(exp => {
                    const daysLeft = calculateDaysUntil(exp.payDate);
                    return `
                    <div class="loan-card" onclick="window.app.navigate('expenseDetail', '${exp.id}')">
                        <div class="loan-info">
                            <div class="debtor-icon expense-icon">${categories[exp.category]?.icon || '💰'}</div>
                            <div class="loan-details">
                                <h3>${exp.name}</h3>
                                <p>${categories[exp.category]?.title || 'Otros'}</p>
                            </div>
                            <div class="loan-amount">
                                <span class="current">${formatCurrency(exp.amount)}</span>
                            </div>
                        </div>
                        <div class="progress-labels" style="margin-top: 8px;">
                            <span class="${daysLeft <= 3 ? 'text-warning' : ''}">Faltan ${daysLeft} días pago</span>
                            <span class="status positive">Activo</span>
                        </div>
                    </div>
                `}).join('')}
            </div>
        </main>

        <button class="fab" onclick="window.app.navigate('expenseRegister')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
    `;
}

function renderExpenseRegister() {
    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('expenses')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Nuevo Compromiso</h1>
        </header>

        <form id="expense-form" class="sovereign-form" onsubmit="window.app.handleSaveExpense(event)">
            <section class="form-section">
                <div class="form-group">
                    <label>Nombre del Servicio / Artículo</label>
                    <input type="text" name="name" placeholder="Ej: Adobe Cloud, Google One..." required>
                </div>
                <div class="form-group">
                    <label>Monto a Pagar (Bs.)</label>
                    <input type="number" name="amount" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label>Categoría del Gasto</label>
                    <select name="category" class="custom-select" required>
                        <option value="internet">Suscripción / Internet</option>
                        <option value="banco">Pago Bancario / Crédito</option>
                        <option value="producto">Producto / Artículo</option>
                    </select>
                </div>
            </section>

            <section class="form-section">
                <div class="form-row">
                    <div class="form-group">
                        <label>Fecha de Inicio</label>
                        <input type="date" name="payDate" required>
                    </div>
                    <div class="form-group">
                        <label>Referencia / ID (Opcional)</label>
                        <input type="text" name="refNumber" placeholder="Nº de contrato/cuenta">
                    </div>
                </div>
            </section>

            <div class="form-actions">
                <button type="submit" class="btn-primary">Registrar Pago</button>
                <button type="button" class="btn-secondary" onclick="window.app.navigate('expenses')">Cancelar</button>
            </div>
        </form>
    `;
}

function renderExpenseDetail() {
    const exp = state.expenses.find(e => e.id === state.selectedLoanId);
    if (!exp) return navigate('expenses');

    const totalPaidTimes = exp.installments ? exp.installments.filter(i => i.paid).length : 0;
    const totalInvested = totalPaidTimes * parseFloat(exp.amount);
    const monthsActive = calculateMonths(exp.payDate, new Date().toISOString());
    const daysUntilNext = calculateDaysUntil(exp.payDate);

    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('expenses')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Auditoría de Pago</h1>
            <button class="menu-btn" onclick="window.app.navigate('expenseEdit', '${exp.id}')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
        </header>

        <div class="details-container">
            <div class="loan-metrics-card dark-gradient">
                <div class="metric-main">
                    <span class="label">Monto Mensual</span>
                    <h2 class="amount">${formatCurrency(exp.amount)}</h2>
                </div>
                <div class="metric-grid">
                    <div class="m-item">
                        <span class="m-label">Veces Pagado</span>
                        <span class="m-val">${totalPaidTimes} Cuotas</span>
                    </div>
                    <div class="m-item">
                        <span class="m-label">Total Invertido</span>
                        <span class="m-val">${formatCurrency(totalInvested)}</span>
                    </div>
                </div>
                <div class="progress-row">
                    <div class="progress-bar-large"><div class="fill" style="width: 100%"></div></div>
                    <span>Activo por ${monthsActive} meses</span>
                </div>
            </div>

            <section class="detail-section">
                <div class="alert-box ${daysUntilNext <= 3 ? 'warning' : 'info'}">
                    <div class="alert-content">
                        <strong>Próximo Pago:</strong> Faltan ${daysUntilNext} días para el vencimiento.
                    </div>
                </div>
            </section>

            <section class="detail-section">
                <div class="section-flex">
                    <h2 class="section-title">Historial de Mensualidades</h2>
                    <span class="text-link">Auto-generado</span>
                </div>
                <div class="payment-schedule">
                    ${generateHistoricalMonths(exp).map(m => `
                        <div class="payment-row">
                            <div class="p-info">
                                <span class="p-month">${m.name}</span>
                                <span class="p-date">Vencimiento: ${m.day}</span>
                            </div>
                            <div class="p-action">
                                <button class="check-btn ${isMonthPaid(exp, m.id) ? 'checked' : ''}" 
                                        onclick="window.app.handleToggleExpenseMonth('${exp.id}', '${m.id}')">
                                    ${isMonthPaid(exp, m.id) ? 'Pagado' : 'Marcar'}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>

            <button class="btn-secondary full-width" onclick="window.app.handleDeleteUniversal('${exp.id}', 'expenses')">Eliminar Compromiso</button>
        </div>
    `;
}

function renderExpenseEdit() {
    const exp = state.expenses.find(e => e.id === state.selectedLoanId);
    if (!exp) return navigate('expenses');

    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('expenseDetail', '${exp.id}')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Editar Compromiso</h1>
        </header>

        <form id="edit-expense-form" class="sovereign-form" onsubmit="window.app.handleUpdateExpense(event, '${exp.id}')">
            <section class="form-section">
                <div class="form-group">
                    <label>Servicio / Nombre</label>
                    <input type="text" name="name" value="${exp.name}" required>
                </div>
                <div class="form-group">
                    <label>Precio Actual (Bs.)</label>
                    <input type="number" name="amount" value="${exp.amount}" required>
                </div>
                <div class="form-group">
                    <label>Categoría</label>
                    <select name="category" class="custom-select" required>
                        <option value="internet" ${exp.category === 'internet' ? 'selected' : ''}>Suscripción / Internet</option>
                        <option value="banco" ${exp.category === 'banco' ? 'selected' : ''}>Pago Bancario / Crédito</option>
                        <option value="producto" ${exp.category === 'producto' ? 'selected' : ''}>Producto / Artículo</option>
                    </select>
                </div>
            </section>

            <section class="form-section">
                <div class="form-row">
                    <div class="form-group">
                        <label>Fecha Inicio</label>
                        <input type="date" name="payDate" value="${exp.payDate}" required>
                    </div>
                    <div class="form-group">
                        <label>Fecha Fin (Opcional)</label>
                        <input type="date" name="endDate" value="${exp.endDate || ''}" placeholder="Dejar vacío para indefinido">
                    </div>
                </div>
            </section>

            <div class="form-actions">
                <button type="submit" class="btn-primary">Actualizar Cambios</button>
                <button type="button" class="btn-secondary" onclick="window.app.navigate('expenseDetail', '${exp.id}')">Cancelar</button>
            </div>
        </form>
    `;
}

function renderDebtDetail() {
    const debt = state.debts.find(d => d.id === state.selectedLoanId);
    if (!debt) return navigate('debts');

    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('debts')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Detalle de Deuda</h1>
            <div style="display:flex; gap:10px;">
                <button class="menu-btn" onclick="window.app.navigate('debtEdit', '${debt.id}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="delete-btn" onclick="window.app.handleDeleteUniversal('${debt.id}', 'debts')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </header>

        <div class="details-container">
            <div class="loan-metrics-card gold-gradient">
                <div class="profile-row">
                    <div class="profile-info">
                        <h3 style="font-size: 1.2rem;">${debt.person}</h3>
                        <p style="font-size: 0.8rem; opacity: 0.8;">${debt.reason}</p>
                    </div>
                    <div class="debtor-icon debt-icon large">
                        ${debt.photo ? `<img src="${debt.photo}" class="avatar-large">` : debt.person.substring(0, 2).toUpperCase()}
                    </div>
                </div>
                <div class="metric-grid" style="margin-top: 20px;">
                    <div class="m-item">
                        <span class="m-label">Monto Adeudado</span>
                        <span class="m-val">${formatCurrency(debt.amount)}</span>
                    </div>
                    <div class="m-item">
                        <span class="m-label">Vencimiento</span>
                        <span class="m-val">${formatDate(debt.end_date)}</span>
                    </div>
                </div>
            </div>

            <section class="form-section">
                <h3 class="section-title">Evidencia de Deuda</h3>
                <div class="photo-upload-grid">
                    <div class="upload-item">
                        <input type="file" id="debt-photo-input" accept="image/*" capture="camera" hidden onchange="window.app.handlePhotoCapture(event, '${debt.id}')">
                        <label for="debt-photo-input" class="upload-label" style="height: 120px;">
                            ${debt.photo ? `<img src="${debt.photo}" class="preview-img">` : `
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                <span>Actualizar Foto</span>
                            `}
                        </label>
                    </div>
                    <div class="upload-item" style="display: flex; align-items: center; justify-content: center;">
                         <p style="font-size: 0.7rem; opacity: 0.6; text-align: center;">Captura una prueba física o el rostro del deudor</p>
                    </div>
                </div>
            </section>
        </div>
    `;
}

function renderDebtEdit() {
    const debt = state.debts.find(d => d.id === state.selectedLoanId);
    if (!debt) return navigate('debts');

    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('debtDetail', '${debt.id}')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Editar Deudor</h1>
        </header>

        <form id="edit-debt-form" class="sovereign-form" onsubmit="window.app.handleUpdateDebt(event, '${debt.id}')">
            <section class="form-section">
                <div class="form-group">
                    <label>Persona / Deudor</label>
                    <input type="text" name="person" value="${debt.person}" required>
                </div>
                <div class="form-group">
                    <label>Monto Adeudado (Bs.)</label>
                    <input type="number" name="amount" value="${debt.amount}" required>
                </div>
                <div class="form-group">
                    <label>Motivo de la Deuda</label>
                    <textarea name="reason" rows="3" required>${debt.reason}</textarea>
                </div>
            </section>

            <section class="form-section">
                <div class="form-row">
                    <div class="form-group">
                        <label>Fecha Inicio</label>
                        <input type="date" name="startDate" value="${debt.start_date}" required>
                    </div>
                    <div class="form-group">
                        <label>Tasa Interés (%) - Opcional</label>
                        <input type="number" name="interestRate" value="${debt.interest || 0}" step="0.1">
                    </div>
                </div>
                <div class="form-group">
                    <label>Plazo Límite (Opcional)</label>
                    <input type="date" name="endDate" value="${debt.end_date || ''}">
                </div>
            </section>

            <div class="form-actions">
                <button type="submit" class="btn-primary">Guardar Cambios</button>
                <button type="button" class="btn-secondary" onclick="window.app.navigate('debtDetail', '${debt.id}')">Cancelar</button>
            </div>
        </form>
    `;
}

function renderDebts() {
    const manualDebts = state.debts;
    const protocolInterests = extractProtocolInterests();
    const combinedDebts = [...manualDebts, ...protocolInterests];

    // Card 1: Total intereses a recaudar (Manuales + Protocolo)
    const totalMonthlyInterest = combinedDebts.reduce((acc, d) => {
        if (d.isProtocol) return acc + parseFloat(d.amount); // La cuota ya es el interés
        const rate = parseFloat(d.interest || 0) / 100;
        return acc + (parseFloat(d.amount || 0) * rate);
    }, 0);

    // Card 2: Capital puro de deudores (Solo deudas manuales)
    const totalManualCapital = manualDebts.reduce((acc, d) => acc + parseFloat(d.amount || 0), 0);

    // Alertas Proactivas (2 días)
    const today = new Date();
    const upcoming = combinedDebts.filter(d => {
        if (!d.start_date) return false;
        const startDay = new Date(d.start_date).getDate();
        const collectionDate = new Date(today.getFullYear(), today.getMonth(), startDay);
        const diffDays = Math.ceil((collectionDate - today) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 2;
    });

    return `
        <header class="main-header">
            <div class="user-info">
                <div class="avatar">DV</div>
                <div class="greeting">
                    <span>Libro de</span>
                    <h1>Cobros y Deudas</h1>
                </div>
            </div>
        </header>

        <section class="summary-card gold-gradient">
            <div class="summary-split" style="display: flex; gap: 15px;">
                <div class="card-content" style="flex: 1;">
                    <span class="label">Recaudación Intereses</span>
                    <h2 class="amount" style="font-size: 1.1rem;">${formatCurrency(totalMonthlyInterest)}</h2>
                </div>
                <div class="card-content" style="flex: 1;">
                    <span class="label">Capital Deudores</span>
                    <h2 class="amount" style="font-size: 1.1rem;">${formatCurrency(totalManualCapital)}</h2>
                </div>
            </div>
        </section>

        <main class="ledger-section">
            ${upcoming.length > 0 ? `
                <div class="alert-box warning" style="margin: 0 15px 20px 15px;">
                    <div class="alert-content">
                        <strong>⏳ Recordatorio:</strong> ${upcoming.map(u => u.person).join(', ')} tienen cobros por liquidar pronto.
                    </div>
                </div>
            ` : ''}

            <div class="loan-list">
                ${combinedDebts.length === 0 ? `
                    <div class="empty-state">
                        <p>No hay cobros pendientes.</p>
                        <button class="btn-primary" onclick="window.app.navigate('debtRegister')">Nueva Deuda</button>
                    </div>
                ` : combinedDebts.map(debt => {
                    const startDay = new Date(debt.start_date).getDate();
                    const daysRemaining = calculateDaysToNext(new Date(debt.start_date));
                    const isClosing = upcoming.some(u => u.id === debt.id);
                    const navAction = debt.isProtocol ? `navigate('details', '${debt.originalLoanId}')` : `navigate('debtDetail', '${debt.id}')`;
                    
                    return `
                        <div class="loan-card ${isClosing ? 'near-due' : ''}" onclick="window.app.${navAction}">
                            <div class="loan-info">
                                <div class="debtor-icon ${debt.isProtocol ? 'protocol-icon' : 'debt-icon'}">
                                    ${debt.isProtocol ? 'P' : (debt.photo ? `<img src="${debt.photo}" class="avatar-mini">` : debt.person.substring(0, 2).toUpperCase())}
                                </div>
                                <div class="loan-details">
                                    <h3>${debt.person} ${debt.isProtocol ? '<span class="badge-protocol">Protocolo</span>' : ''}</h3>
                                    <p>${debt.reason} • <span class="text-warning">Día ${startDay} (${daysRemaining}d restantes)</span></p>
                                </div>
                                <div class="loan-amount">
                                    <span class="current">${formatCurrency(debt.amount)}</span>
                                    <span class="rate">${debt.isProtocol ? 'Interés' : (parseFloat(debt.interest) > 0 ? `+${debt.interest}%` : 'Sin Int.')}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </main>

        <button class="fab" onclick="window.app.navigate('debtRegister')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
    `;
}

function renderDebtRegister() {
    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('debts')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Nueva Deuda Extra</h1>
        </header>

        <form id="debt-form" class="sovereign-form" onsubmit="window.app.handleSaveDebt(event)">
            <section class="form-section">
                <div class="form-group">
                    <label>Nombre del Deudor</label>
                    <input type="text" name="person" placeholder="Nombre completo" required>
                </div>
                <div class="form-group">
                    <label>Monto Adeudado (Bs.)</label>
                    <input type="number" name="amount" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label>Motivo de la Deuda</label>
                    <textarea name="reason" placeholder="Ej: Venta de repuestos, préstamo personal..." required></textarea>
                </div>
            </section>

            <section class="form-section">
                <div class="form-row">
                    <div class="form-group">
                        <label>Fecha Inicio</label>
                        <input type="date" name="startDate" required>
                    </div>
                    <div class="form-group">
                        <label>Tasa Interés (%) - Opcional</label>
                        <input type="number" name="interestRate" placeholder="0" step="0.1">
                    </div>
                </div>
                <div class="form-group">
                    <label>Plazo Límite (Opcional)</label>
                    <input type="date" name="endDate">
                </div>
            </section>

            <div class="form-actions">
                <button type="submit" class="btn-primary">Guardar Deuda</button>
                <button type="button" class="btn-secondary" onclick="window.app.navigate('debts')">Cancelar</button>
            </div>
        </form>
    `;
}

async function handleSaveDebt(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        const newDebt = {
            id: Date.now().toString(),
            debtor: formData.get('person'),
            amount: formData.get('amount'),
            collateral: formData.get('reason'),
            interest: formData.get('interestRate') || 0,
            start_date: formData.get('startDate'),
            end_date: formData.get('endDate') || null,
            installments: null,
            ref: 'DEUDA_DIARIA'
        };

    try {
        const { error } = await sb.from('loans').insert([newDebt]);
        if (error) throw error;
        state.debts.unshift({
            id: newDebt.id,
            person: newDebt.debtor,
            amount: newDebt.amount,
            reason: newDebt.collateral,
            start_date: newDebt.start_date,
            end_date: newDebt.end_date,
            interest: newDebt.interest
        });
        navigate('debts');
    } catch (error) {
        alert("Error guardando deuda: " + error.message);
    }
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
        installments: installments
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
    if (!loan) return;

    const monthsInput = prompt("¿Cuántos meses desea ampliar el plazo?", "1");
    const numMonths = parseInt(monthsInput);

    if (isNaN(numMonths) || numMonths <= 0) {
        alert("Por favor ingrese un número de meses válido.");
        return;
    }

    for (let i = 0; i < numMonths; i++) {
        const lastDate = new Date(loan.end_date);
        lastDate.setMonth(lastDate.getMonth() + 1);
        loan.end_date = lastDate.toISOString().split('T')[0];
        
        const nextMonth = loan.installments.length + 1;
        const monthlyInterest = (parseFloat(loan.amount) * parseFloat(loan.interest)) / 100;
        
        const due = new Date(loan.start_date);
        due.setMonth(due.getMonth() + nextMonth);

        loan.installments.push({
            id: Date.now() + i, // Unique ID for each
            month: nextMonth,
            amount: monthlyInterest,
            dueDate: due.toISOString(),
            paid: false
        });
    }

    try {
        await sb
            .from('loans')
            .update({ 
                end_date: loan.end_date, 
                installments: loan.installments 
            })
            .eq('id', loanId);
        
        render();
    } catch (error) {
        console.error("[Sovereign Cloud] Error ampliando:", error.message);
        alert("Error al ampliar el plazo. Intente de nuevo.");
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

async function exportToPDF(loanId) {
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan) return;

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // --- ESTILOS Y COLORES ---
        const primaryColor = [16, 185, 129]; // Emerald 500
        const darkColor = [31, 41, 55];
        
        // --- ENCABEZADO ---
        doc.setFillColor(...darkColor);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.text("SOVEREIGN PROTOCOL", 20, 20);
        doc.setFontSize(10);
        doc.text("EXTRACTO OFICIAL DE LIQUIDACIÓN DE ACTIVOS", 20, 30);
        
        // --- DATOS DEL CLIENTE ---
        doc.setTextColor(...darkColor);
        doc.setFontSize(14);
        doc.text("PERFIL DEL DEUDOR", 20, 55);
        doc.setDrawColor(...primaryColor);
        doc.line(20, 57, 190, 57);
        
        doc.setFontSize(11);
        doc.text(`Nombre: ${loan.debtor}`, 20, 65);
        doc.text(`Referencia/Tel: ${loan.ref}`, 20, 72);
        doc.text(`Tasa de Interés: ${loan.interest}% Mensual`, 20, 79);
        
        // --- PLAZOS ---
        doc.setFontSize(14);
        doc.text("ARQUITECTURA DEL PRÉSTAMO", 20, 95);
        doc.line(20, 97, 190, 97);
        
        doc.setFontSize(11);
        const months = calculateMonths(loan.start_date, loan.end_date);
        doc.text(`Fecha de Inicio: ${formatDate(loan.start_date)}`, 20, 105);
        doc.text(`Fecha de Vencimiento: ${formatDate(loan.end_date)}`, 20, 112);
        doc.text(`Duración Total: ${months} Mes(es)`, 20, 119);
        doc.text(`Capital Principal: ${formatCurrency(loan.amount)}`, 20, 126);

        // --- TABLA DE PAGOS ---
        doc.setFontSize(14);
        doc.text("CRONOGRAMA DE PAGOS DE INTERÉS", 20, 145);
        
        const tableBody = loan.installments.map(inst => [
            `Mes ${inst.month}`,
            formatDate(inst.dueDate),
            formatCurrency(inst.amount),
            inst.paid ? 'COBRADO' : 'PENDIENTE'
        ]);

        doc.autoTable({
            startY: 150,
            head: [['Mes', 'Fecha Límite', 'Monto Interés', 'Estado de Cobro']],
            body: tableBody,
            headStyles: { fillColor: primaryColor },
            styles: { fontSize: 10 },
            margin: { left: 20, right: 20 }
        });

        const finalY = doc.lastAutoTable.finalY + 15;

        // --- GARANTÍAS ---
        doc.setFontSize(14);
        doc.text("GARANTÍAS Y AVALES", 20, finalY);
        doc.line(20, finalY + 2, 190, finalY + 2);
        
        doc.setFontSize(11);
        doc.text(`Garante: ${loan.guarantor}`, 20, finalY + 10);
        const splitCollateral = doc.splitTextToSize(`Garantía: ${loan.collateral || 'Sin descripción'}`, 170);
        doc.text(splitCollateral, 20, finalY + 17);

        // --- FIRMAS ---
        const signatureY = 270;
        doc.line(20, signatureY, 80, signatureY);
        doc.text("Firma del Deudor", 35, signatureY + 5);
        
        doc.line(130, signatureY, 190, signatureY);
        doc.text("Firma del Acreedor", 145, signatureY + 5);

        // --- COMPARTIR O GUARDAR ---
        const pdfBlob = doc.output('blob');
        const fileName = `Extracto_${loan.debtor.replace(/\s+/g, '_')}.pdf`;
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Extracto de Préstamo Sovereign',
                text: `Documento oficial para ${loan.debtor}`
            });
        } else {
            doc.save(fileName);
        }

    } catch (error) {
        console.error("[Sovereign PDF] Error generando archivo:", error);
        alert("Error al generar el PDF. Verifica tu conexión.");
    }
}

// --- INITIALIZATION ---
window.app = {
    navigate,
    handleSave,
    handleDelete,
    handleToggleInstallment,
    handleExtendLoan,
    exportToPDF,
    toggleTheme,
    handleSaveDebt,
    handleSaveExpense: async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const newExpense = {
            id: Date.now().toString(),
            debtor: formData.get('name'),
            amount: formData.get('amount'),
            guarantor: formData.get('category'),
            start_date: formData.get('payDate'),
            collateral: formData.get('refNumber'),
            ref: 'MI_PAGO',
            installments: null
        };
        try {
            await sb.from('loans').insert([newExpense]);
            state.expenses.unshift({
                id: newExpense.id,
                name: newExpense.debtor,
                amount: newExpense.amount,
                category: newExpense.guarantor,
                payDate: newExpense.start_date,
                refNumber: newExpense.collateral
            });
            navigate('expenses');
        } catch (e) { alert(e.message); }
    },
    handleUpdateLoan: async (event, id) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const amount = formData.get('amount');
        const interest = formData.get('interest');
        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        
        // Re-calcular intereses y cuotas
        const months = calculateMonths(startDate, endDate);
        const installments = generateInstallments(amount, interest, months, startDate);

        const updates = {
            debtor: formData.get('debtor'),
            amount: amount,
            interest: interest,
            start_date: startDate,
            end_date: endDate,
            collateral: formData.get('collateral'),
            guarantor: formData.get('guarantor'),
            installments: installments
        };

        try {
            await sb.from('loans').update(updates).eq('id', id);
            const loanIndex = state.loans.findIndex(l => l.id === id);
            if (loanIndex > -1) {
                state.loans[loanIndex] = { ...state.loans[loanIndex], ...updates };
            }
            navigate('details', id);
        } catch (e) { alert(e.message); }
    },
    handleDeleteUniversal: async (id, viewToNavigate) => {
        if (confirm('¿Eliminar registro definitivamente?')) {
            await sb.from('loans').delete().eq('id', id);
            state.loans = state.loans.filter(l => l.id !== id);
            state.debts = state.debts.filter(d => d.id !== id);
            state.expenses = state.expenses.filter(e => e.id !== id);
            navigate(viewToNavigate);
        }
    },
    handleUpdateExpense: async (event, id) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const updates = {
            debtor: formData.get('name'),
            amount: formData.get('amount'),
            guarantor: formData.get('category'),
            start_date: formData.get('payDate'),
            end_date: formData.get('endDate') || null,
        };
        try {
            await sb.from('loans').update(updates).eq('id', id);
            const exp = state.expenses.find(e => e.id === id);
            if (exp) Object.assign(exp, { 
                name: updates.debtor, 
                amount: updates.amount, 
                category: updates.guarantor, 
                payDate: updates.start_date,
                endDate: updates.end_date 
            });
            navigate('expenseDetail', id);
        } catch (e) { alert(e.message); }
    },
    handleUpdateDebt: async (event, id) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const updates = {
            debtor: formData.get('person'),
            amount: formData.get('amount'),
            collateral: formData.get('reason'),
            interest: formData.get('interestRate') || 0,
            start_date: formData.get('startDate'),
            end_date: formData.get('endDate')
        };
        try {
            await sb.from('loans').update(updates).eq('id', id);
            const debt = state.debts.find(d => d.id === id);
            if (debt) Object.assign(debt, { 
                person: updates.debtor, 
                amount: updates.amount, 
                reason: updates.collateral, 
                interest: updates.interest,
                start_date: updates.start_date,
                end_date: updates.end_date 
            });
            navigate('debtDetail', id);
        } catch (e) { alert(e.message); }
    },
    handleToggleExpenseMonth: async (expId, monthId) => {
        const exp = state.expenses.find(e => e.id === expId);
        if (!exp) return;
        
        if (!exp.installments) exp.installments = [];
        const index = exp.installments.findIndex(i => i.id === monthId);
        
        if (index > -1) {
            exp.installments[index].paid = !exp.installments[index].paid;
        } else {
            exp.installments.push({ id: monthId, paid: true });
        }
        
        await sb.from('loans').update({ installments: exp.installments }).eq('id', expId);
        render();
    },
    handlePhotoCapture: async (event, debtId) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result;
            await sb.from('loans').update({ guarantor: base64 }).eq('id', debtId);
            const debt = state.debts.find(d => d.id === debtId);
            if (debt) debt.photo = base64;
            render();
        };
        reader.readAsDataURL(file);
    }
};

// Start App
loadState();
