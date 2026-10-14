# คู่มือติดตั้งและใช้งาน AI Server (ตั้งแต่เริ่มต้น)

คู่มือนี้อ้างอิงไฟล์ **`AI/chat.py` และ `AI/requirements.txt` จาก `AI(1).zip`** เหมาะสำหรับผู้เริ่มต้นบน **Windows 10/11** และอธิบายเฉพาะระบบ AI Server เป็นหลัก (มีหัวข้อเชื่อม Backend เพื่อใช้งานร่วมกับเว็บไซต์)

> **ภาพรวม:** AI Server คือ Flask (`chat.py`) รับคำสั่งทาง HTTP พอร์ต **5002** แล้วส่งคำสั่งสร้างภาพไปยัง **Forge Neo** พอร์ต **7860** หรือใช้ OpenCV ประมวลผลรูปภายใน Python
>
> การเปิด `chat.py` สำเร็จ **ไม่ได้แปลว่า Forge Neo พร้อมใช้งาน** ต้องตรวจสอบทั้งสองบริการแยกกัน

## 1. โปรแกรมที่ต้องติดตั้งก่อนเริ่ม

| โปรแกรม/ส่วนประกอบ | จำเป็นไหม | ใช้ทำอะไร |
|---|---|---|
| **Python 3.11 (64-bit)** | จำเป็น | รัน `chat.py` และติดตั้งแพ็กเกจ Python (แนะนำ 3.11 สำหรับโปรเจกต์นี้ ไม่ได้ล็อกเวอร์ชันไว้ในโค้ด) |
| **VS Code** (หรือโปรแกรมแก้ไขข้อความอื่น) | แนะนำ | เปิดโฟลเดอร์โค้ดและ Terminal |
| **Stability Matrix** | สำหรับ Text2Img/Img2Img/Upscale | โปรแกรมจัดการการติดตั้งและเปิด Forge Neo |
| **Forge Neo / Stable Diffusion WebUI Forge รุ่นที่มี API เข้ากันได้** | สำหรับ Text2Img/Img2Img/Upscale | เรียก Stable Diffusion สร้างหรือขยายภาพผ่าน API |
| **โมเดล Stable Diffusion ที่รองรับ** | สำหรับ Text2Img/Img2Img | ไฟล์ checkpoint ของภาพ AI; ชื่อต้องตรงกับค่าที่โค้ดอนุญาต |
| **GPU / ไดรเวอร์การ์ดจอที่รองรับ** | แนะนำอย่างยิ่งสำหรับ Forge | ช่วยให้สร้างภาพได้จริงและรวดเร็ว; การรองรับขึ้นกับรุ่น GPU และ Forge ที่ติดตั้ง |
| **PowerShell / Command Prompt** | มีมากับ Windows | พิมพ์คำสั่งติดตั้งและรัน |
| **เว็บเบราว์เซอร์** | แนะนำ | ทดสอบ URL และดูหน้า WebUI ของ Forge |

ดาวน์โหลดจากแหล่งทางการ: Python <https://www.python.org/downloads/> · VS Code <https://code.visualstudio.com/> · Stability Matrix <https://github.com/LykosAI/StabilityMatrix>

**หมายเหตุ:** Stability Matrix และ Forge เป็นคนละส่วน: Stability Matrix ใช้จัดการแพ็กเกจ ส่วน Forge คือบริการสร้างภาพที่ AI Server เรียกใช้งาน โหมด **Blur และ Canny ไม่ต้องเปิด Forge** เพราะใช้ OpenCV; โหมด Object Detection ของหน้าเว็บโหลด MediaPipe ไปทำงานในเบราว์เซอร์ ไม่ใช่ Python AI Server

## 2. เตรียมโฟลเดอร์โปรเจกต์

1. แตกไฟล์ `AI(1).zip` เช่นไว้ที่ `D:\CPE-Project\` (หลีกเลี่ยงพาธที่สับสน)
2. เปิด VS Code → **File → Open Folder** → เลือก `D:\CPE-Project\AI`
3. ตรวจสอบว่ามีไฟล์ดังนี้:

```text
D:\CPE-Project\
├── AI\
│   ├── chat.py                  # AI Server (Flask, พอร์ต 5002)
│   ├── requirements.txt         # รายการแพ็กเกจ Python
│   ├── object-detector-module.js
│   └── ...
└── All\
    └── backend\
        └── server.py            # Gateway/Backend พอร์ต 5000 (เปิดแยกเมื่อใช้เว็บไซต์)
