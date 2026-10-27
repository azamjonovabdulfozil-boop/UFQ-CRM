/**
 * aiPortal.js — mentor va talaba AI yordamchisi (server tomoni).
 *
 * Har bir rolning AI si boshqacha ishlaydi:
 *   • ADMIN   — butun markaz ma'lumotini biladi (kontekstni admin paneli quradi).
 *   • MENTOR  — faqat O'Z guruhlari va O'Z talabalarini biladi; boshqa har
 *               qanday savolga ham javob beradi.
 *   • TALABA  — faqat o'qishga oid savollarga javob beradi. Sinfdoshlari
 *               haqida hech narsa bilmaydi (ma'lumot unga umuman berilmaydi).
 *               So'kinsa: 3 marta ogohlantirish, 4-chisida AI bloklanadi.
 *               Har bir qoidabuzarlik mentoriga xabar bo'lib boradi.
 *
 * Mentor/talaba uchun AI ko'rsatmasi (system prompt) va CRM konteksti SHU
 * YERDA, serverda quriladi — brauzerdan kelgan ko'rsatma e'tiborga olinmaydi.
 * Aks holda talaba ko'rsatmani almashtirib, cheklovni chetlab o'tardi.
 */

const MON = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const LESSONS = 12;
const MAX_WARNINGS = 3; // 3 ta ogohlantirish, 4-chisida blok
const CHATS_COL = "ai_chats";
const MOD_COL = "ai_moderation";
const ALERTS_COL = "ai_alerts";
const MAX_CHATS_BYTES = 2.5 * 1024 * 1024;

export const HAQORAT_MARK = "[[HAQORAT]]";

/* ─── Yordamchilar ─────────────────────────────────────────────────────────── */

const avg = (arr) => {
  const v = arr.filter((x) => x != null && !isNaN(x));
  return v.length ? Math.round(v.reduce((a, b) => a + Number(b), 0) / v.length) : null;
};
const pct = (p, mk) => (mk > 0 ? Math.round((p / mk) * 100) : null);
const fmtN = (v, suf = "") => (v == null ? "—" : v + suf);

function lastMonths(n) {
  const now = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  return out;
}

function attMonth(D, s, y, m) {
  const row = ((D.attendance || {})["att_" + s.groupId + "_" + y + "_" + m] || {})["s" + s.id] || {};
  const r = { K: 0, Y: 0, S: 0, seq: [] };
  for (let l = 1; l <= LESSONS; l++) {
    const v = row["l" + l] || "";
    if (v === "K" || v === "Y" || v === "S") {
      r[v]++;
      r.seq.push(v);
    }
  }
  return r;
}

function studentStats(D, s, coins) {
  const months = lastMonths(3);
  const cur = attMonth(D, s, months[0].y, months[0].m);
  let K = 0, Y = 0, S = 0, seq = [];
  months
    .slice()
    .reverse()
    .forEach((x) => {
      const a = attMonth(D, s, x.y, x.m);
      K += a.K;
      Y += a.Y;
      S += a.S;
      seq = seq.concat(a.seq);
    });
  const grades = ((D.simpleGrades || {})[s.id] || [])
    .slice()
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const gScores = grades.map((g) => Number(g.score)).filter((x) => !isNaN(x));
  const tests = [];
  const res = D.testResults || {};
  for (const tid of Object.keys(res)) {
    const r = res[tid] && res[tid][s.id];
    if (!r || r.score == null) continue;
    const t = (D.tests || []).find((x) => String(x.id) === String(tid));
    tests.push({ title: t ? t.title : "Test", score: Number(r.score) || 0 });
  }
  const att3 = pct(K, K + Y);
  const gAvg = avg(gScores);
  const tAvg = avg(tests.map((t) => t.score));
  let missRow = 0;
  for (let i = seq.length - 1; i >= 0 && seq[i] === "Y"; i--) missRow++;
  return {
    s,
    cur,
    curPct: pct(cur.K, cur.K + cur.Y),
    att3,
    K,
    Y,
    S,
    last: seq.slice(-6).join(""),
    missRow,
    gAvg,
    gN: gScores.length,
    gLast: gScores.slice(-3),
    grades: grades.slice(-8),
    tAvg,
    tests,
    coins: (coins || {})["s_" + s.id] || 0,
    score: avg([att3, gAvg, tAvg]),
  };
}

