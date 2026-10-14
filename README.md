# คู่มือภาพรวมและการใช้งานทั้งระบบสร้างภาพ AI

> คู่มือภาษาไทยสำหรับผู้เริ่มต้น อ้างอิงไฟล์ใน `AI(1).zip` ที่ส่งมา  
> **เริ่มจากชุดที่ตรวจสอบได้จริง:** `AI/chat.py` (AI Server) + `All/backend/server.py` (Gateway) และหน้าเว็บใน `AI/` หรือ `frontend/`

## 1. ระบบนี้ทำอะไรได้บ้าง?

ระบบให้ผู้ใช้เลือกโหมดและตั้งค่ารูปภาพจากหน้าเว็บ จากนั้นส่งข้อมูลไปยังเซิร์ฟเวอร์เพื่อประมวลผล และนำผลลัพธ์กลับมาแสดง

| โหมด | ผู้ใช้ทำอะไร | ระบบใช้ส่วนไหนประมวลผล |
|---|---|---|
| Text to Image | พิมพ์คำอธิบายเพื่อสร้างภาพใหม่ | Forge Neo / Stable Diffusion |
| Image to Image | อัปโหลดภาพและใส่คำสั่งแปลงภาพ | Forge Neo / Stable Diffusion |
| Blur | อัปโหลดภาพแล้วเลือกระดับความเบลอ | OpenCV ใน `AI/chat.py` |
| Canny | อัปโหลดภาพแล้วตั้งค่า Threshold | OpenCV ใน `AI/chat.py` |
| Object Detection | อัปโหลดภาพเพื่อตรวจจับวัตถุ | MediaPipe ใน **เบราว์เซอร์** (JavaScript) |
| Upscale | ส่งภาพเพื่อขยายด้วยโมเดล Upscaler | Forge Neo ผ่าน `AI/chat.py` |

**หมายเหตุ:** การทำงานบางอย่าง เช่น ระบบสมาชิกและการเก็บภาพในแกลเลอรี่ ยังต้องมี Backend เพิ่มเติม (ดูหัวข้อ 10)

## 2. ผังการทำงานทั้งระบบ

```text
┌──────────────────────────────────────────────┐
│ ผู้ใช้เปิดหน้าเว็บ (Frontend)                  │
│ เลือกโหมด, ใส่ Prompt, เลือก Model, อัปโหลดภาพ │
└──────────────────────┬───────────────────────┘
                       │ JavaScript fetch() ส่ง HTTP + JSON
                       ▼
┌──────────────────────────────────────────────┐
│ Backend / Gateway :5000                      │
│ All/backend/server.py                        │
│ รับคำขอ ตรวจสอบข้อมูล และส่งต่อ                │
└──────────────────────┬───────────────────────┘
                       │ HTTP request
                       ▼
┌──────────────────────────────────────────────┐
│ AI Server :5002                              │
│ AI/chat.py                                   │
│ เลือกฟังก์ชันตาม mode                         │
└──────────┬──────────────────────┬────────────┘
           │                      │
           ▼                      ▼
  Text2Img / Img2Img          Blur / Canny
  / Upscale                   ใช้ OpenCV ใน Python
           │                      │
           ▼                      │
┌───────────────────────┐        │
│ Forge Neo :7860       │        │
│ รันโมเดลสร้างภาพ AI    │        │
└───────────┬───────────┘        │
            └──────────┬─────────┘
                       ▼
           AI Server ส่งผลลัพธ์ JSON
             image_url (Base64)
                       ▼
               Gateway :5000
                       ▼
              หน้าเว็บแสดงภาพ
```

**โหมด Object Detection เป็นข้อยกเว้น:** JavaScript/MediaPipe ประมวลผลในเบราว์เซอร์ ไม่ได้ส่งภาพไปให้ Forge สร้างผลลัพธ์ แม้ต้องโหลดโมดูล JavaScript ผ่านระบบเว็บ/AI Server ในบางหน้า

## 3. รู้จักแต่ละส่วน

