# Forge AI — โครงสร้างโปรเจกต์

| โฟลเดอร์ | เจ้าของ | มีอะไรข้างใน |
|---|---|---|
| `create/` | กานต์นิธิ | หน้าสร้างภาพ **ครบในตัวเอง ไม่พึ่ง `shared/`** (`home.html`, `create.js`, `create.css`, `object-detector-module.js`) |
| `dashboard/` | เพื่อนคนที่ 2 | ภาพรวมระบบ / บัญชีของฉัน |
| `gallery/` | เพื่อนคนที่ 3 | แกลเลอรี่ |
| `about/` | (ตกลงกันเอง) | หน้าเกี่ยวกับ |
| `backend/` | (ตกลงกันเอง) | `server.py` (5000), `chat.py` (5002) |
| `shared/` | หน้ารวม (เพื่อนแก้ได้) | `style.css`, `common.js` ใช้กับ dashboard / gallery / about / login ไม่มีผลกับ `create/` |

## กติกากันชนกัน
1. แก้เฉพาะโฟลเดอร์ของตัวเอง CSS/JS เฉพาะหน้าให้ใส่ในโฟลเดอร์หน้านั้น
2. ถ้าต้องแก้ `shared/` ให้บอกในกลุ่มก่อน แล้วค่อย commit แยกต่างหาก
3. เมนูซ้าย (sidebar) อยู่ในแต่ละ html ถ้าเพิ่ม/เปลี่ยนเมนู ต้องแก้ทุกหน้า
4. เริ่มที่ `index.html` (หน้า login)

## รัน
```
cd backend
python chat.py      # พอร์ต 5002
python server.py    # พอร์ต 5000
```
และเปิด Forge Neo (พอร์ต 7860) ไว้ด้วย แล้วเปิด `index.html` (หรือใช้ Live Server)
