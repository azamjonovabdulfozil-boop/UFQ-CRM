// Sozlamalar sahifasining chap menyusi: ikonkalar va tanlangan bo'limni eslab qolish.
import { ref } from "vue";

const svg = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const SETT_ICONS = {
  look: svg('<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6C22 6 17.5 2 12 2z"/>'),
  brand: svg('<path d="M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l8.6-8.6a1 1 0 0 0 0-1.4z"/><circle cx="7" cy="7" r="1.5"/>'),
  access: svg('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M19 8v6M16 11h6"/>'),
  devices: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
  data: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>'),
  menu: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
};

const KEY = "edumanage_settings_tab";

// Super Admin «Menyu bo'limlari» ni shu rol uchun yopsa — false bo'ladi
// (core/nav-visibility.js /api/modules/me dan olib, shu yerga yozadi).
export const settingsMenuAllowed = ref(true);
if (typeof window !== "undefined") {
  window.__setSettingsMenuAllowed = (v) => {
    settingsMenuAllowed.value = v !== false;
  };
}

export function useSettingsTab(ids) {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch (e) {}
  const tab = ref(ids.includes(saved) ? saved : ids[0]);
  function open(id) {
    tab.value = id;
    try {
      localStorage.setItem(KEY, id);
    } catch (e) {}
    document.getElementById("scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  }
  return { tab, open };
}
