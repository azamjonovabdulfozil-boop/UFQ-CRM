/**
 * superadmin/crmActions.js — admin CRM'da NIMA qilgani (har bir amal alohida).
 *
 * CRM har saqlashda butun ma'lumotni yuboradi. Server oldingi va yangi
 * holatni solishtirib, har bir o'zgarishni oddiy gapga aylantiradi:
 *
 *   «FE-12 guruhini ochdi (Frontend, mentor: Aziz)»
 *   «Ali Valiyevni FE-12 guruhiga qo'shdi»
 *   «Ali Valiyevdan to'lov oldi — 500 000 so'm (FE-12)»
 *   «Ali Valiyevni FE-12 → FE-14 guruhiga o'tkazdi»
 *
 * Bu yozuvlar faqat Super Admin'ga ko'rinadi (faoliyat tarixi). Shu yerda
 * yana: o'chirilgan yozuvlar savatga (trash) ajratiladi va moliya Excel
 * hisoboti quriladi.
 */
import { attendanceLessons } from "./changes.js";

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const MAX_ACTIONS = 80;

const arr = (v) => (Array.isArray(v) ? v : []);
const byId = (list) => new Map(arr(list).filter((x) => x && x.id != null).map((x) => [String(x.id), x]));
const clip = (s, n = 80) => String(s == null ? "" : s).slice(0, n);
const nameOf = (x) =>
  clip(
    (x && (x.name || (x.firstName ? x.firstName + (x.lastName ? " " + x.lastName : "") : "") || x.title)) || (x && x.id != null ? "#" + x.id : ""),
    80,
  ).split(" — ")[0];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const fmtMoney = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// Tahrir xabarida ko'rsatiladigan maydon nomlari
const FIELD = {
  name: "ism", firstName: "ism", lastName: "familiya", phone: "telefon", phone2: "qo'shimcha telefon", parentPhone: "ota-ona telefoni",
  parentName: "ota-ona ismi", birthDate: "tug'ilgan sana", address: "manzil", source: "manba", joinDate: "qo'shilgan sana",
  status: "holat", discount: "chegirma", note: "izoh", notes: "izoh", course: "kurs", courseId: "kurs", mentor: "mentor",
  mentorId: "mentor", days: "dars kunlari", timeStart: "dars vaqti", timeEnd: "tugash vaqti", room: "xona", startDate: "boshlanish sanasi",
  price: "narx", duration: "davomiylik", title: "nomi", amount: "summa", date: "sana", description: "tavsif", salary: "oylik",
  telegramChatId: "Telegram guruhi", photo: "rasm",
};
// Avtomatik hisoblanadigan yoki ichki maydonlar — admin amali sifatida ko'rsatilmaydi
const NOISE = new Set(["updatedAt", "createdAt", "_updatedAt", "studentCount", "students", "count", "isDebtor", "groupHistory", "createdBy", "createdByLogin", "period"]);

/** Bitta amal yozuvi. cat: groups | students | finance | attendance | grades | mentors | courses | other */
const act = (cat, type, text, extra = {}) => ({ cat, type, text: clip(text, 300), ...extra });

/**
 * @param {object} prev  oldingi crm_data
 * @param {object} next  yangi (saqlanayotgan) ma'lumot
 * @returns {Array<{cat,type,text,amount?,at?}>}
 */
