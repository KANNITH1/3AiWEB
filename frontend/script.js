// ==========================================================================
// Forge AI - Main Frontend Script (script.js)
// ควบคุมระบบ Auth, การสร้างภาพ AI, Computer Vision, และหน้าจัดการผู้ใช้ (Admin)
// ==========================================================================

// ฟังก์ชันลัดดึง Element ตาม ID
const $ = id => document.getElementById(id);

// แปลงอักขระพิเศษเป็น HTML Entity ป้องกัน XSS เมื่อแสดงข้อมูลผู้ใช้
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ==========================================================================
// 1. ระบบ Authentication & ข้อมูลผู้ใช้ (ใช้งานร่วมกันทุกหน้า)
// ==========================================================================

// สร้าง Header สำหรับแนบ JWT Token ส่งไปกับ Request
const authHeader = () => {
    const token = localStorage.getItem('forge_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

// ฟังก์ชันออกจากระบบ: ล้าง Token และข้อมูลผู้ใช้ แล้วพากลับหน้าเข้าสู่ระบบ
function logout() {
    localStorage.removeItem('forge_token');
    localStorage.removeItem('forge_user');
    window.location.href = 'index.html';
}

// ตรวจสอบสิทธิ์เบื้องต้น: หากยังไม่ได้ล็อกอิน ให้เด้งกลับหน้า index.html ทันที
if (!localStorage.getItem('forge_token')) {
    window.location.replace('index.html');
}

// แสดงข้อมูลผู้ใช้ (ชื่อ, อีเมล, ตัวย่อ Avatar) ใน Sidebar และเพิ่มเมนู Admin หากมีสิทธิ์
function applyUser(user) {
    if (!user) return;
    const name = user.username || user.email || '—';
    const setText = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };

    setText('.user-profile .user-name', name);
    setText('.user-profile .user-id', user.email || '');
    setText('.user-profile .avatar-placeholder', (name || '?').slice(0, 2).toUpperCase());

    const nav = document.querySelector('.nav-menu');
    if (user.role === 'admin' && nav && !nav.querySelector('a[href="admin.html"]')) {
        nav.insertAdjacentHTML('beforeend', '<a href="admin.html" class="nav-item"><span class="icon">🛡️</span><span>จัดการผู้ใช้</span></a>');
    }
}

// ==========================================================================
// 2. คลาส ForgeAIController (ควบคุมหน้าสร้างภาพ AI: home.html)
// ==========================================================================
class ForgeAIController {
    constructor() {
        this.state = { mode: 'text2img', model: 'sd_animagineXL40_v4Opt', imgBase64: null, imgDataUrl: null };
        this.api = `${API_BASE}/api/generate`;
        this.init();
    }

    // ผูก Event Listener กับ Element ต่างๆ ในหน้าเว็บ
    init() {
        this.setupBtns('.mode-tab', 'mode');
        this.setupBtns('.model-btn', 'model');

        // สุ่ม Seed (-1 ให้เซิร์ฟเวอร์สุ่มเอง)
        $('random-seed-btn')?.addEventListener('click', () => $('seed-input').value = -1);
        $('generate-form')?.addEventListener('submit', e => this.submit(e));

        // อัปโหลดและพรีวิวภาพต้นฉบับ
        $('source-image-input')?.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                $('source-image-preview').src = ev.target.result;
                $('upload-label').style.display = 'none';
                $('image-preview-container').style.display = 'block';
                this.state.imgBase64 = ev.target.result.split(',')[1];
                this.state.imgDataUrl = ev.target.result;
            };
            reader.readAsDataURL(file);
        });

        // ลบภาพต้นฉบับ
        $('remove-image-btn')?.addEventListener('click', () => {
            $('source-image-input').value = '';
            this.state.imgBase64 = null;
            this.state.imgDataUrl = null;
            $('image-preview-container').style.display = 'none';
            $('upload-label').style.display = 'flex';
        });

        // กดถูกใจเพื่อบันทึกลงแกลเลอรี่
        $('like-btn')?.addEventListener('click', e => this.saveToGallery(e.currentTarget));
        this.updateUI();
    }

    // จัดการปุ่มแบบกลุ่ม (เลือกได้ทีละ 1 ปุ่ม เช่น โหมดการทำงาน หรือโมเดล)
    setupBtns(selector, key) {
        document.querySelectorAll(selector).forEach(btn => btn.addEventListener('click', e => {
            document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            this.state[key] = e.currentTarget.dataset.value || e.currentTarget.dataset.mode;
            if (key === 'mode') this.updateUI();
        }));
    }

    // ซ่อนหรือแสดงฟิลด์ตั้งค่าตามโหมดที่กำลังเลือก
    updateUI() {
        const m = this.state.mode, gen = ['text2img', 'img2img'].includes(m);
        const toggle = (id, show) => { if ($(id)) $(id).style.display = show ? 'block' : 'none'; };

        toggle('group-model', gen);
        toggle('group-prompts', gen);
        toggle('group-seed', gen);
        toggle('group-strength', m === 'img2img');
        toggle('group-upload', m !== 'text2img');
        toggle('group-blur-strength', m === 'blur');
        toggle('group-canny', m === 'canny');
        toggle('group-detection', m === 'detection');

        if ($('btn-text')) $('btn-text').textContent = this.btnLabel();
    }

    // ข้อความบนปุ่มประมวลผลตามโหมด
    btnLabel() {
        const labels = { img2img: 'แปลงภาพ (Image to Image)', canny: 'ตรวจจับขอบ (Canny)', detection: 'ตรวจจับวัตถุ', blur: 'เบลอภาพ' };
        return labels[this.state.mode] || 'สร้างภาพ';
    }

    // ส่งคำขอสร้างภาพหรือประมวลผลไปยัง Backend
    async submit(e) {
        e.preventDefault();
        const m = this.state.mode;
        const payload = { mode: m, model: this.state.model };

        // ตรวจสอบและเตรียมค่า Payload ตามโหมด
        if (['text2img', 'img2img'].includes(m)) {
            payload.prompt = $('prompt-input').value.trim();
            payload.negative_prompt = $('negative-prompt-input').value.trim();
            const seed = parseInt($('seed-input').value);
            payload.seed = Number.isNaN(seed) ? -1 : seed;
            if (!payload.prompt) return alert('กรุณาใส่ Prompt ก่อนครับ');
            if (m === 'img2img') payload.strength = parseFloat($('strength-input').value) || 0.6;
        } else if (m === 'blur') {
            payload.blur_strength = parseInt($('blur-input').value) || 15;
        } else if (m === 'canny') {
            payload.threshold_low = parseInt($('canny-low').value) || 100;
            payload.threshold_high = parseInt($('canny-high').value) || 200;
        } else if (m === 'detection') {
            payload.score_threshold = parseFloat($('score-threshold-input').value) || 0.5;
            payload.max_results = 10;
            payload.detect_model = 'efficientdet_lite0';
        }

        if (m !== 'text2img') {
            if (!this.state.imgBase64) return alert('กรุณาอัปโหลดรูปภาพต้นฉบับก่อนครับ!');
            payload.init_image = this.state.imgBase64;
        }

        this.setLoading(true);
        try {
            let data;
            if (m === 'detection') {
                data = await this.detectLocal(this.state.imgDataUrl, payload);
            } else if (m === 'blur' || m === 'canny') {
                data = await this.callCv(m, payload);
            } else {
                const res = await fetch(this.api, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeader() },
                    body: JSON.stringify(payload)
                });
                if (res.status === 401) return logout();
                data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            }

            if (!data.image_url && !data.image_base64) throw new Error('ไม่พบข้อมูลรูปภาพตอบกลับจาก Backend');

            const imgSrc = data.image_url || `data:image/png;base64,${data.image_base64}`;
            $('output-image').src = imgSrc;
            $('output-image').style.display = 'block';
            $('placeholder-content').style.display = 'none';

            // แสดง Seed ที่ใช้เจนภาพ
            const gen = ['text2img', 'img2img'].includes(m);
            $('seed-display-text').style.display = gen ? 'block' : 'none';
            if (gen && data.seed !== undefined) $('used-seed-display').textContent = data.seed;

            // แสดงผลลัพธ์การตรวจจับวัตถุ
            const det = $('detect-result-text');
            if (det) {
                if (m === 'detection') {
                    const parts = Object.entries(data.objects || {}).map(([k, v]) => `${k} ×${v}`);
                    det.textContent = parts.length ? `ตรวจพบ: ${parts.join(', ')} (ใช้เวลา ${data.ms} ms)` : 'ไม่พบวัตถุในภาพ (ลองลดค่า Score Threshold)';
                    det.style.display = 'block';
                } else det.style.display = 'none';
            }

            // ตั้งค่าปุ่มดาวน์โหลดและปุ่มหัวใจ
            $('download-btn').href = imgSrc;
            $('like-btn').textContent = '🤍';
            $('like-btn').dataset.liked = '';
            $('result-actions').style.display = 'flex';
            $('result-container').scrollIntoView({ behavior: 'smooth' });

            this.lastResult = {
                imgSrc, mode: m, model: this.state.model,
                prompt: payload.prompt, negative_prompt: payload.negative_prompt,
                seed: (gen && data.seed !== undefined) ? data.seed : payload.seed,
            };
        } catch (err) {
            $('placeholder-content').style.display = 'flex';
            alert(`เกิดข้อผิดพลาด: ${err.message}\n(ตรวจสอบว่า server.py, chat.py และ Forge Neo รันอยู่หรือไม่)`);
        } finally {
            this.setLoading(false);
        }
    }

    // ประมวลผลภาพ Blur / Canny ผ่าน OpenCV API
    async callCv(m, payload) {
        const body = m === 'blur'
            ? { image: this.state.imgDataUrl, strength: payload.blur_strength }
            : { image: this.state.imgDataUrl, low: payload.threshold_low, high: payload.threshold_high };

        const post = (url, b) => fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify(b)
        });

        let res = await post(`${API_BASE}/api/${m}`, body);
        if ([404, 405].includes(res.status)) {
            res = await post(this.api, { ...payload, image: this.state.imgDataUrl });
        }
        if (res.status === 401) { logout(); throw new Error('กรุณา login ใหม่'); }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    }

    // รอโหลดโมดูล MediaPipe ตรวจจับวัตถุในเบราว์เซอร์
    waitForDetectorModule(timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const t0 = Date.now();
            const check = () => {
                if (window.__objectDetectorModuleReady && window.runObjectDetection) return resolve();
                if (window.__objectDetectorModuleFailed) return reject(new Error('โหลดโมดูลตรวจจับวัตถุไม่ได้ (เช็คว่า chat.py รันอยู่)'));
                if (Date.now() - t0 > timeoutMs) return reject(new Error('โหลดโมดูลตรวจจับวัตถุไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต)'));
                setTimeout(check, 100);
            };
            check();
        });
    }

    // รันการตรวจจับวัตถุใน Client เครื่องผู้ใช้
    async detectLocal(dataUrl, opts) {
        await this.waitForDetectorModule();
        const img = await new Promise((ok, fail) => {
            const i = new Image();
            i.onload = () => ok(i);
            i.onerror = () => fail(new Error('เปิดไฟล์ภาพไม่ได้'));
            i.src = dataUrl;
        });

        const base = { model: opts.detect_model, maxResults: opts.max_results, threshold: opts.score_threshold };
        const t0 = performance.now();
        let result;
        try { result = await window.runObjectDetection(img, { ...base, delegate: 'GPU' }); }
        catch { result = await window.runObjectDetection(img, { ...base, delegate: 'CPU' }); }
        return { image_url: result.dataUrl, objects: result.objects, ms: Math.round(performance.now() - t0) };
    }

    // บันทึกภาพลงแกลเลอรี่ส่วนตัวของผู้ใช้
    async saveToGallery(btn) {
        if (btn.dataset.liked || !this.lastResult) return;
        btn.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/api/gallery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeader() },
                body: JSON.stringify({
                    image: this.lastResult.imgSrc,
                    mode: this.lastResult.mode,
                    model: this.lastResult.model,
                    prompt: this.lastResult.prompt,
                    negative_prompt: this.lastResult.negative_prompt,
                    seed: this.lastResult.seed,
                })
            });
            if (res.status === 401) return logout();
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            btn.textContent = '❤️';
            btn.dataset.liked = '1';
        } catch (err) {
            alert('บันทึกลงแกลเลอรี่ไม่สำเร็จ: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    }

    // จัดการ UI สถานะกำลังโหลดประมวลผล
    setLoading(loading) {
        const btn = $('submit-btn');
        if (!btn) return;
        btn.disabled = loading;
        $('btn-loader').style.display = loading ? 'inline-block' : 'none';
        $('btn-text').textContent = loading ? '✨ กำลังประมวลผล...' : this.btnLabel();

        if (loading) {
            $('placeholder-text').textContent = '✨ AI กำลังสร้างสรรค์ผลงาน...';
            $('placeholder-content').style.display = 'flex';
            $('output-image').style.display = 'none';
            $('result-actions').style.display = 'none';
        } else if ($('output-image').style.display === 'none') {
            $('placeholder-text').textContent = 'ภาพผลลัพธ์จะปรากฏที่นี่';
        }
    }
}

// ==========================================================================
// 3. ระบบหน้าจัดการผู้ใช้ (Admin Dashboard: admin.html)
// ==========================================================================
function initAdminPage() {
    let users = [], editingId = null;
    let me = null;
    try { me = JSON.parse(localStorage.getItem('forge_user') || 'null'); } catch (e) { /* ละเว้น */ }

    // ฟังก์ชันยิง API ของระบบแอดมิน
    async function api(path, options = {}) {
        const res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...authHeader(), ...(options.headers || {}) }
        });
        if (res.status === 401) { logout(); throw new Error('กรุณา login ใหม่'); }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
        return data;
    }

    // โหลดรายชื่อผู้ใช้ทั้งหมดจากฐานข้อมูล
    async function loadUsers() {
        try {
            users = (await api('/api/admin/users')).users || [];
            renderTable();
        } catch (err) {
            const body = $('users-body');
            body.innerHTML = `<tr><td colspan="7" style="color:#ef4444;">${
                err.status === 403 ? 'หน้านี้สำหรับ admin เท่านั้น กำลังพากลับหน้าหลัก...' : `โหลดไม่สำเร็จ: ${err.message}`
            }</td></tr>`;
            if (err.status === 403) setTimeout(() => location.replace('home.html'), 2000);
        }
    }

    // วาดตารางผู้ใช้และรองรับการค้นหา
    function renderTable() {
        const q = $('search-input').value.trim().toLowerCase();
        const list = users.filter(u => !q || u.username.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
        $('user-count').textContent = `${list.length} / ${users.length} คน`;

        const body = $('users-body');
        if (!list.length) {
            body.innerHTML = '<tr><td colspan="7" style="color:var(--c-text-mut);">ไม่พบผู้ใช้</td></tr>';
            return;
        }

        body.innerHTML = list.map(u => {
            const isMe = me && u.id === me.id;
            return `<tr>
                <td>${u.id}</td>
                <td>${escapeHtml(u.username)}${isMe ? ' <span class="you">(คุณ)</span>' : ''}</td>
                <td>${escapeHtml(u.email || '—')}</td>
                <td><span class="role-badge ${u.role === 'admin' ? 'admin' : ''}">${u.role}</span></td>
                <td>${u.gallery_count ?? 0}</td>
                <td>${new Date(u.created_at).toLocaleDateString('th-TH')}</td>
                <td>
                    <div class="row-actions">
                        <button class="secondary-btn btn-edit" data-id="${u.id}">✏️ แก้ไข</button>
                        ${!isMe ? `<button class="secondary-btn danger-btn btn-del" data-id="${u.id}">🗑️ ลบ</button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // เปิดหน้าต่าง Modal แก้ไขผู้ใช้
    function openEdit(id) {
        const u = users.find(x => x.id === id);
        if (!u) return;
        editingId = id;
        $('edit-title').textContent = `แก้ไขผู้ใช้: ${u.username}`;
        $('edit-username').value = u.username;
        $('edit-email').value = u.email || '';
        $('edit-role').value = u.role;
        $('edit-password').value = '';

        const isSelf = me && u.id === me.id;
        $('edit-role').disabled = !!isSelf;
        $('edit-role-hint').style.display = isSelf ? 'block' : 'none';
        $('edit-error').style.display = 'none';
        $('edit-overlay').classList.add('open');
    }

    // ปิดหน้าต่าง Modal
    function closeEdit() {
        $('edit-overlay').classList.remove('open');
        $('edit-error').style.display = 'none';
        editingId = null;
    }

    // บันทึกการแก้ไขข้อมูลผู้ใช้
    async function saveEdit() {
        const body = { username: $('edit-username').value.trim(), email: $('edit-email').value.trim() };
        if (!$('edit-role').disabled) body.role = $('edit-role').value;
        if ($('edit-password').value) body.password = $('edit-password').value;

        const btn = $('edit-save-btn');
        btn.disabled = true;
        try {
            const data = await api(`/api/admin/users/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
            if (me && editingId === me.id) {
                me = data.user;
                localStorage.setItem('forge_user', JSON.stringify(me));
                applyUser(me);
            }
            closeEdit();
            await loadUsers();
        } catch (err) {
            $('edit-error').textContent = err.message;
            $('edit-error').style.display = 'block';
        } finally {
            btn.disabled = false;
        }
    }

    // ลบบัญชีผู้ใช้พร้อมภาพในแกลเลอรี่
    async function removeUser(id) {
        const u = users.find(x => x.id === id);
        if (!u || !confirm(`ลบผู้ใช้ "${u.username}" ?\nรูปในแกลเลอรี่ (${u.gallery_count} รูป) จะถูกลบด้วยและกู้คืนไม่ได้`)) return;
        try {
            await api(`/api/admin/users/${id}`, { method: 'DELETE' });
            await loadUsers();
        } catch (err) {
            alert('ลบไม่สำเร็จ: ' + err.message);
        }
    }

    // จัดการ Event ปุ่มต่างๆ ในหน้า Admin (ใช้ Event Delegation สำหรับปุ่มในตาราง)
    $('search-input')?.addEventListener('input', renderTable);
    $('edit-save-btn')?.addEventListener('click', saveEdit);
    $('edit-cancel-btn')?.addEventListener('click', closeEdit);
    $('edit-overlay')?.addEventListener('click', e => { if (e.target === $('edit-overlay')) closeEdit(); });

    $('users-body')?.addEventListener('click', e => {
        const editBtn = e.target.closest('.btn-edit');
        const delBtn = e.target.closest('.btn-del');
        if (editBtn) openEdit(Number(editBtn.dataset.id));
        if (delBtn) removeUser(Number(delBtn.dataset.id));
    });

    loadUsers();
}

// ==========================================================================
// 4. เริ่มต้นการทำงานเมื่อ DOM โหลดเสร็จสิ้น (Entry Point)
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // โหลดข้อมูลผู้ใช้จาก Cache ในเครื่องก่อน
    try { applyUser(JSON.parse(localStorage.getItem('forge_user') || 'null')); } catch (e) { /* ละเว้น */ }

    // ซิงก์ข้อมูลผู้ใช้ล่าสุดจากเซิร์ฟเวอร์
    if (localStorage.getItem('forge_token')) {
        fetch(`${API_BASE}/api/me`, { headers: { ...authHeader() } })
            .then(async res => {
                if (res.status === 401) return logout();
                if (!res.ok) return;
                const data = await res.json();
                localStorage.setItem('forge_user', JSON.stringify(data.user));
                applyUser(data.user);
            })
            .catch(() => { /* ออฟไลน์ ให้ใช้ข้อมูลใน Cache ไปก่อน */ });
    }

    // เริ่มต้นระบบสร้างภาพ (หน้า home.html)
    if ($('generate-form')) new ForgeAIController();

    // เริ่มต้นระบบจัดการผู้ใช้ (หน้า admin.html)
    if ($('users-body')) initAdminPage();
});
