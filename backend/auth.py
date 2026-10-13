"""
auth.py — ระบบสมาชิก + แกลเลอรี่ + หน้า admin (Flask) พอร์ต 5001
ข้อมูลเก็บใน SQLite (user.db) ยืนยันตัวตนด้วย JWT (แนบ Authorization: Bearer <token>)

  POST /api/register  {username, email, password} -> {token, user}
  POST /api/login     {email, password}           -> {token, user}
  GET  /api/me                                     -> {user}
  POST /api/change-password  {old_password, new_password}
  POST/GET /api/gallery, DELETE /api/gallery/<id>  แกลเลอรี่ (เห็นเฉพาะรูปของตัวเอง)
  GET /api/admin/users, PUT/DELETE /api/admin/users/<id>   เฉพาะ admin
ตั้งผู้ใช้เป็น admin: python make_admin.py <email|username>
ติดตั้ง: pip install flask flask-cors pyjwt
"""
import base64
import os
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)

# ---------- ค่าตั้งต้น ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GALLERY_DIR = os.path.join(BASE_DIR, "gallery_images")   # ไฟล์รูปแกลเลอรี่ (แยกจาก DB กัน DB บวม)
DB_PATH = os.path.join(BASE_DIR, "user.db")              # path เต็ม: รันจากโฟลเดอร์ไหนก็ได้ DB เดิม
os.makedirs(GALLERY_DIR, exist_ok=True)

# ⚠️ ต้องตรงกับ server.py และควรเปลี่ยนก่อนใช้จริง (ตั้งผ่าน environment variable)
SECRET_KEY = os.environ.get("FORGE_SECRET_KEY", "dev-secret-change-me")
TOKEN_EXPIRE_HOURS = 24

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.]{3,32}$")
# จำกัดอักขระอีเมล (กัน < > " ' ที่อาจกลายเป็น XSS ตอนนำไปแสดงบนหน้าเว็บ)
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
ROLES = ("user", "admin")


def err(msg, code=400):
    """ตอบ error รูปแบบเดียวกันทุกที่: {"error": ข้อความ}"""
    return jsonify({"error": msg}), code


def now():
    return datetime.now(timezone.utc).isoformat()


# ================= ฐานข้อมูล =================
def get_db():
    """เปิดการเชื่อมต่อ DB ต่อ 1 request (ปิดให้เองใน close_db)"""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")   # เปิดให้ ON DELETE CASCADE ทำงาน
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db:
        db.close()


def add_missing_columns(db, table, columns):
    """migration: เพิ่มคอลัมน์ที่ DB เก่ายังไม่มี (SQLite เพิ่มได้ทีละคอลัมน์)"""
    have = {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
    for name, ddl in columns.items():
        if name not in have:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL)""")
    # gallery เก็บแค่ชื่อไฟล์ (ตัวรูปอยู่ใน GALLERY_DIR)
    # seq = เลขรันต่อ user (ไม่ย้อนกลับมาซ้ำแม้ลบรูป) / ลบ user -> record รูปถูกลบตาม (CASCADE)
    db.execute("""CREATE TABLE IF NOT EXISTS gallery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        seq INTEGER NOT NULL DEFAULT 0,
        filename TEXT NOT NULL,
        mode TEXT, prompt TEXT, negative_prompt TEXT, seed TEXT, model TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)""")
    # user.db เก่าอาจยังไม่มีคอลัมน์เหล่านี้
    add_missing_columns(db, "users", {"role": "TEXT NOT NULL DEFAULT 'user'"})
    add_missing_columns(db, "gallery", {"seq": "INTEGER NOT NULL DEFAULT 0", "negative_prompt": "TEXT",
                                        "seed": "TEXT", "model": "TEXT"})
    db.commit()
    db.close()


init_db()   # สร้างตารางทันทีที่ import ไม่ว่าจะรันด้วยวิธีไหน (กัน "no such table")


# ================= JWT + decorator =================
def make_token(user):
    return jwt.encode({
        "sub": str(user["id"]),   # PyJWT 2.10+ บังคับให้ sub เป็น string
        "username": user["username"],
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }, SECRET_KEY, algorithm="HS256")


def user_dict(row):
    return {k: row[k] for k in ("id", "username", "email", "role")}


def auth_response(row, code=200):
    """ผลของ register/login: token + ข้อมูลผู้ใช้"""
    return jsonify({"token": make_token(row), "user": user_dict(row)}), code


def login_required(f):
    """เช็ค token แล้วดึงผู้ใช้จาก DB ใส่ g.current_user (เช็ค DB ทุกครั้ง บัญชีที่ถูกลบจึงเข้าไม่ได้ทันที)"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return err("ต้องแนบ token ใน header: Authorization: Bearer <token>", 401)
        try:
            user_id = int(jwt.decode(header[7:], SECRET_KEY, algorithms=["HS256"])["sub"])
        except jwt.ExpiredSignatureError:
            return err("token หมดอายุ กรุณา login ใหม่", 401)
        except (jwt.InvalidTokenError, KeyError, ValueError):
            return err("token ไม่ถูกต้อง", 401)

        g.current_user = get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not g.current_user:
            return err("ไม่พบผู้ใช้นี้แล้ว", 401)
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    """ต้อง login และ role = 'admin' (เช็คจาก DB จึงมีผลทันทีที่ถูกเปลี่ยนสิทธิ์)"""
    @login_required
    @wraps(f)
    def wrapper(*args, **kwargs):
        if g.current_user["role"] != "admin":
            return err("ต้องเป็น admin เท่านั้น", 403)
        return f(*args, **kwargs)
    return wrapper


