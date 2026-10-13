"""
make_admin.py — ตั้ง/ถอดสิทธิ์ admin (รันบนเครื่อง backend ที่มี user.db)
  python make_admin.py --list                  ดูผู้ใช้ทั้งหมดและ role
  python make_admin.py you@email.com           ตั้งเป็น admin (ระบุ email หรือ username ก็ได้)
  python make_admin.py you@email.com --remove  ถอดสิทธิ์ admin
"""
import sqlite3
import sys

from auth import DB_PATH   # import auth จะ migrate เพิ่มคอลัมน์ role ให้ DB เก่าเอง

db = sqlite3.connect(DB_PATH)
args = [a for a in sys.argv[1:] if not a.startswith("--")]

if "--list" in sys.argv or not args:   # แสดงรายชื่อผู้ใช้
    for id_, username, email, role in db.execute("SELECT id, username, email, role FROM users ORDER BY id"):
        print(f"{id_:>3}  {role:<5}  {username}  <{email}>")
    if not args:
        print("\nใช้: python make_admin.py <email หรือ username> [--remove]")
    sys.exit()

row = db.execute("SELECT id, username FROM users WHERE lower(email) = lower(?) OR username = ?",
                 (args[0].strip(),) * 2).fetchone()
if not row:
    sys.exit(f"ไม่พบผู้ใช้ '{args[0]}' (ลอง python make_admin.py --list)")

role = "user" if "--remove" in sys.argv else "admin"
db.execute("UPDATE users SET role = ? WHERE id = ?", (role, row[0]))
db.commit()
print(f"ตั้ง {row[1]} (id {row[0]}) เป็น {role} แล้ว")
