import { ref, watch, onMounted, onBeforeUnmount } from "vue";

/**
 * Ma'lumot yuklash: loading / error / data holatlari.
 * `deps` o'zgarsa qayta yuklanadi. `pollMs` berilsa — faqat sahifa ko'rinib
 * turganda davriy yangilanadi (fon tabda server bezovta qilinmaydi).
 */
export function useLoad(fn, { deps = null, pollMs = 0, immediate = true } = {}) {
  const data = ref(null);
  const loading = ref(false);
  const error = ref("");
  const updatedAt = ref(null);
  let seq = 0;
  let timer = null;

  async function reload(silent = false) {
    const my = ++seq;
    if (!silent) loading.value = true;
    error.value = "";
    try {
      const d = await fn();
      if (my !== seq) return;
      data.value = d;
      updatedAt.value = new Date();
    } catch (e) {
      if (my !== seq) return;
      if (!silent || !data.value) error.value = e.message || String(e);
    } finally {
      if (my === seq) loading.value = false;
    }
  }

  function tick() {
    clearTimeout(timer);
    if (!pollMs) return;
    timer = setTimeout(async () => {
      if (!document.hidden) await reload(true);
      tick();
    }, typeof pollMs === "function" ? pollMs() : pollMs);
  }
  const onVis = () => {
    if (!document.hidden && pollMs) reload(true);
  };

  if (deps) watch(deps, () => reload(), { deep: true });
  onMounted(() => {
    if (immediate) reload();
    tick();
    document.addEventListener("visibilitychange", onVis);
  });
  onBeforeUnmount(() => {
    clearTimeout(timer);
    seq++;
    document.removeEventListener("visibilitychange", onVis);
  });
  return { data, loading, error, reload, updatedAt, restartPoll: tick };
}