# ---------- ตรวจข้อมูลที่กรอก (คืนข้อความ error หรือ None ถ้าผ่าน) ----------
def bad_username(v):
    return None if USERNAME_RE.match(v) else "username ต้องยาว 3-32 ตัวอักษร ใช้ได้แค่ a-z, A-Z, 0-9, _ และ ."


def bad_email(v):
    return None if EMAIL_RE.match(v) else "กรุณากรอกอีเมลให้ถูกต้อง"


def bad_password(v, label="รหัสผ่าน"):
    return None if len(v) >= 8 else f"{label}ต้องยาวอย่างน้อย 8 ตัวอักษร"


# ================= สมาชิก =================
@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/register", methods=["POST"])
def register():
    d = request.get_json(silent=True) or {}
    username = (d.get("username") or "").strip()
    email = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""
    problem = bad_username(username) or bad_email(email) or bad_password(password)
    if problem:
        return err(problem)

    db = get_db()
    try:
        cur = db.execute("INSERT INTO users (username, email, password_hash, created_at) VALUES (?,?,?,?)",
                         (username, email, generate_password_hash(password), now()))
        db.commit()
    except sqlite3.IntegrityError:
        return err("username หรือ email นี้มีคนใช้แล้ว", 409)
    return auth_response(db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone(), 201)


@app.route("/api/login", methods=["POST"])
def login():
    d = request.get_json(silent=True) or {}
    email = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""
    if not email or not password:
        return err("missing 'email' or 'password'")

    row = get_db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return err("อีเมลหรือรหัสผ่านไม่ถูกต้อง", 401)
    return auth_response(row)


@app.route("/api/me")
@login_required
def me():
    return jsonify({"user": user_dict(g.current_user)})


@app.route("/api/change-password", methods=["POST"])
@login_required
def change_password():
    d = request.get_json(silent=True) or {}
    if not check_password_hash(g.current_user["password_hash"], d.get("old_password") or ""):
        return err("รหัสผ่านเดิมไม่ถูกต้อง", 401)
    new = d.get("new_password") or ""
    if bad_password(new, "รหัสผ่านใหม่"):
        return err(bad_password(new, "รหัสผ่านใหม่"))

    db = get_db()
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(new), g.current_user["id"]))
    db.commit()
    return jsonify({"message": "เปลี่ยนรหัสผ่านสำเร็จ"})


# ================= แกลเลอรี่ (ของใครของมัน: กรองด้วย user_id จาก token เสมอ) =================
_save_lock = threading.Lock()   # กันสองคำขอของ user เดียวกันได้เลข seq ซ้ำแล้วไฟล์ทับกัน
GALLERY_FIELDS = "id, filename, mode, prompt, negative_prompt, seed, model, created_at"


def remove_file(name):
    try:
        os.remove(os.path.join(GALLERY_DIR, name))
    except FileNotFoundError:
        pass


