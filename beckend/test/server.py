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
<<<<<<< HEAD
"""

=======

กันบอทกดสแปม: login/register ทุกครั้งจะตอบกลับช้าลง 3 วิเสมอ (ไม่ว่าสำเร็จหรือไม่)
ไม่มี CAPTCHA, ไม่มีระบบล็อกบัญชี, ไม่มีจำกัดจำนวนสมัครสมาชิก
"""

import threading
import time
>>>>>>> eb5cb57ff5b560040c6eab68842d04625016a9e7
from functools import wraps

import jwt
from flask import Flask, request, jsonify, g
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

<<<<<<< HEAD
=======

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


>>>>>>> eb5cb57ff5b560040c6eab68842d04625016a9e7
AUTH_URL = "http://127.0.0.1:5001"   # ที่อยู่ auth.py
CHAT_URL = "http://127.0.0.1:5002"   # ที่อยู่ chat.py
TIMEOUT = 200                         # มากกว่า GEN_TIMEOUT (180) ใน chat.py

# ⚠️ ต้องตรงกับ SECRET_KEY ใน auth.py เป๊ะๆ ไม่งั้น token จะถอดไม่ผ่าน
SECRET_KEY = "dev-secret-change-me"

<<<<<<< HEAD
# field ที่ต้องมีในแต่ละ endpoint (POST)
=======
RESPONSE_DELAY_SECONDS = 3   # หน่วงเวลาตอบกลับ login/register ทุกครั้ง กันกดสแปม

# ---------- ระบบล็อก login ----------
# ล็อกตาม email (ไม่ใช่ IP) เพราะผู้โจมตีอาจยิงมาจากหลายเครื่อง/หลาย IP พร้อมกัน
# ข้อจำกัด: มีคนแกล้ง login ผิดด้วย email ของคนอื่นเพื่อล็อกบัญชีเขาได้ (DoS เฉพาะบัญชี)
# ข้อมูลเก็บในหน่วยความจำ รีเซ็ตเมื่อ restart server.py
LOGIN_MAX_FAILURES = 5         # login ผิดได้สูงสุดกี่ครั้ง
LOGIN_WINDOW_SECONDS = 60      # ...ภายในกี่วินาที
LOGIN_LOCKOUT_SECONDS = 60     # ถ้าเกิน ล็อกไว้กี่วินาที

_RATE_LOCK = threading.Lock()
_LOGIN_FAILURES = {}   # username (lowercase) -> [timestamp, ...]


def _prune(timestamps, window):
    cutoff = time.time() - window
    return [t for t in timestamps if t > cutoff]


def is_login_locked(username):
    key = username.lower()
    with _RATE_LOCK:
        attempts = _prune(_LOGIN_FAILURES.get(key, []), LOGIN_WINDOW_SECONDS)
        _LOGIN_FAILURES[key] = attempts
        return len(attempts) >= LOGIN_MAX_FAILURES


def record_login_failure(username):
    key = username.lower()
    with _RATE_LOCK:
        attempts = _prune(_LOGIN_FAILURES.get(key, []), LOGIN_WINDOW_SECONDS)
        attempts.append(time.time())
        _LOGIN_FAILURES[key] = attempts


def clear_login_failures(username):
    with _RATE_LOCK:
        _LOGIN_FAILURES.pop(username.lower(), None)

# field ที่ต้องมีในแต่ละ endpoint (เฉพาะ POST)
>>>>>>> eb5cb57ff5b560040c6eab68842d04625016a9e7
REQUIRED = {
    "/api/generate": ["prompt"],
    "/api/img2img": ["prompt", "image"],
    "/api/upscale": ["image"],
    "/api/blur": ["image"],
    "/api/canny": ["image"],
    "/chat": ["message"],
<<<<<<< HEAD
    "/api/register": ["username", "password"],
    "/api/login": ["username", "password"],
    "/api/change-password": ["old_password", "new_password"],
}


# ---------- auth ----------
=======
    "/api/register": ["username", "email", "password"],
    "/api/login": ["email", "password"],
    "/api/change-password": ["old_password", "new_password"],
    "/api/gallery": ["image"],
}


