"""
server.py — img2img & upscale proxy ไป Forge Neo (Stability Matrix)
============================================================
พอร์ต 5000
รับ request จาก Frontend สำหรับโหมด Image-to-Image และ Upscale
แล้วแปลงร่างส่งต่อให้ Forge Neo สร้างภาพจริง

Endpoints:
  POST /api/img2img  -> { prompt, style, image, strength } -> { image_url }
  POST /api/upscale  -> { image, scale } -> { image_url }
  GET  /health
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

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


def strip_data_url(image_b64):
    """frontend ส่งมาเป็น data URL (data:image/png;base64,....) ต้องตัด prefix ออกก่อน"""
    if not image_b64:
        return ""
    if "," in image_b64:
        return image_b64.split(",", 1)[1]
    return image_b64


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
    strength = float(data.get("strength", 0.5))
    image_b64 = strip_data_url(image_raw)
    full_prompt = f"{prompt}{STYLE_SUFFIX.get(style, '')}"

    try:
        resp = requests.post(
            f"{FORGE_URL}/sdapi/v1/img2img",
            json={
                "prompt": full_prompt,
                "init_images": [image_b64],
                "denoising_strength": strength,
                "steps": 20,
                "width": 1024,
                "height": 1024,
            },
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