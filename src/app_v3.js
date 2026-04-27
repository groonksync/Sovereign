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

// --- ELYSIAN HELPERS ---
function renderTopNav() {
    const tabs = [
        { id: 'dashboard', icon: 'layout', label: 'Escritorio' },
        { id: 'debts', icon: 'users', label: 'Clientes' },
        { id: 'expenses', icon: 'database', label: 'Almacén' },
        { id: 'studio-sync', icon: 'file-text', label: 'Finanzas' },
        { id: 'sovereign-nexus', icon: 'star', label: 'Editor Pro' }
    ];

    return `
        <nav class="elysian-top-nav">
            <div class="flex items-center gap-3 mr-8">
                <div class="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="black" stroke-width="3" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                </div>
                <div class="flex flex-col">
                    <span class="text-[11px] font-black tracking-tighter leading-none">ELYSIAN</span>
                    <span class="text-[7px] font-bold text-gray-500 tracking-[0.2em] leading-none mt-1">STUDIO OS</span>
                </div>
            </div>
            <div class="flex gap-2">
                ${tabs.map(tab => `
                    <div class="nav-item ${state.currentView === tab.id ? 'active' : ''}" onclick="window.app.navigate('${tab.id}')">
                        <i data-lucide="${tab.icon}" class="w-4 h-4"></i>
                        <span>${tab.label}</span>
                    </div>
                `).join('')}
            </div>
            <div class="ml-auto flex items-center gap-6">
                <i data-lucide="search" class="w-4 h-4 text-gray-500 cursor-pointer"></i>
                <div class="relative">
                    <i data-lucide="bell" class="w-4 h-4 text-gray-500 cursor-pointer"></i>
                    <div class="absolute -top-1 -right-1 w-1.5 h-1.5 bg-white rounded-full"></div>
                </div>
                <div class="w-8 h-8 rounded-full bg-[#1a1a1a] border border-white/5 flex items-center justify-center cursor-pointer">
                    <i data-lucide="user" class="w-4 h-4 text-gray-500"></i>
                </div>
            </div>
        </nav>
    `;
}

function renderSessionHeader() {
    const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    return `
        <header class="elysian-session-header">
            <div class="flex gap-16">
                <div class="session-info-group">
                    <span class="info-label">Identificador de Sesión</span>
                    <div class="flex items-center gap-3">
                        <span class="info-value">SOVEREIGN <span class="text-gray-500 font-light">01</span></span>
                        <div class="status-indicator">
                            <div class="dot"></div>
                            <span>En Línea</span>
                        </div>
                    </div>
                </div>
                <div class="session-info-group">
                    <span class="info-label">Fecha Límite</span>
                    <span class="info-value">${today}</span>
                </div>
                <div class="session-info-group">
                    <span class="info-label">Latencia de Red</span>
                    <span class="info-value">14ms <span class="text-gray-500 text-xs font-bold ml-1">/ ESTABLE</span></span>
                </div>
            </div>
            <div class="flex gap-3">
                <button class="elysian-btn-primary" onclick="window.app.handleSync()">
                    <i data-lucide="share-2" class="w-4 h-4"></i>
                    <span>Ejecutar Sync</span>
                </button>
                <button class="w-11 h-11 rounded-xl bg-[#1a1a1a] border border-white/5 flex items-center justify-center text-white hover:bg-[#222] transition-all" onclick="window.app.navigate('register')">
                    <i data-lucide="plus" class="w-5 h-5"></i>
                </button>
            </div>
        </header>
    `;
}

// --- RENDERERS ---

