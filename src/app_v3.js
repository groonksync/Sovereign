/**
 * Sovereign - App Logic (Aura Ledger)
 * Pure Vanilla JS Implementation
 */

// --- CLOUD CONFIGURATION (SUPABASE) ---
const SUPABASE_URL = 'https://wcewgxkizvsnffhbqqet.supabase.co';
const SUPABASE_KEY = 'sb_publishable_W3JOdptOwRr5zyxFY2nApA_rf_FrNTO';

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
    nexusProjects: [], // Nexus Elite DNA
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
    const avgInterest = state.loans.length > 0 ? (state.loans.reduce((acc, l) => acc + parseFloat(l.interest || 0), 0) / state.loans.length).toFixed(1) : 0;
    
    const totalInterestEarned = state.loans.reduce((acc, loan) => {
        const paidInterest = (loan.installments || [])
            .filter(inst => inst.paid)
            .reduce((sum, inst) => sum + parseFloat(inst.amount), 0);
        return acc + paidInterest;
    }, 0);

    const manualDebts = state.debts;
    const protocolInterests = extractProtocolInterests();
    const combinedDebts = [...manualDebts, ...protocolInterests];
    const totalRecaudacionProyectada = combinedDebts.reduce((acc, d) => {
        if (d.isProtocol) return acc + parseFloat(d.amount);
        const rate = parseFloat(d.interest || 0) / 100;
        return acc + (parseFloat(d.amount || 0) * rate);
    }, 0);

    return `
        <div class="sv-nexus-elite flex flex-col p-8 space-y-10 pb-32">
            <header class="flex justify-between items-center">
                <div class="user-info">
                    <div class="avatar bg-emerald-500 text-black font-black">AS</div>
                    <div class="greeting">
                        <span class="text-[10px] font-black text-emerald-500 tracking-[0.3em] uppercase">Sovereign Protocol Active</span>
                        <h1 class="text-3xl font-black text-white uppercase tracking-tighter">Arquitecto Soberano</h1>
                    </div>
                </div>
                <div class="header-actions">
                    <button class="btn-pro ghost py-2" onclick="window.app.toggleTheme()">
                        ${state.isDarkMode ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>'}
                    </button>
                </div>
            </header>

            <section class="card-nexus p-16 text-center">
                <p class="text-[11px] font-black text-emerald-500 uppercase tracking-[0.4em] mb-4">Capital Total en Protocolo</p>
                <h2 class="mega-kpi-main">${formatCurrency(totalAssets)}</h2>
                
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-8 mt-10">
                    <div class="text-center">
                        <p class="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Recaudación Mes</p>
                        <p class="text-xl font-black text-emerald-500">${formatCurrency(totalRecaudacionProyectada)}</p>
                    </div>
                    <div class="text-center border-l border-white/10">
                        <p class="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Interés Acumulado</p>
                        <p class="text-xl font-black text-white">${formatCurrency(totalInterestEarned)}</p>
                    </div>
                    <div class="text-center border-l border-white/10">
                        <p class="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Contratos</p>
                        <p class="text-xl font-black text-white">${activeContracts}</p>
                    </div>
                    <div class="text-center border-l border-white/10">
                        <p class="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Tasa Media</p>
                        <p class="text-xl font-black text-amber-500">${avgInterest}%</p>
                    </div>
                </div>
            </section>

            <main class="space-y-6">
                <div class="flex justify-between items-center bg-white/[0.01] p-4 rounded-2xl border border-white/5">
                    <h4 class="text-xs font-black text-emerald-500 uppercase tracking-widest ml-2">Monitor de Activos</h4>
                    <button class="btn-pro py-2 text-[10px]" onclick="window.app.navigate('register')">+ Nuevo Contrato</button>
                </div>
                
                <div class="nexus-grid">
                    ${state.loans.map(loan => {
                        const totalInst = (loan.installments || []).length;
                        const paidInst = (loan.installments || []).filter(i => i.paid).length;
                        const progress = totalInst > 0 ? Math.round((paidInst / totalInst) * 100) : 0;
                        
                        return `
                        <div class="card-nexus p-8 hover:bg-white/[0.02] cursor-pointer border-l-4 border-l-emerald-500 transition-all" onclick="window.app.navigate('details', '${loan.id}')">
                            <div class="flex justify-between items-start mb-6">
                                <div class="flex items-center gap-4">
                                    <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white font-black text-lg">
                                        ${loan.debtor.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 class="text-xl font-black text-white uppercase">${loan.debtor}</h3>
                                        <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest">Contrato Activo • ID: ${loan.id.substring(0,6)}</p>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <span class="text-2xl font-black text-white">${formatCurrency(loan.amount)}</span>
                                    <p class="text-[9px] text-emerald-500 font-black uppercase tracking-widest">${loan.interest}% Tasa</p>
                                </div>
                            </div>
                            <div class="pipeline-bar">
                                <div class="pipeline-segment bg-emerald-500" style="width: ${progress}%;"></div>
                            </div>
                            <div class="flex justify-between mt-3 text-[9px] font-black uppercase">
                                <span class="text-gray-500">${progress}% Reembolsado</span>
                                <span class="${progress === 100 ? 'text-emerald-500' : 'text-amber-500'}">${progress === 100 ? 'Completado' : 'En Proceso'}</span>
                            </div>
                        </div>
                    `}).join('')}
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
        <div class="sv-nexus-elite flex flex-col p-8 space-y-10 pb-32">
            <header class="flex justify-between items-center">
                <div class="greeting">
                    <span class="text-[10px] font-black text-blue-500 tracking-[0.3em] uppercase">Billing Protocol</span>
                    <h1 class="text-3xl font-black text-white uppercase tracking-tighter">Clientes de Video</h1>
                </div>
                <div class="flex gap-4">
                    <button id="btn-google-auth" class="btn-pro ghost py-2 relative" onclick="window.app.handleGoogleAuth()" title="Google Drive Sync">
                        <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" class="w-4 h-4">
                        <div id="google-status-dot" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-black" style="background: ${window.googleAccessToken ? '#4285F4' : '#4a4a4a'}"></div>
                    </button>
                    <button class="btn-pro ghost py-2" onclick="window.app.exportDriveBackup()" title="Backup Cloud">
                        <i data-lucide="save" class="w-4 h-4"></i>
                    </button>
                    <button class="btn-pro emerald py-2" onclick="window.app.navigate('receiptRegister')">+ Nuevo Recibo</button>
                </div>
            </header>

            <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="card-nexus p-10 text-center border-blue-500/20">
                    <p class="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-2">Total Facturado Bruto</p>
                    <h2 class="text-4xl font-black text-white">${formatCurrency(totalFacturado)}</h2>
                </div>
                <div class="card-nexus p-10 text-center border-amber-500/20 bg-amber-500/5">
                    <p class="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-2">Cuentas por Cobrar</p>
                    <h2 class="text-4xl font-black text-amber-500">${formatCurrency(totalPendiente)}</h2>
                </div>
            </section>

            <main class="space-y-10">
                ${pendingReceipts.length > 0 ? `
                    <section class="space-y-6">
                        <h4 class="text-xs font-black text-amber-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <i data-lucide="clock" class="w-3 h-3"></i> Saldos Pendientes de Clientes
                        </h4>
                        <div class="nexus-grid">
                            ${pendingReceipts.map(r => `
                                <div class="card-nexus p-6 flex justify-between items-center border-l-4 border-l-amber-500 bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer group transition-all" onclick="window.app.navigate('receiptDetail', '${r.id}')">
                                    <div class="flex items-center gap-5">
                                        <div class="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 font-black group-hover:bg-amber-500 group-hover:text-black transition-all">${r.clientName.substring(0, 2).toUpperCase()}</div>
                                        <div>
                                            <h3 class="text-lg font-black text-white uppercase">${r.clientName}</h3>
                                            <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest">${r.brandName || 'Video Edition'} • Pendiente</p>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-xl font-black text-amber-500">${formatCurrency(r.totalAmount)}</span>
                                        <p class="text-[9px] font-black uppercase text-gray-600">${r.receiptId}</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </section>
                ` : ''}

                <section class="space-y-6">
                    <h4 class="text-xs font-black text-gray-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <i data-lucide="check-circle" class="w-3 h-3"></i> Historial de Cobros Finalizados
                    </h4>
                    <div class="nexus-grid">
                        ${state.receipts.filter(r => r.status !== 'Pendiente').length === 0 ? `
                            <div class="col-span-full py-10 text-center opacity-20"><p class="font-black uppercase tracking-widest text-[10px]">Sin cobros finalizados</p></div>
                        ` : state.receipts.filter(r => r.status !== 'Pendiente').map(r => `
                            <div class="card-nexus p-6 flex justify-between items-center hover:bg-white/[0.02] cursor-pointer group transition-all" onclick="window.app.navigate('receiptDetail', '${r.id}')">
                                <div class="flex items-center gap-5">
                                    <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-black transition-all">
                                        <i data-lucide="file-text"></i>
                                    </div>
                                    <div>
                                        <h3 class="text-lg font-black text-white uppercase">${r.clientName}</h3>
                                        <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest">${r.brandName || 'Edición Pro'} • ${formatDate(r.date)}</p>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <span class="text-xl font-black text-white">${formatCurrency(r.totalAmount, r.totals?.USD > 0 ? '$' : (r.totals?.EUR > 0 ? '€' : 'Bs.'))}</span>
                                    <p class="text-[9px] font-black uppercase text-blue-500 tracking-tighter">${r.receiptId}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>
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
        { id: 'sovereign-nexus', icon: 'activity', label: 'Nexus' }
    ];

    return `
        <nav class="fixed bottom-0 left-0 right-0 h-20 bg-black/80 backdrop-blur-3xl border-t border-white/5 px-6 flex items-center justify-around z-50">
            ${tabs.map(tab => `
                <button onclick="window.app.navigate('${tab.id}')" 
                    class="flex flex-col items-center gap-1 transition-all duration-300 ${state.currentView === tab.id ? 'text-emerald-500' : 'text-gray-500 hover:text-white'}">
                    <i data-lucide="${tab.icon}" class="w-5 h-5 ${state.currentView === tab.id ? 'fill-emerald-500/20' : ''}"></i>
                    <span class="text-[9px] font-black uppercase tracking-widest">${tab.label}</span>
                    ${state.currentView === tab.id ? '<div class="w-1 h-1 bg-emerald-500 rounded-full mt-1"></div>' : ''}
                </button>
            `).join('')}
        </nav>
    `;
}

function renderExpenses() {
    const totalExpenses = state.expenses.reduce((acc, exp) => acc + parseFloat(exp.amount || 0), 0);
    return `
        <div class="sv-nexus-elite flex flex-col p-8 space-y-10 pb-32">
            <header class="flex justify-between items-center">
                <div class="greeting">
                    <span class="text-[10px] font-black text-amber-500 tracking-[0.3em] uppercase">Gestión de Salidas</span>
                    <h1 class="text-3xl font-black text-white uppercase tracking-tighter">Mis Gastos</h1>
                </div>
                <button class="btn-pro amber py-2" onclick="window.app.navigate('expenseRegister')">+ Nuevo Compromiso</button>
            </header>

            <section class="card-nexus p-16 text-center border-amber-500/20">
                <p class="text-[11px] font-black text-amber-500 uppercase tracking-[0.4em] mb-4">Total Egresos Mensual</p>
                <h2 class="mega-kpi-main" style="background: linear-gradient(180deg, #fff 30%, #f59e0b 100%); -webkit-background-clip: text;">${formatCurrency(totalExpenses)}</h2>
            </section>

            <main class="space-y-6">
                <h4 class="text-xs font-black text-gray-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                    <i data-lucide="calendar" class="w-3 h-3"></i> Compromisos Fijos y Variables
                </h4>
                <div class="nexus-grid">
                    ${state.expenses.length === 0 ? `
                        <div class="col-span-full py-20 text-center opacity-20"><p class="font-black uppercase tracking-widest text-xs">Sin gastos registrados</p></div>
                    ` : state.expenses.map(exp => `
                        <div class="card-nexus p-8 hover:bg-white/[0.02] cursor-pointer border-l-4 border-l-amber-500 group transition-all" onclick="window.app.navigate('expenseDetail', '${exp.id}')">
                            <div class="flex justify-between items-start">
                                <div class="flex items-center gap-4">
                                    <div class="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-black transition-all">
                                        <i data-lucide="shopping-cart"></i>
                                    </div>
                                    <div>
                                        <h3 class="text-xl font-black text-white uppercase">${exp.debtor}</h3>
                                        <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest">${exp.category || 'General'} • Día ${new Date(exp.payDate).getDate()}</p>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <span class="text-2xl font-black text-white">${formatCurrency(exp.amount)}</span>
                                    <p class="text-[9px] font-black uppercase text-amber-500">Pendiente</p>
                                </div>
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
    try {
        const manualDebts = state.debts || [];
        const protocolInterests = extractProtocolInterests() || [];
        const combinedDebts = [...manualDebts, ...protocolInterests];
        
        // Alertas Proactivas (2 días) - Refined logic
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const upcoming = combinedDebts.filter(d => {
            if (!d.start_date) return false;
            const sDate = new Date(d.start_date);
            if (isNaN(sDate)) return false;
            
            const startDay = sDate.getDate();
            const collectionDate = new Date(today.getFullYear(), today.getMonth(), startDay);
            const diffTime = collectionDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 2;
        });

        const totalMonthlyInterest = combinedDebts.reduce((acc, d) => {
            if (d.isProtocol) return acc + parseFloat(d.amount || 0);
            const rate = parseFloat(d.interest || 0) / 100;
            return acc + (parseFloat(d.amount || 0) * rate);
        }, 0);

        const totalManualCapital = manualDebts.reduce((acc, d) => acc + parseFloat(d.amount || 0), 0);

        return `
            <div class="sv-nexus-elite flex flex-col p-8 space-y-10 pb-32">
                <header class="flex justify-between items-center">
                    <div class="greeting">
                        <span class="text-[10px] font-black text-emerald-500 tracking-[0.3em] uppercase">Collection Protocol</span>
                        <h1 class="text-3xl font-black text-white uppercase tracking-tighter">Control de Deudores</h1>
                    </div>
                    <button class="btn-pro emerald py-2" onclick="window.app.navigate('debtRegister')">+ Nueva Deuda</button>
                </header>

                <section class="card-nexus p-16 text-center">
                    <p class="text-[11px] font-black text-emerald-500 uppercase tracking-[0.4em] mb-4">Intereses a Recaudar</p>
                    <h2 class="mega-kpi-main">${formatCurrency(totalMonthlyInterest)}</h2>
                    <p class="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-4">Capital en Riesgo: ${formatCurrency(totalManualCapital)}</p>
                </section>

                ${upcoming.length > 0 ? `
                    <section class="space-y-4">
                        <h4 class="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] ml-2">⚠️ Alertas de Cobro Inmediato</h4>
                        <div class="grid grid-cols-1 gap-3">
                            ${upcoming.map(d => {
                                const sDate = new Date(d.start_date);
                                const collectionDate = new Date(today.getFullYear(), today.getMonth(), sDate.getDate());
                                const dDays = Math.ceil((collectionDate - today) / (1000 * 60 * 60 * 24));
                                return `
                                <div class="card-nexus p-4 border-amber-500/30 bg-amber-500/5 flex justify-between items-center animate-pulse">
                                    <div class="flex items-center gap-4">
                                        <div class="w-2 h-2 bg-amber-500 rounded-full"></div>
                                        <p class="text-xs font-black text-white uppercase">${d.debtor || 'Sin Nombre'} <span class="text-gray-500 ml-2">Vence en ${dDays} días</span></p>
                                    </div>
                                    <button class="text-[9px] font-black text-amber-500 uppercase tracking-widest border border-amber-500/20 px-3 py-1 rounded-lg" onclick="${d.isProtocol ? `window.app.navigate('details', '${d.originalLoanId}')` : `window.app.navigate('debtDetail', '${d.id}')`}">Gestionar</button>
                                </div>
                            `}).join('')}
                        </div>
                    </section>
                ` : ''}

                <main class="space-y-10">
                    <!-- PROTOCOLO NEXUS -->
                    <section class="space-y-6">
                        <h4 class="text-xs font-black text-blue-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <i data-lucide="layers" class="w-3 h-3"></i> Intereses Protocolo Nexus
                        </h4>
                        <div class="nexus-grid">
                            ${combinedDebts.filter(d => d.isProtocol).map(debt => `
                                <div class="card-nexus p-6 flex justify-between items-center hover:bg-white/[0.02] cursor-pointer border-l-4 border-l-blue-500 group transition-all" 
                                     onclick="window.app.navigate('details', '${debt.originalLoanId}')">
                                    <div class="flex items-center gap-5">
                                        <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 font-black group-hover:bg-blue-500 group-hover:text-black transition-all">${(debt.debtor || '??').substring(0, 2).toUpperCase()}</div>
                                        <div>
                                            <h3 class="text-lg font-black text-white uppercase">${debt.debtor || 'Sin Nombre'}</h3>
                                            <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest">Contrato Nexus • ${formatDate(debt.start_date)}</p>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-xl font-black text-white">${formatCurrency(debt.amount)}</span>
                                        <p class="text-[9px] font-black uppercase text-blue-500">Recurrente</p>
                                    </div>
                                </div>
                            `).join('') || '<p class="col-span-full text-center py-10 opacity-20 text-[10px] font-black uppercase tracking-widest">Sin intereses de protocolo</p>'}
                        </div>
                    </section>

                    <!-- CARTERA PERSONAL -->
                    <section class="space-y-6">
                        <h4 class="text-xs font-black text-emerald-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <i data-lucide="user" class="w-3 h-3"></i> Cartera de Deudores Personal
                        </h4>
                        <div class="nexus-grid">
                            ${combinedDebts.filter(d => !d.isProtocol).map(debt => `
                                <div class="card-nexus p-6 flex justify-between items-center hover:bg-white/[0.02] cursor-pointer border-l-4 border-l-emerald-500 group transition-all" 
                                     onclick="window.app.navigate('debtDetail', '${debt.id}')">
                                    <div class="flex items-center gap-5">
                                        <div class="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black group-hover:bg-emerald-500 group-hover:text-black transition-all">${(debt.debtor || '??').substring(0, 2).toUpperCase()}</div>
                                        <div>
                                            <h3 class="text-lg font-black text-white uppercase">${debt.debtor || 'Sin Nombre'}</h3>
                                            <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest">Préstamo Directo • ${formatDate(debt.start_date)}</p>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-xl font-black text-white">${formatCurrency(debt.amount)}</span>
                                        <p class="text-[9px] font-black uppercase text-emerald-500">${debt.interest || 0}% Int. Mensual</p>
                                    </div>
                                </div>
                            `).join('') || '<p class="col-span-full text-center py-10 opacity-20 text-[10px] font-black uppercase tracking-widest">Sin deudores personales</p>'}
                        </div>
                    </section>
                </main>
            </div>
        `;
    } catch (err) {
        console.error("Debts Render Crash:", err);
        return `<div class="p-20 text-center"><p class="text-amber-500 font-black">Error en el protocolo de deudores. Reiniciando...</p></div>`;
    }
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


/** --- SOVEREIGN NEXUS: ELITE PRODUCTION SUITE (DNA DEFINITIVO) --- **/
const currencyMap = { 'USD': '$', 'BOB': 'Bs.', 'EUR': '€' };

async function renderSovereignNexus() {
    const activeTab = state.nexusTab || 'dashboard';
    
    // Carga inicial de datos
    if (!state.nexusProjects) {
        try {
            const { data: projs, error } = await sb
                .from('nexus_projects')
                .select('*, nexus_deliverables(*)')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            state.nexusProjects = projs || [];
            setTimeout(() => render(), 10);
        } catch (e) {
            console.error("Error loading Nexus DNA:", e);
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

    window.app.openModal = (id) => {
        document.getElementById(id).style.display = 'flex';
    };

    window.app.closeModals = () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    };

    window.app.createProject = async () => {
        const name = document.getElementById('clientName').value;
        const desc = document.getElementById('projectDesc').value;
        if (!name) return;

        try {
            const { data, error } = await sb
                .from('nexus_projects')
                .insert([{ name, description: desc, status: 'briefing' }])
                .select()
                .single();
            
            if (error) throw error;
            state.nexusProjects.unshift({ ...data, nexus_deliverables: [] });
            state.activeNexusProjectId = data.id;
            window.app.closeModals();
            render();
        } catch (e) { alert("Error: " + e.message); }
    };

    window.app.selectProject = (id) => {
        state.activeNexusProjectId = id;
        render();
    };

    window.app.updateProjectField = async (field, value) => {
        if (!activeProject) return;
        try {
            await sb.from('nexus_projects').update({ [field]: value }).eq('id', activeProject.id);
            activeProject[field] = value;
            if (field === 'status') render();
        } catch (e) { console.error(e); }
    };

    window.app.openBrandingModal = () => {
        if (!activeProject) return;
        document.getElementById('branding-json-input').value = JSON.stringify(activeProject.branding_json || {}, null, 2);
        window.app.openModal('modalBranding');
    };

    window.app.saveBranding = async () => {
        try {
            const json = JSON.parse(document.getElementById('branding-json-input').value);
            await window.app.updateProjectField('branding_json', json);
            window.app.closeModals();
            render();
        } catch (e) { alert("JSON Inválido"); }
    };

    window.app.openDeliverableModal = (delId = null) => {
        if (delId) {
            const d = activeProject.nexus_deliverables.find(item => item.id === delId);
            state.editingDeliverableId = delId;
            document.getElementById('del-title').value = d.title || '';
            document.getElementById('del-price').value = d.price || '';
            document.getElementById('del-currency').value = d.currency || 'USD';
            document.getElementById('del-status').value = d.status_paid || 'pending';
            document.getElementById('del-notes').innerHTML = d.notes_html || '';
        } else {
            state.editingDeliverableId = null;
            document.getElementById('del-title').value = '';
            document.getElementById('del-price').value = '';
            document.getElementById('del-notes').innerHTML = '';
        }
        window.app.openModal('modalDeliverable');
    };

    window.app.saveDeliverable = async () => {
        if (!activeProject) return;
        const payload = {
            project_id: activeProject.id,
            title: document.getElementById('del-title').value,
            price: Number(document.getElementById('del-price').value),
            currency: document.getElementById('del-currency').value,
            status_paid: document.getElementById('del-status').value, // Alineado con technical_architecture
            notes_html: document.getElementById('del-notes').innerHTML,
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

            window.app.closeModals();
            render();
        } catch (e) { console.error("Deliverable Sync Error:", e); }
    };

    window.app.formatNexus = (cmd) => document.execCommand(cmd, false, null);
    window.app.insertNexusTimestamp = () => {
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const tag = `<span class="timestamp-tag">${time}</span>&nbsp;`;
        document.execCommand('insertHTML', false, tag);
    };

    // --- HTML RENDER DNA ---
    return `
    <div class="sv-nexus-elite flex flex-col overflow-hidden h-screen w-full">
        <!-- NAVEGACIÓN -->
        <nav class="top-nav">
            <div class="flex items-center gap-10">
                <h1 class="text-xl font-black tracking-tighter text-white">SOVEREIGN</h1>
                <div class="flex gap-1">
                    <button onclick="window.app.switchNexusTab('dashboard')" class="nav-link ${activeTab === 'dashboard' ? 'active' : ''}"><i data-lucide="layout"></i> Escritorio</button>
                    <button onclick="window.app.switchNexusTab('nexus')" class="nav-link ${activeTab === 'nexus' ? 'active' : ''}"><i data-lucide="activity"></i> Proyectos</button>
                    <button onclick="window.app.switchNexusTab('cloud')" class="nav-link ${activeTab === 'cloud' ? 'active' : ''}"><i data-lucide="hard-drive"></i> Cloud</button>
                    <button onclick="window.app.switchNexusTab('finance')" class="nav-link ${activeTab === 'finance' ? 'active' : ''}"><i data-lucide="bar-chart-3"></i> Finanzas</button>
                </div>
            </div>
            <div class="flex items-center gap-4 ${activeTab === 'nexus' ? '' : 'hidden'}">
                <div class="text-right">
                    <p class="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none">Cartera Nexus</p>
                    <span class="text-lg font-black text-emerald-500 leading-none">${formatCurrency(totalPaid + totalPending, '$')}</span>
                </div>
            </div>
        </nav>

        <main class="custom-scroll">
            <div class="max-w-screen-2xl mx-auto w-full">
                
                <!-- ESCRITORIO -->
                <section id="view-dashboard" class="view-section ${activeTab === 'dashboard' ? 'active' : ''} space-y-8">
                    <div class="card-nexus p-20 text-center bg-gradient-to-b from-white/[0.02] to-transparent">
                        <p class="text-[11px] font-black text-emerald-500 uppercase tracking-[0.4em] mb-4">Capital Realizado Proyectado</p>
                        <h2 class="mega-kpi-main">${formatCurrency(totalPaid, '$')}</h2>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div class="card-nexus p-12 border-l-4 border-l-amber-500/30">
                            <p class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Pagos Pendientes</p>
                            <h3 class="text-5xl font-black text-amber-500">${formatCurrency(totalPending, '$')}</h3>
                        </div>
                        <div class="card-nexus p-12 flex flex-col justify-between">
                            <div>
                                <p class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Pipeline de Producción</p>
                                <div class="pipeline-bar mt-2">
                                    <div class="pipeline-segment bg-blue-600" style="width: ${(stages.briefing / (state.nexusProjects.length || 1)) * 100}%"></div>
                                    <div class="pipeline-segment bg-blue-400" style="width: ${(stages.production / (state.nexusProjects.length || 1)) * 100}%"></div>
                                    <div class="pipeline-segment bg-amber-500" style="width: ${(stages.feedback / (state.nexusProjects.length || 1)) * 100}%"></div>
                                    <div class="pipeline-segment bg-emerald-500" style="width: ${(stages.finished / (state.nexusProjects.length || 1)) * 100}%"></div>
                                </div>
                                <div class="flex justify-between mt-4 text-[9px] font-bold uppercase text-gray-600">
                                    <span>Brief</span><span>Edit</span><span>Review</span><span>Final</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- NEXUS -->
                <section id="view-nexus" class="view-section ${activeTab === 'nexus' ? 'active' : ''}">
                    <div class="grid grid-cols-12 gap-10">
                        <!-- Sidebar -->
                        <div class="col-span-3 space-y-6">
                            <button onclick="window.app.openModal('modalProject')" class="btn-pro emerald w-full">Nueva Operación</button>
                            <div class="space-y-3">
                                ${state.nexusProjects.map(p => `
                                    <div onclick="window.app.selectProject('${p.id}')" class="p-5 rounded-2xl border ${state.activeNexusProjectId === p.id ? 'border-emerald-500 bg-white/[0.03]' : 'border-white/5 bg-black'} cursor-pointer hover:border-white/20 transition-all">
                                        <p class="text-sm font-black text-white uppercase truncate">${p.name}</p>
                                        <p class="text-[8px] text-gray-500 uppercase mt-1">${p.status || 'briefing'}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <!-- Workspace -->
                        <div class="col-span-9" id="nexus-workspace">
                            ${!activeProject ? `
                                <div class="card-nexus py-40 text-center opacity-10">
                                    <i data-lucide="layers" class="w-16 h-16 mx-auto mb-4"></i>
                                    <h4 class="font-black uppercase tracking-widest">Selecciona un proyecto</h4>
                                </div>
                            ` : `
                                <div class="animate-in space-y-10">
                                    <div class="flex flex-col gap-8 pb-10 border-b border-white/5">
                                        <div class="flex justify-between items-start">
                                            <div class="flex-1">
                                                <h3 class="text-6xl font-black text-white uppercase tracking-tighter mb-4">${activeProject.name}</h3>
                                                <div class="flex items-center gap-4">
                                                    <select onchange="window.app.updateProjectField('status', this.value)" class="bg-[#111] border border-white/10 rounded-lg px-4 py-2 text-[10px] font-black text-emerald-400 uppercase outline-none">
                                                        <option value="briefing" ${activeProject.status === 'briefing' ? 'selected' : ''}>Briefing</option>
                                                        <option value="production" ${activeProject.status === 'production' ? 'selected' : ''}>En Edición</option>
                                                        <option value="feedback" ${activeProject.status === 'feedback' ? 'selected' : ''}>Revisiones</option>
                                                        <option value="finished" ${activeProject.status === 'finished' ? 'selected' : ''}>Finalizado</option>
                                                    </select>
                                                    <div class="flex gap-2">
                                                        ${Object.keys(activeProject.branding_json || {}).map(k => `<span class="branding-chip">${k}</span>`).join('')}
                                                    </div>
                                                </div>
                                            </div>
                                            <button onclick="window.app.openBrandingModal()" class="btn-pro ghost py-2 text-[10px] bg-white/5 text-gray-400 border border-white/10 hover:text-white transition-all"><i data-lucide="palette" class="w-3 h-3"></i> Identidad</button>
                                        </div>
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div class="bg-white/[0.02] border border-white/5 border-dashed p-4 rounded-2xl flex items-center gap-4">
                                                <i data-lucide="folder" class="text-blue-400 w-5 h-5"></i>
                                                <input type="text" onchange="window.app.updateProjectField('drive_url', this.value)" value="${activeProject.drive_url || ''}" class="bg-transparent border-none text-[11px] text-blue-400 font-bold focus:ring-0 p-0 w-full" placeholder="Drive Link">
                                                <button onclick="window.open('${activeProject.drive_url}', '_blank')" class="text-blue-400"><i data-lucide="external-link" class="w-4 h-4"></i></button>
                                            </div>
                                            <div class="bg-white/[0.02] border border-white/5 border-dashed p-4 rounded-2xl flex items-center gap-4">
                                                <i data-lucide="video" class="text-amber-500 w-5 h-5"></i>
                                                <input type="text" onchange="window.app.updateProjectField('meeting_url', this.value)" value="${activeProject.meeting_url || ''}" class="bg-transparent border-none text-[11px] text-amber-500 font-bold focus:ring-0 p-0 w-full" placeholder="Meet Link">
                                                <button onclick="window.open('${activeProject.meeting_url}', '_blank')" class="text-amber-500"><i data-lucide="video" class="w-4 h-4"></i></button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="space-y-6">
                                        <div class="flex justify-between items-center bg-white/[0.01] p-4 rounded-2xl border border-white/5">
                                            <h4 class="text-xs font-black text-emerald-500 uppercase tracking-widest ml-2">Desglose de Producción</h4>
                                            <button onclick="window.app.openDeliverableModal()" class="btn-pro py-2 text-[10px]">+ Añadir Ítem</button>
                                        </div>
                                        <div class="space-y-6">
                                            ${(activeProject.nexus_deliverables || []).map(d => `
                                                <div onclick="window.app.openDeliverableModal('${d.id}')" class="card-nexus p-8 border-l-4 ${d.status === 'paid' ? 'border-l-emerald-500' : 'border-l-amber-500'} flex justify-between items-center cursor-pointer hover:bg-white/[0.02] transition-all">
                                                    <div><h5 class="text-2xl font-black text-white uppercase">${d.title}</h5><p class="text-xs text-gray-500 uppercase">v${d.version || 1}</p></div>
                                                    <p class="text-3xl font-black text-white">${formatCurrency(d.price, currencyMap[d.currency] || '$')}</p>
                                                </div>
                                            `).join('') || `<p class="p-20 text-center text-gray-600 text-xs uppercase font-black">Sin ítems operativos</p>`}
                                        </div>
                                    </div>
                                </div>
                            `}
                        </div>
                    </div>
                </section>

                <!-- CLOUD -->
                <section id="view-cloud" class="view-section ${activeTab === 'cloud' ? 'active' : ''}">
                    <div class="card-nexus p-0 overflow-hidden max-w-5xl mx-auto border-white/5">
                        <div class="p-8 border-b border-white/5 bg-white/[0.01]"><h5 class="text-xs font-black uppercase tracking-widest text-gray-500">Recursos en Nube</h5></div>
                        <div class="divide-y divide-white/5">
                            ${state.nexusProjects.filter(p => p.drive_url).map(p => `
                                <div class="p-8 flex items-center justify-between hover:bg-white/[0.01] transition-all">
                                    <div class="flex items-center gap-6">
                                        <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                                            <i data-lucide="folder-git-2" class="w-6 h-6"></i>
                                        </div>
                                        <div>
                                            <p class="text-lg font-black text-white uppercase">${p.name}</p>
                                            <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest">Sincronizado</p>
                                        </div>
                                    </div>
                                    <button onclick="window.open('${p.drive_url}', '_blank')" class="btn-pro py-2 px-6 text-[10px] bg-white/5 text-gray-400 border border-white/10 hover:text-white transition-all">Abrir Drive</button>
                                </div>
                            `).join('') || '<p class="p-20 text-center text-gray-600 font-black uppercase tracking-widest">Sin recursos activos</p>'}
                        </div>
                    </div>
                </section>

                <!-- FINANZAS -->
                <section id="view-finance" class="view-section ${activeTab === 'finance' ? 'active' : ''}">
                    <div class="card-nexus p-16 text-center border-white/5 mb-10">
                        <p class="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-4">Balance General Realizado</p>
                        <h2 class="mega-kpi-main text-white">${formatCurrency(totalPaid, '$')}</h2>
                    </div>
                    <div class="divide-y divide-white/5 card-nexus p-0 overflow-hidden max-w-5xl mx-auto border-white/5">
                        ${state.nexusProjects.flatMap(p => (p.nexus_deliverables || []).map(d => ({...d, projectName: p.name})))
                            .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
                            .map(d => `
                                <div class="p-6 flex items-center justify-between hover:bg-white/[0.02] border-l-2 ${d.status === 'paid' ? 'border-emerald-500' : 'border-amber-500'} transition-all">
                                    <div>
                                        <p class="text-sm font-black text-white uppercase">${d.title}</p>
                                        <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest">${d.projectName}</p>
                                    </div>
                                    <p class="text-xl font-black text-white">${formatCurrency(d.price, currencyMap[d.currency] || '$')}</p>
                                </div>
                            `).join('') || '<p class="p-20 text-center text-gray-600 font-black uppercase tracking-widest">Sin transacciones</p>'}
                    </div>
                </section>

            </div>
        </main>

        <!-- MODALES -->
        <div id="modalProject" class="modal-overlay">
            <div class="card-nexus w-full max-w-md relative">
                <button onclick="window.app.closeModals()" class="absolute top-8 right-8 text-gray-500 hover:text-white"><i data-lucide="x"></i></button>
                <h3 class="text-2xl font-black mb-10 text-white uppercase text-center">Nueva Marca</h3>
                <div class="space-y-6">
                    <input id="clientName" type="text" class="input-pro" placeholder="Nombre de la Marca">
                    <textarea id="projectDesc" class="input-pro h-32" placeholder="Estrategia del proyecto..."></textarea>
                    <button onclick="window.app.createProject()" class="w-full btn-pro emerald py-5">Vincular Proyecto</button>
                </div>
            </div>
        </div>

        <div id="modalBranding" class="modal-overlay">
            <div class="card-nexus w-full max-w-2xl relative">
                <button onclick="window.app.closeModals()" class="absolute top-8 right-8 text-gray-500 hover:text-white"><i data-lucide="x"></i></button>
                <h3 class="text-xl font-black mb-6 uppercase text-white">Branding Vault</h3>
                <div class="space-y-4">
                    <textarea id="branding-json-input" class="input-pro h-96 font-mono text-emerald-500" placeholder='{"primaryColor": "#10b981"}'></textarea>
                    <button onclick="window.app.saveBranding()" class="w-full btn-pro emerald">Actualizar Identidad</button>
                </div>
            </div>
        </div>

        <div id="modalDeliverable" class="modal-overlay">
            <div class="card-nexus w-full max-w-4xl relative overflow-hidden">
                <button onclick="window.app.closeModals()" class="absolute top-8 right-8 text-gray-500 hover:text-white"><i data-lucide="x"></i></button>
                <div class="grid grid-cols-12 gap-8">
                    <div class="col-span-8 space-y-6">
                        <input id="del-title" type="text" onblur="window.app.saveDeliverable()" class="bg-transparent border-none text-4xl font-black text-white uppercase tracking-tighter w-full focus:ring-0 p-0" placeholder="NOMBRE DEL ÍTEM">
                        
                        <div class="flex items-center gap-4 border-b border-white/5 pb-4">
                            <button onclick="window.app.formatNexus('bold')" class="p-2 hover:bg-white/5 rounded text-gray-400"><i data-lucide="bold" class="w-4 h-4"></i></button>
                            <button onclick="window.app.formatNexus('italic')" class="p-2 hover:bg-white/5 rounded text-gray-400"><i data-lucide="italic" class="w-4 h-4"></i></button>
                            <button onclick="window.app.insertNexusTimestamp()" class="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded">Timestamp</button>
                        </div>

                        <div id="del-notes" contenteditable="true" class="intel-editor custom-scroll" onblur="window.app.saveDeliverable()"></div>
                    </div>
                    <div class="col-span-4 bg-white/[0.02] p-8 rounded-2xl space-y-6 border border-white/5">
                        <div class="space-y-2">
                            <label class="text-[9px] font-black text-gray-500 uppercase tracking-widest">Presupuesto</label>
                            <div class="flex gap-2">
                                <input id="del-price" type="number" onblur="window.app.saveDeliverable()" class="input-pro" placeholder="0.00">
                                <select id="del-currency" onchange="window.app.saveDeliverable()" class="input-pro w-24">
                                    <option value="USD">USD</option>
                                    <option value="BOB">BOB</option>
                                </select>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <label class="text-[9px] font-black text-gray-500 uppercase tracking-widest">Estado</label>
                            <select id="del-status" onchange="window.app.saveDeliverable()" class="input-pro">
                                <option value="pending">PENDIENTE</option>
                                <option value="paid">COBRADO</option>
                            </select>
                        </div>
                        <button onclick="window.app.saveDeliverable()" class="w-full btn-pro emerald mt-8">Sincronizar Ítem</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}
