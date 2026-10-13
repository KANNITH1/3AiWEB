// script.js — โค้ดหน้าเว็บที่ใช้ร่วมกัน (ทุกหน้ายกเว้น index.html / register.html)
// API_BASE มาจาก config.js (ต้องโหลดก่อนไฟล์นี้)

// ╔══════════════════════════════════════════════════════════════════╗
// ║  แผนผัง: ลำดับการทำงานของหน้าสร้างภาพ  (ไล่ดูตามเลข //1 → //10)   ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  เปิดหน้าเว็บ                                                     ║
// ║   //1  constructor()      สร้างตัวควบคุม + เก็บสถานะ              ║
// ║   //2  bindEvents()       ผูกปุ่ม/ฟอร์มเข้ากับฟังก์ชัน             ║
// ║   //3  bindChoice()       ผู้ใช้กดเลือกโหมด/โมเดล                 ║
// ║   //4  updateUI()         ซ่อน/แสดงช่องกรอกตามโหมด                ║
// ║  กดปุ่ม "สร้างภาพ"                                                ║
// ║   //5  submit()           จุดเริ่มทำงาน เลือกเส้นทางตามโหมด        ║
// ║   //6  buildPayload()     รวบรวมค่าจากฟอร์ม                       ║
// ║   //7  api()              ส่งไป Backend (text2img / img2img)      ║
// ║   //8A callCv()           เส้นทางเบลอ / หาเส้นขอบ                 ║
// ║   //8B detectLocal()      เส้นทางตรวจจับวัตถุ (ในเบราว์เซอร์)      ║
// ║   //9  showResult()       แสดงภาพผลลัพธ์                          ║
// ║  กดหัวใจ                                                          ║
// ║   //10 saveToGallery()    บันทึกลงแกลเลอรี่                        ║
// ╚══════════════════════════════════════════════════════════════════╝
// สัญลักษณ์:  ➜ //N = ไปดูขั้นที่ N ต่อ     🔗 = เชื่อมไปไฟล์อื่น

const $ = id => document.getElementById(id);   // ย่อคำสั่ง document.getElementById ด้วย id

/** ซ่อน/แสดง element ตาม id (ข้ามถ้าไม่มี element นั้นในหน้านี้) */
const show = (id, on, display = 'block') => { if ($(id)) $(id).style.display = on ? display : 'none'; };  // ฟังก์ชันช่วยสลับการแสดงผล element ตาม id

// ================= 1) ระบบล็อกอิน =================
// หน้า login เก็บผลจาก POST /api/login ไว้ใน localStorage: forge_token (JWT) และ forge_user ({id, username, email, role})
// 🔗 index.html เป็นคนเก็บค่าเหล่านี้หลัง login สำเร็จ

// สร้าง header แนบ token  →  { Authorization: "Bearer xxxx" }  (ถ้ายังไม่มี token ได้ {})
const authHeader = () => {  // สร้างอ็อบเจกต์ Header สำหรับยืนยันตัวตนด้วย Bearer token
    const token = localStorage.getItem('forge_token');  // ดึง token ที่บันทึกไว้ใน localStorage
    return token ? { Authorization: `Bearer ${token}` } : {};  // หากมี token ให้แนบ Authorization header ถ้าไม่มีคืนค่า {}
};

// ออกจากระบบ: ล้างข้อมูลล็อกอิน แล้วกลับหน้า login
function logout() {  // ฟังก์ชันออกจากระบบและล้างเซสชัน
    localStorage.removeItem('forge_token');  // ลบ JWT token ออกจากเครื่อง
    localStorage.removeItem('forge_user');  // ลบข้อมูลโปรไฟล์ผู้ใช้ออกจากเครื่อง
    window.location.href = 'index.html';  // เปลี่ยนเส้นทางกลับไปยังหน้าล็อกอิน index.html
}

// ยังไม่ได้ล็อกอิน -> กลับหน้า login
if (!localStorage.getItem('forge_token')) window.location.replace('index.html');  // ตรวจสอบ token หากยังไม่ได้ล็อกอินให้พาไปหน้า index.html ทันที

/**
 * เรียก Backend แนบ token อัตโนมัติ  คืนค่า JSON ที่ตอบกลับ
 * - 401 (token หมดอายุ/บัญชีถูกลบ) -> logout แล้ว throw (err.status = 401)
 * - สถานะอื่นที่ไม่ใช่ 2xx -> throw Error(ข้อความจาก Backend) พร้อม err.status
 */


//B7. ส่งคำขอไป Backend — ทุกการเรียก Backend ต้องผ่านฟังก์ชันนี้
//C5. ส่งคำขอไป Backend — ทุกการเรียก Backend ต้องผ่านฟังก์ชันนี้
//T6. ส่งคำขอไป Backend — ทุกการเรียก Backend ต้องผ่านฟังก์ชันนี้
//I7
async function api(path, { method = 'GET', body } = {}) {  // ส่งคำขอ HTTP Request ไปยัง Backend
    // ยิงไป API_BASE + path (API_BASE มาจาก config.js)
    const res = await fetch(`${API_BASE}${path}`, {  // เรียกใช้ fetch API ไปยังที่อยู่ API_BASE + path
        method,  // กำหนด HTTP Method เช่น GET, POST, PUT, DELETE
        headers: { 'Content-Type': 'application/json', ...authHeader() },   // แนบ header ชนิด JSON และ Authorization token
        body: body && JSON.stringify(body),  // แปลง body เป็น JSON string ถ้ามีข้อมูล
    });
    const data = await res.json().catch(() => ({}));  // แปลงผลลัพธ์เป็น JSON ถ้าไม่ใช่ให้ใช้ {}
    // 401 = ยังไม่ login / token หมดอายุ -> ออกจากระบบ
    if (res.status === 401) { logout(); throw Object.assign(new Error('กรุณา login ใหม่'), { status: 401 }); }  // ถ้าสถานะ 401 ให้ logout และแจ้งเตือน
    // error อื่น -> โยนข้อความที่ Backend ส่งมา (ไปโผล่ใน alert ของ //5)
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });  // หาก res.ok ไม่เป็นจริง โยน Error พร้อม status
    return data;  // คืนค่าข้อมูลที่ได้จาก Backend
}