const groupLine = (g, D) => {
  const course = (D.courses || []).find((c) => String(c.id) === String(g.courseId));
  return [
    g.name,
    course ? "kurs: " + course.name : g.course ? "kurs: " + g.course : "",
    g.status ? "holati: " + g.status : "",
    g.days ? "kunlari: " + (Array.isArray(g.days) ? g.days.join(",") : g.days) : "",
    g.timeStart ? "vaqti: " + g.timeStart + (g.timeEnd ? "–" + g.timeEnd : "") : g.time ? "vaqti: " + g.time : "",
    g.room ? "xona: " + g.room : "",
    g.startDate ? "boshlangan: " + g.startDate : "",
  ]
    .filter(Boolean)
    .join(" | ");
};

const today = () => {
  const n = new Date();
  return n.getDate() + "-" + MON[n.getMonth()] + " " + n.getFullYear();
};

/* ─── Mentor konteksti — faqat o'z guruhlari ──────────────────────────────── */

export function mentorGroups(D, mentorName) {
  const nm = String(mentorName || "").trim();
  if (!nm) return [];
  return (D.groups || []).filter((g) => String(g.mentor || "").trim() === nm);
}

export function buildMentorContext(D, coins, mentorName) {
  const groups = mentorGroups(D, mentorName);
  const gIds = new Set(groups.map((g) => g.id));
  const students = (D.students || []).filter((s) => gIds.has(s.groupId) && s.status !== "Arxiv");
  const stats = students.map((s) => studentStats(D, s, coins));
  const gName = (id) => (groups.find((g) => g.id === id) || {}).name || "—";

  const out = [];
  out.push("BUGUN: " + today() + ".");
  out.push("MENTOR: " + mentorName + ". Guruhlari: " + groups.length + " ta, aktiv talabalari: " + students.length + " ta.");
  out.push(
    "\nGURUHLARIM:\n" +
      (groups
        .map((g) => {
          const list = stats.filter((x) => x.s.groupId === g.id);
          let K = 0, M = 0;
          list.forEach((x) => {
            K += x.cur.K;
            M += x.cur.K + x.cur.Y;
          });
          return (
            "- " + groupLine(g, D) + " | talabalar: " + list.length +
            " | davomat bu oy: " + fmtN(pct(K, M), "%") +
            " | o'rt. baho: " + fmtN(avg(list.map((x) => x.gAvg)))
          );
        })
        .join("\n") || "- guruh biriktirilmagan"),
  );

  const ranked = stats.filter((x) => x.score != null).sort((a, b) => b.score - a.score);
  const risk = stats.filter(
    (x) => (x.att3 != null && x.att3 < 70) || x.missRow >= 2 || (x.gAvg != null && x.gAvg < 60),
  );
  out.push(
    "\nREYTING (umumiy ball = davomat %, o'rtacha baho va test o'rtachasining o'rtachasi, 0–100):\n" +
      (groups
        .map((g) => {
          const l = ranked.filter((x) => x.s.groupId === g.id);
          return l.length ? "- " + g.name + ": " + l.map((x) => x.s.name + " (" + x.score + ")").join(", ") : "";
        })
        .filter(Boolean)
        .join("\n") || "- ma'lumot yetarli emas") +
      "\n- XAVF GURUHIDAGILAR (davomat < 70% yoki ketma-ket 2+ dars qoldirgan yoki o'rtacha baho < 60): " +
      (risk.length ? risk.map((x) => x.s.name + " (" + gName(x.s.groupId) + ")").join(", ") : "yo'q"),
  );

  out.push(
    "\nTALABALARIM [K=keldi, Y=kelmadi, S=sababli; davomat % = K/(K+Y)]:\n" +
      (stats
        .map((x) => {
          const s = x.s;
          return (
            "- " +
            [
              s.name,
              gName(s.groupId),
              s.status || "Aktiv",
              s.joinDate ? "qo'shilgan " + String(s.joinDate).slice(0, 10) : "",
              "davomat bu oy " + fmtN(x.curPct, "%") + " (K" + x.cur.K + "/Y" + x.cur.Y + "/S" + x.cur.S + ")",
              "3 oy " + fmtN(x.att3, "%"),
              x.last ? "oxirgi darslar " + x.last : "",
              x.missRow >= 2 ? "KETMA-KET " + x.missRow + " DARS QOLDIRGAN" : "",
              "baho o'rt " + fmtN(x.gAvg) + (x.gN ? " (" + x.gN + " ta, oxirgilari " + x.gLast.join(",") + ")" : ""),
              x.tests.length ? "testlar o'rt " + x.tAvg + " (" + x.tests.length + " ta)" : "test yo'q",
              "coin " + x.coins,
              s.isDebtor ? "to'lovdan qarzi bor" : "",
              "umumiy ball " + fmtN(x.score),
            ]
              .filter(Boolean)
              .join(" | ")
          );
        })
        .join("\n") || "- talaba yo'q"),
  );
  return out.join("\n").slice(0, 150000);
}