```

> ใน ZIP มีโฟลเดอร์อื่นด้วย แต่ขั้นตอนที่ 3–8 ใช้เฉพาะ `AI/` และ Forge เป็นหลัก **ไม่จำเป็นต้องเปิด Frontend เพื่อทดสอบ `/health`**

## 3. ติดตั้ง Python และตรวจสอบ

1. ติดตั้ง Python 3.11 แบบ 64-bit จาก python.org
2. หากตัวติดตั้งมีตัวเลือก **Add python.exe to PATH** ให้เปิดใช้งาน
3. เปิด PowerShell หรือ Terminal ใหม่ แล้วพิมพ์:

```powershell
py -3.11 --version
```

ผลที่คาดหวัง เช่น `Python 3.11.x` (เลขเวอร์ชันย่อยอาจต่างกัน)

ถ้า Windows ไม่มีคำสั่ง `py` ให้ลอง `python --version` และใช้ `python` แทน `py -3.11` ในคำสั่งถัดไป โดยตรวจสอบว่า Python ชี้ไปเวอร์ชันที่ติดตั้งจริง

## 4. สร้าง Virtual Environment และติดตั้งไลบรารี

เปิด Terminal ในโฟลเดอร์ **`AI`**:

```powershell
cd D:\CPE-Project\AI
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

การเรียก `.venv\Scripts\python.exe` โดยตรงไม่จำเป็นต้อง Activate จึงช่วยหลีกเลี่ยงปัญหา PowerShell execution policy

รายการแพ็กเกจที่มีจริงใน `requirements.txt`:

| แพ็กเกจ | หน้าที่ |
|---|---|
| `flask` | เปิด HTTP Server / สร้าง API |
| `flask-cors` | อนุญาตคำขอข้าม Origin |
| `requests` | ส่ง HTTP ไปยัง Forge |
| `pillow` | อ่าน / แปลง / ปรับขนาดภาพ |
| `opencv-python-headless` | เบลอภาพและหาเส้นขอบ Canny |
| `numpy` | เก็บข้อมูลพิกเซลเป็นอาร์เรย์ |

ทดสอบว่าแพ็กเกจครบ:

```powershell
.\.venv\Scripts\python.exe -c "import flask, flask_cors, requests, PIL, cv2, numpy; print('Libraries OK')"
```

ถ้าเห็น `Libraries OK` แสดงว่า Python ฝั่ง AI Server พร้อมแล้ว

## 5. ติดตั้ง Stability Matrix และ Forge Neo

1. ติดตั้ง **Stability Matrix** จาก GitHub ของผู้พัฒนา
2. เปิดโปรแกรมและเลือกโฟลเดอร์เก็บไฟล์/แพ็กเกจที่มีพื้นที่ว่างเพียงพอ
3. ในหน้าจัดการแพ็กเกจ เลือกเพิ่มแพ็กเกจ **Forge Neo** หากมีให้เลือกในรุ่นที่ใช้อยู่ หรือเลือก Forge รุ่นที่รองรับ Stable Diffusion WebUI API (`/sdapi/v1/...`)
4. ติดตั้งแพ็กเกจให้เสร็จ และตรวจสอบไดรเวอร์/GPU ตามข้อกำหนดของ Forge รุ่นนั้น
5. กำหนด Launch Arguments ให้ **เปิด API** โดยใส่ `--api` ในตำแหน่ง Launch Arguments / Extra Args ของแพ็กเกจ (ชื่อเมนูอาจต่างตามเวอร์ชัน)
6. เริ่มรัน Forge และดู Console/Log ว่าบริการฟังที่ `http://127.0.0.1:7860` หรือไม่
7. ทดสอบในเบราว์เซอร์:

```text
http://127.0.0.1:7860
http://127.0.0.1:7860/docs
http://127.0.0.1:7860/sdapi/v1/sd-models
```

ผลที่คาดหวัง: หน้า WebUI เปิดได้ และ endpoint โมเดลตอบกลับ JSON เมื่อ API ทำงานจริง (บางรุ่นอาจไม่มีหน้า `/docs`)

**สำคัญ:** หาก Forge รันพอร์ตอื่น ต้องกำหนด `FORGE_URL` ก่อนรัน `chat.py` (ดูหัวข้อ 7) และอย่าถือว่าติดตั้ง Stability Matrix แล้ว Forge จะเริ่มรันเองโดยอัตโนมัติ

## 6. ใส่โมเดลภาพให้ชื่อตรงกับโค้ด

