"""
chat.py — Backend API (Flask)
==============================
พอร์ต 5002
รับ request จาก Frontend สำหรับโหมด Text-to-Image และ Chat
แล้วยิงไปที่ Forge Neo (Stability Matrix) เพื่อสร้างภาพ

Endpoints:
  POST /api/generate   -> text-to-image : { prompt, style } -> { image_url }
  POST /chat            -> { message }   -> { reply, image_prompt_used }
  GET  /health
"""

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


def build_prompt(prompt, style):
    suffix = STYLE_SUFFIX.get(style, "")
    return f"{prompt}{suffix}"


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/models", methods=["GET"])
def get_models():
    """
    ดึงรายชื่อโมเดล (checkpoint) ที่มีอยู่จริงใน Stability Matrix / Forge Neo
    คืนค่าเป็น [{ "title": "...", "model_name": "..." }, ...]
    """
    try:
        resp = requests.get(f"{FORGE_URL}/sdapi/v1/sd-models", timeout=15)
        resp.raise_for_status()
        raw_models = resp.json()
        models = [
            {
                "title": m.get("title"),
                "model_name": m.get("model_name"),
            }
            for m in raw_models
        ]
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
    prompt = data.get("prompt")
    style = data.get("style", "realistic")
    model = data.get("model")  # title ของ checkpoint ที่เลือกจาก dropdown/chip ฝั่ง frontend
    negative_prompt = data.get("negative_prompt", "")  # สิ่งที่ไม่ต้องการในภาพ

    if not prompt:
        return jsonify({"error": "missing 'prompt'"}), 400

    full_prompt = build_prompt(prompt, style)

    payload = {
        "prompt": full_prompt,
        "negative_prompt": negative_prompt,
        "steps": 20,
        "width": 1024,
        "height": 1024,
    }

    # ถ้าผู้ใช้เลือกโมเดล ให้สั่ง Forge Neo สลับ checkpoint ก่อนสร้างภาพ
    if model:
        payload["override_settings"] = {"sd_model_checkpoint": model}
        payload["override_settings_restore_afterwards"] = False

    try:
        resp = requests.post(
            f"{FORGE_URL}/sdapi/v1/txt2img",
            json=payload,
            timeout=GEN_TIMEOUT
        )
        resp.raise_for_status()
        images = resp.json().get("images")
        if not images:
            return jsonify({"error": "Forge Neo ไม่คืนภาพกลับมา"}), 502

        # ส่งกลับเป็น Data URL ตามที่ script.js คาดหวัง
        return jsonify({"image_url": f"data:image/png;base64,{images[0]}"})

    except requests.exceptions.ConnectionError:
        return jsonify({
            "error": "เชื่อมต่อ Forge Neo ไม่ได้ กรุณาเช็คว่าเปิด Stability Matrix (Forge Neo) อยู่หรือไม่"
        }), 502
    except requests.exceptions.Timeout:
        return jsonify({"error": "สร้างภาพนานเกินไป (timeout)"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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