/** แสดงชื่อ/อีเมลใน sidebar และเพิ่มเมนู "จัดการผู้ใช้" ถ้าเป็น admin */
function applyUser(user) {  // แสดงข้อมูลผู้ใช้บนแถบด้านข้าง (Sidebar)
    if (!user) return;  // หากไม่มีข้อมูลผู้ใช้ให้ออกจากฟังก์ชัน
    const name = user.username || user.email || '';  // ดึงชื่อผู้ใช้หรืออีเมล
    const set = (sel, text) => { const el = document.querySelector(`.user-profile ${sel}`); if (el) el.textContent = text; };  // ตัวช่วยใส่ข้อความในคลาสที่กำหนด
    set('.user-name', name || '—');  // แสดงชื่อผู้ใช้
    set('.user-id', user.email || '');  // แสดงอีเมลผู้ใช้
    set('.avatar-placeholder', (name || '?').slice(0, 2).toUpperCase());  // ดึง 2 ตัวอักษรแรกทำเป็นรูป Avatar

    const nav = document.querySelector('.nav-menu');  // ค้นหาแถบเมนูหลัก
    if (user.role === 'admin' && nav && !nav.querySelector('a[href="admin.html"]')) {  // ตรวจสอบสิทธิ์ถ้าเป็น admin และยังไม่มีเมนูผู้ดูแล
        nav.insertAdjacentHTML('beforeend',  // แทรกเมนูผู้ดูแลระบบลงท้ายเมนู
            '<a href="admin.html" class="nav-item"><span class="icon">🛡️</span><span>จัดการผู้ใช้</span></a>');  // เพิ่มลิงก์ไปยังหน้า admin.html
    }
}

document.addEventListener('DOMContentLoaded', async () => {  // รอให้โครงสร้าง DOM โหลดเสร็จสมบูรณ์
    try { applyUser(JSON.parse(localStorage.getItem('forge_user'))); } catch (e) { /* ข้อมูลใน localStorage เสีย ไม่เป็นไร */ }  // ดึงข้อมูลผู้ใช้เดิมจาก localStorage มาแสดง
    try {   // ดึงข้อมูลล่าสุด (เผื่อ admin เปลี่ยนสิทธิ์/ชื่อ หรือบัญชีถูกลบ) ถ้า Backend ปิดอยู่ก็ใช้ของเดิมไปก่อน
        const { user } = await api('/api/me');  // ขอข้อมูลผู้ใช้ล่าสุดจากเซิร์ฟเวอร์
        localStorage.setItem('forge_user', JSON.stringify(user));  // บันทึกข้อมูลล่าสุดลง localStorage
        applyUser(user);  // แสดงข้อมูลล่าสุดบน UI
    } catch (e) { /* ไม่ต้องทำอะไร */ }  // จัดการกรณีไม่สามารถติดต่อเซิร์ฟเวอร์ได้
});


// ================= 2) หน้าสร้างภาพ (home.html) =================
// โหมดที่ต้องใช้ Prompt และ Seed (ส่งไปสร้างภาพด้วย Forge Neo)
const GEN_MODES = ['text2img', 'img2img'];  // โหมดสร้างภาพที่ต้องใช้ข้อความ Prompt และค่า Seed

// ข้อความบนปุ่มส่ง ตามโหมด (text2img ไม่อยู่ในนี้ จะใช้คำว่า 'สร้างภาพ' เป็นค่าเริ่มต้น)
const BUTTON_LABELS = {  // กำหนดข้อความของปุ่มตามโหมดที่เลือก
    img2img: 'แปลงภาพ (Image to Image)',  // ข้อความปุ่มโหมดแปลงภาพ
    canny: 'ตรวจจับขอบ (Canny)',  // ข้อความปุ่มโหมดตรวจจับเส้นขอบ
    detection: 'ตรวจจับวัตถุ',  // ข้อความปุ่มโหมดตรวจจับวัตถุ
    blur: 'เบลอภาพ'  // ข้อความปุ่มโหมดเบลอภาพ
};


// ======================================================
// [AI-02] คลาสควบคุมการทำงาน AI ในหน้า home.html
// ======================================================
//T1. คลาสควบคุมการทำงาน AI ในหน้า home.html
class ForgeAIController {  // คลาสจัดการการทำงานระบบ AI และหน้าสร้างภาพ

    //B1. เริ่มต้น — ทำงานอัตโนมัติตอนเปิดหน้า (ถูกสร้างที่บรรทัดท้ายคลาส: new ForgeAIController())
    constructor() {  // ฟังก์ชันเริ่มต้นสร้างอินสแตนซ์ของคอนโทรลเลอร์
        // state = สิ่งที่ผู้ใช้เลือกอยู่ตอนนี้ (image = รูปต้นฉบับแบบ data URL)
        this.state = {  // เก็บสถานะปัจจุบันของการตั้งค่าบนหน้าเว็บ
            mode: 'text2img',  // โหมดเริ่มต้น text2img
            model: 'sd_animagineXL40_v4Opt',  // โมเดล AI เริ่มต้น
            image: null  // ข้อมูลรูปภาพต้นฉบับในรูปแบบ data URL
        };

        // ผลลัพธ์ภาพล่าสุด (ไว้ให้ //10 ใช้ตอนกดหัวใจ)
        this.lastResult = null;  // บันทึกผลลัพธ์ภาพล่าสุดสำหรับบันทึกลงแกลเลอรี่

        this.bindEvents();   // ➜ //2 ผูกการทำงานของปุ่มและฟอร์ม
        this.updateUI();     // ➜ //4 ปรับแต่งการแสดงผล UI เริ่มต้น
    }

