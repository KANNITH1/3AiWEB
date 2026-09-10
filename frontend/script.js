// ================= 1. Theme & Notification =================
const initTheme = () => {
  const theme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
};

const toggleTheme = () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
};

const showToast = (msg, type = 'success') => {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3500);
};

// ================= 2. Route Protection (ระบบป้องกันคนยังไม่ล็อกอิน) =================
const checkRouteProtection = () => {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const user = JSON.parse(localStorage.getItem('forge_user'));
  const protectedPages = ['home.html', 'gallery.html', 'history.html'];

  if (protectedPages.includes(currentPage) && !user) {
    alert('กรุณาเข้าสู่ระบบก่อนใช้งานหน้านี้');
    window.location.href = 'members.html';
  }
};

// ================= 3. Health Check Indicator =================
const checkBackendHealth = async () => {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;

  if (CONFIG.USE_DEMO_MODE) {
    dot.textContent = '🟠';
    text.textContent = 'โหมดจำลอง (Demo Mode)';
    return;
  }

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.HEALTH}`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      dot.textContent = '🟢';
      text.textContent = 'API เชื่อมต่อสำเร็จ';
    } else {
      throw new Error();
    }
  } catch {
    dot.textContent = '🔴';
    text.textContent = 'API ออฟไลน์';
  }
};

// ================= 4. Authentication Logic (Login / Register / Profile) =================
const initAuth = () => {
  const authContainer = document.getElementById('auth-container');
  const profileContainer = document.getElementById('profile-container');
  const signUpBtn = document.getElementById('signUp');
  const signInBtn = document.getElementById('signIn');

  if (signUpBtn && signInBtn) {
    signUpBtn.addEventListener('click', () => authContainer.classList.add('right-panel-active'));
    signInBtn.addEventListener('click', () => authContainer.classList.remove('right-panel-active'));
  }

  // อัปเดตหน้า UI ตามสถานะล็อกอิน
  const user = JSON.parse(localStorage.getItem('forge_user'));
  if (user && authContainer && profileContainer) {
    authContainer.style.display = 'none';
    profileContainer.style.display = 'block';
    document.getElementById('profile-username').textContent = user.username;
    document.getElementById('profile-email').textContent = user.email || `${user.username}@forge.ai`;
  }

  // Event สมัครสมาชิก
  const regForm = document.getElementById('register-form');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;

      if (CONFIG.USE_DEMO_MODE) {
        localStorage.setItem('forge_user', JSON.stringify({ username, email }));
        showToast('สมัครสมาชิกและเข้าสู่ระบบสำเร็จ! (Demo Mode)', 'success');
        setTimeout(() => location.reload(), 1000);
        return;
      }

      try {
        const res = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.REGISTER}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        if (!res.ok) throw new Error('การสมัครสมาชิกล้มเหลว');
        showToast('สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ', 'success');
        authContainer.classList.remove('right-panel-active');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Event เข้าสู่ระบบ
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;

      if (CONFIG.USE_DEMO_MODE) {
        localStorage.setItem('forge_user', JSON.stringify({ username, email: `${username}@forge.ai` }));
        showToast('เข้าสู่ระบบสำเร็จ! (Demo Mode)', 'success');
        setTimeout(() => location.reload(), 1000);
        return;
      }

      try {
        const res = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.LOGIN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
        localStorage.setItem('forge_user', JSON.stringify(data.user || { username }));
        showToast('เข้าสู่ระบบสำเร็จ!', 'success');
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // ออกจากระบบ
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('forge_user');
      showToast('ออกจากระบบเรียบร้อย', 'success');
      setTimeout(() => location.reload(), 800);
    });
  }
};

// สั่งทำงานทุกระบบเมื่อ DOM โหลดพร้อม
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkRouteProtection();
  checkBackendHealth();
  initAuth();
});