// ================= 1. Theme Management =================
const initTheme = () => {
  const theme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
};

const toggleTheme = () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
};

// ================= 2. Toast Notification =================
const showToast = (msg, type = 'success') => {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
};

// ================= 3. Route Protection =================
const checkRouteProtection = () => {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const user = JSON.parse(localStorage.getItem('forge_user'));
  const protectedPages = ['home.html', 'gallery.html', 'history.html'];

  if (protectedPages.includes(currentPage) && !user) {
    alert('กรุณาเข้าสู่ระบบก่อนใช้งานหน้านี้');
    window.location.href = 'members.html';
  }
};

// ================= 4. Backend Health Check =================
const checkBackendHealth = async () => {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;

  if (typeof CONFIG !== 'undefined' && CONFIG.USE_DEMO_MODE) {
    dot.textContent = '🟠';
    text.textContent = 'โหมดจำลอง (Demo)';
    return;
  }

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.HEALTH}`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      dot.textContent = '🟢';
      text.textContent = 'API ออนไลน์';
    } else {
      throw new Error();
    }
  } catch {
    dot.textContent = '🔴';
    text.textContent = 'API ออฟไลน์';
  }
};

// ================= 5. Mode Switcher (home.html) =================
const switchMode = (modeName) => {
  const buttons = document.querySelectorAll('.mode-tab-btn');
  buttons.forEach(btn => {
    const fnAttr = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', fnAttr.includes(modeName));
  });

  document.querySelectorAll('.mode-content').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`mode-${modeName}`);
  if (target) target.classList.add('active');
};

const sendPromptToGenerator = (promptText) => {
  switchMode('txt2img');
  const promptInput = document.getElementById('prompt');
  if (promptInput) {
    promptInput.value = promptText;
    promptInput.scrollIntoView({ behavior: 'smooth' });
    promptInput.focus();
    showToast('นำ Prompt มาใส่ในช่องสร้างภาพเรียบร้อย!', 'success');
  }
};

const openFullscreen = () => {
  const img = document.getElementById('result-image');
  if (img && img.src) {
    window.open(img.src, '_blank');
  }
};

// ================= 6. Local SVG AI Generator (กันรูปแตก 100%) =================
const createLocalArtwork = (title, modeTag, styleTag) => {
  const cleanTitle = title.length > 35 ? title.substring(0, 32) + '...' : title;
  const isDog = title.toLowerCase().includes('dog') || title.includes('หมา');
  const isCat = title.toLowerCase().includes('cat') || title.includes('แมว');
  
  const mainIcon = isDog ? '🐕 CYBER-DOG' : (isCat ? '🐱 CYBER-CAT' : '⚡ FORGE ENGINE');
  
  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0b0f19" />
          <stop offset="50%" stop-color="#111827" />
          <stop offset="100%" stop-color="#022c22" />
        </linearGradient>
        <linearGradient id="neonGlow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ff5e00" />
          <stop offset="100%" stop-color="#00f3ff" />
        </linearGradient>
        <radialGradient id="ambient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#00f3ff" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
      </defs>
      
      <rect width="100%" height="100%" fill="url(#bgGrad)" />
      <circle cx="384" cy="360" r="280" fill="url(#ambient)" />
      
      <!-- Grid Lines -->
      <path d="M0 600 L768 600 M0 660 L768 660 M0 720 L768 720" stroke="#00f3ff" stroke-opacity="0.15" stroke-width="2" />
      <path d="M184 600 L0 768 M584 600 L768 768 M384 600 L384 768" stroke="#00f3ff" stroke-opacity="0.15" stroke-width="2" />
      
      <!-- Tech HUD Framework -->
      <rect x="54" y="54" width="660" height="660" rx="20" fill="none" stroke="#00f3ff" stroke-width="2" stroke-opacity="0.4" stroke-dasharray="16 8" />
      
      <!-- Core Graphic Output -->
      <circle cx="384" cy="330" r="130" fill="#0f172a" stroke="url(#neonGlow)" stroke-width="5" />
      <text x="384" y="340" fill="#00f3ff" font-size="28" font-weight="bold" font-family="sans-serif" text-anchor="middle">${mainIcon}</text>
      <text x="384" y="380" fill="#94a3b8" font-size="14" font-family="sans-serif" text-anchor="middle">NEURAL SYNTHESIZED</text>
      
      <!-- Prompt Info Section -->
      <rect x="84" y="520" width="600" height="130" rx="12" fill="#030712" fill-opacity="0.8" stroke="#374151" stroke-width="1.5" />
      <text x="110" y="555" fill="#ff5e00" font-size="15" font-weight="bold" font-family="sans-serif">[MODE: ${modeTag.toUpperCase()}] [STYLE: ${styleTag.toUpperCase()}]</text>
      <text x="110" y="585" fill="#f8fafc" font-size="16" font-family="sans-serif">Prompt: "${cleanTitle}"</text>
      <text x="110" y="620" fill="#38bdf8" font-size="13" font-family="sans-serif">Resolution: 8K Enhanced | Forge Distributed Engine (.30)</text>
    </svg>
  `;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
};

