// เปลี่ยน URL เหล่านี้เป็น IP จริงของเครื่อง Backend เพื่อน
// เช่น "http://192.168.1.20:5000/api/generate"
const API_ENDPOINTS = {
  text2img: "http://localhost:5000/api/generate",
  img2img: "http://localhost:5000/api/img2img",
  upscale: "http://localhost:5000/api/upscale"
};

const form = document.getElementById("generate-form");
const submitBtn = document.getElementById("submit-btn");
const resultWrapper = document.getElementById("result");
const resultImage = document.getElementById("result-image");
const saveBtn = document.getElementById("save-btn");
const styleChips = document.querySelectorAll("#style-group .chip");
const scaleChips = document.querySelectorAll("#scale-group .chip");
const modeTabs = document.querySelectorAll(".mode-tab");
const toastContainer = document.getElementById("toast-container");
const themeToggle = document.getElementById("theme-toggle");

const uploadGroup = document.getElementById("upload-group");
const promptGroup = document.getElementById("prompt-group");
const strengthGroup = document.getElementById("strength-group");
const scaleGroup = document.getElementById("scale-group");
const styleGroup = document.getElementById("style-group");
const uploadBox = document.getElementById("upload-box");
const sourceImageInput = document.getElementById("source-image");
const uploadPreview = document.getElementById("upload-preview");
const strengthInput = document.getElementById("strength");
const strengthValue = document.getElementById("strength-value");

let currentMode = "text2img";
let selectedStyle = "realistic";
let selectedScale = "2";
let uploadedImageData = null;
let lastResult = null;

// ----- toast -----
function showToast(message, type = "success") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = "toast" + (type === "error" ? " error" : "");
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ----- theme toggle -----
if (themeToggle) {
  const saved = localStorage.getItem("forge_theme");
  if (saved === "light") document.documentElement.setAttribute("data-theme", "light");

  themeToggle.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("forge_theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("forge_theme", "light");
    }
  });
}

// ----- mode switching -----
if (modeTabs.length) {
  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      modeTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentMode = tab.dataset.mode;
      updateFormForMode(currentMode);
    });
  });
}

function updateFormForMode(mode) {
  uploadGroup.classList.toggle("hidden", mode === "text2img");
  strengthGroup.classList.toggle("hidden", mode !== "img2img");
  scaleGroup.classList.toggle("hidden", mode !== "upscale");
  promptGroup.classList.toggle("hidden", mode === "upscale");
  styleGroup.classList.toggle("hidden", mode === "upscale");
}

// ----- image upload -----
if (uploadBox) {
  uploadBox.addEventListener("click", () => sourceImageInput.click());
  sourceImageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      uploadedImageData = evt.target.result;
      uploadPreview.src = uploadedImageData;
      uploadBox.classList.add("has-image");
    };
    reader.readAsDataURL(file);
  });
  uploadBox.addEventListener("dragover", (e) => e.preventDefault());
  uploadBox.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      sourceImageInput.files = e.dataTransfer.files;
      sourceImageInput.dispatchEvent(new Event("change"));
    }
  });
}

if (strengthInput) {
  strengthInput.addEventListener("input", () => {
    strengthValue.textContent = strengthInput.value + "%";
  });
}

styleChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    styleChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    selectedStyle = chip.dataset.style;
  });
});

scaleChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    scaleChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    selectedScale = chip.dataset.scale;
  });
});

// ----- generate form submit -----
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const prompt = document.getElementById("prompt").value.trim();

    if (currentMode !== "upscale" && !prompt) {
      showToast("กรุณาใส่ prompt", "error");
      return;
    }
    if (currentMode !== "text2img" && !uploadedImageData) {
      showToast("กรุณาอัปโหลดภาพต้นฉบับ", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add("loading");
    resultWrapper.style.display = "none";

    const payload = { mode: currentMode };
    if (currentMode !== "upscale") {
      payload.prompt = prompt;
      payload.style = selectedStyle;
    }
    if (currentMode === "img2img") {
      payload.image = uploadedImageData;
      payload.strength = Number(strengthInput.value) / 100;
    }
    if (currentMode === "upscale") {
      payload.image = uploadedImageData;
      payload.scale = Number(selectedScale);
    }

    try {
      const response = await fetch(API_ENDPOINTS[currentMode], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Server error: " + response.status);

      const data = await response.json();

      resultImage.src = data.image_url;
      resultWrapper.style.display = "block";

      lastResult = {
        prompt: prompt || `(${currentMode})`,
        style: selectedStyle,
        mode: currentMode,
        imageUrl: data.image_url
      };

      showToast("สร้างภาพสำเร็จ");
      addToHistory(lastResult);
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove("loading");
    }
  });
}

if (saveBtn) {
  saveBtn.addEventListener("click", () => {
    if (!lastResult) return;
    addToGallery(lastResult);
    showToast("บันทึกลง Gallery แล้ว");
  });
}

// ----- gallery + history (localStorage) -----
function getGallery() { return JSON.parse(localStorage.getItem("forge_gallery") || "[]"); }
function getHistory() { return JSON.parse(localStorage.getItem("forge_history") || "[]"); }

function addToGallery(item) {
  const gallery = getGallery();
  gallery.unshift({ ...item, savedAt: Date.now() });
  localStorage.setItem("forge_gallery", JSON.stringify(gallery));
  renderGallery();
}

function addToHistory(item) {
  const history = getHistory();
  history.unshift({ ...item, createdAt: Date.now() });
  localStorage.setItem("forge_history", JSON.stringify(history.slice(0, 50)));
  renderHistory();
}

function renderGallery() {
  const grid = document.getElementById("gallery-grid");
  if (!grid) return;
  const gallery = getGallery();
  if (gallery.length === 0) {
    grid.innerHTML = '<p class="empty-state">ยังไม่มีภาพที่บันทึกไว้ — ลองสร้างภาพแล้วกด "บันทึกลง Gallery" ดูสิ</p>';
    return;
  }
  grid.innerHTML = gallery.map((item) => `
    <div class="gallery-card">
      <img src="${item.imageUrl}" alt="${escapeHtml(item.prompt)}">
      <p>${escapeHtml(item.prompt)}</p>
    </div>
  `).join("");
}

function renderHistory() {
  const list = document.getElementById("history-list");
  if (!list) return;
  const history = getHistory();
  if (history.length === 0) {
    list.innerHTML = '<p class="empty-state">ยังไม่มีประวัติการสร้างภาพ</p>';
    return;
  }
  list.innerHTML = history.map((item) => `
    <div class="history-item">
      <span>${escapeHtml(item.prompt)}</span>
      <span class="h-tag">${escapeHtml(item.mode || item.style)}</span>
    </div>
  `).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

if (document.getElementById("mode-tabs")) updateFormForMode("text2img");
renderGallery();
renderHistory();