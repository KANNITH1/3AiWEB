"""
set_password.py — ตั้งรหัสผ่านใหม่ให้ผู้ใช้ (รันบนเครื่อง backend ที่มี user.db)
  python set_password.py you@email.com            ระบบถามรหัสใหม่ (ระบุ email หรือ username ก็ได้)
  python set_password.py you@email.com รหัสใหม่123   ใส่รหัสท้ายคำสั่งเลยก็ได้
รหัสผ่านใน user.db เก็บเป็นแฮช (scrypt) จึงแก้ตรงๆ ไม่ได้ สคริปต์นี้สร้างแฮชแบบเดียวกับระบบให้
"""
import getpass
import sqlite3
import sys

from werkzeug.security import generate_password_hash

from auth import DB_PATH

if len(sys.argv) < 2:
    sys.exit(__doc__)

db = sqlite3.connect(DB_PATH)
row = db.execute("SELECT id, username FROM users WHERE lower(email) = lower(?) OR username = ?",
                 (sys.argv[1].strip(),) * 2).fetchone()
if not row:
    sys.exit(f"ไม่พบผู้ใช้ '{sys.argv[1]}' (ดูรายชื่อด้วย: python make_admin.py --list)")

if len(sys.argv) >= 3:
    password = sys.argv[2]
else:   # ถามรหัสแบบไม่แสดงบนจอ พร้อมยืนยันอีกรอบ
    password = getpass.getpass("รหัสผ่านใหม่: ")
    if password != getpass.getpass("พิมพ์อีกครั้งเพื่อยืนยัน: "):
        sys.exit("รหัสผ่านสองครั้งไม่ตรงกัน ยกเลิก")
if len(password) < 8:
    sys.exit("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")

db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(password), row[0]))
db.commit()
print(f"ตั้งรหัสผ่านใหม่ให้ {row[1]} (id {row[0]}) แล้ว")
