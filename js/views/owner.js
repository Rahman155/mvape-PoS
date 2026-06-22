import db from '../db.js';

// Menyimpan status tab aktif saat ini
let activeOwnerTab = 'finance'; 
let editingProductId = null;

// State untuk Shift Management
let shiftView = 'calendar';        // 'calendar' | 'employees' | 'attendance'
let shiftFilterMonth = new Date().toISOString().substring(0, 7);  // YYYY-MM
let shiftFilterStore = 'semua';
let editingShiftId = null;
let editingShiftData = null;


// State filter laporan keuangan
let financeFilterMode = 'bulan';   // 'hari' | 'bulan' | 'tahun'
let financeFilterDate  = new Date().toISOString().split('T')[0];          // YYYY-MM-DD
let financeFilterMonth = new Date().toISOString().substring(0, 7);        // YYYY-MM
let financeFilterYear  = String(new Date().getFullYear());                 // YYYY
let financeFilterStore = 'semua';  // 'semua' | nama toko
// Simpan data transaksi & pengeluaran terakhir agar bisa di-refresh tanpa re-fetch
let _financeCache = { transactions: [], expenses: [], transactionItems: [], products: [], receivables: [] };
// Mode grafik aktif (daily | monthly | yearly)
if (!window._salesChartMode) window._salesChartMode = 'daily';
let editingUserId = null;
let editingStoreId = null;

// ── Konfigurasi visibilitas tab (persisten via localStorage) ─────────────────
const ALL_OWNER_TABS = [
    { key: 'finance',   icon: '📊', label: 'Laporan'  },
    { key: 'inventory', icon: '📦', label: 'Stok'     },
    { key: 'opname',    icon: '📋', label: 'Opname'   },
    { key: 'products',  icon: '🛠️', label: 'Produk'   },
    { key: 'members',   icon: '👥', label: 'Member'   },
    { key: 'users',     icon: '🔑', label: 'Kasir'    },
    { key: 'shifts',    icon: '⏰', label: 'Shift'    },
    { key: 'receipt',   icon: '🧾', label: 'Struk'    },
    { key: 'stores',    icon: '🏪', label: 'Toko'     },
];
function loadTabVisibility() {
    try {
        const saved = JSON.parse(localStorage.getItem('ownerTabVisibility') || '{}');
        // Default: semua tab visible
        const result = {};
        ALL_OWNER_TABS.forEach(t => { result[t.key] = saved[t.key] !== false; });
        return result;
    } catch { return Object.fromEntries(ALL_OWNER_TABS.map(t => [t.key, true])); }
}
function saveTabVisibility(vis) {
    localStorage.setItem('ownerTabVisibility', JSON.stringify(vis));
}

async function render(container) {
    // Mengambil seluruh data dari IndexedDB
    const transactions = await db.transactions.toArray();
    const products = await db.products.toArray();
    const mutations = await db.stock_mutations ? await db.stock_mutations.toArray() : [];
    const transactionItems = await db.transactionItems ? await db.transactionItems.toArray() : [];
    
    // Fallback pengambilan stores yang aman 
    let allStores = [];
    if(db.stores) allStores = await db.stores.toArray();
    const activeStores = allStores.filter(s => s.isActive);
    
    // Mengambil data member jika database table members sudah didefinisikan
    let members = [];
    if (db.members) members = await db.members.toArray();

    // Mengambil data pengguna kasir (users) jika tabel sudah didefinisikan
    let users = [];
    if (db.users) users = await db.users.toArray();

    // Mengambil data piutang
    let receivables = [];
    if (db.receivables) receivables = await db.receivables.toArray();

    // Mengambil data setting struk & Pengeluaran
    let receiptConfig = { storeName: 'Vapestore', address: '', phone: '', footer: '' };
    let expenses = [];
    if (db.settings) {
        const configData = await db.settings.get('receipt_template');
        if (configData) receiptConfig = configData.value;
    }
    // Baca pengeluaran dari db.expenses (sinkron dengan kasir)
    if (db.expenses) expenses = await db.expenses.toArray();

    let opnameLogs = [];
    if (db.stockOpnames) opnameLogs = await db.stockOpnames.toArray();

    // Mengambil data shift & kehadiran
    let shifts = [];
    let attendances = [];
    let shiftSchedules = [];
    if (db.shifts) shifts = await db.shifts.toArray();
    if (db.attendances) attendances = await db.attendances.toArray();
    if (db.shiftSchedules) shiftSchedules = await db.shiftSchedules.toArray();

    // --- STRUKTUR LAYOUT UTAMA ---
    const tabVis = loadTabVisibility();

    // Pastikan activeOwnerTab tidak pointing ke tab yang hidden
    if (!tabVis[activeOwnerTab]) {
        activeOwnerTab = ALL_OWNER_TABS.find(t => tabVis[t.key])?.key || 'finance';
    }

    // Render tombol tab hanya yang visible
    const tabButtonsHTML = ALL_OWNER_TABS
        .filter(t => tabVis[t.key])
        .map(t => `
            <button onclick="window.switchOwnerTab('${t.key}')"
                class="flex-1 lg:flex-none px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition ${activeOwnerTab === t.key ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}">
                ${t.icon} ${t.label}
            </button>`
        ).join('');

    container.innerHTML = `
        <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b dark:border-gray-800 pb-4 mb-6 gap-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Panel Kendali Owner</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">Pantau laporan keuangan detail, penjualan, logistik, dan pengaturan toko.</p>
            </div>

            <div class="flex items-start gap-2 w-full lg:w-auto">
                <div class="flex flex-wrap bg-gray-200/80 dark:bg-gray-800/80 p-1 rounded-xl flex-1 lg:flex-none gap-1" id="owner-tab-bar">
                    ${tabButtonsHTML}
                </div>
                <!-- Tombol Atur Tampilan Tab -->
                <div class="relative shrink-0">
                    <button onclick="window.toggleTabSettingsPanel()" id="btn-tab-settings"
                        title="Atur tab yang ditampilkan"
                        class="p-2 rounded-xl bg-gray-200/80 dark:bg-gray-800/80 hover:bg-gray-300 dark:hover:bg-gray-700 transition text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                        </svg>
                    </button>
                    <!-- Panel Pengaturan Tab -->
                    <div id="tab-settings-panel"
                        class="hidden absolute right-0 top-full mt-2 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl p-4 w-56">
                        <p class="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Atur Tampilan Tab</p>
                        <div class="space-y-1">
                            ${ALL_OWNER_TABS.map(t => `
                            <label class="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition group">
                                <span class="text-sm text-gray-700 dark:text-gray-300 font-medium select-none">${t.icon} ${t.label}</span>
                                <div class="relative shrink-0">
                                    <input type="checkbox" class="sr-only peer" ${tabVis[t.key] ? 'checked' : ''}
                                        onchange="window.toggleOwnerTabVisibility('${t.key}', this.checked)">
                                    <div class="w-9 h-5 bg-gray-300 dark:bg-gray-600 peer-checked:bg-indigo-500 rounded-full transition-colors"></div>
                                    <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
                                </div>
                            </label>`).join('')}
                        </div>
                        <p class="text-[10px] text-gray-400 mt-3 leading-relaxed">Tab yang disembunyikan tidak akan hilang datanya.</p>
                    </div>
                </div>
            </div>
        </div>

        <div id="tab-content-container"></div>
        
        <!-- Modal Detail Transaksi -->
        <div id="detail-modal" class="fixed inset-0 bg-black/50 dark:bg-black/80 z-50 flex items-center justify-center p-4 hidden backdrop-blur-sm">
            <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl p-6 relative transform transition-all border border-transparent dark:border-gray-800">
                <div class="flex justify-between items-start border-b dark:border-gray-800 pb-3 mb-4">
                    <div>
                        <h3 class="text-lg font-bold text-gray-900 dark:text-white" id="modal-tx-id">Rincian Nota</h3>
                        <p class="text-xs text-gray-500 mt-0.5" id="modal-tx-time"></p>
                    </div>
                    <button onclick="window.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-bold text-xl p-1">&times;</button>
                </div>
                
                <div id="modal-member-row" class="bg-indigo-50 dark:bg-indigo-900/30 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-800/50 mb-4 text-xs flex justify-between items-center hidden">
                    <span class="text-indigo-800 dark:text-indigo-300 font-bold">👤 Member Belanja:</span>
                    <span id="modal-member-detail" class="text-indigo-900 dark:text-indigo-100 font-semibold"></span>
                </div>

                <div class="space-y-3 my-4 overflow-y-auto max-h-[35vh] pr-1" id="modal-items-container"></div>

                <div class="border-t dark:border-gray-800 pt-3 mt-4 space-y-1.5 text-sm">
                    <div class="flex justify-between text-gray-600 dark:text-gray-400">
                        <span>Metode Pembayaran:</span>
                        <span id="modal-tx-method" class="font-semibold text-gray-800 dark:text-gray-200"></span>
                    </div>
                    <div class="flex justify-between text-gray-600 dark:text-gray-400" id="modal-subtotal-row">
                        <span>Subtotal Belanja:</span>
                        <span id="modal-tx-subtotal" class="font-semibold text-gray-800 dark:text-gray-200"></span>
                    </div>
                    <div class="flex justify-between text-red-600 dark:text-red-400 hidden" id="modal-discount-row">
                        <span>Diskon Member:</span>
                        <span id="modal-tx-discount" class="font-bold"></span>
                    </div>
                    <div class="flex justify-between text-base font-bold text-gray-900 dark:text-white border-t dark:border-gray-800 pt-2 mt-2">
                        <span>Total Akhir:</span>
                        <span id="modal-tx-total" class="text-indigo-600 dark:text-indigo-400"></span>
                    </div>
                </div>

                <button onclick="window.closeModal()" class="w-full mt-5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold py-2.5 rounded-xl transition text-sm">
                    Tutup Rincian
                </button>
            </div>
        </div>
    `;
    
    // Render sub-konten tab aktif
    const tabContent = document.getElementById('tab-content-container');
    if (activeOwnerTab === 'finance') {
        _financeCache = { transactions, expenses, transactionItems, products, receivables, activeStores };
        renderFinanceTab(tabContent, products, transactions, transactionItems, expenses, receivables, activeStores);
    } else if (activeOwnerTab === 'inventory') {
        renderInventoryTab(tabContent, products, mutations, transactionItems, allStores, activeStores);
    } else if (activeOwnerTab === 'opname') {
        renderOpnameTab(tabContent, products, opnameLogs, allStores, activeStores);
    } else if (activeOwnerTab === 'products') {
        renderProductsTab(tabContent, products, allStores, activeStores);
    } else if (activeOwnerTab === 'members') {
        renderMembersTab(tabContent, members, transactions);
    } else if (activeOwnerTab === 'users') {
        renderUsersTab(tabContent, users, activeStores);
    } else if (activeOwnerTab === 'shifts') {
        renderShiftsTab(tabContent, users, shifts, attendances, shiftSchedules, activeStores);
    } else if (activeOwnerTab === 'receipt') {
        renderReceiptTab(tabContent, receiptConfig);
    } else if (activeOwnerTab === 'stores') {
        renderStoresTab(tabContent, allStores);
    }
}