    //2. ผูกปุ่ม/ฟอร์มเข้ากับฟังก์ชัน (ทำครั้งเดียวตอนเปิดหน้า)
    //B2 C2. ผูกปุ่ม/ฟอร์มเข้ากับฟังก์ชัน (ทำครั้งเดียวตอนเปิดหน้า)
    //T2. ผูกปุ่ม/ฟอร์มเข้ากับฟังก์ชัน (ทำครั้งเดียวตอนเปิดหน้า)
    //I1. ผูกปุ่ม/ฟอร์มเข้ากับฟังก์ชัน (ทำครั้งเดียวตอนเปิดหน้า)
    bindEvents() {  // ผูกอีเวนต์ให้กับปุ่มและส่วนประกอบต่าง ๆ ของหน้าเว็บ
        this.bindChoice('.mode-tab', 'mode');     // แท็บโหมด    ➜ //3 ผูกแท็บโหมดเข้ากับ state.mode
        this.bindChoice('.model-btn', 'model');   // ปุ่มโมเดล   ➜ //3 ผูกปุ่มโมเดลเข้ากับ state.model

        // ปุ่มสุ่ม seed: ใส่ -1 (แปลว่าให้ Forge สุ่มเอง)
        $('random-seed-btn')?.addEventListener('click', () => $('seed-input').value = -1);  // ตั้งค่า seed เป็น -1 เมื่อกดปุ่มสุ่ม

        // กดปุ่ม "สร้างภาพ" ➜ //5
        $('generate-form')?.addEventListener('submit', e => this.submit(e));  // จัดการเมื่อฟอร์มถูกส่ง (กดปุ่มสร้างภาพ)

        // กดหัวใจ ➜ //10
        $('like-btn')?.addEventListener('click', e => this.saveToGallery(e.currentTarget));  // จัดการเมื่อกดปุ่มหัวใจบันทึกลงแกลเลอรี่

        // เลือกรูปต้นฉบับ: อ่านไฟล์เป็น data URL เก็บไว้ใน state.image แล้วโชว์ตัวอย่าง
        $('source-image-input')?.addEventListener('change', ({ target }) => {  // ตรวจจับการเลือกไฟล์ภาพต้นฉบับ
            if (!target.files[0]) return;  // ออกถ้าไม่มีไฟล์ที่ถูกเลือก
            const reader = new FileReader();  // สร้าง FileReader เพื่ออ่านข้อมูลภาพ //I4
            reader.onload = ev => {  // เมื่ออ่านไฟล์เสร็จ
                this.state.image = ev.target.result;  // บันทึก data URL รูปภาพลงใน state.image
                $('source-image-preview').src = ev.target.result;  // แสดงภาพตัวอย่างใน element พรีวิว
                show('upload-label', false);  // ซ่อนกล่องอัปโหลดเดิม
                show('image-preview-container', true);  // แสดงกล่องพรีวิวภาพ
            };
            reader.readAsDataURL(target.files[0]);  // เริ่มอ่านไฟล์เป็น Data URL
        });

        // ปุ่มลบรูปต้นฉบับ
        $('remove-image-btn')?.addEventListener('click', () => {  // จัดการเมื่อกดปุ่มลบรูปต้นฉบับ
            $('source-image-input').value = '';  // ล้างค่าอินพุตไฟล์
            this.state.image = null;  // รีเซ็ตค่าภาพใน state เป็น null
            show('image-preview-container', false);  // ซ่อนกล่องพรีวิวรูป
            show('upload-label', true, 'flex');  // แสดงกล่องอัปโหลดรูปกลับขึ้นมา
        });
    }

    /** ปุ่มแบบเลือกได้ทีละอัน: ปุ่มที่กดจะ active และเก็บค่า (data-value หรือ data-mode) ลง state[key] */
    //B3 C1 I2 ผู้ใช้กดเลือกโหมด/โมเดล — เก็บค่าที่เลือกลง state
    //   selector = กลุ่มปุ่ม (เช่น '.mode-tab')   key = ชื่อใน state ที่จะเก็บ ('mode' หรือ 'model')
    bindChoice(selector, key) {  // ผูกตัวเลือกสำหรับปุ่มประเภทเลือกได้อันเดียว
        const buttons = document.querySelectorAll(selector);  // ดึงปุ่มทั้งหมดตาม selector

        buttons.forEach(btn => btn.addEventListener('click', () => {  // เพิ่ม Event Listener ให้ทุกปุ่มในกลุ่ม
            // ปุ่มที่กดได้ class 'active' ปุ่มอื่นเอาออก
            buttons.forEach(b => b.classList.toggle('active', b === btn));  // เปิดคลาส active ให้เฉพาะปุ่มที่ถูกกด

            // เก็บค่าของปุ่มที่กด (ปุ่มโมเดลใช้ data-value / แท็บโหมดใช้ data-mode)
            this.state[key] = btn.dataset.value || btn.dataset.mode;  // บันทึกค่า data-value หรือ data-mode ลง state

            // ถ้าเปลี่ยน "โหมด" ➜ //4 จัดหน้าจอใหม่
            if (key === 'mode') this.updateUI();  // ถ้าเป็นการเปลี่ยนโหมด ให้อัปเดต UI ทันที
        }));
    }

    /** ซ่อน/แสดงช่องกรอกตามโหมดที่เลือก */
    //I3 4. แสดงช่องความแรง Blur ซ่อน/แสดงช่องกรอกตามโหมด (ถูกเรียกตอนเปิดหน้า //1 และทุกครั้งที่เปลี่ยนโหมด //3)
    updateUI() {  // ปรับการแสดงผลฟิลด์ข้อมูลต่าง ๆ ตามโหมดที่เลือก
        const m = this.state.mode;  // โหมดปัจจุบัน
        const gen = GEN_MODES.includes(m);   // ตรวจสอบว่าเป็นโหมดสร้างภาพ text2img หรือ img2img

        show('group-model', gen);                  // แสดง/ซ่อน แถบเลือกโมเดล (เฉพาะโหมด AI Gen)
        show('group-prompts', gen);                // แสดง/ซ่อน ช่องกรอก Prompt (เฉพาะโหมด AI Gen)
        show('group-seed', gen);                   // แสดง/ซ่อน ช่องกรอก Seed (เฉพาะโหมด AI Gen)
        show('group-strength', m === 'img2img');   // แสดง/ซ่อน ช่องปรับความแรงการแปลง (เฉพาะ img2img)
        show('group-upload', m !== 'text2img');    // แสดง/ซ่อน กล่องอัปโหลดรูป (ทุกโหมดยกเว้น text2img)
        show('group-blur-strength', m === 'blur'); // แสดง/ซ่อน ช่องปรับความแรงเบลอ (เฉพาะโหมด blur)
        show('group-canny', m === 'canny');        // แสดง/ซ่อน ช่องปรับค่าเกณฑ์ Canny (เฉพาะ canny)
        show('group-detection', m === 'detection'); // แสดง/ซ่อน ช่องปรับค่าการตรวจจับวัตถุ (เฉพาะ detection)

        // เปลี่ยนข้อความบนปุ่มตามโหมด
        if ($('btn-text')) $('btn-text').textContent = BUTTON_LABELS[m] || 'สร้างภาพ';  // กำหนดข้อความปุ่มกดตามโหมด
    }

