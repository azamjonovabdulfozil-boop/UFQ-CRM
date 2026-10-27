<template>
  <div class="ai-wrap">
    <!-- Suhbatlar ro'yxati -->
    <aside class="ai-side card" :class="{ open: sideOpen }">
      <div class="ai-side-h">
        <b>Suhbatlar</b>
        <button class="btn sm pri" @click="newChat"><Icon name="plus" :size="14" /> Yangi</button>
      </div>
      <div class="ai-side-list">
        <div v-if="!chats.length" class="small muted" style="padding: 10px">Hali suhbat yo'q</div>
        <div v-for="c in chats" :key="c.id" class="ai-chat-item" :class="{ on: c.id === chatId }" @click="openChat(c.id)">
          <span class="ai-chat-t">{{ c.title }}</span>
          <button class="btn ghost icon sm" aria-label="O'chirish" @click.stop="removeChat(c.id)"><Icon name="x" :size="13" /></button>
        </div>
      </div>
    </aside>

    <!-- Suhbat -->
    <section class="ai-main card" :class="{ drag: dragOn }" @dragover.prevent="dragOn = true" @dragleave.self="dragOn = false" @drop.prevent="onDrop">
      <div v-if="dragOn" class="ai-drop">Faylni shu yerga tashlang</div>
      <div class="ai-head">
        <button class="btn ghost icon ai-burger" aria-label="Suhbatlar" @click="sideOpen = !sideOpen"><Icon name="list" :size="17" /></button>
        <div class="ai-head-t">
          <b><Icon name="spark" :size="16" /> AI yordamchi</b>
          <span class="small muted">Yozing, gapiring 🎤 yoki fayl tashlang 📎 — rasm, PDF, Word, Excel, ovoz</span>
        </div>
      </div>

      <div ref="scroller" class="ai-msgs">
        <div v-if="enabled === false" class="note bad">AI sozlanmagan: serverga <b>ANTHROPIC_API_KEY</b> qo'yilmagan.</div>
        <div v-if="!msgs.length" class="ai-empty">
          <div class="ai-empty-ic"><Icon name="spark" :size="28" /></div>
          <h3>Nima qilib beray?</h3>
          <p class="muted small">
            Men CRM ma'lumotlarini o'qiyman, hisobot tayyorlayman va sizning buyrug'ingiz bilan o'zgartirishlar kiritaman. Ovozli xabar yuboring
            (🎤), rasm, hujjat yoki jadval tashlang (📎) — tahlil qilib, aytilgan ishni bajaraman. Javobimni «Eshitish» bilan tinglashingiz mumkin.
          </p>
          <div class="ai-examples">
            <button v-for="e in EXAMPLES" :key="e" class="chip" @click="send(e)">{{ e }}</button>
          </div>
        </div>

        <div v-for="(m, i) in msgs" :key="i" class="ai-msg" :class="m.role">
          <div class="ai-bubble">
            <template v-if="m.role === 'assistant'">
              <div class="ai-md" v-html="md(m.text)"></div>
              <div class="ai-tools">
                <button class="ai-tool" :class="{ on: player.id === 'a' + i }" @click="say(i, m.text)">
                  <span v-if="player.id === 'a' + i && player.loading" class="spin" style="width: 12px; height: 12px"></span>
                  <Icon v-else :name="player.id === 'a' + i ? 'stop' : 'volume'" :size="13" />
                  {{ player.id === "a" + i ? (player.loading ? "Tayyorlanmoqda…" : "To'xtatish") : "Eshitish" }}
                </button>
                <button class="ai-tool" @click="copy(m.text)"><Icon name="copy" :size="13" /> Nusxalash</button>
              </div>
            </template>
            <template v-else>
              <div v-if="m.voice" class="vm" :class="{ play: player.id === vKey(m, i) && player.playing }">
                <button class="vm-btn" :aria-label="player.id === vKey(m, i) && player.playing ? 'Pauza' : 'Eshitish'" @click="playVoice(m, i)">
                  <span v-if="player.id === vKey(m, i) && player.loading" class="spin" style="width: 14px; height: 14px"></span>
                  <Icon v-else :name="player.id === vKey(m, i) && player.playing ? 'pause' : 'play'" :size="15" />
                </button>
                <div class="vm-wave" @click="playVoice(m, i, $event)">
                  <i
                    v-for="(h, k) in bars(m.voice.wave)"
                    :key="k"
                    :style="{ height: h + 'px' }"
                    :class="{ on: player.id === vKey(m, i) && k / bars(m.voice.wave).length < player.pct }"
                  ></i>
                </div>
                <span class="vm-t">{{ player.id === vKey(m, i) && player.time ? durText(player.time) : durText(m.voice.dur) }}</span>
              </div>
              <div v-if="m.voice && m.voice.transcript" class="vm-tr">«{{ m.voice.transcript }}»</div>
              <div v-else-if="m.voice && m.pending" class="vm-tr">Ovoz matnga aylantirilmoqda…</div>
              <div v-if="m.files && m.files.length" class="uf">
                <template v-for="(f, k) in m.files" :key="k">
                  <img v-if="f.kind === 'image' && thumb(f)" :src="thumb(f)" class="uf-img" :alt="f.name" @click="openFile(f)" />
                  <button v-else class="uf-chip" type="button" @click="openFile(f)">
                    <Icon name="doc" :size="14" /><span>{{ f.name }}</span><small>{{ fileSize(f.size || 0) }}</small>
                  </button>
                </template>
              </div>
              <div v-if="shown(m)" class="ai-txt">{{ shown(m) }}</div>
            </template>
            <div v-if="m.actions && m.actions.length" class="ai-acts">
              <span v-for="(a, k) in m.actions" :key="k" class="badge" :class="a.ok ? 'b-good' : 'b-bad'">
                <Icon :name="a.ok ? 'check' : 'alert'" :size="11" /> {{ actText(a) }}
              </span>
            </div>
            <div v-if="m.role === 'assistant' && m.files && m.files.length" class="ai-files">
              <button v-for="(f, k) in m.files" :key="k" class="btn sm" :disabled="dl === i + ':' + k" @click="getFile(f, i + ':' + k)">
                <Icon name="download" :size="14" /> {{ f.title }} ({{ f.format.toUpperCase() }})
              </button>
            </div>
          </div>
        </div>

        <div v-if="busy" class="ai-msg assistant">
          <div class="ai-bubble ai-typing"><span class="spin" style="width: 14px; height: 14px"></span> AI ishlamoqda…</div>
        </div>
        <div v-if="err" class="note bad">{{ err }}</div>
      </div>

      <div v-if="pending.length" class="pend">
        <div v-for="(p, k) in pending" :key="k" class="pend-i">
          <img v-if="p.preview" :src="p.preview" alt="" />
          <Icon v-else name="doc" :size="15" />
          <span class="pend-n">{{ p.name }}</span>
          <small class="muted">{{ fileSize(p.size) }}</small>
          <button type="button" class="btn ghost icon sm" aria-label="Olib tashlash" @click="pending.splice(k, 1)"><Icon name="close" :size="12" /></button>
        </div>
      </div>
      <div v-if="rec.on" class="recbar">
        <span class="rec-dot"></span>
        <span class="rec-t">{{ durText(rec.secs) }}</span>
        <div class="rec-lv" aria-hidden="true">
          <i v-for="k in 24" :key="k" :style="{ height: 4 + Math.round(rec.level * 20 * (0.45 + ((k * 37) % 10) / 18)) + 'px' }"></i>
        </div>
        <span class="small muted rec-hint">Gapiring… tugatgach «Yuborish»</span>
        <button type="button" class="btn" @click="cancelRec">Bekor qilish</button>
        <button type="button" class="btn pri" @click="finishRec"><Icon name="send" :size="14" /> Yuborish</button>
      </div>
      <form v-else class="ai-input" @submit.prevent="send()">
        <input ref="fileIn" type="file" multiple hidden @change="pick" />
        <button type="button" class="btn ghost icon" title="Fayl biriktirish: rasm, PDF, Word, Excel, audio va boshqalar" :disabled="busy" @click="fileIn && fileIn.click()">
          <Icon name="clip" :size="18" />
        </button>
        <textarea
          v-model="text"
          class="inp"
          rows="1"
          placeholder="Yozing yoki 🎤 ni bosib gapiring. Masalan: qarzdor o'quvchilarni ko'rsat"
          :disabled="busy"
          @keydown.enter.exact.prevent="send()"
          @input="grow"
          @paste="onPaste"
          ref="ta"
        ></textarea>
        <button v-if="!text.trim() && !pending.length && canRec" type="button" class="btn pri mic" title="Ovozli xabar yozish" aria-label="Ovozli xabar yozish" :disabled="busy" @click="beginRec">
          <Icon name="mic" :size="17" />
        </button>
        <button v-else class="btn pri" type="submit" :disabled="busy || (!text.trim() && !pending.length)">Yuborish</button>
      </form>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, onBeforeUnmount } from "vue";
