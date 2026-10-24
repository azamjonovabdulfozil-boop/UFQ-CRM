<template>
  <div class="ig">
    <!-- Holat: 3 ta oddiy tekshiruv -->
    <div class="ig-status">
      <div class="ig-st" :class="siteOk === true ? 'ok' : siteOk === false ? 'bad' : ''">
        <span class="ig-dot"><Icon :name="siteOk === true ? 'check' : siteOk === false ? 'x' : 'dot'" :size="13" /></span>
        <div><b>Sayt ochiladi</b><small>{{ siteOk === true ? "Sayt ishlayapti" : siteOk === false ? "Sayt ochilmadi: " + (site.health?.error || "javob yo'q") : "Hali tekshirilmagan" }}</small></div>
      </div>
      <div class="ig-st" :class="codeOk === true ? 'ok' : codeOk === false ? 'warn' : ''">
        <span class="ig-dot"><Icon :name="codeOk === true ? 'check' : codeOk === false ? 'alert' : 'dot'" :size="13" /></span>
        <div><b>Kod saytga qo'yilgan</b><small>{{ codeOk === true ? "Kod bosh sahifada topildi" : codeOk === false ? "Kod bosh sahifada topilmadi" : "Hali tekshirilmagan" }}</small></div>
      </div>
      <div class="ig-st" :class="dataOk ? 'ok' : ''">
        <span class="ig-dot"><Icon :name="dataOk ? 'check' : 'dot'" :size="13" /></span>
        <div><b>Ma'lumot kelyapti</b><small>{{ dataOk ? "Oxirgi: " + fmt.ago(site.lastEventAt) : "Saytni ochib ko'ring — 1 daqiqada paydo bo'ladi" }}</small></div>
      </div>
    </div>

    <!-- 1-qadam: kod -->
    <div class="ig-step">
      <div class="ig-n">1</div>
      <div class="ig-body">
        <b>Shu kodni nusxalang</b>
        <div class="ig-code">
          <pre class="mono">{{ site.snippet }}</pre>
          <button type="button" class="btn sm pri" @click="copy(site.snippet, 'Kod nusxalandi')"><Icon name="copy" :size="13" /> Nusxalash</button>
        </div>
      </div>
    </div>

    <!-- 2-qadam: qayerga qo'yish -->
    <div class="ig-step">
      <div class="ig-n">2</div>
      <div class="ig-body">
        <b>Saytingizga joylang</b>
        <span class="small muted">Sayt nimada qilinganini tanlang:</span>
        <div class="chips">
          <button v-for="pl in PLATFORMS" :key="pl.id" type="button" class="chip" :class="{ on: plat === pl.id }" @click="plat = pl.id">{{ pl.name }}</button>
        </div>
        <ol class="ig-list">
          <li v-for="(s, i) in cur.steps" :key="i" v-html="s"></li>
        </ol>
        <button v-if="plat === 'dev'" type="button" class="btn sm" @click="copy(devMessage, 'Xabar nusxalandi — dasturchiga yuboring')"><Icon name="copy" :size="13" /> Dasturchi uchun xabarni nusxalash</button>
      </div>
    </div>

    <!-- 3-qadam: tekshirish -->
    <div class="ig-step">
      <div class="ig-n">3</div>
      <div class="ig-body">
        <b>Tekshiring</b>
        <span class="small muted">Saytingizni brauzerda ochib, 1–2 sahifani ko'ring, so'ng tugmani bosing.</span>
        <div class="row">
          <a class="btn sm" :href="site.url" target="_blank" rel="noopener noreferrer"><Icon name="external" :size="13" /> Saytni ochish</a>
          <button type="button" class="btn sm pri" :disabled="checking" @click="$emit('check')">
            <span v-if="checking" class="spin" style="width: 13px; height: 13px"></span>
            {{ checking ? "Tekshirilmoqda…" : "Ulanishni tekshirish" }}
          </button>
        </div>
        <div v-if="dataOk" class="note good small">Hammasi tayyor — statistika avtomatik yig'ilyapti.</div>
        <div v-else-if="codeOk === false" class="note warn small">
          Kod saytda topilmadi. Kodni <b>&lt;head&gt;</b> qismiga qo'yganingizni va saytni saqlab, <b>e'lon qilganingizni</b> (Publish) tekshiring. Kesh ishlatilsa, keshni tozalang.
        </div>
      </div>
    </div>

    <details class="ig-more">
      <summary class="small">Arizalar va xaridlarni ham sanash (ixtiyoriy, dasturchi uchun)</summary>
      <ul class="small ig-list">
        <li>Ariza formasi: <code>&lt;form data-ufq-lead&gt;</code> — yuborilganda «ariza» deb sanaladi.</li>
        <li>Tugma: <code>&lt;button data-ufq-event="qongiroq"&gt;</code> — bosilishi «qongiroq» nomi bilan sanaladi.</li>
        <li>JavaScript orqali: <code>ufq('track','lead')</code>, xarid: <code>ufq('track','purchase',{value:150000})</code></li>
      </ul>
    </details>
    <p class="muted small">Ma'lumot kod o'rnatilgan paytdan boshlab yig'iladi — oldingi tashriflar ko'rinmaydi. Cookie ishlatilmaydi, IP manzil va formaga yozilgan ma'lumotlar saqlanmaydi.</p>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { fmt, toast } from "../store.js";
