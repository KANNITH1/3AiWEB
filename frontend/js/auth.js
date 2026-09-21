// ===================================
// auth.js
// ไฟล์นี้รับผิดชอบ token, login, register, auth guard และ logout
// รวม logic ของหน้า login ไว้ในไฟล์เดียว
// ===================================
import { CONFIG, setButtonLoading, showToast } from './shared.js';
import { validateEmail, validatePassword, validatePasswordMatch, validateRequired, validateUsername } from './validators.js';
const TOKEN_KEY = 'forge_token'; const USER_KEY = 'forge_user';
export function getToken() { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); }
export function getCurrentUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }
// Remember Me uses localStorage; otherwise the token is limited to the browser session.
// Backend should issue a longer JWT expiry for remember-me requests when supported.
// บันทึก JWT และข้อมูลผู้ใช้ลง storage ตามค่า Remember Me
export function saveSession(token, user, rememberMe = false) { const storage = rememberMe ? localStorage : sessionStorage; const other = rememberMe ? sessionStorage : localStorage; storage.setItem(TOKEN_KEY, token); storage.setItem(USER_KEY, JSON.stringify(user)); other.removeItem(TOKEN_KEY); other.removeItem(USER_KEY); }
export function clearSession() { [localStorage, sessionStorage].forEach(storage => { storage.removeItem(TOKEN_KEY); storage.removeItem(USER_KEY); }); }
// Auth guard สำหรับหน้าที่ต้อง login ก่อนเข้าใช้งาน
export function requireAuth() { if (!getToken()) { window.location.replace('login.html'); return false; } return true; }
export function redirectIfAuthenticated() { if (getToken()) window.location.replace('home.html'); }
// ส่งข้อมูล login หรือสร้าง demo session เมื่ออยู่ใน demo mode
/**
 * ตรวจสอบ credentials แล้วส่งคำขอ login
 * @param {{email: string, password: string, rememberMe?: boolean}} credentials - ข้อมูล login
 * @returns {Promise<object>} ข้อมูล user หลัง login สำเร็จ
 */
export async function login(credentials) {
  if (CONFIG.USE_DEMO_MODE) { const user = { id: 'demo-user', username: credentials.email.split('@')[0], email: credentials.email, created_at: '2026-01-01' }; saveSession(`demo.jwt.${Date.now()}`, user, credentials.rememberMe); return user; }
  const response = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.LOGIN}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || 'เข้าสู่ระบบไม่สำเร็จ'); saveSession(data.token, data.user, credentials.rememberMe); return data.user;
}
// ส่งข้อมูลสมัครสมาชิก หรือสร้าง demo user สำหรับทดสอบหน้าเว็บ
/**
 * สมัครสมาชิกด้วยข้อมูลที่ผ่านการตรวจสอบจากหน้า login
 * @param {{email: string, username: string, password: string}} credentials - ข้อมูลสมัครสมาชิก
 * @returns {Promise<object>} response จาก backend หรือ demo user
 */
export async function register(credentials) {
  if (CONFIG.USE_DEMO_MODE) { const user = { id: `demo-${Date.now()}`, username: credentials.username, email: credentials.email, created_at: new Date().toISOString() }; saveSession(`demo.jwt.${Date.now()}`, user, false); return user; }
  const response = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.REGISTER}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || 'สมัครสมาชิกไม่สำเร็จ'); return data;
}
// ล้าง session ทั้งสอง storage แล้วกลับไปหน้า login
export function logout() { clearSession(); showToast('ออกจากระบบเรียบร้อย', 'success'); window.setTimeout(() => window.location.replace('login.html'), 500); }
// คงชื่อ export เดิมไว้เพื่อไม่ทำลาย consumer ภายนอกของ auth.js
export { validateEmail };

// ----- ส่วนที่ 2: การทำงานของหน้า Login/Register -----
function setAuthMessage(id, message = '', type = 'error') { const element = document.getElementById(id); if (element) { element.textContent = message; element.className = `form-message ${type}`; } }
// สลับให้แสดงฟอร์มเพียงหนึ่งฟอร์มและอัปเดต tab ที่ active
function setAuthMode(mode = 'login') {
  const loginForm = document.getElementById('login-form'); const registerForm = document.getElementById('register-form');
  if (!loginForm || !registerForm) return;
  const registerMode = mode === 'register'; loginForm.hidden = registerMode; registerForm.hidden = !registerMode;
  document.querySelectorAll('[data-auth-tab]').forEach(tab => { const active = tab.dataset.authTab === mode; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
  const title = document.getElementById('auth-title'); if (title) title.textContent = registerMode ? 'เริ่มต้นสร้างสรรค์' : 'สร้างภาพที่เป็น คุณ';
}

// ผูก validation และ submit handler ของ Login/Register เมื่ออยู่หน้า login
function initLoginPage() {
  const loginForm = document.getElementById('login-form'); const registerForm = document.getElementById('register-form');
  if (!loginForm || !registerForm) return;
  redirectIfAuthenticated(); setAuthMode('login');
  document.querySelectorAll('[data-auth-tab]').forEach(tab => tab.addEventListener('click', () => setAuthMode(tab.dataset.authTab)));
  loginForm.addEventListener('submit', async event => { event.preventDefault(); setAuthMessage('login-message'); const email = document.getElementById('login-email').value.trim(); const password = document.getElementById('login-password').value; const button = loginForm.querySelector('button[type="submit"]'); if (!validateEmail(email)) return setAuthMessage('login-message', 'กรุณากรอกอีเมลให้ถูกต้อง'); if (!validatePassword(password)) return setAuthMessage('login-message', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); try { setButtonLoading(button, true); await login({ email, password, rememberMe: document.getElementById('remember-me').checked }); showToast('เข้าสู่ระบบสำเร็จ', 'success'); window.location.href = 'home.html'; } catch (error) { setAuthMessage('login-message', error.message); setButtonLoading(button, false); } });
  registerForm.addEventListener('submit', async event => { event.preventDefault(); setAuthMessage('register-message'); const email = document.getElementById('reg-email').value.trim(); const username = document.getElementById('reg-username').value.trim(); const password = document.getElementById('reg-password').value; const confirmPassword = document.getElementById('reg-confirm-password').value; const button = registerForm.querySelector('button[type="submit"]'); if (!validateEmail(email)) return setAuthMessage('register-message', 'กรุณากรอกอีเมลให้ถูกต้อง'); if (!validateUsername(username)) return setAuthMessage('register-message', 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร'); if (!validatePassword(password)) return setAuthMessage('register-message', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); if (!validatePasswordMatch(password, confirmPassword)) return setAuthMessage('register-message', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'); if (!validateRequired(email)) return setAuthMessage('register-message', 'กรุณากรอกอีเมลให้ครบถ้วน'); try { setButtonLoading(button, true); await register({ email, username, password }); showToast('สมัครสมาชิกสำเร็จ', 'success'); window.location.href = 'home.html'; } catch (error) { setAuthMessage('register-message', error.message); setButtonLoading(button, false); } });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLoginPage); else initLoginPage();