export function describeCrmActions(prev, next) {
  const p = prev || {};
  const n = next || {};
  const out = [];
  const push = (a) => {
    if (out.length < MAX_ACTIONS) out.push(a);
  };

  const groupsNow = byId(n.groups || p.groups);
  const groupsBefore = byId(p.groups);
  const gName = (gid) => {
    if (gid == null || gid === "") return "";
    const g = groupsNow.get(String(gid)) || groupsBefore.get(String(gid));
    return g ? clip(g.name, 40) : "#" + gid;
  };
  const studentsNow = byId(n.students || p.students);
  const studentsBefore = byId(p.students);
  const sName = (sid) => {
    const s = studentsNow.get(String(sid)) || studentsBefore.get(String(sid));
    return s ? nameOf(s) : "#" + sid;
  };
  const mentorsAll = new Map([...byId(p.mentors), ...byId(n.mentors)]);
  const mName = (mid) => (mid != null && mentorsAll.get(String(mid)) ? nameOf(mentorsAll.get(String(mid))) : "");

  // ── Guruhlar ────────────────────────────────────────────────────────────
  if ("groups" in n) {
    const A = groupsBefore, B = byId(n.groups);
    for (const [id, g] of B) {
      if (!A.has(id)) {
        const bits = [g.course, mName(g.mentorId) || g.mentor ? "mentor: " + (mName(g.mentorId) || g.mentor) : "", g.timeStart ? g.timeStart + (g.timeEnd ? "–" + g.timeEnd : "") : ""].filter(Boolean);
        push(act("groups", "group.add", `«${clip(g.name, 40)}» guruhini ochdi${bits.length ? " (" + bits.join(", ") + ")" : ""}`, { groupId: id }));
      } else {
        const old = A.get(id);
        const f = changedFields(old, g);
        if (!f.length) continue;
        const parts = f.map((k) => {
          if (k === "mentorId" || k === "mentor") return `mentor: ${mName(old.mentorId) || old.mentor || "—"} → ${mName(g.mentorId) || g.mentor || "—"}`;
          if (k === "status") return `holat: ${old.status || "—"} → ${g.status || "—"}`;
          if (k === "name") return `nomi: ${clip(old.name, 30)} → ${clip(g.name, 30)}`;
          return FIELD[k] || null;
        });
        push(act("groups", "group.edit", `«${clip(g.name, 40)}» guruhini tahrirladi — ${uniq(parts).join(", ") || "ma'lumotlari"}`, { groupId: id }));
      }
    }
    for (const [id, g] of A) if (!B.has(id)) push(act("groups", "group.delete", `«${clip(g.name, 40)}» guruhini o'chirdi`, { groupId: id, deleted: true }));
  }

  // ── Talabalar ───────────────────────────────────────────────────────────
  if ("students" in n) {
    const A = studentsBefore, B = byId(n.students);
    for (const [id, s] of B) {
      if (!A.has(id)) {
        push(act("students", "student.add", `${nameOf(s)}ni ${s.groupId != null ? `«${gName(s.groupId)}» guruhiga ` : ""}qo'shdi`, { studentId: id }));
        continue;
      }
      const old = A.get(id);
      if (String(old.groupId ?? "") !== String(s.groupId ?? "")) {
        push(
          act("students", "student.move", `${nameOf(s)}ni boshqa guruhga o'tkazdi: «${gName(old.groupId) || "—"}» → «${gName(s.groupId) || "—"}»`, {
            studentId: id,
          }),
        );
      }
      const f = changedFields(old, s).filter((k) => k !== "groupId");
      if (old.isDebtor !== s.isDebtor && f.every((k) => k === "status")) {
        // Davomat/to'lovdan keyin avtomatik o'zgarish
        if (s.isDebtor) push(act("students", "student.debtor", `${nameOf(s)} qarzdor deb belgilandi (oy davomati to'ldi)`, { studentId: id, auto: true }));
        continue;
      }
      if (!f.length) continue;
      const parts = f.map((k) => (k === "status" ? `holat: ${old.status || "—"} → ${s.status || "—"}` : FIELD[k] || null));
      push(act("students", "student.edit", `${nameOf(s)} ma'lumotini o'zgartirdi — ${uniq(parts).join(", ") || "ma'lumotlari"}`, { studentId: id }));
    }
    for (const [id, s] of A)
      if (!B.has(id)) push(act("students", "student.delete", `${nameOf(s)}ni o'chirdi${s.groupId != null ? ` («${gName(s.groupId)}» guruhidan)` : ""}`, { studentId: id, deleted: true }));
  }

  // ── Moliya: to'lovlar, chiqimlar, oyliklar ────────────────────────────────
  if ("finance" in n) {
    const A = byId(p.finance), B = byId(n.finance);
    const who = (tx) => {
      if (tx.studentId != null) {
        const s = studentsNow.get(String(tx.studentId)) || studentsBefore.get(String(tx.studentId));
        return { name: s ? nameOf(s) : nameOf(tx), group: s ? gName(s.groupId) : "" };
      }
      return { name: nameOf(tx), group: "" };
    };
    for (const [id, tx] of B) {
      const amount = Number(tx.amount) || 0;
      if (!A.has(id)) {
        if (tx.type === "income") {
          const w = who(tx);
          const text = tx.studentId != null
            ? `${w.name}dan to'lov oldi — ${fmtMoney(amount)} so'm${w.group ? ` («${w.group}» guruhi)` : ""}`
            : `Kirim qo'shdi: ${clip(tx.title, 60)} — ${fmtMoney(amount)} so'm`;
          push(act("finance", "pay.income", text, { amount, txId: id, txDate: tx.date || null, studentId: tx.studentId ?? null }));
        } else if (tx.type === "salary") {
          push(act("finance", "pay.salary", `Mentor oyligini berdi: ${clip(tx.title, 60).replace(/ — Oylik$/, "")} — ${fmtMoney(amount)} so'm`, { amount, txId: id }));
        } else {
          push(act("finance", "pay.expense", `Chiqim qo'shdi: ${clip(tx.title, 60)} — ${fmtMoney(amount)} so'm`, { amount, txId: id }));
        }
      } else {
        const old = A.get(id);
        // Faqat ma'noli maydonlar: summa, nomi, sana, izoh, talaba
        const f = changedFields(old, tx).filter((k) => ["amount", "title", "date", "description", "studentId", "type"].includes(k));
        if (!f.length) continue;
        const parts = f.map((k) =>
          k === "amount" ? `summa: ${fmtMoney(old.amount)} → ${fmtMoney(tx.amount)} so'm` : k === "studentId" ? "talaba" : FIELD[k] || null,
        );
        push(act("finance", "pay.edit", `To'lov yozuvini o'zgartirdi: ${clip(tx.title, 60)} — ${uniq(parts).join(", ")}`, { txId: id }));
      }
    }
    for (const [id, tx] of A)
      if (!B.has(id))
        push(act("finance", "pay.delete", `To'lov yozuvini o'chirdi: ${clip(tx.title, 60)} — ${fmtMoney(tx.amount)} so'm`, { amount: Number(tx.amount) || 0, txId: id, deleted: true }));
  }

  // ── Mentorlar, kurslar, testlar, sertifikatlar ───────────────────────────
  const simple = [
    ["mentors", "mentors", "mentor", (x) => `mentor ${nameOf(x)}`],
    ["courses", "courses", "course", (x) => `«${nameOf(x)}» kursini`],
    ["tests", "other", "test", (x) => `«${nameOf(x)}» testini`],
    ["certificates", "other", "cert", (x) => `sertifikat (${nameOf(x)})`],
  ];
  for (const [key, cat, t, label] of simple) {
    if (!(key in n)) continue;
    const A = byId(p[key]), B = byId(n[key]);
    for (const [id, x] of B) {
      if (!A.has(id)) push(act(cat, t + ".add", key === "mentors" ? `Yangi mentor qo'shdi: ${nameOf(x)}` : `Yangi ${label(x).replace(/ni$/, "")} qo'shdi`, { itemId: id }));
      else {
        const old = A.get(id);
        const f = changedFields(old, x);
        if (!f.length) continue;
        const parts = f.map((k) => (k === "price" ? `narx: ${fmtMoney(old.price)} → ${fmtMoney(x.price)} so'm` : FIELD[k] || null));
        const what = key === "mentors" ? `${nameOf(x)} (mentor) ma'lumotini` : label(x);
        push(act(cat, t + ".edit", `${cap(what)} o'zgartirdi${uniq(parts).length ? " — " + uniq(parts).join(", ") : ""}`, { itemId: id }));
      }
    }
    for (const [id, x] of A) if (!B.has(id)) push(act(cat, t + ".delete", `${cap(key === "mentors" ? nameOf(x) + " (mentor)ni" : label(x))} o'chirdi`, { itemId: id, deleted: true }));
  }

  // ── Davomat ──────────────────────────────────────────────────────────────
  if ("attendance" in n && n.attendance && typeof n.attendance === "object") {
    const pa = p.attendance || {};
    const keys = [];
    for (const k of new Set([...Object.keys(pa), ...Object.keys(n.attendance)])) if (!same(pa[k], n.attendance[k])) keys.push(k);
    const lessons = attendanceLessons(pa, n.attendance, keys);
    for (const it of lessons.slice(0, 10)) {
      const m = it.marks || {};
      const bits = [m.K ? `${m.K} keldi` : "", m.Y ? `${m.Y} kelmadi` : "", m.S ? `${m.S} sababli` : ""].filter(Boolean);
      push(
        act("attendance", "attendance.mark", `«${gName(it.groupId)}» guruhida davomat qildi: ${MONTHS[(Number(it.month) || 1) - 1] || ""}, ${it.lesson}-dars${bits.length ? " — " + bits.join(", ") : ""}`, {
          groupId: String(it.groupId),
        }),
      );
    }
  }

  // ── Baholar ──────────────────────────────────────────────────────────────
  if ("simpleGrades" in n && n.simpleGrades && typeof n.simpleGrades === "object") {
    const pg = p.simpleGrades || {};
    const ids = [];
    for (const k of new Set([...Object.keys(pg), ...Object.keys(n.simpleGrades)])) if (!same(pg[k], n.simpleGrades[k])) ids.push(k);
    if (ids.length) {
      const names = ids.slice(0, 4).map(sName);
      push(act("grades", "grade.set", `Baho qo'ydi: ${names.join(", ")}${ids.length > 4 ? ` va yana ${ids.length - 4} ta talabaga` : ""}`));
    }
  }
  return out;
}

