/**
 * Analitika hisoblarini sintetik ma'lumot bilan tekshirish (bazasiz).
 *   node tests/calc.test.mjs
 */
import assert from "node:assert/strict";
import { buildContext, computeAll, lessonsIn, attAgg } from "../superadmin/calc.js";
import { parseRange, prevRange, dayStartUtc, addDays } from "../superadmin/util.js";
import { toCsv, toXlsx, toPdf } from "../superadmin/exporters.js";
import { verifyTotp, totpNow, base32Encode } from "../security/totp.js";

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log("✅", name);
};

// Oktabr 2026: dushanba/chorshanba/juma darslar
const D = {
  groups: [{ id: 1, name: "G1", days: ["Du", "Ch", "Ju"], startDate: "2026-09-01", mentorId: 7, status: "Faol" }, { id: 2, name: "G2", days: [], mentorId: 7 }],
  mentors: [{ id: 7, name: "Ali" }],
  students: [
    { id: 11, name: "A", groupId: 1, status: "Aktiv", joinDate: "2026-10-05" },
    { id: 12, name: "B", groupId: 1, status: "Aktiv", joinDate: "2026-09-01" },
    { id: 13, name: "C", groupId: 2, status: "Faolsiz" },
  ],
  attendance: {
    // 2026-10: 1-okt payshanba → Ju 2, Du 5, Ch 7, Ju 9 … → l1=2-okt, l2=5-okt, l3=7-okt, l4=9-okt
    att_1_2026_9: { s11: { l1: "K", l2: "Y", l3: "K" }, s12: { l1: "K", l2: "S" } },
    // G2 — jadvalsiz, bitta belgilangan dars (sanasi noma'lum)
    att_2_2026_9: { s13: { l1: "Y" } },
  },
  simpleGrades: {
    11: [{ id: "g1", score: 80, date: "2026-10-06T10:00:00Z" }, { id: "g1", score: 80, date: "2026-10-06T10:00:00Z" }, { id: "g2", score: 60, date: "2026-10-08T10:00:00Z" }],
    12: [{ id: "g3", score: 90, date: "2026-09-25T10:00:00Z" }, { id: "g4", score: 10, date: "2026-09-20T10:00:00Z" }],
  },
  testResults: { 5: { 11: { score: 70, completedAt: "2026-10-07T09:00:00Z" } } },
  tests: [{ id: 5, title: "T" }],
};
const TZ = "Asia/Tashkent";
const R = { key: "custom", from: "2026-10-01", to: "2026-10-10", days: 10, label: "" };
const ctx = buildContext(D, new Map([["1_2026_9_1", { firstMarkedAt: "2026-10-03T12:00:00Z" }], ["1_2026_9_2", { firstMarkedAt: "2026-10-08T12:00:00Z" }]]), TZ, "2026-10-10");

t("Jadval bo'yicha dars sanalari to'g'ri", () => {
  const L = lessonsIn(ctx, R).filter((x) => x.gid === "1");
  assert.deepEqual(L.map((x) => x.day), ["2026-10-02", "2026-10-05", "2026-10-07", "2026-10-09"]);
  assert.equal(L.filter((x) => x.held).length, 3);
  assert.equal(L.filter((x) => x.planned && x.past && !x.held).length, 1); // 9-okt belgilanmagan
});
t("Davomat = K/(K+Y+S), S qatnashmagan deb sanaladi", () => {
  const a = attAgg(lessonsIn(ctx, R).filter((x) => x.gid === "1"));
  assert.deepEqual([a.K, a.Y, a.S, a.marked, a.pct], [3, 1, 1, 5, 60]);
});
t("Jadvalsiz guruhdagi belgilangan dars 'sanasi noma'lum' sifatida", () => {
  const L = lessonsIn(ctx, R).filter((x) => x.gid === "2");
  assert.equal(L.length, 1);
  assert.equal(L[0].undated, true);
});
t("Takroriy baho ikki marta hisoblanmaydi", () => {
  assert.equal(ctx.grades.filter((g) => g.sid === "11").length, 2);
});
const all = computeAll(ctx, R, prevRange(R), { weights: { attendance: 30, marking: 20, ontime: 10, trend: 20, grading: 10, stability: 10 }, minMarks: 10, minMarksHigh: 30 });
t("Davrdagi o'rtacha baho (takrorsiz)", () => assert.equal(all.grades.avg, 70));
t("Ma'lumot yo'q → null (nol emas)", () => {
  assert.equal(all.prevAtt.pct, null);
  assert.equal(all.grades.prevAvg, 90); // 25-sentabr oldingi davrda (21–30), 20-sentabr — tashqarida
});
t("Yangi o'quvchilar davr bo'yicha", () => assert.equal(all.students.newInPeriod, 1));
t("Kam ma'lumot — o'qituvchi reytingga kiritilmaydi", () => {
  assert.equal(all.teachers[0].score, null);
  assert.equal(all.teachers[0].confidence, "none");
});
t("O'z vaqtida belgilash: 2-okt dars 3-okt da (ertasi) — ha; 5-okt dars 8-okt da — yo'q", () => {
  const L = lessonsIn(ctx, R).filter((x) => x.gid === "1");
  assert.equal(L[0].onTime, true);
  assert.equal(L[1].onTime, false);
  assert.equal(L[1].lateDays, 3);
  assert.equal(L[2].onTime, null); // jurnalda yozuv yo'q — hisoblanmaydi
});
t("Oldingi davr bir xil uzunlikda", () => {
  const p = prevRange(parseRange({ period: "30" }, TZ));
  assert.equal(p.days, 30);
});
t("Mintaqadagi kun boshi (Toshkent = UTC+5)", () => assert.equal(dayStartUtc("2026-10-10", TZ).toISOString(), "2026-10-09T19:00:00.000Z"));
t("addDays oy/yil chegarasidan o'tadi", () => assert.equal(addDays("2026-12-31", 1), "2027-01-01"));
const rep = { title: "T", period: "p", source: "s", method: "m", generatedAt: "now", columns: ["A", "B"], rows: [["=cmd()", 1.5], ["x", null]] };
t("CSV: formula in'ektsiyasi zararsizlantiriladi", () => assert.ok(toCsv(rep).toString("utf8").includes("'=cmd()")));
t("XLSX: ZIP imzosi", () => assert.equal(toXlsx(rep).slice(0, 2).toString("latin1"), "PK"));
t("PDF: imzo va oxiri", () => {
  const b = toPdf(rep);
  assert.equal(b.slice(0, 5).toString(), "%PDF-");
  assert.ok(b.slice(-7).toString().includes("%%EOF"));
});
t("TOTP: RFC 6238 vektori va qayta ishlatishni to'sish", () => {
  const sec = base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(totpNow(sec, 59000), "287082");
  const step = verifyTotp(sec, totpNow(sec));
  assert.notEqual(step, null);
  assert.equal(verifyTotp(sec, totpNow(sec), step), null);
});
console.log(`\n${n} ta test o'tdi`);
