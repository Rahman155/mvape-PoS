import db from '../db.js';

// State penyimpanan internal kasir
let cart = [];
let selectedStoreId = 'toko1'; // Default toko aktif pertama
let selectedMemberId = '';
let paymentMethod = 'Cash';

// State Diskon Manual
let discountType = 'rp'; // 'rp' atau 'percent'
let manualDiscountValue = 0; // Nilai input diskon
let serviceFeeValue = 0; // Nilai input biaya jasa

// State filter pencarian produk
let productSearchQuery = '';
let selectedCategory = 'Semua';

// State tampilan produk: 'list', 'grid', 'tiles'
let productViewMode = 'list';

// State untuk tab navigation
let activeTab = 'kasir'; // 'kasir', 'piutang', 'pengeluaran', 'riwayat'

// State untuk riwayat transaksi
let riwayatSearchQuery = '';
let riwayatFilter = 'semua'; // 'semua', 'aktif', 'batal'

// State untuk piutang
let receivablesFilter = 'semua'; // 'semua', 'belum_lunas', 'lunas'

// State untuk pengeluaran
let expenseCategory = 'Semua'; // Filter kategori pengeluaran

// ── Helper: ambil nomor toko dari ID dengan aman ──────────────────────────────
function getStoreNum(storeId) {
    const m = (storeId || 'toko1').match(/\d+/);
    return m ? m[0] : '1';
}

async function render(container) {
    if (window.registerSubTabs) {
        window.registerSubTabs([
            { key: 'kasir', label: 'Kasir', icon: '🛒', active: activeTab === 'kasir', onClick: "window.switchTab('kasir')" },
            { key: 'piutang', label: 'Piutang', icon: '📋', active: activeTab === 'piutang', onClick: "window.switchTab('piutang')" },
            { key: 'pengeluaran', label: 'Pengeluaran', icon: '💰', active: activeTab === 'pengeluaran', onClick: "window.switchTab('pengeluaran')" },
            { key: 'riwayat', label: 'Riwayat', icon: '🕐', active: activeTab === 'riwayat', onClick: "window.switchTab('riwayat')" }
        ]);
    }
    // Render berdasarkan tab aktif
    if (activeTab === 'kasir') {
        await renderKasir(container);
    } else if (activeTab === 'piutang') {
        await renderPiutang(container);
    } else if (activeTab === 'pengeluaran') {
        await renderPengeluaran(container);
    } else if (activeTab === 'riwayat') {
        await renderRiwayat(container);
    }
}

