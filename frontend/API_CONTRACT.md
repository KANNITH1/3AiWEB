# Forge AI Frontend API Contract

เอกสารนี้สรุปสัญญา REST API ที่ frontend คาดหวัง เพื่อใช้ตกลงรูปแบบข้อมูลกับทีม backend โดยตัวอย่างทั้งหมดใช้ JSON และส่ง JWT ผ่าน `Authorization: Bearer <token>` สำหรับ endpoint ที่ต้องยืนยันตัวตน

## Conventions

- Base URL ปัจจุบัน: `/api` กำหนดใน `js/shared.js` ส่วน `CONFIG.USE_DEMO_MODE` ยังเป็น `true`
- วันเวลาใช้ ISO 8601 เช่น `2026-09-21T10:30:00Z`
- สำเร็จ: `2xx`
- ข้อมูลไม่ถูกต้อง: `400` หรือ `422`
- ไม่มีสิทธิ์/ไม่มี token/หมดอายุ: `401`
- ไม่พบ resource: `404`
- server error: `500`
- Frontend `apiFetch()` จะ throw `Error` เมื่อ response ไม่ใช่ `2xx`; message จะอ่านจาก response field `message` ถ้ามี

## Auth

### POST `/api/register`

สร้างบัญชีใหม่

**Request**

```json
{
  "email": "user@example.com",
  "username": "forge_user",
  "password": "secret123"
}
```

**Success: `200` หรือ `201`**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "username": "forge_user",
    "email": "user@example.com",
    "created_at": "2026-09-21T10:30:00Z"
  }
}
```

Frontend รองรับ response สำเร็จจาก endpoint นี้และจะสร้าง session ใน demo mode โดยตรง ปัจจุบัน flow register คาดหวังให้ backend ส่ง token/user กลับมาเพื่อให้เข้าใช้งานต่อได้ทันที

**Error: `400`/`409`/`422`/`500`**

```json
{
  "message": "อีเมลนี้ถูกใช้งานแล้ว",
  "errors": {
    "email": ["already_exists"]
  }
}
```

### POST `/api/login`

เข้าสู่ระบบและออก JWT

**Request**

```json
{
  "email": "user@example.com",
  "password": "secret123",
  "rememberMe": true
}
```

`rememberMe` เป็นคำขอให้ backend ออก token ที่มีอายุยาวขึ้น ส่วนการเก็บ token ระยะสั้น/ยาวฝั่ง browser จัดการด้วย sessionStorage/localStorage

**Success: `200`**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "username": "forge_user",
    "email": "user@example.com",
    "created_at": "2026-09-21T10:30:00Z"
  }
}
```

JWT ควรเป็น string ที่ส่งซ้ำได้ใน header `Authorization: Bearer <token>` และ backend ควรกำหนด `exp` ตามค่า `rememberMe`

**Error: `400`/`401`/`422`**

```json
{
  "message": "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
}
```

## Image Generation

### POST `/api/generate` - Text to Image

สร้างภาพจาก prompt

**Request**

```json
{
  "type": "txt2img",
  "model": "animagineXL40_v4Opt",
  "prompt": "a lone astronaut walking on a neon city street",
  "negative_prompt": "blurry, low quality, distorted hands",
  "steps": 30,
  "cfg_scale": 7,
  "width": 768,
  "height": 768,
  "seed": 123456789
}
```

`seed` เป็น `null` ได้เมื่อผู้ใช้เลือกให้สุ่มอัตโนมัติ

### POST `/api/generate` - Image to Image

สร้างภาพใหม่จากภาพต้นฉบับ

**Request**

```json
{
  "type": "img2img",
  "model": "sdXL_v10VAEFix",
  "prompt": "transform into a cinematic cyberpunk portrait",
  "negative_prompt": "blurry, low quality",
  "steps": 30,
  "cfg_scale": 7,
  "width": 768,
  "height": 768,
  "seed": null,
  "denoising_strength": 0.7,
  "image": "source-image.png"
}
```

สำหรับ production ควรตกลงกับ backend เพิ่มว่าจะรับ `image` เป็น multipart upload, data URL หรือ storage id; demo frontend ปัจจุบันส่งชื่อไฟล์ใน JSON เป็น placeholder

**Success: `200` หรือ `202`**

```json
{
  "id": "generation-123",
  "image_url": "/media/generation-123.png",
  "status": "completed",
  "created_at": "2026-09-21T10:35:00Z"
}
```

ถ้าใช้ `202` สำหรับงาน asynchronous backend ควรระบุ `status` และ contract สำหรับ polling เพิ่มเติม ก่อนเปิดใช้จริง เพราะ frontend ปัจจุบันรอ response เดียว

