import db from './db.js';

let activeSATab = 'overview';

// Menggantikan alert bawaan dengan modal kustom agar tidak memblokir antarmuka
window.saAlert = function(message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity duration-200 opacity-0';
        overlay.innerHTML = `
            <div class="bg-slate-900 border border-white/10 rounded-2xl p-5 md:p-6 max-w-sm w-full shadow-2xl transform scale-95 transition-transform duration-200">
                <h3 class="text-lg font-black text-white mb-2 flex items-center gap-2">ℹ️ Pemberitahuan</h3>
                <p class="text-sm text-slate-300 mb-6 leading-relaxed">${message.replace(/\n/g, '<br>')}</p>
                <button id="btn-ok" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-purple-900/50">Mengerti</button>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Animasi masuk
        requestAnimationFrame(() => {
            overlay.classList.remove('opacity-0');
            overlay.querySelector('div').classList.remove('scale-95');
        });

        overlay.querySelector('#btn-ok').onclick = () => {
            overlay.classList.add('opacity-0');
            setTimeout(() => { overlay.remove(); resolve(); }, 200);
        };
    });
};

window.saConfirm = function(message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity duration-200 opacity-0';
        overlay.innerHTML = `
            <div class="bg-slate-900 border border-white/10 rounded-2xl p-5 md:p-6 max-w-sm w-full shadow-2xl transform scale-95 transition-transform duration-200">
                <h3 class="text-lg font-black text-white mb-2 flex items-center gap-2">⚠️ Konfirmasi</h3>
                <p class="text-sm text-slate-300 mb-6 leading-relaxed">${message.replace(/\n/g, '<br>')}</p>
                <div class="flex gap-3">
                    <button id="btn-cancel" class="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3 rounded-xl text-sm transition">Batal</button>
                    <button id="btn-ok" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-red-900/50">Ya, Lanjutkan</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        requestAnimationFrame(() => {
            overlay.classList.remove('opacity-0');
            overlay.querySelector('div').classList.remove('scale-95');
        });

        overlay.querySelector('#btn-cancel').onclick = () => { overlay.remove(); resolve(false); };
        overlay.querySelector('#btn-ok').onclick = () => { overlay.remove(); resolve(true); };
    });
};