// CRM ochilganda ma'lumotni o'zi formatlaydi (600000 → "600000", sana
// ko'rinishi) — bu admin amali emas. Ma'nosi bir xil qiymatlar teng hisoblanadi.
function equivalent(x, y) {
  if (same(x, y)) return true;
  if ((x == null || x === "") && (y == null || y === "")) return true;
  const nx = typeof x === "number" || (typeof x === "string" && /^-?\d+(\.\d+)?$/.test(x.trim())) ? Number(x) : NaN;
  const ny = typeof y === "number" || (typeof y === "string" && /^-?\d+(\.\d+)?$/.test(y.trim())) ? Number(y) : NaN;
  if (!isNaN(nx) && !isNaN(ny)) return nx === ny;
  const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(Date.parse(v));
  if (isDate(x) && isDate(y)) return Date.parse(x) === Date.parse(y);
  return false;
}
function changedFields(a, b) {
  const out = [];
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (NOISE.has(k)) continue;
    if (!equivalent((a || {})[k], (b || {})[k])) out.push(k);
  }
  return out;
}
const uniq = (xs) => [...new Set(xs.filter(Boolean))];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ─── Savat (trash) ────────────────────────────────────────────────────────────
export const TRASH_COL = "crm_trash";
export const TRASH_KINDS = {
  students: "Talaba",
  groups: "Guruh",
  mentors: "Mentor",
  courses: "Kurs",
  finance: "To'lov yozuvi",
  tests: "Test",
  certificates: "Sertifikat",
};