ใน `AI/chat.py` มีค่า:

```python
ALLOWED_MODELS = ["sd_animagineXL40_v4Opt", "sd_manmaruMix_v30"]
IMAGE_SIZE = {"width": 1024, "height": 1024}
UPSCALER = "R-ESRGAN 4x+"
```

1. ดาวน์โหลด checkpoint ที่คุณมีสิทธิ์ใช้งานจากแหล่งที่เชื่อถือได้ และตรวจสอบให้ **ตรงกับสถาปัตยกรรมที่ Forge รุ่นนั้นรองรับ**
2. ติดตั้ง checkpoint ผ่านตัวจัดการโมเดลของ Stability Matrix หรือโฟลเดอร์ checkpoints ของแพ็กเกจ Forge ตามที่โปรแกรมกำหนด (ตำแหน่งจริงขึ้นกับการตั้งค่า)
3. Refresh/Rescan models หรือเปิด Forge ใหม่
4. ตรวจสอบชื่อจาก `http://127.0.0.1:7860/sdapi/v1/sd-models` โดยดูช่อง `model_name` และ `title`
5. แก้ `ALLOWED_MODELS` ใน `chat.py` ให้ตรงกับโมเดลที่ Forge รายงาน **และ** ปรับตัวเลือกโมเดลที่หน้าเว็บให้ตรงกัน หากใช้งาน Frontend
6. สำหรับ Upscale ตรวจสอบว่ามีชื่อ `R-ESRGAN 4x+` ใน `http://127.0.0.1:7860/sdapi/v1/upscalers` หากไม่ตรงให้แก้ค่า `UPSCALER`

> ชื่อ `sd_animagineXL40_v4Opt` และ `sd_manmaruMix_v30` เป็นค่าที่ **ตั้งไว้ในโค้ด** ไม่ใช่โมเดลที่ ZIP รวมมาให้ และไม่รับประกันว่าติดตั้ง Forge แล้วมีโมเดลเหล่านี้ทันที ขนาดภาพ Text2Img ในโปรเจกต์ล็อกไว้ `1024 × 1024` จึงควรใช้โมเดลที่เหมาะกับขนาดดังกล่าวและมีทรัพยากรเครื่องเพียงพอ

## 7. เริ่มรัน AI Server (พอร์ต 5002)

เปิด PowerShell **หน้าต่างที่หนึ่ง** แล้วรัน Forge ใน Stability Matrix ให้ทำงานอยู่ (สำหรับโหมดที่ใช้ Forge)

เปิด PowerShell **หน้าต่างที่สอง**:

```powershell
cd D:\CPE-Project\AI
.\.venv\Scripts\python.exe chat.py
```

ใน `chat.py` มีคำสั่ง:

```python
app.run(host="0.0.0.0", port=5002, debug=True, threaded=True)
```

จึงรับการเชื่อมต่อที่พอร์ต `5002` (โหมด debug ใช้สำหรับพัฒนา **ไม่ควรเปิดสู่เครือข่ายสาธารณะ**)

หาก Forge อยู่ที่ IP/พอร์ตอื่น ให้กำหนด Environment Variable **ในหน้าต่างเดียวกันก่อนรัน**:

```powershell
$env:FORGE_URL = "http://127.0.0.1:7860"
.\.venv\Scripts\python.exe chat.py
```

ตัวอย่างกรณี Forge อยู่เครื่องอื่นในเครือข่ายที่เชื่อถือได้:

```powershell
$env:FORGE_URL = "http://192.168.1.30:7860"
.\.venv\Scripts\python.exe chat.py
```

กรณีต่างเครื่องต้องตั้งค่า Forge ให้รับการเชื่อมต่อจากเครื่อง AI Server อย่างปลอดภัยด้วย; อย่าเปิด API ของ Forge ออกอินเทอร์เน็ตโดยไม่มีการป้องกัน

หยุด Server ด้วย **Ctrl + C** ใน Terminal

## 8. ทดสอบ AI Server ตามลำดับ

### 8.1 ทดสอบ Flask (ไม่ต้องเปิด Forge)

เปิดเบราว์เซอร์:

```text
http://127.0.0.1:5002/health
```

ผลที่คาดหวัง:

```json
{"status":"ok"}
```

**แปลว่า `chat.py` ทำงาน แต่ยังไม่ได้ยืนยันว่า Forge เชื่อมต่อได้**

### 8.2 ทดสอบการเชื่อมต่อ Forge และโมเดล

