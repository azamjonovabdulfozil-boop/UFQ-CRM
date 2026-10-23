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
    <section class="ai-main card">
      <div class="ai-head">
        <button class="btn ghost icon ai-burger" aria-label="Suhbatlar" @click="sideOpen = !sideOpen"><Icon name="list" :size="17" /></button>
        <div class="ai-head-t">
          <b><Icon name="spark" :size="16" /> AI yordamchi</b>
          <span class="small muted">Ma'lumot, hisobot va boshqaruv — oddiy tilda so'rang</span>
        </div>
      </div>

      <div ref="scroller" class="ai-msgs">
        <div v-if="enabled === false" class="note bad">AI sozlanmagan: serverga <b>ANTHROPIC_API_KEY</b> qo'yilmagan.</div>
        <div v-if="!msgs.length" class="ai-empty">
          <div class="ai-empty-ic"><Icon name="spark" :size="28" /></div>
          <h3>Nima qilib beray?</h3>
          <p class="muted small">Men CRM ma'lumotlarini o'qiyman, hisobot tayyorlayman va sizning buyrug'ingiz bilan o'zgartirishlar kiritaman.</p>
          <div class="ai-examples">
            <button v-for="e in EXAMPLES" :key="e" class="chip" @click="send(e)">{{ e }}</button>
          </div>
        </div>

        <div v-for="(m, i) in msgs" :key="i" class="ai-msg" :class="m.role">
          <div class="ai-bubble">
            <div v-if="m.role === 'assistant'" class="ai-md" v-html="md(m.text)"></div>
            <div v-else class="ai-txt">{{ m.text }}</div>
            <div v-if="m.actions && m.actions.length" class="ai-acts">
              <span v-for="(a, k) in m.actions" :key="k" class="badge" :class="a.ok ? 'b-good' : 'b-bad'">
                <Icon :name="a.ok ? 'check' : 'alert'" :size="11" /> {{ actText(a) }}
              </span>
            </div>
            <div v-if="m.files && m.files.length" class="ai-files">
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

      <form class="ai-input" @submit.prevent="send()">
        <textarea
          v-model="text"
          class="inp"
          rows="1"
          placeholder="Masalan: qarzdor o'quvchilarni guruh bo'yicha ko'rsat"
          :disabled="busy"
          @keydown.enter.exact.prevent="send()"
          @input="grow"
          ref="ta"
        ></textarea>
        <button class="btn pri" type="submit" :disabled="busy || !text.trim()">Yuborish</button>
      </form>
    </section>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from "vue";
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

async function send(preset) {
  const t = (preset ?? text.value).trim();
  if (!t || busy.value) return;
  text.value = "";
  grow();
  err.value = "";
  msgs.value.push({ role: "user", text: t });
  busy.value = true;
  scrollDown();
  try {
    const d = await api("/api/super/ai/chat", { method: "POST", body: { chatId: chatId.value, message: t } });
    const isNew = !chatId.value;
    chatId.value = d.chatId;
    msgs.value.push({ role: "assistant", text: d.reply, actions: d.actions, files: d.files });
    if (isNew || d.actions?.length) loadChats();
  } catch (e) {
    err.value = e.message;
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
.ai-input textarea { flex: 1; resize: none; min-height: 40px; max-height: 160px; }
@media (max-width: 860px) {
  .ai-wrap { grid-template-columns: 1fr; height: calc(100vh - 110px); }
  .ai-side { display: none; }
  .ai-side.open { display: flex; position: fixed; inset: 70px 12px auto 12px; max-height: 60vh; z-index: 40; }
  .ai-burger { display: inline-flex; }
  .ai-bubble { max-width: 100%; }
}
</style>
