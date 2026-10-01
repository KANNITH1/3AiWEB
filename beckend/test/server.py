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


"""

import threading
import time
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

# CAPTCHA แบบทำเองในเครื่อง (ไม่พึ่งอินเทอร์เน็ต/Google ใช้ได้บนวง LAN ที่ไม่มีเน็ตออก)
# ใช้กับหน้า register เท่านั้น เพื่อกันสแปมสมัครสมาชิกแบบกระจายหลาย IP ที่
# rate-limit ต่อ IP เพียงอย่างเดียวหลบได้
CAPTCHA_EXPIRE_SECONDS = 300   # โจทย์ 1 ข้อใช้ได้นานแค่ไหนก่อนหมดอายุ
_CAPTCHA_STORE = {}            # captcha_id -> (answer:int, expire_at:float)


def _prune_captchas():
    now = time.time()
    expired = [cid for cid, (_, exp) in _CAPTCHA_STORE.items() if exp < now]
    for cid in expired:
        _CAPTCHA_STORE.pop(cid, None)


def generate_captcha():
    """สุ่มโจทย์บวกเลขง่ายๆ คืน (captcha_id, question)"""
    import random
    import uuid
    a, b = random.randint(1, 20), random.randint(1, 20)
    answer = a + b
    cid = uuid.uuid4().hex
    with _RATE_LOCK:
        _prune_captchas()
        _CAPTCHA_STORE[cid] = (answer, time.time() + CAPTCHA_EXPIRE_SECONDS)
    return cid, f"{a} + {b} = ?"


def check_captcha(cid, answer):
    """เช็คคำตอบ ใช้ได้ครั้งเดียว (ถูกหรือผิดก็ตาม ต้องขอโจทย์ใหม่เสมอ) กันเดาสุ่มซ้ำๆ"""
    if not cid:
        return False, "กรุณาตอบคำถามกันบอทก่อน"
    with _RATE_LOCK:
        entry = _CAPTCHA_STORE.pop(cid, None)
    if entry is None:
        return False, "คำถามกันบอทหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอโจทย์ใหม่"
    correct_answer, expire_at = entry
    if time.time() > expire_at:
        return False, "คำถามกันบอทหมดอายุ กรุณาขอโจทย์ใหม่"
    try:
        if int(str(answer).strip()) != correct_answer:
            return False, "ตอบคำถามกันบอทผิด กรุณาลองใหม่"
    except (ValueError, TypeError):
        return False, "กรุณาใส่คำตอบเป็นตัวเลข"
    return True, None

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


# ---------- กันโจมตี login / register ----------
RESPONSE_DELAY_SECONDS = 3     # หน่วงเวลาตอบกลับ login/register ทุกครั้ง

LOGIN_MAX_FAILURES = 5         # login ผิดได้สูงสุดกี่ครั้ง
LOGIN_WINDOW_SECONDS = 60      # ...ภายในกี่วินาที
LOGIN_LOCKOUT_SECONDS = 60     # ถ้าเกิน ล็อกไว้กี่วินาที (ใช้ค่าเดียวกับ window ด้านบน)

REGISTER_MAX_ATTEMPTS = 3      # สมัครสมาชิกได้สูงสุดกี่ครั้ง
REGISTER_WINDOW_SECONDS = 60   # ...ภายในกี่วินาที ต่อ 1 IP

_RATE_LOCK = threading.Lock()
_LOGIN_FAILURES = {}      # username (lowercase) -> [timestamp, ...]
_REGISTER_ATTEMPTS = {}   # ip -> [timestamp, ...]


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


def is_register_rate_limited(ip):
    with _RATE_LOCK:
        attempts = _prune(_REGISTER_ATTEMPTS.get(ip, []), REGISTER_WINDOW_SECONDS)
        _REGISTER_ATTEMPTS[ip] = attempts
        return len(attempts) >= REGISTER_MAX_ATTEMPTS


def record_register_attempt(ip):
    with _RATE_LOCK:
        attempts = _prune(_REGISTER_ATTEMPTS.get(ip, []), REGISTER_WINDOW_SECONDS)
        attempts.append(time.time())
        _REGISTER_ATTEMPTS[ip] = attempts


# ---------- auth (JWT) ----------
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
def forward(base_url, path, method="POST", service="server", data=None):
    """ส่งต่อ request ไปยัง base_url+path คืนค่าเป็น (body: dict, status: int)
    (ยังไม่ครอบ jsonify — ให้ route เป็นคนตัดสินใจเองว่าจะ wrap/ทำอะไรต่อ)"""
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
        return {"error": f"{service} ตอบกลับไม่ใช่ JSON (status {resp.status_code}): {snippet}"}, 502


def forward_chat(path, method="POST"):
    body, status = forward(CHAT_URL, path, method, service="chat.py")
    return jsonify(body), status


def forward_auth(path, method="POST"):
    body, status = forward(AUTH_URL, path, method, service="auth.py")
    return jsonify(body), status


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/captcha", methods=["GET"])
def captcha():
    cid, question = generate_captcha()
    return jsonify({"captcha_id": cid, "question": question})


# ---------- auth routes (ไม่ต้อง login) ----------
@app.route("/api/register", methods=["POST"])
def register():
    client_ip = request.remote_addr or "unknown"

    if is_register_rate_limited(client_ip):
        time.sleep(RESPONSE_DELAY_SECONDS)
        return jsonify({
            "error": f"สมัครสมาชิกถี่เกินไป กรุณารออย่างน้อย {REGISTER_WINDOW_SECONDS} วินาทีแล้วลองใหม่"
        }), 429

    data = request.get_json(silent=True) or {}
    captcha_ok, captcha_error = check_captcha(data.get("captcha_id"), data.get("captcha_answer"))
    if not captcha_ok:
        time.sleep(RESPONSE_DELAY_SECONDS)
        return jsonify({"error": captcha_error}), 400

    record_register_attempt(client_ip)
    body, status = forward(AUTH_URL, "/api/register", service="auth.py", data=data)
    time.sleep(RESPONSE_DELAY_SECONDS)
    return jsonify(body), status


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data.get("username") or not data.get("password"):
        time.sleep(RESPONSE_DELAY_SECONDS)
        return jsonify({"error": "missing 'username' or 'password'"}), 400

    username = data["username"]

    if is_login_locked(username):
        time.sleep(RESPONSE_DELAY_SECONDS)
        return jsonify({
            "error": f"พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารออย่างน้อย {LOGIN_LOCKOUT_SECONDS} วินาทีแล้วลองใหม่"
        }), 429

    body, status = forward(AUTH_URL, "/api/login", service="auth.py", data=data)

    if status == 200:
        clear_login_failures(username)
    elif status == 401:
        record_login_failure(username)

    time.sleep(RESPONSE_DELAY_SECONDS)
    return jsonify(body), status


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
