import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";

/** Andamento da localização dos endereços e, se algum falhou, o botão para tentar de novo. */
export default function GeocodeStatusBar({ geo, onRetry }) {
  if (!geo || (geo.pending === 0 && geo.failed === 0)) return null;
  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-4">
      <div className="tactical-card p-3 flex items-center justify-between gap-3" data-testid="geocode-status-bar">
        <div className="flex items-center gap-2 text-xs font-mono-t uppercase tracking-widest text-slate-300">
          {geo.pending > 0 && <Loader2 className="w-4 h-4 animate-spin text-route" />}
          {geo.pending > 0
            ? `Localizando endereços · ${geo.geocoded}/${geo.total}`
            : `${geo.failed} endereço(s) não localizado(s) no mapa`}
        </div>
        {geo.pending === 0 && geo.failed > 0 && (
          <Button size="sm" variant="ghost" onClick={onRetry} data-testid="retry-geocode-btn"
            className="text-amber-300 hover:bg-elevated font-mono-t text-xs uppercase tracking-widest">
            Tentar novamente
          </Button>
        )}
      </div>
    </div>
  );
}