// ============== TAB KASIR ==============
async function renderKasir(container) {
    // Ambil data pendukung dari IndexedDB
    const allProducts = await db.products.toArray();
    const allStores = await db.stores.toArray();
    const activeStores = allStores.filter(s => s.isActive);
    let members = [];
    if (db.members) members = await db.members.toArray();

    const getCurrentBranch = () => localStorage.getItem('storeBranch') || 'Toko 1';
    const currentBranch = getCurrentBranch();

    // Sinkronisasi selectedStoreId dengan toko aktif yang tersimpan di localStorage
    const branchStore = activeStores.find(s => s.name === currentBranch);
    if (branchStore) selectedStoreId = branchStore.id;
    else if (activeStores.length > 0 && !activeStores.find(s => s.id === selectedStoreId)) {
        selectedStoreId = activeStores[0].id;
    }

    const storeNum = getStoreNum(selectedStoreId);
    const branchStockKey = `stockToko${storeNum}`;

    const filteredProducts = allProducts.filter(p => {
        if (!p || !p.id) return false;
        const matchesSearch = (p.name || '').toLowerCase().includes(productSearchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'Semua' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const { subtotal, discount, serviceFee, total } = calculateCartTotals();

    container.innerHTML = `
        <div class="space-y-3">
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-200px)]">
                
                <!-- SEKSI KIRI: KATALOG PRODUK (lg:col-span-7) -->
                <div class="lg:col-span-7 flex flex-col space-y-4">
                    
                    <!-- Filter & Pencarian -->
                    <div class="bg-white dark:bg-gray-900 p-3 sm:p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
                        <div class="flex flex-row justify-between items-center gap-2">
                            <h2 class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">Kasir ${currentBranch}</h2>
                            <!-- VIEW MODE TOGGLE -->
                            <div class="flex bg-gray-50 dark:bg-gray-800 p-0.5 rounded-xl border border-gray-200 dark:border-gray-700 shrink-0">
                                <button onclick="window.setProductViewMode('list')" title="List View" class="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-bold transition ${productViewMode === 'list' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}">
                                    <span class="sm:hidden">☰</span><span class="hidden sm:inline">☰ List</span>
                                </button>
                                <button onclick="window.setProductViewMode('grid')" title="Grid View" class="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-bold transition ${productViewMode === 'grid' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}">
                                    <span class="sm:hidden">⊞</span><span class="hidden sm:inline">⊞ Grid</span>
                                </button>
                                <button onclick="window.setProductViewMode('tiles')" title="Tiles View" class="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-bold transition ${productViewMode === 'tiles' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}">
                                    <span class="sm:hidden">▦</span><span class="hidden sm:inline">▦ Tiles</span>
                                </button>
                            </div>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-2">
                            <div class="relative flex-1">
                                <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">🔍</span>
                                <input type="text" id="pos-search" value="${productSearchQuery}" oninput="window.handlePOSSearch(this.value)" placeholder="Cari produk vape / liquid..." class="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition">
                            </div>
                            <select id="pos-category-filter" onchange="window.handlePOSCategory(this.value)" class="w-full sm:w-auto p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                                <option value="Semua">Semua Kategori</option>
                                <option value="Liquid" ${selectedCategory === 'Liquid' ? 'selected' : ''}>Liquid</option>
                                <option value="Device" ${selectedCategory === 'Device' ? 'selected' : ''}>Device (Mod/Pod)</option>
                                <option value="Atomizer" ${selectedCategory === 'Atomizer' ? 'selected' : ''}>Atomizer</option>
                                <option value="Accessories" ${selectedCategory === 'Accessories' ? 'selected' : ''}>Accessories</option>
                            </select>
                        </div>
                    </div>

                    <!-- TAMPILAN PRODUK (LIST / GRID / TILES) -->
                    <div class="${productViewMode === 'list' ? 'space-y-2' : productViewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-2'} overflow-y-auto max-h-[60vh] pr-1">
                        ${filteredProducts.length === 0 ? `
                            <div class="col-span-full py-12 text-center text-gray-400 italic">Produk tidak ditemukan atau stok kosong.</div>
                        ` : filteredProducts.map(p => {
                            if (!p || !p.id) return '';          // Bug 10: skip entri rusak
                            const branchStock = p[branchStockKey] || 0;
                            const isOutOfStock = branchStock <= 0;
                            const pName  = p.name  || '(tanpa nama)';
                            const pPrice = p.price || 0;

                            if (productViewMode === 'list') {
                                return `
                                <div class="bg-white dark:bg-gray-900 p-3.5 rounded-xl border ${isOutOfStock ? 'border-gray-100 dark:border-gray-800 opacity-60' : 'border-gray-100 dark:border-gray-800 hover:border-indigo-200 hover:shadow-md'} transition">
                                    <div class="flex items-center justify-between gap-4">
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center gap-2 mb-1">
                                                <span class="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-bold px-2 py-0.5 rounded-md uppercase whitespace-nowrap">${p.category || 'Vape'}</span>
                                                <span class="text-[10px] text-gray-400 dark:text-gray-500">Stok: <span class="font-bold ${branchStock <= 3 ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}">${branchStock} pcs</span></span>
                                            </div>
                                            <h4 class="font-bold text-gray-900 dark:text-white text-sm truncate">${pName}</h4>
                                            <p class="text-xs text-indigo-600 dark:text-indigo-400 font-extrabold mt-1">Rp ${pPrice.toLocaleString('id-ID')}</p>
                                        </div>
                                        <button onclick="${isOutOfStock ? '' : `window.addToCart('${p.id}')`}" class="px-3 py-2 rounded-lg ${isOutOfStock ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white'} transition text-xs font-bold whitespace-nowrap">
                                            ${isOutOfStock ? 'Habis' : '+ Tambah'}
                                        </button>
                                    </div>
                                </div>`;
                            } else if (productViewMode === 'grid') {
                                return `
                                <div class="bg-white dark:bg-gray-900 p-3 rounded-xl border ${isOutOfStock ? 'border-gray-100 dark:border-gray-800 opacity-60' : 'border-gray-100 dark:border-gray-800 hover:border-indigo-200 hover:shadow-md'} transition flex flex-col gap-2">
                                    <span class="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-bold px-2 py-0.5 rounded-md uppercase self-start">${p.category || 'Vape'}</span>
                                    <h4 class="font-bold text-gray-900 dark:text-white text-sm leading-snug flex-1">${pName}</h4>
                                    <p class="text-xs text-indigo-600 dark:text-indigo-400 font-extrabold">Rp ${pPrice.toLocaleString('id-ID')}</p>
                                    <div class="flex items-center justify-between">
                                        <span class="text-[10px] ${branchStock <= 3 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'} font-semibold">${branchStock} pcs</span>
                                        <button onclick="${isOutOfStock ? '' : `window.addToCart('${p.id}')`}" class="px-2.5 py-1.5 rounded-lg ${isOutOfStock ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white'} transition text-[11px] font-bold">
                                            ${isOutOfStock ? 'Habis' : '+ Tambah'}
                                        </button>
                                    </div>
                                </div>`;
                            } else {
                                // tiles view: compact square cards
                                return `
                                <div onclick="${isOutOfStock ? '' : `window.addToCart('${p.id}')`}" class="bg-white dark:bg-gray-900 p-2.5 rounded-xl border ${isOutOfStock ? 'border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed' : 'border-gray-100 dark:border-gray-800 hover:border-indigo-300 hover:shadow-lg cursor-pointer active:scale-95'} transition flex flex-col gap-1.5 min-h-[90px]">
                                    <span class="text-[9px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 font-bold px-1.5 py-0.5 rounded self-start uppercase leading-tight">${(p.category || 'Vape').substring(0,8)}</span>
                                    <h4 class="font-bold text-gray-900 dark:text-white text-[11px] leading-snug flex-1 line-clamp-2">${pName}</h4>
                                    <div class="flex items-end justify-between gap-1">
                                        <p class="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold leading-tight">${(pPrice/1000).toLocaleString('id-ID')}k</p>
                                        <span class="${isOutOfStock ? 'bg-gray-100 text-gray-400' : branchStock <= 3 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'} text-[9px] font-bold px-1.5 py-0.5 rounded">${isOutOfStock ? 'Habis' : branchStock}</span>
                                    </div>
                                </div>`;
                            }
                        }).join('')}
                    </div>
                </div>

                <!-- SEKSI KANAN: STRUK CHECKOUT & DISKON MANUAL (lg:col-span-5) -->
                <div class="lg:col-span-5 flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden h-fit">
                    <div class="p-4 border-b dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
                        <h3 class="font-bold text-gray-900 dark:text-white">Keranjang Belanja</h3>
                        <button onclick="window.clearCart()" class="text-xs text-red-500 hover:underline font-semibold">Kosongkan</button>
                    </div>

                    <!-- List Item Keranjang -->
                    <div class="p-4 space-y-3 overflow-y-auto max-h-[35vh] divide-y divide-gray-50 dark:divide-gray-800">
                        ${cart.length === 0 ? `
                            <div class="py-12 text-center text-gray-400 italic text-sm">Keranjang belanja kosong. Tambah produk di sebelah kiri.</div>
                        ` : cart.map(item => `
                            <div class="flex justify-between items-start pt-3 first:pt-0">
                                <div class="space-y-1 pr-2 flex-1">
                                    <h5 class="font-bold text-sm text-gray-900 dark:text-white">${item.name}</h5>
                                    <div class="flex items-center gap-1">
                                        <input type="text" placeholder="Catatan item..." value="${item.notes || ''}" onchange="window.updateCartNotes('${item.id}', this.value)" class="text-[10px] w-full p-1 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-md">
                                    </div>
                                </div>
                                <div class="text-right flex flex-col items-end space-y-1.5">
                                    <span class="text-xs font-bold text-gray-900 dark:text-white">Rp ${(item.price * item.quantity).toLocaleString('id-ID')}</span>
                                    <div class="flex items-center border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 p-0.5">
                                        <button onclick="window.updateCartQty('${item.id}', ${item.quantity - 1})" class="px-1.5 text-gray-500 font-bold hover:bg-gray-200 rounded text-xs">-</button>
                                        <span class="px-2 text-xs font-bold text-gray-800 dark:text-white">${item.quantity}</span>
                                        <button onclick="window.updateCartQty('${item.id}', ${item.quantity + 1})" class="px-1.5 text-gray-500 font-bold hover:bg-gray-200 rounded text-xs">+</button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- FORM PEMILIHAN MEMBER & INPUT DISKON MANUAL -->
                    <div class="p-4 bg-gray-50/50 dark:bg-gray-800/20 border-t border-b dark:border-gray-800 space-y-3">
                        <!-- Member Dropdown -->
                        <div>
                            <select onchange="window.selectPOSMember(this.value)" class="w-full p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                                <option value="">👤 Pelanggan Umum (Bukan Member)</option>
                                ${members.map(m => `<option value="${m.id}" ${m.id === selectedMemberId ? 'selected' : ''}>⭐ ${m.name} (${m.phone})</option>`).join('')}
                            </select>
                        </div>

                        <!-- INPUT DISKON MANUAL (UTAMA) -->
                        <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col gap-3">
                            <div class="flex items-center gap-2">
                                <span class="text-lg">🏷️</span>
                                <input type="number" id="manual-discount" placeholder="Diskon manual" value="${manualDiscountValue || ''}" onchange="window.setManualDiscount(this.value)" class="flex-1 w-full bg-transparent border-none text-sm dark:text-white font-bold focus:outline-none focus:ring-0">
                                <div class="flex bg-gray-100 dark:bg-gray-900 p-0.5 rounded-lg text-xs border dark:border-gray-700 shrink-0">
                                    <button onclick="window.setDiscountType('rp')" class="px-3 py-1.5 rounded-md font-bold transition ${discountType === 'rp' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900' }">Rp</button>
                                    <button onclick="window.setDiscountType('percent')" class="px-3 py-1.5 rounded-md font-bold transition ${discountType === 'percent' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900' }">%</button>
                                </div>
                            </div>
                            <div class="h-px bg-gray-100 dark:bg-gray-700"></div>
                            <div class="flex items-center gap-2">
                                <span class="text-lg">🛠️</span>
                                <input type="number" id="service-fee" placeholder="Biaya Jasa (Kapas, dll)" value="${serviceFeeValue || ''}" onchange="window.setServiceFee(this.value)" class="flex-1 w-full bg-transparent border-none text-sm dark:text-white font-bold focus:outline-none focus:ring-0">
                            </div>
                        </div>
                    </div>

                    <!-- KONTEN STICKY BAWAH UNTUK CHECKOUT -->
                    <div class="sticky bottom-0 bg-white dark:bg-gray-900 border-t dark:border-gray-800 p-4 space-y-3 pb-safe z-10 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.3)]">
                        <!-- Metode Pembayaran -->
                        <div>
                            <p class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">Metode Pembayaran</p>
                            <div class="grid grid-cols-4 gap-1.5">
                                ${[
                                    { value: 'Cash',     icon: '💵', label: 'Tunai',    color: 'emerald' },
                                    { value: 'Transfer', icon: '🏦', label: 'Transfer', color: 'blue'    },
                                    { value: 'E-wallet', icon: '📱', label: 'QRIS',     color: 'violet'  },
                                    { value: 'Piutang',  icon: '📋', label: 'Piutang',  color: 'rose'    },
                                ].map(m => {
                                    const active = paymentMethod === m.value;
                                    const activeClass = {
                                        emerald: 'bg-emerald-500 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/40 border-emerald-500',
                                        blue:    'bg-blue-500    text-white shadow-md shadow-blue-200    dark:shadow-blue-900/40    border-blue-500',
                                        violet:  'bg-violet-500  text-white shadow-md shadow-violet-200  dark:shadow-violet-900/40  border-violet-500',
                                        rose:    'bg-rose-500    text-white shadow-md shadow-rose-200    dark:shadow-rose-900/40    border-rose-500',
                                    }[m.color];
                                    const inactiveClass = 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600';
                                    return `
                                    <button type="button" onclick="window.selectPaymentMethod('${m.value}')"
                                        class="flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all active:scale-95 ${active ? activeClass : inactiveClass}">
                                        <span class="text-lg leading-none">${m.icon}</span>
                                        <span class="text-[10px] font-extrabold leading-none">${m.label}</span>
                                    </button>`;
                                }).join('')}
                            </div>
                        </div>

                        <!-- Ringkasan Total -->
                        <div class="flex justify-between items-end px-1">
                            <div class="space-y-0.5">
                                <p class="text-[10px] text-gray-400 font-bold uppercase">Total Tagihan</p>
                                ${discount > 0 ? `<p class="text-[10px] text-red-500 line-through">Rp ${subtotal.toLocaleString('id-ID')}</p>` : ''}
                                ${serviceFee > 0 ? `<p class="text-[10px] text-orange-500 font-bold">+ Jasa Rp ${serviceFee.toLocaleString('id-ID')}</p>` : ''}
                            </div>
                            <span class="font-black text-2xl text-indigo-600 dark:text-indigo-400 leading-none">Rp ${total.toLocaleString('id-ID')}</span>
                        </div>

                        <!-- CHECKOUT BTN -->
                        <button onclick="window.processPOSCheckout()" class="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98] text-white font-extrabold rounded-xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2">
                            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            Bayar Sekarang
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============== TAB PIUTANG ==============
async function renderPiutang(container) {
    let receivables = [];
    if (db.receivables) {
        receivables = await db.receivables.toArray();
    }

    const filteredReceivables = receivables.filter(r => {
        if (receivablesFilter === 'belum_lunas') return !r.isPaid;
        if (receivablesFilter === 'lunas') return r.isPaid;
        return true;
    });

    const totalUtang    = receivables.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalTerbayar = receivables.filter(r =>  r.isPaid).reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalBelumBayar = receivables.filter(r => !r.isPaid).reduce((sum, r) => sum + (r.amount || 0), 0);

    container.innerHTML = `
        <div class="space-y-3 animate-fadeInUp">
            <!-- STAT CARDS: horizontal scroll on mobile -->
            <div class="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                <div class="shrink-0 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 min-w-[140px]">
                    <p class="text-[10px] text-gray-400 uppercase font-bold mb-1">Total Piutang</p>
                    <p class="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">Rp ${totalUtang.toLocaleString('id-ID')}</p>
                    <p class="text-[10px] text-gray-400 mt-1">${receivables.length} tagihan</p>
                </div>
                <div class="shrink-0 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-2xl border border-red-100 dark:border-red-800/50 shadow-sm p-4 min-w-[140px]">
                    <p class="text-[10px] text-red-500 uppercase font-bold mb-1">Belum Lunas</p>
                    <p class="text-lg font-extrabold text-red-600 leading-tight">Rp ${totalBelumBayar.toLocaleString('id-ID')}</p>
                    <p class="text-[10px] text-red-400 mt-1">${receivables.filter(r => !r.isPaid).length} tagihan</p>
                </div>
                <div class="shrink-0 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl border border-green-100 dark:border-green-800/50 shadow-sm p-4 min-w-[140px]">
                    <p class="text-[10px] text-green-600 uppercase font-bold mb-1">Sudah Lunas</p>
                    <p class="text-lg font-extrabold text-green-600 leading-tight">Rp ${totalTerbayar.toLocaleString('id-ID')}</p>
                    <p class="text-[10px] text-green-400 mt-1">${receivables.filter(r => r.isPaid).length} tagihan</p>
                </div>
            </div>

            <!-- ACTION + FILTER ROW -->
            <div class="flex items-center gap-2">
                <div class="flex gap-1.5 overflow-x-auto scrollbar-hide flex-1">
                    <button onclick="window.setReceivablesFilter('semua')" class="shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition ${receivablesFilter === 'semua' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'}">
                        Semua · ${filteredReceivables.length}
                    </button>
                    <button onclick="window.setReceivablesFilter('belum_lunas')" class="shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition ${receivablesFilter === 'belum_lunas' ? 'bg-red-600 text-white shadow-sm' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'}">
                        ⏱ Belum · ${filteredReceivables.filter(r => !r.isPaid).length}
                    </button>
                    <button onclick="window.setReceivablesFilter('lunas')" class="shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition ${receivablesFilter === 'lunas' ? 'bg-green-600 text-white shadow-sm' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'}">
                        ✓ Lunas · ${filteredReceivables.filter(r => r.isPaid).length}
                    </button>
                </div>
                <button onclick="window.openAddReceivable()" class="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl transition text-xs shadow-md shadow-indigo-200 dark:shadow-none">
                    <span class="text-sm">+</span> Tambah
                </button>
            </div>

            <!-- DAFTAR PIUTANG -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                ${filteredReceivables.length === 0 ? `
                    <div class="py-16 text-center">
                        <div class="text-4xl mb-3">📋</div>
                        <p class="text-sm font-semibold text-gray-500 dark:text-gray-400">Tidak ada data piutang</p>
                        <p class="text-xs text-gray-400 mt-1">Tap tombol Tambah untuk mencatat piutang baru</p>
                    </div>
                ` : `
                    <div class="divide-y dark:divide-gray-800">
                        ${filteredReceivables.map((r) => `
                            <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                <div class="flex items-start justify-between gap-3 mb-3">
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <h4 class="font-bold text-gray-900 dark:text-white text-sm truncate">${r.customerName}</h4>
                                            <span class="shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold ${r.isPaid ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'}">
                                                ${r.isPaid ? '✓ Lunas' : '⏱ Belum'}
                                            </span>
                                        </div>
                                        ${r.customerPhone ? `<p class="text-xs text-gray-400 mt-0.5">📞 ${r.customerPhone}</p>` : ''}
                                    </div>
                                    <div class="text-right shrink-0">
                                        <p class="font-extrabold text-gray-900 dark:text-white text-sm">Rp ${(r.amount || 0).toLocaleString('id-ID')}</p>
                                        ${r.dueDate ? `<p class="text-[10px] text-gray-400 mt-0.5">Jatuh: ${r.dueDate}</p>` : ''}
                                    </div>
                                </div>
                                ${r.description ? `<p class="text-xs text-gray-500 dark:text-gray-400 mb-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-1.5">${r.description}</p>` : ''}
                                <div class="flex gap-2">
                                    ${!r.isPaid ? `
                                        <button onclick="window.markReceivableAsPaid('${r.id}')" class="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 hover:bg-green-700 active:scale-95 text-white text-xs font-bold rounded-xl transition">
                                            ✓ Tandai Lunas
                                        </button>
                                    ` : ''}
                                    <button onclick="window.deleteReceivable('${r.id}')" class="${r.isPaid ? 'flex-1' : ''} flex items-center justify-center gap-1.5 px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl hover:bg-red-100 dark:hover:bg-red-900/60 active:scale-95 transition border border-red-100 dark:border-red-800">
                                        🗑 Hapus
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
}

// ============== TAB PENGELUARAN ==============
async function renderPengeluaran(container) {
    let expenses = [];
    if (db.expenses) {
        expenses = await db.expenses.toArray();
    }

    const filteredExpenses = expenses.filter(e => {
        if (expenseCategory === 'Semua') return true;
        return e.category === expenseCategory;
    });

    const categories = ['Gaji Karyawan', 'Sewa Tempat', 'Utilitas', 'Supplies', 'Marketing', 'Maintenance', 'Lainnya'];
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    
    // Hitung per kategori
    const expensesByCategory = {};
    categories.forEach(cat => {
        expensesByCategory[cat] = expenses.filter(e => e.category === cat).reduce((sum, e) => sum + (e.amount || 0), 0);
    });

    container.innerHTML = `
        <div class="space-y-3 animate-fadeInUp">
            <!-- STAT CARD + TOTAL -->
            <div class="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-4 text-white shadow-lg shadow-orange-200 dark:shadow-none">
                <p class="text-xs font-bold uppercase opacity-80 mb-1">Total Pengeluaran ${expenseCategory !== 'Semua' ? `· ${expenseCategory}` : 'Semua'}</p>
                <p class="text-2xl font-extrabold leading-tight">Rp ${totalExpenses.toLocaleString('id-ID')}</p>
                <p class="text-xs opacity-80 mt-1">${filteredExpenses.length} dari ${expenses.length} transaksi</p>
            </div>

            <!-- CATEGORY CHIPS -->
            <div class="overflow-x-auto scrollbar-hide">
                <div class="flex gap-2 pb-1 pr-1">
                    <button onclick="window.setExpenseCategory('Semua')" class="shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition ${expenseCategory === 'Semua' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'}">
                        Semua
                    </button>
                    ${categories.map(cat => `
                        <button onclick="window.setExpenseCategory('${cat}')" class="shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition ${expenseCategory === cat ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'}">
                            ${cat}
                            ${expensesByCategory[cat] > 0 ? `<span class="ml-1 opacity-70 text-[10px]">· ${(expensesByCategory[cat] || 0).toLocaleString('id-ID').replace(/,/g, '.')}</span>` : ''}
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- ADD BUTTON -->
            <button onclick="window.openAddExpense()" class="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold rounded-2xl transition text-sm shadow-md shadow-indigo-200 dark:shadow-none">
                <span class="text-lg">+</span> Tambah Pengeluaran
            </button>

            <!-- DAFTAR PENGELUARAN -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                ${filteredExpenses.length === 0 ? `
                    <div class="py-16 text-center">
                        <div class="text-4xl mb-3">💸</div>
                        <p class="text-sm font-semibold text-gray-500 dark:text-gray-400">Belum ada pengeluaran</p>
                        <p class="text-xs text-gray-400 mt-1">Tap tombol di atas untuk mencatat pengeluaran</p>
                    </div>
                ` : `
                    <div class="divide-y dark:divide-gray-800">
                        ${filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date)).map((e) => `
                            <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                <div class="flex items-start gap-3">
                                    <div class="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-base shrink-0">💸</div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-start justify-between gap-2">
                                            <div class="flex-1 min-w-0">
                                                <p class="font-bold text-gray-900 dark:text-white text-sm truncate">${e.description}</p>
                                                <div class="flex items-center gap-2 mt-0.5">
                                                    <span class="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg font-bold text-gray-600 dark:text-gray-400">${e.category}</span>
                                                    <span class="text-[10px] text-gray-400">${e.date || '-'}</span>
                                                </div>
                                            </div>
                                            <div class="text-right shrink-0">
                                                <p class="font-extrabold text-red-600 dark:text-red-400 text-sm">−Rp ${(e.amount || 0).toLocaleString('id-ID')}</p>
                                                <button onclick="window.deleteExpense('${e.id}')" class="mt-1.5 text-[10px] px-2 py-1 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-lg font-bold hover:bg-red-100 transition border border-red-100 dark:border-red-800">
                                                    Hapus
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
}

// ============== UTILITY FUNCTIONS ==============

function calculateCartTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let discount = 0;
    if (discountType === 'rp') {
        discount = manualDiscountValue;
    } else if (discountType === 'percent') {
        discount = Math.floor(subtotal * (manualDiscountValue / 100));
    }
    const serviceFee = serviceFeeValue;
    const total = Math.max(subtotal + serviceFee - discount, 0);
    return { subtotal, discount, serviceFee, total };
}

window.switchTab = function(tab) {
    activeTab = tab;
    receivablesFilter = 'semua';
    expenseCategory = 'Semua';
    render(document.getElementById('app-container'));
};

window.setReceivablesFilter = function(filter) {
    receivablesFilter = filter;
    render(document.getElementById('app-container'));
};

window.setExpenseCategory = function(category) {
    expenseCategory = category;
    render(document.getElementById('app-container'));
};

window.handlePOSSearch = function(value) {
    productSearchQuery = value;
    render(document.getElementById('app-container'));
};

window.handlePOSCategory = function(value) {
    selectedCategory = value;
    render(document.getElementById('app-container'));
};

window.setProductViewMode = function(mode) {
    productViewMode = mode;
    render(document.getElementById('app-container'));
};

window.selectPOSMember = function(memberId) {
    selectedMemberId = memberId;
};

window.setDiscountType = function(type) {
    discountType = type;
    render(document.getElementById('app-container'));
};

window.setManualDiscount = function(value) {
    manualDiscountValue = parseFloat(value) || 0;
    render(document.getElementById('app-container'));
};

window.setServiceFee = function(value) {
    serviceFeeValue = parseFloat(value) || 0;
    render(document.getElementById('app-container'));
};

window.selectPaymentMethod = function(method) {
    paymentMethod = method;
    render(document.getElementById('app-container'));
};

window.addToCart = async function(productId) {
    const product = await db.products.get(productId);
    if (!product) return;

    // Cek stok cabang sebelum menambah
    const storeNum = getStoreNum(selectedStoreId);
    const branchStockKey = `stockToko${storeNum}`;
    const branchStock = product[branchStockKey] || 0;
    const inCart = cart.find(item => item.id === productId)?.quantity || 0;
    if (inCart >= branchStock) {
        return alert(`Stok "${product.name}" di cabang ini hanya ${branchStock} pcs.`);
    }

    const cartItem = cart.find(item => item.id === productId);
    if (cartItem) {
        cartItem.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: 1,
            notes: ''
        });
    }
    render(document.getElementById('app-container'));
};

window.updateCartQty = async function(productId, newQty) {
    if (newQty <= 0) {
        cart = cart.filter(item => item.id !== productId);
        render(document.getElementById('app-container'));
        return;
    }

    const product = await db.products.get(productId);
    if (!product) { cart = cart.filter(i => i.id !== productId); render(document.getElementById('app-container')); return; }
    const storeNum = getStoreNum(selectedStoreId);
    const branchStockKey = `stockToko${storeNum}`;
    const branchStock = product[branchStockKey] || 0;

    if (newQty > branchStock) {
        return alert(`Stok tidak mencukupi! Batas maksimal stok cabang adalah ${branchStock} pcs.`);
    }

    const cartItem = cart.find(item => item.id === productId);
    if (cartItem) {
        cartItem.quantity = newQty;
    }
    render(document.getElementById('app-container'));
};

window.updateCartNotes = function(productId, note) {
    const cartItem = cart.find(item => item.id === productId);
    if (cartItem) {
        cartItem.notes = note;
    }
};

window.clearCart = function() {
    cart = [];
    manualDiscountValue = 0;
    serviceFeeValue = 0;
    render(document.getElementById('app-container'));
};

window.processPOSCheckout = async function() {
    if (cart.length === 0) return alert("Keranjang masih kosong!");

    // Jika metode Piutang, minta info pelanggan dulu sebelum lanjut
    if (paymentMethod === 'Piutang') {
        window._showPiutangCheckoutModal();
        return;
    }
    await window._doCheckout('');
};

// Modal input nama pelanggan untuk checkout Piutang
window._showPiutangCheckoutModal = function() {
    const existing = document.getElementById('piutang-checkout-overlay');
    if (existing) existing.remove();
    const { total } = calculateCartTotals();
    const today = new Date().toISOString().split('T')[0];

    const overlay = document.createElement('div');
    overlay.id = 'piutang-checkout-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm">
            <div class="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-lg">📋</div>
                    <div>
                        <h3 class="font-extrabold text-gray-900 dark:text-white text-sm">Catat Piutang</h3>
                        <p class="text-xs text-gray-400 mt-0.5">Total: <span class="font-bold text-rose-600">Rp ${total.toLocaleString('id-ID')}</span></p>
                    </div>
                </div>
                <button onclick="document.getElementById('piutang-checkout-overlay').remove()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 text-lg font-bold">✕</button>
            </div>
            <div class="p-5 space-y-3">
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Nama Pelanggan <span class="text-red-500">*</span></label>
                    <input id="pco-name" type="text" placeholder="Nama pelanggan..." autofocus
                        class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">No. Telepon <span class="text-gray-400 font-normal normal-case">(opsional)</span></label>
                    <input id="pco-phone" type="tel" placeholder="08xxxxxxxxxx"
                        class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Jatuh Tempo <span class="text-gray-400 font-normal normal-case">(opsional)</span></label>
                    <input id="pco-due" type="date" value="${today}"
                        class="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400">
                </div>
                <div id="pco-error" class="hidden p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-xs text-red-600 font-semibold"></div>
            </div>
            <div class="flex gap-3 p-5 pt-0">
                <button onclick="document.getElementById('piutang-checkout-overlay').remove()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm transition">Batal</button>
                <button onclick="window._confirmPiutangCheckout()" id="pco-btn" class="flex-1 py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold rounded-xl text-sm transition shadow-md">📋 Checkout & Catat</button>
            </div>
        </div>
    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('pco-name')?.focus(), 50);
};

window._confirmPiutangCheckout = async function() {
    const name  = document.getElementById('pco-name')?.value.trim();
    const phone = document.getElementById('pco-phone')?.value.trim();
    const due   = document.getElementById('pco-due')?.value;
    const errEl = document.getElementById('pco-error');
    const btn   = document.getElementById('pco-btn');

    if (!name) {
        errEl.textContent = 'Nama pelanggan wajib diisi.';
        errEl.classList.remove('hidden');
        return;
    }
    errEl.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }

    const overlay = document.getElementById('piutang-checkout-overlay');
    if (overlay) overlay.remove();

    await window._doCheckout(name, phone, due);
};

window._doCheckout = async function(piutangCustomerName = '', piutangPhone = '', piutangDue = '') {

    const allStores = await db.stores.toArray();
    const activeStore = allStores.find(s => s.id === selectedStoreId);
    const storeBranchName = activeStore ? activeStore.name : 'Toko 1';

    const storeNum = getStoreNum(selectedStoreId);
    const branchStockKey = `stockToko${storeNum}`;

    for (const item of cart) {
        const prod = await db.products.get(item.id);
        if (!prod) return alert(`Produk "${item.name}" tidak ditemukan. Kosongkan keranjang dan coba lagi.`);
        const stockAvailable = prod[branchStockKey] || 0;
        if (item.quantity > stockAvailable) {
            return alert(`Gagal checkout! Produk "${item.name}" melebihi stok yang tersedia (${stockAvailable} pcs).`);
        }
    }

    const { subtotal, discount, serviceFee, total } = calculateCartTotals();
    const txId = 'TX-' + Date.now().toString().slice(-6);

    try {
        let memberName = '';
        if (selectedMemberId && db.members) {
            const memberObj = await db.members.get(selectedMemberId);
            if (memberObj) memberName = memberObj.name;
        }

        await db.transactions.add({
            id: txId,
            timestamp: new Date().toISOString(),
            subtotal: subtotal,
            discount: discount,
            serviceFee: serviceFee,
            total: total,
            paymentMethod: paymentMethod,
            storeBranch: storeBranchName,
            memberId: selectedMemberId || null,
            memberName: memberName || null,
            isCancelled: false
        });

        for (const item of cart) {
            await db.transactionItems.add({
                transactionId: txId,
                productId: item.id,
                name: item.name,          // simpan nama agar struk tidak perlu re-lookup
                price: item.price,
                quantity: item.quantity,
                subtotal: item.price * item.quantity,
                notes: item.notes || ''
            });

            const prod = await db.products.get(item.id);
            if (!prod) continue; // produk dihapus, skip deduct stok
            const currentBranchStock = prod[branchStockKey] || 0;
            const updatedBranchStock = currentBranchStock - item.quantity;
            
            let newTotalStock = 0;
            allStores.forEach(s => {
                const sNum = getStoreNum(s.id);
                const sKey = `stockToko${sNum}`;
                if (s.id === selectedStoreId) {
                    newTotalStock += updatedBranchStock;
                } else {
                    newTotalStock += (prod[sKey] || 0);
                }
            });

            const updateFields = {};
            updateFields[branchStockKey] = updatedBranchStock;
            updateFields.stock = newTotalStock;

            await db.products.update(item.id, updateFields);

            await db.stock_mutations.add({
                productId: item.id,
                type: 'KELUAR',
                quantity: item.quantity,
                note: `Penjualan Kasir POS #${txId} ${item.notes ? `(${item.notes})` : ''}`,
                storeBranch: storeBranchName,
                timestamp: new Date().toISOString()
            });
        }

        if (selectedMemberId && db.members) {
            const memberObj = await db.members.get(selectedMemberId);
            if (memberObj) {
                const earnedPoints = Math.floor(total / 10000);
                const currentPoints = memberObj.points || 0;
                await db.members.update(selectedMemberId, { points: currentPoints + earnedPoints });
            }
        }

        // Jika metode Piutang, otomatis buat record receivable
        if (paymentMethod === 'Piutang' && db.receivables) {
            await db.receivables.add({
                id:           'RCV-' + Date.now(),
                customerName: piutangCustomerName || 'Pelanggan (dari POS)',
                customerPhone: piutangPhone || '',
                amount:       total,
                dueDate:      piutangDue || '',
                description:  `Dari transaksi POS #${txId}`,
                storeBranch:  storeBranchName,
                transactionId: txId,
                isPaid:       false,
                createdDate:  new Date().toISOString(),
                paidDate:     null,
            });
        }

        cart = [];
        manualDiscountValue = 0;
        serviceFeeValue = 0;
        selectedMemberId = '';
        paymentMethod = 'Cash';
        render(document.getElementById('app-container'));

        setTimeout(() => {
            window.showReceiptModal(txId, true);
        }, 50);

    } catch (error) {
        console.error("Gagal melakukan proses transaksi checkout:", error);
        alert("Terjadi kesalahan sistem saat checkout!");
    }
};

// ============== RECEIVABLES FUNCTIONS ==============
window.openAddReceivable = function() {
    const existing = document.getElementById('modal-overlay');
    if (existing) existing.remove();

    const today = new Date().toISOString().split('T')[0];
    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-md">
            <!-- Header -->
            <div class="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-lg">📋</div>
                    <h3 class="font-extrabold text-gray-900 dark:text-white text-base">Tambah Piutang Baru</h3>
                </div>
                <button onclick="window.closePiutangExpenseModal()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 transition font-bold text-lg">✕</button>
            </div>

            <!-- Form -->
            <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Nama Pelanggan <span class="text-red-500">*</span></label>
                    <input id="rcv-name" type="text" placeholder="Masukkan nama pelanggan..." class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">No. Telepon</label>
                    <input id="rcv-phone" type="tel" placeholder="Contoh: 08123456789" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Nominal Piutang (Rp) <span class="text-red-500">*</span></label>
                    <input id="rcv-amount" type="number" min="1" placeholder="0" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Jatuh Tempo</label>
                    <input id="rcv-due" type="date" value="${today}" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Keterangan</label>
                    <textarea id="rcv-desc" rows="2" placeholder="Keterangan piutang (opsional)..." class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"></textarea>
                </div>
                <div id="rcv-error" class="hidden p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400 font-semibold"></div>
            </div>

            <!-- Footer -->
            <div class="flex gap-3 p-5 pt-0">
                <button onclick="window.closePiutangExpenseModal()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm transition">Batal</button>
                <button onclick="window.submitAddReceivable()" id="rcv-submit-btn" class="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl text-sm transition shadow-md shadow-indigo-200 dark:shadow-none">+ Simpan Piutang</button>
            </div>
        </div>
    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) window.closePiutangExpenseModal(); });
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('rcv-name')?.focus(), 50);
};

