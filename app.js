// 1. Inisialisasi Database Lokal (IndexedDB via Dexie)
const db = new Dexie("PoSDatabase");
db.version(1).stores({
    products: 'id, name, price, stock',
    transactions: '++id, timestamp, items, total, paymentMethod, synced'
});

// Mock Data Produk (Dimasukkan jika DB masih kosong)
db.on("populate", () => {
    db.products.bulkAdd([
        { id: "P1", name: "Kopi Susu Gula Aren", price: 18000, stock: 50 },
        { id: "P2", name: "Croissant Original", price: 22000, stock: 20 },
        { id: "P3", name: "Ice Americano", price: 15000, stock: 40 },
        { id: "P4", name: "Earl Grey Tea", price: 17000, stock: 30 }
    ]);
});

// State Keranjang Belanja
let cart = {};

// 2. Render Produk ke Grid
async function renderProducts() {
    const products = await db.products.toArray();
    const grid = document.getElementById('product-grid');
    grid.innerHTML = products.map(p => `
        <div onclick="addToCart('${p.id}')" class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer transition">
            <div class="font-bold text-gray-800">${p.name}</div>
            <div class="text-indigo-600 font-semibold mt-1">Rp ${p.price.toLocaleString('id-ID')}</div>
            <div class="text-xs text-gray-400 mt-2">Stok: ${p.stock}</div>
        </div>
    `).join('');
}

// 3. Fungsi Keranjang
async function addToCart(productId) {
    const product = await db.products.get(productId);
    if (!product || product.stock <= 0) return alert("Stok habis!");

    if (cart[productId]) {
        cart[productId].qty++;
    } else {
        cart[productId] = { name: product.name, price: product.price, qty: 1 };
    }
    renderCart();
}

async function renderCart() {
    const cartContainer = document.getElementById('cart-items');
    let total = 0;
    cartContainer.innerHTML = '';

    for (let id in cart) {
        const item = cart[id];
        total += item.price * item.qty;
        cartContainer.innerHTML += `
            <div class="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-100">
                <div>
                    <div class="font-semibold text-sm text-gray-700">${item.name}</div>
                    <div class="text-xs text-gray-400">@ Rp ${item.price.toLocaleString('id-ID')}</div>
                </div>
                <div class="font-bold text-sm text-indigo-600">${item.qty}x</div>
            </div>
        `;
    }
    document.getElementById('cart-total').innerText = `Rp ${total.toLocaleString('id-ID')}`;
}

// 4. Proses Transaksi (Mendukung Offline)
document.getElementById('checkout-btn').addEventListener('click', async () => {
    const items = Object.values(cart);
    if (items.length === 0) return alert("Keranjang masih kosong!");

    const total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const paymentMethod = document.getElementById('payment-method').value;

    const transaction = {
        timestamp: new Date().toISOString(),
        items: items,
        total: total,
        paymentMethod: paymentMethod,
        synced: navigator.onLine ? 1 : 0 // 1 jika online, 0 jika offline
    };

    // Simpan ke database lokal terlebih dahulu (Aman walau offline)
    await db.transactions.add(transaction);

    // Potong stok lokal
    for (let id in cart) {
        const prod = await db.products.get(id);
        await db.products.update(id, { stock: prod.stock - cart[id].qty });
    }

    alert(`Transaksi Berhasil! Total: Rp ${total.toLocaleString('id-ID')}. ${navigator.onLine ? 'Data langsung disinkronkan.' : 'Disimpan di lokal (Offline mode).'}`);
    
    // Reset Kasir
    cart = {};
    renderCart();
    renderProducts();
});

// 5. Monitor Status Koneksi Internet
function updateOnlineStatus() {
    const status = document.getElementById('network-status');
    if (navigator.onLine) {
        status.innerText = "Online";
        status.className = "px-3 py-1 rounded-full text-xs font-semibold bg-green-500 text-white";
        syncOfflineTransactions();
    } else {
        status.innerText = "Offline Mode";
        status.className = "px-3 py-1 rounded-full text-xs font-semibold bg-orange-500 text-white";
    }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// Fungsi simulasi sinkronisasi ke server cloud saat internet kembali terhubung
async function syncOfflineTransactions() {
    const unsynced = await db.transactions.where('synced').equals(0).toArray();
    if (unsynced.length > 0) {
        console.log(`Menyingkronkan ${unsynced.length} transaksi tertunda ke cloud...`);
        // Di sini kamu panggil API backend pakai fetch()
        // Setelah sukses, ubah status 'synced' jadi 1
        for (let tx of unsynced) {
            await db.transactions.update(tx.id, { synced: 1 });
        }
        console.log("Sinkronisasi selesai!");
    }
}

// 6. Registrasi Service Worker PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker terdaftar!', reg))
            .catch(err => console.err('Registrasi gagal', err));
    });
}

