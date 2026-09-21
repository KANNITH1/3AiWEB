// ===================================
// validators.test.js
// ชุดทดสอบแบบง่ายสำหรับฟังก์ชัน validation โดยไม่ใช้ testing framework
// ===================================
import { validateEmail, validatePassword, validatePasswordMatch, validateRequired, validateUsername } from './validators.js';

const cases = [
  ['validateEmail accepts a valid email', validateEmail('test@test.com'), true],
  ['validateEmail rejects an invalid email', validateEmail('invalid'), false],
  ['validateEmail rejects a blank value', validateEmail(''), false],
  ['validatePassword accepts six characters', validatePassword('123456'), true],
  ['validatePassword rejects a short password', validatePassword('12345'), false],
  ['validatePasswordMatch accepts matching passwords', validatePasswordMatch('secret1', 'secret1'), true],
  ['validatePasswordMatch rejects different passwords', validatePasswordMatch('secret1', 'secret2'), false],
  ['validateRequired accepts text', validateRequired('Forge AI'), true],
  ['validateRequired rejects whitespace', validateRequired('   '), false],
  ['validateUsername accepts three characters', validateUsername('abc'), true],
  ['validateUsername rejects a short name', validateUsername('ab'), false]
];

const failed = cases.filter(([, actual, expected]) => actual !== expected);
const passed = cases.length - failed.length;
console.log(`ผ่าน ${passed}/${cases.length} เคส`);
failed.forEach(([name, actual, expected]) => console.error(`ไม่ผ่าน: ${name} (ได้ ${actual}, คาดหวัง ${expected})`));
if (failed.length > 0) process.exitCode = 1;