function renderDashboard() {
    const totalAssets = state.loans.reduce((acc, loan) => acc + parseFloat(loan.amount || 0), 0);
    const paidCount = state.loans.filter(l => l.status === 'Pagado').length;
    const pendingCount = state.loans.filter(l => l.status === 'Pendiente').length;

    return `
        <div class="animate-reveal space-y-8">
            <div class="grid grid-cols-3 gap-6">
                <div class="col-span-2 elysian-card">
                    <div class="flex justify-between items-start mb-12">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                                <i data-lucide="terminal" class="w-5 h-5 text-gray-400"></i>
                            </div>
                            <span class="info-label">Datos Estratégicos del Núcleo</span>
                        </div>
                        <div class="flex gap-4">
                            <i data-lucide="maximize-2" class="w-4 h-4 text-gray-600 cursor-pointer"></i>
                            <i data-lucide="more-horizontal" class="w-4 h-4 text-gray-600 cursor-pointer"></i>
                        </div>
                    </div>
                    
                    <div class="h-64 rounded-2xl border border-white/5 border-dashed flex flex-col items-center justify-center bg-black/20">
                        <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
                            <i data-lucide="play" class="w-6 h-6 text-white ml-1"></i>
                        </div>
                        <p class="text-sm font-black mb-2 uppercase tracking-tight">Secuencia Lista para Procesar</p>
                        <p class="text-[9px] text-gray-600 text-center max-w-xs leading-relaxed uppercase font-bold tracking-widest">
                            Los algoritmos de pre-visualización están activos. Por favor, arrastre sus archivos de origen aquí.
                        </p>
                    </div>
                </div>

                <div class="space-y-6">
                    <div class="elysian-card">
                        <span class="info-label">Capital Asignado</span>
                        <div class="flex items-end gap-2 mt-4">
                            <h2 class="mega-value text-white">${formatCurrency(totalAssets)}</h2>
                        </div>
                        <div class="mt-6 p-4 rounded-xl bg-white/5 border border-white/5">
                            <div class="flex items-center gap-3">
                                <i data-lucide="info" class="w-3 h-3 text-gray-500"></i>
                                <span class="text-[8px] font-bold text-gray-500 uppercase tracking-widest leading-normal">
                                    Presupuesto optimizado para renderizado
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="elysian-card">
                        <div class="flex items-center gap-3 mb-6">
                            <i data-lucide="cpu" class="w-4 h-4 text-gray-400"></i>
                            <span class="info-label">Nodos del Sistema</span>
                        </div>
                        <div class="space-y-3">
                            <div class="p-4 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
                                <div>
                                    <p class="text-xs font-black mb-1">Drive_Sync_Main</p>
                                    <p class="text-[8px] text-gray-600 font-bold uppercase tracking-widest">Almacenamiento Cloud</p>
                                </div>
                                <div class="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]"></div>
                            </div>
                            <div class="p-4 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center opacity-50">
                                <div>
                                    <p class="text-xs font-black mb-1">Session_Relay_04</p>
                                    <p class="text-[8px] text-gray-600 font-bold uppercase tracking-widest">Inactivo</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderStudioSync() {
    const totalFacturado = state.receipts.reduce((acc, r) => acc + parseFloat(r.totalAmount || 0), 0);
    const pendingReceipts = state.receipts.filter(r => r.status === 'Pendiente');
    const totalPendiente = pendingReceipts.reduce((acc, r) => acc + parseFloat(r.totalAmount || 0), 0);

    return `
        <div class="animate-reveal space-y-8">
            <div class="view-header-pro">
                <div>
                    <h1 class="view-title">Control de Finanzas</h1>
                    <p class="view-subtitle">Sovereign Studio Sync Pro</p>
                </div>
                <button class="elysian-btn-primary" onclick="window.app.navigate('receiptRegister')">
                    <i data-lucide="plus" class="w-4 h-4"></i>
                    <span>Emitir Recibo</span>
                </button>
            </div>

            <div class="grid grid-cols-2 gap-6">
                <div class="elysian-card">
                    <span class="info-label">Facturación Global Acumulada</span>
                    <h2 class="mega-value text-white mt-4">${formatCurrency(totalFacturado)}</h2>
                </div>
                <div class="elysian-card">
                    <span class="info-label">Cuentas por Cobrar</span>
                    <h2 class="mega-value text-amber-500 mt-4">${formatCurrency(totalPendiente)}</h2>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-3">
                ${state.receipts.map(r => `
                    <div class="elysian-card !p-5 flex justify-between items-center cursor-pointer hover:border-white/20 transition-all" onclick="window.app.navigate('receiptDetail', '${r.id}')">
                        <div class="flex items-center gap-6">
                            <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                                <i data-lucide="file-text" class="w-5 h-5 text-gray-500"></i>
                            </div>
                            <div>
                                <h3 class="text-sm font-black text-white uppercase mb-0.5">${r.clientName}</h3>
                                <p class="text-[9px] text-gray-600 font-bold uppercase tracking-widest">${r.receiptId} • ${formatDate(r.date)}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-8">
                            <div class="text-right">
                                <p class="text-xs font-black text-white mb-0.5">${formatCurrency(r.totalAmount)}</p>
                                <span class="text-[8px] font-bold ${r.status === 'Pagado' ? 'text-emerald-500' : 'text-amber-500'} uppercase tracking-widest">${r.status}</span>
                            </div>
                            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-700"></i>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderReceiptRegister() {
    return `
        <div class="animate-reveal max-w-4xl mx-auto">
            <div class="view-header-pro">
                <div>
                    <h1 class="view-title">Emitir Recibo</h1>
                    <p class="view-subtitle">Protocolo de Facturación Digital</p>
                </div>
                <button class="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center hover:bg-white/5" onclick="window.app.navigate('studioSync')">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <form id="receipt-form" class="space-y-8" onsubmit="window.app.handleSaveReceipt(event)">
                <div class="grid grid-cols-3 gap-6">
                    <div class="col-span-2 elysian-card space-y-6">
                        <div class="elysian-input-group">
                            <i data-lucide="user" class="elysian-input-icon w-4 h-4"></i>
                            <input type="text" name="clientName" class="elysian-input" placeholder="Nombre del Cliente" required>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="elysian-input-group">
                                <i data-lucide="folder" class="elysian-input-icon w-4 h-4"></i>
                                <input type="text" name="projectName" class="elysian-input" placeholder="Nombre del Proyecto">
                            </div>
                            <div class="elysian-input-group">
                                <i data-lucide="credit-card" class="elysian-input-icon w-4 h-4"></i>
                                <select name="paymentMethod" class="elysian-input">
                                    <option value="Transferencia">Transferencia</option>
                                    <option value="QR / Banco">QR / Banco</option>
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="USDT / Binance">USDT / Binance</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="elysian-card">
                        <span class="info-label mb-4 block">Estatus de Cobro</span>
                        <div class="status-picker">
                            <div class="status-option paid active" onclick="window.app.updateStatus(this, 'Pagado')">
                                <i data-lucide="check-circle"></i>
                                <span>Pagado</span>
                            </div>
                            <div class="status-option pending" onclick="window.app.updateStatus(this, 'Pendiente')">
                                <i data-lucide="clock"></i>
                                <span>Pendiente</span>
                            </div>
                        </div>
                        <input type="hidden" name="status" value="Pagado">
                        
                        <div class="mt-8 pt-6 border-t border-white/5 flex justify-between items-center">
                            <span class="info-label">Marca de Agua</span>
                            <input type="checkbox" name="watermarkEnabled" checked class="accent-white scale-125">
                        </div>
                    </div>
                </div>

                <div class="space-y-4">
                    <div class="flex justify-between items-center px-2">
                        <h2 class="info-label">Conceptos de Servicio</h2>
                        <button type="button" class="text-[9px] font-black text-white/50 uppercase tracking-widest hover:text-white transition-all" onclick="window.app.addReceiptItem()">+ Añadir Concepto</button>
                    </div>
                    <div id="items-container" class="space-y-3">
                        <!-- Items dinámicos -->
                    </div>
                </div>

                <button type="submit" class="elysian-btn-primary w-full !py-6 text-sm">Generar y Confirmar Recibo</button>
            </form>
        </div>
    `;
}

function renderReceiptDetail() {
    const receipt = state.receipts.find(r => r.id === state.selectedLoanId);
    if (!receipt) return navigate('studioSync');

    return `
        <div class="animate-reveal p-6 pb-32 max-w-4xl mx-auto">
            <header class="flex justify-between items-center mb-10">
                <button class="text-gray-500 hover:text-white transition-all flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest" onclick="window.app.navigate('studioSync')">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Recibos
                </button>
                <div class="flex gap-3">
                    <span class="${receipt.status === 'Pagado' ? 'badge-emerald' : 'badge-crimson'} !px-4 !py-2">${receipt.status.toUpperCase()}</span>
                    <button class="onyx-button" onclick="window.app.navigate('receiptEdit', '${receipt.id}')">Editar</button>
                </div>
            </header>

            <div class="onyx-card !p-0 overflow-hidden bg-white mb-10" id="printable-receipt" style="color: black !important;">
                <div class="p-12 border-b border-gray-100 flex justify-between items-start">
                    <div>
                        <h2 class="text-2xl font-black tracking-tighter mb-1">STUDIO SYNC PRO</h2>
                        <p class="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Digital Production Suite</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recibo No.</p>
                        <p class="text-xl font-black">${receipt.receiptId}</p>
                    </div>
                </div>

                <div class="p-12 grid grid-cols-2 gap-12 border-b border-gray-100">
                    <div>
                        <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Cliente</p>
                        <p class="text-sm font-bold uppercase">${receipt.clientName}</p>
                        <p class="text-xs text-gray-500 mt-1">${receipt.projectName || 'Proyecto General'}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Fecha de Emisión</p>
                        <p class="text-sm font-bold">${formatDate(receipt.date)}</p>
                    </div>
                </div>

                <div class="p-12">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="border-b border-gray-100 pb-4">
                                <th class="text-[9px] font-bold text-gray-400 uppercase tracking-widest pb-4">Descripción del Servicio</th>
                                <th class="text-[9px] font-bold text-gray-400 uppercase tracking-widest pb-4 text-center">Cant.</th>
                                <th class="text-[9px] font-bold text-gray-400 uppercase tracking-widest pb-4 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-50">
                            ${receipt.items.map(item => `
                                <tr>
                                    <td class="py-6">
                                        <p class="text-sm font-bold text-gray-900">${item.brand}</p>
                                        <p class="text-[11px] text-gray-500 mt-1">${item.desc}</p>
                                    </td>
                                    <td class="py-6 text-center text-sm font-bold text-gray-900">${item.qty}</td>
                                    <td class="py-6 text-right text-sm font-black text-gray-900">${formatCurrency(item.qty * item.price, item.currency === 'USD' ? '$' : 'Bs.')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="p-12 bg-gray-50 flex justify-between items-center">
                    <div>
                        <p class="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Método de Pago</p>
                        <p class="text-[10px] font-bold">${receipt.paymentMethod || 'Transferencia'}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Importe Total</p>
                        <p class="text-3xl font-black text-gray-900">${formatCurrency(receipt.totalAmount)}</p>
                    </div>
                </div>
            </div>

            <div class="flex gap-4 justify-center">
                <button class="onyx-button !bg-emerald-500/10 !text-emerald-500 !border-emerald-500/20" onclick="window.print()">Imprimir Recibo</button>
                <button class="onyx-button" onclick="window.app.exportReceiptToPDF('${receipt.id}')">Exportar PDF</button>
            </div>
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
        <div class="animate-reveal max-w-4xl mx-auto">
            <div class="view-header-pro">
                <div>
                    <h1 class="view-title">Alta de Cliente</h1>
                    <p class="view-subtitle">Protocolo de Registro de Activos</p>
                </div>
                <button class="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center hover:bg-white/5" onclick="window.app.navigate('dashboard')">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <form id="loan-form" class="space-y-8" onsubmit="window.app.handleSave(event)">
                <div class="grid grid-cols-3 gap-6">
                    <div class="col-span-2 elysian-card space-y-6">
                        <div class="elysian-input-group">
                            <i data-lucide="user" class="elysian-input-icon w-4 h-4"></i>
                            <input type="text" name="debtor" class="elysian-input" placeholder="Nombre Completo del Cliente" required>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="elysian-input-group">
                                <i data-lucide="dollar-sign" class="elysian-input-icon w-4 h-4"></i>
                                <input type="number" name="amount" class="elysian-input" placeholder="Importe Principal" required>
                            </div>
                            <div class="elysian-input-group">
                                <i data-lucide="calendar" class="elysian-input-icon w-4 h-4"></i>
                                <input type="date" name="startDate" class="elysian-input" required>
                            </div>
                        </div>
                        <div class="elysian-input-group">
                            <i data-lucide="message-square" class="elysian-input-icon w-4 h-4"></i>
                            <input type="text" name="reason" class="elysian-input" placeholder="Descripción del Activo / Servicio">
                        </div>
                    </div>

                    <div class="space-y-6">
                        <div class="elysian-card">
                            <span class="info-label mb-4 block">Estatus Inicial</span>
                            <div class="status-picker">
                                <div class="status-option paid active" onclick="window.app.updateStatus(this, 'Pagado')">
                                    <i data-lucide="check-circle"></i>
                                    <span>Liquidado</span>
                                </div>
                                <div class="status-option pending" onclick="window.app.updateStatus(this, 'Pendiente')">
                                    <i data-lucide="clock"></i>
                                    <span>Pendiente</span>
                                </div>
                            </div>
                            <input type="hidden" name="status" value="Pagado">
                        </div>

                        <div class="elysian-card">
                            <span class="info-label mb-4 block">Evidencia Digital</span>
                            <div class="photo-uploader" onclick="document.getElementById('photo-input').click()">
                                <i data-lucide="camera"></i>
                                <span>Cargar Captura</span>
                            </div>
                            <input type="file" id="photo-input" accept="image/*" class="hidden" onchange="window.app.handlePhotoUpload(event)">
                            <div id="photo-preview" class="mt-4 grid grid-cols-3 gap-2"></div>
                        </div>
                    </div>
                </div>

                <button type="submit" class="elysian-btn-primary w-full !py-6 text-sm">Registrar en Protocolo</button>
            </form>
        </div>
    `;
}



function renderDetails() {
    const loan = state.loans.find(l => l.id === state.selectedLoanId);
    if (!loan) return navigate('dashboard');

    const installments = loan.installments || [];
    const paidAmount = installments.filter(i => i.paid).reduce((acc, i) => acc + parseFloat(i.amount), 0);
    const totalToPay = installments.reduce((acc, i) => acc + parseFloat(i.amount), 0);

    return `
        <div class="animate-reveal space-y-10">
            <div class="view-header-pro">
                <div class="flex items-center gap-6">
                    <button class="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center hover:bg-white/5" onclick="window.app.navigate('dashboard')">
                        <i data-lucide="arrow-left" class="w-5 h-5 text-gray-500"></i>
                    </button>
                    <div>
                        <h1 class="view-title">${loan.debtor}</h1>
                        <p class="view-subtitle">Perfil Detallado de Activo</p>
                    </div>
                </div>
                <div class="flex gap-4">
                    <button class="elysian-btn-primary !bg-white/5 !text-white border border-white/10" onclick="window.app.exportToPDF('${loan.id}')">
                        <i data-lucide="file-text" class="w-4 h-4 text-gray-400"></i>
                        <span>Exportar PDF</span>
                    </button>
                    <button class="elysian-btn-primary" onclick="window.app.handleExtendLoan('${loan.id}')">
                        <i data-lucide="calendar-plus" class="w-4 h-4"></i>
                        <span>Ampliar Plazo</span>
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-6">
                <div class="elysian-card">
                    <span class="info-label">Inversión Principal</span>
                    <h2 class="mega-value text-white mt-4">${formatCurrency(loan.amount)}</h2>
                    <div class="mt-6 flex items-center gap-2">
                        <span class="status-indicator">
                            <div class="dot"></div>
                            <span>Protección AES-256</span>
                        </span>
                    </div>
                </div>

                <div class="elysian-card">
                    <span class="info-label">Retorno Proyectado</span>
                    <h2 class="mega-value text-amber-500 mt-4">${formatCurrency(totalToPay)}</h2>
                    <p class="text-[8px] font-bold text-gray-600 uppercase mt-2 tracking-widest">Calculado al ${loan.interest}% Mensual</p>
                </div>

                <div class="elysian-card">
                    <span class="info-label">Estatus de Liquidación</span>
                    <h2 class="mega-value text-white mt-4">${((paidAmount/totalToPay)*100 || 0).toFixed(1)}%</h2>
                    <div class="mt-8 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div class="h-full bg-white shadow-[0_0_10px_white]" style="width: ${(paidAmount/totalToPay)*100 || 0}%"></div>
                    </div>
                </div>
            </div>

            <div class="elysian-card">
                <div class="flex justify-between items-center mb-8">
                    <h2 class="info-label">Cronograma de Amortización</h2>
                    <span class="text-[8px] font-bold text-gray-600 uppercase tracking-widest">Total: ${installments.length} Cuotas</span>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    ${installments.map(inst => `
                        <div class="p-4 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center ${inst.paid ? 'opacity-30' : ''}">
                            <div class="flex items-center gap-4">
                                <div class="w-1.5 h-1.5 rounded-full ${inst.paid ? 'bg-white' : 'bg-amber-500 animate-pulse'}"></div>
                                <div>
                                    <p class="text-xs font-black">MES ${inst.month}</p>
                                    <p class="text-[8px] text-gray-600 font-bold uppercase tracking-widest">${formatDate(inst.dueDate)}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-6">
                                <p class="text-xs font-black">${formatCurrency(inst.amount)}</p>
                                <button onclick="window.app.handleToggleInstallment('${loan.id}', '${inst.id}')" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10">
                                    <i data-lucide="${inst.paid ? 'check' : 'circle'}" class="w-4 h-4 ${inst.paid ? 'text-white' : 'text-gray-600'}"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="flex justify-center pt-10">
                <button class="text-[9px] font-black text-red-500/50 uppercase tracking-[0.3em] hover:text-red-500 transition-all" onclick="window.app.handleDelete('${loan.id}')">
                    Dar de baja este activo del protocolo
                </button>
            </div>
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
        content = `<div class="p-20 text-center"><p class="text-red-500 font-bold">Error en la secuencia de renderizado.</p></div>`;
    }

    app.innerHTML = `
        <div class="min-h-screen bg-[#0c0c0c] text-white selection:bg-white selection:text-black">
            ${renderTopNav()}
            <div class="max-w-[1400px] mx-auto">
                ${renderSessionHeader()}
                <main class="px-8 pb-32">
                    ${content}
                </main>
            </div>

            <!-- MODALS ELYSIAN -->
            <div id="modalProject" class="modal-overlay" style="display: none;">
                <div class="elysian-card max-w-lg w-full !bg-[#0c0c0c] border-white/10">
                    <h3 class="text-2xl font-black uppercase tracking-tighter mb-8 text-white text-center">Nuevo Proyecto Nexus</h3>
                    <div class="space-y-4">
                        <div class="elysian-input-group">
                            <i data-lucide="user" class="elysian-input-icon w-4 h-4"></i>
                            <input id="clientName" type="text" class="elysian-input" placeholder="Nombre de la Marca">
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="elysian-input-group">
                                <i data-lucide="link" class="elysian-input-icon w-4 h-4"></i>
                                <input id="driveUrl" type="text" class="elysian-input" placeholder="URL Drive">
                            </div>
                            <div class="elysian-input-group">
                                <i data-lucide="video" class="elysian-input-icon w-4 h-4"></i>
                                <input id="meetUrl" type="text" class="elysian-input" placeholder="URL Meet">
                            </div>
                        </div>
                        <div class="elysian-input-group">
                            <i data-lucide="calendar" class="elysian-input-icon w-4 h-4"></i>
                            <input id="endDate" type="date" class="elysian-input">
                        </div>
                        <textarea id="projectDesc" class="elysian-input h-24 resize-none !p-4" placeholder="Notas estratégicas..."></textarea>
                        <div class="flex gap-4 pt-6">
                            <button onclick="window.app.closeModals()" class="flex-1 py-3 text-[10px] font-bold uppercase text-gray-600 hover:text-white transition-all">Cancelar</button>
                            <button onclick="window.app.createProject()" class="elysian-btn-primary flex-1">Crear Protocolo</button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="modalOperation" class="modal-overlay" style="display: none;">
                <div class="elysian-card max-w-3xl w-full h-[70vh] !p-0 flex flex-col overflow-hidden !bg-[#0c0c0c]">
                    <div class="p-8 border-b border-white/5 flex justify-between items-center">
                        <h2 id="del-modal-title" class="text-xl font-black uppercase tracking-tighter text-white">Item de Producción</h2>
                        <button onclick="window.app.closeModals()" class="text-gray-600 hover:text-white"><i data-lucide="x" class="w-6 h-6"></i></button>
                    </div>
                    <div class="flex-1 overflow-y-auto p-10 space-y-6">
                        <div class="grid grid-cols-2 gap-6">
                            <div class="elysian-input-group">
                                <i data-lucide="tag" class="elysian-input-icon w-4 h-4"></i>
                                <input id="del-title" type="text" class="elysian-input" placeholder="Título del Item">
                            </div>
                            <div class="elysian-input-group">
                                <i data-lucide="dollar-sign" class="elysian-input-icon w-4 h-4"></i>
                                <input id="del-price" type="number" class="elysian-input" placeholder="Precio">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-6">
                            <div class="elysian-input-group">
                                <i data-lucide="activity" class="elysian-input-icon w-4 h-4"></i>
                                <select id="del-status" class="elysian-input">
                                    <option value="pending">Pendiente de Cobro</option>
                                    <option value="paid">Liquidado</option>
                                </select>
                            </div>
                            <div class="elysian-input-group">
                                <i data-lucide="link" class="elysian-input-icon w-4 h-4"></i>
                                <input id="del-link-empresa" type="text" class="elysian-input" placeholder="URL de Entrega">
                            </div>
                        </div>
                        <div id="del-notes-editor" contenteditable="true" class="bg-black/40 border border-white/5 p-8 flex-1 text-white/80 text-sm leading-relaxed outline-none focus:border-white/20 transition-all rounded-2xl min-h-[200px]" placeholder="Notas de feedback..."></div>
                    </div>
                    <div class="p-8 border-t border-white/5 flex gap-6">
                        <button onclick="window.app.closeModals()" class="flex-1 py-4 text-[10px] font-bold uppercase text-gray-600 hover:text-white transition-all">Cerrar</button>
                        <button id="btn-save-op" onclick="window.app.saveDeliverable()" class="elysian-btn-primary flex-1">Sincronizar Datos</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const loader = document.querySelector('.loader');
    if (loader) loader.style.display = 'none';

    if (window.lucide) window.lucide.createIcons();
    window.scrollTo(0, 0);
}

function renderTabBar() { return ''; }

function renderExpenses() {
    const totalExpenses = state.expenses.reduce((acc, exp) => acc + parseFloat(exp.amount || 0), 0);

    return `
        <div class="animate-reveal space-y-8">
            <div class="view-header-pro">
                <div>
                    <h1 class="view-title">Almacén de Egresos</h1>
                    <p class="view-subtitle">Monitor de Compromisos Operativos</p>
                </div>
                <button class="elysian-btn-primary" onclick="window.app.navigate('expenseRegister')">
                    <i data-lucide="plus" class="w-4 h-4"></i>
                    <span>Nuevo Registro</span>
                </button>
            </div>

            <div class="grid grid-cols-4 gap-6">
                <div class="elysian-card">
                    <span class="info-label">Gasto Total Operativo</span>
                    <h2 class="mega-value text-white mt-4">${formatCurrency(totalExpenses)}</h2>
                </div>
                <div class="col-span-3 elysian-card flex items-center justify-between">
                    <div>
                        <span class="info-label">Siguiente Compromiso</span>
                        <p class="text-sm font-black mt-2">Mantenimiento de Servidores</p>
                    </div>
                    <div class="text-right">
                        <span class="text-[8px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Vence en</span>
                        <p class="text-xs font-black text-amber-500">48 HORAS</p>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-4">
                ${state.expenses.map(exp => `
                    <div class="elysian-card !p-6 cursor-pointer hover:border-white/20 transition-all group" onclick="window.app.navigate('expenseDetail', '${exp.id}')">
                        <div class="flex justify-between items-start mb-6">
                            <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-all">
                                <i data-lucide="database" class="w-5 h-5 text-gray-400"></i>
                            </div>
                            <span class="text-[9px] font-bold text-gray-600 uppercase tracking-[0.2em]">${exp.category || 'Operación'}</span>
                        </div>
                        <h3 class="text-sm font-black text-white mb-1 uppercase">${exp.debtor}</h3>
                        <p class="mega-value !text-lg text-white">${formatCurrency(exp.amount)}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderExpenseRegister() {
    return `
        <div class="animate-reveal p-6 pb-32 max-w-xl mx-auto">
            <header class="flex justify-between items-center mb-12">
                <div>
                    <h1 class="view-title">Nuevo Egreso</h1>
                    <p class="view-subtitle">Registro de Compromiso Operativo</p>
                </div>
                <button class="text-gray-600 hover:text-white" onclick="window.app.navigate('expenses')"><i data-lucide="x" class="w-6 h-6"></i></button>
            </header>

            <form id="expense-form" class="space-y-6" onsubmit="window.app.handleSaveExpense(event)">
                <div class="onyx-card space-y-5">
                    <input type="text" name="name" class="onyx-input" placeholder="Nombre del Servicio / Item" required>
                    <input type="number" name="amount" class="onyx-input" placeholder="Monto (Bs.)" required>
                    <select name="category" class="onyx-input" required>
                        <option value="internet">Suscripción / Internet</option>
                        <option value="banco">Pago Bancario / Crédito</option>
                        <option value="producto">Producto / Artículo</option>
                    </select>
                </div>
                <div class="onyx-card space-y-5">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                            <label class="text-[8px] uppercase text-gray-600 ml-1">Fecha Inicio</label>
                            <input type="date" name="payDate" class="onyx-input" required>
                        </div>
                        <div class="space-y-1">
                            <label class="text-[8px] uppercase text-gray-600 ml-1">Referencia ID</label>
                            <input type="text" name="refNumber" class="onyx-input" placeholder="Opcional">
                        </div>
                    </div>
                </div>
                <button type="submit" class="onyx-button w-full !py-4">Registrar Egreso</button>
            </form>
        </div>
    `;
}

function renderExpenseDetail() {
    const exp = state.expenses.find(e => e.id === state.selectedLoanId);
    if (!exp) return navigate('expenses');

    const totalPaidTimes = exp.installments ? exp.installments.filter(i => i.paid).length : 0;
    const monthsActive = calculateMonths(exp.payDate, new Date().toISOString());
    const daysUntilNext = calculateDaysUntil(exp.payDate);

    return `
        <div class="animate-reveal p-6 pb-32 max-w-4xl mx-auto">
            <header class="flex justify-between items-center mb-10">
                <button class="text-gray-500 hover:text-white transition-all flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest" onclick="window.app.navigate('expenses')">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Volver
                </button>
                <div class="flex gap-3">
                    <button class="onyx-button !bg-red-500/10 !text-red-500 !border-red-500/20" onclick="window.app.handleDeleteUniversal('${exp.id}', 'expenses')">Eliminar</button>
                    <button class="onyx-button" onclick="window.app.navigate('expenseEdit', '${exp.id}')">Editar</button>
                </div>
            </header>

            <section class="onyx-card !p-12 mb-10 text-center border-crimson-500/10">
                <p class="text-[9px] font-black text-gray-500 uppercase tracking-[0.4em] mb-4">Gasto Mensual Identificado</p>
                <h2 class="text-5xl font-black text-white tracking-tighter mb-8">${formatCurrency(exp.amount)}</h2>
                
                <div class="flex justify-center gap-12 pt-8 border-t border-white/[0.03]">
                    <div class="text-center">
                        <p class="text-[8px] font-bold text-gray-600 uppercase tracking-widest mb-1">Activo hace</p>
                        <p class="text-xl font-bold text-white">${monthsActive} Meses</p>
                    </div>
                    <div class="text-center">
                        <p class="text-[8px] font-bold text-gray-600 uppercase tracking-widest mb-1">Estatus</p>
                        <span class="${daysUntilNext <= 3 ? 'text-amber-500' : 'text-emerald-500'} font-black text-sm uppercase">Vence en ${daysUntilNext}d</span>
                    </div>
                </div>
            </section>

            <main class="space-y-4">
                <h2 class="text-[9px] font-black text-gray-500 uppercase tracking-widest px-2">Historial de Amortización</h2>
                <div class="grid gap-2">
                    ${generateHistoricalMonths(exp).map(m => `
                        <div class="onyx-card !p-5 flex justify-between items-center ${isMonthPaid(exp, m.id) ? 'opacity-30' : ''}">
                            <div class="flex items-center gap-6">
                                <p class="text-xs font-bold text-white uppercase">${m.name}</p>
                                <p class="text-[9px] text-gray-600 uppercase tracking-widest">Día ${m.day}</p>
                            </div>
                            <button onclick="window.app.handleToggleExpenseMonth('${exp.id}', '${m.id}')" class="onyx-button !py-2 !px-6 ${isMonthPaid(exp, m.id) ? '!bg-emerald-500/10 !text-emerald-500' : ''}">
                                ${isMonthPaid(exp, m.id) ? 'Liquidado' : 'Marcar Pago'}
                            </button>
                        </div>
                    `).join('')}
                </div>
            </main>
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
    const totalPrincipal = state.loans.reduce((acc, l) => acc + parseFloat(l.amount), 0);

    return `
        <div class="animate-reveal space-y-8">
            <div class="view-header-pro">
                <div>
                    <h1 class="view-title">Cartera de Clientes</h1>
                    <p class="view-subtitle">Protocolo de Gestión de Activos</p>
                </div>
                <div class="flex gap-4">
                    <div class="elysian-input-group !w-64">
                        <i data-lucide="search" class="elysian-input-icon w-4 h-4"></i>
                        <input type="text" class="elysian-input !p-2 !pl-10" placeholder="Buscar ID o Nombre...">
                    </div>
                    <button class="elysian-btn-primary" onclick="window.app.navigate('register')">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                        <span>Nuevo Cliente</span>
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-4 gap-6 mb-12">
                <div class="elysian-card col-span-2">
                    <span class="info-label">Capital Total en Protocolo</span>
                    <h2 class="mega-value text-white mt-4">${formatCurrency(totalPrincipal)}</h2>
                </div>
                <div class="elysian-card">
                    <span class="info-label">Contratos Activos</span>
                    <h2 class="mega-value text-white mt-4">${state.loans.length}</h2>
                </div>
                <div class="elysian-card">
                    <span class="info-label">Eficiencia Operativa</span>
                    <h2 class="mega-value text-emerald-500 mt-4">99.2%</h2>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                ${state.loans.map(loan => `
                    <div class="elysian-card !p-6 flex justify-between items-center cursor-pointer hover:border-white/20 transition-all group" onclick="window.app.navigate('details', '${loan.id}')">
                        <div class="flex items-center gap-6">
                            <div class="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-white/10 transition-all">
                                <span class="text-xs font-black text-white">${loan.debtor.substring(0,2).toUpperCase()}</span>
                            </div>
                            <div>
                                <h3 class="text-sm font-black text-white uppercase mb-1">${loan.debtor}</h3>
                                <p class="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Protocol_ID: ${loan.id.substring(0,8)}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-xs font-black text-white mb-1">${formatCurrency(loan.amount)}</p>
                            <span class="text-[8px] font-bold ${loan.status === 'Pagado' ? 'text-emerald-500' : 'text-amber-500'} uppercase tracking-widest">${loan.status}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
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
        <div class="animate-reveal p-6 pb-32 max-w-xl mx-auto">
            <header class="flex justify-between items-center mb-12">
                <div>
                    <h1 class="view-title">Nueva Deuda</h1>
                    <p class="view-subtitle">Registro de Cobranza Directa</p>
                </div>
                <button class="text-gray-600 hover:text-white" onclick="window.app.navigate('debts')"><i data-lucide="x" class="w-6 h-6"></i></button>
            </header>

            <form id="debt-form" class="space-y-6" onsubmit="window.app.handleSaveDebt(event)">
                <div class="onyx-card space-y-5">
                    <input type="text" name="person" class="onyx-input" placeholder="Nombre del Deudor" required>
                    <div class="grid grid-cols-2 gap-4">
                        <input type="number" name="amount" class="onyx-input" placeholder="Monto (Bs.)" required>
                        <input type="number" name="interestRate" class="onyx-input" placeholder="Interés % (Opcional)">
                    </div>
                    <textarea name="reason" class="onyx-input h-24 resize-none" placeholder="Motivo de la deuda..." required></textarea>
                </div>
                <div class="onyx-card space-y-5">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                            <label class="text-[8px] uppercase text-gray-600 ml-1">Fecha Inicio</label>
                            <input type="date" name="startDate" class="onyx-input" required>
                        </div>
                        <div class="space-y-1">
                            <label class="text-[8px] uppercase text-gray-600 ml-1">Plazo Límite</label>
                            <input type="date" name="endDate" class="onyx-input">
                        </div>
                    </div>
                </div>
                <button type="submit" class="onyx-button w-full !py-4">Registrar Deuda</button>
            </form>
        </div>
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


/** --- EDITOR PRO: ELITE PRODUCTION SUITE (ONYX RESERVE DNA) --- **/
const currencyMap = { 'USD': '$', 'BOB': 'Bs.', 'EUR': '€' };

async function renderSovereignNexus() {
    const activeTab = state.nexusTab || 'dashboard';
    
    if (state.nexusProjects === null) {
        try {
            const { data: projs, error } = await sb
                .from('nexus_projects')
                .select('*, nexus_deliverables(*)')
                .order('name', { ascending: true });
            
            if (error) throw error;
            state.nexusProjects = projs || [];
            setTimeout(() => render(), 10);
        } catch (e) {
            console.error("Error loading Nexus:", e);
            state.nexusProjects = [];
        }
        return `<div class="flex items-center justify-center h-64"><div class="animate-pulse text-white font-black tracking-[0.5em] text-[10px]">INICIALIZANDO NEXUS...</div></div>`;
    }

    let totalPaid = 0;
    let totalPending = 0;
    state.nexusProjects.forEach(p => {
        (p.nexus_deliverables || []).forEach(d => {
            if (d.status_paid === 'paid') totalPaid += Number(d.price || 0);
            else totalPending += Number(d.price || 0);
        });
    });

    const activeProject = state.nexusProjects.find(p => p.id === state.activeNexusProjectId);

    // --- HANDLERS ---
    window.app.switchNexusTab = (tab) => { state.nexusTab = tab; render(); };
    window.app.selectProject = (id) => { state.activeNexusProjectId = id; render(); };
    window.app.openModal = (id) => { 
        const m = document.getElementById(id);
        if(m) m.style.display = 'flex'; 
        if (window.lucide) window.lucide.createIcons();
    };
    window.app.closeModals = () => { document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); };

    // --- HTML RENDER ---
    return `
        <div class="animate-reveal space-y-10">
            <div class="view-header-pro">
                <div>
                    <h1 class="view-title">Editor Pro Nexus</h1>
                    <p class="view-subtitle">Suite de Producción de Elite</p>
                </div>
                <div class="tab-pill-container !bg-[#1a1a1a]">
                    <button onclick="window.app.switchNexusTab('dashboard')" class="tab-pill ${activeTab === 'dashboard' ? 'active' : ''}">Escritorio</button>
                    <button onclick="window.app.switchNexusTab('nexus')" class="tab-pill ${activeTab === 'nexus' ? 'active' : ''}">Proyectos</button>
                    <button onclick="window.app.switchNexusTab('finance')" class="tab-pill ${activeTab === 'finance' ? 'active' : ''}">Finanzas</button>
                </div>
            </div>

            <main>
                ${(() => {
                    if (activeTab === 'dashboard') {
                        return `
                        <div class="grid grid-cols-3 gap-6">
                            <div class="elysian-card">
                                <span class="info-label text-emerald-500">Liquidez Confirmada</span>
                                <h2 class="mega-value text-white mt-4">${formatCurrency(totalPaid)}</h2>
                            </div>
                            <div class="elysian-card">
                                <span class="info-label text-amber-500">Cartera Pendiente</span>
                                <h2 class="mega-value text-white mt-4">${formatCurrency(totalPending)}</h2>
                            </div>
                            <div class="elysian-card">
                                <span class="info-label">Proyectos en Curso</span>
                                <h2 class="mega-value text-white mt-4">${state.nexusProjects.length}</h2>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-6 mt-10">
                            <div class="elysian-card">
                                <h3 class="info-label mb-6">Próximas Entregas</h3>
                                <div class="space-y-4">
                                    ${state.nexusProjects.filter(p => p.delivery_date).slice(0,5).map(p => `
                                        <div class="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/5">
                                            <span class="text-xs font-black uppercase">${p.name}</span>
                                            <span class="text-[9px] font-bold text-gray-500">${formatDate(p.delivery_date)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <div class="elysian-card">
                                <h3 class="info-label mb-6">Estatus de Infraestructura</h3>
                                <div class="space-y-4">
                                    <div class="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/5">
                                        <span class="text-xs font-black uppercase">Servidor Nexus Cloud</span>
                                        <div class="flex items-center gap-2">
                                            <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_emerald]"></div>
                                            <span class="text-[8px] font-bold text-gray-500 uppercase">ONLINE</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                    }

                    if (activeTab === 'nexus') {
                        return `
                        <div class="grid grid-cols-12 gap-8">
                            <aside class="col-span-3 space-y-4">
                                <button onclick="window.app.openModal('modalProject')" class="elysian-btn-primary w-full !py-4">
                                    <i data-lucide="plus" class="w-4 h-4"></i>
                                    <span>Nuevo Proyecto</span>
                                </button>
                                <div class="space-y-2">
                                    ${state.nexusProjects.map(p => `
                                        <div onclick="window.app.selectProject('${p.id}')" 
                                            class="p-4 rounded-xl cursor-pointer border ${state.activeNexusProjectId === p.id ? 'bg-white/10 border-white/20' : 'bg-transparent border-transparent hover:bg-white/5'} transition-all">
                                            <p class="text-[10px] font-black uppercase tracking-wider ${state.activeNexusProjectId === p.id ? 'text-white' : 'text-gray-600'}">${p.name}</p>
                                        </div>
                                    `).join('')}
                                </div>
                            </aside>

                            <section class="col-span-9">
                                ${!activeProject ? `<div class="h-64 flex items-center justify-center elysian-card border-dashed"><p class="text-[10px] text-gray-700 uppercase tracking-[15px]">SELECCIONE PROTOCOLO...</p></div>` : `
                                    <div class="space-y-8">
                                        <div class="elysian-card flex justify-between items-end">
                                            <div>
                                                <p class="info-label text-amber-500 mb-2">Protocolo Activo</p>
                                                <h2 class="text-4xl font-black text-white uppercase tracking-tighter">${activeProject.name}</h2>
                                            </div>
                                            <div class="flex gap-3">
                                                <button onclick="window.open('${activeProject.drive_url}', '_blank')" class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
                                                    <i data-lucide="external-link" class="w-4 h-4 text-gray-500"></i>
                                                </button>
                                                <button onclick="window.app.openOperationModal()" class="elysian-btn-primary">
                                                    <i data-lucide="plus" class="w-4 h-4"></i>
                                                    <span>Añadir Operación</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div class="grid grid-cols-1 gap-4">
                                            ${(activeProject.nexus_deliverables || []).map(d => `
                                                <div class="elysian-card !p-6 flex justify-between items-center hover:border-white/20 transition-all cursor-pointer" onclick="window.app.openOperationModal('${d.id}')">
                                                    <div class="flex items-center gap-6">
                                                        <div class="w-1.5 h-1.5 rounded-full ${d.status_paid === 'paid' ? 'bg-emerald-500 shadow-[0_0_8px_emerald]' : 'bg-amber-500 animate-pulse'}"></div>
                                                        <div>
                                                            <h4 class="text-sm font-black text-white uppercase mb-1">${d.title}</h4>
                                                            <p class="text-[9px] text-gray-600 font-bold uppercase tracking-widest">${d.status_paid === 'paid' ? 'Liquidado' : 'Pendiente de Cobro'}</p>
                                                        </div>
                                                    </div>
                                                    <div class="text-right">
                                                        <p class="text-xs font-black text-white">${formatCurrency(d.price)}</p>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                `}
                            </section>
                        </div>`;
                    }

                    if (activeTab === 'finance') {
                        return `
                        <div class="space-y-8">
                            <div class="grid grid-cols-2 gap-6">
                                <div class="elysian-card">
                                    <span class="info-label text-emerald-500">Recaudación Ejecutada</span>
                                    <h2 class="mega-value text-white mt-4">${formatCurrency(totalPaid)}</h2>
                                </div>
                                <div class="elysian-card">
                                    <span class="info-label text-amber-500">Capital en Tránsito</span>
                                    <h2 class="mega-value text-white mt-4">${formatCurrency(totalPending)}</h2>
                                </div>
                            </div>
                            <div class="elysian-card">
                                <h3 class="info-label mb-8">Libro de Operaciones Nexus</h3>
                                <div class="space-y-4">
                                    ${state.nexusProjects.map(p => (p.nexus_deliverables || []).map(d => `
                                        <div class="flex justify-between items-center p-4 border-b border-white/5">
                                            <div>
                                                <p class="text-[10px] font-black text-white uppercase">${d.title}</p>
                                                <p class="text-[8px] text-gray-600 font-bold uppercase tracking-widest">${p.name}</p>
                                            </div>
                                            <p class="text-xs font-black ${d.status_paid === 'paid' ? 'text-emerald-500' : 'text-amber-500'}">${formatCurrency(d.price)}</p>
                                        </div>
                                    `).join('')).join('')}
                                </div>
                            </div>
                        </div>`;
                    }
                    return '';
                })()}
            </main>
        </div>
    `;
}

// --- ELYSIAN FUNCTIONAL HELPERS ---
function updateStatus(element, status) {
    const parent = element.closest('.status-picker');
    parent.querySelectorAll('.status-option').forEach(opt => opt.classList.remove('active'));
    element.classList.add('active');
    parent.nextElementSibling.value = status;
}

async function handlePhotoUpload(event) {
    const files = event.target.files;
    const preview = document.getElementById('photo-preview');
    if (!preview) return;

    for (let file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'relative group';
            div.innerHTML = `
                <img src="${e.target.result}" class="w-full h-20 object-cover rounded-lg border border-white/10">
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center rounded-lg cursor-pointer" onclick="this.parentElement.remove()">
                    <i data-lucide="trash-2" class="w-4 h-4 text-white"></i>
                </div>
            `;
            preview.appendChild(div);
            if (window.lucide) window.lucide.createIcons();
        };
        reader.readAsDataURL(file);
    }
}

function addReceiptItem() {
    const container = document.getElementById('items-container');
    const div = document.createElement('div');
    div.className = 'elysian-card !p-4 animate-reveal flex gap-4 items-center';
    div.innerHTML = `
        <div class="flex-1 space-y-3">
            <input type="text" name="itemBrand" class="elysian-input !p-3 !pl-10" placeholder="Servicio / Marca">
            <input type="text" name="itemDesc" class="elysian-input !p-3 !pl-10" placeholder="Descripción">
        </div>
        <div class="w-32 space-y-3">
            <input type="number" name="itemQty" class="elysian-input !p-3" placeholder="Cant." value="1">
            <input type="number" name="itemPrice" class="elysian-input !p-3" placeholder="Precio">
        </div>
        <button type="button" class="text-gray-600 hover:text-white" onclick="this.parentElement.remove()">
            <i data-lucide="trash-2" class="w-5 h-5"></i>
        </button>
    `;
    container.appendChild(div);
    if (window.lucide) window.lucide.createIcons();
}

async function handleSync() {
    const btn = event.currentTarget;
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i><span>Sincronizando...</span>';
    if (window.lucide) window.lucide.createIcons();
    
    try {
        await init(); // Recargar datos
        btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i><span>Sincronizado</span>';
        setTimeout(() => {
            btn.innerHTML = originalContent;
            if (window.lucide) window.lucide.createIcons();
        }, 2000);
    } catch (e) {
        btn.innerHTML = '<span>Error</span>';
        setTimeout(() => { btn.innerHTML = originalContent; }, 2000);
    }
}
