/**
 * 👑 Super Admin paneli — alohida sahifa (admin portali ichida).
 *
 * Sessiya admin portali bilan umumiy (httpOnly cookie). Sahifa ochilganda
 * sessiya SERVERDAN tiklanadi; rol `superadmin` bo'lmasa panel ochilmaydi.
 * Lekin asosiy himoya bu yerda emas — har bir /api/super/* so'rovi serverda
 * rol bo'yicha tekshiriladi.
 */
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";
import "./styles.css";

const PROD_API = typeof __API_BASE__ !== "undefined" && __API_BASE__ ? __API_BASE__ : "";
const LOCAL_API_PORT = typeof __LOCAL_API_PORT__ !== "undefined" ? String(__LOCAL_API_PORT__) : "3000";

function resolveBackend() {
  const { hostname, protocol, port } = window.location;
  const isLocal =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" ||
    hostname.endsWith(".local") || /^192\.168\./.test(hostname) || /^10\./.test(hostname);
  if (!isLocal) return { api: "", sse: PROD_API };
  // Backend panelni o'zi bergan bo'lsa (istalgan PORT) — API ham o'sha manzilda.
  // Boshqa portga faqat Vite dev/preview serveridan murojaat qilinadi.
  const base =
    port === LOCAL_API_PORT || !/^(5173|5174|5175|5176|5177|5178|4173)$/.test(port) ? "" : `${protocol}//${hostname}:${LOCAL_API_PORT}`;
  return { api: base, sse: base };
}
const backend = resolveBackend();
window.__API_BASE__ = backend.api;
window.__SSE_BASE__ = backend.sse;

createApp(App).use(router).mount("#super-app");
