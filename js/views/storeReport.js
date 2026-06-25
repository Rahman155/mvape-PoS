import db from '../db.js';

// State filter laporan per toko
let storeFilterMode = 'bulanan';   // 'harian' | 'mingguan' | 'bulanan' | 'tahunan'
let storeFilterDate  = new Date().toISOString().split('T')[0];          // YYYY-MM-DD
let storeFilterWeek  = '';                                                 // YYYY-Www (diisi dinamis)
let storeFilterMonth = new Date().toISOString().substring(0, 7);        // YYYY-MM
let storeFilterYear  = String(new Date().getFullYear());                 // YYYY
let storeFilterJurnalToko = 'semua';  // Filter toko untuk tabel jurnal
let chartInstances = {}; // Store chart instances untuk cleanup

// ── Palet Warna Menarik per Toko ─────────────────────────────────────────
const STORE_COLOR_PALETTES = {
    'Toko 1': { primary: '#FF6B6B', light: '#FFE5E5', dark: '#C92A2A' },
    'Toko 2': { primary: '#4ECDC4', light: '#E0F9F7', dark: '#0B9B92' },
    'Toko 3': { primary: '#45B7D1', light: '#E3F2FD', dark: '#0277BD' },
    'Toko 4': { primary: '#FFA07A', light: '#FFE4D6', dark: '#D2691E' },
    'Toko 5': { primary: '#98D8C8', light: '#F0FDFB', dark: '#2D6A4F' },
    'Toko 6': { primary: '#F7DC6F', light: '#FFFACD', dark: '#D4AF37' },
    'Toko 7': { primary: '#BB8FCE', light: '#F5E6F9', dark: '#8E44AD' },
    'Toko 8': { primary: '#85C1E2', light: '#E3F2FD', dark: '#1E5A8E' },
};

const DEFAULT_COLORS = [
    { primary: '#FF6B6B', light: '#FFE5E5', dark: '#C92A2A' },
    { primary: '#4ECDC4', light: '#E0F9F7', dark: '#0B9B92' },
    { primary: '#45B7D1', light: '#E3F2FD', dark: '#0277BD' },
    { primary: '#FFA07A', light: '#FFE4D6', dark: '#D2691E' },
    { primary: '#98D8C8', light: '#F0FDFB', dark: '#2D6A4F' },
    { primary: '#F7DC6F', light: '#FFFACD', dark: '#D4AF37' },
    { primary: '#BB8FCE', light: '#F5E6F9', dark: '#8E44AD' },
    { primary: '#85C1E2', light: '#E3F2FD', dark: '#1E5A8E' },
];

// ── Helper Week & Date Laporan Per Toko ─────────────────────────────────────
function getISOWeekAndYear(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr.split('T')[0]);
    if (isNaN(date.getTime())) return '';
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getCurWeekString() {
    return getISOWeekAndYear(new Date().toISOString());
}

