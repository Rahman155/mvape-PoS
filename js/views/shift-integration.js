// js/shift-integration.js
// Integrasi sistem shift ke aplikasi utama

import shiftModule from './shift.js';
import cashierShiftView from './cashier-shift.js';
import ownerShiftView from './owner-shifts.js';
import db from '../db.js';

// ==================== STATE MANAGEMENT ====================
const shiftState = {
  currentTab: 'today', // Untuk cashier shift view
  shiftView: 'list', // Untuk owner shift view
  filterStore: '',
  filterDate: '',
  filterMonth: '',
};

/**
 * ==================== SETUP DATABASE ====================
 */
export async function initializeShiftSystem() {
    console.log('Initializing Shift System...');
    
    try {
        // Pastikan database tables exist
        // Ini harus ditambahkan ke db.js Anda:
        // 
        // shifts: db.table('shifts') - Menyimpan semua shift
        // attendances: db.table('attendances') - Menyimpan records kehadiran
        // shiftSchedules: db.table('shiftSchedules') - Menyimpan jadwal mingguan/bulanan
        //
        // Contoh IndexedDB schema:
        // {
        //   shifts: '++id, userId, date, storeId',
        //   attendances: '++id, userId, date, shiftId',
        //   shiftSchedules: '++id, userId, startDate'
        // }
        
        await shiftModule.initializeShiftDatabase();
        console.log('✅ Shift system initialized successfully');
    } catch (err) {
        console.error('❌ Failed to initialize shift system:', err);
    }
}

/**
 * ==================== CASHIER FUNCTIONS ====================
 */

// Switch antara shift tabs
window.switchShiftTab = function(tab) {
    shiftState.currentTab = tab;
    // Re-render akan dilakukan oleh parent component
    if (window.currentUser && window.shiftContainer) {
        cashierShiftView.render(window.shiftContainer, window.currentUser);
    }
};

// Check-in shift
window.checkInShift = async function(shiftId) {
    try {
        const result = await shiftModule.checkInShift(shiftId);
        
        if (result.isLate) {
            alert(`⚠️ Anda terlambat!\n\nJam masuk: ${shiftModule.formatTime(result.checkInTime)}`);
        } else {
            alert(`✅ Check-in berhasil!\n\nJam masuk: ${shiftModule.formatTime(result.checkInTime)}`);
        }
        
        // Refresh UI
        if (window.currentUser && window.shiftContainer) {
            await cashierShiftView.render(window.shiftContainer, window.currentUser);
        }
    } catch (err) {
        alert(`❌ Gagal check-in: ${err.message}`);
        console.error(err);
    }
};

// Check-out shift
window.checkOutShift = async function(shiftId) {
    if (!confirm('Apakah Anda yakin ingin check-out?')) return;
    
    try {
        const result = await shiftModule.checkOutShift(shiftId);
        const duration = shiftModule.calculateShiftDuration(result.checkInTime, result.checkOutTime);
        
        alert(`✅ Check-out berhasil!\n\nDurasi: ${duration}`);
        
        // Refresh UI
        if (window.currentUser && window.shiftContainer) {
            await cashierShiftView.render(window.shiftContainer, window.currentUser);
        }
    } catch (err) {
        alert(`❌ Gagal check-out: ${err.message}`);
        console.error(err);
    }
};

/**
 * ==================== OWNER FUNCTIONS ====================
 */

// Switch shift view
window.switchShiftView = function(view) {
    shiftState.shiftView = view;
    // Re-render akan dilakukan oleh parent component
    if (window.ownerShiftContainer) {
        ownerShiftView.render(window.ownerShiftContainer);
    }
};

// Apply shift filters
window.applyShiftFilters = async function() {
    const storeSelect = document.getElementById('shift-filter-store');
    const dateInput = document.getElementById('shift-filter-date');
    const monthInput = document.getElementById('shift-filter-month');
    
    if (storeSelect) shiftState.filterStore = storeSelect.value;
    if (dateInput) shiftState.filterDate = dateInput.value;
    if (monthInput) shiftState.filterMonth = monthInput.value;
    
    // Re-render shift view
    if (window.ownerShiftContainer) {
        await ownerShiftView.render(window.ownerShiftContainer);
    }
};

