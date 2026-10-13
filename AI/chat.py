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
import base64
import io
import json
import os

import cv2
import numpy as np
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image

app = Flask(__name__)
CORS(app)

# ถ้า Forge อยู่คนละเครื่อง ตั้ง environment variable เช่น FORGE_URL=http://192.168.1.30:7860
FORGE_URL = os.environ.get("FORGE_URL", "http://127.0.0.1:7860")
GEN_TIMEOUT = 180                                     # วินาที รอ Forge สร้างภาพ
ALLOWED_MODELS = ["sd_animagineXL40_v4Opt", "sd_manmaruMix_v30"]   # ล็อกโมเดล (ตัวแรก = ค่าเริ่มต้น)
IMAGE_SIZE = {"width": 1024, "height": 1024}          # ล็อกสัดส่วน 1:1
UPSCALER = "R-ESRGAN 4x+"                             # ชื่อต้องตรงกับ GET {FORGE_URL}/sdapi/v1/upscalers
NO_FORGE = "เชื่อมต่อ Forge Neo ไม่ได้ กรุณาเช็คว่าเปิด Stability Matrix (Forge Neo) อยู่หรือไม่"


def bad(msg, code=400):
    """ตอบ error รูปแบบเดียวกันทุกที่: {"error": ข้อความ}"""
    return jsonify({"error": msg}), code


# ================= ตัวช่วยเรื่องภาพ =================
def strip_data_url(s):
    """'data:image/png;base64,AAAA' -> 'AAAA' (Forge ต้องการ base64 ล้วน)"""
    return s.split(",", 1)[1] if s.lstrip().startswith("data:") and "," in s else s


