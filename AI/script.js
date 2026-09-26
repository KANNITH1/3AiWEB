// ----------------------------------------------------
// 0. ค่า config ของ backend
// ----------------------------------------------------
const CHAT_API_BASE = 'http://127.0.0.1:5002';   // chat.py (text2img)
const IMG_API_BASE = 'http://127.0.0.1:5000';    // server.py (img2img / upscale)

let selectedModel = null; // เก็บ title ของโมเดลที่ผู้ใช้เลือกอยู่

document.addEventListener('DOMContentLoaded', () => {

    // ----------------------------------------------------
    // 1. ระบบจัดการ แท็บโหมด (Dynamic UI)
    // ----------------------------------------------------
    const modeTabs = document.querySelectorAll('.mode-tab');

    const uiGroups = {
        model: document.getElementById('model-group'),
        upload: document.getElementById('upload-group'),
        strength: document.getElementById('strength-group'),
        prompt: document.getElementById('prompt-group'),
        negativePrompt: document.getElementById('negative-prompt-group'),
        blur: document.getElementById('blur-group'),
        canny: document.getElementById('canny-group'),
        objects: document.getElementById('objects-group')
    };

    const modeButtonText = {
        text2img: 'สร้างภาพ',
        img2img: 'สร้างภาพ',
        blur: 'เบลอภาพ',
        canny: 'ตรวจจับขอบ (Canny)',
        objects: 'ตรวจจับวัตถุ'
    };

    if (modeTabs.length > 0) {
        modeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelector('.mode-tab.active').classList.remove('active');
                tab.classList.add('active');

                const mode = tab.dataset.mode;

                const submitBtnTextEl = document.querySelector('#submit-btn .btn-text');
                if (submitBtnTextEl) submitBtnTextEl.textContent = modeButtonText[mode] || 'สร้างภาพ';

                // เคลียร์ผลลัพธ์เก่าทุกครั้งที่สลับโหมด ไม่ให้ค้างข้ามหัวข้อ
                const resultWrapperEl = document.getElementById('result');
                const resultImageEl = document.getElementById('result-image');
                if (resultWrapperEl) resultWrapperEl.style.display = 'none';
                if (resultImageEl) resultImageEl.src = '';

                Object.values(uiGroups).forEach(group => {
                    if (group) group.classList.add('hidden');
                });

                if (mode === 'text2img') {
                    if (uiGroups.model) uiGroups.model.classList.remove('hidden');
                    if (uiGroups.prompt) uiGroups.prompt.classList.remove('hidden');
                    if (uiGroups.negativePrompt) uiGroups.negativePrompt.classList.remove('hidden');
                }
                else if (mode === 'img2img') {
                    if (uiGroups.model) uiGroups.model.classList.remove('hidden');
                    if (uiGroups.upload) uiGroups.upload.classList.remove('hidden');
                    if (uiGroups.strength) uiGroups.strength.classList.remove('hidden');
                    if (uiGroups.prompt) uiGroups.prompt.classList.remove('hidden');
                    if (uiGroups.negativePrompt) uiGroups.negativePrompt.classList.remove('hidden');
                }
                else if (mode === 'blur') {
                    if (uiGroups.upload) uiGroups.upload.classList.remove('hidden');
                    if (uiGroups.blur) uiGroups.blur.classList.remove('hidden');
                }
                else if (mode === 'canny') {
                    if (uiGroups.upload) uiGroups.upload.classList.remove('hidden');
                    if (uiGroups.canny) uiGroups.canny.classList.remove('hidden');
                }
                else if (mode === 'objects') {
                    if (uiGroups.upload) uiGroups.upload.classList.remove('hidden');
                    if (uiGroups.objects) uiGroups.objects.classList.remove('hidden');
                }
            });
        });
    }

    // ----------------------------------------------------
    // 2. ฟังก์ชันช่วยสลับปุ่มเลือก (ใช้กับ Model)
    // ----------------------------------------------------
    function setupChipSelection(selector, onSelect) {
        const chips = document.querySelectorAll(selector);
        if (chips.length > 0) {
            chips.forEach(chip => {
                chip.addEventListener('click', () => {
                    const parent = chip.closest('.style-grid');
                    parent.querySelector('.chip.active').classList.remove('active');
                    chip.classList.add('active');
                    if (typeof onSelect === 'function') onSelect(chip);
                });
            });
        }
    }

    // ----------------------------------------------------
    // 2.1 ดึงรายชื่อโมเดลจริงจาก Stability Matrix / Forge Neo
    // ----------------------------------------------------
    async function loadModels() {
        const modelGrid = document.getElementById('model-grid');
        if (!modelGrid) return;

        try {
            const res = await fetch(`${CHAT_API_BASE}/api/models`);
            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'โหลดรายชื่อโมเดลไม่สำเร็จ');
            }

            const models = data.models || [];
            if (models.length === 0) {
                modelGrid.innerHTML = '<span class="model-loading">ไม่พบโมเดลใน Forge Neo</span>';
                return;
            }

            modelGrid.innerHTML = '';
            models.forEach((m, index) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'chip' + (index === 0 ? ' active' : '');
                chip.dataset.model = m.title;
                chip.textContent = m.model_name || m.title;
                modelGrid.appendChild(chip);
            });

            selectedModel = models[0].title;

            setupChipSelection('#model-grid .chip', (chip) => {
                selectedModel = chip.dataset.model;
            });

        } catch (err) {
            modelGrid.innerHTML = '<span class="model-loading">⚠️ โหลดโมเดลไม่สำเร็จ: เช็คว่าเปิด Backend (chat.py) และ Forge Neo อยู่หรือไม่</span>';
        }
    }

    loadModels();

    // ----------------------------------------------------
    // 2.2 ระบบอัปโหลดภาพ (คลิกเลือกไฟล์ + ลากมาวาง + แสดง preview)
    // ----------------------------------------------------
    const uploadBox = document.getElementById('upload-box');
    const sourceImageInput = document.getElementById('source-image');
    const uploadPreviewEl = document.getElementById('upload-preview');

    function handleImageFile(file) {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('❌ ไฟล์ที่เลือกไม่ใช่รูปภาพ', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            uploadPreviewEl.src = e.target.result;
            uploadBox.classList.add('has-image');
        };
        reader.onerror = () => {
            showToast('❌ อ่านไฟล์ภาพไม่สำเร็จ', 'error');
        };
        reader.readAsDataURL(file);
    }

    if (uploadBox && sourceImageInput) {
        uploadBox.addEventListener('click', () => {
            sourceImageInput.click();
        });

        sourceImageInput.addEventListener('change', (e) => {
            handleImageFile(e.target.files[0]);
        });

        uploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadBox.classList.add('drag-over');
        });

        uploadBox.addEventListener('dragleave', () => {
            uploadBox.classList.remove('drag-over');
        });

        uploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadBox.classList.remove('drag-over');

            const file = e.dataTransfer.files[0];
            if (file) {
                sourceImageInput.files = e.dataTransfer.files;
                handleImageFile(file);
            }
        });
    }

    // ----------------------------------------------------
    // 2.3 Object Detection (MediaPipe Tasks Vision — ประมวลผลฝั่ง Browser ล้วนๆ)
    //     โค้ด MediaPipe จริงๆ อยู่ในไฟล์ object-detector-module.js (โหลดแบบ
    //     <script type="module">) ที่นี่แค่จัดการ UI/ค่าที่ผู้ใช้ตั้งไว้ แล้วเรียก
    //     window.runObjectDetection(...) ที่โมดูลนั้นแขวนไว้ให้
    // ----------------------------------------------------
    const objectsModelSelect = document.getElementById('objects-model');
    const objectsDelegateSelect = document.getElementById('objects-delegate');
    const objectsMaxResultsInput = document.getElementById('objects-max-results');
    const objectsMaxResultsVal = document.getElementById('objects-max-results-val');
    const objectsThresholdInput = document.getElementById('objects-threshold');
    const objectsThresholdVal = document.getElementById('objects-threshold-val');

    function getObjectsSettings() {
        return {
            model: objectsModelSelect ? objectsModelSelect.value : 'efficientdet_lite0',
            delegate: objectsDelegateSelect ? objectsDelegateSelect.value : 'GPU',
            maxResults: objectsMaxResultsInput ? parseInt(objectsMaxResultsInput.value) : 3,
            threshold: objectsThresholdInput ? parseFloat(objectsThresholdInput.value) : 0.5,
        };
    }

    if (objectsMaxResultsInput && objectsMaxResultsVal) {
        objectsMaxResultsInput.addEventListener('input', () => {
            objectsMaxResultsVal.textContent = objectsMaxResultsInput.value;
        });
    }
    if (objectsThresholdInput && objectsThresholdVal) {
        objectsThresholdInput.addEventListener('input', () => {
            objectsThresholdVal.textContent = parseFloat(objectsThresholdInput.value).toFixed(2);
        });
    }

    async function runObjectDetection(imgEl) {
        // เผื่อกดปุ่มเร็วเกินไปก่อนไฟล์ module โหลด/รัน import เสร็จ รอสูงสุด ~5 วิ
        let waited = 0;
        while (!window.runObjectDetection && waited < 5000) {
            await new Promise((r) => setTimeout(r, 100));
            waited += 100;
        }
        if (!window.runObjectDetection) {
            throw new Error('โมดูล Object Detection ยังโหลดไม่สำเร็จ (เช็คอินเทอร์เน็ต/Console แล้วลองรีเฟรชหน้าใหม่)');
        }

        const settings = getObjectsSettings();
        const { dataUrl, count } = await window.runObjectDetection(imgEl, settings);
        if (count === 0) {
            showToast('⚠️ ไม่พบวัตถุในภาพ ลองลด Score Threshold ดู', 'error');
        }
        return dataUrl;
    }

    // ----------------------------------------------------
    // 2.4 Slider ปรับระดับการเปลี่ยนแปลงจากภาพต้นฉบับ (denoising strength)
    // ----------------------------------------------------
    const strengthSlider = document.getElementById('strength-slider');
    const strengthValueLabel = document.getElementById('strength-value');

    if (strengthSlider && strengthValueLabel) {
        strengthSlider.addEventListener('input', () => {
            strengthValueLabel.textContent = strengthSlider.value;
        });
    }

    // ----------------------------------------------------
    // 3. ระบบจัดการการกด "สร้างภาพ" (Form Submit)
    // ----------------------------------------------------
    const generateForm = document.getElementById('generate-form');
    const submitBtn = document.getElementById('submit-btn');
    const resultWrapper = document.getElementById('result');
    const promptInput = document.getElementById('prompt');
    const negativePromptInput = document.getElementById('negative-prompt');

    const uploadPreview = document.getElementById('upload-preview');
    const resultImage = document.getElementById('result-image');

    const blurStrengthInput = document.getElementById('blur-strength');
    const cannyLowInput = document.getElementById('canny-low');
    const cannyHighInput = document.getElementById('canny-high');

    if (generateForm) {
        generateForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const currentMode = document.querySelector('.mode-tab.active').dataset.mode;

            if ((currentMode === 'text2img' || currentMode === 'img2img') && promptInput.value.trim() === '') {
                showToast('❌ ไม่สำเร็จ: กรุณากรอกข้อความ Prompt', 'error');
                return;
            }

            const needsModel = (currentMode === 'text2img' || currentMode === 'img2img');
            if (needsModel && !selectedModel) {
                showToast('❌ ไม่สำเร็จ: ยังไม่ได้เลือกโมเดล (หรือโหลดรายชื่อโมเดลไม่สำเร็จ)', 'error');
                return;
            }

            const negativePrompt = negativePromptInput ? negativePromptInput.value.trim() : '';

            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            resultWrapper.style.display = 'none';

            try {
                let data;

                if (currentMode === 'text2img') {
                    const res = await fetch(`${CHAT_API_BASE}/api/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: promptInput.value.trim(),
                            negative_prompt: negativePrompt,
                            model: selectedModel,
                        }),
                    });
                    data = await res.json();
                    if (!res.ok || data.error) throw new Error(data.error || 'สร้างภาพไม่สำเร็จ');

                } else if (currentMode === 'img2img') {
                    if (!uploadPreview || !uploadPreview.src) {
                        throw new Error('กรุณาอัปโหลดภาพต้นฉบับก่อน');
                    }
                    const res = await fetch(`${IMG_API_BASE}/api/img2img`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: promptInput.value.trim(),
                            negative_prompt: negativePrompt,
                            image: uploadPreview.src,
                            model: selectedModel,
                            strength: strengthSlider ? Number(strengthSlider.value) / 100 : 0.5,
                        }),
                    });
                    data = await res.json();
                    if (!res.ok || data.error) throw new Error(data.error || 'สร้างภาพไม่สำเร็จ');

                } else if (currentMode === 'blur') {
                    if (!uploadPreview || !uploadPreview.src) {
                        throw new Error('กรุณาอัปโหลดภาพต้นฉบับก่อน');
                    }
                    const res = await fetch(`${IMG_API_BASE}/api/blur`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image: uploadPreview.src,
                            strength: blurStrengthInput ? Number(blurStrengthInput.value) : 15,
                        }),
                    });
                    data = await res.json();
                    if (!res.ok || data.error) throw new Error(data.error || 'เบลอภาพไม่สำเร็จ');

                } else if (currentMode === 'canny') {
                    if (!uploadPreview || !uploadPreview.src) {
                        throw new Error('กรุณาอัปโหลดภาพต้นฉบับก่อน');
                    }
                    const res = await fetch(`${IMG_API_BASE}/api/canny`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image: uploadPreview.src,
                            low: cannyLowInput ? Number(cannyLowInput.value) : 100,
                            high: cannyHighInput ? Number(cannyHighInput.value) : 200,
                        }),
                    });
                    data = await res.json();
                    if (!res.ok || data.error) throw new Error(data.error || 'ทำ Canny edge detection ไม่สำเร็จ');

                } else if (currentMode === 'objects') {
                    if (!uploadPreview || !uploadPreview.src) {
                        throw new Error('กรุณาอัปโหลดภาพต้นฉบับก่อน');
                    }
                    // ประมวลผลฝั่ง browser ล้วนๆ ด้วย MediaPipe ไม่ต้องยิงไป backend
                    const annotatedDataUrl = await runObjectDetection(uploadPreview);
                    data = { image_url: annotatedDataUrl };

                } else {
                    throw new Error('โหมดนี้ยังไม่รองรับการเชื่อมต่อ backend');
                }

                resultImage.src = data.image_url;
                resultWrapper.style.display = 'block';
                showToast('✅ สร้างภาพสำเร็จ');

            } catch (err) {
                showToast(`❌ ไม่สำเร็จ: ${err.message}`, 'error');
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        });
    }
});

// ----------------------------------------------------
// 4. ฟังก์ชันสำหรับแจ้งเตือน Pop-up (Toast Message)
// ----------------------------------------------------
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ----------------------------------------------------
// 5. ฟังก์ชันสำหรับปุ่ม Logout
// ----------------------------------------------------
function logout() {
    const confirmLogout = confirm('คุณต้องการออกจากระบบใช่หรือไม่?');
    if (confirmLogout) {
        window.location.href = 'index.html';
    }
}