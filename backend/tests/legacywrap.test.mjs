// Eski (sha256) parol scrypt ichiga o'ralganda ham o'sha parol bilan kirish ishlashi kerak
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, sha256 } from "../security/crypto.js";

const pw = "Talaba-1234";
const legacy = sha256(pw); // bazadagi eski ko'rinish
const wrapped = await hashPassword(legacy); // wrapLegacyHashes() natijasi
assert.equal(await verifyPassword(sha256(pw), wrapped), true, "to'g'ri parol qabul qilinadi");
assert.equal(await verifyPassword(sha256("boshqa"), wrapped), false, "noto'g'ri parol rad etiladi");
assert.equal(await verifyPassword(pw, wrapped), false, "ochiq parol o'ralgan xeshga to'g'ridan mos kelmaydi");
console.log("✅ eski parol o'ralgandan keyin ham ishlaydi, noto'g'risi rad etiladi");
