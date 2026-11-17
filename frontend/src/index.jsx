import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
// O CSS do Leaflet fica aqui, antes do index.css, para os ajustes do app (fonte, cores) prevalecerem; só o
// código do mapa é carregado à parte (components/MapPanel.jsx).
import "leaflet/dist/leaflet.css";
import "@/fonts";
import "@/index.css";
import App from "@/App";

ReactDOM.createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