/** Saqlashda yo'qolgan (o'chirilgan) yozuvlar: [{kind, item}] */
export function removedItems(prev, next) {
  const out = [];
  if (!prev || !next) return out;
  for (const kind of Object.keys(TRASH_KINDS)) {
    if (!(kind in next) || !Array.isArray(prev[kind])) continue;
    const B = byId(next[kind]);
    for (const x of prev[kind]) if (x && x.id != null && !B.has(String(x.id))) out.push({ kind, item: x });
  }
  return out;
}

/** Savatdagi yozuvni ko'rsatish uchun qisqa tavsif. */
export function trashLabel(kind, item, D) {
  const groups = byId(D && D.groups);
  const students = byId(D && D.students);
  if (kind === "finance") {
    const s = item.studentId != null ? students.get(String(item.studentId)) : null;
    return { name: clip(item.title, 80) || "To'lov", sub: `${fmtMoney(item.amount)} so'm${s ? " · " + nameOf(s) : ""}`, amount: Number(item.amount) || 0 };
  }
  if (kind === "students") {
    const g = item.groupId != null ? groups.get(String(item.groupId)) : null;
    return { name: nameOf(item), sub: g ? "Guruh: " + clip(g.name, 40) : "" };
  }
  if (kind === "groups") return { name: clip(item.name, 60), sub: [item.course, item.mentor].filter(Boolean).join(" · ") };
  if (kind === "courses") return { name: clip(item.name, 60), sub: item.price ? fmtMoney(item.price) + " so'm" : "" };
  return { name: nameOf(item), sub: "" };
}

