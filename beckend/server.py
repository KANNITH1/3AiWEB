"""
server.py — Gateway (Flask) พอร์ต 5000
=======================================
Frontend (script.js) --> server.py --> chat.py (5002) --> Forge Neo (7860)

  POST /api/generate  -> ส่งต่อไป chat.py (text2img)
  POST /chat          -> ส่งต่อไป chat.py
  POST /api/img2img   -> server.py ยิง Forge Neo เอง (chat.py ตัวเดิมไม่มี)
  POST /api/upscale   -> server.py ยิง Forge Neo เอง
  GET  /health

ทุก endpoint ที่ได้ภาพ คืน { "image_url": "data:image/png;base64,..." }
ถ้า error คืน { "error": "ข้อความ" } พร้อม status code
"""

import base64
import io

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

CHAT_URL = "http://127.0.0.1:5002"    # chat.py (ถ้าอยู่คนละเครื่องให้เปลี่ยน IP)
FORGE_URL = "http://127.0.0.1:7860"   # Forge Neo (ใช้กับ img2img / upscale)
TIMEOUT = 200                          # มากกว่า GEN_TIMEOUT (180) ใน chat.py

# ชื่อ upscaler ดูที่มีจริงได้ที่ {FORGE_URL}/sdapi/v1/upscalers
UPSCALER = "R-ESRGAN 4x+"

STYLE_SUFFIX = {
    "realistic": ", photorealistic, highly detailed, sharp focus, 8k",
    "anime": ", anime style, vibrant colors, cel shading",
    "cyberpunk": ", cyberpunk style, neon lights, futuristic city",
    "oil-painting": ", oil painting, visible brush strokes, classical art style",
}


# ---------- helpers ----------
def get_json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def strip_data_url(s):
    """'data:image/png;base64,AAAA' -> 'AAAA'"""
    if s.lstrip().startswith("data:") and "," in s:
        return s.split(",", 1)[1]
    return s


def fit_size(b64, max_side=1024):
    """ขนาดภาพต้นฉบับ ปรับเป็นพหุคูณของ 8 (ไม่มี Pillow ใช้ 1024x1024)"""
    try:
        from PIL import Image
        w, h = Image.open(io.BytesIO(base64.b64decode(b64))).size
        k = min(1.0, max_side / max(w, h))
        return max(64, int(w * k) // 8 * 8), max(64, int(h * k) // 8 * 8)
    except Exception:
        return 1024, 1024


def post_json(url, payload, service):
    """POST แล้วคืน (json, None) หรือ (None, error_response)"""
    try:
        r = requests.post(url, json=payload, timeout=TIMEOUT)
    except requests.exceptions.ConnectionError:
        return None, (jsonify({"error": f"เชื่อมต่อ {service} ไม่ได้ กรุณาเช็คว่าเปิดอยู่หรือไม่"}), 502)
    except requests.exceptions.Timeout:
        return None, (jsonify({"error": f"{service} ตอบกลับช้าเกินไป (timeout)"}), 504)
    except Exception as e:
        return None, (jsonify({"error": str(e)}), 500)

    try:
        body = r.json()
    except ValueError:
        return None, (jsonify({"error": f"{service} คืนข้อมูลที่ไม่ใช่ JSON"}), 502)

    if not r.ok:
        msg = body.get("error") or body.get("detail") or f"{service} error {r.status_code}"
        return None, (jsonify({"error": msg}), r.status_code)
    return body, None


def to_image_response(b64):
    return jsonify({"image_url": f"data:image/png;base64,{b64}"})


# ---------- routes ----------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/generate", methods=["POST"])
def generate():
    """text2img: ส่งต่อให้ chat.py (chat.py ต่อ style ให้เอง)"""
    data = get_json_body()
    if not data:
        return jsonify({"error": "invalid JSON body"}), 400
    if not data.get("prompt"):
        return jsonify({"error": "missing 'prompt'"}), 400

    body, err = post_json(f"{CHAT_URL}/api/generate",
                          {"prompt": data["prompt"], "style": data.get("style", "realistic")},
                          "chat.py")
    if err:
        return err
    if not body.get("image_url"):
        return jsonify({"error": "chat.py ไม่คืนภาพกลับมา"}), 502
    return jsonify({"image_url": body["image_url"]})


@app.route("/chat", methods=["POST"])
def chat():
    data = get_json_body()
    if not data or not data.get("message"):
        return jsonify({"error": "message is required"}), 400
    body, err = post_json(f"{CHAT_URL}/chat", {"message": data["message"]}, "chat.py")
    return err if err else jsonify(body)


@app.route("/api/img2img", methods=["POST"])
def img2img():
    data = get_json_body()
    if not data:
        return jsonify({"error": "invalid JSON body"}), 400
    if not data.get("prompt"):
        return jsonify({"error": "missing 'prompt'"}), 400
    if not data.get("image"):
        return jsonify({"error": "missing 'image'"}), 400

    b64 = strip_data_url(data["image"])
    w, h = fit_size(b64)
    prompt = data["prompt"] + STYLE_SUFFIX.get(data.get("style", "realistic"), "")

    body, err = post_json(f"{FORGE_URL}/sdapi/v1/img2img", {
        "init_images": [b64],
        "prompt": prompt,
        "denoising_strength": data.get("strength", 0.6),
        "steps": 20,
        "width": w,
        "height": h,
    }, "Forge Neo")
    if err:
        return err
    images = body.get("images")
    if not images:
        return jsonify({"error": "Forge Neo ไม่คืนภาพกลับมา"}), 502
    return to_image_response(images[0])


@app.route("/api/upscale", methods=["POST"])
def upscale():
    data = get_json_body()
    if not data:
        return jsonify({"error": "invalid JSON body"}), 400
    if not data.get("image"):
        return jsonify({"error": "missing 'image'"}), 400

    body, err = post_json(f"{FORGE_URL}/sdapi/v1/extra-single-image", {
        "image": strip_data_url(data["image"]),
        "upscaling_resize": data.get("scale", 2),
        "upscaler_1": UPSCALER,
    }, "Forge Neo")
    if err:
        return err
    if not body.get("image"):
        return jsonify({"error": "Forge Neo ไม่คืนภาพกลับมา"}), 502
    return to_image_response(body["image"])


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)