import {
  toBase64, fileSize, durText, mediaUrl, rememberLocal, rec, startRecording, stopRecording, canRecord, player, playUrl, speak, stopAll,
} from "../aiMedia.js";
import { api, download } from "../api.js";
import { toast } from "../store.js";
import Icon from "../components/Icon.vue";

const EXAMPLES = [
  "Bugungi umumiy holat qanday?",
  "Qarzdor o'quvchilar ro'yxatini ber",
  "Oxirgi 30 kunlik davomat hisobotini Excel qilib ber",
  "Eng yaxshi 5 ta o'qituvchini ko'rsat",
  "Qaysi guruhlarda muammo bor?",
  "Mentor panelida sozlamalardagi «Menyu bo'limlari»ni o'chir",
];

const chats = ref([]);
const chatId = ref(null);
const msgs = ref([]);
const text = ref("");
const busy = ref(false);
const err = ref("");
const enabled = ref(null);
const sideOpen = ref(false);
const dl = ref("");
const scroller = ref(null);
const ta = ref(null);
const fileIn = ref(null);
const pending = ref([]);
const dragOn = ref(false);
const canRec = canRecord();
const thumbs = reactive({});
const MAX_FILES = 10;
const MAX_BYTES = 12 * 1024 * 1024;

// ── Fayllar ──
function addFiles(list) {
  for (const f of list) {
    if (pending.value.length >= MAX_FILES) {
      toast("Bir xabarga 10 tagacha fayl biriktiriladi", "warn");
      break;
    }
    if (f.size > MAX_BYTES) {
      toast(`«${f.name}» juda katta (${fileSize(f.size)}). Bitta fayl 12 MB gacha bo'lsin`, "error");
      continue;
    }
    pending.value.push({ file: f, name: f.name || "fayl", size: f.size, mime: f.type, preview: /^image\//.test(f.type) ? URL.createObjectURL(f) : null });
  }
}
function pick(e) {
  addFiles([...(e.target.files || [])]);
  e.target.value = "";
}
function onDrop(e) {
  dragOn.value = false;
  addFiles([...(e.dataTransfer?.files || [])]);
}
function onPaste(e) {
  const fs = [...(e.clipboardData?.files || [])];
  if (fs.length) {
    e.preventDefault();
    addFiles(fs);
  }
}
function thumb(f) {
  if (f.localUrl) return f.localUrl;
  if (!f.id) return null;
  if (!(f.id in thumbs)) {
    thumbs[f.id] = null;
    mediaUrl(f.id).then((u) => (thumbs[f.id] = u));
  }
  return thumbs[f.id];
}
async function openFile(f) {
  const u = f.localUrl || (await mediaUrl(f.id));
  if (!u) return toast("Faylni ochib bo'lmadi", "error");
  window.open(u, "_blank", "noopener");
}
const shown = (m) => (m.voice || (m.files && m.files.length) ? m.shown || "" : m.text);

// ── Ovozli xabar ──
async function beginRec() {
  try {
    stopAll();
    await startRecording(finishRec);
  } catch (e) {
    toast(e && e.name === "NotAllowedError" ? "Mikrofonga ruxsat berilmadi — brauzer manzil satridagi 🔒 belgisidan ruxsat bering" : e.message, "error");
  }
}
async function cancelRec() {
  await stopRecording(true).catch(() => {});
}
async function finishRec() {
  if (!rec.on) return;
  try {
    const v = await stopRecording(false);
    if (v) send(undefined, v);
  } catch (e) {
    toast(e.message, "warn");
  }
}
const vKey = (m, i) => "v" + (m.voice && m.voice.id ? m.voice.id : "local" + i);
function bars(w) {
  const s = String(w || "");
  if (!s) return Array(30).fill(8);
  return [...s].map((c) => 4 + Number(c) * 2.4);
}
function playVoice(m, i, ev) {
  let seek = null;
  if (ev && ev.currentTarget) {
    const rc = ev.currentTarget.getBoundingClientRect();
    if (rc.width) seek = Math.max(0, Math.min(1, (ev.clientX - rc.left) / rc.width));
  }
  const url = m.voice.local || mediaUrl(m.voice.id);
  playUrl(vKey(m, i), url, seek).catch((e) => toast(e.message, "error"));
}
function say(i, t) {
  speak("a" + i, t).catch((e) => toast("Eshitib bo'lmadi: " + e.message, "error"));
}
async function copy(t) {
  try {
    await navigator.clipboard.writeText(String(t || ""));
    toast("Nusxa olindi");
  } catch {
    toast("Nusxa olinmadi", "warn");
  }
}
onBeforeUnmount(() => {
  stopAll();
  if (rec.on) stopRecording(true).catch(() => {});
});

async function loadChats() {
  try {
    const d = await api("/api/super/ai/chats");
    chats.value = d.chats;
    enabled.value = d.enabled;
  } catch (e) {
    err.value = e.message;
  }
}
async function openChat(id) {
  stopAll();
  sideOpen.value = false;
  err.value = "";
  try {
    const d = await api("/api/super/ai/chats/" + encodeURIComponent(id));
    chatId.value = id;
    msgs.value = d.chat.display || [];
    scrollDown();
  } catch (e) {
    toast(e.message, "error");
  }
}
function newChat() {
  stopAll();
  chatId.value = null;
  msgs.value = [];
  err.value = "";
  sideOpen.value = false;
}
async function removeChat(id) {
  if (!confirm("Suhbat o'chirilsinmi?")) return;
  await api("/api/super/ai/chats/" + encodeURIComponent(id), { method: "DELETE" }).catch(() => {});
  if (chatId.value === id) newChat();
  loadChats();
}

async function send(preset, voice) {
  const t = (preset ?? text.value).trim();
  const files = preset ? [] : pending.value.slice();
  if ((!t && !files.length && !voice) || busy.value) return;
  text.value = "";
  if (!preset) pending.value = [];
  grow();
  err.value = "";
  const localVoice = voice ? { local: URL.createObjectURL(voice.blob), dur: voice.dur, wave: voice.wave } : null;
  const um = {
    role: "user",
    text: t,
    shown: t,
    pending: true,
    voice: localVoice,
    files: files.map((f) => ({ name: f.name, size: f.size, kind: f.preview ? "image" : "file", localUrl: f.preview || URL.createObjectURL(f.file) })),
  };
  msgs.value.push(um);
  const idx = msgs.value.length - 1;
  busy.value = true;
  scrollDown();
  try {
    const body = { chatId: chatId.value, message: t };
    if (files.length)
      body.files = await Promise.all(files.map(async (f) => ({ name: f.name, mime: f.mime || "application/octet-stream", data: await toBase64(f.file) })));
    if (voice) body.voice = { data: await toBase64(voice.blob), mime: (voice.blob.type || "audio/wav").split(";")[0], dur: voice.dur, wave: voice.wave };
    const d = await api("/api/super/ai/chat", { method: "POST", body });
    const isNew = !chatId.value;
    chatId.value = d.chatId;
    if (d.user) {
      // Serverdagi nusxa (ovoz matni va saqlangan fayllar) bilan almashtiramiz;
      // shu sahifada qayta yuklab o'tirmaslik uchun mahalliy nusxa eslab qolinadi
      if (d.user.voice?.id && localVoice) rememberLocal(d.user.voice.id, localVoice.local);
      (d.user.files || []).forEach((sf, k) => sf.id && um.files[k]?.localUrl && rememberLocal(sf.id, um.files[k].localUrl));
      msgs.value[idx] = d.user;
    } else um.pending = false;
    msgs.value.push({ role: "assistant", text: d.reply, actions: d.actions, files: d.files });
    if (isNew || d.actions?.length) loadChats();
  } catch (e) {
    err.value = e.message;
    um.pending = false;
    // Ovoz tushunilmadi — xabar suhbatda qolmasin, qayta yozish kerak
    if (e.code === "voice-unclear") msgs.value.splice(idx, 1);
    if (e.code === "too-long") newChat();
  } finally {
    busy.value = false;
    scrollDown();
  }
}

async function getFile(f, key) {
  dl.value = key;
  try {
    await download("/api/super/reports/" + f.kind, { query: f.query });
  } catch (e) {
    toast(e.message, "error");
  } finally {
    dl.value = "";
  }
}

function actText(a) {
  const v = { create: "Qo'shildi", update: "O'zgartirildi", delete: "O'chirildi", api: "Bajarildi" }[a.kind] || "Amal";
  const ent = { students: "o'quvchi", groups: "guruh", mentors: "mentor", courses: "kurs", finance: "moliya" }[a.entity] || "";
  if (a.kind === "api") return (a.ok ? v : "Xato") + ": " + (a.path || "").replace("/api/super/", "");
  return `${v}: ${ent}${a.name ? " — " + a.name : a.id ? " #" + a.id : ""}`;
}

function scrollDown() {
  nextTick(() => {
    const el = scroller.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}
function grow() {
  nextTick(() => {
    const el = ta.value;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  });
}

// ── Xavfsiz, kichik markdown: avval HTML tozalanadi, so'ng belgilash ──────
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
}
function md(src) {
  const lines = esc(src).split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        '<div class="tw"><table class="t"><thead><tr>' +
          head.map((h) => "<th>" + h + "</th>").join("") +
          "</tr></thead><tbody>" +
          rows.map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") +
          "</tbody></table></div>",
      );
      continue;
    }
    if (/^\s*[-*•]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*[-*•]\s+/, "")));
      out.push("<ul>" + items.map((x) => "<li>" + x + "</li>").join("") + "</ul>");
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*\d+[.)]\s+/, "")));
      out.push("<ol>" + items.map((x) => "<li>" + x + "</li>").join("") + "</ol>");
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) out.push("<h4>" + inline(h[2]) + "</h4>");
    else if (l.trim()) out.push("<p>" + inline(l) + "</p>");
    i++;
  }
  return out.join("");
}

