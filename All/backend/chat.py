"""
chat.py — Backend API (Flask)
==============================
พอร์ต 5002
รับ request จาก server.py (พอร์ต 5000) แล้วยิงไปที่ Forge Neo (Stability Matrix) เพื่อสร้างภาพ

Endpoints:
  GET  /api/models     -> รายชื่อโมเดล (checkpoint) ที่มีใน Forge : { models: [{title, model_name}] }
  POST /api/generate   -> text-to-image : { prompt, negative_prompt, model, style } -> { image_url }
  POST /api/img2img    -> image-to-image: { prompt, negative_prompt, model, style, image, strength } -> { image_url }
  POST /api/upscale    -> upscale       : { image, scale } -> { image_url }
  POST /api/blur       -> เบลอภาพ (OpenCV)  : { image, strength } -> { image_url }
  POST /api/canny      -> ขอบภาพ (OpenCV)   : { image, low, high } -> { image_url }
  POST /chat           -> { message }   -> { reply, image_prompt_used }
  GET  /health

ต้องติดตั้ง: pip install flask flask-cors requests pillow opencv-python-headless numpy
"""

import base64
import io
import json

import cv2
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

# เปลี่ยน IP เป็นเครื่องที่รัน Forge Neo หากรันแยกเครื่อง (เช่น "http://192.168.1.30:7860")
FORGE_URL = "http://127.0.0.1:7860"

STYLE_SUFFIX = {
    "realistic": ", photorealistic, highly detailed, sharp focus, 8k",
    "anime": ", anime style, vibrant colors, cel shading",
    "cyberpunk": ", cyberpunk style, neon lights, futuristic city",
    "oil-painting": ", oil painting, visible brush strokes, classical art style",
}

GEN_TIMEOUT = 180  # วินาที รอผลสร้างภาพจาก Forge Neo

# ชื่อ upscaler ใน Forge ถ้า error ให้ดูชื่อที่มีจริงที่ GET {FORGE_URL}/sdapi/v1/upscalers
UPSCALER = "R-ESRGAN 4x+"


def build_prompt(prompt, style):
    suffix = STYLE_SUFFIX.get(style, "")
    return f"{prompt}{suffix}"


def strip_data_url(data_url):
    """'data:image/png;base64,AAAA' -> 'AAAA' (Forge ต้องการ base64 ล้วน)"""
    if "," in data_url and data_url.lstrip().startswith("data:"):
        return data_url.split(",", 1)[1]
    return data_url


