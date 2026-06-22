// js/views/cashier-shift.js
// Komponen shift tracking untuk halaman kasir

import shiftModule from './shift.js';
import shiftIntegration from './shift-integration.js';
import db from '../db.js';

async function render(container, currentUser) {
    const shiftState = shiftIntegration.getShiftState();
    const activeShiftTab = shiftState.currentTab || 'today';
    
    const todayShift = await shiftModule.getTodayShift(currentUser.username);
    const userShifts = await shiftModule.getUserShifts(currentUser.username, 30);
    const attendanceStats = await shiftModule.getAttendanceStats(currentUser.username);

    const now = new Date();
    const currentHour = now.getHours();
    const greeting = currentHour < 12 ? '🌅' : currentHour < 17 ? '☀️' : '🌙';

    container.innerHTML = `
        <div class="space-y-4">
            <!-- Header -->
            <div class="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <p class="text-sm opacity-90">${greeting} Selamat ${currentHour < 12 ? 'Pagi' : currentHour < 17 ? 'Siang' : 'Malam'}</p>
                        <h3 class="text-2xl font-bold mt-1">${currentUser.name}</h3>
                    </div>
                    <div class="text-right">
                        <p class="text-xs opacity-75">Toko: <span class="font-semibold">${currentUser.storeBranch || 'Toko 1'}</span></p>
                    </div>
                </div>

                <!-- Status Shift Hari Ini -->
                ${todayShift ? `
                    <div class="bg-white/20 rounded-xl p-4 backdrop-blur-sm">
                        <div class="flex items-center justify-between mb-3">
                            <div>
                                <p class="text-xs opacity-75 mb-1">Shift Hari Ini</p>
                                <p class="text-lg font-bold">${shiftModule.SHIFT_TYPES[todayShift.shiftType.toUpperCase()]?.label || 'N/A'}</p>
                            </div>
                            <div class="text-right">
                                <span class="inline-block px-3 py-1 rounded-lg text-xs font-semibold ${
                                    todayShift.status === 'scheduled' ? 'bg-yellow-200 text-yellow-800' :
                                    todayShift.status === 'ongoing' ? 'bg-green-200 text-green-800' :
                                    'bg-gray-200 text-gray-800'
                                }">
                                    ${todayShift.status === 'scheduled' ? '⏳ Belum Dimulai' : 
                                      todayShift.status === 'ongoing' ? '✅ Sedang Bekerja' : 
                                      '✔️ Selesai'}
                                </span>
                            </div>
                        </div>

                        <div class="grid grid-cols-3 gap-3 text-xs">
                            <div class="bg-white/10 rounded-lg p-2">
                                <p class="opacity-75 mb-1">Jam Masuk</p>
                                <p class="font-semibold">${todayShift.checkInTime ? shiftModule.formatTime(todayShift.checkInTime) : '—'}</p>
                            </div>
                            <div class="bg-white/10 rounded-lg p-2">
                                <p class="opacity-75 mb-1">Jam Keluar</p>
                                <p class="font-semibold">${todayShift.checkOutTime ? shiftModule.formatTime(todayShift.checkOutTime) : '—'}</p>
                            </div>
                            <div class="bg-white/10 rounded-lg p-2">
                                <p class="opacity-75 mb-1">Durasi</p>
                                <p class="font-semibold">${shiftModule.calculateShiftDuration(todayShift.checkInTime, todayShift.checkOutTime)}</p>
                            </div>
                        </div>

                        <!-- Tombol Check-in/Check-out -->
                        <div class="flex gap-2 mt-4">
                            ${todayShift.status === 'scheduled' ? `
                                <button onclick="window.checkInShift('${todayShift.id}')" class="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition">
                                    ✅ Check-in Sekarang
                                </button>
                            ` : todayShift.status === 'ongoing' ? `
                                <button onclick="window.checkOutShift('${todayShift.id}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition">
                                    🚪 Check-out Sekarang
                                </button>
                            ` : ''}
                        </div>
                    </div>
                ` : `
                    <div class="bg-white/20 rounded-xl p-4 backdrop-blur-sm">
                        <p class="text-sm opacity-90">Tidak ada shift untuk hari ini. Hubungi manager Anda untuk jadwal bekerja.</p>
                    </div>
                `}
            </div>

            <!-- Tab Navigation -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-1 flex gap-1">
                <button onclick="window.switchShiftTab('today')" 
                    class="flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition ${activeShiftTab === 'today' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}">
                    📅 Hari Ini
                </button>
                <button onclick="window.switchShiftTab('schedule')" 
                    class="flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition ${activeShiftTab === 'schedule' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}">
                    🗓️ Jadwal
                </button>
                <button onclick="window.switchShiftTab('history')" 
                    class="flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition ${activeShiftTab === 'history' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}">
                    📊 Riwayat
                </button>
            </div>

            <!-- Tab Content -->
            <div id="shift-tab-content">
                ${activeShiftTab === 'today' ? renderTodayTab(todayShift) :
                  activeShiftTab === 'schedule' ? renderScheduleTab(userShifts) :
                  renderHistoryTab(userShifts, attendanceStats)}
            </div>
        </div>
    `;
}

