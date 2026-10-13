"""
server.py — Gateway (Flask) พอร์ต 5000
จุดเดียวที่หน้าเว็บคุยด้วย แล้วส่งต่อไปยัง 2 ฝั่ง:

  auth.py (5001)  <- register, login, me, change-password, gallery, admin/users
  chat.py (5002)  <- models, generate, img2img, upscale, blur, canny, chat (+ไฟล์ JS ตรวจจับวัตถุ)

- เส้นทางที่ "สร้าง/แก้ภาพ", แกลเลอรี่ และ admin ต้องแนบ token จาก login ไม่งั้นได้ 401
  (ฝั่ง server.py ถอดรหัส JWT เอง ส่วนสิทธิ์ admin / บัญชีที่ถูกลบ auth.py เช็คจาก DB อีกชั้น)
- ไม่ต้อง login: health, models, register, login, chat
- กันบอท: login/register ตอบช้า 3 วิเสมอ + login ผิดเกิน 5 ครั้งใน 60 วิ ล็อกตาม email ชั่วคราว
"""
import os
import threading
import time
from functools import wraps

import jwt
import requests
from flask import Flask, request, jsonify, g, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ถ้า auth.py / chat.py อยู่คนละเครื่อง ตั้ง environment variable เช่น CHAT_URL=http://192.168.1.30:5002
AUTH_URL = os.environ.get("AUTH_URL", "http://127.0.0.1:5001")
CHAT_URL = os.environ.get("CHAT_URL", "http://127.0.0.1:5002")
TIMEOUT = 200   # ต้องมากกว่า GEN_TIMEOUT (180) ใน chat.py
# ⚠️ ต้องตรงกับ SECRET_KEY ใน auth.py ไม่งั้น token จะถอดไม่ผ่าน
SECRET_KEY = os.environ.get("FORGE_SECRET_KEY", "dev-secret-change-me")

RESPONSE_DELAY_SECONDS = 2
LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS, LOGIN_LOCKOUT_SECONDS = 5, 30, 30

# field ที่ต้องมีในแต่ละ endpoint (เฉพาะ POST)
REQUIRED = {
    "/api/generate": ["prompt"], "/api/img2img": ["prompt", "image"], "/api/upscale": ["image"],
    "/api/blur": ["image"], "/api/canny": ["image"], "/chat": ["message"],
    "/api/register": ["username", "email", "password"], "/api/login": ["email", "password"],
    "/api/change-password": ["old_password", "new_password"], "/api/gallery": ["image"],
}


# ================= CORS preflight =================
@app.before_request
def handle_preflight():
    """ตอบ OPTIONS ด้วย 200 เองเสมอ (กันบางกรณีที่ได้ status อื่น)"""
    if request.method == "OPTIONS":
        resp = app.make_default_options_response()
        resp.status_code = 200
        return resp


@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"   # ต้องมี DELETE/PUT
    return resp


# ================= ล็อก login ตาม email (เก็บในหน่วยความจำ รีเซ็ตเมื่อ restart) =================
# ล็อกตาม email ไม่ใช่ IP เพราะผู้โจมตีอาจยิงจากหลาย IP
# ข้อจำกัด: มีคนแกล้ง login ผิดด้วย email คนอื่นเพื่อล็อกบัญชีเขาได้
_lock = threading.Lock()
_failures = {}   # email -> [เวลาที่ login ผิด, ...]


def recent_failures(email):
    """รายการ login ผิดภายใน LOGIN_WINDOW_SECONDS (ต้องเรียกตอนถือ _lock)"""
    cutoff = time.time() - LOGIN_WINDOW_SECONDS
    _failures[email] = [t for t in _failures.get(email, []) if t > cutoff]
    return _failures[email]


def is_locked(email):
    with _lock:
        return len(recent_failures(email)) >= LOGIN_MAX_FAILURES


def record_failure(email):
    with _lock:
        recent_failures(email).append(time.time())


def clear_failures(email):
    with _lock:
        _failures.pop(email, None)


