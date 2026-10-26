/* =====================================================================
   PAGER — butun loyiha uchun yagona sahifalash (pagination) moduli.

   Har bir ro'yxat 10 tadan ko'rsatiladi. Foydalanish:

     const pg = Pager.slice('students', items, {
       sig: q + '|' + filter,      // qidiruv/filtr holati — o'zgarsa 1-sahifa
       render: renderStudents,     // sahifa almashganda qayta chizish
     });
     el.innerHTML = pg.items.map(...).join('');
     Pager.mount('students', el);  // ro'yxat ostiga pager qo'yadi
       yoki
     html += Pager.html('students'); // pagerni HTML satr ichiga qo'shish

   Sahifalar soni: Math.ceil(total / pageSize). Ma'lumot qo'shilsa yoki
   o'chirilsa joriy sahifa saqlanadi; u yo'qolib qolsa — oxirgi sahifaga
   o'tiladi. Qidiruv/filtr (sig) o'zgarsa — avtomatik 1-sahifa.
   ===================================================================== */
(function () {
  "use strict";

  var SIZE = 10;
  var state = {}; // key -> { page, pages, total, sig, render, size }

  function labels() {
    var lang = typeof L !== "undefined" ? L : "uz";
    if (lang === "ru") return { prev: "Назад", next: "Далее" };
    if (lang === "en") return { prev: "Back", next: "Next" };
    return { prev: "Orqaga", next: "Keyingi" };
  }

  function esc(k) {
    return String(k).replace(/[^a-zA-Z0-9_\-:.]/g, "_");
  }

  function slice(key, items, opts) {
    opts = opts || {};
    items = items || [];
    var size = opts.size || SIZE;
    var st = state[key] || (state[key] = { page: 1 });
    var sig = opts.sig === undefined ? "" : String(opts.sig);
    if (st.sig !== undefined && st.sig !== sig) st.page = 1;
    st.sig = sig;
    if (typeof opts.render === "function") st.render = opts.render;
    st.size = size;
    st.total = items.length;
    st.pages = Math.max(1, Math.ceil(items.length / size));
    if (st.page > st.pages) st.page = st.pages;
    if (st.page < 1) st.page = 1;
    var start = (st.page - 1) * size;
    return {
      items: items.slice(start, start + size),
      page: st.page,
      pages: st.pages,
      total: st.total,
      start: start,
    };
  }

  function html(key) {
    var st = state[key];
    // Pager faqat 2-sahifa paydo bo'lganda ko'rinadi (10 tadan ko'p yozuv).
    // 10 va undan kam bo'lsa "1 / 1" ko'rsatib o'tirilmaydi.
    if (!st || !st.total || st.pages <= 1) return "";
    var lb = labels();
    var k = esc(key);
    var p = st.page;
    var n = st.pages;
    return (
      '<nav class="ufq-pager" data-pager="' + k + '" aria-label="Sahifalash">' +
      '<button type="button" class="ufq-pg-btn" ' +
      (p <= 1 ? "disabled " : "") +
      "onclick=\"event.stopPropagation();Pager.go('" + k + "'," + (p - 1) + ')">' +
      '<span class="ufq-pg-arr">←</span> ' + lb.prev + "</button>" +
      '<span class="ufq-pg-info"><b>' + p + "</b> / " + n + "</span>" +
      '<button type="button" class="ufq-pg-btn" ' +
      (p >= n ? "disabled " : "") +
      "onclick=\"event.stopPropagation();Pager.go('" + k + "'," + (p + 1) + ')">' +
      lb.next + ' <span class="ufq-pg-arr">→</span></button>' +
      "</nav>"
    );
  }

  // Pagerni konteyner ostiga (qo'shni element sifatida) joylashtiradi.
  function mount(key, container) {
    if (!container || !container.parentNode) return;
    var k = esc(key);
    var holder = container.nextElementSibling;
    if (!holder || holder.getAttribute("data-pager-slot") !== k) {
      holder = document.createElement("div");
      holder.setAttribute("data-pager-slot", k);
      container.parentNode.insertBefore(holder, container.nextSibling);
    }
    holder.innerHTML = html(key);
  }

  function clear(key, container) {
    if (state[key]) state[key].total = 0;
    if (container) {
      var holder = container.nextElementSibling;
      if (holder && holder.getAttribute("data-pager-slot") === esc(key))
        holder.innerHTML = "";
    }
  }

  function go(key, page) {
    var st = state[key];
    if (!st) return;
    page = Math.max(1, Math.min(st.pages || 1, page | 0));
    if (page === st.page) return;
    st.page = page;
    var bar = document.querySelector('[data-pager="' + esc(key) + '"]');
    var top = bar ? bar.getBoundingClientRect().top : null;
    if (typeof st.render === "function") {
      try {
        st.render();
      } catch (e) {
        console.error("[Pager] render xatosi:", key, e);
      }
    }
    // Pager ekranda o'z joyida qolsin — sahifa "sakramasin"
    var bar2 = document.querySelector('[data-pager="' + esc(key) + '"]');
    if (bar2 && top !== null) {
      // ekran pikseli → scroll (CSS) pikseli (katta ekranda zoom bo'lishi mumkin)
      var diff = (bar2.getBoundingClientRect().top - top) / (window.__uiZoom || 1);
      var sc = scrollParent(bar2);
      if (diff && sc) sc.scrollTop += diff;
    }
  }

  function scrollParent(el) {
    var n = el.parentElement;
    while (n && n !== document.body) {
      var oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function reset(key) {
    if (state[key]) state[key].page = 1;
  }

  function page(key) {
    return state[key] ? state[key].page : 1;
  }

  window.Pager = {
    SIZE: SIZE,
    slice: slice,
    html: html,
    mount: mount,
    clear: clear,
    go: go,
    reset: reset,
    page: page,
    _state: state,
  };
})();
