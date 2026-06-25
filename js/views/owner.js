import db from '../db.js';
import storeReport from './storeReport.js';

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
            { key: 'finance_per_toko', label: 'Lap. Per Toko' }
        ]
    },
    { key: 'inventory', icon: '📦', label: 'Stok',
        hasSubmenu: true,
        submenus: [
            { key: 'inventory_opname',     icon: '📋', label: 'Opname'    },
            { key: 'inventory_products',   icon: '🛠️', label: 'Produk'    },
            { key: 'inventory_categories', icon: '🏷️', label: 'Kategori'  },
        ]
    },
    { key: 'members',   icon: '👥', label: 'Member'   },
    { key: 'users',     icon: '🔑', label: 'Kasir'    },
    { key: 'shifts',    icon: '⏰', label: 'Shift'    },
    { key: 'receipt',   icon: '🧾', label: 'Struk'    },
    { key: 'stores',    icon: '🏪', label: 'Toko'     },
];

const STOCK_SUB_TABS = [
    { key: 'inventory_opname',     icon: '📋', label: 'Opname'    },
    { key: 'inventory_products',   icon: '🛠️', label: 'Produk'    },
    { key: 'inventory_categories', icon: '🏷️', label: 'Kategori'  },
];

function loadTabVisibility() {
    try {
        const saved = JSON.parse(localStorage.getItem('ownerTabVisibility') || '{}');
        const result = {};
        ALL_OWNER_TABS.forEach(t => { result[t.key] = saved[t.key] !== false; });
        return result;
    } catch { return Object.fromEntries(ALL_OWNER_TABS.map(t => [t.key, true])); }
}
function saveTabVisibility(vis) {
    localStorage.setItem('ownerTabVisibility', JSON.stringify(vis));
}

// Global helper untuk membuka modal dinamis
window.openOwnerModal = function(modalId) {
    const el = document.getElementById(modalId);
    if(el) {
        el.classList.remove('hidden');
        el.classList.add('flex');
    }
};

window.closeOwnerModal = function(modalId) {
    const el = document.getElementById(modalId);
    if(el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
    }
};

