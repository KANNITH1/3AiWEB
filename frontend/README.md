# Forge AI — โปรเจกต์ระบบสร้างภาพด้วย AI (Distributed System)

```
Browser ──> Nginx :8080 ──/api/──> server.py :5000 ─┬─> auth.py :5001  (Login/Register/Gallery + user.db)
 [frontend]                          [backend]       └─> chat.py :5002 ──> Forge Neo :7860
                                                          [ai]
```

## 3 โฟลเดอร์ (ตรงกับ 3 เครื่องในหน้า Dashboard)

| โฟลเดอร์    | เครื่อง      | มีอะไร                                                                                     |
| ----------- | ------------ | ------------------------------------------------------------------------------------------ |
| `frontend/` | 192.168.1.10 | หน้าเว็บทั้งหมด + `nginx.conf`                                                             |
| `backend/`  | 192.168.1.20 | `server.py` (Gateway :5000), `auth.py` (:5001), `user.db`                                  |
| `ai/`       | 192.168.1.30 | `chat.py` (:5002) ต่อกับ Forge Neo (:7860) + `object-detector-module.js` (JS ตรวจจับวัตถุ) |

## วิธีรัน

1. **ai/** : `pip install -r requirements.txt` แล้ว `python chat.py` (หรือ `run.bat`) และเปิด Forge Neo พร้อม `--api`
2. **backend/** : `pip install -r requirements.txt` แล้ว `run_all.bat` (หรือ `python auth.py` + `python server.py`)
3. **frontend/** : แก้ `root` และ `proxy_pass` ใน `nginx.conf` แล้วเข้า `http://localhost:8080`
   หรือไม่ใช้ Nginx: `python -m http.server 8000` ในโฟลเดอร์นี้ (`config.js` จะยิงตรงพอร์ต 5000 ให้เอง)

ทดสอบเครื่องเดียว: รันได้ทั้งหมดโดยไม่ต้องตั้งค่าอะไร (ทุกอย่างชี้ 127.0.0.1) และให้ `proxy_pass` เป็น `http://127.0.0.1:5000`

## ตั้งค่าตอนแยกเครื่อง (environment variable)

| ตัวแปร             | ตั้งที่                         | ความหมาย                                                |
| ------------------ | ------------------------------- | ------------------------------------------------------- |
| `CHAT_URL`         | backend                         | ที่อยู่ chat.py เช่น `http://192.168.1.30:5002`         |
| `FORGE_URL`        | ai                              | ที่อยู่ Forge Neo (ค่าเริ่มต้น `http://127.0.0.1:7860`) |
| `FORGE_SECRET_KEY` | backend (server.py และ auth.py) | รหัสลับ JWT ต้องเหมือนกันทั้งสองไฟล์                    |

Windows: `set CHAT_URL=http://192.168.1.30:5002` / Linux: `export CHAT_URL=...`

## ค่าที่ล็อกไว้

- โมเดลใช้ได้แค่ `sd_animagineXL40_v4Opt` และ `sd_manmaruMix_v30` (ล็อกทั้งหน้าเว็บและ `ai/chat.py` แก้ที่ `ALLOWED_MODELS`)
- ไม่มี LoRA และสัดส่วนภาพล็อก 1:1 (1024x1024)
- ไฟล์ `object-detector-module.js` อยู่ที่ `ai/` chat.py ส่งให้ผ่าน `/api/ai/object-detector-module.js` (ผ่าน Gateway) ดังนั้นโหมด Objects Detection ต้องให้ chat.py รันอยู่

## หมายเหตุ

- `backend/user.db` คือฐานข้อมูลเดิม (login ด้วยอีเมล) ลบได้ ระบบสร้างใหม่เอง รูปแกลเลอรี่เก็บที่ `backend/gallery_images/`
- login ผิดเกิน 5 ครั้งใน 60 วิ ถูกล็อกชั่วคราว และ login/register ตอบช้า 3 วิ
- โหมด Objects Detection ทำงานในเบราว์เซอร์ ต้องต่ออินเทอร์เน็ตและเปิดผ่าน `http://`