| ส่วน | ไฟล์สำคัญ | หน้าที่ | พอร์ต |
|---|---|---|---|
| Frontend | `AI/home.html`, `AI/script.js`, `AI/config.js` หรือชุด `frontend/` | หน้าจอและส่งข้อมูลจากผู้ใช้ | ขึ้นกับวิธีเปิดเว็บ เช่น 8000 |
| Backend/Gateway | `All/backend/server.py` | รับคำขอจากเว็บแล้วส่งต่อ AI Server | 5000 |
| AI Server | `AI/chat.py` | เลือกโหมดและจัดการรูปภาพ | 5002 |
| Forge Neo | ติดตั้งผ่าน Stability Matrix แยกจาก ZIP | ประมวลผลโมเดล Stable Diffusion / Upscale | 7860 (ค่าเริ่มต้น) |
| OpenCV | ไลบรารี Python ใน `AI/requirements.txt` | Blur และ Canny | ไม่เปิดพอร์ตเพิ่ม |
| MediaPipe | `object-detector-module.js` | ตรวจจับวัตถุบนเบราว์เซอร์ | ไม่มีพอร์ตประมวลผลของตัวเอง |

**พอร์ตคืออะไร?** เป็นหมายเลขช่องทางติดต่อบริการ เช่น `http://127.0.0.1:5002` หมายถึง AI Server บนเครื่องเดียวกัน (`127.0.0.1`) ที่พอร์ต `5002`

## 4. โปรแกรมที่ต้องติดตั้งก่อนเริ่ม (Windows)

1. **Python 3.11 แบบ 64-bit** — ใช้รัน Backend และ AI Server: <https://www.python.org/downloads/>
2. **VS Code** (แนะนำ) — ใช้เปิดโปรเจกต์และ Terminal: <https://code.visualstudio.com/>
3. **Stability Matrix** — ช่วยติดตั้งและเปิด Forge Neo: <https://github.com/LykosAI/StabilityMatrix>
4. **Forge Neo หรือ Forge รุ่นที่รองรับ Stable Diffusion WebUI API** — ต้องเปิด API ด้วย `--api`
5. **โมเดล Stable Diffusion (checkpoint)** — ต้องติดตั้งแยกและตั้งชื่อให้ตรงกับโค้ด
6. **เบราว์เซอร์** เช่น Chrome หรือ Edge — ใช้เปิดหน้าเว็บ

> การ์ดจอและไดรเวอร์ที่รองรับช่วยให้ Forge ทำงานได้จริงและเร็วขึ้น โดยต้องเช็กความเข้ากันได้กับ Forge รุ่นที่ติดตั้ง

## 5. โครงสร้างไฟล์ที่มีใน ZIP

```text
AI(1).zip
├── AI/
│   ├── chat.py                 ← AI Server :5002
│   ├── requirements.txt        ← ไลบรารี Python
│   ├── home.html, script.js    ← หน้าเว็บชุดหนึ่ง
│   ├── config.js               ← ตั้งค่า URL ของ Backend
│   └── object-detector-module.js
├── All/
│   ├── backend/
│   │   ├── server.py           ← Gateway :5000
│   │   └── chat.py             ← สำเนา AI Server อีกชุด
│   ├── create/, dashboard/, shared/
│   └── index.html
└── frontend/
    ├── index.html, home.html, script.js, config.js
    └── nginx/nginx.conf
```

ใน ZIP มีหน้าเว็บ **หลายชุด** และมี `chat.py` มากกว่าหนึ่งที่ อย่ารันทุกชุดปะปนกัน คู่มือนี้ใช้ **`AI/chat.py` และ `All/backend/server.py`** เป็นหลัก และแนะนำให้เริ่มทดสอบ API ก่อนเปิดหน้าเว็บ

## 6. ขั้นตอนติดตั้งและเปิดระบบ (ทำตามลำดับ)

### ขั้นที่ 1: แตกไฟล์และเปิดโฟลเดอร์

แตก `AI(1).zip` เช่นไว้ที่ `D:\CPE-Project\` แล้วเปิดโฟลเดอร์นี้ใน VS Code

### ขั้นที่ 2: ตรวจ Python

เปิด Terminal แบบ **PowerShell** แล้วพิมพ์

```powershell
py -3.11 --version
```

ควรเห็น `Python 3.11.x` ถ้าไม่พบคำสั่งให้ตรวจการติดตั้ง Python และ PATH

### ขั้นที่ 3: ติดตั้งไลบรารี AI Server

```powershell
cd D:\CPE-Project\AI
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

ไลบรารีที่ ZIP กำหนด: Flask, Flask-CORS, requests, Pillow, opencv-python-headless และ numpy

ทดสอบ:

```powershell
.\.venv\Scripts\python.exe -c "import flask, flask_cors, requests, PIL, cv2, numpy; print('Libraries OK')"
```

