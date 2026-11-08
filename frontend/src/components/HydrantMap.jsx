import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";

const SP_CENTER = [-23.5612, -46.6558];

const typeColor = { subterraneo: "#3B82F6", coluna: "#8B5CF6" };
const statusRing = { possivel_de_uso: "#10B981", inoperante: "#EF4444", nao_localizado: "#F59E0B" };

function buildIcon(h, idx) {
  const bg = typeColor[h.type] || "#3B82F6";
  const ring = statusRing[h.status] || "#10B981";
  const label = idx != null ? String(idx) : (h.code || "H").slice(-3);
  return L.divIcon({
    className: "hydrant-pin",
    html: `<div class="hydrant-pin-inner" style="background:${bg};outline:3px solid ${ring};outline-offset:-5px"><span>${label}</span></div>`,
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

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [points, map]);
  return null;
}

export default function HydrantMap({ hydrants, gps, routeOrder, routePolyline }) {
  const geocoded = useMemo(() => hydrants.filter((h) => h.geocoded && h.lat && h.lon), [hydrants]);
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
        <FitBounds points={bounds} />
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
                    {h.type === "subterraneo" ? "Subterrâneo" : "Coluna"} ·{" "}
                    <span style={{ color: statusRing[h.status] }}>
                      {{ possivel_de_uso: "Possível de uso", inoperante: "Inoperante", nao_localizado: "Não localizado" }[h.status]}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13 }}>{h.address}</div>
                  <div style={{ marginTop: 2, fontSize: 11, color: "#94A3B8" }}>
                    {h.municipality} · Setor {h.sector || "—"}
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
