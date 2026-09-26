document.addEventListener('DOMContentLoaded', () => {

    // 1. ระบบจัดการ แท็บโหมด (Dynamic UI)
    const modeTabs = document.querySelectorAll('.mode-tab');
    
    // อัปเดต uiGroups ให้รู้จัก negativePrompt
    const uiGroups = {
        upload: document.getElementById('upload-group'),
        prompt: document.getElementById('prompt-group'),
        negativePrompt: document.getElementById('negative-prompt-group'),
        blur: document.getElementById('blur-group'),
        canny: document.getElementById('canny-group')
    };

    if (modeTabs.length > 0) {
        modeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelector('.mode-tab.active').classList.remove('active');
                tab.classList.add('active');

                const mode = tab.dataset.mode; 

                // ซ่อนทุกกลุ่มก่อน
                Object.values(uiGroups).forEach(group => {
                    if (group) group.classList.add('hidden');
                });

                // แสดงผลตามโหมดที่เลือก
                if (mode === 'text2img') {
                    if(uiGroups.prompt) uiGroups.prompt.classList.remove('hidden');
                    if(uiGroups.negativePrompt) uiGroups.negativePrompt.classList.remove('hidden');
                } 
                else if (mode === 'img2img') {
                    if(uiGroups.upload) uiGroups.upload.classList.remove('hidden');
                    if(uiGroups.prompt) uiGroups.prompt.classList.remove('hidden');
                    if(uiGroups.negativePrompt) uiGroups.negativePrompt.classList.remove('hidden');
                } 
                else if (mode === 'blur') {
                    if(uiGroups.upload) uiGroups.upload.classList.remove('hidden');
                    if(uiGroups.blur) uiGroups.blur.classList.remove('hidden'); 
                } 
                else if (mode === 'canny') {
                    if(uiGroups.upload) uiGroups.upload.classList.remove('hidden');
                    if(uiGroups.canny) uiGroups.canny.classList.remove('hidden'); 
                } 
                else if (mode === 'objects') {
                    if(uiGroups.upload) uiGroups.upload.classList.remove('hidden');
                }
            });
        });
    }

    // 2. ฟังก์ชันช่วยสลับปุ่มเลือก Model
    function setupChipSelection(selector) {
        const chips = document.querySelectorAll(selector);
        if (chips.length > 0) {
            chips.forEach(chip => {
                chip.addEventListener('click', () => {
                    const parent = chip.closest('.style-grid');
                    parent.querySelector('.chip.active').classList.remove('active');
                    chip.classList.add('active');
                });
            });
        }
    }

    setupChipSelection('#model-grid .chip');

    // 3. ระบบจัดการการกด "สร้างภาพ" (Form Submit)
    const generateForm = document.getElementById('generate-form');
    const submitBtn = document.getElementById('submit-btn');
    const resultWrapper = document.getElementById('result');
    const promptInput = document.getElementById('prompt');

    if (generateForm) {
        generateForm.addEventListener('submit', (e) => {
            e.preventDefault(); 

            const currentMode = document.querySelector('.mode-tab.active').dataset.mode;

            // ตรวจสอบข้อมูลว่ากรอก Prompt หรือยัง (ใช้เฉพาะ text2img และ img2img)
            if ((currentMode === 'text2img' || currentMode === 'img2img') && promptInput.value.trim() === '') {
                showToast('❌ ไม่สำเร็จ: กรุณากรอกข้อความ Prompt', 'error');
                return; 
            }

            // แสดงสถานะ Loading
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            resultWrapper.style.display = 'none';

            // จำลองเวลาโหลด 1 วินาที
            setTimeout(() => {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                showToast('❌ ไม่สำเร็จ: ไม่สามารถเชื่อมต่อกับระบบ AI ได้', 'error');
            }, 1000);
        });
    }
});

// 4. ฟังก์ชันสำหรับแจ้งเตือน Pop-up (Toast Message)
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

// 5. ฟังก์ชันสำหรับปุ่ม Logout
function logout() {
    const confirmLogout = confirm('คุณต้องการออกจากระบบใช่หรือไม่?');
    if (confirmLogout) {
        window.location.href = 'index.html';
    }
}