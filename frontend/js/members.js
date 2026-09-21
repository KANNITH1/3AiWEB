// ===================================
// members.js
// ไฟล์นี้ควบคุมหน้าโปรไฟล์ การแก้ไขชื่อผู้ใช้ รหัสผ่าน และ logout
// ===================================
import { getCurrentUser, logout } from './auth.js';
import { showToast } from './shared.js';
import { validatePassword } from './validators.js';
// เติมข้อมูลผู้ใช้และผูก form แก้ไขข้อมูล/รหัสผ่านของหน้า profile
/**
 * เติมข้อมูล profile และผูก handlers สำหรับแก้ username/password
 * @returns {void}
 */
export function initMembers() { const user = getCurrentUser() || {}; document.getElementById('profile-username').textContent = user.username || 'Forge Member'; document.getElementById('profile-email').textContent = user.email || 'ยังไม่มีอีเมล'; document.getElementById('profile-date').textContent = user.created_at ? new Date(user.created_at).toLocaleDateString('th-TH') : 'ไม่ระบุ'; document.getElementById('profile-form').addEventListener('submit', event => { event.preventDefault(); const username = document.getElementById('profile-edit-username').value.trim(); const updated = { ...user, username: username || user.username }; localStorage.setItem('forge_user', JSON.stringify(updated)); document.getElementById('profile-username').textContent = updated.username; showToast('บันทึกข้อมูลเรียบร้อย', 'success'); }); document.getElementById('profile-password-form').addEventListener('submit', event => { event.preventDefault(); const password = document.getElementById('profile-new-password').value; if (!validatePassword(password)) return showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); event.target.reset(); showToast('เปลี่ยนรหัสผ่านแล้ว (โหมดจำลอง)', 'success'); }); document.getElementById('profile-logout').addEventListener('click', logout); }