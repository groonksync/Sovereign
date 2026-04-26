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
    receipts: [], // Studio Sync Pro
    currentView: 'dashboard',
    editorProTab: 'escritorio',
    selectedEditorProject: null,
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
        state.loans = allData.filter(l => l.ref !== 'DEUDA_DIARIA' && l.ref !== 'MI_PAGO' && l.ref !== 'STUDIO_SYNC').map(l => ({
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

        state.receipts = allData.filter(l => l.ref === 'STUDIO_SYNC').map(r => {
            const extra = typeof r.installments === 'object' ? r.installments : {};
            return {
                id: r.id,
                receiptId: extra.receiptId || `SSP-${r.id.substring(0,4)}`,
                date: r.start_date,
                clientName: r.debtor,
                brandName: r.collateral,
                projectName: extra.projectName || '',
                items: extra.items || [],
                totalAmount: r.amount,
                totals: { 
                    BOB: extra.totalBOB || 0, 
                    USD: extra.totalUSD || 0, 
                    EUR: extra.totalEUR || 0 
                },
                status: extra.status || 'Pagado',
                paymentMethod: extra.paymentMethod || 'Transferencia',
                terms: extra.terms || '',
                watermarkEnabled: extra.watermarkEnabled !== false
            };
        });

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
const formatCurrency = (amount, symbol = 'Bs.') => {
    const val = parseFloat(amount || 0);
    return isNaN(val) ? `${symbol} 0.00` : `${symbol} ` + new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(val);
};
const formatDate = (dateStr) => {
    if (!dateStr) return 'Pendiente';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

function calculateDaysUntil(dateStr) {
    if (!dateStr) return 0;
    return calculateDaysToNext(new Date(dateStr));
}

function calculateDaysToNext(startDate) {
    if (!startDate || isNaN(startDate.getTime())) return 0;
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth(), startDate.getDate());
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

function renderStudioSync() {
    return `
        <header class="main-header">
            <div class="user-info">
                <div class="avatar" style="background:var(--primary-emerald);">SS</div>
                <div class="greeting">
                    <h1>Studio Sync Pro</h1>
                    <p>Gestión de Producción</p>
                </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <button id="btn-google-auth" class="btn-icon" onclick="window.app.handleGoogleAuth()" title="Sincronizar Google Drive">
                    <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" style="width:16px; height:16px;">
                    <div id="google-status-dot" style="position:absolute; top:-2px; right:-2px; width:8px; height:8px; background:#4a4a4a; border-radius:50%; border:2px solid #000;"></div>
                </button>
                <button class="btn-icon" onclick="window.app.exportDriveBackup()" title="Backup Seguro">
                    <i data-lucide="save"></i>
                </button>
            </div>
        </header>

        <section class="summary-card gold-gradient">
            <div class="card-content">
                <span class="label">Total Facturado (Neto)</span>
                <h2 class="amount">${formatCurrency(state.receipts.reduce((acc, r) => acc + r.totalAmount, 0))}</h2>
                <div class="stats-row">
                    <div class="stat">
                        <span class="stat-label">Recibos Emitidos</span>
                        <span class="stat-value">${state.receipts.length}</span>
                    </div>
                </div>
            </div>
        </section>

        <main class="ledger-section">
            <div class="section-header">
                <h2>Historial de Recibos</h2>
            </div>
            <div class="loan-list">
                ${state.receipts.length === 0 ? `
                    <div class="empty-state">
                        <p>No hay recibos registrados aún.</p>
                        <button class="btn-primary" onclick="window.app.navigate('receiptRegister')">Emitir Primer Recibo</button>
                    </div>
                ` : state.receipts.map(r => `
                    <div class="loan-card" onclick="window.app.navigate('receiptDetail', '${r.id}')">
                        <div class="loan-info">
                            <div class="debtor-icon" style="background:#2d3748; color:white;">${r.receiptId.split('-')[1] || 'RC'}</div>
                            <div class="loan-details">
                                <h3 style="font-size:0.8rem; color:var(--primary-emerald);">${r.receiptId}</h3>
                                <p style="font-weight:700;">${r.clientName}</p>
                                <p style="font-size:0.6rem;">${r.brandName} • ${formatDate(r.date)}</p>
                            </div>
                            <div class="loan-amount">
                                <span class="current">${formatCurrency(r.totals && r.totals.USD > 0 ? r.totals.USD : (r.totals && r.totals.EUR > 0 ? r.totals.EUR : (r.totals ? r.totals.BOB : r.totalAmount)), r.totals && r.totals.USD > 0 ? '$' : (r.totals && r.totals.EUR > 0 ? '€' : 'Bs.'))}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </main>

        <button class="fab" onclick="window.app.navigate('receiptRegister')">
            <i data-lucide="plus"></i>
        </button>
    `;
}

function renderReceiptRegister() {
    const year = new Date().getFullYear();
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const nextId = `SSP-${year}-${randomId}`;

    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('studioSync')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Nuevo Recibo Pro</h1>
        </header>

        <form id="receipt-form" class="sovereign-form" onsubmit="window.app.handleSaveReceipt(event)">
            <div class="noir-card">
                <div class="form-row" style="gap:15px; margin-bottom:15px;">
                    <div class="form-group" style="flex:2;">
                        <span class="noir-label">NOMBRE DEL CLIENTE</span>
                        <div class="noir-input-container">
                            <div class="icon-box" style="cursor:default; color:#4a4a4a;">
                                <i data-lucide="user"></i>
                            </div>
                            <input type="text" name="clientName" class="glass-input" placeholder="Lisandro" required>
                        </div>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <span class="noir-label">PROYECTO</span>
                        <div class="noir-input-container">
                            <div class="icon-box" style="cursor:default; color:#4a4a4a;">
                                <i data-lucide="folder"></i>
                            </div>
                            <input type="text" name="projectName" class="glass-input" placeholder="Ej: Proyecto 01">
                        </div>
                    </div>
                </div>
                
            <div class="noir-card">
                <span class="noir-label">CONFIGURACIÓN DE COBRO</span>
                <div class="form-row" style="gap:15px;">
                    <div class="form-group" style="flex:1;">
                        <span class="noir-label">ESTADO DE COBRO</span>
                        <div class="status-picker">
                            <div class="status-option paid active" onclick="window.app.updateStatus(this, 'Pagado')">
                                <i data-lucide="check-circle"></i>
                                <span>Pagado</span>
                            </div>
                            <div class="status-option pending" onclick="window.app.updateStatus(this, 'Pendiente')">
                                <i data-lucide="clock"></i>
                                <span>Pendiente</span>
                            </div>
                            <div class="status-option partial" onclick="window.app.updateStatus(this, 'Parcial')">
                                <i data-lucide="pie-chart"></i>
                                <span>Parcial</span>
                            </div>
                        </div>
                        <input type="hidden" name="status" value="Pagado">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <span class="noir-label">MÉTODO</span>
                        <select name="paymentMethod" class="glass-input">
                            <option value="Transferencia">Transferencia</option>
                            <option value="QR / Banco">QR / Banco</option>
                            <option value="Efectivo">Efectivo</option>
                            <option value="Binance / USDT">Binance / USDT</option>
                            <option value="PayPal">PayPal</option>
                        </select>
                    </div>
                </div>
                <div class="form-group" style="margin-top:15px; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:10px; border-radius:12px; border:1px solid #1a1a1a;">
                    <span class="noir-label" style="margin:0;">MARCA DE AGUA</span>
                    <label class="switch-container">
                        <input type="checkbox" name="watermarkEnabled" checked onchange="window.app.toggleWatermarkPreview(this.checked)">
                        <span class="switch-slider"></span>
                    </label>
                </div>

                <div class="form-group" style="margin-top:15px;">
                    <span class="noir-label">TÉRMINOS / GARANTÍA</span>
                    <textarea name="terms" class="glass-input" style="min-height:60px; font-size:0.8rem;">Garantía: Este pago cubre hasta 3 rondas de revisiones. Al completarse el pago, se transfieren los derechos de uso comercial.</textarea>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:0 10px;">
                <span class="noir-label" style="margin:0;">SERVICIOS</span>
                <button type="button" class="noir-btn-add" onclick="window.app.addReceiptItem()">
                    <span>+ Nuevo Concepto</span>
                </button>
            </div>

            <div id="items-container">
                <!-- Los items se añadirán aquí dinámicamente -->
            </div>

            <div class="form-actions">
                <button type="submit" class="btn-primary">Guardar e Imprimir</button>
            </div>
        </form>
    `;
}

function renderReceiptDetail() {
    const receipt = state.receipts.find(r => r.id === state.selectedLoanId);
    if (!receipt) return `<div class="empty-state"><p>Recibo no encontrado.</p></div>`;

    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('studioSync')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Vista de Recibo</h1>
            <div style="display:flex; gap:10px;">
                <span class="status-badge ${receipt.status === 'Pagado' ? 'paid' : (receipt.status === 'Pendiente' ? 'pending' : 'partial')}">
                    ${receipt.status || 'Pagado'}
                </span>
                <button class="menu-btn" onclick="window.app.navigate('receiptEdit', '${receipt.id}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-icon" onclick="window.app.handleDeleteUniversal('${receipt.id}', 'studioSync')">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </header>

        <div class="receipt-paper" id="printable-receipt">
            <div class="receipt-header">
                <h2>STUDIO SYNC PRO</h2>
                <p>Digital Media Production Services</p>
            </div>

            <div class="receipt-info-grid">
                <div class="receipt-info-item">
                    <label>RECIBO #</label>
                    <span>${receipt.receiptId}</span>
                </div>
                <div class="receipt-info-item">
                    <label>FECHA</label>
                    <span>${formatDate(receipt.date)}</span>
                </div>
                <div class="receipt-info-item">
                    <label>CLIENTE</label>
                    <span>${receipt.clientName}</span>
                </div>
                ${receipt.projectName ? `
                <div class="receipt-info-item">
                    <label>PROYECTO</label>
                    <span>${receipt.projectName}</span>
                </div>
                ` : ''}
            </div>

            <table class="receipt-table">
                <thead>
                    <tr>
                        <th style="width:40px;"></th>
                        <th>Empresa / Servicio</th>
                        <th style="text-align:center;">Cant.</th>
                        <th style="text-align:right;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${receipt.items.map(item => `
                        <tr>
                            <td style="vertical-align:top; padding-top:12px;">
                                <i data-lucide="${item.serviceIcon || 'pen-tool'}" style="width:16px; height:16px; color:var(--primary-emerald);"></i>
                            </td>
                            <td>
                                <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                                    <i data-lucide="${item.brandIcon || 'video'}" style="width:12px; height:12px; opacity:0.6;"></i>
                                    <strong style="font-size:0.7rem; color:var(--primary-emerald);">${item.brand}</strong>
                                </div>
                                <span>${item.desc}</span>
                            </td>
                            <td style="text-align:center;">${item.qty}</td>
                            <td class="amount-col">${formatCurrency(item.qty * item.price, item.currency === 'USD' ? '$' : (item.currency === 'EUR' ? '€' : 'Bs.'))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="receipt-total-section">
                ${receipt.totals && receipt.totals.BOB > 0 ? `
                    <div style="display:flex; justify-content:space-between; width:100%; margin-bottom:5px;">
                        <span class="total-label" style="font-size:0.8rem;">TOTAL BOB</span>
                        <span class="total-amount" style="font-size:1rem;">${formatCurrency(receipt.totals.BOB)}</span>
                    </div>
                ` : ''}
                ${receipt.totals && receipt.totals.USD > 0 ? `
                    <div style="display:flex; justify-content:space-between; width:100%; margin-bottom:5px;">
                        <span class="total-label" style="font-size:0.8rem;">TOTAL USD</span>
                        <span class="total-amount" style="font-size:1rem; color:#2d3748;">${formatCurrency(receipt.totals.USD, '$')}</span>
                    </div>
                ` : ''}
                ${receipt.totals && receipt.totals.EUR > 0 ? `
                    <div style="display:flex; justify-content:space-between; width:100%;">
                        <span class="total-label" style="font-size:0.8rem;">TOTAL EUR</span>
                        <span class="total-amount" style="font-size:1rem; color:#2d3748;">${formatCurrency(receipt.totals.EUR, '€')}</span>
                    </div>
                ` : ''}
                ${!receipt.totals ? `
                    <span class="total-label">TOTAL BS.</span>
                    <span class="total-amount">${formatCurrency(receipt.totalAmount)}</span>
                ` : ''}
            </div>

            <div class="receipt-footer">
                <p>Este documento es un comprobante de servicio digital.</p>
                <p>Generado mediante Sovereign AES-256 System.</p>
            </div>
        </div>

        <div class="header-actions" style="justify-content:center; gap:20px; margin-top:20px;">
            <button class="btn-print" onclick="window.print()">
                🖨️ Imprimir Recibo
            </button>
            <button class="btn-print" style="background:var(--primary-emerald);" onclick="window.app.exportReceiptToPDF('${receipt.id}')">
                📄 Exportar PDF
            </button>
        </div>
    `;
}


function renderReceiptEdit() {
    const receipt = state.receipts.find(r => r.id === state.selectedLoanId);
    if (!receipt) return navigate('studioSync');

    return `
        <header class="view-header">
            <button class="back-btn" onclick="window.app.navigate('receiptDetail', '${receipt.id}')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <h1>Editar Recibo</h1>
        </header>

        <form id="edit-receipt-form" class="sovereign-form" onsubmit="window.app.handleUpdateReceipt(event, '${receipt.id}')">
            <div class="noir-card">
                <span class="noir-label">CONFIGURACIÓN DE COBRO</span>
                <div class="form-row" style="gap:15px;">
                    <div class="form-group" style="flex:1;">
                        <span class="noir-label">ESTADO DE COBRO</span>
                        <div class="status-picker">
                            <div class="status-option paid ${receipt.status === 'Pagado' ? 'active' : ''}" onclick="window.app.updateStatus(this, 'Pagado')">
                                <i data-lucide="check-circle"></i>
                                <span>Pagado</span>
                            </div>
                            <div class="status-option pending ${receipt.status === 'Pendiente' ? 'active' : ''}" onclick="window.app.updateStatus(this, 'Pendiente')">
                                <i data-lucide="clock"></i>
                                <span>Pendiente</span>
                            </div>
                            <div class="status-option partial ${receipt.status === 'Parcial' ? 'active' : ''}" onclick="window.app.updateStatus(this, 'Parcial')">
                                <i data-lucide="pie-chart"></i>
                                <span>Parcial</span>
                            </div>
                        </div>
                        <input type="hidden" name="status" value="${receipt.status || 'Pagado'}">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <span class="noir-label">MÉTODO</span>
                        <select name="paymentMethod" class="glass-input">
                            <option value="Transferencia" ${receipt.paymentMethod === 'Transferencia' ? 'selected' : ''}>Transferencia</option>
                            <option value="QR / Banco" ${receipt.paymentMethod === 'QR / Banco' ? 'selected' : ''}>QR / Banco</option>
                            <option value="Efectivo" ${receipt.paymentMethod === 'Efectivo' ? 'selected' : ''}>Efectivo</option>
                            <option value="Binance / USDT" ${receipt.paymentMethod === 'Binance / USDT' ? 'selected' : ''}>Binance / USDT</option>
                            <option value="PayPal" ${receipt.paymentMethod === 'PayPal' ? 'selected' : ''}>PayPal</option>
                        </select>
                    </div>
                </div>
                <div class="form-group" style="margin-top:15px; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:10px; border-radius:12px; border:1px solid #1a1a1a;">
                    <span class="noir-label" style="margin:0;">MARCA DE AGUA</span>
                    <label class="switch-container">
                        <input type="checkbox" name="watermarkEnabled" ${receipt.watermarkEnabled !== false ? 'checked' : ''} onchange="window.app.toggleWatermarkPreview(this.checked)">
                        <span class="switch-slider"></span>
                    </label>
                </div>

                <div class="form-group" style="margin-top:15px;">
                    <span class="noir-label">TÉRMINOS / GARANTÍA</span>
                    <textarea name="terms" class="glass-input" style="min-height:60px; font-size:0.8rem;">${receipt.terms || 'Garantía: Este pago cubre hasta 3 rondas de revisiones. Al completarse el pago, se transfieren los derechos de uso comercial.'}</textarea>
                </div>
            </div>

            <div class="noir-card">
                <div class="form-row" style="gap:15px; margin-bottom:15px;">
                    <div class="form-group" style="flex:2;">
                        <span class="noir-label">NOMBRE DEL CLIENTE</span>
                        <div class="noir-input-container">
                            <div class="icon-box" style="cursor:default; color:#4a4a4a;">
                                <i data-lucide="user"></i>
                            </div>
                            <input type="text" name="clientName" class="glass-input" value="${receipt.clientName}" required>
                        </div>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <span class="noir-label">PROYECTO</span>
                        <div class="noir-input-container">
                            <div class="icon-box" style="cursor:default; color:#4a4a4a;">
                                <i data-lucide="folder"></i>
                            </div>
                            <input type="text" name="projectName" class="glass-input" value="${receipt.projectName || ''}" placeholder="Ej: Proyecto 01">
                        </div>
                    </div>
                </div>
                
                <div class="form-row" style="margin-top:20px; gap:20px;">
                    <div class="form-group" style="flex:1;">
                        <span class="noir-label">ID RECIBO</span>
                        <input type="text" name="receiptId" value="${receipt.receiptId}" readonly style="background:transparent; color:var(--primary-emerald); border:none; font-weight:700;">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <span class="noir-label">FECHA</span>
                        <input type="date" name="date" value="${receipt.date}" required style="background:transparent; color:white; border:none;">
                    </div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:0 10px;">
                <span class="noir-label" style="margin:0;">SERVICIOS</span>
                <button type="button" class="noir-btn-add" onclick="window.app.addReceiptItem()">
                    <span>+ Nuevo Concepto</span>
                </button>
            </div>

            <div id="items-container">
                ${receipt.items.map((item, index) => `
                    <div class="noir-card receipt-item-card" style="padding:20px; position:relative;">
                        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="position:absolute; top:12px; right:12px; color:#ff4d4d; opacity:0.5;">✕</button>
                        
                        <div class="noir-input-container" style="margin-bottom:12px;">
                            <div class="icon-box" data-type="Brand" data-index="${index}" onclick="window.app.openIconPicker(event, 'Brand', ${index})">
                                <i data-lucide="${item.brandIcon || 'globe'}"></i>
                            </div>
                            <input type="text" name="itemBrand[]" class="glass-input" value="${item.brand}" placeholder="Nombre de la marca" required>
                            <input type="hidden" name="itemBrandIcon[]" value="${item.brandIcon || 'globe'}" data-index="${index}">
                        </div>
                        
                        <div class="noir-input-container">
                            <div class="icon-box" data-type="Service" data-index="${index}" onclick="window.app.openIconPicker(event, 'Service', ${index})">
                                <i data-lucide="${item.serviceIcon || 'video'}"></i>
                            </div>
                            <input type="text" name="itemDesc[]" class="glass-input" value="${item.desc}" placeholder="Edición de Video High-End" required>
                            <input type="hidden" name="itemServiceIcon[]" value="${item.serviceIcon || 'video'}" data-index="${index}">
                        </div>
                        
                        <div class="item-row-divider"></div>
                        
                        <div class="noir-grid-3">
                            <div class="noir-input-container">
                                <input type="number" name="itemQty[]" class="glass-input" value="${item.qty}" min="1" style="text-align:center;" required>
                            </div>
                            <div class="noir-input-container" style="padding-left:15px;">
                                <span style="color:var(--primary-emerald); font-weight:700;">$</span>
                                <input type="number" name="itemPrice[]" class="glass-input" value="${item.price}" step="0.01" required>
                            </div>
                            <div class="noir-input-container">
                                <select name="itemCurrency[]" class="glass-input" style="text-align:center;">
                                    <option value="BOB" ${item.currency === 'BOB' ? 'selected' : ''}>BOB</option>
                                    <option value="USD" ${item.currency === 'USD' ? 'selected' : ''}>USD</option>
                                    <option value="EUR" ${item.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                                </select>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="form-actions">
                <button type="submit" class="btn-primary">Actualizar Recibo</button>
                <button type="button" class="btn-secondary" onclick="window.app.navigate('receiptDetail', '${receipt.id}')">Cancelar</button>
            </div>
        </form>
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
            case 'studioSync': content = renderStudioSync(); break;
            case 'receiptRegister': content = renderReceiptRegister(); break;
            case 'receiptDetail': content = renderReceiptDetail(); break;
            case 'receiptEdit': content = renderReceiptEdit(); break;
            case 'editorPro': content = renderEditorProSuite(); break;
            default: content = renderDashboard();
        }
    } catch (e) {
        console.error("Render Error:", e);
        content = `<div class="empty-state"><p>Error al cargar la vista. Intente de nuevo.</p></div>`;
    }

    app.innerHTML = content + renderTabBar();
    if (window.lucide) window.lucide.createIcons();
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
                <i data-lucide="layout-grid"></i>
                <span>Geral</span>
            </button>
            <button class="tab-item ${state.currentView === 'debts' ? 'active' : ''}" onclick="window.app.navigate('debts')">
                <i data-lucide="users"></i>
                <span>Deudores</span>
            </button>
            <button class="tab-item ${state.currentView === 'expenses' ? 'active' : ''}" onclick="window.app.navigate('expenses')">
                <i data-lucide="credit-card"></i>
                <span>Pagos</span>
            </button>
            <button class="tab-item ${state.currentView === 'studioSync' ? 'active' : ''}" onclick="window.app.navigate('studioSync')">
                <i data-lucide="file-text"></i>
                <span>Recibos</span>
            </button>
            <button class="tab-item ${state.currentView === 'editorPro' ? 'active' : ''}" onclick="window.app.navigate('editorPro')">
                <i data-lucide="video"></i>
                <span>Editor Pro</span>
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
    
    const protocolEntries = combinedDebts.filter(d => d.isProtocol);
    const manualEntries = combinedDebts.filter(d => !d.isProtocol);

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
                ${protocolEntries.length > 0 ? `
                    <div class="section-header" style="margin-top: 10px;">
                        <h2 class="section-title">Intereses de Préstamos (Protocolo)</h2>
                    </div>
                    ${protocolEntries.map(debt => renderDebtCard(debt, upcoming)).join('')}
                ` : ''}

                ${manualEntries.length > 0 ? `
                    <div class="section-header" style="margin-top: 25px;">
                        <h2 class="section-title">Cartera de Deudores (Personal)</h2>
                    </div>
                    ${manualEntries.map(debt => renderDebtCard(debt, upcoming)).join('')}
                ` : ''}

                ${combinedDebts.length === 0 ? `
                    <div class="empty-state">
                        <p>No hay cobros pendientes.</p>
                        <button class="btn-primary" onclick="window.app.navigate('debtRegister')">Nueva Deuda</button>
                    </div>
                ` : ''}
            </div>
        </main>

        <button class="fab" onclick="window.app.navigate('debtRegister')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
    `;
}

function renderDebtCard(debt, upcoming) {
    const startDay = new Date(debt.start_date).getDate();
    const daysRemaining = calculateDaysToNext(new Date(debt.start_date));
    const isClosing = upcoming.some(u => u.id === debt.id);
    const navAction = debt.isProtocol ? `navigate('details', '${debt.originalLoanId}')` : `navigate('debtDetail', '${debt.id}')`;
    
    return `
        <div class="loan-card ${isClosing ? 'near-due' : ''}" onclick="window.app.${navAction}">
            <div class="loan-info">
                <div class="debtor-icon ${debt.isProtocol ? 'protocol-icon' : 'debt-icon'}">
                    ${debt.isProtocol ? 'P' : (debt.photo ? `<img src="${debt.photo}" class="avatar-mini">` : (debt.person || '??').substring(0, 2).toUpperCase())}
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
    },
    addReceiptItem: () => {
        const container = document.getElementById('items-container');
        const itemIndex = container.children.length;
        const card = document.createElement('div');
        card.className = 'noir-card receipt-item-card';
        card.style.padding = '20px';
        card.style.position = 'relative';
        card.innerHTML = `
            <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="position:absolute; top:12px; right:12px; color:#ff4d4d; opacity:0.5;">✕</button>
            
            <div class="noir-input-container" style="margin-bottom:12px;">
                <div class="icon-box" data-type="Brand" data-index="${itemIndex}" onclick="window.app.openIconPicker(event, 'Brand', ${itemIndex})">
                    <i data-lucide="globe"></i>
                </div>
                <input type="text" name="itemBrand[]" class="glass-input" placeholder="Nombre de la marca" required>
                <input type="hidden" name="itemBrandIcon[]" value="globe" data-index="${itemIndex}">
            </div>
            
            <div class="noir-input-container">
                <div class="icon-box" data-type="Service" data-index="${itemIndex}" onclick="window.app.openIconPicker(event, 'Service', ${itemIndex})">
                    <i data-lucide="video"></i>
                </div>
                <input type="text" name="itemDesc[]" class="glass-input" placeholder="Edición de Video High-End" required>
                <input type="hidden" name="itemServiceIcon[]" value="video" data-index="${itemIndex}">
            </div>
            
            <div class="item-row-divider"></div>
            
            <div class="noir-grid-3">
                <div class="noir-input-container">
                    <input type="number" name="itemQty[]" class="glass-input" value="1" min="1" style="text-align:center;" required>
                </div>
                <div class="noir-input-container" style="padding-left:15px;">
                    <span style="color:var(--primary-emerald); font-weight:700;">$</span>
                    <input type="number" name="itemPrice[]" class="glass-input" placeholder="0" step="0.01" required>
                </div>
                <div class="noir-input-container">
                    <select name="itemCurrency[]" class="glass-input" style="text-align:center;">
                        <option value="BOB">BOB</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                    </select>
                </div>
            </div>
        `;
        container.appendChild(card);
        lucide.createIcons();
    },
    openIconPicker: (event, type, itemIndex) => {
        event.stopPropagation();
        const btn = event.currentTarget;
        const rect = btn.getBoundingClientRect();
        
        document.querySelectorAll('.icon-picker-popover').forEach(p => p.remove());
        
        const popover = document.createElement('div');
        popover.className = 'icon-picker-popover';
        popover.style.top = `${window.scrollY + rect.bottom + 8}px`;
        popover.style.left = `${rect.left}px`;
        
        const icons = ['video', 'image', 'camera', 'pen-tool', 'music', 'mic', 'globe'];
        
        popover.innerHTML = icons.map(icon => `
            <div class="icon-option" onclick="window.app.selectIcon('${icon}', '${type}', ${itemIndex})">
                <i data-lucide="${icon}"></i>
            </div>
        `).join('');
        
        document.body.appendChild(popover);
        lucide.createIcons();
        
        const closePicker = (e) => {
            if (!popover.contains(e.target) && e.target !== btn) {
                popover.remove();
                document.removeEventListener('click', closePicker);
            }
        };
        setTimeout(() => document.addEventListener('click', closePicker), 10);
    },
    selectIcon: (iconName, type, itemIndex) => {
        const input = document.querySelector(`input[name="item${type}Icon[]"][data-index="${itemIndex}"]`);
        const btn = document.querySelector(`.icon-preview-btn[data-type="${type}"][data-index="${itemIndex}"]`);
        
        if (input) input.value = iconName;
        if (btn) {
            btn.innerHTML = `<i data-lucide="${iconName}"></i>`;
            lucide.createIcons();
        }
        document.querySelectorAll('.icon-picker-popover').forEach(p => p.remove());
    },
    handleSaveReceipt: async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        
        // Recopilar items
        const items = [];
        const brands = formData.getAll('itemBrand[]');
        const brandIcons = formData.getAll('itemBrandIcon[]');
        const descs = formData.getAll('itemDesc[]');
        const serviceIcons = formData.getAll('itemServiceIcon[]');
        const qtys = formData.getAll('itemQty[]');
        const prices = formData.getAll('itemPrice[]');
        const currencies = formData.getAll('itemCurrency[]');
        
        let totalBOB = 0;
        let totalUSD = 0;
        let totalEUR = 0;

        descs.forEach((d, i) => {
            const q = parseFloat(qtys[i] || 0);
            const p = parseFloat(prices[i] || 0);
            const curr = currencies[i] || 'BOB';
            const b = brands[i] || '';
            const bi = brandIcons[i] || 'video';
            const si = serviceIcons[i] || 'pen-tool';
            
            items.push({ brand: b, brandIcon: bi, desc: d, serviceIcon: si, qty: q, price: p, currency: curr });
            
            if (curr === 'BOB') totalBOB += q * p;
            else if (curr === 'USD') totalUSD += q * p;
            else if (curr === 'EUR') totalEUR += q * p;
        });

        const newReceipt = {
            id: Date.now().toString(),
            debtor: formData.get('clientName'),
            amount: totalBOB > 0 ? totalBOB : (totalUSD > 0 ? totalUSD : totalEUR),
            collateral: items.length > 0 ? items[0].brand : 'Studio Sync',
            start_date: formData.get('date'),
            installments: {
                receiptId: formData.get('receiptId'),
                projectName: formData.get('projectName'),
                items: items,
                totalBOB: totalBOB,
                totalUSD: totalUSD,
                totalEUR: totalEUR,
                status: formData.get('status'),
                paymentMethod: formData.get('paymentMethod'),
                terms: formData.get('terms'),
                watermarkEnabled: formData.get('watermarkEnabled') === 'on'
            },
            ref: 'STUDIO_SYNC'
        };

        try {
            const { error } = await sb.from('loans').insert([newReceipt]);
            if (error) throw error;
            
            state.receipts.unshift({
                id: newReceipt.id,
                receiptId: newReceipt.installments.receiptId,
                date: newReceipt.start_date,
                clientName: newReceipt.debtor,
                brandName: newReceipt.collateral,
                items: items,
                totalAmount: newReceipt.amount,
                totals: { BOB: totalBOB, USD: totalUSD, EUR: totalEUR },
                status: newReceipt.installments.status,
                paymentMethod: newReceipt.installments.paymentMethod,
                terms: newReceipt.installments.terms
            });
            
            navigate('receiptDetail', newReceipt.id);
            // Feedback visual
            alert('¡Recibo SSP Guardado con éxito!');
        } catch (e) { alert(e.message); }
    },
    exportReceiptToPDF: async (id) => {
        const receipt = state.receipts.find(r => r.id === id);
        if (!receipt) return;

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // --- ESTILOS ---
            const accentColor = [0, 72, 82]; 
            const grayColor = [113, 128, 150];

            // --- WATERMARK ---
            if (receipt.watermarkEnabled !== false) {
                doc.setTextColor(245, 245, 245);
                doc.setFontSize(65);
                doc.setFont("helvetica", "bold");
                doc.text("STUDIO SYNC PRO", 105, 148, { align: 'center', angle: 45 });
                doc.setTextColor(0, 0, 0); // Reset color
            }

            // Header
            doc.setFillColor(0,0,0);
            doc.rect(0, 0, 210, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.setFont("helvetica", "bold");
            doc.text("STUDIO SYNC PRO", 105, 20, { align: 'center' });
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.text("DIGITAL MEDIA PRODUCTION SERVICES", 105, 28, { align: 'center' });

            // Info
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            doc.text(`RECIBO #: ${receipt.receiptId}`, 20, 55);
            doc.text(`FECHA: ${formatDate(receipt.date)}`, 140, 55);
            
            doc.setDrawColor(226, 232, 240);
            doc.line(20, 60, 190, 60);

            doc.text(`CLIENTE: ${receipt.clientName}`, 20, 70);
            if (receipt.projectName) {
                doc.setFontSize(8);
                doc.setTextColor(100, 100, 100);
                doc.text(`PROYECTO: ${receipt.projectName}`, 20, 74);
                doc.setFontSize(10);
                doc.setTextColor(0, 0, 0);
            }

            // Table
            const tableBody = receipt.items.map(item => [
                '', // Icon placeholder
                `${item.brand}\n${item.desc}`,
                item.qty,
                formatCurrency(item.price, item.currency === 'USD' ? '$' : (item.currency === 'EUR' ? '€' : 'Bs.')),
                formatCurrency(item.qty * item.price, item.currency === 'USD' ? '$' : (item.currency === 'EUR' ? '€' : 'Bs.'))
            ]);

            doc.autoTable({
                startY: 85,
                head: [['', 'Empresa / Servicio', 'Cant.', 'Precio Unit.', 'Subtotal']],
                body: tableBody,
                headStyles: { fillColor: accentColor },
                styles: { fontSize: 8, cellPadding: 3 },
                columnStyles: {
                    0: { cellWidth: 10 },
                    2: { halign: 'center' },
                    3: { halign: 'right' },
                    4: { halign: 'right' }
                }
            });

            const finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            
            let currentY = finalY;
            // Mostramos los totales de forma inteligente
            const hasTotals = receipt.totals && (receipt.totals.BOB > 0 || receipt.totals.USD > 0 || receipt.totals.EUR > 0);
            
            if (hasTotals) {
                // Orden de prioridad para el total principal
                if (receipt.totals.USD > 0) {
                    doc.text(`TOTAL USD: ${formatCurrency(receipt.totals.USD, '$')}`, 190, currentY, { align: 'right' });
                    currentY += 7;
                }
                if (receipt.totals.BOB > 0) {
                    doc.text(`TOTAL BOB: ${formatCurrency(receipt.totals.BOB)}`, 190, currentY, { align: 'right' });
                    currentY += 7;
                }
                if (receipt.totals.EUR > 0) {
                    doc.text(`TOTAL EUR: ${formatCurrency(receipt.totals.EUR, '€')}`, 190, currentY, { align: 'right' });
                }
            } else {
                doc.text(`TOTAL BS: ${formatCurrency(receipt.totalAmount)}`, 190, currentY, { align: 'right' });
            }

            // Status & Method
            currentY += 15;
            doc.setFontSize(10);
            doc.setTextColor(0,0,0);
            doc.text(`ESTADO DE PAGO: ${receipt.status || 'PAGADO'}`, 20, currentY);
            doc.text(`MÉTODO DE PAGO: ${receipt.paymentMethod || 'Transferencia'}`, 120, currentY);
            
            // Terms
            currentY += 15;
            doc.setFontSize(8);
            doc.setTextColor(...grayColor);
            const splitTerms = doc.splitTextToSize(receipt.terms || "Garantía de servicio Studio Sync Pro.", 170);
            doc.text(splitTerms, 20, currentY);

            doc.setFontSize(8);
            doc.setTextColor(...grayColor);
            doc.text("Gracias por confiar en Studio Sync Pro.", 105, 280, { align: 'center' });
            doc.text("Generado por Sovereign System.", 105, 285, { align: 'center' });

            const fileName = `Recibo_SSP_${receipt.receiptId}_${receipt.clientName.replace(/\s+/g, '_')}_${receipt.date}.pdf`;
            
            // --- DOBLE GUARDADO ---
            // 1. Descarga Normal
            doc.save(fileName);

            // 2. Guardado Directo en Carpeta (si está vinculada)
            if (window.driveFolderHandle) {
                try {
                    const pdfBlob = doc.output('blob');
                    const fileHandle = await window.driveFolderHandle.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(pdfBlob);
                    await writable.close();
                    console.log("Copia guardada directamente en Drive.");
                } catch (err) {
                    console.error("Error al guardar en carpeta vinculada:", err);
                    alert("Error al guardar en la carpeta de Drive. Es posible que debas vincularla de nuevo.");
                }
            }
            // 3. Guardado en Google Drive Cloud (si está vinculado)
            if (window.googleAccessToken) {
                try {
                    const pdfBlob = doc.output('blob');
                    await window.app.uploadToGoogleDrive(pdfBlob, fileName);
                    console.log("Copia guardada en Google Drive Cloud.");
                } catch (err) {
                    console.error("Error al guardar en Google Cloud:", err);
                }
            }
        } catch (e) { alert("Error PDF: " + e.message); }
    },
    setupDriveFolder: async () => {
        if (!window.showDirectoryPicker) {
            alert("⚠️ Esta función requiere Google Chrome o Microsoft Edge para poder escribir archivos directamente en tu Drive. En Safari o Firefox, el guardado es solo manual mediante la descarga estándar.");
            return;
        }
        try {
            window.driveFolderHandle = await window.showDirectoryPicker();
            document.getElementById('drive-status-dot').style.background = '#10b981'; // Verde
            alert("¡Carpeta de Drive vinculada con éxito! Ahora tus PDFs se guardarán allí automáticamente.");
        } catch (err) {
            console.error("Error al vincular carpeta:", err);
            if (err.name !== 'AbortError') {
                alert("Hubo un error al acceder a la carpeta. Asegúrate de dar los permisos necesarios en el navegador.");
            }
        }
    },
    exportDriveBackup: () => {
        const dataStr = JSON.stringify(state, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `Sovereign_Backup_Drive_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        alert('Backup generado. Guárdalo en tu carpeta de Drive para sincronización.');
    },
    toggleWatermarkPreview: (enabled) => {
        const paper = document.querySelector('.receipt-paper');
        if (paper) {
            if (enabled) paper.classList.remove('no-watermark');
            else paper.classList.add('no-watermark');
        }
    },
    updateStatus: (el, value) => {
        const picker = el.parentElement;
        picker.querySelectorAll('.status-option').forEach(opt => opt.classList.remove('active'));
        el.classList.add('active');
        picker.parentElement.querySelector('input[name="status"]').value = value;
    },
    handleUpdateReceipt: async (event, id) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        
        // Recopilar items
        const items = [];
        const brands = formData.getAll('itemBrand[]');
        const brandIcons = formData.getAll('itemBrandIcon[]');
        const descs = formData.getAll('itemDesc[]');
        const serviceIcons = formData.getAll('itemServiceIcon[]');
        const qtys = formData.getAll('itemQty[]');
        const prices = formData.getAll('itemPrice[]');
        const currencies = formData.getAll('itemCurrency[]');
        
        let totalBOB = 0;
        let totalUSD = 0;
        let totalEUR = 0;

        descs.forEach((d, i) => {
            const q = parseFloat(qtys[i] || 0);
            const p = parseFloat(prices[i] || 0);
            const curr = currencies[i] || 'BOB';
            const b = brands[i] || '';
            const bi = brandIcons[i] || 'video';
            const si = serviceIcons[i] || 'pen-tool';
            
            items.push({ brand: b, brandIcon: bi, desc: d, serviceIcon: si, qty: q, price: p, currency: curr });
            
            if (curr === 'BOB') totalBOB += q * p;
            else if (curr === 'USD') totalUSD += q * p;
            else if (curr === 'EUR') totalEUR += q * p;
        });

        const updates = {
            debtor: formData.get('clientName'),
            amount: totalBOB > 0 ? totalBOB : (totalUSD > 0 ? totalUSD : totalEUR),
            collateral: items.length > 0 ? items[0].brand : 'Studio Sync',
            start_date: formData.get('date'),
            installments: {
                receiptId: formData.get('receiptId'),
                projectName: formData.get('projectName'),
                items: items,
                totalBOB: totalBOB,
                totalUSD: totalUSD,
                totalEUR: totalEUR
            }
        };

        try {
            const { error } = await sb.from('loans').update(updates).eq('id', id);
            if (error) throw error;
            
            const receipt = state.receipts.find(r => r.id === id);
            if (receipt) {
                Object.assign(receipt, {
                    date: updates.start_date,
                    clientName: updates.debtor,
                    brandName: updates.collateral,
                    items: items,
                    totalAmount: updates.amount,
                    totals: { BOB: totalBOB, USD: totalUSD, EUR: totalEUR }
                });
            }
            
            navigate('receiptDetail', id);
        } catch (e) { alert(e.message); }
    },
    handleGoogleAuth: (isSilent = false) => {
        const CLIENT_ID = localStorage.getItem('google_client_id') || '787612710186-p7c0l7u75k0u7k0u7k0u7k0u7k0u7k0u.apps.googleusercontent.com';
        
        if (!localStorage.getItem('google_client_id')) {
            if (isSilent) return;
            const cid = prompt("Introduce tu 'Client ID' de Google Cloud para vincular la cuenta permanentemente:", "");
            if (cid) localStorage.setItem('google_client_id', cid);
            else return;
        }

        try {
            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: localStorage.getItem('google_client_id'),
                scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
                prompt: isSilent ? 'none' : 'select_account',
                callback: (response) => {
                    if (response.access_token) {
                        window.googleAccessToken = response.access_token;
                        // Guardar token y hora de expiración (1 hora)
                        const expiry = Date.now() + (3600 * 1000);
                        localStorage.setItem('google_access_token', response.access_token);
                        localStorage.setItem('google_token_expiry', expiry.toString());
                        
                        localStorage.setItem('google_auth_linked', 'true');
                        const dot = document.getElementById('google-status-dot');
                        if (dot) dot.style.background = '#4285F4'; 
                        window.app.getOrCreateDriveFolder();
                        if (!isSilent) alert("¡Cuenta de Google vinculada con éxito!");
                    }
                },
            });
            tokenClient.requestAccessToken({ prompt: isSilent ? 'none' : 'select_account' });
        } catch (err) {
            if (!isSilent) console.error("Error OAuth:", err);
        }
    },
    getOrCreateDriveFolder: async () => {
        if (!window.googleAccessToken) return;

        try {
            const query = encodeURIComponent("name = 'FACTURAS_APP' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
            const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
                headers: { Authorization: `Bearer ${window.googleAccessToken}` }
            });
            const data = await response.json();

            if (data.files && data.files.length > 0) {
                window.driveFolderId = data.files[0].id;
            } else {
                const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${window.googleAccessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: 'FACTURAS_APP',
                        mimeType: 'application/vnd.google-apps.folder'
                    })
                });
                const folder = await createResp.json();
                window.driveFolderId = folder.id;
            }
        } catch (err) {
            console.error("Error gestionando carpeta FACTURAS_APP:", err);
        }
    },
    uploadToGoogleDrive: async (blob, fileName) => {
        if (!window.driveFolderId) await window.app.getOrCreateDriveFolder();

        const metadata = {
            name: fileName,
            mimeType: 'application/pdf',
            parents: window.driveFolderId ? [window.driveFolderId] : []
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        try {
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${window.googleAccessToken}`,
                },
                body: form,
            });
            const result = await response.json();
            console.log('Archivo subido a Drive:', result);
        } catch (err) {
            console.error('Error subiendo a Drive:', err);
        }
    }
};

// Start App
const initApp = () => {
    loadState();
    
    // Recuperar token si aún es válido
    const savedToken = localStorage.getItem('google_access_token');
    const expiry = localStorage.getItem('google_token_expiry');
    
    if (savedToken && expiry && Date.now() < parseInt(expiry)) {
        window.googleAccessToken = savedToken;
        setTimeout(() => {
            const dot = document.getElementById('google-status-dot');
            if (dot) dot.style.background = '#4285F4';
            window.app.getOrCreateDriveFolder();
        }, 1000);
    }
};

initApp();

/** --- PHASE 2: EDITOR PRO - MONOLITH ELITE OS --- **/
function renderEditorProSuite() {
    const activeTab = state.editorProTab || 'escritorio';
    const selectedProject = state.selectedEditorProject;

    // --- MOCK DATA (Simulación del Modelo Conceptual) ---
    const config = { workspaceRoot: "G:\\Mi unidad\\Editor_OS", templates: ["01_Material_Bruto", "02_Audio", "03_Graficos", "04_Renders"] };
    const proyectos = [
        {
            id: 1, cliente: "Pollos 'El Gran Sabor'", titulo: "Campaña Redes Sociales Q2", tipo: "Edición Múltiple", estado: "En Curso", presupuesto: 1200, pagado: 600, entrega: "15 May", notas: "Ritmo rápido, transiciones dinámicas.", carpetaDrive: "/Clientes/Pollos_El_Gran_Sabor",
            entregables: [{ id: 101, titulo: "Spot 15s", obligatorio: true, desc: "Formato Vertical Reels", versiones: ["v1", "v2"] }],
            activos: { contenido: [{ nombre: "Toma_Principal.mp4", peso: "1.2 GB", fecha: "24 Abr" }] }
        }
    ];

    const renderSidebar = () => `
        <aside class="monolith-sidebar">
            <div style="margin-bottom:40px; display:flex; align-items:center; gap:12px; padding:0 15px;">
                <div style="width:32px; height:32px; background:#fff; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#000;">
                    <i data-lucide="command" style="width:18px;"></i>
                </div>
                <h2 style="font-weight:900; letter-spacing:-0.05em; font-size:1.1rem; text-transform:uppercase;">Monolith <span style="color:#444;">Elite</span></h2>
            </div>
            <button class="monolith-nav-btn ${activeTab === 'escritorio' ? 'active' : ''}" onclick="window.app.handleEditorTabChange('escritorio')">
                <i data-lucide="layout-grid"></i> Escritorio
            </button>
            <button class="monolith-nav-btn ${activeTab === 'proyectos' ? 'active' : ''}" onclick="window.app.handleEditorTabChange('proyectos')">
                <i data-lucide="layers"></i> Proyectos
            </button>
            <button class="monolith-nav-btn ${activeTab === 'archivos' ? 'active' : ''}" onclick="window.app.handleEditorTabChange('archivos')">
                <i data-lucide="cloud"></i> Editor Cloud
            </button>
            <button class="monolith-nav-btn ${activeTab === 'finanzas' ? 'active' : ''}" onclick="window.app.handleEditorTabChange('finanzas')">
                <i data-lucide="trending-up"></i> Finanzas
            </button>
        </aside>
    `;

    let innerContent = '';

    // --- VISTA: ESCRITORIO ---
    if (activeTab === 'escritorio') {
        innerContent = `
            <div class="animate-in">
                <p class="monolith-label-micro" style="margin-bottom:10px;">Status: Operational</p>
                <h1 class="monolith-h1" style="margin-bottom:40px;">Dashboard</h1>
                
                <div class="editor-grid-auto" style="gap:20px; margin-bottom:40px;">
                    <div class="monolith-card-elite">
                        <p class="monolith-label-micro">Ingresos Proyectados</p>
                        <h3 style="font-size:2.2rem; font-weight:900; margin-top:10px;">$14,200.00</h3>
                    </div>
                    <div class="monolith-card-elite">
                        <p class="monolith-label-micro">Proyectos Activos</p>
                        <h3 style="font-size:2.2rem; font-weight:900; margin-top:10px;">${proyectos.length}</h3>
                    </div>
                    <div class="monolith-card-elite" style="border-left: 2px solid var(--monolith-emerald);">
                        <p class="monolith-label-micro">Eficiencia</p>
                        <h3 style="font-size:2.2rem; font-weight:900; margin-top:10px;">94%</h3>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:30px;">
                    <div class="monolith-card-elite">
                        <p class="monolith-label-micro" style="margin-bottom:20px;">Próximas Entregas</p>
                        ${proyectos.map(p => `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                                <div>
                                    <h4 style="font-size:0.9rem; font-weight:700;">${p.titulo}</h4>
                                    <p style="font-size:0.7rem; color:#555;">${p.cliente}</p>
                                </div>
                                <span style="font-size:0.75rem; font-weight:900; color:#fff;">${p.entrega}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="monolith-card-elite">
                        <p class="monolith-label-micro" style="margin-bottom:20px;">Quick Tasks</p>
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div style="display:flex; gap:10px; font-size:0.85rem; color:#888;"><i data-lucide="circle" style="width:14px;"></i> Exportar versión final Pollos</div>
                            <div style="display:flex; gap:10px; font-size:0.85rem; color:#888;"><i data-lucide="circle" style="width:14px;"></i> Organizar material nuevo cliente</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } 
    // --- VISTA: PROYECTOS ---
    else if (activeTab === 'proyectos') {
        if (!selectedProject) {
            innerContent = `
                <div class="animate-in">
                    <h1 class="monolith-h1" style="margin-bottom:40px;">Pipeline</h1>
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap:20px;">
                        ${proyectos.map(p => `
                            <div onclick="window.app.selectEditorProject(${JSON.stringify(p).replace(/"/g, '&quot;')})" class="monolith-card-elite" style="cursor:pointer;">
                                <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                                    <div style="width:40px; height:40px; background:rgba(255,255,255,0.03); border-radius:10px; display:flex; align-items:center; justify-content:center;">
                                        <i data-lucide="video" style="width:20px;"></i>
                                    </div>
                                    <span class="noir-badge-pro">${p.estado}</span>
                                </div>
                                <h4 style="font-size:1.1rem; font-weight:900; text-transform:uppercase; margin-bottom:5px;">${p.titulo}</h4>
                                <p style="font-size:0.8rem; color:#555; margin-bottom:20px;">${p.cliente}</p>
                                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); pt-15px; margin-top:20px; padding-top:15px;">
                                    <span style="font-size:0.75rem; color:#888;">Entrega: <b>${p.entrega}</b></span>
                                    <span style="font-size:0.9rem; font-weight:900;">$${p.presupuesto}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            innerContent = `
                <div class="animate-in">
                    <button onclick="window.app.selectEditorProject(null)" class="monolith-nav-btn" style="margin-bottom:20px; padding-left:0;">
                        <i data-lucide="arrow-left"></i> Volver al Pipeline
                    </button>
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:40px;">
                        <div>
                            <p class="monolith-label-micro">Project Details</p>
                            <h1 class="monolith-h1">${selectedProject.titulo}</h1>
                        </div>
                        <button class="noir-btn-tab active" style="background:var(--monolith-emerald); color:#000;">Facturar</button>
                    </div>

                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:30px;">
                        <div style="display:flex; flex-direction:column; gap:30px;">
                            <div class="monolith-card-elite">
                                <p class="monolith-label-micro" style="margin-bottom:15px;">Dirección Creativa (Brief)</p>
                                <p style="font-size:1rem; color:#aaa; line-height:1.6; font-style:italic;">"${selectedProject.notas}"</p>
                            </div>
                            <div class="monolith-card-elite">
                                <p class="monolith-label-micro" style="margin-bottom:20px;">Entregables Obligatorios</p>
                                ${selectedProject.entregables.map(e => `
                                    <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:rgba(255,255,255,0.02); border-radius:12px;">
                                        <div>
                                            <h5 style="font-weight:700;">${e.titulo}</h5>
                                            <p style="font-size:0.7rem; color:#555;">${e.desc}</p>
                                        </div>
                                        <div style="display:flex; gap:5px;">
                                            ${e.versiones.map(v => `<span class="noir-badge-pro" style="font-size:0.6rem;">${v}</span>`).join('')}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="monolith-card-elite" style="height:fit-content;">
                            <p class="monolith-label-micro" style="margin-bottom:20px;">Balance Financiero</p>
                            <div style="margin-bottom:20px;">
                                <p style="font-size:0.7rem; color:#555;">Presupuesto Total</p>
                                <h4 style="font-size:1.5rem; font-weight:900;">$${selectedProject.presupuesto}</h4>
                            </div>
                            <div style="margin-bottom:20px;">
                                <p style="font-size:0.7rem; color:#555;">Cobrado</p>
                                <h4 style="font-size:1.5rem; font-weight:900; color:var(--monolith-emerald);">$${selectedProject.pagado}</h4>
                            </div>
                            <div style="width:100%; height:4px; background:#222; border-radius:2px;">
                                <div style="width:${(selectedProject.pagado/selectedProject.presupuesto)*100}%; height:100%; background:var(--monolith-emerald);"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    // --- VISTA: EDITOR CLOUD ---
    else if (activeTab === 'archivos') {
        innerContent = `
            <div class="animate-in">
                <h1 class="monolith-h1" style="margin-bottom:40px;">Editor Cloud</h1>
                <div class="monolith-card-elite" style="margin-bottom:30px; display:flex; justify-content:space-between; align-items:center; border-left:4px solid #444;">
                    <div>
                        <p class="monolith-label-micro">Workspace Local Estándar</p>
                        <code style="font-size:0.9rem; color:#888;">${config.workspaceRoot}</code>
                    </div>
                    <i data-lucide="settings" style="color:#444;"></i>
                </div>

                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:20px;">
                    ${proyectos.map(p => `
                        <div class="monolith-card-elite" style="text-align:center; padding:30px;">
                            <i data-lucide="folder" style="width:40px; height:40px; margin:0 auto 15px auto; color:#333;"></i>
                            <h4 style="font-size:0.8rem; font-weight:900; text-transform:uppercase;">${p.cliente}</h4>
                            <p class="monolith-label-micro" style="margin-top:10px;">${p.activos.contenido.length} Archivos</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    // --- VISTA: FINANZAS ---
    else if (activeTab === 'finanzas') {
        innerContent = `
            <div class="animate-in">
                <h1 class="monolith-h1" style="margin-bottom:40px;">Finanzas</h1>
                
                <div class="monolith-card-elite" style="background:linear-gradient(135deg, #141415 0%, #000 100%); padding:60px; margin-bottom:40px; position:relative; overflow:hidden;">
                    <div style="position:relative; z-index:1;">
                        <p class="monolith-label-micro" style="color:var(--monolith-emerald);">Ganancia Neta Acumulada 2026</p>
                        <h1 style="font-size:5rem; font-weight:900; letter-spacing:-0.05em; margin-top:20px;">$84,500<span style="font-size:1.5rem; color:#333; margin-left:15px;">USD</span></h1>
                    </div>
                    <i data-lucide="trending-up" style="position:absolute; right:-20px; bottom:-20px; width:200px; height:200px; color:rgba(16, 185, 129, 0.05);"></i>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
                    <div class="monolith-card-elite">
                        <p class="monolith-label-micro" style="margin-bottom:20px;">Crecimiento Anual</p>
                        <h3 style="font-size:2.5rem; font-weight:900; color:var(--monolith-emerald);">+24.8%</h3>
                    </div>
                    <div class="monolith-card-elite">
                        <p class="monolith-label-micro" style="margin-bottom:20px;">Proyectos Completados</p>
                        <h3 style="font-size:2.5rem; font-weight:900;">142</h3>
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="monolith-wrapper">
            <div class="monolith-layout">
                ${renderSidebar()}
                <main style="flex:1; padding:60px; overflow-y:auto; max-height:100vh;">
                    ${innerContent}
                </main>
            </div>
        </div>
    `;
}

/** --- UTILS & HELPERS --- **/
window.app.handleEditorTabChange = (tab) => {
    state.editorProTab = tab;
    state.selectedEditorProject = null;
    render();
};

window.app.selectEditorProject = (project) => {
    state.selectedEditorProject = project;
    render();
};

/** --- UTILS & HELPERS --- **/
window.app.handleEditorTabChange = (tab) => {
    state.editorProTab = tab;
    state.selectedEditorProject = null;
    render();
};

window.app.selectEditorProject = (project) => {
    state.selectedEditorProject = project;
    render();
};
