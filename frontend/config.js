const CONFIG = {
  // สวิตช์หลัก: true = พรีเซนต์ได้ทันทีไม่ต้องง้อ Backend, false = ยิง Flask จริง
  USE_DEMO_MODE: true,

  // Base URL ของ Nginx Reverse Proxy
  API_BASE_URL: '/api',

  ENDPOINTS: {
    HEALTH: '/health',
    LOGIN: '/login',
    REGISTER: '/register',
    GENERATE: '/generate'
  }
};