// --- SUB TAB 1: LAPORAN KEUANGAN & ANALITIK LENGKAP ---
function renderFinanceTab(target, products, transactions, transactionItems, expenses, receivables = [], activeStores = []) {
    const todayStr = new Date().toISOString().split('T')[0];
    const monthStr = new Date().toISOString().substring(0, 7);

    // ── Tentukan rentang filter ──────────────────────────────────────────────
    function txInRange(tx) {
        const ts = (tx.timestamp || '').split('T')[0];
        if (financeFilterMode === 'hari')  return ts === financeFilterDate;
        if (financeFilterMode === 'bulan') return ts.substring(0, 7) === financeFilterMonth;
        if (financeFilterMode === 'tahun') return ts.substring(0, 4) === financeFilterYear;
        return true;
    }
    function expInRange(exp) {
        const d = (exp.date || '');
        if (financeFilterMode === 'hari')  return d === financeFilterDate;
        if (financeFilterMode === 'bulan') return d.substring(0, 7) === financeFilterMonth;
        if (financeFilterMode === 'tahun') return d.substring(0, 4) === financeFilterYear;
        return true;
    }

    const filteredTx  = transactions.filter(txInRange);
    const filteredExp = expenses.filter(expInRange);

    // ── Filter jurnal transaksi berdasarkan toko ─────────────────────────────
    const txForJurnal = financeFilterStore === 'semua'
        ? filteredTx
        : filteredTx.filter(tx => (tx.storeBranch || '') === financeFilterStore);
    const jurnalRev = txForJurnal.reduce((s, tx) => s + tx.total, 0);

    // ── Label periode aktif ──────────────────────────────────────────────────
    const BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    let periodLabel = '';
    if (financeFilterMode === 'hari')  periodLabel = new Date(financeFilterDate).toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});
    if (financeFilterMode === 'bulan') { const [y,m] = financeFilterMonth.split('-'); periodLabel = `${BULAN_ID[+m-1]} ${y}`; }
    if (financeFilterMode === 'tahun') periodLabel = `Tahun ${financeFilterYear}`;

    // ── Kalkulasi omset ──────────────────────────────────────────────────────
    let filteredRev = 0;
    const payMethods = {};
    filteredTx.forEach(tx => {
        filteredRev += tx.total;
        payMethods[tx.paymentMethod] = (payMethods[tx.paymentMethod] || 0) + tx.total;
    });

    // Juga hitung hari ini & bulan ini untuk kartu ringkasan
    let dailyRev = 0, dailyTxCount = 0, monthlyRev = 0, monthlyTxCount = 0;
    transactions.forEach(tx => {
        const ts = (tx.timestamp || '').split('T')[0];
        if (ts === todayStr) { dailyRev += tx.total; dailyTxCount++; }
        if (ts.substring(0,7) === monthStr) { monthlyRev += tx.total; monthlyTxCount++; }
    });

    // ── Kalkulasi pengeluaran ────────────────────────────────────────────────
    let filteredExpTotal = 0;
    let monthlyExp = 0;
    filteredExp.forEach(e => { filteredExpTotal += Number(e.amount) || 0; });
    expenses.forEach(e => { if ((e.date||'').substring(0,7) === monthStr) monthlyExp += Number(e.amount)||0; });
    const netIncome = filteredRev - filteredExpTotal;

    // ── Total pengeluaran per toko (dari filteredExp) ─────────────────────────
    const expPerStore = {};
    filteredExp.forEach(e => {
        const branch = e.storeBranch || 'Tidak Diketahui';
        expPerStore[branch] = (expPerStore[branch] || 0) + (Number(e.amount) || 0);
    });

    // ── Top produk (berdasarkan filter) ──────────────────────────────────────
    const filteredTxIds = new Set(filteredTx.map(t => t.id));
    const prodRevData = {};
    transactionItems.forEach(item => {
        if (!filteredTxIds.has(item.transactionId)) return;
        if (!prodRevData[item.productId]) prodRevData[item.productId] = { name: 'Unknown', revenue: 0, qty: 0 };
        prodRevData[item.productId].revenue += item.subtotal;
        prodRevData[item.productId].qty     += item.quantity;
    });
    products.forEach(p => { if (prodRevData[p.id]) prodRevData[p.id].name = p.name; });
    const topProducts = Object.values(prodRevData).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    // ── Piutang (selalu total, tidak difilter) ───────────────────────────────
    const totalPiutangBelumBayar = receivables.filter(r => !r.isPaid).reduce((s,r) => s + (Number(r.amount)||0), 0);
    const totalPiutangSudahBayar = receivables.filter(r =>  r.isPaid).reduce((s,r) => s + (Number(r.amount)||0), 0);
    const jumlahBelumBayar = receivables.filter(r => !r.isPaid).length;
    const jumlahSudahBayar = receivables.filter(r =>  r.isPaid).length;

    // ── Omset & piutang per toko ─────────────────────────────────────────────
    // Kumpulkan semua nama toko dari transaksi + activeStores
    const storeNames = [...new Set([
        ...activeStores.map(s => s.name),
        ...transactions.map(t => t.storeBranch).filter(Boolean),
    ])].sort();

    const perStore = {};
    storeNames.forEach(name => {
        perStore[name] = {
            dailyRev:    0, dailyTxCount:  0,
            periodRev:   0, periodTxCount: 0,
            totalRev:    0, totalTxCount:  0,
            piutangBelum: 0, piutangLunas:  0,
        };
    });

    transactions.forEach(tx => {
        const branch = tx.storeBranch || storeNames[0] || 'Toko 1';
        if (!perStore[branch]) perStore[branch] = { dailyRev:0,dailyTxCount:0,periodRev:0,periodTxCount:0,totalRev:0,totalTxCount:0,piutangBelum:0,piutangLunas:0 };
        const d = perStore[branch];
        const ts = (tx.timestamp||'').split('T')[0];
        d.totalRev   += tx.total; d.totalTxCount++;
        if (ts === todayStr)  { d.dailyRev  += tx.total; d.dailyTxCount++;  }
        if (txInRange(tx))    { d.periodRev += tx.total; d.periodTxCount++; }
    });

    receivables.forEach(r => {
        const branch = r.storeBranch || storeNames[0] || 'Toko 1';
        if (!perStore[branch]) perStore[branch] = { dailyRev:0,dailyTxCount:0,periodRev:0,periodTxCount:0,totalRev:0,totalTxCount:0,piutangBelum:0,piutangLunas:0 };
        if (r.isPaid) perStore[branch].piutangLunas  += Number(r.amount)||0;
        else          perStore[branch].piutangBelum  += Number(r.amount)||0;
    });

    const totalAllStoresRev = Object.values(perStore).reduce((s, d) => s + d.totalRev, 0);

    // ── Data grafik ──────────────────────────────────────────────────────────
    // Grafik per-hari dalam bulan
    function buildDailyData() {
        const [y, m] = financeFilterMonth.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const labels = Array.from({length: daysInMonth}, (_, i) => `${i+1}`);
        const data   = Array(daysInMonth).fill(0);
        transactions.forEach(tx => {
            const ts = tx.timestamp || '';
            if (ts.substring(0,7) !== financeFilterMonth) return;
            const day = parseInt(ts.split('T')[0].split('-')[2]) - 1;
            data[day] += tx.total;
        });
        return { labels, data };
    }
    // Grafik per-bulan dalam tahun
    function buildMonthlyData() {
        const y = financeFilterYear;
        const labels = BULAN_ID;
        const data   = Array(12).fill(0);
        transactions.forEach(tx => {
            const ts = tx.timestamp || '';
            if (ts.substring(0,4) !== y) return;
            const mo = parseInt(ts.substring(5,7)) - 1;
            data[mo] += tx.total;
        });
        return { labels, data };
    }
    // Grafik per-tahun (semua data)
    function buildYearlyData() {
        const yearMap = {};
        transactions.forEach(tx => {
            const y = (tx.timestamp||'').substring(0,4);
            if (!y) return;
            yearMap[y] = (yearMap[y]||0) + tx.total;
        });
        const labels = Object.keys(yearMap).sort();
        const data   = labels.map(l => yearMap[l]);
        return { labels, data };
    }

    const chartDaily   = buildDailyData();
    const chartMonthly = buildMonthlyData();
    const chartYearly  = buildYearlyData();

    // ── Tahun-tahun yang tersedia untuk opsi filter ──────────────────────────
    const availYears = [...new Set(transactions.map(t => (t.timestamp||'').substring(0,4)).filter(Boolean))].sort().reverse();
    if (!availYears.includes(financeFilterYear)) availYears.unshift(financeFilterYear);

    target.innerHTML = `
        <!-- ═══ PANEL FILTER PERIODE ═══ -->
        <div class="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-2xl p-4 mb-6 shadow-sm">
            <div class="flex flex-wrap items-end gap-3">
                <div>
                    <span class="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Tampilkan Per</span>
                    <div class="flex rounded-xl overflow-hidden border dark:border-gray-700 text-xs font-bold">
                        <button onclick="window.setFinanceFilter('hari')"  class="px-3 py-2 transition ${financeFilterMode==='hari'  ? 'bg-indigo-600 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}">Hari</button>
                        <button onclick="window.setFinanceFilter('bulan')" class="px-3 py-2 border-x dark:border-gray-700 transition ${financeFilterMode==='bulan' ? 'bg-indigo-600 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}">Bulan</button>
                        <button onclick="window.setFinanceFilter('tahun')" class="px-3 py-2 transition ${financeFilterMode==='tahun' ? 'bg-indigo-600 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}">Tahun</button>
                    </div>
                </div>
                ${financeFilterMode === 'hari' ? `
                <div>
                    <span class="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Pilih Tanggal</span>
                    <input type="date" value="${financeFilterDate}" onchange="window.setFinanceFilterDate(this.value)"
                        class="p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/30">
                </div>` : ''}
                ${financeFilterMode === 'bulan' ? `
                <div>
                    <span class="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Pilih Bulan</span>
                    <input type="month" value="${financeFilterMonth}" onchange="window.setFinanceFilterMonth(this.value)"
                        class="p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/30">
                </div>` : ''}
                ${financeFilterMode === 'tahun' ? `
                <div>
                    <span class="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Pilih Tahun</span>
                    <select onchange="window.setFinanceFilterYear(this.value)"
                        class="p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/30">
                        ${availYears.map(y => `<option value="${y}" ${y===financeFilterYear?'selected':''}>${y}</option>`).join('')}
                    </select>
                </div>` : ''}
                <div class="ml-auto text-right">
                    <span class="block text-[10px] text-gray-400 uppercase font-bold mb-1">Periode Aktif</span>
                    <span class="text-sm font-black text-indigo-600 dark:text-indigo-400">${periodLabel}</span>
                </div>
            </div>
        </div>

        <!-- ══════════════════════════════════════════════════════
             BLOK 1 · RINGKASAN KEUANGAN UTAMA
        ══════════════════════════════════════════════════════ -->

        <!-- Banner Total Semua Toko -->
        <div class="relative overflow-hidden bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-700 rounded-2xl p-6 mb-4 shadow-xl text-white">
            <div class="absolute inset-0 opacity-10" style="background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2210%22 cy=%2210%22 r=%2280%22 fill=%22white%22 opacity=%220.1%22/></svg>') center/cover"></div>
            <div class="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <p class="text-[11px] font-bold uppercase tracking-widest opacity-70 mb-1.5">💰 Total Pendapatan Seluruh Toko (Semua Waktu)</p>
                    <p class="text-4xl font-black tracking-tight leading-none">Rp ${totalAllStoresRev.toLocaleString('id-ID')}</p>
                    <div class="flex items-center gap-3 mt-2 text-xs opacity-80">
                        <span>${transactions.length} total transaksi</span>
                        <span class="w-1 h-1 rounded-full bg-white/60 inline-block"></span>
                        <span>${storeNames.length} toko aktif</span>
                    </div>
                </div>
                <div class="flex gap-2 flex-wrap shrink-0">
                    ${storeNames.map(name => {
                        const d = perStore[name];
                        return `<div class="bg-white/20 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2.5 text-center min-w-[100px]">
                            <p class="text-[10px] font-bold opacity-75 truncate mb-0.5">${name}</p>
                            <p class="text-base font-black">Rp ${d.totalRev >= 1e6 ? (d.totalRev/1e6).toFixed(1)+'jt' : d.totalRev >= 1e3 ? (d.totalRev/1e3).toFixed(0)+'rb' : d.totalRev}</p>
                            <p class="text-[10px] opacity-60">${d.totalTxCount} transaksi</p>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>

        <!-- 4 Kartu KPI + 2 Kartu Piutang dalam 6 kolom -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div class="col-span-2 sm:col-span-1 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 shadow-sm">
                <p class="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1">Omset Periode</p>
                <p class="text-lg font-black text-gray-900 dark:text-white leading-tight">Rp ${filteredRev.toLocaleString('id-ID')}</p>
                <p class="text-[10px] text-gray-400 mt-1">${filteredTx.length} transaksi · ${periodLabel}</p>
            </div>
            <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 shadow-sm">
                <p class="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Omset Hari Ini</p>
                <p class="text-lg font-black text-gray-900 dark:text-white leading-tight">Rp ${dailyRev.toLocaleString('id-ID')}</p>
                <p class="text-[10px] text-gray-400 mt-1">${dailyTxCount} transaksi</p>
            </div>
            <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 shadow-sm">
                <p class="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">Pengeluaran</p>
                <p class="text-lg font-black text-gray-900 dark:text-white leading-tight">Rp ${filteredExpTotal.toLocaleString('id-ID')}</p>
                <p class="text-[10px] text-gray-400 mt-1">${filteredExp.length} pos</p>
            </div>
            <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 shadow-sm">
                <p class="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">Laba Kotor</p>
                <p class="text-lg font-black ${netIncome >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'} leading-tight">Rp ${netIncome.toLocaleString('id-ID')}</p>
                <p class="text-[10px] text-gray-400 mt-1">Omset − Pengeluaran</p>
            </div>
            <div class="bg-white dark:bg-gray-900 border border-red-100 dark:border-red-900/40 rounded-xl p-4 shadow-sm">
                <p class="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1">Piutang Belum</p>
                <p class="text-lg font-black text-red-600 dark:text-red-400 leading-tight">Rp ${totalPiutangBelumBayar.toLocaleString('id-ID')}</p>
                <p class="text-[10px] text-gray-400 mt-1">${jumlahBelumBayar} tagihan aktif</p>
            </div>
            <div class="bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-900/40 rounded-xl p-4 shadow-sm">
                <p class="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Piutang Lunas</p>
                <p class="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-tight">Rp ${totalPiutangSudahBayar.toLocaleString('id-ID')}</p>
                <p class="text-[10px] text-gray-400 mt-1">${jumlahSudahBayar} tagihan lunas</p>
            </div>
        </div>

        <!-- ══════════════════════════════════════════════════════
             BLOK 2 · RINGKASAN PER TOKO
        ══════════════════════════════════════════════════════ -->
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm mb-6 overflow-hidden">
            <div class="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-800 flex items-center gap-2">
                <span class="text-sm">🏪</span>
                <h3 class="text-sm font-bold text-gray-800 dark:text-white">Ringkasan Per Toko</h3>
                <span class="ml-auto text-[11px] font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">${periodLabel}</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-xs">
                    <thead>
                        <tr class="border-b dark:border-gray-800">
                            <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Toko</th>
                            <th class="p-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Omset Hari Ini</th>
                            <th class="p-3 text-right text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Omset ${periodLabel}</th>
                            <th class="p-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Pendapatan</th>
                            <th class="p-3 text-right text-[10px] font-bold text-red-400 uppercase tracking-wider">Piutang Belum</th>
                            <th class="p-3 text-right text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Piutang Lunas</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y dark:divide-gray-800">
                        ${storeNames.map((name, idx) => {
                            const d = perStore[name];
                            const colors = ['indigo','violet','teal','amber','rose'];
                            const c = colors[idx % colors.length];
                            return `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                <td class="p-3">
                                    <div class="flex items-center gap-2">
                                        <span class="w-2 h-2 rounded-full bg-${c}-500 shrink-0"></span>
                                        <span class="font-bold text-gray-800 dark:text-gray-200">${name}</span>
                                        <span class="text-[10px] text-gray-400">${d.totalTxCount} tx</span>
                                    </div>
                                </td>
                                <td class="p-3 text-right font-semibold text-gray-700 dark:text-gray-300">Rp ${d.dailyRev.toLocaleString('id-ID')}</td>
                                <td class="p-3 text-right font-bold text-indigo-600 dark:text-indigo-400">Rp ${d.periodRev.toLocaleString('id-ID')}</td>
                                <td class="p-3 text-right font-extrabold text-gray-900 dark:text-white">Rp ${d.totalRev.toLocaleString('id-ID')}</td>
                                <td class="p-3 text-right font-semibold text-red-600 dark:text-red-400">Rp ${d.piutangBelum.toLocaleString('id-ID')}</td>
                                <td class="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">Rp ${d.piutangLunas.toLocaleString('id-ID')}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="bg-gray-50 dark:bg-gray-800/60 border-t-2 dark:border-gray-700 font-bold text-xs text-gray-700 dark:text-gray-300">
                            <td class="p-3">Total</td>
                            <td class="p-3 text-right">&mdash;</td>
                            <td class="p-3 text-right text-indigo-600 dark:text-indigo-400">Rp ${filteredRev.toLocaleString('id-ID')}</td>
                            <td class="p-3 text-right text-gray-900 dark:text-white font-extrabold">Rp ${totalAllStoresRev.toLocaleString('id-ID')}</td>
                            <td class="p-3 text-right text-red-600 dark:text-red-400">Rp ${totalPiutangBelumBayar.toLocaleString('id-ID')}</td>
                            <td class="p-3 text-right text-emerald-600 dark:text-emerald-400">Rp ${totalPiutangSudahBayar.toLocaleString('id-ID')}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>

        <!-- ══════════════════════════════════════════════════════
             BLOK 3 · PENGELUARAN PER TOKO
        ══════════════════════════════════════════════════════ -->
        ${Object.keys(expPerStore).length > 0 ? `
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm mb-6 overflow-hidden">
            <div class="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-800 flex items-center gap-2">
                <span class="text-sm">💸</span>
                <h3 class="text-sm font-bold text-gray-800 dark:text-white">Pengeluaran Per Toko</h3>
                <span class="ml-auto text-[11px] font-semibold text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-full">${periodLabel}</span>
                <span class="text-xs font-black text-rose-700 dark:text-rose-400 ml-2">Total: Rp ${filteredExpTotal.toLocaleString('id-ID')}</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-xs">
                    <thead>
                        <tr class="border-b dark:border-gray-800">
                            <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Toko</th>
                            <th class="p-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Pengeluaran</th>
                            <th class="p-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Jumlah Pos</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y dark:divide-gray-800">
                        ${Object.entries(expPerStore).sort((a,b) => b[1]-a[1]).map(([branch, total]) => `
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                            <td class="p-3 font-bold text-gray-800 dark:text-gray-200">${branch}</td>
                            <td class="p-3 text-right font-extrabold text-rose-600 dark:text-rose-400">-Rp ${total.toLocaleString('id-ID')}</td>
                            <td class="p-3 text-right text-gray-500 dark:text-gray-400">${filteredExp.filter(e => (e.storeBranch || 'Tidak Diketahui') === branch).length} pos</td>
                        </tr>`).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="bg-gray-50 dark:bg-gray-800/60 border-t-2 dark:border-gray-700 font-bold text-gray-700 dark:text-gray-300">
                            <td class="p-3">Total</td>
                            <td class="p-3 text-right font-extrabold text-rose-700 dark:text-rose-400">-Rp ${filteredExpTotal.toLocaleString('id-ID')}</td>
                            <td class="p-3 text-right text-gray-500">${filteredExp.length} pos</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>` : ''}

        <!-- ══════════════════════════════════════════════════════
             BLOK 4 · GRAFIK PENJUALAN
        ══════════════════════════════════════════════════════ -->
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm mb-6 overflow-hidden">
            <div class="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-800 flex flex-wrap items-center gap-3">
                <div class="flex items-center gap-2">
                    <span class="text-sm">📈</span>
                    <h3 class="text-sm font-bold text-gray-800 dark:text-white">Grafik Penjualan</h3>
                    <span class="text-[11px] text-gray-400">Visualisasi omset berdasarkan periode</span>
                </div>
                <div class="ml-auto flex rounded-lg overflow-hidden border dark:border-gray-700 text-xs font-bold" id="chart-mode-btns">
                    <button onclick="window.switchSalesChart('daily')"   id="chart-btn-daily"   class="px-3 py-1.5 transition bg-indigo-600 text-white">Per Hari</button>
                    <button onclick="window.switchSalesChart('monthly')" id="chart-btn-monthly" class="px-3 py-1.5 border-x dark:border-gray-700 transition bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100">Per Bulan</button>
                    <button onclick="window.switchSalesChart('yearly')"  id="chart-btn-yearly"  class="px-3 py-1.5 transition bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100">Per Tahun</button>
                </div>
            </div>
            <div class="p-5">
                <div class="relative" style="height:240px">
                    <canvas id="sales-chart-canvas"></canvas>
                </div>
            </div>
        </div>

        <!-- ══════════════════════════════════════════════════════
             BLOK 5 · TOP PRODUK & METODE PEMBAYARAN
        ══════════════════════════════════════════════════════ -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <!-- Top Produk -->
            <div class="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div class="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-800 flex items-center gap-2">
                    <span class="text-sm">🏆</span>
                    <h3 class="text-sm font-bold text-gray-800 dark:text-white">Top Produk</h3>
                    <span class="ml-auto text-[11px] font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">${periodLabel}</span>
                </div>
                <div class="overflow-x-auto max-h-[280px] overflow-y-auto">
                    <table class="w-full text-xs">
                        <thead class="sticky top-0 bg-white dark:bg-gray-900">
                            <tr class="border-b dark:border-gray-800">
                                <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">#</th>
                                <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nama Produk</th>
                                <th class="p-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Terjual</th>
                                <th class="p-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pendapatan</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-gray-800">
                            ${topProducts.length === 0
                                ? '<tr><td colspan="4" class="p-6 text-center text-gray-400 italic">Belum ada data penjualan.</td></tr>'
                                : topProducts.map((p, i) => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                    <td class="p-3 text-gray-400 font-bold">${i+1}</td>
                                    <td class="p-3 font-semibold text-gray-800 dark:text-gray-200">${p.name}</td>
                                    <td class="p-3 text-center text-indigo-600 dark:text-indigo-400 font-bold">${p.qty} pcs</td>
                                    <td class="p-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400">Rp ${p.revenue.toLocaleString('id-ID')}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Metode Pembayaran -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div class="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-800 flex items-center gap-2">
                    <span class="text-sm">💳</span>
                    <h3 class="text-sm font-bold text-gray-800 dark:text-white">Metode Pembayaran</h3>
                </div>
                <div class="divide-y dark:divide-gray-800">
                    ${Object.keys(payMethods).length === 0
                        ? '<p class="p-5 text-xs text-gray-400 italic text-center">Belum ada transaksi.</p>'
                        : Object.entries(payMethods).map(([method, amount]) => `
                        <div class="flex justify-between items-center px-5 py-3.5">
                            <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">${method}</span>
                            <span class="text-sm font-extrabold text-teal-600 dark:text-teal-400">Rp ${amount.toLocaleString('id-ID')}</span>
                        </div>`).join('')}
                    ${Object.keys(payMethods).length > 0 ? `
                    <div class="flex justify-between items-center px-5 py-3.5 bg-teal-50 dark:bg-teal-900/20">
                        <span class="text-xs font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wider">Total</span>
                        <span class="text-base font-black text-teal-700 dark:text-teal-300">Rp ${filteredRev.toLocaleString('id-ID')}</span>
                    </div>` : ''}
                </div>
            </div>
        </div>

        <!-- ══════════════════════════════════════════════════════
             BLOK 6 · CATAT & RIWAYAT PENGELUARAN
        ══════════════════════════════════════════════════════ -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
            <!-- Form Input — 2/5 kolom -->
            <div class="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div class="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-800 flex items-center gap-2">
                    <span class="text-sm">💸</span>
                    <h3 class="text-sm font-bold text-gray-800 dark:text-white">Catat Pengeluaran</h3>
                </div>
                <form id="expense-form" onsubmit="window.saveExpense(event)" class="p-5 space-y-3">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tanggal</label>
                            <input type="date" id="exp-date" required value="${todayStr}" class="w-full p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-xs dark:text-white">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Dari Toko</label>
                            <select id="exp-store" class="w-full p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-xs dark:text-white">
                                ${activeStores.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Deskripsi</label>
                        <input type="text" id="exp-name" required placeholder="Cth: Bayar Listrik" class="w-full p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-xs dark:text-white">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Kategori</label>
                            <select id="exp-category" class="w-full p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-xs dark:text-white">
                                <option value="Gaji Karyawan">Gaji Karyawan</option>
                                <option value="Sewa Tempat">Sewa Tempat</option>
                                <option value="Utilitas">Utilitas</option>
                                <option value="Supplies">Supplies</option>
                                <option value="Marketing">Marketing</option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Lainnya" selected>Lainnya</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nominal (Rp)</label>
                            <input type="number" id="exp-amount" required min="1" placeholder="0" class="w-full p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-xs dark:text-white">
                        </div>
                    </div>
                    <button type="submit" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-lg transition text-xs shadow">+ Simpan Pengeluaran</button>
                </form>
            </div>

            <!-- Tabel Riwayat — 3/5 kolom -->
            <div class="lg:col-span-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div class="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-800 flex items-center gap-2">
                    <span class="text-sm">📜</span>
                    <h3 class="text-sm font-bold text-gray-800 dark:text-white">Riwayat Pengeluaran</h3>
                    <span class="ml-auto text-[11px] font-semibold text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-full">${periodLabel}</span>
                </div>
                <div class="overflow-x-auto max-h-[320px] overflow-y-auto">
                    <table class="w-full text-xs">
                        <thead class="sticky top-0 bg-white dark:bg-gray-900">
                            <tr class="border-b dark:border-gray-800">
                                <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Tanggal</th>
                                <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Deskripsi</th>
                                <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Kategori</th>
                                <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Toko</th>
                                <th class="p-3 text-right text-[10px] font-bold text-gray-400 uppercase">Nominal</th>
                                <th class="p-3 text-center text-[10px] font-bold text-gray-400 uppercase">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-gray-800">
                            ${filteredExp.length === 0
                                ? '<tr><td colspan="6" class="p-6 text-center text-gray-400 italic">Belum ada pengeluaran pada periode ini.</td></tr>'
                                : [...filteredExp].sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(exp => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                    <td class="p-3 whitespace-nowrap text-gray-600 dark:text-gray-400">${exp.date}</td>
                                    <td class="p-3 font-semibold text-gray-800 dark:text-gray-200 max-w-[140px] truncate" title="${exp.description || exp.name || ''}">${exp.description || exp.name || '-'}</td>
                                    <td class="p-3"><span class="px-1.5 py-0.5 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded text-[10px] font-semibold">${exp.category || '-'}</span></td>
                                    <td class="p-3"><span class="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-semibold">${exp.storeBranch || '-'}</span></td>
                                    <td class="p-3 text-right font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">-Rp ${Number(exp.amount).toLocaleString('id-ID')}</td>
                                    <td class="p-3 text-center">
                                        <button onclick="window.deleteExpense('${exp.id}')" class="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 px-2 py-1 rounded text-[10px] font-bold">Hapus</button>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                        ${filteredExp.length > 0 ? `
                        <tfoot>
                            <tr class="bg-gray-50 dark:bg-gray-800/60 border-t-2 dark:border-gray-700">
                                <td colspan="4" class="p-3 text-xs font-bold text-gray-600 dark:text-gray-400">Total ${filteredExp.length} pos</td>
                                <td class="p-3 text-right font-extrabold text-rose-700 dark:text-rose-400">-Rp ${filteredExpTotal.toLocaleString('id-ID')}</td>
                                <td></td>
                            </tr>
                        </tfoot>` : ''}
                    </table>
                </div>
            </div>
        </div>

        <!-- ══════════════════════════════════════════════════════
             BLOK 7 · JURNAL TRANSAKSI
        ══════════════════════════════════════════════════════ -->
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div class="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-800 flex flex-wrap items-center gap-3">
                <div class="flex items-center gap-2">
                    <span class="text-sm">📖</span>
                    <h3 class="text-sm font-bold text-gray-800 dark:text-white">Jurnal Transaksi Pendapatan</h3>
                    <span class="text-[11px] font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">${periodLabel}</span>
                </div>
                <div class="ml-auto flex items-center gap-3">
                    <span class="text-xs text-gray-500 dark:text-gray-400">${txForJurnal.length} transaksi · <span class="font-bold text-emerald-600 dark:text-emerald-400">Rp ${jurnalRev.toLocaleString('id-ID')}</span></span>
                    <button onclick="window.exportTransactions()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition flex items-center gap-1">
                        📊 Export
                    </button>
                </div>
            </div>
            <!-- Filter Toko -->
            <div class="px-5 py-2.5 border-b dark:border-gray-800 flex flex-wrap items-center gap-2 bg-white dark:bg-gray-900">
                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Filter Toko:</span>
                <div class="flex flex-wrap gap-1.5">
                    <button onclick="window.setJurnalStoreFilter('semua')"
                        class="px-3 py-1 rounded-full text-[11px] font-bold transition ${financeFilterStore === 'semua' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}">
                        Semua Toko
                        <span class="ml-1 opacity-70">(${filteredTx.length})</span>
                    </button>
                    ${storeNames.map(name => `
                        <button onclick="window.setJurnalStoreFilter('${name.replace(/'/g, "\\'")}')"
                            class="px-3 py-1 rounded-full text-[11px] font-bold transition ${financeFilterStore === name ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}">
                            ${name}
                            <span class="ml-1 opacity-70">(${filteredTx.filter(tx => (tx.storeBranch || '') === name).length})</span>
                        </button>`).join('')}
                </div>
            </div>
            <div class="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table class="w-full text-xs">
                    <thead class="sticky top-0 bg-white dark:bg-gray-900">
                        <tr class="border-b dark:border-gray-800">
                            <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Waktu</th>
                            <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">No. Referensi</th>
                            <th class="p-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Metode</th>
                            <th class="p-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cabang</th>
                            <th class="p-3 text-right text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Arus Masuk</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y dark:divide-gray-800">
                        ${txForJurnal.length === 0
                            ? `<tr><td colspan="5" class="p-8 text-center text-gray-400 italic">Belum ada transaksi${financeFilterStore !== 'semua' ? ` untuk ${financeFilterStore}` : ''} pada periode ini.</td></tr>`
                            : [...txForJurnal].reverse().map(tx => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition cursor-pointer" onclick="window.showTransactionDetail('${tx.id}')">
                                <td class="p-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">${new Date(tx.timestamp).toLocaleString('id-ID')}</td>
                                <td class="p-3 font-bold text-gray-800 dark:text-gray-200 font-mono">${tx.id}</td>
                                <td class="p-3 text-center"><span class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded font-semibold">${tx.paymentMethod}</span></td>
                                <td class="p-3 text-center"><span class="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded font-semibold">${tx.storeBranch || 'Toko 1'}</span></td>
                                <td class="p-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400">+Rp ${tx.total.toLocaleString('id-ID')}</td>
                            </tr>`).join('')}
                    </tbody>
                    ${txForJurnal.length > 0 ? `
                    <tfoot>
                        <tr class="bg-emerald-50 dark:bg-emerald-900/20 border-t-2 dark:border-gray-700">
                            <td colspan="4" class="p-3 text-xs font-bold text-gray-600 dark:text-gray-400">
                                Total ${txForJurnal.length} transaksi
                                ${financeFilterStore !== 'semua' ? `<span class="ml-1 text-indigo-600 dark:text-indigo-400">· ${financeFilterStore}</span>` : ''}
                            </td>
                            <td class="p-3 text-right font-extrabold text-emerald-700 dark:text-emerald-400">+Rp ${jurnalRev.toLocaleString('id-ID')}</td>
                        </tr>
                    </tfoot>` : ''}
                </table>
            </div>
        </div>
    `;

    // ── Init Chart.js ────────────────────────────────────────────────────────
    const _chartDatasets = {
        daily:   chartDaily,
        monthly: chartMonthly,
        yearly:  chartYearly,
    };
    (function initSalesChart() {
        // Muat Chart.js sekali dari CDN jika belum ada
        function doInit() {
            const canvas = document.getElementById('sales-chart-canvas');
            if (!canvas) return;
            if (window._salesChartInstance) { window._salesChartInstance.destroy(); window._salesChartInstance = null; }
            const isDark = document.documentElement.classList.contains('dark');
            const gridColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
            const labelColor = isDark ? '#9ca3af' : '#6b7280';
            const mode = window._salesChartMode || 'daily';
            const chartData = _chartDatasets[mode];
            window._salesChartInstance = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Omset (Rp)',
                        data: chartData.data,
                        backgroundColor: 'rgba(99,102,241,0.75)',
                        borderColor:     'rgba(99,102,241,1)',
                        borderWidth: 1.5,
                        borderRadius: 5,
                        hoverBackgroundColor: 'rgba(99,102,241,1)',
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => ' Rp ' + ctx.parsed.y.toLocaleString('id-ID')
                            }
                        }
                    },
                    scales: {
                        x: { grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 11 } } },
                        y: { grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 11 },
                               callback: v => 'Rp ' + (v >= 1e6 ? (v/1e6).toFixed(1)+'jt' : v >= 1e3 ? (v/1e3).toFixed(0)+'rb' : v)
                             } }
                    }
                }
            });
            // Update button styles
            ['daily','monthly','yearly'].forEach(m => {
                const btn = document.getElementById('chart-btn-' + m);
                if (!btn) return;
                btn.className = 'px-3 py-1.5 transition ' + (m === mode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700');
                if (m === 'monthly') btn.className += ' border-x dark:border-gray-700';
            });
        }
        if (window.Chart) { doInit(); }
        else {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            s.onload = doInit;
            document.head.appendChild(s);
        }
    })();

    // Simpan data chart ke window untuk diakses tombol toggle
    window._salesChartDatasets = _chartDatasets;
}

// ── HANDLER GRAFIK TOGGLE MODE ───────────────────────────────────────────────
window.switchSalesChart = function(mode) {
    window._salesChartMode = mode;
    const canvas = document.getElementById('sales-chart-canvas');
    if (!canvas || !window._salesChartInstance) return;
    const chartData = window._salesChartDatasets[mode];
    if (!chartData) return;
    window._salesChartInstance.data.labels   = chartData.labels;
    window._salesChartInstance.data.datasets[0].data = chartData.data;
    window._salesChartInstance.update();
    ['daily','monthly','yearly'].forEach(m => {
        const btn = document.getElementById('chart-btn-' + m);
        if (!btn) return;
        btn.className = 'px-3 py-1.5 transition ' + (m === mode
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700');
        if (m === 'monthly') btn.className += ' border-x dark:border-gray-700';
    });
};

// ── HANDLER FILTER PERIODE ────────────────────────────────────────────────────
window.setFinanceFilter = function(mode) {
    financeFilterMode = mode;
    _reRenderFinance();
};
window.setFinanceFilterDate = function(val) {
    financeFilterDate = val;
    _reRenderFinance();
};
window.setFinanceFilterMonth = function(val) {
    financeFilterMonth = val;
    _reRenderFinance();
};
window.setFinanceFilterYear = function(val) {
    financeFilterYear = val;
    _reRenderFinance();
};
window.setJurnalStoreFilter = function(store) {
    financeFilterStore = store;
    _reRenderFinance();
};
function _reRenderFinance() {
    const tabContent = document.getElementById('tab-content-container');
    if (!tabContent) return;
    const { transactions, expenses, transactionItems, products, receivables, activeStores } = _financeCache;
    renderFinanceTab(tabContent, products, transactions, transactionItems, expenses, receivables, activeStores);
}

// --- SUB TAB 2: INVENTORY DINAMIS ---
function renderInventoryTab(target, products, mutations, txItems, allStores, activeStores) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white dark:bg-gray-900 p-6 rounded-xl shadow lg:col-span-3 border-l-4 border-indigo-500">
                <h3 class="text-lg font-bold mb-1 dark:text-white">🔄 Transfer Stok Antar Cabang</h3>
                <p class="text-xs text-gray-400 mb-4">Pindahkan distribusi stok barang antar cabang toko yang terdaftar.</p>
                <form id="form-transfer" onsubmit="window.processTransfer(event)" class="space-y-4 md:flex md:space-y-0 md:gap-4 items-end">
                    <div class="flex-1">
                        <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Pilih Produk</label>
                        <div class="relative">
                            <input type="hidden" id="t-product-id">
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                                </div>
                                <input type="text" id="t-product-search" autocomplete="off" placeholder="Ketik nama produk..."
                                    class="w-full pl-8 pr-3 p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none">
                            </div>
                            <div id="t-product-dropdown" class="hidden absolute z-30 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-52 overflow-y-auto p-1"></div>
                        </div>
                    </div>
                    <div class="w-full md:w-40">
                        <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Dari</label>
                        <select id="t-from" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-sm dark:text-white">
                            ${activeStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="w-full md:w-40">
                        <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Ke Tujuan</label>
                        <select id="t-to" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-sm dark:text-white">
                            ${activeStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="w-full md:w-28">
                        <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Kuantitas</label>
                        <input type="number" id="t-qty" required min="1" placeholder="Qty" class="w-full p-2.5 border dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm dark:text-white">
                    </div>
                    <button type="submit" class="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 px-6 text-white text-sm font-bold py-2.5 rounded-lg transition shadow">Kirim Stok</button>
                </form>
            </div>
            
            <div class="bg-white dark:bg-gray-900 p-6 rounded-xl shadow lg:col-span-2">
                <h3 class="text-lg font-bold mb-4 dark:text-white">Ringkasan Sisa Stok Multi-Cabang</h3>
                <div class="overflow-x-auto max-h-[50vh] overflow-y-auto">
                    <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                        <thead class="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 uppercase text-xs sticky top-0 z-10">
                            <tr>
                                <th class="p-3">Nama Produk</th>
                                ${activeStores.map(s => `<th class="p-3 text-center font-semibold">${s.name}</th>`).join('')}
                                <th class="p-3 text-center">Total Akumulasi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            ${products.map(p => {
                                let totalCalculated = 0;
                                const colsHTML = activeStores.map(s => {
                                    const numMatch = s.id.match(/\d+/);
                                    const storeNum = numMatch ? numMatch[0] : "1";
                                    const key = `stockToko${storeNum}`;
                                    const qty = p[key] || 0;
                                    totalCalculated += qty;
                                    return `<td class="p-3 text-center font-bold text-indigo-600 dark:text-indigo-400">${qty} pcs</td>`;
                                }).join('');

                                return `
                                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td class="p-3 font-bold text-gray-800 dark:text-gray-200">${p.name}</td>
                                        ${colsHTML}
                                        <td class="p-3 text-center font-bold ${totalCalculated <= 5 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-300'}">${totalCalculated} pcs</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="bg-white dark:bg-gray-900 p-6 rounded-xl shadow h-fit">
                <h3 class="text-lg font-bold mb-1 dark:text-white">Logistik Manual</h3>
                <p class="text-[11px] text-gray-400 mb-4">Gunakan untuk barang masuk (kulakan) ke cabang tertentu.</p>
                <form id="form-mutation" class="space-y-4" onsubmit="window.processManualMutation(event)">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400">Pilih Produk</label>
                        <div class="relative mt-1">
                            <input type="hidden" id="m-product-id">
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                                </div>
                                <input type="text" id="m-product-search" autocomplete="off" placeholder="Ketik nama produk..."
                                    class="w-full pl-8 pr-3 p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none">
                            </div>
                            <div id="m-product-dropdown" class="hidden absolute z-30 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-52 overflow-y-auto p-1"></div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400">Jenis</label>
                            <select id="m-type" required class="w-full p-2 border dark:border-gray-700 rounded mt-1 text-sm bg-gray-50 dark:bg-gray-800 dark:text-white">
                                <option value="MASUK">MASUK</option>
                                <option value="KELUAR">KELUAR</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400">Cabang</label>
                            <select id="m-branch" required class="w-full p-2 border dark:border-gray-700 rounded mt-1 text-sm bg-gray-50 dark:bg-gray-800 dark:text-white">
                                ${activeStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400">Kuantitas & Catatan</label>
                        <div class="flex gap-2 mt-1">
                            <input type="number" id="m-qty" required min="1" placeholder="Qty" class="w-24 p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded text-sm dark:text-white">
                            <input type="text" id="m-note" required placeholder="Catatan..." class="flex-1 p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded text-sm dark:text-white">
                        </div>
                    </div>
                    <button type="submit" class="w-full bg-gray-900 dark:bg-gray-700 text-white text-sm font-bold py-2.5 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition">Simpan Mutasi</button>
                </form>
            </div>
        </div>
    `;
    window._initProductSearchboxes(products, activeStores);
}

// --- SUB TAB 3: PRODUK DINAMIS ---
function renderProductsTab(target, products, allStores, activeStores) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white dark:bg-gray-900 p-6 rounded-xl shadow h-fit">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4" id="form-title">
                    ${editingProductId ? '📝 Edit Produk Vape' : '➕ Tambah Produk Vape Baru'}
                </h3>
                <form id="product-form" onsubmit="window.saveProduct(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Nama Produk</label>
                        <input type="text" id="p-name" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Kategori</label>
                        <select id="p-category" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white">
                            <option value="Liquid">Liquid</option>
                            <option value="Device">Device (Mod/Pod)</option>
                            <option value="Atomizer">Atomizer (RDA/RTA)</option>
                            <option value="Accessories">Accessories</option>
                        </select>
                    </div>
                    
                    <div class="border-t dark:border-gray-800 pt-3 mt-2">
                        <label class="block text-xs font-bold text-indigo-500 uppercase mb-2">Input Alokasi Stok Cabang Toko</label>
                        <div class="grid grid-cols-2 gap-3" id="dynamic-product-stocks">
                            ${activeStores.map(s => {
                                const storeNum = s.id.match(/\d+/)[0];
                                const key = `stockToko${storeNum}`;
                                return `
                                    <div>
                                        <label class="block text-[11px] text-gray-400 font-semibold mb-1">${s.name}</label>
                                        <input type="number" id="p-stock-toko${storeNum}" placeholder="0" min="0" class="w-full p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg text-xs text-gray-800 dark:text-white p-input-store-stock" data-store-key="${key}">
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Harga Beli</label>
                            <input type="number" id="p-purchase-price" required min="0" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Harga Jual</label>
                            <input type="number" id="p-price" required min="0" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white">
                        </div>
                    </div>
                    <div class="flex gap-2 pt-2">
                        <button type="submit" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition text-sm shadow">
                            ${editingProductId ? 'Simpan Perubahan' : 'Tambah Ke Toko'}
                        </button>
                        ${editingProductId ? `<button type="button" onclick="window.cancelEdit()" class="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold px-4 py-2.5 rounded-xl">Batal</button>` : ''}
                    </div>
                </form>
            </div>

            <div class="lg:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-xl shadow">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">📦 Data Master Ketersediaan Barang</h3>
                    <div class="flex flex-wrap gap-2">
                        <button onclick="window.downloadImportTemplate()" class="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-bold py-1.5 px-3 rounded-lg text-xs transition">
                            📥 Template Excel
                        </button>
                        <label class="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-bold py-1.5 px-3 rounded-lg text-xs transition cursor-pointer">
                            📤 Import Produk
                            <input type="file" id="import-product-file" accept=".xlsx,.xls,.csv" class="hidden" onchange="window.importProductsFromFile(this)">
                        </label>
                        <button onclick="window.exportProducts()" class="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 font-bold py-1.5 px-3 rounded-lg text-xs transition">
                            📊 Export Produk
                        </button>
                        <button onclick="window.printStockChecklist()" class="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800 font-bold py-1.5 px-3 rounded-lg text-xs transition">
                            🖨️ Cetak Cek Fisik
                        </button>
                    </div>
                </div>
                <!-- Search Bar -->
                <div class="relative mb-3">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    </div>
                    <input type="text" id="product-search-input" placeholder="Cari nama produk atau kategori..."
                        oninput="window.filterProductTable(this.value)"
                        class="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition">
                    <button onclick="window.clearProductSearch()" id="product-search-clear"
                        class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hidden">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                <div id="import-result-banner" class="hidden mb-3"></div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400" id="product-master-table">
                        <thead class="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 uppercase text-xs z-10 sticky top-0">
                            <tr>
                                <th class="p-3">Produk</th>
                                <th class="p-3">Kategori</th>
                                <th class="p-3 text-center">Stok (Semua Toko)</th>
                                <th class="p-3 text-right">Harga Jual</th>
                                <th class="p-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            ${products.map(p => {
                                const stockDetailsHTML = activeStores.map(s => {
                                    const sNum = s.id.match(/\d+/)[0];
                                    const sKey = `stockToko${sNum}`;
                                    const qty = p[sKey] || 0;
                                    return `<span class="font-bold text-indigo-600 dark:text-indigo-400 text-[10px] mx-0.5">T${sNum}:${qty}</span>`;
                                }).join(' | ');

                                return `
                                <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition" data-name="${(p.name||'').toLowerCase()}" data-category="${(p.category||'').toLowerCase()}">
                                    <td class="p-3 font-bold text-gray-900 dark:text-gray-100">${p.name}</td>
                                    <td class="p-3"><span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-xs">${p.category}</span></td>
                                    <td class="p-3 text-center text-xs">
                                        <div class="flex justify-center items-center flex-wrap gap-1">${stockDetailsHTML}</div>
                                        <span class="text-[10px] text-gray-400 dark:text-gray-500 mt-1 block">Total: ${p.stock || 0}</span>
                                    </td>
                                    <td class="p-3 text-right font-bold text-gray-900 dark:text-gray-100">Rp ${p.price.toLocaleString('id-ID')}</td>
                                    <td class="p-3 text-center space-x-1">
                                        <button onclick="window.editProduct('${p.id}')" class="text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded text-xs font-bold">Edit</button>
                                        <button onclick="window.deleteProduct('${p.id}')" class="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 px-2 py-1 rounded text-xs font-bold">Hapus</button>
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                        <tfoot id="product-no-result" class="hidden">
                            <tr><td colspan="5" class="p-8 text-center text-gray-400 italic text-sm">Tidak ada produk yang cocok dengan pencarian.</td></tr>
                        </tfoot>
                    </table>
                    <p id="product-result-count" class="text-[11px] text-gray-400 text-right mt-2 pr-1">${products.length} produk</p>
                </div>
            </div>
        </div>
    `;
}

// --- SUB TAB 4: OPNAME DINAMIS ---
function renderOpnameTab(target, products, opnameLogs, allStores, activeStores) {
    target.innerHTML = `
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div class="bg-white dark:bg-gray-900 p-6 rounded-xl shadow h-fit">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-1">📋 Input Hasil Opname Fisik</h3>
                <p class="text-xs text-gray-400 mb-4">Sinkronisasikan stok riil di lemari toko dengan sistem digital.</p>
                <form id="opname-form" onsubmit="window.processStockOpname(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Lokasi Cabang Toko</label>
                        <select id="o-store-id" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white" onchange="window.updateOpnameSystemStockView()">
                            ${activeStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Pilih Produk</label>
                        <div class="relative">
                            <input type="hidden" id="o-product-id">
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                                </div>
                                <input type="text" id="o-product-search" autocomplete="off" placeholder="Ketik nama produk..."
                                    class="w-full pl-8 pr-3 p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none">
                            </div>
                            <div id="o-product-dropdown" class="hidden absolute z-30 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-52 overflow-y-auto p-1"></div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border dark:border-gray-800">
                        <div>
                            <span class="block text-[11px] text-gray-400 font-bold uppercase">Stok Sistem</span>
                            <span id="o-system-view" class="text-lg font-black text-gray-700 dark:text-gray-300">-</span>
                        </div>
                        <div>
                            <span class="block text-[11px] text-gray-400 font-bold uppercase">Selisih Fisik</span>
                            <span id="o-diff-view" class="text-lg font-black text-gray-500">-</span>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Jumlah Riil Fisik di Toko</label>
                        <input type="number" id="o-actual-stock" required min="0" placeholder="0" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white" oninput="window.calculateOpnameDiff()">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Alasan Penyesuaian / Keterangan</label>
                        <input type="text" id="o-reason" required placeholder="Contoh: Barang bocor / bonus distributor / salah hitung" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white">
                    </div>
                    <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-sm shadow">Simpan & Sinkronkan Stok</button>
                </form>
            </div>
            
            <div class="xl:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-xl shadow">
                <div class="flex justify-between items-center mb-1">
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">📜 Berita Acara / Log Riwayat Opname</h3>
                    <button onclick="window.exportOpname()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition shadow flex items-center gap-1">
                        📊 Export Excel
                    </button>
                </div>
                <div class="overflow-x-auto max-h-[50vh] overflow-y-auto pr-1">
                    <table class="w-full text-left text-xs text-gray-500 dark:text-gray-400">
                        <thead class="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 uppercase tracking-wider sticky top-0 bg-white dark:bg-gray-800">
                            <tr>
                                <th class="p-2.5">Waktu Audit</th>
                                <th class="p-2.5">Nama Produk</th>
                                <th class="p-2.5">Lokasi</th>
                                <th class="p-2.5 text-center">Sistem ➔ Fisik</th>
                                <th class="p-2.5 text-center">Selisih</th>
                                <th class="p-2.5 pl-4">Keterangan</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800 font-sans">
                            ${opnameLogs.length === 0 ? `
                                <tr><td colspan="6" class="p-12 text-center text-gray-400 italic">Belum ada record data penyesuaian opname barang.</td></tr>
                            ` : [...opnameLogs].reverse().map(log => {
                                const isMinus = log.difference < 0;
                                const diffText = log.difference > 0 ? `+${log.difference}` : log.difference;
                                return `
                                    <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition">
                                        <td class="p-2.5 text-gray-400 font-mono text-[11px]">${new Date(log.timestamp).toLocaleDateString('id-ID')}</td>
                                        <td class="p-2.5 font-bold text-gray-800 dark:text-gray-200">${log.productName || (products.find(p => p.id === log.productId)?.name) || 'Unknown'}</td>
                                        <td class="p-2.5 text-indigo-600 dark:text-indigo-400 font-semibold text-[11px]">${log.storeBranch || 'Toko 1'}</td>
                                        <td class="p-2.5 text-center font-mono text-gray-500 dark:text-gray-400">${log.systemStock} ➔ <span class="font-bold text-gray-700 dark:text-gray-300">${log.actualStock}</span></td>
                                        <td class="p-2.5 text-center">
                                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isMinus ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400' : (log.difference === 0 ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400')}">
                                                ${diffText}
                                            </span>
                                        </td>
                                        <td class="p-2.5 pl-4 text-gray-500 dark:text-gray-400 text-[11px] italic max-w-[150px] truncate" title="${log.reason}">${log.reason}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    window._initProductSearchboxes(products, activeStores);
}