/* ─── Talaba konteksti — FAQAT o'zi ───────────────────────────────────────── */

export function findStudent(D, studentId) {
  return (D.students || []).find((s) => String(s.id) === String(studentId)) || null;
}

export function buildStudentContext(D, coins, studentId) {
  const s = findStudent(D, studentId);
  if (!s) return "Talaba ma'lumoti topilmadi.";
  const g = (D.groups || []).find((x) => x.id === s.groupId);
  const x = studentStats(D, s, coins);
  const out = [];
  out.push("BUGUN: " + today() + ".");
  out.push("TALABA: " + s.name + (g ? ", guruhi: " + groupLine(g, D) : ", guruh biriktirilmagan") + (g && g.mentor ? ", mentori: " + g.mentor : "") + ".");
  out.push(
    "DAVOMATI: bu oy " + fmtN(x.curPct, "%") + " (keldi " + x.cur.K + ", kelmadi " + x.cur.Y + ", sababli " + x.cur.S +
      "), oxirgi 3 oy " + fmtN(x.att3, "%") + (x.last ? ", oxirgi darslar " + x.last : "") + ".",
  );
  out.push(
    "BAHOLARI: o'rtacha " + fmtN(x.gAvg) +
      (x.grades.length
        ? " — " + x.grades.map((gr) => (gr.date ? String(gr.date).slice(0, 10) + ": " : "") + gr.score + (gr.topic || gr.comment ? " (" + (gr.topic || gr.comment) + ")" : "")).join("; ")
        : " — hali baho yo'q") + ".",
  );
  out.push(
    "TESTLARI: " + (x.tests.length ? x.tests.map((t) => t.title + " — " + t.score).join("; ") : "hali test yo'q") + ".",
  );
  out.push("COIN: " + x.coins + ".");
  return out.join("\n");
}

/* ─── Ko'rsatmalar ──────────────────────────────────────────────────────────── */

const UZ_STYLE =
  "Til: foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber. O'zbekcha yozganda — sof, tabiiy, " +
  "adabiy o'zbek tilida (lotin yozuvi), xuddi toshkentlik bilimli o'qituvchi gapirgandek yoz: sodda, " +
  "tushunarli, iliq. So'zma-so'z tarjimadek g'aliz jumlalar, rus/ingliz so'zlarini keraksiz aralashtirish " +
  "mumkin emas. o', g', sh, ch harflarini to'g'ri yoz.";

export function mentorSystem(D, coins, mentorName) {
  return (
    "Sen o'quv markazidagi MENTOR (o'qituvchi) " + mentorName + " ning shaxsiy AI yordamchisisan.\n\n" +
    "QOIDALAR:\n" +
    "1. Mentorning guruhlari, talabalari, davomat, baholar, testlar va coin haqidagi savollarga FAQAT " +
    "quyidagi ma'lumotga tayanib javob ber. Ism yoki raqam o'ylab topma. Ma'lumot bo'lmasa — ochiq ayt.\n" +
    "2. Senda faqat SHU mentorning guruhlari bor. Boshqa mentorlar, boshqa guruhlar yoki markaz moliyasi " +
    "haqida so'rasa — bu ma'lumot senda yo'qligini ayt.\n" +
    "3. Aniq ismlar, guruh nomlari va raqamlarni ko'rsat, xulosangni qisqa izohla. Kerak bo'lsa amaliy " +
    "maslahat ber (qo'shimcha dars, ota-ona bilan gaplashish, rag'batlantirish).\n" +
    "4. Boshqa har qanday savolga ham (dars rejasi, metodika, mavzuni tushuntirish, test tuzish, xat yozish, " +
    "umumiy bilim) to'liq va foydali javob ber.\n" +
    "5. Biriktirilgan rasm, ovoz, PDF, Word, Excel fayllarini diqqat bilan tahlil qil.\n" +
    "6. Ro'yxat va solishtirish uchun raqamlangan ro'yxat yoki jadval ishlat. Qisqa va aniq yoz.\n" +
    UZ_STYLE + "\n\n" +
    "===== MENTOR MA'LUMOTLARI =====\n" +
    buildMentorContext(D, coins, mentorName) +
    "\n===== MA'LUMOTLAR TUGADI ====="
  );
}