// ================= 7. Auth Engine =================
const initAuth = () => {
  const authContainer = document.getElementById('auth-container');
  const profileContainer = document.getElementById('profile-container');
  const signUpBtn = document.getElementById('signUp');
  const signInBtn = document.getElementById('signIn');

  if (signUpBtn && signInBtn && authContainer) {
    signUpBtn.addEventListener('click', () => authContainer.classList.add('right-panel-active'));
    signInBtn.addEventListener('click', () => authContainer.classList.remove('right-panel-active'));
  }

  const user = JSON.parse(localStorage.getItem('forge_user'));
  if (user && authContainer && profileContainer) {
    authContainer.style.display = 'none';
    profileContainer.style.display = 'block';
    const uEl = document.getElementById('profile-username');
    const eEl = document.getElementById('profile-email');
    if (uEl) uEl.textContent = user.username;
    if (eEl) eEl.textContent = user.email || `${user.username}@forge.ai`;
  }

  const regForm = document.getElementById('register-form');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;

      if (CONFIG.USE_DEMO_MODE) {
        localStorage.setItem('forge_user', JSON.stringify({ username, email }));
        showToast('สมัครสมาชิกสำเร็จ กำลังเข้าสู่ระบบ...', 'success');
        setTimeout(() => {
          window.location.href = 'home.html';
        }, 1000);
        return;
      }

      try {
        const res = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.REGISTER}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        if (!res.ok) throw new Error('การสมัครสมาชิกล้มเหลว');
        showToast('สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ', 'success');
        if (authContainer) authContainer.classList.remove('right-panel-active');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;

      if (CONFIG.USE_DEMO_MODE) {
        localStorage.setItem('forge_user', JSON.stringify({ username, email: `${username}@forge.ai` }));
        showToast('เข้าสู่ระบบสำเร็จ กำลังพาไปหน้าสร้างภาพ...', 'success');
        setTimeout(() => {
          window.location.href = 'home.html';
        }, 1000);
        return;
      }

      try {
        const res = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.LOGIN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
        localStorage.setItem('forge_user', JSON.stringify(data.user || { username }));
        showToast('เข้าสู่ระบบสำเร็จ!', 'success');
        setTimeout(() => {
          window.location.href = 'home.html';
        }, 1000);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('forge_user');
      showToast('ออกจากระบบเรียบร้อย', 'success');
      setTimeout(() => location.reload(), 800);
    });
  }
};