# ---------- auth (JWT) ----------
>>>>>>> eb5cb57ff5b560040c6eab68842d04625016a9e7
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
<<<<<<< HEAD
def forward(base_url, path, method="POST", service="server"):
    data = None
    if method == "POST":
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "invalid JSON body"}), 400
        for field in REQUIRED.get(path, []):
            if not data.get(field):
                return jsonify({"error": f"missing '{field}'"}), 400

    try:
        resp = requests.request(method, f"{base_url}{path}", json=data, timeout=TIMEOUT)
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
=======
def forward(base_url, path, method="POST", service="server", data=None):
    if method == "POST" and data is None:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return {"error": "invalid JSON body"}, 400

        fields = REQUIRED.get(path, [])
        if path == "/api/generate" and data.get("mode", "text2img") != "text2img":
            fields = ["init_image"]

        for field in fields:
            if not data.get(field):
                return {"error": f"missing '{field}'"}, 400

    try:
        resp = requests.request(method, f"{base_url}{path}", json=data,
                                 headers={"Authorization": request.headers.get("Authorization", "")},
                                 timeout=TIMEOUT)
    except requests.exceptions.ConnectionError:
        return {"error": f"เชื่อมต่อ {service} ไม่ได้ กรุณาเช็คว่ารันอยู่หรือไม่"}, 502
    except requests.exceptions.Timeout:
        return {"error": f"{service} ตอบกลับช้าเกินไป (timeout)"}, 504
    except Exception as e:
        return {"error": str(e)}, 500

    try:
        return resp.json(), resp.status_code
    except ValueError:
        snippet = resp.text[:200].replace("\n", " ")
        return {
            "error": f"{service} ตอบกลับไม่ใช่ JSON (status {resp.status_code}): {snippet}"
        }, 502


def forward_chat(path, method="POST"):
    body, status = forward(CHAT_URL, path, method, service="chat.py")
    return jsonify(body), status


def forward_auth(path, method="POST"):
    body, status = forward(AUTH_URL, path, method, service="auth.py")
    return jsonify(body), status
>>>>>>> eb5cb57ff5b560040c6eab68842d04625016a9e7


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# ---------- auth routes (ไม่ต้อง login) ----------
@app.route("/api/register", methods=["POST"])
def register():
<<<<<<< HEAD
    return forward_auth("/api/register")
=======
    resp = forward_auth("/api/register")
    time.sleep(RESPONSE_DELAY_SECONDS)
    return resp
>>>>>>> eb5cb57ff5b560040c6eab68842d04625016a9e7


@app.route("/api/login", methods=["POST"])
def login():
<<<<<<< HEAD
    return forward_auth("/api/login")
=======
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data.get("email") or not data.get("password"):
        time.sleep(RESPONSE_DELAY_SECONDS)
        return jsonify({"error": "missing 'email' or 'password'"}), 400

    email = data["email"]

    if is_login_locked(email):
        time.sleep(RESPONSE_DELAY_SECONDS)
        return jsonify({
            "error": f"พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารออย่างน้อย {LOGIN_LOCKOUT_SECONDS} วินาทีแล้วลองใหม่"
        }), 429

    body, status = forward(AUTH_URL, "/api/login", service="auth.py", data=data)

    if status == 200:
        clear_login_failures(email)
    elif status == 401:
        record_login_failure(email)

    time.sleep(RESPONSE_DELAY_SECONDS)
    return jsonify(body), status
>>>>>>> eb5cb57ff5b560040c6eab68842d04625016a9e7


@app.route("/api/me", methods=["GET"])
@login_required
def me():
<<<<<<< HEAD
    # ส่ง token เดิมต่อให้ auth.py ตรวจอีกชั้น
    try:
        resp = requests.get(f"{AUTH_URL}/api/me",
                             headers={"Authorization": request.headers.get("Authorization", "")},
                             timeout=TIMEOUT)
        return jsonify(resp.json()), resp.status_code
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "เชื่อมต่อ auth.py ไม่ได้ กรุณาเช็คว่ารันอยู่หรือไม่"}), 502
=======
    return forward_auth("/api/me", method="GET")
>>>>>>> eb5cb57ff5b560040c6eab68842d04625016a9e7


@app.route("/api/change-password", methods=["POST"])
@login_required
def change_password():
<<<<<<< HEAD
    data = request.get_json(silent=True) or {}
    try:
        resp = requests.post(f"{AUTH_URL}/api/change-password", json=data,
                              headers={"Authorization": request.headers.get("Authorization", "")},
                              timeout=TIMEOUT)
        return jsonify(resp.json()), resp.status_code
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "เชื่อมต่อ auth.py ไม่ได้ กรุณาเช็คว่ารันอยู่หรือไม่"}), 502
=======
    return forward_auth("/api/change-password")


# ---------- gallery (ต้อง login เสมอ — ของใครของมัน) ----------
@app.route("/api/gallery", methods=["GET", "POST"])
@login_required
def gallery():
    return forward_auth("/api/gallery", method=request.method)


@app.route("/api/gallery/<int:item_id>", methods=["DELETE"])
@login_required
def gallery_delete(item_id):
    return forward_auth(f"/api/gallery/{item_id}", method="DELETE")
>>>>>>> eb5cb57ff5b560040c6eab68842d04625016a9e7


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