// ── Get Color untuk Toko ─────────────────────────────────────────────────
function getStoreColor(storeName, index = 0) {
    if (STORE_COLOR_PALETTES[storeName]) {
        return STORE_COLOR_PALETTES[storeName];
    }
    return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

// ── Destroy Chart Instances sebelum membuat yang baru ──────────────────────
function destroyCharts() {
    Object.values(chartInstances).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    chartInstances = {};
}

// ── RENDER HALAMAN LAPORAN PER TOKO ────────────────────────────────────────
async function render(container) {
    // Mengambil seluruh data dari IndexedDB
    const transactions = await db.transactions.toArray();
    const expenses = [];
    let receivables = [];
    
    if (db.expenses) {
        const allExpenses = await db.expenses.toArray();
        expenses.push(...allExpenses);
    }
    if (db.receivables) {
        receivables = await db.receivables.toArray();
    }
    
    // Fallback pengambilan stores yang aman 
    let allStores = [];
    if(db.stores) allStores = await db.stores.toArray();
    const activeStores = allStores.filter(s => s.isActive);
    
    renderStoreSalesTab(container, transactions, expenses, receivables, activeStores);
}

function renderStoreSalesTab(target, transactions, expenses, receivables = [], activeStores = []) {
    if (!storeFilterWeek) storeFilterWeek = getCurWeekString();

    // ── Helper filter rentang waktu ──────────────────────────────────────────
    function txInRange(tx) {
        const ts = (tx.timestamp || '').split('T')[0];
        if (storeFilterMode === 'harian')   return ts === storeFilterDate;
        if (storeFilterMode === 'mingguan') return getISOWeekAndYear(tx.timestamp) === storeFilterWeek;
        if (storeFilterMode === 'bulanan')  return ts.substring(0, 7) === storeFilterMonth;
        if (storeFilterMode === 'tahunan')  return ts.substring(0, 4) === storeFilterYear;
        return true;
    }
    
    function expInRange(exp) {
        const d = (exp.date || '');
        if (storeFilterMode === 'harian')   return d === storeFilterDate;
        if (storeFilterMode === 'mingguan') return getISOWeekAndYear(exp.date) === storeFilterWeek;
        if (storeFilterMode === 'bulanan')  return d.substring(0, 7) === storeFilterMonth;
        if (storeFilterMode === 'tahunan')  return d.substring(0, 4) === storeFilterYear;
        return true;
    }
    
    const filteredTx  = transactions.filter(txInRange);
    const filteredExp = expenses.filter(expInRange);
    
    // ── Label periode aktif ──────────────────────────────────────────────────
    const BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    let periodLabel = '';
    if (storeFilterMode === 'harian')  periodLabel = new Date(storeFilterDate).toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});
    if (storeFilterMode === 'mingguan') {
        const [y, w] = storeFilterWeek.split('-W');
        periodLabel = `Minggu ke-${w}, Tahun ${y}`;
    }
    if (storeFilterMode === 'bulanan') { 
        const [y,m] = storeFilterMonth.split('-'); 
        periodLabel = `${BULAN_ID[+m-1]} ${y}`; 
    }
    if (storeFilterMode === 'tahunan') periodLabel = `Tahun ${storeFilterYear}`;

    // ── Kumpulkan semua nama toko dari transaksi + activeStores ────────────────
    const storeNames = [...new Set([
        ...activeStores.map(s => s.name),
        ...transactions.map(t => t.storeBranch).filter(Boolean),
    ])].sort();

    const perStore = {};
    storeNames.forEach(name => {
        perStore[name] = {
            txCount: 0,
            grossSales: 0,
            expenses: 0,
            piutangBelum: 0,
            piutangLunas: 0
        };
    });

    // Kalkulasi transaksi untuk rentang filter
    filteredTx.forEach(tx => {
        const branch = tx.storeBranch || storeNames[0] || 'Toko 1';
        if (!perStore[branch]) perStore[branch] = { txCount:0, grossSales:0, expenses:0, piutangBelum:0, piutangLunas:0 };
        const d = perStore[branch];
        d.grossSales += tx.total;
        d.txCount++;
    });

    // Kalkulasi pengeluaran untuk rentang filter
    filteredExp.forEach(e => {
        const branch = e.storeBranch || 'Tidak Diketahui';
        if (perStore[branch]) {
            perStore[branch].expenses += Number(e.amount) || 0;
        }
    });

    // Kalkulasi piutang (piutang dikaitkan dengan transaksi yang dibuat dalam rentang filter)
    const filteredTxIds = new Set(filteredTx.map(t => t.id));
    receivables.forEach(r => {
        const branch = r.storeBranch || storeNames[0] || 'Toko 1';
        if (!perStore[branch]) perStore[branch] = { txCount:0, grossSales:0, expenses:0, piutangBelum:0, piutangLunas:0 };
        
        // Filter piutang yang berkaitan dengan transaksi di periode terpilih
        if (filteredTxIds.has(r.transactionId)) {
            if (r.isPaid) perStore[branch].piutangLunas += Number(r.amount) || 0;
            else          perStore[branch].piutangBelum += Number(r.amount) || 0;
        }
    });

    // Total Grand
    let totalTxCount = 0;
    let totalGrossSales = 0;
    let totalExpenses = 0;
    let totalNetRevenue = 0;
    let totalPiutangBelum = 0;
    let totalPiutangLunas = 0;

    storeNames.forEach(name => {
        const d = perStore[name];
        totalTxCount       += d.txCount;
        totalGrossSales    += d.grossSales;
        totalExpenses      += d.expenses;
        totalNetRevenue    += (d.grossSales - d.expenses);
        totalPiutangBelum  += d.piutangBelum;
        totalPiutangLunas  += d.piutangLunas;
    });

    // Destroy chart instances lama sebelum render ulang
    destroyCharts();

    // Siapkan data untuk charts
    const chartLabels = storeNames;
    const salesData = storeNames.map(name => perStore[name].grossSales);
    const expensesData = storeNames.map(name => perStore[name].expenses);
    const netRevenueData = storeNames.map(name => perStore[name].grossSales - perStore[name].expenses);
    const chartColors = storeNames.map((name, idx) => getStoreColor(name, idx).primary);

    target.innerHTML = `
        <div class="w-full space-y-6">
            <!-- FILTER PERIODE -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <!-- Mode Filter -->
                    <div>
                        <label class="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 block">📅 Periode</label>
                        <div class="flex gap-2 flex-wrap">
                            <button onclick="window.changeStoreFilterMode('harian')"   class="px-2.5 py-1.5 text-xs font-semibold rounded-lg transition ${storeFilterMode === 'harian'   ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'}">Harian</button>
                            <button onclick="window.changeStoreFilterMode('mingguan')" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg transition ${storeFilterMode === 'mingguan' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'}">Minggu</button>
                            <button onclick="window.changeStoreFilterMode('bulanan')"  class="px-2.5 py-1.5 text-xs font-semibold rounded-lg transition ${storeFilterMode === 'bulanan'  ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'}">Bulan</button>
                            <button onclick="window.changeStoreFilterMode('tahunan')"  class="px-2.5 py-1.5 text-xs font-semibold rounded-lg transition ${storeFilterMode === 'tahunan'  ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'}">Tahun</button>
                        </div>
                    </div>
                    
                    <!-- Input Harian -->
                    ${storeFilterMode === 'harian' ? `
                    <div>
                        <label class="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 block">Tanggal</label>
                        <input type="date" value="${storeFilterDate}" onchange="window.changeStoreFilterDate(this.value)" class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs">
                    </div>
                    ` : ''}
                    
                    <!-- Input Mingguan -->
                    ${storeFilterMode === 'mingguan' ? `
                    <div>
                        <label class="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 block">Minggu</label>
                        <input type="week" value="${storeFilterWeek}" onchange="window.changeStoreFilterWeek(this.value)" class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs">
                    </div>
                    ` : ''}
                    
                    <!-- Input Bulanan -->
                    ${storeFilterMode === 'bulanan' ? `
                    <div>
                        <label class="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 block">Bulan</label>
                        <input type="month" value="${storeFilterMonth}" onchange="window.changeStoreFilterMonth(this.value)" class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs">
                    </div>
                    ` : ''}
                    
                    <!-- Input Tahunan -->
                    ${storeFilterMode === 'tahunan' ? `
                    <div>
                        <label class="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 block">Tahun</label>
                        <input type="number" min="2020" max="2099" value="${storeFilterYear}" onchange="window.changeStoreFilterYear(this.value)" class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs">
                    </div>
                    ` : ''}
                </div>
                <div class="mt-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400">📍 ${periodLabel}</div>
            </div>

            <!-- KPI CARDS -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-xl border border-indigo-200 dark:border-indigo-700/30 p-4">
                    <div class="text-[11px] font-bold text-indigo-600 dark:text-indigo-300 uppercase tracking-wider mb-1">💰 Penjualan Kotor</div>
                    <div class="text-2xl font-bold text-indigo-700 dark:text-indigo-200">Rp ${totalGrossSales.toLocaleString('id-ID')}</div>
                    <div class="text-xs text-indigo-500 dark:text-indigo-300 mt-1">${totalTxCount} transaksi</div>
                </div>
                
                <div class="bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20 rounded-xl border border-rose-200 dark:border-rose-700/30 p-4">
                    <div class="text-[11px] font-bold text-rose-600 dark:text-rose-300 uppercase tracking-wider mb-1">📊 Total Biaya</div>
                    <div class="text-2xl font-bold text-rose-700 dark:text-rose-200">Rp ${totalExpenses.toLocaleString('id-ID')}</div>
                    <div class="text-xs text-rose-500 dark:text-rose-300 mt-1">${storeNames.length} toko</div>
                </div>
                
                <div class="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700/30 p-4">
                    <div class="text-[11px] font-bold text-emerald-600 dark:text-emerald-300 uppercase tracking-wider mb-1">📈 Pendapatan Bersih</div>
                    <div class="text-2xl font-bold text-emerald-700 dark:text-emerald-200">Rp ${totalNetRevenue.toLocaleString('id-ID')}</div>
                    <div class="text-xs text-emerald-500 dark:text-emerald-300 mt-1">${((totalNetRevenue/totalGrossSales)*100).toFixed(1)}% margin</div>
                </div>
                
                <div class="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl border border-amber-200 dark:border-amber-700/30 p-4">
                    <div class="text-[11px] font-bold text-amber-600 dark:text-amber-300 uppercase tracking-wider mb-1">📋 Piutang Belum Lunas</div>
                    <div class="text-2xl font-bold text-amber-700 dark:text-amber-200">Rp ${totalPiutangBelum.toLocaleString('id-ID')}</div>
                    <div class="text-xs text-amber-500 dark:text-amber-300 mt-1">Piutang Lunas: Rp ${totalPiutangLunas.toLocaleString('id-ID')}</div>
                </div>
            </div>

            <!-- CHART SECTION -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Chart 1: Penjualan per Toko -->
                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div class="px-6 py-4 border-b dark:border-gray-800">
                        <h3 class="text-sm font-bold text-gray-800 dark:text-white">💵 Trend Penjualan Kotor per Toko</h3>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Grafik tren penjualan kotor menunjukkan pergerakan nilai penjualan</p>
                    </div>
                    <div class="p-6 bg-gradient-to-br from-gray-50/50 to-gray-50/30 dark:from-gray-800/50 dark:to-gray-800/30">
                        <canvas id="chartSales" style="max-height: 400px;"></canvas>
                    </div>
                </div>

                <!-- Chart 2: Biaya Operasional per Toko -->
                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div class="px-6 py-4 border-b dark:border-gray-800">
                        <h3 class="text-sm font-bold text-gray-800 dark:text-white">💸 Trend Biaya Operasional per Toko</h3>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Grafik tren biaya operasional menunjukkan pergerakan pengeluaran per toko</p>
                    </div>
                    <div class="p-6 bg-gradient-to-br from-gray-50/50 to-gray-50/30 dark:from-gray-800/50 dark:to-gray-800/30">
                        <canvas id="chartExpenses" style="max-height: 400px;"></canvas>
                    </div>
                </div>

                <!-- Chart 3: Pendapatan Bersih per Toko -->
                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div class="px-6 py-4 border-b dark:border-gray-800">
                        <h3 class="text-sm font-bold text-gray-800 dark:text-white">📊 Trend Pendapatan Bersih per Toko</h3>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Grafik tren keuntungan bersih menunjukkan pergerakan profitabilitas tiap toko</p>
                    </div>
                    <div class="p-6 bg-gradient-to-br from-gray-50/50 to-gray-50/30 dark:from-gray-800/50 dark:to-gray-800/30">
                        <canvas id="chartNetRevenue" style="max-height: 400px;"></canvas>
                    </div>
                </div>

                <!-- Chart 4: Ringkasan Perbandingan -->
                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div class="px-6 py-4 border-b dark:border-gray-800">
                        <h3 class="text-sm font-bold text-gray-800 dark:text-white">📈 Perbandingan Trend 3 Metrik Utama</h3>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Grafik perbandingan tren penjualan, biaya, dan keuntungan dalam satu tampilan</p>
                    </div>
                    <div class="p-6 bg-gradient-to-br from-gray-50/50 to-gray-50/30 dark:from-gray-800/50 dark:to-gray-800/30">
                        <canvas id="chartComparison" style="max-height: 400px;"></canvas>
                    </div>
                </div>
            </div>

            <!-- TABEL DETAIL RINGKASAN PER TOKO -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div class="px-5 py-4 border-b dark:border-gray-800 flex items-center justify-between">
                    <h3 class="text-sm font-bold text-gray-800 dark:text-white">🏪 Ringkasan Penjualan per Toko</h3>
                    <span class="text-[11px] font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">${storeNames.length} toko</span>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                        <thead>
                            <tr class="border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                                <th class="p-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">🏪 Toko</th>
                                <th class="p-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Transaksi</th>
                                <th class="p-4 text-right text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Penjualan Kotor</th>
                                <th class="p-4 text-right text-[10px] font-bold text-rose-400 uppercase tracking-wider">Biaya Operasi</th>
                                <th class="p-4 text-right text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Pendapatan Bersih</th>
                                <th class="p-4 text-right text-[10px] font-bold text-amber-400 uppercase tracking-wider">Piutang Belum</th>
                                <th class="p-4 text-right text-[10px] font-bold text-teal-400 uppercase tracking-wider">Piutang Lunas</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-gray-800">
                            ${storeNames.map((name, idx) => {
                                const d = perStore[name];
                                const netRevenue = d.grossSales - d.expenses;
                                const margin = d.grossSales > 0 ? ((netRevenue / d.grossSales) * 100).toFixed(1) : 0;
                                const color = getStoreColor(name, idx);
                                return `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                    <td class="p-4">
                                        <div class="flex items-center gap-2">
                                            <div class="w-3 h-3 rounded-full" style="background-color: ${color.primary};"></div>
                                            <span class="font-bold text-gray-700 dark:text-gray-300">${name}</span>
                                        </div>
                                    </td>
                                    <td class="p-4 text-right">
                                        <span class="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold">${d.txCount}</span>
                                    </td>
                                    <td class="p-4 text-right font-bold text-indigo-600 dark:text-indigo-400">Rp ${d.grossSales.toLocaleString('id-ID')}</td>
                                    <td class="p-4 text-right font-bold text-rose-600 dark:text-rose-400">-Rp ${d.expenses.toLocaleString('id-ID')}</td>
                                    <td class="p-4 text-right font-extrabold text-emerald-600 dark:text-emerald-400">Rp ${netRevenue.toLocaleString('id-ID')}</td>
                                    <td class="p-4 text-right font-semibold text-amber-600 dark:text-amber-400">Rp ${d.piutangBelum.toLocaleString('id-ID')}</td>
                                    <td class="p-4 text-right font-semibold text-teal-600 dark:text-teal-400">Rp ${d.piutangLunas.toLocaleString('id-ID')}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                        <tfoot>
                            <tr class="border-t-2 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/50 font-extrabold text-gray-700 dark:text-gray-200">
                                <td class="p-4">Total Gabungan</td>
                                <td class="p-4 text-right">${totalTxCount} tx</td>
                                <td class="p-4 text-right text-indigo-600 dark:text-indigo-400">Rp ${totalGrossSales.toLocaleString('id-ID')}</td>
                                <td class="p-4 text-right text-rose-600 dark:text-rose-400">-Rp ${totalExpenses.toLocaleString('id-ID')}</td>
                                <td class="p-4 text-right text-emerald-600 dark:text-emerald-400">Rp ${totalNetRevenue.toLocaleString('id-ID')}</td>
                                <td class="p-4 text-right text-red-600 dark:text-red-400">Rp ${totalPiutangBelum.toLocaleString('id-ID')}</td>
                                <td class="p-4 text-right">Rp ${totalPiutangLunas.toLocaleString('id-ID')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- JURNAL TRANSAKSI PENDAPATAN DENGAN FILTER TOKO -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div class="px-5 py-4 border-b dark:border-gray-800 flex items-center justify-between">
                    <h3 class="text-sm font-bold text-gray-800 dark:text-white">📝 Jurnal Transaksi Pendapatan</h3>
                    <span class="text-[11px] font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">${filteredTx.length} transaksi</span>
                </div>
                
                <!-- FILTER TOKO UNTUK JURNAL -->
                <div class="px-5 py-3 bg-gray-50/50 dark:bg-gray-800/30 border-b dark:border-gray-800">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-bold text-gray-600 dark:text-gray-400">Filter Toko:</span>
                        <button onclick="window.changeJurnalTokoFilter('semua')" 
                            class="px-3 py-1 rounded-lg text-xs font-semibold transition ${storeFilterJurnalToko === 'semua' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-indigo-300'}">
                            🌐 Semua Toko
                        </button>
                        ${storeNames.map(name => `
                            <button onclick="window.changeJurnalTokoFilter('${name}')" 
                                class="px-3 py-1 rounded-lg text-xs font-semibold transition ${storeFilterJurnalToko === name ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-indigo-300'}">
                                🏪 ${name}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                        <thead>
                            <tr class="border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                                <th class="p-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tanggal</th>
                                <th class="p-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Toko</th>
                                <th class="p-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">No. Struk</th>
                                <th class="p-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Jumlah Item</th>
                                <th class="p-4 text-right text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Total Penjualan</th>
                                <th class="p-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Metode Bayar</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-gray-800">
                            ${(() => {
                                // Filter transaksi berdasarkan toko
                                let displayedTx = filteredTx;
                                if (storeFilterJurnalToko !== 'semua') {
                                    displayedTx = filteredTx.filter(tx => (tx.storeBranch || storeNames[0]) === storeFilterJurnalToko);
                                }
                                
                                if (displayedTx.length === 0) {
                                    return `<tr><td colspan="6" class="p-8 text-center text-gray-400 italic">❌ Tidak ada transaksi dalam periode ini</td></tr>`;
                                }
                                
                                return displayedTx.map(tx => {
                                    const date = new Date(tx.timestamp).toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'});
                                    const time = new Date(tx.timestamp).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
                                    const colors = ['indigo','violet','teal','amber','rose'];
                                    const storeIdx = storeNames.indexOf(tx.storeBranch || storeNames[0]);
                                    const c = colors[storeIdx % colors.length];
                                    return `
                                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                        <td class="p-4">
                                            <div class="flex flex-col">
                                                <span class="font-semibold text-gray-800 dark:text-gray-200">${date}</span>
                                                <span class="text-[9px] text-gray-500">${time}</span>
                                            </div>
                                        </td>
                                        <td class="p-4">
                                            <div class="flex items-center gap-2">
                                                <span class="w-2 h-2 rounded-full bg-${c}-500"></span>
                                                <span class="font-bold text-gray-700 dark:text-gray-300">${tx.storeBranch || 'Toko 1'}</span>
                                            </div>
                                        </td>
                                        <td class="p-4 font-mono text-gray-600 dark:text-gray-400">#${tx.receiptNumber || tx.id?.substring(0,6) || '-'}</td>
                                        <td class="p-4 text-right font-semibold text-gray-600 dark:text-gray-400">${tx.itemCount || 1} item</td>
                                        <td class="p-4 text-right font-bold text-indigo-600 dark:text-indigo-400">Rp ${(tx.total || 0).toLocaleString('id-ID')}</td>
                                        <td class="p-4 text-right">
                                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold
                                                ${tx.paymentMethod === 'cash' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 
                                                  tx.paymentMethod === 'transfer' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                                                  tx.paymentMethod === 'credit' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                                                  'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}">
                                                ${tx.paymentMethod === 'cash' ? '💵 Tunai' : 
                                                  tx.paymentMethod === 'transfer' ? '🏦 Transfer' :
                                                  tx.paymentMethod === 'credit' ? '💳 Kredit' :
                                                  '❓ ' + (tx.paymentMethod || 'N/A')}
                                            </span>
                                        </td>
                                    </tr>`;
                                }).join('');
                            })()}
                        </tbody>
                    </table>
                    ${filteredTx.length === 0 ? `
                        <div class="p-8 text-center text-gray-500 dark:text-gray-400">
                            <p class="text-sm">❌ Tidak ada transaksi dalam periode ini</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    // Load Chart.js dari CDN jika belum ada
    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js';
        script.onload = () => {
            setTimeout(() => initCharts(chartLabels, salesData, expensesData, netRevenueData, chartColors), 100);
        };
        document.head.appendChild(script);
    } else {
        initCharts(chartLabels, salesData, expensesData, netRevenueData, chartColors);
    }
}

// ── Initialize Charts dengan Line Chart Layout ──────────────────────────
function initCharts(labels, salesData, expensesData, netRevenueData, colors) {
    const lineChartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    font: { size: 12, weight: 'bold' },
                    color: 'rgba(107, 114, 128, 0.8)',
                    padding: 20,
                    usePointStyle: true,
                    pointStyle: 'circle'
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                padding: 14,
                titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 12 },
                cornerRadius: 8,
                displayColors: true,
                callbacks: {
                    label: function(context) {
                        return context.dataset.label + ': Rp ' + context.parsed.y.toLocaleString('id-ID');
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    color: 'rgba(107, 114, 128, 0.8)',
                    font: { size: 11, weight: '600' }
                },
                grid: {
                    color: 'rgba(200, 200, 200, 0.08)',
                    drawBorder: false
                }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    callback: function(value) {
                        return 'Rp ' + (value / 1000000).toFixed(0) + 'M';
                    },
                    color: 'rgba(107, 114, 128, 0.7)',
                    font: { size: 11 }
                },
                grid: {
                    color: 'rgba(200, 200, 200, 0.1)',
                    drawBorder: false
                }
            }
        }
    };

    // Chart 1: Sales Line Chart
    const ctxSales = document.getElementById('chartSales');
    if (ctxSales) {
        chartInstances.sales = new Chart(ctxSales, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Penjualan Kotor',
                    data: salesData,
                    borderColor: '#6366F1',
                    backgroundColor: 'rgba(99, 102, 241, 0.05)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: '#6366F1',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#6366F1',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2,
                    segment: {
                        borderDash: ctx => ctx.p0DataIndex === ctx.p1DataIndex ? [5, 5] : undefined
                    }
                }]
            },
            options: lineChartOptions
        });
    }

    // Chart 2: Expenses Line Chart
    const ctxExpenses = document.getElementById('chartExpenses');
    if (ctxExpenses) {
        chartInstances.expenses = new Chart(ctxExpenses, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Biaya Operasional',
                    data: expensesData,
                    borderColor: '#EF4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: '#EF4444',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#EF4444',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2,
                }]
            },
            options: lineChartOptions
        });
    }

    // Chart 3: Net Revenue Line Chart
    const ctxNetRevenue = document.getElementById('chartNetRevenue');
    if (ctxNetRevenue) {
        chartInstances.netRevenue = new Chart(ctxNetRevenue, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Pendapatan Bersih',
                    data: netRevenueData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: '#10B981',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#10B981',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2,
                }]
            },
            options: lineChartOptions
        });
    }

    // Chart 4: Comparison Line Chart dengan Multi-Line
    const ctxComparison = document.getElementById('chartComparison');
    if (ctxComparison) {
        chartInstances.comparison = new Chart(ctxComparison, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Penjualan Kotor',
                        data: salesData,
                        borderColor: '#6366F1',
                        backgroundColor: 'rgba(99, 102, 241, 0.03)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: '#6366F1',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointHoverRadius: 7,
                    },
                    {
                        label: 'Biaya Operasional',
                        data: expensesData,
                        borderColor: '#EF4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.03)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: '#EF4444',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointHoverRadius: 7,
                    },
                    {
                        label: 'Pendapatan Bersih',
                        data: netRevenueData,
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.03)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: '#10B981',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointHoverRadius: 7,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            font: { size: 12, weight: 'bold' },
                            color: 'rgba(107, 114, 128, 0.8)',
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 14,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 12 },
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': Rp ' + context.parsed.y.toLocaleString('id-ID');
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: 'rgba(107, 114, 128, 0.8)',
                            font: { size: 11, weight: '600' }
                        },
                        grid: {
                            color: 'rgba(200, 200, 200, 0.08)',
                            drawBorder: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'Rp ' + (value / 1000000).toFixed(0) + 'M';
                            },
                            color: 'rgba(107, 114, 128, 0.7)',
                            font: { size: 11 }
                        },
                        grid: {
                            color: 'rgba(200, 200, 200, 0.1)',
                            drawBorder: false
                        }
                    }
                }
            }
        });
    }
}

// ── Global Filter Event Handlers Laporan Per Toko ───────────────────────
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

// ── Filter Toko untuk Jurnal Transaksi
window.changeJurnalTokoFilter = function(tokoName) {
    storeFilterJurnalToko = tokoName;
    render(document.getElementById('app-container'));
};

export default { render };
