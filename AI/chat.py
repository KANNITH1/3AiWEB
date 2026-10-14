"""
chat.py — AI server (Flask) พอร์ต 5002
รับคำขอจาก server.py (พอร์ต 5000) แล้วสร้าง/แก้ภาพ: ใช้ Forge Neo (Stable Diffusion) หรือ OpenCV

  GET  /api/models    รายชื่อโมเดลที่ใช้ได้ (เฉพาะที่ล็อกไว้ และมีจริงใน Forge)
  POST /api/generate  สร้างภาพ text2img 1:1 { prompt, negative_prompt, seed, model }
                      (รองรับ mode = img2img | blur | canny ด้วย เพราะหน้าเว็บยิงทุกโหมดมาที่นี่)
  POST /api/img2img   แปลงภาพ { image, prompt, strength, ... }      -> Forge
  POST /api/upscale   ขยายภาพ { image, scale }                       -> Forge
  POST /api/blur      เบลอภาพ { image, strength }                    -> OpenCV (ไม่ผ่าน Forge)
  POST /api/canny     หาเส้นขอบ { image, low, high }                 -> OpenCV (ไม่ผ่าน Forge)
  GET  /api/ai/object-detector-module.js   ไฟล์ JS ตรวจจับวัตถุ (รันในเบราว์เซอร์)
  ผลลัพธ์ภาพคืนเป็น { image_url: "data:image/png;base64,...", seed? }

ติดตั้ง: pip install flask flask-cors requests pillow opencv-python-headless numpy
"""
# ── สัญลักษณ์: 🔗 → = ส่งต่อ/เรียกไปไฟล์อื่น   🔗 ← = ถูกไฟล์อื่นเรียกมา ──
# ── ไฟล์นี้ "ไม่คุยกับเบราว์เซอร์ตรงๆ" คนเรียกคือ backend/server.py เท่านั้น ──

import base64  # ใช้แปลงภาพ <-> ข้อความ (ส่งภาพผ่าน JSON ต้องเป็น base64 string)
import io  # BytesIO สร้างไฟล์จำลองในหน่วยความจำ RAM โดยไม่ต้องเขียนลงดิสก์
import json  # ใช้อ่าน/แปลงข้อมูล JSON เช่น ข้อความ info ที่ Forge ตอบกลับมา
import os  # ใช้อ่านค่า Environment Variable และจัดการ path ของไฟล์

import cv2  # OpenCV ใช้ประมวลผลภาพ เช่น เบลอภาพ หรือหาเส้นขอบ (ไม่ต้องใช้ Forge)
import numpy as np  # จัดการข้อมูลภาพในรูปแบบ Numeric Array สำหรับ OpenCV
import requests  # ใช้ส่ง HTTP Request ไปยัง Forge Neo API
from flask import Flask, request, jsonify, send_from_directory  # Flask เว็บเซิร์ฟเวอร์, อ่านคำขอ, ตอบ JSON, ส่งไฟล์
from flask_cors import CORS  # อนุญาตการเรียกใช้ API ข้ามโดเมน (Cross-Origin Resource Sharing)
from PIL import Image  # Pillow ใช้เปิด ตรวจสอบ ย่อขนาด และแปลงโหมดภาพ

app = Flask(__name__)  # สร้างอินสแตนซ์ของ Flask เว็บแอปพลิเคชัน
CORS(app)  # เปิดใช้งาน CORS ให้แอปพลิเคชัน Flask

