import { AlertTriangle, MapPin } from "lucide-react";
import { Badge } from "./ui/badge";
import { colorOfStatus, formatDate, hasCoords, statusLabel, typeBadgeStyle, typeLabel } from "../lib/hydrants";

/**
 * Lista de hidrantes em cartões, para o celular (a tabela de 8 colunas não cabe na tela). Cada cartão mostra tudo sem
 * rolar para o lado. Tocar no cartão (ou em "Ver no mapa") leva ao hidrante no mapa; o código abre a ficha do CB SP.
 */
export default function HydrantCards({ hydrants, onShowOnMap }) {
  return (
    <ul className="space-y-2" data-testid="hydrant-cards" aria-label="Hidrantes">
      {hydrants.map((h) => {
        const onMap = hasCoords(h);
        const status = colorOfStatus(h.status);
        const show = onMap ? () => onShowOnMap(h.id) : undefined;
        return (
          <li
            key={h.id}
            data-testid={`hydrant-card-${h.code}`}
            onClick={show}
            className={`rounded-lg border border-line bg-page p-3 space-y-1.5 ${onMap ? "cursor-pointer active:bg-elevated" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-1.5 font-mono-t text-sm font-bold text-white">
                {h.url ? (
                  <a href={h.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                    className="hover:underline inline-flex items-center min-h-11 -my-3" title="Ficha do hidrante no CB SP">
                    {h.code}
                  </a>
                ) : h.code}
              </div>
              <span className="inline-flex items-center gap-1.5 shrink-0 pt-0.5">
                <span className="status-dot" aria-hidden="true" style={{ backgroundColor: status }} />
                <span className="text-xs font-mono-t uppercase tracking-wider" style={{ color: status }}>
                  {statusLabel[h.status] || h.status_label || "—"}
                </span>
              </span>
            </div>

            <Badge variant="outline" className="border-0" style={typeBadgeStyle[h.type] || typeBadgeStyle.outro}>
              {typeLabel[h.type] || h.type_label || "—"}
            </Badge>

            <p className="text-sm text-slate-200 leading-snug">{h.address}</p>
            <p className="text-note text-slate-400 font-mono-t">
              {[h.municipality, h.sector && `Setor ${h.sector}`].filter(Boolean).join(" · ")}
            </p>
            <p className="text-note text-slate-400 font-mono-t">
              Últ. vistoria {formatDate(h.last_inspection)}{h.flow ? ` · Vazão ${h.flow}` : ""}
            </p>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <span className="text-note">
                {!onMap ? (
                  <span className="inline-flex items-center gap-1 text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Fora do mapa: endereço não localizado
                  </span>
                ) : h.location_source === "endereco" ? (
                  <span className="text-amber-300/90">≈ posição aproximada pelo endereço</span>
                ) : null}
              </span>
              {onMap && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onShowOnMap(h.id); }}
                  className="inline-flex items-center gap-1.5 shrink-0 min-h-11 -my-2 px-2 -mr-2 text-note font-mono-t uppercase tracking-widest text-route"
                  aria-label={`Ver o hidrante ${h.code} no mapa`}
                >
                  <MapPin className="w-4 h-4" aria-hidden="true" /> Ver no mapa
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
