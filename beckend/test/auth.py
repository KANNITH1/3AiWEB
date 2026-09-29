"""
auth.py — ระบบ Login/Register (Flask) พอร์ต 5001
=================================================
ระบบสมาชิกแยกจาก server.py/chat.py เก็บข้อมูลใน SQLite (auth.db)
ยืนยันตัวตนด้วย JWT: login แล้วได้ token ไปแนบใน header ตอนเรียก endpoint ที่ต้อง login

Endpoints:
  POST /api/register        { username, password, email? } -> { token, user }
  POST /api/login           { username, password }          -> { token, user }
  GET  /api/me               (ต้องมี Authorization: Bearer <token>) -> { user }
  POST /api/change-password  (ต้อง login) { old_password, new_password } -> { message }
  GET  /health

ติดตั้ง: pip install flask flask-cors pyjwt

หมายเหตุความปลอดภัย:
- แก้ SECRET_KEY ก่อนใช้งานจริง (ห้ามใช้ค่า default ตอน deploy)
- ตอนนี้ยังไม่ได้ทำ rate-limit กันการเดารหัสผ่าน (brute force) — ถ้าจะขึ้นระบบจริงควรเพิ่ม
"""

import re
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)

# ⚠️ เปลี่ยนค่านี้ก่อนใช้งานจริง เช่นดึงจาก environment variable
SECRET_KEY = "dev-secret-change-me"
TOKEN_EXPIRE_HOURS = 24

DB_PATH = "auth.db"

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.]{3,32}$")


# ---------- database ----------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with closing(sqlite3.connect(DB_PATH)) as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        db.commit()


# ---------- helpers ----------
def make_token(user_id, username):
    payload = {
        "sub": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def user_to_dict(row):
    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "ต้องแนบ token ใน header: Authorization: Bearer <token>"}), 401

        token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "token หมดอายุ กรุณา login ใหม่"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "token ไม่ถูกต้อง"}), 401

        row = get_db().execute("SELECT * FROM users WHERE id = ?", (payload["sub"],)).fetchone()
        if not row:
            return jsonify({"error": "ไม่พบผู้ใช้นี้แล้ว"}), 401

        g.current_user = row
        return f(*args, **kwargs)
    return wrapper


# ---------- routes ----------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    email = (data.get("email") or "").strip() or None

    if not USERNAME_RE.match(username):
        return jsonify({"error": "username ต้องยาว 3-32 ตัวอักษร ใช้ได้แค่ a-z, A-Z, 0-9, _ และ ."}), 400
    if len(password) < 8:
        return jsonify({"error": "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร"}), 400

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (username, email, generate_password_hash(password), datetime.now(timezone.utc).isoformat()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username หรือ email นี้มีคนใช้แล้ว"}), 409

    row = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify({"token": make_token(row["id"], row["username"]), "user": user_to_dict(row)}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "missing 'username' or 'password'"}), 400

    row = get_db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    # เช็ค hash เสมอแม้ไม่เจอ user กัน timing attack ที่ทำให้เดาได้ว่า username มีจริงไหม
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "username หรือรหัสผ่านไม่ถูกต้อง"}), 401

    return jsonify({"token": make_token(row["id"], row["username"]), "user": user_to_dict(row)})


@app.route("/api/me", methods=["GET"])
@login_required
def me():
    return jsonify({"user": user_to_dict(g.current_user)})


@app.route("/api/change-password", methods=["POST"])
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    old_password = data.get("old_password") or ""
    new_password = data.get("new_password") or ""

    if not check_password_hash(g.current_user["password_hash"], old_password):
        return jsonify({"error": "รหัสผ่านเดิมไม่ถูกต้อง"}), 401
    if len(new_password) < 8:
        return jsonify({"error": "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร"}), 400

    db = get_db()
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?",
               (generate_password_hash(new_password), g.current_user["id"]))
    db.commit()
    return jsonify({"message": "เปลี่ยนรหัสผ่านสำเร็จ"})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5001, debug=True, threaded=True)
