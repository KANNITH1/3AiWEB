// script.js — โค้ดหน้าเว็บที่ใช้ร่วมกัน (ทุกหน้ายกเว้น index.html / register.html)
// ส่วนที่ 1: ตัวช่วยทั่วไป + ระบบล็อกอิน   ส่วนที่ 2: หน้าสร้างภาพ (home.html)   ส่วนที่ 3: หน้า admin
// API_BASE มาจาก config.js

const $ = id => document.getElementById(id);   // ย่อ document.getElementById

/** ซ่อน/แสดง element ตาม id (ข้ามถ้าไม่มี element นั้นในหน้านี้) */
const show = (id, on, display = 'block') => { if ($(id)) $(id).style.display = on ? display : 'none'; };

// ================= 1) ระบบล็อกอิน =================
// หน้า login เก็บผลจาก POST /api/login ไว้ใน localStorage: forge_token (JWT) และ forge_user ({id, username, email, role})
const authHeader = () => {
    const token = localStorage.getItem('forge_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

function logout() {
    localStorage.removeItem('forge_token');
    localStorage.removeItem('forge_user');
    window.location.href = 'index.html';
}

// ยังไม่ได้ล็อกอิน -> กลับหน้า login
if (!localStorage.getItem('forge_token')) window.location.replace('index.html');

/**
 * เรียก Backend แนบ token อัตโนมัติ  คืนค่า JSON ที่ตอบกลับ
 * - 401 (token หมดอายุ/บัญชีถูกลบ) -> logout แล้ว throw (err.status = 401)
 * - สถานะอื่นที่ไม่ใช่ 2xx -> throw Error(ข้อความจาก Backend) พร้อม err.status
 */
async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: body && JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(); throw Object.assign(new Error('กรุณา login ใหม่'), { status: 401 }); }
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
}

/** แสดงชื่อ/อีเมลใน sidebar และเพิ่มเมนู "จัดการผู้ใช้" ถ้าเป็น admin */
function applyUser(user) {
    if (!user) return;
    const name = user.username || user.email || '';
    const set = (sel, text) => { const el = document.querySelector(`.user-profile ${sel}`); if (el) el.textContent = text; };
    set('.user-name', name || '—');
    set('.user-id', user.email || '');
    set('.avatar-placeholder', (name || '?').slice(0, 2).toUpperCase());

    const nav = document.querySelector('.nav-menu');
    if (user.role === 'admin' && nav && !nav.querySelector('a[href="admin.html"]')) {
        nav.insertAdjacentHTML('beforeend',
            '<a href="admin.html" class="nav-item"><span class="icon">🛡️</span><span>จัดการผู้ใช้</span></a>');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try { applyUser(JSON.parse(localStorage.getItem('forge_user'))); } catch (e) { /* ข้อมูลใน localStorage เสีย ไม่เป็นไร */ }
    try {   // ดึงข้อมูลล่าสุด (เผื่อ admin เปลี่ยนสิทธิ์/ชื่อ หรือบัญชีถูกลบ) ถ้า Backend ปิดอยู่ก็ใช้ของเดิมไปก่อน
        const { user } = await api('/api/me');
        localStorage.setItem('forge_user', JSON.stringify(user));
        applyUser(user);
    } catch (e) { /* ไม่ต้องทำอะไร */ }
});


// ================= 2) หน้าสร้างภาพ (home.html) =================
const GEN_MODES = ['text2img', 'img2img'];   // โหมดที่ใช้ Prompt/Seed และสร้างภาพผ่าน Forge
const BUTTON_LABELS = { img2img: 'แปลงภาพ (Image to Image)', canny: 'ตรวจจับขอบ (Canny)', detection: 'ตรวจจับวัตถุ', blur: 'เบลอภาพ' };

class ForgeAIController {
    constructor() {
        this.state = { mode: 'text2img', model: 'sd_animagineXL40_v4Opt', image: null };   // image = data URL ของภาพต้นฉบับ
        this.lastResult = null;   // ผลล่าสุด ไว้ให้ปุ่มหัวใจบันทึกลงแกลเลอรี่
        this.bindEvents();
        this.updateUI();
    }

