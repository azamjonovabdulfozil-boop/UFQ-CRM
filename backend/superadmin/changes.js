/**
 * superadmin/changes.js — CRM o'zgarishlarini kuzatish.
 *
 *   • summarizeCrmChange  — kim nimani o'zgartirdi (audit jurnali uchun):
 *                           bo'lim, yozuv nomlari va id'lari, o'zgargan
 *                           maydon NOMLARI (qiymatlari emas — telefon, parol
 *                           kabi narsalar jurnalga tushmaydi).
 *   • recordLessonMarks   — davomat birinchi marta qachon belgilanganini
 *                           yozib boradi. CRM davomat belgilariga vaqt
 *                           qo'ymaydi, shuning uchun "dars o'z vaqtida
 *                           o'tildimi" ni bilish uchun shu qo'shimcha jurnal
 *                           kerak. Mavjud ma'lumotga tegmaydi — faqat yangi
 *                           `lesson_marks` kolleksiyasiga yozadi.
 */

const LIST_SECTIONS = {
  students: "Talabalar",
  groups: "Guruhlar",
  mentors: "Mentorlar",
  courses: "Kurslar",
  finance: "Moliya",
  tests: "Testlar",
  certificates: "Sertifikatlar",
};
const MAP_SECTIONS = {
  attendance: "Davomat",
  simpleGrades: "Baholar",
  grades: "Mezonli baholar",
  gradingCriteria: "Baholash mezonlari",
  testResults: "Test natijalari",
};

const nameOf = (x) =>
  String((x && (x.name || x.title || x.no || x.desc || x.description)) || (x && x.id) || "").slice(0, 60);

function diffList(prev, next) {
  const a = Array.isArray(prev) ? prev : [];
  const b = Array.isArray(next) ? next : [];
  const pa = new Map(a.filter((x) => x && x.id != null).map((x) => [String(x.id), x]));
  const pb = new Map(b.filter((x) => x && x.id != null).map((x) => [String(x.id), x]));
  const added = [], removed = [], changed = [];
  const fields = new Set();
  for (const [id, x] of pb) {
    if (!pa.has(id)) added.push({ id, name: nameOf(x) });
    else {
      const old = pa.get(id) || {};
      const f = [];
      for (const k of new Set([...Object.keys(old), ...Object.keys(x)]))
        if (JSON.stringify(old[k]) !== JSON.stringify(x[k])) f.push(k);
      if (f.length) {
        changed.push({ id, name: nameOf(x), fields: f.slice(0, 10) });
        f.forEach((k) => fields.add(k));
      }
    }
  }
  for (const [id, x] of pa) if (!pb.has(id)) removed.push({ id, name: nameOf(x) });
  return { added, removed, changed, fields: [...fields].slice(0, 12) };
}

function diffMapKeys(prev, next) {
  const a = prev && typeof prev === "object" ? prev : {};
  const b = next && typeof next === "object" ? next : {};
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  return out;
}

/**
 * Davomat jadvalida qaysi darslar o'zgarganini topadi:
 * [{ groupId, year, month, lesson, marks: {K, Y, S} }] — faqat sonlar,
 * talabalarning ismi yoki boshqa shaxsiy ma'lumot yozilmaydi.
 */
export function attendanceLessons(prev, next, keys) {
  const out = [];
  for (const key of keys) {
    const m = /^att_(\d+)_(\d{4})_(\d{1,2})$/.exec(key);
    if (!m) continue;
    const ns = (next && next[key]) || {};
    const ps = (prev && prev[key]) || {};
    for (let l = 1; l <= 31; l++) {
      const lk = "l" + l;
      const col = (sheet) =>
        JSON.stringify(
          Object.keys(sheet || {})
            .sort()
            .map((sid) => [sid, (sheet[sid] || {})[lk] || ""])
            .filter((x) => x[1]),
        );
      if (col(ns) === col(ps)) continue;
      const marks = { K: 0, Y: 0, S: 0 };
      for (const row of Object.values(ns)) {
        const v = row && row[lk];
        if (v === "K" || v === "Y" || v === "S") marks[v]++;
      }
      out.push({ groupId: Number(m[1]), year: Number(m[2]), month: Number(m[3]), lesson: l, marks });
      if (out.length >= 30) return out;
    }
  }
  return out;
}

