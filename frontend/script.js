// ฟังก์ชันช่วยสำหรับการดึง Element จาก ID ทำให้โค้ดสั้นลง
const $ = id => document.getElementById(id);

// ---------- ระบบล็อกอิน (ใช้ร่วมทุกหน้า) ----------
// หน้า login (index.html) ต้องเก็บผลลัพธ์จาก POST /api/login ไว้แบบนี้หลัง login สำเร็จ:
//   localStorage.setItem('forge_token', data.token);
//   localStorage.setItem('forge_user', JSON.stringify(data.user));
function authHeader() {
    const token = localStorage.getItem('forge_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function logout() {
    localStorage.removeItem('forge_token');
    localStorage.removeItem('forge_user');
    window.location.href = 'index.html';
}

// ถ้ายังไม่ได้ล็อกอิน (ไม่มี token) ให้เด้งกลับไปหน้า index.html
if (!localStorage.getItem('forge_token')) {
    window.location.replace('index.html');
}

// แสดงชื่อ/อีเมลของผู้ใช้ที่ login อยู่ใน sidebar ทุกหน้า (แทนชื่อที่เคยฝังไว้ใน HTML)
document.addEventListener('DOMContentLoaded', () => {
    try {
        const user = JSON.parse(localStorage.getItem('forge_user') || 'null');
        if (!user) return;
        const name = user.username || user.email || '';
        const nameEl = document.querySelector('.user-profile .user-name');
        const idEl = document.querySelector('.user-profile .user-id');
        const avatarEl = document.querySelector('.user-profile .avatar-placeholder');
        if (nameEl) nameEl.textContent = name || '—';
        if (idEl) idEl.textContent = user.email || '';
        if (avatarEl) avatarEl.textContent = (name || '?').slice(0, 2).toUpperCase();
    } catch (e) { /* ไม่ใช่ปัญหาใหญ่ */ }
});

class ForgeAIController {
    constructor() {
        // สถานะเริ่มต้นของระบบ (รวม lora จากฝั่ง feature branch)
        this.state = {
            mode: 'text2img',
            model: 'sd_animagineXL40_v4Opt',
            lora: 'none',
            seed: -1,
            imgBase64: null,
            imgDataUrl: null
        };
        // API_BASE มาจาก config.js
        // (ตั้ง API_BASE = '' เพื่อให้เรียกผ่าน Nginx proxy -> ใช้ได้ทั้งจากคอมและมือถือ)
        this.api = `${API_BASE}/api/generate`;
        this.init();
    }

    init() {
        // ผูกปุ่มเลือกโหมด / โมเดล / LoRA
        this.setupBtns('.mode-tab', 'mode');
        this.setupBtns('.model-btn', 'model');
        this.setupBtns('.lora-btn', 'lora'); // ถ้า HTML ใช้ class อื่นสำหรับปุ่ม LoRA ให้แก้ชื่อตรงนี้

<<<<<<< HEAD
<<<<<<< HEAD
            // Elements สำหรับการอัปโหลด
            sourceInput: document.getElementById('source-image-input'),
            previewContainer: document.getElementById('image-preview-container'),
            sourcePreview: document.getElementById('source-image-preview'),
            uploadLabel: document.getElementById('upload-label'),
            btnRemoveImage: document.getElementById('remove-image-btn')
        };

        // API Endpoint (เมื่อใช้ Nginx จะใช้แค่ /api/generate เพื่อให้ Nginx ส่งต่อให้เอง)
        this.apiEndpoint = '/api/generate';

        // 3. Initialize App
        this.initEventListeners();
        this.initImageUpload();
        this.updateUIForMode(this.state.mode); // รันครั้งแรกเพื่อให้หน้าตาถูกตามโหมดเริ่มต้น

        // ปุ่มสุ่ม Seed ให้กลับเป็น -1 (เพื่อสุ่มอัตโนมัติจาก Backend)
        $('random-seed-btn')?.addEventListener('click', () => $('seed-input').value = -1);

        
        // ผูก Event เวลากด Submit ฟอร์ม เพื่อเรียกฟังก์ชันสร้างรูป
=======
        // ปุ่มสุ่ม Seed (-1 = ให้ Backend สุ่มเอง)
        $('random-seed-btn')?.addEventListener('click', () => {
            if ($('seed-input')) $('seed-input').value = -1;
        });

        // Submit ฟอร์ม
>>>>>>> 6710301041
        $('generate-form')?.addEventListener('submit', e => this.submit(e));

        // เลือกไฟล์ภาพต้นฉบับ
        $('source-image-input')?.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                if ($('source-image-preview')) $('source-image-preview').src = ev.target.result;
                if ($('upload-label')) $('upload-label').style.display = 'none';
                if ($('image-preview-container')) $('image-preview-container').style.display = 'block';
                this.state.imgBase64 = ev.target.result.split(',')[1];
                this.state.imgDataUrl = ev.target.result;
            };
            reader.readAsDataURL(file);
        });

        // ลบภาพต้นฉบับ
        $('remove-image-btn')?.addEventListener('click', () => {
            if ($('source-image-input')) $('source-image-input').value = '';
            this.state.imgBase64 = null;
            this.state.imgDataUrl = null;
            if ($('image-preview-container')) $('image-preview-container').style.display = 'none';
            if ($('upload-label')) $('upload-label').style.display = 'flex';
        });

        // ปุ่มหัวใจ: บันทึกลงแกลเลอรี่ (เก็บที่ Backend ผูกกับบัญชีผู้ใช้)
        $('like-btn')?.addEventListener('click', e => this.saveToGallery(e.currentTarget));

        // รันครั้งแรกเพื่อให้หน้าตาถูกตามโหมดเริ่มต้น
        this.updateUI();
    }

    // ปุ่มแบบกลุ่ม (เลือกได้ทีละอัน)
    setupBtns(selector, key) {
        document.querySelectorAll(selector).forEach(btn => btn.addEventListener('click', e => {
            document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            this.state[key] = e.currentTarget.dataset.value || e.currentTarget.dataset.mode;
            if (key === 'mode') this.updateUI();
        }));
    }

    // ซ่อน/แสดงช่องกรอกตามโหมด
    updateUI() {
        const m = this.state.mode;
        const gen = ['text2img', 'img2img'].includes(m);
        const show = (id, cond) => { if ($(id)) $(id).style.display = cond ? 'block' : 'none'; };

        show('group-model', gen);
        show('group-lora', gen);
        show('group-prompts', gen);
        show('group-aspect', gen);
        show('group-seed', gen);
        show('group-strength', m === 'img2img');
        show('group-upload', m !== 'text2img'); // ต้องอัปโหลดรูปถ้าไม่ใช่ Text to Image
        show('group-blur-strength', m === 'blur');
        show('group-canny', m === 'canny');
        show('group-detection', m === 'detection');

        if ($('btn-text')) $('btn-text').textContent = this.btnLabel();
    }

    btnLabel() {
        const texts = { img2img: 'แปลงภาพ (Image to Image)', canny: 'ตรวจจับขอบ (Canny)', detection: 'ตรวจจับวัตถุ', blur: 'เบลอภาพ' };
        return texts[this.state.mode] || 'สร้างภาพ';
    }

    // ส่งข้อมูลไป Backend
    async submit(e) {
        e.preventDefault();
        const m = this.state.mode;
        const payload = { mode: m, model: this.state.model };

        if (['text2img', 'img2img'].includes(m)) {
            payload.lora = this.state.lora;
            payload.prompt = $('prompt-input')?.value.trim() || '';
            payload.negative_prompt = $('negative-prompt-input')?.value.trim() || '';
            const seed = parseInt($('seed-input')?.value);
            payload.seed = Number.isNaN(seed) ? -1 : seed;
            if ($('aspect-input')) payload.aspect_ratio = $('aspect-input').value;
            if (!payload.prompt) return alert('กรุณาใส่ Prompt ก่อนครับ');
            if (m === 'img2img') payload.strength = parseFloat($('strength-input')?.value) || 0.6;
        } else if (m === 'blur') {
            payload.blur_strength = parseInt($('blur-input').value) || 15;
        } else if (m === 'canny') {
            payload.threshold_low = parseInt($('canny-low').value) || 100;
            payload.threshold_high = parseInt($('canny-high').value) || 200;
        } else if (m === 'detection') {
            payload.score_threshold = parseFloat($('score-threshold-input').value) || 0.5;
            payload.max_results = parseInt($('max-results-input')?.value) || 10;
            payload.detect_model = $('detect-model-select')?.value || 'efficientdet_lite0';
        }

        if (m !== 'text2img') {
            if (!this.state.imgBase64) return alert('กรุณาอัปโหลดรูปภาพต้นฉบับก่อนครับ!');
            payload.init_image = this.state.imgBase64;
        }

        this.setLoading(true);
        try {
            let data;
            if (m === 'detection') {
                // ตรวจจับวัตถุในเบราว์เซอร์ด้วย MediaPipe (ไม่ต้องใช้ Backend / YOLO)
                data = await this.detectLocal(this.state.imgDataUrl, payload);
            } else if (m === 'blur' || m === 'canny') {
                data = await this.callCv(m, payload);
            } else {
                const res = await fetch(this.api, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeader() },
                    body: JSON.stringify(payload)
                });
                if (res.status === 401) { logout(); return; }  // token หมดอายุ/ไม่ถูกต้อง -> เด้งไป login
                data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            }
            if (!data.image_url && !data.image_base64) throw new Error('ไม่พบข้อมูลรูปภาพตอบกลับจาก Backend');

            const imgSrc = data.image_url || `data:image/png;base64,${data.image_base64}`;
            $('output-image').src = imgSrc;
            $('output-image').style.display = 'block';
            $('placeholder-content').style.display = 'none';

            // Seed (เฉพาะโหมดสร้างภาพ)
            const gen = ['text2img', 'img2img'].includes(m);
            $('seed-display-text').style.display = gen ? 'block' : 'none';
            if (gen && data.seed !== undefined) $('used-seed-display').textContent = data.seed;

            // ผลตรวจจับวัตถุ
            const det = $('detect-result-text');
            if (det) {
                if (m === 'detection') {
                    const parts = Object.entries(data.objects || {}).map(([k, v]) => `${k} ×${v}`);
                    det.textContent = parts.length ? `ตรวจพบ: ${parts.join(', ')} (ใช้เวลา ${data.ms} ms)` : 'ไม่พบวัตถุในภาพ (ลองลดค่า Score Threshold)';
                    det.style.display = 'block';
                } else det.style.display = 'none';
            }

            $('download-btn').href = imgSrc;
            $('like-btn').textContent = '🤍';
            $('like-btn').style.color = '';
            $('like-btn').dataset.liked = '';
            $('result-actions').style.display = 'flex';
            $('result-container').scrollIntoView({ behavior: 'smooth' });

            // เก็บไว้ให้ saveToGallery() ใช้ตอนกดหัวใจ (ต้องเก็บตอนนี้ เพราะตอนกดหัวใจ
            // ผู้ใช้อาจแก้ช่อง prompt/seed ในฟอร์มไปแล้ว ค่าจะไม่ตรงกับรูปที่แสดงอยู่)
            this.lastResult = {
                imgSrc, mode: m, model: this.state.model,
                lora: payload.lora,
                aspect_ratio: payload.aspect_ratio,
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

    // Blur / Canny: เรียก endpoint เฉพาะ /api/blur และ /api/canny (รูปแบบเดิมของ chat.py)
    //   blur : { image, strength }      canny : { image, low, high }
    // ถ้า Backend ไม่มี endpoint นี้ (404/405) จะถอยไปใช้ /api/generate พร้อม mode แทน
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
        if (res.status === 404 || res.status === 405) {
            res = await post(this.api, { ...payload, image: this.state.imgDataUrl });
        }
        if (res.status === 401) { logout(); throw new Error('กรุณา login ใหม่'); }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    }

    // ---------- Object Detection (MediaPipe, ทำงานในเบราว์เซอร์) ----------
    // ตัวตรวจจับอยู่ใน object-detector-module.js (โหลดเป็น <script type="module"> ใน home.html)
    // และเปิดฟังก์ชัน window.runObjectDetection ให้เรียกจากที่นี่
    waitForDetectorModule(timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const t0 = Date.now();
            const check = () => {
                if (window.__objectDetectorModuleReady && window.runObjectDetection) return resolve();
                if (window.__objectDetectorModuleFailed) return reject(new Error('โหลดโมดูลตรวจจับวัตถุจากเซิร์ฟเวอร์ ai ไม่ได้ (เช็คว่า chat.py รันอยู่)'));
                if (Date.now() - t0 > timeoutMs) {
                    return reject(new Error('โหลดโมดูลตรวจจับวัตถุไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต และเปิดหน้าเว็บผ่าน http:// ไม่ใช่ file://)'));
                }
                setTimeout(check, 100);
            };
            check();
        });
    }

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
        catch { result = await window.runObjectDetection(img, { ...base, delegate: 'CPU' }); }  // เครื่องที่ไม่รองรับ GPU
        const ms = Math.round(performance.now() - t0);

        return { image_url: result.dataUrl, objects: result.objects, ms };
    }

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
                    lora: this.lastResult.lora,
                    aspect_ratio: this.lastResult.aspect_ratio,
                    prompt: this.lastResult.prompt,
                    negative_prompt: this.lastResult.negative_prompt,
                    seed: this.lastResult.seed,
                })
            });
            if (res.status === 401) { logout(); return; }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

            btn.textContent = '❤️';
            btn.style.color = '#ef4444';
            btn.dataset.liked = '1';
        } catch (err) {
            alert('บันทึกลงแกลเลอรี่ไม่สำเร็จ: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    }

    setLoading(loading) {
        const btn = $('submit-btn');
        if (!btn) return;
        btn.disabled = loading;
        if ($('btn-loader')) $('btn-loader').style.display = loading ? 'inline-block' : 'none';
        if ($('btn-text')) $('btn-text').textContent = loading ? '✨ กำลังประมวลผล...' : this.btnLabel();

        if (loading) {
            if ($('placeholder-text')) $('placeholder-text').textContent = '✨ AI กำลังสร้างสรรค์ผลงาน...';
            if ($('placeholder-content')) $('placeholder-content').style.display = 'flex';
            if ($('output-image')) $('output-image').style.display = 'none';
            if ($('result-actions')) $('result-actions').style.display = 'none';
        } else if ($('output-image') && $('output-image').style.display === 'none') {
            if ($('placeholder-text')) $('placeholder-text').textContent = 'ภาพผลลัพธ์จะปรากฏที่นี่';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => $('generate-form') && new ForgeAIController());