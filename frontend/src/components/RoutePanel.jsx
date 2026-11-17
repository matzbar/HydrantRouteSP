import { Loader2, Navigation } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Slider } from "./ui/slider";
import StartPointPicker from "./StartPointPicker";

/**
 * Quadro "Rota": primeira parada, quantidade de hidrantes e o botão de gerar a rota.
 *
 * @param {object[]} visible hidrantes da lista filtrada (candidatos à primeira parada)
 * @param {number} onMap quantos deles estão no mapa (com coordenadas)
 * @param {number} stopsShown quantidade escolhida (0 quando não há hidrantes no mapa)
 * @param {number} stopsLimit máximo possível (no mapa, até o limite do backend)
 * @param {number} routeMaxStops limite de paradas por rota do backend
 * @param {string | null} noStopsReason por que não há rota a gerar (null = há hidrantes no mapa)
 */
export default function RoutePanel({
  visible, startId, onStartChange, onMap, stopsShown, stopsLimit, routeMaxStops, onStopsChange,
  filtering, noStopsReason, loading, onGenerate,
}) {
  const noStops = noStopsReason != null;
  return (
    <div className="tactical-card p-5 space-y-4">
      <h2 className="font-display text-lg font-bold uppercase tracking-wider">Rota</h2>

      <div className="rounded-lg bg-page border border-line p-4">
        <StartPointPicker hydrants={visible} value={startId} onChange={onStartChange} />
      </div>

      <div className="space-y-3 rounded-lg bg-page border border-line p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <label htmlFor="max-stops" className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">
              Quantidade de hidrantes
            </label>
            <div className="font-display text-3xl font-black text-route leading-none mt-1">
              {stopsShown} <span className="text-sm text-slate-400">/ {stopsLimit}</span>
            </div>
          </div>
          <Input
            id="max-stops"
            type="number"
            min={noStops ? 0 : 1}
            max={stopsLimit}
            value={stopsShown}
            onChange={(e) => {
              const n = parseInt(e.target.value || "0", 10);
              if (!isNaN(n)) onStopsChange(Math.min(Math.max(1, n), Math.max(1, stopsLimit)));
            }}
            data-testid="max-stops-input"
            className="w-20 bg-surface border-line text-slate-100 text-center font-mono-t"
            disabled={noStops}
          />
        </div>
        <Slider
          data-testid="max-stops-slider"
          thumbLabel="Quantidade de hidrantes"
          min={noStops ? 0 : 1}
          max={Math.max(1, stopsLimit)}
          step={1}
          value={[stopsShown]}
          onValueChange={(v) => onStopsChange(v[0])}
          disabled={noStops}
          className="w-full"
        />
        {onMap > routeMaxStops && (
          <p className="text-[11px] text-slate-400" data-testid="max-stops-note">
            {onMap} hidrantes no mapa · máximo de {routeMaxStops} paradas por rota. A rota escolhe os
            melhores entre todos eles.
          </p>
        )}
        {filtering && !noStops && (
          <p className="text-[11px] text-amber-300/90" data-testid="route-filter-note">
            Filtro da lista ativo: a rota considera só os {onMap} hidrante(s) do filtro.
          </p>
        )}
        {noStopsReason && (
          <p className="text-[11px] text-slate-400" data-testid="no-stops-note">{noStopsReason}</p>
        )}
      </div>

      <Button
        onClick={onGenerate}
        disabled={loading || noStops}
        data-testid="generate-route-btn"
        className="w-full btn-tactical-red font-display uppercase tracking-wider text-base font-bold py-6"
      >
        {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Navigation className="w-5 h-5 mr-2" />}
        Gerar Rota Otimizada
      </Button>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        A rota sempre parte da sua localização (GPS) e a ordem das paradas é otimizada pelo tempo real de carro entre os hidrantes (OSRM). Se você escolher uma primeira parada, ela fica fixa como parada 1.
      </p>
      <p className="text-[11px] text-slate-400 leading-relaxed" data-testid="privacy-note">
        Privacidade: sua localização fica só no navegador até você gerar a rota. Aí ela é enviada ao serviço de rotas (OSRM) e ao link do Google Maps, apenas para o cálculo, e não é armazenada pelo app.
      </p>
    </div>
  );
}
