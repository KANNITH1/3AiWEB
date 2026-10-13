// config.js — ตั้งค่า URL ของ Backend ที่เดียว (โหลดก่อน script.js ทุกหน้า)
//  - เปิดผ่าน Nginx (พอร์ต 8080 หรือ 80) -> API_BASE = '' คือเรียก /api/... ที่ origin เดียวกัน แล้ว Nginx proxy ไป server.py
//  - เปิดด้วยวิธีอื่น (Live Server, http.server, file://) -> ยิงตรงไปพอร์ต 5000 ของเครื่องที่เปิดหน้าเว็บ
// ถ้าต้องการบังคับ ให้แก้ค่าด้านล่าง เช่น 'http://192.168.1.20:5000'
const viaNginx = location.protocol.startsWith('http') && ['8080', ''].includes(location.port);
const API_BASE = viaNginx ? '' : `http://${location.hostname || '127.0.0.1'}:5000`;
