// js/db.js — Firebase Firestore Adapter
// Menggantikan Dexie/IndexedDB dengan Firebase Firestore sebagai penyimpanan online.
// API publik tetap sama (db.products.toArray(), db.transactions.add(), dll.)
// sehingga cashier.js, owner.js, dan superadmin.js tidak perlu diubah.

// ─── 1. KONFIGURASI FIREBASE ────────────────────────────────────────────────
// Ganti nilai di bawah ini dengan konfigurasi project Firebase Anda.
// Cara mendapatkannya: https://console.firebase.google.com → Project Settings → Your apps → Web app
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDrbaCam3zpIPUub0CwkKaJB-yD__LN5HU",
  authDomain: "mvapeshop-3fd10.firebaseapp.com",
  projectId: "mvapeshop-3fd10",
  storageBucket: "mvapeshop-3fd10.firebasestorage.app",
  messagingSenderId: "840355346325",
  appId: "1:840355346325:web:28891a932975cf47e7a89c",
  measurementId: "G-BQJZ61RJXJ"
};

// ─── 2. INISIALISASI FIREBASE ────────────────────────────────────────────────
import { initializeApp }                              from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection, doc,
  getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit,
  serverTimestamp, writeBatch,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app      = initializeApp(FIREBASE_CONFIG);
const firestore = getFirestore(app);

// Aktifkan cache offline agar aplikasi tetap bisa dipakai saat internet mati
enableIndexedDbPersistence(firestore).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('[DB] Offline persistence gagal: beberapa tab terbuka.');
  } else if (err.code === 'unimplemented') {
    console.warn('[DB] Browser tidak mendukung offline persistence.');
  }
});

// ─── 3. HELPER INTERNAL ─────────────────────────────────────────────────────

/** Mengambil semua dokumen dari koleksi sebagai array objek + field 'id' */
async function _getAll(collectionName) {
  try {
    const snap = await getDocs(collection(firestore, collectionName));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(`[DB] Error getting all from ${collectionName}:`, err);
    return [];
  }
}