// Inisialisasi awal aplikasi
db.open().then(() => {
    renderProducts();
    updateOnlineStatus();
});

// Fungsi utama untuk melakukan koneksi dan pencetakan
async function cetakStrukBluetooth(dataTransaksi) {
    try {
        console.log("Mencari printer bluetooth...");

        // 1. Request perangkat Bluetooth dengan layanan komunikasi serial (GATT)
        // Umumnya printer thermal menggunakan service UUID 0x18F0 atau ekspresi umum
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'RPP' }, // Sering digunakan oleh printer Rongsheng/Cetak Portable
                { namePrefix: 'PT-' },  // Seri printer thermal umum
                { namePrefix: 'MTP' }   // Seri printer thermal mobile
            ],
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] // UUID Layanan Printer Umum
        });

        // 2. Hubungkan ke GATT Server perangkat
        const server = await device.gatt.connect();

        // 3. Ambil Primary Service printer
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');

        // 4. Ambil Karakteristik untuk Menulis Data (Write Characteristic)
        // Biasanya menggunakan UUID berikut untuk pengiriman data searah
        const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

        // 5. Susun teks struk menggunakan perintah ESC/POS
        const encoder = new TextEncoder(); // Mengubah string text menjadi Uint8Array
        
        // Komponen Struk
        const ESC = '\x1B';
        const initPrinter = ESC + '@';
        const textTebalOn = ESC + 'E\x01';
        const textTebalOff = ESC + 'E\x00';
        const rataTengah = ESC + 'a\x01';
        const rataKiri = ESC + 'a\x00';
        const gantiBaris = '\n';

        // Format Teks Struk Belanja
        let struk = "";
        struk += initPrinter;
        struk += rataTengah + textTebalOn + "TOKOKU COFFEE & BAKERY" + textTebalOff + gantiBaris;
        struk += "Jl. Ahmad Yani No. 45, Jakarta" + gantiBaris;
        struk += "--------------------------------" + gantiBaris; // Jarak standar 32 karakter (58mm)
        struk += rataKiri + `Waktu: ${new Date(dataTransaksi.timestamp).toLocaleString('id-ID')}` + gantiBaris;
        struk += "--------------------------------" + gantiBaris;

        // Loop Item Belanjaan
        dataTransaksi.items.forEach(item => {
            // Mengatur spasi agar nama produk dan total harga rata kanan-kiri
            const detailHarga = `${item.qty}x Rp ${item.price.toLocaleString('id-ID')}`;
            struk += `${item.name}` + gantiBaris;
            struk += rataTengah + `                   ${detailHarga}` + gantiBaris + rataKiri;
        });

        struk += "--------------------------------" + gantiBaris;
        struk += textTebalOn + `TOTAL: Rp ${dataTransaksi.total.toLocaleString('id-ID')}` + textTebalOff + gantiBaris;
        struk += `Metode: ${dataTransaksi.paymentMethod}` + gantiBaris;
        struk += "--------------------------------" + gantiBaris;
        struk += rataTengah + "Terima Kasih Atas Kunjungan Anda" + gantiBaris;
        struk += gantiBaris + gantiBaris + gantiBaris; // Kertas kosong tambahan agar tidak terpotong dekat text

        // 6. Kirim data dalam bentuk ArrayBuffer (Dipotong per 20 byte jika struk sangat panjang)
        const bytes = encoder.encode(struk);
        const chunkLength = 20; // Batasan transmisi paket BLE standar murni
        
        for (let i = 0; i < bytes.length; i += chunkLength) {
            const chunk = bytes.slice(i, i + chunkLength);
            await characteristic.writeValue(chunk);
        }

        console.log("Pencetakan selesai!");
        
        // 7. Putuskan koneksi agar baterai printer hemat
        await device.gatt.disconnect();

    } catch (error) {
        console.error("Gagal mencetak via Bluetooth:", error);
        alert("Gagal terhubung atau mencetak ke printer: " + error.message);
    }
}

// Contoh pemicu saat pembayaran berhasil
const transaksiSaatIni = {
    timestamp: new Date().toISOString(),
    items: [
        { name: "Kopi Susu Gula Aren", price: 18000, qty: 2 },
        { name: "Croissant Original", price: 22000, qty: 1 }
    ],
    total: 58000,
    paymentMethod: "Tunai"
};

// Panggil fungsi cetak
cetakStrukBluetooth(transaksiSaatIni);