    /** รวมค่าจากฟอร์มเป็น payload ที่ส่งให้ Backend (คืน null ถ้ากรอกไม่ครบ พร้อมแจ้งผู้ใช้) */
    //6. รวบรวมค่าจากฟอร์มเป็น payload (กล่องข้อมูลที่จะส่งไป Backend)
    //B4.อ่านค่าความแรง Blur
    //C2.อ่านค่าความแรง Canny
    //O2.อ่านค่าความแรงตรวจจับวัตถุ
    //T4. รวบรวมค่าจากฟอร์มเป็น payload (กล่องข้อมูลที่จะส่งไป Backend)
    //6. รวบรวมค่าจากฟอร์มเป็น payload (กล่องข้อมูลที่จะส่งไป Backend)
    buildPayload() {  // รวบรวมค่าพารามิเตอร์ทั้งหมดในฟอร์มเพื่อส่งไปยัง Backend
        const m = this.state.mode;  // โหมดปัจจุบัน
        // อ่านตัวเลขจากช่อง ถ้าว่าง/ไม่ใช่ตัวเลข ใช้ค่าสำรอง (⚠️ ค่า 0 จริงๆ ก็ถูกแทนด้วยค่าสำรองด้วย)
        const num = (id, fallback, parse = parseInt) => parse($(id)?.value) || fallback;  // ฟังก์ชันแปลงค่าเป็นตัวเลขพร้อมค่าสำรอง
        const p = { mode: m, model: this.state.model };  // สร้างอ็อบเจกต์ payload ระบุ mode และ model

        if (GEN_MODES.includes(m)) {  // เงื่อนไขสำหรับโหมดสร้างภาพ AI
            // โหมดสร้างภาพ: prompt, negative prompt, seed
            p.prompt = $('prompt-input').value.trim();  // อ่านค่า prompt และตัดช่องว่าง
            p.negative_prompt = $('negative-prompt-input').value.trim();  // อ่านค่า negative prompt
            const seed = parseInt($('seed-input').value);  // อ่านค่า seed และแปลงเป็นจำนวนเต็ม
            p.seed = Number.isNaN(seed) ? -1 : seed;   // ไม่ใช่ตัวเลข = -1 (สุ่ม)
            if (!p.prompt) return alert('กรุณาใส่ Prompt ก่อนครับ');   // ไม่ใส่ prompt -> เตือนแล้วหยุด คืน null
            if (m === 'img2img') p.strength = num('strength-input', 0.6, parseFloat);  // อ่านค่าน้ำหนักการดัดแปลงภาพ (default 0.6)
        } else if (m === 'blur') {  // เงื่อนไขสำหรับโหมดเบลอภาพ
            p.blur_strength = num('blur-input', 15);  // อ่านค่าความแรงการเบลอ (default 15)
        } else if (m === 'canny') {  // เงื่อนไขสำหรับโหมดหาเส้นขอบ
            p.threshold_low = num('canny-low', 100);  // อ่านเกณฑ์ต่ำ threshold_low (default 100)
            p.threshold_high = num('canny-high', 200);  // อ่านเกณฑ์สูง threshold_high (default 200)
        } else if (m === 'detection') {  // เงื่อนไขสำหรับโหมดตรวจจับวัตถุ
            p.score_threshold = num('score-threshold-input', 0.5, parseFloat);  // อ่านเกณฑ์คะแนนความมั่นใจ (default 0.5)
            // ⚠️ home.html ยังไม่มีช่อง max-results-input และ detect-model-select
            //    ตอนนี้จึงได้ค่าสำรองเสมอ (10 และ 'efficientdet_lite0') ถ้าอยากให้ผู้ใช้ปรับได้ ต้องเพิ่มช่องใน home.html
            p.max_results = num('max-results-input', 10);  // อ่านจำนวนวัตถุสูงสุด (default 10)
            p.detect_model = $('detect-model-select')?.value || 'efficientdet_lite0';  // อ่านโมเดลตรวจจับ (default efficientdet_lite0)
        }

        // ทุกโหมดที่ไม่ใช่ text2img ต้องมีรูปต้นฉบับ
        if (m !== 'text2img') {  // ตรวจสอบว่าโหมดนี้ต้องการภาพต้นฉบับหรือไม่
            if (!this.state.image) return alert('กรุณาอัปโหลดรูปภาพต้นฉบับก่อนครับ!');  // แจ้งเตือนหากไม่มีรูปภาพต้นฉบับ
            p.init_image = this.state.image.split(',')[1];   // base64 ล้วน (ตัด "data:image/...;base64," ออก)
        }
        return p;  // คืนค่า payload สมบูรณ์
    }

    //B5. ผู้ใช้กดปุ่ม "สร้างภาพ" — จุดเริ่มทำงานจริง ตัดสินว่าจะไปเส้นทางไหน
    //C3. ผู้ใช้กดปุ่ม "สร้างภาพ" — จุดเริ่มทำงานจริง ตัดสินว่าจะไปเส้นทางไหน
    //O3  
    //T3. 
    //T5. ผู้ใช้กดปุ่ม "สร้างภาพ" — จุดเริ่มทำงานจริง ตัดสินว่าจะไปเส้นทางไหน
    //I5
    async submit(e) {  // จุดเริ่มต้นกระบวนการเมื่อกดปุ่มสร้างภาพ
        e.preventDefault();                      // ป้องกันการรีโหลดหน้าเว็บของฟอร์ม
        const payload = this.buildPayload();     // ➜ //6 รวบรวมข้อมูลเป็น payload
        if (!payload) return;                    // หากข้อมูลไม่ครบถ้วนให้ยกเลิกการทำงาน
        const m = payload.mode;  // ดึงโหมดจาก payload

        this.setLoading(true);                   // ปิดปุ่ม + แสดงสถานะกำลังประมวลผล
        try {  // ลองประมวลผลตามเส้นทางของแต่ละโหมด
            let data;  // ตัวแปรเก็บข้อมูลผลลัพธ์
            // เลือกเส้นทางตามโหมด (3 ทาง)
            if (m === 'detection') data = await this.detectLocal(payload);   //ไม่ส่งไปไหน ทำในเบราว์เซอร์ ➜ //O4
            else if (m === 'blur' || m === 'canny') data = await this.callCv(m, payload);   //ส่งไปเบลอ/หาเส้นขอบ //B6 C4
            else data = await api('/api/generate', { method: 'POST', body: payload });      // ส่งไปสร้างภาพ ➜ //T5 I6

            if (!data.image_url && !data.image_base64) throw new Error('ไม่พบข้อมูลรูปภาพตอบกลับจาก Backend');  // ตรวจสอบว่ามีข้อมูลรูปภาพตอบกลับหรือไม่
            this.showResult(data, payload);      // ได้ภาพแล้ว ➜ //9 นำภาพไปแสดงผล
        } catch (err) {  // จัดการกรณีเกิดข้อผิดพลาด
            if (err.status === 401) return;      // token หมดอายุ: api() พาไปหน้า login แล้ว ไม่ต้องแจ้งซ้ำ
            show('placeholder-content', true, 'flex');  // แสดง placeholder เดิม
            alert(`เกิดข้อผิดพลาด: ${err.message}\n(ตรวจสอบว่า server.py, chat.py และ Forge Neo รันอยู่หรือไม่)`);  // แจ้งเตือนข้อผิดพลาด
        } finally {  // สิ้นสุดกระบวนการ
            this.setLoading(false);              // ปิดสถานะโหลดเสมอ ไม่ว่าสำเร็จหรือพลาด
        }
    }

