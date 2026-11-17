import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
// O CSS do Leaflet fica aqui, antes do index.css, para os ajustes do app (fonte, cores) prevalecerem; só o
// código do mapa é carregado à parte (components/MapPanel.jsx).
import "leaflet/dist/leaflet.css";
import "@/fonts";
import "@/index.css";
import App from "@/App";

// Service worker (public/sw.js): deixa o app instalável e abre a "casca" sem internet. Só no site publicado.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* sem service worker o app funciona igual */ });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
