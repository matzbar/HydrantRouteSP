import { Flame, Satellite } from "lucide-react";
import { Button } from "./ui/button";

/** Cabeçalho fixo: marca do app e situação do GPS, com o botão para pedir a localização de novo. */
export default function AppHeader({ gps, gpsErr, onRefreshGps }) {
  const gpsIconColor = gps ? "text-ok" : "text-amber-400";
  // Sem localização, o botão ativa o GPS (e o navegador pergunta); com ela, atualiza a posição.
  const gpsAction = gps ? "Atualizar GPS" : "Ativar GPS";
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
              Tactical · CB SP · OSM/OSRM
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono-t uppercase tracking-widest" data-testid="gps-status">
            <Satellite className={`w-4 h-4 ${gpsIconColor}`} />
            {gps ? (
              <span className="text-slate-300">GPS · {gps.lat.toFixed(4)}, {gps.lon.toFixed(4)}</span>
            ) : (
              <span className="text-amber-400">{gpsErr || "GPS aguardando"}</span>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={onRefreshGps} data-testid="refresh-gps-btn"
            className="text-slate-300 hover:text-white hover:bg-elevated font-mono-t text-xs uppercase tracking-widest">
            {gpsAction}
          </Button>
        </div>

        <Button size="icon" variant="ghost" onClick={onRefreshGps} data-testid="refresh-gps-btn-mobile"
          aria-label={gpsAction} title={gps ? "GPS ativo · atualizar" : gpsErr || "GPS desativado · ativar"}
          className="md:hidden flex-shrink-0 hover:bg-elevated">
          <Satellite className={`w-5 h-5 ${gpsIconColor}`} />
        </Button>
      </div>
    </header>
  );
}
