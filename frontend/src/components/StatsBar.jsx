import { useMemo } from "react";

/** Os quatro números do topo: pendentes, possível de uso, inoperante/não localizado e quantos estão no mapa. */
export default function StatsBar({ hydrants, onMap }) {
  const stats = useMemo(() => {
    const count = (st) => hydrants.filter((h) => h.status === st).length;
    return [
      { id: "total", label: "Pendentes", value: hydrants.length, color: "text-slate-50" },
      { id: "ok", label: "Possível de uso", value: count("possivel_de_uso"), color: "text-ok" },
      { id: "inop", label: "Inoperante / Não localizado", value: count("inoperante") + count("nao_localizado"), color: "text-fire" },
      { id: "geo", label: "No mapa", value: onMap, color: "text-route" },
    ];
  }, [hydrants, onMap]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.id} className="tactical-card p-4" data-testid={`stat-${s.id}`}>
          <div className="font-mono-t text-label uppercase tracking-widest text-slate-400">{s.label}</div>
          <div className={`font-display font-black text-3xl mt-1 ${s.color}`}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}
