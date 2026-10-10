// config.js — ตั้งค่า URL ของ Backend ที่เดียว (โหลดก่อน script.js ทุกหน้า)
//
// เลือกให้อัตโนมัติ:
//  - เปิดผ่าน Nginx (พอร์ต 8080 หรือ 80)  -> API_BASE = ''  (เรียก /api/... ที่ origin เดียวกัน แล้ว Nginx proxy ไปที่ server.py)
//  - เปิดด้วยวิธีอื่น (เช่น Live Server, file://) -> ยิงตรงไปพอร์ต 5000 ของเครื่องที่เปิดหน้าเว็บ (server.py)
//
// ถ้าต้องการบังคับ ให้เอาคอมเมนต์บรรทัดด้านล่างออกแล้วแก้ค่าเอง
// const API_BASE = (function () {
//   const viaNginx = location.protocol.startsWith('http') && (location.port === '8080' || location.port === '');
//   if (viaNginx) return '';
//   return 'http://' + (location.hostname || '127.0.0.1') + ':5000';
// })();
const API_BASE = 'http://10.192.0.212:5000';