def prepare_image(b64, max_side=1024):
    """เตรียมภาพก่อนส่งเข้า Forge: แปลงเป็น RGB (ตัด alpha ที่ทำให้ CUDA error ตอน VAE encode)
    และปรับขนาดเป็นพหุคูณของ 8 ไม่เกิน max_side  -> (base64 ใหม่, กว้าง, สูง) / raise ValueError"""
    try:
        img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    except Exception as e:
        raise ValueError(f"ไฟล์ภาพไม่ถูกต้องหรือเปิดไม่ได้: {e}")

    scale = min(1.0, max_side / max(img.size))
    w, h = (max(64, int(side * scale) // 8 * 8) for side in img.size)
    if (w, h) != img.size:
        img = img.resize((w, h), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode(), w, h


def to_cv(data_url):
    """data URL -> ภาพ OpenCV (BGR)"""
    img = cv2.imdecode(np.frombuffer(base64.b64decode(strip_data_url(data_url)), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("ไฟล์ภาพไม่ถูกต้อง")
    return img


def from_cv(img):
    """ภาพ OpenCV -> data URL (PNG)"""
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise ValueError("เข้ารหัสภาพไม่สำเร็จ")
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()


def png_url(b64):
    return f"data:image/png;base64,{b64}"


# ================= เรียก Forge =================
def with_model(payload, model):
    """สลับ checkpoint ใน Forge ก่อนสร้างภาพ (ชื่อที่ไม่อยู่ในรายการอนุญาต -> ใช้ตัวแรก)"""
    payload["override_settings"] = {"sd_model_checkpoint": model if model in ALLOWED_MODELS else ALLOWED_MODELS[0]}
    payload["override_settings_restore_afterwards"] = False
    return payload


def call_forge(endpoint, payload):
    """ยิงไป Forge คืน (json, None) หรือ (None, error response)"""
    try:
        resp = requests.post(f"{FORGE_URL}{endpoint}", json=payload, timeout=GEN_TIMEOUT)
        resp.raise_for_status()
        return resp.json(), None
    except requests.exceptions.ConnectionError:
        return None, bad(NO_FORGE, 502)
    except requests.exceptions.Timeout:
        return None, bad("สร้างภาพนานเกินไป (timeout)", 504)
    except requests.exceptions.HTTPError as e:
        return None, bad(f"Forge Neo error: {e}", 502)
    except Exception as e:
        return None, bad(str(e), 500)


def forge_image(endpoint, payload, seed):
    """เรียก Forge แล้วแปลงผลเป็น { image_url, seed } (seed = ค่าที่ Forge ใช้จริง อยู่ใน result['info'])"""
    result, error = call_forge(endpoint, payload)
    if error:
        return error
    if not result.get("images"):
        return bad("Forge Neo ไม่คืนภาพกลับมา", 502)
    try:
        used_seed = json.loads(result.get("info", "{}")).get("seed", seed)
    except Exception:
        used_seed = seed
    return jsonify({"image_url": png_url(result["images"][0]), "seed": used_seed})


# ================= แต่ละโหมด (รับ dict ที่แปลงจาก JSON แล้ว) =================
def text2img(d):
    if not d.get("prompt"):
        return bad("missing 'prompt'")
    seed = d.get("seed", -1)
    return forge_image("/sdapi/v1/txt2img", with_model({
        "prompt": d["prompt"], "negative_prompt": d.get("negative_prompt", ""),
        "steps": 20, "seed": int(seed), **IMAGE_SIZE}, d.get("model")), seed)


def img2img(d):
    image = d.get("image") or d.get("init_image")   # หน้าเว็บส่งชื่อ init_image
    if not d.get("prompt"):
        return bad("missing 'prompt'")
    if not image:
        return bad("missing 'image'")
    try:
        b64, w, h = prepare_image(strip_data_url(image))
    except ValueError as e:
        return bad(str(e))
    seed = d.get("seed", -1)
    return forge_image("/sdapi/v1/img2img", with_model({
        "init_images": [b64], "prompt": d["prompt"], "negative_prompt": d.get("negative_prompt", ""),
        "denoising_strength": d.get("strength", 0.6),   # 0-1
        "steps": 20, "seed": int(seed), "width": w, "height": h}, d.get("model")), seed)


def blur(d):
    image = d.get("image") or d.get("init_image")
    if not image:
        return bad("missing 'image'")
    try:
        k = max(1, int(float(d.get("blur_strength", d.get("strength", 15))))) | 1   # kernel ต้องเป็นเลขคี่
        return jsonify({"image_url": from_cv(cv2.GaussianBlur(to_cv(image), (k, k), 0))})
    except Exception as e:
        return bad(str(e))


def canny(d):
    image = d.get("image") or d.get("init_image")
    if not image:
        return bad("missing 'image'")
    try:
        gray = cv2.cvtColor(to_cv(image), cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, int(d.get("threshold_low", d.get("low", 100))),
                          int(d.get("threshold_high", d.get("high", 200))))
        return jsonify({"image_url": from_cv(cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR))})
    except Exception as e:
        return bad(str(e))


MODES = {"text2img": text2img, "img2img": img2img, "blur": blur, "canny": canny}


# ================= เส้นทาง =================
def body():
    return request.get_json(silent=True) or {}


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/models")
def get_models():
    """รายชื่อโมเดลที่ใช้ได้ (กรองเหลือเฉพาะที่ล็อกไว้) ให้หน้าเว็บสร้างปุ่มเลือก"""
    try:
        resp = requests.get(f"{FORGE_URL}/sdapi/v1/sd-models", timeout=15)
        resp.raise_for_status()
        return jsonify({"models": [{"title": m.get("title"), "model_name": m.get("model_name")}
                                   for m in resp.json() if m.get("model_name") in ALLOWED_MODELS]})
    except requests.exceptions.ConnectionError:
        return bad(NO_FORGE, 502)
    except requests.exceptions.Timeout:
        return bad("ดึงรายชื่อโมเดลนานเกินไป (timeout)", 504)
    except Exception as e:
        return bad(str(e), 500)


@app.route("/api/generate", methods=["POST"])
def generate():
    """ทุกโหมดยิงมาที่นี่พร้อมฟิลด์ mode (ค่าเริ่มต้น text2img)"""
    d = body()
    handler = MODES.get(d.get("mode", "text2img"))
    return handler(d) if handler else bad(f"ไม่รองรับ mode: {d.get('mode')}")


app.add_url_rule("/api/img2img", "img2img", lambda: img2img(body()), methods=["POST"])
app.add_url_rule("/api/blur", "blur", lambda: blur(body()), methods=["POST"])
app.add_url_rule("/api/canny", "canny", lambda: canny(body()), methods=["POST"])


@app.route("/api/upscale", methods=["POST"])
def upscale():
    d = body()
    if not d.get("image"):
        return bad("missing 'image'")
    result, error = call_forge("/sdapi/v1/extra-single-image", {
        "image": strip_data_url(d["image"]), "upscaling_resize": d.get("scale", 2), "upscaler_1": UPSCALER})
    if error:
        return error
    if not result.get("image"):
        return bad("Forge Neo ไม่คืนภาพกลับมา", 502)
    return jsonify({"image_url": png_url(result["image"])})


@app.route("/api/ai/object-detector-module.js")
def object_detector_module():
    """ส่งไฟล์ JS ตรวจจับวัตถุ (MediaPipe) ให้หน้าเว็บโหลดไปรันในเบราว์เซอร์"""
    return send_from_directory(os.path.dirname(os.path.abspath(__file__)), "object-detector-module.js",
                               mimetype="application/javascript")


@app.route("/chat", methods=["POST"])
def chat():
    message = body().get("message")
    if not message:
        return bad("message is required")
    return jsonify({"reply": f"ไอเดียของคุณน่าสนใจมาก! ลองนำข้อความ '{message}' นี้ไปสร้างภาพได้เลย",
                    "image_prompt_used": message})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True, threaded=True)