// Show modal create shift
window.showCreateShiftModal = function() {
    const modal = document.getElementById('create-shift-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
};

// Close modal
window.closeShiftModal = function() {
    const modal = document.getElementById('create-shift-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
};

// Save new shift
window.saveNewShift = async function() {
    const employeeSelect = document.getElementById('shift-employee');
    const storeSelect = document.getElementById('shift-store');
    const dateInput = document.getElementById('shift-date');
    const shiftTypeRadios = document.getElementsByName('shift-type');
    const notesInput = document.getElementById('shift-notes');
    
    if (!employeeSelect.value || !dateInput.value) {
        alert('❌ Silakan isi Karyawan dan Tanggal terlebih dahulu');
        return;
    }
    
    const shiftType = Array.from(shiftTypeRadios).find(r => r.checked).value;
    const selectedUser = (await db.users.where('username').equals(employeeSelect.value).first());
    
    try {
        await shiftModule.createShift({
            userId: selectedUser.username,
            userName: selectedUser.name,
            storeId: storeSelect.value,
            date: dateInput.value,
            shiftType: shiftType,
            notes: notesInput.value,
        });
        
        alert('✅ Shift berhasil dibuat!');
        window.closeShiftModal();
        
        // Refresh view
        if (window.ownerShiftContainer) {
            await ownerShiftView.render(window.ownerShiftContainer);
        }
    } catch (err) {
        alert(`❌ Gagal membuat shift: ${err.message}`);
        console.error(err);
    }
};

// Show employee shift detail
window.showEmployeeShiftDetail = async function(username) {
    const shifts = await shiftModule.getUserShifts(username, 30);
    const stats = await shiftModule.getAttendanceStats(username);
    
    let detailHTML = `
        <div class="space-y-4">
            <h4 class="font-bold text-lg">Detail Shift - ${shifts[0]?.userName}</h4>
            
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded">
                    <p class="text-xs text-gray-500">Hadir</p>
                    <p class="text-2xl font-bold text-green-600">${stats.hadir || 0}</p>
                </div>
                <div class="p-3 bg-red-50 dark:bg-red-900/20 rounded">
                    <p class="text-xs text-gray-500">Alpa</p>
                    <p class="text-2xl font-bold text-red-600">${stats.alpa || 0}</p>
                </div>
            </div>
            
            <div class="max-h-64 overflow-y-auto">
                <h5 class="font-semibold mb-3">Riwayat Shift 30 Hari</h5>
                ${shifts.slice(0, 15).map(shift => `
                    <div class="flex items-center justify-between p-2 border-b text-sm">
                        <span>${new Date(shift.date).toLocaleDateString('id-ID', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <span class="font-semibold">${shiftModule.SHIFT_TYPES[shift.shiftType.toUpperCase()].label}</span>
                        <span class="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">${shift.status}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Show dalam modal atau sidebar
    alert(detailHTML);
};

/**
 * ==================== HELPER FUNCTIONS ====================
 */

// Get shift info untuk header/status bar
export async function getShiftStatus(userId) {
    const todayShift = await shiftModule.getTodayShift(userId);
    
    if (!todayShift) {
        return {
            hasShift: false,
            message: 'Tidak ada shift hari ini',
        };
    }
    
    const shiftInfo = shiftModule.SHIFT_TYPES[todayShift.shiftType.toUpperCase()];
    
    return {
        hasShift: true,
        shift: todayShift,
        shiftLabel: shiftInfo.label,
        shiftEmoji: todayShift.shiftType === 'pagi' ? '🌅' : 
                    todayShift.shiftType === 'siang' ? '☀️' : '🌙',
        status: todayShift.status,
        checkInTime: todayShift.checkInTime,
        checkOutTime: todayShift.checkOutTime,
    };
}

// Format shift info untuk display
export function formatShiftDisplay(shiftStatus) {
    if (!shiftStatus.hasShift) {
        return `📅 ${shiftStatus.message}`;
    }
    
    const { shift, shiftEmoji, shiftLabel, status, checkInTime } = shiftStatus;
    
    if (status === 'scheduled') {
        return `${shiftEmoji} ${shiftLabel} (Belum dimulai)`;
    } else if (status === 'ongoing') {
        return `${shiftEmoji} ${shiftLabel} • Check-in: ${shiftModule.formatTime(checkInTime)}`;
    } else {
        return `✅ ${shiftLabel} (Selesai)`;
    }
}

// Export state management untuk akses global
export function getShiftState() {
    return shiftState;
}

export function updateShiftState(updates) {
    Object.assign(shiftState, updates);
}

export default {
    initializeShiftSystem,
    getShiftStatus,
    formatShiftDisplay,
    getShiftState,
    updateShiftState,
};
