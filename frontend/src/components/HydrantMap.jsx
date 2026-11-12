import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { typeLabel, statusLabel, statusColor } from "./HydrantTable";

const SP_CENTER = [-23.5612, -46.6558];

const typeColor = { subterraneo: "#3B82F6", coluna: "#8B5CF6", bica: "#14B8A6" };

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function buildIcon(h, idx) {
  const bg = typeColor[h.type] || "#64748B";
  const ring = statusColor[h.status] || statusColor.outro;
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

// Reenquadra só quando `fitKey` muda (troca de estação, primeiros pontos, fim da geocodificação),
// para o mapa não "pular" enquanto o usuário navega.
function FitBounds({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

export default function HydrantMap({ hydrants, gps, routeOrder, routePolyline, fitKey }) {
  const geocoded = useMemo(() => hydrants.filter((h) => h.lat != null && h.lon != null), [hydrants]);
  const bounds = useMemo(() => {
    const pts = geocoded.map((h) => [h.lat, h.lon]);
    if (gps) pts.push([gps.lat, gps.lon]);
    return pts;
  }, [geocoded, gps]);

  const orderIndex = useMemo(() => {
    if (!routeOrder) return null;
    const map = new Map();
    routeOrder.forEach((id, i) => map.set(id, i + 1));
    return map;
  }, [routeOrder]);

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border border-[#26334D] relative z-0 isolate" data-testid="hydrant-map">
      <MapContainer
        center={SP_CENTER}
        zoom={12}
        style={{ height: "100%", width: "100%", minHeight: "420px" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={bounds} fitKey={`${fitKey}:${!!gps}`} />
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
                <div style={{ fontFamily: "Inter, sans-serif", minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{h.code}</div>
                  <div style={{ color: "#94A3B8", fontSize: 12, textTransform: "uppercase" }}>
                    {typeLabel[h.type] || h.type_label} ·{" "}
                    <span style={{ color: statusColor[h.status] || statusColor.outro }}>
                      {statusLabel[h.status] || h.status_label}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13 }}>{h.address}</div>
                  <div style={{ marginTop: 2, fontSize: 11, color: "#94A3B8" }}>
                    {h.municipality} · Setor {h.sector || "—"}{h.flow ? ` · Vazão ${h.flow}` : ""}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: h.location_source === "oficial" ? "#10B981" : "#F59E0B" }}>
                    {h.location_source === "oficial" ? "Posição oficial (mapa do CB SP)" : "Posição aproximada pelo endereço"}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
        {routePolyline && routePolyline.length > 1 && (
          <Polyline positions={routePolyline} pathOptions={{ color: "#38BDF8", weight: 4, opacity: 0.85, dashArray: "8 6" }} />
        )}
      </MapContainer>
    </div>
  );
}
