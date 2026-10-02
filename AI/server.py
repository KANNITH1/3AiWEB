"""
server.py — Gateway (Flask) พอร์ต 5000
=======================================
Frontend (script.js) --> server.py --> chat.py (5002) --> Forge Neo (7860)

  POST /api/register  -> สมัครสมาชิก (SQLite: users.db)
  POST /api/login     -> เข้าสู่ระบบ
  GET  /api/models    -> chat.py /api/models
  POST /api/generate  -> chat.py /api/generate (ทุกโหมด: text2img/img2img/blur/canny)
  POST /api/img2img | /api/upscale | /api/blur | /api/canny | /chat
  GET  /health

ติดตั้ง: pip install flask flask-cors requests
"""

import os
import sqlite3
from contextlib import closing

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)  # จัดการ CORS + OPTIONS preflight ให้อัตโนมัติ

CHAT_URL = "http://127.0.0.1:5002"   # ถ้า chat.py อยู่คนละเครื่อง ให้เปลี่ยน IP
TIMEOUT = 200                         # มากกว่า GEN_TIMEOUT (180) ใน chat.py
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "users.db")


# ===================== Database / Auth =====================
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with closing(get_db()) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""")
        conn.commit()


@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not username or not email or not password:
        return jsonify({"error": "กรุณากรอกข้อมูลให้ครบ"}), 400
    if len(password) < 6:
        return jsonify({"error": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"}), 400

    try:
        with closing(get_db()) as conn:
            conn.execute(
                "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
                (username, email, generate_password_hash(password)),
            )
            conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "อีเมลนี้ถูกใช้สมัครแล้ว"}), 409
    return jsonify({"message": "ok"}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    with closing(get_db()) as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "อีเมลหรือรหัสผ่านไม่ถูกต้อง"}), 401
    return jsonify({"username": row["username"], "email": row["email"]})


# ===================== Gateway → chat.py =====================
# field ที่ต้องมีในแต่ละ endpoint (เฉพาะ POST)
REQUIRED = {
    "/api/generate": ["prompt"],
    "/api/img2img": ["prompt", "image"],
    "/api/upscale": ["image"],
    "/api/blur": ["image"],
    "/api/canny": ["image"],
    "/chat": ["message"],
}


def forward(path, method="POST"):
    data = None
    if method == "POST":
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "invalid JSON body"}), 400

        fields = REQUIRED.get(path, [])
        # mode ที่ไม่ใช่ text2img: blur/canny/detection ไม่มี prompt ต้องมี init_image แทน
        if path == "/api/generate" and data.get("mode", "text2img") != "text2img":
            fields = ["init_image"]

        for field in fields:
            if not data.get(field):
                return jsonify({"error": f"missing '{field}'"}), 400

    try:
        resp = requests.request(method, f"{CHAT_URL}{path}", json=data, timeout=TIMEOUT)
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

    return jsonify(body), resp.status_code


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/models", methods=["GET"])
def models():
    return forward("/api/models", method="GET")


@app.route("/api/generate", methods=["POST"])
def generate():
    return forward("/api/generate")


@app.route("/api/img2img", methods=["POST"])
def img2img():
    return forward("/api/img2img")


@app.route("/api/upscale", methods=["POST"])
def upscale():
    return forward("/api/upscale")


@app.route("/api/blur", methods=["POST"])
def blur():
    return forward("/api/blur")


@app.route("/api/canny", methods=["POST"])
def canny():
    return forward("/api/canny")


@app.route("/chat", methods=["POST"])
def chat():
    return forward("/chat")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
