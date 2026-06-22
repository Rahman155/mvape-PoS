// js/views/login.js
import db from '../db.js';

async function render(container, onLoginSuccess) {
    // Ambil logo & nama aplikasi dari settings
    let loginLogo = '';
    let appName   = 'Mvape PoS';
    if (db.settings) {
        try {
            const logoData = await db.settings.get('login_logo');
            if (logoData?.value) loginLogo = logoData.value;
            const nameData = await db.settings.get('app_name');
            if (nameData?.value?.name) appName = nameData.value.name;
        } catch(e) { /* silent fallback */ }
    }

    container.innerHTML = `
        <div class="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8">
            <div class="w-full max-w-sm animate-fadeInUp">

                <!-- Brand Header -->
                <div class="text-center mb-8">
                    ${loginLogo
                        ? `<div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white dark:bg-gray-900 shadow-xl shadow-indigo-100 mb-4 p-2 border border-gray-100 dark:border-gray-800">
                               <img src="${loginLogo}" class="w-full h-full object-contain" alt="Logo">
                           </div>`
                        : `<div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-200 mb-4">
                               <span class="text-2xl font-black text-white">${(appName[0]||'M').toUpperCase()}</span>
                           </div>`}
                    <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">${appName}</h1>
                    <p class="mt-1.5 text-sm text-gray-500 dark:text-gray-400">Selamat datang kembali</p>
                </div>

                <!-- Login Card -->
                <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-gray-200/60 dark:shadow-none border border-gray-100 dark:border-gray-800 p-6 space-y-4">
                    <form id="login-form" class="space-y-4">

                        <!-- Username -->
                        <div>
                            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Username</label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                </div>
                                <input id="login-username" type="text" required autocomplete="username"
                                    placeholder="Masukkan username"
                                    class="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500 transition">
                            </div>
                        </div>

                        <!-- Password -->
                        <div>
                            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Password</label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                </div>
                                <input id="login-password" type="password" required autocomplete="current-password"
                                    placeholder="Masukkan password"
                                    class="w-full pl-10 pr-12 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500 transition">
                                <button type="button" id="toggle-password" class="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
                                    <svg id="eye-show" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    <svg id="eye-hide" class="w-4 h-4 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                </button>
                            </div>
                        </div>

                        <!-- Error Message -->
                        <div id="login-error" class="hidden flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400 font-semibold animate-fadeIn">
                            <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            <span id="login-error-text"></span>
                        </div>

                        <!-- Submit -->
                        <button type="submit" id="login-btn"
                            class="w-full py-3.5 px-4 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                            Masuk ke Aplikasi
                        </button>
                    </form>
                </div>

                <!-- Credentials Hint -->
                <div class="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-2xl">
                    <div class="flex items-center gap-2 mb-2">
                        <svg class="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>
                        <p class="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Akun Demo</p>
                    </div>
                    <div class="space-y-1.5">
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] text-amber-600 dark:text-amber-400">Super Admin</span>
                            <code class="text-[10px] bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">superadmin / superadmin123</code>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] text-amber-600 dark:text-amber-400">Owner</span>
                            <code class="text-[10px] bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">owner / owner123</code>
                        </div>
                        <p class="text-[10px] text-amber-500 dark:text-amber-500 mt-1">Kasir: buat akun di panel Owner → tab Kasir</p>
                    </div>
                </div>

            </div>
        </div>
    `;

    // Toggle password visibility
    const toggleBtn = document.getElementById('toggle-password');
    const passInput = document.getElementById('login-password');
    const eyeShow   = document.getElementById('eye-show');
    const eyeHide   = document.getElementById('eye-hide');
    toggleBtn.onclick = () => {
        const isHidden = passInput.type === 'password';
        passInput.type = isHidden ? 'text' : 'password';
        eyeShow.classList.toggle('hidden', isHidden);
        eyeHide.classList.toggle('hidden', !isHidden);
    };

    const form     = document.getElementById('login-form');
    const errorBox = document.getElementById('login-error');
    const errorTxt = document.getElementById('login-error-text');
    const loginBtn = document.getElementById('login-btn');

    function showError(msg) {
        errorTxt.textContent = msg;
        errorBox.classList.remove('hidden');
    }

    form.onsubmit = async function (e) {
        e.preventDefault();
        errorBox.classList.add('hidden');

        // Loading state
        loginBtn.disabled = true;
        loginBtn.innerHTML = `<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Memverifikasi...`;

        const usernameInput = document.getElementById('login-username').value.trim();
        const passwordInput = document.getElementById('login-password').value;

        // Simulate a small delay for UX
        await new Promise(r => setTimeout(r, 400));

        // 1. Super Admin
        if (usernameInput.toLowerCase() === 'superadmin' && passwordInput === 'superadmin123') {
            localStorage.setItem('storeBranch', 'Semua Cabang');
            onLoginSuccess({ role: 'superadmin', name: 'Super Admin', storeBranch: 'Semua Cabang' });
            return;
        }

        // 2. Owner
        if (usernameInput.toLowerCase() === 'owner' && passwordInput === 'owner123') {
            localStorage.setItem('storeBranch', 'Semua Cabang');
            onLoginSuccess({ role: 'owner', name: 'Owner', storeBranch: 'Semua Cabang' });
            return;
        }

        // 3. Dynamic Kasir
        if (db.users) {
            try {
                const user = await db.users.where('username').equalsIgnoreCase(usernameInput).first();
                if (user) {
                    if (user.status !== 'Aktif') {
                        showError('Akun kasir Anda dinonaktifkan oleh owner!');
                        resetBtn(); return;
                    }
                    if (user.password === passwordInput) {
                        const branch = user.storeBranch || 'Toko 1';
                        localStorage.setItem('storeBranch', branch);

                        // ── Catat absensi masuk otomatis ──────────────────────
                        await recordLoginAttendance(user);

                        onLoginSuccess({ role: 'cashier', name: user.name, username: user.username, storeBranch: branch });
                        return;
                    } else {
                        showError('Kata sandi yang Anda masukkan salah!');
                        resetBtn(); return;
                    }
                }
            } catch (err) {
                console.error('Gagal membaca database pengguna:', err);
            }
        }

        showError('Username atau password salah / akun tidak ditemukan!');
        resetBtn();
    };

    function resetBtn() {
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Masuk ke Aplikasi`;
    }
}

// ── Catat absensi login secara otomatis ──────────────────────────────────────
async function recordLoginAttendance(user) {
    if (!db.attendances) return;
    try {
        const now     = new Date();
        const today   = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        // Cek apakah sudah ada record hari ini untuk user ini (cegah duplikat)
        const existing = await db.attendances.filter(a =>
            a.userId === user.id && a.date === today
        ).toArray();
        if (existing.length > 0) {
            // Sudah login hari ini — simpan ID session di localStorage untuk logout nanti
            localStorage.setItem('currentAttendanceId', existing[0].id);
            return;
        }

        // Tentukan status berdasarkan jam masuk
        // Terlambat jika masuk setelah 09:00 (bisa disesuaikan)
        const [h, m] = timeStr.split(':').map(Number);
        const status = (h > 9 || (h === 9 && m > 0)) ? 'Terlambat' : 'Hadir';

        const attId = 'ATT-' + Date.now();
        await db.attendances.add({
            id:           attId,
            userId:       user.id,
            userName:     user.name,
            storeBranch:  user.storeBranch || 'Toko 1',
            date:         today,
            status:       status,
            checkInTime:  timeStr,
            checkOutTime: null,
            loginAt:      now.toISOString(),
            logoutAt:     null,
            notes:        'Login otomatis',
            createdAt:    now.toISOString(),
            updatedAt:    now.toISOString(),
        });
        // Simpan ID untuk dipakai saat logout
        localStorage.setItem('currentAttendanceId', attId);
        localStorage.setItem('currentUserId', user.id);
    } catch (err) {
        console.warn('[Attendance] Gagal catat login:', err);
    }
}

// ── Catat jam keluar otomatis saat logout ─────────────────────────────────────
window.recordLogoutAttendance = async function() {
    try {
        const attId = localStorage.getItem('currentAttendanceId');
        if (!attId || !db.attendances) return;
        const now     = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        await db.attendances.update(attId, {
            checkOutTime: timeStr,
            logoutAt:     now.toISOString(),
            updatedAt:    now.toISOString(),
        });
        localStorage.removeItem('currentAttendanceId');
        localStorage.removeItem('currentUserId');
    } catch (err) {
        console.warn('[Attendance] Gagal catat logout:', err);
    }
};

export default { render };