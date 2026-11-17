import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { colorOfStatus, statusLabel, typeColor, typeLabel } from "../lib/hydrants";
import { SP_CENTER, mapView } from "../lib/mapView";

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function buildIcon(h, idx) {
  const bg = typeColor[h.type] || typeColor.outro;
  const ring = colorOfStatus(h.status);
  const label = idx != null ? String(idx) : (h.code || "H").slice(-3);
  return L.divIcon({
    className: "hydrant-pin",
    html: `<div class="hydrant-pin-inner" style="background:${bg};outline:3px solid ${ring};outline-offset:-5px"><span>${escapeHtml(label)}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -28],
  });
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

export default function HydrantMap({ tiles, hydrants, gps, routeOrder, routePolyline, fitKey }) {
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
        style={{ height: "100%", width: "100%", minHeight: "420px" }}
        scrollWheelZoom
      >
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
            <Marker key={h.id} position={[h.lat, h.lon]} icon={buildIcon(h, idx)}>
              <Popup>
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
        {routePolyline && routePolyline.length > 1 && (
          <Polyline positions={routePolyline} pathOptions={ROUTE_LINE} />
        )}
      </MapContainer>
    </div>
  );
}