window.submitAddReceivable = async function() {
    const name = document.getElementById('rcv-name')?.value.trim();
    const phone = document.getElementById('rcv-phone')?.value.trim();
    const amount = parseFloat(document.getElementById('rcv-amount')?.value) || 0;
    const dueDate = document.getElementById('rcv-due')?.value;
    const description = document.getElementById('rcv-desc')?.value.trim();
    const errEl = document.getElementById('rcv-error');
    const btn = document.getElementById('rcv-submit-btn');

    if (!name) { errEl.textContent = 'Nama pelanggan wajib diisi.'; errEl.classList.remove('hidden'); return; }
    if (amount <= 0) { errEl.textContent = 'Nominal piutang harus lebih dari 0.'; errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');

    btn.disabled = true; btn.textContent = 'Menyimpan...';
    if (db.receivables) {
        // Tentukan toko aktif dari localStorage
        const storeBranch = localStorage.getItem('storeBranch') || 'Toko 1';
        await db.receivables.add({
            id: 'RCV-' + Date.now(),
            customerName: name,
            customerPhone: phone,
            amount: amount,
            dueDate: dueDate,
            description: description,
            storeBranch: storeBranch,
            isPaid: false,
            createdDate: new Date().toISOString(),
            paidDate: null
        });
    }
    window.closePiutangExpenseModal();
    render(document.getElementById('app-container'));
};

window.markReceivableAsPaid = function(receivableId) {
    if (!db.receivables) return;
    const existing = document.getElementById('modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm text-center p-6">
            <div class="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-2xl mx-auto mb-4">✅</div>
            <h3 class="font-extrabold text-gray-900 dark:text-white text-base mb-2">Tandai Lunas?</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Piutang ini akan ditandai sebagai <strong class="text-green-600">lunas</strong> dan tidak bisa dikembalikan ke status belum lunas.</p>
            <div class="flex gap-3">
                <button onclick="window.closePiutangExpenseModal()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm transition">Batal</button>
                <button onclick="window.confirmMarkPaid('${receivableId}')" class="flex-1 py-3 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-bold rounded-xl text-sm transition">✓ Ya, Lunas</button>
            </div>
        </div>
    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) window.closePiutangExpenseModal(); });
    document.body.appendChild(overlay);
};

