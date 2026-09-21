// ===================================
// shared.js
// ไฟล์นี้เก็บฟังก์ชันกลางที่ทุกหน้าใช้ร่วมกัน
// ประกอบด้วย config, API wrapper, UI helpers และ navbar
// ===================================

// ----- ส่วนที่ 1: ตั้งค่า API URL -----
export const CONFIG = {
  USE_DEMO_MODE: true,
  API_BASE_URL: '/api',
  ENDPOINTS: { HEALTH: '/health', LOGIN: '/login', REGISTER: '/register', GENERATE: '/generate', GALLERY: '/gallery', HISTORY: '/history', PROFILE: '/profile' }
};

// ----- ส่วนที่ 2: ฟังก์ชันเรียก API กลาง -----
// แนบ JSON header และ JWT token พร้อมแปลง error จาก backend ให้เป็นข้อความเดียวกัน
/**
 * เรียก REST API พร้อมแนบ JSON headers และ JWT ปัจจุบัน
 * @param {string} endpoint - path ของ endpoint จาก CONFIG.ENDPOINTS
 * @param {RequestInit} options - options ของ fetch
 * @returns {Promise<unknown>} response body หรือ null เมื่อ status เป็น 204
 */
export async function apiFetch(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = getTokenForApi();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    let message = 'เชื่อมต่อ API ไม่สำเร็จ';
    try { message = (await response.json()).message || message; } catch { /* empty response */ }
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

// อ่าน token จาก storage ที่ใช้ใน session ปัจจุบัน
function getTokenForApi() {
  return localStorage.getItem('forge_token') || sessionStorage.getItem('forge_token');
}

// ----- ส่วนที่ 3: ฟังก์ชันช่วยจัดการ UI -----
// แสดงข้อความแจ้งเตือนแบบ Toast
export function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) { container = document.createElement('div'); container.className = 'toast-container'; container.setAttribute('aria-live', 'polite'); document.body.appendChild(container); }
  const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; container.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

// เปลี่ยนสถานะปุ่มระหว่างกำลังรอการทำงานแบบ async
export function setButtonLoading(button, loading, loadingText = 'กำลังประมวลผล...') {
  if (!button) return;
  const label = button.querySelector('.btn-text');
  if (label && !label.dataset.defaultText) label.dataset.defaultText = label.textContent;
  button.disabled = loading; button.classList.toggle('loading', loading);
  if (label) label.textContent = loading ? loadingText : label.dataset.defaultText;
}

// เปิด modal รายละเอียดพร้อมย้าย focus ไปยังปุ่มปิด
/**
 * เปิด modal และใส่ HTML ที่ต้องการแสดง
 * @param {string} content - HTML ของรายละเอียด
 * @returns {void}
 */
export function openModal(content) { const modal = document.getElementById('detail-modal'); if (!modal) return; modal.querySelector('.modal-body').innerHTML = content; modal.hidden = false; modal.querySelector('[data-close-modal]')?.focus(); }
export function closeModal() { const modal = document.getElementById('detail-modal'); if (modal) modal.hidden = true; }
/**
 * Escape อักขระ HTML เพื่อป้องกันข้อความจาก API ถูกตีความเป็น markup
 * @param {unknown} value - ค่าที่ต้องการแปลง
 * @returns {string} ข้อความที่ปลอดภัยสำหรับใส่ใน HTML
 */
export function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character])); }
export function initTheme() { document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark'; }
export function toggleTheme() { const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nextTheme; localStorage.setItem('theme', nextTheme); }

// ----- ส่วนที่ 4: แถบเมนูด้านข้าง -----
const links = [['members.html', '👥', 'โปรไฟล์'], ['home.html', '🎨', 'สร้างภาพ'], ['gallery.html', '🖼️', 'แกลเลอรี'], ['history.html', '🕓', 'ประวัติ'], ['about.html', 'ℹ️', 'เกี่ยวกับ']];

// ตรวจ auth แล้ว inject sidebar รวมถึงผูกปุ่ม theme, menu และ logout
export function injectNavbar({ protect = true } = {}) {
  if (protect && !requireAuthForNavbar()) return false;
  initTheme();
  const currentPage = window.location.pathname.split('/').pop() || 'home.html';
  const user = getCurrentUserForNavbar();
  const shell = document.querySelector('.layout');
  if (!shell) return true;
  const sidebar = document.createElement('aside'); sidebar.className = 'sidebar';
  sidebar.innerHTML = `<button class="mobile-menu" type="button" aria-label="เปิดเมนู" aria-expanded="false">☰</button><a href="index.html" class="logo">Forge <span class="grad-text">AI</span></a><div class="sidebar-user"><span class="avatar">${(user?.username || 'U')[0].toUpperCase()}</span><span><strong>${user?.username || 'ผู้ใช้งาน'}</strong><small>สมาชิก Forge AI</small></span></div><nav aria-label="เมนูหลัก">${links.map(([href, icon, label]) => `<a href="${href}" class="nav-item ${currentPage === href ? 'active' : ''}"><span>${icon}</span>${label}</a>`).join('')}</nav><div class="sidebar-footer"><div class="backend-status"><span id="status-dot">🟠</span><span id="status-text">โหมดจำลอง (Demo)</span></div><button class="theme-btn" type="button" data-theme-toggle>🌓 สลับธีม</button><button class="logout-btn" type="button" data-logout>ออกจากระบบ</button></div>`;
  shell.prepend(sidebar); sidebar.querySelector('[data-logout]').addEventListener('click', logoutForNavbar); sidebar.querySelector('[data-theme-toggle]').addEventListener('click', toggleTheme);
  const menu = sidebar.querySelector('.mobile-menu'); menu.addEventListener('click', () => { const open = shell.classList.toggle('menu-open'); menu.setAttribute('aria-expanded', String(open)); });
  return true;
}

function requireAuthForNavbar() { if (!getTokenForApi()) { window.location.replace('login.html'); return false; } return true; }
function getCurrentUserForNavbar() { try { return JSON.parse(localStorage.getItem('forge_user') || sessionStorage.getItem('forge_user') || 'null'); } catch { return null; } }
function logoutForNavbar() { localStorage.removeItem('forge_token'); localStorage.removeItem('forge_user'); sessionStorage.removeItem('forge_token'); sessionStorage.removeItem('forge_user'); showToast('ออกจากระบบเรียบร้อย', 'success'); window.setTimeout(() => window.location.replace('login.html'), 500); }