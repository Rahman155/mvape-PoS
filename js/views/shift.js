// js/shift.js
// Sistem manajemen shift dan kehadiran karyawan

import db from '../db.js';

// Tipe shift yang tersedia
export const SHIFT_TYPES = {
    PAGI: { id: 'pagi', label: 'Pagi', start: '07:00', end: '14:00', color: 'bg-yellow-100 text-yellow-800' },
    SIANG: { id: 'siang', label: 'Siang', start: '14:00', end: '21:00', color: 'bg-blue-100 text-blue-800' },
    MALAM: { id: 'malam', label: 'Malam', start: '21:00', end: '06:00', color: 'bg-purple-100 text-purple-800' },
};

// Status kehadiran
export const ATTENDANCE_STATUS = {
    HADIR: 'Hadir',
    TERLAMBAT: 'Terlambat',
    ALPA: 'Alpa',
    IZIN: 'Izin',
    SAKIT: 'Sakit',
    LIBUR: 'Libur',
};

/**
 * Inisialisasi database collections untuk shift system
 * Panggil ini saat aplikasi pertama kali setup
 */
export async function initializeShiftDatabase() {
    try {
        // Buat tabel jika belum ada
        if (!db.shifts) {
            db.shifts = db.table('shifts');
        }
        if (!db.attendances) {
            db.attendances = db.table('attendances');
        }
        if (!db.shiftSchedules) {
            db.shiftSchedules = db.table('shiftSchedules');
        }
        console.log('✅ Shift database initialized successfully');
        return true;
    } catch (err) {
        console.error('❌ Error initializing shift database:', err);
        return false;
    }
}

/**
 * Buat shift baru untuk karyawan
 */