window.confirmMarkPaid = function(receivableId) {
    db.receivables.update(receivableId, { isPaid: true, paidDate: new Date().toISOString() }).then(() => {
        window.closePiutangExpenseModal();
        render(document.getElementById('app-container'));
    });
};

window.deleteReceivable = function(receivableId) {
    const existing = document.getElementById('modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm text-center p-6">
            <div class="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-2xl mx-auto mb-4">🗑</div>
            <h3 class="font-extrabold text-gray-900 dark:text-white text-base mb-2">Hapus Piutang?</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Data piutang ini akan <strong class="text-red-600">dihapus permanen</strong> dan tidak dapat dipulihkan kembali.</p>
            <div class="flex gap-3">
                <button onclick="window.closePiutangExpenseModal()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm transition">Batal</button>
                <button onclick="window.confirmDeleteReceivable('${receivableId}')" class="flex-1 py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-xl text-sm transition">🗑 Hapus</button>
            </div>
        </div>
    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) window.closePiutangExpenseModal(); });
    document.body.appendChild(overlay);
};

window.confirmDeleteReceivable = function(receivableId) {
    if (db.receivables) {
        db.receivables.delete(receivableId).then(() => {
            window.closePiutangExpenseModal();
            render(document.getElementById('app-container'));
        });
    }
};