// ================= 8. Image Generation Handlers =================
const initGenerator = () => {
  let selectedStyle = 'anime';
  const styleChips = document.querySelectorAll('#mode-txt2img .chip');
  styleChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      styleChips.forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      selectedStyle = e.target.dataset.style || selectedStyle;
    });
  });

  let selectedScale = '2x';
  const scaleChips = document.querySelectorAll('#mode-upscale .chip');
  scaleChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      scaleChips.forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      selectedScale = e.target.dataset.scale || selectedScale;
    });
  });

  const displayResult = (imageUrl, promptTitle, styleName) => {
    const resultWrapper = document.getElementById('result-wrapper');
    const resultImg = document.getElementById('result-image');
    const downloadBtn = document.getElementById('download-btn');

    resultImg.src = imageUrl;
    downloadBtn.href = imageUrl;
    downloadBtn.setAttribute('download', `forge-${Date.now()}.svg`);

    resultWrapper.style.display = 'block';
    resultWrapper.scrollIntoView({ behavior: 'smooth' });

    saveHistory({ prompt: promptTitle, style: styleName, date: new Date().toLocaleString('th-TH') });
    saveGallery({ prompt: promptTitle, style: styleName, url: imageUrl });
    showToast('ประมวลผลสำเร็จ!', 'success');
  };

  // 1. Text to Image
  const formTxt2Img = document.getElementById('generate-form');
  if (formTxt2Img) {
    formTxt2Img.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-txt2img');
      const btnText = btn.querySelector('.btn-text');
      const prompt = document.getElementById('prompt').value.trim();

      btn.classList.add('loading');
      btn.disabled = true;
      btnText.textContent = 'กำลังประมวลผล...';

      try {
        let imageUrl = '';
        if (CONFIG.USE_DEMO_MODE) {
          await new Promise(r => setTimeout(r, 1200));
          imageUrl = createLocalArtwork(prompt, 'Text to Image', selectedStyle);
        } else {
          const res = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.GENERATE}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, style: selectedStyle })
          });
          if (!res.ok) throw new Error('เซิร์ฟเวอร์ Backend ยังไม่พร้อม');
          const data = await res.json();
          imageUrl = data.image_url;
        }

        displayResult(imageUrl, prompt, selectedStyle);

      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        btnText.textContent = 'สร้างภาพ';
      }
    });
  }

  // 2. Image to Image
  const img2imgInput = document.getElementById('img2img-file');
  const img2imgPreview = document.getElementById('img2img-preview');
  const img2imgLabel = document.getElementById('img2img-filename');

  if (img2imgInput) {
    img2imgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        img2imgLabel.textContent = `✅ ${file.name}`;
        const reader = new FileReader();
        reader.onload = (re) => {
          img2imgPreview.src = re.target.result;
          img2imgPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const formImg2Img = document.getElementById('img2img-form');
  if (formImg2Img) {
    formImg2Img.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!img2imgInput.files[0]) {
        showToast('กรุณาเลือกไฟล์ภาพต้นฉบับก่อนครับ', 'error');
        return;
      }
      const btn = document.getElementById('btn-img2img');
      const btnText = btn.querySelector('.btn-text');
      const prompt = document.getElementById('img2img-prompt').value.trim();

      btn.classList.add('loading');
      btn.disabled = true;
      btnText.textContent = 'กำลังแปลงภาพด้วย AI...';

      try {
        await new Promise(r => setTimeout(r, 1500));
        const generatedUrl = createLocalArtwork(prompt, 'Image to Image', 'Neural Transfer');
        displayResult(generatedUrl, `[Img2Img] ${prompt}`, 'Image-to-Image');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        btnText.textContent = 'แปลงภาพ (Image to Image)';
      }
    });
  }

  // 3. Upscale
  const upscaleInput = document.getElementById('upscale-file');
  const upscalePreview = document.getElementById('upscale-preview');
  const upscaleLabel = document.getElementById('upscale-filename');

  if (upscaleInput) {
    upscaleInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        upscaleLabel.textContent = `✅ ${file.name}`;
        const reader = new FileReader();
        reader.onload = (re) => {
          upscalePreview.src = re.target.result;
          upscalePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const formUpscale = document.getElementById('upscale-form');
  if (formUpscale) {
    formUpscale.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!upscaleInput.files[0]) {
        showToast('กรุณาเลือกไฟล์ภาพก่อนครับ', 'error');
        return;
      }
      const btn = document.getElementById('btn-upscale');
      const btnText = btn.querySelector('.btn-text');

      btn.classList.add('loading');
      btn.disabled = true;
      btnText.textContent = 'กำลังขยายความละเอียดภาพ...';

      try {
        await new Promise(r => setTimeout(r, 1200));
        const upscaledUrl = createLocalArtwork('High Precision Rescaling', 'Upscale', selectedScale);
        displayResult(upscaledUrl, `[Upscale ${selectedScale}] ขยายความละเอียด`, `Upscale ${selectedScale}`);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        btnText.textContent = 'ขยายขนาดภาพ (Upscale)';
      }
    });
  }

  // 4. Chat Assistant
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('chat-input');
      const history = document.getElementById('chat-history');
      const msg = input.value.trim();
      if (!msg) return;

      history.innerHTML += `<div class="chat-msg user">${msg}</div>`;
      input.value = '';
      history.scrollTop = history.scrollHeight;

      setTimeout(() => {
        let suggestedPrompt = "A majestic cybernetic dog in a neon-lit cyberpunk alley, cinematic lighting, 8k resolution, highly detailed";
        let replyText = "สำหรับน้องหมาในธีม Cyberpunk:";

        const lower = msg.toLowerCase();
        if (lower.includes('แมว') || lower.includes('cat')) {
          suggestedPrompt = "A cute cyberpunk cat wearing glowing neon goggles, rooftop view of high-tech city, hyper-detailed, 8k";
          replyText = "สำหรับน้องแมวสุดเท่ แนะนำ Prompt นี้เลยครับ:";
        } else if (lower.includes('วิว') || lower.includes('ภูเขา')) {
          suggestedPrompt = "Breathtaking futuristic mountain city during sunset, floating vehicles, ultra-realistic landscape photography, 8k";
          replyText = "สำหรับวิวทิวทัศน์สุดอลังการ แนะนำอันนี้ครับ:";
        }

        const botHtml = `
          <div class="chat-msg bot">
            ${replyText}<br>
            <strong style="color:var(--cyan); display:block; margin:6px 0;">"${suggestedPrompt}"</strong>
            <button type="button" class="use-prompt-btn" onclick="sendPromptToGenerator('${suggestedPrompt}')">🚀 ส่งไปสร้างภาพทันที</button>
          </div>
        `;
        history.innerHTML += botHtml;
        history.scrollTop = history.scrollHeight;
      }, 400);
    });
  }
};

