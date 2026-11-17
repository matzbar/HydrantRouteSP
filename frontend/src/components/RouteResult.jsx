import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { ExternalLink, Clock, Route, AlertTriangle, Sparkles } from "lucide-react";
import { colorOfStatus, statusLabel } from "../lib/hydrants";

export default function RouteResult({ open, onClose, result }) {
  if (!result) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-surface border-line text-slate-100 max-w-2xl w-[calc(100%-1.5rem)] max-h-[90dvh] overflow-y-auto rounded-lg" data-testid="route-result-dialog">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-wider text-2xl">
            <span className="text-route">Rota Otimizada</span> · {result.stops.length} paradas
          </DialogTitle>
          {/* Lida pelo leitor de tela ao abrir o diálogo; na tela, o conteúdo abaixo já diz isso. */}
          <DialogDescription className="sr-only">
            Paradas em ordem de visita, com distância e tempo de cada trecho, e links para abrir a rota no Google Maps.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 my-2">
          <div className="tactical-elevated rounded-lg p-3">
            <div className="flex items-center gap-2 text-slate-400 font-mono-t text-label uppercase tracking-widest">
              <Route className="w-3.5 h-3.5" /> Distância
            </div>
            <div className="font-display text-3xl font-bold text-white mt-1">
              {result.total_distance_km.toFixed(1)} <span className="text-sm text-slate-400">km</span>
            </div>
          </div>
          <div className="tactical-elevated rounded-lg p-3">
            <div className="flex items-center gap-2 text-slate-400 font-mono-t text-label uppercase tracking-widest">
              <Clock className="w-3.5 h-3.5" /> Tempo estimado
            </div>
            <div className="font-display text-3xl font-bold text-white mt-1">
              {Math.round(result.total_duration_min)} <span className="text-sm text-slate-400">min</span>
            </div>
          </div>
        </div>

        {result.optimization && <OptimizationNote opt={result.optimization} />}

        {result.unreachable?.length > 0 && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold">Hidrantes fora da rota (endereço não localizado no mapa):</div>
              <div className="font-mono-t">{result.unreachable.join(", ")}</div>
            </div>
          </div>
        )}

        <ol className="max-h-[320px] overflow-y-auto pr-1 space-y-2" data-testid="route-stops" aria-label="Paradas da rota">
          {result.stops.map((s) => (
            <li
              key={s.hydrant.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-page border border-line"
            >
              <div aria-hidden="true" className="w-8 h-8 rounded-full bg-route text-page font-display font-black flex items-center justify-center flex-shrink-0">
                {s.order}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono-t font-bold text-white text-sm">{s.hydrant.code}</span>
                  <span
                    className="status-dot"
                    aria-hidden="true"
                    style={{ backgroundColor: colorOfStatus(s.hydrant.status) }}
                  />
                  {/* A cor da bolinha diz a situação; o leitor de tela recebe o nome dela. */}
                  <span className="sr-only">{statusLabel[s.hydrant.status] || s.hydrant.status_label}</span>
                </div>
                <div className="text-xs text-slate-400 truncate" title={s.hydrant.address}>
                  {s.hydrant.address}
                </div>
                <div className="text-label text-slate-400 font-mono-t">
                  {s.hydrant.municipality} · Setor {s.hydrant.sector || "—"}
                </div>
              </div>
              <div className="text-right text-label font-mono-t text-slate-400 uppercase tracking-widest">
                +{s.distance_from_prev_km.toFixed(1)} km
                <div>+{Math.round(s.duration_from_prev_min)} min</div>
              </div>
            </li>
          ))}
        </ol>

        {(result.google_maps_segments?.length || 0) > 1 ? (
          <div className="space-y-2" data-testid="google-maps-segments">
            <p className="text-note text-slate-400">
              O Google Maps aceita até 10 paradas por rota. Sua rota foi dividida em {result.google_maps_segments.length} trechos — abra em sequência.
            </p>
            {/* Todos os trechos na mesma linha; com 3 ou mais, letra menor e ícone só em telas maiores. */}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${result.google_maps_segments.length}, minmax(0, 1fr))` }}
              data-testid="google-maps-segment-buttons"
            >
              {result.google_maps_segments.map((url, i) => {
                const compact = result.google_maps_segments.length >= 3;
                return (
                  <Button
                    key={url}
                    asChild
                    className={`w-full min-w-0 btn-tactical-red font-display uppercase font-bold ${
                      compact ? "text-xs tracking-normal px-2" : "text-sm tracking-wider"
                    }`}
                  >
                    <a href={url} target="_blank" rel="noopener noreferrer" data-testid={`google-maps-link-${i + 1}`}>
                      <ExternalLink className={compact ? "hidden sm:inline-block w-3.5 h-3.5 mr-1 shrink-0" : "w-4 h-4 mr-2"} />
                      <span className="truncate">Abrir trecho {i + 1}</span>
                    </a>
                  </Button>
                );
              })}
            </div>
          </div>
        ) : (
          <Button asChild className="w-full btn-tactical-red font-display uppercase tracking-wider text-base font-bold py-6">
            <a href={result.google_maps_url} target="_blank" rel="noopener noreferrer" data-testid="google-maps-link">
              <ExternalLink className="w-5 h-5 mr-2" />
              Abrir Rota no Google Maps
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OptimizationNote({ opt }) {
  const real = opt.source === "osrm";
  const fmt = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-route/30 bg-route/10 p-3 text-xs text-sky-100"
      data-testid="route-optimization"
    >
      <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0 text-route" />
      <div className="space-y-0.5">
        <div className="font-semibold">
          {opt.saved_min >= 0.5
            ? `Ordem otimizada: ${fmt(opt.saved_min)} min a menos que visitar sempre o mais próximo`
            : "A ordem por proximidade já era a melhor encontrada"}
        </div>
        <div className="text-sky-200/80">
          {real
            ? `Calculada com tempos reais de carro entre ${opt.candidates} hidrantes (OSRM).`
            : "OSRM indisponível: ordem calculada com tempos estimados pela distância."}
        </div>
      </div>
    </div>
  );
}