def prepare_image(b64_image, max_side=1024):
    """เตรียมภาพก่อนส่งเข้า Forge:
    1) แปลงเป็น RGB (ตัด alpha ของ PNG โปร่งใส — สาเหตุของ CUDA error ตอน VAE encode)
    2) ปรับขนาดให้เป็นพหุคูณของ 8 และไม่เกิน max_side
    คืนค่า (base64 ใหม่, width, height) — ถ้าเปิดภาพไม่ได้จะ raise ValueError"""
    try:
        img = Image.open(io.BytesIO(base64.b64decode(b64_image))).convert("RGB")
    except Exception as e:
        raise ValueError(f"ไฟล์ภาพไม่ถูกต้องหรือเปิดไม่ได้: {e}")

    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    new_w = max(64, int(w * scale) // 8 * 8)
    new_h = max(64, int(h * scale) // 8 * 8)
    if (new_w, new_h) != (w, h):
        img = img.resize((new_w, new_h), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8"), new_w, new_h


def apply_model(payload, model):
    """ถ้าผู้ใช้เลือกโมเดล ให้ Forge สลับ checkpoint ก่อนสร้างภาพ"""
    if model:
        payload["override_settings"] = {"sd_model_checkpoint": model}
        payload["override_settings_restore_afterwards"] = False
    return payload


def data_url_to_cv(data_url):
    raw = base64.b64decode(strip_data_url(data_url))
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("ไฟล์ภาพไม่ถูกต้อง")
    return img


def cv_to_data_url(img):
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise ValueError("เข้ารหัสภาพไม่สำเร็จ")
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("utf-8")


def call_forge(endpoint, payload):
    """ยิงไป Forge Neo แล้วคืน (json, None) หรือ (None, (response, status))"""
    try:
        resp = requests.post(f"{FORGE_URL}{endpoint}", json=payload, timeout=GEN_TIMEOUT)
        resp.raise_for_status()
        return resp.json(), None
    except requests.exceptions.ConnectionError:
        return None, (jsonify({
            "error": "เชื่อมต่อ Forge Neo ไม่ได้ กรุณาเช็คว่าเปิด Stability Matrix (Forge Neo) อยู่หรือไม่"
        }), 502)
    except requests.exceptions.Timeout:
        return None, (jsonify({"error": "สร้างภาพนานเกินไป (timeout)"}), 504)
    except requests.exceptions.HTTPError as e:
        return None, (jsonify({"error": f"Forge Neo error: {e}"}), 502)
    except Exception as e:
        return None, (jsonify({"error": str(e)}), 500)


def get_used_seed(result, fallback=-1):
    """Forge คืน seed จริงที่ใช้ใน result['info'] (เป็น JSON string)"""
    try:
        return json.loads(result.get("info", "{}")).get("seed", fallback)
    except Exception:
        return fallback


def dispatch_mode(mode, data):
    """รองรับ payload เดิมของหน้าเว็บ: ทุกโหมดยิงมาที่ /api/generate พร้อมฟิลด์ mode"""
    handlers = {"img2img": img2img, "blur": blur, "canny": canny, "detection": detect}
    handler = handlers.get(mode)
    if not handler:
        return jsonify({"error": f"ไม่รองรับ mode: {mode}"}), 400
    data["image"] = data.get("image") or data.get("init_image")  # หน้าเว็บส่งชื่อ init_image
    if mode == "blur":
        data["strength"] = data.get("blur_strength", 15)         # หน้าเว็บส่งชื่อ blur_strength
    return handler(data)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/models", methods=["GET"])
def get_models():
    """ดึงรายชื่อ checkpoint ที่มีจริงใน Forge Neo ให้หน้าเว็บสร้างปุ่มเลือกโมเดล"""
    try:
        resp = requests.get(f"{FORGE_URL}/sdapi/v1/sd-models", timeout=15)
        resp.raise_for_status()
        models = [{"title": m.get("title"), "model_name": m.get("model_name")} for m in resp.json()]
        return jsonify({"models": models})
    except requests.exceptions.ConnectionError:
        return jsonify({
            "error": "เชื่อมต่อ Forge Neo ไม่ได้ กรุณาเช็คว่าเปิด Stability Matrix (Forge Neo) อยู่หรือไม่"
        }), 502
    except requests.exceptions.Timeout:
        return jsonify({"error": "ดึงรายชื่อโมเดลนานเกินไป (timeout)"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "text2img")
    if mode != "text2img":
        return dispatch_mode(mode, data)
    prompt = data.get("prompt")
    style = data.get("style", "realistic")

    if not prompt:
        return jsonify({"error": "missing 'prompt'"}), 400

    payload = apply_model({
        "prompt": build_prompt(prompt, style),
        "negative_prompt": data.get("negative_prompt", ""),
        "steps": 20,
        "seed": int(data.get("seed", -1)),
        "width": 1024,
        "height": 1024,
    }, data.get("model"))

    result, err = call_forge("/sdapi/v1/txt2img", payload)
    if err:
        return err

    images = result.get("images")
    if not images:
        return jsonify({"error": "Forge Neo ไม่คืนภาพกลับมา"}), 502

    # ส่งกลับเป็น Data URL ตามที่ script.js คาดหวัง
    return jsonify({
        "image_url": f"data:image/png;base64,{images[0]}",
        "seed": get_used_seed(result, data.get("seed", -1)),
    })


@app.route("/api/img2img", methods=["POST"])
def img2img(data=None):
    data = data if data is not None else (request.get_json(silent=True) or {})
    prompt = data.get("prompt")
    style = data.get("style", "realistic")
    image = data.get("image")
    strength = data.get("strength", 0.6)  # script.js ส่งมาเป็น 0-1

    if not prompt:
        return jsonify({"error": "missing 'prompt'"}), 400
    if not image:
        return jsonify({"error": "missing 'image'"}), 400

    try:
        b64, width, height = prepare_image(strip_data_url(image))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    payload = apply_model({
        "init_images": [b64],
        "prompt": build_prompt(prompt, style),
        "negative_prompt": data.get("negative_prompt", ""),
        "denoising_strength": strength,
        "steps": 20,
        "seed": int(data.get("seed", -1)),
        "width": width,
        "height": height,
    }, data.get("model"))

    result, err = call_forge("/sdapi/v1/img2img", payload)
    if err:
        return err

    images = result.get("images")
    if not images:
        return jsonify({"error": "Forge Neo ไม่คืนภาพกลับมา"}), 502

    return jsonify({
        "image_url": f"data:image/png;base64,{images[0]}",
        "seed": get_used_seed(result, data.get("seed", -1)),
    })


@app.route("/api/upscale", methods=["POST"])
def upscale():
    data = request.get_json(silent=True) or {}
    image = data.get("image")
    scale = data.get("scale", 2)

    if not image:
        return jsonify({"error": "missing 'image'"}), 400

    result, err = call_forge("/sdapi/v1/extra-single-image", {
        "image": strip_data_url(image),
        "upscaling_resize": scale,
        "upscaler_1": UPSCALER,
    })
    if err:
        return err

    out = result.get("image")
    if not out:
        return jsonify({"error": "Forge Neo ไม่คืนภาพกลับมา"}), 502

    return jsonify({"image_url": f"data:image/png;base64,{out}"})


@app.route("/api/blur", methods=["POST"])
def blur(data=None):
    """เบลอภาพด้วย OpenCV (ไม่ผ่าน Forge)"""
    data = data if data is not None else (request.get_json(silent=True) or {})
    if not data.get("image"):
        return jsonify({"error": "missing 'image'"}), 400
    try:
        img = data_url_to_cv(data["image"])
        ksize = max(1, int(float(data.get("strength", 15)))) | 1  # kernel ต้องเป็นเลขคี่
        return jsonify({"image_url": cv_to_data_url(cv2.GaussianBlur(img, (ksize, ksize), 0))})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/canny", methods=["POST"])
def canny(data=None):
    """หาเส้นขอบภาพด้วย Canny (OpenCV, ไม่ผ่าน Forge)"""
    data = data if data is not None else (request.get_json(silent=True) or {})
    if not data.get("image"):
        return jsonify({"error": "missing 'image'"}), 400
    try:
        img = data_url_to_cv(data["image"])
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, int(data.get("low", 100)), int(data.get("high", 200)))
        return jsonify({"image_url": cv_to_data_url(cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR))})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


_yolo = None


def get_yolo():
    """โหลด YOLO ครั้งแรกที่ใช้งาน (ดาวน์โหลด yolov8n.pt อัตโนมัติ ~6MB)"""
    global _yolo
    if _yolo is None:
        from ultralytics import YOLO
        _yolo = YOLO("yolov8n.pt")
    return _yolo


@app.route("/api/detect", methods=["POST"])
def detect(data=None):
    """ตรวจจับวัตถุด้วย YOLO แล้ววาดกรอบบนภาพ (ไม่ผ่าน Forge)"""
    data = data if data is not None else (request.get_json(silent=True) or {})
    if not data.get("image"):
        return jsonify({"error": "missing 'image'"}), 400
    try:
        img = data_url_to_cv(data["image"])
        result = get_yolo()(img, conf=float(data.get("conf", 0.25)),
                              max_det=int(data.get("max_results", 300)), verbose=False)[0]
        counts = {}
        for cls in result.boxes.cls:
            name = result.names[int(cls)]
            counts[name] = counts.get(name, 0) + 1
        return jsonify({"image_url": cv_to_data_url(result.plot()), "objects": counts})
    except ImportError:
        return jsonify({"error": "ยังไม่ได้ติดตั้ง ultralytics กรุณารัน: pip install ultralytics"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    message = data.get("message")

    if not message:
        return jsonify({"error": "message is required"}), 400

    return jsonify({
        "reply": f"ไอเดียของคุณน่าสนใจมาก! ลองนำข้อความ '{message}' นี้ไปสร้างภาพได้เลย",
        "image_prompt_used": message
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True, threaded=True)