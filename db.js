import Dexie from 'dexie';

export const db = new Dexie('PoSDatabase');

// Menentukan skema database lokal
db.version(1).stores({
  products: '++id, name, price, stock, category',
  cart: '++id, productId, quantity',
  transactions: '++id, timestamp, items, total, paymentMethod, synced' 
  // synced: 0 = belum masuk ke server owner, 1 = sudah sinkron
});