export async function createShift(data) {
    try {
        if (!data.userId || !data.date || !data.shiftType) {
            throw new Error('Kolom userId, date, dan shiftType harus diisi');
        }

        const shift = {
            id: Date.now().toString(),
            userId: data.userId,
            userName: data.userName,
            storeId: data.storeId,
            date: data.date, // YYYY-MM-DD
            shiftType: data.shiftType, // 'pagi', 'siang', 'malam'
            status: 'scheduled', // 'scheduled', 'ongoing', 'completed'
            checkInTime: null,
            checkOutTime: null,
            notes: data.notes || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        if (db.shifts) {
            const id = await db.shifts.add(shift);
            shift.id = id;
        }
        return shift;
    } catch (err) {
        console.error('❌ Error creating shift:', err);
        throw err;
    }
}

/**
 * Get semua shift untuk user tertentu
 */
export async function getUserShifts(userId, days = 30) {
    try {
        if (!db.shifts) return [];
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startStr = startDate.toISOString().split('T')[0];

        const shifts = await db.shifts
            .where('userId').equals(userId)
            .toArray();
        
        return shifts.filter(s => s.date >= startStr).sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (err) {
        console.error('❌ Error getting user shifts:', err);
        return [];
    }
}

/**
 * Get semua shift dalam periode (untuk owner/admin view)
 */
export async function getShiftsByDateRange(startDate, endDate, storeId = null) {
    try {
        if (!db.shifts) return [];
        
        const shifts = await db.shifts.toArray();
        return shifts.filter(s => {
            const match = s.date >= startDate && s.date <= endDate;
            return storeId ? match && s.storeId === storeId : match;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (err) {
        console.error('❌ Error getting shifts by date range:', err);
        return [];
    }
}

/**
 * Check-in untuk shift
 */
export async function checkInShift(shiftId) {
    try {
        if (!db.shifts) return null;
        
        const shift = await db.shifts.get(shiftId);
        if (!shift) throw new Error('Shift tidak ditemukan');

        const now = new Date();
        const checkInTime = now.toISOString();
        
        // Cek keterlambatan (dengan toleransi 15 menit)
        const shiftStart = SHIFT_TYPES[shift.shiftType.toUpperCase()]?.start;
        if (!shiftStart) throw new Error('Tipe shift tidak valid');

        const [startHour, startMin] = shiftStart.split(':').map(Number);
        const shiftStartTime = new Date(shift.date + 'T' + shiftStart);
        const toleranceTime = new Date(shiftStartTime.getTime() + 15 * 60000);
        const isLate = now > toleranceTime;

        await db.shifts.update(shiftId, {
            status: 'ongoing',
            checkInTime: checkInTime,
            updatedAt: new Date().toISOString(),
        });

        // Catat kehadiran
        if (db.attendances) {
            await db.attendances.add({
                id: Date.now().toString(),
                shiftId: shiftId,
                userId: shift.userId,
                userName: shift.userName,
                date: shift.date,
                status: isLate ? ATTENDANCE_STATUS.TERLAMBAT : ATTENDANCE_STATUS.HADIR,
                checkInTime: checkInTime,
                checkOutTime: null,
                createdAt: new Date().toISOString(),
            });
        }

        return { ...shift, status: 'ongoing', checkInTime, isLate };
    } catch (err) {
        console.error('❌ Error checking in shift:', err);
        throw err;
    }
}

/**
 * Check-out dari shift
 */
export async function checkOutShift(shiftId) {
    try {
        if (!db.shifts) return null;
        
        const shift = await db.shifts.get(shiftId);
        if (!shift) throw new Error('Shift tidak ditemukan');

        const checkOutTime = new Date().toISOString();

        await db.shifts.update(shiftId, {
            status: 'completed',
            checkOutTime: checkOutTime,
            updatedAt: new Date().toISOString(),
        });

        // Update attendance record
        if (db.attendances) {
            const attendances = await db.attendances.where('shiftId').equals(shiftId).toArray();
            if (attendances.length > 0) {
                const attendance = attendances[0];
                await db.attendances.update(attendance.id, {
                    checkOutTime: checkOutTime,
                });
            }
        }

        return { ...shift, status: 'completed', checkOutTime };
    } catch (err) {
        console.error('❌ Error checking out shift:', err);
        throw err;
    }
}

/**
 * Get shift hari ini untuk user
 */
export async function getTodayShift(userId) {
    try {
        if (!db.shifts) return null;
        
        const today = new Date().toISOString().split('T')[0];
        const shifts = await db.shifts.where('userId').equals(userId).toArray();
        return shifts.find(s => s.date === today) || null;
    } catch (err) {
        console.error('❌ Error getting today shift:', err);
        return null;
    }
}

/**
 * Get statistik kehadiran user
 */
export async function getAttendanceStats(userId, month = null) {
    try {
        if (!db.attendances) return {};
        
        let attendances = await db.attendances.where('userId').equals(userId).toArray();
        
        if (month) {
            // Filter by month (YYYY-MM)
            attendances = attendances.filter(a => a.date.startsWith(month));
        }

        const stats = {
            total: attendances.length,
            hadir: 0,
            terlambat: 0,
            izin: 0,
            sakit: 0,
            alpa: 0,
        };

        attendances.forEach(a => {
            const key = a.status.toLowerCase();
            if (key in stats) stats[key]++;
        });

        return stats;
    } catch (err) {
        console.error('❌ Error getting attendance stats:', err);
        return {};
    }
}

/**
 * Create shift schedule (jadwal shift mingguan/bulanan)
 */
export async function createShiftSchedule(data) {
    try {
        if (!data.userId || !data.startDate || !data.endDate || !data.shifts) {
            throw new Error('Kolom userId, startDate, endDate, dan shifts harus diisi');
        }

        const schedule = {
            id: Date.now().toString(),
            userId: data.userId,
            userName: data.userName,
            storeId: data.storeId,
            startDate: data.startDate, // YYYY-MM-DD
            endDate: data.endDate, // YYYY-MM-DD
            shifts: data.shifts, // Array of { date: 'YYYY-MM-DD', shiftType: 'pagi|siang|malam' }
            createdAt: new Date().toISOString(),
            createdBy: data.createdBy,
        };

        if (db.shiftSchedules) {
            const id = await db.shiftSchedules.add(schedule);
            schedule.id = id;
            
            // Otomatis buat shift dari schedule
            for (const shift of data.shifts) {
                await createShift({
                    userId: data.userId,
                    userName: data.userName,
                    storeId: data.storeId,
                    date: shift.date,
                    shiftType: shift.shiftType,
                });
            }
        }
        
        return schedule;
    } catch (err) {
        console.error('❌ Error creating shift schedule:', err);
        throw err;
    }
}

/**
 * Format waktu untuk tampilan
 */
export function formatTime(isoString) {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch (err) {
        console.error('❌ Error formatting time:', err);
        return '-';
    }
}

/**
 * Hitung durasi shift
 */
export function calculateShiftDuration(checkInTime, checkOutTime) {
    if (!checkInTime || !checkOutTime) return '-';
    
    try {
        const start = new Date(checkInTime);
        const end = new Date(checkOutTime);
        const diffMs = end - start;
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        
        return `${hours}h ${minutes}m`;
    } catch (err) {
        console.error('❌ Error calculating shift duration:', err);
        return '-';
    }
}

/**
 * Format tanggal untuk tampilan
 */
export function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    } catch (err) {
        console.error('❌ Error formatting date:', err);
        return '-';
    }
}

/**
 * Get status shift dalam format yang user-friendly
 */
export function getShiftStatusDisplay(shift) {
    if (!shift) return { label: 'Tidak Ada', color: 'bg-gray-100 text-gray-800' };
    
    if (shift.status === 'scheduled') {
        return { label: '📅 Terjadwal', color: 'bg-yellow-100 text-yellow-800' };
    } else if (shift.status === 'ongoing') {
        return { label: '⏱️ Sedang Bekerja', color: 'bg-green-100 text-green-800' };
    } else if (shift.status === 'completed') {
        return { label: '✅ Selesai', color: 'bg-blue-100 text-blue-800' };
    }
    return { label: 'Tidak Diketahui', color: 'bg-gray-100 text-gray-800' };
}

/**
 * Get status kehadiran dengan display yang bagus
 */
export function getAttendanceStatusDisplay(status) {
    const displays = {
        'Hadir': { icon: '✅', color: 'text-green-600' },
        'Terlambat': { icon: '⚠️', color: 'text-yellow-600' },
        'Izin': { icon: '📋', color: 'text-blue-600' },
        'Sakit': { icon: '🏥', color: 'text-red-600' },
        'Alpa': { icon: '❌', color: 'text-red-700' },
        'Libur': { icon: '📅', color: 'text-gray-600' },
    };
    return displays[status] || { icon: '❓', color: 'text-gray-400' };
}

/**
 * Dapatkan semua kehadiran dalam periode
 */
export async function getAttendancesByDateRange(startDate, endDate, userId = null) {
    try {
        if (!db.attendances) return [];
        
        const attendances = await db.attendances.toArray();
        return attendances.filter(a => {
            const match = a.date >= startDate && a.date <= endDate;
            return userId ? match && a.userId === userId : match;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (err) {
        console.error('❌ Error getting attendances by date range:', err);
        return [];
    }
}

/**
 * Update status kehadiran manually (untuk admin)
 */
export async function updateAttendanceStatus(attendanceId, newStatus) {
    try {
        if (!db.attendances) return null;
        
        // Validasi status
        const validStatuses = Object.values(ATTENDANCE_STATUS);
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Status kehadiran tidak valid: ${newStatus}`);
        }

        await db.attendances.update(attendanceId, {
            status: newStatus,
            updatedAt: new Date().toISOString(),
        });
        
        return await db.attendances.get(attendanceId);
    } catch (err) {
        console.error('❌ Error updating attendance:', err);
        throw err;
    }
}

/**
 * Hapus shift
 */
export async function deleteShift(shiftId) {
    try {
        if (!db.shifts) return;
        
        // Hapus shift
        await db.shifts.delete(shiftId);
        
        // Hapus attendance records yang terkait
        if (db.attendances) {
            const attendances = await db.attendances.where('shiftId').equals(shiftId).toArray();
            for (const att of attendances) {
                await db.attendances.delete(att.id);
            }
        }
    } catch (err) {
        console.error('❌ Error deleting shift:', err);
        throw err;
    }
}

export default {
    SHIFT_TYPES,
    ATTENDANCE_STATUS,
    initializeShiftDatabase,
    createShift,
    getUserShifts,
    getShiftsByDateRange,
    checkInShift,
    checkOutShift,
    getTodayShift,
    getAttendanceStats,
    createShiftSchedule,
    formatTime,
    calculateShiftDuration,
    formatDate,
    getShiftStatusDisplay,
    getAttendanceStatusDisplay,
    getAttendancesByDateRange,
    updateAttendanceStatus,
    deleteShift,
};
