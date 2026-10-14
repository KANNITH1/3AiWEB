# Forge AI - Backend Documentation

เอกสารอธิบายการทำงาน โครงสร้างสถาปัตยกรรม และการติดตั้งใช้งานสำหรับฝั่ง **Backend (API Gateway / Auth / AI Gateway)** ของระบบ Forge AI

---

## 1. รายการ Library ที่ต้องติดตั้ง (Dependencies)

ระบบ Backend พัฒนาด้วยภาษา Python โดยใช้เฟรมเวิร์กและไลบรารีหลักดังต่อไปนี้:

### **รายการ ไลบรารีหลัก**
* **`Flask`**: เว็บเฟรมเวิร์กหลักสำหรับสร้าง API Gateway (`server.py`) และ Auth Service (`auth.py`)
* **`Flask-CORS`**: จัดการ CORS (Cross-Origin Resource Sharing) เพื่ออนุญาตให้ Frontend สื่อสารข้ามโดเมน/พอร์ตได้
* **`PyJWT`**: ใช้สร้าง ถอดรหัส และตรวจสอบความถูกต้องของ JSON Web Token (JWT) ในระบบยืนยันตัวตน
* **`requests`**: ใช้สำหรับการส่งต่อ HTTP Request ระหว่าง Gateway (`server.py`) ไปยัง Microservices อื่นๆ (`auth.py`, `chat.py`)
* **`python-dotenv`** *(Optional)*: สำหรับอ่านค่าคอนฟิกสภาพแวดล้อมผ่านไฟล์ `.env`

---

### **ขั้นตอนการติดตั้ง (Installation)**

1. สลับมาที่โฟลเดอร์ `backend`:
   ```bash
   cd forge-ai/backend
   ```

2. สร้างและเปิดใช้งาน Virtual Environment:
   * **Linux / macOS:**
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```
   * **Windows:**
     ```cmd
     python -m venv venv
     .\venv\Scripts\activate
     ```

3. ติดตั้ง Dependencies จากไฟล์ `requirements.txt`:
   ```bash
   pip install -r requirements.txt
   ```

---

## 2. สถาปัตยกรรมและขั้นตอนการทำงาน (System Workflow)

ระบบ Backend ถูกออกแบบในสไตล์ **Microservices Architecture** ผ่านตัวกลางที่เป็น **API Gateway (`server.py`)** ซึ่งรับหน้าที่จัดการทุก Endpoint ที่หน้าเว็บยิงเข้ามา แล้วกระจายงานต่อตามหน้าที่:

---

### **ขั้นตอนการทำงานรายละเอียด (Detailed Workflow)**

#### **ขั้นตอนที่ 1: การรับคำขอและการป้องกันระบบ (Gateway & Rate Limiting)**
1. Frontend ส่ง HTTP Request มาที่พอร์ต `5000` (`server.py`)
2. **CORS Check:** ระบบตรวจสอบ Pre-flight OPTIONS Request และแนบ CORS Headers กลับไปเพื่อเปิดการเชื่อมต่อ
3. **Bot Prevention & Lockout:** สำหรับระบบ Login/Register มีระบบนับจำนวนครั้งที่ล็อกอินผิดพลาด (`recent_failures`) หากป้อนผิดเกิน 5 ครั้งภายใน 30 วินาที บัญชีจะถูกล็อกชั่วคราว (`LOGIN_LOCKOUT_SECONDS = 30`) โดยตอบกลับเป็น status `429 Too Many Requests`

#### **ขั้นตอนที่ 2: การตรวจสอบสิทธิ์การใช้งาน (JWT Authentication)**
1. หาก Endpoint ที่เรียกเป็นโซนบังคับเข้าสู่ระบบ (เช่น `/api/generate`, `/api/gallery`, `/api/me`) คำขอจะถูกตรวจสอบผ่าน Decorator `@login_required`
2. ระบบจะดึงค่า Token จาก Header `Authorization: Bearer <token>`
3. นำ Token ไปถอดรหัสผ่าน `jwt.decode` ด้วย `SECRET_KEY`:
   * **กรณีผ่าน:** ระบบจะบันทึก `g.user_id` และ `g.username` ไว้ใน Global Context ของ Request นั้นแล้วส่งคำขอไปประมวลผลต่อ
   * **กรณีไม่ผ่าน/ Token หมดอายุ:** ระบบตัดการทำงานทันที และคืนค่า `401 Unauthorized`

#### **ขั้นตอนที่ 3: การตรวจสอบข้อมูลนำเข้าและการส่งต่อคำขอ (Validation & Forwarding)**
ฟังก์ชัน `add_proxy()` และ `forward()` ทำหน้าที่เป็น Proxy ตัวกลาง:
1. **Request Body Validation:** ตรวจสอบว่ามีข้อมูลตามที่กำหนดไว้ในตัวแปร `REQUIRED` หรือไม่ (เช่น `/api/generate` ต้องมี `prompt` หรือถ้าเป็น `img2img` ต้องมี `init_image`)
2. **Forwarding Request:** ส่งคำขอแบบดั้งเดิม (Method, Headers, JSON Payload) ไปยัง Service ปลายทาง:
   * **ยิงหา `auth.py` (Port 5001):** จัดการสิทธิ์ผู้ใช้ บันทึก/ลบภาพในแกลเลอรี อัปเดตข้อมูลผู้ใช้ใน SQLite (`user.db`)
   * **ยิงหา `chat.py` (Port 5002):** ประมวลผลคำสั่งสร้างภาพ/แก้ไขภาพด้วย AI (`text2img`, `img2img`, `upscale`, `blur`, `canny`)

#### **ขั้นตอนที่ 4: การตอบกลับผลลัพธ์ (Response Return)**
1. เมื่อ Service ปลายทางประมวลผลเสร็จ จะส่งผลลัพธ์ย้อนกลับมาที่ `server.py`
2. `server.py` จะนำ Response และ Status Code มาส่งต่อกลับไปให้ Frontend ในรูปแบบ JSON

---

## 3. การสั่งรันระบบ (Running Services)

คุณสามารถเปิดใช้งาน Microservices ทั้งหมดได้พร้อมกันโดยใช้สคริปต์ที่ให้มา:

* **สำหรับ Linux / macOS:**
  ```bash
  chmod +x run_all.sh
  ./run_all.sh
  ```

* **สำหรับ Windows:**
  ```cmd
  run_all.bat
  ```