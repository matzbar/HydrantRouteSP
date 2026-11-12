import { useMemo, useState } from "react";
import { Input } from "./ui/input";
import { Crosshair, MapPin, Search, X } from "lucide-react";

export default function StartPointPicker({ hydrants, value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = hydrants.find((h) => h.id === value);

  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = hydrants.filter((h) => h.geocoded);
    if (!n) return list.slice(0, 8);
    return list
      .filter((h) => h.code.toLowerCase().includes(n) || (h.address || "").toLowerCase().includes(n))
      .slice(0, 8);
  }, [hydrants, q]);

  const pick = (h) => {
    onChange(h ? h.id : null);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="space-y-2" data-testid="start-point-picker">
      <div className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Primeira parada</div>
      <div
        className="flex items-center gap-2 rounded-md border border-[#26334D] bg-[#121824] px-3 py-2"
        data-testid="start-point-selected"
      >
        {selected ? (
          <MapPin className="w-4 h-4 text-[#38BDF8] shrink-0" />
        ) : (
          <Crosshair className="w-4 h-4 text-[#10B981] shrink-0" />
        )}
        <div className="flex-1 min-w-0 text-xs">
          {selected ? (
            <>
              <span className="font-mono-t font-bold text-white">{selected.code}</span>
              <span className="text-slate-400"> · {selected.address}</span>
            </>
          ) : (
            <span className="text-slate-300">Automática: hidrante mais próximo do GPS</span>
          )}
        </div>
        {selected && (
          <button
            type="button"
            onClick={() => pick(null)}
            data-testid="start-point-clear"
            className="text-slate-500 hover:text-white transition-colors"
            title="Voltar para automática" aria-label="Voltar para automática"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <Input
          data-testid="start-point-search"
          placeholder="Digite o código ou endereço do hidrante..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="pl-9 bg-[#121824] border-[#26334D] text-slate-100"
        />
        {open && (
          <div
            className="absolute z-[1000] mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-[#26334D] bg-[#121824] shadow-xl"
            data-testid="start-point-results"
          >
            {results.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-500">Nenhum hidrante encontrado.</div>
            )}
            {results.map((h) => (
              <button
                key={h.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h)}
                data-testid={`start-point-option-${h.code}`}
                className="w-full text-left px-3 py-2 hover:bg-[#1A2234] border-b border-[#26334D] last:border-0 transition-colors"
              >
                <div className="font-mono-t text-xs font-bold text-white">{h.code}</div>
                <div className="text-[11px] text-slate-400 truncate">{h.address}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