/** Mengambil satu dokumen berdasarkan ID */
async function _getById(collectionName, id) {
  try {
    const snap = await getDoc(doc(firestore, collectionName, String(id)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : undefined;
  } catch (err) {
    console.error(`[DB] Error getting ${id} from ${collectionName}:`, err);
    return undefined;
  }
}

/** Menambah dokumen dengan ID eksplisit. Jika id tidak ada, buat auto-id. */
async function _add(collectionName, data) {
  try {
    const { id, ...rest } = data;
    if (id !== undefined) {
      await setDoc(doc(firestore, collectionName, String(id)), rest);
      return String(id);
    } else {
      const ref = await addDoc(collection(firestore, collectionName), rest);
      return ref.id;
    }
  } catch (err) {
    console.error(`[DB] Error adding to ${collectionName}:`, err);
    throw err;
  }
}

/** Menambah banyak dokumen sekaligus (bulkAdd) */
async function _bulkAdd(collectionName, items) {
  try {
    const batch = writeBatch(firestore);
    items.forEach(item => {
      const { id, ...rest } = item;
      const ref = id
        ? doc(firestore, collectionName, String(id))
        : doc(collection(firestore, collectionName));
      batch.set(ref, rest);
    });
    await batch.commit();
  } catch (err) {
    console.error(`[DB] Error bulk adding to ${collectionName}:`, err);
    throw err;
  }
}

/** Update sebagian field dokumen berdasarkan ID */
async function _update(collectionName, id, changes) {
  try {
    await updateDoc(doc(firestore, collectionName, String(id)), changes);
  } catch (err) {
    console.error(`[DB] Error updating ${id} in ${collectionName}:`, err);
    throw err;
  }
}

/** Hapus dokumen berdasarkan ID */
async function _delete(collectionName, id) {
  try {
    await deleteDoc(doc(firestore, collectionName, String(id)));
  } catch (err) {
    console.error(`[DB] Error deleting ${id} from ${collectionName}:`, err);
    throw err;
  }
}

// ─── 4. FACTORY: TABLE PROXY ─────────────────────────────────────────────────
// Membuat objek "tabel" yang meniru API Dexie yang dipakai di seluruh aplikasi.

function makeTable(collectionName) {
  return {
    // ── Read ──────────────────────────────────────────────────────────
    toArray: () => _getAll(collectionName),

    get: (id) => _getById(collectionName, id),

    count: async (callback) => {
      try {
        const snap = await getDocs(collection(firestore, collectionName));
        const c = snap.size;
        if (typeof callback === 'function') return callback(c);
        return c;
      } catch (err) {
        console.error(`[DB] Error counting ${collectionName}:`, err);
        if (typeof callback === 'function') return callback(0);
        return 0;
      }
    },

    /** where(field).equals(value).toArray() / .first() */
    where: (field) => ({
      equals: (value) => ({
        toArray: async () => {
          try {
            const q = query(
              collection(firestore, collectionName),
              where(field, '==', value)
            );
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
          } catch (err) {
            console.error(`[DB] Error querying ${collectionName} where ${field}=${value}:`, err);
            return [];
          }
        },
        first: async () => {
          try {
            const q = query(
              collection(firestore, collectionName),
              where(field, '==', value),
              limit(1)
            );
            const snap = await getDocs(q);
            if (snap.empty) return undefined;
            const d = snap.docs[0];
            return { id: d.id, ...d.data() };
          } catch (err) {
            console.error(`[DB] Error querying first ${collectionName} where ${field}=${value}:`, err);
            return undefined;
          }
        },
      }),
      equalsIgnoreCase: (value) => ({
        // Firestore tidak mendukung case-insensitive natively.
        // Ambil semua lalu filter di sisi klien (cocok untuk tabel users yg kecil).
        toArray: async () => {
          try {
            const all = await _getAll(collectionName);
            return all.filter(r => String(r[field]).toLowerCase() === String(value).toLowerCase());
          } catch (err) {
            console.error(`[DB] Error querying ${collectionName} case-insensitive:`, err);
            return [];
          }
        },
        first: async () => {
          try {
            const all = await _getAll(collectionName);
            return all.find(r => String(r[field]).toLowerCase() === String(value).toLowerCase());
          } catch (err) {
            console.error(`[DB] Error querying first ${collectionName} case-insensitive:`, err);
            return undefined;
          }
        },
      }),
    }),

    // ── Write ─────────────────────────────────────────────────────────
    add:     (data)       => _add(collectionName, data),
    bulkAdd: (items)      => _bulkAdd(collectionName, items),
    put:     (data)       => _add(collectionName, data),  // upsert
    update:  (id, changes) => _update(collectionName, id, changes),
    delete:  (id)         => _delete(collectionName, id),

    // ── Compat: Dexie .filter() ───────────────────────────────────────
    filter: (fn) => ({
      toArray: async () => {
        try {
          const all = await _getAll(collectionName);
          return all.filter(fn);
        } catch (err) {
          console.error(`[DB] Error filtering ${collectionName}:`, err);
          return [];
        }
      },
    }),
  };
}

// ─── 5. DATABASE OBJECT (API PUBLIK) ─────────────────────────────────────────

const db = {
  // Expose table factory method
  table: (name) => makeTable(name),

  // Pre-created tables
  products:        makeTable('products'),
  transactions:    makeTable('transactions'),
  transactionItems: makeTable('transactionItems'),
  stock_mutations: makeTable('stock_mutations'),
  stockOpnames:    makeTable('stockOpnames'),
  members:         makeTable('members'),
  users:           makeTable('users'),
  settings:        makeTable('settings'),
  stores:          makeTable('stores'),
  receivables:     makeTable('receivables'),
  expenses:        makeTable('expenses'),
  shifts:          makeTable('shifts'),          // Sistem Shift: Jadwal shift karyawan
  attendances:     makeTable('attendances'),     // Sistem Shift: Records kehadiran/absensi
  shiftSchedules:  makeTable('shiftSchedules'),  // Sistem Shift: Template jadwal mingguan/bulanan
};

// ─── 6. SEED DATA AWAL (hanya jika koleksi masih kosong) ────────────────────

async function seedIfEmpty() {
  try {
    // Seed produk contoh
    const prodCount = await db.products.count();
    if (prodCount === 0) {
      await db.products.bulkAdd([
        { id: "1", name: "Kopi Susu Gula Aren", price: 18000, stock: 50, stockToko1: 25, stockToko2: 25, category: "Minuman" },
        { id: "2", name: "Croissant Polos",     price: 22000, stock: 20, stockToko1: 10, stockToko2: 10, category: "Makanan" },
        { id: "3", name: "Ice Americano",        price: 15000, stock: 40, stockToko1: 20, stockToko2: 20, category: "Minuman" },
      ]);
      console.log('[DB] ✅ Seed produk awal berhasil.');
    }

    // Seed pengaturan struk
    const receiptSetting = await db.settings.get('receipt_template');
    if (!receiptSetting) {
      await db.settings.add({
        id: 'receipt_template',
        value: {
          storeName: 'Mvape Shop',
          address:   'Jl. Sadang-Cipeundeuy Subang',
          phone:     '0812-3456-7890',
          footer:    'Terima kasih telah berbelanja!\nBarang yang sudah dibeli tidak dapat ditukar.',
        },
      });
    }

    // Seed pengaturan logo login
    const logoSetting = await db.settings.get('login_logo');
    if (!logoSetting) {
      await db.settings.add({ id: 'login_logo', value: '' });
    }

    // Seed data toko awal
    const storesCount = await db.stores.count();
    if (storesCount === 0) {
      await db.stores.bulkAdd([
        { 
          id: "toko1", 
          name: "Toko 1", 
          address: "Jl. Sadang-Cipeundeuy Subang",
          phone: "0812-3456-7890",
          isActive: true,
          createdAt: new Date().toISOString()
        },
        { 
          id: "toko2", 
          name: "Toko 2", 
          address: "Jl. Raya Subang No. 123",
          phone: "0813-4567-8901",
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ]);
      console.log('[DB] ✅ Seed toko awal berhasil.');
    }
  } catch (err) {
    console.error('[DB] ❌ Seed gagal:', err);
  }
}

// Jalankan seed saat modul pertama kali dimuat
seedIfEmpty();

export default db;
