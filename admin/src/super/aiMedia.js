/**
 * Super Admin AI uchun ovoz va fayl yordamchilari:
 *   • ovoz yozish (mikrofon) → 16 kHz mono WAV (transkripsiya uchun eng aniq format)
 *   • ovozli xabarni ijro etish (Telegramdagidek ▶ va to'lqin)
 *   • AI javobini ovoz chiqarib o'qish («Eshitish») — /api/ai-tts orqali
 *   • serverda saqlangan ovoz/rasmni ochish
 */
import { reactive } from "vue";

const base = () => window.__API_BASE__ || "";

// ─── Fayl → base64 ───────────────────────────────────────────────────────
export function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || "").replace(/^data:[^,]*,/, ""));
    fr.onerror = () => reject(fr.error || new Error("Faylni o'qib bo'lmadi"));
    fr.readAsDataURL(blob);
  });
}

export const fileSize = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
export const durText = (s) => {
  s = Math.max(0, Math.round(Number(s) || 0));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};

// ─── Serverdagi media (ovoz, rasm, fayl) ────────────────────────────────
const urlCache = new Map();
export async function mediaUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const p = fetch(base() + "/api/super/ai/media/" + encodeURIComponent(id))
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => (b ? URL.createObjectURL(b) : null))
    .catch(() => null);
  urlCache.set(id, p);
  const u = await p;
  if (!u) urlCache.delete(id);
  return u;
}
export function rememberLocal(id, url) {
  if (id && url) urlCache.set(id, Promise.resolve(url));
}

// ─── WAV kodlash ─────────────────────────────────────────────────────────
function wavBlob(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** To'lqin: 0–9 raqamlardan iborat qisqa satr */
function waveOf(samples, n = 40) {
  const step = Math.max(1, Math.floor(samples.length / n));
  const peaks = [];
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * step; j < Math.min(samples.length, (i + 1) * step); j++) m = Math.max(m, Math.abs(samples[j]));
    peaks.push(m);
  }
  const top = Math.max(0.05, ...peaks);
  return peaks.map((p) => Math.min(9, Math.round((p / top) * 9))).join("");
}

/** Yozilgan ovozni 16 kHz mono WAV ga o'tkazadi (shovqinni kamaytirib, ovoz balandligini tekislab) */
async function toWav(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    const data = out.getChannelData(0);
    // Ovoz juda past yozilgan bo'lsa — balandligini tekislaymiz (transkripsiya aniqroq)
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak > 0.001 && peak < 0.6) {
      const g = Math.min(8, 0.9 / peak);
      for (let i = 0; i < data.length; i++) data[i] *= g;
    }
    return { blob: wavBlob(data, rate), dur: audio.duration, wave: waveOf(data) };
  } finally {
    ctx.close().catch(() => {});
  }
}

// ─── Ovoz yozish ─────────────────────────────────────────────────────────
export const rec = reactive({ on: false, secs: 0, level: 0, error: "" });
let mr = null;
let stream = null;
let chunks = [];
let timer = null;
let raf = 0;
let actx = null;
const MAX_SECS = 180;

export function canRecord() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

export async function startRecording(onAutoStop) {
  rec.error = "";
  if (!canRecord()) throw new Error("Bu brauzer ovoz yozishni qo'llamaydi");
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  chunks = [];
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t));
  mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  mr.start(250);
  rec.on = true;
  rec.secs = 0;
  const t0 = Date.now();
  timer = setInterval(() => {
    rec.secs = (Date.now() - t0) / 1000;
    if (rec.secs >= MAX_SECS && onAutoStop) onAutoStop();
  }, 200);
  // Ovoz darajasi (mikrofon ishlayotganini ko'rsatish uchun)
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const an = actx.createAnalyser();
    an.fftSize = 512;
    actx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let m = 0;
      for (const x of buf) m = Math.max(m, Math.abs(x - 128));
      rec.level = Math.min(1, m / 64);
      raf = requestAnimationFrame(loop);
    };
    loop();
  } catch {}
}

function cleanup() {
  clearInterval(timer);
  cancelAnimationFrame(raf);
  try {
    stream && stream.getTracks().forEach((t) => t.stop());
  } catch {}
  try {
    actx && actx.close();
  } catch {}
  stream = null;
  actx = null;
  rec.on = false;
  rec.level = 0;
}

