/**
 * Sovereign - App Logic (Aura Ledger)
 * Pure Vanilla JS Implementation
 */

// --- CLOUD CONFIGURATION (SUPABASE) ---
const SUPABASE_URL = 'https://wcewgxkizvsnffhbqqet.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjZXdneGtpenZzbmZmaGJxcWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTUwNDIsImV4cCI6MjA5MjMzMTA0Mn0.CeQqKNJKevS8RmQf-VMwOlJzvMpJWp1HUdswZRnufFo';

// Inicializar namespace global
window.app = window.app || {};

let sb;
try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
    console.error("Supabase Init Error:", e);
}

// --- INITIAL STATE & DATA MANAGEMENT ---
let state = {
    loans: [],
    debts: [], 
    expenses: [], // Mis Pagos
    receipts: [], // Studio Sync Pro
    nexusProjects: null, // Nexus Elite DNA
    currentView: 'dashboard',
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
    if (!sb) {
        console.warn("Supabase client not initialized. Skipping cloud load.");
        return;
    }
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
            debtor: d.debtor,
            amount: d.amount,
            reason: d.collateral,
            start_date: d.start_date,
            end_date: d.end_date,
            interest: d.interest || 0,
            photo: d.guarantor 
        }));

        state.expenses = allData.filter(l => l.ref === 'MI_PAGO').map(e => ({
            id: e.id,
            debtor: e.debtor,
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
            interest: l.interest,
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
            debtor: loan.debtor,
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
    const protocolInterests = extractProtocolInterests();
    const totalRecaudacionProyectada = [...state.debts, ...protocolInterests].reduce((acc, d) => {
        if (d.isProtocol) return acc + parseFloat(d.amount);
        const rate = parseFloat(d.interest || 0) / 100;
        return acc + (parseFloat(d.amount || 0) * rate);
    }, 0);

    return `
        <div class="sv-nexus-elite animate-reveal">
            <header class="nav-elite">
                <h1 class="brand-title">Protocol</h1>
                <div class="flex gap-4">
                    <button class="w-8 h-8 rounded bg-obsidian border border-dim flex items-center justify-center hover:border-neon-blue transition-all" onclick="window.app.toggleTheme()">
                        <i data-lucide="${state.isDarkMode ? 'sun' : 'moon'}" class="w-3 h-3 text-white"></i>
                    </button>
                </div>
            </header>

            <main class="flex-1 overflow-y-auto custom-scroll p-8 pb-32">
                <!-- KPI HEADER COMPACT -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                    <div class="kpi-card">
                        <p class="kpi-label">Capital Protocolo</p>
                        <h2 class="kpi-value mono">${formatCurrency(totalAssets)}</h2>
                    </div>
                    <div class="kpi-card">
                        <p class="kpi-label">Recaudación</p>
                        <h2 class="kpi-value mono">${formatCurrency(totalRecaudacionProyectada)}</h2>
                    </div>
                    <div class="kpi-card">
                        <p class="kpi-label">Contratos</p>
                        <h2 class="kpi-value mono">${activeContracts}</h2>
                    </div>
                    <div class="kpi-card">
                        <p class="kpi-label">Interés Promedio</p>
                        <h2 class="kpi-value mono">12.5%</h2>
                    </div>
                </div>

                <!-- ASSET MONITOR COMPACT -->
                <div class="mb-4 flex justify-between items-center">
                    <h2 class="text-xs font-bold uppercase tracking-widest text-white">Monitor de Activos</h2>
                    <button class="btn-elite" onclick="window.app.navigate('register')">Nuevo Registro</button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    ${state.loans.map(loan => {
                        const paidInst = (loan.installments || []).filter(i => i.paid).length;
                        const totalInst = (loan.installments || []).length;
                        const progress = totalInst > 0 ? Math.round((paidInst / totalInst) * 100) : 0;
                        return `
                        <div class="op-row group" onclick="window.app.navigate('details', '${loan.id}')">
                            <div class="flex flex-col gap-1 overflow-hidden">
                                <h3 class="text-white font-bold truncate text-[11px]">${loan.debtor}</h3>
                                <p class="mono opacity-40 text-[9px]">ID:${loan.id.substring(0,4)}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-white font-bold mono text-[11px]">${formatCurrency(loan.amount)}</p>
                                <p class="mono text-[9px] text-white/40">${loan.interest}%</p>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </main>
        </div>
    `;
}

function renderStudioSync() {
    const totalFacturado = state.receipts.reduce((acc, r) => acc + parseFloat(r.totalAmount || 0), 0);
    const pendingReceipts = state.receipts.filter(r => r.status === 'Pendiente');
    const totalPendiente = pendingReceipts.reduce((acc, r) => acc + parseFloat(r.totalAmount || 0), 0);

    return `
        <div class="sv-nexus-elite animate-reveal">
            <header class="nav-elite">
                <h1 class="brand-title">Recibos</h1>
                <button class="btn-elite" onclick="window.app.navigate('receiptRegister')">+ Emitir</button>
            </header>

            <main class="flex-1 overflow-y-auto custom-scroll p-8 pb-32">
                <div class="grid grid-cols-2 md:grid-cols-2 gap-3 mb-8">
                    <div class="kpi-card">
                        <p class="kpi-label">Facturación Global</p>
                        <h2 class="kpi-value mono">${formatCurrency(totalFacturado)}</h2>
                    </div>
                    <div class="kpi-card" style="border-color: rgba(255,51,51,0.2)">
                        <p class="kpi-label" style="color: #ff3333">Pendiente Cobro</p>
                        <h2 class="kpi-value mono" style="color: #ff3333">${formatCurrency(totalPendiente)}</h2>
                    </div>
                </div>

                <div class="mb-4">
                    <h2 class="text-xs font-bold uppercase tracking-widest text-white">Monitor de Emisiones</h2>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    ${state.receipts.map(r => `
                        <div class="op-row group" onclick="window.app.navigate('receiptDetail', '${r.id}')">
                            <div class="flex flex-col gap-1 overflow-hidden">
                                <h3 class="text-white font-bold truncate text-[11px]">${r.clientName}</h3>
                                <p class="mono opacity-40 text-[9px]">${r.receiptId}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-white font-bold mono text-[11px]">${formatCurrency(r.totalAmount)}</p>
                                <p class="mono text-[8px] ${r.status === 'Pendiente' ? 'text-red-500' : 'text-neon-blue'}">${r.status.toUpperCase()}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </main>
        </div>
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
        <div class="sv-nexus-elite flex flex-col p-8 space-y-10 pb-32">
            <header class="flex justify-between items-center">
                <button class="btn-pro ghost py-2" onclick="window.app.navigate('dashboard')">
                    <i data-lucide="arrow-left"></i> Volver
                </button>
                <div class="flex gap-4">
                    <button class="btn-pro ghost py-2 text-red-500 border-red-500/20" onclick="window.app.handleDelete('${loan.id}')">
                        <i data-lucide="trash-2"></i> Eliminar
                    </button>
                </div>
            </header>

            <section class="card-nexus p-16 text-center border-emerald-500/20">
                <p class="text-[11px] font-black text-emerald-500 uppercase tracking-[0.4em] mb-4">Balance Actual del Contrato</p>
                <h2 class="mega-kpi-main">${formatCurrency(loan.amount)}</h2>
                
                <div class="flex justify-center gap-10 mt-10">
                    <div class="text-center">
                        <p class="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Interés</p>
                        <p class="text-2xl font-black text-white">${loan.interest || 0}%</p>
                    </div>
                    <div class="text-center border-l border-white/10 pl-10">
                        <p class="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Vencimiento</p>
                        <p class="text-2xl font-black text-white">${formatDate(loan.end_date)}</p>
                    </div>
                </div>
            </section>

            <main class="space-y-10">
                <section class="card-nexus p-8">
                    <h2 class="text-xs font-black text-emerald-500 uppercase tracking-[0.2em] mb-6">Perfil del Deudor</h2>
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-6">
                            <div class="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black text-2xl">${loan.debtor.substring(0,2).toUpperCase()}</div>
                            <div>
                                <h3 class="text-2xl font-black text-white uppercase">${loan.debtor}</h3>
                                <p class="text-xs text-emerald-500 font-black uppercase flex items-center gap-2"><i data-lucide="shield-check" class="w-3 h-3"></i> Identidad Verificada</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="space-y-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-xs font-black text-gray-500 uppercase tracking-widest ml-2">Cronograma de Pagos</h2>
                        <button class="btn-pro ghost py-2 text-[10px]" onclick="window.app.handleExtendLoan('${loan.id}')">+ Ampliar Plazo</button>
                    </div>
                    <div class="grid grid-cols-1 gap-4">
                        ${(loan.installments || []).map(inst => `
                            <div class="card-nexus p-6 flex justify-between items-center ${inst.paid ? 'opacity-40 border-dashed' : 'border-l-4 border-l-amber-500'}">
                                <div class="flex items-center gap-6">
                                    <div>
                                        <p class="text-lg font-black text-white uppercase">Mes ${inst.month}</p>
                                        <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest">${formatDate(inst.dueDate)}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-6">
                                    <span class="text-2xl font-black ${inst.paid ? 'text-emerald-500' : 'text-white'}">${formatCurrency(inst.amount)}</span>
                                    <button onclick="window.app.toggleInstallment('${loan.id}', ${inst.month})" class="w-10 h-10 rounded-full flex items-center justify-center ${inst.paid ? 'bg-emerald-500 text-black' : 'border border-white/20 text-gray-500'}">
                                        <i data-lucide="${inst.paid ? 'check' : 'circle'}"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>
            </main>
        </div>
    `;
}

// --- CORE FUNCTIONS ---

async function render() {
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
            case 'studio-sync': content = renderStudioSync(); break;
            case 'receiptRegister': content = renderReceiptRegister(); break;
            case 'receiptDetail': content = renderReceiptDetail(); break;
            case 'receiptEdit': content = renderReceiptEdit(); break;
            case 'sovereign-nexus': content = await renderSovereignNexus(); break;
            default: content = renderDashboard();
        }
    } catch (e) {
        console.error("Render Error:", e);
        content = `<div class="empty-state"><p>Error al cargar la vista. Intente de nuevo.</p></div>`;
    }

    app.classList.toggle('full-width-mode', state.currentView === 'nexus');
    app.innerHTML = (content || '') + renderTabBar();
    
    // Ocultar cargador inicial si existe
    const loader = document.querySelector('.loader');
    if (loader) loader.style.display = 'none';

    if (window.lucide) window.lucide.createIcons();
    window.scrollTo(0, 0);
}

function renderTabBar() {
    const tabs = [
        { id: 'dashboard', icon: 'layout', label: 'Escritorio' },
        { id: 'debts', icon: 'users', label: 'Deudores' },
        { id: 'expenses', icon: 'arrow-down-circle', label: 'Gastos' },
        { id: 'studio-sync', icon: 'file-text', label: 'Recibos' },
        { id: 'sovereign-nexus', icon: 'edit-3', label: 'Editor Pro' }
    ];

    return `
        <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
            <nav class="tab-pill-container">
                ${tabs.map(tab => `
                    <button onclick="window.app.navigate('${tab.id}')" 
                        class="tab-pill ${state.currentView === tab.id ? 'active' : ''}">
                        <i data-lucide="${tab.icon}" class="w-3 h-3"></i>
                        <span class="text-[7px] mt-0.5">${tab.label}</span>
                    </button>
                `).join('')}
            </nav>
        </div>
    `;
}

function renderExpenses() {
    const totalExpenses = state.expenses.reduce((acc, exp) => acc + parseFloat(exp.amount || 0), 0);

    return `
        <div class="sv-nexus-elite animate-reveal">
            <header class="nav-elite">
                <h1 class="brand-title">Egresos</h1>
                <button class="btn-elite" onclick="window.app.navigate('expenseRegister')">+ Registro</button>
            </header>

            <main class="flex-1 overflow-y-auto custom-scroll p-8 pb-32">
                <div class="kpi-card mb-6 inline-block">
                    <p class="kpi-label">Gasto Operativo Mensual</p>
                    <h2 class="kpi-value mono">${formatCurrency(totalExpenses)}</h2>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    ${state.expenses.map(exp => `
                        <div class="op-row group" onclick="window.app.navigate('expenseDetail', '${exp.id}')">
                            <div class="flex flex-col gap-1 overflow-hidden">
                                <h3 class="text-white font-bold truncate text-[11px]">${exp.debtor}</h3>
                                <p class="mono opacity-40 text-[9px]">${exp.category || 'Operación'}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-white font-bold mono text-[11px]">${formatCurrency(exp.amount)}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </main>
        </div>
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

function renderDebts() {
    const combinedDebts = [...(state.debts || []), ...(extractProtocolInterests() || [])];
    const totalMonthlyInterest = combinedDebts.reduce((acc, d) => {
        if (d.isProtocol) return acc + parseFloat(d.amount || 0);
        const rate = parseFloat(d.interest || 0) / 100;
        return acc + (parseFloat(d.amount || 0) * rate);
    }, 0);

    return `
        <div class="sv-nexus-elite animate-reveal">
            <header class="nav-elite">
                <h1 class="brand-title">Deudores</h1>
                <button class="btn-elite" onclick="window.app.navigate('debtRegister')">+ Nuevo</button>
            </header>

            <main class="flex-1 overflow-y-auto custom-scroll p-8 pb-32">
                <div class="kpi-card mb-6 inline-block">
                    <p class="kpi-label">Recaudación Proyectada</p>
                    <h2 class="kpi-value mono">${formatCurrency(totalMonthlyInterest)}</h2>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    ${combinedDebts.map(debt => `
                        <div class="op-row group" onclick="${debt.isProtocol ? `window.app.navigate('details', '${debt.originalLoanId}')` : `window.app.navigate('debtDetail', '${debt.id}')`}">
                            <div class="flex flex-col gap-1 overflow-hidden">
                                <h3 class="text-white font-bold truncate text-[11px]">${debt.debtor || debt.person}</h3>
                                <p class="mono opacity-40 text-[9px]">${debt.isProtocol ? 'Nexus' : 'Direct'}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-white font-bold mono text-[11px]">${formatCurrency(debt.amount)}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </main>
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
// Start App
const initApp = async () => {
    try {
        console.log("Iniciando Protocolo Sovereign...");
        // Timeout de seguridad: si en 5 segundos no carga, forzamos el render
        const timeout = setTimeout(() => {
            console.warn("LoadState timeout - forcing render");
            render();
        }, 5000);

        await loadState();
        clearTimeout(timeout);
        await render(); // Llamada obligatoria al terminar de cargar
    } catch (e) {
        console.error("Critical Init Error:", e);
        await render(); 
    }
    
    // Recuperar token si aún es válido
    const savedToken = localStorage.getItem('google_access_token');
    const expiry = localStorage.getItem('google_token_expiry');
    
    if (savedToken && expiry && Date.now() < parseInt(expiry)) {
        window.googleAccessToken = savedToken;
        setTimeout(() => {
            const dot = document.getElementById('google-status-dot');
            if (dot) dot.style.background = '#4285F4';
            if (window.app && window.app.getOrCreateDriveFolder) window.app.getOrCreateDriveFolder();
        }, 1000);
    }
};

initApp();


/** --- EDITOR PRO: ELITE PRODUCTION SUITE (DNA DEFINITIVO) --- **/
const currencyMap = { 'USD': '$', 'BOB': 'Bs.', 'EUR': '€' };

async function renderSovereignNexus() {
    const activeTab = state.nexusTab || 'dashboard';
    
    // Carga inicial de datos (Protocolo de Sincronización DNA)
    if (state.nexusProjects === null) {
        try {
            const { data: projs, error } = await sb
                .from('nexus_projects')
                .select('*, nexus_deliverables(*)')
                .order('name', { ascending: true }); // Ordenar por nombre para mayor estabilidad
            
            if (error) throw error;
            state.nexusProjects = projs || [];
            setTimeout(() => render(), 10);
        } catch (e) {
            console.error("Error loading Nexus DNA:", e);
            alert("Error crítico de carga: " + e.message);
            state.nexusProjects = [];
        }
        return `<div class="sv-nexus-elite flex items-center justify-center h-screen"><div class="animate-pulse text-emerald-500 font-black tracking-[0.5em] text-xs">SYNCING NEXUS DNA...</div></div>`;
    }

    // KPIs Real-Time
    let totalPaid = 0;
    let totalPending = 0;
    const stages = { briefing: 0, production: 0, feedback: 0, finished: 0 };
    
    state.nexusProjects.forEach(p => {
        stages[p.status || 'briefing']++;
        (p.nexus_deliverables || []).forEach(d => {
            if (d.status === 'paid') totalPaid += Number(d.price || 0);
            else totalPending += Number(d.price || 0);
        });
    });

    const activeProject = state.nexusProjects.find(p => p.id === state.activeNexusProjectId);

    // --- HANDLERS ---
    window.app.switchNexusTab = (tab) => {
        state.nexusTab = tab;
        render();
    };

    window.app.highlightNexusText = (color) => {
        document.execCommand('backColor', false, color);
    };

    window.app.clearNexusFormat = () => {
        document.execCommand('backColor', false, 'transparent');
    };

    window.app.addNexusLink = (projectId, listField) => {
        const proj = state.nexusProjects.find(p => p.id === projectId);
        if (!proj) return;
        if (!proj[listField]) proj[listField] = [];
        proj[listField].push("");
        
        // Renderizado local rápido para evitar parpadeo global
        const containerId = listField === 'company_links' ? 'company-links-container' : 'reference-links-container';
        const container = document.getElementById(containerId);
        if (container) {
            const idx = proj[listField].length - 1;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'w-full bg-white/2 border border-white/5 p-2 text-[10px] text-' + (listField === 'company_links' ? 'blue-400' : 'purple-400') + ' outline-none animate-reveal';
            input.placeholder = listField === 'company_links' ? 'URL Redes / Web...' : 'URL Referencia / Inspiración...';
            input.onblur = (e) => window.app.updateNexusLink(projectId, listField, idx, e.target.value);
            container.appendChild(input);
            input.focus();
        }
    };

    window.app.updateNexusLink = (projectId, listField, index, value) => {
        const proj = state.nexusProjects.find(p => p.id === projectId);
        if (!proj) return;
        proj[listField][index] = value;
        window.app.updateProjectField(projectId, listField, proj[listField]);
    };

    window.app.handleNexusEditorKey = (e) => {
        if (e.key === ' ') {
            document.execCommand('backColor', false, 'transparent');
        }
    };

    window.app.openModal = (id) => {
        document.getElementById(id).style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    };

    window.app.closeModals = () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    };

    window.app.createProject = async () => {
        const name = document.getElementById('clientName').value;
        const description = document.getElementById('projectDesc').value;
        const drive_url = document.getElementById('driveUrl').value;
        const meet_url = document.getElementById('meetUrl').value;
        const company_url = document.getElementById('companyUrl')?.value || '';
        const preference_url = document.getElementById('preferenceUrl')?.value || '';
        const end_date = document.getElementById('endDate').value;

        if (!name) return;

        try {
            const { data, error } = await sb
                .from('nexus_projects')
                .insert([{ 
                    name: name, 
                    description: description || '', 
                    drive_url: drive_url || '', 
                    meet_url: meet_url || '',
                    company_url: company_url || '',
                    preference_url: preference_url || '',
                    delivery_date: end_date || null,
                    meeting_date: null,
                    video_quantity: 0,
                    price: 0,
                    currency: 'BOB',
                    company_links: [""],
                    reference_links: [""],
                    status: 'briefing' 
                }])
                .select()
                .single();
            
            if (error) {
                console.error("Supabase Insert Error:", error);
                throw error;
            }
            
            if (!state.nexusProjects) state.nexusProjects = [];
            state.nexusProjects.unshift({ ...data, nexus_deliverables: [] });
            state.activeNexusProjectId = data.id;
            window.app.closeModals();
            render();
        } catch (e) { 
            alert("ERROR AL GUARDAR EN LA NUBE: " + e.message); 
            console.error(e);
        }
    };

    window.app.selectProject = (id) => {
        state.activeNexusProjectId = id;
        render();
    };

    window.app.updateProjectField = async (projectId, field, value) => {
        const proj = state.nexusProjects.find(p => p.id === projectId);
        if (!proj) return;
        
        // Corregir fechas vacías
        let finalValue = value;
        if (['delivery_date', 'meeting_date', 'end_date', 'start_date'].includes(field) && value === '') {
            finalValue = null;
        }

        try {
            const { error } = await sb.from('nexus_projects').update({ [field]: finalValue }).eq('id', projectId);
            if (error) throw error;
            proj[field] = finalValue;
            if (field === 'status') render();
        } catch (e) { console.error("Update Error:", e); }
    };

    window.app.saveAllNexus = async (btn) => {
        const activeProject = state.nexusProjects.find(p => p.id === state.activeNexusProjectId);
        if (!activeProject) return;

        const editor = document.getElementById('nexus-planning-editor');
        const notes = editor ? editor.innerHTML : activeProject.description;
        
        // Capturar todos los valores actuales de la interfaz para el guardado maestro
        const priceInput = document.querySelector('input[onblur*="price"]');
        const videoInput = document.querySelector('input[onblur*="video_quantity"]');
        const meetingInput = document.querySelector('input[onchange*="meeting_date"]');
        const deliveryInput = document.querySelector('input[onchange*="delivery_date"]');
        const driveInput = document.querySelector('input[onblur*="drive_url"]');
        const meetInput = document.querySelector('input[onblur*="meet_url"]');

        // Procesar fechas (vacío -> null)
        const meetingDate = (meetingInput && meetingInput.value !== '') ? meetingInput.value : null;
        const deliveryDate = (deliveryInput && deliveryInput.value !== '') ? deliveryInput.value : null;

        const updatedData = {
            description: notes,
            price: priceInput ? parseFloat(priceInput.value) : activeProject.price,
            video_quantity: videoInput ? parseInt(videoInput.value) : activeProject.video_quantity,
            meeting_date: meetingDate,
            delivery_date: deliveryDate,
            drive_url: driveInput ? driveInput.value : activeProject.drive_url,
            meet_url: meetInput ? meetInput.value : activeProject.meet_url,
            company_links: activeProject.company_links,
            reference_links: activeProject.reference_links
        };

        try {
            const { error } = await sb.from('nexus_projects')
                .update(updatedData)
                .eq('id', activeProject.id);
            
            if (error) throw error;

            // Actualizar estado local y redibujar
            Object.assign(activeProject, updatedData);
            render();
            
            // Efecto visual de éxito
            if (btn) {
                const originalText = btn.innerText;
                btn.innerText = "¡SINCRONIZADO!";
                btn.style.backgroundColor = "#22c55e";
                btn.style.color = "white";
                btn.style.borderColor = "#22c55e";
                setTimeout(() => {
                    btn.innerText = originalText;
                    btn.style.backgroundColor = "";
                    btn.style.color = "";
                    btn.style.borderColor = "";
                }, 2000);
            }
        } catch (e) { 
            console.error("Save Error:", e);
            alert("Error al guardar: " + e.message + "\n\n¿Ejecutaste el código SQL en Supabase?"); 
        }
    };

    window.app.saveBranding = async () => {
        try {
            const json = JSON.parse(document.getElementById('branding-json-input').value);
            await window.app.updateProjectField('branding_json', json);
            window.app.closeModals();
            render();
        } catch (e) { alert("JSON Inválido"); }
    };

    window.app.openOperationModal = (delId = null) => {
        const modalTitle = document.getElementById('del-modal-title');
        const editor = document.getElementById('del-notes-editor');
        
        // Listener para limpiar resaltado tras espacio
        if (!editor.hasListener) {
            editor.addEventListener('keydown', (e) => {
                if (e.key === ' ') {
                    // Esperar un milisegundo para que el espacio se inserte y luego limpiar
                    setTimeout(() => {
                        document.execCommand('backColor', false, 'transparent');
                    }, 1);
                }
            });
            editor.hasListener = true;
        }

        if (delId) {
            const d = activeProject.nexus_deliverables.find(item => item.id === delId);
            state.editingDeliverableId = delId;
            modalTitle.innerText = "Editar Operación";
            document.getElementById('del-title').value = d.title || '';
            document.getElementById('del-type').value = d.type || 'video';
            document.getElementById('del-qty').value = d.quantity || 1;
            document.getElementById('del-price').value = d.price || '';
            document.getElementById('del-currency').value = d.currency || 'USD';
            document.getElementById('del-status').value = d.status_paid || 'pending';
            document.getElementById('del-method').value = d.method || '';
            document.getElementById('del-link-empresa').value = d.link_empresa || '';
            document.getElementById('del-link-general').value = d.link_general || '';
            editor.innerHTML = d.notes_html || '';
        } else {
            state.editingDeliverableId = null;
            modalTitle.innerText = "Nueva Operación";
            document.getElementById('del-title').value = '';
            document.getElementById('del-type').value = 'video';
            document.getElementById('del-qty').value = 1;
            document.getElementById('del-price').value = '';
            document.getElementById('del-status').value = 'pending';
            document.getElementById('del-method').value = '';
            document.getElementById('del-link-empresa').value = '';
            document.getElementById('del-link-general').value = '';
            editor.innerHTML = '';
        }
        window.app.openModal('modalOperation');
    };

    window.app.highlightNexusText = (color) => {
        document.execCommand('backColor', false, color);
        document.getElementById('del-notes-editor').focus();
    };

    window.app.clearNexusFormat = () => {
        document.execCommand('removeFormat', false, null);
        document.execCommand('backColor', false, 'transparent');
        document.getElementById('del-notes-editor').focus();
    };

    window.app.saveDeliverable = async () => {
        if (!activeProject) return;
        const btn = document.getElementById('btn-save-op');
        btn.innerText = "GUARDANDO...";
        btn.style.opacity = "0.7";
        btn.disabled = true;

        const payload = {
            project_id: activeProject.id,
            title: document.getElementById('del-title').value,
            type: document.getElementById('del-type').value,
            quantity: Number(document.getElementById('del-qty').value),
            price: Number(document.getElementById('del-price').value),
            currency: document.getElementById('del-currency').value,
            status_paid: document.getElementById('del-status').value,
            method: document.getElementById('del-method').value,
            link_empresa: document.getElementById('del-link-empresa').value,
            link_general: document.getElementById('del-link-general').value,
            notes_html: document.getElementById('del-notes-editor').innerHTML,
            version: (activeProject.nexus_deliverables.find(d => d.id === state.editingDeliverableId)?.version || 0) + 1
        };

        try {
            let res;
            if (state.editingDeliverableId) {
                res = await sb.from('nexus_deliverables').update(payload).eq('id', state.editingDeliverableId).select().single();
            } else {
                res = await sb.from('nexus_deliverables').insert([payload]).select().single();
            }

            if (res.error) throw res.error;
            
            if (state.editingDeliverableId) {
                const idx = activeProject.nexus_deliverables.findIndex(d => d.id === state.editingDeliverableId);
                activeProject.nexus_deliverables[idx] = res.data;
            } else {
                activeProject.nexus_deliverables.push(res.data);
            }

            btn.innerText = "GUARDADO ✓";
            btn.style.opacity = "1";
            setTimeout(() => {
                window.app.closeModals();
                render();
            }, 500);
        } catch (e) { 
            console.error("Sync Error:", e);
            btn.innerText = "REINTENTAR";
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.background = "#ef4444";
            btn.style.color = "white";
        }
    };

    window.app.formatNexus = (cmd) => document.execCommand(cmd, false, null);
    window.app.insertNexusTimestamp = () => {
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const tag = `<span class="timestamp-tag">${time}</span>&nbsp;`;
        document.execCommand('insertHTML', false, tag);
    };

    // --- HTML RENDER DNA (EDITOR PRO V3) ---
    return `
    <div class="sv-nexus-elite animate-reveal editor-pro-view">
        <!-- TOP NAVIGATION -->
        <nav class="nav-elite">
            <div class="flex items-center gap-8">
                <div class="brand-title">Editor Pro</div>
                <div class="tab-pill-container">
                    <button onclick="window.app.switchNexusTab('dashboard')" class="tab-pill ${activeTab === 'dashboard' ? 'active' : ''}">Escritorio</button>
                    <button onclick="window.app.switchNexusTab('nexus')" class="tab-pill ${activeTab === 'nexus' ? 'active' : ''}">Clientes</button>
                    <button onclick="window.app.switchNexusTab('cloud')" class="tab-pill ${activeTab === 'cloud' ? 'active' : ''}">Almacén</button>
                    <button onclick="window.app.switchNexusTab('finance')" class="tab-pill ${activeTab === 'finance' ? 'active' : ''}">Finanzas</button>
                </div>
            </div>
            <div class="text-right">
                <p class="kpi-label uppercase">Editor Pro Studio</p>
            </div>
        </nav>

        <main class="flex-1 overflow-y-auto custom-scroll bg-[#050505]">
            ${(() => {
                if (activeTab === 'dashboard') {
                    return `
                    <!-- 1. ESCRITORIO: RADAR LINEAL -->
                    <div class="animate-reveal p-8 max-w-6xl mx-auto">
                        <div class="flex items-center gap-4 mb-8">
                            <div class="h-[1px] flex-1 bg-white/10"></div>
                            <h2 class="text-[9px] font-bold uppercase text-gray-500 tracking-[8px]">Radar de Control</h2>
                            <div class="h-[1px] flex-1 bg-white/10"></div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-1 border border-white/5 bg-white/5">
                            <div class="bg-[#080808] p-6">
                                <p class="text-[8px] font-black text-purple-500 uppercase mb-4 tracking-widest">Entregas</p>
                                <div class="space-y-1">
                                    ${state.nexusProjects.filter(p => Math.ceil((new Date(p.end_date) - new Date()) / 86400000) < 7).map(p => `
                                        <div class="flex justify-between items-center py-2 border-b border-white/5">
                                            <p class="text-white text-[10px] font-medium uppercase">${p.name}</p>
                                            <span class="text-[8px] text-purple-400 mono">Prox.</span>
                                        </div>
                                    `).join('') || '<p class="opacity-20 text-[8px] uppercase">Despejado</p>'}
                                </div>
                            </div>
                            <div class="bg-[#080808] p-6">
                                <p class="text-[8px] font-black text-blue-500 uppercase mb-4 tracking-widest">Infraestructura</p>
                                <div class="space-y-1">
                                    ${state.nexusProjects.filter(p => !p.drive_url).map(p => `
                                        <div class="flex justify-between items-center py-2 border-b border-white/5">
                                            <p class="text-white text-[10px] font-medium uppercase">${p.name}</p>
                                            <span class="text-[8px] text-blue-400">Drive?</span>
                                        </div>
                                    `).join('') || '<p class="opacity-20 text-[8px] uppercase">Sincronizado</p>'}
                                </div>
                            </div>
                            <div class="bg-[#080808] p-6">
                                <p class="text-[8px] font-black text-emerald-500 uppercase mb-4 tracking-widest">Liquidez</p>
                                <div class="space-y-1">
                                    ${state.nexusProjects.filter(p => (p.nexus_deliverables || []).some(d => d.status_paid !== 'paid')).map(p => `
                                        <div class="flex justify-between items-center py-2 border-b border-white/5">
                                            <p class="text-white text-[10px] font-medium uppercase">${p.name}</p>
                                            <span class="text-[8px] text-emerald-400 mono">Deuda</span>
                                        </div>
                                    `).join('') || '<p class="opacity-20 text-[8px] uppercase">Al día</p>'}
                                </div>
                            </div>
                        </div>
                    </div>`;
                }

                if (activeTab === 'nexus') {
                    const activeProject = state.nexusProjects.find(p => p.id === state.activeNexusProjectId);
                    return `
                    <!-- 2. CLIENTES: CONSOLA DE PLANIFICACIÓN ESTRATÉGICA -->
                    <div class="zen-layout animate-reveal h-full flex">
                        <aside class="w-64 border-r border-white/5 bg-[#080808] flex flex-col h-full">
                            <div class="p-6 border-b border-white/5">
                                <button onclick="window.app.openModal('modalProject')" class="w-full py-2 bg-white text-black text-[9px] font-black uppercase tracking-widest hover:bg-purple-500 hover:text-white transition-all">+ Nuevo Cliente</button>
                            </div>
                            <div class="flex-1 overflow-y-auto p-2 space-y-1 custom-scroll">
                                ${state.nexusProjects.map(p => `
                                    <div onclick="window.app.selectProject('${p.id}')" class="sidebar-item-elite ${state.activeNexusProjectId === p.id ? 'active' : ''} group">
                                        <p class="text-[10px] font-bold uppercase ${state.activeNexusProjectId === p.id ? 'text-amber-500' : 'text-gray-500 group-hover:text-gray-300'}">${p.name}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </aside>

                        <main class="flex-1 overflow-y-auto custom-scroll bg-[#050505]">
                            ${!activeProject ? `<div class="h-full flex items-center justify-center text-[9px] text-gray-700 uppercase tracking-[15px]">Atelier Nexus Protocol...</div>` : `
                                <div class="max-w-[1400px] mx-auto p-12 space-y-12 animate-reveal">
                                    <!-- ATELIER HEADER -->
                                    <div class="flex justify-between items-center border-b border-white/[0.03] pb-10">
                                        <div>
                                            <p class="atelier-label">Client Strategic Portfolio</p>
                                            <h1 class="text-4xl font-black text-white uppercase tracking-tight">${activeProject.name}</h1>
                                        </div>
                                        <button onclick="window.app.saveAllNexus(this)" class="btn-signature">Confirm & Synchronize</button>
                                    </div>

                                    <div class="grid grid-cols-12 gap-16">
                                        <!-- EL CANVAS (CUADERNO) -->
                                        <div class="col-span-12 lg:col-span-8">
                                            <div class="atelier-canvas">
                                                <div class="px-8 py-4 border-b border-white/[0.03] flex justify-between items-center">
                                                    <span class="atelier-label mb-0 flex items-center gap-2"><i data-lucide="edit-3" class="w-3 h-3 text-white"></i> Operational Strategy Notebook</span>
                                                    <div class="flex items-center gap-4">
                                                        <div class="flex gap-2 border-r border-white/10 pr-4">
                                                            <button onclick="window.app.formatNexus('bold')" class="text-[9px] font-black text-gray-500 hover:text-white transition-all">B</button>
                                                            <button onclick="window.app.formatNexus('italic')" class="text-[9px] italic text-gray-500 hover:text-white transition-all">I</button>
                                                        </div>
                                                        <div class="flex gap-2 border-r border-white/10 pr-4">
                                                            <button onclick="window.app.highlightNexusText('#ef4444')" class="w-2.5 h-2.5 rounded-full bg-red-500/60 hover:scale-125 transition-all" title="Resaltador Rojo"></button>
                                                            <button onclick="window.app.highlightNexusText('#3b82f6')" class="w-2.5 h-2.5 rounded-full bg-blue-500/60 hover:scale-125 transition-all" title="Resaltador Azul"></button>
                                                            <button onclick="window.app.highlightNexusText('#eab308')" class="w-2.5 h-2.5 rounded-full bg-yellow-500/60 hover:scale-125 transition-all" title="Resaltador Amarillo"></button>
                                                            <button onclick="window.app.highlightNexusText('#10b981')" class="w-2.5 h-2.5 rounded-full bg-emerald-500/60 hover:scale-125 transition-all" title="Resaltador Verde"></button>
                                                        </div>
                                                        <button onclick="window.app.clearNexusFormat()" class="text-gray-500 hover:text-white transition-all" title="Borrar Formato">
                                                            <i data-lucide="eraser" class="w-3.5 h-3.5"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div id="nexus-planning-editor" contenteditable="true" onkeyup="window.app.handleNexusEditorKey(event)" onblur="window.app.saveNexusNotes(this.innerHTML)" class="p-12 min-h-[700px] text-white text-sm leading-relaxed font-serif outline-none selection:bg-white/10">
                                                    ${activeProject.description || ''}
                                                </div>
                                            </div>
                                        </div>

                                        <!-- EL INSPECTOR (DERECHA) -->
                                        <div class="col-span-12 lg:col-span-4 space-y-10">
                                            <!-- FICHA TÉCNICA -->
                                            <div class="space-y-8">
                                                <div class="grid grid-cols-2 gap-10">
                                                    <div>
                                                        <label class="atelier-label flex items-center gap-2"><i data-lucide="dollar-sign" class="w-2.5 h-2.5 text-white"></i> Investment</label>
                                                        <div class="flex items-center gap-2">
                                                            <input type="number" value="${activeProject.price || 0}" onblur="window.app.updateProjectField('${activeProject.id}', 'price', this.value)" class="atelier-input text-lg font-black">
                                                            <span class="text-[9px] font-black text-gray-600">${activeProject.currency}</span>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label class="atelier-label flex items-center gap-2"><i data-lucide="clapperboard" class="w-2.5 h-2.5 text-white"></i> Production</label>
                                                        <div class="flex items-center gap-2">
                                                            <input type="number" value="${activeProject.video_quantity || 0}" onblur="window.app.updateProjectField('${activeProject.id}', 'video_quantity', this.value)" class="atelier-input text-lg font-black" placeholder="0">
                                                            <span class="text-[9px] font-black text-gray-600">VIDEOS</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div class="grid grid-cols-2 gap-10">
                                                    <div>
                                                        <label class="atelier-label flex items-center gap-2"><i data-lucide="calendar-range" class="w-2.5 h-2.5 text-white"></i> Meeting Date</label>
                                                        <input type="date" value="${activeProject.meeting_date || ''}" onchange="window.app.updateProjectField('${activeProject.id}', 'meeting_date', this.value)" class="atelier-input">
                                                    </div>
                                                    <div>
                                                        <label class="atelier-label flex items-center gap-2"><i data-lucide="flag" class="w-2.5 h-2.5 text-white"></i> Delivery Goal</label>
                                                        <input type="date" value="${activeProject.delivery_date || ''}" onchange="window.app.updateProjectField('${activeProject.id}', 'delivery_date', this.value)" class="atelier-input text-amber-500">
                                                    </div>
                                                </div>

                                                <div class="atelier-divider"></div>

                                                <!-- INFRAESTRUCTURA -->
                                                <div class="space-y-6">
                                                    <div>
                                                        <label class="atelier-label flex items-center gap-2"><i data-lucide="folder-git-2" class="w-2.5 h-2.5 text-white"></i> Cloud Infrastructure</label>
                                                        <input type="text" value="${activeProject.drive_url || ''}" onblur="window.app.updateProjectField('${activeProject.id}', 'drive_url', this.value)" class="atelier-input" placeholder="Drive Directory...">
                                                    </div>
                                                    <div>
                                                        <label class="atelier-label flex items-center gap-2"><i data-lucide="globe" class="w-2.5 h-2.5 text-white"></i> Digital Presence</label>
                                                        <input type="text" value="${activeProject.meet_url || ''}" onblur="window.app.updateProjectField('${activeProject.id}', 'meet_url', this.value)" class="atelier-input" placeholder="Meeting Session...">
                                                    </div>
                                                </div>

                                                <div class="atelier-divider"></div>

                                                <!-- LINKS DINÁMICOS -->
                                                <div class="space-y-8">
                                                    <div>
                                                        <div class="flex justify-between items-center mb-4">
                                                            <label class="atelier-label mb-0 flex items-center gap-2"><i data-lucide="link" class="w-2.5 h-2.5 text-white"></i> Company Directory</label>
                                                            <button onclick="window.app.addNexusLink('${activeProject.id}', 'company_links')" class="text-[11px] text-gray-500 hover:text-white transition-all">+</button>
                                                        </div>
                                                        <div id="company-links-container" class="space-y-1">
                                                            ${(activeProject.company_links || [""]).map((link, idx) => `
                                                                <input type="text" value="${link}" onblur="window.app.updateNexusLink('${activeProject.id}', 'company_links', ${idx}, this.value)" class="atelier-input text-blue-400/80 border-none !border-b !border-white/5" placeholder="Source URL...">
                                                            `).join('')}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div class="flex justify-between items-center mb-4">
                                                            <label class="atelier-label mb-0 flex items-center gap-2"><i data-lucide="bookmark" class="w-2.5 h-2.5 text-white"></i> Creative References</label>
                                                            <button onclick="window.app.addNexusLink('${activeProject.id}', 'reference_links')" class="text-[11px] text-gray-500 hover:text-white transition-all">+</button>
                                                        </div>
                                                        <div id="reference-links-container" class="space-y-1">
                                                            ${(activeProject.reference_links || [""]).map((link, idx) => `
                                                                <input type="text" value="${link}" onblur="window.app.updateNexusLink('${activeProject.id}', 'reference_links', ${idx}, this.value)" class="atelier-input text-purple-400/80 border-none !border-b !border-white/5" placeholder="Ref URL...">
                                                            `).join('')}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `}
                        </main>
                    </div>`;
                }

                if (activeTab === 'cloud') {
                    return `
                    <!-- 3. ALMACÉN: LINEAL -->
                    <div class="p-12 max-w-4xl mx-auto animate-reveal">
                        <div class="mb-12">
                            <h2 class="text-2xl font-black text-white uppercase tracking-tighter mb-2">Almacenamiento Cloud</h2>
                            <p class="text-[9px] text-gray-500 uppercase tracking-widest">Sincronización de activos por cliente</p>
                        </div>
                        <div class="grid grid-cols-1 gap-2">
                            ${state.nexusProjects.map(p => `
                                <div class="flex items-center justify-between p-4 border border-white/5 bg-[#080808] hover:border-blue-500 transition-all">
                                    <div class="flex items-center gap-6">
                                        <div class="w-2 h-2 rounded-full ${p.drive_url ? 'bg-blue-500' : 'bg-gray-800'}"></div>
                                        <p class="text-[10px] font-black text-white uppercase tracking-tight">${p.name}</p>
                                    </div>
                                    <div class="flex gap-1">
                                        <button onclick="window.open('${p.drive_url}', '_blank')" class="px-4 py-1 border border-white/10 text-[8px] font-black uppercase text-gray-400 hover:bg-white hover:text-black transition-all">Drive</button>
                                        <button onclick="window.open('${p.meet_url}', '_blank')" class="px-4 py-1 border border-white/10 text-[8px] font-black uppercase text-gray-400 hover:bg-white hover:text-black transition-all">Meet</button>
                                    </div>
                                </div>
                            `).join('') || '<p class="text-center py-20 opacity-20 text-[9px] font-black uppercase tracking-[10px]">No Assets Found</p>'}
                        </div>
                    </div>`;
                }

                if (activeTab === 'finance') {
                    return `
                    <!-- 4. FINANZAS: LIBRO CONTABLE EXCLUSIVO -->
                    <div class="p-12 max-w-5xl mx-auto animate-reveal">
                        <div class="flex justify-between items-end mb-12 pb-6 border-b border-white/10">
                            <div>
                                <h2 class="text-4xl font-black text-white uppercase tracking-tighter mb-2">Libro de Cobros</h2>
                                <p class="text-[9px] text-emerald-400 font-black uppercase tracking-[5px]">Gestión de Liquidez</p>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-12 gap-8 mb-12">
                            <div class="col-span-6 bento-card border-l-4 border-emerald-500">
                                <p class="text-[8px] text-gray-500 uppercase mb-2">Total Recaudado</p>
                                <p class="text-4xl font-black text-white mono">${formatCurrency(totalPaid, '$')}</p>
                            </div>
                            <div class="col-span-6 bento-card border-l-4 border-purple-500">
                                <p class="text-[8px] text-gray-500 uppercase mb-2">Total Pendiente</p>
                                <p class="text-4xl font-black text-purple-400 mono">${formatCurrency(totalPending, '$')}</p>
                            </div>
                        </div>

                        <div class="space-y-1">
                            ${state.nexusProjects.map(p => {
                                const pDeliverables = p.nexus_deliverables || [];
                                if (pDeliverables.length === 0) return '';
                                return `
                                    <div class="mb-8">
                                        <p class="text-[8px] text-gray-600 uppercase mb-2 ml-2 tracking-[4px]">${p.name}</p>
                                        <div class="space-y-1 border-t border-white/5 pt-2">
                                            ${pDeliverables.map(d => `
                                                <div class="flex justify-between items-center p-3 hover:bg-white/5 transition-all group cursor-pointer" onclick="window.app.openOperationModal('${d.id}')">
                                                    <div class="flex items-center gap-4">
                                                        <div class="w-1.5 h-1.5 rounded-full ${d.status_paid === 'paid' ? 'bg-emerald-500' : 'bg-purple-500 animate-pulse'}"></div>
                                                        <p class="text-[10px] font-bold text-white uppercase tracking-tight">${d.title}</p>
                                                    </div>
                                                    <div class="flex gap-10 items-center">
                                                        <span class="text-[8px] text-gray-600 uppercase font-black tracking-widest">${d.status_paid === 'paid' ? 'Liquidado' : 'Pendiente'}</span>
                                                        <p class="mono text-xs font-bold text-white">${formatCurrency(d.price, '$')}</p>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                `;
                            }).join('') || '<p class="text-center py-20 opacity-20 text-[9px] font-black uppercase tracking-[10px]">No Financial Records</p>'}
                        </div>
                    </div>`;
                }
            })()}
        </main>

        <!-- MODAL: NUEVA MARCA (CON CAMPOS TÉCNICOS) -->
        <div id="modalProject" class="modal-overlay" style="display: none;">
            <div class="modal-content-elite max-w-lg">
                <h3 class="text-2xl font-black uppercase tracking-tighter mb-6">Configurar Nuevo Cliente</h3>
                <div class="space-y-3">
                    <div class="input-elite-group">
                        <label class="input-elite-label">Nombre del Cliente / Empresa</label>
                        <input id="clientName" type="text" class="input-elite" placeholder="Ej: Sport Fit Center">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="input-elite-group">
                            <label class="input-elite-label">URL Drive (Activos)</label>
                            <input id="driveUrl" type="text" class="input-elite" placeholder="https://drive.google...">
                        </div>
                        <div class="input-elite-group">
                            <label class="input-elite-label">URL Meet (Reuniones)</label>
                            <input id="meetUrl" type="text" class="input-elite" placeholder="https://meet.google...">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="input-elite-group">
                            <label class="input-elite-label">URL Empresa (Web/RRSS)</label>
                            <input id="companyUrl" type="text" class="input-elite" placeholder="https://...">
                        </div>
                        <div class="input-elite-group">
                            <label class="input-elite-label">URL Preferencia</label>
                            <input id="preferenceUrl" type="text" class="input-elite" placeholder="https://...">
                        </div>
                    </div>
                    <div class="input-elite-group">
                        <label class="input-elite-label">Fecha de Entrega / Deadline</label>
                        <input id="endDate" type="date" class="input-elite">
                    </div>
                    <div class="input-elite-group">
                        <label class="input-elite-label">Notas de Producción</label>
                        <textarea id="projectDesc" class="input-elite h-20 resize-none" placeholder="Definir estilo de edición..."></textarea>
                    </div>
                    <div class="flex gap-2 mt-6">
                        <button onclick="window.app.closeModals()" class="btn-elite flex-1">Descartar</button>
                        <button onclick="window.app.createProject()" class="btn-elite primary flex-1">Vincular Marca</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="modalBranding" class="modal-overlay" style="display: none;">
            <div class="modal-content-elite">
                <h3 class="text-xl font-bold uppercase mb-6">Branding Config</h3>
                <div class="space-y-4">
                    <textarea id="branding-json-input" class="editor-elite mono text-emerald-500 h-96" placeholder='{ "primary": "#ffffff" }'></textarea>
                    <div class="flex gap-3 mt-4">
                        <button onclick="window.app.closeModals()" class="btn-elite secondary flex-1">Cerrar</button>
                        <button onclick="window.app.saveBranding()" class="btn-elite primary flex-1">Guardar Config</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="modalOperation" class="modal-overlay" style="display: none;">
            <div class="modal-content-elite max-w-6xl w-full h-[90vh] flex flex-col overflow-hidden">
                <div class="flex justify-between items-center p-8 border-b border-white/5">
                    <div>
                        <h2 id="del-modal-title" class="text-3xl font-black uppercase tracking-tighter text-white">Consola de Planificación Estratégica</h2>
                        <p class="text-[9px] text-purple-400 font-black uppercase tracking-[5px] mt-2">Nueva Operación / Item de Producción</p>
                    </div>
                    <button onclick="window.app.closeModals()" class="text-gray-500 hover:text-white transition-all"><i data-lucide="x" class="w-8 h-8"></i></button>
                </div>
                <div class="flex-1 overflow-y-auto custom-scroll p-8">
                    <div class="grid grid-cols-12 gap-10">
                        <!-- Panel Izquierdo: Datos y Links -->
                        <div class="col-span-12 lg:col-span-5 space-y-6">
                            <div class="input-elite-group">
                                <label class="input-elite-label">Título del Item / Operación</label>
                                <input id="del-title" type="text" class="input-elite" placeholder="Ej: Video de Venta v1">
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="input-elite-group">
                                    <label class="input-elite-label">Precio / Valor</label>
                                    <input id="del-price" type="number" class="input-elite mono" placeholder="0.00">
                                </div>
                                <div class="input-elite-group">
                                    <label class="input-elite-label">Moneda</label>
                                    <select id="del-currency" class="input-elite outline-none">
                                        <option value="BOB">Bs. (BOB)</option>
                                        <option value="USD">$ (USD)</option>
                                        <option value="EUR">€ (EUR)</option>
                                    </select>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="input-elite-group">
                                    <label class="input-elite-label">Estado</label>
                                    <select id="del-status" class="input-elite outline-none">
                                        <option value="pending">Pendiente</option>
                                        <option value="paid">Pagado</option>
                                    </select>
                                </div>
                                <div class="input-elite-group">
                                    <label class="input-elite-label">Método</label>
                                    <input id="del-method" type="text" class="input-elite" placeholder="...">
                                </div>
                            </div>
                            <div class="space-y-4 pt-4 border-t border-white/5">
                                <div class="input-elite-group">
                                    <label class="input-elite-label">URL de Empresa (Sustituciones)</label>
                                    <input id="del-link-empresa" type="text" class="input-elite text-[10px]" placeholder="https://...">
                                </div>
                                <div class="input-elite-group">
                                    <label class="input-elite-label">URL General / Referencias</label>
                                    <input id="del-link-general" type="text" class="input-elite text-[10px]" placeholder="https://...">
                                </div>
                            </div>
                        </div>

                        <!-- Panel Derecho: Editor Estratégico -->
                        <div class="col-span-12 lg:col-span-7 flex flex-col h-full min-h-[400px]">
                            <div class="flex justify-between items-center mb-4">
                                <p class="kpi-label">Notas de Feedback y Estrategia</p>
                                <div class="flex gap-2">
                                    <button onclick="window.app.highlightNexusText('rgba(239, 68, 68, 0.4)')" class="w-6 h-6 rounded bg-red-500/20 border border-red-500/40"></button>
                                    <button onclick="window.app.highlightNexusText('rgba(59, 130, 246, 0.4)')" class="w-6 h-6 rounded bg-blue-500/20 border border-blue-500/40"></button>
                                    <button onclick="window.app.highlightNexusText('rgba(234, 179, 8, 0.4)')" class="w-6 h-6 rounded bg-yellow-500/20 border border-yellow-500/40"></button>
                                    <button onclick="window.app.highlightNexusText('rgba(16, 185, 129, 0.4)')" class="w-6 h-6 rounded bg-accent-green/20 border border-accent-green/40"></button>
                                    <button onclick="window.app.clearNexusFormat()" class="w-6 h-6 rounded bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20">
                                        <i data-lucide="eraser" class="w-3 h-3 text-white"></i>
                                    </button>
                                </div>
                            </div>
                            <div id="del-notes-editor" contenteditable="true" class="bg-[#080808] border border-white/5 p-6 flex-1 overflow-y-auto custom-scroll text-gray-400 text-sm leading-relaxed outline-none focus:border-purple-500/30 transition-all" placeholder="Escribe aquí las observaciones del cliente..."></div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="p-8 border-t border-white/5 flex gap-4">
                    <button onclick="window.app.closeModals()" class="btn-elite secondary flex-1">Cerrar</button>
                    <button id="btn-save-op" onclick="window.app.saveDeliverable()" class="btn-elite primary flex-1">GUARDAR CAMBIOS</button>
                </div>
            </div>
        </div>
    </div>
    `;
}
