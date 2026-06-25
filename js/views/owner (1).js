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

// State filter laporan per toko
let storeFilterMode = 'bulanan';   // 'harian' | 'mingguan' | 'bulanan' | 'tahunan'
let storeFilterDate  = new Date().toISOString().split('T')[0];          // YYYY-MM-DD
let storeFilterWeek  = '';                                                 // YYYY-Www (diisi dinamis)
let storeFilterMonth = new Date().toISOString().substring(0, 7);        // YYYY-MM
let storeFilterYear  = String(new Date().getFullYear());                 // YYYY

// Simpan data transaksi & pengeluaran terakhir agar bisa di-refresh tanpa re-fetch
let _financeCache = { transactions: [], expenses: [], transactionItems: [], products: [], receivables: [] };
// Mode grafik aktif (daily | monthly | yearly)
if (!window._salesChartMode) window._salesChartMode = 'daily';
let editingUserId = null;
let editingStoreId = null;

const ALL_OWNER_TABS = [
    { 
        key: 'finance',   
        icon: '📊', 
        label: 'Laporan',
        hasSubmenu: true,
        submenus: [
            { key: 'finance_umum', label: 'Laporan Umum' },
            { key: 'finance_per_toko', label: 'Lap. Per Toko', 
              hasSubmenu: true,
              submenus: [
                { key: 'finance_per_toko_ringkasan', label: 'Ringkasan Per Toko' },
                { key: 'finance_per_toko_jurnal', label: 'Jurnal Pendapatan' }
              ]
            }
        ]
    },
    { 
        key: 'inventory',   
        icon: '📦', 
        label: 'Stok',
        hasSubmenu: true,
        submenus: [
            { key: 'inventory_opname',   icon: '📋', label: 'Opname'  },
            { key: 'inventory_products', icon: '🛠️', label: 'Produk'  }
        ]
    },
    { key: 'members',   icon: '👥', label: 'Member'   },
    { key: 'users',     icon: '🔑', label: 'Kasir'    },
    { key: 'shifts',    icon: '⏰', label: 'Shift'    },
    { key: 'receipt',   icon: '🧾', label: 'Struk'    },
    { key: 'stores',    icon: '🏪', label: 'Toko'     },
];