import Icon from "./Icon.vue";

const props = defineProps({ site: { type: Object, required: true }, checking: Boolean });
defineEmits(["check"]);

const siteOk = computed(() => (props.site.health ? !!props.site.health.ok : null));
const codeOk = computed(() => (props.site.health && props.site.health.ok ? props.site.health.snippetFound ?? null : null));
const dataOk = computed(() => !!props.site.lastEventAt);

const PLATFORMS = [
  {
    id: "html",
    name: "Oddiy HTML",
    steps: [
      "Saytning har bir sahifasidagi (masalan <code>index.html</code>) <code>&lt;/head&gt;</code> yozuvini toping.",
      "Kodni aynan shu yozuvdan <b>oldin</b> joylang.",
      "Fayllarni saqlang va serverga (hostingga) qayta yuklang.",
    ],
  },
  {
    id: "wp",
    name: "WordPress",
    steps: [
      "Admin panel → <b>Plaginlar → Yangi qo'shish</b> → «<b>WPCode</b>» (Insert Headers and Footers) plaginini o'rnating va yoqing.",
      "<b>Code Snippets → Header &amp; Footer</b> bo'limiga kiring.",
      "Kodni <b>Header</b> maydoniga joylang va <b>Save Changes</b> tugmasini bosing.",
    ],
  },
  {
    id: "tilda",
    name: "Tilda",
    steps: [
      "Loyiha → <b>Site Settings</b> (Sayt sozlamalari) → <b>More</b> (Ещё) bo'limi.",
      "«<b>HTML code for the HEAD section</b>» → <b>Edit code</b> tugmasini bosing.",
      "Kodni joylang, <b>Save</b> ni bosing, so'ng <b>Publish all pages</b> (barcha sahifalarni e'lon qilish).",
    ],
  },
  {
    id: "wix",
    name: "Wix",
    steps: [
      "Sayt paneli → <b>Settings</b> → <b>Custom Code</b> (Advanced bo'limida).",
      "<b>+ Add Custom Code</b> → kodni joylang.",
      "«<b>All pages</b>» va «<b>Head</b>» ni tanlang → <b>Apply</b>. (Wix'da bu faqat pullik tarifda ishlaydi.)",
    ],
  },
  {
    id: "dev",
    name: "Dasturchi qiladi",
    steps: ["Pastdagi tugma bilan tayyor xabarni nusxalang va saytingiz dasturchisiga yuboring.", "Dasturchi kodni joylagach, 3-qadamdagi tekshiruvni bosing."],
  },
];
const plat = ref("html");
const cur = computed(() => PLATFORMS.find((x) => x.id === plat.value));
const devMessage = computed(
  () =>
    `Assalomu alaykum! ${props.site.host} saytining barcha sahifalaridagi <head> qismiga quyidagi kodni qo'yib bera olasizmi? Bu tashriflar statistikasi uchun.\n\n${props.site.snippet}\n\nIxtiyoriy: ariza formalariga data-ufq-lead atributini qo'shing.`,
);

async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast("Nusxalab bo'lmadi — matnni qo'lda belgilang", "error");
  }
}
</script>

<style scoped>
.ig { display: grid; gap: 14px; }
.ig-status { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ig-st { display: flex; gap: 8px; align-items: flex-start; padding: 10px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface-2, var(--surface)); }
.ig-st > div { display: grid; gap: 2px; min-width: 0; }
.ig-st b { font-size: 12.5px; }
.ig-st small { font-size: 11.5px; color: var(--text-3); }
.ig-dot { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-3); color: var(--text-3); flex-shrink: 0; }
.ig-st.ok { border-color: color-mix(in srgb, var(--good) 45%, var(--border)); }
.ig-st.ok .ig-dot { background: var(--good-soft); color: var(--good); }
.ig-st.bad .ig-dot { background: var(--bad-soft); color: var(--bad); }
.ig-st.warn .ig-dot { background: var(--warn-soft, var(--surface-3)); color: var(--warn); }
.ig-step { display: grid; grid-template-columns: 28px 1fr; gap: 10px; }
.ig-n { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-text); font-weight: 800; font-size: 13px; }
.ig-body { display: grid; gap: 7px; min-width: 0; padding-top: 4px; }
.ig-code { display: flex; gap: 8px; align-items: flex-start; }
.ig-code pre { flex: 1; min-width: 0; margin: 0; padding: 10px 12px; background: var(--surface-3); border-radius: var(--r-sm); white-space: pre-wrap; word-break: break-all; font-size: 12px; }
.ig-list { margin: 0; padding-left: 20px; display: grid; gap: 5px; font-size: 13px; color: var(--text-2); }
.ig-more summary { cursor: pointer; color: var(--text-2); }
.ig-more .ig-list { margin-top: 8px; }
code { font-size: 11.5px; background: var(--surface-3); padding: 1px 4px; border-radius: 4px; }
@media (max-width: 700px) {
  .ig-status { grid-template-columns: 1fr; }
  .ig-code { flex-direction: column; }
}
</style>
