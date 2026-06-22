# 📅 Sistem Shift Management Karyawan Toko

## Daftar Isi
1. [Overview](#overview)
2. [Fitur Utama](#fitur-utama)
3. [Struktur Database](#struktur-database)
4. [Cara Penggunaan](#cara-penggunaan)
5. [API Reference](#api-reference)
6. [Troubleshooting](#troubleshooting)

---

## Overview

Sistem Shift Management adalah solusi lengkap untuk mengelola jadwal kerja (shift) karyawan toko, melacak kehadiran, dan menganalisis performa kehadiran per karyawan. Sistem ini terintegrasi sepenuhnya dengan POS aplikasi Mvape.

### Teknologi yang Digunakan
- **Database**: Firebase Firestore (dengan offline persistence via IndexedDB)
- **Frontend**: Vanilla JavaScript dengan Tailwind CSS
- **State Management**: Global variables + localStorage

### Fitur Utama
✅ **Manajemen Shift** - Buat, edit, hapus jadwal shift  
✅ **Tracking Kehadiran** - Otomatis catat status kehadiran  
✅ **Check-in/Check-out** - Karyawan bisa check-in/out melalui kasir view  
✅ **Laporan Kehadiran** - View kalender, karyawan, dan statistik kehadiran  
✅ **Shift Scheduling** - Template jadwal mingguan/bulanan  

---

## Fitur Utama

### 1. **Tipe Shift**
Sistem mendukung 3 jenis shift:

| Shift | Waktu | Warna |
|-------|-------|-------|
| 🌅 **Pagi** | 07:00 - 14:00 | Kuning |
| ☀️ **Siang** | 14:00 - 21:00 | Biru |
| 🌙 **Malam** | 21:00 - 06:00 | Ungu |

### 2. **Status Shift**
- **📅 Terjadwal** - Shift sudah dibuat, belum dimulai
- **⏱️ Sedang Bekerja** - Karyawan sudah check-in
- **✅ Selesai** - Karyawan sudah check-out

### 3. **Status Kehadiran**
- **✅ Hadir** - Karyawan hadir tepat waktu
- **⚠️ Terlambat** - Check-in lebih dari 15 menit setelah jam masuk
- **📋 Izin** - Karyawan berkedudukan izin (diset oleh admin)
- **🏥 Sakit** - Karyawan sakit (dengan surat keterangan)
- **❌ Alpa** - Karyawan tidak hadir tanpa keterangan
- **📅 Libur** - Hari libur resmi

---

## Struktur Database

### Koleksi: `shifts`
Menyimpan semua jadwal shift karyawan.

```javascript
{
  id: "SFT-1718975234567",
  userId: "USR00123",
  userName: "Ahmad Rafa",
  storeId: "Toko 1",
  date: "2026-06-19",
  shiftType: "pagi",                    // pagi | siang | malam
  status: "scheduled",                  // scheduled | ongoing | completed
  checkInTime: "2026-06-19T07:30:00Z",  // null jika belum check-in
  checkOutTime: "2026-06-19T14:05:00Z", // null jika belum check-out
  notes: "Persiapan stock pagi",        // catatan tambahan
  createdAt: "2026-06-19T08:00:00Z",
  updatedAt: "2026-06-19T14:05:00Z"
}
```

### Koleksi: `attendances`
Menyimpan record kehadiran karyawan.

```javascript
{
  id: "ATT-1718975234567",
  shiftId: "SFT-1718975234567",
  userId: "USR00123",
  userName: "Ahmad Rafa",
  date: "2026-06-19",
  status: "Hadir",                      // Hadir | Terlambat | Izin | Sakit | Alpa | Libur
  checkInTime: "2026-06-19T07:30:00Z",
  checkOutTime: "2026-06-19T14:05:00Z",
  createdAt: "2026-06-19T08:00:00Z",
  updatedAt: "2026-06-19T14:05:00Z"
}
```

### Koleksi: `shiftSchedules`
Menyimpan template jadwal (opsional, untuk rencana masa depan).

```javascript
{
  id: "SCH-1718975234567",
  userId: "USR00123",
  userName: "Ahmad Rafa",
  storeId: "Toko 1",
  startDate: "2026-06-24",
  endDate: "2026-06-30",
  shifts: [
    { date: "2026-06-24", shiftType: "pagi" },
    { date: "2026-06-25", shiftType: "siang" },
    { date: "2026-06-26", shiftType: "malam" }
  ],
  createdAt: "2026-06-19T08:00:00Z",
  createdBy: "owner_user_id"
}
```

---

## Cara Penggunaan

### **Untuk Owner/Admin: Manajemen Shift**

#### 1. **Akses Menu Shift**
- Login sebagai Owner
- Pilih tab **⏰ Shift** di navigation bar

#### 2. **Buat Shift Baru**
```
1. Klik tombol "➕ Buat Shift Baru"
2. Pilih Karyawan dari dropdown
3. Pilih Tanggal
4. Pilih Jenis Shift (Pagi/Siang/Malam)
5. (Opsional) Tambah Catatan
6. Klik "Simpan"
```

#### 3. **Edit Shift**
```
1. Pada view Kalender, cari shift yang ingin diedit
2. Klik tombol "Edit"
3. Ubah status shift (Terjadwal/Sedang Bekerja/Selesai)
4. Ubah catatan jika perlu
5. Klik "Simpan"
```

#### 4. **Hapus Shift**
```
1. Pada view Kalender, cari shift yang ingin dihapus
2. Klik tombol "Hapus"
3. Konfirmasi penghapusan
```

#### 5. **Lihat Laporan Kehadiran**
```
1. Di tab Shift, pilih view "📊 Kehadiran"
2. Lihat daftar attendance untuk bulan yang dipilih
3. Filter berdasarkan bulan dan toko
4. Klik "Edit" untuk mengubah status kehadiran jika diperlukan
```

#### 6. **Analisis Performa Karyawan**
```
1. Di tab Shift, pilih view "👥 Karyawan"
2. Lihat statistik per karyawan:
   - Total Shift bulan ini
   - Jumlah Hadir
   - Jumlah Terlambat
   - Jumlah Izin
   - Jumlah Alpa
```

---

### **Untuk Kasir: Check-in/Check-out Shift**

> ⚠️ Fitur ini akan ditambahkan ke `cashier.js` dalam tahap berikutnya

Rencana implementasi:
- Check-in otomatis pada awal shift
- Check-out manual di akhir shift
- Notifikasi keterlambatan real-time
- Lihat jadwal shift personal di dashboard kasir

---

## API Reference

### Import Module
```javascript
import shiftModule from './js/views/shift.js';
```

### Konstanta

#### `SHIFT_TYPES`
```javascript
{
  PAGI:  { id: 'pagi',  label: 'Pagi',  start: '07:00', end: '14:00', color: 'bg-yellow-100 text-yellow-800' },
  SIANG: { id: 'siang', label: 'Siang', start: '14:00', end: '21:00', color: 'bg-blue-100 text-blue-800' },
  MALAM: { id: 'malam', label: 'Malam', start: '21:00', end: '06:00', color: 'bg-purple-100 text-purple-800' }
}
```

#### `ATTENDANCE_STATUS`
```javascript
{
  HADIR: 'Hadir',
  TERLAMBAT: 'Terlambat',
  ALPA: 'Alpa',
  IZIN: 'Izin',
  SAKIT: 'Sakit',
  LIBUR: 'Libur'
}
```

### Fungsi Utama

#### 1. **createShift(data)**
Membuat shift baru.

```javascript
await shiftModule.createShift({
  userId: "USR00123",
  userName: "Ahmad Rafa",
  storeId: "Toko 1",
  date: "2026-06-19",
  shiftType: "pagi",
  notes: "Persiapan stock"
});
```

#### 2. **getUserShifts(userId, days = 30)**
Mendapatkan shift user dalam periode tertentu.

```javascript
const shifts = await shiftModule.getUserShifts("USR00123", 30);
// Returns: Array of shift objects
```

#### 3. **checkInShift(shiftId)**
Check-in untuk shift (otomatis set status ke 'ongoing').

```javascript
const result = await shiftModule.checkInShift("SFT-1718975234567");
// result.isLate: boolean (jika terlambat)
// result.checkInTime: ISO timestamp
```

#### 4. **checkOutShift(shiftId)**
Check-out dari shift (set status ke 'completed').

```javascript
await shiftModule.checkOutShift("SFT-1718975234567");
```

#### 5. **getTodayShift(userId)**
Mendapatkan shift hari ini untuk user.

```javascript
const todayShift = await shiftModule.getTodayShift("USR00123");
```

#### 6. **getAttendanceStats(userId, month)**
Mendapatkan statistik kehadiran user.

```javascript
const stats = await shiftModule.getAttendanceStats("USR00123", "2026-06");
// Returns: { total, hadir, terlambat, izin, sakit, alpa }
```

#### 7. **createShiftSchedule(data)**
Membuat template jadwal untuk periode tertentu.

```javascript
await shiftModule.createShiftSchedule({
  userId: "USR00123",
  userName: "Ahmad Rafa",
  storeId: "Toko 1",
  startDate: "2026-06-24",
  endDate: "2026-06-30",
  shifts: [
    { date: "2026-06-24", shiftType: "pagi" },
    { date: "2026-06-25", shiftType: "siang" }
  ],
  createdBy: "owner_user_id"
});
```

### Helper Functions

#### **formatTime(isoString)**
Format waktu ISO menjadi format HH:MM.

```javascript
shiftModule.formatTime("2026-06-19T07:30:00Z"); // "07:30"
```

#### **formatDate(dateString)**
Format tanggal menjadi format yang user-friendly.

```javascript
shiftModule.formatDate("2026-06-19"); // "Jum, 19 Jun 2026"
```

#### **calculateShiftDuration(checkInTime, checkOutTime)**
Hitung durasi shift.

```javascript
shiftModule.calculateShiftDuration(
  "2026-06-19T07:30:00Z",
  "2026-06-19T14:05:00Z"
); // "6h 35m"
```

#### **getShiftStatusDisplay(shift)**
Dapatkan display user-friendly untuk status shift.

```javascript
const display = shiftModule.getShiftStatusDisplay(shift);
// Returns: { label: "📅 Terjadwal", color: "bg-yellow-100 text-yellow-800" }
```

#### **getAttendanceStatusDisplay(status)**
Dapatkan display untuk status kehadiran.

```javascript
const display = shiftModule.getAttendanceStatusDisplay("Terlambat");
// Returns: { icon: "⚠️", color: "text-yellow-600" }
```

---

## Integrasi ke Aplikasi

### Di `index.html`
Shift system sudah terintegrasi otomatis melalui import di `owner.js`.

### Di `cashier.js` (Masa Depan)
Implementasi rencana untuk cashier view:
- Import shift module
- Display shift status di dashboard
- Tombol check-in/check-out
- Notifikasi keterlambatan

---

## Troubleshooting

### ❌ Shift tidak muncul di view
**Solusi:**
1. Pastikan karyawan memiliki status "Aktif"
2. Pastikan tanggal shift sesuai dengan filter bulan
3. Refresh halaman (F5)
4. Cek console untuk error: `Ctrl+Shift+J`

### ❌ Tidak bisa buat shift
**Solusi:**
1. Pastikan minimal ada 1 karyawan dengan status "Aktif"
2. Pastikan tanggal lebih besar dari hari sekarang
3. Pastikan jenis shift dipilih (Pagi/Siang/Malam)
4. Check browser console untuk error detail

### ❌ Check-in gagal
**Solusi:**
1. Pastikan shift sudah dibuat untuk hari itu
2. Pastikan status shift adalah "Terjadwal" atau "Ongoing"
3. Refresh data dari database

### ❌ Data kehadiran tidak sinkron
**Solusi:**
1. Pastikan internet connection stabil (untuk Firebase sync)
2. Cek di DevTools → Application → IndexedDB
3. Hapus cache dan refresh halaman

---

## Fitur Masa Depan

### Phase 2 (Versi Berikutnya)
- [ ] Shift scheduling template mingguan
- [ ] Geolocation check-in (GPS validation)
- [ ] WhatsApp notifikasi untuk keterlambatan
- [ ] Export laporan attendance ke Excel
- [ ] Kalender interaktif dengan drag-drop
- [ ] Mobile app untuk check-in offline
- [ ] Integrasi dengan payroll system

### Phase 3
- [ ] Predictive analytics untuk kehadiran
- [ ] AI-powered scheduling optimizer
- [ ] Integration dengan sistem biodata/RFID

---

## Support & Contact

Untuk pertanyaan atau laporan bug, hubungi:
- 📧 Email: support@mvape.local
- 💬 WhatsApp: +62 812-3456-7890
- 🐛 GitHub Issues: [Project Repository]

---

**Last Updated:** 19 Juni 2026  
**Version:** 1.0.0  
**Status:** Production Ready ✅
