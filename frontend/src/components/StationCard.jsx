import { ExternalLink } from "lucide-react";
import StationPicker from "./StationPicker";

/** Escolha da estação e o resumo dela: nome, código, ciclo, % realizado e link para a página do CB SP. */
export default function StationCard({ stations, value, onChange, disabled, station, cycle }) {
  return (
    <div className="tactical-card p-5 space-y-4">
      <h2 className="font-display text-lg font-bold uppercase tracking-wider">Estação de Bombeiros</h2>
      <StationPicker stations={stations} value={value} onChange={onChange} disabled={disabled} />
      {station && (
        <div className="rounded-lg bg-page border border-line p-3 space-y-1.5" data-testid="station-info">
          <div className="font-display text-sm font-bold uppercase tracking-wider text-slate-200">
            {station.name || `Estação ${station.code}`}
          </div>
          <div className="text-[10px] font-mono-t uppercase tracking-widest text-slate-400">
            {[station.cmd, station.gb_sgb && `GB.SGB ${station.gb_sgb}`, `Cód. ${station.code}`].filter(Boolean).join(" · ")}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Pendentes de vistoria{cycle ? ` · Ciclo ${cycle}` : ""}</span>
            {station.percent_done != null && <PercentBadge value={station.percent_done} />}
          </div>
          <a href={station.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-route hover:underline">
            Ver página no site do CB SP <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}

// Verde quando a estação completou 100% das vistorias do ciclo; vermelho enquanto não completou.
function PercentBadge({ value }) {
  const done = value >= 100;
  return (
    <span
      data-testid="station-percent"
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono-t text-[11px] font-semibold uppercase tracking-wider ${
        done ? "bg-ok/15 border-ok/40 text-emerald-300" : "bg-fire/15 border-fire/40 text-red-300"
      }`}
    >
      {value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% realizado
    </span>
  );
}