**Error: `400`/`401`/`422`/`500`/`503`**

```json
{
  "message": "โมเดลไม่พร้อมใช้งาน",
  "code": "MODEL_UNAVAILABLE"
}
```

## Gallery

### GET `/api/gallery`

โหลดภาพใน gallery ของผู้ใช้หรือ public gallery ตาม policy ของ backend

**Request**

```http
GET /api/gallery?page=1&page_size=20&visibility=private
Authorization: Bearer <token>
```

**Success: `200`**

```json
{
  "items": [
    {
      "id": "generation-123",
      "image_url": "/media/generation-123.png",
      "prompt": "neon city after rain",
      "type": "txt2img",
      "status": "completed",
      "created_at": "2026-09-21T10:35:00Z",
      "parameters": { "model": "sdXL_v10VAEFix", "steps": 30 }
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 1,
    "total_pages": 1
  }
}
```

Frontend demo ใช้ mock records และ `forge_last_result`; เมื่อเชื่อม API จริงควรรักษา `items` และ `pagination` ตามรูปแบบนี้

**Error: `401`/`500`**

```json
{ "message": "กรุณาเข้าสู่ระบบใหม่" }
```

## History

### GET `/api/history`

โหลดประวัติการสร้างภาพส่วนตัวพร้อม filter และ pagination

**Request**

```http
GET /api/history?page=1&page_size=20&type=txt2img&date=2026-09-21
Authorization: Bearer <token>
```

Query parameters เป็น optional: `type` รองรับ `txt2img`/`img2img`, `date` ใช้รูปแบบ `YYYY-MM-DD`

**Success: `200`**

```json
{
  "items": [
    {
      "id": "generation-123",
      "prompt": "neon city after rain",
      "type": "txt2img",
      "status": "completed",
      "created_at": "2026-09-21T10:35:00Z",
      "parameters": {
        "model": "animagineXL40_v4Opt",
        "negative_prompt": "blurry",
        "steps": 30,
        "cfg_scale": 7,
        "width": 768,
        "height": 768,
        "seed": null
      }
    }
  ],
  "pagination": { "page": 1, "page_size": 20, "total_items": 1, "total_pages": 1 }
}
```

**Error: `401`/`500`**

```json
{ "message": "ไม่สามารถโหลดประวัติได้" }
```

## Profile

### GET `/api/profile`

โหลดข้อมูลผู้ใช้ปัจจุบัน

**Request**

```http
GET /api/profile
Authorization: Bearer <token>
```

**Success: `200`**

```json
{
  "id": "user-123",
  "username": "forge_user",
  "email": "user@example.com",
  "created_at": "2026-09-21T10:30:00Z",
  "stats": { "images_created": 12 }
}
```

### PUT `/api/profile`

แก้ไขข้อมูลเบื้องต้นของ user

**Request**

```json
{
  "username": "new_forge_user",
  "password": "new-secret123"
}
```

ควรให้ field ที่ไม่ต้องการแก้เป็น omitted หรือ `null` ตามข้อตกลง backend และไม่ควรส่ง password กลับใน response

**Success: `200`**

```json
{
  "id": "user-123",
  "username": "new_forge_user",
  "email": "user@example.com",
  "created_at": "2026-09-21T10:30:00Z"
}
```

**Error: `400`/`401`/`409`/`422`**

```json
{ "message": "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว" }
```

หมายเหตุ: `CONFIG.ENDPOINTS.PROFILE` ถูกเตรียมไว้แล้ว แต่หน้า profile ปัจจุบันยังอัปเดต demo data ใน browser และยังไม่ได้เรียก GET/PUT endpoint จริง

## Logout

ปัจจุบัน frontend จัดการ logout ฝั่งตัวเองโดยลบ `forge_token` และ `forge_user` ออกจากทั้ง `localStorage` และ `sessionStorage` แล้ว redirect ไป `login.html` ดังนั้น backend endpoint logout **ไม่จำเป็น** สำหรับ JWT แบบ stateless ขั้นพื้นฐาน

หาก backend ใช้ refresh token, token blacklist หรือ server-side session ควรเพิ่ม `POST /api/logout` และให้ frontend เรียกก่อนล้าง storage:

```http
POST /api/logout
Authorization: Bearer <token>
```

**Success: `204` หรือ `200`**

```json
{ "message": "ออกจากระบบสำเร็จ" }
```

**Error: `401`** สามารถถือว่า session ฝั่ง client หมดอายุแล้วและล้าง storage ต่อได้