```text
http://127.0.0.1:5002/api/models
```

หากสำเร็จจะได้ JSON ที่มีคีย์ `models` เป็นรายการที่ผ่านการกรองตาม `ALLOWED_MODELS`; หากได้ `{"models":[]}` ให้ตรวจสอบชื่อโมเดล หากได้ HTTP 502 ให้ตรวจสอบ Forge และ `FORGE_URL`

### 8.3 ทดสอบ Text to Image

เปิด PowerShell **หน้าต่างที่สาม** (โดย Forge และ AI Server ต้องยังรันอยู่):

```powershell
$body = @{
    mode = "text2img"
    prompt = "a cute cat in a garden"
    negative_prompt = "blurry, low quality"
    seed = -1
    model = "sd_animagineXL40_v4Opt"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://127.0.0.1:5002/api/generate" -Method Post -ContentType "application/json" -Body $body
$result.seed
$result.image_url.Substring(0, 22)
```

> เปลี่ยน `model` ในตัวอย่างให้ตรงกับโมเดลที่คุณติดตั้งและอนุญาตจริงก่อนทดสอบ คำตอบภาพจะเป็น data URL ที่มีข้อมูล Base64 ยาวมาก ตัวอย่างจึงพิมพ์เพียงส่วนต้นของข้อความ

ผลสำเร็จโดยทั่วไปมีข้อมูล `image_url` และ `seed` การสร้างภาพครั้งแรกอาจใช้เวลามากเพราะโหลดโมเดล

### 8.4 ทดสอบ Blur (ไม่ต้องเปิด Forge)

ตัวอย่างนี้อ่านภาพจากไฟล์ `sample.png` ในโฟลเดอร์ AI:

```powershell
$img = [Convert]::ToBase64String([IO.File]::ReadAllBytes("sample.png"))
$body = @{ mode = "blur"; image = $img; blur_strength = 15 } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "http://127.0.0.1:5002/api/generate" -Method Post -ContentType "application/json" -Body $body
$result.image_url.Substring(0, 22)
```

ถ้าต้องการลอง Canny เปลี่ยน payload เป็น:

```powershell
$body = @{ mode = "canny"; image = $img; threshold_low = 100; threshold_high = 200 } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "http://127.0.0.1:5002/api/generate" -Method Post -ContentType "application/json" -Body $body
$result.image_url.Substring(0, 22)
```

หมายเหตุ: PowerShell 5.1 อาจมีปัญหากับ JSON ขนาดใหญ่ในบางสภาพแวดล้อม หากเกิดข้อผิดพลาดให้ทดสอบด้วย Postman หรือ Python `requests` แทน

## 9. Endpoint ที่มีอยู่จริงใน `AI/chat.py`

| Method | Path | หน้าที่ | ต้องเปิด Forge? |
|---|---|---|---|
| GET | `/health` | เช็คสถานะ Flask | ไม่ |
| GET | `/api/models` | อ่านโมเดลจาก Forge และกรองตามรายการอนุญาต | ใช่ |
| POST | `/api/generate` | รวมโหมด `text2img`, `img2img`, `blur`, `canny` | เฉพาะ text2img/img2img |
| POST | `/api/img2img` | แปลงภาพจากภาพต้นฉบับ | ใช่ |
| POST | `/api/blur` | เบลอภาพด้วย OpenCV | ไม่ |
| POST | `/api/canny` | หาเส้นขอบด้วย OpenCV | ไม่ |
| POST | `/api/upscale` | ขยายภาพด้วย Forge | ใช่ |
| GET | `/api/ai/object-detector-module.js` | ส่งไฟล์ JavaScript สำหรับตรวจจับวัตถุในเบราว์เซอร์ | ไม่ |
| POST | `/chat` | คืนข้อความตัวอย่างจากข้อความที่รับ | ไม่ |

**รูปแบบ JSON ที่สำคัญ:**

```json
{"mode":"text2img","prompt":"a beautiful forest","negative_prompt":"blurry","seed":-1,"model":"ชื่อโมเดลที่อนุญาต"}
```

```json
{"mode":"img2img","prompt":"watercolor painting","init_image":"data:image/png;base64,...","strength":0.6,"seed":-1,"model":"ชื่อโมเดลที่อนุญาต"}
```

```json
{"mode":"blur","init_image":"data:image/png;base64,...","blur_strength":15}
```

```json
{"mode":"canny","init_image":"data:image/png;base64,...","threshold_low":100,"threshold_high":200}
```

