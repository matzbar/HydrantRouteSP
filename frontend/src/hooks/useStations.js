import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listStations } from "../lib/api";
import { DEFAULT_STATION_CODE, selectionFromStation } from "../components/StationPicker";

// Usada se o índice de estações do CB SP não carregar: a estação padrão ainda pode ser consultada.
const DEFAULT_SELECTION = { cmd: "CBM", gb: "03", sgb: "1", code: DEFAULT_STATION_CODE };
const EMPTY_SELECTION = { cmd: "", gb: "", sgb: "", code: "" };

/**
 * Índice de estações do CB SP (carregado uma vez) e a estação escolhida, que começa na estação padrão.
 *
 * @returns {{ stations: object[], loading: boolean, sel: object, setSel: Function }}
 */
export default function useStations() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(EMPTY_SELECTION);

  useEffect(() => {
    let cancelled = false;
    listStations()
      .then((list) => {
        if (cancelled) return;
        setStations(list);
        const def = list.find((s) => s.code === DEFAULT_STATION_CODE);
        setSel(def ? selectionFromStation(def) : DEFAULT_SELECTION);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Não foi possível carregar a lista de estações do CB SP. Mostrando a estação padrão.");
        setSel(DEFAULT_SELECTION);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  return { stations, loading, sel, setSel };
}
