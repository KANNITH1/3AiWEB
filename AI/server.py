"""
AI Server - Image Generation / Editing Service
================================================
ทำงานที่ 192.168.1.30 (ตามไดอะแกรมของทีม)
รับ request จาก Flask Backend (192.168.1.20) แล้ว generate/edit ภาพให้

Endpoints:
  POST /generate      -> text-to-image (async, คืน job_id)
  POST /edit          -> image-to-image / inpainting (async, คืน job_id)
  GET  /status/<id>   -> เช็คสถานะงาน / ดึงผลลัพธ์
  GET  /health         -> เช็คว่า server พร้อมใช้งานไหม

วิธีรัน:
  pip install -r requirements.txt
  python server.py
"""

import os
import uuid
import threading
import queue
import base64
import io
import traceback
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__)

# ----------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

MODEL_ID = "runwayml/stable-diffusion-v1-5"   # เปลี่ยนเป็นโมเดล/LoRA ที่ทีมเลือกใช้
DEVICE = "cuda"  # เปลี่ยนเป็น "cpu" ถ้าเครื่องไม่มี GPU (จะช้ามาก)

# ----------------------------------------------------------------------
# LAZY MODEL LOADING
# โหลดโมเดลตอนเรียกใช้ครั้งแรกเท่านั้น ไม่ใช่ตอน import
# เพราะโหลดโมเดลใช้เวลาและ RAM/VRAM เยอะ ไม่อยากให้ค้างตอน start server
# ----------------------------------------------------------------------
_pipeline = None
_pipeline_lock = threading.Lock()


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        with _pipeline_lock:
            if _pipeline is None:
                print(f"[AI Server] Loading model: {MODEL_ID} ...")
                import torch
                from diffusers import StableDiffusionPipeline

                dtype = torch.float16 if DEVICE == "cuda" else torch.float32
                pipe = StableDiffusionPipeline.from_pretrained(
                    MODEL_ID, torch_dtype=dtype, safety_checker=None
                )
                pipe = pipe.to(DEVICE)

                # ตัวอย่างการโหลด LoRA (ถ้าทีมมีไฟล์ .safetensors):
                # pipe.load_lora_weights("./models/lora/my_style.safetensors")

                _pipeline = pipe
                print("[AI Server] Model loaded.")
    return _pipeline


# ----------------------------------------------------------------------
# JOB QUEUE
# ใช้ queue.Queue + worker thread เดียว ประมวลผลทีละงาน กัน GPU ล้น
# ถ้าทีมมีหลาย request พร้อมกัน จะต่อคิวรอ ไม่ error/ค้าง
# ----------------------------------------------------------------------
job_queue = queue.Queue()
jobs = {}  # job_id -> {"status": "queued"/"processing"/"done"/"error", "result": ..., "error": ...}
jobs_lock = threading.Lock()


def worker_loop():
    while True:
        job_id, task_type, payload = job_queue.get()
        with jobs_lock:
            jobs[job_id]["status"] = "processing"
        try:
            if task_type == "generate":
                result_path = run_generate(payload)
            elif task_type == "edit":
                result_path = run_edit(payload)
            else:
                raise ValueError(f"Unknown task type: {task_type}")

            with jobs_lock:
                jobs[job_id]["status"] = "done"
                jobs[job_id]["result"] = result_path
        except Exception as e:
            traceback.print_exc()
            with jobs_lock:
                jobs[job_id]["status"] = "error"
                jobs[job_id]["error"] = str(e)
        finally:
            job_queue.task_done()


threading.Thread(target=worker_loop, daemon=True).start()


# ----------------------------------------------------------------------
# CORE AI FUNCTIONS
# ----------------------------------------------------------------------
def run_generate(payload):
    """text-to-image"""
    pipe = get_pipeline()
    prompt = payload["prompt"]
    negative_prompt = payload.get("negative_prompt", "")
    steps = payload.get("steps", 25)
    guidance_scale = payload.get("guidance_scale", 7.5)

    image = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        num_inference_steps=steps,
        guidance_scale=guidance_scale,
    ).images[0]

    filename = f"{uuid.uuid4().hex}.png"
    filepath = os.path.join(OUTPUT_DIR, filename)
    image.save(filepath)
    return filename


def run_edit(payload):
    """image-to-image: รับภาพ base64 เข้ามาแก้ไขตาม prompt"""
    from PIL import Image
    from diffusers import StableDiffusionImg2ImgPipeline

    # ใช้ pipeline คนละตัวกับ text-to-image (diffusers รองรับ from_pipe เพื่อประหยัด RAM)
    base_pipe = get_pipeline()
    img2img_pipe = StableDiffusionImg2ImgPipeline(**base_pipe.components)
    img2img_pipe = img2img_pipe.to(DEVICE)

    image_b64 = payload["image_base64"]
    prompt = payload["prompt"]
    strength = payload.get("strength", 0.6)

    init_image = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")

    result = img2img_pipe(
        prompt=prompt, image=init_image, strength=strength
    ).images[0]

    filename = f"{uuid.uuid4().hex}.png"
    filepath = os.path.join(OUTPUT_DIR, filename)
    result.save(filepath)
    return filename


# ----------------------------------------------------------------------
# API ROUTES
# ----------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})


@app.route("/generate", methods=["POST"])
def generate():
    data = request.get_json(silent=True) or {}
    if not data.get("prompt"):
        return jsonify({"error": "missing 'prompt'"}), 400

    job_id = uuid.uuid4().hex
    with jobs_lock:
        jobs[job_id] = {"status": "queued", "result": None, "error": None}
    job_queue.put((job_id, "generate", data))

    return jsonify({"job_id": job_id, "status": "queued"}), 202


@app.route("/edit", methods=["POST"])
def edit():
    data = request.get_json(silent=True) or {}
    if not data.get("prompt") or not data.get("image_base64"):
        return jsonify({"error": "missing 'prompt' or 'image_base64'"}), 400

    job_id = uuid.uuid4().hex
    with jobs_lock:
        jobs[job_id] = {"status": "queued", "result": None, "error": None}
    job_queue.put((job_id, "edit", data))

    return jsonify({"job_id": job_id, "status": "queued"}), 202


@app.route("/status/<job_id>", methods=["GET"])
def status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "job not found"}), 404

    response = {"job_id": job_id, "status": job["status"]}
    if job["status"] == "done":
        response["image_url"] = f"/outputs/{job['result']}"
    elif job["status"] == "error":
        response["error"] = job["error"]

    return jsonify(response)


@app.route("/outputs/<path:filename>", methods=["GET"])
def get_output(filename):
    return send_from_directory(OUTPUT_DIR, filename)


if __name__ == "__main__":
    # host="0.0.0.0" เพื่อให้เครื่อง Backend (192.168.1.20) ยิงมาถึงได้ในวง LAN
    app.run(host="0.0.0.0", port=5001, debug=True)
