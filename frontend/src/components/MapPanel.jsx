import { MapPin } from "lucide-react";
import HydrantMap from "./HydrantMap";

/** Quadro do mapa: contagem de hidrantes no mapa, aviso de mapa alternativo e o mapa em si. */
export default function MapPanel({ tiles, mapFallback, hydrants, gps, route, fitKey, onMap, allOnMap, filtering }) {
  const routeOrder = route?.stops.map((s) => s.hydrant.id);
  // A rota sempre parte da localização usada no cálculo (GPS ou centro de SP).
  const routePolyline = route
    ? [[route.origin.lat, route.origin.lon], ...route.stops.map((s) => [s.hydrant.lat, s.hydrant.lon])]
    : null;

  return (
    <div className="tactical-card p-3 h-[400px] sm:h-[500px] relative">
      <div className="absolute top-5 right-5 z-[500] flex items-center gap-2 px-3 py-1.5 rounded-full bg-page/85 border border-line backdrop-blur-md">
        <MapPin className="w-3.5 h-3.5 text-fire" />
        <span className="font-mono-t text-[10px] uppercase tracking-widest text-slate-300" data-testid="map-count">
          {filtering ? `${onMap} de ${allOnMap} no mapa · filtro ativo` : `${onMap} hidrantes no mapa`}
        </span>
      </div>
      {mapFallback && (
        <div
          className="absolute bottom-10 left-5 z-[500] max-w-[75%] px-3 py-1.5 rounded-md bg-page/85 border border-amber-500/40 backdrop-blur-md font-mono-t text-[10px] uppercase tracking-widest text-amber-300"
          data-testid="map-fallback"
          title="O MapTiler recusou a chave do mapa (cota esgotada ou chave inválida). O app passou a usar o OpenStreetMap, que tem menos zoom."
        >
          Mapa alternativo em uso (OpenStreetMap)
        </div>
      )}
      <HydrantMap
        tiles={tiles}
        hydrants={hydrants}
        gps={gps}
        routeOrder={routeOrder}
        routePolyline={routePolyline}
        fitKey={fitKey}
      />
    </div>
  );
}