    /** แสดงภาพผลลัพธ์ + seed/ผลตรวจจับ + ปุ่มดาวน์โหลด/หัวใจ */
    //9. แสดงภาพผลลัพธ์บนหน้าเว็บ (ทุกเส้นทางมาจบที่นี่)
    //   ➜ เก็บผลไว้ใน lastResult แล้วรอผู้ใช้กดหัวใจ ➜ //10
    //B13 C10 O9 T17 I17
    showResult(data, payload) {  // แสดงผลลัพธ์ภาพ ข้อมูล seed และปุ่มต่าง ๆ
        const m = payload.mode;  // โหมดที่ประมวลผล
        const gen = GEN_MODES.includes(m);  // ตรวจสอบว่าเป็นโหมดสร้างภาพหรือไม่
        const imgSrc = data.image_url || `data:image/png;base64,${data.image_base64}`;  // ดึง URL ของภาพหรือสร้าง data URL จาก base64

        // ใส่ภาพ และสลับจาก placeholder เป็นภาพจริง
        $('output-image').src = imgSrc;  // ใส่ที่อยู่ภาพลงในแท็ก img
        show('output-image', true);  // แสดงภาพผลลัพธ์
        show('placeholder-content', false);  // ซ่อนกล่อง placeholder

        // โชว์ seed ที่ใช้จริง (เฉพาะโหมดสร้างภาพ)
        show('seed-display-text', gen);  // แสดงแถบข้อความ seed (เฉพาะโหมด AI Gen)
        if (gen && data.seed !== undefined) $('used-seed-display').textContent = data.seed;  // แสดงตัวเลข seed ที่ใช้จริง

        // โหมดตรวจจับวัตถุ: โชว์รายชื่อวัตถุที่เจอ + เวลาที่ใช้
        if ($('detect-result-text')) {  // ตรวจสอบว่ามี element สำหรับแสดงผลการตรวจจับวัตถุหรือไม่
            const found = Object.entries(data.objects || {}).map(([name, n]) => `${name} ×${n}`);  // จัดรูปแบบรายการวัตถุที่พบ เช่น 'person x2'
            $('detect-result-text').textContent = found.length  // อัปเดตข้อความผลการตรวจจับ
                ? `ตรวจพบ: ${found.join(', ')} (ใช้เวลา ${data.ms} ms)`  // รายการวัตถุที่ตรวจพบพร้อมระยะเวลา
                : 'ไม่พบวัตถุในภาพ (ลองลดค่า Score Threshold)';  // ข้อความเมื่อไม่พบวัตถุใด ๆ
            show('detect-result-text', m === 'detection');  // แสดงผลเฉพาะโหมดตรวจจับวัตถุ
        }

        // ปุ่มดาวน์โหลด + รีเซ็ตปุ่มหัวใจ + เลื่อนหน้าลงมาที่ผลลัพธ์
        $('download-btn').href = imgSrc;  // ผูกลิงก์ดาวน์โหลดภาพผลลัพธ์
        $('like-btn').textContent = '🤍';  // รีเซ็ตไอคอนหัวใจเป็นสีขาว (ยังไม่ได้กดไลก์)
        $('like-btn').dataset.liked = '';  // ล้างสถานะการกดไลก์
        show('result-actions', true, 'flex');  // แสดงกลุ่มปุ่มดำเนินการ (ดาวน์โหลด/ไลก์)
        $('result-container').scrollIntoView({ behavior: 'smooth' });  // เลื่อนหน้าจอลงมายังกล่องผลลัพธ์อย่างนุ่มนวล

        // เก็บค่าตอนนี้ไว้ เพราะตอนกดหัวใจผู้ใช้อาจแก้ฟอร์มไปแล้ว ค่าจะไม่ตรงกับภาพที่แสดงอยู่
        this.lastResult = {  // บันทึกข้อมูลผลลัพธ์ลง lastResult สำหรับใช้งานตอนบันทึกลงแกลเลอรี่
            image: imgSrc, mode: m, model: payload.model,  // บันทึกรูปภาพ, โหมด, โมเดล
            prompt: payload.prompt, negative_prompt: payload.negative_prompt,  // บันทึก prompt และ negative prompt
            seed: gen && data.seed !== undefined ? data.seed : payload.seed,  // บันทึก seed ที่ใช้งานจริง
        };
    }

    /** Blur/Canny: เรียก /api/blur หรือ /api/canny ถ้า Backend ไม่มี (404/405) ถอยไปใช้ /api/generate พร้อม mode */
    //B6. เส้นทางเบลอ / หาเส้นขอบ (ใช้ OpenCV ที่ ai/chat.py ไม่ผ่าน Forge)
    //C4
    async callCv(m, payload) {  // เรียก API ประมวลผลภาพ OpenCV (เบลอ หรือ หาเส้นขอบ)
        const body = m === 'blur'  // ตรวจสอบเพื่อสร้าง body ให้ตรงกับโหมด
            ? { image: this.state.image, strength: payload.blur_strength }  // โหมด blur: ส่งรูปและค่าความแรงเบลอ
            : { image: this.state.image, low: payload.threshold_low, high: payload.threshold_high };  // โหมด canny: ส่งรูปและเกณฑ์ low, high
        try {  // ลองเรียก API ประมวลผลเฉพาะโหมด
            return await api(`/api/${m}`, { method: 'POST', body });  // ยิง POST ไปที่ /api/blur หรือ /api/canny
        } catch (err) {  // ดักจับข้อผิดพลาดกรณี route ไม่รองรับ
            if (err.status !== 404 && err.status !== 405) throw err;   // error อื่นให้ไปแจ้งผู้ใช้ตามปกติ
            return api('/api/generate', { method: 'POST', body: { ...payload, image: this.state.image } });  // ถอยไปใช้ /api/generate แบบรวมโหมดแทน
        }
    }

