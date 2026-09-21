// ===================================
// validators.js
// ฟังก์ชันตรวจสอบข้อมูลแบบ pure function ที่ใช้ร่วมกันทั้งระบบ
// ไม่มีการอ่าน DOM, storage หรือเรียก network จึงทดสอบซ้ำได้ง่าย
// ===================================

// ----- ส่วนที่ 1: ตรวจสอบค่าพื้นฐาน -----

/**
 * ตรวจสอบรูปแบบอีเมลว่าถูกต้องหรือไม่
 * @param {string} email - อีเมลที่ต้องการตรวจสอบ
 * @returns {boolean} true หากรูปแบบถูกต้อง
 */
export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

/**
 * ตรวจสอบว่าฟิลด์มีค่าที่ไม่ใช่ช่องว่างหรือไม่
 * @param {unknown} value - ค่าที่ต้องการตรวจสอบ
 * @returns {boolean} true หากมีข้อมูล
 */
export function validateRequired(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

// ----- ส่วนที่ 2: ตรวจสอบข้อมูลบัญชี -----

/**
 * ตรวจสอบความยาวขั้นต่ำของรหัสผ่าน
 * @param {string} password - รหัสผ่าน
 * @param {number} minimumLength - จำนวนตัวอักษรขั้นต่ำ
 * @returns {boolean} true หากผ่านเงื่อนไข
 */
export function validatePassword(password, minimumLength = 6) {
  return typeof password === 'string' && password.length >= minimumLength;
}

/**
 * ตรวจสอบว่ารหัสผ่านสองช่องตรงกัน
 * @param {string} password - รหัสผ่านหลัก
 * @param {string} confirmation - รหัสผ่านยืนยัน
 * @returns {boolean} true หากตรงกันและไม่ว่าง
 */
export function validatePasswordMatch(password, confirmation) {
  return validateRequired(password) && password === confirmation;
}

/**
 * ตรวจสอบชื่อผู้ใช้ตามความยาวขั้นต่ำ
 * @param {string} username - ชื่อผู้ใช้
 * @param {number} minimumLength - จำนวนตัวอักษรขั้นต่ำ
 * @returns {boolean} true หากผ่านเงื่อนไข
 */
export function validateUsername(username, minimumLength = 3) {
  return typeof username === 'string' && username.trim().length >= minimumLength;
}
