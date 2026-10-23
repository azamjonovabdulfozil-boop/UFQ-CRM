/** Saytlar analitikasi uchun kichik ko'rsatkich komponentlari. */
import { defineComponent, h } from "vue";
import { fmt } from "../store.js";

const LEVEL = { bad: ["b-bad", "Jiddiy"], warn: ["b-warn", "Diqqat"], info: ["b-info", "Ma'lumot"] };

export const AlertItem = defineComponent({
  props: { a: { type: Object, required: true }, showSite: Boolean },
  setup(p) {
    return () => {
      const a = p.a;
      const [cls, lbl] = LEVEL[a.level] || LEVEL.info;
      const nums =
        a.prev != null || a.cur != null
          ? `${a.metric}: ${a.prev ?? "—"} → ${a.cur ?? "—"}${a.change != null ? ` (${a.change > 0 ? "+" : ""}${a.change}%)` : ""}`
          : a.metric;
      return h("div", { class: "wa-alert " + (a.level || "info") }, [
        h("div", { class: "row between" }, [
          h("span", { class: "badge " + cls }, lbl),
          h("span", { class: "small muted" }, (p.showSite && a.siteName ? a.siteName + " · " : "") + fmt.dt(a.at)),
        ]),
        h("div", { class: "wa-alert-t" }, a.reason),
        h("div", { class: "small mono" }, nums),
        h("div", { class: "small muted" }, "Tavsiya: " + a.action),
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
          ? ["b-mute", "To'xtatilgan"]
          : t === "active"
            ? ["b-good", "Ishlayapti"]
            : t === "stale"
              ? ["b-warn", "Hodisa kelmayapti"]
              : ["b-mute", "Kutilmoqda"];
      return h("span", { class: "badge " + cls, title: p.site.lastEventAt ? "Oxirgi hodisa: " + fmt.dt(p.site.lastEventAt) : "Hali hodisa kelmagan" }, txt);
    };
  },
});

export const HealthBadge = defineComponent({
  props: { h: { type: Object, default: null } },
  setup(p) {
    return () => {
      const x = p.h;
      if (!x) return h("span", { class: "badge b-mute" }, "Tekshirilmagan");
      return h(
        "span",
        { class: "badge " + (x.ok ? "b-good" : "b-bad"), title: (x.error || "") + " · " + fmt.dt(x.at) },
        x.ok ? `${x.status} · ${x.ms} ms` : x.error || "Javob yo'q",
      );
    };
  },
});