```json
{"image":"data:image/png;base64,...","scale":2}
```

Payload สุดท้ายคือของ `POST /api/upscale` โดยคำตอบหลักสำหรับ API ภาพคือ `{"image_url":"data:image/png;base64,..."}` และโหมดที่สร้างด้วย Forge จะมี `seed` กลับมาด้วย

## 10. หลักการทำงานของ AI Server

```text
ผู้ใช้ (Frontend)
      │  HTTP + JSON (prompt, mode, image, seed ...)
      ▼
Backend / Gateway :5000  (All/backend/server.py)
      │  Forward request
      ▼
AI Server :5002 (AI/chat.py)
      │
      ├── text2img ──POST /sdapi/v1/txt2img──┐
      ├── img2img ──POST /sdapi/v1/img2img───┤ Forge Neo :7860
      ├── upscale ──POST /sdapi/v1/extra-single-image ──┘
      │
      ├── blur ──OpenCV (cv2.GaussianBlur)
      └── canny ──OpenCV (cv2.Canny)
      │
      ▼
JSON {image_url: "data:image/png;base64,...", seed?: จำนวนเต็ม}
      │
      ▼
Backend :5000 → Frontend แสดงรูปภาพ
```

- **Endpoint** = URL ของ API ที่เรียก เช่น `/api/generate` บนพอร์ต 5002
- **Payload** = ข้อมูล JSON ที่ส่งไปใน HTTP Request เช่น prompt, seed, model และรูป Base64
- **Mode** = บอก `chat.py` ว่าจะเลือกฟังก์ชันใด (`MODES` dict)
- **Base64** = แปลงไบต์ภาพเป็นข้อความเพื่อส่งใน JSON; ผลลัพธ์ `image_url` เป็น data URL ที่หน้าเว็บใช้แสดงใน `<img>` ได้
- **Seed** = ตัวเลขควบคุมความสุ่มการสร้างภาพ; `-1` ขอให้ Forge สุ่ม seed
- **Forge URL** = ที่อยู่จริงของบริการสร้างภาพ เริ่มต้น `http://127.0.0.1:7860`

## 11. เชื่อมกับ Backend ของเว็บไซต์ (ขั้นตอนเสริม)

ไฟล์ ZIP นี้มี `All/backend/server.py` ซึ่งตั้งค่า:

```python
CHAT_URL = "http://127.0.0.1:5002"
TIMEOUT = 200
```

ส่วน `AI/chat.py` ใช้ `GEN_TIMEOUT = 180` วินาที ดังนั้นเวลา timeout ของ Backend มากกว่า AI Server ตามที่ตั้งไว้

เปิด Terminal ใหม่ แล้วติดตั้ง `flask`, `flask-cors`, `requests` ลงใน environment ที่ใช้รัน Backend ก่อน:

```powershell
cd D:\CPE-Project\All\backend
D:\CPE-Project\AI\.venv\Scripts\python.exe -m pip install flask flask-cors requests
D:\CPE-Project\AI\.venv\Scripts\python.exe server.py
```

คำสั่งนี้เป็นตัวอย่างใช้ environment เดียวกับ AI Server สำหรับ `All/backend/server.py` **โปรดทราบว่า Backend ตัวนี้เป็น Gateway สำหรับส่งต่อ API ไม่ใช่ระบบเว็บไซต์เต็มรูปแบบที่รับประกันว่ามี Login/ฐานข้อมูลครบ** หากมี Backend อีกชุดที่สมบูรณ์ต้องใช้วิธีรันตามคู่มือของชุดนั้น

ลำดับการเปิดสำหรับทดลองการไหลข้อมูลทั้งระบบ:

1. เปิด **Stability Matrix → Forge (API) :7860**
2. เปิด **`AI/chat.py` :5002**
3. เปิด **`All/backend/server.py` :5000**
4. เปิดหน้าเว็บไซต์ (Frontend) ตามวิธีที่กำหนดในโปรเจกต์ และตั้ง API ให้ชี้ไป Backend พอร์ต 5000

ทดสอบเส้นทาง Gateway ได้ที่ `http://127.0.0.1:5000/health` และ `http://127.0.0.1:5000/api/models`

## 12. ปัญหาที่พบบ่อย