# ================= JWT =================
def login_required(f):
    """ต้องแนบ Authorization: Bearer <token> ที่ถอดรหัสผ่านและไม่หมดอายุ"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "กรุณา login ก่อน (ไม่พบ token)"}), 401
        try:
            payload = jwt.decode(header[7:], SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "token หมดอายุ กรุณา login ใหม่"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "token ไม่ถูกต้อง"}), 401
        g.user_id, g.username = payload.get("sub"), payload.get("username")
        return f(*args, **kwargs)
    return wrapper


# ================= ส่งต่อคำขอ =================
def forward(base_url, path, method="POST", service="server", data=None):
    """ส่งคำขอไป service อื่น คืน (dict ผลลัพธ์, status code)"""
    if method in ("POST", "PUT") and data is None:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return {"error": "invalid JSON body"}, 400
        # โหมดอื่นนอกจาก text2img หน้าเว็บส่งรูปมาชื่อ init_image และ blur/canny ไม่มี prompt
        fields = ["init_image"] if path == "/api/generate" and data.get("mode", "text2img") != "text2img" \
            else REQUIRED.get(path, [])
        for field in fields:
            if not data.get(field):
                return {"error": f"missing '{field}'"}, 400

    try:
        resp = requests.request(method, f"{base_url}{path}", json=data, timeout=TIMEOUT,
                                headers={"Authorization": request.headers.get("Authorization", "")})
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
        return {"error": f"{service} ตอบกลับไม่ใช่ JSON (status {resp.status_code}): {snippet}"}, 502


def add_proxy(path, methods, base_url, service, login=True):
    """ลงทะเบียนเส้นทางที่ส่งต่อไป service ด้วย path และ method เดิมทุกอย่าง"""
    def view(**_):
        body, status = forward(base_url, request.path, request.method, service)
        return jsonify(body), status

    app.add_url_rule(path, endpoint=f"{service}:{path}:{','.join(methods)}",
                     view_func=login_required(view) if login else view, methods=methods)


# ---------- ฝั่ง auth.py (ต้อง login ทั้งหมด) ----------
add_proxy("/api/me", ["GET"], AUTH_URL, "auth.py")
add_proxy("/api/change-password", ["POST"], AUTH_URL, "auth.py")
add_proxy("/api/gallery", ["GET", "POST"], AUTH_URL, "auth.py")
add_proxy("/api/gallery/<int:item_id>", ["DELETE"], AUTH_URL, "auth.py")
add_proxy("/api/admin/users", ["GET"], AUTH_URL, "auth.py")
add_proxy("/api/admin/users/<int:user_id>", ["PUT", "DELETE"], AUTH_URL, "auth.py")

# ---------- ฝั่ง chat.py ----------
add_proxy("/api/models", ["GET"], CHAT_URL, "chat.py", login=False)
add_proxy("/chat", ["POST"], CHAT_URL, "chat.py", login=False)
for _path in ("/api/generate", "/api/img2img", "/api/upscale", "/api/blur", "/api/canny"):
    add_proxy(_path, ["POST"], CHAT_URL, "chat.py")


# ================= เส้นทางที่มีลอจิกพิเศษ =================
@app.route("/health")
@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/register", methods=["POST"])
def register():
    body, status = forward(AUTH_URL, "/api/register", service="auth.py")
    time.sleep(RESPONSE_DELAY_SECONDS)
    return jsonify(body), status


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data.get("email") or not data.get("password"):
        time.sleep(RESPONSE_DELAY_SECONDS)
        return jsonify({"error": "missing 'email' or 'password'"}), 400

    email = str(data["email"]).strip().lower()
    if is_locked(email):
        time.sleep(RESPONSE_DELAY_SECONDS)
        return jsonify({"error": f"พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารออย่างน้อย "
                                 f"{LOGIN_LOCKOUT_SECONDS} วินาทีแล้วลองใหม่"}), 429

    body, status = forward(AUTH_URL, "/api/login", service="auth.py", data=data)
    if status == 200:
        clear_failures(email)
    elif status == 401:
        record_failure(email)
    time.sleep(RESPONSE_DELAY_SECONDS)
    return jsonify(body), status


@app.route("/api/ai/object-detector-module.js")
def object_detector_module():   
    """ไฟล์ JS ตรวจจับวัตถุอยู่ที่ ai/ ส่งผ่านที่นี่ให้ origin เดียวกับหน้าเว็บ"""
    try:
        r = requests.get(f"{CHAT_URL}/api/ai/object-detector-module.js", timeout=15)
    except requests.exceptions.RequestException:
        return jsonify({"error": "เชื่อมต่อ chat.py ไม่ได้"}), 502
    if r.status_code != 200:
        return jsonify({"error": "ไม่พบไฟล์ตรวจจับวัตถุที่ chat.py"}), 502
    return Response(r.content, mimetype="application/javascript")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