ถ้าเห็น `Libraries OK` แสดงว่าไลบรารีของ AI Server พร้อม

### ขั้นที่ 4: เปิด Forge Neo

1. ติดตั้งและเปิด Stability Matrix
2. ติดตั้ง Forge Neo (หรือ Forge ที่มี WebUI API)
3. ใส่ Launch Argument `--api`
4. ติดตั้งโมเดล checkpoint ที่ต้องการใช้
5. เปิด Forge ให้ทำงานที่พอร์ต `7860` (หรือบันทึกพอร์ตที่ใช้จริง)

ตรวจในเบราว์เซอร์:

- <http://127.0.0.1:7860> — หน้า Forge
- <http://127.0.0.1:7860/sdapi/v1/sd-models> — ควรได้ JSON รายชื่อโมเดลเมื่อ API พร้อม

**สำคัญ:** `AI/chat.py` กำหนดโมเดลที่อนุญาตเริ่มต้นเป็น `sd_animagineXL40_v4Opt` และ `sd_manmaruMix_v30` แต่ไฟล์ ZIP **ไม่ได้บรรจุโมเดล** เหล่านี้ ให้ติดตั้งโมเดลจริงแล้วแก้ `ALLOWED_MODELS` ใน `AI/chat.py` ให้ตรงชื่อ `model_name` ที่ Forge ส่งกลับ ขนาดสร้างภาพในโค้ดตั้งไว้ `1024 × 1024`

### ขั้นที่ 5: เปิด AI Server (Terminal หน้าต่างที่ 1)

```powershell
cd D:\CPE-Project\AI
.\.venv\Scripts\python.exe chat.py
```

เมื่อรันสำเร็จ ทดลองเปิด:

<http://127.0.0.1:5002/health>

คาดว่าจะได้ `{"status":"ok"}` และลอง:

<http://127.0.0.1:5002/api/models>

ถ้า `/health` ได้ แต่ `/api/models` ไม่ได้ แสดงว่า Flask เปิดอยู่ แต่ Forge หรือการตั้งค่าโมเดลยังมีปัญหา

### ขั้นที่ 6: เปิด Gateway (Terminal หน้าต่างที่ 2)

```powershell
cd D:\CPE-Project\All\backend
D:\CPE-Project\AI\.venv\Scripts\python.exe server.py
```

Gateway ใช้ `flask`, `flask-cors`, `requests` ซึ่งติดตั้งใน environment ของ AI แล้ว

ทดสอบ:

- <http://127.0.0.1:5000/health> — สถานะ Gateway
- <http://127.0.0.1:5000/api/models> — ทดสอบว่า Gateway ส่งต่อไป AI Server และ Forge ได้

### ขั้นที่ 7: เปิดหน้าเว็บ (Terminal หน้าต่างที่ 3)

ใช้หน้าเว็บชุด `AI/` เพื่อทดลองเสิร์ฟ HTML แบบง่าย:

```powershell
cd D:\CPE-Project\AI
.\.venv\Scripts\python.exe -m http.server 8000
```

เปิด <http://127.0.0.1:8000/index.html> หรือ <http://127.0.0.1:8000/home.html> เพื่อดูหน้าจอ

**ข้อควรทราบ:** หน้า `index.html` และ `home.html` ของชุด `AI/` มีการตรวจ Login/Token และอาศัย API สมาชิก ซึ่ง Gateway ใน ZIP ยังไม่ได้ทำไว้ครบ ดังนั้น **การเปิดหน้าเว็บไม่ได้หมายความว่า Login หรือ Gallery จะใช้ได้ทันที** หากต้องการทดสอบ AI ให้ใช้ API ตามหัวข้อ 7 หรือเชื่อม Backend สมาชิกให้ครบก่อน

## 7. การทำงานของแต่ละโหมด (กดแล้วเกิดอะไรขึ้น)

### 7.1 Text to Image

1. ผู้ใช้พิมพ์ Prompt แล้วกดสร้างภาพ
2. JavaScript รวบรวม `mode`, `prompt`, `negative_prompt`, `seed`, `model` เป็น **Payload JSON**
3. ส่ง `POST /api/generate` ไป Gateway :5000
4. Gateway ส่งคำขอไป `AI/chat.py` :5002
5. `chat.py` เลือกฟังก์ชัน `text2img` และส่ง `POST /sdapi/v1/txt2img` ไป Forge :7860
6. Forge ประมวลผลโมเดลแล้วส่งภาพ Base64 และข้อมูล seed กลับ
7. AI Server ส่ง JSON เช่น `image_url` และ `seed` ผ่าน Gateway กลับหน้าเว็บ
8. หน้าเว็บนำ `image_url` ไปแสดงเป็นรูปภาพ