| อาการ | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|---|---|---|
| `py` หรือ `python` ไม่พบ | ยังไม่ติดตั้ง Python หรือ PATH ไม่ถูก | ติดตั้ง Python และเปิด Terminal ใหม่ |
| `No module named flask` หรือ `cv2` | ไม่ได้ใช้ environment ที่ติดตั้งไลบรารี | รันผ่าน `.venv\Scripts\python.exe` และติดตั้ง `-r requirements.txt` |
| เปิด `:5002/health` ไม่ได้ | `chat.py` ไม่รัน หรือพอร์ตถูกใช้ | เช็ค Terminal และ `netstat -ano | findstr :5002` |
| `:5002/health` สำเร็จ แต่ `/api/models` ได้ 502 | Forge ไม่ทำงาน / พอร์ตหรือ `FORGE_URL` ผิด | เปิด Forge ด้วย `--api` และทดสอบ `:7860/sdapi/v1/sd-models` |
| `/api/models` ได้ `models: []` | ชื่อใน `ALLOWED_MODELS` ไม่ตรงโมเดลที่ Forge ส่งกลับ | แก้รายชื่อให้ตรง `model_name` |
| Forge แจ้ง model/checkpoint not found | ยังไม่มีโมเดล หรือชื่อโมเดลไม่ตรง | เพิ่มโมเดล Refresh แล้วแก้ `ALLOWED_MODELS` |
| สร้างภาพช้ามาก / CUDA out of memory | การ์ดจอ/VRAM ไม่พอหรือโมเดลใหญ่ | ตรวจสเปก GPU ลดการใช้หน่วยความจำหรือเลือกโมเดลที่เหมาะสม; ขนาด Text2Img ในโค้ดล็อกไว้ 1024×1024 |
| Upscale ไม่ทำงาน | ไม่มี `R-ESRGAN 4x+` | เช็ค `/sdapi/v1/upscalers` และปรับค่า `UPSCALER` |
| Browser ได้ error จาก `:5000` | Backend ไม่ได้รันหรือชี้ผิดพอร์ต | เช็ค `server.py`, `CHAT_URL` และ `API_BASE` ของหน้าเว็บ |
| `404` ที่ `/api/generate` | ยิงผิดพอร์ต/URL หรือ Forge ไม่ใช่ chat.py | ตรวจว่าเรียก `http://127.0.0.1:5002/api/generate` ด้วย POST |
| `405 Method Not Allowed` | ใช้ GET แทน POST | ใช้ POST ส่ง `Content-Type: application/json` |
| `400 missing 'prompt'` / `missing 'image'` | Payload ขาดข้อมูลที่โหมดนั้นต้องใช้ | ตรวจ `prompt`, `image` หรือ `init_image` |
| Object Detection ใช้ไม่ได้ | Browser ดาวน์โหลด MediaPipe/CDN/model ไม่สำเร็จ | ตรวจอินเทอร์เน็ต Console และการโหลดโมดูลในหน้าเว็บ |

## 13. ตรวจสอบก่อนใช้งานจริง (Checklist)

- [ ] ติดตั้ง Python 3.11 และตรวจสอบ `--version`
- [ ] แตก ZIP และเข้าถึง `AI/chat.py`
- [ ] สร้าง `.venv` และติดตั้ง `AI/requirements.txt`
- [ ] ตรวจสอบ `Libraries OK`
- [ ] ติดตั้ง Stability Matrix / Forge และเปิด `--api`
- [ ] ติดตั้ง checkpoint ที่ใช้จริงและปรับ `ALLOWED_MODELS` ให้ตรง
- [ ] ตรวจสอบ `http://127.0.0.1:7860/sdapi/v1/sd-models`
- [ ] รัน `chat.py` และตรวจสอบ `http://127.0.0.1:5002/health`
- [ ] ตรวจสอบ `http://127.0.0.1:5002/api/models`
- [ ] ทดสอบ Text2Img / Img2Img หรือ Blur / Canny ตามต้องการ
- [ ] (กรณีใช้งานเว็บ) เปิด Backend :5000 และทดสอบการส่งต่อ

---

### สรุปคำสั่งรันแบบสั้น (Windows PowerShell)

หลังติดตั้งและกำหนดโมเดลใน Forge เรียบร้อยแล้ว:

```powershell
# เปิด Forge ใน Stability Matrix พร้อม --api ก่อน
cd D:\CPE-Project\AI
.\.venv\Scripts\python.exe chat.py
# เปิด http://127.0.0.1:5002/health เพื่อตรวจสอบ
```

**ไฟล์หลักที่อ้างอิง:** `AI/chat.py`, `AI/requirements.txt`, `AI/object-detector-module.js`, `All/backend/server.py` ในไฟล์ ZIP ที่แนบมา
