# AI Server (Image Generation / Editing)

ทำงานที่ IP `192.168.1.30` รับ request จาก Flask Backend (`192.168.1.20`)

## วิธีติดตั้งและรัน

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

Server จะรันที่ `http://0.0.0.0:5001` (เปลี่ยนพอร์ตได้ในไฟล์ server.py บรรทัดสุดท้าย)

> ถ้าเครื่องไม่มี GPU (NVIDIA) ให้แก้ `DEVICE = "cpu"` ในไฟล์ server.py — จะช้ากว่ามาก
> แนะนำลดจำนวนขั้นตอน (`steps`) ลงตอนทดสอบ เช่น 15-20 ขั้นแทน 25-50

## ทดสอบด้วย curl

### 1. เช็คว่า server พร้อมใช้งาน
```bash
curl http://localhost:5001/health
```

### 2. ส่ง request generate ภาพ (text-to-image)
```bash
curl -X POST http://localhost:5001/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cute cat wearing a wizard hat, digital art", "steps": 20}'
```
จะได้ `job_id` กลับมา เช่น `{"job_id": "abc123...", "status": "queued"}`

### 3. เช็คสถานะงาน / ดึงผลลัพธ์
```bash
curl http://localhost:5001/status/abc123...
```
เมื่อ `status` เป็น `"done"` จะมี `image_url` ให้ไปดึงภาพต่อที่
`http://localhost:5001/outputs/<ชื่อไฟล์>.png`

## สำหรับทีม Flask Backend (คนที่ 2)

Flow การเรียกใช้ที่แนะนำ:
1. Backend ยิง `POST /generate` ไป AI Server -> ได้ `job_id`
2. Backend poll `GET /status/<job_id>` เป็นระยะ (เช่นทุก 2 วินาที) จนกว่า status จะเป็น `done`
3. Backend เอา `image_url` ไปแสดงผลหรือส่งต่อให้ Frontend

## หมายเหตุสำคัญ

- **ห้าม push ไฟล์โมเดล (.safetensors, .ckpt) ขึ้น git** — ใช้ Google Drive แชร์แทน แล้ววาง
  ไฟล์ไว้ที่ `models/lora/` ก่อนรัน (ดู `.gitignore`)
- เปลี่ยน `MODEL_ID` ในไฟล์ `server.py` เป็นโมเดลที่ทีมตกลงใช้จริง
- endpoint `/edit` ต้องการ `image_base64` (ภาพต้นฉบับเข้ารหัส base64) + `prompt`
