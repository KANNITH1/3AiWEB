"""
server.py — Gateway (Flask) พอร์ต 5000
=======================================
จุดเดียวที่ Frontend คุยด้วย ส่งต่อไปยัง 2 ฝั่ง:

  auth.py (5001)  <-- /api/register, /api/login, /api/me, /api/change-password
  chat.py (5002)  <-- /api/models, /api/generate, /api/img2img, /api/upscale,
                       /api/blur, /api/canny, /chat

endpoint ที่ "สร้าง/แก้ภาพ" ต้องแนบ token ที่ได้จาก login มาด้วย ไม่งั้นได้ 401
  (generate, img2img, upscale, blur, canny)
endpoint ที่ไม่ต้อง login: health, models, register, login, chat

การเช็ค token ทำที่ server.py เอง (ไม่ต้องเรียกไป auth.py ทุกครั้ง) โดยถอดรหัส JWT
ด้วย SECRET_KEY ตัวเดียวกับใน auth.py — ถ้าแก้ SECRET_KEY ใน auth.py ต้องแก้ที่นี่ด้วย
"""

from functools import wraps

import jwt
from flask import Flask, request, jsonify, g
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)


# ---- จัดการ CORS preflight เอง (กันกรณี OPTIONS ไม่ได้ status 200) ----
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        resp = app.make_default_options_response()
        resp.status_code = 200
        return resp


@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


AUTH_URL = "http://127.0.0.1:5001"   # ที่อยู่ auth.py
CHAT_URL = "http://127.0.0.1:5002"   # ที่อยู่ chat.py
TIMEOUT = 200                         # มากกว่า GEN_TIMEOUT (180) ใน chat.py

# ⚠️ ต้องตรงกับ SECRET_KEY ใน auth.py เป๊ะๆ ไม่งั้น token จะถอดไม่ผ่าน
SECRET_KEY = "dev-secret-change-me"

# field ที่ต้องมีในแต่ละ endpoint (เฉพาะ POST)
REQUIRED = {
    "/api/generate": ["prompt"],
    "/api/img2img": ["prompt", "image"],
    "/api/upscale": ["image"],
    "/api/blur": ["image"],
    "/api/canny": ["image"],
    "/chat": ["message"],
    "/api/register": ["username", "password"],
    "/api/login": ["username", "password"],
    "/api/change-password": ["old_password", "new_password"],
}


# ---------- auth ----------
def login_required(f):
    """ใช้คลุม endpoint ที่ต้อง login: เช็ค Authorization: Bearer <token>"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "กรุณา login ก่อน (ไม่พบ token)"}), 401

        token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "token หมดอายุ กรุณา login ใหม่"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "token ไม่ถูกต้อง"}), 401

        g.user_id = payload.get("sub")
        g.username = payload.get("username")
        return f(*args, **kwargs)
    return wrapper


# ---------- forwarding ----------
def forward(base_url, path, method="POST", service="server"):
    data = None
    if method == "POST":
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "invalid JSON body"}), 400

        fields = REQUIRED.get(path, [])
        # /api/generate ที่ mode ไม่ใช่ text2img (เผื่ออนาคต) ต้องมีรูป init_image แทน
        if path == "/api/generate" and data.get("mode", "text2img") != "text2img":
            fields = ["init_image"]

        for field in fields:
            if not data.get(field):
                return jsonify({"error": f"missing '{field}'"}), 400

    try:
        resp = requests.request(method, f"{base_url}{path}", json=data,
                                 headers={"Authorization": request.headers.get("Authorization", "")},
                                 timeout=TIMEOUT)
    except requests.exceptions.ConnectionError:
        return jsonify({"error": f"เชื่อมต่อ {service} ไม่ได้ กรุณาเช็คว่ารันอยู่หรือไม่"}), 502
    except requests.exceptions.Timeout:
        return jsonify({"error": f"{service} ตอบกลับช้าเกินไป (timeout)"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    try:
        body = resp.json()
    except ValueError:
        return jsonify({"error": f"{service} คืนข้อมูลที่ไม่ใช่ JSON"}), 502

    return jsonify(body), resp.status_code


def forward_chat(path, method="POST"):
    return forward(CHAT_URL, path, method, service="chat.py")


def forward_auth(path, method="POST"):
    return forward(AUTH_URL, path, method, service="auth.py")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# ---------- auth routes (ไม่ต้อง login) ----------
@app.route("/api/register", methods=["POST"])
def register():
    return forward_auth("/api/register")


@app.route("/api/login", methods=["POST"])
def login():
    return forward_auth("/api/login")


@app.route("/api/me", methods=["GET"])
@login_required
def me():
    return forward_auth("/api/me", method="GET")


@app.route("/api/change-password", methods=["POST"])
@login_required
def change_password():
    return forward_auth("/api/change-password")


# ---------- image routes (ไม่ต้อง login: models) ----------
@app.route("/api/models", methods=["GET"])
def models():
    return forward_chat("/api/models", method="GET")


# ---------- image routes (ต้อง login) ----------
@app.route("/api/generate", methods=["POST"])
@login_required
def generate():
    return forward_chat("/api/generate")


@app.route("/api/img2img", methods=["POST"])
@login_required
def img2img():
    return forward_chat("/api/img2img")


@app.route("/api/upscale", methods=["POST"])
@login_required
def upscale():
    return forward_chat("/api/upscale")


@app.route("/api/blur", methods=["POST"])
@login_required
def blur():
    return forward_chat("/api/blur")


@app.route("/api/canny", methods=["POST"])
@login_required
def canny():
    return forward_chat("/api/canny")


@app.route("/chat", methods=["POST"])
def chat():
    return forward_chat("/chat")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