ตัวอย่างข้อมูลที่ส่ง:

```json
{
  "mode": "text2img",
  "prompt": "a cute cat in a garden",
  "negative_prompt": "blurry",
  "seed": -1,
  "model": "sd_animagineXL40_v4Opt"
}
```

### 7.2 Image to Image

1. ผู้ใช้อัปโหลดภาพและพิมพ์ Prompt
2. หน้าเว็บอ่านไฟล์ภาพและแปลงเป็น **Base64 / Data URL**
3. ส่ง `mode=img2img`, ภาพต้นฉบับ, Prompt, `strength`, model และ seed ไป Gateway
4. AI Server เรียก Forge endpoint `/sdapi/v1/img2img`
5. Forge ใช้ภาพต้นฉบับเป็นจุดเริ่มต้นในการสร้างภาพใหม่
6. ส่งภาพที่ได้กลับไปแสดงบนหน้าเว็บ

`strength` กำหนดความแรงในการเปลี่ยนจากภาพเดิม (ค่าสูงมักเปลี่ยนมากกว่า)

### 7.3 Blur

1. ผู้ใช้อัปโหลดภาพและปรับระดับเบลอ
2. หน้าเว็บส่งภาพและค่า `blur_strength`
3. AI Server ใช้ `cv2.GaussianBlur()` ของ OpenCV
4. ส่งภาพที่เบลอแล้วกลับหน้าเว็บ

**ไม่ต้องเปิด Forge** สำหรับโหมดนี้

### 7.4 Canny

1. ผู้ใช้อัปโหลดภาพและกำหนดค่า Threshold Low/High
2. หน้าเว็บส่งรูปและค่า Threshold
3. AI Server ใช้ `cv2.Canny()` เพื่อหาเส้นขอบในภาพ
4. ส่งภาพเส้นขอบกลับไปแสดง

**ไม่ต้องเปิด Forge** สำหรับโหมดนี้

### 7.5 Object Detection

1. ผู้ใช้อัปโหลดภาพในหน้าเว็บ
2. JavaScript โหลดโมดูล `object-detector-module.js` และ MediaPipe
3. ระบบตรวจจับวัตถุ **ภายในเบราว์เซอร์** ตามค่าที่ผู้ใช้ตั้ง
4. แสดงกรอบ/ชื่อวัตถุบนหน้าเว็บ

**ไม่ได้เรียก Forge เพื่อสร้างภาพ** และการโหลด MediaPipe/โมเดลอาจต้องเชื่อมต่ออินเทอร์เน็ต

### 7.6 Upscale

1. หน้าเว็บหรือผู้เรียก API ส่งภาพและค่า `scale` ไป `POST /api/upscale`
2. Gateway ส่งต่อ AI Server
3. AI Server เรียก Forge endpoint `/sdapi/v1/extra-single-image`
4. Forge ใช้ Upscaler (`R-ESRGAN 4x+` ตามค่าเริ่มต้นในโค้ด) และส่งภาพขยายกลับ

ต้องมีชื่อ Upscaler ใน Forge ตรงกับที่ `AI/chat.py` กำหนด

## 8. API หลักที่เรียกใช้

| Method | Endpoint ที่ Gateway :5000 | ทำอะไร |
|---|---|---|
| GET | `/health` | เช็ก Gateway |
| GET | `/api/models` | อ่านรายชื่อโมเดลจาก AI Server/Forge |
| POST | `/api/generate` | เลือกโหมด Text2Img / Img2Img / Blur / Canny |
| POST | `/api/img2img` | แปลงภาพจากภาพต้นฉบับ |
| POST | `/api/blur` | เบลอภาพ |
| POST | `/api/canny` | หาเส้นขอบ |
| POST | `/api/upscale` | ขยายภาพ |
| POST | `/chat` | ทดสอบข้อความตอบกลับ |

> AI Server มี endpoint `/api/ai/object-detector-module.js` สำหรับส่ง JavaScript ด้วย แต่ `All/backend/server.py` ที่แนบมา **ไม่มี route ส่งต่อ endpoint นี้** จึงอาจต้องตั้งค่า static route/proxy เพิ่มสำหรับหน้าเว็บที่โหลดโมดูลผ่านเส้นทางนี้

