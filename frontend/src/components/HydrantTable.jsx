import React, { useMemo, useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Trash2, Search, AlertTriangle } from "lucide-react";

const typeLabel = { subterraneo: "Subterrâneo", coluna: "Coluna" };
const statusLabel = { possivel_de_uso: "Possível de uso", inoperante: "Inoperante", nao_localizado: "Não localizado" };
const statusShort = { possivel_de_uso: "OK", inoperante: "INOP", nao_localizado: "N/LOC" };
const statusColor = { possivel_de_uso: "#10B981", inoperante: "#EF4444", nao_localizado: "#F59E0B" };

export default function HydrantTable({ hydrants, onDelete }) {
  const [q, setQ] = useState("");
  const [tf, setTf] = useState("todos");
  const [sf, setSf] = useState("todos");

  const filtered = useMemo(() => {
    return hydrants.filter((h) => {
      if (tf !== "todos" && h.type !== tf) return false;
      if (sf !== "todos" && h.status !== sf) return false;
      if (q) {
        const n = q.toLowerCase();
        if (
          !(h.code || "").toLowerCase().includes(n) &&
          !(h.address || "").toLowerCase().includes(n) &&
          !(h.sector || "").toLowerCase().includes(n)
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
            placeholder="Buscar por código, endereço ou setor..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 bg-[#0B0F17] border-[#26334D] text-slate-100"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
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
        <div className="flex gap-1.5 flex-wrap">
          {["todos", "possivel_de_uso", "inoperante", "nao_localizado"].map((s) => (
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
              {s === "todos" ? "Todas" : statusShort[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="tactical-card overflow-hidden">
        <div className="max-h-[480px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm" data-testid="hydrants-table">
            <thead className="sticky top-0 bg-[#1A2234] text-slate-400 font-mono-t text-[10px] uppercase tracking-widest z-10 whitespace-nowrap">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Endereço</th>
                <th className="px-3 py-2 text-left">Município</th>
                <th className="px-3 py-2 text-left">Últ. Vistoria</th>
                <th className="px-3 py-2 text-left">Situação</th>
                <th className="px-3 py-2 text-left">Setor</th>
                <th className="px-3 py-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
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
                  <td className="px-3 py-2 font-mono-t text-xs font-semibold text-white whitespace-nowrap">
                    {h.code}
                    {!h.geocoded && (
                      <AlertTriangle className="w-3 h-3 inline ml-1 text-amber-400" title="Não geocodificado" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className="border-0 whitespace-nowrap"
                      style={{
                        backgroundColor: h.type === "subterraneo" ? "#1E3A8A33" : "#5B21B633",
                        color: h.type === "subterraneo" ? "#93C5FD" : "#C4B5FD",
                      }}
                    >
                      {typeLabel[h.type]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-300 text-xs max-w-[280px]">
                    <div className="truncate" title={h.address}>{h.address}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{h.municipality}</td>
                  <td className="px-3 py-2 text-slate-400 text-xs font-mono-t whitespace-nowrap">
                    {h.last_inspection ? h.last_inspection.split("-").reverse().join("/") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span
                        className="status-dot"
                        style={{ backgroundColor: statusColor[h.status] }}
                      />
                      <span
                        className="text-xs font-mono-t uppercase tracking-wider"
                        style={{ color: statusColor[h.status] }}
                      >
                        {statusLabel[h.status]}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs font-mono-t">{h.sector || "—"}</td>
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