async function render(container) {
    const transactions = await db.transactions.toArray();
    const products = await db.products.toArray();
    const mutations = await db.stock_mutations ? await db.stock_mutations.toArray() : [];
    const transactionItems = await db.transactionItems ? await db.transactionItems.toArray() : [];
    
    let allStores = [];
    if(db.stores) allStores = await db.stores.toArray();
    const activeStores = allStores.filter(s => s.isActive);
    
    let members = [];
    if (db.members) members = await db.members.toArray();

    let users = [];
    if (db.users) users = await db.users.toArray();

    let receivables = [];
    if (db.receivables) receivables = await db.receivables.toArray();

    let receiptConfig = { storeName: 'Vapestore', address: '', phone: '', footer: '' };
    let expenses = [];
    if (db.settings) {
        const configData = await db.settings.get('receipt_template');
        if (configData) receiptConfig = configData.value;
    }
    if (db.expenses) expenses = await db.expenses.toArray();

    let opnameLogs = [];
    if (db.stockOpnames) opnameLogs = await db.stockOpnames.toArray();

    let categories = [];
    if (db.categories) categories = await db.categories.toArray();
    categories.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    let shifts = [];
    let attendances = [];
    let shiftSchedules = [];
    if (db.shifts) shifts = await db.shifts.toArray();
    if (db.attendances) attendances = await db.attendances.toArray();
    if (db.shiftSchedules) shiftSchedules = await db.shiftSchedules.toArray();

    const tabVis = loadTabVisibility();
    const parentKey = activeOwnerTab.startsWith('finance') ? 'finance'
                    : activeOwnerTab.startsWith('inventory') ? 'inventory'
                    : activeOwnerTab;
    if (!tabVis[parentKey]) {
        activeOwnerTab = ALL_OWNER_TABS.find(t => tabVis[t.key])?.key || 'finance_umum';
    }
    if (activeOwnerTab === 'finance') activeOwnerTab = 'finance_umum';
    if (activeOwnerTab === 'inventory') activeOwnerTab = 'inventory_opname';

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
            if (t.key === 'finance' && isFinancePage && t.hasSubmenu) {
                t.submenus.forEach(sub => subTabsList.push({
                    key: sub.key, label: sub.label, icon: t.icon,
                    active: activeOwnerTab === sub.key,
                    onClick: `window.switchOwnerTab('${sub.key}')`,
                    indent: true,
                }));
            }
            if (t.key === 'inventory' && isStockPage) {
                STOCK_SUB_TABS.forEach(sub => subTabsList.push({
                    key: sub.key, label: sub.label, icon: sub.icon,
                    active: activeOwnerTab === sub.key,
                    onClick: `window.switchOwnerTab('${sub.key}')`,
                    indent: true,
                }));
            }
        });
        window.registerSubTabs(subTabsList);
    }

    container.innerHTML = `
        <div class="flex flex-col border-b dark:border-gray-800 pb-4 mb-6">
            <div>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Panel Kendali Owner</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">Pantau laporan keuangan detail, penjualan, logistik, dan pengaturan toko.</p>
            </div>
        </div>

        <div id="tab-content-container"></div>
        
        <div id="detail-modal" class="fixed inset-0 bg-black/50 dark:bg-black/80 z-50 flex items-center justify-center p-4 hidden backdrop-blur-sm" onclick="if(event.target === this) window.closeModal()">
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
    
    const tabContent = document.getElementById('tab-content-container');
    
    if (activeOwnerTab === 'finance_per_toko') {
        const contentDiv = document.createElement('div');
        contentDiv.id = 'store-report-container';
        tabContent.appendChild(contentDiv);
        storeReport.render(contentDiv);        
    } else if (activeOwnerTab.startsWith('finance')) {
        _financeCache = { transactions, expenses, transactionItems, products, receivables, activeStores };
        renderFinanceTab(tabContent, products, transactions, transactionItems, expenses, receivables, activeStores);
    } else if (activeOwnerTab === 'inventory_opname') {
        renderOpnameTab(tabContent, products, opnameLogs, allStores, activeStores);
    } else if (activeOwnerTab === 'inventory_products') {
        renderProductsTab(tabContent, products, allStores, activeStores, categories);
    } else if (activeOwnerTab === 'inventory_categories') {
        renderCategoriesTab(tabContent, categories, products);
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

    if (activeOwnerTab === 'inventory_opname') {
        window._initProductSearchboxes(products, activeStores);
    }
}

// --- SUB TAB 1: LAPORAN KEUANGAN ---
function renderFinanceTab(target, products, transactions, transactionItems, expenses, receivables = [], activeStores = []) {
    const todayStr = new Date().toISOString().split('T')[0];
    const monthStr = new Date().toISOString().substring(0, 7);

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

    const BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    let periodLabel = '';
    if (financeFilterMode === 'hari')  periodLabel = new Date(financeFilterDate).toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});
    if (financeFilterMode === 'bulan') { const [y,m] = financeFilterMonth.split('-'); periodLabel = `${BULAN_ID[+m-1]} ${y}`; }
    if (financeFilterMode === 'tahun') periodLabel = `Tahun ${financeFilterYear}`;

    let filteredRev = 0;
    const payMethods = {};
    filteredTx.forEach(tx => {
        filteredRev += tx.total;
        payMethods[tx.paymentMethod] = (payMethods[tx.paymentMethod] || 0) + tx.total;
    });

    let dailyRev = 0, dailyTxCount = 0, monthlyRev = 0, monthlyTxCount = 0;
    transactions.forEach(tx => {
        const ts = (tx.timestamp || '').split('T')[0];
        if (ts === todayStr) { dailyRev += tx.total; dailyTxCount++; }
        if (ts.substring(0,7) === monthStr) { monthlyRev += tx.total; monthlyTxCount++; }
    });

    let filteredExpTotal = 0;
    filteredExp.forEach(e => { filteredExpTotal += e.amount; });

    let piutangBelum = 0;
    receivables.forEach(r => { if(!r.isPaid) piutangBelum += (r.amount || 0); });

    const profitClean = filteredRev - filteredExpTotal;

    target.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white dark:bg-gray-900 p-4 rounded-2xl border dark:border-gray-800 shadow-sm">
            <div class="flex flex-wrap items-center gap-2">
                <div class="flex p-0.5 bg-gray-100 dark:bg-gray-800 rounded-xl border dark:border-gray-700">
                    <button onclick="window.setFinanceFilter('hari')" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition ${financeFilterMode==='hari' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}">Hari</button>
                    <button onclick="window.setFinanceFilter('bulan')" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition ${financeFilterMode==='bulan' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}">Bulan</button>
                    <button onclick="window.setFinanceFilter('tahun')" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition ${financeFilterMode==='tahun' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}">Tahun</button>
                </div>
                
                ${financeFilterMode === 'hari' ? `<input type="date" value="${financeFilterDate}" onchange="window.updateFinanceDate(this.value)" class="p-1.5 text-xs bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl dark:text-white">` : ''}
                ${financeFilterMode === 'bulan' ? `<input type="month" value="${financeFilterMonth}" onchange="window.updateFinanceMonth(this.value)" class="p-1.5 text-xs bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl dark:text-white">` : ''}
                ${financeFilterMode === 'tahun' ? `
                    <select onchange="window.updateFinanceYear(this.value)" class="p-1.5 text-xs bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl dark:text-white">
                        <option value="2026" ${financeFilterYear==='2026'?'selected':''}>2026</option>
                        <option value="2025" ${financeFilterYear==='2025'?'selected':''}>2025</option>
                    </select>
                ` : ''}
            </div>
            <button onclick="window.openOwnerModal('expense-modal')" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition shadow flex items-center gap-1">
                ➕ Catat Pengeluaran Baru
            </button>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="bg-gradient-to-br from-indigo-600 to-blue-700 p-4 rounded-2xl text-white shadow-lg">
                <p class="text-[10px] font-bold uppercase tracking-wider opacity-80">Total Omset</p>
                <p class="text-xl font-black mt-1">Rp ${filteredRev.toLocaleString('id-ID')}</p>
                <p class="text-[10px] opacity-75 mt-0.5">${filteredTx.length} transaksi · ${periodLabel}</p>
            </div>
            <div class="bg-white dark:bg-gray-900 border dark:border-gray-800 p-4 rounded-2xl shadow-sm">
                <p class="text-[10px] font-bold text-red-500 uppercase tracking-wider">Total Biaya & Pengeluaran</p>
                <p class="text-xl font-black text-gray-900 dark:text-white mt-1">Rp ${filteredExpTotal.toLocaleString('id-ID')}</p>
                <p class="text-[10px] text-gray-400 mt-0.5">${filteredExp.length} log biaya operasional</p>
            </div>
            <div class="bg-white dark:bg-gray-900 border dark:border-gray-800 p-4 rounded-2xl shadow-sm">
                <p class="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Laba Bersih Estimasi</p>
                <p class="text-xl font-black ${profitClean >= 0 ? 'text-emerald-600' : 'text-red-500'} mt-1">Rp ${profitClean.toLocaleString('id-ID')}</p>
                <p class="text-[10px] text-gray-400 mt-0.5">Omset dikurangi biaya</p>
            </div>
            <div class="bg-white dark:bg-gray-900 border dark:border-gray-800 p-4 rounded-2xl shadow-sm">
                <p class="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Sisa Piutang Berjalan</p>
                <p class="text-xl font-black text-amber-600 mt-1">Rp ${piutangBelum.toLocaleString('id-ID')}</p>
                <p class="text-[10px] text-gray-400 mt-0.5">Belum lunas di kasir</p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800 lg:col-span-2">
                <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-4">📈 Riwayat Transaksi Penjualan</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-gray-50 dark:bg-gray-800/50 border-b dark:border-gray-800 text-gray-400 font-bold uppercase">
                                <th class="p-3">Waktu</th>
                                <th class="p-3">Cabang</th>
                                <th class="p-3">Metode</th>
                                <th class="p-3 text-right">Total Tagihan</th>
                                <th class="p-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-gray-800">
                            ${filteredTx.length === 0 ? `<tr><td colspan="5" class="p-4 text-center text-gray-400">Tidak ada transaksi pada periode ini</td></tr>` : 
                            [...filteredTx].reverse().map(tx => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                    <td class="p-3 text-gray-600 dark:text-gray-300">${new Date(tx.timestamp).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</td>
                                    <td class="p-3 font-semibold dark:text-white">${tx.storeBranch || 'Utama'}</td>
                                    <td class="p-3"><span class="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium">${tx.paymentMethod}</span></td>
                                    <td class="p-3 text-right font-bold text-gray-900 dark:text-white">Rp ${tx.total.toLocaleString('id-ID')}</td>
                                    <td class="p-3 text-center">
                                        <button onclick="window.viewTxDetail('${tx.id}')" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Detail</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800">
                <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-4">💸 Log Biaya / Pengeluaran (${periodLabel})</h3>
                <div class="overflow-y-auto max-h-[350px] space-y-2 pr-1">
                    ${filteredExp.length === 0 ? `<p class="text-xs text-center text-gray-400 py-6">Belum ada pengeluaran dicatat</p>` : 
                    filteredExp.map(e => `
                        <div class="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border dark:border-gray-700/50 flex justify-between items-center text-xs">
                            <div>
                                <p class="font-bold text-gray-800 dark:text-white">${e.notes || 'Pengeluaran Tanpa Catatan'}</p>
                                <p class="text-[10px] text-gray-400 mt-0.5">${e.date} · <span class="text-red-500">${e.category || 'Lainnya'}</span> · ${e.storeBranch || 'Semua'}</p>
                            </div>
                            <span class="font-black text-red-600 dark:text-red-400">-Rp ${e.amount.toLocaleString('id-ID')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <div id="expense-modal" class="fixed inset-0 bg-black/50 dark:bg-black/80 z-50 flex items-center justify-center p-4 hidden backdrop-blur-sm" onclick="if(event.target === this) window.closeOwnerModal('expense-modal')">
            <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border dark:border-gray-800">
                <div class="flex justify-between items-center border-b dark:border-gray-800 pb-3 mb-4">
                    <h3 class="text-md font-bold text-gray-900 dark:text-white">➕ Catat Pengeluaran Baru</h3>
                    <button onclick="window.closeOwnerModal('expense-modal')" class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                </div>
                <form onsubmit="window.saveExpenseDirect(event)" class="space-y-4">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pilih Cabang Toko</label>
                        <select id="exp-store" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                            <option value="Semua Toko">Semua Toko (Global)</option>
                            ${activeStores.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Kategori Beban</label>
                        <select id="exp-category" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                            <option value="Operasional">Operasional Harian</option>
                            <option value="Gaji">Gaji / Insentif Karyawan</option>
                            <option value="Sewa">Sewa Tempat & Fasilitas</option>
                            <option value="Listrik & Air">Listrik, Air & Internet</option>
                            <option value="Marketing">Iklan & Promosi</option>
                            <option value="Lainnya" selected>Lainnya</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nominal (Rp)</label>
                        <input type="number" id="exp-amount" required min="1" placeholder="0" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs font-bold dark:text-white">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Keterangan Tambahan</label>
                        <input type="text" id="exp-notes" placeholder="Contoh: Beli Token Listrik Toko B" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button type="button" onclick="window.closeOwnerModal('expense-modal')" class="flex-1 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300">Batal</button>
                        <button type="submit" class="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow transition">Simpan Log</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// --- SUB TAB: OPNAME & LOGISTIK ---
function renderOpnameTab(target, products, opnameLogs, allStores, activeStores) {
    target.innerHTML = `
        <div class="flex justify-end gap-3 mb-6">
            <button onclick="window.openOwnerModal('transfer-modal')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition shadow flex items-center gap-1">
                🔄 Transfer Stok Antar Cabang
            </button>
            <button onclick="window.openOwnerModal('manual-logistics-modal')" class="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition shadow flex items-center gap-1">
                📥 Logistik Manual (Kulakan)
            </button>
        </div>

        <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800 mb-8">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-sm font-bold text-gray-900 dark:text-white">📜 Berita Acara / Log Riwayat Opname</h3>
                <button onclick="window.exportOpname()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition shadow flex items-center gap-1">📊 Export Excel</button>
            </div>
            <div class="overflow-x-auto text-xs">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-gray-50 dark:bg-gray-800 text-gray-400 font-bold uppercase border-b dark:border-gray-800">
                            <th class="p-3">Waktu Opname</th>
                            <th class="p-3">Toko / Cabang</th>
                            <th class="p-3">Nama Produk</th>
                            <th class="p-3 text-center">Sistem</th>
                            <th class="p-3 text-center">Fisik</th>
                            <th class="p-3 text-center">Selisih</th>
                            <th class="p-3">Petugas</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y dark:divide-gray-800">
                        ${opnameLogs.length === 0 ? `<tr><td colspan="7" class="p-4 text-center text-gray-400">Belum ada riwayat stock opname</td></tr>` : 
                        [...opnameLogs].reverse().map(log => {
                            const diff = log.actualStock - log.systemStock;
                            return `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                    <td class="p-3 text-gray-500">${new Date(log.timestamp).toLocaleString('id-ID')}</td>
                                    <td class="p-3 font-semibold dark:text-white">${log.storeBranch || 'Utama'}</td>
                                    <td class="p-3 font-medium dark:text-white">${log.productName}</td>
                                    <td class="p-3 text-center text-gray-600 dark:text-gray-400">${log.systemStock} pcs</td>
                                    <td class="p-3 text-center font-bold text-gray-800 dark:text-gray-200">${log.actualStock} pcs</td>
                                    <td class="p-3 text-center font-black ${diff === 0 ? 'text-gray-500' : diff > 0 ? 'text-emerald-500' : 'text-red-500'}">
                                        ${diff === 0 ? 'Sesuai' : (diff > 0 ? `+${diff}` : diff)}
                                    </td>
                                    <td class="p-3 text-gray-500">${log.operator || 'Kasir'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div id="transfer-modal" class="fixed inset-0 bg-black/50 dark:bg-black/80 z-50 flex items-center justify-center p-4 hidden backdrop-blur-sm" onclick="if(event.target === this) window.closeOwnerModal('transfer-modal')">
            <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border dark:border-gray-800">
                <div class="flex justify-between items-center border-b dark:border-gray-800 pb-3 mb-4">
                    <h3 class="text-md font-bold text-gray-900 dark:text-white">🔄 Transfer Stok Antar Cabang</h3>
                    <button onclick="window.closeOwnerModal('transfer-modal')" class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                </div>
                <form onsubmit="window.execStockTransfer(event)" class="space-y-4">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Dari Toko (Asal)</label>
                            <select id="t-from-store" onchange="window.updateOpnameSystemStockView()" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                                ${activeStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Ke Toko (Tujuan)</label>
                            <select id="t-to-store" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                                ${activeStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pilih Barang</label>
                        <div id="t-product-id-searchbox"></div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border dark:border-gray-700 text-xs flex justify-between items-center">
                        <span class="text-gray-500">Stok Tersedia di Toko Asal:</span>
                        <span id="o-system-view" class="font-bold text-indigo-600 dark:text-indigo-400">-</span>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Jumlah Yang Ditransfer</label>
                        <input type="number" id="t-qty" required min="1" placeholder="0" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs font-bold dark:text-white">
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button type="button" onclick="window.closeOwnerModal('transfer-modal')" class="flex-1 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300">Batal</button>
                        <button type="submit" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow transition">Kirim Transfer</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="manual-logistics-modal" class="fixed inset-0 bg-black/50 dark:bg-black/80 z-50 flex items-center justify-center p-4 hidden backdrop-blur-sm" onclick="if(event.target === this) window.closeOwnerModal('manual-logistics-modal')">
            <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border dark:border-gray-800">
                <div class="flex justify-between items-center border-b dark:border-gray-800 pb-3 mb-4">
                    <h3 class="text-md font-bold text-gray-900 dark:text-white">📥 Logistik Manual (Kulakan)</h3>
                    <button onclick="window.closeOwnerModal('manual-logistics-modal')" class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                </div>
                <form onsubmit="window.execManualLogistics(event)" class="space-y-4">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Toko Yang Menerima Stok</label>
                        <select id="m-store-id" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                            ${activeStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pilih Barang</label>
                        <div id="m-product-id-searchbox"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Jumlah Tambahan (pcs)</label>
                            <input type="number" id="m-qty" required min="1" placeholder="0" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Jenis Aksi</label>
                            <select id="m-type" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                                <option value="IN">Barang Masuk / Kulakan (+)</option>
                                <option value="OUT">Barang Rusak / Retur Supp (-)</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button type="button" onclick="window.closeOwnerModal('manual-logistics-modal')" class="flex-1 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300">Batal</button>
                        <button type="submit" class="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow transition">Eksekusi Logistik</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// --- SUB TAB: MASTER DATA PRODUK ---
function renderProductsTab(target, products, allStores, activeStores, categories) {
    target.innerHTML = `
        <div id="import-banner-area"></div>
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white dark:bg-gray-900 p-4 rounded-2xl border dark:border-gray-800 shadow-sm">
            <div class="relative w-full md:w-72">
                <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">🔍</span>
                <input type="text" placeholder="Cari nama produk..." oninput="window.filterProductTable(this.value)" class="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <button onclick="window.openNewProductModal()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition shadow">
                    ➕ Tambah Produk Baru
                </button>
                <button onclick="window.exportToExcel()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs transition shadow">📥 Export</button>
                <label class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-xl text-xs transition shadow cursor-pointer">
                    📤 Import Excel
                    <input type="file" accept=".xlsx, .xls" onchange="window.importFromExcel(event)" class="hidden">
                </label>
                <button onclick="window.downloadImportTemplate()" class="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 font-bold py-2 px-3 rounded-xl text-xs transition">📝 Template</button>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800">
            <div class="overflow-x-auto text-xs">
                <table class="w-full text-left border-collapse" id="master-product-table">
                    <thead>
                        <tr class="bg-gray-50 dark:bg-gray-800 text-gray-400 font-bold uppercase border-b dark:border-gray-800">
                            <th class="p-3">Nama Barang</th>
                            <th class="p-3">Kategori</th>
                            <th class="p-3 text-right">Harga Jual</th>
                            ${activeStores.map(s => `<th class="p-3 text-center bg-gray-50/50 dark:bg-gray-800/30">${s.name}</th>`).join('')}
                            <th class="p-3 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y dark:divide-gray-800">
                        ${products.length === 0 ? `<tr><td colspan="${4 + activeStores.length}" class="p-4 text-center text-gray-400">Belum ada master data produk</td></tr>` : 
                        products.map(p => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                <td class="p-3 font-semibold dark:text-white">${p.name}</td>
                                <td class="p-3"><span class="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-medium">${p.category || 'Umum'}</span></td>
                                <td class="p-3 text-right font-bold text-gray-900 dark:text-white">Rp ${p.price.toLocaleString('id-ID')}</td>
                                ${activeStores.map(s => {
                                    const num = s.id.match(/\d+/)[0];
                                    const stockVal = p[`stockToko${num}`] !== undefined ? p[`stockToko${num}`] : 0;
                                    return `<td class="p-3 text-center font-bold ${stockVal <= 5 ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'}">${stockVal} pcs</td>`;
                                }).join('')}
                                <td class="p-3 text-center space-x-2">
                                    <button onclick="window.openEditProductModal('${p.id}')" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Edit</button>
                                    <button onclick="window.deleteProduct('${p.id}')" class="text-red-500 font-bold hover:underline">Hapus</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div id="product-modal" class="fixed inset-0 bg-black/50 dark:bg-black/80 z-50 flex items-center justify-center p-4 hidden backdrop-blur-sm" onclick="if(event.target === this) window.closeOwnerModal('product-modal')">
            <div class="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-2xl p-6 border dark:border-gray-800 max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center border-b dark:border-gray-800 pb-3 mb-4">
                    <h3 class="text-md font-bold text-gray-900 dark:text-white" id="product-modal-title">➕ Tambah Master Produk</h3>
                    <button onclick="window.closeOwnerModal('product-modal')" class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                </div>
                <form id="product-form" onsubmit="window.saveProduct(event)" class="space-y-4">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nama Lengkap Produk</label>
                        <input type="text" id="p-name" placeholder="Contoh: Liquid Oat Drip V1 60ml" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Harga Beli Dasar (Rp)</label>
                            <input type="number" id="p-purchase" required min="0" placeholder="0" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Harga Jual Toko (Rp)</label>
                            <input type="number" id="p-price" required min="1" placeholder="0" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs font-bold dark:text-white">
                        </div>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Kategori Produk</label>
                        <select id="p-category" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                            <option value="Umum">Umum</option>
                            ${categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div class="border-t dark:border-gray-800 pt-3">
                        <p class="text-[11px] font-bold text-gray-400 uppercase mb-3">📍 Stok Awal Cabang</p>
                        <div class="grid grid-cols-2 gap-3" id="initial-stock-inputs">
                            ${activeStores.map(s => {
                                const num = s.id.match(/\d+/)[0];
                                return `
                                    <div>
                                        <label class="block text-[10px] font-medium text-gray-500 mb-1">${s.name}</label>
                                        <input type="number" id="p-stock-toko${num}" min="0" value="0" class="w-full p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <div class="flex gap-3 pt-3 border-t dark:border-gray-800">
                        <button type="button" onclick="window.closeOwnerModal('product-modal')" class="flex-1 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300">Batal</button>
                        <button type="submit" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow transition">Simpan Produk</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// --- SUB TAB: MASTER KATEGORI ---
function renderCategoriesTab(target, categories, products) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800 lg:col-span-2">
                <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-4">🏷️ Daftar Kategori Tersedia</h3>
                <div class="overflow-x-auto text-xs">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-gray-50 dark:bg-gray-800 text-gray-400 font-bold uppercase border-b dark:border-gray-800">
                                <th class="p-3 w-16 text-center">Visual</th>
                                <th class="p-3">Nama Kategori</th>
                                <th class="p-3 text-center">Total Item</th>
                                <th class="p-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-gray-800">
                            ${categories.length === 0 ? `<tr><td colspan="4" class="p-4 text-center text-gray-400">Belum ada kategori yang ditambahkan</td></tr>` : 
                            categories.map(cat => {
                                const itemCount = products.filter(p => p.category === cat.name).length;
                                return `
                                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                        <td class="p-3 text-center text-lg">${cat.icon || '📦'}</td>
                                        <td class="p-3 font-semibold dark:text-white">${cat.name}</td>
                                        <td class="p-3 text-center font-medium text-gray-500">${itemCount} produk</td>
                                        <td class="p-3 text-center space-x-2">
                                            <button onclick="window.openEditCategoryModal('${cat.id}')" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Edit</button>
                                            <button onclick="window.deleteCategory('${cat.id}')" class="text-red-500 font-bold hover:underline">Hapus</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800 h-fit text-center py-8">
                <div class="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl flex items-center justify-center text-lg mx-auto mb-3">🏷️</div>
                <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-1">Manajemen Kategori</h4>
                <p class="text-xs text-gray-400 mb-4">Kelompokkan produk Anda untuk mempermudah kasir mencari barang belanjaan.</p>
                <button onclick="window.openNewCategoryModal()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs shadow transition">
                    ➕ Buat Kategori Baru
                </button>
            </div>
        </div>

        <div id="category-modal" class="fixed inset-0 bg-black/50 dark:bg-black/80 z-50 flex items-center justify-center p-4 hidden backdrop-blur-sm" onclick="if(event.target === this) window.closeOwnerModal('category-modal')">
            <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border dark:border-gray-800">
                <div class="flex justify-between items-center border-b dark:border-gray-800 pb-3 mb-4">
                    <h3 class="text-md font-bold text-gray-900 dark:text-white" id="cat-form-title">➕ Tambah Kategori</h3>
                    <button onclick="window.closeOwnerModal('category-modal')" class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                </div>
                <form id="category-form" onsubmit="window.saveCategory(event)" class="space-y-4">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nama Kelompok Kategori</label>
                        <input type="text" id="cat-name" placeholder="Contoh: Liquid Freebase, Device, Coils" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Icon / Emoji Representasi</label>
                        <input type="text" id="cat-icon" placeholder="Contoh: 🧪 atau 💨" required class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button type="button" onclick="window.closeOwnerModal('category-modal')" class="flex-1 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300">Batal</button>
                        <button type="submit" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow transition">Simpan Kategori</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// --- SUB TAB: MASTER DATA MEMBER ---
function renderMembersTab(target, members, transactions) {
    target.innerHTML = `
        <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-4">👥 Pelanggan Terdaftar (Member Base)</h3>
            <div class="overflow-x-auto text-xs">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-gray-50 dark:bg-gray-800 text-gray-400 font-bold uppercase border-b dark:border-gray-800">
                            <th class="p-3">Nama Member</th>
                            <th class="p-3">Nomor Telepon / WA</th>
                            <th class="p-3 text-center">Akumulasi Poin</th>
                            <th class="p-3 text-right">Total Transaksi Belanja</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y dark:divide-gray-800">
                        ${members.length === 0 ? `<tr><td colspan="4" class="p-4 text-center text-gray-400">Belum ada pelanggan terdaftar sebagai member</td></tr>` : 
                        members.map(m => {
                            const memberTx = transactions.filter(t => t.memberId === m.id);
                            const totalSpend = memberTx.reduce((sum, t) => sum + t.total, 0);
                            return `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                    <td class="p-3 font-semibold dark:text-white">${m.name}</td>
                                    <td class="p-3 text-gray-600 dark:text-gray-400">${m.phone || '-'}</td>
                                    <td class="p-3 text-center font-black text-indigo-600 dark:text-indigo-400">${m.points || 0} PTS</td>
                                    <td class="p-3 text-right font-bold text-gray-900 dark:text-white">Rp ${totalSpend.toLocaleString('id-ID')}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- SUB TAB: DATA OPERATOR KASIR ---
function renderUsersTab(target, users, activeStores) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800 lg:col-span-2">
                <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-4">🔑 Otoritas & Akun Operator Kasir</h3>
                <div class="overflow-x-auto text-xs">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-gray-50 dark:bg-gray-800 text-gray-400 font-bold uppercase border-b dark:border-gray-800">
                                <th class="p-3">Nama Lengkap</th>
                                <th class="p-3">Username</th>
                                <th class="p-3">Penempatan Cabang</th>
                                <th class="p-3">Otoritas</th>
                                <th class="p-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-gray-800">
                            ${users.filter(u => u.role === 'kasir').map(u => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                    <td class="p-3 font-semibold dark:text-white">${u.name}</td>
                                    <td class="p-3 text-gray-600 dark:text-gray-400">${u.username}</td>
                                    <td class="p-3 font-medium text-gray-800 dark:text-gray-200">${u.storeBranch || 'Semua Cabang'}</td>
                                    <td class="p-3"><span class="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 font-semibold uppercase text-[10px]">Kasir</span></td>
                                    <td class="p-3 text-center space-x-2">
                                        <button onclick="window.openEditUserModal('${u.id}')" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Edit</button>
                                        <button onclick="window.deleteUser('${u.id}')" class="text-red-500 font-bold hover:underline">Hapus</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800 h-fit text-center py-6">
                <div class="w-12 h-12 bg-amber-50 dark:bg-amber-950/60 rounded-2xl flex items-center justify-center text-lg mx-auto mb-3">🔑</div>
                <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-1">Manajemen Tim Kasir</h4>
                <p class="text-xs text-gray-400 mb-4">Buat kredensial login unik untuk staf Anda guna melacak performa & log penjualan per operator.</p>
                <button onclick="window.openNewUserModal()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs shadow transition">
                    ➕ Buat Akun Kasir Baru
                </button>
            </div>
        </div>

        <div id="user-modal" class="fixed inset-0 bg-black/50 dark:bg-black/80 z-50 flex items-center justify-center p-4 hidden backdrop-blur-sm" onclick="if(event.target === this) window.closeOwnerModal('user-modal')">
            <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border dark:border-gray-800">
                <div class="flex justify-between items-center border-b dark:border-gray-800 pb-3 mb-4">
                    <h3 class="text-md font-bold text-gray-900 dark:text-white" id="user-form-title">➕ Tambah Akun Kasir Baru</h3>
                    <button onclick="window.closeOwnerModal('user-modal')" class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                </div>
                <form id="user-form" onsubmit="window.saveUser(event)" class="space-y-4">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nama Lengkap Kasir</label>
                        <input type="text" id="u-name" required placeholder="Contoh: Ahmad Fauzi" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Username Login</label>
                            <input type="text" id="u-user" required placeholder="ahmad123" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Password Baru</label>
                            <input type="password" id="u-pass" required placeholder="******" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                        </div>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Penempatan Cabang Toko</label>
                        <select id="u-store" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                            ${activeStores.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button type="button" onclick="window.closeOwnerModal('user-modal')" class="flex-1 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300">Batal</button>
                        <button type="submit" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow transition">Simpan Kredensial</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// --- SUB TAB: SHIFT & KEHADIRAN (DIREKTORAT INTEGRASI) ---
function renderShiftsTab(target, users, shifts, attendances, shiftSchedules, activeStores) {
    if (!window.shiftIntegrationView) {
        target.innerHTML = `<div class="p-6 text-center text-gray-400 text-xs">⚠️ Modul Shift Management (shift-integration.js) tidak terdeteksi. Silakan hubungi pengembang.</div>`;
        return;
    }
    window.shiftIntegrationView.renderWithOwnerState(target, {
        users, shifts, attendances, shiftSchedules, activeStores,
        view: shiftView, filterMonth: shiftFilterMonth, filterStore: shiftFilterStore,
        editingShiftId, editingShiftData
    });
}

// --- SUB TAB: TEMPLATE NOTA/STRUK ---
function renderReceiptTab(target, config) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800 h-fit text-center py-6">
                <div class="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl flex items-center justify-center text-lg mx-auto mb-3">🧾</div>
                <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-1">Kustomisasi Template Struk</h4>
                <p class="text-xs text-gray-400 mb-4">Ubah header, alamat, nomor kontak, serta catatan kaki (footer) struk yang dicetak oleh kasir ke pelanggan.</p>
                <button onclick="window.openOwnerModal('receipt-modal')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs shadow transition">
                    ✏️ Konfigurasi Template Struk
                </button>
            </div>

            <div class="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border dark:border-gray-800 flex justify-center">
                <div class="w-64 bg-amber-50/40 dark:bg-amber-950/10 border-2 border-dashed border-amber-200 dark:border-amber-900/50 rounded-xl p-4 text-left font-mono text-[9px] text-gray-800 dark:text-gray-300 shadow-inner">
                    <p class="text-center font-black text-xs uppercase tracking-tight text-indigo-600 dark:text-indigo-400" id="preview-r-name">${config.storeName || 'MVAPE POS'}</p>
                    <p class="text-center leading-tight mt-0.5" id="preview-r-address">${config.address || 'Alamat Toko Belum Diatur'}</p>
                    <p class="text-center" id="preview-r-phone">Telp: ${config.phone || '-'}</p>
                    <p class="border-t border-dashed border-gray-400 my-2"></p>
                    <div class="space-y-1">
                        <div class="flex justify-between"><span>1x Liquid Freebase 60ml</span><span>Rp 140.000</span></div>
                        <div class="flex justify-between"><span>2x Catridge Pods Oxva</span><span>Rp 80.000</span></div>
                    </div>
                    <p class="border-t border-dashed border-gray-400 my-2"></p>
                    <div class="space-y-0.5 text-right font-bold">
                        <div class="flex justify-between"><span>Subtotal:</span><span>Rp 220.000</span></div>
                        <div class="flex justify-between text-indigo-600"><span>TOTAL AKHIR:</span><span>Rp 220.000</span></div>
                    </div>
                    <p class="border-t border-dashed border-gray-400 my-2"></p>
                    <p class="text-center italic whitespace-pre-line mt-1 leading-tight" id="preview-r-footer">${config.footer || 'Terima kasih atas kunjungan Anda'}</p>
                </div>
            </div>
        </div>

        <div id="receipt-modal" class="fixed inset-0 bg-black/50 dark:bg-black/80 z-50 flex items-center justify-center p-4 hidden backdrop-blur-sm" onclick="if(event.target === this) window.closeOwnerModal('receipt-modal')">
            <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border dark:border-gray-800">
                <div class="flex justify-between items-center border-b dark:border-gray-800 pb-3 mb-4">
                    <h3 class="text-md font-bold text-gray-900 dark:text-white">🧾 Kustomisasi Template Struk</h3>
                    <button onclick="window.closeOwnerModal('receipt-modal')" class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                </div>
                <form onsubmit="window.saveReceiptTemplate(event)" class="space-y-4">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nama Brand / Toko</label>
                        <input type="text" id="r-name" value="${config.storeName || ''}" required oninput="document.getElementById('preview-r-name').textContent = this.value || 'MVAPE POS'" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Alamat Operasional Utama</label>
                        <input type="text" id="r-address" value="${config.address || ''}" required oninput="document.getElementById('preview-r-address').textContent = this.value || 'Alamat Toko Belum Diatur'" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nomor Kontak / WhatsApp</label>
                        <input type="text" id="r-phone" value="${config.phone || ''}" required oninput="document.getElementById('preview-r-phone').textContent = 'Telp: ' + (this.value || '-')" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Catatan Kaki (Footer / Greeting)</label>
                        <textarea id="r-footer" rows="3" required oninput="document.getElementById('preview-r-footer').textContent = this.value" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">${config.footer || ''}</textarea>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button type="button" onclick="window.closeOwnerModal('receipt-modal')" class="flex-1 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300">Batal</button>
                        <button type="submit" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow transition">Terapkan Template</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// --- SUB TAB: MANAJEMEN TOKO / CABANG ---
function renderStoresTab(target, allStores) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800 lg:col-span-2">
                <h3 class="text-sm font-bold text-gray-900 dark:text-white mb-4">🏪 Jaringan Kantor / Cabang Toko Aktif</h3>
                <div class="overflow-x-auto text-xs">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-gray-50 dark:bg-gray-800 text-gray-400 font-bold uppercase border-b dark:border-gray-800">
                                <th class="p-3">Nama Cabang</th>
                                <th class="p-3">Alamat Fisik</th>
                                <th class="p-3">Kontak Toko</th>
                                <th class="p-3">Status</th>
                                <th class="p-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-gray-800">
                            ${allStores.map(s => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                    <td class="p-3 font-semibold dark:text-white">${s.name}</td>
                                    <td class="p-3 text-gray-600 dark:text-gray-400">${s.address || '-'}</td>
                                    <td class="p-3 text-gray-600 dark:text-gray-400">${s.phone || '-'}</td>
                                    <td class="p-3">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${s.isActive ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600' : 'bg-gray-100 text-gray-400'}">
                                            ${s.isActive ? 'Aktif' : 'Non-Aktif'}
                                        </span>
                                    </td>
                                    <td class="p-3 text-center">
                                        <button onclick="window.openEditStoreModal('${s.id}')" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Edit Info</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border dark:border-gray-800 h-fit text-center py-6">
                <div class="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl flex items-center justify-center text-lg mx-auto mb-3">🏪</div>
                <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-1">Registrasi Toko Cabang</h4>
                <p class="text-xs text-gray-400 mb-4">Tambahkan cabang baru ke dalam sistem untuk memisahkan pencatatan keuangan dan stok gudang logistik.</p>
                <button onclick="window.openNewStoreModal()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs shadow transition">
                    ➕ Registrasi Toko Baru
                </button>
            </div>
        </div>

        <div id="store-modal" class="fixed inset-0 bg-black/50 dark:bg-black/80 z-50 flex items-center justify-center p-4 hidden backdrop-blur-sm" onclick="if(event.target === this) window.closeOwnerModal('store-modal')">
            <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border dark:border-gray-800">
                <div class="flex justify-between items-center border-b dark:border-gray-800 pb-3 mb-4">
                    <h3 class="text-md font-bold text-gray-900 dark:text-white" id="store-form-title">➕ Registrasi Cabang Baru</h3>
                    <button onclick="window.closeOwnerModal('store-modal')" class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                </div>
                <form id="store-form" onsubmit="window.saveStore(event)" class="space-y-4">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nama Cabang / Toko</label>
                        <input type="text" id="s-name" required placeholder="Contoh: Mvape Cabang Dinoyo" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Alamat Lengkap Cabang</label>
                        <input type="text" id="s-address" required placeholder="Jalan Raya Dinoyo No. 12" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nomor Kontak Cabang</label>
                        <input type="text" id="s-phone" required placeholder="08123456789" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                    </div>
                    <div>
                        <label class="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                            <input type="checkbox" id="s-active" checked class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                            Status Cabang Aktif (Dapat diakses Kasir)
                        </label>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button type="button" onclick="window.closeOwnerModal('store-modal')" class="flex-1 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300">Batal</button>
                        <button type="submit" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow transition">Simpan Data</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// --- GLOBAL EVENT HANDLERS & WRAPPER LOGIC ---
window.switchOwnerTab = function(tabName) {
    if (tabName === 'inventory') tabName = 'inventory_opname';
    if (tabName === 'finance') tabName = 'finance_umum';
    activeOwnerTab = tabName;
    render(document.getElementById('app-container'));
};

window.setFinanceFilter = function(mode) {
    financeFilterMode = mode;
    render(document.getElementById('app-container'));
};

window.updateFinanceDate = function(val) { financeFilterDate = val; render(document.getElementById('app-container')); };
window.updateFinanceMonth = function(val) { financeFilterMonth = val; render(document.getElementById('app-container')); };
window.updateFinanceYear = function(val) { financeFilterYear = val; render(document.getElementById('app-container')); };

window.viewTxDetail = async function(txId) {
    const tx = await db.transactions.get(txId);
    if (!tx) return;
    
    document.getElementById('modal-tx-id').textContent = `Nota #${tx.id.substring(0,8).toUpperCase()}`;
    document.getElementById('modal-tx-time').textContent = new Date(tx.timestamp).toLocaleString('id-ID');
    document.getElementById('modal-tx-method').textContent = tx.paymentMethod;
    
    let subtotalCalculated = 0;
    const container = document.getElementById('modal-items-container');
    container.innerHTML = '';
    
    if (db.transactionItems) {
        const items = await db.transactionItems.where('transactionId').equalTo(txId).toArray();
        for (const item of items) {
            const p = await db.products.get(item.productId);
            subtotalCalculated += item.subtotal;
            container.innerHTML += `
                <div class="flex justify-between items-center text-xs">
                    <div>
                        <p class="font-bold text-gray-800 dark:text-white">${p ? p.name : 'Produk Terhapus'}</p>
                        <p class="text-[10px] text-gray-400">${item.quantity} x Rp ${(item.subtotal / item.quantity).toLocaleString('id-ID')}</p>
                    </div>
                    <span class="font-bold dark:text-white">Rp ${item.subtotal.toLocaleString('id-ID')}</span>
                </div>
            `;
        }
    }

    document.getElementById('modal-tx-subtotal').textContent = `Rp ${subtotalCalculated.toLocaleString('id-ID')}`;
    
    if (tx.memberId) {
        if(db.members) {
            const m = await db.members.get(tx.memberId);
            if (m) {
                document.getElementById('modal-member-row').classList.remove('hidden');
                document.getElementById('modal-member-detail').textContent = m.name;
            }
        }
        const disc = subtotalCalculated - tx.total;
        if (disc > 0) {
            document.getElementById('modal-discount-row').classList.remove('hidden');
            document.getElementById('modal-tx-discount').textContent = `-Rp ${disc.toLocaleString('id-ID')}`;
        } else {
            document.getElementById('modal-discount-row').classList.add('hidden');
        }
    } else {
        document.getElementById('modal-member-row').classList.add('hidden');
        document.getElementById('modal-discount-row').classList.add('hidden');
    }
    
    document.getElementById('modal-tx-total').textContent = `Rp ${tx.total.toLocaleString('id-ID')}`;
    window.openOwnerModal('detail-modal');
};

window.closeModal = function() {
    window.closeOwnerModal('detail-modal');
};

window.saveExpenseDirect = async function(e) {
    e.preventDefault();
    const amount = parseInt(document.getElementById('exp-amount').value) || 0;
    const notes = document.getElementById('exp-notes').value;
    const category = document.getElementById('exp-category').value;
    const storeBranch = document.getElementById('exp-store').value;
    
    if(amount <= 0 || !notes) return alert('Data tidak valid!');
    
    try {
        if(db.expenses) {
            await db.expenses.add({
                id: 'exp_' + Date.now(),
                amount,
                notes,
                category,
                storeBranch,
                date: new Date().toISOString().split('T')[0],
                timestamp: new Date().toISOString()
            });
            alert('✅ Pengeluaran berhasil disimpan!');
            window.closeOwnerModal('expense-modal');
            render(document.getElementById('app-container'));
        }
    } catch(err) { alert('Gagal: ' + err); }
};

window.execStockTransfer = async function(e) {
    e.preventDefault();
    const fromStoreId = document.getElementById('t-from-store').value;
    const toStoreId = document.getElementById('t-to-store').value;
    const productId = document.getElementById('t-product-id').value;
    const qty = parseInt(document.getElementById('t-qty').value) || 0;
    
    if (fromStoreId === toStoreId) return alert('Toko asal dan tujuan tidak boleh sama!');
    if (!productId || qty <= 0) return alert('Pilih produk dan isi jumlah dengan benar!');
    
    try {
        const prod = await db.products.get(productId);
        if (!prod) return;
        
        const fromNum = fromStoreId.match(/\d+/)[0];
        const toNum = toStoreId.match(/\d+/)[0];
        const fromKey = `stockToko${fromNum}`;
        const toKey = `stockToko${toNum}`;
        
        const currentSrcStock = prod[fromKey] || 0;
        if (currentSrcStock < qty) return alert(`Stok tidak mencukupi! Tersedia ${currentSrcStock} pcs.`);
        
        await db.products.update(productId, {
            [fromKey]: currentSrcStock - qty,
            [toKey]: (prod[toKey] || 0) + qty
        });
        
        if (db.stock_mutations) {
            await db.stock_mutations.add({
                id: 'mut_' + Date.now(),
                productId,
                productName: prod.name,
                type: 'TRANSFER',
                quantity: qty,
                fromStore: fromStoreId,
                toStore: toStoreId,
                timestamp: new Date().toISOString()
            });
        }
        
        alert('✅ Transfer stok sukses dilakukan!');
        window.closeOwnerModal('transfer-modal');
        render(document.getElementById('app-container'));
    } catch(err) { alert('Gagal: ' + err); }
};

window.execManualLogistics = async function(e) {
    e.preventDefault();
    const storeId = document.getElementById('m-store-id').value;
    const productId = document.getElementById('m-product-id').value;
    const qty = parseInt(document.getElementById('m-qty').value) || 0;
    const type = document.getElementById('m-type').value;
    
    if (!productId || qty <= 0) return alert('Data tidak lengkap!');
    
    try {
        const prod = await db.products.get(productId);
        if(!prod) return;
        
        const num = storeId.match(/\d+/)[0];
        const key = `stockToko${num}`;
        const currentStock = prod[key] || 0;
        
        let newStock = currentStock;
        if (type === 'IN') newStock += qty;
        else {
            if (currentStock < qty) return alert(`Stok kurang! Hanya ada ${currentStock} pcs.`);
            newStock -= qty;
        }
        
        await db.products.update(productId, { [key]: newStock });
        alert('✅ Logistik manual berhasil diproses!');
        window.closeOwnerModal('manual-logistics-modal');
        render(document.getElementById('app-container'));
    } catch(err) { alert('Gagal: ' + err); }
};

window.openNewProductModal = function() {
    editingProductId = null;
    document.getElementById('product-form').reset();
    document.getElementById('product-modal-title').textContent = '➕ Tambah Master Produk';
    window.openOwnerModal('product-modal');
};

window.openEditProductModal = async function(id) {
    editingProductId = id;
    const p = await db.products.get(id);
    if(!p) return;
    
    document.getElementById('product-modal-title').textContent = '📝 Edit Master Produk';
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-price').value = p.price;
    document.getElementById('p-purchase').value = p.purchasePrice || 0;
    document.getElementById('p-category').value = p.category || 'Umum';
    
    const allStores = await db.stores.toArray();
    allStores.filter(s => s.isActive).forEach(s => {
        const num = s.id.match(/\d+/)[0];
        const input = document.getElementById(`p-stock-toko${num}`);
        if(input) input.value = p[`stockToko${num}`] || 0;
    });
    
    window.openOwnerModal('product-modal');
};

window.saveProduct = async function(e) {
    e.preventDefault();
    const name = document.getElementById('p-name').value;
    const price = parseInt(document.getElementById('p-price').value) || 0;
    const purchasePrice = parseInt(document.getElementById('p-purchase').value) || 0;
    const category = document.getElementById('p-category').value;
    
    const updateObj = { name, price, purchasePrice, category };
    const allStores = await db.stores.toArray();
    allStores.filter(s => s.isActive).forEach(s => {
        const num = s.id.match(/\d+/)[0];
        const val = parseInt(document.getElementById(`p-stock-toko${num}`)?.value) || 0;
        updateObj[`stockToko${num}`] = val;
    });
    
    try {
        if(editingProductId) {
            await db.products.update(editingProductId, updateObj);
            alert('✅ Produk berhasil diperbarui!');
        } else {
            const newId = 'prod_' + Date.now();
            await db.products.add({ id: newId, ...updateObj });
            alert('✅ Produk baru berhasil ditambahkan!');
        }
        window.closeOwnerModal('product-modal');
        render(document.getElementById('app-container'));
    } catch(err) { alert('Gagal: ' + err); }
};

window.deleteProduct = async function(id) {
    if(!confirm('Apakah Anda yakin ingin menghapus produk ini secara permanen dari basis data?')) return;
    await db.products.delete(id);
    render(document.getElementById('app-container'));
};

window.openNewCategoryModal = function() {
    document.getElementById('category-form').reset();
    document.getElementById('cat-form-title').textContent = '➕ Tambah Kategori';
    window.openOwnerModal('category-modal');
};

window.openEditCategoryModal = async function(id) {
    const cat = await db.categories.get(id);
    if(!cat) return;
    
    document.getElementById('cat-form-title').textContent = '✏️ Edit Kategori';
    document.getElementById('cat-name').value = cat.name;
    document.getElementById('cat-icon').value = cat.icon || '📦';
    
    // Simpan ID kategori sementara ke form attribute untuk disubmit
    document.getElementById('category-form').dataset.editId = id;
    window.openOwnerModal('category-modal');
};

window.saveCategory = async function(e) {
    e.preventDefault();
    const name = document.getElementById('cat-name').value;
    const icon = document.getElementById('cat-icon').value;
    const editId = document.getElementById('category-form').dataset.editId;
    
    try {
        if(editId) {
            await db.categories.update(editId, { name, icon });
            delete document.getElementById('category-form').dataset.editId;
            alert('✅ Kategori diperbarui!');
        } else {
            await db.categories.add({ id: 'cat_' + Date.now(), name, icon });
            alert('✅ Kategori baru berhasil dibuat!');
        }
        window.closeOwnerModal('category-modal');
        render(document.getElementById('app-container'));
    } catch(err) { alert('Gagal: ' + err); }
};

window.deleteCategory = async function(id) {
    if(!confirm('Hapus kategori ini?')) return;
    await db.categories.delete(id);
    render(document.getElementById('app-container'));
};

window.openNewUserModal = function() {
    editingUserId = null;
    document.getElementById('user-form').reset();
    document.getElementById('user-form-title').textContent = '➕ Tambah Akun Kasir Baru';
    document.getElementById('u-user').disabled = false;
    window.openOwnerModal('user-modal');
};

window.openEditUserModal = async function(id) {
    editingUserId = id;
    const u = await db.users.get(id);
    if(!u) return;
    
    document.getElementById('user-form-title').textContent = '📝 Edit Akun Kasir';
    document.getElementById('u-name').value = u.name;
    document.getElementById('u-user').value = u.username;
    document.getElementById('u-user').disabled = true; // Username lock
    document.getElementById('u-pass').value = u.password;
    document.getElementById('u-store').value = u.storeBranch || '';
    
    window.openOwnerModal('user-modal');
};

window.saveUser = async function(e) {
    e.preventDefault();
    const name = document.getElementById('u-name').value;
    const username = document.getElementById('u-user').value;
    const password = document.getElementById('u-pass').value;
    const storeBranch = document.getElementById('u-store').value;
    
    try {
        if(editingUserId) {
            await db.users.update(editingUserId, { name, password, storeBranch });
            alert('✅ Akun kasir diperbarui!');
        } else {
            const exists = await db.users.where('username').equalTo(username).first();
            if(exists) return alert('Username sudah digunakan oleh kasir lain!');
            
            await db.users.add({
                id: 'u_' + Date.now(),
                name, username, password, storeBranch,
                role: 'kasir'
            });
            alert('✅ Akun kasir baru berhasil didaftarkan!');
        }
        window.closeOwnerModal('user-modal');
        render(document.getElementById('app-container'));
    } catch(err) { alert('Gagal: ' + err); }
};

window.deleteUser = async function(id) {
    if(!confirm('Hapus akun operator kasir ini?')) return;
    await db.users.delete(id);
    render(document.getElementById('app-container'));
};

window.saveReceiptTemplate = async function(e) {
    e.preventDefault();
    const storeName = document.getElementById('r-name').value;
    const address = document.getElementById('r-address').value;
    const phone = document.getElementById('r-phone').value;
    const footer = document.getElementById('r-footer').value;
    
    try {
        if(db.settings) {
            await db.settings.put({
                key: 'receipt_template',
                value: { storeName, address, phone, footer }
            });
            alert('✅ Template struk toko berhasil diperbarui!');
            window.closeOwnerModal('receipt-modal');
            render(document.getElementById('app-container'));
        }
    } catch(err) { alert('Gagal: ' + err); }
};

window.openNewStoreModal = function() {
    editingStoreId = null;
    document.getElementById('store-form').reset();
    document.getElementById('store-form-title').textContent = '➕ Registrasi Cabang Baru';
    window.openOwnerModal('store-modal');
};

window.openEditStoreModal = async function(id) {
    editingStoreId = id;
    const s = await db.stores.get(id);
    if(!s) return;
    
    document.getElementById('store-form-title').textContent = '📝 Edit Informasi Toko';
    document.getElementById('s-name').value = s.name;
    document.getElementById('s-address').value = s.address || '';
    document.getElementById('s-phone').value = s.phone || '';
    document.getElementById('s-active').checked = s.isActive;
    
    window.openOwnerModal('store-modal');
};

window.saveStore = async function(e) {
    e.preventDefault();
    const name = document.getElementById('s-name').value;
    const address = document.getElementById('s-address').value;
    const phone = document.getElementById('s-phone').value;
    const isActive = document.getElementById('s-active').checked;
    
    try {
        if (editingStoreId) {
            await db.stores.update(editingStoreId, { name, address, phone, isActive });
            alert("✅ Data cabang berhasil diperbarui!");
        } else {
            const allStores = await db.stores.toArray();
            let maxNum = 2;
            allStores.forEach(s => {
                const match = s.id.match(/toko(\d+)/i);
                if (match) { const n = parseInt(match[1]); if(n >= maxNum) maxNum = n + 1; }
            });
            const newStoreId = `toko${maxNum}`;
            await db.stores.add({ id: newStoreId, name, address, phone, isActive });
            alert(`✅ Sukses mendaftarkan ${name} (${newStoreId})!`);
        }
        window.closeOwnerModal('store-modal');
        render(document.getElementById('app-container'));
    } catch(err) { alert('Gagal: ' + err); }
};

window.updateOpnameSystemStockView = async function() {
    const fromStoreId = document.getElementById('t-from-store')?.value;
    const productId = document.getElementById('t-product-id')?.value;
    const view = document.getElementById('o-system-view');
    
    if(!fromStoreId || !productId || !view) return;
    
    const p = await db.products.get(productId);
    if(!p) { view.textContent = '-'; return; }
    
    const num = fromStoreId.match(/\d+/)[0];
    view.textContent = `${p[`stockToko${num}`] || 0} pcs`;
};

window.filterProductTable = function(q) {
    const query = q.toLowerCase();
    const rows = document.querySelectorAll('#master-product-table tbody tr');
    rows.forEach(row => {
        if(row.cells.length < 2) return;
        const name = row.cells[0].textContent.toLowerCase();
        const cat = row.cells[1].textContent.toLowerCase();
        if(name.includes(query) || cat.includes(query)) row.classList.remove('hidden');
        else row.classList.add('hidden');
    });
};

window.exportToExcel = async function() {
    const products = await db.products.toArray();
    if (products.length === 0) return alert('Tidak ada data produk untuk diexport.');
    const allStores = await db.stores.toArray();
    const activeStores = allStores.filter(s => s.isActive);
    
    const data = products.map(p => {
        const row = { 'Nama Produk': p.name, 'Kategori': p.category || '', 'Harga Beli': p.purchasePrice || 0, 'Harga Jual': p.price };
        activeStores.forEach(s => {
            const num = s.id.match(/\d+/)[0];
            row[`Stok ${s.name}`] = p[`stockToko${num}`] || 0;
        });
        return row;
    });
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Master Produk");
    XLSX.writeFile(workbook, "Master_Produk_Mvape.xlsx");
};

window.importFromExcel = function(e) {
    const file = e.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const data = evt.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            
            const allStores = await db.stores.toArray();
            const activeStores = allStores.filter(s => s.isActive);
            let addedCount = 0;
            
            for(const row of rows) {
                const name = row['Nama Produk'];
                const price = parseInt(row['Harga Jual']) || 0;
                if(!name || price <= 0) continue;
                
                const existing = await db.products.where('name').equalTo(name).first();
                const itemData = {
                    name, price,
                    category: row['Kategori'] || 'Umum',
                    purchasePrice: parseInt(row['Harga Beli']) || 0
                };
                
                activeStores.forEach(s => {
                    const num = s.id.match(/\d+/)[0];
                    itemData[`stockToko${num}`] = parseInt(row[`Stok ${s.name}`]) || 0;
                });
                
                if(existing) await db.products.update(existing.id, itemData);
                else await db.products.add({ id: 'prod_' + Date.now() + '_' + Math.random().toString(36).substr(2,4), ...itemData });
                addedCount++;
            }
            alert(`✅ Berhasil memproses data Excel! ${addedCount} produk ter-import.`);
            render(document.getElementById('app-container'));
        } catch(err) { alert('Gagal membaca struktur berkas Excel: ' + err); }
    };
    reader.readAsBinaryString(file);
};

window.downloadImportTemplate = function() {
    const templateData = [{ 'Nama Produk': 'Liquid Saltnic Oreo 30ml', 'Kategori': 'Liquid', 'Harga Beli': 65000, 'Harga Jual': 90000, 'Stok Toko Utama': 20 }];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, "Template_Import_Mvape.xlsx");
};

window._initProductSearchboxes = function(products, activeStores) {
    buildProductSearchbox('t-product-id', 'transfer-modal', products);
    buildProductSearchbox('m-product-id', 'manual-logistics-modal', products);
};

function buildProductSearchbox(baseId, modalId, products) {
    const container = document.getElementById(`${baseId}-searchbox`);
    if (!container) return;
    
    container.innerHTML = `
        <div class="relative">
            <input type="text" id="${baseId}-text" placeholder="Ketik nama produk untuk mencari..." autocomplete="off" class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
            <input type="hidden" id="${baseId}" value="">
            <div id="${baseId}-list" class="absolute left-0 right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-xl max-h-40 overflow-y-auto z-50 shadow-xl p-1 hidden divide-y dark:divide-gray-800"></div>
        </div>
    `;
    
    const txtInput = document.getElementById(`${baseId}-text`);
    const hidInput = document.getElementById(baseId);
    const listDiv = document.getElementById(`${baseId}-list`);
    
    txtInput.addEventListener('input', function() {
        const q = this.value.toLowerCase();
        if(!q) { listDiv.classList.add('hidden'); return; }
        
        const matches = products.filter(p => p.name.toLowerCase().includes(q));
        if(matches.length === 0) {
            listDiv.innerHTML = `<p class="p-2 text-center text-[11px] text-gray-400">Produk tidak ditemukan</p>`;
            listDiv.classList.remove('hidden');
            return;
        }
        
        listDiv.innerHTML = matches.map(p => `
            <button type="button" data-id="${p.id}" data-name="${p.name}" class="w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs dark:text-white flex justify-between">
                <span class="font-medium">${p.name}</span>
                <span class="text-gray-400">Rp ${p.price.toLocaleString('id-ID')}</span>
            </button>
        `).join('');
        listDiv.classList.remove('hidden');
    });
    
    listDiv.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if(!btn) return;
        
        hidInput.value = btn.dataset.id;
        txtInput.value = btn.dataset.name;
        listDiv.classList.add('hidden');
        
        if (baseId === 't-product-id') window.updateOpnameSystemStockView();
    });
    
    document.addEventListener('click', (e) => {
        if(!container.contains(e.target)) listDiv.classList.add('hidden');
    });
}

export default { render };