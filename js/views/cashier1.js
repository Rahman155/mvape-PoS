import db from '../db.js';

// State penyimpanan internal kasir
let cart = [];
let selectedStoreId = 'toko1'; // Default toko aktif pertama
let selectedMemberId = '';
let paymentMethod = 'Cash';

// State Diskon Manual
let discountType = 'rp'; // 'rp' atau 'percent'
let manualDiscountValue = 0; // Nilai input diskon

// State filter pencarian produk
let productSearchQuery = '';
let selectedCategory = 'Semua';

async function render(container) {
    // Ambil data pendukung dari IndexedDB
    const allProducts = await db.products.toArray();
    const allStores = await db.stores.toArray();
    const activeStores = allStores.filter(s => s.isActive);
    let members = [];
    if (db.members) members = await db.members.toArray();

    const getCurrentBranch = () => localStorage.getItem('storeBranch') || 'Toko 1';
    const products = await db.products.toArray();
    const currentBranch = getCurrentBranch(); // Identifikasi kasir sedang berjaga di toko mana

    // Ambil nomor urut toko untuk membaca stok cabang secara dinamis
    const storeNum = selectedStoreId.match(/\d+/)[0];
    const branchStockKey = `stockToko${storeNum}`;

    // Filter produk berdasarkan input pencarian dan kategori
    const filteredProducts = allProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(productSearchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'Semua' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    // Hitung ringkasan belanja saat ini
    const { subtotal, discount, total } = calculateCartTotals();

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-120px)]">
            
            <!-- SEKSI KIRI: KATALOG PRODUK (lg:col-span-7) -->
            <div class="lg:col-span-7 flex flex-col space-y-4">
                
                <!-- Filter & Pencarian -->
                <div class="bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <h2 class="text-2xl font-bold text-gray-900">Kasir ${currentBranch}</h2>
                    </div>
                    
                    <div class="flex flex-col sm:flex-row gap-2">
                        <input type="text" id="pos-search" value="${productSearchQuery}" oninput="window.handlePOSSearch(this.value)" placeholder="Cari produk vape / liquid..." class="flex-1 p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                        <select id="pos-category-filter" onchange="window.handlePOSCategory(this.value)" class="p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white">
                            <option value="Semua">Semua Kategori</option>
                            <option value="Liquid" ${selectedCategory === 'Liquid' ? 'selected' : ''}>Liquid</option>
                            <option value="Device" ${selectedCategory === 'Device' ? 'selected' : ''}>Device (Mod/Pod)</option>
                            <option value="Atomizer" ${selectedCategory === 'Atomizer' ? 'selected' : ''}>Atomizer</option>
                            <option value="Accessories" ${selectedCategory === 'Accessories' ? 'selected' : ''}>Accessories</option>
                        </select>
                    </div>
                </div>

                <!-- Grid Item Produk -->
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto max-h-[60vh] pr-1">
                    ${filteredProducts.length === 0 ? `
                        <div class="col-span-full py-12 text-center text-gray-400 italic">Produk tidak ditemukan atau stok kosong.</div>
                    ` : filteredProducts.map(p => {
                        const branchStock = p[branchStockKey] || 0;
                        const isOutOfStock = branchStock <= 0;
                        return `
                            <div class="bg-white dark:bg-gray-900 p-3.5 rounded-2xl border ${isOutOfStock ? 'border-gray-100 dark:border-gray-800 opacity-60' : 'border-gray-100 dark:border-gray-800 hover:border-indigo-200 hover:shadow-md'} transition flex flex-col justify-between">
                                <div>
                                    <span class="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-bold px-2 py-0.5 rounded-md uppercase">${p.category || 'Vape'}</span>
                                    <h4 class="font-bold text-gray-900 dark:text-white text-sm mt-1.5 line-clamp-2">${p.name}</h4>
                                    <p class="text-xs text-gray-400 mt-1">Stok cabang: <span class="font-bold ${branchStock <= 3 ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}">${branchStock} pcs</span></p>
                                </div>
                                <div class="mt-4 flex justify-between items-center">
                                    <span class="font-extrabold text-indigo-600 dark:text-indigo-400 text-sm">Rp ${p.price.toLocaleString('id-ID')}</span>
                                    <button onclick="${isOutOfStock ? '' : `window.addToCart('${p.id}')`}" class="p-1.5 rounded-lg ${isOutOfStock ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white'} transition text-xs font-bold">
                                        ${isOutOfStock ? 'Habis' : '＋ Tambah'}
                                    </button>
                                </div>
                            </div>
                        `;
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
                            <div class="space-y-1 pr-2">
                                <h5 class="font-bold text-sm text-gray-900 dark:text-white">${item.name}</h5>
                                <div class="flex items-center gap-1">
                                    <input type="text" placeholder="Catatan item (misal: Nic 3mg)..." value="${item.notes || ''}" onchange="window.updateCartNotes('${item.id}', this.value)" class="text-[10px] w-36 p-1 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-md">
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
                <div class="p-4 bg-gray-50/50 dark:bg-gray-800/20 border-t border-b dark:border-gray-800 space-y-4">
                    <!-- Member Dropdown -->
                    <div>
                        <label class="block text-[11px] font-bold text-gray-400 uppercase mb-1">Loyalty Member</label>
                        <select onchange="window.selectPOSMember(this.value)" class="w-full p-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs dark:text-white">
                            <option value="">-- Transaksi Umum (Bukan Member) --</option>
                            ${members.map(m => `<option value="${m.id}" ${m.id === selectedMemberId ? 'selected' : ''}>👤 ${m.name} (${m.phone})</option>`).join('')}
                        </select>
                    </div>

                    <!-- INPUT DISKON MANUAL (UTAMA) -->
                    <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-150 dark:border-gray-700 space-y-2">
                        <div class="flex justify-between items-center">
                            <label class="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Potongan Diskon Manual</label>
                            <!-- Switcher Rp / % -->
                            <div class="flex bg-gray-100 dark:bg-gray-900 p-0.5 rounded-lg text-xs border dark:border-gray-700">
                                <button onclick="window.setDiscountType('rp')" class="px-2.5 py-1 rounded-md font-bold transition ${discountType === 'rp' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900' }">Rp</button>
                                <button onclick="window.setDiscountType('percent')" class="px-2.5 py-1 rounded-md font-bold transition ${discountType === 'percent' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900' }">%</button>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <span class="flex items-center text-sm font-bold text-gray-400 px-1">${discountType === 'rp' ? 'Rp' : '%'}</span>
                            <input type="number" id="pos-discount-input" value="${manualDiscountValue}" min="0" oninput="window.handleDiscountChange(this.value)" placeholder="${discountType === 'rp' ? 'Contoh: 15000' : 'Contoh: 10'}" class="flex-1 p-2 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-lg text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                        </div>
                    </div>
                </div>

                <!-- RINGKASAN PEMBAYARAN & KASIR -->
                <div class="p-4 space-y-3">
                    <div class="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                        <div class="flex justify-between">
                            <span>Subtotal Belanja:</span>
                            <span class="font-semibold text-gray-900 dark:text-white">Rp ${subtotal.toLocaleString('id-ID')}</span>
                        </div>
                        <div class="flex justify-between text-red-500">
                            <span>Diskon Manual (${discountType === 'rp' ? 'Nominal' : manualDiscountValue + '%'}):</span>
                            <span class="font-bold">- Rp ${discount.toLocaleString('id-ID')}</span>
                        </div>
                        <div class="flex justify-between text-base font-extrabold text-gray-900 dark:text-white border-t dark:border-gray-800 pt-2 mt-2">
                            <span>Total Tagihan:</span>
                            <span class="text-indigo-600 dark:text-indigo-400 text-lg">Rp ${total.toLocaleString('id-ID')}</span>
                        </div>
                    </div>

                    <!-- Metode Pembayaran -->
                    <div class="pt-2">
                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Metode Pembayaran</label>
                        <div class="grid grid-cols-3 gap-2">
                            ${['Cash', 'QRIS', 'Transfer'].map(method => `
                                <button onclick="window.setPOSPaymentMethod('${method}')" class="py-2 rounded-xl text-xs font-bold border transition ${paymentMethod === method ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-500' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100'}">
                                    ${method === 'Cash' ? '💵 Cash' : method === 'QRIS' ? '📱 QRIS' : '🏦 Bank'}
                                </button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Tombol Ambil Pembayaran -->
                    <button onclick="window.processPOSCheckout()" ${cart.length === 0 ? 'disabled' : ''} class="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white font-extrabold py-3.5 rounded-2xl transition shadow-lg text-sm">
                        🚀 Bayar & Cetak Struk
                    </button>
                </div>
            </div>

        </div>
    `;
}

function calculateCartTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let discount = 0;

    if (discountType === 'rp') {
        // Diskon Rp langsung, batasi agar tidak melebihi subtotal
        discount = Math.min(subtotal, manualDiscountValue);
    } else {
        // Diskon persentase, batasi persentase maksimal 100%
        const percent = Math.min(100, Math.max(0, manualDiscountValue));
        discount = Math.round(subtotal * (percent / 100));
    }

    const total = Math.max(0, subtotal - discount);
    return { subtotal, discount, total };
}

window.handleDiscountChange = function(val) {
    const numericVal = parseFloat(val) || 0;
    manualDiscountValue = Math.max(0, numericVal);
    
    // Auto-update tampilan angka nominal / total secara dinamis tanpa full-render
    const { subtotal, discount, total } = calculateCartTotals();
    render(document.getElementById('app-container'));
};

window.setDiscountType = function(type) {
    discountType = type;
    manualDiscountValue = 0; // Reset input diskon saat beralih mode
    render(document.getElementById('app-container'));
};

window.changePOSStore = function(storeId) {
    selectedStoreId = storeId;
    render(document.getElementById('app-container'));
};

window.handlePOSSearch = function(query) {
    productSearchQuery = query;
    render(document.getElementById('app-container'));
};

window.handlePOSCategory = function(category) {
    selectedCategory = category;
    render(document.getElementById('app-container'));
};

window.selectPOSMember = function(memberId) {
    selectedMemberId = memberId;
    render(document.getElementById('app-container'));
};

window.setPOSPaymentMethod = function(method) {
    paymentMethod = method;
    render(document.getElementById('app-container'));
};

window.addToCart = async function(productId) {
    const product = await db.products.get(productId);
    if (!product) return;

    // Cek ketersediaan stok di cabang aktif
    const storeNum = selectedStoreId.match(/\d+/)[0];
    const branchStockKey = `stockToko${storeNum}`;
    const branchStock = product[branchStockKey] || 0;

    const existingCartItem = cart.find(item => item.id === productId);
    const currentQtyInCart = existingCartItem ? existingCartItem.quantity : 0;

    if (currentQtyInCart + 1 > branchStock) {
        return alert(`Stok tidak mencukupi! Sisa stok di cabang saat ini adalah ${branchStock} pcs.`);
    }

    if (existingCartItem) {
        existingCartItem.quantity += 1;
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
    const storeNum = selectedStoreId.match(/\d+/)[0];
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
    render(document.getElementById('app-container'));
};

window.processPOSCheckout = async function() {
    if (cart.length === 0) return alert("Keranjang masih kosong!");

    const allStores = await db.stores.toArray();
    const activeStore = allStores.find(s => s.id === selectedStoreId);
    const storeBranchName = activeStore ? activeStore.name : 'Toko 1';

    // 1. Verifikasi kembali seluruh ketersediaan stok sebelum eksekusi write database
    const storeNum = selectedStoreId.match(/\d+/)[0];
    const branchStockKey = `stockToko${storeNum}`;

    for (const item of cart) {
        const prod = await db.products.get(item.id);
        const stockAvailable = prod ? prod[branchStockKey] || 0 : 0;
        if (item.quantity > stockAvailable) {
            return alert(`Gagal checkout! Produk "${item.name}" melebihi stok yang tersedia (${stockAvailable} pcs).`);
        }
    }

    // Hitung final totals
    const { subtotal, discount, total } = calculateCartTotals();
    const txId = 'TX-' + Date.now().toString().slice(-6);

    try {
        // Ambil info nama member jika terdaftar
        let memberName = '';
        if (selectedMemberId && db.members) {
            const memberObj = await db.members.get(selectedMemberId);
            if (memberObj) memberName = memberObj.name;
        }

        // 2. Simpan Transaksi Utama ke IndexedDB
        await db.transactions.add({
            id: txId,
            timestamp: new Date().toISOString(),
            subtotal: subtotal,
            discount: discount, // Nilai diskon manual tersimpan disini secara nominal
            total: total,
            paymentMethod: paymentMethod,
            storeBranch: storeBranchName,
            memberId: selectedMemberId || null,
            memberName: memberName || null
        });

        // 3. Simpan Detail Item Belanja, Mutasi Stok & Kurangi Stok Produk
        for (const item of cart) {
            await db.transactionItems.add({
                transactionId: txId,
                productId: item.id,
                quantity: item.quantity,
                subtotal: item.price * item.quantity,
                notes: item.notes || ''
            });

            // Potong Stok Produk (Stok Cabang Khusus & Total Global)
            const prod = await db.products.get(item.id);
            const currentBranchStock = prod[branchStockKey] || 0;
            const updatedBranchStock = currentBranchStock - item.quantity;
            
            // Hitung akumulasi global stock terbaru
            let newTotalStock = 0;
            allStores.forEach(s => {
                const sNum = s.id.match(/\d+/)[0];
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

            // Log Mutasi Stok
            await db.stock_mutations.add({
                productId: item.id,
                type: 'KELUAR',
                quantity: item.quantity,
                note: `Penjualan Kasir POS #${txId} ${item.notes ? `(${item.notes})` : ''}`,
                storeBranch: storeBranchName,
                timestamp: new Date().toISOString()
            });
        }

        // 4. Update Loyalty Point Member (Bila Ada)
        if (selectedMemberId && db.members) {
            const memberObj = await db.members.get(selectedMemberId);
            if (memberObj) {
                // Skema: Belanja Rp 10.000 mendapatkan 1 point
                const earnedPoints = Math.floor(total / 10000);
                const currentPoints = memberObj.points || 0;
                await db.members.update(selectedMemberId, { points: currentPoints + earnedPoints });
            }
        }

        alert(`Checkout Berhasil!\nNota: ${txId}\nTotal Pembayaran: Rp ${total.toLocaleString('id-ID')}`);
        
        // Bersihkan Keranjang & Reset State Diskon Manual
        cart = [];
        manualDiscountValue = 0;
        selectedMemberId = '';
        render(document.getElementById('app-container'));

    } catch (error) {
        console.error("Gagal melakukan proses transaksi checkout:", error);
        alert("Terjadi kesalahan sistem saat checkout!");
    }
};

export default { render };