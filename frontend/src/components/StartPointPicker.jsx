import { useMemo, useState } from "react";
import { Input } from "./ui/input";
import { Crosshair, MapPin, Search, X } from "lucide-react";

const LIST_ID = "start-point-results";
const optionId = (h) => `start-point-option-${h.id}`;

/**
 * Busca da primeira parada no padrão "combobox" (WAI-ARIA): o campo diz ao leitor de tela se a lista está aberta
 * e qual opção está destacada; as setas percorrem a lista, Enter escolhe e Esc fecha.
 */
export default function StartPointPicker({ hydrants, value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // opção destacada pelo teclado (-1 = nenhuma)
  const selected = hydrants.find((h) => h.id === value);

  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = hydrants.filter((h) => h.geocoded);
    if (!n) return list.slice(0, 8);
    return list
      .filter((h) => h.code.toLowerCase().includes(n) || (h.address || "").toLowerCase().includes(n))
      .slice(0, 8);
  }, [hydrants, q]);

  const show = (next) => {
    setOpen(next);
    setActive(-1);
  };

  const pick = (h) => {
    onChange(h ? h.id : null);
    setQ("");
    show(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { show(true); return; }
      if (results.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
    } else if (e.key === "Enter" && open && active >= 0 && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      show(false);
    }
  };

  const activeOption = open && active >= 0 ? results[active] : null;

  return (
    <div className="space-y-2" data-testid="start-point-picker">
      <label htmlFor="start-point-search" className="block font-mono-t text-[10px] uppercase tracking-widest text-slate-400">
        Primeira parada
      </label>
      <div
        className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2"
        data-testid="start-point-selected"
        aria-live="polite"
      >
        {selected ? (
          <MapPin className="w-4 h-4 text-route shrink-0" aria-hidden="true" />
        ) : (
          <Crosshair className="w-4 h-4 text-ok shrink-0" aria-hidden="true" />
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
            className="text-slate-400 hover:text-white transition-colors"
            title="Voltar para automática" aria-label="Voltar para automática"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        <Input
          id="start-point-search"
          data-testid="start-point-search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={LIST_ID}
          aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
          autoComplete="off"
          placeholder="Digite o código ou endereço do hidrante..."
          value={q}
          onChange={(e) => { setQ(e.target.value); show(true); }}
          onFocus={() => show(true)}
          onBlur={() => setTimeout(() => show(false), 150)}
          onKeyDown={onKeyDown}
          className="pl-9 bg-surface border-line text-slate-100"
        />
        {open && (
          <ul
            id={LIST_ID}
            role="listbox"
            aria-label="Hidrantes encontrados"
            className="absolute z-[1000] mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-line bg-surface shadow-xl"
            data-testid="start-point-results"
          >
            {results.length === 0 && (
              <li role="presentation" className="px-3 py-3 text-xs text-slate-400">Nenhum hidrante encontrado.</li>
            )}
            {results.map((h, i) => (
              <li
                key={h.id}
                id={optionId(h)}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h)}
                onMouseEnter={() => setActive(i)}
                data-testid={`start-point-option-${h.code}`}
                className={`cursor-pointer px-3 py-2 border-b border-line last:border-0 transition-colors ${
                  i === active ? "bg-elevated" : "hover:bg-elevated"
                }`}
              >
                <div className="font-mono-t text-xs font-bold text-white">{h.code}</div>
                <div className="text-[11px] text-slate-400 truncate">{h.address}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
