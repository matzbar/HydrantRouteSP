import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage, optimizeRoute } from "../lib/api";

/**
 * Cálculo da rota otimizada e o diálogo do resultado.
 *
 * Um novo cálculo, ou `clear()` (troca de estação ou de filtro), cancela o pedido em andamento: o resultado de uma
 * estação nunca aparece em outra.
 *
 * @returns {{ route: object | null, open: boolean, setOpen: Function, loading: boolean,
 *             generate: Function, clear: Function }}
 */
export default function useRoute() {
  const [route, setRoute] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef(null);

  const clear = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setRoute(null);
    setOpen(false);
  }, []);

  /**
   * @param {{lat: number, lon: number}} origin partida (GPS ou centro de SP)
   * @param {object[]} located hidrantes com coordenadas que podem entrar na rota
   * @param {object[]} visible hidrantes da lista filtrada (os sem coordenadas aparecem como "fora da rota")
   * @param {number} maxStops paradas pedidas
   * @param {string | null} startId primeira parada fixa
   */
  const generate = useCallback(async ({ origin, located, visible, maxStops, startId }) => {
    request.current?.abort();
    const current = new AbortController();
    request.current = current;
    setLoading(true);
    try {
      const result = await optimizeRoute({
        origin_lat: origin.lat,
        origin_lon: origin.lon,
        points: located.map((h) => ({ id: h.id, lat: h.lat, lon: h.lon })),
        max_stops: maxStops,
        start_id: startId,
      }, current.signal);
      if (current.signal.aborted) return; // a estação ou o filtro mudou durante o cálculo
      const byId = new Map(located.map((h) => [h.id, h]));
      setRoute({
        ...result,
        stops: result.stops.map((s) => ({ ...s, hydrant: byId.get(s.id) })).filter((s) => s.hydrant),
        unreachable: visible.filter((h) => !h.geocoded).map((h) => h.code),
        origin,
      });
      setOpen(true);
      toast.success(`Rota com ${result.stops.length} paradas gerada`);
    } catch (e) {
      if (!current.signal.aborted) toast.error(errorMessage(e, "Erro ao gerar rota"));
    } finally {
      if (request.current === current) {
        request.current = null;
        setLoading(false);
      }
    }
  }, []);

  return { route, open, setOpen, loading, generate, clear };
}