onMounted(loadChats);
</script>

<style scoped>
.ai-wrap { display: grid; grid-template-columns: 250px 1fr; gap: 14px; height: calc(100vh - 130px); min-height: 480px; }
.ai-side { display: flex; flex-direction: column; overflow: hidden; }
.ai-side-h { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 8px; }
.ai-side-list { overflow-y: auto; padding: 0 6px 8px; }
.ai-chat-item { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: var(--r-sm); cursor: pointer; font-size: 13px; }
.ai-chat-item:hover { background: var(--surface-3); }
.ai-chat-item.on { background: var(--accent-soft); color: var(--accent-text); font-weight: 600; }
.ai-chat-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-main { display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.ai-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.ai-head-t { display: flex; flex-direction: column; gap: 2px; }
.ai-head-t b { display: flex; align-items: center; gap: 6px; }
.ai-burger { display: none; }
.ai-msgs { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.ai-empty { margin: auto; text-align: center; max-width: 560px; }
.ai-empty-ic { width: 54px; height: 54px; border-radius: 16px; display: grid; place-items: center; margin: 0 auto 10px; background: var(--accent-soft); color: var(--accent-text); }
.ai-examples { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 14px; }
.ai-msg { display: flex; }
.ai-msg.user { justify-content: flex-end; }
.ai-bubble { max-width: min(760px, 92%); padding: 10px 14px; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--border); font-size: 14px; line-height: 1.55; overflow-x: auto; }
.ai-msg.user .ai-bubble { background: var(--accent); color: #fff; border-color: var(--accent); border-bottom-right-radius: 4px; }
.ai-msg.assistant .ai-bubble { border-bottom-left-radius: 4px; }
.ai-txt { white-space: pre-wrap; word-break: break-word; }
.ai-typing { display: flex; align-items: center; gap: 8px; color: var(--text-3); }
.ai-md :deep(p) { margin: 0 0 6px; }
.ai-md :deep(p:last-child) { margin-bottom: 0; }
.ai-md :deep(ul), .ai-md :deep(ol) { margin: 4px 0 8px; padding-left: 20px; }
.ai-md :deep(h4) { margin: 8px 0 4px; font-size: 14.5px; }
.ai-md :deep(code) { background: var(--surface-3); padding: 1px 5px; border-radius: 5px; font-size: 12.5px; }
.ai-md :deep(.tw) { margin: 6px 0; }
.ai-acts, .ai-files { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.ai-input { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--border); align-items: flex-end; }
.ai-input .mic { width: 44px; height: 40px; padding: 0; justify-content: center; border-radius: 50%; }
.ai-main { position: relative; }
.ai-main.drag { outline: 2px dashed var(--accent); outline-offset: -6px; }
.ai-drop { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; font-weight: 700; color: var(--accent-text); background: color-mix(in srgb, var(--surface) 85%, transparent); pointer-events: none; }
.ai-tools { display: flex; gap: 4px; margin-top: 6px; }
.ai-tool { display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; color: var(--text-3); font: inherit; font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 7px; cursor: pointer; }
.ai-tool:hover { background: var(--surface-3); color: var(--text); }
.ai-tool.on { color: var(--accent-text); background: var(--accent-soft); }
/* Ovozli xabar (Telegram uslubida) */
.vm { display: flex; align-items: center; gap: 10px; min-width: 230px; }
.vm-btn { width: 38px; height: 38px; border-radius: 50%; border: 0; flex-shrink: 0; display: grid; place-items: center; cursor: pointer; background: #fff; color: var(--accent); }
.vm-wave { flex: 1; display: flex; align-items: center; gap: 2px; height: 30px; cursor: pointer; }
.vm-wave i { flex: 1; min-width: 2px; max-width: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.45); }
.vm-wave i.on { background: #fff; }
.vm-t { font-size: 12px; font-variant-numeric: tabular-nums; opacity: 0.9; }
.vm-tr { margin-top: 6px; font-size: 12.5px; font-style: italic; opacity: 0.92; white-space: pre-wrap; }
.uf { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; }
.uf-img { max-width: 220px; max-height: 180px; border-radius: 10px; cursor: zoom-in; display: block; }
.uf-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 260px; padding: 6px 10px; border-radius: 9px; border: 0; background: rgba(255, 255, 255, 0.18); color: inherit; font: inherit; font-size: 12.5px; cursor: pointer; }
.uf-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uf-chip small { opacity: 0.8; }
.pend { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px 0; border-top: 1px solid var(--border); }
.pend-i { display: flex; align-items: center; gap: 6px; max-width: 260px; padding: 4px 4px 4px 8px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2); font-size: 12.5px; }
.pend-i img { width: 28px; height: 28px; object-fit: cover; border-radius: 5px; }
.pend-n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.recbar { display: flex; align-items: center; gap: 10px; padding: 12px; border-top: 1px solid var(--border); flex-wrap: wrap; }
.rec-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--bad); animation: recPulse 1.2s infinite; }
@keyframes recPulse { 50% { opacity: 0.35; } }
.rec-t { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 42px; }
.rec-lv { display: flex; align-items: center; gap: 2px; height: 28px; }
.rec-lv i { width: 3px; border-radius: 2px; background: var(--bad); transition: height 0.08s; }
.rec-hint { flex: 1; min-width: 120px; }
.ai-input textarea { flex: 1; resize: none; min-height: 40px; max-height: 160px; }
@media (max-width: 860px) {
  .ai-wrap { grid-template-columns: 1fr; height: calc(100vh - 110px); }
  .ai-side { display: none; }
  .ai-side.open { display: flex; position: fixed; inset: 70px 12px auto 12px; max-height: 60vh; z-index: 40; }
  .ai-burger { display: inline-flex; }
  .ai-bubble { max-width: 100%; }
}
</style>
