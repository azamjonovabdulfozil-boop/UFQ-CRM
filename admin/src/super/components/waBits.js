/** Saytlar analitikasi uchun kichik ko'rsatkich komponentlari. */
import { defineComponent, h } from "vue";
import { fmt } from "../store.js";

const LEVEL = { bad: ["b-bad", "Jiddiy"], warn: ["b-warn", "Diqqat"], info: ["b-info", "Ma'lumot"] };
// Eski (bazada saqlangan) ogohlantirishlardagi texnik nomlar — oddiy tilda
const METRIC = {
  Sessiyalar: "Tashriflar",
  "Bounce rate": "Darhol chiqib ketganlar",
  "Konversiya foizi": "Natija foizi",
  Leadlar: "Arizalar",
  "Oxirgi hodisa": "Saytdan ma'lumot",
};
const PCT_METRIC = new Set(["Bounce rate", "Konversiya foizi", "Darhol chiqib ketganlar", "Natija foizi"]);
const r1 = (v) => (v == null || !isFinite(v) ? "—" : Math.round(v * 10) / 10);
const plainText = (t) =>
  String(t || "")
    .replace(/Bounce rate/gi, "darhol chiqib ketuvchilar ulushi")
    .replace(/tracking kodi/gi, "kuzatuv kodi")
    .replace(/Konversiya foizi/g, "Natija foizi")
    .replace(/Leadlar/g, "Arizalar")
    .replace(/hodisa/g, "ma'lumot")
    .replace(/CPA va ROAS/g, "bitta natija narxi va reklama qaytimi");

export const AlertItem = defineComponent({
  props: { a: { type: Object, required: true }, showSite: Boolean },
  setup(p) {
    return () => {
      const a = p.a;
      const [cls, lbl] = LEVEL[a.level] || LEVEL.info;
      const m = METRIC[a.metric] || a.metric;
      const u = PCT_METRIC.has(a.metric) ? "%" : "";
      const nums =
        a.prev != null || a.cur != null
          ? `${m}: oldin ${r1(a.prev)}${u} → hozir ${r1(a.cur)}${u}${a.change != null && !u ? ` (${a.change > 0 ? "+" : ""}${a.change}%)` : ""}`
          : m;
      return h("div", { class: "wa-alert " + (a.level || "info") }, [
        h("div", { class: "row between" }, [
          h("span", { class: "badge " + cls }, lbl),
          h("span", { class: "small muted" }, (p.showSite && a.siteName ? a.siteName + " · " : "") + fmt.dt(a.at)),
        ]),
        h("div", { class: "wa-alert-t" }, plainText(a.reason)),
        h("div", { class: "small" }, nums),
        h("div", { class: "small muted" }, "Nima qilish kerak: " + plainText(a.action)),
      ]);
    };
  },
});

export const TrackBadge = defineComponent({
  props: { site: { type: Object, required: true } },
  setup(p) {
    return () => {
      const t = p.site.tracking;
      const [cls, txt] =
        p.site.status === "paused"
          ? ["b-mute", "Kuzatuv to'xtatilgan"]
          : t === "active"
            ? ["b-good", "Ulangan — ma'lumot kelyapti"]
            : t === "stale"
              ? ["b-warn", "1 kundan beri ma'lumot yo'q"]
              : ["b-mute", "Kod hali o'rnatilmagan"];
      return h(
        "span",
        { class: "badge " + cls, title: p.site.lastEventAt ? "Saytdan oxirgi ma'lumot: " + fmt.dt(p.site.lastEventAt) : "Saytdan hali ma'lumot kelmagan — kuzatuv kodini o'rnating" },
        txt,
      );
    };
  },
});

export const HealthBadge = defineComponent({
  props: { h: { type: Object, default: null } },
  setup(p) {
    return () => {
      const x = p.h;
      if (!x) return h("span", { class: "badge b-mute" }, "Sayt hali tekshirilmagan");
      const slow = x.ok && x.ms > 3000;
      const sec = x.ms != null ? String(Math.round(x.ms / 100) / 10) + " s" : "";
      return h(
        "span",
        {
          class: "badge " + (x.ok ? (slow ? "b-warn" : "b-good") : "b-bad"),
          title: (x.ok ? `Server javobi: HTTP ${x.status}, ${x.ms} ms` : "Xato: " + (x.error || "javob yo'q")) + " · tekshirildi: " + fmt.dt(x.at),
        },
        x.ok ? `Sayt ochilyapti${sec ? " · " + sec : ""}${slow ? " (sekin)" : ""}` : "Sayt ochilmayapti",
      );
    };
  },
});