# ถ้า Forge อยู่คนละเครื่อง ตั้ง environment variable เช่น FORGE_URL=http://192.168.1.30:7860
# ที่อยู่ของ Forge Neo (Stable Diffusion WebUI) ค่าเริ่มต้น = เครื่องเดียวกัน พอร์ต 7860
FORGE_URL = os.environ.get("FORGE_URL", "http://127.0.0.1:7860")  # URL ของ Forge Neo (ดึงจาก env หรือใช้พอร์ต 7860 บน localhost)
# รอ Forge สร้างภาพได้สูงสุด 180 วินาที  🔗 ← ค่า TIMEOUT=200 ใน backend/server.py ต้องมากกว่าตัวเลขนี้
GEN_TIMEOUT = 180  # วินาที รอ Forge สร้างภาพ (TIMEOUT ใน server.py ต้องมากกว่าค่านี้)
# รายชื่อโมเดลที่อนุญาต ตัวแรกคือค่าเริ่มต้น  🔗 ← ชื่อต้องตรงกับ data-value ของปุ่มโมเดลใน frontend/home.html
#   และค่าเริ่มต้น state.model ใน frontend/script.js (class ForgeAIController)
ALLOWED_MODELS = ["sd_animagineXL40_v4Opt", "sd_manmaruMix_v30"]  # ล็อกโมเดล (ตัวแรก = ค่าเริ่มต้น)
IMAGE_SIZE = {"width": 1024, "height": 1024}  # ล็อกสัดส่วน 1:1 ขนาด 1024x1024
UPSCALER = "R-ESRGAN 4x+"  # ชื่อโมเดลขยายภาพใน Forge (ต้องตรงกับ GET {FORGE_URL}/sdapi/v1/upscalers)
NO_FORGE = "เชื่อมต่อ Forge Neo ไม่ได้ กรุณาเช็คว่าเปิด Stability Matrix (Forge Neo) อยู่หรือไม่"  # ข้อความ error ตอนต่อ Forge ไม่ได้


# ฟังก์ชันตอบ error รูปแบบเดียวกัน
def bad(msg, code=400):  # ฟังก์ชันช่วยตอบ Error กลับไปในรูปแบบ JSON มาตรฐาน
    """ตอบ error รูปแบบเดียวกันทุกที่: {"error": ข้อความ}"""
    return jsonify({"error": msg}), code  # คืน JSON {"error": ...} พร้อม status code  🔗 → ข้อความนี้ไหลกลับ server.py → script.js api() → alert


# ================= ตัวช่วยเรื่องภาพ =================
#04 ตัดหัว "data:image/png;base64," ออก
#B11 #I11
def strip_data_url(s):  # ตัดหัว Data URL ให้เหลือเฉพาะ base64 ล้วน
    """'data:image/png;base64,AAAA' -> 'AAAA' (Forge ต้องการ base64 ล้วน)"""
    return s.split(",", 1)[1] if s.lstrip().startswith("data:") and "," in s else s  # ถ้ามี "data:" ให้แบ่งที่จุลภาคตัวแรกเอาส่วนหลัง ไม่งั้นคืนค่าเดิม