// ============== EXPENSES FUNCTIONS ==============
window.openAddExpense = async function() {
    const existing = document.getElementById('modal-overlay');
    if (existing) existing.remove();

    const categories = ['Gaji Karyawan', 'Sewa Tempat', 'Utilitas', 'Supplies', 'Marketing', 'Maintenance', 'Lainnya'];
    const today = new Date().toISOString().split('T')[0];

    // Ambil daftar toko aktif untuk dropdown
    let allStores = [];
    if (db.stores) allStores = (await db.stores.toArray()).filter(s => s.isActive);
    const currentBranch = localStorage.getItem('storeBranch') || 'Toko 1';
    const storeOptions = allStores.length > 0
        ? allStores.map(s => `<option value="${s.name}" ${s.name === currentBranch ? 'selected' : ''}>${s.name}</option>`).join('')
        : `<option value="${currentBranch}" selected>${currentBranch}</option>`;

    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-md">
            <!-- Header -->
            <div class="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-lg">💰</div>
                    <h3 class="font-extrabold text-gray-900 dark:text-white text-base">Tambah Pengeluaran</h3>
                </div>
                <button onclick="window.closePiutangExpenseModal()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 transition font-bold text-lg">✕</button>
            </div>

            <!-- Form -->
            <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Deskripsi <span class="text-red-500">*</span></label>
                    <input id="exp-desc" type="text" placeholder="Contoh: Bayar listrik bulan ini..." class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Kategori <span class="text-red-500">*</span></label>
                    <div class="grid grid-cols-2 gap-2" id="exp-category-grid">
                        ${categories.map((cat, i) => `
                            <button type="button" onclick="window.selectExpCat(this, '${cat}')" data-cat="${cat}" class="exp-cat-btn p-2.5 rounded-xl text-xs font-bold border transition text-left ${i === 0 ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-orange-300'}">
                                ${cat}
                            </button>
                        `).join('')}
                    </div>
                    <input type="hidden" id="exp-cat-value" value="${categories[0]}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Nominal (Rp) <span class="text-red-500">*</span></label>
                    <input id="exp-amount" type="number" min="1" placeholder="0" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Tanggal</label>
                    <input id="exp-date" type="date" value="${today}" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Dari Toko <span class="text-red-500">*</span></label>
                    <select id="exp-store" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400">
                        ${storeOptions}
                    </select>
                </div>
                <div id="exp-error" class="hidden p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400 font-semibold"></div>
            </div>

            <!-- Footer -->
            <div class="flex gap-3 p-5 pt-0">
                <button onclick="window.closePiutangExpenseModal()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm transition">Batal</button>
                <button onclick="window.submitAddExpense()" id="exp-submit-btn" class="flex-1 py-3 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold rounded-xl text-sm transition shadow-md shadow-orange-200 dark:shadow-none">+ Simpan</button>
            </div>
        </div>
    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) window.closePiutangExpenseModal(); });
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('exp-desc')?.focus(), 50);
};

window.selectExpCat = function(el, cat) {
    document.querySelectorAll('.exp-cat-btn').forEach(btn => {
        btn.className = btn.className
            .replace('bg-orange-500 text-white border-orange-500', '')
            + ' bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-orange-300';
    });
    el.className = el.className
        .replace('bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-orange-300', '')
        + ' bg-orange-500 text-white border-orange-500';
    document.getElementById('exp-cat-value').value = cat;
};