function renderTodayTab(shift) {
    if (!shift) {
        return `
            <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center">
                <svg class="w-12 h-12 mx-auto text-amber-600 mb-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <p class="text-gray-700 dark:text-gray-300 font-semibold mb-2">Tidak ada shift untuk hari ini</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">Hubungi manager untuk mengecek jadwal Anda</p>
            </div>
        `;
    }

    return `
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
            <h4 class="font-bold text-lg mb-4">Detail Shift Hari Ini</h4>
            
            <div class="space-y-4">
                <!-- Tipe Shift -->
                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Jenis Shift</p>
                        <p class="font-bold text-lg">${shiftModule.SHIFT_TYPES[shift.shiftType.toUpperCase()]?.label}</p>
                    </div>
                    <div class="text-3xl">${
                        shift.shiftType === 'pagi' ? '🌅' :
                        shift.shiftType === 'siang' ? '☀️' :
                        '🌙'
                    }</div>
                </div>

                <!-- Waktu Kerja -->
                <div>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-3 font-semibold">JADWAL KERJA</p>
                    <div class="space-y-2">
                        <div class="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <span class="text-sm font-semibold text-blue-700 dark:text-blue-300">Jam Masuk:</span>
                            <span class="font-bold text-blue-900 dark:text-blue-100">${shiftModule.SHIFT_TYPES[shift.shiftType.toUpperCase()]?.start}</span>
                        </div>
                        <div class="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                            <span class="text-sm font-semibold text-purple-700 dark:text-purple-300">Jam Keluar:</span>
                            <span class="font-bold text-purple-900 dark:text-purple-100">${shiftModule.SHIFT_TYPES[shift.shiftType.toUpperCase()]?.end}</span>
                        </div>
                    </div>
                </div>

                <!-- Status Kehadiran -->
                ${shift.checkInTime ? `
                    <div class="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <p class="text-xs text-green-600 dark:text-green-400 font-semibold mb-2">✅ SUDAH CHECK-IN</p>
                        <p class="text-sm text-green-700 dark:text-green-300">Jam masuk: <span class="font-bold">${shiftModule.formatTime(shift.checkInTime)}</span></p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function renderScheduleTab(shifts) {
    const upcomingShifts = shifts.slice(0, 14); // 2 minggu ke depan

    return `
        <div class="space-y-3">
            <h4 class="font-bold text-lg px-1">Jadwal 2 Minggu Ke Depan</h4>
            ${upcomingShifts.length > 0 ? `
                ${upcomingShifts.map(shift => `
                    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 hover:shadow-md transition">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">${new Date(shift.date + 'T00:00').toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                <p class="font-bold text-lg">${shiftModule.SHIFT_TYPES[shift.shiftType.toUpperCase()]?.label}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Waktu</p>
                                <p class="font-semibold">${shiftModule.SHIFT_TYPES[shift.shiftType.toUpperCase()]?.start} - ${shiftModule.SHIFT_TYPES[shift.shiftType.toUpperCase()]?.end}</p>
                            </div>
                        </div>
                    </div>
                `).join('')}
            ` : `
                <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 text-center">
                    <p class="text-gray-500 dark:text-gray-400">Tidak ada jadwal shift untuk periode ini</p>
                </div>
            `}
        </div>
    `;
}

function renderHistoryTab(shifts, stats) {
    const historyShifts = shifts.slice(0, 30).filter(s => s.status === 'completed');

    return `
        <div class="space-y-4">
            <!-- Statistik Kehadiran -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
                <h4 class="font-bold text-lg mb-4">Statistik Kehadiran (30 Hari Terakhir)</h4>
                <div class="grid grid-cols-3 gap-3">
                    <div class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <p class="text-2xl font-bold text-green-600 dark:text-green-400">${stats.hadir || 0}</p>
                        <p class="text-xs text-green-700 dark:text-green-300 mt-1">Hadir</p>
                    </div>
                    <div class="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                        <p class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">${stats.terlambat || 0}</p>
                        <p class="text-xs text-yellow-700 dark:text-yellow-300 mt-1">Terlambat</p>
                    </div>
                    <div class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                        <p class="text-2xl font-bold text-red-600 dark:text-red-400">${stats.alpa || 0}</p>
                        <p class="text-xs text-red-700 dark:text-red-300 mt-1">Alpa</p>
                    </div>
                </div>
            </div>

            <!-- Riwayat Shift -->
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
                <h4 class="font-bold text-lg mb-4">Riwayat Shift</h4>
                ${historyShifts.length > 0 ? `
                    <div class="space-y-2">
                        ${historyShifts.map(shift => `
                            <div class="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition">
                                <div>
                                    <p class="text-sm font-semibold text-gray-900 dark:text-white">${shiftModule.SHIFT_TYPES[shift.shiftType.toUpperCase()]?.label}</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">${new Date(shift.date).toLocaleDateString('id-ID')}</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Durasi</p>
                                    <p class="text-sm font-semibold text-gray-900 dark:text-white">${shiftModule.calculateShiftDuration(shift.checkInTime, shift.checkOutTime)}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center">
                        <p class="text-gray-500 dark:text-gray-400">Belum ada riwayat shift</p>
                    </div>
                `}
            </div>
        </div>
    `;
}

export default { render };
