import { defineConfig, loadEnv } from 'vite';

import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      // whitespace: "preserve" — shablon bo'shliqlari xom HTML dagidek qoladi,
      // shuning uchun DOM tuzilishi eski app-shell.html bilan bir xil.
      vue({ template: { compilerOptions: { whitespace: "preserve" } } }),
    ],

    base: "/",

    define: {
      // PROD backend — faqat localhost BO'LMAGAN muhitda ishlatiladi
      // (main.js dagi resolveBackend() qarang).
      __API_BASE__: JSON.stringify(
        env.VITE_API_URL || "https://ufq-crm-fxh5.onrender.com"
      ),
      // Localda backend qaysi portda turadi (backend/.env dagi PORT)
      __LOCAL_API_PORT__: JSON.stringify(env.LOCAL_API_PORT || "3000"),
      // Har build uchun yangi belgi — core skriptlar keshda qolib ketmasin
      __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
    },

    server: {
      // Har bir portal o'z portida — uchalasini bir vaqtda ochish mumkin
      port: 5175,
      strictPort: false,

      proxy: {
        // Dev rejimda /api LOKAL backend'ga boradi.
        // Prod backend'ni sinash uchun: VITE_API_URL=https://... npm run dev
        "/api": {
          target: env.VITE_API_URL_DEV || "http://localhost:3000",
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },

    build: {
      outDir: "dist",
      assetsDir: "assets",
      emptyOutDir: true,
    },
  };
});
