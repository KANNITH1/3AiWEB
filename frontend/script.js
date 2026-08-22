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

// ================= 2. Toast Notification System =================
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
    setTimeout(() => { toast.remove(); }, 4000); // หายไปเองใน 4 วิ
};

// ================= 3. Image Generator System (home.html) =================
const initGenerator = () => {
    const form = document.getElementById('generate-form');
    if (!form) return;

    let selectedStyle = 'realistic';
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            chips.forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            selectedStyle = e.target.dataset.style;
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('.btn-primary');
        const btnText = btn.querySelector('.btn-text');
        const prompt = document.getElementById('prompt').value;
        const resultWrapper = document.getElementById('result-wrapper');
        const resultImg = document.getElementById('result-image');

        // Loading State
        btn.classList.add('loading');
        btn.disabled = true;
        btnText.textContent = 'กำลังประมวลผล (Distributed System)...';
        
        try {
            // ยิง Request ไป Nginx
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, style: selectedStyle })
            });
            
            if (!res.ok) throw new Error("Backend ยังไม่พร้อมทำงาน (รอเพื่อนเปิด Server)");
            
            const data = await res.json();
            
            // Success State
            resultImg.src = data.image_url;
            resultWrapper.style.display = 'block';
            showToast('สร้างภาพเสร็จสมบูรณ์!', 'success');
            
            // Save to LocalStorage
            saveToGallery({ prompt, style: selectedStyle, url: data.image_url });

        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            // Reset Button
            btn.classList.remove('loading');
            btn.disabled = false;
            btnText.textContent = 'สร้างภาพ';
        }
    });
};

// ================= 4. Data Management =================
const saveToGallery = (item) => {
    const gallery = JSON.parse(localStorage.getItem('forge_gallery') || '[]');
    gallery.unshift(item);
    localStorage.setItem('forge_gallery', JSON.stringify(gallery));
};

const renderGallery = () => {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    const gallery = JSON.parse(localStorage.getItem('forge_gallery') || '[]');
    
    if (gallery.length === 0) {
        grid.innerHTML = '<p style="color:var(--dim)">ยังไม่มีภาพในระบบ...</p>';
        return;
    }
    
    grid.innerHTML = gallery.map(item => `
        <div class="gallery-card">
            <img src="${item.url}" alt="${item.prompt}">
            <p><strong>[${item.style.toUpperCase()}]</strong> ${item.prompt}</p>
        </div>
    `).join('');
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initGenerator();
    renderGallery();
});