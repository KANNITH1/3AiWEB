// ----------------------------------------------------
// auth.js — ฟังก์ชันช่วยจัดการ login/register ที่ใช้ร่วมกันหลายหน้า
// เก็บ token ไว้ใน localStorage (คีย์ "forge_token", "forge_user")
// ----------------------------------------------------
const AUTH_API_BASE = 'http://127.0.0.1:5000'; // server.py

function saveSession(token, user) {
    localStorage.setItem('forge_token', token);
    localStorage.setItem('forge_user', JSON.stringify(user || {}));
}

function getToken() {
    return localStorage.getItem('forge_token');
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('forge_user') || 'null');
    } catch {
        return null;
    }
}

function clearSession() {
    localStorage.removeItem('forge_token');
    localStorage.removeItem('forge_user');
}

function authHeader() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// เรียกในหน้าที่ต้อง login ก่อนถึงจะใช้ได้ (เช่น dashboard) — ไม่มี token เด้งกลับไปหน้า login ทันที
function requireAuth() {
    if (!getToken()) {
        window.location.href = 'index.html';
    }
}

async function apiGetCaptcha() {
    const res = await fetch(`${AUTH_API_BASE}/api/captcha`);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'โหลดคำถามกันบอทไม่สำเร็จ');
    return data; // { captcha_id, question }
}

async function apiRegister(username, password, email, captchaId, captchaAnswer) {
    const res = await fetch(`${AUTH_API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username, password, email,
            captcha_id: captchaId,
            captcha_answer: captchaAnswer,
        }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'สมัครสมาชิกไม่สำเร็จ');
    return data; // { token, user }
}

async function apiLogin(username, password) {
    const res = await fetch(`${AUTH_API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
    return data; // { token, user }
}

function logout() {
    const confirmLogout = confirm('คุณต้องการออกจากระบบใช่หรือไม่?');
    if (confirmLogout) {
        clearSession();
        window.location.href = 'index.html';
    }
}