window.submitAddExpense = async function() {
    const description = document.getElementById('exp-desc')?.value.trim();
    const category = document.getElementById('exp-cat-value')?.value || 'Lainnya';
    const amount = parseFloat(document.getElementById('exp-amount')?.value) || 0;
    const date = document.getElementById('exp-date')?.value || new Date().toISOString().split('T')[0];
    const storeBranch = document.getElementById('exp-store')?.value || localStorage.getItem('storeBranch') || 'Toko 1';
    const errEl = document.getElementById('exp-error');
    const btn = document.getElementById('exp-submit-btn');

    if (!description) { errEl.textContent = 'Deskripsi pengeluaran wajib diisi.'; errEl.classList.remove('hidden'); return; }
    if (amount <= 0) { errEl.textContent = 'Nominal harus lebih dari 0.'; errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');

    btn.disabled = true; btn.textContent = 'Menyimpan...';
    if (db.expenses) {
        await db.expenses.add({
            id: 'EXP-' + Date.now(),
            description,
            category,
            amount,
            date,
            storeBranch,
        });
    }
    window.closePiutangExpenseModal();
    render(document.getElementById('app-container'));
};

window.deleteExpense = function(expenseId) {
    const existing = document.getElementById('modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm text-center p-6">
            <div class="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-2xl mx-auto mb-4">🗑</div>
            <h3 class="font-extrabold text-gray-900 dark:text-white text-base mb-2">Hapus Pengeluaran?</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Data pengeluaran ini akan <strong class="text-red-600">dihapus permanen</strong> dan tidak dapat dipulihkan kembali.</p>
            <div class="flex gap-3">
                <button onclick="window.closePiutangExpenseModal()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm transition">Batal</button>
                <button onclick="window.confirmDeleteExpense('${expenseId}')" class="flex-1 py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-xl text-sm transition">🗑 Hapus</button>
            </div>
        </div>
    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) window.closePiutangExpenseModal(); });
    document.body.appendChild(overlay);
};

window.confirmDeleteExpense = function(expenseId) {
    if (db.expenses) {
        db.expenses.delete(expenseId).then(() => {
            window.closePiutangExpenseModal();
            render(document.getElementById('app-container'));
        });
    }
};

// ============== SHARED MODAL UTILITY ==============
// Dedicated close function for piutang & pengeluaran modals in cashier view
// (avoids collision with owner.js's window.closeModal which targets #detail-modal)
window.closePiutangExpenseModal = function() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.remove();
};

// ============== TAB RIWAYAT TRANSAKSI ==============
async function renderRiwayat(container) {
    let transactions = [];
    if (db.transactions) {
        transactions = await db.transactions.toArray();
    }

    // Sort terbaru dulu
    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Filter
    const filtered = transactions.filter(tx => {
        const matchSearch = riwayatSearchQuery === '' ||
            tx.id.toLowerCase().includes(riwayatSearchQuery.toLowerCase()) ||
            (tx.memberName || '').toLowerCase().includes(riwayatSearchQuery.toLowerCase()) ||
            (tx.storeBranch || '').toLowerCase().includes(riwayatSearchQuery.toLowerCase());
        const matchFilter =
            riwayatFilter === 'semua' ||
            (riwayatFilter === 'aktif' && !tx.isCancelled) ||
            (riwayatFilter === 'batal' && tx.isCancelled);
        return matchSearch && matchFilter;
    });

    const totalAktif = transactions.filter(t => !t.isCancelled).reduce((s, t) => s + (t.total || 0), 0);
    const totalBatal = transactions.filter(t => t.isCancelled).length;

    container.innerHTML = `
        <div class="space-y-3 animate-fadeInUp">
            <!-- STAT CARDS: horizontal scroll on mobile -->
            <div class="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                <div class="shrink-0 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 min-w-[140px]">
                    <p class="text-[10px] text-gray-400 uppercase font-bold mb-1">Total Transaksi</p>
                    <p class="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">${transactions.length}</p>
                    <p class="text-[10px] text-gray-400 mt-1">keseluruhan</p>
                </div>
                <div class="shrink-0 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl border border-green-100 dark:border-green-800/50 shadow-sm p-4 min-w-[140px]">
                    <p class="text-[10px] text-green-600 uppercase font-bold mb-1">Pendapatan Aktif</p>
                    <p class="text-lg font-extrabold text-green-600 leading-tight">Rp ${totalAktif.toLocaleString('id-ID')}</p>
                    <p class="text-[10px] text-green-400 mt-1">Berhasil</p>
                </div>
                <div class="shrink-0 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-2xl border border-red-100 dark:border-red-800/50 shadow-sm p-4 min-w-[140px]">
                    <p class="text-[10px] text-red-500 uppercase font-bold mb-1">Dibatalkan</p>
                    <p class="text-lg font-extrabold text-red-600 leading-tight">${totalBatal}</p>
                    <p class="text-[10px] text-red-400 mt-1">Nota</p>
                </div>
            </div>

            <!-- ACTION + FILTER ROW -->
            <div class="flex flex-col sm:flex-row gap-2">
                <div class="flex gap-1.5 overflow-x-auto scrollbar-hide">
                    ${[['semua','Semua'],['aktif','✅ Aktif'],['batal','❌ Batal']].map(([val, label]) => `
                        <button onclick="window.setRiwayatFilter('${val}')" class="shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition ${riwayatFilter === val ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'}">
                            ${label}
                        </button>
                    `).join('')}
                </div>
                <div class="relative flex-1">
                    <span class="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none text-xs">🔍</span>
                    <input type="text" value="${riwayatSearchQuery}" oninput="window.setRiwayatSearch(this.value)" placeholder="Cari nota / member / cabang..." class="w-full pl-8 pr-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition shadow-sm">
                </div>
            </div>

            <!-- DAFTAR TRANSAKSI -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                ${filtered.length === 0 ? `
                    <div class="py-16 text-center">
                        <div class="text-4xl mb-3">🧾</div>
                        <p class="text-sm font-semibold text-gray-500 dark:text-gray-400">Tidak ada data transaksi</p>
                        <p class="text-xs text-gray-400 mt-1">Belum ada transaksi sesuai filter Anda</p>
                    </div>
                ` : `
                    <div class="divide-y dark:divide-gray-800">
                        ${filtered.map(tx => {
                            const tgl = new Date(tx.timestamp);
                            const tglStr = tgl.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                            const jamStr = tgl.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                            return `
                            <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition ${tx.isCancelled ? 'opacity-60' : ''}">
                                <div class="flex items-start justify-between gap-3 mb-2">
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 flex-wrap mb-1">
                                            <span class="font-extrabold text-gray-900 dark:text-white text-sm">${tx.id}</span>
                                            <span class="text-[10px] px-2 py-0.5 rounded-lg font-bold ${tx.isCancelled ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'}">
                                                ${tx.isCancelled ? '❌ Dibatalkan' : '✅ Berhasil'}
                                            </span>
                                        </div>
                                        <p class="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                            <span>${tglStr} · ${jamStr}</span>
                                            <span>·</span>
                                            <span class="font-bold text-gray-700 dark:text-gray-300">${tx.storeBranch || '-'}</span>
                                            ${tx.paymentMethod ? `<span>·</span><span class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">${tx.paymentMethod}</span>` : ''}
                                        </p>
                                        ${tx.memberName ? `<p class="text-[10px] text-indigo-500 dark:text-indigo-400 mt-1 font-bold inline-flex items-center gap-1"><span class="w-3 h-3 bg-indigo-100 dark:bg-indigo-900/40 rounded flex items-center justify-center">👤</span> ${tx.memberName}</p>` : ''}
                                    </div>
                                    <div class="text-right shrink-0">
                                        <p class="font-extrabold text-sm ${tx.isCancelled ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}">Rp ${(tx.total || 0).toLocaleString('id-ID')}</p>
                                        ${tx.discount > 0 ? `<p class="text-[9px] text-red-500 mt-0.5">Diskon: Rp ${tx.discount.toLocaleString('id-ID')}</p>` : ''}
                                    </div>
                                </div>
                                ${!tx.isCancelled ? `
                                    <div class="mt-3 flex justify-end gap-2">
                                        <button onclick="window.showReceiptModal('${tx.id}')" class="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-[10px] font-bold rounded-lg transition active:scale-95">
                                            📄 Detail
                                        </button>
                                        <button onclick="window.openCancelModal('${tx.id}', 'Rp ${(tx.total || 0).toLocaleString('id-ID')}', '${(tx.storeBranch || '').replace(/'/g, "\\'")}', '${tglStr} · ${jamStr}')" class="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 text-[10px] font-bold rounded-lg transition border border-red-100 dark:border-red-800 active:scale-95">
                                            🚫 Batalkan
                                        </button>
                                    </div>
                                ` : `
                                    <div class="mt-2 flex justify-between items-end gap-2">
                                        <div class="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-gray-700 flex-1">
                                            <p class="text-[9px] text-gray-500 dark:text-gray-400"><span class="font-bold">Batal:</span> ${tx.cancelledAt ? new Date(tx.cancelledAt).toLocaleString('id-ID') : '-'}</p>
                                            ${tx.cancelReason ? `<p class="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5"><span class="font-bold">Alasan:</span> ${tx.cancelReason}</p>` : ''}
                                        </div>
                                        <button onclick="window.showReceiptModal('${tx.id}')" class="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-[10px] font-bold rounded-lg transition active:scale-95 h-fit">
                                            📄 Detail
                                        </button>
                                    </div>
                                `}
                            </div>
                        `}).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
}

// ============== CANCEL TRANSACTION MODAL ==============
window.openCancelModal = function(txId, totalFormatted, storeBranch, tglInfo) {
    // Hapus modal lama jika ada
    const existing = document.getElementById('cancel-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cancel-modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.innerHTML = `
        <div id="cancel-modal-box" class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-md animate-fadeIn">
            <!-- Header -->
            <div class="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-lg">🚫</div>
                    <div>
                        <h3 class="font-extrabold text-gray-900 dark:text-white text-base">Batalkan Transaksi</h3>
                        <p class="text-xs text-gray-400 mt-0.5">${txId}</p>
                    </div>
                </div>
                <button onclick="window.closeCancelModal()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 transition font-bold text-lg">✕</button>
            </div>

            <!-- Info Transaksi -->
            <div class="mx-5 mt-4 p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl space-y-1.5">
                <div class="flex justify-between text-xs">
                    <span class="text-gray-500 dark:text-gray-400">Nota</span>
                    <span class="font-bold text-gray-900 dark:text-white">${txId}</span>
                </div>
                <div class="flex justify-between text-xs">
                    <span class="text-gray-500 dark:text-gray-400">Cabang</span>
                    <span class="font-bold text-gray-900 dark:text-white">${storeBranch || '-'}</span>
                </div>
                <div class="flex justify-between text-xs">
                    <span class="text-gray-500 dark:text-gray-400">Waktu</span>
                    <span class="font-bold text-gray-900 dark:text-white">${tglInfo}</span>
                </div>
                <div class="flex justify-between text-xs pt-1 border-t border-red-100 dark:border-red-800">
                    <span class="text-gray-500 dark:text-gray-400">Total</span>
                    <span class="font-extrabold text-red-600 dark:text-red-400 text-sm">${totalFormatted}</span>
                </div>
            </div>

            <!-- Peringatan -->
            <div class="mx-5 mt-3 flex gap-2.5 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl">
                <span class="text-amber-500 text-lg shrink-0">⚠️</span>
                <p class="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">Pembatalan bersifat <strong>permanen</strong>. Stok semua produk dalam transaksi ini akan dikembalikan secara otomatis.</p>
            </div>

            <!-- Input Alasan -->
            <div class="px-5 mt-4">
                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Alasan Pembatalan <span class="font-normal normal-case text-gray-400">(opsional)</span></label>
                <textarea id="cancel-reason-input" rows="2" placeholder="Contoh: Pesanan salah, permintaan pelanggan..." class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"></textarea>
            </div>

            <!-- Footer Tombol -->
            <div class="flex gap-3 p-5 pt-4">
                <button onclick="window.closeCancelModal()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm transition">
                    Kembali
                </button>
                <button onclick="window.confirmCancelTransaction('${txId}')" id="confirm-cancel-btn" class="flex-1 py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-xl text-sm transition shadow-md shadow-red-200 dark:shadow-none">
                    🚫 Ya, Batalkan
                </button>
            </div>
        </div>
    `;

    // Klik di luar modal untuk menutup
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) window.closeCancelModal();
    });

    document.body.appendChild(overlay);
    // Auto-focus textarea
    setTimeout(() => {
        const ta = document.getElementById('cancel-reason-input');
        if (ta) ta.focus();
    }, 50);
};

window.closeCancelModal = function() {
    const overlay = document.getElementById('cancel-modal-overlay');
    if (overlay) overlay.remove();
};

window.showResultModal = function(success, txId, message) {
    const existing = document.getElementById('result-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'result-modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm text-center p-6">
            <div class="w-14 h-14 rounded-full ${success ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40'} flex items-center justify-center text-2xl mx-auto mb-4">
                ${success ? '✅' : '❌'}
            </div>
            <h3 class="font-extrabold text-gray-900 dark:text-white text-base mb-1">${success ? 'Berhasil Dibatalkan' : 'Gagal Membatalkan'}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">${txId}</p>
            <p class="text-xs text-gray-400 dark:text-gray-500 leading-relaxed mb-5">${message}</p>
            <button onclick="document.getElementById('result-modal-overlay').remove()" class="w-full py-3 ${success ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white'} text-white font-bold rounded-xl text-sm transition">
                Tutup
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
};

window.confirmCancelTransaction = async function(txId) {
    const reason = (document.getElementById('cancel-reason-input')?.value || '').trim();
    const btn = document.getElementById('confirm-cancel-btn');

    // Loading state
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Memproses...';
        btn.classList.add('opacity-70', 'cursor-not-allowed');
    }

    try {
        const tx = await db.transactions.get(txId);
        if (!tx) {
            window.closeCancelModal();
            window.showResultModal(false, txId, 'Transaksi tidak ditemukan di database.');
            return;
        }
        if (tx.isCancelled) {
            window.closeCancelModal();
            window.showResultModal(false, txId, 'Transaksi ini sudah dibatalkan sebelumnya.');
            return;
        }

        const allStores = await db.stores.toArray();
        // Cocokkan toko case-insensitive; fallback ke selectedStoreId
        const txBranch = (tx.storeBranch || '').toLowerCase();
        const activeStore = allStores.find(s => s.name.toLowerCase() === txBranch) ||
                            allStores.find(s => s.id === selectedStoreId) ||
                            allStores[0];
        const storeId = activeStore ? activeStore.id : selectedStoreId;
        const storeNum = getStoreNum(storeId);
        const branchStockKey = `stockToko${storeNum}`;

        // Ambil item transaksi
        const txItems = await db.transactionItems.where('transactionId').equals(txId).toArray();

        // Kembalikan stok untuk setiap item
        for (const item of txItems) {
            const prod = await db.products.get(item.productId);
            if (!prod) continue;

            const currentBranchStock = prod[branchStockKey] || 0;
            const restoredBranchStock = currentBranchStock + item.quantity;

            let newTotalStock = 0;
            allStores.forEach(s => {
                const sNum = getStoreNum(s.id);
                const sKey = `stockToko${sNum}`;
                if (s.id === storeId) {
                    newTotalStock += restoredBranchStock;
                } else {
                    newTotalStock += (prod[sKey] || 0);
                }
            });

            const updateFields = {};
            updateFields[branchStockKey] = restoredBranchStock;
            updateFields.stock = newTotalStock;
            await db.products.update(item.productId, updateFields);

            // Catat mutasi stok MASUK (retur)
            await db.stock_mutations.add({
                productId: item.productId,
                type: 'MASUK',
                quantity: item.quantity,
                note: `Pembatalan Transaksi #${txId}${reason ? ` - ${reason}` : ''}`,
                storeBranch: tx.storeBranch || '',
                timestamp: new Date().toISOString()
            });
        }

        // Kembalikan poin member jika ada
        if (tx.memberId && db.members) {
            const memberObj = await db.members.get(tx.memberId);
            if (memberObj) {
                const earnedPoints = Math.floor((tx.total || 0) / 10000);
                const currentPoints = memberObj.points || 0;
                const newPoints = Math.max(currentPoints - earnedPoints, 0);
                await db.members.update(tx.memberId, { points: newPoints });
            }
        }

        // Tandai transaksi sebagai dibatalkan
        await db.transactions.update(txId, {
            isCancelled: true,
            cancelledAt: new Date().toISOString(),
            cancelReason: reason
        });

        window.closeCancelModal();
        window.showResultModal(true, txId, `Stok ${txItems.length} produk telah dikembalikan ke jumlah semula.${reason ? '\nAlasan: ' + reason : ''}`);
        render(document.getElementById('app-container'));

    } catch (error) {
        console.error('Gagal membatalkan transaksi:', error);
        window.closeCancelModal();
        window.showResultModal(false, txId, 'Terjadi kesalahan sistem. Silakan coba lagi.');
    }
};