window.saPrompt = function(message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity duration-200 opacity-0';
        overlay.innerHTML = `
            <div class="bg-slate-900 border border-white/10 rounded-2xl p-5 md:p-6 max-w-sm w-full shadow-2xl transform scale-95 transition-transform duration-200">
                <h3 class="text-lg font-black text-white mb-2">Input Dibutuhkan</h3>
                <p class="text-sm text-slate-300 mb-4">${message.replace(/\n/g, '<br>')}</p>
                <input type="text" id="prompt-input" class="w-full p-3.5 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 mb-6" autocomplete="off" />
                <div class="flex gap-3">
                    <button id="btn-cancel" class="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3 rounded-xl text-sm transition">Batal</button>
                    <button id="btn-ok" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl text-sm transition">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        const input = overlay.querySelector('#prompt-input');
        requestAnimationFrame(() => {
            overlay.classList.remove('opacity-0');
            overlay.querySelector('div').classList.remove('scale-95');
            input.focus();
        });

        overlay.querySelector('#btn-cancel').onclick = () => { overlay.remove(); resolve(null); };
        overlay.querySelector('#btn-ok').onclick = () => { overlay.remove(); resolve(input.value); };
    });
};

async function render(container) {
    // Gather all data for the overview stats
    const [products, transactions, members, users, opnameLogs] = await Promise.all([
        db.products.toArray(),
        db.transactions.toArray(),
        db.members ? db.members.toArray() : [],
        db.users ? db.users.toArray() : [],
        db.stockOpnames ? db.stockOpnames.toArray() : [],
    ]);

    const totalRevenue = transactions.reduce((s, t) => s + t.total, 0);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTx = transactions.filter(t => t.timestamp.startsWith(todayStr));
    const todayRevenue = todayTx.reduce((s, t) => s + t.total, 0);

    if (window.registerSubTabs) {
        window.registerSubTabs([
            { key: 'overview', label: 'Overview', icon: '🏠', active: activeSATab === 'overview', onClick: "window.switchSATab('overview')" },
            { key: 'users', label: 'Kasir', icon: '🔑', active: activeSATab === 'users', onClick: "window.switchSATab('users')" },
            { key: 'products', label: 'Produk', icon: '📦', active: activeSATab === 'products', onClick: "window.switchSATab('products')" },
            { key: 'members', label: 'Member', icon: '👥', active: activeSATab === 'members', onClick: "window.switchSATab('members')" },
            { key: 'transactions', label: 'Transaksi', icon: '📋', active: activeSATab === 'transactions', onClick: "window.switchSATab('transactions')" },
            { key: 'database', label: 'Database', icon: '🗄️', active: activeSATab === 'database', onClick: "window.switchSATab('database')" }
        ]);
    }

    container.innerHTML = `
        <style>
            /* Menyembunyikan scrollbar untuk pengalaman mobile yang lebih bersih pada Tab bar */
            .hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        </style>
        <div class="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 -m-4 md:-m-6 p-4 md:p-6 flex flex-col">
            <!-- Header -->
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
                <div>
                    <div class="flex items-center gap-2 mb-2">
                        <span class="bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] sm:text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest">⚡ Super Admin</span>
                    </div>
                    <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">System Control</h1>
                    <p class="text-xs md:text-sm text-slate-400 mt-1">Manajemen sistem penuh & database.</p>
                </div>
                <div class="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] sm:text-xs text-slate-300 self-stretch md:self-auto justify-center">
                    <span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse inline-block"></span>
                    System Online &nbsp;·&nbsp; ${new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}
                </div>
            </div>

            <!-- Stat Cards (Grid di-adjust untuk mobile) -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
                <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 hover:bg-white/10 transition">
                    <div class="text-xl md:text-2xl mb-1">💰</div>
                    <p class="text-[9px] md:text-[10px] text-slate-400 uppercase tracking-wider truncate">Omset Hari Ini</p>
                    <p class="text-base md:text-lg font-black text-emerald-400 truncate">Rp ${todayRevenue.toLocaleString('id-ID')}</p>
                    <p class="text-[9px] md:text-[10px] text-slate-500 mt-0.5">${todayTx.length} transaksi</p>
                </div>
                <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 hover:bg-white/10 transition">
                    <div class="text-xl md:text-2xl mb-1">📊</div>
                    <p class="text-[9px] md:text-[10px] text-slate-400 uppercase tracking-wider truncate">Total Omset</p>
                    <p class="text-base md:text-lg font-black text-purple-300 truncate">Rp ${totalRevenue.toLocaleString('id-ID')}</p>
                    <p class="text-[9px] md:text-[10px] text-slate-500 mt-0.5">${transactions.length} transaksi</p>
                </div>
                <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 hover:bg-white/10 transition">
                    <div class="text-xl md:text-2xl mb-1">👥</div>
                    <p class="text-[9px] md:text-[10px] text-slate-400 uppercase tracking-wider truncate">Pengguna</p>
                    <p class="text-base md:text-lg font-black text-blue-300 truncate">${users.length} Kasir</p>
                    <p class="text-[9px] md:text-[10px] text-slate-500 mt-0.5">${members.length} member</p>
                </div>
                <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 hover:bg-white/10 transition">
                    <div class="text-xl md:text-2xl mb-1">📦</div>
                    <p class="text-[9px] md:text-[10px] text-slate-400 uppercase tracking-wider truncate">Katalog</p>
                    <p class="text-base md:text-lg font-black text-amber-300 truncate">${products.length} SKU</p>
                    <p class="text-[9px] md:text-[10px] text-slate-500 mt-0.5">${opnameLogs.length} log opname</p>
                </div>
            </div>

            <!-- Tab Content -->
            <div id="sa-tab-content" class="flex-1 flex flex-col"></div>
        </div>
    `;

    const tabContent = document.getElementById('sa-tab-content');
    if (activeSATab === 'overview')      renderOverviewTab(tabContent, transactions, products, users, members, opnameLogs);
    else if (activeSATab === 'users')    renderUsersTab(tabContent, users);
    else if (activeSATab === 'products') renderProductsTab(tabContent, products);
    else if (activeSATab === 'members')  renderMembersTab(tabContent, members, transactions);
    else if (activeSATab === 'transactions') renderTransactionsTab(tabContent, transactions);
    else if (activeSATab === 'database') renderDatabaseTab(tabContent);
}

// ─── TAB HELPERS ───────────────────────────────────────────────────────────

function card(content, extraCls = '') {
    return `<div class="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 text-white w-full ${extraCls}">${content}</div>`;
}
function heading(text) {
    return `<h3 class="text-xs md:text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">${text}</h3>`;
}
// Tambahan class whitespace-nowrap agar tabel rapih di scroll hp
function tableCls() {
    return 'w-full text-left text-xs text-slate-400 whitespace-nowrap';
}
function theadCls() {
    return 'bg-white/5 text-slate-300 uppercase tracking-wider text-[10px] sticky top-0 backdrop-blur-md z-10';
}

// ─── OVERVIEW TAB ──────────────────────────────────────────────────────────

function renderOverviewTab(target, transactions, products, users, members, opnameLogs) {
    const toko1Tx = transactions.filter(t => (t.storeBranch || 'Toko 1') === 'Toko 1');
    const toko2Tx = transactions.filter(t => t.storeBranch === 'Toko 2');
    const toko1Rev = toko1Tx.reduce((s, t) => s + t.total, 0);
    const toko2Rev = toko2Tx.reduce((s, t) => s + t.total, 0);
    const lowStock = products.filter(p => (p.stock || 0) <= 5);

    target.innerHTML = `
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
            <!-- Branch Performance -->
            ${card(`
                ${heading('🏪 Performa Per Cabang')}
                <div class="space-y-4">
                    <div>
                        <div class="flex justify-between text-xs mb-1.5">
                            <span class="text-slate-300 font-bold">Toko 1 (Pusat)</span>
                            <span class="text-emerald-400 font-black">Rp ${toko1Rev.toLocaleString('id-ID')}</span>
                        </div>
                        <div class="w-full bg-white/10 h-2.5 rounded-full overflow-hidden">
                            <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                                 style="width:${toko1Rev + toko2Rev > 0 ? Math.round((toko1Rev / (toko1Rev + toko2Rev)) * 100) : 0}%"></div>
                        </div>
                        <p class="text-[10px] text-slate-500 mt-1">${toko1Tx.length} transaksi</p>
                    </div>
                    <div>
                        <div class="flex justify-between text-xs mb-1.5">
                            <span class="text-slate-300 font-bold">Toko 2 (Cabang)</span>
                            <span class="text-purple-300 font-black">Rp ${toko2Rev.toLocaleString('id-ID')}</span>
                        </div>
                        <div class="w-full bg-white/10 h-2.5 rounded-full overflow-hidden">
                            <div class="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all"
                                 style="width:${toko1Rev + toko2Rev > 0 ? Math.round((toko2Rev / (toko1Rev + toko2Rev)) * 100) : 0}%"></div>
                        </div>
                        <p class="text-[10px] text-slate-500 mt-1">${toko2Tx.length} transaksi</p>
                    </div>
                </div>
            `)}

            <!-- Low Stock Alerts -->
            ${card(`
                ${heading('🚨 Stok Kritis (≤5 pcs)')}
                ${lowStock.length === 0
                    ? '<p class="text-slate-500 text-xs italic text-center py-4 bg-white/5 rounded-xl border border-white/5">Semua stok aman.</p>'
                    : `<div class="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        ${lowStock.map(p => `
                            <div class="flex justify-between items-center bg-red-500/10 border border-red-500/20 p-3 md:p-2.5 rounded-xl">
                                <div class="truncate mr-2">
                                    <p class="text-xs font-bold text-white truncate">${p.name}</p>
                                    <p class="text-[10px] text-slate-400">${p.category}</p>
                                </div>
                                <span class="text-red-400 font-black text-xs md:text-sm shrink-0">${p.stock || 0} pcs</span>
                            </div>
                        `).join('')}
                       </div>`
                }
            `)}

            <!-- Recent Transactions -->
            ${card(`
                ${heading('🕐 Transaksi Terbaru')}
                <div class="space-y-2 max-h-48 md:max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                    ${[...transactions].reverse().slice(0, 8).map(tx => `
                        <div class="flex justify-between items-center bg-white/5 p-3 md:p-2.5 rounded-xl border border-white/5">
                            <div class="truncate mr-2">
                                <p class="text-xs font-bold text-white truncate">${tx.id}</p>
                                <p class="text-[10px] text-slate-500">${new Date(tx.timestamp).toLocaleString('id-ID')} · ${tx.storeBranch || 'Toko 1'}</p>
                            </div>
                            <span class="text-emerald-400 font-black text-xs shrink-0">+Rp ${tx.total.toLocaleString('id-ID')}</span>
                        </div>
                    `).join('') || '<p class="text-slate-500 italic text-xs text-center py-4">Belum ada transaksi.</p>'}
                </div>
            `)}

            <!-- User Activity -->
            <div class="xl:col-span-3">
                ${card(`
                    ${heading('🔑 Daftar Akun Kasir & Status')}
                    <div class="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 hide-scrollbar pb-2">
                        <table class="${tableCls()}">
                            <thead class="${theadCls()}">
                                <tr>
                                    <th class="p-3 md:p-2.5 rounded-l-lg">Nama</th>
                                    <th class="p-3 md:p-2.5">Username</th>
                                    <th class="p-3 md:p-2.5 text-center">Cabang</th>
                                    <th class="p-3 md:p-2.5 text-center rounded-r-lg">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                <tr class="hover:bg-white/5 transition">
                                    <td class="p-3 md:p-2.5 font-bold text-white">Owner (Hardcoded)</td>
                                    <td class="p-3 md:p-2.5 font-mono text-purple-300">owner</td>
                                    <td class="p-3 md:p-2.5 text-center"><span class="bg-blue-500/20 text-blue-300 text-[10px] px-2.5 py-1 md:py-0.5 rounded-full">Semua Cabang</span></td>
                                    <td class="p-3 md:p-2.5 text-center"><span class="bg-emerald-500/20 text-emerald-300 text-[10px] px-2.5 py-1 md:py-0.5 rounded-full">● Aktif</span></td>
                                </tr>
                                ${users.map(u => `
                                    <tr class="hover:bg-white/5 transition">
                                        <td class="p-3 md:p-2.5 font-bold text-white">${u.name}</td>
                                        <td class="p-3 md:p-2.5 font-mono text-purple-300">@${u.username}</td>
                                        <td class="p-3 md:p-2.5 text-center"><span class="bg-indigo-500/20 text-indigo-300 text-[10px] px-2.5 py-1 md:py-0.5 rounded-full">${u.storeBranch || 'Toko 1'}</span></td>
                                        <td class="p-3 md:p-2.5 text-center">
                                            <span class="${u.status === 'Aktif' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'} text-[10px] px-2.5 py-1 md:py-0.5 rounded-full">
                                                ${u.status === 'Aktif' ? '● Aktif' : '○ Nonaktif'}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `)}
            </div>
        </div>
    `;
}

// ─── USERS TAB ─────────────────────────────────────────────────────────────

let saEditingUserId = null;

function renderUsersTab(target, users) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            ${card(`
                ${heading(`${saEditingUserId ? '📝 Edit' : '➕ Tambah'} Akun Kasir`)}
                <form id="sa-user-form" onsubmit="window.saSaveUser(event)" class="space-y-4">
                    <div>
                        <label class="block text-[10px] text-slate-400 font-bold uppercase mb-1.5 ml-1">Nama Lengkap</label>
                        <input type="text" id="sa-u-name" required class="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-400 font-bold uppercase mb-1.5 ml-1">Username Login</label>
                        <input type="text" id="sa-u-username" required class="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-400 font-bold uppercase mb-1.5 ml-1">Password</label>
                        <input type="password" id="sa-u-password" ${saEditingUserId ? '' : 'required'} class="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="${saEditingUserId ? 'Kosongkan jika tidak diubah' : ''}">
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-400 font-bold uppercase mb-1.5 ml-1">Cabang</label>
                        <select id="sa-u-branch" class="w-full p-3 bg-slate-800 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                            <option value="Toko 1">Toko 1 (Pusat)</option>
                            <option value="Toko 2">Toko 2 (Cabang)</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-400 font-bold uppercase mb-1.5 ml-1">Status</label>
                        <select id="sa-u-status" class="w-full p-3 bg-slate-800 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                            <option value="Aktif">🟢 Aktif</option>
                            <option value="Nonaktif">🔴 Nonaktif</option>
                        </select>
                    </div>
                    <div class="flex gap-2 pt-2">
                        <button type="submit" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 md:py-2.5 rounded-xl text-sm transition">
                            ${saEditingUserId ? 'Simpan' : 'Daftar Kasir'}
                        </button>
                        ${saEditingUserId ? `<button type="button" onclick="window.saCancelUserEdit()" class="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-3 md:py-2.5 rounded-xl text-sm transition">Batal</button>` : ''}
                    </div>
                </form>
            `)}

            <div class="lg:col-span-2">
                ${card(`
                    ${heading('🔑 Semua Akun Pengguna')}
                    <div class="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 hide-scrollbar pb-2">
                        <table class="${tableCls()}">
                            <thead class="${theadCls()}">
                                <tr>
                                    <th class="p-3 md:p-2.5 rounded-l-lg">Nama</th>
                                    <th class="p-3 md:p-2.5">Username</th>
                                    <th class="p-3 md:p-2.5 text-center">Cabang</th>
                                    <th class="p-3 md:p-2.5 text-center">Status</th>
                                    <th class="p-3 md:p-2.5 text-center rounded-r-lg">Aksi</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                <tr class="hover:bg-white/5">
                                    <td class="p-3 md:p-2.5 font-bold text-white">Owner</td>
                                    <td class="p-3 md:p-2.5 font-mono text-purple-300">owner</td>
                                    <td class="p-3 md:p-2.5 text-center"><span class="bg-blue-500/20 text-blue-300 text-[10px] px-2.5 py-1 rounded-full">Semua Cabang</span></td>
                                    <td class="p-3 md:p-2.5 text-center"><span class="bg-yellow-500/20 text-yellow-300 text-[10px] px-2.5 py-1 rounded-full">🔒 Hardcoded</span></td>
                                    <td class="p-3 md:p-2.5 text-center text-slate-600 text-[10px] italic">—</td>
                                </tr>
                                ${users.length === 0
                                    ? '<tr><td colspan="5" class="p-8 text-center text-slate-500 italic">Belum ada kasir terdaftar.</td></tr>'
                                    : users.map(u => `
                                    <tr class="hover:bg-white/5 transition">
                                        <td class="p-3 md:p-2.5 font-bold text-white">${u.name}</td>
                                        <td class="p-3 md:p-2.5 font-mono text-purple-300">@${u.username}</td>
                                        <td class="p-3 md:p-2.5 text-center"><span class="bg-indigo-500/20 text-indigo-300 text-[10px] px-2.5 py-1 rounded-full">${u.storeBranch || 'Toko 1'}</span></td>
                                        <td class="p-3 md:p-2.5 text-center">
                                            <span class="${u.status === 'Aktif' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'} text-[10px] px-2.5 py-1 rounded-full">${u.status}</span>
                                        </td>
                                        <td class="p-3 md:p-2.5 text-center flex justify-center gap-1.5">
                                            <button onclick="window.saEditUser('${u.id}')" class="bg-blue-500/20 text-blue-300 hover:bg-blue-500/40 px-3 py-1.5 rounded-lg text-[10px] font-bold transition">Edit</button>
                                            <button onclick="window.saDeleteUser('${u.id}')" class="bg-red-500/20 text-red-400 hover:bg-red-500/40 px-3 py-1.5 rounded-lg text-[10px] font-bold transition">Hapus</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `, 'flex flex-col h-full')}
            </div>
        </div>
    `;
}

// ─── PRODUCTS TAB ──────────────────────────────────────────────────────────

let saEditingProductId = null;

function renderProductsTab(target, products) {
    target.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            ${card(`
                ${heading(`${saEditingProductId ? '📝 Edit' : '➕ Tambah'} Produk`)}
                <form id="sa-product-form" onsubmit="window.saSaveProduct(event)" class="space-y-3.5">
                    <div>
                        <label class="block text-[10px] text-slate-400 font-bold uppercase mb-1.5 ml-1">Nama Produk</label>
                        <input type="text" id="sa-p-name" required class="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-400 font-bold uppercase mb-1.5 ml-1">Kategori</label>
                        <select id="sa-p-category" class="w-full p-3 bg-slate-800 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                            <option>Liquid</option><option>Device</option><option>Atomizer</option><option>Accessories</option><option>Minuman</option><option>Makanan</option>
                        </select>
                    </div>
                    <!-- Di HP grid 1 kolom, di tablet/desktop 2 kolom -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] text-indigo-300 font-bold uppercase mb-1.5 ml-1">Stok Toko 1</label>
                            <input type="number" id="sa-p-stock1" min="0" required value="0" class="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                        </div>
                        <div>
                            <label class="block text-[10px] text-purple-300 font-bold uppercase mb-1.5 ml-1">Stok Toko 2</label>
                            <input type="number" id="sa-p-stock2" min="0" required value="0" class="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] text-slate-400 font-bold uppercase mb-1.5 ml-1">Harga Beli (HPP)</label>
                            <input type="number" id="sa-p-purchase" min="0" required value="0" class="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-slate-500/50">
                        </div>
                        <div>
                            <label class="block text-[10px] text-slate-400 font-bold uppercase mb-1.5 ml-1">Harga Jual</label>
                            <input type="number" id="sa-p-price" min="0" required value="0" class="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                        </div>
                    </div>
                    <div class="flex gap-2 pt-2">
                        <button type="submit" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 md:py-2.5 rounded-xl text-sm transition shadow-lg shadow-purple-900/40">
                            ${saEditingProductId ? 'Simpan' : 'Tambah Produk'}
                        </button>
                        ${saEditingProductId ? `<button type="button" onclick="window.saCancelProductEdit()" class="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-3 md:py-2.5 rounded-xl text-sm">Batal</button>` : ''}
                    </div>
                </form>
            `)}

            <div class="lg:col-span-2">
                ${card(`
                    ${heading('📦 Master Data Produk')}
                    <div class="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 max-h-[60vh] overflow-y-auto custom-scrollbar pb-2">
                        <table class="${tableCls()}">
                            <thead class="${theadCls()}">
                                <tr>
                                    <th class="p-3 md:p-2.5 rounded-l-lg">Produk</th>
                                    <th class="p-3 md:p-2.5 text-center">Stok T1 / T2</th>
                                    <th class="p-3 md:p-2.5 text-right">HPP</th>
                                    <th class="p-3 md:p-2.5 text-right">Harga Jual</th>
                                    <th class="p-3 md:p-2.5 text-center rounded-r-lg">Aksi</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${products.length === 0
                                    ? '<tr><td colspan="5" class="p-8 text-center text-slate-500 italic">Belum ada produk.</td></tr>'
                                    : products.map(p => {
                                        const s1 = p.stockToko1 !== undefined ? p.stockToko1 : (p.stock || 0);
                                        const s2 = p.stockToko2 || 0;
                                        const total = s1 + s2;
                                        return `
                                        <tr class="hover:bg-white/5 transition">
                                            <td class="p-3 md:p-2.5">
                                                <p class="font-bold text-white max-w-[120px] md:max-w-xs truncate">${p.name}</p>
                                                <span class="text-[9px] bg-white/10 text-slate-400 px-1.5 py-0.5 rounded uppercase">${p.category}</span>
                                            </td>
                                            <td class="p-3 md:p-2.5 text-center text-xs">
                                                <span class="text-indigo-300 font-bold">${s1}</span>
                                                <span class="text-slate-600 px-1">/</span>
                                                <span class="text-purple-300 font-bold">${s2}</span>
                                                <div class="${total <= 5 ? 'text-red-400' : 'text-slate-500'} text-[9px] mt-0.5">Total: ${total}</div>
                                            </td>
                                            <td class="p-3 md:p-2.5 text-right text-slate-400">Rp ${(p.purchasePrice || 0).toLocaleString('id-ID')}</td>
                                            <td class="p-3 md:p-2.5 text-right font-bold text-emerald-400">Rp ${(p.price || 0).toLocaleString('id-ID')}</td>
                                            <td class="p-3 md:p-2.5 text-center flex justify-center gap-1.5">
                                                <button onclick="window.saEditProduct('${p.id}')" class="bg-blue-500/20 text-blue-300 hover:bg-blue-500/40 px-3 py-1.5 rounded-lg text-[10px] font-bold transition">Edit</button>
                                                <button onclick="window.saDeleteProduct('${p.id}')" class="bg-red-500/20 text-red-400 hover:bg-red-500/40 px-3 py-1.5 rounded-lg text-[10px] font-bold transition">Hapus</button>
                                            </td>
                                        </tr>`;
                                    }).join('')}
                            </tbody>
                        </table>
                    </div>
                `, 'flex flex-col h-full')}
            </div>
        </div>
    `;
}

// ─── MEMBERS TAB ───────────────────────────────────────────────────────────

function renderMembersTab(target, members, transactions) {
    target.innerHTML = `
        <div class="h-full flex flex-col">
            ${card(`
                ${heading('👥 Manajemen Database Member')}
                <div class="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 flex-1 max-h-[65vh] overflow-y-auto custom-scrollbar pb-2">
                    <table class="${tableCls()}">
                        <thead class="${theadCls()}">
                            <tr>
                                <th class="p-3 md:p-2.5 rounded-l-lg">ID</th>
                                <th class="p-3 md:p-2.5">Nama</th>
                                <th class="p-3 md:p-2.5">Telepon</th>
                                <th class="p-3 md:p-2.5 text-center">Tx</th>
                                <th class="p-3 md:p-2.5 text-right">Total Belanja</th>
                                <th class="p-3 md:p-2.5 text-right">Poin</th>
                                <th class="p-3 md:p-2.5 text-center rounded-r-lg">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${members.length === 0
                                ? '<tr><td colspan="7" class="p-12 text-center text-slate-500 italic">Belum ada member.</td></tr>'
                                : members.map(m => {
                                    const memberTxs = transactions.filter(t => t.memberId === m.id);
                                    const totalSpend = memberTxs.reduce((s, t) => s + t.total, 0);
                                    return `
                                    <tr class="hover:bg-white/5 transition">
                                        <td class="p-3 md:p-2.5 font-mono text-purple-300 text-[10px]">${m.id}</td>
                                        <td class="p-3 md:p-2.5 font-bold text-white">${m.name}</td>
                                        <td class="p-3 md:p-2.5 font-mono text-slate-400">${m.phone}</td>
                                        <td class="p-3 md:p-2.5 text-center text-slate-300">${memberTxs.length}x</td>
                                        <td class="p-3 md:p-2.5 text-right text-emerald-400 font-bold">Rp ${totalSpend.toLocaleString('id-ID')}</td>
                                        <td class="p-3 md:p-2.5 text-right"><span class="bg-amber-500/20 text-amber-300 font-bold px-2.5 py-1 rounded-lg text-[10px]">${m.points || 0} pts</span></td>
                                        <td class="p-3 md:p-2.5 text-center">
                                            <button onclick="window.saDeleteMember('${m.id}')" class="bg-red-500/20 text-red-400 hover:bg-red-500/40 px-3 py-1.5 rounded-lg text-[10px] font-bold transition">Hapus</button>
                                        </td>
                                    </tr>`;
                                }).join('')}
                        </tbody>
                    </table>
                </div>
            `, 'flex flex-col flex-1')}
        </div>
    `;
}

// ─── TRANSACTIONS TAB ──────────────────────────────────────────────────────

function renderTransactionsTab(target, transactions) {
    const total = transactions.reduce((s, t) => s + t.total, 0);
    target.innerHTML = `
        <div class="h-full flex flex-col">
            ${card(`
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div>
                        ${heading('📋 Semua Riwayat Transaksi')}
                        <p class="text-xs md:text-sm text-slate-400 -mt-2">Total omset: <span class="font-black text-emerald-400">Rp ${total.toLocaleString('id-ID')}</span></p>
                    </div>
                    <button onclick="window.saExportAllTx()" class="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-3 md:py-2.5 px-4 rounded-xl text-xs md:text-sm transition shadow flex items-center justify-center gap-2 shrink-0">
                        <span class="text-base">📊</span> Export Excel
                    </button>
                </div>
                <div class="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 flex-1 max-h-[60vh] overflow-y-auto custom-scrollbar pb-2">
                    <table class="${tableCls()}">
                        <thead class="${theadCls()}">
                            <tr>
                                <th class="p-3 md:p-2.5 rounded-l-lg">ID Nota</th>
                                <th class="p-3 md:p-2.5">Waktu</th>
                                <th class="p-3 md:p-2.5 text-center">Cabang</th>
                                <th class="p-3 md:p-2.5 text-center">Metode</th>
                                <th class="p-3 md:p-2.5">Member</th>
                                <th class="p-3 md:p-2.5 text-right rounded-r-lg">Total</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${[...transactions].reverse().map(tx => `
                                <tr class="hover:bg-white/5 transition">
                                    <td class="p-3 md:p-2.5 font-mono text-purple-300 text-[10px] font-bold">${tx.id}</td>
                                    <td class="p-3 md:p-2.5 text-slate-400 text-[10px]">${new Date(tx.timestamp).toLocaleString('id-ID')}</td>
                                    <td class="p-3 md:p-2.5 text-center"><span class="bg-blue-500/20 text-blue-300 text-[10px] px-2.5 py-1 rounded-full">${tx.storeBranch || 'Toko 1'}</span></td>
                                    <td class="p-3 md:p-2.5 text-center">
                                        <span class="${tx.paymentMethod === 'TUNAI' ? 'bg-amber-500/20 text-amber-300' : 'bg-purple-500/20 text-purple-300'} text-[10px] px-2.5 py-1 rounded-full font-bold">
                                            ${tx.paymentMethod}
                                        </span>
                                    </td>
                                    <td class="p-3 md:p-2.5 text-slate-400 text-[10px]">${tx.memberName || '—'}</td>
                                    <td class="p-3 md:p-2.5 text-right font-black text-emerald-400">Rp ${tx.total.toLocaleString('id-ID')}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="6" class="p-12 text-center text-slate-500 italic">Belum ada transaksi.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `, 'flex flex-col flex-1')}
        </div>
    `;
}

// ─── DATABASE TAB ──────────────────────────────────────────────────────────

function renderDatabaseTab(target) {
    target.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            ${card(`
                ${heading('📤 Backup & Export Data')}
                <p class="text-xs text-slate-400 mb-5 leading-relaxed">Export seluruh data dari IndexedDB ke file JSON atau Excel sebagai backup rutin.</p>
                <div class="space-y-3 md:space-y-4">
                    <button onclick="window.saBackupJSON()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 md:py-3 rounded-xl text-sm transition flex items-center justify-center gap-2">
                        <span class="text-lg">📁</span> Backup Semua Data (JSON)
                    </button>
                    <button onclick="window.saExportAllTx()" class="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3.5 md:py-3 rounded-xl text-sm transition flex items-center justify-center gap-2">
                        <span class="text-lg">📊</span> Export Transaksi (Excel)
                    </button>
                    <button onclick="window.saExportOpname()" class="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-3.5 md:py-3 rounded-xl text-sm transition flex items-center justify-center gap-2">
                        <span class="text-lg">📊</span> Export Opname (Excel)
                    </button>
                    <button onclick="window.saExportProducts()" class="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3.5 md:py-3 rounded-xl text-sm transition flex items-center justify-center gap-2">
                        <span class="text-lg">📊</span> Export Produk (Excel)
                    </button>
                </div>
            `)}

            ${card(`
                ${heading('⚠️ Danger Zone — Reset Data')}
                <p class="text-xs text-red-300 mb-5 bg-red-500/10 border border-red-500/20 p-3.5 rounded-xl leading-relaxed">
                    ⚠️ <strong>Peringatan!</strong> Operasi di bawah ini bersifat permanen dan tidak dapat dibatalkan. Pastikan sudah melakukan backup sebelum melanjutkan.
                </p>
                <div class="space-y-3 md:space-y-4">
                    <button onclick="window.saResetTransactions()" class="w-full bg-orange-600/80 hover:bg-orange-600 text-white font-bold py-3.5 md:py-3 rounded-xl text-sm transition flex items-center justify-center gap-2">
                        <span class="text-lg">🗑️</span> Hapus Semua Transaksi
                    </button>
                    <button onclick="window.saResetMembers()" class="w-full bg-orange-700/80 hover:bg-orange-700 text-white font-bold py-3.5 md:py-3 rounded-xl text-sm transition flex items-center justify-center gap-2">
                        <span class="text-lg">🗑️</span> Hapus Semua Member
                    </button>
                    <button onclick="window.saFactoryReset()" class="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3.5 md:py-3 rounded-xl text-sm transition flex items-center justify-center gap-2 border border-red-500/40 shadow-lg shadow-red-900/30">
                        <span class="text-lg">💥</span> Factory Reset (Hapus Semua)
                    </button>
                </div>
            `)}
        </div>
    `;
}

// ─── GLOBAL EVENT HANDLERS ─────────────────────────────────────────────────

window.switchSATab = function(tabName) {
    activeSATab = tabName;
    render(document.getElementById('app-container'));
};

// --- Users ---
window.saSaveUser = async function(e) {
    e.preventDefault();
    const name     = document.getElementById('sa-u-name').value.trim();
    const username = document.getElementById('sa-u-username').value.trim();
    const password = document.getElementById('sa-u-password').value;
    const branch   = document.getElementById('sa-u-branch').value;
    const status   = document.getElementById('sa-u-status').value;

    if (saEditingUserId) {
        const updates = { name, username, branch, status, storeBranch: branch };
        if (password) updates.password = password;
        await db.users.update(saEditingUserId, updates);
        saEditingUserId = null;
        await window.saAlert('Akun kasir berhasil diperbarui!');
    } else {
        const existing = await db.users.where('username').equalsIgnoreCase(username).first();
        if (existing) return await window.saAlert('Username sudah digunakan!');
        if (!password) return await window.saAlert('Password wajib diisi untuk akun baru!');
        const id = 'USR' + Date.now().toString().slice(-5);
        await db.users.add({ id, name, username, password, status, storeBranch: branch, timestamp: new Date().toISOString() });
        await window.saAlert('Kasir berhasil didaftarkan!');
    }
    render(document.getElementById('app-container'));
};

window.saEditUser = async function(id) {
    const u = await db.users.get(id);
    if (!u) return;
    saEditingUserId = id;
    activeSATab = 'users';
    await render(document.getElementById('app-container'));
    document.getElementById('sa-u-name').value     = u.name;
    document.getElementById('sa-u-username').value = u.username;
    document.getElementById('sa-u-branch').value   = u.storeBranch || 'Toko 1';
    document.getElementById('sa-u-status').value   = u.status;
    
    // Scroll ke form di mobile
    document.getElementById('sa-user-form').scrollIntoView({behavior: 'smooth', block: 'start'});
};

window.saCancelUserEdit = function() {
    saEditingUserId = null;
    render(document.getElementById('app-container'));
};

window.saDeleteUser = async function(id) {
    const confirmed = await window.saConfirm('Yakin ingin menghapus akun kasir ini?');
    if (confirmed) {
        await db.users.delete(id);
        render(document.getElementById('app-container'));
    }
};

// --- Products ---
window.saSaveProduct = async function(e) {
    e.preventDefault();
    const name = document.getElementById('sa-p-name').value.trim();
    const category = document.getElementById('sa-p-category').value;
    const stockToko1 = parseInt(document.getElementById('sa-p-stock1').value) || 0;
    const stockToko2 = parseInt(document.getElementById('sa-p-stock2').value) || 0;
    const purchasePrice = parseFloat(document.getElementById('sa-p-purchase').value) || 0;
    const price = parseFloat(document.getElementById('sa-p-price').value) || 0;
    const stock = stockToko1 + stockToko2;

    if (saEditingProductId) {
        await db.products.update(saEditingProductId, { name, category, stock, stockToko1, stockToko2, purchasePrice, price });
        saEditingProductId = null;
    } else {
        const id = 'PROD' + Date.now().toString().slice(-5);
        await db.products.add({ id, name, category, stock, stockToko1, stockToko2, purchasePrice, price });
    }
    render(document.getElementById('app-container'));
};

window.saEditProduct = async function(id) {
    const p = await db.products.get(id);
    if (!p) return;
    saEditingProductId = id;
    activeSATab = 'products';
    await render(document.getElementById('app-container'));
    document.getElementById('sa-p-name').value     = p.name;
    document.getElementById('sa-p-category').value = p.category;
    document.getElementById('sa-p-stock1').value   = p.stockToko1 !== undefined ? p.stockToko1 : (p.stock || 0);
    document.getElementById('sa-p-stock2').value   = p.stockToko2 || 0;
    document.getElementById('sa-p-purchase').value = p.purchasePrice || 0;
    document.getElementById('sa-p-price').value    = p.price || 0;

    // Scroll ke atas
    document.getElementById('sa-product-form').scrollIntoView({behavior: 'smooth', block: 'start'});
};

window.saCancelProductEdit = function() {
    saEditingProductId = null;
    render(document.getElementById('app-container'));
};

window.saDeleteProduct = async function(id) {
    const confirmed = await window.saConfirm('Yakin ingin menghapus produk ini?');
    if (confirmed) {
        await db.products.delete(id);
        render(document.getElementById('app-container'));
    }
};

// --- Members ---
window.saDeleteMember = async function(id) {
    const confirmed = await window.saConfirm('Yakin hapus data member ini secara permanen?');
    if (confirmed) {
        await db.members.delete(id);
        render(document.getElementById('app-container'));
    }
};

// --- Exports ---
window.saExportAllTx = async function() {
    const transactions = await db.transactions.toArray();
    if (!transactions.length) return await window.saAlert('Tidak ada data transaksi.');
    const data = transactions.map(tx => ({
        'ID Transaksi': tx.id,
        'Waktu': new Date(tx.timestamp).toLocaleString('id-ID'),
        'Subtotal': tx.subtotal || tx.total,
        'Diskon': tx.discount || 0,
        'Total': tx.total,
        'Metode': tx.paymentMethod,
        'Cabang': tx.storeBranch || 'Toko 1',
        'ID Member': tx.memberId || '-',
        'Nama Member': tx.memberName || '-'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transaksi');
    XLSX.writeFile(wb, 'SuperAdmin_Laporan_Transaksi.xlsx');
};

window.saExportOpname = async function() {
    const logs = db.stockOpnames ? await db.stockOpnames.toArray() : [];
    if (!logs.length) return await window.saAlert('Tidak ada data opname.');
    const data = logs.map(l => ({
        'Tanggal': new Date(l.timestamp).toLocaleString('id-ID'),
        'Produk': l.productName,
        'Stok Sistem': l.systemStock,
        'Stok Fisik': l.actualStock,
        'Selisih': l.difference,
        'Dampak Biaya': l.costImpact,
        'Keterangan': l.reason
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Opname');
    XLSX.writeFile(wb, 'SuperAdmin_Stock_Opname.xlsx');
};

window.saExportProducts = async function() {
    const products = await db.products.toArray();
    if (!products.length) return await window.saAlert('Tidak ada data produk.');
    const data = products.map(p => ({
        'ID': p.id,
        'Nama Produk': p.name,
        'Kategori': p.category,
        'Stok Toko 1': p.stockToko1 !== undefined ? p.stockToko1 : (p.stock || 0),
        'Stok Toko 2': p.stockToko2 || 0,
        'Total Stok': p.stock || 0,
        'Harga Beli': p.purchasePrice || 0,
        'Harga Jual': p.price || 0
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produk');
    XLSX.writeFile(wb, 'SuperAdmin_Produk.xlsx');
};

window.saBackupJSON = async function() {
    const [products, transactions, transactionItems, members, users, stockOpnames, settings] = await Promise.all([
        db.products.toArray(),
        db.transactions.toArray(),
        db.transactionItems.toArray(),
        db.members ? db.members.toArray() : [],
        db.users ? db.users.toArray() : [],
        db.stockOpnames ? db.stockOpnames.toArray() : [],
        db.settings ? db.settings.toArray() : [],
    ]);
    const backup = { exportedAt: new Date().toISOString(), products, transactions, transactionItems, members, users, stockOpnames, settings };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MvapePoS_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

// --- Danger Zone ---
window.saResetTransactions = async function() {
    const confirmed = await window.saConfirm('⚠️ PERHATIAN! Ini akan menghapus SEMUA data transaksi dan item transaksi secara permanen. Lanjutkan?');
    if (!confirmed) return;
    
    await db.transactions.clear();
    await db.transactionItems.clear();
    if (db.stock_mutations) await db.stock_mutations.clear();
    
    await window.saAlert('Semua data transaksi berhasil dihapus.');
    render(document.getElementById('app-container'));
};

window.saResetMembers = async function() {
    const confirmed = await window.saConfirm('⚠️ Ini akan menghapus SEMUA data member. Lanjutkan?');
    if (!confirmed) return;
    
    if (db.members) await db.members.clear();
    
    await window.saAlert('Semua data member berhasil dihapus.');
    render(document.getElementById('app-container'));
};

window.saFactoryReset = async function() {
    const confirmed = await window.saConfirm('💥 FACTORY RESET!\n\nIni akan menghapus SEMUA data di seluruh database. Aksi ini tidak dapat dibatalkan.\n\nKlik "Ya, Lanjutkan" untuk memproses konfirmasi akhir.');
    if (!confirmed) return;
    
    const confirmText = await window.saPrompt('Ketik "RESET" untuk mengeksekusi Factory Reset:');
    if (confirmText !== 'RESET') {
        return await window.saAlert('Factory Reset dibatalkan. Input tidak cocok.');
    }
    
    await db.products.clear();
    await db.transactions.clear();
    await db.transactionItems.clear();
    if (db.stock_mutations)  await db.stock_mutations.clear();
    if (db.stockOpnames)     await db.stockOpnames.clear();
    if (db.members)          await db.members.clear();
    if (db.users)            await db.users.clear();
    
    await window.saAlert('Factory reset selesai. Aplikasi akan dimuat ulang.');
    location.reload();
};

export default { render };