@app.route("/api/gallery", methods=["POST"])
@login_required
def save_to_gallery():
    d = request.get_json(silent=True) or {}
    if not d.get("image"):
        return err("missing 'image'")
    uid, username = g.current_user["id"], g.current_user["username"]
    db = get_db()

    with _save_lock:
        # seq = ค่าสูงสุดที่เคยใช้ +1 (ไม่ใช้จำนวนรูปที่เหลือ กันเลขย้อนกลับมาซ้ำหลังลบรูป)
        seq = db.execute("SELECT COALESCE(MAX(seq), -1) + 1 FROM gallery WHERE user_id = ?", (uid,)).fetchone()[0]
        filename = f"{uid}_{username}_{seq}.png"   # นำหน้าด้วย user_id กันชื่อชนข้าม user
        try:
            raw = d["image"].split(",", 1)[-1]   # ตัด "data:image/png;base64," ออก
            with open(os.path.join(GALLERY_DIR, filename), "wb") as f:
                f.write(base64.b64decode(raw))
        except Exception:
            return err("ไฟล์ภาพไม่ถูกต้อง บันทึกไม่สำเร็จ")

        cur = db.execute(
            """INSERT INTO gallery (user_id, seq, filename, mode, prompt, negative_prompt, seed, model, created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (uid, seq, filename, d.get("mode"), d.get("prompt"), d.get("negative_prompt"),
             None if d.get("seed") is None else str(d["seed"]), d.get("model"), now()))
        db.commit()
    return jsonify({"id": cur.lastrowid, "filename": filename}), 201


@app.route("/api/gallery")
@login_required
def list_gallery():
    rows = get_db().execute(f"SELECT {GALLERY_FIELDS} FROM gallery WHERE user_id = ? ORDER BY id DESC",
                            (g.current_user["id"],)).fetchall()
    items = []
    for r in rows:
        try:
            with open(os.path.join(GALLERY_DIR, r["filename"]), "rb") as f:
                image = base64.b64encode(f.read()).decode()
        except FileNotFoundError:
            continue   # ไฟล์รูปหายจากดิสก์ ข้ามรายการนี้
        item = dict(r)
        item.pop("filename")   # ไม่ส่งชื่อไฟล์บนดิสก์ออกไปให้หน้าเว็บ
        items.append({**item, "image_url": f"data:image/png;base64,{image}"})
    return jsonify({"items": items})


@app.route("/api/gallery/<int:item_id>", methods=["DELETE"])
@login_required
def delete_gallery_item(item_id):
    db = get_db()
    row = db.execute("SELECT * FROM gallery WHERE id = ? AND user_id = ?", (item_id, g.current_user["id"])).fetchone()
    if not row:   # ตอบเหมือนกันทั้ง "ไม่มี id นี้" และ "ไม่ใช่ของคุณ" กันการเดา id คนอื่น
        return err("ไม่พบรูปนี้ในแกลเลอรี่ของคุณ", 404)
    db.execute("DELETE FROM gallery WHERE id = ?", (item_id,))
    db.commit()
    remove_file(row["filename"])
    return jsonify({"message": "ลบรูปสำเร็จ"})


# ================= admin: จัดการผู้ใช้ =================
def admin_count(db):
    return db.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0]


@app.route("/api/admin/users")
@admin_required
def admin_list_users():
    rows = get_db().execute("""SELECT u.id, u.username, u.email, u.role, u.created_at,
                                      (SELECT COUNT(*) FROM gallery WHERE user_id = u.id) AS gallery_count
                               FROM users u ORDER BY u.id""").fetchall()
    return jsonify({"users": [dict(r) for r in rows]})


@app.route("/api/admin/users/<int:user_id>", methods=["PUT"])
@admin_required
def admin_update_user(user_id):
    d = request.get_json(silent=True) or {}
    db = get_db()
    target = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        return err("ไม่พบผู้ใช้นี้", 404)

    changes = {}   # คอลัมน์ -> ค่าใหม่ (เฉพาะที่ส่งมา)
    if "username" in d:
        changes["username"] = (d["username"] or "").strip()
        if bad_username(changes["username"]):
            return err(bad_username(changes["username"]))
    if "email" in d:
        changes["email"] = (d["email"] or "").strip().lower()
        if bad_email(changes["email"]):
            return err(bad_email(changes["email"]))
    if "role" in d:
        if d["role"] not in ROLES:
            return err("role ต้องเป็น 'user' หรือ 'admin'")
        if target["role"] == "admin" and d["role"] != "admin":   # ลดสิทธิ์ admin: กันล็อกตัวเอง/ไม่เหลือ admin
            if user_id == g.current_user["id"]:
                return err("ไม่สามารถลดสิทธิ์ admin ของตัวเองได้")
            if admin_count(db) <= 1:
                return err("ต้องมี admin อย่างน้อย 1 คน")
        changes["role"] = d["role"]
    if d.get("password"):
        if bad_password(d["password"], "รหัสผ่านใหม่"):
            return err(bad_password(d["password"], "รหัสผ่านใหม่"))
        changes["password_hash"] = generate_password_hash(d["password"])
    if not changes:
        return err("ไม่มีข้อมูลที่ต้องแก้ไข")

    try:   # ชื่อคอลัมน์มาจากโค้ดด้านบนเท่านั้น (ไม่ใช่จาก client) จึงต่อ SQL ได้อย่างปลอดภัย
        db.execute(f"UPDATE users SET {', '.join(c + ' = ?' for c in changes)} WHERE id = ?",
                   (*changes.values(), user_id))
        db.commit()
    except sqlite3.IntegrityError:
        return err("username หรือ email นี้มีคนใช้แล้ว", 409)
    return jsonify({"user": user_dict(db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())})


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
@admin_required
def admin_delete_user(user_id):
    db = get_db()
    target = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        return err("ไม่พบผู้ใช้นี้", 404)
    if user_id == g.current_user["id"]:
        return err("ไม่สามารถลบบัญชีของตัวเองได้")
    if target["role"] == "admin" and admin_count(db) <= 1:
        return err("ต้องมี admin อย่างน้อย 1 คน")

    files = [r[0] for r in db.execute("SELECT filename FROM gallery WHERE user_id = ?", (user_id,))]
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))   # แถวแกลเลอรี่ถูกลบตาม (CASCADE)
    db.commit()
    for name in files:
        remove_file(name)
    return jsonify({"message": f"ลบผู้ใช้ {target['username']} แล้ว"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True, threaded=True)