// --- SUB TAB 5: MEMBER ---
function renderMembersTab(target, members, transactions) {
    target.innerHTML = `
        <div class="bg-white dark:bg-gray-900 p-6 rounded-xl shadow space-y-6">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b dark:border-gray-800 pb-4">
                <div>
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">👥 Master Data Member Toko</h3>
                    <p class="text-xs text-gray-400">Kelola dan lihat daftar loyalitas pelanggan serta perolehan poin belanja mereka.</p>
                </div>
                <div class="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded-xl px-4 py-2 border border-indigo-100 dark:border-indigo-800/50 text-right w-full sm:w-auto">
                    <span class="block text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-wider">Total Member Terdaftar</span>
                    <span class="text-lg font-black">${members.length} Orang</span>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                    <thead class="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 uppercase text-xs tracking-wider">
                        <tr>
                            <th class="p-3">ID Member</th>
                            <th class="p-3">Nama Member</th>
                            <th class="p-3">Nomor Telepon</th>
                            <th class="p-3 text-center">Frekuensi Transaksi</th>
                            <th class="p-3 text-right">Total Akumulasi Belanja</th>
                            <th class="p-3 text-right">Poin Tersedia</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        ${members.length === 0 ? `
                            <tr><td colspan="6" class="p-12 text-center text-gray-400 italic">Belum ada member.</td></tr>
                        ` : members.map(m => {
                            const memberTxs = transactions.filter(tx => tx.memberId === m.id);
                            const totalSpends = memberTxs.reduce((sum, tx) => sum + tx.total, 0);
                            return `
                                <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition text-sm">
                                    <td class="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">${m.id}</td>
                                    <td class="p-3 font-bold text-gray-900 dark:text-gray-200">${m.name}</td>
                                    <td class="p-3 font-mono text-gray-600 dark:text-gray-400">${m.phone}</td>
                                    <td class="p-3 text-center font-bold text-gray-700 dark:text-gray-300">${memberTxs.length} kali</td>
                                    <td class="p-3 text-right font-bold text-gray-950 dark:text-gray-100 font-mono">Rp ${totalSpends.toLocaleString('id-ID')}</td>
                                    <td class="p-3 text-right">
                                        <span class="inline-block bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50 font-mono font-bold px-3 py-1 rounded-lg">
                                            🌟 ${m.points || 0} Pts
                                        </span>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- SUB TAB 6: USERS/KASIR DINAMIS ---
function renderUsersTab(target, users, activeStores) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white dark:bg-gray-900 p-6 rounded-xl shadow h-fit">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4" id="user-form-title">
                    ${editingUserId ? '📝 Edit Akun Kasir' : '➕ Tambah Akun Kasir Baru'}
                </h3>
                <form id="user-form" onsubmit="window.saveUser(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Nama Lengkap Kasir</label>
                        <input type="text" id="u-name" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Username Login</label>
                        <input type="text" id="u-username" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Kata Sandi (Password)</label>
                        <input type="password" id="u-password" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Lokasi Penugasan Cabang</label>
                        <select id="u-branch" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white">
                            ${activeStores.map(s => `
                                <option value="${s.name}">${s.name}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Status Keaktifan</label>
                        <select id="u-status" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white">
                            <option value="Aktif">🟢 Aktif (Bisa Login)</option>
                            <option value="Nonaktif">🔴 Nonaktif</option>
                        </select>
                    </div>
                    <div class="flex gap-2 pt-2">
                        <button type="submit" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition text-sm">
                            ${editingUserId ? 'Simpan Perubahan' : 'Daftarkan Kasir'}
                        </button>
                        ${editingUserId ? `<button type="button" onclick="window.cancelUserEdit()" class="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold px-4 py-2.5 rounded-xl text-sm">Batal</button>` : ''}
                    </div>
                </form>
            </div>
            <div class="lg:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-xl shadow">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">🔑 Manajemen Akun Kasir Vapestore</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                        <thead class="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 uppercase text-xs tracking-wider">
                            <tr>
                                <th class="p-3">Nama (Username)</th>
                                <th class="p-3 text-center">Cabang Bertugas</th>
                                <th class="p-3 text-center">Status</th>
                                <th class="p-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            ${users.map(u => `
                                <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition">
                                    <td class="p-3">
                                        <p class="font-bold text-gray-900 dark:text-gray-100">${u.name}</p>
                                        <p class="font-mono text-xs text-gray-400 dark:text-gray-500">@${u.username}</p>
                                    </td>
                                    <td class="p-3 text-center">
                                        <span class="px-2.5 py-1 rounded text-[11px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                                            ${u.storeBranch || 'Toko 1'}
                                        </span>
                                    </td>
                                    <td class="p-3 text-center">
                                        <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${u.status === 'Aktif' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'}">${u.status}</span>
                                    </td>
                                    <td class="p-3 text-center space-x-1">
                                        <button onclick="window.editUser('${u.id}')" class="text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded text-xs font-bold">Edit</button>
                                        <button onclick="window.deleteUser('${u.id}')" class="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 px-2 py-1 rounded text-xs font-bold">Hapus</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// --- SUB TAB 7: SETTING STRUK ---
function renderReceiptTab(target, config) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white dark:bg-gray-900 p-6 rounded-xl shadow h-fit">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-1">🧾 Kustomisasi Template Struk</h3>
                <p class="text-xs text-gray-400 mb-4">Ubah teks header dan footer nota cetak yang dikeluarkan oleh mesin kasir.</p>
                
                <form id="receipt-form" onsubmit="window.saveReceiptSettings(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Nama Toko / Bisnis</label>
                        <input type="text" id="r-store-name" value="${config.storeName || ''}" required oninput="window.updateReceiptPreview()" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Alamat Outlet</label>
                        <input type="text" id="r-address" value="${config.address || ''}" placeholder="Contoh: Ruko Sentra No. 15" oninput="window.updateReceiptPreview()" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Nomor Kontak / Telepon</label>
                        <input type="text" id="r-phone" value="${config.phone || ''}" placeholder="Contoh: 021-xxxxxx" oninput="window.updateReceiptPreview()" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Pesan Kaki (Footer Struk)</label>
                        <textarea id="r-footer" rows="3" oninput="window.updateReceiptPreview()" placeholder="Terima kasih atas kunjungan Anda..." class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-indigo-500/20 font-sans">${config.footer || ''}</textarea>
                    </div>
                    
                    <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition text-sm shadow">
                        💾 Simpan Template Nota
                    </button>
                </form>
            </div>

            <div class="flex flex-col items-center justify-start bg-gray-100 dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <span class="text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">Pratinjau Live Nota Fisik (Termal 58mm)</span>
                
                <div class="bg-[#fffffa] shadow-inner border border-gray-300/70 p-4 w-full max-w-[280px] font-mono text-[11px] text-gray-800 leading-relaxed shadow-lg rounded-sm relative">
                    <div class="absolute -top-1 left-0 right-0 h-1 bg-gradient-to-b from-gray-200 to-transparent"></div>
                    
                    <div class="text-center space-y-0.5 border-b border-dashed pb-2 mb-2">
                        <h4 id="preview-store-name" class="font-black text-sm uppercase text-gray-950 tracking-tight">VAPESTORE</h4>
                        <p id="preview-address" class="text-[10px] text-gray-600">Alamat Toko</p>
                        <p id="preview-phone" class="text-[10px] text-gray-600">Telp: -</p>
                    </div>

                    <div class="space-y-0.5 text-[10px] text-gray-600 mb-2">
                        <p>Nota : TX-SAMPLE-99</p>
                        <p>Tgl  : ${new Date().toLocaleString('id-ID')}</p>
                        <p>Kasir: Administrator (Toko 1)</p>
                    </div>

                    <div class="border-b border-dashed py-2 my-2 space-y-1.5">
                        <div>
                            <p class="font-bold text-gray-900">Hexohm V3 Anodized</p>
                            <div class="flex justify-between text-gray-600">
                                <span>1 pcs x Rp 1.750.000</span>
                                <span>Rp 1.750.000</span>
                            </div>
                        </div>
                        <div>
                            <p class="font-bold text-gray-900">Oat Drip V1 60ml</p>
                            <div class="flex justify-between text-gray-600">
                                <span>2 pcs x Rp 140.000</span>
                                <span>Rp 280.000</span>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-1 text-right text-xs">
                        <div class="flex justify-between">
                            <span>Subtotal:</span>
                            <span>Rp 2.030.000</span>
                        </div>
                        <div class="flex justify-between text-red-600 font-medium">
                            <span>Diskon Member:</span>
                            <span>-Rp 30.000</span>
                        </div>
                        <div class="flex justify-between font-black text-gray-950 border-t border-dotted pt-1 mt-1 text-sm">
                            <span>TOTAL:</span>
                            <span>Rp 2.000.000</span>
                        </div>
                    </div>

                    <div class="text-center pt-4 mt-4 border-t border-dashed text-[10px] text-gray-600 whitespace-pre-line" id="preview-footer">
                        Terima kasih!
                    </div>
                </div>
            </div>
        </div>
    `;
    setTimeout(() => window.updateReceiptPreview(), 50);
}

// --- SUB TAB 8: KELOLA CABANG TOKO ---
async function renderStoresTab(target, stores) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Form -->
            <div class="bg-white dark:bg-gray-900 p-6 rounded-xl shadow h-fit">
                <h3 class="text-lg font-bold mb-4">${editingStoreId ? 'Edit Toko' : 'Tambah Toko Baru'}</h3>
                <form id="store-form" onsubmit="window.saveStore(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Nama Toko / Cabang</label>
                        <input type="text" id="s-name" required placeholder="Contoh: Toko 3 - Bandung" 
                               class="w-full p-3 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Alamat</label>
                        <input type="text" id="s-address" placeholder="Alamat lengkap cabang" 
                               class="w-full p-3 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Nomor Telepon / WhatsApp</label>
                        <input type="text" id="s-phone" placeholder="0812-XXXX-XXXX" 
                               class="w-full p-3 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Status</label>
                        <select id="s-status" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-sm dark:text-white">
                            <option value="true">✅ Aktif</option>
                            <option value="false">⛔ Nonaktif</option>
                        </select>
                    </div>

                    <div class="flex gap-3 pt-4">
                        <button type="submit" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-sm">
                            ${editingStoreId ? 'Simpan Perubahan' : 'Tambahkan Toko'}
                        </button>
                        ${editingStoreId ? `
                            <button type="button" onclick="window.cancelStoreEdit()" 
                                    class="px-6 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm">
                                Batal
                            </button>
                        ` : ''}
                    </div>
                </form>
            </div>

            <!-- Daftar Toko -->
            <div class="lg:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-xl shadow">
                <h3 class="text-lg font-bold mb-4">Daftar Cabang</h3>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr class="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                                <th class="p-3 text-left">ID</th>
                                <th class="p-3 text-left">Nama Toko</th>
                                <th class="p-3 text-left">Alamat</th>
                                <th class="p-3 text-center">Status</th>
                                <th class="p-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            ${stores.map(s => `
                                <tr>
                                    <td class="p-3 font-mono text-purple-600 dark:text-purple-400 font-bold">${s.id}</td>
                                    <td class="p-3 font-bold dark:text-white">${s.name}</td>
                                    <td class="p-3 text-gray-600 dark:text-gray-400 text-sm">${s.address || '-'}</td>
                                    <td class="p-3 text-center">
                                        <span class="${s.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} px-3 py-1 rounded-full text-xs font-bold">
                                            ${s.isActive ? 'Aktif' : 'Nonaktif'}
                                        </span>
                                    </td>
                                    <td class="p-3 text-center space-x-3">
                                        <button onclick="window.editStore('${s.id}')" class="text-blue-600 hover:underline text-sm font-semibold">Edit</button>
                                        ${s.id !== 'toko1' && s.id !== 'toko2' ? 
                                            `<button onclick="window.deleteStore('${s.id}')" class="text-red-600 hover:underline text-sm font-semibold">Hapus</button>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// --- GLOBAL EVENT HANDLERS ---

window.switchOwnerTab = function(tabName) {
    activeOwnerTab = tabName;
    render(document.getElementById('app-container'));
};

// ── HANDLER VISIBILITAS TAB ───────────────────────────────────────────────────
window.toggleTabSettingsPanel = function() {
    const panel = document.getElementById('tab-settings-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    // Tutup panel saat klik di luar
    if (!panel.classList.contains('hidden')) {
        setTimeout(() => {
            document.addEventListener('click', function handler(e) {
                const btn   = document.getElementById('btn-tab-settings');
                if (!panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
                    panel.classList.add('hidden');
                    document.removeEventListener('click', handler);
                }
            });
        }, 0);
    }
};

window.toggleOwnerTabVisibility = function(tabKey, visible) {
    const vis = loadTabVisibility();

    // Cegah semua tab disembunyikan — minimal 1 harus tersisa
    const wouldHide = !visible;
    const currentVisible = ALL_OWNER_TABS.filter(t => vis[t.key]);
    if (wouldHide && currentVisible.length <= 1) {
        // Kembalikan checkbox ke checked
        const cb = document.querySelector(`input[onchange*="'${tabKey}'"]`);
        if (cb) cb.checked = true;
        return;
    }

    vis[tabKey] = visible;
    saveTabVisibility(vis);

    // Jika tab aktif sekarang disembunyikan, pindah ke tab visible pertama
    if (!visible && activeOwnerTab === tabKey) {
        activeOwnerTab = ALL_OWNER_TABS.find(t => vis[t.key])?.key || 'finance';
    }

    // Re-render tab bar saja tanpa full render (lebih responsif)
    const bar = document.getElementById('owner-tab-bar');
    if (bar) {
        bar.innerHTML = ALL_OWNER_TABS
            .filter(t => vis[t.key])
            .map(t => `
                <button onclick="window.switchOwnerTab('${t.key}')"
                    class="flex-1 lg:flex-none px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition ${activeOwnerTab === t.key ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}">
                    ${t.icon} ${t.label}
                </button>`
            ).join('');
    }

    // Jika tab aktif berubah, render konten baru
    if (!visible && document.getElementById('tab-content-container')) {
        render(document.getElementById('app-container'));
    }
};

// HANDLER TRANSAKSI (Modal)
window.showTransactionDetail = async function(transactionId) {
    const modal = document.getElementById('detail-modal');
    const tx = await db.transactions.get(transactionId);
    if (!tx) return;

    const items = await db.transactionItems.where('transactionId').equals(transactionId).toArray();

    document.getElementById('modal-tx-id').innerText = `Nota: ${tx.id}`;
    document.getElementById('modal-tx-time').innerText = new Date(tx.timestamp).toLocaleString('id-ID');
    document.getElementById('modal-tx-method').innerText = tx.paymentMethod;
    
    const subtotal = tx.subtotal || tx.total;
    document.getElementById('modal-tx-subtotal').innerText = `Rp ${subtotal.toLocaleString('id-ID')}`;

    const memberRow = document.getElementById('modal-member-row');
    const memberDetail = document.getElementById('modal-member-detail');
    if (tx.memberName) {
        memberRow.classList.remove('hidden');
        memberDetail.innerText = `${tx.memberName} (${tx.memberId || 'Active Member'})`;
    } else {
        memberRow.classList.add('hidden');
    }

    const discountRow = document.getElementById('modal-discount-row');
    if (tx.discount && tx.discount > 0) {
        discountRow.classList.remove('hidden');
        document.getElementById('modal-tx-discount').innerText = `- Rp ${tx.discount.toLocaleString('id-ID')}`;
    } else {
        discountRow.classList.add('hidden');
    }

    document.getElementById('modal-tx-total').innerText = `Rp ${tx.total.toLocaleString('id-ID')}`;

    const itemsContainer = document.getElementById('modal-items-container');
    const itemsHTML = await Promise.all(items.map(async (item) => {
        const prod = await db.products.get(item.productId);
        const productName = prod ? prod.name : "Produk Telah Dihapus";
        return `
            <div class="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
                <div>
                    <h4 class="font-semibold text-sm text-gray-800 dark:text-gray-200">${productName}</h4>
                    <p class="text-xs text-gray-500">${item.notes ? `<span class="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md mr-1">${item.notes}</span>` : ''} ${item.quantity} x Rp ${(item.subtotal / item.quantity).toLocaleString('id-ID')}</p>
                </div>
                <span class="text-sm font-bold text-gray-900 dark:text-white">Rp ${item.subtotal.toLocaleString('id-ID')}</span>
            </div>
        `;
    }));

    itemsContainer.innerHTML = itemsHTML.join('');
    modal.classList.remove('hidden');
};

window.closeModal = function() {
    const modal = document.getElementById('detail-modal');
    if (modal) modal.classList.add('hidden');
};

// HANDLER PENGELUARAN (Expenses) — sinkron dengan db.expenses (sama seperti kasir)
window.saveExpense = async function(e) {
    e.preventDefault();
    const date        = document.getElementById('exp-date').value;
    const description = document.getElementById('exp-name').value.trim();
    const category    = document.getElementById('exp-category')?.value || 'Lainnya';
    const storeBranch = document.getElementById('exp-store')?.value || '-';
    const amount      = Number(document.getElementById('exp-amount').value);

    if (!description || amount <= 0) return;

    await db.expenses.add({
        id:          'EXP-' + Date.now(),
        description,
        category,
        storeBranch,
        amount,
        date,
    });

    document.getElementById('expense-form')?.reset();
    document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
    render(document.getElementById('app-container'));
};

window.deleteExpense = async function(id) {
    window.showAppConfirm('Hapus catatan pengeluaran ini?', async () => {
        await db.expenses.delete(id);
        render(document.getElementById('app-container'));
    });
};


// HANDLER MUTASI & INVENTORY
window.processManualMutation = async function(e) {
    e.preventDefault();
    const productId = document.getElementById('m-product-id').value;
    if (!productId) return alert('Pilih produk terlebih dahulu.');
    const type = document.getElementById('m-type').value;
    const storeId = document.getElementById('m-branch').value;
    const quantity = parseInt(document.getElementById('m-qty').value);
    const note = document.getElementById('m-note').value;

    const p = await db.products.get(productId);
    if (!p) return;

    const allStores = await db.stores.toArray();
    const targetStore = allStores.find(s => s.id === storeId);
    
    const numMatch = storeId.match(/\d+/);
    const storeNum = numMatch ? numMatch[0] : "1";
    const key = `stockToko${storeNum}`;
    
    let currentStock = p[key] || 0;

    if (type === 'MASUK') {
        currentStock += quantity;
    } else {
        if (currentStock < quantity) return alert(`Stok di ${targetStore.name} tidak cukup!`);
        currentStock -= quantity;
    }

    const updateData = {};
    updateData[key] = currentStock;

    // Hitung ulang akumulasi total stock global produk
    let newTotalStock = 0;
    allStores.forEach(s => {
        const sNumMatch = s.id.match(/\d+/);
        const sNum = sNumMatch ? sNumMatch[0] : "1";
        const sKey = `stockToko${sNum}`;
        if (s.id === storeId) {
            newTotalStock += currentStock;
        } else {
            newTotalStock += (p[sKey] || 0);
        }
    });
    updateData.stock = newTotalStock;

    await db.stock_mutations.add({ 
        productId, 
        type, 
        quantity, 
        note, 
        storeBranch: targetStore.name, 
        timestamp: new Date().toISOString() 
    });
    
    await db.products.update(productId, updateData);
    alert(`Mutasi cabang ${targetStore.name} berhasil dicatat!`);
    window.switchOwnerTab('inventory');
};

window.processTransfer = async function(e) {
    e.preventDefault();
    const productId = document.getElementById('t-product-id').value;
    if (!productId) return alert('Pilih produk terlebih dahulu.');
    const fromStoreId = document.getElementById('t-from').value;
    const toStoreId = document.getElementById('t-to').value;
    const qty = parseInt(document.getElementById('t-qty').value);

    if (fromStoreId === toStoreId) return alert("Sumber dan tujuan toko tidak boleh sama!");

    const prod = await db.products.get(productId);
    if (!prod) return;

    const allStores = await db.stores.toArray();
    const fromStore = allStores.find(s => s.id === fromStoreId);
    const toStore = allStores.find(s => s.id === toStoreId);

    const fromNum = fromStoreId.match(/\d+/)[0];
    const toNum = toStoreId.match(/\d+/)[0];

    const fromKey = `stockToko${fromNum}`;
    const toKey = `stockToko${toNum}`;

    let sFrom = prod[fromKey] || 0;
    let sTo = prod[toKey] || 0;

    if (sFrom < qty) return alert(`Stok di ${fromStore.name} tidak mencukupi untuk ditransfer!`);

    sFrom -= qty;
    sTo += qty;

    const updateData = {};
    updateData[fromKey] = sFrom;
    updateData[toKey] = sTo;

    await db.products.update(productId, updateData);
    await db.stock_mutations.add({ 
        productId, 
        type: 'TRANSFER', 
        quantity: qty, 
        note: `Transfer dari ${fromStore.name} ke ${toStore.name}`, 
        storeBranch: toStore.name, 
        timestamp: new Date().toISOString() 
    });
    
    alert(`Berhasil transfer ${qty} pcs dari ${fromStore.name} ke ${toStore.name}!`);
    window.switchOwnerTab('inventory');
}


// HANDLER OPNAME
window.updateOpnameSystemStockView = async function() {
    const productId = document.getElementById('o-product-id').value;
    const storeId = document.getElementById('o-store-id').value;
    if (!productId) {
        document.getElementById('o-system-view').innerText = '-';
        return;
    }
    
    const prod = await db.products.get(productId);
    if (!prod) return;

    const storeNum = storeId.match(/\d+/)[0];
    const key = `stockToko${storeNum}`;
    const systemStock = prod[key] || 0;
    
    document.getElementById('o-system-view').innerText = `${systemStock} pcs`;
    window.calculateOpnameDiff();
};

window.calculateOpnameDiff = async function() {
    const productId = document.getElementById('o-product-id').value;
    const storeId = document.getElementById('o-store-id').value;
    const actualInput = document.getElementById('o-actual-stock').value;
    if (!productId || actualInput === '') {
        document.getElementById('o-diff-view').innerText = '-';
        return;
    }

    const prod = await db.products.get(productId);
    const storeNum = storeId.match(/\d+/)[0];
    const key = `stockToko${storeNum}`;
    const systemStock = prod[key] || 0;
    
    const diff = parseInt(actualInput) - systemStock;
    const viewEl = document.getElementById('o-diff-view');
    if (diff < 0) {
        viewEl.innerHTML = `<span class="text-red-600 font-bold">Minus ${diff} Pcs</span>`;
    } else if (diff > 0) {
        viewEl.innerHTML = `<span class="text-emerald-600 font-bold">Plus +${diff} Pcs</span>`;
    } else {
        viewEl.innerHTML = `<span class="text-gray-500 font-bold">Sesuai (0)</span>`;
    }
};

window.processStockOpname = async function(e) {
    e.preventDefault();
    const productId = document.getElementById('o-product-id').value;
    const storeId = document.getElementById('o-store-id').value;
    const actualStock = parseInt(document.getElementById('o-actual-stock').value);
    const reason = document.getElementById('o-reason').value;

    const prod = await db.products.get(productId);
    const allStores = await db.stores.toArray();
    const targetStore = allStores.find(s => s.id === storeId);

    const storeNum = storeId.match(/\d+/)[0];
    const key = `stockToko${storeNum}`;
    const systemStock = prod[key] || 0;
    const difference = actualStock - systemStock;

    // Update stock spesifik toko tersebut
    const updateData = {};
    updateData[key] = actualStock;

    // Hitung ulang akumulasi total stock global produk
    let newTotalStock = 0;
    allStores.forEach(s => {
        const sNum = s.id.match(/\d+/)[0];
        const sKey = `stockToko${sNum}`;
        if (s.id === storeId) {
            newTotalStock += actualStock;
        } else {
            newTotalStock += (prod[sKey] || 0);
        }
    });
    updateData.stock = newTotalStock;

    await db.products.update(productId, updateData);
    
    if (db.stockOpnames) {
        await db.stockOpnames.add({
            productId,
            productName: prod.name,
            storeBranch: targetStore.name,
            systemStock,
            actualStock,
            difference,
            reason,
            timestamp: new Date().toISOString()
        });
    }

    alert(`Opname cabang ${targetStore.name} berhasil disimpan!`);
    window.switchOwnerTab('opname');
};

// ── PRODUCT SEARCH COMBOBOX HELPER ───────────────────────────────────────────
// Membuat elemen searchable combobox untuk menggantikan <select> produk.
// inputId   : id untuk hidden input (menyimpan product id)
// searchId  : id untuk input teks pencarian
// dropdownId: id untuk div dropdown list
// products  : array produk
// onSelect  : callback(productId, productName)
function buildProductSearchbox(inputId, searchId, dropdownId, products, onSelect, placeholder = 'Ketik nama produk...') {
    // Render dropdown list berisi produk
    function renderList(q) {
        const dd = document.getElementById(dropdownId);
        if (!dd) return;
        const filtered = q ? products.filter(p => p.name.toLowerCase().includes(q.toLowerCase())) : products;
        if (filtered.length === 0) {
            dd.innerHTML = `<div class="px-3 py-2 text-xs text-gray-400 italic">Produk tidak ditemukan</div>`;
        } else {
            dd.innerHTML = filtered.map(p => `
                <div class="px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg flex justify-between items-center gap-2 product-search-item"
                    data-id="${p.id}" data-name="${p.name}">
                    <span class="font-semibold text-gray-800 dark:text-gray-200">${p.name}</span>
                    <span class="text-[10px] text-gray-400 shrink-0">${p.category || ''}</span>
                </div>`).join('');
        }
        dd.classList.remove('hidden');
        // Attach click handlers
        dd.querySelectorAll('.product-search-item').forEach(el => {
            el.addEventListener('mousedown', e => {
                e.preventDefault();
                selectProduct(el.dataset.id, el.dataset.name);
            });
        });
    }
    function selectProduct(id, name) {
        const hidden = document.getElementById(inputId);
        const search = document.getElementById(searchId);
        const dd     = document.getElementById(dropdownId);
        if (hidden) hidden.value = id;
        if (search) { search.value = name; search.classList.add('text-gray-900','dark:text-white'); }
        if (dd) dd.classList.add('hidden');
        if (typeof onSelect === 'function') onSelect(id, name);
    }
    function openDropdown() {
        const search = document.getElementById(searchId);
        renderList(search ? search.value : '');
    }
    function closeDropdown() {
        const dd = document.getElementById(dropdownId);
        if (dd) dd.classList.add('hidden');
    }
    // Attach to search input
    setTimeout(() => {
        const search = document.getElementById(searchId);
        const dd     = document.getElementById(dropdownId);
        if (!search) return;
        search.addEventListener('input',   () => renderList(search.value));
        search.addEventListener('focus',   () => openDropdown());
        search.addEventListener('blur',    () => setTimeout(closeDropdown, 150));
        search.addEventListener('keydown', e => {
            if (!dd || dd.classList.contains('hidden')) return;
            const items = dd.querySelectorAll('.product-search-item');
            let cur = dd.querySelector('.product-search-item.bg-indigo-100, .product-search-item.dark\\:bg-indigo-800\\/40');
            let idx  = [...items].indexOf(cur);
            if (e.key === 'ArrowDown')  { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
            if (e.key === 'ArrowUp')    { e.preventDefault(); idx = Math.max(idx - 1, 0); }
            if (e.key === 'Enter' && cur) { e.preventDefault(); selectProduct(cur.dataset.id, cur.dataset.name); return; }
            if (e.key === 'Escape') { closeDropdown(); return; }
            items.forEach(i => i.classList.remove('bg-indigo-50','dark:bg-indigo-900/30'));
            if (items[idx]) { items[idx].classList.add('bg-indigo-50','dark:bg-indigo-900/30'); items[idx].scrollIntoView({block:'nearest'}); }
        });
    }, 0);
}

// Inisialisasi semua product searchbox setelah render
window._initProductSearchboxes = function(products, activeStores) {
    // ── Transfer Stok ─────────────────────────────────────────────
    buildProductSearchbox('t-product-id', 't-product-search', 't-product-dropdown', products, (id) => {
        // update info stok di placeholder setelah pilih
        const p = products.find(x => x.id === id);
        if (!p) return;
        const info = activeStores.map(s => {
            const n = (s.id.match(/\d+/)||['1'])[0];
            return `${s.name}: ${p['stockToko'+n]||0}`;
        }).join(' | ');
        const el = document.getElementById('t-product-search');
        if (el) el.title = info;
    });
    // ── Logistik Manual ───────────────────────────────────────────
    buildProductSearchbox('m-product-id', 'm-product-search', 'm-product-dropdown', products);
    // ── Opname ────────────────────────────────────────────────────
    buildProductSearchbox('o-product-id', 'o-product-search', 'o-product-dropdown', products, () => {
        window.updateOpnameSystemStockView();
    });
};

// HANDLER PRODUK
window.saveProduct = async function(e) {
    e.preventDefault();
    const name = document.getElementById('p-name').value;
    const category = document.getElementById('p-category').value;
    const purchasePrice = parseFloat(document.getElementById('p-purchase-price').value);
    const price = parseFloat(document.getElementById('p-price').value);

    // Ambil data dinamis semua input stok cabang
    const stockInputs = document.querySelectorAll('.p-input-store-stock');
    let calculatedTotalStock = 0;
    const branchStockData = {};

    stockInputs.forEach(input => {
        const key = input.getAttribute('data-store-key');
        const val = parseInt(input.value) || 0;
        branchStockData[key] = val;
        calculatedTotalStock += val;
    });

    const productData = {
        name,
        category,
        purchasePrice,
        price,
        stock: calculatedTotalStock,
        ...branchStockData
    };

    if (editingProductId) {
        await db.products.update(editingProductId, productData);
        alert("Produk berhasil diperbarui!");
    } else {
        const id = 'PROD' + Date.now().toString().slice(-5);
        await db.products.add({ id, ...productData });
        alert("Produk baru berhasil ditambahkan!");
    }
    
    editingProductId = null;
    render(document.getElementById('app-container'));
};

window.editProduct = async function(id) {
    const p = await db.products.get(id);
    if (!p) return;
    editingProductId = id;
    activeOwnerTab = 'products'; 
    await render(document.getElementById('app-container'));

    document.getElementById('p-name').value = p.name;
    document.getElementById('p-category').value = p.category;
    document.getElementById('p-purchase-price').value = p.purchasePrice || (p.price * 0.7);
    document.getElementById('p-price').value = p.price;

    // Masukkan data stok ke masing-masing cabang input secara dinamis
    const stockInputs = document.querySelectorAll('.p-input-store-stock');
    stockInputs.forEach(input => {
        const key = input.getAttribute('data-store-key');
        input.value = p[key] || 0;
    });
}

window.cancelEdit = function() {
    editingProductId = null;
    render(document.getElementById('app-container'));
};

window.deleteProduct = async function(id) {
    window.showAppConfirm("Hapus produk ini?", async () => {
        await db.products.delete(id);
        render(document.getElementById('app-container'));
    });
};

window.exportProducts = async function() {
    const products = await db.products.toArray();
    if (products.length === 0) return alert('Tidak ada data produk untuk diexport.');
    
    const allStores = await db.stores.toArray();
    const activeStores = allStores.filter(s => s.isActive);

    const data = products.map(p => {
        const row = {
            'Nama Produk': p.name,
            'Kategori': p.category || '',
            'Harga Beli': p.purchasePrice || 0,
            'Harga Jual': p.price
        };
        activeStores.forEach(s => {
            const storeNum = s.id.match(/\d+/)[0];
            const key = `stockToko${storeNum}`;
            row[`Stok ${s.name}`] = p[key] || 0;
        });
        row['Total Stok'] = p.stock || 0;
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Produk");
    XLSX.writeFile(workbook, "Data_Produk.xlsx");
};

// --- SUB TAB 7: SHIFT MANAGEMENT ---

// ── shiftModule: konstanta & helper untuk rendering ─────────────────────────
const shiftModule = {
    SHIFT_TYPES: {
        PAGI:   { label: 'Pagi',   time: '07:00 – 15:00', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
        SIANG:  { label: 'Siang',  time: '12:00 – 20:00', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
        MALAM:  { label: 'Malam',  time: '20:00 – 07:00', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' },
        FULL:   { label: 'Full',   time: '08:00 – 20:00', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
        LIBUR:  { label: 'Libur',  time: '–',             color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    },
    formatDate(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    },
    formatTime(timeStr) {
        if (!timeStr) return '-';
        return timeStr;
    },
    getShiftStatusDisplay(shift) {
        if (!shift) return { label: '-', color: 'bg-gray-100 text-gray-500' };
        const today = new Date().toISOString().split('T')[0];
        if (shift.status === 'cancelled') return { label: 'Dibatalkan', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' };
        if (shift.date > today)           return { label: 'Terjadwal',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' };
        if (shift.date === today)         return { label: 'Hari Ini',   color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' };
        return { label: 'Selesai', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
    },
    getAttendanceStatusDisplay(status) {
        const map = {
            'Hadir':     { color: 'text-green-600 dark:text-green-400',  icon: '✅' },
            'Terlambat': { color: 'text-yellow-600 dark:text-yellow-400', icon: '⏰' },
            'Izin':      { color: 'text-blue-600 dark:text-blue-400',    icon: '📝' },
            'Sakit':     { color: 'text-purple-600 dark:text-purple-400', icon: '🤒' },
            'Alpa':      { color: 'text-red-600 dark:text-red-400',      icon: '❌' },
        };
        return map[status] || { color: 'text-gray-500', icon: '–' };
    },
};

function renderShiftsTab(target, users, shifts, attendances, shiftSchedules, activeStores) {
    const activeUsers = users.filter(u => u.status === 'Aktif');
    const currentMonth = shiftFilterMonth || new Date().toISOString().substring(0, 7);
    const todayStr = new Date().toISOString().split('T')[0];

    // Filter berdasarkan toko
    const filteredUsers = shiftFilterStore === 'semua'
        ? activeUsers
        : activeUsers.filter(u => (u.storeBranch || '') === shiftFilterStore);

    // Statistik kehadiran bulan ini
    const monthAttendances = attendances.filter(a => (a.date || '').startsWith(currentMonth));
    const monthShifts = shifts.filter(s => (s.date || '').startsWith(currentMonth) &&
        (shiftFilterStore === 'semua' || (s.storeId || s.storeName || '') === shiftFilterStore));
    const displayAttendances = shiftFilterStore === 'semua'
        ? monthAttendances
        : monthAttendances.filter(a => (a.storeBranch || '') === shiftFilterStore);

    const attendanceByUser = {};
    filteredUsers.forEach(u => {
        const ua = monthAttendances.filter(a => a.userId === u.id || a.userId === u.username);
        attendanceByUser[u.id] = {
            hadir: ua.filter(a => a.status === 'Hadir').length,
            terlambat: ua.filter(a => a.status === 'Terlambat').length,
            izin: ua.filter(a => a.status === 'Izin').length,
            sakit: ua.filter(a => a.status === 'Sakit').length,
            alpa: ua.filter(a => a.status === 'Alpa').length,
        };
    });

    const todayShifts = monthShifts.filter(s => s.date === todayStr);
    const totalHadir = monthAttendances.filter(a => a.status === 'Hadir' || a.status === 'Terlambat').length;

    target.innerHTML = `
        <div class="space-y-5">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">⏰ Manajemen Shift Karyawan</h2>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Kelola jadwal kerja, absensi, dan rekap kehadiran</p>
                </div>
                <div class="flex gap-2 flex-wrap">
                    <button onclick="window.showRecordAttendanceModal()" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition text-xs flex items-center gap-1.5 shadow-sm">
                        ✅ Catat Kehadiran
                    </button>
                    <button onclick="window.showCreateShiftModal()" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition text-xs flex items-center gap-1.5 shadow-sm">
                        ➕ Buat Shift
                    </button>
                </div>
            </div>
            <!-- Filter -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm flex flex-col sm:flex-row gap-3">
                <div class="flex-1">
                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Bulan</label>
                    <input type="month" value="${currentMonth}" onchange="window.setShiftFilterMonth(this.value)" class="w-full p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                </div>
                <div class="flex-1">
                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Toko</label>
                    <select onchange="window.setShiftFilterStore(this.value)" class="w-full p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                        <option value="semua">Semua Toko</option>
                        ${activeStores.map(s => `<option value="${s.name}" ${shiftFilterStore === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select>
                </div>
            </div>
            <!-- Stat Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 shadow-sm">
                    <p class="text-[10px] font-bold text-indigo-500 uppercase mb-1">Shift Bulan Ini</p>
                    <p class="text-2xl font-black text-gray-900 dark:text-white">${monthShifts.length}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">${filteredUsers.length} karyawan aktif</p>
                </div>
                <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 shadow-sm">
                    <p class="text-[10px] font-bold text-emerald-500 uppercase mb-1">Hadir Bulan Ini</p>
                    <p class="text-2xl font-black text-gray-900 dark:text-white">${totalHadir}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">${monthAttendances.length} total catatan</p>
                </div>
                <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 shadow-sm">
                    <p class="text-[10px] font-bold text-amber-500 uppercase mb-1">Shift Hari Ini</p>
                    <p class="text-2xl font-black text-gray-900 dark:text-white">${todayShifts.length}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'short'})}</p>
                </div>
                <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 shadow-sm">
                    <p class="text-[10px] font-bold text-red-500 uppercase mb-1">Alpa Bulan Ini</p>
                    <p class="text-2xl font-black text-gray-900 dark:text-white">${monthAttendances.filter(a=>a.status==='Alpa').length}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">Tidak hadir tanpa keterangan</p>
                </div>
            </div>

            <!-- View Tabs -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div class="flex border-b dark:border-gray-800">
                    ${[['calendar','📅 Jadwal'],['employees','👥 Per Karyawan'],['attendance','📊 Kehadiran']].map(([key,label])=>`
                        <button onclick="window.setShiftView('${key}')" class="flex-1 px-3 py-3 text-xs font-bold transition ${shiftView===key?'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20':'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'}">${label}</button>`).join('')}
                </div>
                <div class="p-4">
                    ${shiftView === 'calendar' ? `
                    <div class="overflow-x-auto">
                        <table class="w-full text-xs">
                            <thead><tr class="border-b dark:border-gray-800">
                                <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Tanggal</th>
                                <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Karyawan</th>
                                <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Toko</th>
                                <th class="p-3 text-center text-[10px] font-bold text-gray-400 uppercase">Jenis Shift</th>
                                <th class="p-3 text-center text-[10px] font-bold text-gray-400 uppercase">Status</th>
                                <th class="p-3 text-center text-[10px] font-bold text-gray-400 uppercase">Aksi</th>
                            </tr></thead>
                            <tbody class="divide-y dark:divide-gray-800">
                                ${monthShifts.length === 0 ? '<tr><td colspan="6" class="p-8 text-center text-gray-400 italic">Belum ada shift. Klik "Buat Shift" untuk menambahkan.</td></tr>' :
                                [...monthShifts].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(s=>{
                                    const st = shiftModule.SHIFT_TYPES[s.shiftType?.toUpperCase()] || {label:s.shiftType||'-',time:'',color:'bg-gray-100 dark:bg-gray-800 text-gray-600'};
                                    const disp = shiftModule.getShiftStatusDisplay(s);
                                    const isToday = s.date === todayStr;
                                    return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition ${isToday?'bg-indigo-50/30 dark:bg-indigo-900/10':''}">
                                        <td class="p-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">${shiftModule.formatDate(s.date)}${isToday?'<span class="ml-1 text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold">Hari ini</span>':''}</td>
                                        <td class="p-3 text-gray-700 dark:text-gray-300">${s.userName||'-'}</td>
                                        <td class="p-3 text-gray-500 dark:text-gray-400">${s.storeId||s.storeName||'-'}</td>
                                        <td class="p-3 text-center"><span class="text-[10px] font-bold px-2 py-1 rounded ${st.color}">${st.label}</span></td>
                                        <td class="p-3 text-center"><span class="text-[10px] font-bold px-2 py-1 rounded ${disp.color}">${disp.label}</span></td>
                                        <td class="p-3 text-center space-x-1">
                                            <button onclick="window.editShift('${s.id}')" class="text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded text-[10px] font-bold">Edit</button>
                                            <button onclick="window.deleteShiftConfirm('${s.id}')" class="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 px-2 py-1 rounded text-[10px] font-bold">Hapus</button>
                                        </td>
                                    </tr>`; }).join('')}
                            </tbody>
                        </table>
                    </div>
                    ` : shiftView === 'employees' ? `
                    <div class="space-y-3">
                        ${filteredUsers.length === 0 ? '<p class="text-center text-gray-400 italic py-8">Tidak ada karyawan aktif.</p>' :
                        filteredUsers.map(user=>{
                            const s = attendanceByUser[user.id]||{};
                            const userShifts = monthShifts.filter(x=>x.userId===user.id);
                            return `<div class="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50">
                                    <div><p class="font-bold text-gray-900 dark:text-white text-sm">${user.name}</p><p class="text-[10px] text-gray-400 mt-0.5">@${user.username} · ${user.storeBranch||'-'}</p></div>
                                    <div class="text-right"><p class="text-xs text-gray-500">${userShifts.length} shift</p><p class="text-xs font-bold ${((s.hadir||0)+(s.terlambat||0))>0?'text-emerald-600':'text-gray-400'}">${(s.hadir||0)+(s.terlambat||0)} hari hadir</p></div>
                                </div>
                                <div class="grid grid-cols-5 divide-x dark:divide-gray-800 text-center">
                                    ${[['Hadir',s.hadir||0,'text-emerald-600'],['Terlambat',s.terlambat||0,'text-amber-600'],['Izin',s.izin||0,'text-blue-600'],['Sakit',s.sakit||0,'text-purple-600'],['Alpa',s.alpa||0,'text-red-600']].map(([label,val,color])=>`<div class="py-2.5"><p class="text-[10px] text-gray-400 font-semibold">${label}</p><p class="text-base font-black ${color}">${val}</p></div>`).join('')}
                                </div>
                            </div>`; }).join('')}
                    </div>
                    ` : `
                    <div class="space-y-4">
                        <!-- Ringkasan Absensi Hari Ini -->
                        ${(() => {
                            const todayAtt = displayAttendances.filter(a => a.date === todayStr);
                            if (todayAtt.length === 0) return `
                                <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex items-center gap-3">
                                    <span class="text-2xl">⚠️</span>
                                    <div>
                                        <p class="text-sm font-bold text-amber-800 dark:text-amber-300">Belum ada absensi hari ini</p>
                                        <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Absensi otomatis tercatat saat kasir login ke aplikasi</p>
                                    </div>
                                </div>`;
                            return `
                                <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
                                    <div class="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-800 flex items-center gap-2">
                                        <span class="text-sm">📅</span>
                                        <span class="text-xs font-bold text-gray-700 dark:text-gray-300">Absensi Hari Ini — ${new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long'})}</span>
                                    </div>
                                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x dark:divide-gray-800">
                                        ${todayAtt.map(a => {
                                            const sd = shiftModule.getAttendanceStatusDisplay(a.status);
                                            const isOut = !!a.checkOutTime;
                                            return `<div class="p-4 flex items-center gap-3">
                                                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${a.status==='Hadir'?'bg-emerald-100 dark:bg-emerald-900/30':a.status==='Terlambat'?'bg-amber-100 dark:bg-amber-900/30':'bg-gray-100 dark:bg-gray-800'}">${sd.icon}</div>
                                                <div class="flex-1 min-w-0">
                                                    <p class="font-bold text-gray-900 dark:text-white text-sm truncate">${a.userName}</p>
                                                    <p class="text-[10px] text-gray-400 mt-0.5">${a.storeBranch||'-'}</p>
                                                    <div class="flex items-center gap-2 mt-1">
                                                        <span class="text-[10px] font-bold ${sd.color}">${sd.icon} ${a.status}</span>
                                                        ${a.checkInTime ? `<span class="text-[10px] text-gray-400">Masuk: <span class="font-semibold text-gray-600 dark:text-gray-300">${a.checkInTime}</span></span>` : ''}
                                                        ${a.checkOutTime ? `<span class="text-[10px] text-gray-400">Keluar: <span class="font-semibold text-emerald-600 dark:text-emerald-400">${a.checkOutTime}</span></span>` : `<span class="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold">Belum keluar</span>`}
                                                    </div>
                                                </div>
                                            </div>`; }).join('')}
                                    </div>
                                </div>`;
                        })()}

                        <!-- Filter + Tambah -->
                        <div class="flex justify-between items-center">
                            <p class="text-xs text-gray-500 dark:text-gray-400">${displayAttendances.length} catatan · <span class="font-semibold text-indigo-600">otomatis dari login/logout</span></p>
                            <button onclick="window.showRecordAttendanceModal()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition">✅ + Tambah Manual</button>
                        </div>

                        <!-- Tabel -->
                        <div class="overflow-x-auto">
                            <table class="w-full text-xs">
                                <thead>
                                    <tr class="border-b dark:border-gray-800">
                                        <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Tanggal</th>
                                        <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Karyawan</th>
                                        <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Toko</th>
                                        <th class="p-3 text-center text-[10px] font-bold text-gray-400 uppercase">Status</th>
                                        <th class="p-3 text-center text-[10px] font-bold text-emerald-500 uppercase">Login</th>
                                        <th class="p-3 text-center text-[10px] font-bold text-rose-500 uppercase">Logout</th>
                                        <th class="p-3 text-center text-[10px] font-bold text-gray-400 uppercase">Durasi</th>
                                        <th class="p-3 text-left text-[10px] font-bold text-gray-400 uppercase">Sumber</th>
                                        <th class="p-3 text-center text-[10px] font-bold text-gray-400 uppercase">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y dark:divide-gray-800">
                                    ${displayAttendances.length === 0
                                        ? '<tr><td colspan="9" class="p-8 text-center text-gray-400 italic">Belum ada data kehadiran.</td></tr>'
                                        : [...displayAttendances].sort((a,b) => {
                                            const dt = (b.date||'').localeCompare(a.date||'');
                                            if (dt !== 0) return dt;
                                            return (b.checkInTime||'').localeCompare(a.checkInTime||'');
                                        }).map(att => {
                                            const sd = shiftModule.getAttendanceStatusDisplay(att.status);
                                            // Hitung durasi
                                            let durasi = '-';
                                            if (att.checkInTime && att.checkOutTime) {
                                                const [ih, im] = att.checkInTime.split(':').map(Number);
                                                const [oh, om] = att.checkOutTime.split(':').map(Number);
                                                const menit = (oh*60+om) - (ih*60+im);
                                                if (menit > 0) durasi = `${Math.floor(menit/60)}j ${menit%60}m`;
                                            }
                                            const isAuto = att.notes === 'Login otomatis' || att.loginAt;
                                            return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                                <td class="p-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">${shiftModule.formatDate(att.date)}</td>
                                                <td class="p-3 font-semibold text-gray-700 dark:text-gray-300">${att.userName||'-'}</td>
                                                <td class="p-3 text-gray-500 dark:text-gray-400">${att.storeBranch||'-'}</td>
                                                <td class="p-3 text-center"><span class="font-bold text-xs ${sd.color}">${sd.icon} ${att.status}</span></td>
                                                <td class="p-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">${att.checkInTime||'-'}</td>
                                                <td class="p-3 text-center ${att.checkOutTime?'font-semibold text-rose-600 dark:text-rose-400':'text-gray-300 dark:text-gray-600'}">${att.checkOutTime||'–'}</td>
                                                <td class="p-3 text-center text-gray-500 dark:text-gray-400">${durasi}</td>
                                                <td class="p-3"><span class="text-[9px] px-1.5 py-0.5 rounded font-bold ${isAuto?'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400':'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}">${isAuto?'🤖 Otomatis':'✍️ Manual'}</span></td>
                                                <td class="p-3 text-center space-x-1">
                                                    <button onclick="window.editAttendance('${att.id}')" class="text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded text-[10px] font-bold">Edit</button>
                                                    <button onclick="window.deleteAttendanceConfirm('${att.id}')" class="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 px-2 py-1 rounded text-[10px] font-bold">Hapus</button>
                                                </td>
                                            </tr>`; }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    `}
                </div>
            </div>

        </div>
    `;
}

// HANDLER USERS
window.saveUser = async function(e) {
    e.preventDefault();
    const name = document.getElementById('u-name').value;
    const username = document.getElementById('u-username').value.trim();
    const password = document.getElementById('u-password').value;
    const status = document.getElementById('u-status').value;
    const storeBranch = document.getElementById('u-branch').value;

    if (editingUserId) {
        await db.users.update(editingUserId, { name, username, password, status, storeBranch });
        editingUserId = null;
        alert("Akun kasir berhasil diperbarui!");
    } else {
        const existing = await db.users.where('username').equalsIgnoreCase(username).first();
        if (existing) return alert("Username ini sudah digunakan!");

        const id = 'USR' + Date.now().toString().slice(-5);
        await db.users.add({ id, name, username, password, status, storeBranch, timestamp: new Date().toISOString() });
        alert("Akun kasir baru berhasil didaftarkan!");
    }
    render(document.getElementById('app-container'));
};

window.editUser = async function(id) {
    const u = await db.users.get(id);
    if (!u) return;
    editingUserId = id;
    activeOwnerTab = 'users'; 
    await render(document.getElementById('app-container'));

    document.getElementById('u-name').value = u.name;
    document.getElementById('u-username').value = u.username;
    document.getElementById('u-password').value = u.password;
    document.getElementById('u-status').value = u.status;
    document.getElementById('u-branch').value = u.storeBranch || '';
}

window.cancelUserEdit = function() {
    editingUserId = null;
    render(document.getElementById('app-container'));
};

window.deleteUser = async function(id) {
    window.showAppConfirm("Hapus akun kasir ini?", async () => {
        await db.users.delete(id);
        render(document.getElementById('app-container'));
    });
};

// HANDLER STORES
window.saveStore = async function(e) {
    e.preventDefault();
    const name = document.getElementById('s-name').value.trim();
    const address = document.getElementById('s-address').value.trim();
    const phone = document.getElementById('s-phone').value.trim();
    const isActive = document.getElementById('s-status').value === 'true';

    if (!name) return alert("Nama toko wajib diisi!");

    if (editingStoreId) {
        await db.stores.update(editingStoreId, { name, address, phone, isActive });
        alert("Toko berhasil diperbarui!");
    } else {
        // Cari nomor toko maksimal yang sudah ada
        const allStores = await db.stores.toArray();
        let maxNum = 2; // Default starting assumption
        allStores.forEach(s => {
            const match = s.id.match(/toko(\d+)/i); // Case insensitive regex
            if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
        });
        
        const newStoreNum = maxNum + 1;
        const storeId = `toko${newStoreNum}`; // Gunakan lowercase format seperti seed
        
        await db.stores.add({ 
            id: storeId, 
            name, 
            address, 
            phone, 
            isActive, 
            createdAt: new Date().toISOString() 
        });

        // Tambahkan kolom stok baru ke SEMUA produk
        const allProducts = await db.products.toArray();
        for (const prod of allProducts) {
            const updateData = {};
            updateData[`stockToko${newStoreNum}`] = 0;
            // Total stock remains the same, just adding new 0-value field
            await db.products.update(prod.id, updateData);
        }

        alert(`Toko baru "${name}" berhasil ditambahkan!\nKolom stok Toko ${newStoreNum} telah ditambahkan ke semua produk.`);
    }

    editingStoreId = null;
    render(document.getElementById('app-container'));
};

window.editStore = async function(id) {
    const s = await db.stores.get(id);
    if (!s) return;
    editingStoreId = id;
    activeOwnerTab = 'stores';
    await render(document.getElementById('app-container'));
    
    document.getElementById('s-name').value = s.name;
    document.getElementById('s-address').value = s.address || '';
    document.getElementById('s-phone').value = s.phone || '';
    document.getElementById('s-status').value = s.isActive ? 'true' : 'false';
}

window.cancelStoreEdit = function() {
    editingStoreId = null;
    render(document.getElementById('app-container'));
}

window.deleteStore = async function(id) {
    window.showAppConfirm("Apakah Anda yakin ingin menghapus toko ini? Penghapusan ini tidak akan menghapus riwayat transaksi lama.", async () => {
        await db.stores.delete(id);
        render(document.getElementById('app-container'));
    });
}

// HANDLER EXPORT UTILS
window.exportTransactions = async function() {
    const transactions = await db.transactions.toArray();
    if (transactions.length === 0) return alert('Tidak ada data transaksi untuk diexport.');
    
    const data = transactions.map(tx => ({
        'ID Transaksi': tx.id,
        'Waktu': new Date(tx.timestamp).toLocaleString('id-ID'),
        'Subtotal': tx.subtotal || tx.total,
        'Diskon': tx.discount || 0,
        'Total': tx.total,
        'Metode Pembayaran': tx.paymentMethod,
        'Cabang': tx.storeBranch || 'Toko 1',
        'ID Member': tx.memberId || '-',
        'Nama Member': tx.memberName || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaksi");
    XLSX.writeFile(workbook, "Laporan_Transaksi.xlsx");
};

window.exportOpname = async function() {
    if (!db.stockOpnames) return alert('Fitur Opname belum siap.');
    const opnameLogs = await db.stockOpnames.toArray();
    if (opnameLogs.length === 0) return alert('Tidak ada data opname untuk diexport.');
    
    const data = opnameLogs.map(log => ({
        'Tanggal': new Date(log.timestamp).toLocaleString('id-ID'),
        'ID Produk': log.productId,
        'Nama Produk': log.productName,
        'Cabang': log.storeBranch,
        'Stok Sistem': log.systemStock,
        'Stok Riil (Fisik)': log.actualStock,
        'Selisih': log.difference,
        'Keterangan / Alasan': log.reason
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Opname");
    XLSX.writeFile(workbook, "Laporan_Stock_Opname.xlsx");
};

// HANDLER IMPORT & PRINT
window.downloadImportTemplate = function() {
    const templateData = [
        { 'Nama Produk': 'Contoh: Liquid Alpha 3mg', 'Kategori': 'Liquid', 'Harga Beli': 40000, 'Harga Jual': 65000, 'Stok Toko 1': 10, 'Stok Toko 2': 5 },
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template Import");
    XLSX.writeFile(workbook, "Template_Import_Produk.xlsx");
};

window.importProductsFromFile = async function(input) {
    const file = input.files[0];
    if (!file) return;

    const banner = document.getElementById('import-result-banner');
    banner.className = 'mb-3 p-3 rounded-xl text-xs font-semibold border';
    banner.classList.remove('hidden');
    banner.innerHTML = '⏳ Sedang memproses file...';
    banner.classList.add('bg-blue-50', 'dark:bg-blue-900/30', 'text-blue-700', 'dark:text-blue-300', 'border-blue-200', 'dark:border-blue-800');

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);

            if (rows.length === 0) {
                banner.innerHTML = '⚠️ File kosong atau format tidak dikenali. Pastikan menggunakan template yang benar.';
                banner.className = 'mb-3 p-3 rounded-xl text-xs font-semibold border bg-yellow-50 text-yellow-700 border-yellow-200';
                input.value = ''; return;
            }

            let added = 0, skipped = 0;
            const allStores = await db.stores.toArray();

            for (const row of rows) {
                const name = String(row['Nama Produk'] || '').trim();
                if (!name || name.startsWith('Contoh:')) { skipped++; continue; }

                const price = parseFloat(row['Harga Jual']) || 0;
                if (price <= 0) { skipped++; continue; }

                const purchasePrice = parseFloat(row['Harga Beli']) || 0;
                const category = String(row['Kategori'] || 'Accessories').trim();
                
                // Cari stock untuk setiap toko
                const stockData = {};
                let totalStock = 0;
                allStores.forEach(s => {
                   const storeNumMatch = s.id.match(/\d+/);
                   const storeNum = storeNumMatch ? storeNumMatch[0] : "1";
                   // Kolom excel bernama "Stok Toko 1", dll
                   const colName = `Stok ${s.name}`;
                   const val = parseInt(row[colName]) || parseInt(row[`Stok Toko ${storeNum}`]) || 0;
                   stockData[`stockToko${storeNum}`] = val;
                   totalStock += val;
                });

                const existing = await db.products.where('name').equalsIgnoreCase(name).first();
                if (existing) {
                    await db.products.update(existing.id, { category, purchasePrice, price, stock: totalStock, ...stockData });
                } else {
                    const id = 'PROD' + Date.now().toString().slice(-5) + Math.random().toString(36).slice(-2).toUpperCase();
                    await db.products.add({ id, name, category, purchasePrice, price, stock: totalStock, ...stockData });
                }
                added++;
            }

            banner.innerHTML = `✅ Import selesai! <strong>${added} produk</strong> berhasil ditambahkan/diperbarui.`;
            banner.className = 'mb-3 p-3 rounded-xl text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200';
            input.value = '';
            setTimeout(() => render(document.getElementById('app-container')), 800);
        } catch (err) {
            banner.innerHTML = `❌ Gagal memproses file: ${err.message}`;
            banner.className = 'mb-3 p-3 rounded-xl text-xs font-semibold border bg-red-50 text-red-700 border-red-200';
            input.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};

window.printStockChecklist = async function() {
    const products = await db.products.toArray();
    if (products.length === 0) return alert('Tidak ada produk untuk dicetak.');

    const activeStores = await db.stores.where('isActive').equals(1).toArray();
    let storeName = 'Mvape Shop';
    if (db.settings) {
        const cfg = await db.settings.get('receipt_template');
        if (cfg && cfg.value && cfg.value.storeName) storeName = cfg.value.storeName;
    }

    const grouped = {};
    products.forEach(p => {
        const cat = p.category || 'Lainnya';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    const printDate = new Date().toLocaleString('id-ID');
    
    // Generate Column Headers untuk Toko Aktif
    const storeHeaders = activeStores.map(s => `<th style="width:64px" class="center">Sistem ${s.name}</th>`).join('');
    
    let tableRows = '';
    let rowNum = 1;
    for (const [cat, items] of Object.entries(grouped)) {
        tableRows += `<tr class="cat-header"><td colspan="${3 + activeStores.length}">📁 ${cat}</td></tr>`;
        items.forEach(p => {
            const lowStock = (p.stock || 0) <= 3;
            
            // Kolom Stok Sistem per Cabang
            const storeCols = activeStores.map(s => {
                const sNum = s.id.match(/\d+/)[0];
                const sKey = `stockToko${sNum}`;
                return `<td class="center">${p[sKey] || 0}</td>`;
            }).join('');

            tableRows += `
            <tr class="${lowStock ? 'low-stock' : ''}">
                <td class="center muted">${rowNum++}</td>
                <td class="bold">${p.name}</td>
                ${storeCols}
                <td class="center bold ${lowStock ? 'warn' : ''}">${p.stock || 0}</td>
                <td class="check-col">
                   ${activeStores.map(() => `<span class="check-box"></span>`).join('')}
                </td>
            </tr>`;
        });
    }

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<title>Checklist Cek Fisik Stok</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; padding: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px;}
  th, td { border: 1px solid #ccc; padding: 6px; }
  th { background: #1a1a1a; color: #fff; font-size: 10px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  tr.cat-header td { background: #f0f0f0; font-weight: bold; }
  .check-box { display: inline-block; width: 14px; height: 14px; border: 1px solid #000; margin: 0 4px; }
</style>
</head>
<body>
    <h2>${storeName} - Checklist Cek Fisik Stok</h2>
    <p>Tanggal Cetak: ${printDate}</p>
    <table>
        <thead>
            <tr>
                <th style="width:30px">#</th>
                <th style="text-align:left">Nama Produk</th>
                ${storeHeaders}
                <th style="width:64px" class="center">Total</th>
                <th style="width:100px" class="center">Cek Riil</th>
            </tr>
        </thead>
        <tbody>${tableRows}</tbody>
    </table>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = function() { win.focus(); win.print(); };
};

// ========== HANDLER SHIFTS ==========
window.setShiftView = function(view) {
    shiftView = view;
    render(document.getElementById('app-container'));
};

window.setShiftFilterMonth = function(month) {
    shiftFilterMonth = month;
    render(document.getElementById('app-container'));
};

window.setShiftFilterStore = function(store) {
    shiftFilterStore = store;
    render(document.getElementById('app-container'));
};

// Modal catat kehadiran baru
window.showRecordAttendanceModal = async function() {
    const existing = document.getElementById('attendance-record-overlay');
    if (existing) existing.remove();

    const users = (await db.users.toArray()).filter(u => u.status === 'Aktif');
    const stores = (await db.stores.toArray()).filter(s => s.isActive);
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});

    const overlay = document.createElement('div');
    overlay.id = 'attendance-record-overlay';
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 max-w-md w-full p-6 shadow-xl">
            <div class="flex items-center justify-between mb-5">
                <h3 class="text-base font-bold text-gray-900 dark:text-white">✅ Catat Kehadiran</h3>
                <button onclick="document.getElementById('attendance-record-overlay').remove()" class="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
            </div>
            <form onsubmit="window.saveAttendanceRecord(event)" class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Karyawan <span class="text-red-500">*</span></label>
                        <select id="att-userId" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                            <option value="">Pilih karyawan...</option>
                            ${users.map(u => `<option value="${u.id}" data-store="${u.storeBranch||''}" data-name="${u.name}">${u.name} (${u.storeBranch||'-'})</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tanggal</label>
                        <input type="date" id="att-date" value="${today}" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                    </div>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Status Kehadiran <span class="text-red-500">*</span></label>
                    <div class="grid grid-cols-3 gap-2">
                        ${[['Hadir','✅','bg-emerald-500'],['Terlambat','⏰','bg-amber-500'],['Izin','📝','bg-blue-500'],['Sakit','🤒','bg-purple-500'],['Alpa','❌','bg-red-500'],['Libur','📅','bg-gray-500']].map(([val,icon,color],i)=>`
                        <button type="button" data-val="${val}" onclick="document.querySelectorAll('.att-status-btn').forEach(b=>b.classList.remove('ring-2','ring-offset-1')); this.classList.add('ring-2','ring-offset-1'); document.getElementById('att-status').value='${val}'"
                            class="att-status-btn p-2 ${color} text-white rounded-lg font-bold text-xs hover:opacity-90 transition ${i===0?'ring-2 ring-offset-1':''}">
                            ${icon} ${val}
                        </button>`).join('')}
                    </div>
                    <input type="hidden" id="att-status" value="Hadir">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Jam Masuk</label>
                        <input type="time" id="att-checkin" value="${nowTime}" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Jam Keluar</label>
                        <input type="time" id="att-checkout" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                    </div>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Catatan (Opsional)</label>
                    <input type="text" id="att-notes" placeholder="Catatan kehadiran..." class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="button" onclick="document.getElementById('attendance-record-overlay').remove()" class="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-lg hover:bg-gray-200 transition text-sm">Batal</button>
                    <button type="submit" class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition text-sm shadow">✅ Simpan</button>
                </div>
            </form>
        </div>
    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
};

window.saveAttendanceRecord = async function(e) {
    e.preventDefault();
    const userSelect = document.getElementById('att-userId');
    const userId   = userSelect.value;
    const userName = userSelect.selectedOptions[0]?.dataset.name || '';
    const storeBranch = userSelect.selectedOptions[0]?.dataset.store || '';
    const date     = document.getElementById('att-date').value;
    const status   = document.getElementById('att-status').value;
    const checkIn  = document.getElementById('att-checkin').value;
    const checkOut = document.getElementById('att-checkout').value;
    const notes    = document.getElementById('att-notes').value.trim();

    if (!userId) return alert('Pilih karyawan terlebih dahulu!');

    await db.attendances.add({
        id:           'ATT-' + Date.now(),
        userId,
        userName,
        storeBranch,
        date,
        status,
        checkInTime:  checkIn  || null,
        checkOutTime: checkOut || null,
        notes,
        createdAt:    new Date().toISOString(),
        updatedAt:    new Date().toISOString(),
    });
    document.getElementById('attendance-record-overlay').remove();
    render(document.getElementById('app-container'));
};

window.deleteAttendanceConfirm = function(attendanceId) {
    window.showAppConfirm('Hapus catatan kehadiran ini?', async () => {
        await db.attendances.delete(attendanceId);
        render(document.getElementById('app-container'));
    });
};

window.showCreateShiftModal = async function() {
    const users = await db.users.toArray();
    const stores = await db.stores.toArray();
    const activeUsers = users.filter(u => u.status === 'Aktif');
    const today = new Date().toISOString().split('T')[0];

    const overlay = document.createElement('div');
    overlay.id = 'shift-modal-overlay';
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 max-w-md w-full p-6 shadow-xl animate-scaleIn">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">➕ Buat Shift Baru</h3>
            
            <form onsubmit="window.saveShift(event)" class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Karyawan</label>
                    <select id="shift-userId" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white">
                        <option value="">Pilih Karyawan...</option>
                        ${activeUsers.map(u => `<option value="${u.id}">${u.name} (${u.storeBranch})</option>`).join('')}
                    </select>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tanggal</label>
                    <input type="date" id="shift-date" value="${today}" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white">
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Jenis Shift</label>
                    <div class="grid grid-cols-3 gap-2">
                        <button type="button" onclick="document.getElementById('shift-type').value = 'pagi'; this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('ring-2')); this.classList.add('ring-2'); this.classList.add('ring-indigo-500');" class="p-2 bg-yellow-100 text-yellow-800 rounded-lg font-bold text-xs hover:bg-yellow-200 transition ring-2 ring-indigo-500">🌅 Pagi</button>
                        <button type="button" onclick="document.getElementById('shift-type').value = 'siang'; this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('ring-2')); this.classList.add('ring-2'); this.classList.add('ring-indigo-500');" class="p-2 bg-blue-100 text-blue-800 rounded-lg font-bold text-xs hover:bg-blue-200 transition">☀️ Siang</button>
                        <button type="button" onclick="document.getElementById('shift-type').value = 'malam'; this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('ring-2')); this.classList.add('ring-2'); this.classList.add('ring-indigo-500');" class="p-2 bg-purple-100 text-purple-800 rounded-lg font-bold text-xs hover:bg-purple-200 transition">🌙 Malam</button>
                    </div>
                    <input type="hidden" id="shift-type" value="pagi">
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Catatan (Opsional)</label>
                    <textarea id="shift-notes" rows="2" placeholder="Catatan shift..." class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white"></textarea>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="document.getElementById('shift-modal-overlay').remove()" class="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-lg hover:bg-gray-200 transition">Batal</button>
                    <button type="submit" class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition">Simpan</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
};

window.saveShift = async function(e) {
    e.preventDefault();
    const userId = document.getElementById('shift-userId').value;
    const date = document.getElementById('shift-date').value;
    const shiftType = document.getElementById('shift-type').value;
    const notes = document.getElementById('shift-notes').value;

    if (!userId) return alert('Pilih karyawan terlebih dahulu!');

    try {
        const user = await db.users.get(userId);
        const storeId = user.storeBranch || 'Toko 1';

        const shiftData = {
            id: 'SFT-' + Date.now(),
            userId: userId,
            userName: user.name,
            storeId: storeId,
            date: date,
            shiftType: shiftType,
            status: 'scheduled',
            checkInTime: null,
            checkOutTime: null,
            notes: notes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await db.shifts.add(shiftData);
        alert('✅ Shift berhasil dibuat!');
        document.getElementById('shift-modal-overlay').remove();
        activeOwnerTab = 'shifts';
        render(document.getElementById('app-container'));
    } catch (err) {
        alert('❌ Gagal membuat shift: ' + err.message);
    }
};

window.editShift = async function(shiftId) {
    const shift = await db.shifts.get(shiftId);
    if (!shift) return alert('Shift tidak ditemukan!');
    
    editingShiftData = shift;
    editingShiftId = shiftId;
    
    const overlay = document.createElement('div');
    overlay.id = 'shift-modal-overlay';
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 max-w-md w-full p-6 shadow-xl">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">📝 Edit Shift</h3>
            
            <form onsubmit="window.updateShift(event)" class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Karyawan</label>
                    <input type="text" value="${shift.userName}" disabled class="w-full p-2.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-gray-300">
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Status</label>
                    <select id="edit-shift-status" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white">
                        <option value="scheduled" ${shift.status === 'scheduled' ? 'selected' : ''}>📅 Terjadwal</option>
                        <option value="ongoing" ${shift.status === 'ongoing' ? 'selected' : ''}>⏱️ Sedang Bekerja</option>
                        <option value="completed" ${shift.status === 'completed' ? 'selected' : ''}>✅ Selesai</option>
                    </select>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Catatan</label>
                    <textarea id="edit-shift-notes" rows="2" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white">${shift.notes || ''}</textarea>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="document.getElementById('shift-modal-overlay').remove()" class="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-lg hover:bg-gray-200 transition">Batal</button>
                    <button type="submit" class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition">Simpan</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
};

window.updateShift = async function(e) {
    e.preventDefault();
    const status = document.getElementById('edit-shift-status').value;
    const notes = document.getElementById('edit-shift-notes').value;

    try {
        await db.shifts.update(editingShiftId, {
            status: status,
            notes: notes,
            updatedAt: new Date().toISOString(),
        });
        alert('✅ Shift berhasil diperbarui!');
        document.getElementById('shift-modal-overlay').remove();
        editingShiftId = null;
        editingShiftData = null;
        render(document.getElementById('app-container'));
    } catch (err) {
        alert('❌ Gagal memperbarui shift: ' + err.message);
    }
};

window.deleteShiftConfirm = async function(shiftId) {
    if (confirm('Yakin ingin menghapus shift ini?')) {
        try {
            await db.shifts.delete(shiftId);
            alert('✅ Shift berhasil dihapus!');
            render(document.getElementById('app-container'));
        } catch (err) {
            alert('❌ Gagal menghapus shift: ' + err.message);
        }
    }
};

window.editAttendance = async function(attendanceId) {
    const attendance = await db.attendances.get(attendanceId);
    if (!attendance) return alert('Data kehadiran tidak ditemukan!');

    const overlay = document.createElement('div');
    overlay.id = 'attendance-modal-overlay';
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 max-w-md w-full p-6 shadow-xl">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">📋 Edit Kehadiran</h3>
            
            <form onsubmit="window.updateAttendance('${attendanceId}', event)" class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Karyawan</label>
                    <input type="text" value="${attendance.userName}" disabled class="w-full p-2.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-gray-300">
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tanggal</label>
                    <input type="text" value="${shiftModule.formatDate(attendance.date)}" disabled class="w-full p-2.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-gray-300">
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Status Kehadiran</label>
                    <select id="edit-att-status" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white">
                        <option value="Hadir" ${attendance.status === 'Hadir' ? 'selected' : ''}>✅ Hadir</option>
                        <option value="Terlambat" ${attendance.status === 'Terlambat' ? 'selected' : ''}>⚠️ Terlambat</option>
                        <option value="Izin" ${attendance.status === 'Izin' ? 'selected' : ''}>📋 Izin</option>
                        <option value="Sakit" ${attendance.status === 'Sakit' ? 'selected' : ''}>🏥 Sakit</option>
                        <option value="Alpa" ${attendance.status === 'Alpa' ? 'selected' : ''}>❌ Alpa</option>
                        <option value="Libur" ${attendance.status === 'Libur' ? 'selected' : ''}>📅 Libur</option>
                    </select>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Jam Login / Masuk</label>
                        <input type="time" id="edit-att-checkin" value="${attendance.checkInTime||''}" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Jam Logout / Keluar</label>
                        <input type="time" id="edit-att-checkout" value="${attendance.checkOutTime||''}" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white">
                    </div>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="document.getElementById('attendance-modal-overlay').remove()" class="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-lg hover:bg-gray-200 transition">Batal</button>
                    <button type="submit" class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition">Simpan</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
};

window.updateAttendance = async function(attendanceId, e) {
    e.preventDefault();
    const newStatus   = document.getElementById('edit-att-status').value;
    const checkIn     = document.getElementById('edit-att-checkin')?.value  || null;
    const checkOut    = document.getElementById('edit-att-checkout')?.value || null;

    try {
        await db.attendances.update(attendanceId, {
            status:       newStatus,
            checkInTime:  checkIn  || null,
            checkOutTime: checkOut || null,
            updatedAt:    new Date().toISOString(),
        });
        alert('✅ Kehadiran berhasil diperbarui!');
        document.getElementById('attendance-modal-overlay').remove();
        render(document.getElementById('app-container'));
    } catch (err) {
        alert('❌ Gagal memperbarui kehadiran: ' + err.message);
    }
};

export default { render };