// ===== โค้ดสคริปต์หลักที่ใช้ร่วมกันในระบบ (script.js) =====
// ส่วนที่ 1: ระบบล็อกอินและเรียก API | ส่วนที่ 2: หน้าสร้างภาพ (home.html) | ส่วนที่ 3: หน้า admin

// ตัวช่วยย่อสำหรับดึง Element ตาม id
const $ = id => document.getElementById(id);

// แสดงหรือซ่อน Element ตาม id ที่ระบุ
const show = (id, on, display = 'block') => { if ($(id)) $(id).style.display = on ? display : 'none'; };


// ===== 1. ระบบยืนยันตัวตนและล็อกอิน =====

// ดึง Token จาก localStorage เพื่อใช้แนบกับ Header
const authHeader = () => {
    const token = localStorage.getItem('forge_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

// ล้างข้อมูล Token และผู้ใช้เพื่อออกจากระบบ แล้วกลับไปหน้า login
function logout() {
    localStorage.removeItem('forge_token'); // ลบ Token ยืนยันตัวตนออกจากเบราว์เซอร์
    localStorage.removeItem('forge_user'); // ลบข้อมูลโปรไฟล์ผู้ใช้ออกจากเบราว์เซอร์
    window.location.href = 'index.html'; // [จุดนำทาง] ย้ายหน้าจอไปยัง: index.html (หน้าเข้าสู่ระบบ)
}

// ตรวจสอบสถานะล็อกอิน ถ้าไม่มี Token ให้ย้ายไปหน้า login ทันที
if (!localStorage.getItem('forge_token')) window.location.replace('index.html'); // [ตรวจสอบสิทธิ์] หากไม่มี Token ในระบบ ให้พาไปหน้า: index.html ทันที

// ฟังก์ชันเรียก Backend API พร้อมแนบ Token และจัดการ Error อัตโนมัติ
async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API_BASE}${path}`, { // ส่งคำขอ HTTP ไปยัง Backend ตาม Endpoint ที่ระบุ
        method,
        headers: { 'Content-Type': 'application/json', ...authHeader() }, // แนบ Headers และ Bearer Token สำหรับยืนยันตัวตน
        body: body && JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(); throw Object.assign(new Error('กรุณา login ใหม่'), { status: 401 }); } // หาก Token หมดอายุหรือหมดสิทธิ์ (401) ให้ออกจากระบบและพาไป index.html
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
}

// อัปเดตข้อมูลผู้ใช้ในแถบ Sidebar (ชื่อ, อีเมล และเพิ่มเมนู admin ถ้ามีสิทธิ์)
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
            '<a href="admin.html" class="nav-item"><span class="icon">🛡️</span><span>จัดการผู้ใช้</span></a>'); // [เมนูแอดมิน] เพิ่มปุ่มนำทางไปหน้า: admin.html (สำหรับผู้ดูแลระบบ)
    }
}

// โหลดข้อมูลผู้ใช้เมื่อเริ่มเปิดหน้าเว็บ
document.addEventListener('DOMContentLoaded', async () => {
    try { applyUser(JSON.parse(localStorage.getItem('forge_user'))); } catch (e) { /* ข้อมูลใน localStorage เสีย ไม่เป็นไร */ }
    try {
        const { user } = await api('/api/me'); // ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบันจาก API: /api/me
        localStorage.setItem('forge_user', JSON.stringify(user)); // อัปเดตข้อมูลผู้ใช้ล่าสุดลง localStorage
        applyUser(user); // อัปเดตการแสดงผลบนแถบ Sidebar
    } catch (e) { /* ไม่ต้องทำอะไร */ }
});


// ===== 2. ระบบควบคุมหน้าสร้างภาพ (home.html) =====

// โหมดที่ต้องใช้การสร้างภาพผ่าน Prompt/Seed
const GEN_MODES = ['text2img', 'img2img'];
// ข้อความบนปุ่มกดตามแต่ละโหมดการทำงาน
const BUTTON_LABELS = { img2img: 'แปลงภาพ (Image to Image)', canny: 'ตรวจจับขอบ (Canny)', detection: 'ตรวจจับวัตถุ', blur: 'เบลอภาพ' };

// คลาสหลักสำหรับควบคุมการทำงานทั้งหมดในหน้าสร้างภาพ
class ForgeAIController {
    // กำหนดค่าเริ่มต้นของระบบสร้างภาพ
    constructor() {
        this.state = { mode: 'text2img', model: 'sd_animagineXL40_v4Opt', image: null };
        this.lastResult = null;
        this.bindEvents();
        this.updateUI();
    }

    // ผูก Event ให้กับปุ่มและฟอร์มต่างๆ ในหน้าสร้างภาพ
    bindEvents() {
        this.bindChoice('.mode-tab', 'mode'); // [ปุ่มเลือกโหมด] สลับแท็บโหมดการสร้างภาพ (Text2Img, Img2Img, Blur, Canny, Detection)
        this.bindChoice('.model-btn', 'model'); // [ปุ่มเลือกโมเดล] สลับโมเดล AI ที่ต้องการใช้สร้างภาพ
        $('random-seed-btn')?.addEventListener('click', () => $('seed-input').value = -1); // [ปุ่มคลิกสุ่ม] รีเซ็ตค่า Seed เป็น -1 เพื่อให้ AI สุ่มสร้างภาพใหม่
        $('generate-form')?.addEventListener('submit', e => this.submit(e)); // [ฟอร์มส่งข้อมูล] เมื่อกดยืนยัน จะเรียกฟังก์ชัน this.submit(e) เพื่อสั่งประมวลผล
        $('like-btn')?.addEventListener('click', e => this.saveToGallery(e.currentTarget)); // [ปุ่มคลิกถูกใจ] บันทึกรูปภาพลงแกลเลอรี่ผ่าน API: POST /api/gallery

        // เมื่อเลือกไฟล์รูปภาพต้นฉบับ ให้แปลงเป็น Base64 และแสดงภาพตัวอย่าง
        $('source-image-input')?.addEventListener('change', ({ target }) => { // [เลือกไฟล์ภาพ] อัปโหลดภาพจากเครื่องแล้วแปลงเป็น Base64 สำหรับส่งไปประมวลผล
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

        // ปุ่มลบรูปภาพต้นฉบับที่อัปโหลดไว้
        $('remove-image-btn')?.addEventListener('click', () => { // [ปุ่มคลิกลบภาพ] ล้างค่ารูปต้นฉบับที่เลือกไว้ และคืนค่ากล่องอัปโหลดภาพ
            $('source-image-input').value = '';
            this.state.image = null;
            show('image-preview-container', false);
            show('upload-label', true, 'flex');
        });
    }

    // สลับสถานะ active ของกลุ่มปุ่มตัวเลือก (เช่น โหมด, โมเดล)
    bindChoice(selector, key) {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach(btn => btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.toggle('active', b === btn));
            this.state[key] = btn.dataset.value || btn.dataset.mode;
            if (key === 'mode') this.updateUI();
        }));
    }

    // ปรับการแสดงผลฟอร์มให้ตรงกับโหมดที่กำลังเลือก
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

    // รวบรวมข้อมูลจากฟอร์มเพื่อเตรียมส่งให้ Backend
    buildPayload() {
        const m = this.state.mode;
        const num = (id, fallback, parse = parseInt) => parse($(id)?.value) || fallback;
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
            p.init_image = this.state.image.split(',')[1];
        }
        return p;
    }

    // เมื่อกดปุ่ม Submit เพื่อสั่งประมวลผลตามโหมดที่เลือก
    async submit(e) {
        e.preventDefault();
        const payload = this.buildPayload();
        if (!payload) return;
        const m = payload.mode;

        this.setLoading(true);
        try {
            let data;
            if (m === 'detection') data = await this.detectLocal(payload); // โหมด detection: รันตรวจจับวัตถุภายในเบราว์เซอร์ด้วย MediaPipe
            else if (m === 'blur' || m === 'canny') data = await this.callCv(m, payload); // โหมด OpenCV: ส่งภาพไปประมวลผลที่ API: /api/blur หรือ /api/canny
            else data = await api('/api/generate', { method: 'POST', body: payload }); // โหมดสร้างภาพ AI: ส่งพารามิเตอร์ไปประมวลผลที่ API: POST /api/generate

            if (!data.image_url && !data.image_base64) throw new Error('ไม่พบข้อมูลรูปภาพตอบกลับจาก Backend');
            this.showResult(data, payload);
        } catch (err) {
            if (err.status === 401) return;
            show('placeholder-content', true, 'flex');
            alert(`เกิดข้อผิดพลาด: ${err.message}\n(ตรวจสอบว่า server.py, chat.py และ Forge Neo รันอยู่หรือไม่)`);
        } finally {
            this.setLoading(false);
        }
    }

    // แสดงผลลัพธ์รูปภาพ ข้อมูล Seed และเปิดปุ่มดาวน์โหลด/กดถูกใจ
    showResult(data, payload) {
        const m = payload.mode;
        const gen = GEN_MODES.includes(m);
        const imgSrc = data.image_url || `data:image/png;base64,${data.image_base64}`;

        $('output-image').src = imgSrc;
        show('output-image', true);
        show('placeholder-content', false);
        show('seed-display-text', gen);
        if (gen && data.seed !== undefined) $('used-seed-display').textContent = data.seed;

        if ($('detect-result-text')) {
            const found = Object.entries(data.objects || {}).map(([name, n]) => `${name} ×${n}`);
            $('detect-result-text').textContent = found.length
                ? `ตรวจพบ: ${found.join(', ')} (ใช้เวลา ${data.ms} ms)`
                : 'ไม่พบวัตถุในภาพ (ลองลดค่า Score Threshold)';
            show('detect-result-text', m === 'detection');
        }

        $('download-btn').href = imgSrc; // [ปุ่มดาวน์โหลด] กำหนด URL ภาพผลลัพธ์ให้ปุ่มดาวน์โหลดลงเครื่อง
        $('like-btn').textContent = '🤍'; // รีเซ็ตสถานะปุ่มถูกใจให้เป็นหัวใจสีขาว
        $('like-btn').dataset.liked = '';
        show('result-actions', true, 'flex'); // แสดงปุ่มดาวน์โหลดและปุ่มบันทึกลงแกลเลอรี่
        $('result-container').scrollIntoView({ behavior: 'smooth' }); // เลื่อนมุมมองหน้าจอไปยังกล่องผลลัพธ์ภาพ

        this.lastResult = {
            image: imgSrc, mode: m, model: payload.model,
            prompt: payload.prompt, negative_prompt: payload.negative_prompt,
            seed: gen && data.seed !== undefined ? data.seed : payload.seed,
        };
    }

    // เรียก API ประมวลผลภาพสำหรับโหมด Blur และ Canny
    async callCv(m, payload) {
        const body = m === 'blur'
            ? { image: this.state.image, strength: payload.blur_strength }
            : { image: this.state.image, low: payload.threshold_low, high: payload.threshold_high };
        try {
            return await api(`/api/${m}`, { method: 'POST', body }); // ส่งคำขอไปยัง OpenCV Endpoint: POST /api/blur หรือ /api/canny
        } catch (err) {
            if (err.status !== 404 && err.status !== 405) throw err;
            return api('/api/generate', { method: 'POST', body: { ...payload, image: this.state.image } }); // Fallback ไปที่ API: POST /api/generate
        }
    }

    // รอจนกว่าโมดูล MediaPipe สำหรับตรวจจับวัตถุจะพร้อมใช้งาน
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

    // ประมวลผลตรวจจับวัตถุในเบราว์เซอร์ผ่าน MediaPipe
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
        catch { result = await window.runObjectDetection(img, { ...settings, delegate: 'CPU' }); }
        return { image_url: result.dataUrl, objects: result.objects, ms: Math.round(performance.now() - t0) };
    }

    // ปุ่มกดถูกใจ (หัวใจ): บันทึกผลลัพธ์ภาพลงแกลเลอรี่
    async saveToGallery(btn) {
        const r = this.lastResult;
        if (btn.dataset.liked || !r) return;
        btn.disabled = true; // ปิดปุ่มชั่วคราวเพื่อป้องกันการกดซ้ำ
        try {
            await api('/api/gallery', { method: 'POST', body: { // ส่งข้อมูลภาพไปบันทึกในฐานข้อมูลแกลเลอรี่ผ่าน API: POST /api/gallery
                image: r.image, mode: r.mode, model: r.model, prompt: r.prompt, negative_prompt: r.negative_prompt, seed: r.seed } });
            btn.textContent = '❤️'; // เปลี่ยนไอคอนเป็นหัวใจสีแดงเมื่อบันทึกสำเร็จ
            btn.dataset.liked = '1';
        } catch (err) {
            if (err.status !== 401) alert('บันทึกลงแกลเลอรี่ไม่สำเร็จ: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    }

    // ปรับสถานะการโหลดและอนิเมชั่นของปุ่มกด
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

// เริ่มต้นระบบสร้างภาพเมื่อโหลดหน้า home.html
document.addEventListener('DOMContentLoaded', () => { if ($('generate-form')) new ForgeAIController(); });


// ===== 3. ระบบจัดการผู้ใช้สำหรับ Admin (admin.html) =====
function initAdminPage() {
    let users = [];
    let editingId = null;
    let me = JSON.parse(localStorage.getItem('forge_user') || 'null');
    const isMe = u => me && u.id === me.id;

    // ฟังก์ชันสร้าง DOM Element แบบปลอดภัยเพื่อป้องกัน XSS
    const el = (tag, props = {}, ...children) => {
        const node = Object.assign(document.createElement(tag), props);
        node.append(...children);
        return node;
    };
    const td = (text, props) => el('td', { textContent: text ?? '—', ...props });
    const messageRow = (text, color) => el('tr', {}, td(text, { colSpan: 7, style: `color:${color}` }));

    // โหลดรายชื่อผู้ใช้ทั้งหมดจาก Backend API
    async function loadUsers() {
        try {
            users = (await api('/api/admin/users')).users || []; // ดึงข้อมูลผู้ใช้ทั้งหมดจาก API: GET /api/admin/users
            renderTable();
        } catch (err) {
            const forbidden = err.status === 403;
            $('users-body').replaceChildren(messageRow(
                forbidden ? 'หน้านี้สำหรับ admin เท่านั้น กำลังพากลับหน้าหลัก...' : `โหลดรายชื่อผู้ใช้ไม่สำเร็จ: ${err.message}`, '#ef4444'));
            if (forbidden) setTimeout(() => location.replace('home.html'), 2000); // [นำทางกลับ] หากไม่มีสิทธิ์ ให้เปลี่ยนหน้าจอไปที่: home.html
        }
    }

    // วาดตารางรายชื่อผู้ใช้ตามคำค้นหา
    function renderTable() {
        const q = $('search-input').value.trim().toLowerCase();
        const list = users.filter(u => !q || u.username.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
        $('user-count').textContent = `${list.length} / ${users.length} คน`;
        if (!list.length) return $('users-body').replaceChildren(messageRow('ไม่พบผู้ใช้', 'var(--c-text-mut)'));

        $('users-body').replaceChildren(...list.map(u => {
            const editBtn = el('button', { className: 'secondary-btn', textContent: '✏️ แก้ไข', onclick: () => openEdit(u.id) }); // [ปุ่มคลิกแก้ไข] เปิด Modal แก้ไขข้อมูลผู้ใช้คนนี้ (openEdit)
            const deleteBtn = isMe(u) ? '' :
                el('button', { className: 'secondary-btn danger-btn', textContent: '🗑️ ลบ', onclick: () => removeUser(u.id) }); // [ปุ่มคลิกลบ] ส่งคำขอลบบัญชีผู้ใช้ (removeUser) ผ่าน API: DELETE /api/admin/users/:id
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

    // เปิดหน้าต่าง Modal แก้ไขข้อมูลผู้ใช้
    function openEdit(id) {
        const u = users.find(x => x.id === id);
        editingId = id;
        $('edit-title').textContent = `แก้ไขผู้ใช้: ${u.username}`;
        $('edit-username').value = u.username;
        $('edit-email').value = u.email || '';
        $('edit-role').value = u.role;
        $('edit-password').value = '';
        $('edit-role').disabled = !!isMe(u);
        show('edit-role-hint', isMe(u));
        show('edit-error', false);
        $('edit-overlay').classList.add('open'); // เปิดแสดง Modal หน้าต่างแก้ไขข้อมูล
    }

    // ปิดหน้าต่าง Modal แก้ไขข้อมูลผู้ใช้
    const closeEdit = () => { $('edit-overlay').classList.remove('open'); editingId = null; }; // ปิดหน้าต่าง Modal และล้าง ID ที่กำลังแก้ไข

    // บันทึกข้อมูลผู้ใช้ที่แก้ไขไปยัง Backend API
    async function saveEdit() {
        const body = { username: $('edit-username').value.trim(), email: $('edit-email').value.trim() };
        if (!$('edit-role').disabled) body.role = $('edit-role').value;
        if ($('edit-password').value) body.password = $('edit-password').value;

        $('edit-save-btn').disabled = true; // ปิดปุ่มบันทึกชั่วคราวระหว่างส่งข้อมูล
        try {
            const { user } = await api(`/api/admin/users/${editingId}`, { method: 'PUT', body }); // ส่งข้อมูลที่แก้ไขไปยัง API: PUT /api/admin/users/:id
            if (editingId === me?.id) {
                me = user;
                localStorage.setItem('forge_user', JSON.stringify(me)); // อัปเดตข้อมูลผู้ใช้ใน localStorage
                applyUser(me); // อัปเดตข้อมูลบน Sidebar
            }
            closeEdit(); // ปิด Modal การแก้ไข
            await loadUsers(); // โหลดรายชื่อผู้ใช้ใหม่เพื่อแสดงข้อมูลล่าสุด
        } catch (err) {
            $('edit-error').textContent = err.message;
            show('edit-error', true);
        } finally {
            $('edit-save-btn').disabled = false;
        }
    }

    // ลบบัญชีผู้ใช้พร้อมรูปภาพทั้งหมดของผู้ใช้คนนั้น
    async function removeUser(id) {
        const u = users.find(x => x.id === id);
        if (!confirm(`ลบผู้ใช้ "${u.username}" ?\nรูปในแกลเลอรี่ของเขา (${u.gallery_count} รูป) จะถูกลบด้วย และกู้คืนไม่ได้`)) return;
        try {
            await api(`/api/admin/users/${id}`, { method: 'DELETE' }); // ส่งคำขอลบผู้ใช้ไปยัง API: DELETE /api/admin/users/:id
            await loadUsers(); // โหลดรายชื่อผู้ใช้ใหม่หลังลบเสร็จสิ้น
        } catch (err) {
            alert('ลบไม่สำเร็จ: ' + err.message);
        }
    }

    // ผูก Event ให้กับช่องค้นหาและปุ่มในหน้าต่าง Modal
    $('search-input').addEventListener('input', renderTable); // [ช่องค้นหา] กรองรายชื่อผู้ใช้ตามข้อความที่พิมพ์
    $('edit-save-btn').addEventListener('click', saveEdit); // [ปุ่มบันทึก] สั่งบันทึกข้อมูลแก้ไขผ่านฟังก์ชัน saveEdit()
    $('edit-cancel-btn').addEventListener('click', closeEdit); // [ปุ่มยกเลิก] ปิด Modal หน้าต่างแก้ไขผ่านฟังก์ชัน closeEdit()
    $('edit-overlay').addEventListener('click', e => { if (e.target === $('edit-overlay')) closeEdit(); }); // [คลิกพื้นหลัง] ปิด Modal เมื่อคลิกพื้นที่ว่างรอบนอก
    loadUsers();
}

// เริ่มต้นระบบจัดการผู้ใช้เมื่อโหลดหน้า admin.html
document.addEventListener('DOMContentLoaded', () => { if ($('users-body')) initAdminPage(); });
