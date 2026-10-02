// ฟังก์ชันช่วยสำหรับการดึง Element จาก ID ทำให้โค้ดสั้นลง
const $ = id => document.getElementById(id);

class ForgeAIController {
    constructor() {
        // กำหนดสถานะเริ่มต้นของระบบ เช่น โหมดเริ่มต้น โมเดลที่เลือก
        this.state = { mode: 'text2img', model: 'sd_counterfeitV30_v30', lora: 'none', seed: -1, imgBase64: null };
        // URL สำหรับเชื่อมต่อไปยัง Backend (API)
        this.api = 'http://172.20.56.243:5000/api/generate';
        this.init(); // เรียกใช้ฟังก์ชันเตรียมระบบตอนเริ่ม
    }

    // ฟังก์ชันสำหรับตั้งค่าการรับเหตุการณ์ (Events) ต่างๆ
    init() {
        // ตั้งค่าปุ่มเลือกโหมด โมเดล และ LoRA ให้ผูกกับฟังก์ชันคลิก
        this.setupBtns('.mode-tab', 'mode');
        this.setupBtns('.model-btn', 'model');
        this.setupBtns('.lora-btn', 'lora');

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
        $('generate-form')?.addEventListener('submit', e => this.submit(e));
        
        // จัดการเรื่องการอัปโหลดรูปภาพ
        $('source-image-input')?.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                $('source-image-preview').src = ev.target.result;
                $('upload-label').style.display = 'none';
                $('image-preview-container').style.display = 'block';
                this.state.imgBase64 = ev.target.result.split(',')[1];
            };
            reader.readAsDataURL(file);
        });

        $('remove-image-btn')?.addEventListener('click', () => {
            $('source-image-input').value = '';
            this.state.imgBase64 = null;
            $('image-preview-container').style.display = 'none';
            $('upload-label').style.display = 'flex';
        });

        // จัดการเวลากดปุ่มหัวใจ 🤍 เพื่อบันทึกลงแกลเลอรี่
        $('like-btn')?.addEventListener('click', (e) => {
            const imgSrc = $('output-image').src;
            if (!imgSrc || imgSrc === '') return;
            
            // ดึงข้อมูลรูปเดิมที่มีอยู่ใน Local Storage (ถ้ามี)
            const gallery = JSON.parse(localStorage.getItem('forgeAIGallery') || '[]');
            // เพิ่มรูปใหม่เข้าไปพร้อมกับบันทึกโหมดและวันที่
            gallery.push({
                src: imgSrc,
                mode: this.state.mode,
                date: new Date().toLocaleString('th-TH')
            });
            // เซฟกลับเข้า Local Storage
            localStorage.setItem('forgeAIGallery', JSON.stringify(gallery));
            
            e.currentTarget.textContent = '❤️';
            e.currentTarget.style.color = '#ef4444';
            alert('บันทึกรูปภาพลงในแกลเลอรี่เรียบร้อยแล้ว!');
        });

        this.updateUI();
    }

    // ฟังก์ชันจัดการการกดปุ่มที่เป็นกลุ่ม (เช่น ปุ่มโหมด ปุ่มโมเดล)
    setupBtns(selector, key) {
        document.querySelectorAll(selector).forEach(btn => btn.addEventListener('click', e => {
            // ลบคลาส active จากปุ่มทั้งหมดในกลุ่มนั้นก่อน
            document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
            // เพิ่มคลาส active ให้ปุ่มที่ถูกกด
            e.currentTarget.classList.add('active');
            // บันทึกค่าเก็บไว้ใน state
            this.state[key] = e.currentTarget.dataset.value || e.currentTarget.dataset.mode;
            
            // ถ้าเป็นการเปลี่ยนโหมด ให้เรียก updateUI เพื่อซ่อน/แสดงช่องกรอกข้อมูลให้ตรงกับโหมด
            if (key === 'mode') this.updateUI();
        }));
    }

    // ฟังก์ชันอัปเดตหน้าตา UI ว่าจะแสดงหรือซ่อนส่วนไหน ขึ้นอยู่กับโหมดปัจจุบัน
    updateUI() {
        const m = this.state.mode;
        // ฟังก์ชันช่วยสั้นๆ สำหรับแสดง (block) หรือซ่อน (none)
        const show = (id, cond) => { if($(id)) $(id).style.display = cond ? 'block' : 'none'; };
        
        // กำหนดเงื่อนไขการแสดงผลแต่ละส่วน
        show('group-model', ['text2img', 'img2img'].includes(m));
        show('group-lora', ['text2img', 'img2img'].includes(m));
        show('group-prompts', ['text2img', 'img2img'].includes(m));
        show('group-aspect', ['text2img', 'img2img'].includes(m));
        show('group-seed', ['text2img', 'img2img'].includes(m));
        
        show('group-upload', m !== 'text2img'); // ต้องอัปโหลดรูปถ้าไม่ใช่ Text to Image
        show('group-blur-strength', m === 'blur');
        show('group-canny', m === 'canny');
        show('group-detection', m === 'detection');

        // อัปเดตข้อความบนปุ่มกดหลัก
        if ($('btn-text')) {
            const texts = { canny: 'ตรวจจับขอบ (Canny)', detection: 'ตรวจจับวัตถุ', blur: 'เบลอภาพ' };
            $('btn-text').textContent = texts[m] || 'สร้างภาพ';
        }
    }

    // ฟังก์ชันหลักสำหรับส่งข้อมูลไปยัง Backend เพื่อสร้าง/ประมวลผลรูปภาพ
    async submit(e) {
        e.preventDefault();
        const m = this.state.mode;
        
        // เตรียมข้อมูล (Payload) ที่จะส่งไปให้เซิร์ฟเวอร์
        const payload = { mode: m, model: this.state.model };

        if (['text2img', 'img2img'].includes(m)) {
            payload.lora = this.state.lora;
            payload.prompt = $('prompt-input').value.trim();
            payload.negative_prompt = $('negative-prompt-input').value.trim();
            payload.seed = parseInt($('seed-input').value) || -1;
            if ($('aspect-input')) payload.aspect_ratio = $('aspect-input').value;
        } else if (m === 'blur') {
            payload.blur_strength = parseInt($('blur-input').value) || 15;
        } else if (m === 'canny') {
            payload.low = parseInt($('canny-low').value) || 100;
            payload.high = parseInt($('canny-high').value) || 200;
        } else if (m === 'detection') {
            payload.score_threshold = parseFloat($('score-threshold-input').value) || 0.5;
        }

        // โหมดอื่นๆ ต้องแนบรูปไปด้วยเสมอ
        if (m !== 'text2img') {
            if (!this.state.imgBase64) return alert("กรุณาอัปโหลดรูปภาพต้นฉบับก่อนครับ!");
            payload.init_image = this.state.imgBase64;
        }

        this.setLoading(true); // ปรับปุ่มให้แสดงสถานะกำลังโหลด

        try {
            // เรียกใช้ API (ส่ง HTTP POST Request ไปที่เซิร์ฟเวอร์ Backend)
            const res = await fetch(this.api, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            });
            
            if (!res.ok) throw new Error(res.status);
            const data = await res.json(); // อ่านข้อมูล JSON ที่ตอบกลับมา
            
            if (!data.image_url && !data.image_base64) return alert('ไม่พบข้อมูลรูปภาพตอบกลับจาก Backend');
            const imgSrc = data.image_url || `data:image/png;base64,${data.image_base64}`;
            $('output-image').src = imgSrc;
            
            $('seed-display-text').style.display = ['text2img', 'img2img'].includes(m) ? 'block' : 'none';
            if (data.seed !== undefined) $('used-seed-display').textContent = data.seed;
            
            // อัปเดตปุ่มดาวน์โหลดและแสดงปุ่มจัดการรูป
            if ($('download-btn')) $('download-btn').href = imgSrc;
            if ($('like-btn')) {
                $('like-btn').textContent = '🤍';
                $('like-btn').style.color = '';
            }
            if ($('result-actions')) $('result-actions').style.display = 'flex';

            if ($('placeholder-content')) $('placeholder-content').style.display = 'none';
            if ($('output-image')) $('output-image').style.display = 'block';
            
            $('result-container').scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            alert(`เกิดข้อผิดพลาด: ${err.message}\n(กรุณาตรวจสอบว่า Backend API รันอยู่หรือไม่)`);
        } finally {
            this.setLoading(false);
        }
    }

    // ฟังก์ชันเปิด/ปิดสถานะ Loading ของปุ่มและการแสดงผลกรอบรูป
    setLoading(loading) {
        const btn = $('submit-btn');
        if (!btn) return;
        
        // ปิดไม่ให้กดปุ่มซ้ำขณะโหลด และโชว์แอนิเมชันหมุนๆ
        btn.disabled = loading;
        $('btn-loader').style.display = loading ? 'inline-block' : 'none';
        
        const texts = { canny: 'ตรวจจับขอบ (Canny)', detection: 'ตรวจจับวัตถุ', blur: 'เบลอภาพ' };
        $('btn-text').textContent = loading ? '✨ กำลังประมวลผล...' : (texts[this.state.mode] || 'สร้างภาพ');
        
        if (loading && $('placeholder-text')) {
            $('placeholder-text').textContent = '✨ AI กำลังสร้างสรรค์ผลงาน...';
            $('placeholder-content').style.display = 'flex';
            $('output-image').style.display = 'none';
            // ซ่อนปุ่ม action ขณะโหลด
            if ($('result-actions')) $('result-actions').style.display = 'none';
        } else if (!loading && $('placeholder-text') && $('output-image').style.display === 'none') {
            $('placeholder-text').textContent = 'ภาพผลลัพธ์จะปรากฏที่นี่';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => $('generate-form') && new ForgeAIController());