window.setRiwayatFilter = function(filter) {
    riwayatFilter = filter;
    render(document.getElementById('app-container'));
};

window.setRiwayatSearch = function(val) {
    riwayatSearchQuery = val;
    render(document.getElementById('app-container'));
};

window.showReceiptModal = async function(txId, isNewCheckout = false) {
    const existing = document.getElementById('receipt-modal-overlay');
    if (existing) existing.remove();

    const tx = await db.transactions.get(txId);
    if (!tx) return alert('Data transaksi tidak ditemukan.');

    const items = await db.transactionItems.where('transactionId').equals(txId).toArray();
    
    // Attempt to get product names if missing
    for (const item of items) {
        if (!item.name) {
            const prod = await db.products.get(item.productId);
            item.name = prod ? prod.name : 'Produk Dihapus';
        }
    }

    const tgl = new Date(tx.timestamp);
    const tglStr = tgl.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const jamStr = tgl.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const overlay = document.createElement('div');
    overlay.id = 'receipt-modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
    overlay.style.backdropFilter = 'blur(4px)';
    
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh] animate-fadeInUp">
            ${isNewCheckout ? `
            <div class="bg-indigo-600 text-white text-center py-5 rounded-t-2xl shadow-sm z-10">
                <div class="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-3xl mx-auto mb-2 border-2 border-white/30 shadow-inner">✅</div>
                <h2 class="font-extrabold text-xl tracking-tight">Checkout Berhasil!</h2>
                <p class="text-indigo-100 text-xs mt-1 font-semibold">Pembayaran telah diterima</p>
            </div>
            ` : `
            <div class="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800">
                <h2 class="font-bold text-gray-900 dark:text-white">Detail Transaksi</h2>
                <button onclick="document.getElementById('receipt-modal-overlay').remove()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-bold px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs">Tutup</button>
            </div>
            `}
            
            <div class="p-5 overflow-y-auto flex-1 space-y-4 font-mono text-sm relative">
                <!-- Background Pattern -->
                <div class="absolute inset-0 opacity-[0.02] dark:opacity-[0.05] pointer-events-none" style="background-image: radial-gradient(circle, #000 1px, transparent 1px); background-size: 10px 10px;"></div>

                <!-- Header Nota -->
                <div class="text-center space-y-1 pb-4 border-b-2 border-dashed border-gray-200 dark:border-gray-700 relative">
                    <p class="font-extrabold text-gray-900 dark:text-white text-xl tracking-widest">MVAPE</p>
                    <p class="text-[10px] text-gray-500 dark:text-gray-400 font-sans uppercase font-bold tracking-wider">${tx.storeBranch || 'Toko 1'}</p>
                    <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-3 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                        <span>${tglStr} ${jamStr}</span>
                        <span class="font-bold text-gray-700 dark:text-gray-300">${tx.id}</span>
                    </div>
                    ${tx.memberName ? `<p class="text-[10px] text-indigo-600 dark:text-indigo-400 text-left mt-2 font-bold bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-lg border border-indigo-100 dark:border-indigo-800/50 flex items-center gap-2"><span class="text-sm">👤</span> Member: ${tx.memberName}</p>` : ''}
                </div>

                <!-- Items -->
                <div class="space-y-3 pb-4 border-b-2 border-dashed border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 relative">
                    ${items.map(item => `
                        <div class="flex justify-between items-start gap-2">
                            <div class="flex-1">
                                <p class="font-bold text-gray-900 dark:text-white uppercase leading-tight">${item.name}</p>
                                <p class="text-gray-500 mt-0.5">${item.quantity} x ${(item.subtotal / item.quantity).toLocaleString('id-ID')} ${item.notes ? `<br><span class="inline-block mt-0.5 px-1 bg-gray-100 dark:bg-gray-800 rounded text-[9px] font-sans">Catatan: ${item.notes}</span>` : ''}</p>
                            </div>
                            <p class="font-bold whitespace-nowrap">Rp ${item.subtotal.toLocaleString('id-ID')}</p>
                        </div>
                    `).join('')}
                </div>

                <!-- Totals -->
                <div class="space-y-2 pb-4 border-b-2 border-dashed border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 relative">
                    <div class="flex justify-between">
                        <span class="text-gray-500">Subtotal</span>
                        <span class="font-semibold">Rp ${(tx.subtotal || 0).toLocaleString('id-ID')}</span>
                    </div>
                    ${tx.discount > 0 ? `
                    <div class="flex justify-between text-red-500">
                        <span>Diskon</span>
                        <span class="font-semibold">- Rp ${tx.discount.toLocaleString('id-ID')}</span>
                    </div>
                    ` : ''}
                    ${tx.serviceFee > 0 ? `
                    <div class="flex justify-between text-orange-500">
                        <span>Biaya Jasa</span>
                        <span class="font-semibold">+ Rp ${tx.serviceFee.toLocaleString('id-ID')}</span>
                    </div>
                    ` : ''}
                    <div class="flex justify-between font-extrabold text-gray-900 dark:text-white text-base pt-2">
                        <span>Total</span>
                        <span>Rp ${tx.total.toLocaleString('id-ID')}</span>
                    </div>
                    <div class="flex justify-between pt-1">
                        <span class="text-gray-500">Pembayaran</span>
                        <span class="font-bold uppercase">${tx.paymentMethod}</span>
                    </div>
                </div>
                
                ${tx.isCancelled ? `
                    <div class="bg-red-50 dark:bg-red-900/30 p-3 rounded-lg border border-red-100 dark:border-red-800 text-center relative">
                        <p class="text-red-600 dark:text-red-400 font-bold text-sm tracking-wide">❌ DIBATALKAN</p>
                        <p class="text-red-500 text-xs mt-1 font-sans">Pada: ${tx.cancelledAt ? new Date(tx.cancelledAt).toLocaleString('id-ID') : '-'}</p>
                        ${tx.cancelReason ? `<p class="text-red-500 text-xs mt-0.5 italic font-sans">"${tx.cancelReason}"</p>` : ''}
                    </div>
                ` : `
                    <p class="text-center text-xs text-gray-400 italic pt-2 font-sans">Terima kasih atas kunjungan Anda!</p>
                `}
            </div>
            
            ${isNewCheckout ? `
            <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl border-t border-gray-100 dark:border-gray-800 flex gap-3">
                <button onclick="window.printReceipt('${txId}')" class="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-lg text-sm tracking-wide flex items-center justify-center gap-2 active:scale-95">
                    <span>🖨️</span> Print Struk
                </button>
                <button onclick="document.getElementById('receipt-modal-overlay').remove()" class="flex-1 py-3.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-95 font-bold rounded-xl transition shadow-lg text-sm tracking-wide">Tutup Nota</button>
            </div>
        ` : ''}
        </div>
    `;
    
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.remove();
    });
    
    document.body.appendChild(overlay);
};

window.printReceipt = async function(txId) {
    const tx = await db.transactions.get(txId);
    if (!tx) return alert('Data transaksi tidak ditemukan.');
 
    const items = await db.transactionItems.where('transactionId').equals(txId).toArray();
    
    // Get product names if missing
    for (const item of items) {
        if (!item.name) {
            const prod = await db.products.get(item.productId);
            item.name = prod ? prod.name : 'Produk Dihapus';
        }
    }
 
    const tgl = new Date(tx.timestamp);
    const tglStr = tgl.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const jamStr = tgl.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
 
    // Create print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Struk ${tx.id}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Courier New', monospace;
                    background: #fff;
                    padding: 0;
                }
                .receipt {
                    width: 80mm;
                    margin: 0 auto;
                    padding: 10mm;
                    background: white;
                    color: #000;
                }
                .header {
                    text-align: center;
                    border-bottom: 2px dashed #000;
                    padding-bottom: 8mm;
                    margin-bottom: 8mm;
                }
                .store-name {
                    font-size: 18pt;
                    font-weight: bold;
                    letter-spacing: 2px;
                    margin-bottom: 2mm;
                }
                .store-info {
                    font-size: 8pt;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 4mm;
                }
                .datetime {
                    font-size: 8pt;
                    margin-bottom: 2mm;
                }
                .receipt-id {
                    font-size: 7pt;
                    font-weight: bold;
                }
                .member-info {
                    font-size: 8pt;
                    background: #f5f5f5;
                    padding: 3mm;
                    margin-bottom: 5mm;
                    border: 1px solid #ddd;
                }
                .items {
                    border-bottom: 2px dashed #000;
                    padding-bottom: 8mm;
                    margin-bottom: 8mm;
                }
                .item {
                    font-size: 9pt;
                    margin-bottom: 3mm;
                }
                .item-name {
                    font-weight: bold;
                    margin-bottom: 1mm;
                }
                .item-detail {
                    font-size: 8pt;
                    color: #333;
                }
                .item-price {
                    display: flex;
                    justify-content: space-between;
                    font-weight: bold;
                    margin-top: 1mm;
                }
                .totals {
                    border-bottom: 2px dashed #000;
                    padding-bottom: 8mm;
                    margin-bottom: 8mm;
                }
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 9pt;
                    margin-bottom: 2mm;
                }
                .total-row.discount {
                    color: #d32f2f;
                }
                .total-row.fee {
                    color: #f57c00;
                }
                .total-final {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12pt;
                    font-weight: bold;
                    margin: 4mm 0;
                }
                .payment-method {
                    display: flex;
                    justify-content: space-between;
                    font-size: 8pt;
                    margin-top: 2mm;
                }
                .footer {
                    text-align: center;
                    font-size: 8pt;
                    margin-top: 8mm;
                    color: #666;
                }
                .thank-you {
                    font-weight: bold;
                    margin-bottom: 2mm;
                }
                @media print {
                    body { padding: 0; }
                    .receipt { width: 80mm; margin: 0; padding: 5mm; }
                }
                @page {
                    size: 80mm auto;
                    margin: 0;
                }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">
                    <div class="store-name">MVAPE</div>
                    <div class="store-info">${tx.storeBranch || 'Toko 1'}</div>
                    <div class="datetime">${tglStr} ${jamStr}</div>
                    <div class="receipt-id">No: ${tx.id}</div>
                </div>
 
                ${tx.memberName ? `
                <div class="member-info">
                    <strong>Member:</strong> ${tx.memberName}
                </div>
                ` : ''}
 
                <div class="items">
                    ${items.map(item => `
                        <div class="item">
                            <div class="item-name">${item.name.toUpperCase()}</div>
                            <div class="item-detail">${item.quantity} x Rp ${(item.subtotal / item.quantity).toLocaleString('id-ID')}</div>
                            ${item.notes ? `<div class="item-detail" style="color: #999;">Catatan: ${item.notes}</div>` : ''}
                            <div class="item-price">
                                <span></span>
                                <span>Rp ${item.subtotal.toLocaleString('id-ID')}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
 
                <div class="totals">
                    <div class="total-row">
                        <span>SUBTOTAL</span>
                        <span>Rp ${(tx.subtotal || 0).toLocaleString('id-ID')}</span>
                    </div>
                    ${tx.discount > 0 ? `
                    <div class="total-row discount">
                        <span>DISKON</span>
                        <span>- Rp ${tx.discount.toLocaleString('id-ID')}</span>
                    </div>
                    ` : ''}
                    ${tx.serviceFee > 0 ? `
                    <div class="total-row fee">
                        <span>BIAYA JASA</span>
                        <span>+ Rp ${tx.serviceFee.toLocaleString('id-ID')}</span>
                    </div>
                    ` : ''}
                    <div class="total-final">
                        <span>TOTAL</span>
                        <span>Rp ${tx.total.toLocaleString('id-ID')}</span>
                    </div>
                    <div class="payment-method">
                        <span>Pembayaran:</span>
                        <span><strong>${tx.paymentMethod}</strong></span>
                    </div>
                </div>
 
                <div class="footer">
                    <div class="thank-you">Terima kasih atas kunjungan Anda!</div>
                    <div>---</div>
                </div>
            </div>
 
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(() => window.close(), 500);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
};

export default { render };
