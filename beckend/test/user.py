"""
auth.py — ระบบ Login/Register (Flask) พอร์ต 5001
=================================================
ระบบสมาชิกแยกจาก server.py/chat.py เก็บข้อมูลใน SQLite (user.db)
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

import base64
import os
import re
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)

# โฟลเดอร์เก็บไฟล์รูปในแกลเลอรี่ (เก็บแยกจาก DB กัน user.db บวม)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GALLERY_DIR = os.path.join(BASE_DIR, "gallery_images")
os.makedirs(GALLERY_DIR, exist_ok=True)

# ⚠️ เปลี่ยนค่านี้ก่อนใช้งานจริง เช่นดึงจาก environment variable
SECRET_KEY = "dev-secret-change-me"
TOKEN_EXPIRE_HOURS = 24

DB_PATH = "user.db"   # <-- เปลี่ยนชื่อไฟล์ database จาก auth.db เป็น user.db

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
        # gallery: เก็บแค่ "ชื่อไฟล์" ไม่เก็บตัวรูปจริงในตาราง (ตัวรูปอยู่ที่ GALLERY_DIR)
        # seq = เลขรันต่อ user คนนั้น (เพิ่มขึ้นเรื่อยๆ ไม่ย้อนกลับมาซ้ำแม้มีการลบรูปออก)
        # ใช้ตั้งชื่อไฟล์เป็น "{username}{seq}.png"
        # ON DELETE CASCADE: ถ้าลบ user ทิ้ง รูปในแกลเลอรี่ของเขาจะถูกลบ record ตามไปด้วย
        db.execute("""
            CREATE TABLE IF NOT EXISTS gallery (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                filename TEXT NOT NULL,
                mode TEXT,
                prompt TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        # migration เผื่อมี user.db เก่าที่สร้างตาราง gallery ไว้ก่อนมีคอลัมน์ seq
        try:
            db.execute("ALTER TABLE gallery ADD COLUMN seq INTEGER NOT NULL DEFAULT 0")
        except sqlite3.OperationalError:
            pass  # คอลัมน์มีอยู่แล้ว ข้ามไป
        db.commit()


# สร้างตารางทันทีตอนไฟล์นี้ถูก import/รัน ไม่ว่าจะรันผ่าน `python auth.py`,
# `flask run`, หรือ WSGI server ก็ตาม กันปัญหา "no such table: users"
# ที่เกิดเวลาตารางยังไม่ถูกสร้าง (เช่น ลบ user.db ทิ้งแล้วไม่ได้ restart ให้ถูกวิธี)
init_db()


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


def _save_image_file(data_url):
    """แปลง data URL ('data:image/png;base64,...') เป็นไฟล์ .png เก็บใน GALLERY_DIR
    คืนชื่อไฟล์ (ไม่ใช่ path เต็ม) — ตั้งชื่อแบบสุ่มกันชนกัน"""
    raw = data_url.split(",", 1)[1] if "," in data_url else data_url
    filename = f"{uuid.uuid4().hex}.png"
    with open(os.path.join(GALLERY_DIR, filename), "wb") as f:
        f.write(base64.b64decode(raw))
    return filename


@app.route("/api/gallery", methods=["POST"])
@login_required
def save_to_gallery():
    data = request.get_json(silent=True) or {}
    image = data.get("image")
    if not image:
        return jsonify({"error": "missing 'image'"}), 400

    try:
        filename = _save_image_file(image)
    except Exception:
        return jsonify({"error": "ไฟล์ภาพไม่ถูกต้อง บันทึกไม่สำเร็จ"}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO gallery (user_id, filename, mode, prompt, created_at) VALUES (?, ?, ?, ?, ?)",
        (g.current_user["id"], filename, data.get("mode"), data.get("prompt"),
         datetime.now(timezone.utc).isoformat()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid}), 201


@app.route("/api/gallery", methods=["GET"])
@login_required
def list_gallery():
    """คืนเฉพาะรูปของ user ที่ login อยู่เท่านั้น (กรองด้วย user_id จาก token ไม่ใช่จาก client)"""
    rows = get_db().execute(
        "SELECT id, filename, mode, prompt, created_at FROM gallery WHERE user_id = ? ORDER BY id DESC",
        (g.current_user["id"],),
    ).fetchall()

    items = []
    for row in rows:
        path = os.path.join(GALLERY_DIR, row["filename"])
        try:
            with open(path, "rb") as f:
                image_b64 = base64.b64encode(f.read()).decode("utf-8")
        except FileNotFoundError:
            continue  # ไฟล์รูปหายไปจากดิสก์ (เช่นถูกลบมือ) ข้ามรายการนี้
        items.append({
            "id": row["id"],
            "mode": row["mode"],
            "prompt": row["prompt"],
            "created_at": row["created_at"],
            "image_url": f"data:image/png;base64,{image_b64}",
        })
    return jsonify({"items": items})


@app.route("/api/gallery/<int:item_id>", methods=["DELETE"])
@login_required
def delete_gallery_item(item_id):
    db = get_db()
    row = db.execute(
        "SELECT * FROM gallery WHERE id = ? AND user_id = ?",
        (item_id, g.current_user["id"]),
    ).fetchone()
    if not row:
        # ไม่บอกว่า "id นี้มีอยู่แต่ไม่ใช่ของคุณ" กับ "ไม่มี id นี้เลย" ต่างกัน กันเดา id คนอื่น
        return jsonify({"error": "ไม่พบรูปนี้ในแกลเลอรี่ของคุณ"}), 404

    db.execute("DELETE FROM gallery WHERE id = ?", (item_id,))
    db.commit()
    try:
        os.remove(os.path.join(GALLERY_DIR, row["filename"]))
    except FileNotFoundError:
        pass
    return jsonify({"message": "ลบรูปสำเร็จ"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True, threaded=True)
