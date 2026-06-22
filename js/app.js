// js/db.js
// Menggunakan Dexie via CDN untuk mempermudah tanpa bundler
import 'https://unpkg.com/dexie@3.2.4/dist/dexie.js';
import addMemberView from './views/add-member.js'; // 1. IMPORT VIEW BARU

const db = new Dexie("PosDatabase");
db.version(2).stores({
  products: 'id, name, price, stock, category',
  transactions: 'id, timestamp, total, paymentMethod, memberId',
  transactionItems: '++id, transactionId, productId, quantity, subtotal'
  // TABEL BARU: Menyimpan data pelanggan tetap (Member)
    members: 'id, name, phone, points'
});

// Seed data awal jika kosong
db.on("ready", function () {
  return db.products.count(count => {
    if (count === 0) {
      return db.products.bulkAdd([
        { id: "1", name: "Kopi Susu Gula Aren", price: 18000, stock: 50, category: "Minuman" },
        { id: "2", name: "Croissant Polos", price: 22000, stock: 20, category: "Makanan" },
        { id: "3", name: "Ice Americano", price: 15000, stock: 40, category: "Minuman" }
      ]);
    }
  });
});

export default db;

