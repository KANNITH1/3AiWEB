"""
server.py — Gateway (Flask)
===========================
พอร์ต 5000
รับ request จาก Frontend (script.js) แล้วส่งต่อไปที่ chat.py (พอร์ต 5002)
จากนั้นนำผลลัพธ์ { image_url } ส่งกลับไปให้ Frontend

Endpoints (ตรงกับ API_ENDPOINTS ใน script.js):
  POST /api/generate   -> text-to-image
  POST /api/img2img    -> image-to-image
  POST /api/upscale    -> upscale
  GET  /health
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

# ถ้ารัน chat.py คนละเครื่อง ให้เปลี่ยนเป็น IP เครื่องนั้น เช่น "http://192.168.1.30:5002"
CHAT_URL = "http://127.0.0.1:5002"

# ต้องมากกว่า GEN_TIMEOUT ใน chat.py เล็กน้อย
FORWARD_TIMEOUT = 320


def validate(path, data):
    """ตรวจ input ก่อนส่งต่อ คืนข้อความ error หรือ None ถ้าผ่าน"""
    if path == "/api/generate":
        if not data.get("prompt"):
            return "missing 'prompt'"
    elif path == "/api/img2img":
        if not data.get("prompt"):
            return "missing 'prompt'"
        if not data.get("image"):
            return "missing 'image'"
    elif path == "/api/upscale":
        if not data.get("image"):
            return "missing 'image'"
    return None


def forward(path):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "invalid JSON body"}), 400

    err = validate(path, data)
    if err:
        return jsonify({"error": err}), 400

    try:
        resp = requests.post(f"{CHAT_URL}{path}", json=data, timeout=FORWARD_TIMEOUT)
    except requests.exceptions.ConnectionError:
        return jsonify({
            "error": "เชื่อมต่อ chat.py ไม่ได้ กรุณาเช็คว่ารัน chat.py (พอร์ต 5002) อยู่หรือไม่"
        }), 502
    except requests.exceptions.Timeout:
        return jsonify({"error": "chat.py ตอบกลับช้าเกินไป (timeout)"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # ส่ง JSON + status code จาก chat.py กลับไปตรงๆ
    try:
        body = resp.json()
    except ValueError:
        return jsonify({"error": "chat.py คืนข้อมูลที่ไม่ใช่ JSON"}), 502

    return jsonify(body), resp.status_code


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/generate", methods=["POST"])
def generate():
    return forward("/api/generate")


@app.route("/api/img2img", methods=["POST"])
def img2img():
    return forward("/api/img2img")


@app.route("/api/upscale", methods=["POST"])
def upscale():
    return forward("/api/upscale")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
