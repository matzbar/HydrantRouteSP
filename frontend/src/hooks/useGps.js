import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Localização do usuário, pedida ao abrir a página (o ponto aparece no mapa desde o início) e de novo em
 * "Atualizar GPS". Ela fica só no navegador até a rota ser gerada.
 *
 * @returns {{ gps: {lat: number, lon: number} | null, gpsErr: string | null, requestGps: Function }}
 */
export default function useGps() {
  const [gps, setGps] = useState(null);
  const [gpsErr, setGpsErr] = useState(null);

  const requestGps = useCallback(() => {
    if (!navigator.geolocation) { setGpsErr("GPS não suportado"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsErr(null);
        toast.success("Localização obtida");
      },
      () => {
        setGpsErr("Permissão negada - usando centro de SP");
        toast.warning("Sem GPS. Usando centro de São Paulo como origem");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => { requestGps(); }, [requestGps]);

  return { gps, gpsErr, requestGps };
}
