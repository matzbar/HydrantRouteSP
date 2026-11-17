import { useEffect, useState } from "react";
import { getConfig } from "../lib/api";
import { OSM_TILES, PROBE_INTERVAL_MS, maptilerAccepts, tilesFromConfig } from "../lib/mapTiles";

const DEFAULT_ROUTE_MAX_STOPS = 25; // até o backend informar o valor em uso (/api/config)

/**
 * Configuração pública do backend: mapa de fundo (MapTiler ou OpenStreetMap) e máximo de paradas por rota.
 * Com MapTiler, confere a chave antes de desenhar o fundo e depois a cada 15 min; se o MapTiler recusar, troca para
 * o OpenStreetMap até a página ser recarregada. Sem resposta do backend, OpenStreetMap.
 *
 * @returns {{ tiles: object | null, mapFallback: boolean, routeMaxStops: number }}
 */
export default function useMapConfig() {
  const [tiles, setTiles] = useState(null);
  const [mapFallback, setMapFallback] = useState(false); // MapTiler recusou: usando o OpenStreetMap
  const [routeMaxStops, setRouteMaxStops] = useState(DEFAULT_ROUTE_MAX_STOPS);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const fallBack = () => {
      setTiles(OSM_TILES);
      setMapFallback(true);
    };
    const watch = async (preferred) => {
      const ok = await maptilerAccepts(preferred);
      if (cancelled) return;
      if (ok === false) { fallBack(); return; }
      timer = setTimeout(() => watch(preferred), PROBE_INTERVAL_MS);
    };
    getConfig()
      .then(async (cfg) => {
        if (cancelled) return;
        if (cfg?.route?.max_stops > 0) setRouteMaxStops(cfg.route.max_stops);
        const preferred = tilesFromConfig(cfg);
        if (preferred.provider !== "maptiler") { setTiles(preferred); return; }
        // Antes de desenhar o fundo, confere a chave (até 3 s), para nunca mostrar os blocos "Invalid key".
        const ok = await maptilerAccepts(preferred, 3000);
        if (cancelled) return;
        if (ok === false) { fallBack(); return; }
        setTiles(preferred);
        timer = setTimeout(() => watch(preferred), PROBE_INTERVAL_MS);
      })
      .catch(() => !cancelled && setTiles(OSM_TILES));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { tiles, mapFallback, routeMaxStops };
}
