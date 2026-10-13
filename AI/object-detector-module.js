// object-detector-module.js — ตรวจจับวัตถุด้วย MediaPipe ในเบราว์เซอร์ (ไม่ผ่าน Backend)
// ต้องโหลดด้วย <script type="module"> เท่านั้น (home.html โหลดผ่าน /api/ai/object-detector-module.js)
// ใช้ static import เพราะ dynamic import() จาก classic script ไม่เสถียรในบางเบราว์เซอร์
// เปิดฟังก์ชัน window.runObjectDetection ให้ script.js เรียกใช้
import { ObjectDetector, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm";
const COLOR = "#06b6d4";

// เก็บตัวตรวจจับไว้ใช้ซ้ำ (สร้างใหม่เฉพาะตอนเปลี่ยนโมเดลหรือ delegate)
let detector = null;
let current = { model: null, delegate: null };

async function getDetector(model, delegate, maxResults, threshold) {
  if (detector && current.model === model && current.delegate === delegate) {
    await detector.setOptions({ scoreThreshold: threshold, maxResults });   // โมเดลเดิม แค่ปรับค่า
    return detector;
  }

  if (detector) {
    try { detector.close(); } catch (e) { /* ปิดไม่ได้ก็ข้ามไป */ }
    detector = null;   // กันค้างตัวเก่าที่ปิดแล้ว ถ้าสร้างตัวใหม่ไม่สำเร็จ
  }
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  detector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/${model}/float16/1/${model}.tflite`,
      delegate,
    },
    scoreThreshold: threshold,
    maxResults,
    runningMode: "IMAGE",
  });
  current = { model, delegate };
  return detector;
}

// วาดกรอบ + ป้ายชื่อวัตถุลงบนภาพต้นฉบับ (ความละเอียดจริง) แล้วคืนเป็น data URL
function drawDetections(img, detections) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const fontSize = Math.max(14, Math.round(w / 60));
  const labelH = fontSize + 10;
  ctx.lineWidth = Math.max(2, Math.round(w / 250));
  ctx.font = `600 ${fontSize}px 'Prompt', sans-serif`;

  for (const { boundingBox: box, categories: [top] } of detections) {
    const label = `${top.categoryName} (${Math.round(top.score * 100)}%)`;

    ctx.strokeStyle = COLOR;
    ctx.strokeRect(box.originX, box.originY, box.width, box.height);          // กรอบวัตถุ
    ctx.fillStyle = COLOR;
    ctx.fillRect(box.originX, box.originY, ctx.measureText(label).width + 14, labelH);   // พื้นป้ายชื่อ
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, box.originX + 7, box.originY + labelH - 8);           // ข้อความ
  }
  return canvas.toDataURL("image/png");
}

/**
 * ตรวจจับวัตถุในภาพ <img>
 * settings = { model, delegate: "GPU"|"CPU", maxResults, threshold }
 * คืน { dataUrl: ภาพที่วาดกรอบแล้ว, count: จำนวนวัตถุ, objects: { ชื่อ: จำนวน } }
 */
window.runObjectDetection = async (img, { model, delegate, maxResults, threshold }) => {
  const instance = await getDetector(model, delegate, maxResults, threshold);
  const detections = instance.detect(img).detections || [];

  const objects = {};
  for (const d of detections) {
    const name = d.categories[0].categoryName;
    objects[name] = (objects[name] || 0) + 1;
  }
  return { dataUrl: drawDetections(img, detections), count: detections.length, objects };
};

// บอก script.js ว่าโมดูลพร้อมใช้งานแล้ว
window.__objectDetectorModuleReady = true;
