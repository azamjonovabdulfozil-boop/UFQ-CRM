// Coin va xarid qoidalari: hech kim coin «yarata» olmasin
import assert from "node:assert/strict";
import { checkCoinWrite, checkPurchaseWrite, canWriteKvKey } from "../security/policy.js";
const ROLES = { ADMIN: "admin", MENTOR: "mentor", STUDENT: "student" };

const student = { role: ROLES.STUDENT, studentId: 5 };
const mentor = { role: ROLES.MENTOR, mentorName: "Ali" };
const admin = { role: ROLES.ADMIN };
const prev = { s_5: 100, s_6: 50, m_Ali: 200, mg_Ali_3: 80, mg_Ali_B_4: 70, m_Vali: 300 };
const w = (u, change) => checkCoinWrite(u, { ...prev, ...change }, prev).ok;

// Talaba
assert.equal(w(student, { s_5: 1000000 }), false, "talaba o'ziga coin yoza olmaydi");
assert.equal(w(student, { s_5: 90 }), false, "talaba balansni ham o'zi kamaytirmaydi (xarid serverda)");
assert.equal(w(student, {}), true, "o'zgarishsiz yozuv — ruxsat");
assert.equal(canWriteKvKey(ROLES.STUDENT, "edu_mentor_coins_v1", student).ok, false, "coin kaliti talabaga yopiq");
assert.equal(canWriteKvKey(ROLES.STUDENT, "edu_purchases_v1", student).ok, false, "xaridlar kaliti talabaga yopiq");

// Mentor
assert.equal(w(mentor, { mg_Ali_3: 60, s_5: 120 }), true, "guruh byudjetidan talabaga berish");
assert.equal(w(mentor, { mg_Ali_3: 100, s_5: 80 }), true, "talabadan qaytarib olish");
assert.equal(w(mentor, { s_5: 500 }), false, "o'z balansidan yechmasdan berish — coin yaratish");
assert.equal(w(mentor, { mg_Ali_3: 5000 }), false, "o'z byudjetini oshirish");
assert.equal(w(mentor, { m_Vali: 0, s_5: 400 }), false, "boshqa mentordan olish");
assert.equal(w(mentor, { mg_Ali_B_4: 0, s_5: 170 }), false, "nomi o'xshash boshqa mentor (Ali_B) byudjeti");

// Admin
assert.equal(w(admin, { s_5: 9999 }), true, "admin hamma narsani o'zgartiradi");

// Xaridlar
const p0 = [{ id: "b1", studentId: 5, coinPrice: 10, approved: false }];
assert.equal(checkPurchaseWrite(student, [...p0, { id: "b2", studentId: 5, coinPrice: 99999 }], p0).ok, false, "soxta xarid");
assert.equal(checkPurchaseWrite(student, [{ ...p0[0], approved: true }], p0).ok, false, "o'zi tasdiqlash");
assert.equal(checkPurchaseWrite(mentor, [{ ...p0[0], rejected: true }], p0).ok, false, "mentor rad eta olmaydi");
assert.equal(checkPurchaseWrite(admin, [{ ...p0[0], approved: true }], p0).ok, true, "admin tasdiqlaydi");
assert.equal(checkPurchaseWrite(student, p0, p0).ok, true, "o'zgarishsiz — ruxsat");

console.log("✅ Coin va xarid qoidalari: coin yaratib bo'lmaydi");
