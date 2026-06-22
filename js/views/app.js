// js/app.js
import cashierView from './views/cashier.js';
import ownerView from './views/owner.js';
import addMemberView from './views/add-member.js'; // 1. IMPORT VIEW BARU

window.switchView = function(viewName) {
    const container = document.getElementById('app-container');
    
    if (viewName === 'cashier') {
        cashierView.render(container);
    } else if (viewName === 'owner') {
        ownerView.render(container);
    } else if (viewName === 'add-member') {
        addMemberView.render(container); // 2. TAMBAHKAN KONDISI ROUTING INI
    }
};

// Inisialisasi awal saat aplikasi dibuka pertama kali
document.addEventListener('DOMContentLoaded', () => {
    window.switchView('cashier'); 
});