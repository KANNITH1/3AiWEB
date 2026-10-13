// object-detector-module.js — ตรวจจับวัตถุด้วย MediaPipe ในเบราว์เซอร์ (ไม่ผ่าน Backend)
// ต้องโหลดด้วย <script type="module"> เท่านั้น (home.html โหลดผ่าน /api/ai/object-detector-module.js)
// ใช้ static import เพราะ dynamic import() จาก classic script ไม่เสถียรในบางเบราว์เซอร์
// เปิดฟังก์ชัน window.runObjectDetection ให้ script.js เรียกใช้
import { ObjectDetector, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";  // นำเข้าโมดูล ObjectDetector และ FilesetResolver จาก MediaPipe Tasks Vision CDN

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm";  // URL ปลายทางของไฟล์ WebAssembly (.wasm) สำหรับรัน Vision Tasks
const COLOR = "#06b6d4";  // รหัสสีฟ้า Cyan สำหรับวาดเส้นกรอบและพื้นหลังป้ายกำกับวัตถุ

// เก็บตัวตรวจจับไว้ใช้ซ้ำ (สร้างใหม่เฉพาะตอนเปลี่ยนโมเดลหรือ delegate)
let detector = null;  // ตัวแปรแคช instance ของตัวตรวจจับ เพื่อไม่ต้องสร้างใหม่ทุกครั้ง
let current = { model: null, delegate: null };  // อ็อบเจกต์บันทึกโมเดลและโหมดประมวลผล (GPU/CPU) ที่ใช้อยู่ปัจจุบัน


//O7 สร้างหรือใช้ตัวตรวจจับเดิม
async function getDetector(model, delegate, maxResults, threshold) {  // ฟังก์ชันดึงตัวตรวจจับเดิมหรือสร้างใหม่ตามโมเดลและพารามิเตอร์
  if (detector && current.model === model && current.delegate === delegate) {  // ตรวจสอบว่ามีตัวตรวจจับเดิมและใช้โมเดลรวมถึง delegate เดิมหรือไม่
    await detector.setOptions({ scoreThreshold: threshold, maxResults });   // โมเดลเดิม แค่ปรับค่าเกณฑ์ความมั่นใจและจำนวนผลลัพธ์สูงสุด
    return detector;  // คืนตัวตรวจจับเดิมที่อัปเดตการตั้งค่าแล้ว
  }

  if (detector) {  // หากมีตัวตรวจจับเก่าแต่สเปกเปลี่ยน
    try { detector.close(); } catch (e) { /* ปิดไม่ได้ก็ข้ามไป */ }  // พยายามปิดการทำงานของตัวตรวจจับเก่าเพื่อคืนทรัพยากร
    detector = null;   // กันค้างตัวเก่าที่ปิดแล้ว ถ้าสร้างตัวใหม่ไม่สำเร็จ
  }
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);  // โหลด WASM fileset สำหรับงาน Vision
  detector = await ObjectDetector.createFromOptions(vision, {  // สร้าง ObjectDetector ตัวใหม่จากตัวเลือกที่กำหนด
    baseOptions: {  // ตั้งค่าออปชันพื้นฐาน
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/${model}/float16/1/${model}.tflite`,  // เส้นทางไฟล์โมเดล TFLite บน Google Cloud Storage
      delegate,  // ตัวเลือกประมวลผล 'GPU' หรือ 'CPU'
    },
    scoreThreshold: threshold,  // เกณฑ์คะแนนความมั่นใจขั้นต่ำที่ยอมรับ
    maxResults,  // จำนวนวัตถุสูงสุดที่จะตรวจจับและแสดงผล
    runningMode: "IMAGE",  // โหมดการทำงานกับภาพนิ่ง (IMAGE)
  });
  current = { model, delegate };  // บันทึกโมเดลและ delegate ปัจจุบันที่สร้างสำเร็จ
  return detector;  // คืนตัวตรวจจับที่พร้อมใช้งาน
}

//O8 วาดกรอบ + ป้ายชื่อวัตถุลงบนภาพต้นฉบับ (ความละเอียดจริง) แล้วคืนเป็น data URL
function drawDetections(img, detections) {  // ฟังก์ชันวาดกรอบสี่เหลี่ยมและป้ายชื่อวัตถุลงบนภาพ
  const w = img.naturalWidth || img.width;  // อ่านค่าความกว้างจริงของภาพ
  const h = img.naturalHeight || img.height;  // อ่านค่าความสูงจริงของภาพ
  const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });  // สร้าง canvas ใหม่ที่มีขนาดเท่ากับภาพจริง
  const ctx = canvas.getContext("2d");  // ขอ context 2D สำหรับวาดกราฟิกลงบน canvas
  ctx.drawImage(img, 0, 0, w, h);  // วาดภาพต้นฉบับลงบน canvas เต็มพื้นที่

  const fontSize = Math.max(14, Math.round(w / 60));  // กำหนดขนาดตัวอักษรแปรผันตามความกว้างภาพ โดยไม่ต่ำกว่า 14px
  const labelH = fontSize + 10;  // กำหนดความสูงของแถบป้ายข้อความ
  ctx.lineWidth = Math.max(2, Math.round(w / 250));  // กำหนดความหนาของเส้นกรอบแปรผันตามความกว้างภาพ โดยไม่ต่ำกว่า 2px
  ctx.font = `600 ${fontSize}px 'Prompt', sans-serif`;  // กำหนดฟอนต์ น้ำหนัก และขนาดตัวอักษร

  for (const { boundingBox: box, categories: [top] } of detections) {  // วนลูปตามรายการวัตถุที่ตรวจพบ
    const label = `${top.categoryName} (${Math.round(top.score * 100)}%)`;  // ข้อความแสดงชื่อประเภทวัตถุและเปอร์เซ็นต์ความมั่นใจ

    ctx.strokeStyle = COLOR;  // กำหนดสีเส้นขอบเป็นสีฟ้า Cyan
    ctx.strokeRect(box.originX, box.originY, box.width, box.height);          // กรอบวัตถุ วาดเส้นขอบสี่เหลี่ยมตามตำแหน่งที่ตรวจพบ
    ctx.fillStyle = COLOR;  // กำหนดสีพื้นหลังป้ายชื่อเป็นสีฟ้า Cyan
    ctx.fillRect(box.originX, box.originY, ctx.measureText(label).width + 14, labelH);   // พื้นป้ายชื่อ วาดสี่เหลี่ยมทึบเป็นพื้นหลัง
    ctx.fillStyle = "#ffffff";  // กำหนดสีตัวอักษรเป็นสีขาว
    ctx.fillText(label, box.originX + 7, box.originY + labelH - 8);           // ข้อความ วาดตัวหนังสือชื่อวัตถุลงบนป้าย
  }
  return canvas.toDataURL("image/png");  // ส่งออกผลลัพธ์บน canvas เป็น data URL รูปแบบ PNG
}

/**
 * ตรวจจับวัตถุในภาพ <img>
 * settings = { model, delegate: "GPU"|"CPU", maxResults, threshold }
 * คืน { dataUrl: ภาพที่วาดกรอบแล้ว, count: จำนวนวัตถุ, objects: { ชื่อ: จำนวน } }
 */
//O6. เส้นทางตรวจจับวัตถุ — ทำในเบราว์เซอร์ ไม่ส่งไป Backend
// 1. รับภาพและค่าตั้งค่าจาก detectLocal() ใน script.js
window.runObjectDetection = async (img, { model, delegate, maxResults, threshold }) => {  // เปิดเมธอด runObjectDetection ให้ script.js เรียกใช้ตรวจจับวัตถุ

  // 2. เรียก getDetector() เพื่อเตรียมโมเดล AI
  const instance = await getDetector(model, delegate, maxResults, threshold);  // เรียกเตรียมโมเดล AI หรือดึง instance เดิม

  // 3. ใช้โมเดลตรวจจับวัตถุในภาพจริง
  const detections = instance.detect(img).detections || [];  // ประมวลผลตรวจจับวัตถุในภาพ img และดึงลิสต์ detections

  // 4. สร้างตัวแปรเก็บจำนวนวัตถุ
  const objects = {};  // สร้างอ็อบเจกต์เก็บยอดนับของแต่ละประเภทวัตถุ

  // 5. วนลูปผลตรวจจับทีละวัตถุ
  for (const d of detections) {  // วนลูปอ่านข้อมูลของวัตถุแต่ละรายการ

    // 6. อ่านชื่อวัตถุ เช่น person, cat
    const name = d.categories[0].categoryName;  // ดึงชื่อประเภทของวัตถุที่มีคะแนนสูงสุด

    // 7. นับจำนวนวัตถุแต่ละประเภท
    objects[name] = (objects[name] || 0) + 1;  // เพิ่มจำนวนการนับของวัตถุชนิดนั้นทีละ 1
  }

  // 8. วาดกรอบด้วย drawDetections() แล้วคืนผลให้ detectLocal()
  return { dataUrl: drawDetections(img, detections), count: detections.length, objects };  // วาดกรอบบนภาพแล้วคืน dataUrl, ยอดรวม count และสถิติ objects
};

// บอก waitForDetectorModule() ใน script.js ว่าโมดูลพร้อมแล้ว
window.__objectDetectorModuleReady = true;  // เซ็ตตัวแปรสถานะ global ว่าโมดูลตรวจจับวัตถุโหลดเสร็จสมบูรณ์พร้อมทำงานแล้ว
