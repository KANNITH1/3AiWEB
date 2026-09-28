"""
chat.py — Backend API (Flask)
==============================
พอร์ต 5002
รับ request จาก server.py (พอร์ต 5000) แล้วยิงไปที่ Forge Neo (Stability Matrix) เพื่อสร้างภาพ

Endpoints:
  GET  /api/models     -> { models: [...] }
  POST /api/generate   -> text-to-image : { prompt, style } -> { image_url }
  POST /api/img2img    -> image-to-image: { prompt, style, image, strength } -> { image_url }
  POST /api/upscale    -> upscale       : { image, scale } -> { image_url }
  POST /chat           -> { message }   -> { reply, image_prompt_used }
  GET  /health
"""

import base64
import io

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


def fit_size(b64_image, max_side=1024):
    """อ่านขนาดภาพต้นฉบับ ปรับเป็นพหุคูณของ 8 และไม่เกิน max_side (ถ้าไม่มี Pillow ใช้ 1024x1024)"""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(base64.b64decode(b64_image)))
        w, h = img.size
        scale = min(1.0, max_side / max(w, h))
        w = max(64, int(w * scale) // 8 * 8)
        h = max(64, int(h * scale) // 8 * 8)
        return w, h
    except Exception:
        return 1024, 1024


def extra_options(data):
    """negative_prompt และโมเดลที่เลือก (ถ้าหน้าเว็บส่งมา)"""
    opts = {}
    if data.get("negative_prompt"):
        opts["negative_prompt"] = data["negative_prompt"]
    if data.get("model"):
        opts["override_settings"] = {"sd_model_checkpoint": data["model"]}
    return opts


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


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/models", methods=["GET"])
def models():
    """รายชื่อโมเดล (checkpoint) ที่มีใน Forge Neo -> { models: [ชื่อ, ...] }"""
    try:
        resp = requests.get(f"{FORGE_URL}/sdapi/v1/sd-models", timeout=30)
        resp.raise_for_status()
        names = [m.get("title") or m.get("model_name") for m in resp.json()]
        return jsonify({"models": [n for n in names if n]})
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "เชื่อมต่อ Forge Neo ไม่ได้ กรุณาเช็คว่าเปิด Stability Matrix (Forge Neo) อยู่หรือไม่"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt")
    style = data.get("style", "realistic")

    if not prompt:
        return jsonify({"error": "missing 'prompt'"}), 400

    full_prompt = build_prompt(prompt, style)

    payload = {
        "prompt": full_prompt,
        "steps": 20,
        "width": 1024,
        "height": 1024,
    }
    payload.update(extra_options(data))
    result, err = call_forge("/sdapi/v1/txt2img", payload)
    if err:
        return err

    images = result.get("images")
    if not images:
        return jsonify({"error": "Forge Neo ไม่คืนภาพกลับมา"}), 502

    # ส่งกลับเป็น Data URL ตามที่ script.js คาดหวัง
    return jsonify({"image_url": f"data:image/png;base64,{images[0]}"})


@app.route("/api/img2img", methods=["POST"])
def img2img():
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt")
    style = data.get("style", "realistic")
    image = data.get("image")
    strength = data.get("strength", 0.6)  # script.js ส่งมาเป็น 0-1

    if not prompt:
        return jsonify({"error": "missing 'prompt'"}), 400
    if not image:
        return jsonify({"error": "missing 'image'"}), 400

    b64 = strip_data_url(image)
    width, height = fit_size(b64)

    payload = {
        "init_images": [b64],
        "prompt": build_prompt(prompt, style),
        "denoising_strength": strength,
        "steps": 20,
        "width": width,
        "height": height,
    }
    payload.update(extra_options(data))
    result, err = call_forge("/sdapi/v1/img2img", payload)
    if err:
        return err

    images = result.get("images")
    if not images:
        return jsonify({"error": "Forge Neo ไม่คืนภาพกลับมา"}), 502

    return jsonify({"image_url": f"data:image/png;base64,{images[0]}"})


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