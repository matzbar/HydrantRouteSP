import { Suspense, lazy } from "react";
import { Loader2, MapPin } from "lucide-react";

// O mapa (Leaflet) é a maior parte do código do app. Carregado à parte, ele não atrasa o resto da página:
// lista, estação e rota aparecem primeiro, e o mapa chega logo depois.
const HydrantMap = lazy(() => import("./HydrantMap"));

/** Quadro do mapa: contagem de hidrantes no mapa, aviso de mapa alternativo e o mapa em si. */
export default function MapPanel({ tiles, mapFallback, hydrants, gps, route, fitKey, onMap, allOnMap, filtering }) {
  const routeOrder = route?.stops.map((s) => s.hydrant.id);
  // A rota sempre parte da localização usada no cálculo (GPS ou centro de SP).
  const routePolyline = route
    ? [[route.origin.lat, route.origin.lon], ...route.stops.map((s) => [s.hydrant.lat, s.hydrant.lon])]
    : null;

  return (
    // isolate: as camadas dos selos (z-[500], acima do mapa) valem só dentro deste quadro; o cabeçalho fixo e o
    // resultado da rota ficam por cima deles.
    <div className="tactical-card p-3 h-[400px] sm:h-[500px] relative isolate">
      <div className="absolute top-5 right-5 z-[500] flex items-center gap-2 px-3 py-1.5 rounded-full bg-page/85 border border-line backdrop-blur-md">
        <MapPin className="w-3.5 h-3.5 text-fire" />
        <span className="font-mono-t text-label uppercase tracking-widest text-slate-300" data-testid="map-count">
          {filtering ? `${onMap} de ${allOnMap} no mapa · filtro ativo` : `${onMap} hidrantes no mapa`}
        </span>
      </div>
      {mapFallback && (
        <div
          className="absolute bottom-10 left-5 z-[500] max-w-[75%] px-3 py-1.5 rounded-md bg-page/85 border border-amber-500/40 backdrop-blur-md font-mono-t text-label uppercase tracking-widest text-amber-300"
          data-testid="map-fallback"
          title="O MapTiler recusou a chave do mapa (cota esgotada ou chave inválida). O app passou a usar o OpenStreetMap, que tem menos zoom."
        >
          Mapa alternativo em uso (OpenStreetMap)
        </div>
      )}
      <Suspense fallback={<MapLoading />}>
        <HydrantMap
          tiles={tiles}
          hydrants={hydrants}
          gps={gps}
          routeOrder={routeOrder}
          routePolyline={routePolyline}
          fitKey={fitKey}
        />
      </Suspense>
    </div>
  );
}

function MapLoading() {
  return (
    <div className="w-full h-full rounded-lg border border-line bg-page flex items-center justify-center gap-2 text-sm text-slate-400"
      data-testid="map-loading">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando mapa...
    </div>
  );
}
