import React, { useMemo, useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Trash2, Search, AlertTriangle } from "lucide-react";

const typeLabel = { subterraneo: "Subterrâneo", coluna: "Coluna" };

export default function HydrantTable({ hydrants, onDelete }) {
  const [q, setQ] = useState("");
  const [tf, setTf] = useState("todos");
  const [sf, setSf] = useState("todos");

  const filtered = useMemo(() => {
    return hydrants.filter((h) => {
      if (tf !== "todos" && h.type !== tf) return false;
      if (sf !== "todos" && h.status !== sf) return false;
      if (q) {
        const needle = q.toLowerCase();
        if (
          !h.code.toLowerCase().includes(needle) &&
          !h.street.toLowerCase().includes(needle)
        )
          return false;
      }
      return true;
    });
  }, [hydrants, q, tf, sf]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            data-testid="search-hydrants"
            placeholder="Buscar por código ou rua..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 bg-[#0B0F17] border-[#26334D] text-slate-100"
          />
        </div>
        <div className="flex gap-2">
          {["todos", "coluna", "subterraneo"].map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`filter-type-${t}`}
              onClick={() => setTf(t)}
              className={`px-3 py-1 rounded-full text-[11px] font-mono-t uppercase tracking-widest border transition-colors ${
                tf === t
                  ? "bg-[#26334D] text-white border-[#38475F]"
                  : "border-[#26334D] text-slate-400 hover:text-white"
              }`}
            >
              {t === "todos" ? "Todos" : typeLabel[t]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {["todos", "operacional", "inoperante"].map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`filter-status-${s}`}
              onClick={() => setSf(s)}
              className={`px-3 py-1 rounded-full text-[11px] font-mono-t uppercase tracking-widest border transition-colors ${
                sf === s
                  ? "bg-[#26334D] text-white border-[#38475F]"
                  : "border-[#26334D] text-slate-400 hover:text-white"
              }`}
            >
              {s === "todos" ? "Estado" : s === "operacional" ? "Op" : "Inop"}
            </button>
          ))}
        </div>
      </div>

      <div className="tactical-card overflow-hidden">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm" data-testid="hydrants-table">
            <thead className="sticky top-0 bg-[#1A2234] text-slate-400 font-mono-t text-[10px] uppercase tracking-widest">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Endereço</th>
                <th className="px-3 py-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                    Nenhum hidrante encontrado.
                  </td>
                </tr>
              )}
              {filtered.map((h) => (
                <tr
                  key={h.id}
                  className="border-t border-[#26334D] hover:bg-[#1A2234]/60"
                  data-testid={`hydrant-row-${h.code}`}
                >
                  <td className="px-3 py-2 font-mono-t text-xs font-semibold text-white">
                    {h.code}
                    {!h.geocoded && (
                      <AlertTriangle className="w-3 h-3 inline ml-1 text-amber-400" title="Não geocodificado" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className="border-0"
                      style={{
                        backgroundColor: h.type === "subterraneo" ? "#1E3A8A33" : "#5B21B633",
                        color: h.type === "subterraneo" ? "#93C5FD" : "#C4B5FD",
                      }}
                    >
                      {typeLabel[h.type]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="status-dot"
                        style={{ backgroundColor: h.status === "operacional" ? "#10B981" : "#EF4444" }}
                      />
                      <span
                        className="text-xs font-mono-t uppercase tracking-wider"
                        style={{ color: h.status === "operacional" ? "#34D399" : "#F87171" }}
                      >
                        {h.status === "operacional" ? "Op" : "Inop"}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-300 text-xs">
                    {h.street}, {h.number || "s/n"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(h.id)}
                      data-testid={`delete-${h.code}`}
                      className="text-slate-400 hover:text-red-400 hover:bg-[#1A2234]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-500 font-mono-t">
        {filtered.length} de {hydrants.length} hidrantes
      </p>
    </div>
  );
}
