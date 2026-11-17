import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { colorOfStatus, statusLabel, typeColor, typeLabel } from "../lib/hydrants";
import { SP_CENTER, mapView } from "../lib/mapView";

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Ícones já criados, por cor do tipo, cor da situação e texto. Com o mesmo objeto, o react-leaflet não redesenha o
// marcador: digitar na busca ou mudar o filtro não recria os até ~330 ícones da estação.
const ICONS = new Map();

/** Ícone do marcador: cor do tipo no preenchimento, cor da situação no contorno e a ordem na rota (ou o código). */
export function hydrantIcon(h, idx) {
  const bg = typeColor[h.type] || typeColor.outro;
  const ring = colorOfStatus(h.status);
  const label = idx != null ? String(idx) : (h.code || "H").slice(-3);
  const key = `${bg}|${ring}|${label}`;
  let icon = ICONS.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: "hydrant-pin",
      html: `<div class="hydrant-pin-inner" style="background:${bg};outline:3px solid ${ring};outline-offset:-5px"><span>${escapeHtml(label)}</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -28],
    });
    ICONS.set(key, icon);
  }
  return icon;
}

const gpsIcon = L.divIcon({
  className: "gps-pin",
  html: `<div class="gps-pin-dot"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Aplica o enquadramento (veja lib/mapView.js) só quando `fitKey` muda (troca de estação, primeiros pontos,
// fim da geocodificação, GPS obtido), para o mapa não "pular" enquanto o usuário navega.
function FitView({ view, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!view) return;
    if (view.bounds) map.fitBounds(L.latLngBounds(view.bounds), { padding: [40, 40], maxZoom: 15 });
    else map.setView(view.center, view.zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

// Linha da rota: mesma cor de "route" no tema (o Leaflet desenha em SVG e precisa do valor).
const ROUTE_LINE = { color: "#38BDF8", weight: 4, opacity: 0.85, dashArray: "8 6" };

// Leva o mapa até um hidrante e abre o popup dele (toque num cartão da lista, no celular). `focus.n` muda a cada
// pedido, para o mesmo hidrante poder ser pedido de novo.
const FOCUS_ZOOM = 17;
function FocusHydrant({ focus, hydrants, markers }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const h = hydrants.find((x) => x.id === focus.id);
    const marker = markers.current.get(focus.id);
    if (!h || !marker) return;
    map.setView([h.lat, h.lon], Math.max(map.getZoom(), FOCUS_ZOOM), { animate: false });
    marker.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n, map]);
  return null;
}

// Tela de toque (celular): botões de zoom no canto inferior esquerdo, perto do polegar, deixando o topo do mapa livre
// para o popup. No computador, no canto superior esquerdo, como de costume.
const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
// Ao abrir, o popup é deslocado para não ficar sob o selo "N hidrantes no mapa" (topo) e os botões de zoom, nem
// colado nas bordas.
// No celular, o popup também fica mais estreito, para caber no mapa (cerca de 330 px de largura) com folga.
const POPUP_PAN = TOUCH
  ? { autoPanPaddingTopLeft: [12, 48], autoPanPaddingBottomRight: [12, 24], maxWidth: 250 }
  : { autoPanPaddingTopLeft: [12, 84], autoPanPaddingBottomRight: [12, 24] };

const POPUP_MARGIN_PX = 8;
const AUTOPAN_WAIT_MS = 300; // o autoPan do Leaflet anima por ~250 ms; o ajuste roda depois dele

// O autoPan do Leaflet só enxerga os limites do mapa. Com a página rolada, o topo do mapa fica atrás do
// cabeçalho fixo e o popup pode abrir escondido ali. Depois que o popup abre, se o topo dele estiver atrás do
// cabeçalho, desloca o mapa para baixo só o necessário para ele aparecer inteiro.
function KeepPopupBelowHeader() {
  const map = useMapEvents({
    popupopen(e) {
      setTimeout(() => {
        const popupEl = e.popup.getElement();
        const header = document.querySelector("header");
        if (!popupEl || !e.popup.isOpen() || !header) return;
        const hidden = header.getBoundingClientRect().bottom + POPUP_MARGIN_PX - popupEl.getBoundingClientRect().top;
        if (hidden > 0) map.panBy([0, -hidden]);
      }, AUTOPAN_WAIT_MS);
    },
  });
  return null;
}

export default function HydrantMap({ tiles, hydrants, gps, routeOrder, routePolyline, fitKey, focus }) {
  const markers = useRef(new Map()); // id do hidrante → marcador do Leaflet (para abrir o popup pelo foco)
  const geocoded = useMemo(() => hydrants.filter((h) => h.lat != null && h.lon != null), [hydrants]);
  const view = useMemo(() => mapView(geocoded.map((h) => [h.lat, h.lon]), gps), [geocoded, gps]);

  const orderIndex = useMemo(() => {
    if (!routeOrder) return null;
    const map = new Map();
    routeOrder.forEach((id, i) => map.set(id, i + 1));
    return map;
  }, [routeOrder]);

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border border-line relative z-0 isolate" data-testid="hydrant-map">
      <MapContainer
        center={SP_CENTER}
        zoom={12}
        // Ocupa exatamente o quadro do mapa. Uma altura mínima fixa aqui cortava a parte de baixo no celular
        // (marcadores e a linha de créditos dos mapas, exigida pela licença), onde o quadro é mais baixo.
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
        zoomControl={false}
      >
        <ZoomControl position={TOUCH ? "bottomleft" : "topleft"} />
        {/* Só desenha o fundo depois de saber o provedor, para não carregar dois mapas. */}
        {tiles && (
          <TileLayer
            key={tiles.url}
            url={tiles.url}
            attribution={tiles.attribution}
            maxZoom={tiles.maxZoom}
            crossOrigin={tiles.crossOrigin}
          />
        )}
        <FitView view={view} fitKey={`${fitKey}:${!!gps}`} />
        <KeepPopupBelowHeader />
        {gps && (
          <Marker position={[gps.lat, gps.lon]} icon={gpsIcon}>
            <Popup>Sua localização atual</Popup>
          </Marker>
        )}
        {geocoded.map((h) => {
          const idx = orderIndex?.get(h.id);
          return (
            <Marker key={h.id} position={[h.lat, h.lon]} icon={hydrantIcon(h, idx)}
              ref={(m) => (m ? markers.current.set(h.id, m) : markers.current.delete(h.id))}>
              <Popup {...POPUP_PAN}>
                <div className="hydrant-popup">
                  <div className="hydrant-popup__code">{h.code}</div>
                  <div className="hydrant-popup__kind">
                    {typeLabel[h.type] || h.type_label} ·{" "}
                    <span style={{ color: colorOfStatus(h.status) }}>
                      {statusLabel[h.status] || h.status_label}
                    </span>
                  </div>
                  <div className="hydrant-popup__address">{h.address}</div>
                  <div className="hydrant-popup__meta">
                    {h.municipality} · Setor {h.sector || "—"}{h.flow ? ` · Vazão ${h.flow}` : ""}
                  </div>
                  {h.location_source === "oficial" ? (
                    <div className="hydrant-popup__source text-ok">Posição oficial (mapa do CB SP)</div>
                  ) : (
                    <div className="hydrant-popup__source text-amber-500">Posição aproximada pelo endereço</div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
        <FocusHydrant focus={focus} hydrants={geocoded} markers={markers} />
        {routePolyline && routePolyline.length > 1 && (
          <Polyline positions={routePolyline} pathOptions={ROUTE_LINE} />
        )}
      </MapContainer>
    </div>
  );
}