/** @returns {null | {sections, summary, ids}} */
export function summarizeCrmChange(prev, next) {
  if (!next || typeof next !== "object") return null;
  const p = prev || {};
  const sections = {};
  const parts = [];
  const ids = []; // "students:12" — tarixni yozuv bo'yicha qidirish uchun
  for (const [k, label] of Object.entries(LIST_SECTIONS)) {
    if (!(k in next)) continue;
    const d = diffList(p[k], next[k]);
    if (d.added.length + d.removed.length + d.changed.length === 0) continue;
    sections[k] = {
      added: d.added.slice(0, 10),
      removed: d.removed.slice(0, 10),
      changed: d.changed.slice(0, 10),
      counts: [d.added.length, d.removed.length, d.changed.length],
      changedFields: d.fields,
    };
    for (const x of [...d.added, ...d.removed, ...d.changed].slice(0, 60)) ids.push(k + ":" + x.id);
    const bits = [];
    if (d.added.length) bits.push(`+${d.added.length}`);
    if (d.removed.length) bits.push(`−${d.removed.length}`);
    if (d.changed.length) bits.push(`~${d.changed.length}` + (d.fields.length ? ` (${d.fields.slice(0, 5).join(", ")})` : ""));
    parts.push(`${label} ${bits.join(" ")}`);
  }
  for (const [k, label] of Object.entries(MAP_SECTIONS)) {
    if (!(k in next)) continue;
    const keys = diffMapKeys(p[k], next[k]);
    if (!keys.length) continue;
    sections[k] = { changedItems: keys.length };
    // Faoliyat tarixida «qaysi guruh, qaysi dars» va «kimga baho» ko'rinsin
    if (k === "attendance") sections[k].lessons = attendanceLessons(p[k], next[k], keys);
    if (k === "simpleGrades") sections[k].students = keys.slice(0, 40);
    if (k === "simpleGrades") for (const sid of keys.slice(0, 40)) ids.push("students:" + sid);
    if (k === "attendance")
      for (const key of keys.slice(0, 40)) {
        const m = /^att_(\d+)_/.exec(key);
        if (m) ids.push("groups:" + m[1]);
      }
    parts.push(`${label} (${keys.length})`);
  }
  if (!parts.length) return null;
  return { sections, summary: parts.join(", ").slice(0, 300), ids: [...new Set(ids)].slice(0, 80) };
}

// ─── Sozlama yozuvlari ────────────────────────────────────────────────────────
const SETTINGS_KEY_RE = /^(edumanage_branding_v1|edumanage_settings_v1|edu_shop_v1|edumanage_cert_templates_v1)/;
const settingsSeen = new Map();

/** KV yozuvi muhim sozlama bo'lsa true (60 soniyada bir martadan ko'p emas). */
export function isAuditableSettingWrite(key, actorId) {
  if (!SETTINGS_KEY_RE.test(String(key || ""))) return false;
  const id = `${actorId || "?"}|${key}`;
  const now = Date.now();
  if (now - (settingsSeen.get(id) || 0) < 60_000) return false;
  settingsSeen.set(id, now);
  if (settingsSeen.size > 500) settingsSeen.clear();
  return true;
}

// ─── Darslar qachon belgilangani ──────────────────────────────────────────────
export const LESSON_MARKS_COL = "lesson_marks";

export async function ensureLessonMarkIndexes(db) {
  try {
    const col = db.collection(LESSON_MARKS_COL);
    await col.createIndex({ key: 1 }, { unique: true });
    await col.createIndex({ groupId: 1, year: 1, month: 1 });
  } catch (e) {
    console.warn("⚠️  lesson_marks indekslari:", e.message);
  }
}

/**
 * Davomat jadvalida YANGI belgilangan darslarni topadi (ilgari bitta ham
 * belgi bo'lmagan dars ustuni) va birinchi belgilangan vaqtni yozadi.
 * $setOnInsert — keyingi tahrirlar vaqtni o'zgartirmaydi.
 */
export async function recordLessonMarks(db, prevAtt, nextAtt, actor) {
  if (!nextAtt || typeof nextAtt !== "object") return 0;
  const a = prevAtt && typeof prevAtt === "object" ? prevAtt : {};
  const ops = [];
  const now = new Date();
  for (const key of Object.keys(nextAtt)) {
    const m = /^att_(\d+)_(\d{4})_(\d{1,2})$/.exec(key);
    if (!m) continue;
    const ns = nextAtt[key] || {};
    const ps = a[key] || {};
    if (JSON.stringify(ns) === JSON.stringify(ps)) continue;
    for (let l = 1; l <= 31; l++) {
      const lk = "l" + l;
      const has = (sheet) =>
        Object.values(sheet || {}).some((row) => row && (row[lk] === "K" || row[lk] === "Y" || row[lk] === "S"));
      if (has(ns) && !has(ps)) {
        const id = `${m[1]}_${m[2]}_${m[3]}_${l}`;
        ops.push({
          updateOne: {
            filter: { key: id },
            update: {
              $setOnInsert: {
                key: id,
                groupId: Number(m[1]),
                year: Number(m[2]),
                month: Number(m[3]),
                lesson: l,
                firstMarkedAt: now,
                markedBy: actor?.username || null,
                markedRole: actor?.accountRole || actor?.role || null,
              },
            },
            upsert: true,
          },
        });
      }
    }
  }
  if (!ops.length) return 0;
  try {
    await db.collection(LESSON_MARKS_COL).bulkWrite(ops, { ordered: false });
  } catch (e) {
    console.warn("⚠️  lesson_marks yozilmadi:", e.message);
  }
  return ops.length;
}