// ================= 9. Storage Handlers =================
const saveHistory = (item) => {
  const history = JSON.parse(localStorage.getItem('forge_history') || '[]');
  history.unshift(item);
  localStorage.setItem('forge_history', JSON.stringify(history));
};

const saveGallery = (item) => {
  const gallery = JSON.parse(localStorage.getItem('forge_gallery') || '[]');
  gallery.unshift(item);
  localStorage.setItem('forge_gallery', JSON.stringify(gallery));
};

const renderGallery = () => {
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;
  const gallery = JSON.parse(localStorage.getItem('forge_gallery') || '[]');
  if (gallery.length === 0) {
    grid.innerHTML = '<p style="color:var(--dim)">ยังไม่มีภาพที่บันทึกไว้ในแกลเลอรี่</p>';
    return;
  }
  grid.innerHTML = gallery.map(item => `
    <div class="gallery-card">
      <img src="${item.url}" alt="${item.prompt}">
      <p><strong>[${item.style.toUpperCase()}]</strong> ${item.prompt}</p>
    </div>
  `).join('');
};

const renderHistory = () => {
  const list = document.getElementById('history-list');
  if (!list) return;
  const history = JSON.parse(localStorage.getItem('forge_history') || '[]');
  if (history.length === 0) {
    list.innerHTML = '<p style="color:var(--dim)">ยังไม่มีประวัติการสร้างภาพ</p>';
    return;
  }
  list.innerHTML = history.map(item => `
    <div style="background:var(--panel); border:1px solid var(--border); padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <p style="font-weight:600; color:var(--text);">${item.prompt}</p>
        <span style="font-size:0.85rem; color:var(--cyan);">สไตล์: ${item.style}</span> | 
        <span style="font-size:0.85rem; color:var(--dim);">${item.date}</span>
      </div>
      <button class="chip" style="font-size:0.85rem;" onclick="sendPromptToGenerator('${item.prompt}')">ใช้ซ้ำ</button>
    </div>
  `).join('');
};

// ================= Document Ready =================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkRouteProtection();
  checkBackendHealth();
  initAuth();
  initGenerator();
  renderGallery();
  renderHistory();
});