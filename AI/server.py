"""
server.py — img2img & upscale proxy ไป Forge Neo (Stability Matrix)
============================================================
พอร์ต 5000
รับ request จาก Frontend สำหรับโหมด Image-to-Image และ Upscale
แล้วแปลงร่างส่งต่อให้ Forge Neo สร้างภาพจริง

Endpoints:
  POST /api/img2img  -> { prompt, style, image, strength } -> { image_url }
  POST /api/upscale  -> { image, scale } -> { image_url }
  POST /api/blur      -> { image, strength } -> { image_url }
  POST /api/canny     -> { image, low, high } -> { image_url }
  GET  /health

หมายเหตุ: /api/blur และ /api/canny ประมวลผลด้วย PIL/OpenCV ในเครื่องนี้เลย
ไม่ต้องพึ่ง Forge Neo จึงต้องติดตั้งเพิ่ม: pip install opencv-python-headless numpy
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import base64
import io
import numpy as np
import cv2
from PIL import Image, ImageFilter

app = Flask(__name__)
CORS(app)

# เปลี่ยน IP เป็นเครื่องที่รัน Forge Neo หากรันแยกเครื่อง
FORGE_URL = "http://127.0.0.1:7860"

STYLE_SUFFIX = {
    "realistic": ", photorealistic, highly detailed, sharp focus, 8k",
    "anime": ", anime style, vibrant colors, cel shading",
    "cyberpunk": ", cyberpunk style, neon lights, futuristic city",
    "oil-painting": ", oil painting, visible brush strokes, classical art style",
}

GEN_TIMEOUT = 180  # วินาที รอผลสร้างภาพจาก Forge Neo
MAX_SIDE = 1024     # ด้านที่ยาวที่สุดของภาพ หลัง resize (ต้องหาร 8 ลงตัว)


def strip_data_url(image_b64):
    """frontend ส่งมาเป็น data URL (data:image/png;base64,....) ต้องตัด prefix ออกก่อน"""
    if not image_b64:
        return ""
    if "," in image_b64:
        return image_b64.split(",", 1)[1]
    return image_b64


def sanitize_image_b64(image_b64):
    """
    แก้ปัญหา CUDA error ตอน VAE encode ที่เกิดจากภาพต้นฉบับ:
    1. แปลงเป็น RGB เสมอ (ตัด alpha channel ออก ถ้าเป็น PNG โปร่งใส)
    2. ย่อภาพให้ด้านยาวสุดไม่เกิน MAX_SIDE และปัดขนาดให้หารด้วย 8 ลงตัว
       (Stable Diffusion/VAE ต้องการขนาดที่หาร 8 ลงตัวเท่านั้น)
    คืนค่า (clean_base64_string, width, height)
    """
    raw_bytes = base64.b64decode(image_b64)
    img = Image.open(io.BytesIO(raw_bytes))
    img = img.convert("RGB")  # ตัด alpha channel / แปลงโหมดสีแปลกๆ ทิ้ง

    w, h = img.size
    scale = min(MAX_SIDE / max(w, h), 1.0)  # ย่อเฉพาะถ้าใหญ่เกิน ไม่ขยายภาพเล็ก
    new_w = max(8, int(round(w * scale / 8) * 8))
    new_h = max(8, int(round(h * scale / 8) * 8))

    if (new_w, new_h) != (w, h):
        img = img.resize((new_w, new_h), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    clean_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return clean_b64, new_w, new_h


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/img2img", methods=["POST"])
def api_img2img():
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt")
    image_raw = data.get("image")

    if not prompt or not image_raw:
        return jsonify({"error": "missing 'prompt' or 'image'"}), 400

    style = data.get("style", "realistic")
    model = data.get("model")  # title ของ checkpoint ที่เลือกจากฝั่ง frontend
    strength = float(data.get("strength", 0.5))
    negative_prompt = data.get("negative_prompt", "")  # สิ่งที่ไม่ต้องการในภาพ
    full_prompt = f"{prompt}{STYLE_SUFFIX.get(style, '')}"

    try:
        image_b64 = strip_data_url(image_raw)
        image_b64, img_w, img_h = sanitize_image_b64(image_b64)
    except Exception as e:
        return jsonify({"error": f"ไฟล์ภาพไม่ถูกต้องหรือเปิดไม่ได้: {e}"}), 400

    payload = {
        "prompt": full_prompt,
        "negative_prompt": negative_prompt,
        "init_images": [image_b64],
        "denoising_strength": strength,
        "steps": 20,
        "width": img_w,
        "height": img_h,
    }
    if model:
        payload["override_settings"] = {"sd_model_checkpoint": model}
        payload["override_settings_restore_afterwards"] = False

    try:
        resp = requests.post(
            f"{FORGE_URL}/sdapi/v1/img2img",
            json=payload,
            timeout=GEN_TIMEOUT
        )
        resp.raise_for_status()
        images = resp.json().get("images")
        if not images:
            return jsonify({"error": "Forge Neo ไม่คืนภาพกลับมา"}), 502

        return jsonify({"image_url": f"data:image/png;base64,{images[0]}"})

    except requests.exceptions.ConnectionError:
        return jsonify({
            "error": "เชื่อมต่อ Forge Neo ไม่ได้ กรุณาเช็คว่าเปิด Stability Matrix (Forge Neo) อยู่หรือไม่"
        }), 502
    except requests.exceptions.Timeout:
        return jsonify({"error": "สร้างภาพนานเกินไป (timeout)"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/blur", methods=["POST"])
def api_blur():
    """
    รับภาพ + ระดับความเบลอ (blur strength) แล้วเบลอภาพด้วย Gaussian Blur (PIL)
    ไม่ต้องยิงไป Forge Neo เพราะเป็นการประมวลผลภาพล้วนๆ ทำในเครื่อง Flask ได้เลย
    """
    data = request.get_json(silent=True) or {}
    image_raw = data.get("image")

    if not image_raw:
        return jsonify({"error": "missing 'image'"}), 400

    try:
        strength = float(data.get("strength", 15))
    except (TypeError, ValueError):
        strength = 15.0
    strength = max(0.0, min(strength, 100.0))  # กันค่าหลุดขอบเขต (ตาม slider ฝั่ง frontend 1-100)

    # ค่าจาก slider (1-100) แรงเกินไปถ้าใช้เป็น radius ตรงๆ (GaussianBlur radius = พิกเซลจริง)
    # หารด้วย BLUR_SCALE เพื่อให้ความเบลอค่อยๆ ไล่ระดับแบบใช้งานได้จริง
    BLUR_SCALE = 4.0
    blur_radius = strength / BLUR_SCALE

    try:
        image_b64 = strip_data_url(image_raw)
        raw_bytes = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")

        blurred = img.filter(ImageFilter.GaussianBlur(radius=blur_radius))

        buf = io.BytesIO()
        blurred.save(buf, format="PNG")
        result_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        return jsonify({"image_url": f"data:image/png;base64,{result_b64}"})

    except Exception as e:
        return jsonify({"error": f"เบลอภาพไม่สำเร็จ: {e}"}), 400


@app.route("/api/canny", methods=["POST"])
def api_canny():
    """
    รับภาพ + threshold low/high แล้วทำ Canny edge detection ด้วย OpenCV
    คืนภาพขอบ (edge map) กลับเป็น data URL เหมือนโหมดอื่นๆ
    """
    data = request.get_json(silent=True) or {}
    image_raw = data.get("image")

    if not image_raw:
        return jsonify({"error": "missing 'image'"}), 400

    try:
        low = int(data.get("low", 100))
        high = int(data.get("high", 200))
    except (TypeError, ValueError):
        low, high = 100, 200
    low = max(0, min(low, 255))
    high = max(0, min(high, 255))

    try:
        image_b64 = strip_data_url(image_raw)
        raw_bytes = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")

        np_img = np.array(img)
        gray = cv2.cvtColor(np_img, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, low, high)
        edges_rgb = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)

        result_img = Image.fromarray(edges_rgb)
        buf = io.BytesIO()
        result_img.save(buf, format="PNG")
        result_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        return jsonify({"image_url": f"data:image/png;base64,{result_b64}"})

    except Exception as e:
        return jsonify({"error": f"ทำ Canny edge detection ไม่สำเร็จ: {e}"}), 400


@app.route("/api/upscale", methods=["POST"])
def api_upscale():
    data = request.get_json(silent=True) or {}
    image_raw = data.get("image")

    if not image_raw:
        return jsonify({"error": "missing 'image'"}), 400

    scale = float(data.get("scale", 2))
    image_b64 = strip_data_url(image_raw)

    try:
        resp = requests.post(
            f"{FORGE_URL}/sdapi/v1/extra-single-image",
            json={
                "upscaling_resize": scale,
                "upscaler_1": "R-ESRGAN 4x+",  # ตัว Upscaler มาตรฐานใน Forge/WebUI
                "image": image_b64
            },
            timeout=GEN_TIMEOUT
        )
        resp.raise_for_status()
        result_image = resp.json().get("image")
        if not result_image:
            return jsonify({"error": "Forge Neo ไม่คืนภาพ Upscale กลับมา"}), 502

        return jsonify({"image_url": f"data:image/png;base64,{result_image}"})

    except requests.exceptions.ConnectionError:
        return jsonify({
            "error": "เชื่อมต่อ Forge Neo ไม่ได้ กรุณาเช็คว่าเปิด Stability Matrix (Forge Neo) อยู่หรือไม่"
        }), 502
    except requests.exceptions.Timeout:
        return jsonify({"error": "ขยายภาพนานเกินไป (timeout)"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)