import { Download, Flame, Satellite } from "lucide-react";
import { Button } from "./ui/button";

/**
 * Cabeçalho fixo: marca do app, situação do GPS com o botão para pedir a localização e, quando dá para instalar,
 * o botão "Instalar app" (`onInstall` presente).
 */
export default function AppHeader({ gps, gpsErr, onRefreshGps, onInstall }) {
  // Sem localização, o botão ativa o GPS (e o navegador pergunta); com ela, atualiza a posição.
  const gpsAction = gps ? "Atualizar GPS" : "Ativar GPS";
  const gpsTitle = gps ? "GPS ativo · atualizar" : `${gpsErr || "GPS desativado"} · ativar`;
  // Botão quadrado do GPS: verde com a localização obtida; amarelo sem ela (recusada, bloqueada ou não pedida).
  // Fundo e contorno bem suaves, só para indicar o estado.
  const gpsButton = (testId) => (
    <Button size="icon" variant="ghost" onClick={onRefreshGps} data-testid={testId} aria-label={gpsAction} title={gpsTitle}
      className={`rounded-md border ${gps
        ? "bg-ok/10 border-ok/30 text-ok hover:bg-ok/20 hover:text-ok"
        : "bg-amber-400/10 border-amber-400/30 text-amber-400 hover:bg-amber-400/20 hover:text-amber-400"}`}>
      <Satellite className="w-5 h-5" />
    </Button>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/90 backdrop-blur-md safe-top">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-fire flex items-center justify-center" data-testid="logo">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-black uppercase tracking-wider leading-none">
              HydrantRoute <span className="text-fire">SP</span>
            </h1>
            <p className="text-label font-mono-t uppercase tracking-widest text-slate-400">
              {/* Em telas estreitas (celular), sem "Tactical ·", para caber numa linha ao lado dos botões. */}
              <span className="max-[419px]:hidden">Tactical · </span>CB SP · OSM/OSRM
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          {onInstall && (
            <Button size="sm" variant="ghost" onClick={onInstall} data-testid="install-app-btn"
              className="text-route hover:text-white hover:bg-elevated font-mono-t text-xs uppercase tracking-widest">
              <Download className="w-4 h-4 mr-2" aria-hidden="true" /> Instalar app
            </Button>
          )}
          <div className="flex items-center gap-2 text-xs font-mono-t uppercase tracking-widest" data-testid="gps-status">
            {gps ? (
              <span className="text-slate-300">GPS · {gps.lat.toFixed(4)}, {gps.lon.toFixed(4)}</span>
            ) : (
              <span className="text-amber-400">{gpsErr || "GPS aguardando"}</span>
            )}
          </div>
          {gpsButton("refresh-gps-btn")}
        </div>

        <div className="md:hidden flex items-center gap-1 flex-shrink-0">
          {onInstall && (
            <Button size="icon" variant="ghost" onClick={onInstall} data-testid="install-app-btn-mobile"
              aria-label="Instalar app" title="Instalar app" className="hover:bg-elevated">
              <Download className="w-5 h-5 text-route" />
            </Button>
          )}
          {gpsButton("refresh-gps-btn-mobile")}
        </div>
      </div>
    </header>
  );
}
