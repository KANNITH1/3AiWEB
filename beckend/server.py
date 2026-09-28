"""
server.py — Gateway (Flask) พอร์ต 5000
=======================================
Frontend (script.js) --> server.py --> chat.py (5002) --> Forge Neo (7860)

server.py ไม่คุยกับ Forge Neo เอง แค่รับจากหน้าเว็บแล้วส่งต่อให้ chat.py
แล้วส่งผลลัพธ์กลับไปให้หน้าเว็บ

  POST /api/generate  -> chat.py /api/generate  (text2img)
  POST /api/img2img   -> chat.py /api/img2img
  POST /api/upscale   -> chat.py /api/upscale
  POST /chat          -> chat.py /chat
  GET  /health
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

CHAT_URL = "http://127.0.0.1:5002"   # ถ้า chat.py อยู่คนละเครื่อง ให้เปลี่ยน IP
TIMEOUT = 200                         # มากกว่า GEN_TIMEOUT (180) ใน chat.py

# field ที่ต้องมีในแต่ละ endpoint
REQUIRED = {
    "/api/generate": ["prompt"],
    "/api/img2img": ["prompt", "image"],
    "/api/upscale": ["image"],
    "/chat": ["message"],
}


def forward(path):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "invalid JSON body"}), 400

    for field in REQUIRED[path]:
        if not data.get(field):
            return jsonify({"error": f"missing '{field}'"}), 400

    try:
        resp = requests.post(f"{CHAT_URL}{path}", json=data, timeout=TIMEOUT)
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "เชื่อมต่อ chat.py ไม่ได้ กรุณาเช็คว่ารัน chat.py (พอร์ต 5002) อยู่หรือไม่"}), 502
    except requests.exceptions.Timeout:
        return jsonify({"error": "chat.py ตอบกลับช้าเกินไป (timeout)"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    try:
        body = resp.json()
    except ValueError:
        return jsonify({"error": "chat.py คืนข้อมูลที่ไม่ใช่ JSON"}), 502

    # ส่ง JSON และ status code จาก chat.py กลับไปตรงๆ
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


@app.route("/chat", methods=["POST"])
def chat():
    return forward("/chat")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)