    // ---------- ตรวจจับวัตถุ (MediaPipe ในเบราว์เซอร์) ----------
    // ตัวตรวจจับอยู่ที่ ai/object-detector-module.js (home.html โหลดเป็น module แล้วเปิด window.runObjectDetection)
//O4. เส้นทางตรวจจับวัตถุ — ทำในเบราว์เซอร์ ไม่ส่งไป Backend
    /** รอจนโมดูลตรวจจับวัตถุพร้อมใช้ (โหลดพลาด/นานเกิน -> throw) */
    //  รอจนไฟล์ ai/object-detector-module.js โหลดเสร็จ (เช็คทุก 0.1 วิ รอได้ 15 วิ)
    waitForDetectorModule(timeoutMs = 15000) {  // ฟังก์ชันรอโหลดโมดูลตรวจจับวัตถุจนกว่าจะพร้อมทำงาน
        return new Promise((resolve, reject) => {  // สร้าง Promise เพื่อรอโมดูล
            const t0 = Date.now();  // บันทึกเวลาเริ่มต้นรอ
            const check = () => {  // ฟังก์ชันย่อยสำหรับตรวจสอบสถานะ
                // พร้อมแล้ว (โมดูลตั้งค่านี้ไว้ท้ายไฟล์ของมัน)
                if (window.__objectDetectorModuleReady && window.runObjectDetection) return resolve();  // พร้อมแล้ว คืนค่า resolve สำเร็จ
                // โหลดล้มเหลว (home.html ตั้งค่านี้ตอนโหลดไฟล์ไม่ได้)
                if (window.__objectDetectorModuleFailed)  // ถ้ามีสถานะแจ้งเตือนว่าโหลดล้มเหลว
                    return reject(new Error('โหลดโมดูลตรวจจับวัตถุจากเซิร์ฟเวอร์ ai ไม่ได้ (เช็คว่า chat.py รันอยู่)'));  // คืนค่า reject แจ้งเตือนข้อผิดพลาด
                // รอนานเกิน (มักเกิดจากไม่มีอินเทอร์เน็ต หรือเปิดด้วย file://)
                if (Date.now() - t0 > timeoutMs)  // ถ้ารอนานเกินเวลา timeout ที่กำหนด
                    return reject(new Error('โหลดโมดูลตรวจจับวัตถุไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต และเปิดหน้าเว็บผ่าน http:// ไม่ใช่ file://)'));  // คืนค่า reject timeout
                setTimeout(check, 100);   // ยังไม่พร้อม ลองใหม่ใน 0.1 วิ
            };
            check();  // เริ่มตรวจสอบครั้งแรก
        });
    }

    //O5. เส้นทางตรวจจับวัตถุ — ทำในเบราว์เซอร์ ไม่ส่งไป Backend
    async detectLocal(opts) {  // ฟังก์ชันรันการตรวจจับวัตถุบนเบราว์เซอร์ผ่านโมดูล
        await this.waitForDetectorModule();   // รอโมดูลพร้อมทำงาน

        // แปลง data URL เป็น <img> (MediaPipe ต้องการ element ภาพ)
        const img = await new Promise((resolve, reject) => {  // สร้าง Promise เพื่อแปลง data URL เป็น element Image
            const i = new Image();  // สร้างอ็อบเจกต์ Image
            i.onload = () => resolve(i);  // เมื่อโหลดภาพเสร็จสิ้น คืน element ภาพ
            i.onerror = () => reject(new Error('เปิดไฟล์ภาพไม่ได้'));  // กรณีโหลดภาพไม่สำเร็จ
            i.src = this.state.image;  // กำหนด source ภาพจาก state.image
        });

        // ตั้งชื่อ key ให้ตรงกับที่โมดูลต้องการ
        const settings = { model: opts.detect_model, maxResults: opts.max_results, threshold: opts.score_threshold };  // เตรียมข้อมูลการตั้งค่าสำหรับโมดูล
        const t0 = performance.now();   // จับเวลาเริ่มต้นประมวลผล
        let result;  // ตัวแปรเก็บผลลัพธ์
        // ลอง GPU ก่อน ถ้าไม่ได้ใช้ CPU
        try { result = await window.runObjectDetection(img, { ...settings, delegate: 'GPU' }); }  // ทดลองตรวจจับโดยใช้ GPU
        catch { result = await window.runObjectDetection(img, { ...settings, delegate: 'CPU' }); }   // เครื่องที่ไม่รองรับ GPU ให้ใช้ CPU แทน
        // คืนรูปแบบเดียวกับที่ //9 ใช้: ภาพที่วาดกรอบแล้ว + รายชื่อวัตถุ + เวลา (ms)
        return { image_url: result.dataUrl, objects: result.objects, ms: Math.round(performance.now() - t0) };  // คืนค่า dataUrl, objects และเวลาที่ใช้
    }

    /** ปุ่มหัวใจ: บันทึกผลล่าสุดลงแกลเลอรี่ (กดซ้ำไม่ได้) */
    //10. ผู้ใช้กดหัวใจ — บันทึกผลล่าสุด (lastResult จาก //9) ลงแกลเลอรี่
    async saveToGallery(btn) {  // บันทึกผลงานภาพล่าสุดลงระบบแกลเลอรี่
        const r = this.lastResult;  // ดึงข้อมูลผลงานล่าสุด
        if (btn.dataset.liked || !r) return;   // กดไปแล้ว หรือยังไม่มีผลลัพธ์ -> ไม่ทำอะไร
        btn.disabled = true;                   // กันกดรัว ปิดปุ่มชั่วคราว
        try {  // ลองส่งคำขอบันทึกผลงาน
            await api('/api/gallery', { method: 'POST', body: {  // ส่งคำขอ POST ไปยัง /api/gallery
                image: r.image, mode: r.mode, model: r.model, prompt: r.prompt, negative_prompt: r.negative_prompt, seed: r.seed } });  // แนบข้อมูลภาพและรายละเอียด
            btn.textContent = '❤️';            // สำเร็จ: เปลี่ยนเป็นหัวใจแดง
            btn.dataset.liked = '1';           // ทำเครื่องหมายว่ากดแล้ว
        } catch (err) {  // กรณีเกิดข้อผิดพลาด
            if (err.status !== 401) alert('บันทึกลงแกลเลอรี่ไม่สำเร็จ: ' + err.message);  // แจ้งเตือนข้อผิดพลาด
        } finally {  // คืนสถานะปุ่ม
            btn.disabled = false;  // เปิดให้กดปุ่มได้อีกครั้ง
        }
    }