    bindEvents() {
        this.bindChoice('.mode-tab', 'mode');
        this.bindChoice('.model-btn', 'model');
        $('random-seed-btn')?.addEventListener('click', () => $('seed-input').value = -1);   // -1 = ให้ Backend สุ่มเอง
        $('generate-form')?.addEventListener('submit', e => this.submit(e));
        $('like-btn')?.addEventListener('click', e => this.saveToGallery(e.currentTarget));

        // เลือกภาพต้นฉบับ -> แสดงตัวอย่างและเก็บเป็น data URL
        $('source-image-input')?.addEventListener('change', ({ target }) => {
            if (!target.files[0]) return;
            const reader = new FileReader();
            reader.onload = ev => {
                this.state.image = ev.target.result;
                $('source-image-preview').src = ev.target.result;
                show('upload-label', false);
                show('image-preview-container', true);
            };
            reader.readAsDataURL(target.files[0]);
        });

        $('remove-image-btn')?.addEventListener('click', () => {
            $('source-image-input').value = '';
            this.state.image = null;
            show('image-preview-container', false);
            show('upload-label', true, 'flex');
        });
    }

    /** ปุ่มแบบเลือกได้ทีละอัน: ปุ่มที่กดจะ active และเก็บค่า (data-value หรือ data-mode) ลง state[key] */
    bindChoice(selector, key) {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach(btn => btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.toggle('active', b === btn));
            this.state[key] = btn.dataset.value || btn.dataset.mode;
            if (key === 'mode') this.updateUI();
        }));
    }

    /** ซ่อน/แสดงช่องกรอกตามโหมดที่เลือก */
    updateUI() {
        const m = this.state.mode;
        const gen = GEN_MODES.includes(m);
        show('group-model', gen);
        show('group-prompts', gen);
        show('group-seed', gen);
        show('group-strength', m === 'img2img');
        show('group-upload', m !== 'text2img');
        show('group-blur-strength', m === 'blur');
        show('group-canny', m === 'canny');
        show('group-detection', m === 'detection');
        if ($('btn-text')) $('btn-text').textContent = BUTTON_LABELS[m] || 'สร้างภาพ';
    }

    /** รวมค่าจากฟอร์มเป็น payload ที่ส่งให้ Backend (คืน null ถ้ากรอกไม่ครบ พร้อมแจ้งผู้ใช้) */
    buildPayload() {
        const m = this.state.mode;
        const num = (id, fallback, parse = parseInt) => parse($(id)?.value) || fallback;   // ค่าว่าง/ไม่ใช่ตัวเลข -> ค่าเริ่มต้น
        const p = { mode: m, model: this.state.model };

        if (GEN_MODES.includes(m)) {
            p.prompt = $('prompt-input').value.trim();
            p.negative_prompt = $('negative-prompt-input').value.trim();
            const seed = parseInt($('seed-input').value);
            p.seed = Number.isNaN(seed) ? -1 : seed;
            if (!p.prompt) return alert('กรุณาใส่ Prompt ก่อนครับ');
            if (m === 'img2img') p.strength = num('strength-input', 0.6, parseFloat);
        } else if (m === 'blur') {
            p.blur_strength = num('blur-input', 15);
        } else if (m === 'canny') {
            p.threshold_low = num('canny-low', 100);
            p.threshold_high = num('canny-high', 200);
        } else if (m === 'detection') {
            p.score_threshold = num('score-threshold-input', 0.5, parseFloat);
            p.max_results = num('max-results-input', 10);
            p.detect_model = $('detect-model-select')?.value || 'efficientdet_lite0';
        }

        if (m !== 'text2img') {
            if (!this.state.image) return alert('กรุณาอัปโหลดรูปภาพต้นฉบับก่อนครับ!');
            p.init_image = this.state.image.split(',')[1];   // base64 ล้วน (ตัด "data:image/...;base64," ออก)
        }
        return p;
    }

    async submit(e) {
        e.preventDefault();
        const payload = this.buildPayload();
        if (!payload) return;
        const m = payload.mode;

        this.setLoading(true);
        try {
            let data;
            if (m === 'detection') data = await this.detectLocal(payload);   // ทำในเบราว์เซอร์ ไม่ผ่าน Backend
            else if (m === 'blur' || m === 'canny') data = await this.callCv(m, payload);
            else data = await api('/api/generate', { method: 'POST', body: payload });

            if (!data.image_url && !data.image_base64) throw new Error('ไม่พบข้อมูลรูปภาพตอบกลับจาก Backend');
            this.showResult(data, payload);
        } catch (err) {
            if (err.status === 401) return;   // token หมดอายุ: api() พาไปหน้า login แล้ว ไม่ต้องแจ้งซ้ำ
            show('placeholder-content', true, 'flex');
            alert(`เกิดข้อผิดพลาด: ${err.message}\n(ตรวจสอบว่า server.py, chat.py และ Forge Neo รันอยู่หรือไม่)`);
        } finally {
            this.setLoading(false);
        }
    }

    /** แสดงภาพผลลัพธ์ + seed/ผลตรวจจับ + ปุ่มดาวน์โหลด/หัวใจ */
    showResult(data, payload) {
        const m = payload.mode;
        const gen = GEN_MODES.includes(m);
        const imgSrc = data.image_url || `data:image/png;base64,${data.image_base64}`;

        $('output-image').src = imgSrc;
        show('output-image', true);
        show('placeholder-content', false);
        show('seed-display-text', gen);   // seed แสดงเฉพาะโหมดสร้างภาพ
        if (gen && data.seed !== undefined) $('used-seed-display').textContent = data.seed;

        if ($('detect-result-text')) {
            const found = Object.entries(data.objects || {}).map(([name, n]) => `${name} ×${n}`);
            $('detect-result-text').textContent = found.length
                ? `ตรวจพบ: ${found.join(', ')} (ใช้เวลา ${data.ms} ms)`
                : 'ไม่พบวัตถุในภาพ (ลองลดค่า Score Threshold)';
            show('detect-result-text', m === 'detection');
        }

        $('download-btn').href = imgSrc;
        $('like-btn').textContent = '🤍';
        $('like-btn').dataset.liked = '';
        show('result-actions', true, 'flex');
        $('result-container').scrollIntoView({ behavior: 'smooth' });

        // เก็บค่าตอนนี้ไว้ เพราะตอนกดหัวใจผู้ใช้อาจแก้ฟอร์มไปแล้ว ค่าจะไม่ตรงกับภาพที่แสดงอยู่
        this.lastResult = {
            image: imgSrc, mode: m, model: payload.model,
            prompt: payload.prompt, negative_prompt: payload.negative_prompt,
            seed: gen && data.seed !== undefined ? data.seed : payload.seed,
        };
    }

    /** Blur/Canny: เรียก /api/blur หรือ /api/canny ถ้า Backend ไม่มี (404/405) ถอยไปใช้ /api/generate พร้อม mode */
    async callCv(m, payload) {
        const body = m === 'blur'
            ? { image: this.state.image, strength: payload.blur_strength }
            : { image: this.state.image, low: payload.threshold_low, high: payload.threshold_high };
        try {
            return await api(`/api/${m}`, { method: 'POST', body });
        } catch (err) {
            if (err.status !== 404 && err.status !== 405) throw err;
            return api('/api/generate', { method: 'POST', body: { ...payload, image: this.state.image } });
        }
    }

    // ---------- ตรวจจับวัตถุ (MediaPipe ในเบราว์เซอร์) ----------
    // ตัวตรวจจับอยู่ที่ ai/object-detector-module.js (home.html โหลดเป็น module แล้วเปิด window.runObjectDetection)

    /** รอจนโมดูลตรวจจับวัตถุพร้อมใช้ (โหลดพลาด/นานเกิน -> throw) */
    waitForDetectorModule(timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const t0 = Date.now();
            const check = () => {
                if (window.__objectDetectorModuleReady && window.runObjectDetection) return resolve();
                if (window.__objectDetectorModuleFailed)
                    return reject(new Error('โหลดโมดูลตรวจจับวัตถุจากเซิร์ฟเวอร์ ai ไม่ได้ (เช็คว่า chat.py รันอยู่)'));
                if (Date.now() - t0 > timeoutMs)
                    return reject(new Error('โหลดโมดูลตรวจจับวัตถุไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต และเปิดหน้าเว็บผ่าน http:// ไม่ใช่ file://)'));
                setTimeout(check, 100);
            };
            check();
        });
    }

    async detectLocal(opts) {
        await this.waitForDetectorModule();
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('เปิดไฟล์ภาพไม่ได้'));
            i.src = this.state.image;
        });

        const settings = { model: opts.detect_model, maxResults: opts.max_results, threshold: opts.score_threshold };
        const t0 = performance.now();
        let result;
        try { result = await window.runObjectDetection(img, { ...settings, delegate: 'GPU' }); }
        catch { result = await window.runObjectDetection(img, { ...settings, delegate: 'CPU' }); }   // เครื่องที่ไม่รองรับ GPU
        return { image_url: result.dataUrl, objects: result.objects, ms: Math.round(performance.now() - t0) };
    }

    /** ปุ่มหัวใจ: บันทึกผลล่าสุดลงแกลเลอรี่ (กดซ้ำไม่ได้) */
    async saveToGallery(btn) {
        const r = this.lastResult;
        if (btn.dataset.liked || !r) return;
        btn.disabled = true;
        try {
            await api('/api/gallery', { method: 'POST', body: {
                image: r.image, mode: r.mode, model: r.model, prompt: r.prompt, negative_prompt: r.negative_prompt, seed: r.seed } });
            btn.textContent = '❤️';
            btn.dataset.liked = '1';
        } catch (err) {
            if (err.status !== 401) alert('บันทึกลงแกลเลอรี่ไม่สำเร็จ: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    }

    setLoading(on) {
        const btn = $('submit-btn');
        if (!btn) return;
        btn.disabled = on;
        show('btn-loader', on, 'inline-block');
        $('btn-text').textContent = on ? '✨ กำลังประมวลผล...' : (BUTTON_LABELS[this.state.mode] || 'สร้างภาพ');

        if (on) {
            $('placeholder-text').textContent = '✨ AI กำลังสร้างสรรค์ผลงาน...';
            show('placeholder-content', true, 'flex');
            show('output-image', false);
            show('result-actions', false);
        } else if ($('output-image').style.display === 'none') {
            $('placeholder-text').textContent = 'ภาพผลลัพธ์จะปรากฏที่นี่';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { if ($('generate-form')) new ForgeAIController(); });


// ================= 3) หน้าจัดการผู้ใช้ (admin.html) =================
// ทำงานเฉพาะหน้าที่มีตาราง #users-body  (สิทธิ์ admin ตรวจที่ Backend จริง ฝั่งนี้แค่แสดงผล)
function initAdminPage() {
    let users = [];
    let editingId = null;
    let me = JSON.parse(localStorage.getItem('forge_user') || 'null');
    const isMe = u => me && u.id === me.id;

    // สร้าง element ด้วย textContent (ไม่ใช้ innerHTML กับข้อมูลผู้ใช้ กัน XSS)
    const el = (tag, props = {}, ...children) => {
        const node = Object.assign(document.createElement(tag), props);
        node.append(...children);
        return node;
    };
    const td = (text, props) => el('td', { textContent: text ?? '—', ...props });
    const messageRow = (text, color) => el('tr', {}, td(text, { colSpan: 7, style: `color:${color}` }));

    async function loadUsers() {
        try {
            users = (await api('/api/admin/users')).users || [];
            renderTable();
        } catch (err) {
            const forbidden = err.status === 403;
            $('users-body').replaceChildren(messageRow(
                forbidden ? 'หน้านี้สำหรับ admin เท่านั้น กำลังพากลับหน้าหลัก...' : `โหลดรายชื่อผู้ใช้ไม่สำเร็จ: ${err.message}`, '#ef4444'));
            if (forbidden) setTimeout(() => location.replace('home.html'), 2000);
        }
    }

    function renderTable() {
        const q = $('search-input').value.trim().toLowerCase();
        const list = users.filter(u => !q || u.username.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
        $('user-count').textContent = `${list.length} / ${users.length} คน`;
        if (!list.length) return $('users-body').replaceChildren(messageRow('ไม่พบผู้ใช้', 'var(--c-text-mut)'));

        $('users-body').replaceChildren(...list.map(u => {
            const editBtn = el('button', { className: 'secondary-btn', textContent: '✏️ แก้ไข', onclick: () => openEdit(u.id) });
            const deleteBtn = isMe(u) ? '' :   // ลบตัวเองไม่ได้ จึงไม่แสดงปุ่ม
                el('button', { className: 'secondary-btn danger-btn', textContent: '🗑️ ลบ', onclick: () => removeUser(u.id) });
            const nameCell = td(u.username);
            if (isMe(u)) nameCell.append(el('span', { className: 'you', textContent: ' (คุณ)' }));
            return el('tr', {},
                td(u.id),
                nameCell,
                td(u.email),
                el('td', {}, el('span', { className: 'role-badge' + (u.role === 'admin' ? ' admin' : ''), textContent: u.role })),
                td(u.gallery_count),
                td(new Date(u.created_at).toLocaleDateString('th-TH')),
                el('td', {}, el('div', { className: 'row-actions' }, editBtn, deleteBtn)));
        }));
    }

    function openEdit(id) {
        const u = users.find(x => x.id === id);
        editingId = id;
        $('edit-title').textContent = `แก้ไขผู้ใช้: ${u.username}`;
        $('edit-username').value = u.username;
        $('edit-email').value = u.email || '';
        $('edit-role').value = u.role;
        $('edit-password').value = '';
        $('edit-role').disabled = !!isMe(u);          // เปลี่ยนสิทธิ์ตัวเองไม่ได้
        show('edit-role-hint', isMe(u));
        show('edit-error', false);
        $('edit-overlay').classList.add('open');
    }

    const closeEdit = () => { $('edit-overlay').classList.remove('open'); editingId = null; };

    async function saveEdit() {
        const body = { username: $('edit-username').value.trim(), email: $('edit-email').value.trim() };
        if (!$('edit-role').disabled) body.role = $('edit-role').value;
        if ($('edit-password').value) body.password = $('edit-password').value;   // ว่าง = ไม่เปลี่ยนรหัส

        $('edit-save-btn').disabled = true;
        try {
            const { user } = await api(`/api/admin/users/${editingId}`, { method: 'PUT', body });
            if (editingId === me?.id) {   // แก้ข้อมูลตัวเอง -> อัปเดต sidebar ด้วย
                me = user;
                localStorage.setItem('forge_user', JSON.stringify(me));
                applyUser(me);
            }
            closeEdit();
            await loadUsers();
        } catch (err) {
            $('edit-error').textContent = err.message;
            show('edit-error', true);
        } finally {
            $('edit-save-btn').disabled = false;
        }
    }

    async function removeUser(id) {
        const u = users.find(x => x.id === id);
        if (!confirm(`ลบผู้ใช้ "${u.username}" ?\nรูปในแกลเลอรี่ของเขา (${u.gallery_count} รูป) จะถูกลบด้วย และกู้คืนไม่ได้`)) return;
        try {
            await api(`/api/admin/users/${id}`, { method: 'DELETE' });
            await loadUsers();
        } catch (err) {
            alert('ลบไม่สำเร็จ: ' + err.message);
        }
    }

    $('search-input').addEventListener('input', renderTable);
    $('edit-save-btn').addEventListener('click', saveEdit);
    $('edit-cancel-btn').addEventListener('click', closeEdit);
    $('edit-overlay').addEventListener('click', e => { if (e.target === $('edit-overlay')) closeEdit(); });
    loadUsers();
}

document.addEventListener('DOMContentLoaded', () => { if ($('users-body')) initAdminPage(); });
