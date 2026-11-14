import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Search, AlertTriangle } from "lucide-react";

export const typeLabel = { subterraneo: "Subterrâneo", coluna: "Coluna", bica: "Bica" };
export const statusLabel = {
  possivel_de_uso: "Possível de uso",
  inoperante: "Inoperante",
  nao_localizado: "Não localizado",
  sem_vistoria: "Sem vistoria",
};
const statusShort = { possivel_de_uso: "OK", inoperante: "INOP", nao_localizado: "N/LOC" };
export const statusColor = {
  possivel_de_uso: "#10B981",
  inoperante: "#EF4444",
  nao_localizado: "#F59E0B",
  sem_vistoria: "#94A3B8",
  outro: "#94A3B8",
};
const typeStyle = {
  subterraneo: { backgroundColor: "#1E3A8A33", color: "#93C5FD" },
  coluna: { backgroundColor: "#5B21B633", color: "#C4B5FD" },
  bica: { backgroundColor: "#0F766E33", color: "#5EEAD4" },
};

/**
 * Lista de hidrantes. Os filtros (busca, tipo, situação) ficam na página, porque também valem para o mapa e a
 * rota: a tabela recebe a lista já filtrada e o total da estação.
 */
export default function HydrantTable({ hydrants, filtered, filters, onFiltersChange, emptyMessage = "Nenhum hidrante encontrado." }) {
  const set = (patch) => onFiltersChange({ ...filters, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            data-testid="search-hydrants"
            placeholder="Buscar por código, endereço ou setor..."
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            className="pl-9 bg-[#0B0F17] border-[#26334D] text-slate-100"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["todos", "coluna", "subterraneo", ...(hydrants.some((h) => h.type === "bica") ? ["bica"] : [])].map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`filter-type-${t}`}
              onClick={() => set({ type: t })}
              className={`px-3 py-1 rounded-full text-[11px] font-mono-t uppercase tracking-widest border transition-colors ${
                filters.type === t
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
              onClick={() => set({ status: s })}
              className={`px-3 py-1 rounded-full text-[11px] font-mono-t uppercase tracking-widest border transition-colors ${
                filters.status === s
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
                <th className="px-3 py-2 text-left">Vazão</th>
                <th className="px-3 py-2 text-left">Setor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    {hydrants.length === 0 ? emptyMessage : "Nenhum hidrante encontrado com esses filtros."}
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
                    {h.url ? (
                      <a href={h.url} target="_blank" rel="noopener noreferrer" className="hover:underline" title="Ficha do hidrante no CB SP">
                        {h.code}
                      </a>
                    ) : h.code}
                    {h.location_source === "endereco" && (
                      <span className="ml-1 text-amber-300/80" title="Posição aproximada pelo endereço">≈</span>
                    )}
                    {!h.geocoded && (
                      <AlertTriangle className="w-3 h-3 inline ml-1 text-amber-400" aria-label="Fora do mapa" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className="border-0 whitespace-nowrap"
                      style={typeStyle[h.type] || { backgroundColor: "#33415533", color: "#CBD5E1" }}
                    >
                      {typeLabel[h.type] || h.type_label || "—"}
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
                        style={{ backgroundColor: statusColor[h.status] || statusColor.outro }}
                      />
                      <span
                        className="text-xs font-mono-t uppercase tracking-wider"
                        style={{ color: statusColor[h.status] || statusColor.outro }}
                      >
                        {statusLabel[h.status] || h.status_label || "—"}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{h.flow || "—"}</td>
                  <td className="px-3 py-2 text-slate-400 text-xs font-mono-t">{h.sector || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-500 font-mono-t">
        {filtered.length} de {hydrants.length} hidrantes
        {hydrants.some((h) => h.location_source === "endereco") && (
          <span className="ml-3 text-slate-600">≈ posição aproximada pelo endereço (sem posição no mapa oficial)</span>
        )}
      </p>
    </div>
  );
}
