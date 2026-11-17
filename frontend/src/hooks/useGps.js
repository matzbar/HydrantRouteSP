import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// "Agora não" fica lembrado neste aparelho: o aviso não volta a cada visita.
const CHOICE_KEY = "hydrantroute:gps";

function readChoice() {
  try { return localStorage.getItem(CHOICE_KEY); } catch { return null; }
}
function writeChoice(value) {
  try {
    if (value) localStorage.setItem(CHOICE_KEY, value);
    else localStorage.removeItem(CHOICE_KEY);
  } catch { /* navegação privada ou armazenamento bloqueado: só não lembra */ }
}

/** Estado da permissão de localização no navegador: "granted", "denied", "prompt" ou null (navegador não informa). */
async function permissionState() {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" });
    return status?.state ?? null;
  } catch {
    return null;
  }
}

/**
 * Localização do usuário. O navegador só pede a permissão depois de um toque ("Usar minha localização" no aviso
 * ou o botão do GPS), nunca sozinho ao abrir a página.
 *
 * Ao abrir: se a permissão já foi dada antes, a localização é obtida direto (sem pergunta); se foi bloqueada, avisa;
 * senão, mostra o aviso (`needsConsent`), a menos que a pessoa já tenha escolhido "Agora não" neste aparelho.
 * Ela fica só no navegador até a rota ser gerada.
 *
 * @returns {{ gps: {lat: number, lon: number} | null, gpsErr: string | null, needsConsent: boolean,
 *             requestGps: Function, declineGps: Function }}
 */
export default function useGps() {
  const [gps, setGps] = useState(null);
  const [gpsErr, setGpsErr] = useState(null);
  const [needsConsent, setNeedsConsent] = useState(false);

  const locate = useCallback(({ quiet = false } = {}) => {
    if (!navigator.geolocation) { setGpsErr("GPS não suportado"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsErr(null);
        if (!quiet) toast.success("Localização obtida");
      },
      (err) => {
        const blocked = err?.code === 1; // PERMISSION_DENIED
        setGpsErr(blocked ? "Localização bloqueada - usando centro de SP" : "GPS indisponível - usando centro de SP");
        toast.warning(blocked
          ? "Localização bloqueada no navegador. Usando o centro de São Paulo como partida."
          : "Não foi possível obter a localização. Usando o centro de São Paulo como partida.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Pedido feito por um toque: "Usar minha localização" ou o botão do GPS.
  const requestGps = useCallback(() => {
    writeChoice(null);
    setNeedsConsent(false);
    locate();
  }, [locate]);

  const declineGps = useCallback(() => {
    writeChoice("nao");
    setNeedsConsent(false);
    setGpsErr("GPS desativado - usando centro de SP");
  }, []);

  useEffect(() => {
    let cancelled = false;
    permissionState().then((state) => {
      if (cancelled) return;
      if (state === "granted") locate({ quiet: true }); // já permitido antes: o navegador não pergunta de novo
      else if (state === "denied") setGpsErr("Localização bloqueada - usando centro de SP");
      else if (readChoice() === "nao") setGpsErr("GPS desativado - usando centro de SP");
      else setNeedsConsent(true);
    });
    return () => { cancelled = true; };
  }, [locate]);

  return { gps, gpsErr, needsConsent, requestGps, declineGps };
}