#04 เตรียมภาพก่อนส่งเข้า Forge
#I12
def prepare_image(b64, max_side=1024):  # ปรับภาพเป็น RGB และปรับขนาดให้หาร 8 ลงตัว
    """เตรียมภาพก่อนส่งเข้า Forge: แปลงเป็น RGB (ตัด alpha ที่ทำให้ CUDA error ตอน VAE encode)
    และปรับขนาดเป็นพหุคูณของ 8 ไม่เกิน max_side  -> (base64 ใหม่, กว้าง, สูง) / raise ValueError"""
    try:  # ลองเปิดภาพ
        img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")  # ถอด base64 เป็นไบต์ -> เปิดภาพ -> แปลงเป็น RGB ตัด alpha ทิ้ง
    except Exception as e:  # ถ้าเปิดไม่ได้
        raise ValueError(f"ไฟล์ภาพไม่ถูกต้องหรือเปิดไม่ได้: {e}")  # โยน ValueError ให้ฟังก์ชันที่เรียก (img2img) จับไปตอบ bad()

    scale = min(1.0, max_side / max(img.size))  # คำนวณอัตราย่อขนาดภาพ ไม่ให้เกิน max_side (1024)
    w, h = (max(64, int(side * scale) // 8 * 8) for side in img.size)  # คำนวณขนาดกว้าง/สูงใหม่ ปัดลงให้หาร 8 ลงตัว ขั้นต่ำ 64
    if (w, h) != img.size:  # ถ้าขนาดใหม่ต่างจากเดิม
        img = img.resize((w, h), Image.LANCZOS)  # ปรับขนาดภาพด้วยวิธี LANCZOS ให้คมชัด
    buf = io.BytesIO()  # สร้างไฟล์จำลองในหน่วยความจำ
    img.save(buf, format="PNG")  # บันทึกภาพลงไฟล์จำลองเป็น PNG
    return base64.b64encode(buf.getvalue()).decode(), w, h  # คืน (base64 ใหม่, กว้าง, สูง)


#4 แปลง แปลง Base64 เป็นภาพ OpenCV
#B10 C8
def to_cv(data_url):  # แปลง Data URL เป็นภาพ OpenCV (BGR)
    """data URL -> ภาพ OpenCV (BGR)"""
    img = cv2.imdecode(np.frombuffer(base64.b64decode(strip_data_url(data_url)), np.uint8), cv2.IMREAD_COLOR)  # ตัดหัว data URL ถอด base64 แปลงเป็นภาพสี OpenCV
    if img is None:  # ถ้าอ่านเป็นภาพไม่ได้ OpenCV จะคืน None
        raise ValueError("ไฟล์ภาพไม่ถูกต้อง")  # แจ้งว่าไฟล์ภาพไม่ถูกต้อง
    return img  # คืนออบเจกต์ภาพ OpenCV


#B12 C9 แปลงภาพ PNG เป็น Base64 String แล้วเติมส่วนหัว Data URL
def from_cv(img):  # แปลงภาพ OpenCV เป็น Data URL (PNG)
    """ภาพ OpenCV -> data URL (PNG)"""
    ok, buf = cv2.imencode(".png", img)  # เข้ารหัสภาพเป็น PNG (ok = สำเร็จไหม, buf = ข้อมูลไบต์)
    if not ok:  # ถ้าเข้ารหัสไม่สำเร็จ
        raise ValueError("เข้ารหัสภาพไม่สำเร็จ")  # แจ้ง error เข้ารหัสไม่สำเร็จ
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()  # ต่อหัว data URL + base64 ของภาพ  🔗 → ส่งกลับไปเป็น image_url ที่ script.js showResult() เอาไปใส่ <img>

#08
#T16. ต่อหัว data URL ให้ base64 ล้วนๆ ที่ Forge ส่งมา
#I15
def png_url(b64):  # เติม prefix data URL ให้ base64 string
    return f"data:image/png;base64,{b64}"  # คืนข้อความ data URL ที่ใช้ใส่ <img src=...> ได้ทันที


# ================= เรียก Forge =================
#05
#T11. ใส่ชื่อโมเดลลงในข้อมูลที่จะส่งให้ Forge
#I12
def with_model(payload, model):  # ใส่ checkpoint โมเดลลงใน payload ที่จะส่งให้ Forge
    """สลับ checkpoint ใน Forge ก่อนสร้างภาพ (ชื่อที่ไม่อยู่ในรายการอนุญาต -> ใช้ตัวแรก)"""
    # 🔗 ← model มาจากปุ่มเลือกโมเดลในหน้าเว็บ (script.js state.model → payload.model)
    payload["override_settings"] = {"sd_model_checkpoint": model if model in ALLOWED_MODELS else ALLOWED_MODELS[0]}  # ตั้งค่า override โมเดล ถ้าไม่มีในลิสต์ใช้ตัวแรก
    payload["override_settings_restore_afterwards"] = False  # ไม่ต้องเปลี่ยนกลับเป็นโมเดลเดิมหลังสร้างเสร็จ
    return payload  # คืน payload ที่ใส่โมเดลแล้ว

#07
#T13. ส่ง HTTP POST ไป Forge Neo ยิงคำขอไป Forge เเล้วคืนให้ forge_image
#I14
def call_forge(endpoint, payload):  # ยิง HTTP POST ไปหา Forge Neo และจัดการ error
    """ยิงไป Forge คืน (json, None) หรือ (None, error response)"""
    try:  # ลองยิงคำขอไปยัง Forge
        resp = requests.post(f"{FORGE_URL}{endpoint}", json=payload, timeout=GEN_TIMEOUT)#T14 ส่งไป Forge /sdapi/v1/txt2img เพื่อสร้างภาพจริง  # POST ไปที่ FORGE_URL + endpoint  🔗 → Forge Neo (โปรแกรมภายนอก ต้องเปิดด้วย --api)
        resp.raise_for_status()  # ถ้า Forge ตอบ status 4xx/5xx ให้โยน HTTPError
        return resp.json(), None  # สำเร็จ: คืน (JSON ที่ได้, None=ไม่มี error)
    except requests.exceptions.ConnectionError:  # ต่อ Forge ไม่ได้
        return None, bad(NO_FORGE, 502)  # คืน (None, คำตอบ error 502)
    except requests.exceptions.Timeout:  # รอเกิน GEN_TIMEOUT (180 วินาที)
        return None, bad("สร้างภาพนานเกินไป (timeout)", 504)  # คืน error 504 timeout
    except requests.exceptions.HTTPError as e:  # Forge ตอบ error HTTP code
        return None, bad(f"Forge Neo error: {e}", 502)  # คืน error 502 พร้อมข้อความจาก Forge
    except Exception as e:  # error อื่นๆ
        return None, bad(str(e), 500)  # คืน error 500


#06
#T12.เตรียมส่งคำขอไป Forge Neo
#T15.รับ JSON จาก Forge → คืนให้ forge_image()
#I13 
#I16

def forge_image(endpoint, payload, seed):  # เรียก Forge แล้วแปลงผลลัพธ์เป็น { image_url, seed }
    """เรียก Forge แล้วแปลงผลเป็น { image_url, seed } (seed = ค่าที่ Forge ใช้จริง อยู่ใน result['info'])"""
    result, error = call_forge(endpoint, payload)  # เรียก Forge ได้ผลลัพธ์ + error
    if error:  # ถ้ามี error คืน error เลย
        return error  # ส่ง error กลับ
    if not result.get("images"):  # ถ้า Forge ไม่ส่งรายการภาพกลับมา
        return bad("Forge Neo ไม่คืนภาพกลับมา", 502)  # ตอบ error 502
    try:  # ลองดึง seed ที่ใช้จริง (ถ้าหน้าเว็บส่ง -1 Forge จะบอก seed ที่สุ่มได้ใน info)
        used_seed = json.loads(result.get("info", "{}")).get("seed", seed)  # แปลง JSON ใน info เพื่อเอาค่า "seed" (ถ้าไม่มีใช้ seed ที่ส่งมา)
    except Exception:  # ถ้าแปลงไม่ได้
        used_seed = seed  # ใช้ seed เดิม
    return jsonify({"image_url": png_url(result["images"][0]), "seed": used_seed})  # ส่งกลับ T17 {image_url, seed}  🔗 → ไหลผ่าน server.py ไปที่ script.js showResult() ใช้ data.image_url และ data.seed


# ================= แต่ละโหมด (รับ dict ที่แปลงจาก JSON แล้ว) =================

#T10. โหมดสร้างภาพจากข้อความ
def text2img(d):  # โหมดสร้างภาพจากข้อความ (text2img)
    if not d.get("prompt"):  # ถ้าไม่มี prompt
        return bad("missing 'prompt'")  # ตอบ error ขาด prompt
    seed = d.get("seed", -1)  # อ่าน seed (ไม่ส่งมา = -1 คือสุ่ม)
    # 🔗 ← prompt, negative_prompt, seed, model มาจาก script.js buildPayload()
    return forge_image("/sdapi/v1/txt2img", with_model({  # ยิง /sdapi/v1/txt2img ของ Forge พร้อมระบุโมเดล
        "prompt": d["prompt"], "negative_prompt": d.get("negative_prompt", ""),  # prompt บรรยายภาพ และ negative_prompt สิ่งที่ไม่ต้องการ
        "steps": 20, "seed": int(seed), **IMAGE_SIZE}, d.get("model")), seed)  # steps=20 รอบ, สุ่ม seed, ขนาดภาพ width/height 1024

#03
#I10.โหมดแปลงภาพด้วยภาพต้นฉบับ
def img2img(d):  # โหมดแปลงภาพด้วยภาพต้นฉบับ (img2img)
    image = d.get("image") or d.get("init_image")  # รับรูปจาก "image" หรือ "init_image"  # หน้าเว็บส่งชื่อ init_image
    if not d.get("prompt"):  # ต้องมี prompt
        return bad("missing 'prompt'")  # ถ้าไม่มี prompt ตอบ error
    if not image:  # ต้องมีรูป
        return bad("missing 'image'")  # ถ้าไม่มีรูป ตอบ error
    try:  # เตรียมรูปก่อนส่งเข้า Forge
        b64, w, h = prepare_image(strip_data_url(image))  # ตัดหัว data URL ปรับเป็น RGB และขนาดหาร 8 ลงตัว ได้ (base64, w, h)
    except ValueError as e:  # ถ้ารูปเสีย
        return bad(str(e))  # ตอบ 400
    seed = d.get("seed", -1)  # อ่าน seed (ไม่ส่งมา = -1 คือสุ่ม)
    # 🔗 ← strength มาจากช่อง strength-input ในหน้าเว็บ (script.js buildPayload)
    return forge_image("/sdapi/v1/img2img", with_model({  # ยิง /sdapi/v1/img2img ของ Forge พร้อมโมเดล
        "init_images": [b64], "prompt": d["prompt"], "negative_prompt": d.get("negative_prompt", ""),  # รูปต้นฉบับใน list และ prompt
        "denoising_strength": d.get("strength", 0.6),  # ความแรงของการเปลี่ยนภาพ 0-1 (ค่าเริ่มต้น 0.6)
        "steps": 20, "seed": int(seed), "width": w, "height": h}, d.get("model")), seed)  # steps=20, กำหนด seed และขนาดภาพ w, h


#B9.โหมดเบลอภาพ ใช้ OpenCV 
def blur(d):  # โหมดเบลอภาพโดยใช้ OpenCV
    image = d.get("image") or d.get("init_image")  # รับรูปภาพ
    if not image:  # ต้องมีรูป
        return bad("missing 'image'")  # ถ้าไม่มีรูป ตอบ error
    try:  # ลองเบลอภาพ
        # 🔗 ← blur_strength มาจากช่อง blur-input ใน script.js buildPayload() / strength มาจาก script.js callCv()
        k = max(1, int(float(d.get("blur_strength", d.get("strength", 15))))) | 1  # คำนวณ kernel ต้องเป็นเลขคี่ อย่างน้อย 1
        return jsonify({"image_url": from_cv(cv2.GaussianBlur(to_cv(image), (k, k), 0))})  # แปลงรูปเป็น OpenCV -> เบลอแบบ Gaussian -> แปลงกลับเป็น data URL -> ตอบ JSON
    except Exception as e:  # ถ้ามีข้อผิดพลาด
        return bad(str(e))  # ตอบข้อความ error


#C7 โหมดหาเส้นขอบ (Canny)
def canny(d):  # โหมดหาเส้นขอบภาพด้วย Canny Edge Detection
    image = d.get("image") or d.get("init_image")  # รับรูปภาพ
    if not image:  # ต้องมีรูป
        return bad("missing 'image'")  # ถ้าไม่มีรูป ตอบ error
    try:  # ลองหาเส้นขอบ
        gray = cv2.cvtColor(to_cv(image), cv2.COLOR_BGR2GRAY)  # แปลงเป็นภาพขาวดำ (Canny ทำงานกับภาพเทา)
        # 🔗 ← ค่าจากช่อง canny-low / canny-high ใน script.js buildPayload() และ callCv()
        edges = cv2.Canny(gray, int(d.get("threshold_low", d.get("low", 100))),  # หาเส้นขอบด้วยเกณฑ์ต่ำ threshold_low (default 100)
                          int(d.get("threshold_high", d.get("high", 200))))  # และเกณฑ์สูง threshold_high (default 200)
        return jsonify({"image_url": from_cv(cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR))})  # แปลงภาพเส้นขอบเป็นสี 3 ช่อง -> เข้ารหัสเป็น data URL -> ตอบ JSON
    except Exception as e:  # ถ้ามีข้อผิดพลาด
        return bad(str(e))  # ตอบข้อความ error


# ตารางเลือกฟังก์ชันตามชื่อ mode  🔗 ← ชื่อ mode ตรงกับ data-mode ของแท็บใน home.html และ state.mode ใน script.js
MODES = {"text2img": text2img, "img2img": img2img, "blur": blur, "canny": canny}  # ตารางเลือกฟังก์ชันตามชื่อโหมด


# ================= เส้นทาง =================
#02
#T2. #I9 ส่งข้อมูลที่ JavaScript ส่งมา เช่น Prompt, Seed และ Model มาให้ Pytho
#B8 C6 T9
def body():  # ฟังก์ชันดึง JSON body จากคำขอที่ส่งเข้ามา
    return request.get_json(silent=True) or {}  # get_json(silent=True) คืน None ถ้าไม่ใช่ JSON -> or {} ป้องกัน None


# ตรวจว่า Server ยังทำงานอยู่
@app.route("/health")  # Route ตรวจสอบความพร้อมของเซิร์ฟเวอร์
def health():  # ตอบกลับสถานะเซิร์ฟเวอร์
    return jsonify({"status": "ok"})  # คืนสถานะ {"status": "ok"}


#ขอรายชื่อโมเดลจาก Forge Neo
@app.route("/api/models")  # Route ขอรายชื่อโมเดล AI
def get_models():  # ขอรายชื่อโมเดลจาก Forge Neo และกรองเฉพาะที่อนุญาต
    """รายชื่อโมเดลที่ใช้ได้ (กรองเหลือเฉพาะที่ล็อกไว้) ให้หน้าเว็บสร้างปุ่มเลือก"""
    try:  # ลองถาม Forge
        resp = requests.get(f"{FORGE_URL}/sdapi/v1/sd-models", timeout=15)  # ขอรายชื่อโมเดลทั้งหมดจาก Forge
        resp.raise_for_status()  # ถ้า Forge ตอบ error ให้โยน exception
        return jsonify({"models": [{"title": m.get("title"), "model_name": m.get("model_name")}  # สร้างรายการ {title, model_name} เฉพาะโมเดลที่อยู่ใน ALLOWED_MODELS
                                   for m in resp.json() if m.get("model_name") in ALLOWED_MODELS]})  # กรองเฉพาะที่อยู่ใน ALLOWED_MODELS
    except requests.exceptions.ConnectionError:  # ต่อ Forge ไม่ได้
        return bad(NO_FORGE, 502)  # คืน error 502
    except requests.exceptions.Timeout:  # รอนานเกิน 15 วินาที
        return bad("ดึงรายชื่อโมเดลนานเกินไป (timeout)", 504)  # คืน error 504 timeout
    except Exception as e:  # error อื่นๆ
        return bad(str(e), 500)  # คืน error 500

#01
#T8. #I8 เลือกโหมด Text2Img, Img2Img, Blur, Canny
@app.route("/api/generate", methods=["POST"])  # Route รวมสำหรับรับคำขอสร้างภาพทุกโหมด
def generate():  # ฟังก์ชันจัดการการสร้างภาพตาม mode
    """ทุกโหมดยิงมาที่นี่พร้อมฟิลด์ mode (ค่าเริ่มต้น text2img)"""
    d = body()  # อ่าน JSON body
    handler = MODES.get(d.get("mode", "text2img"))  # เลือกฟังก์ชันตาม mode ที่ส่งมา (default text2img)
    return handler(d) if handler else bad(f"ไม่รองรับ mode: {d.get('mode')}")  # ถ้ามีฟังก์ชันให้เรียก ไม่งั้นตอบ error ไม่รองรับ mode


# ลงทะเบียน 3 route ด้วยวิธีสั้นๆ: path, ชื่อ endpoint, ฟังก์ชัน (lambda ห่อให้ส่ง body() เข้าไป)
# 🔗 ← server.py ส่ง /api/img2img, /api/blur, /api/canny มาตรงๆ  (script.js callCv() เรียก blur/canny ด้วย path เหล่านี้)
app.add_url_rule("/api/img2img", "img2img", lambda: img2img(body()), methods=["POST"])  # route /api/img2img ยิงตรงเข้าฟังก์ชัน img2img
app.add_url_rule("/api/blur", "blur", lambda: blur(body()), methods=["POST"])  # route /api/blur ยิงตรงเข้าฟังก์ชัน blur
app.add_url_rule("/api/canny", "canny", lambda: canny(body()), methods=["POST"])  # route /api/canny ยิงตรงเข้าฟังก์ชัน canny


# ขยายภาพด้วย Forge Neo
@app.route("/api/upscale", methods=["POST"])  # Route ขยายภาพ Upscale ด้วย Forge Neo
def upscale():  # ฟังก์ชันขยายขนาดภาพ
    d = body()  # อ่าน body
    if not d.get("image"):  # ต้องมีรูป
        return bad("missing 'image'")  # ถ้าไม่มีรูป ตอบ error
    result, error = call_forge("/sdapi/v1/extra-single-image", {  # ยิง /sdapi/v1/extra-single-image ของ Forge
        "image": strip_data_url(d["image"]), "upscaling_resize": d.get("scale", 2), "upscaler_1": UPSCALER})  # ส่งรูป base64, อัตราขยาย scale (default 2), ตัวขยาย UPSCALER
    if error:  # ถ้ามี error
        return error  # คืน error ทันที
    if not result.get("image"):  # ถ้า Forge ไม่ส่งภาพกลับ
        return bad("Forge Neo ไม่คืนภาพกลับมา", 502)  # ตอบ error 502
    return jsonify({"image_url": png_url(result["image"])})  # ตอบ JSON data URL ของภาพที่ขยายแล้ว


#O1 route ส่งไฟล์ JS ตรวจจับวัตถุ
@app.route("/api/ai/object-detector-module.js")  # Route ส่งไฟล์ JS สำหรับตรวจจับวัตถุ
def object_detector_module():  # ส่งไฟล์ JavaScript สำหรับ MediaPipe Object Detection
    """ส่งไฟล์ JS ตรวจจับวัตถุ (MediaPipe) ให้หน้าเว็บโหลดไปรันในเบราว์เซอร์"""
    # 🔗 → ai/object-detector-module.js   mimetype บอกเบราว์เซอร์ว่าเป็น JavaScript
    return send_from_directory(os.path.dirname(os.path.abspath(__file__)), "object-detector-module.js",  # ส่งไฟล์ object-detector-module.js จากโฟลเดอร์เดียวกัน
                               mimetype="application/javascript")  # ระบุ mimetype เป็น application/javascript


# รับข้อความแล้วตอบข้อความสำเร็จรูป
@app.route("/chat", methods=["POST"])  # Route ทดสอบรับส่งข้อความแชท
def chat():  # รับข้อความแล้วตอบกลับข้อความสำเร็จรูป
    message = body().get("message")  # อ่านข้อความที่ส่งมาใน field message
    if not message:  # ถ้าไม่มีข้อความ
        return bad("message is required")  # ตอบ error ต้องการ message
    return jsonify({"reply": f"ไอเดียของคุณน่าสนใจมาก! ลองนำข้อความ '{message}' นี้ไปสร้างภาพได้เลย",  # ตอบกลับข้อความสำเร็จรูป
                    "image_prompt_used": message})  # ส่ง prompt ที่ผู้ใช้พิมพ์กลับไปด้วย


# รันเฉพาะตอนสั่ง python chat.py ตรงๆ
if __name__ == "__main__":  # ตรวจสอบการรันไฟล์ตรงๆ
    # เปิดเซิร์ฟเวอร์พอร์ต 5002  🔗 ← เริ่มโดย ai/run.bat / run.sh   🔗 ← server.py ชี้มาที่นี่ผ่าน CHAT_URL
    app.run(host="0.0.0.0", port=5002, debug=True, threaded=True)  # รันเซิร์ฟเวอร์ Flask ที่ 0.0.0.0 พอร์ต 5002 แบบ debug และ threaded
