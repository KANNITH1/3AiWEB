// ===================================
// generator.js
// ไฟล์นี้ควบคุมการสร้างภาพในโหมด Text to Image และ Image to Image
// ===================================
import { CONFIG, apiFetch, setButtonLoading, showToast } from './shared.js';

let lastRequest = null;
const files = { img2img: null };

// สร้างภาพจำลองแบบ SVG สำหรับทดสอบ UI ก่อนเชื่อมต่อ AI backend
function createLocalArtwork(prompt, mode, model) {
  const safePrompt = String(prompt || 'Forge AI artwork').slice(0, 54).replace(/[<&>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b0f19"/><stop offset=".55" stop-color="#10233a"/><stop offset="1" stop-color="#063b3b"/></linearGradient><linearGradient id="line"><stop stop-color="#ff5e00"/><stop offset="1" stop-color="#00f3ff"/></linearGradient></defs><rect width="768" height="768" fill="url(#bg)"/><circle cx="384" cy="310" r="170" fill="#07111f" stroke="url(#line)" stroke-width="5"/><circle cx="384" cy="310" r="110" fill="none" stroke="#00f3ff" stroke-opacity=".25" stroke-width="22"/><text x="384" y="305" fill="#00f3ff" font-size="30" text-anchor="middle" font-family="sans-serif">FORGE ENGINE</text><text x="384" y="345" fill="#b8c8d9" font-size="15" text-anchor="middle" font-family="sans-serif">${mode.toUpperCase()} / ${model}</text><rect x="70" y="540" width="628" height="120" rx="14" fill="#030712" fill-opacity=".8" stroke="#00f3ff" stroke-opacity=".35"/><text x="95" y="590" fill="#f8fafc" font-size="16" font-family="sans-serif">${safePrompt}</text><text x="95" y="625" fill="#ff8b47" font-size="14" font-family="sans-serif">NEURAL SYNTHESIZED · FORGE DEMO</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// อ่านค่าการตั้งค่าขั้นสูงจากฟอร์ม Text to Image
function getSettings() {
  return {
    steps: Number(document.getElementById('steps')?.value || 30),
    cfg_scale: Number(document.getElementById('cfg-scale')?.value || 7),
    width: Number(document.getElementById('width')?.value || 768),
    height: Number(document.getElementById('height')?.value || 768),
    seed: document.getElementById('seed')?.value ? Number(document.getElementById('seed').value) : null
  };
}

// เปลี่ยนพื้นที่ผลลัพธ์ให้แสดง empty, loading, error หรือ output ทีละสถานะ
function setResultState(state, message = '') {
  ['result-empty', 'result-loading', 'result-error', 'result-output'].forEach(id => document.getElementById(id)?.classList.toggle('active', id === `result-${state}`));
  if (state === 'error') document.getElementById('error-message').textContent = message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

// เปลี่ยนสถานะผลลัพธ์ของ Image to Image
function setSecondaryState(state, message = '') {
  ['img2img-empty', 'img2img-loading', 'img2img-error', 'img2img-output'].forEach(id => document.getElementById(id)?.classList.toggle('active', id === `img2img-${state}`));
  if (state === 'error') document.getElementById('img2img-error-message').textContent = message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

// อัปเดต progress bar และข้อความระหว่างรอผลการสร้างภาพ
function setProgress(progress, label) {
  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = `${progress}%`;
  const text = document.getElementById('progress-label');
  if (text) text.textContent = label;
}

// แสดงผลภาพที่ได้จาก backend หรือภาพจำลอง
function showResult(imageUrl, prompt, mode = 'txt2img') {
  if (mode === 'img2img') {
    setSecondaryState('output');
    document.getElementById('img2img-result-image').src = imageUrl;
    document.getElementById('img2img-download').href = imageUrl;
    document.getElementById('img2img-result-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  setResultState('output');
  const image = document.getElementById('result-image');
  const download = document.getElementById('download-btn');
  image.src = imageUrl;
  download.href = imageUrl;
  download.download = `forge-${Date.now()}.svg`;
  document.getElementById('result-meta').textContent = `${mode} · พร้อมดาวน์โหลด`;
  document.getElementById('result-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  localStorage.setItem('forge_last_result', JSON.stringify({ id: `local-${Date.now()}`, image_url: imageUrl, prompt, type: mode, created_at: new Date().toISOString(), status: 'completed', parameters: { model: lastRequest?.model, ...getSettings() } }));
}

// ส่ง payload ไปยัง backend หรือใช้ mock mode พร้อมจัดการ loading/error state
async function runGeneration(request, button) {
  setButtonLoading(button, true, 'กำลังสร้างภาพ...');
  if (request.type === 'img2img') setSecondaryState('loading'); else setResultState('loading');
  setProgress(12, 'กำลังเตรียมคำสั่ง');
  let timer;
  try {
    timer = window.setInterval(() => { const bar = document.getElementById('progress-bar'); const next = Math.min(88, Number.parseInt(bar.style.width || '12', 10) + 12); setProgress(next, next > 60 ? 'กำลังเรนเดอร์รายละเอียด' : 'กำลังประมวลผล prompt'); }, 350);
    let result;
    if (!CONFIG.USE_DEMO_MODE) result = await apiFetch(CONFIG.ENDPOINTS.GENERATE, { method: 'POST', body: JSON.stringify(request) });
    await new Promise(resolve => setTimeout(resolve, 950));
    showResult(result?.image_url || createLocalArtwork(request.prompt, request.type, request.model), request.prompt, request.type);
    showToast('สร้างผลลัพธ์เรียบร้อยแล้ว', 'success');
  } catch (error) {
    if (request.type === 'img2img') setSecondaryState('error', error.message); else setResultState('error', error.message);
  } finally {
    window.clearInterval(timer);
    setButtonLoading(button, false);
  }
}

// อ่านไฟล์รูปภาพและแสดง preview ใน dropzone
function updatePreview(type, file) {
  if (!file || !file.type.startsWith('image/')) { showToast('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'error'); return; }
  files[type] = file;
  const preview = document.getElementById(`${type}-preview`);
  const actions = document.getElementById(`${type}-actions`);
  const reader = new FileReader();
  reader.onload = event => { preview.src = event.target.result; preview.style.display = 'block'; actions.classList.add('has-file'); };
  reader.readAsDataURL(file);
}

// ล้างไฟล์และ preview ของ Image to Image
function clearPreview(type) {
  files[type] = null;
  const input = document.getElementById(`${type}-file`);
  const preview = document.getElementById(`${type}-preview`);
  const actions = document.getElementById(`${type}-actions`);
  input.value = ''; preview.removeAttribute('src'); preview.style.display = 'none'; actions.classList.remove('has-file');
}

// ผูก click, keyboard, drag และ drop ให้กับ dropzone
function initDropzone(type) {
  const zone = document.querySelector(`[data-dropzone="${type}"]`); const input = document.getElementById(`${type}-file`);
  if (!zone || !input) return;
  zone.addEventListener('click', event => { if (!event.target.closest('button')) input.click(); });
  zone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') input.click(); });
  input.addEventListener('change', event => updatePreview(type, event.target.files[0]));
  ['dragenter', 'dragover'].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.add('is-dragging'); }));
  ['dragleave', 'drop'].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.remove('is-dragging'); }));
  zone.addEventListener('drop', event => updatePreview(type, event.dataTransfer.files[0]));
  document.querySelector(`[data-replace="${type}"]`)?.addEventListener('click', event => { event.stopPropagation(); input.click(); });
  document.querySelector(`[data-clear="${type}"]`)?.addEventListener('click', event => { event.stopPropagation(); clearPreview(type); });
}

// สลับระหว่าง Text to Image และ Image to Image
export function switchMode(mode) {
  document.querySelectorAll('.mode-tab-btn').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  document.querySelectorAll('.mode-content').forEach(content => content.classList.toggle('active', content.id === `mode-${mode}`));
}

// เชื่อม slider กับ output ที่แสดงค่าปัจจุบัน
function bindRange(inputId, outputId, format = value => value) {
  const input = document.getElementById(inputId); const output = document.getElementById(outputId);
  input?.addEventListener('input', () => { output.textContent = format(input.value); });
}

// เริ่มต้น event listener ของหน้า AI Image Engine
export function initGenerator() {
  switchMode('txt2img'); setResultState('empty'); setSecondaryState('empty');
  document.querySelectorAll('.mode-tab-btn').forEach(button => button.addEventListener('click', () => switchMode(button.dataset.mode)));
  document.getElementById('advanced-toggle')?.addEventListener('click', event => { const panel = document.getElementById('advanced-settings'); const expanded = panel.hidden; panel.hidden = !expanded; event.currentTarget.setAttribute('aria-expanded', String(expanded)); });
  document.querySelector('[data-advanced-toggle="img2img"]')?.addEventListener('click', event => { const panel = document.querySelector('[data-advanced-panel="img2img"]'); const expanded = panel.hidden; panel.hidden = !expanded; event.currentTarget.setAttribute('aria-expanded', String(expanded)); });
  bindRange('steps', 'steps-value'); bindRange('cfg-scale', 'cfg-value'); bindRange('img2img-steps', 'img2img-steps-value'); bindRange('img2img-cfg', 'img2img-cfg-value'); bindRange('denoising-strength', 'denoising-value', value => Number(value).toFixed(2));
  document.getElementById('random-seed')?.addEventListener('click', () => { document.getElementById('seed').value = Math.floor(Math.random() * 2147483647); });
  document.getElementById('generate-form')?.addEventListener('submit', event => { event.preventDefault(); const prompt = document.getElementById('prompt').value.trim(); if (!prompt) return setResultState('error', 'กรุณากรอก Prompt ก่อนสร้างภาพ'); const settings = getSettings(); lastRequest = { prompt, negative_prompt: document.getElementById('negative-prompt').value.trim(), type: 'txt2img', model: document.getElementById('txt2img-model').value, ...settings, parameters: settings }; runGeneration(lastRequest, document.getElementById('btn-txt2img')); });
  document.getElementById('img2img-form')?.addEventListener('submit', event => { event.preventDefault(); const prompt = document.getElementById('img2img-prompt').value.trim(); if (!files.img2img) return showToast('กรุณาอัปโหลดภาพต้นฉบับก่อน', 'error'); if (!prompt) return showToast('กรุณากรอก Prompt ก่อนแปลงภาพ', 'error'); const parameters = { steps: Number(document.getElementById('img2img-steps').value), cfg_scale: Number(document.getElementById('img2img-cfg').value), width: Number(document.getElementById('width').value), height: Number(document.getElementById('height').value), seed: document.getElementById('seed').value ? Number(document.getElementById('seed').value) : null }; lastRequest = { prompt, negative_prompt: document.getElementById('img2img-negative').value.trim(), type: 'img2img', model: document.getElementById('img2img-model').value, ...parameters, denoising_strength: Number(document.getElementById('denoising-strength').value), image: files.img2img.name, parameters }; runGeneration(lastRequest, document.getElementById('btn-img2img')); });
  document.getElementById('regenerate-btn')?.addEventListener('click', () => { if (lastRequest) runGeneration(lastRequest, document.getElementById('btn-txt2img')); });
  document.getElementById('retry-btn')?.addEventListener('click', () => { if (lastRequest) runGeneration(lastRequest, document.getElementById('btn-txt2img')); });
  document.getElementById('img2img-regenerate')?.addEventListener('click', () => { if (lastRequest?.type === 'img2img') runGeneration(lastRequest, document.getElementById('btn-img2img')); });
  document.getElementById('fullscreen-btn')?.addEventListener('click', () => { const image = document.getElementById('result-image'); if (image?.src) window.open(image.src, '_blank'); });
  initDropzone('img2img');
}