// js/views/owner-shifts.js
// Panel manajemen shift untuk owner

import shiftModule from './shift.js';
import db from '../db.js';

let shiftView = 'calendar'; // 'calendar', 'employees', 'attendance'
let shiftFilterDate = new Date().toISOString().split('T')[0];
let shiftFilterMonth = new Date().toISOString().substring(0, 7);
let shiftFilterStore = 'semua';
let editingShiftData = null;

async function render(container) {
    const users = await db.users?.toArray() || [];
    const stores = await db.stores?.toArray() || [];
    const activeStores = stores.filter(s => s.isActive);

    container.innerHTML = `
        <div class="space-y-4">
            <!-- Header & Filter -->
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
                <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
                    <div>
                        <h3 class="text-2xl font-bold text-gray-900 dark:text-white">Manajemen Shift Karyawan</h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Kelola jadwal kerja, kehadiran, dan tracking shift karyawan</p>
                    </div>
                    <button onclick="window.showCreateShiftModal()" 
                        class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        Buat Shift
                    </button>
                </div>

                <!-- View Tabs -->
                <div class="flex gap-2 border-b dark:border-gray-800 pb-4">
                    <button onclick="window.switchShiftView('calendar')" 
                        class="px-4 py-2 font-semibold text-sm transition ${shiftView === 'calendar' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}">
                        📅 Kalender
                    </button>
                    <button onclick="window.switchShiftView('employees')" 
                        class="px-4 py-2 font-semibold text-sm transition ${shiftView === 'employees' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}">
                        👥 Karyawan
                    </button>
                    <button onclick="window.switchShiftView('attendance')" 
                        class="px-4 py-2 font-semibold text-sm transition ${shiftView === 'attendance' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}">
                        📊 Kehadiran
                    </button>
                </div>

                <!-- Filters -->
                <div class="flex flex-wrap items-center gap-3 mt-4">
                    <select id="shift-filter-store" onchange="window.applyShiftFilters()" 
                        class="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-white">
                        <option value="semua">Semua Toko</option>
                        ${activeStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                    </select>
                    
                    ${shiftView === 'calendar' ? `
                        <input type="date" id="shift-filter-date" value="${shiftFilterDate}" onchange="window.applyShiftFilters()"
                            class="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-white">
                    ` : `
                        <input type="month" id="shift-filter-month" value="${shiftFilterMonth}" onchange="window.applyShiftFilters()"
                            class="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-white">
                    `}
                </div>
            </div>

            <!-- Content Area -->
            <div id="shift-view-content">
                ${shiftView === 'calendar' ? await renderCalendarView(shiftFilterDate, shiftFilterStore, users) :
                  shiftView === 'employees' ? await renderEmployeesView(users, stores) :
                  await renderAttendanceView(shiftFilterMonth, shiftFilterStore, users)}
            </div>
        </div>

        <!-- Modal Create Shift -->
        <div id="create-shift-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden">
            <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md border dark:border-gray-800">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-gray-900 dark:text-white">Buat Shift Baru</h3>
                    <button onclick="window.closeShiftModal()" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">✕</button>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Karyawan</label>
                        <select id="shift-employee" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white">
                            <option value="">Pilih Karyawan</option>
                            ${users.filter(u => u.status === 'Aktif').map(u => `<option value="${u.username}">${u.name}</option>`).join('')}
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Toko</label>
                        <select id="shift-store" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white">
                            ${activeStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tanggal</label>
                        <input type="date" id="shift-date" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white">
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Jenis Shift</label>
                        <div class="grid grid-cols-3 gap-2">
                            <label class="flex items-center">
                                <input type="radio" name="shift-type" value="pagi" checked class="mr-2"> <span class="text-sm">🌅 Pagi</span>
                            </label>
                            <label class="flex items-center">
                                <input type="radio" name="shift-type" value="siang" class="mr-2"> <span class="text-sm">☀️ Siang</span>
                            </label>
                            <label class="flex items-center">
                                <input type="radio" name="shift-type" value="malam" class="mr-2"> <span class="text-sm">🌙 Malam</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Catatan (Opsional)</label>
                        <textarea id="shift-notes" placeholder="Catatan tambahan..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white text-sm" rows="2"></textarea>
                    </div>

                    <button onclick="window.saveNewShift()" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition">
                        💾 Simpan Shift
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function renderCalendarView(date, storeFilter, users) {
    const shifts = await shiftModule.getShiftsByDateRange(date, date, storeFilter === 'semua' ? null : storeFilter);
    
    const dayShifts = {
        pagi: shifts.filter(s => s.shiftType === 'pagi'),
        siang: shifts.filter(s => s.shiftType === 'siang'),
        malam: shifts.filter(s => s.shiftType === 'malam'),
    };

    const dateObj = new Date(date);
    const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
    const fullDate = dateObj.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

    return `
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <h4 class="text-lg font-bold text-gray-900 dark:text-white mb-2">${dayName.charAt(0).toUpperCase() + dayName.slice(1)}</h4>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">${fullDate}</p>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${Object.entries(dayShifts).map(([shiftType, shiftList]) => `
                    <div class="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                        <h5 class="font-bold mb-4 flex items-center gap-2">
                            <span>${
                                shiftType === 'pagi' ? '🌅' :
                                shiftType === 'siang' ? '☀️' :
                                '🌙'
                            }</span>
                            ${shiftModule.SHIFT_TYPES[shiftType.toUpperCase()].label}
                            <span class="ml-auto px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-semibold rounded">${shiftList.length}</span>
                        </h5>
                        <div class="space-y-2">
                            ${shiftList.length > 0 ? shiftList.map(shift => `
                                <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <p class="font-semibold text-sm text-gray-900 dark:text-white">${shift.userName}</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Status: <span class="font-semibold ${
                                            shift.status === 'scheduled' ? 'text-yellow-600 dark:text-yellow-400' :
                                            shift.status === 'ongoing' ? 'text-green-600 dark:text-green-400' :
                                            'text-gray-600 dark:text-gray-400'
                                        }">
                                            ${shift.status === 'scheduled' ? '⏳ Belum' : shift.status === 'ongoing' ? '✅ Sedang' : '✔️ Selesai'}
                                        </span>
                                    </p>
                                </div>
                            `).join('') : `<p class="text-xs text-gray-500 dark:text-gray-400 italic">Tidak ada shift</p>`}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

async function renderEmployeesView(users, stores) {
    const employeeShifts = {};
    
    for (const user of users.filter(u => u.role === 'cashier' && u.status === 'Aktif')) {
        const shifts = await shiftModule.getUserShifts(user.username, 30);
        const todayShift = shifts.find(s => s.date === new Date().toISOString().split('T')[0]);
        employeeShifts[user.username] = { user, todayShift, totalShifts: shifts.length };
    }

    return `
        <div class="space-y-3">
            ${Object.values(employeeShifts).map(({ user, todayShift, totalShifts }) => `
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 hover:shadow-md transition">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <p class="font-bold text-gray-900 dark:text-white">${user.name}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${user.username} • ${user.storeBranch}</p>
                        </div>
                        <div class="text-right">
                            ${todayShift ? `
                                <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Shift Hari Ini</p>
                                <p class="font-bold text-indigo-600 dark:text-indigo-400">${shiftModule.SHIFT_TYPES[todayShift.shiftType.toUpperCase()].label}</p>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                                    ${todayShift.status === 'scheduled' ? '⏳ Belum dimulai' :
                                      todayShift.status === 'ongoing' ? '✅ Sedang bekerja' :
                                      '✔️ Selesai'}
                                </p>
                            ` : `
                                <p class="text-xs text-gray-500 dark:text-gray-400 italic">Libur hari ini</p>
                            `}
                        </div>
                        <button onclick="window.showEmployeeShiftDetail('${user.username}')" 
                            class="ml-4 px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition">
                            Detail
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function renderAttendanceView(month, storeFilter, users) {
    return `
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <h4 class="text-lg font-bold text-gray-900 dark:text-white mb-6">Laporan Kehadiran - ${month}</h4>
            
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-gray-200 dark:border-gray-700">
                            <th class="px-4 py-3 text-left font-bold text-gray-900 dark:text-white">Karyawan</th>
                            <th class="px-4 py-3 text-center font-bold text-green-600 dark:text-green-400">Hadir</th>
                            <th class="px-4 py-3 text-center font-bold text-yellow-600 dark:text-yellow-400">Terlambat</th>
                            <th class="px-4 py-3 text-center font-bold text-blue-600 dark:text-blue-400">Izin</th>
                            <th class="px-4 py-3 text-center font-bold text-purple-600 dark:text-purple-400">Sakit</th>
                            <th class="px-4 py-3 text-center font-bold text-red-600 dark:text-red-400">Alpa</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(await Promise.all(users.filter(u => u.role === 'cashier' && u.status === 'Aktif').map(async user => {
                            const stats = await shiftModule.getAttendanceStats(user.username, month);
                            return { user, stats };
                        }))).map(({ user, stats }) => `
                            <tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                                <td class="px-4 py-3 font-semibold text-gray-900 dark:text-white">${user.name}</td>
                                <td class="px-4 py-3 text-center text-green-600 dark:text-green-400 font-bold">${stats.hadir || 0}</td>
                                <td class="px-4 py-3 text-center text-yellow-600 dark:text-yellow-400 font-bold">${stats.terlambat || 0}</td>
                                <td class="px-4 py-3 text-center text-blue-600 dark:text-blue-400 font-bold">${stats.izin || 0}</td>
                                <td class="px-4 py-3 text-center text-purple-600 dark:text-purple-400 font-bold">${stats.sakit || 0}</td>
                                <td class="px-4 py-3 text-center text-red-600 dark:text-red-400 font-bold">${stats.alpa || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

export default { render };
