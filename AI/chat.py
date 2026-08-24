"""
chat_with_image_gen_groq.py
แชทที่ Groq (Llama 3.3) เป็นตัวกลาง วิเคราะห์ว่าผู้ใช้อยากคุยเฉยๆ หรืออยากได้ภาพ
ถ้าอยากได้ภาพ -> สร้าง prompt ภาษาอังกฤษให้ -> Backend สั่ง Forge Neo generate ภาพ

จุดเด่น: Groq free tier ไม่ต้องผูกบัตรเครดิตเลย ไม่มีทางถูกเรียกเก็บเงิน

วิธีใช้:
1. pip install openai python-dotenv flask flask-cors requests
   (ใช้ openai SDK ได้เพราะ Groq รองรับ API แบบเดียวกับ OpenAI)
2. สมัคร key ฟรีที่ https://console.groq.com/keys (ไม่ต้องผูกบัตร)
3. สร้างไฟล์ .env ใส่ GROQ_API_KEY=xxxx
4. เปิด Stability Matrix -> Launch Forge Neo ให้รันอยู่ (http://127.0.0.1:7860)
5. python chat_with_image_gen_groq.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
import os
import json
import requests

load_dotenv()

app = Flask(__name__)
CORS(app)

# ชี้ไปที่ Groq แทน OpenAI โดยใช้ SDK เดิม (Groq รองรับ API รูปแบบเดียวกัน)
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

FORGE_NEO_URL = "http://127.0.0.1:7860/sdapi/v1/txt2img"

chat_histories = {}

SYSTEM_INSTRUCTION = """คุณเป็นผู้ช่วย AI ที่คุยเป็นภาษาไทย และสามารถสั่งสร้างภาพให้ผู้ใช้ได้

ให้วิเคราะห์ทุกข้อความของผู้ใช้ แล้วตอบกลับเป็น JSON เท่านั้น ตามรูปแบบนี้เสมอ:

{
  "action": "chat" หรือ "generate_image",
  "reply": "ข้อความตอบกลับที่จะแสดงให้ผู้ใช้เห็น (ภาษาไทย เป็นมิตร)",
  "image_prompt": "prompt ภาษาอังกฤษสำหรับสร้างภาพ (ใส่เฉพาะตอน action เป็น generate_image เท่านั้น ถ้าไม่ใช่ให้เป็น null)"
}

กฎการตัดสินใจ:
- ถ้าผู้ใช้ขอให้วาด/สร้าง/generate ภาพ หรือบอกอยากเห็นรูปอะไรสักอย่าง -> action = "generate_image"
  - แปลงคำขอเป็น prompt ภาษาอังกฤษที่ละเอียด เหมาะกับ Stable Diffusion
  - reply ควรเป็นข้อความสั้นๆ บอกว่ากำลังสร้างภาพให้
- ถ้าผู้ใช้แค่คุยทั่วไป ถามคำถาม หรือสนทนาปกติ -> action = "chat"
  - image_prompt เป็น null
  - reply คือคำตอบปกติของบทสนทนา

ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON ห้ามใช้ markdown code block"""


def generate_image_from_forge(prompt, steps=20, size=512):
    response = requests.post(
        FORGE_NEO_URL,
        json={"prompt": prompt, "steps": steps, "width": size, "height": size},
        timeout=120
    )
    response.raise_for_status()
    data = response.json()
    if not data.get("images"):
        raise ValueError("Forge Neo ไม่คืนภาพกลับมา")
    return data["images"][0]


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_message = data.get("message")
    session_id = data.get("session_id", "default")

    if not user_message:
        return jsonify({"error": "message is required"}), 400

    try:
        if session_id not in chat_histories:
            chat_histories[session_id] = [
                {"role": "system", "content": SYSTEM_INSTRUCTION}
            ]

        chat_histories[session_id].append({"role": "user", "content": user_message})

        completion = client.chat.completions.create(
            model="openai/gpt-oss-120b",  # โมเดลฟรีคุณภาพดีของ Groq
            messages=chat_histories[session_id],
            response_format={"type": "json_object"},
            max_tokens=500
        )

        raw_reply = completion.choices[0].message.content
        chat_histories[session_id].append({"role": "assistant", "content": raw_reply})

        result = json.loads(raw_reply)
        action = result.get("action", "chat")
        reply_text = result.get("reply", "")
        image_prompt = result.get("image_prompt")

        response_payload = {
            "reply": reply_text,
            "session_id": session_id,
            "action": action
        }

        if action == "generate_image" and image_prompt:
            try:
                image_base64 = generate_image_from_forge(image_prompt)
                response_payload["image"] = image_base64
                response_payload["image_prompt_used"] = image_prompt
            except requests.exceptions.ConnectionError:
                response_payload["reply"] += "\n\n⚠️ เชื่อมต่อ Forge Neo ไม่ได้ กรุณาเช็คว่าเปิด Stability Matrix อยู่หรือไม่"
            except Exception as e:
                response_payload["reply"] += f"\n\n⚠️ สร้างภาพไม่สำเร็จ: {str(e)}"

        return jsonify(response_payload)

    except json.JSONDecodeError:
        return jsonify({"error": "Groq ตอบกลับไม่ใช่รูปแบบ JSON ที่คาดไว้"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat/reset", methods=["POST"])
def reset_chat():
    data = request.get_json()
    session_id = data.get("session_id", "default")
    if session_id in chat_histories:
        del chat_histories[session_id]
    return jsonify({"status": "reset done"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)