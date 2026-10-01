/**
 * @class ForgeAIController
 * @description จัดการ Logic ทั้งหมดของระบบสร้างภาพ AI แบบแยกส่วน (Clean Code Architecture)
 */
class ForgeAIController {
    constructor() {
        // 1. Initial State
        this.state = {
            mode: 'text2img',
            model: 'sd_counterfeitV30_v30',
            lora: 'none',
            seed: -1,
            sourceImageBase64: null // ตัวแปรเก็บภาพที่อัปโหลด
        };

        // 2. Cache DOM Elements
        this.elements = {
            form: document.getElementById('generate-form'),
            prompt: document.getElementById('prompt-input'),
            negativePrompt: document.getElementById('negative-prompt-input'),
            seed: document.getElementById('seed-input'),
            blurInput: document.getElementById('blur-input'),
            btnRandomSeed: document.getElementById('random-seed-btn'),
            btnSubmit: document.getElementById('submit-btn'),
            btnText: document.getElementById('btn-text'),
            btnLoader: document.getElementById('btn-loader'),
            resultContainer: document.getElementById('result-container'),
            outputImage: document.getElementById('output-image'),
            usedSeedDisplay: document.getElementById('used-seed-display'),
            seedDisplayText: document.getElementById('seed-display-text'),
            
            // Elements สำหรับกลุ่มฟอร์ม (เปิด-ปิดตามโหมด)
            groupModel: document.getElementById('group-model'),
            groupLora: document.getElementById('group-lora'),
            groupUpload: document.getElementById('group-upload'),
            groupPrompts: document.getElementById('group-prompts'),
            groupBlur: document.getElementById('group-blur-strength'),
            groupSeed: document.getElementById('group-seed'),

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
        
        console.log("[Forge AI] ระบบพร้อมใช้งาน");
    }

    /**
     * กำหนด Event Listeners ทั้งหมด
     */
    initEventListeners() {
        this.setupButtonGroup('#mode-selector .mode-tab', 'mode');
        this.setupButtonGroup('#model-selector .model-btn', 'model');
        this.setupButtonGroup('#lora-selector .lora-btn', 'lora');

        if (this.elements.btnRandomSeed) {
            this.elements.btnRandomSeed.addEventListener('click', () => {
                this.elements.seed.value = -1;
            });
        }

        if (this.elements.form) {
            this.elements.form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    }

    /**
     * Utility Function สำหรับสลับสถานะ Active ของปุ่ม
     */
    setupButtonGroup(selector, stateKey) {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                buttons.forEach(b => b.classList.remove('active'));
                // ใช้ e.currentTarget เพื่อเอา <button> เสมอ แม้คลิกโดนไอคอนด้านใน
                const clickedBtn = e.currentTarget;
                clickedBtn.classList.add('active');
                
                this.state[stateKey] = clickedBtn.getAttribute('data-value') || clickedBtn.getAttribute('data-mode');

                // ถ้าเปลี่ยนโหมด ให้ไปเรียกฟังก์ชันปรับหน้าตา UI
                if (stateKey === 'mode') {
                    this.updateUIForMode(this.state.mode);
                }
            });
        });
    }

    /**
     * จัดการซ่อน/แสดงช่องต่างๆ ตาม Mode ที่เลือก
     */
    updateUIForMode(mode) {
        // ค่าเริ่มต้นซ่อนทุกอย่างก่อน แล้วค่อยเปิดเฉพาะที่จำเป็น
        this.elements.groupModel.style.display = 'none';
        this.elements.groupUpload.style.display = 'none';
        this.elements.groupLora.style.display = 'none';
        this.elements.groupPrompts.style.display = 'none';
        this.elements.groupBlur.style.display = 'none';
        this.elements.groupSeed.style.display = 'none';

        if (mode === 'text2img') {
            this.elements.groupModel.style.display = 'block';
            this.elements.groupLora.style.display = 'block';
            this.elements.groupPrompts.style.display = 'block';
            this.elements.groupSeed.style.display = 'block';
        } 
        else if (mode === 'img2img') {
            this.elements.groupModel.style.display = 'block';
            this.elements.groupUpload.style.display = 'block';
            this.elements.groupLora.style.display = 'block';
            this.elements.groupPrompts.style.display = 'block';
            this.elements.groupSeed.style.display = 'block';
        }
        else if (mode === 'blur') {
            this.elements.groupModel.style.display = 'block';
            this.elements.groupUpload.style.display = 'block';
            this.elements.groupBlur.style.display = 'block';
        }
        else if (mode === 'canny' || mode === 'detection') {
            this.elements.groupUpload.style.display = 'block';
        }
    }

    /**
     * จัดการการอัปโหลดและพรีวิวภาพ
     */
    initImageUpload() {
        if (!this.elements.sourceInput) return;

        this.elements.sourceInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.elements.sourcePreview.src = event.target.result;
                    this.elements.uploadLabel.style.display = 'none';
                    this.elements.previewContainer.style.display = 'block';
                    // เก็บ Base64 เอาไปใช้งานต่อ
                    this.state.sourceImageBase64 = event.target.result.split(',')[1];
                };
                reader.readAsDataURL(file);
            }
        });

        // จัดการปุ่มลบรูปภาพ
        if (this.elements.btnRemoveImage) {
            this.elements.btnRemoveImage.addEventListener('click', () => {
                this.elements.sourceInput.value = ''; // เคลียร์ไฟล์ เพื่อให้อัปโหลดไฟล์เดิมซ้ำได้
                this.state.sourceImageBase64 = null;
                this.elements.sourcePreview.src = '';
                this.elements.previewContainer.style.display = 'none';
                this.elements.uploadLabel.style.display = 'flex'; // กลับมาแสดงปุ่มอัปโหลดแบบ Flex ตาม CSS
            });
        }
    }

    /**
     * ฟังก์ชันหลักในการรวบรวมข้อมูลและส่ง API
     */
    async handleSubmit(e) {
        e.preventDefault();

        // 1. สร้าง Payload พื้นฐานที่ทุกโหมดมี
        const payload = {
            mode: this.state.mode,
            model: this.state.model
        };

        // 2. เติมข้อมูลตามโหมด
        if (['text2img', 'img2img'].includes(this.state.mode)) {
            payload.lora = this.state.lora;
            payload.prompt = this.elements.prompt.value.trim();
            payload.negative_prompt = this.elements.negativePrompt.value.trim();
            payload.seed = parseInt(this.elements.seed.value, 10) || -1;
        }

        if (this.state.mode === 'blur') {
            payload.blur_strength = parseInt(this.elements.blurInput.value, 10) || 15;
        }

        // 3. ตรวจสอบการอัปโหลดรูป (ถ้าจำเป็น)
        if (this.state.mode !== 'text2img') {
            if (this.state.sourceImageBase64) {
                payload.init_image = this.state.sourceImageBase64;
            } else {
                alert("กรุณาอัปโหลดรูปภาพต้นฉบับก่อนครับ!");
                return;
            }
        }

        this.setLoadingState(true);

        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = await response.json();
            this.renderResult(data, payload);

        } catch (error) {
            console.error('[Forge AI] Generation Error:', error);
            alert(`เกิดข้อผิดพลาด: ${error.message}\n(กรุณาตรวจสอบว่า Backend API รันอยู่หรือไม่)`);
        } finally {
            this.setLoadingState(false);
        }
    }

    /**
     * จัดการสถานะ UI ระหว่างรอผลลัพธ์ (Loading)
     */
    setLoadingState(isLoading) {
        if (!this.elements.btnSubmit) return;
        this.elements.btnSubmit.disabled = isLoading;
        this.elements.btnText.textContent = isLoading ? 'กำลังประมวลผล...' : 'สร้างภาพ';
        this.elements.btnLoader.style.display = isLoading ? 'inline-block' : 'none';
    }

    /**
     * แสดงผลรูปภาพและข้อมูลที่ได้รับกลับมาจากเซิร์ฟเวอร์
     */
    renderResult(data, payloadInfo) {
        if (!data.image_url && !data.image_base64) {
            alert('ไม่พบข้อมูลรูปภาพตอบกลับจาก Backend');
            return;
        }

        this.elements.outputImage.src = data.image_url 
            ? data.image_url 
            : `data:image/png;base64,${data.image_base64}`;
        
        // ถ้าเป็นโหมดที่มีการใช้ Seed ให้แสดงข้อความ Seed
        if (['text2img', 'img2img'].includes(payloadInfo.mode)) {
            this.elements.seedDisplayText.style.display = 'block';
            this.elements.usedSeedDisplay.textContent = data.seed !== undefined ? data.seed : payloadInfo.seed;
        } else {
            // โหมดอื่นๆ เช่น Blur, Canny ซ่อนข้อความ Seed ทิ้งไป
            this.elements.seedDisplayText.style.display = 'none';
        }
        
        this.elements.resultContainer.style.display = 'block';
        this.elements.resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // โหลดเฉพาะในหน้าที่มี form generate
    if (document.getElementById('generate-form')) {
        new ForgeAIController();
    }
});