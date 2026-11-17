import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(root, "src") },
  },
  server: {
    port: 3000,
    // Em desenvolvimento, /api vai para o backend local (uvicorn na porta 8001).
    proxy: { "/api": process.env.VITE_API_PROXY || "http://localhost:8001" },
  },
  build: {
    // O backend serve frontend/build (veja STATIC_DIR em backend/server.py e o Dockerfile).
    outDir: "build",
    sourcemap: false,
    // O mapa (Leaflet) é carregado à parte (veja components/MapPanel.jsx); o resto fica num pacote só.
    chunkSizeWarningLimit: 700,
  },
  // Testes do frontend (yarn test): navegador simulado (jsdom), sem rede; arquivos *.test.js(x) em src/.
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.js"],
    css: false,
  },
});