**Endpoint** = ที่อยู่รับคำขอของ API  
**HTTP Request** = ข้อความคำขอที่ส่งจากเว็บไปเซิร์ฟเวอร์  
**Payload** = ข้อมูลในคำขอ เช่น Prompt, Mode, ภาพ  
**JSON** = รูปแบบข้อความสำหรับรับส่งข้อมูล  
**Base64** = วิธีเข้ารหัสไบต์รูปภาพให้ส่งเป็นข้อความได้  
**Seed** = ค่าควบคุมความสุ่มการสร้างภาพ (`-1` ให้ Forge สุ่ม)

## 9. ทดสอบทั้งเส้นทางแบบง่าย

หลังเปิด Forge, AI Server และ Gateway แล้ว เปิด PowerShell อีกหน้าต่าง:

```powershell
$body = @{
  mode = "text2img"
  prompt = "a cute cat in a garden"
  negative_prompt = "blurry"
  seed = -1
  model = "sd_animagineXL40_v4Opt"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/generate" -Method Post -ContentType "application/json" -Body $body
$result.seed
$result.image_url.Substring(0,22)
```

ให้เปลี่ยนชื่อ `model` เป็นโมเดลที่ติดตั้งและอนุญาตจริง ถ้าทำงานสำเร็จจะได้ `seed` และข้อความต้นของ `image_url` โดยไม่ต้องแสดง Base64 ทั้งก้อน

**การไหลของคำขอ:** PowerShell → Gateway :5000 → AI :5002 → Forge :7860 → AI → Gateway → PowerShell

## 10. สิ่งที่ ZIP ยังไม่ครบสำหรับเว็บไซต์เต็มระบบ

จากโครงสร้างใน ZIP ที่แนบมา:

- `All/backend/server.py` เป็น **Gateway สำหรับ AI** มี route ส่งต่อการสร้าง/แต่งรูป แต่ **ไม่มี** `/api/login`, `/api/register`, `/api/gallery`
- ใน ZIP **ไม่พบ `auth.py` และ `user.db`** ที่ README ของ `frontend/` กล่าวถึง
- หน้าเว็บใน `AI/` และ `frontend/` มีโค้ดที่พึ่งพา Login/Token/Gallery จึงต้องมี Backend สมาชิกและฐานข้อมูลให้ครบก่อนจะใช้งานทุกหน้าได้
- `frontend/config.js` ชี้ไปที่ `http://10.192.0.212:5000` ซึ่งเป็น IP เฉพาะเครือข่ายตัวอย่าง/ที่เคยตั้งไว้ **อาจไม่ใช่ IP เครื่องคุณ** ถ้าใช้ชุด `frontend/` ให้แก้ `API_BASE` ให้ชี้ไป Gateway ที่เปิดจริง
- `AI/config.js` ใช้ชื่อเครื่องเว็บที่เปิดอยู่เพื่อประกอบ URL พอร์ต 5000 เมื่อไม่ได้ใช้ Nginx จึงเหมาะกับกรณี Gateway อยู่เครื่องเดียวกับเว็บมากกว่า
- `frontend/README.md` อธิบายสถาปัตยกรรม 3 เครื่องและระบบ auth เพิ่มเติม แต่ไฟล์ที่จำเป็นบางส่วน **ไม่รวมอยู่ใน ZIP นี้** จึงไม่ควรถือว่าระบบแยก 3 เครื่องพร้อมใช้งานทันที

**สรุป:** ส่วนประมวลผลภาพผ่าน Gateway + AI Server + Forge สามารถตั้งค่าและทดสอบแยกได้ ส่วน Login/Register/Gallery ต้องรวมไฟล์ Backend ที่ขาดก่อน

## 11. หากแยกรันหลายเครื่อง

ตัวอย่าง (IP สมมติเท่านั้น):

```text
เครื่อง Frontend  192.168.1.10  → Gateway :5000
เครื่อง Backend   192.168.1.20  → AI Server :5002
เครื่อง AI        192.168.1.30  → Forge :7860 (เครื่องเดียวกับ AI)
```

ต้องปรับอย่างน้อย:

1. `frontend/config.js` → `API_BASE` เป็น `http://192.168.1.20:5000`
2. `All/backend/server.py` → `CHAT_URL = "http://192.168.1.30:5002"`
3. `AI/chat.py` → `FORGE_URL` เป็นค่าของ Forge จริง (ค่าเริ่มต้น localhost:7860)
4. ตั้งค่า firewall, CORS และเครือข่ายให้เครื่องที่เกี่ยวข้องติดต่อกันได้อย่างปลอดภัย

