import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage, getStationHydrants, retryStationGeocode } from "../lib/api";

const POLL_MS = 3000;

/**
 * Hidrantes pendentes da estação, recarregados a cada POLL_MS enquanto houver endereços sendo localizados.
 * Trocar de estação limpa os dados da anterior.
 *
 * @param {string} code código da estação ("" = nenhuma)
 * @returns {{ data: object | null, loading: boolean, error: string | null, reload: Function, retryGeocode: Function }}
 *   data = { station, cycle, hydrants, geocode }
 */
export default function useStationData(code) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setData(null);
    setError(null);
  }, [code]);

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    let timer;
    const load = async (first) => {
      if (first) setLoading(true);
      try {
        const d = await getStationHydrants(code);
        if (cancelled) return;
        setData(d);
        setError(null);
        if (d.geocode.pending > 0) timer = setTimeout(() => load(false), POLL_MS);
      } catch (e) {
        if (cancelled) return;
        if (first) setError(errorMessage(e, "Falha ao carregar os hidrantes da estação."));
        else timer = setTimeout(() => load(false), POLL_MS * 2);
      } finally {
        if (first && !cancelled) setLoading(false);
      }
    };
    load(true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const retryGeocode = useCallback(async () => {
    try {
      await retryStationGeocode(code);
      toast.info("Localizando os endereços novamente");
      reload();
    } catch (e) {
      toast.error(errorMessage(e, "Não foi possível tentar novamente"));
    }
  }, [code, reload]);

  return { data, loading, error, reload, retryGeocode };
}
