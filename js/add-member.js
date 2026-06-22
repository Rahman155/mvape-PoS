// js/views/add-member.js
import db from './db.js';

async function render(container) {
    // Ambil semua daftar member untuk ditampilkan sebagai preview di bawah form
    const members = await db.members.toArray();

    container.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6">
            <!-- Header Halaman -->
            <div class="flex items-center justify-between border-b pb-4">
                <div>
                    <h2 class="text-xl font-black text-gray-950">🎖️ Registrasi & Kemitraan Member</h2>
                    <p class="text-xs text-gray-500 mt-0.5">Daftarkan pelanggan baru untuk mengaktifkan potongan diskon otomatis dan pengumpulan poin.</p>
                </div>
                <button onclick="window.switchView('cashier')" class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded-xl text-xs transition">
                    ⬅️ Kembali ke Kasir
                </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Form Pendaftaran (Kiri) -->
                <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 h-fit">
                    <h3 class="text-sm font-black text-gray-900 mb-3 flex items-center gap-1.5">
                        <span class="p-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs">➕</span> 
                        Form Input Member
                    </h3>
                    
                    <form id="cashier-member-form" onsubmit="window.saveNewMemberFromCashier(event)" class="space-y-4">
                        <div>
                            <label class="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Nama Lengkap Pelanggan</label>
                            <input type="text" id="cm-name" required placeholder="Contoh: Andi Wijaya" 
                                class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:bg-white focus:border-indigo-500 focus:outline-none">
                        </div>
                        
                        <div>
                            <label class="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">No. WhatsApp / HP</label>
                            <input type="tel" id="cm-phone" required placeholder="Contoh: 08123456789" 
                                class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono font-bold text-gray-800 focus:bg-white focus:border-indigo-500 focus:outline-none">
                        </div>

                        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs shadow-sm transition tracking-wide">
                            🚀 Validasi & Simpan Member
                        </button>
                    </form>
                </div>

                <!-- Live Preview Data Terdaftar (Kanan) -->
                <div class="lg:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="text-sm font-black text-gray-900 flex items-center gap-1.5">
                            <span class="p-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs">📋</span> 
                            Daftar Member Aktif Toko
                        </h3>
                        <span class="text-[11px] bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded-full">Total: ${members.length} Orang</span>
                    </div>

                    <div class="overflow-x-auto max-h-[350px] overflow-y-auto border rounded-xl">
                        <table class="w-full text-left text-xs text-gray-500">
                            <thead class="bg-gray-50 text-gray-700 uppercase font-bold border-b tracking-wider sticky top-0 bg-gray-50">
                                <tr>
                                    <th class="p-3">ID Kartu</th>
                                    <th class="p-3">Nama Pelanggan</th>
                                    <th class="p-3">No. WhatsApp</th>
                                    <th class="p-3 text-center text-indigo-600">Poin Saat Ini</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                ${members.length === 0 ? `
                                    <tr>
                                        <td colspan="4" class="p-12 text-center text-gray-400 italic bg-gray-50/30">
                                            Belum ada database member terdisplay. Silakan input untuk mengawali.
                                        </td>
                                    </tr>
                                ` : members.map(m => `
                                    <tr class="hover:bg-gray-50/40 transition">
                                        <td class="p-3 font-mono font-bold text-indigo-600">#VPM-${m.id}</td>
                                        <td class="p-3 font-bold text-gray-900">${m.name}</td>
                                        <td class="p-3 font-mono font-medium text-gray-600">${m.phone}</td>
                                        <td class="p-3 text-center"><span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-black rounded">${m.points || 0} PTS</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Logika Controller Interaksi Global
window.saveNewMemberFromCashier = async function(e) {
    e.preventDefault();
    const name = document.getElementById('cm-name').value.trim();
    const phone = document.getElementById('cm-phone').value.trim();

    // Cek Duplikasi No HP agar tidak bentrok di IndexedDB
    const isDuplicate = await db.members.where('phone').equals(phone).first();
    if (isDuplicate) {
        alert(`Gagal! Nomor ${phone} sudah digunakan oleh member atas nama "${isDuplicate.name}".`);
        return;
    }

    // Insert ke tabel database
    await db.members.add({
        id: Date.now().toString().slice(-6), // Mengambil 6 digit unik timestamp
        name: name,
        phone: phone,
        points: 0
    });

    alert("Sukses! Pelanggan resmi terdaftar sebagai member.");
    
    // Refresh halaman agar tabel terupdate otomatis
    render(document.getElementById('app-container'));
};

export default { render };