> Flask ในโค้ดตั้ง `debug=True` ใช้สำหรับพัฒนา **ไม่ควรเปิดพอร์ตเหล่านี้สู่สาธารณะ** โดยไม่มีการตั้งค่าความปลอดภัยเพิ่มเติม

## 12. ถ้าเจอปัญหาให้เช็กตรงนี้

| อาการ | สิ่งที่ควรตรวจ |
|---|---|
| `Python` ไม่พบคำสั่ง | ติดตั้ง Python/PATH และเปิด Terminal ใหม่ |
| `No module named flask` | ติดตั้ง `requirements.txt` ใน `.venv` และใช้ Python จาก `.venv` |
| `:5002/health` ไม่ได้ | รัน `AI/chat.py` หรือยัง / พอร์ต 5002 ถูกใช้งานอยู่หรือไม่ |
| `:5000/health` ไม่ได้ | รัน `All/backend/server.py` หรือยัง |
| `/api/models` ได้ 502 | Forge เปิดอยู่หรือไม่ / เปิด `--api` หรือยัง / `FORGE_URL` ถูกต้องหรือไม่ |
| `/api/models` ได้ `models: []` | ตรวจชื่อ checkpoint ใน `ALLOWED_MODELS` |
| สร้างภาพไม่ได้ | ตรวจ Prompt, โมเดล, VRAM, Forge log และ Terminal ของ AI Server |
| เปิดหน้าเว็บแล้ว Login ไม่ได้ | ไม่มี Backend สมาชิก (`auth.py`) และ route ที่เกี่ยวข้องใน ZIP |
| หน้าเว็บยิง API ผิด IP | ตรวจ `config.js` ของชุดหน้าเว็บที่กำลังใช้ |
| Object Detection โหลดไม่ได้ | ตรวจ path ของโมดูล, MediaPipe/CDN และ Console ของเบราว์เซอร์ |

## 13. เช็กลิสต์ก่อนสาธิตงาน

- [ ] ติดตั้ง Python และไลบรารีครบ
- [ ] เปิด Forge Neo พร้อม `--api` และโมเดลที่ถูกต้อง
- [ ] เปิด `AI/chat.py` บนพอร์ต 5002
- [ ] เปิด `All/backend/server.py` บนพอร์ต 5000
- [ ] ทดสอบ `/health` ทั้ง 2 พอร์ต
- [ ] ทดสอบ `/api/models` จากพอร์ต 5000
- [ ] ทดสอบ Text2Img ผ่าน API สำเร็จ
- [ ] ทดสอบ Blur/Canny (ไม่ต้องใช้ Forge)
- [ ] ถ้าจะสาธิตหน้าเว็บ: ตรวจ `config.js` และระบบ Login/Gallery ที่ยังขาด

## 14. สรุปสั้นที่สุด (พูดนำเสนอได้)

> ระบบนี้แบ่งเป็น Frontend, Backend, AI Server และ Forge Neo โดย Frontend รับข้อมูลจากผู้ใช้ เช่น Prompt, รูปภาพ และโหมดที่เลือก แล้วส่งเป็น HTTP Request พร้อม JSON ไปยัง Backend พอร์ต 5000 ซึ่งทำหน้าที่เป็น Gateway ส่งต่อไป AI Server พอร์ต 5002 จากนั้น AI Server จะเลือกวิธีประมวลผลตามโหมด หากเป็น Text to Image, Image to Image หรือ Upscale จะส่งคำขอไป Forge Neo พอร์ต 7860 แต่หากเป็น Blur หรือ Canny จะใช้ OpenCV ประมวลผลเอง เมื่อได้ภาพแล้วจะส่งผลลัพธ์เป็น Base64 ผ่าน Backend กลับมาให้ Frontend แสดง ส่วน Object Detection ใช้ MediaPipe ทำงานในเบราว์เซอร์

---

**ขอบเขตการตรวจสอบ:** คู่มือนี้ยึดตามไฟล์ที่มีอยู่จริงใน `AI(1).zip` และแยกข้อจำกัดของชุดไฟล์ออกจากฟังก์ชันที่ README ภายในโครงการระบุไว้ เพื่อป้องกันความเข้าใจผิดว่าฟังก์ชันที่ยังไม่มี Backend พร้อมใช้งานแล้ว