    // ตัวช่วยของ //5: เปิด/ปิดสถานะ "กำลังประมวลผล" (on = true เริ่มโหลด / false จบ)
    setLoading(on) {  // ควบคุมสถานะการโหลดและปุ่มประมวลผล
        const btn = $('submit-btn');  // อ้างอิงปุ่มกดส่งคำขอ
        if (!btn) return;  // ออกถ้าไม่พบปุ่ม
        btn.disabled = on;                           // ระหว่างโหลดปิดปุ่ม
        show('btn-loader', on, 'inline-block');      // ตัวหมุนอนิเมชั่น
        $('btn-text').textContent = on ? '✨ กำลังประมวลผล...' : (BUTTON_LABELS[this.state.mode] || 'สร้างภาพ');  // เปลี่ยนข้อความบนปุ่ม

        if (on) {  // กรณีเริ่มต้นการประมวลผล
            // เริ่มโหลด: ซ่อนภาพเก่า โชว์ข้อความรอ
            $('placeholder-text').textContent = '✨ AI กำลังสร้างสรรค์ผลงาน...';  // ข้อความรอการประมวลผล
            show('placeholder-content', true, 'flex');  // แสดงกล่องรอแบบ flex
            show('output-image', false);  // ซ่อนภาพผลลัพธ์เดิม
            show('result-actions', false);  // ซ่อนกลุ่มปุ่มดำเนินการ
        } else if ($('output-image').style.display === 'none') {  // กรณีประมวลผลเสร็จแต่ไม่มีภาพใหม่แสดง
            // จบแต่ไม่มีภาพใหม่ (เกิด error): คืนข้อความเริ่มต้น
            $('placeholder-text').textContent = 'ภาพผลลัพธ์จะปรากฏที่นี่';  // รีเซ็ตข้อความเริ่มต้น
        }
    }
}


document.addEventListener('DOMContentLoaded', () => { if ($('generate-form')) new ForgeAIController(); });  // สร้างอินสแตนซ์ ForgeAIController เมื่อมี element #generate-form