// ─── Moliya hisoboti (Excel) ──────────────────────────────────────────────────
const TYPE_TEXT = { income: "Kirim", expense: "Chiqim", salary: "Mentor oyligi" };

/**
 * @param {object} D  crm_data
 * @param {{year:number, month:number|null}} period  month: 0-11 yoki null (butun yil)
 * @param {string} tz
 */
export function buildFinanceReport(D, period, tz) {
  const students = byId(D && D.students);
  const groups = byId(D && D.groups);
  const { year, month, range } = period;
  const inTz = (d) => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(d));
      const g = (t) => parts.find((x) => x.type === t)?.value || "";
      return { y: Number(g("year")), m: Number(g("month")) - 1, date: `${g("day")}.${g("month")}.${g("year")}`, time: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}` };
    } catch {
      const x = new Date(d);
      return { y: x.getFullYear(), m: x.getMonth(), date: x.toISOString().slice(0, 10), time: x.toISOString().slice(11, 16) };
    }
  };
  const txs = arr(D && D.finance)
    .filter((tx) => tx && tx.date && !isNaN(new Date(tx.date)))
    .map((tx) => ({ tx, t: inTz(tx.date) }))
    .filter(({ tx, t }) => (range ? +new Date(tx.date) >= range.fromMs && +new Date(tx.date) < range.toMs : t.y === year && (month == null || t.m === month)))
    .sort((a, b) => new Date(a.tx.date) - new Date(b.tx.date));

  const sum = { income: 0, expense: 0, salary: 0 };
  const rows = txs.map(({ tx, t }, i) => {
    const s = tx.studentId != null ? students.get(String(tx.studentId)) : null;
    const g = s && s.groupId != null ? groups.get(String(s.groupId)) : null;
    const amount = Math.round(Number(tx.amount) || 0);
    if (sum[tx.type] != null) sum[tx.type] += amount;
    return [
      i + 1,
      t.date,
      t.time,
      TYPE_TEXT[tx.type] || tx.type || "",
      clip(tx.title, 120),
      s ? nameOf(s) : "",
      g ? clip(g.name, 40) : "",
      clip(tx.description, 200),
      tx.type === "income" ? amount : -amount,
      clip(tx.createdBy, 60),
    ];
  });
  const balance = sum.income - sum.expense - sum.salary;
  rows.push([]);
  rows.push(["", "", "", "JAMI KIRIM", "", "", "", "", sum.income, ""]);
  rows.push(["", "", "", "JAMI CHIQIM", "", "", "", "", -sum.expense, ""]);
  rows.push(["", "", "", "MENTOR OYLIKLARI", "", "", "", "", -sum.salary, ""]);
  rows.push(["", "", "", "BALANS", "", "", "", "", balance, ""]);
  const label = range ? range.label : month == null ? `${year}-yil` : `${cap(MONTHS[month])} ${year}`;
  return {
    title: "Moliya hisoboti",
    period: label,
    source: "CRM → Moliya (kirim, chiqim, mentor oyliklari)",
    method: "Har bir to'lov sanasi va vaqti bilan. Kirim musbat, chiqim va oylik manfiy summada.",
    columns: ["№", "Sana", "Vaqt", "Turi", "Nomi", "Talaba", "Guruh", "Izoh", "Summa (so'm)", "Kim kiritdi"],
    rows,
    totals: { ...sum, balance, count: txs.length },
    fileBase: range ? "moliya" : `moliya_${month == null ? year : `${year}_${String(month + 1).padStart(2, "0")}`}`,
  };
}
