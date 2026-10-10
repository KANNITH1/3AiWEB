// object-detector-module.js
// -----------------------------------------------------------------
// ไฟล์นี้ต้องถูกโหลดด้วย <script type="module"> เท่านั้น (ดู home.html)
// ใช้ static import แบบเดียวกับโปรเจค detector.js เดิมของผู้ใช้ที่เคยรันได้จริง
// เพื่อเลี่ยงปัญหา dynamic import() จาก classic script ที่บางเบราว์เซอร์/บาง
// เครื่องจัดการได้ไม่เสถียร
// -----------------------------------------------------------------

import { ObjectDetector, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

let objectDetector = null;
let lastModel = null;
let lastDelegate = null;

async function ensureDetector(model, delegate, maxResults, threshold) {
  const needsReinit = !objectDetector || model !== lastModel || delegate !== lastDelegate;

  if (needsReinit) {
    if (objectDetector) {
      try { objectDetector.close(); } catch (e) { /* ignore */ }
    }

    const modelUrl = `https://storage.googleapis.com/mediapipe-models/object_detector/${model}/float16/1/${model}.tflite`;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    objectDetector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelUrl, delegate },
      scoreThreshold: threshold,
      maxResults,
      runningMode: "IMAGE",
    });

    lastModel = model;
    lastDelegate = delegate;
  } else {
    await objectDetector.setOptions({ scoreThreshold: threshold, maxResults });
  }

  return objectDetector;
}

// วาดกรอบ + ป้ายชื่อวัตถุลงบนภาพต้นฉบับ (ที่ความละเอียดจริง) แล้วคืนเป็น data URL
function drawDetectionsOnImage(imgEl, detections) {
  const w = imgEl.naturalWidth || imgEl.width;
  const h = imgEl.naturalHeight || imgEl.height;

  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  const ctx = tmpCanvas.getContext("2d");
  ctx.drawImage(imgEl, 0, 0, w, h);

  (detections || []).forEach((detection) => {
    const { originX, originY, width, height } = detection.boundingBox;
    const category = detection.categories[0];
    const labelText = `${category.categoryName} (${Math.round(category.score * 100)}%)`;

    const lineWidth = Math.max(2, Math.round(w / 250));
    const fontSize = Math.max(14, Math.round(w / 60));
    const boxH = fontSize + 10;

    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(originX, originY, width, height);

    ctx.font = `600 ${fontSize}px 'Prompt', sans-serif`;
    const textW = ctx.measureText(labelText).width;

    ctx.fillStyle = "#06b6d4";
    ctx.fillRect(originX, originY, textW + 14, boxH);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(labelText, originX + 7, originY + boxH - 8);
  });

  return tmpCanvas.toDataURL("image/png");
}

// เปิดให้ script.js (classic script) เรียกใช้งานผ่าน window ได้
window.runObjectDetection = async function (imgEl, settings) {
  const { model, delegate, maxResults, threshold } = settings;
  const detector = await ensureDetector(model, delegate, maxResults, threshold);
  const result = detector.detect(imgEl);
  const detections = result.detections || [];
  return {
    dataUrl: drawDetectionsOnImage(imgEl, detections),
    count: detections.length,
  };
};

// บอก script.js ว่าโมดูลนี้พร้อมใช้งานแล้ว (เผื่อกดปุ่มเร็วเกินไปก่อนโมดูลโหลดเสร็จ)
window.__objectDetectorModuleReady = true;
