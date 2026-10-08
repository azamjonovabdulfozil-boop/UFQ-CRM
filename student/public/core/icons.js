// ================================================
// ICONS — EduManage
// Loyihadagi barcha emoji "sticker"lar o'rniga bir xil
// uslubdagi SVG ikonkalar (stroke, currentColor, 1em).
//
// Ishlash tartibi:
//   1. ICONS — SVG path bazasi (Lucide uslubi, 24x24 viewBox)
//   2. EMOJI_MAP — emoji belgisi → ikonka nomi
//   3. Runtime qatlam — DOM'dagi matn tugunlarini kuzatib, emoji
//      belgilarini <span class="ic"><svg>…</svg></span> ga almashtiradi.
//
// Nega runtime? Ilova paneli 12 000+ qatorli string-concat HTML
// generatsiya qiladi (innerHTML). Bitta joyda ushlab qolish —
// har bir sahifa, modal va dinamik render'ni bir xil qamrab oladi.
//
// Emoji SAQLANISHI kerak bo'lgan joylar (chat emoji tanlagichi):
//   elementga  data-emoji-ok  atributini qo'ying — o'sha subtree
//   butunlay chetlab o'tiladi.
// ================================================
(function () {
  "use strict";

  if (window.__EDU_ICONS__) return;
  window.__EDU_ICONS__ = true;

  // ─────────────────────────────────────────────────────────────
  // 1. SVG BAZA
  // Har biri 24x24 viewBox ichidagi <path>/<circle> to'plami.
  // stroke="currentColor" — rang ota-elementdan meros bo'ladi.
  // ─────────────────────────────────────────────────────────────
  var ICONS = {
    check:
      '<path d="M20 6 9 17l-5-5"/>',
    "check-circle":
      '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    "check-double":
      '<path d="M17.5 6 8 15.5 4 11.5"/><path d="m22 8.5-7.5 7.5-1.7-1.7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    "x-circle":
      '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    alert:
      '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m4.9 4.9 14.2 14.2"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',

    coin: '<circle cx="12" cy="12" r="9"/><path d="M14.6 9.3A2.7 2.7 0 0 0 12 8c-1.5 0-2.6.8-2.6 2s1.1 2 2.6 2 2.6.9 2.6 2-1.1 2-2.6 2a2.7 2.7 0 0 1-2.6-1.3"/><path d="M12 6.4v11.2"/>',
    wallet:
      '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><path d="M17.5 13h.01"/>',
    banknote:
      '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    "money-send":
      '<path d="M21 12V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6"/><circle cx="11" cy="12" r="2.2"/><path d="M15 19h6M18 16l3 3-3 3"/>',
    gem: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3 6 9l6 12 6-12-3-6"/>',
    diamond: '<path d="M12 2.7 21.3 12 12 21.3 2.7 12z"/>',

    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M12 8v13"/><path d="M12 8H7.5a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8zM12 8h4.5a2.5 2.5 0 1 0 0-5C13 3 12 8 12 8z"/>',
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2.4 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H5.3"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    package:
      '<path d="m7.5 4.3 9 5.2"/><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    receipt:
      '<path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    tag: '<path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6z"/><path d="M7 7h.01"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',

    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users:
      '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="M16.5 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.2a6.5 6.5 0 0 1 3.5 6.8"/>',
    family:
      '<circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="7" r="2.6"/><path d="M2 20a5 5 0 0 1 10 0"/><path d="M12 20a5 5 0 0 1 10 0"/>',
    crown:
      '<path d="M3 7l4 4 5-7 5 7 4-4-2 12H5z"/><path d="M5 21h14"/>',
    "graduation-cap":
      '<path d="M22 9 12 4 2 9l10 5z"/><path d="M6 11.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5"/><path d="M22 9v5"/>',
    teacher:
      '<circle cx="12" cy="7" r="3.2"/><path d="M5 21a7 7 0 0 1 14 0"/><path d="M3 4h4"/>',
    // Talaba — 🧑‍💻 (ZWJ juftligi) uchun BITTA ikonka
    student:
      '<rect x="3" y="4" width="18" height="13" rx="2"/><circle cx="12" cy="9" r="2.1"/><path d="M8.6 14a3.6 3.6 0 0 1 6.8 0"/><path d="M2 20h20"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
    smile:
      '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
    "thumbs-up":
      '<path d="M7 22V11l4.5-9A2.5 2.5 0 0 1 14 4.5V9h4.7a2.3 2.3 0 0 1 2.3 2.8l-1.5 7A2.3 2.3 0 0 1 17.2 21H7z"/><path d="M7 11H3v11h4"/>',
    hand: '<path d="M8 13V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 12V3.5a1.5 1.5 0 0 1 3 0V12"/><path d="M14 12V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-2.5a1.5 1.5 0 0 1 3 0"/>',
    muscle:
      '<path d="M3 14c3-6 6-8 10-8 5 0 8 3 8 7s-3 6-7 6c-3 0-5-1-6-3"/><path d="M3 14c0 4 2 7 6 7"/>',

    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    "calendar-days":
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alarm:
      '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="m4 4 2.5-2M20 4l-2.5-2"/>',
    timer:
      '<path d="M10 2h4"/><path d="M12 14 15 11"/><circle cx="12" cy="14" r="8"/>',
    hourglass:
      '<path d="M6 2h12M6 22h12"/><path d="M6 2c0 4 6 6 6 10s-6 6-6 10"/><path d="M18 2c0 4-6 6-6 10s6 6 6 10"/>',

    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M4 17.5h16"/>',
    "book-open":
      '<path d="M12 6.5C10.5 4.8 8.5 4 6 4H2v15h4c2.5 0 4.5.8 6 2.5"/><path d="M12 6.5C13.5 4.8 15.5 4 18 4h4v15h-4c-2.5 0-4.5.8-6 2.5z"/><path d="M12 6.5v15"/>',
    books:
      '<path d="M4 3h4v18H4z"/><path d="M10 3h4v18h-4z"/><path d="m16.5 4.2 3.6 1-4.2 15.6-3.6-1z"/>',
    clipboard:
      '<rect x="7" y="4" width="10" height="4" rx="1"/><path d="M9 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3"/><path d="M8 12h8M8 16h5"/>',
    file: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h4"/>',
    folder:
      '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    folders:
      '<path d="M7 8a2 2 0 0 1 2-2h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M17 18v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1"/>',
    pencil:
      '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/><path d="m14.5 5.5 3 3"/>',
    edit: '<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M17.5 2.5a2.1 2.1 0 0 1 3 3L12 14l-4 1 1-4z"/>',
    note: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M15 2v5h5"/><path d="M8 12h8M8 16h5"/>',
    trash:
      '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/><path d="M10 11v6M14 11v6"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    ruler:
      '<path d="m15.5 2.5 6 6a1.4 1.4 0 0 1 0 2l-11 11a1.4 1.4 0 0 1-2 0l-6-6a1.4 1.4 0 0 1 0-2l11-11a1.4 1.4 0 0 1 2 0z"/><path d="m8 8 2 2M11 5l2 2M5 11l2 2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    paperclip:
      '<path d="M21 11.5 12 20.5a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5"/>',

    chart:
      '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>',
    "trend-up":
      '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    "trend-down":
      '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    target:
      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
    trophy:
      '<path d="M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/><path d="M12 15v3M8.5 21h7l-.7-3h-5.6z"/>',
    medal:
      '<circle cx="12" cy="15" r="5"/><path d="m8 2 2.5 6M16 2l-2.5 6"/><path d="m12 12.8.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9.1 15l2-.3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    fire: '<path d="M12 22a7 7 0 0 0 7-7c0-5-4-6.5-4-10.5C13 6 11 7 11 9c0 1.5 1 2 1 3.5A2 2 0 0 1 10 14c-1.5 0-2-1.5-2-3-1.5 1.5-3 3.5-3 6a7 7 0 0 0 7 5z"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    sparkles:
      '<path d="m12 3 1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 16.5 19.4 19l2.5.9-2.5.9-.9 2.5-.9-2.5L15 19l2.6-.9z"/>',
    party:
      '<path d="M3 21 8 8l8 8z"/><path d="M14 5.5c1.5-1 3.5-.5 4.5 1M17 2.5c1 1.5 1 3.5 0 4.5M21 9c-1.5.5-3 0-4-1"/>',
    cake: '<path d="M4 21h16"/><path d="M4 21v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6"/><path d="M12 12V8M8 12V9.5M16 12V9.5"/><path d="M12 5.5c1-1 1-2 0-3-1 1-1 2 0 3z"/>',
    heart:
      '<path d="M12 20.5 3.8 12.3a5 5 0 0 1 7.1-7.1l1.1 1.1 1.1-1.1a5 5 0 0 1 7.1 7.1z"/>',
    "heart-crack":
      '<path d="M12 20.5 3.8 12.3a5 5 0 0 1 7.1-7.1l1.1 1.1 1.1-1.1a5 5 0 0 1 7.1 7.1z"/><path d="m12 6-2 4h4l-2 4"/>',
    palette:
      '<path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-1.5a2 2 0 0 0-1.3 3.5A1.8 1.8 0 0 1 12 21z"/><circle cx="7.5" cy="12" r="1"/><circle cx="9.5" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
    rainbow:
      '<path d="M22 17a10 10 0 0 0-20 0"/><path d="M18 17a6 6 0 0 0-12 0"/><path d="M14 17a2 2 0 0 0-4 0"/>',

    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
    mail: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    inbox:
      '<path d="M21 12h-5l-1.5 3h-5L8 12H3"/><path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
    upload: '<path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="M4 3h16"/>',
    phone:
      '<path d="M21 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 4.2 2 2 0 0 1 3.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L7.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    smartphone:
      '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18.5h2"/>',
    laptop:
      '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 3h6"/><path d="M9 13h.01M15 13h.01"/><path d="M9.5 16.5h5"/>',
    robot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 3h6"/><path d="M9 13h.01M15 13h.01"/><path d="M9.5 16.5h5"/>',
    search:
      '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    refresh:
      '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.9H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9.4A1.6 1.6 0 0 0 10.5 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.6 1z"/>',
    wrench:
      '<path d="M14.7 6.3a4.5 4.5 0 0 0 6 6l-9 9a2.8 2.8 0 0 1-4-4z"/><path d="m14.7 6.3 3-3a4.5 4.5 0 0 1 3 7.6"/>',
    key: '<circle cx="7.5" cy="15.5" r="4"/><path d="m10.5 12.5 9-9M17 6l2.5 2.5M14.5 8.5 17 11"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    door: '<path d="M4 21h16"/><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M14 12h.01"/>',
    logout:
      '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
    pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    image:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
    camera:
      '<path d="M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    video:
      '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 9h20M7 5 5 9M12 5l-2 4M17 5l-2 4"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    "arrow-left": '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    briefcase:
      '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M2 13h20"/>',
    languages:
      '<path d="M3 6h10M8 3v3"/><path d="M11 6c0 5-4 9-8 9"/><path d="M6 11c1.5 2.5 4 4 6.5 4.5"/><path d="m13 21 4.5-10L22 21M14.8 17h5.4"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    snowflake:
      '<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11"/><path d="M12 6 9.5 3.5M12 6l2.5-2.5M12 18l-2.5 2.5M12 18l2.5 2.5"/>',
    dot: '<circle cx="12" cy="12" r="6"/>',
    "badge-check":
      '<path d="m12 2 2.4 2.1 3.2-.4 1 3 2.9 1.3-1.2 3 1.2 3-2.9 1.3-1 3-3.2-.4L12 22l-2.4-2.1-3.2.4-1-3L2.5 15.3l1.2-3-1.2-3 2.9-1.3 1-3 3.2.4z"/><path d="m9 12 2 2 4-4"/>',
    "new": '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M7 15V9l4 6V9M15 15V9h3M15 12h2.5"/>',

    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14h1M14 20h3M20 17.5v3.5"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    "align-center": '<path d="M4 6h16M7 12h10M4 18h16"/>',
    "arrow-up": '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    wand: '<path d="m15 3.5 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z"/><path d="M4 20.6 13.6 11l1.4 1.4L5.4 22z"/><path d="m20 13.5.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z"/>',
    printer:
      '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/><path d="M18 12.5h.01"/>',
    award:
      '<circle cx="12" cy="9" r="5.5"/><path d="m8.2 13.6-1.2 8.4 5-2.6 5 2.6-1.2-8.4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5 5 0 0 1 0 10H10"/>',
  };

  // Ranglari ma'noga bog'liq bo'lgan ikonkalar (statuslar, medallar).
  // currentColor o'rniga qat'iy rang beriladi.
  var FIXED_COLOR = {
    "dot-green": ["dot", "#10b981"],
    "dot-red": ["dot", "#ef4444"],
    "dot-amber": ["dot", "#f59e0b"],
    "dot-gray": ["dot", "#94a3b8"],
    "medal-gold": ["medal", "#eab308"],
    "medal-silver": ["medal", "#94a3b8"],
    "medal-bronze": ["medal", "#d97706"],
    "heart-green": ["heart", "#10b981"],
  };

  // ─────────────────────────────────────────────────────────────
  // 2. EMOJI → IKONKA
  // ─────────────────────────────────────────────────────────────
  var EMOJI_MAP = {
    // ── Ko'p belgili ketma-ketliklar ──────────────────────────
    // Bular BITTA ikonka berishi kerak. Regexp alternatsiyasi
    // birinchi mos kelganini oladi, shuning uchun pastda `chars`
    // uzunligi bo'yicha teskari tartiblanadi — aks holda
    // "🧑‍💻" → 🧑 + 💻 (2 ta ikonka) bo'lib ketadi.
    "🧑‍💻": "student",
    "👨‍👩‍👦": "family",
    "✓✓": "check-double",

    "✅": "check-circle",
    "✓": "check",
    "❌": "x-circle",
    "✕": "x",
    "⚠": "alert",
    "❓": "help",
    "⛔": "ban",
    "🚫": "ban",
    "➕": "plus",
    "➖": "minus",
    "☰": "menu",

    "🪙": "coin",
    "💰": "wallet",
    "💵": "banknote",
    "💸": "money-send",
    "💎": "gem",
    "🔶": "diamond",

    "🎁": "gift",
    "🛒": "cart",
    "🛍": "bag",
    "📦": "package",
    "🧾": "receipt",
    "🏷": "tag",

    "👤": "user",
    "🧑": "user",
    "👨": "user",
    "👩": "user",
    "👦": "user",
    "👥": "users",
    "👪": "family",
    "👑": "crown",
    "🎓": "graduation-cap",
    "👁": "eye",
    "👀": "eye",
    "😊": "smile",
    "👍": "thumbs-up",
    "👈": "hand",
    "👆": "hand",
    "👋": "hand",
    "👏": "hand",
    "🙏": "hand",
    "💪": "muscle",

    "📅": "calendar",
    "📆": "calendar-days",
    "🗓": "calendar-days",
    "🕐": "clock",
    "⏰": "alarm",
    "⏱": "timer",
    "⏳": "hourglass",

    "📚": "books",
    "📖": "book-open",
    "📗": "book",
    "📘": "book",
    "📋": "clipboard",
    "📄": "file",
    "📁": "folder",
    "📂": "folder",
    "🗂": "folders",
    "✏": "pencil",
    "📝": "note",
    "🗑": "trash",
    "💾": "save",
    "📐": "ruler",
    "🔗": "link",
    "📎": "paperclip",

    "📊": "chart",
    "📈": "trend-up",
    "📉": "trend-down",
    "🎯": "target",
    "🏆": "trophy",
    "🏅": "medal",
    "🥇": "medal-gold",
    "🥈": "medal-silver",
    "🥉": "medal-bronze",
    "⭐": "star",
    "🌟": "star",
    "🔥": "fire",
    "⚡": "zap",
    "✨": "sparkles",
    "🎉": "party",
    "🎂": "cake",
    "❤": "heart",
    "💚": "heart-green",
    "💔": "heart-crack",
    "🎨": "palette",
    "🌈": "rainbow",
    "💯": "badge-check",
    "🆕": "new",

    "💬": "chat",
    "📨": "mail",
    "📧": "mail",
    "✉": "mail",
    "📥": "inbox",
    "📤": "upload",
    "⬇": "download",
    "✈": "send",
    "📞": "phone",
    "📱": "smartphone",
    "💻": "laptop",
    "🤖": "bot",
    "🔍": "search",
    "🔄": "refresh",
    "⚙": "settings",
    "🔧": "wrench",
    "🔑": "key",
    "🔐": "lock",
    "🚪": "logout",
    "🏠": "home",
    "📍": "pin",
    "🖼": "image",
    "📷": "camera",
    "📸": "camera",
    "🎬": "video",
    "💼": "briefcase",
    "🔤": "languages",
    "💡": "info",
    "☀": "sun",
    "🌙": "moon",
    "❄": "snowflake",

    "🟢": "dot-green",
    "🔴": "dot-red",
    "🟡": "dot-amber",
    "⚪": "dot-gray",

    "▶": "play",
    "◀": "chevron-left",
    "⬅": "arrow-left",
    "➡": "arrow-right",
    "ℹ": "info",

    "🎖": "award",
    "↩": "undo",
    "🔳": "qr",
    "🔎": "search",
    "🔢": "hash",
    "↔": "align-center",
    "⬆": "arrow-up",
    "🪄": "wand",
    "♻": "refresh",
    "🖨": "printer",
  };

  // Bayroqlar (regional indicator juftliklari) — matn yonida "UZ/РУ/EN"
  // allaqachon bor, shuning uchun butunlay olib tashlanadi.
  var FLAGS = ["🇺🇿", "🇷🇺", "🇬🇧"];

  // ─────────────────────────────────────────────────────────────
  // 3. SVG QURISH
  // ─────────────────────────────────────────────────────────────
  var SVG_HEAD =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" focusable="false">';

  function iconSvg(name) {
    var color = null;
    if (FIXED_COLOR[name]) {
      color = FIXED_COLOR[name][1];
      name = FIXED_COLOR[name][0];
    }
    var body = ICONS[name];
    if (!body) return "";
    // "dot" va "star" kabi to'ldiriladigan ikonkalar
    var filled = name === "dot";
    var head = SVG_HEAD;
    if (color) head = head.replace('stroke="currentColor"', 'stroke="' + color + '"');
    if (filled) {
      head = head.replace(
        'fill="none"',
        'fill="' + (color || "currentColor") + '"',
      );
    }
    return head + body + "</svg>";
  }

  /**
   * Ikonka HTML'i. Sahifa kodidan to'g'ridan-to'g'ri chaqirsa ham bo'ladi:
   *   IC('coin')                 → currentColor, 1em
   *   IC('coin', {size:'20px'})  → belgilangan o'lcham
   *   IC('coin', {color:'#f59e0b'})
   */
  function IC(name, opts) {
    var svg = iconSvg(name);
    if (!svg) return "";
    opts = opts || {};
    var st = "";
    if (opts.size) st += "width:" + opts.size + ";height:" + opts.size + ";";
    if (opts.color) st += "color:" + opts.color + ";";
    return (
      '<span class="ic' +
      (opts.cls ? " " + opts.cls : "") +
      '"' +
      (st ? ' style="' + st + '"' : "") +
      ">" +
      svg +
      "</span>"
    );
  }
  window.IC = IC;
  window.EDU_ICONS = ICONS;
  window.EDU_EMOJI_MAP = EMOJI_MAP;

  // ─────────────────────────────────────────────────────────────
  // 4. RUNTIME QATLAM — emoji → ikonka
  // ─────────────────────────────────────────────────────────────

  // Variation selector (U+FE0F / U+FE0E) — qidiruvdan oldin tozalanadi
  var VS = /[\uFE0F\uFE0E]/g;
  var ZWJ = "\u200D";
  var SKIN_RE = /[\uD83C][\uDFFB-\uDFFF]/g;

  // Modifikatorlar: variation selector + teri rangi (👋🏽)
  var MODS = "(?:[\\uFE0E\\uFE0F]|[\\uD83C][\\uDFFB-\\uDFFF])*";
  // Har qanday emoji belgisi — ZWJ dumidagi bo'laklar uchun
  var ANY_EMOJI =
    "(?:[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|" +
    "[\\u2190-\\u21FF\\u2300-\\u23FF\\u25A0-\\u27BF\\u2B00-\\u2BFF])";
  // ZWJ ketma-ketligining qolgan bo'laklari: 🧑‍💻, 👨‍👩‍👦, 🧑‍🏫 …
  // Butun ketma-ketlik BITTA moslik bo'lib tutiladi → BITTA ikonka.
  var ZWJ_TAIL = "(?:\\u200D" + ANY_EMOJI + MODS + ")*";

  // Almashtiriladigan belgilar regexp'i — faqat xaritadagilar.
  // TARTIB MUHIM: uzunroq variantlar oldin turishi shart, chunki
  // regexp alternatsiyasi birinchi mos kelganini oladi.
  // ("✓✓" → "✓" dan oldin, "🧑‍💻" → "🧑" dan oldin, bayroqlar → oldin)
  var chars = FLAGS.concat(Object.keys(EMOJI_MAP))
    .sort(function (a, b) {
      return b.length - a.length;
    })
    .map(function (c) {
      return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
  var EMOJI_RE = new RegExp(
    "(?:" + chars.join("|") + ")" + MODS + ZWJ_TAIL,
    "g",
  );

  // ── O'lchamga qarab chiziq qalinligi ──────────────────────────
  // Emoji 1em bo'lgani uchun ikonka ham 1em. Lekin 48–140px'lik
  // dekorativ emoji (bo'sh holat rasmlari, vatermarklar) 2px'lik
  // stroke bilan juda qo'pol chiqadi. Ota-elementning inline
  // font-size'iga qarab yengilroq sinf qo'yamiz.
  // getComputedStyle ishlatilmaydi — u har bir tugunda style
  // recalc'ga majbur qiladi; bu yerda oddiy matn tahlili yetarli.
  var FS_RE = /font-size:\s*(\d+(?:\.\d+)?)px/;

  function nearestFontPx(el) {
    for (var i = 0, n = el; n && n.nodeType === 1 && i < 5; n = n.parentNode, i++) {
      var s = n.getAttribute && n.getAttribute("style");
      if (!s) continue;
      var m = FS_RE.exec(s);
      if (m) return parseFloat(m[1]);
    }
    return 0;
  }

  function sizeClass(px) {
    if (px >= 64) return "ic--xl";
    if (px >= 30) return "ic--lg";
    return "";
  }

  function toIconHtml(ch, cls) {
    var bare = ch.replace(VS, "");
    if (FLAGS.indexOf(bare) !== -1) return "";
    var name = EMOJI_MAP[bare];
    if (!name) {
      // Xaritada yo'q ZWJ ketma-ketligi (🧑‍🏫) yoki teri rangi (👋🏽).
      // Butun ketma-ketlik uchun BITTA ikonka — birinchi bo'lagiga qarab.
      var head = bare.split(ZWJ)[0].replace(SKIN_RE, "");
      if (FLAGS.indexOf(head) !== -1) return "";
      name = EMOJI_MAP[head];
    }
    return name ? IC(name, cls ? { cls: cls } : null) : "";
  }

  /** Matndan emoji'ni butunlay olib tashlaydi (alert/confirm/title uchun). */
  function stripEmoji(s) {
    return String(s == null ? "" : s)
      .replace(EMOJI_RE, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  window.stripEmoji = stripEmoji;

  var SKIP_TAGS = {
    SCRIPT: 1,
    STYLE: 1,
    TEXTAREA: 1,
    INPUT: 1,
    SELECT: 1,
    OPTION: 1,
    SVG: 1,
    CODE: 1,
    PRE: 1,
  };

  function skipNode(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP_TAGS[n.tagName]) return true;
      // O'zimiz qo'ygan ikonka — qayta ishlanmaydi
      if (n.classList && n.classList.contains("ic")) return true;
      if (n.hasAttribute && n.hasAttribute("data-emoji-ok")) return true;
      if (n.namespaceURI === "http://www.w3.org/2000/svg") return true;
    }
    return false;
  }

  /** Foydalanuvchi ataylab emoji saqlashni so'ragan subtree (chat tanlagichi). */
  function emojiOk(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (n.hasAttribute && n.hasAttribute("data-emoji-ok")) return true;
    }
    return false;
  }

  /** Bitta matn tugunini almashtiradi. */
  function convertTextNode(node) {
    var txt = node.nodeValue;
    if (!txt) return;
    EMOJI_RE.lastIndex = 0;
    if (!EMOJI_RE.test(txt)) return;
    if (skipNode(node.parentNode)) return;

    EMOJI_RE.lastIndex = 0;
    var cls = sizeClass(nearestFontPx(node.parentNode));
    var frag = document.createDocumentFragment();
    var last = 0,
      m;
    while ((m = EMOJI_RE.exec(txt)) !== null) {
      if (m.index > last)
        frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
      var html = toIconHtml(m[0], cls);
      if (html) {
        var tmp = document.createElement("span");
        tmp.innerHTML = html;
        frag.appendChild(tmp.firstChild);
      }
      last = m.index + m[0].length;
    }
    if (last < txt.length)
      frag.appendChild(document.createTextNode(txt.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  // Atributlardagi emoji — SVG qo'yib bo'lmaydi, shuning uchun olib tashlanadi
  // "label" — <optgroup> uchun (hozir ishlatilmasa ham, keyin qo'shilsa
  // emoji o'z-o'zidan tozalanadi; atributga SVG qo'yib bo'lmaydi).
  var TEXT_ATTRS = ["placeholder", "title", "aria-label", "alt", "label"];

  function convertAttrs(el) {
    if (el.hasAttribute && el.hasAttribute("data-emoji-ok")) return;
    for (var i = 0; i < TEXT_ATTRS.length; i++) {
      var a = TEXT_ATTRS[i];
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      var v = el.getAttribute(a);
      EMOJI_RE.lastIndex = 0;
      if (EMOJI_RE.test(v)) el.setAttribute(a, stripEmoji(v));
    }
    // <option> matni — SVG qo'yib bo'lmaydi
    if (el.tagName === "OPTION") {
      EMOJI_RE.lastIndex = 0;
      if (EMOJI_RE.test(el.textContent))
        el.textContent = stripEmoji(el.textContent);
    }
  }

  function convertTree(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      // i18n qatlami option.textContent'ni QAYTA yozadi va emoji'ni
      // tiklaydi. Bunda kuzatuvchiga faqat matn tugunining o'zi keladi —
      // ota-onasi OPTION bo'lgani uchun skipNode() uni butunlay chetlab
      // o'tar edi. Shu sababli bu holatni alohida ushlaymiz.
      var tp = root.parentNode;
      if (tp && tp.nodeType === 1 && tp.tagName === "OPTION")
        return convertAttrs(tp);
      return convertTextNode(root);
    }
    if (root.nodeType !== 1) return;
    if (skipNode(root)) {
      // Subtree'ga SVG qo'yilmaydi, lekin atributlar va <option> matni
      // baribir tozalanadi — u yerga SVG qo'yib bo'lmaydi.
      // data-emoji-ok esa butunlay tegilmaydi.
      if (emojiOk(root)) return;
      convertAttrs(root);
      var opts = root.querySelectorAll
        ? root.querySelectorAll("option,optgroup,input,textarea,[title],[alt],[aria-label]")
        : [];
      for (var k = 0; k < opts.length; k++) convertAttrs(opts[k]);
      return;
    }

    convertAttrs(root);
    var els = root.querySelectorAll("*");
    for (var i = 0; i < els.length; i++) convertAttrs(els[i]);

    // Matn tugunlarini oldin yig'ib olamiz (DOM o'zgarishi walker'ni buzmasin)
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [],
      n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (var j = 0; j < nodes.length; j++) convertTextNode(nodes[j]);
  }

  var queue = [];
  var scheduled = false;

  // Observer uzilmaydi (uzilsa boshqa kod kiritgan o'zgarishlar yo'qoladi) —
  // o'rniga skipNode() o'zimiz qo'ygan `.ic` spanlarni chetlab o'tadi.
  function flush() {
    scheduled = false;
    var batch = queue;
    queue = [];
    for (var i = 0; i < batch.length; i++) {
      var node = batch[i];
      if (node.isConnected === false) continue;
      convertTree(node);
    }
  }

  function schedule(node) {
    queue.push(node);
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || setTimeout)(flush, 0);
  }

  var observer = null;
  function observe() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TEXT_ATTRS,
    });
  }

  function start() {
    convertTree(document.body);
    observer = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "characterData") schedule(m.target);
        else if (m.type === "attributes") schedule(m.target);
        else
          for (var j = 0; j < m.addedNodes.length; j++)
            schedule(m.addedNodes[j]);
      }
    });
    observe();
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);

  // ─────────────────────────────────────────────────────────────
  // 5. NATIV DIALOGLAR — SVG ishlamaydi, emoji shunchaki olib tashlanadi
  // ─────────────────────────────────────────────────────────────
  ["alert", "confirm", "prompt"].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig !== "function") return;
    window[fn] = function (msg) {
      var args = Array.prototype.slice.call(arguments);
      args[0] = stripEmoji(msg);
      return orig.apply(window, args);
    };
  });

  var _setTitle = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "title",
  );
  if (_setTitle && _setTitle.set) {
    Object.defineProperty(document, "title", {
      get: function () {
        return _setTitle.get.call(document);
      },
      set: function (v) {
        _setTitle.set.call(document, stripEmoji(v));
      },
      configurable: true,
    });
  }
})();