/** Yozishni tugatadi. cancel=true — tashlab yuboriladi. */
export function stopRecording(cancel) {
  return new Promise((resolve, reject) => {
    if (!mr) {
      cleanup();
      return resolve(null);
    }
    const m = mr;
    mr = null;
    m.onstop = async () => {
      const secs = rec.secs;
      cleanup();
      if (cancel) return resolve(null);
      if (secs < 0.7) return reject(new Error("Juda qisqa — mikrofon tugmasini bosib, gapirib, so'ng «Yuborish» ni bosing"));
      const raw = new Blob(chunks, { type: m.mimeType || "audio/webm" });
      try {
        resolve(await toWav(raw));
      } catch {
        // Dekodlab bo'lmadi — asl yozuv yuboriladi
        resolve({ blob: raw, dur: secs, wave: "" });
      }
    };
    try {
      m.stop();
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

// ─── Ijro (ovozli xabar va «Eshitish») — bir vaqtda bittasi ─────────────
export const player = reactive({ id: null, pct: 0, time: 0, loading: false, playing: false });
let audio = null;
let speakToken = 0;

export function stopAll() {
  speakToken++;
  if (audio) {
    try {
      audio.pause();
    } catch {}
  }
  audio = null;
  player.id = null;
  player.pct = 0;
  player.time = 0;
  player.loading = false;
  player.playing = false;
}

/** Ovozli xabarni ijro etish / to'xtatish */
export async function playUrl(id, urlOrPromise, seekPct) {
  if (player.id === id && audio && seekPct == null) {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
    return;
  }
  stopAll();
  const my = ++speakToken;
  player.id = id;
  player.loading = true;
  const a = new Audio();
  audio = a;
  const url = await urlOrPromise;
  if (my !== speakToken) return;
  player.loading = false;
  if (!url) {
    stopAll();
    throw new Error("Ovozni yuklab bo'lmadi");
  }
  a.src = url;
  a.ontimeupdate = () => {
    if (audio !== a) return;
    player.time = a.currentTime;
    player.pct = a.duration && isFinite(a.duration) ? a.currentTime / a.duration : 0;
  };
  a.onended = () => audio === a && stopAll();
  a.onplay = () => audio === a && (player.playing = true);
  a.onpause = () => audio === a && (player.playing = false);
  a.onloadedmetadata = () => {
    if (seekPct != null && isFinite(a.duration)) a.currentTime = seekPct * a.duration;
  };
  await a.play().catch(() => stopAll());
}
export const isPaused = () => !audio || audio.paused;

/** Markdown va belgilarni olib tashlab, o'qishga qulay matn */
function plain(t) {
  return String(t || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|[\s:|-]+\|\s*$/gm, " ")
    .replace(/\|/g, ", ")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
function chunksOf(t, max = 1200) {
  const out = [];
  let cur = "";
  for (const s of t.split(/(?<=[.!?…])\s+/)) {
    if ((cur + " " + s).length > max && cur) {
      out.push(cur);
      cur = s;
    } else cur = cur ? cur + " " + s : s;
    while (cur.length > max) {
      out.push(cur.slice(0, max));
      cur = cur.slice(max);
    }
  }
  if (cur) out.push(cur);
  return out;
}
async function ttsBlob(text) {
  const r = await fetch(base() + "/api/ai-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) {
    let d = null;
    try {
      d = await r.json();
    } catch {}
    throw new Error((d && d.error) || "Ovoz tayyorlanmadi (HTTP " + r.status + ")");
  }
  return URL.createObjectURL(await r.blob());
}

/** AI javobini ovoz chiqarib o'qish. Bo'laklar navbat bilan, keyingisi oldindan tayyorlanadi. */
export async function speak(id, text) {
  if (player.id === id) return stopAll();
  stopAll();
  const my = ++speakToken;
  player.id = id;
  player.loading = true;
  const parts = chunksOf(plain(text));
  if (!parts.length) return stopAll();
  let next = ttsBlob(parts[0]);
  for (let i = 0; i < parts.length; i++) {
    let url;
    try {
      url = await next;
    } catch (e) {
      if (my === speakToken) stopAll();
      throw e;
    }
    if (my !== speakToken) return;
    if (i + 1 < parts.length) next = ttsBlob(parts[i + 1]);
    player.loading = false;
    const a = new Audio(url);
    audio = a;
    player.playing = true;
    await new Promise((done) => {
      a.onended = done;
      a.onerror = done;
      a.play().catch(done);
    });
    URL.revokeObjectURL(url);
    if (my !== speakToken) return;
  }
  if (my === speakToken) stopAll();
}
