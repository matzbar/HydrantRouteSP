import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { ExternalLink, Clock, Route, AlertTriangle } from "lucide-react";
import { statusColor } from "./HydrantTable";

export default function RouteResult({ open, onClose, result }) {
  if (!result) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#121824] border-[#26334D] text-slate-100 max-w-2xl w-[calc(100%-1.5rem)] max-h-[90dvh] overflow-y-auto rounded-lg" data-testid="route-result-dialog">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-wider text-2xl">
            <span className="text-[#38BDF8]">Rota Otimizada</span> · {result.stops.length} paradas
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 my-2">
          <div className="tactical-elevated rounded-lg p-3">
            <div className="flex items-center gap-2 text-slate-400 font-mono-t text-[10px] uppercase tracking-widest">
              <Route className="w-3.5 h-3.5" /> Distância
            </div>
            <div className="font-display text-3xl font-bold text-white mt-1">
              {result.total_distance_km.toFixed(1)} <span className="text-sm text-slate-400">km</span>
            </div>
          </div>
          <div className="tactical-elevated rounded-lg p-3">
            <div className="flex items-center gap-2 text-slate-400 font-mono-t text-[10px] uppercase tracking-widest">
              <Clock className="w-3.5 h-3.5" /> Tempo estimado
            </div>
            <div className="font-display text-3xl font-bold text-white mt-1">
              {Math.round(result.total_duration_min)} <span className="text-sm text-slate-400">min</span>
            </div>
          </div>
        </div>

        {result.unreachable?.length > 0 && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold">Hidrantes fora da rota (endereço não localizado no mapa):</div>
              <div className="font-mono-t">{result.unreachable.join(", ")}</div>
            </div>
          </div>
        )}

        <div className="max-h-[320px] overflow-y-auto pr-1 space-y-2" data-testid="route-stops">
          {result.stops.map((s) => (
            <div
              key={s.hydrant.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-[#0B0F17] border border-[#26334D]"
            >
              <div className="w-8 h-8 rounded-full bg-[#38BDF8] text-[#0B0F17] font-display font-black flex items-center justify-center flex-shrink-0">
                {s.order}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono-t font-bold text-white text-sm">{s.hydrant.code}</span>
                  <span
                    className="status-dot"
                    style={{ backgroundColor: statusColor[s.hydrant.status] || statusColor.outro }}
                  />
                </div>
                <div className="text-xs text-slate-400 truncate" title={s.hydrant.address}>
                  {s.hydrant.address}
                </div>
                <div className="text-[10px] text-slate-500 font-mono-t">
                  {s.hydrant.municipality} · Setor {s.hydrant.sector || "—"}
                </div>
              </div>
              <div className="text-right text-[10px] font-mono-t text-slate-500 uppercase tracking-widest">
                +{s.distance_from_prev_km.toFixed(1)} km
                <div>+{Math.round(s.duration_from_prev_min)} min</div>
              </div>
            </div>
          ))}
        </div>

        {(result.google_maps_segments?.length || 0) > 1 ? (
          <div className="space-y-2" data-testid="google-maps-segments">
            <p className="text-[11px] text-slate-400">
              O Google Maps aceita até 10 paradas por rota. Sua rota foi dividida em {result.google_maps_segments.length} trechos — abra em sequência.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {result.google_maps_segments.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer" data-testid={`google-maps-link-${i + 1}`}>
                  <Button className="w-full btn-tactical-red font-display uppercase tracking-wider text-sm font-bold">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Abrir trecho {i + 1}
                  </Button>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <a href={result.google_maps_url} target="_blank" rel="noopener noreferrer" data-testid="google-maps-link" className="w-full">
            <Button className="w-full btn-tactical-red font-display uppercase tracking-wider text-base font-bold py-6">
              <ExternalLink className="w-5 h-5 mr-2" />
              Abrir Rota no Google Maps
            </Button>
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