export function studentSystem(D, coins, studentId) {
  return (
    "Sen o'quv markazi TALABASINING AI o'qituvchi-yordamchisisan. Vazifang — o'qishga yordam berish.\n\n" +
    "QOIDALAR (QAT'IY):\n" +
    "1. Faqat o'qish, dars mavzulari, fanlar, masala va mashqlar, uy vazifasini TUSHUNTIRISH, dasturlash, " +
    "til o'rganish, o'quv rejasi va o'qishga motivatsiya bo'yicha savollarga javob ber. Javobni tayyor " +
    "ko'chirib olishga emas, tushunishga yo'naltir: bosqichma-bosqich tushuntir, misol keltir.\n" +
    "2. Boshqa talabalar, sinfdoshlar, guruhdagilar haqida HECH QANDAY ma'lumot berma: kim qanday o'qiydi, " +
    "kimning bahosi, davomati, coini, reytingi, ismlari, telefoni — bularning birortasini aytma va taxmin " +
    "ham qilma. Senda bunday ma'lumot yo'q. So'rasa: \"Kechirasiz, boshqa talabalar haqida ma'lumot bera " +
    "olmayman. Keling, o'qishingizga yordam beraman\" deb muloyim rad et.\n" +
    "3. Faqat SHU talabaning o'z natijalarini (quyida) aytishing mumkin.\n" +
    "4. O'qishga aloqasi yo'q mavzular (o'yin cheatlari, zararli, 18+, siyosat, boshqalarni kamsitish va " +
    "h.k.) bo'yicha javob berma — muloyim rad etib, o'qishga qaytar.\n" +
    "5. Agar talabaning OXIRGI xabarida so'kinish, haqorat, odobsiz yoki behayo so'z bo'lsa (senga, " +
    "mentorga, boshqa odamga qaratilgan bo'lsa ham, yashirib yoki harflarni almashtirib yozilgan bo'lsa ham) " +
    "— boshqa hech narsa yozmasdan, javobga FAQAT " + HAQORAT_MARK + " deb yoz. Oddiy tanqid, xafalik yoki " +
    "\"tushunmadim\" degan gap haqorat emas.\n" +
    "6. Biriktirilgan rasm, ovoz, PDF, Word, Excel fayllarini tahlil qilib, o'qish nuqtayi nazaridan yordam ber.\n" +
    "7. Mehribon, sabrli va rag'batlantiruvchi bo'l. Qisqa va tushunarli yoz.\n" +
    UZ_STYLE + "\n\n" +
    "===== TALABANING O'Z MA'LUMOTLARI =====\n" +
    buildStudentContext(D, coins, studentId) +
    "\n===== MA'LUMOTLAR TUGADI ====="
  );
}

/* ─── So'kinishni aniqlash ────────────────────────────────────────────────── */
/* Aniq so'kinishlar shu ro'yxat bilan darhol ushlanadi (AI ga yuborilmaydi).
   Yengilroq haqoratlarni esa AI kontekstga qarab o'zi aniqlaydi (HAQORAT_MARK). */

// So'z boshlanishi (o'zak) — ortidan qo'shimcha kelishi mumkin
const BAD_STEMS = [
  // o'zbekcha (lotin)
  "jalab", "jalap", "qanjiq", "kanjik", "qanjik", "sikay", "sikaman", "sikdim", "sikib", "sikvor", "sikish", "sikam",
  "qotaq", "qo'taq", "kotak", "ko'tak", "kotinga", "ko'tinga", "kotingdan", "ko'tingdan",
  "dalbayob", "dalbayop", "dolbayob", "dalbaeb", "haromi", "xaromi", "haromzoda", "xaromzoda",
  "itvachcha", "itvacha", "hunasa", "xunasa", "gandon", "pidaraz", "pidaras", "pidr",
  "suka", "blyat", "bliat", "pizd", "pzdc", "naxuy", "nahuy", "zaybal", "zaeb",
  "yeban", "ebat", "yobany", "mudak", "shalava", "shlyuxa", "shlyuha",
  // o'zbekcha / ruscha (kirill)
  "жалаб", "қанжиқ", "канжик", "сикай", "сикаман", "сикдим", "қўтақ", "кутак", "далбаёб",
  "сука", "бля", "пизд", "хуй", "хуё", "ебан", "ебат", "ёбан", "мудак", "долбо", "пидор", "пидар", "гандон", "шлюх", "шалав",
  // inglizcha
  "fuck", "motherf", "bitch", "asshole", "dickhead", "cunt", "whore",
];
// Faqat butun so'z bo'lganda (qisqa so'zlar boshqa so'zlar ichida uchraydi)
const BAD_WORDS = ["sik", "sikin", "ko't", "qo'toq", "xuy", "huy", "blya", "eban", "shit", "dick", "slut", "сик", "кўт"];

