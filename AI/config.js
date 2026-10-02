// config.js — ตั้งค่า URL ของ Backend ที่เดียว (โหลดก่อน script.js ทุกหน้า)
// - เปิดเว็บด้วย IP/localhost ตรงๆ  -> ยิงไปพอร์ต 5000 ของเครื่องเดียวกัน (server.py)
// - ถ้าใช้ Nginx reverse proxy (proxy /api/ ไปที่ server.py) ให้เปลี่ยนเป็น: const API_BASE = '';
const API_BASE = 'http://' + (location.hostname || '127.0.0.1') + ':5000';
//const API_BASE = 'http://192.168.1.50:5000';