function loadTabVisibility() {
    try {
        const saved = JSON.parse(localStorage.getItem('ownerTabVisibility') || '{}');
        const result = {};
        ALL_OWNER_TABS.forEach(t => { 
            result[t.key] = saved[t.key] !== false;
            if (t.submenus) t.submenus.forEach(s => result[s.key] = saved[s.key] !== false);
        });
        return result;
    } catch { 
        const result = {};
        ALL_OWNER_TABS.forEach(t => {
            result[t.key] = true;
            if (t.submenus) t.submenus.forEach(s => result[s.key] = true);
        });
        return result;
    }
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

    // Pastikan activeOwnerTab tidak pointing ke tab utama jika tersembunyi
    const parentKey = activeOwnerTab.startsWith('finance') ? 'finance' : activeOwnerTab;
    if (!tabVis[parentKey]) {
        activeOwnerTab = ALL_OWNER_TABS.find(t => tabVis[t.key])?.key || 'finance_umum';
    }
    if (activeOwnerTab === 'finance' || activeOwnerTab === 'finance_per_toko') {
        activeOwnerTab = 'finance_umum'; // set default sub-menu pertama yang aktif
    }

    if (window.registerSubTabs) {
        const isFinancePage = activeOwnerTab === 'finance' || activeOwnerTab.startsWith('finance_');
        const isStockPage = activeOwnerTab === 'inventory' || activeOwnerTab.startsWith('inventory_');
        const subTabsList = [];
        ALL_OWNER_TABS.filter(t => tabVis[t.key]).forEach(t => {
            subTabsList.push({
                key: t.key, label: t.label, icon: t.icon,
                active: (t.key === 'finance' && isFinancePage) || (t.key === 'inventory' && isStockPage) || activeOwnerTab === t.key,
                onClick: `window.switchOwnerTab('${t.key}')`,
                indent: false,
            });
            
            // Show finance submenus when in finance tab
            if (t.key === 'finance' && isFinancePage && t.submenus) {
                t.submenus.forEach(sub => {
                    subTabsList.push({
                        key: sub.key, label: sub.label, icon: t.icon,
                        active: activeOwnerTab === sub.key || (sub.submenus && sub.submenus.some(s => s.key === activeOwnerTab)),
                        onClick: `window.switchOwnerTab('${sub.key}')`,
                        indent: true,
                    });
                    
                    // Show nested submenus if available
                    if (sub.submenus && (activeOwnerTab === sub.key || sub.submenus.some(s => s.key === activeOwnerTab))) {
                        sub.submenus.forEach(nested => {
                            subTabsList.push({
                                key: nested.key, label: nested.label, icon: '└─',
                                active: activeOwnerTab === nested.key,
                                onClick: `window.switchOwnerTab('${nested.key}')`,
                                indent: true,
                            });
                        });
                    }
                });
            }
            
            // Show stock submenus when in stock tab
            if (t.key === 'inventory' && isStockPage && t.submenus) {
                t.submenus.forEach(sub => subTabsList.push({
                    key: sub.key, label: sub.label, icon: sub.icon,
                    active: activeOwnerTab === sub.key,
                    onClick: `window.switchOwnerTab('${sub.key}')`,
                    indent: true,
                }));
            }
        });
        window.registerSubTabs(subTabsList);
    }

    // Render tombol tab hanya yang visible
    const tabButtonsHTML = ALL_OWNER_TABS
        .filter(t => tabVis[t.key])
        .map(t => {
            if (t.hasSubmenu) {
                const isSubActive = activeOwnerTab.startsWith(t.key);
                const activeSub = t.submenus.find(sub => sub.key === activeOwnerTab || (sub.submenus && sub.submenus.some(s => s.key === activeOwnerTab)));
                const currentLabel = activeSub ? activeSub.label : t.label;
                
                return `
                    <div class="relative flex-1 lg:flex-none">
                        <button onclick="document.getElementById('dropdown-${t.key}').classList.toggle('hidden')"
                            class="w-full flex items-center justify-between gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition ${isSubActive ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}">
                            <span>${t.icon} ${currentLabel}</span>
                            <svg class="w-3 h-3 opacity-60" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
                        </button>
                        <div id="dropdown-${t.key}" class="hidden absolute left-0 mt-1.5 z-50 min-w-[160px] bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl p-1 space-y-0.5">
                            ${t.submenus.map(sub => `
                                ${sub.submenus ? `
                                    <div class="relative">
                                        <button onclick="event.stopPropagation(); document.getElementById('dropdown-${sub.key}').classList.toggle('hidden')"
                                            class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between ${activeOwnerTab === sub.key || sub.submenus.some(s => s.key === activeOwnerTab) ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}">
                                            <span>${sub.label}</span>
                                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                                        </button>
                                        <div id="dropdown-${sub.key}" class="hidden absolute left-full ml-0 top-0 mt-0 w-[160px] bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl p-1 space-y-0.5">
                                            ${sub.submenus.map(nested => `
                                                <button onclick="window.switchOwnerTab('${nested.key}'); document.getElementById('dropdown-${t.key}').classList.add('hidden'); document.getElementById('dropdown-${sub.key}').classList.add('hidden')"
                                                    class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${activeOwnerTab === nested.key ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}">
                                                    └─ ${nested.label}
                                                </button>
                                            `).join('')}
                                        </div>
                                    </div>
                                ` : `
                                    <button onclick="window.switchOwnerTab('${sub.key}'); document.getElementById('dropdown-${t.key}').classList.add('hidden')"
                                        class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${activeOwnerTab === sub.key ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}">
                                        ${sub.label}
                                    </button>
                                `}
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            return `
                <button onclick="window.switchOwnerTab('${t.key}')"
                    class="flex-1 lg:flex-none px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition ${activeOwnerTab === t.key ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}">
                    ${t.icon} ${t.label}
                </button>`;
        }).join('');

    // Determine which content to render
    let contentHTML = '';
    
    // Cache data for finance functions
    _financeCache = { transactions, expenses, transactionItems, products, receivables, activeStores };

    if (activeOwnerTab === 'finance_umum') {
        contentHTML = renderFinanceTab(products, transactions, transactionItems, expenses, receivables, activeStores);
    } else if (activeOwnerTab === 'finance_per_toko') {
        contentHTML = renderStoreComparisonOverview(products, transactions, transactionItems, expenses, receivables, activeStores);
    } else if (activeOwnerTab === 'finance_per_toko_ringkasan') {
        contentHTML = renderStoreSummaryPage(products, transactions, transactionItems, expenses, receivables, activeStores);
    } else if (activeOwnerTab === 'finance_per_toko_jurnal') {
        contentHTML = renderJournalRevenueDetailPage(products, transactions, transactionItems, expenses, receivables, activeStores);
    } else if (activeOwnerTab.startsWith('inventory')) {
        contentHTML = renderStockTab(activeOwnerTab, products, mutations, opnameLogs, activeStores);
    } else if (activeOwnerTab === 'members') {
        contentHTML = renderMembersTab(members, activeStores);
    } else if (activeOwnerTab === 'users') {
        contentHTML = renderUsersTab(users, activeStores);
    } else if (activeOwnerTab === 'shifts') {
        contentHTML = renderShiftsTab(shifts, attendances, shiftSchedules, users, activeStores);
    } else if (activeOwnerTab === 'receipt') {
        contentHTML = renderReceiptTab(receiptConfig);
    } else if (activeOwnerTab === 'stores') {
        contentHTML = renderStoresTab(allStores);
    }

    container.innerHTML = `
        <div class="p-4 md:p-6">
            <!-- Tab Navigation -->
            <div class="flex flex-wrap gap-2 mb-6 sticky top-4 md:top-6 z-30 bg-gradient-to-b from-gray-50 dark:from-gray-950 to-transparent pb-4">
                ${tabButtonsHTML}
            </div>

            <!-- Content Area -->
            <div id="tab-content-container">
                ${contentHTML}
            </div>
        </div>
    `;
}

// ════════════════════════════════════════════════════════════════════════════════
// RENDER FINANCE TAB - LAPORAN UMUM
// ════════════════════════════════════════════════════════════════════════════════

function renderFinanceTab(products, transactions, transactionItems, expenses, receivables, activeStores) {
    // ... (Keep existing renderFinanceTab code from original file)
    // For brevity, I'll show a simplified version
    return `<div class="text-gray-600">Laporan Umum - Render existing content here</div>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// RENDER STORE COMPARISON OVERVIEW PAGE
// ════════════════════════════════════════════════════════════════════════════════

function renderStoreComparisonOverview(products, transactions, transactionItems, expenses, receivables, activeStores) {
    const storeNames = activeStores.map(s => s.name);
    const today = new Date().toISOString().split('T')[0];
    
    // Filter transactions by date range
    const filteredTx = transactions.filter(tx => {
        const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
        if (storeFilterMode === 'harian') return txDate === storeFilterDate;
        if (storeFilterMode === 'mingguan') return txDate.startsWith(storeFilterWeek);
        if (storeFilterMode === 'bulanan') return txDate.startsWith(storeFilterMonth);
        if (storeFilterMode === 'tahunan') return txDate.startsWith(storeFilterYear);
        return false;
    });

    // Per store stats
    const perStore = {};
    storeNames.forEach(name => {
        const storeTx = filteredTx.filter(tx => (tx.storeBranch || '') === name);
        const storeExp = expenses.filter(exp => (exp.storeBranch || '') === name);
        
        const grossSales = storeTx.reduce((sum, tx) => sum + tx.total, 0);
        const totalExpenses = storeExp.reduce((sum, exp) => sum + exp.amount, 0);
        
        perStore[name] = {
            grossSales,
            expenses: totalExpenses,
            txCount: storeTx.length
        };
    });

    const periodLabel = storeFilterMode === 'harian' ? storeFilterDate :
                        storeFilterMode === 'mingguan' ? storeFilterWeek :
                        storeFilterMode === 'bulanan' ? storeFilterMonth :
                        storeFilterMode === 'tahunan' ? storeFilterYear : 'Semua';

    return `
        <div class="space-y-6">
            <!-- Header with navigation links -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-6">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">📊 Laporan Per Toko</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">Pilih laporan detail yang ingin dilihat</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onclick="window.switchOwnerTab('finance_per_toko_ringkasan')" 
                        class="p-4 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition text-left">
                        <div class="text-2xl mb-2">🏪</div>
                        <h3 class="font-bold text-gray-900 dark:text-white">Ringkasan Per Toko</h3>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Lihat ringkasan omset, pengeluaran, dan piutang per toko</p>
                    </button>
                    
                    <button onclick="window.switchOwnerTab('finance_per_toko_jurnal')" 
                        class="p-4 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition text-left">
                        <div class="text-2xl mb-2">📖</div>
                        <h3 class="font-bold text-gray-900 dark:text-white">Jurnal Transaksi Pendapatan</h3>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Lihat detail semua transaksi pendapatan dengan filter toko</p>
                    </button>
                </div>
            </div>

            <!-- Quick Stats -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Omset</p>
                    <h3 class="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">Rp ${Object.values(perStore).reduce((sum, s) => sum + s.grossSales, 0).toLocaleString('id-ID')}</h3>
                    <p class="text-[10px] text-gray-500 mt-2">${Object.values(perStore).reduce((sum, s) => sum + s.txCount, 0)} transaksi</p>
                </div>
            </div>
        </div>
    `;
}

// ════════════════════════════════════════════════════════════════════════════════
// RENDER STORE SUMMARY PAGE - HALAMAN RINGKASAN PER TOKO
// ════════════════════════════════════════════════════════════════════════════════

function renderStoreSummaryPage(products, transactions, transactionItems, expenses, receivables, activeStores) {
    const storeNames = activeStores.map(s => s.name);
    
    // Filter transactions by date range
    const filteredTx = transactions.filter(tx => {
        const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
        if (storeFilterMode === 'harian') return txDate === storeFilterDate;
        if (storeFilterMode === 'mingguan') return txDate.startsWith(storeFilterWeek);
        if (storeFilterMode === 'bulanan') return txDate.startsWith(storeFilterMonth);
        if (storeFilterMode === 'tahunan') return txDate.startsWith(storeFilterYear);
        return false;
    });

    // Per store stats
    const perStore = {};
    storeNames.forEach(name => {
        const storeTx = filteredTx.filter(tx => (tx.storeBranch || '') === name);
        const storeExp = expenses.filter(exp => (exp.storeBranch || '') === name);
        const storeRec = receivables.filter(rec => (rec.storeBranch || '') === name);
        
        const grossSales = storeTx.reduce((sum, tx) => sum + tx.total, 0);
        const totalExpenses = storeExp.reduce((sum, exp) => sum + exp.amount, 0);
        const piutangBelum = storeRec.filter(r => r.status === 'Belum').reduce((sum, r) => sum + r.amount, 0);
        const piutangLunas = storeRec.filter(r => r.status === 'Lunas').reduce((sum, r) => sum + r.amount, 0);
        
        perStore[name] = {
            grossSales,
            expenses: totalExpenses,
            txCount: storeTx.length,
            piutangBelum,
            piutangLunas
        };
    });

    const totalGrossSales = Object.values(perStore).reduce((sum, s) => sum + s.grossSales, 0);
    const totalExpenses = Object.values(perStore).reduce((sum, s) => sum + s.expenses, 0);
    const totalNetRevenue = totalGrossSales - totalExpenses;
    const totalTxCount = Object.values(perStore).reduce((sum, s) => sum + s.txCount, 0);
    const totalPiutangBelum = Object.values(perStore).reduce((sum, s) => sum + s.piutangBelum, 0);
    const totalPiutangLunas = Object.values(perStore).reduce((sum, s) => sum + s.piutangLunas, 0);

    const periodLabel = storeFilterMode === 'harian' ? storeFilterDate :
                        storeFilterMode === 'mingguan' ? `Minggu ${storeFilterWeek}` :
                        storeFilterMode === 'bulanan' ? storeFilterMonth :
                        storeFilterMode === 'tahunan' ? storeFilterYear : 'Semua';

    // Build filter selector HTML
    let filterSelectorHTML = '';
    if (storeFilterMode === 'harian') {
        filterSelectorHTML = `<input type="date" value="${storeFilterDate}" onchange="window.changeStoreFilterDate(this.value)" 
            class="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-white">`;
    } else if (storeFilterMode === 'mingguan') {
        filterSelectorHTML = `<input type="week" value="${storeFilterWeek}" onchange="window.changeStoreFilterWeek(this.value)" 
            class="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-white">`;
    } else if (storeFilterMode === 'bulanan') {
        filterSelectorHTML = `<input type="month" value="${storeFilterMonth}" onchange="window.changeStoreFilterMonth(this.value)" 
            class="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-white">`;
    } else if (storeFilterMode === 'tahunan') {
        filterSelectorHTML = `<input type="number" value="${storeFilterYear}" min="2000" max="${new Date().getFullYear() + 5}" onchange="window.changeStoreFilterYear(this.value)" 
            class="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-white" placeholder="Tahun">`;
    }

    return `
        <div class="space-y-6">
            <!-- Breadcrumb & Header -->
            <div class="flex items-center gap-2 text-sm">
                <button onclick="window.switchOwnerTab('finance_per_toko')" class="text-indigo-600 dark:text-indigo-400 hover:underline">← Kembali ke Laporan Per Toko</button>
            </div>

            <!-- Filter Controls -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
                <div class="space-y-3">
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider">Filter Periode</label>
                    <div class="flex flex-wrap gap-2 mb-4">
                        ${['harian', 'mingguan', 'bulanan', 'tahunan'].map(mode => `
                            <button onclick="window.changeStoreFilterMode('${mode}')"
                                class="px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold capitalize transition ${storeFilterMode === mode ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}">
                                ${mode}
                            </button>
                        `).join('')}
                    </div>
                    <!-- Date Selector -->
                    ${filterSelectorHTML}
                </div>
            </div>

            <!-- DASHBOARD OVERVIEW CARDS -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 card-hover">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Omset Kotor</p>
                            <h3 class="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">Rp ${totalGrossSales.toLocaleString('id-ID')}</h3>
                        </div>
                        <span class="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-lg">🏪</span>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-2">${totalTxCount} total transaksi</p>
                </div>

                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 card-hover">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Pengeluaran</p>
                            <h3 class="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-2">Rp ${totalExpenses.toLocaleString('id-ID')}</h3>
                        </div>
                        <span class="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl text-lg">💸</span>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-2">Seluruh cabang</p>
                </div>

                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 card-hover">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Pendapatan Bersih</p>
                            <h3 class="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">Rp ${totalNetRevenue.toLocaleString('id-ID')}</h3>
                        </div>
                        <span class="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-lg">💰</span>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-2">Omset - Pengeluaran</p>
                </div>

                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 card-hover">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Piutang Berjalan</p>
                            <h3 class="text-xl font-extrabold text-red-600 dark:text-red-400 mt-2">Rp ${totalPiutangBelum.toLocaleString('id-ID')}</h3>
                        </div>
                        <span class="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-lg">⚠️</span>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-2">Lunas: Rp ${totalPiutangLunas.toLocaleString('id-ID')}</p>
                </div>
            </div>

            <!-- DETAIL TABLE -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div class="px-5 py-4 border-b dark:border-gray-800 flex items-center justify-between">
                    <h3 class="text-sm font-bold text-gray-800 dark:text-white">Rincian Perbandingan Toko</h3>
                    <span class="text-[11px] font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">${periodLabel}</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                        <thead>
                            <tr class="border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                                <th class="p-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Toko</th>
                                <th class="p-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Transaksi</th>
                                <th class="p-4 text-right text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Omset Kotor</th>
                                <th class="p-4 text-right text-[10px] font-bold text-rose-400 uppercase tracking-wider">Pengeluaran</th>
                                <th class="p-4 text-right text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Omset Bersih</th>
                                <th class="p-4 text-right text-[10px] font-bold text-red-400 uppercase tracking-wider">Piutang Belum</th>
                                <th class="p-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Piutang Lunas</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-gray-800">
                            ${storeNames.map((name, idx) => {
                                const d = perStore[name];
                                const net = d.grossSales - d.expenses;
                                const colors = ['indigo','violet','teal','amber','rose'];
                                const c = colors[idx % colors.length];
                                return `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                    <td class="p-4">
                                        <div class="flex items-center gap-2">
                                            <span class="w-2.5 h-2.5 rounded-full bg-${c}-500 shrink-0"></span>
                                            <span class="font-bold text-gray-800 dark:text-gray-200 text-sm">${name}</span>
                                        </div>
                                    </td>
                                    <td class="p-4 text-right font-semibold text-gray-600 dark:text-gray-400">${d.txCount} tx</td>
                                    <td class="p-4 text-right font-bold text-indigo-600 dark:text-indigo-400">Rp ${d.grossSales.toLocaleString('id-ID')}</td>
                                    <td class="p-4 text-right font-bold text-rose-600 dark:text-rose-400">-Rp ${d.expenses.toLocaleString('id-ID')}</td>
                                    <td class="p-4 text-right font-extrabold text-emerald-600 dark:text-emerald-400">Rp ${net.toLocaleString('id-ID')}</td>
                                    <td class="p-4 text-right font-bold text-red-600 dark:text-red-400">Rp ${d.piutangBelum.toLocaleString('id-ID')}</td>
                                    <td class="p-4 text-right font-semibold text-gray-600 dark:text-gray-400">Rp ${d.piutangLunas.toLocaleString('id-ID')}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                        <tfoot>
                            <tr class="bg-gray-50/50 dark:bg-gray-800/50 border-t-2 dark:border-gray-700 font-bold text-xs text-gray-800 dark:text-gray-200">
                                <td class="p-4">Total Gabungan</td>
                                <td class="p-4 text-right">${totalTxCount} tx</td>
                                <td class="p-4 text-right text-indigo-600 dark:text-indigo-400">Rp ${totalGrossSales.toLocaleString('id-ID')}</td>
                                <td class="p-4 text-right text-rose-600 dark:text-rose-400">-Rp ${totalExpenses.toLocaleString('id-ID')}</td>
                                <td class="p-4 text-right text-emerald-600 dark:text-emerald-400 font-extrabold">Rp ${totalNetRevenue.toLocaleString('id-ID')}</td>
                                <td class="p-4 text-right text-red-600 dark:text-red-400">Rp ${totalPiutangBelum.toLocaleString('id-ID')}</td>
                                <td class="p-4 text-right">Rp ${totalPiutangLunas.toLocaleString('id-ID')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ════════════════════════════════════════════════════════════════════════════════
// RENDER JOURNAL REVENUE DETAIL PAGE - HALAMAN JURNAL TRANSAKSI PENDAPATAN
// ════════════════════════════════════════════════════════════════════════════════

function renderJournalRevenueDetailPage(products, transactions, transactionItems, expenses, receivables, activeStores) {
    const storeNames = activeStores.map(s => s.name);
    
    // Filter transactions by date range
    const filteredTx = transactions.filter(tx => {
        const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
        if (storeFilterMode === 'harian') return txDate === storeFilterDate;
        if (storeFilterMode === 'mingguan') return txDate.startsWith(storeFilterWeek);
        if (storeFilterMode === 'bulanan') return txDate.startsWith(storeFilterMonth);
        if (storeFilterMode === 'tahunan') return txDate.startsWith(storeFilterYear);
        return false;
    });

    // Apply store filter
    let txForJurnal = filteredTx;
    if (financeFilterStore !== 'semua') {
        txForJurnal = filteredTx.filter(tx => (tx.storeBranch || '') === financeFilterStore);
    }

    const jurnalRev = txForJurnal.reduce((sum, tx) => sum + tx.total, 0);

    const periodLabel = storeFilterMode === 'harian' ? storeFilterDate :
                        storeFilterMode === 'mingguan' ? `Minggu ${storeFilterWeek}` :
                        storeFilterMode === 'bulanan' ? storeFilterMonth :
                        storeFilterMode === 'tahunan' ? storeFilterYear : 'Semua';

    // Build filter selector HTML
    let filterSelectorHTML = '';
    if (storeFilterMode === 'harian') {
        filterSelectorHTML = `<input type="date" value="${storeFilterDate}" onchange="window.changeStoreFilterDate(this.value)" 
            class="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-white">`;
    } else if (storeFilterMode === 'mingguan') {
        filterSelectorHTML = `<input type="week" value="${storeFilterWeek}" onchange="window.changeStoreFilterWeek(this.value)" 
            class="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-white">`;
    } else if (storeFilterMode === 'bulanan') {
        filterSelectorHTML = `<input type="month" value="${storeFilterMonth}" onchange="window.changeStoreFilterMonth(this.value)" 
            class="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-white">`;
    } else if (storeFilterMode === 'tahunan') {
        filterSelectorHTML = `<input type="number" value="${storeFilterYear}" min="2000" max="${new Date().getFullYear() + 5}" onchange="window.changeStoreFilterYear(this.value)" 
            class="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-white" placeholder="Tahun">`;
    }

    return `
        <div class="space-y-6">
            <!-- Breadcrumb & Header -->
            <div class="flex items-center gap-2 text-sm">
                <button onclick="window.switchOwnerTab('finance_per_toko')" class="text-indigo-600 dark:text-indigo-400 hover:underline">← Kembali ke Laporan Per Toko</button>
            </div>

            <!-- Filter Controls -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
                <div class="space-y-3">
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider">Filter Periode</label>
                    <div class="flex flex-wrap gap-2 mb-4">
                        ${['harian', 'mingguan', 'bulanan', 'tahunan'].map(mode => `
                            <button onclick="window.changeStoreFilterMode('${mode}')"
                                class="px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold capitalize transition ${storeFilterMode === mode ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}">
                                ${mode}
                            </button>
                        `).join('')}
                    </div>
                    <!-- Date Selector -->
                    ${filterSelectorHTML}
                </div>
            </div>

            <!-- JOURNAL TABLE -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div class="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-800 flex flex-wrap items-center gap-3">
                    <div class="flex items-center gap-2">
                        <span class="text-sm">📖</span>
                        <h3 class="text-sm font-bold text-gray-800 dark:text-white">Jurnal Transaksi Pendapatan</h3>
                        <span class="text-[11px] font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">${periodLabel}</span>
                    </div>
                    <div class="ml-auto flex items-center gap-3">
                        <span class="text-xs text-gray-500 dark:text-gray-400">${txForJurnal.length} transaksi · <span class="font-bold text-emerald-600 dark:text-emerald-400">Rp ${jurnalRev.toLocaleString('id-ID')}</span></span>
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
                <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
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
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
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
        </div>
    `;
}

// Stub functions for other tabs (implement these based on your original code)
function renderStockTab(activeTab, products, mutations, opnameLogs, activeStores) {
    return `<div class="text-gray-600">Stok Tab - Render existing content here</div>`;
}
function renderMembersTab(members, activeStores) {
    return `<div class="text-gray-600">Members Tab - Render existing content here</div>`;
}
function renderUsersTab(users, activeStores) {
    return `<div class="text-gray-600">Users Tab - Render existing content here</div>`;
}
function renderShiftsTab(shifts, attendances, shiftSchedules, users, activeStores) {
    return `<div class="text-gray-600">Shifts Tab - Render existing content here</div>`;
}
function renderReceiptTab(receiptConfig) {
    return `<div class="text-gray-600">Receipt Tab - Render existing content here</div>`;
}
function renderStoresTab(allStores) {
    return `<div class="text-gray-600">Stores Tab - Render existing content here</div>`;
}

// ── Global Functions ───────────────────────────────────────────────────────

window.switchOwnerTab = function(tabKey) {
    activeOwnerTab = tabKey;
    render(document.getElementById('app-container'));
};

window.changeStoreFilterMode = function(mode) {
    storeFilterMode = mode;
    render(document.getElementById('app-container'));
};

window.changeStoreFilterDate = function(val) {
    storeFilterDate = val;
    render(document.getElementById('app-container'));
};

window.changeStoreFilterWeek = function(val) {
    storeFilterWeek = val;
    render(document.getElementById('app-container'));
};

window.changeStoreFilterMonth = function(val) {
    storeFilterMonth = val;
    render(document.getElementById('app-container'));
};

window.changeStoreFilterYear = function(val) {
    storeFilterYear = val;
    render(document.getElementById('app-container'));
};

window.setJurnalStoreFilter = function(store) {
    financeFilterStore = store;
    render(document.getElementById('app-container'));
};

export default { render };
