// common.js — ฟังก์ชันที่ทุกหน้าใช้ร่วมกัน (ถ้าจะแก้ ให้แจ้งทีมก่อน)

// ----------------------------------------------------
// 4. ฟังก์ชันสำหรับแจ้งเตือน Pop-up (Toast Message)
// ----------------------------------------------------
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ----------------------------------------------------
// 5. ฟังก์ชันสำหรับปุ่ม Logout
// ----------------------------------------------------
function logout() {
    const confirmLogout = confirm('คุณต้องการออกจากระบบใช่หรือไม่?');
    if (confirmLogout) {
        window.location.href = '../index.html';
    }
}