// ================= 3) หน้าจัดการผู้ใช้ (admin.html) =================
// ทำงานเฉพาะหน้าที่มีตาราง #users-body  (สิทธิ์ admin ตรวจที่ Backend จริง ฝั่งนี้แค่แสดงผล)
function initAdminPage() {  // ฟังก์ชันเริ่มต้นการทำงานหน้าจัดการผู้ใช้ของผู้ดูแลระบบ
    let users = [];  // อาร์เรย์เก็บข้อมูลผู้ใช้ทั้งหมด
    let editingId = null;  // ตัวแปรเก็บ id ผู้ใช้ที่กำลังถูกแก้ไข
    let me = JSON.parse(localStorage.getItem('forge_user') || 'null');  // ดึงข้อมูลบัญชีผู้ใช้ปัจจุบัน
    const isMe = u => me && u.id === me.id;  // ฟังก์ชันตรวจสอบว่าเป็นบัญชีของตนเองหรือไม่

    // สร้าง element ด้วย textContent (ไม่ใช้ innerHTML กับข้อมูลผู้ใช้ กัน XSS)
    const el = (tag, props = {}, ...children) => {  // ฟังก์ชันสร้าง DOM Element ป้องกันช่องโหว่ XSS
        const node = Object.assign(document.createElement(tag), props);  // สร้าง element และผูก properties
        node.append(...children);  // เพิ่ม child nodes
        return node;  // คืน element ที่สร้าง
    };
    const td = (text, props) => el('td', { textContent: text ?? '—', ...props });  // ฟังก์ชันสร้างเซลล์ตาราง td
    const messageRow = (text, color) => el('tr', {}, td(text, { colSpan: 7, style: `color:${color}` }));  // สร้างแถวตารางแสดงข้อความแจ้งเตือน

    async function loadUsers() {  // โหลดรายชื่อผู้ใช้ทั้งหมดจาก API
        try {  // พยายามดึงข้อมูลจาก API ผู้ดูแลระบบ
            users = (await api('/api/admin/users')).users || [];  // ดึงรายการผู้ใช้จาก /api/admin/users
            renderTable();  // วาดตารางแสดงผลรายชื่อผู้ใช้
        } catch (err) {  // จัดการกรณีเกิดข้อผิดพลาด
            const forbidden = err.status === 403;  // ตรวจสอบว่าถูกปฏิเสธสิทธิ์ (403 Forbidden) หรือไม่
            $('users-body').replaceChildren(messageRow(  // แสดงข้อความ error ในตาราง
                forbidden ? 'หน้านี้สำหรับ admin เท่านั้น กำลังพากลับหน้าหลัก...' : `โหลดรายชื่อผู้ใช้ไม่สำเร็จ: ${err.message}`, '#ef4444'));
            if (forbidden) setTimeout(() => location.replace('home.html'), 2000);  // ถ้าไม่มีสิทธิ์ให้เปลี่ยนกลับหน้า home.html ใน 2 วินาที
        }
    }

    function renderTable() {  // วาดตารางรายชื่อผู้ใช้พร้อมระบบค้นหา
        const q = $('search-input').value.trim().toLowerCase();  // ข้อความค้นหาแปลงเป็นตัวพิมพ์เล็ก
        const list = users.filter(u => !q || u.username.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));  // กรองผู้ใช้ตามชื่อหรืออีเมล
        $('user-count').textContent = `${list.length} / ${users.length} คน`;  // แสดงจำนวนผู้ใช้ที่ค้นพบเทียบกับทั้งหมด
        if (!list.length) return $('users-body').replaceChildren(messageRow('ไม่พบผู้ใช้', 'var(--c-text-mut)'));  // แสดงข้อความเมื่อไม่พบผู้ใช้

        $('users-body').replaceChildren(...list.map(u => {  // สร้างแถวตารางสำหรับผู้ใช้แต่ละคน
            const editBtn = el('button', { className: 'secondary-btn', textContent: '✏️ แก้ไข', onclick: () => openEdit(u.id) });  // ปุ่มแก้ไขข้อมูล
            const deleteBtn = isMe(u) ? '' :   // ลบตัวเองไม่ได้ จึงไม่แสดงปุ่ม
                el('button', { className: 'secondary-btn danger-btn', textContent: '🗑️ ลบ', onclick: () => removeUser(u.id) });  // ปุ่มลบผู้ใช้
            const nameCell = td(u.username);  // เซลล์แสดงชื่อผู้ใช้
            if (isMe(u)) nameCell.append(el('span', { className: 'you', textContent: ' (คุณ)' }));  // ติดป้ายกำกับ (คุณ) หากเป็นตนเอง
            return el('tr', {},  // คืนค่าแถว tr ของตาราง
                td(u.id),  // รหัสผู้ใช้ ID
                nameCell,  // ชื่อผู้ใช้
                td(u.email),  // อีเมล
                el('td', {}, el('span', { className: 'role-badge' + (u.role === 'admin' ? ' admin' : ''), textContent: u.role })),  // ป้ายบอกสถานะบทบาท
                td(u.gallery_count),  // จำนวนรูปภาพในแกลเลอรี่
                td(new Date(u.created_at).toLocaleDateString('th-TH')),  // วันที่ลงทะเบียนในรูปแบบภาษาไทย
                el('td', {}, el('div', { className: 'row-actions' }, editBtn, deleteBtn)));  // ปุ่มดำเนินการ (แก้ไข/ลบ)
        }));
    }

    function openEdit(id) {  // เปิดหน้าต่าง Modal สำหรับแก้ไขข้อมูลผู้ใช้
        const u = users.find(x => x.id === id);  // ค้นหาผู้ใช้จาก ID
        editingId = id;  // กำหนด ID ผู้ใช้ที่กำลังแก้ไข
        $('edit-title').textContent = `แก้ไขผู้ใช้: ${u.username}`;  // กำหนดหัวข้อ Modal
        $('edit-username').value = u.username;  // กรอกชื่อผู้ใช้เดิม
        $('edit-email').value = u.email || '';  // กรอกอีเมลเดิม
        $('edit-role').value = u.role;  // กรอกบทบาทเดิม
        $('edit-password').value = '';  // ล้างช่องรหัสผ่านใหม่
        $('edit-role').disabled = !!isMe(u);          // เปลี่ยนสิทธิ์ตัวเองไม่ได้ ปิด dropdown
        show('edit-role-hint', isMe(u));  // แสดงคำเตือนถ้าเป็นการแก้ไขบัญชีตนเอง
        show('edit-error', false);  // ซ่อนข้อความ error
        $('edit-overlay').classList.add('open');  // เปิดแสดงหน้าต่าง Modal Overlay
    }

    const closeEdit = () => { $('edit-overlay').classList.remove('open'); editingId = null; };  // ฟังก์ชันปิดหน้าต่าง Modal และรีเซ็ตค่า editingId

    async function saveEdit() {  // บันทึกการแก้ไขข้อมูลผู้ใช้
        const body = { username: $('edit-username').value.trim(), email: $('edit-email').value.trim() };  // รวบรวมชื่อผู้ใช้และอีเมล
        if (!$('edit-role').disabled) body.role = $('edit-role').value;  // แนบบทบาท role หากไม่ได้ถูกปิด
        if ($('edit-password').value) body.password = $('edit-password').value;   // ว่าง = ไม่เปลี่ยนรหัส (แนบเฉพาะเมื่อมีการกรอก)

        $('edit-save-btn').disabled = true;  // ปิดปุ่มบันทึกชั่วคราวขณะประมวลผล
        try {  // ลองส่งคำขออัปเดตข้อมูลไปยังเซิร์ฟเวอร์
            const { user } = await api(`/api/admin/users/${editingId}`, { method: 'PUT', body });  // ส่งคำขอ PUT ไปยัง /api/admin/users/:id
            if (editingId === me?.id) {   // แก้ข้อมูลตัวเอง -> อัปเดต sidebar ด้วย
                me = user;  // อัปเดตข้อมูล me ปัจจุบัน
                localStorage.setItem('forge_user', JSON.stringify(me));  // บันทึกลง localStorage
                applyUser(me);  // อัปเดตแถบ sidebar
            }
            closeEdit();  // ปิด Modal
            await loadUsers();  // โหลดรายการผู้ใช้ใหม่
        } catch (err) {  // จัดการกรณีเกิดข้อผิดพลาด
            $('edit-error').textContent = err.message;  // แสดงข้อความ error
            show('edit-error', true);  // แสดงกล่องแจ้งข้อผิดพลาด
        } finally {  // สิ้นสุดการทำงาน
            $('edit-save-btn').disabled = false;  // เปิดปุ่มบันทึกให้กดได้อีกครั้ง
        }
    }

    async function removeUser(id) {  // ฟังก์ชันลบผู้ใช้ออกจากระบบ
        const u = users.find(x => x.id === id);  // ค้นหาผู้ใช้จาก ID
        if (!confirm(`ลบผู้ใช้ "${u.username}" ?\nรูปในแกลเลอรี่ของเขา (${u.gallery_count} รูป) จะถูกลบด้วย และกู้คืนไม่ได้`)) return;  // ยืนยันการลบ
        try {  // พยายามส่งคำขอลบไปยัง API
            await api(`/api/admin/users/${id}`, { method: 'DELETE' });  // ส่งคำขอ DELETE ไปยัง /api/admin/users/:id
            await loadUsers();  // โหลดรายการผู้ใช้ใหม่หลังจากลบ
        } catch (err) {  // หากลบไม่สำเร็จ
            alert('ลบไม่สำเร็จ: ' + err.message);  // แจ้งเตือนข้อผิดพลาด
        }
    }

    $('search-input').addEventListener('input', renderTable);  // ผูกการค้นหากับการพิมพ์ในช่อง search
    $('edit-save-btn').addEventListener('click', saveEdit);  // ผูกปุ่มบันทึกการแก้ไข
    $('edit-cancel-btn').addEventListener('click', closeEdit);  // ผูกปุ่มยกเลิกการแก้ไข
    $('edit-overlay').addEventListener('click', e => { if (e.target === $('edit-overlay')) closeEdit(); });  // คลิกพื้นที่ภายนอกเพื่อปิด Modal
    loadUsers();  // โหลดรายชื่อผู้ใช้เมื่อเปิดหน้า
}

document.addEventListener('DOMContentLoaded', () => { if ($('users-body')) initAdminPage(); });  // เริ่มต้นทำงานหน้าจัดการผู้ดูแลระบบเมื่อพบ #users-body