function normalizeForCheck(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/0/g, "o")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[*.\-_]+(?=\p{L})/gu, "") // "s.u.k.a", "f*ck"
    .replace(/(\p{L})\1{2,}/gu, "$1"); // "suuuka" → "suka"
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STEM_RE = new RegExp("(^|[^\\p{L}'])(" + BAD_STEMS.map(escRe).join("|") + ")", "iu");
const WORD_RE = new RegExp("(^|[^\\p{L}'])(" + BAD_WORDS.map(escRe).join("|") + ")(?=$|[^\\p{L}'])", "iu");

/** So'kinish bo'lsa topilgan so'zni qaytaradi, aks holda null. */
export function findProfanity(text) {
  const t = normalizeForCheck(text);
  const m = STEM_RE.exec(t) || WORD_RE.exec(t);
  return m ? m[2] : null;
}

/* ─── Ombor va marshrutlar ─────────────────────────────────────────────────── */

export function initAiPortal({ app, getDb, readCrmData, readAllKv, ROLES, requireAuth, requireRole, writeLimiter, audit, fail }) {
  const db = () => getDb();

  async function loadCrm() {
    let D = null;
    try {
      D = await readCrmData();
    } catch (e) {}
    const weight = (d) => (d && Array.isArray(d.students) ? d.students.length : 0);
    let coins = {};
    let kvD = null;
    try {
      for (const doc of await readAllKv()) {
        if (doc.key === "edu_mentor_coins_v1") coins = JSON.parse(String(doc.value || "{}")) || {};
        if (doc.key === "edumanage_crm_v8" && !weight(D)) kvD = JSON.parse(String(doc.value || "{}"));
      }
    } catch (e) {}
    if (!weight(D) && weight(kvD)) D = kvD;
    return { D: D || {}, coins };
  }

  const mentorNameOf = (u) => String(u?.mentorName || u?.name || "").trim();

  /** Mentor shu talabaning mentorimi (yoki admin)? */
  async function canSeeStudent(user, studentId) {
    if (user.role === ROLES.ADMIN) return true;
    if (user.role !== ROLES.MENTOR) return false;
    const { D } = await loadCrm();
    const s = findStudent(D, studentId);
    if (!s) return false;
    return mentorGroups(D, mentorNameOf(user)).some((g) => g.id === s.groupId);
  }

  async function modState(studentId) {
    return (await db().collection(MOD_COL).findOne({ _id: "s:" + studentId })) || { warnings: 0, blocked: false };
  }

  /**
   * Qoidabuzarlikni qayd qiladi va mentorga xabar yaratadi.
   * @returns {Promise<{warnings:number, blocked:boolean, text:string}>}
   */
  async function recordViolation(user, text, source) {
    const sid = user.studentId;
    const { D } = await loadCrm();
    const s = findStudent(D, sid);
    const g = s ? (D.groups || []).find((x) => x.id === s.groupId) : null;
    const now = new Date();
    const r = await db()
      .collection(MOD_COL)
      .findOneAndUpdate(
        { _id: "s:" + sid },
        {
          $inc: { warnings: 1 },
          $set: { studentId: sid, studentName: s?.name || user.studentName || user.name, lastAt: now },
        },
        { upsert: true, returnDocument: "after" },
      );
    const doc = r?.value || r || {};
    const warnings = doc.warnings || 1;
    const blocked = warnings > MAX_WARNINGS;
    if (blocked && !doc.blocked)
      await db().collection(MOD_COL).updateOne({ _id: "s:" + sid }, { $set: { blocked: true, blockedAt: now } });

    await db().collection(ALERTS_COL).insertOne({
      studentId: sid,
      studentName: s?.name || user.studentName || user.name || "Talaba",
      groupId: g?.id ?? null,
      groupName: g?.name || "",
      mentorName: g?.mentor || "",
      text: String(text || "").slice(0, 600),
      source, // "word" — ro'yxatdagi so'z, "ai" — AI aniqladi
      warnings,
      blocked,
      read: false,
      createdAt: now,
    });
    audit?.("ai.student.violation", { actor: user, meta: { studentId: sid, warnings, blocked, source }, severity: "warn" });

    let msg;
    if (blocked)
      msg =
        "🚫 **AI yordamchi siz uchun bloklandi.**\n\nSiz " + MAX_WARNINGS + " marta ogohlantirildingiz, lekin yana " +
        "so'kinish yoki haqoratli so'z ishlatdingiz. Bu haqda mentoringizga xabar yuborildi.\n\n" +
        "Blokni faqat mentoringiz yoki administrator ochishi mumkin.";
    else {
      const left = MAX_WARNINGS - warnings;
      msg =
        "⚠️ **Ogohlantirish: " + warnings + "/" + MAX_WARNINGS + "**\n\nIltimos, odob bilan yozing. So'kinish va " +
        "haqoratli so'zlar ishlatish mumkin emas. Bu haqda mentoringizga xabar yuborildi.\n\n" +
        (left > 0
          ? "Yana " + left + " ta ogohlantirishdan keyin AI yordamchi siz uchun bloklanadi."
          : "❗ Bu oxirgi ogohlantirish. Keyingi safar AI yordamchi siz uchun bloklanadi.") +
        "\n\nSavolingizni odobli qilib qayta yozing — men bajonidil yordam beraman 🙂";
    }
    return { warnings, blocked, text: msg };
  }

  /**
   * /api/ai-chat dan oldin chaqiriladi: rolga mos ko'rsatmani quradi va
   * talaba uchun moderatsiyani bajaradi.
   * @returns {Promise<{system?:string, reply?:object, status?:number, onReply?:Function}>}
   */
  async function prepareChat(req, lastUserText) {
    const user = req.user;
    if (user.role === ROLES.MENTOR) {
      const { D, coins } = await loadCrm();
      return { system: mentorSystem(D, coins, mentorNameOf(user)) };
    }
    if (user.role === ROLES.STUDENT) {
      if (user.studentId == null)
        return { status: 403, reply: { ok: false, error: "Talaba hisobi topilmadi" } };
      const st = await modState(user.studentId);
      if (st.blocked)
        return {
          status: 403,
          reply: {
            ok: false,
            code: "ai-blocked",
            error: "AI yordamchi siz uchun bloklangan. Blokni mentoringiz yoki administrator ochadi.",
            moderation: { warnings: st.warnings || 0, blocked: true, max: MAX_WARNINGS },
          },
        };
      const bad = findProfanity(lastUserText);
      if (bad) {
        const v = await recordViolation(user, lastUserText, "word");
        return {
          reply: { ok: true, text: v.text, moderation: { warnings: v.warnings, blocked: v.blocked, max: MAX_WARNINGS } },
        };
      }
      const { D, coins } = await loadCrm();
      return {
        system: studentSystem(D, coins, user.studentId),
        // AI javobida belgi bo'lsa — qoidabuzarlik
        onReply: async (text) => {
          if (!String(text || "").includes(HAQORAT_MARK)) return null;
          const v = await recordViolation(user, lastUserText, "ai");
          return { ok: true, text: v.text, moderation: { warnings: v.warnings, blocked: v.blocked, max: MAX_WARNINGS } };
        },
      };
    }
    return {};
  }

  /* ── Suhbatlar tarixi (mentor va talaba) ── */
  const chatKey = (u) => (u.role === ROLES.STUDENT ? "s:" + u.studentId : "m:" + u.id);

  app.get("/api/ai/chats", requireAuth, requireRole(ROLES.MENTOR, ROLES.STUDENT), async (req, res) => {
    try {
      const doc = await db().collection(CHATS_COL).findOne({ _id: chatKey(req.user) });
      res.json({ ok: true, store: doc?.store || { chats: [], current: null }, updatedAt: doc?.updatedAt || null });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.put("/api/ai/chats", requireAuth, requireRole(ROLES.MENTOR, ROLES.STUDENT), writeLimiter, async (req, res) => {
    try {
      const store = req.body?.store;
      if (!store || !Array.isArray(store.chats)) return res.status(400).json({ ok: false, error: "store kerak" });
      const size = JSON.stringify(store).length;
      if (size > MAX_CHATS_BYTES) return res.status(413).json({ ok: false, error: "Tarix juda katta" });
      const chats = store.chats.slice(0, 80).map((c) => ({
        id: String(c.id || "").slice(0, 40),
        createdAt: Number(c.createdAt) || Date.now(),
        updatedAt: Number(c.updatedAt) || Date.now(),
        messages: (Array.isArray(c.messages) ? c.messages : []).slice(-200),
      }));
      // O'chirilgan suhbatlar belgisi — boshqa qurilmadagi eski nusxa ularni qaytarmasin
      const deleted = (Array.isArray(store.deleted) ? store.deleted : [])
        .filter((x) => typeof x === "string" && x)
        .slice(-300)
        .map((x) => x.slice(0, 40));
      await db()
        .collection(CHATS_COL)
        .updateOne(
          { _id: chatKey(req.user) },
          {
            $set: {
              store: { chats, deleted, current: store.current ? String(store.current).slice(0, 40) : null },
              role: req.user.role,
              studentId: req.user.studentId ?? null,
              ownerName: req.user.studentName || req.user.mentorName || req.user.name,
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        );
      res.json({ ok: true });
    } catch (e) {
      fail(res, e, req);
    }
  });

  /* ── Talabaning holati (ogohlantirishlar / blok) ── */
  app.get("/api/ai/state", requireAuth, async (req, res) => {
    try {
      if (req.user.role === ROLES.STUDENT) {
        const st = await modState(req.user.studentId);
        return res.json({ ok: true, warnings: st.warnings || 0, blocked: !!st.blocked, max: MAX_WARNINGS });
      }
      const q = { read: false };
      if (req.user.role === ROLES.MENTOR) q.mentorName = mentorNameOf(req.user);
      const unread = await db().collection(ALERTS_COL).countDocuments(q);
      res.json({ ok: true, alertsUnread: unread });
    } catch (e) {
      fail(res, e, req);
    }
  });

  /* ── Mentor: o'z talabalari, ularning AI suhbatlari va ogohlantirishlar ── */
  app.get("/api/ai/students", requireAuth, requireRole(ROLES.MENTOR, ROLES.ADMIN), async (req, res) => {
    try {
      const { D } = await loadCrm();
      const groups = req.user.role === ROLES.ADMIN ? D.groups || [] : mentorGroups(D, mentorNameOf(req.user));
      const gIds = new Set(groups.map((g) => g.id));
      const students = (D.students || []).filter((s) => gIds.has(s.groupId) && s.status !== "Arxiv");
      const keys = students.map((s) => "s:" + s.id);
      const [chatDocs, modDocs] = await Promise.all([
        db().collection(CHATS_COL).find({ _id: { $in: keys } }, { projection: { "store.chats.messages.role": 1, "store.chats.updatedAt": 1, updatedAt: 1 } }).toArray(),
        db().collection(MOD_COL).find({ _id: { $in: keys } }).toArray(),
      ]);
      const chatBy = new Map(chatDocs.map((d) => [d._id, d]));
      const modBy = new Map(modDocs.map((d) => [d._id, d]));
      res.json({
        ok: true,
        students: students.map((s) => {
          const c = chatBy.get("s:" + s.id);
          const m = modBy.get("s:" + s.id);
          const chats = c?.store?.chats || [];
          return {
            id: s.id,
            name: s.name,
            groupName: (groups.find((g) => g.id === s.groupId) || {}).name || "",
            chats: chats.length,
            questions: chats.reduce((n, ch) => n + (ch.messages || []).filter((x) => x.role === "user").length, 0),
            updatedAt: c?.updatedAt || null,
            warnings: m?.warnings || 0,
            blocked: !!m?.blocked,
          };
        }),
      });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.get("/api/ai/student-chats", requireAuth, requireRole(ROLES.MENTOR, ROLES.ADMIN), async (req, res) => {
    try {
      const sid = Number(req.query.studentId);
      if (!Number.isFinite(sid)) return res.status(400).json({ ok: false, error: "studentId kerak" });
      if (!(await canSeeStudent(req.user, sid))) return res.status(403).json({ ok: false, error: "Bu talaba sizning guruhingizda emas" });
      const doc = await db().collection(CHATS_COL).findOne({ _id: "s:" + sid });
      res.json({ ok: true, store: doc?.store || { chats: [] } });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.get("/api/ai/alerts", requireAuth, requireRole(ROLES.MENTOR, ROLES.ADMIN), async (req, res) => {
    try {
      const q = req.user.role === ROLES.MENTOR ? { mentorName: mentorNameOf(req.user) } : {};
      const list = await db().collection(ALERTS_COL).find(q).sort({ createdAt: -1 }).limit(200).toArray();
      res.json({ ok: true, alerts: list.map(({ _id, ...a }) => ({ id: String(_id), ...a })) });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.post("/api/ai/alerts/read", requireAuth, requireRole(ROLES.MENTOR, ROLES.ADMIN), writeLimiter, async (req, res) => {
    try {
      const q = { read: false };
      if (req.user.role === ROLES.MENTOR) q.mentorName = mentorNameOf(req.user);
      await db().collection(ALERTS_COL).updateMany(q, { $set: { read: true, readAt: new Date() } });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.post("/api/ai/unblock", requireAuth, requireRole(ROLES.MENTOR, ROLES.ADMIN), writeLimiter, async (req, res) => {
    try {
      const sid = Number(req.body?.studentId);
      if (!Number.isFinite(sid)) return res.status(400).json({ ok: false, error: "studentId kerak" });
      if (!(await canSeeStudent(req.user, sid))) return res.status(403).json({ ok: false, error: "Bu talaba sizning guruhingizda emas" });
      await db()
        .collection(MOD_COL)
        .updateOne(
          { _id: "s:" + sid },
          { $set: { warnings: 0, blocked: false, unblockedAt: new Date(), unblockedBy: req.user.username } },
          { upsert: true },
        );
      audit?.("ai.student.unblock", { req, actor: req.user, meta: { studentId: sid } });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e, req);
    }
  });

  /* ── Ovozli xabarlar (Telegramdagidek): yuborgan odam istalgan qurilmada
     qayta eshita oladi. Har bir ovoz faqat egasiga beriladi; 180 kundan
     keyin avtomatik o'chadi. ── */
  const VOICE_COL = "ai_voice";
  const VOICE_MAX = 6 * 1024 * 1024;
  const vidOk = (v) => /^[a-z0-9_-]{6,48}$/i.test(String(v || ""));
  // Indeks baza ulangandan keyin, birinchi yozuvda yaratiladi
  let voiceIdx = false;
  const ensureVoiceIdx = () => {
    if (voiceIdx) return;
    voiceIdx = true;
    db()
      .collection(VOICE_COL)
      .createIndex({ createdAt: 1 }, { expireAfterSeconds: 180 * 86400 })
      .catch(() => (voiceIdx = false));
  };

  app.post("/api/ai/voice", requireAuth, writeLimiter, async (req, res) => {
    try {
      const vid = String(req.body?.id || "");
      const mime = String(req.body?.mime || "audio/wav").toLowerCase();
      const data = String(req.body?.data || "");
      if (!vidOk(vid) || !/^audio\/[a-z0-9.+-]+$/.test(mime) || !/^[A-Za-z0-9+/=]+$/.test(data))
        return res.status(400).json({ ok: false, error: "Ovoz formati noto'g'ri" });
      ensureVoiceIdx();
      const buf = Buffer.from(data, "base64");
      if (!buf.length || buf.length > VOICE_MAX) return res.status(413).json({ ok: false, error: "Ovoz juda katta" });
      await db()
        .collection(VOICE_COL)
        .updateOne(
          { _id: req.user.sub + ":" + vid },
          { $set: { owner: String(req.user.sub), mime, data: buf, size: buf.length, createdAt: new Date() } },
          { upsert: true },
        );
      res.json({ ok: true });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.get("/api/ai/voice/:id", requireAuth, async (req, res) => {
    try {
      if (!vidOk(req.params.id)) return res.status(400).json({ ok: false, error: "Noto'g'ri id" });
      const v = await db().collection(VOICE_COL).findOne({ _id: req.user.sub + ":" + req.params.id });
      if (!v) return res.status(404).json({ ok: false, error: "Ovoz topilmadi" });
      res.setHeader("Content-Type", v.mime || "audio/wav");
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.send(Buffer.from(v.data.buffer || v.data));
    } catch (e) {
      fail(res, e, req);
    }
  });

  return { prepareChat };
}
