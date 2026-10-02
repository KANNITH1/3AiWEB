// ฟังก์ชันช่วยสำหรับการดึง Element จาก ID ทำให้โค้ดสั้นลง
const $ = id => document.getElementById(id);

// ---------- ระบบล็อกอิน (ใช้ร่วมทุกหน้า) ----------
function logout() {
    localStorage.removeItem('forgeAIUser');
    window.location.href = 'index.html';
}

// ถ้ายังไม่ได้ล็อกอิน ให้เด้งกลับไปหน้า index.html (หน้านี้ไม่ได้โหลดในหน้า login/register)
if (!localStorage.getItem('forgeAIUser')) {
    window.location.replace('index.html');
}

class ForgeAIController {
    constructor() {
        // สถานะเริ่มต้นของระบบ
        this.state = { mode: 'text2img', model: 'sd_counterfeitV30_v30', lora: 'none', imgBase64: null };
        // API_BASE มาจาก config.js
        this.api = `${API_BASE}/api/generate`;
        this.init();
    }

    init() {
        // ผูกปุ่มเลือกโหมด / โมเดล / LoRA
        this.setupBtns('.mode-tab', 'mode');
        this.setupBtns('.model-btn', 'model');
        this.setupBtns('.lora-btn', 'lora');

        // ปุ่มสุ่ม Seed (-1 = ให้ Backend สุ่มเอง)
        $('random-seed-btn')?.addEventListener('click', () => $('seed-input').value = -1);

        // Submit ฟอร์ม
        $('generate-form')?.addEventListener('submit', e => this.submit(e));

        // เลือกไฟล์ภาพต้นฉบับ
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

        // ปุ่มหัวใจ: บันทึกลงแกลเลอรี่
        $('like-btn')?.addEventListener('click', e => this.saveToGallery(e.currentTarget));

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
        show('group-aspect', m === 'text2img'); // img2img ใช้ขนาดตามภาพต้นฉบับ
        show('group-seed', gen);
        show('group-strength', m === 'img2img');
        show('group-upload', m !== 'text2img');
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
            payload.prompt = $('prompt-input').value.trim();
            payload.negative_prompt = $('negative-prompt-input').value.trim();
            const seed = parseInt($('seed-input').value);
            payload.seed = Number.isNaN(seed) ? -1 : seed;
            if (!payload.prompt) return alert('กรุณาใส่ Prompt ก่อนครับ');
            if (m === 'text2img') payload.aspect_ratio = $('aspect-input').value;
            if (m === 'img2img') payload.strength = parseFloat($('strength-input').value) || 0.6;
        } else if (m === 'blur') {
            payload.blur_strength = parseInt($('blur-input').value) || 15;
        } else if (m === 'canny') {
            payload.threshold_low = parseInt($('canny-low').value) || 100;
            payload.threshold_high = parseInt($('canny-high').value) || 200;
        } else if (m === 'detection') {
            payload.score_threshold = parseFloat($('score-threshold-input').value) || 0.5;
            payload.max_results = parseInt($('max-results-input')?.value) || 3;
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
            } else {
                const res = await fetch(this.api, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
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
            $('like-btn').dataset.liked = '';
            $('result-actions').style.display = 'flex';
            $('result-container').scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            $('placeholder-content').style.display = 'flex';
            alert(`เกิดข้อผิดพลาด: ${err.message}\n(ตรวจสอบว่า server.py, chat.py และ Forge Neo รันอยู่หรือไม่)`);
        } finally {
            this.setLoading(false);
        }
    }

    // ---------- Object Detection (MediaPipe, ทำงานในเบราว์เซอร์) ----------
    async loadDetector(modelName) {
        const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0';
        if (this._detector && this._detectorModel === modelName) return this._detector;
        const { ObjectDetector, FilesetResolver } = await import(MP);
        this._vision = this._vision || await FilesetResolver.forVisionTasks(`${MP}/wasm`);
        const modelUrl = `https://storage.googleapis.com/mediapipe-models/object_detector/${modelName}/float16/1/${modelName}.tflite`;
        const make = delegate => ObjectDetector.createFromOptions(this._vision, {
            baseOptions: { modelAssetPath: modelUrl, delegate },
            runningMode: 'IMAGE'
        });
        try { this._detector = await make('GPU'); }
        catch { this._detector = await make('CPU'); }   // เครื่องที่ไม่รองรับ GPU
        this._detectorModel = modelName;
        return this._detector;
    }

    async detectLocal(dataUrl, opts) {
        const detector = await this.loadDetector(opts.detect_model);
        await detector.setOptions({ scoreThreshold: opts.score_threshold, maxResults: opts.max_results });

        const img = await new Promise((ok, fail) => {
            const i = new Image();
            i.onload = () => ok(i);
            i.onerror = () => fail(new Error('เปิดไฟล์ภาพไม่ได้'));
            i.src = dataUrl;
        });

        const t0 = performance.now();
        const result = detector.detect(img);
        const ms = Math.round(performance.now() - t0);

        // วาดภาพ + กรอบลง canvas ที่ขนาดจริงของภาพ แล้วส่งออกเป็น data URL
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const k = Math.max(1, Math.max(c.width, c.height) / 640);   // ปรับขนาดเส้น/ตัวอักษรตามภาพ
        const objects = {};
        result.detections.forEach(d => {
            const { originX: x, originY: y, width: w, height: h } = d.boundingBox;
            const cat = d.categories[0];
            const label = `${cat.categoryName} (${Math.round(cat.score * 100)}%)`;
            objects[cat.categoryName] = (objects[cat.categoryName] || 0) + 1;

            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 3 * k;
            ctx.strokeRect(x, y, w, h);

            ctx.font = `600 ${13 * k}px 'Prompt', sans-serif`;
            const tw = ctx.measureText(label).width;
            const bh = 24 * k;
            const ly = y - bh < 0 ? y : y - bh;                      // ถ้าชิดขอบบน ให้ป้ายอยู่ในกรอบ
            ctx.fillStyle = '#06b6d4';
            ctx.fillRect(x, ly, tw + 14 * k, bh);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, x + 7 * k, ly + 17 * k);
        });

        return { image_url: c.toDataURL('image/png'), objects, ms };
    }

    // ย่อภาพเป็น JPEG ก่อนเก็บลง localStorage (กันโควต้า ~5MB เต็ม)
    compressForGallery(src, maxSide = 768) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
                const c = document.createElement('canvas');
                c.width = Math.round(img.naturalWidth * s);
                c.height = Math.round(img.naturalHeight * s);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => resolve(src);
            img.src = src;
        });
    }

    async saveToGallery(btn) {
        const imgSrc = $('output-image').src;
        if (!imgSrc || btn.dataset.liked) return;
        const small = await this.compressForGallery(imgSrc);
        try {
            const gallery = JSON.parse(localStorage.getItem('forgeAIGallery') || '[]');
            gallery.push({ src: small, mode: this.state.mode, date: new Date().toLocaleString('th-TH') });
            localStorage.setItem('forgeAIGallery', JSON.stringify(gallery));
            btn.textContent = '❤️';
            btn.dataset.liked = '1';
            alert('บันทึกรูปภาพลงในแกลเลอรี่เรียบร้อยแล้ว!');
        } catch (err) {
            alert('บันทึกไม่สำเร็จ: พื้นที่เก็บข้อมูลของเบราว์เซอร์เต็ม กรุณาลบรูปเก่าในหน้าแกลเลอรี่ก่อน');
        }
    }

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

document.addEventListener('DOMContentLoaded', () => $('generate-form') && new ForgeAIController());
