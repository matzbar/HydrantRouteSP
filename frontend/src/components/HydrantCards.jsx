import { useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Flag, MapPin } from "lucide-react";
import { Badge } from "./ui/badge";
import HydrantIcon from "./HydrantIcon";
import { colorOfStatus, formatDate, hasCoords, statusLabel, typeBadgeStyle, typeLabel } from "../lib/hydrants";

/**
 * Lista de hidrantes para o celular, compacta como uma tabela: cada linha mostra código, início do endereço e a
 * situação (ícone de hidrante na cor dela). Tocar na linha abre o cartão com o resto das informações e as ações:
 * ver no mapa, definir como primeira parada da rota e abrir a ficha do CB SP.
 */
export default function HydrantCards({ hydrants, startId, onShowOnMap, onSetFirstStop }) {
  const [openId, setOpenId] = useState(null); // um cartão aberto por vez: a lista continua curta
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-page overflow-hidden" data-testid="hydrant-cards"
      aria-label="Hidrantes">
      {hydrants.map((h) => (
        <HydrantCard
          key={h.id}
          h={h}
          open={openId === h.id}
          onToggle={() => setOpenId((cur) => (cur === h.id ? null : h.id))}
          isStart={startId === h.id}
          onShowOnMap={onShowOnMap}
          onSetFirstStop={onSetFirstStop}
        />
      ))}
    </ul>
  );
}

function HydrantCard({ h, open, onToggle, isStart, onShowOnMap, onSetFirstStop }) {
  const onMap = hasCoords(h);
  const color = colorOfStatus(h.status);
  const status = statusLabel[h.status] || h.status_label || "—";
  const detailsId = `hydrant-card-details-${h.id}`;

  return (
    <li data-testid={`hydrant-card-${h.code}`} className={open ? "bg-surface" : ""}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={detailsId}
        className="relative w-full min-h-12 flex items-center gap-3 px-3 py-2 text-left active:bg-elevated"
      >
        <span className="font-mono-t text-sm font-bold text-white shrink-0 min-w-[3.25rem]">{h.code}</span>
        <span className="flex-1 min-w-0 truncate text-sm text-slate-300">{h.address}</span>
        {/* Fora do trecho cortado com "…": dentro dele, o texto só para leitor de tela ficava além da borda e alargava a
            página no celular. */}
        {isStart && (
          <span className="shrink-0 inline-flex">
            <Flag className="w-3.5 h-3.5 text-route" aria-hidden="true" />
            <span className="sr-only">(primeira parada)</span>
          </span>
        )}
        {/* Situação só pela cor do ícone; o nome vai para o leitor de tela e aparece no cartão aberto. */}
        <span className="inline-flex shrink-0" style={{ color }} title={status}>
          <HydrantIcon className="w-5 h-5" />
          <span className="sr-only">{status}</span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true" />
      </button>

      {open && (
        <div id={detailsId} className="px-3 pb-3 space-y-1.5" data-testid="hydrant-card-details">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-0" style={typeBadgeStyle[h.type] || typeBadgeStyle.outro}>
              {typeLabel[h.type] || h.type_label || "—"}
            </Badge>
            <span className="text-xs font-mono-t uppercase tracking-wider" style={{ color }}>{status}</span>
          </div>
          <p className="text-sm text-slate-200 leading-snug">{h.address}</p>
          <p className="text-note text-slate-400 font-mono-t">
            {[h.municipality, h.sector && `Setor ${h.sector}`].filter(Boolean).join(" · ")}
          </p>
          <p className="text-note text-slate-400 font-mono-t">
            Últ. vistoria {formatDate(h.last_inspection)}{h.flow ? ` · Vazão ${h.flow}` : ""}
          </p>
          {!onMap ? (
            <p className="text-note inline-flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Fora do mapa: endereço não localizado
            </p>
          ) : h.location_source === "endereco" ? (
            <p className="text-note text-amber-300/90">≈ posição aproximada pelo endereço</p>
          ) : null}

          {/* Ações: a principal em destaque, depois "Ver no mapa" e "Abrir ficha" (com o código, para o leitor de tela).
              Em telas estreitas, o que não couber desce para a linha de baixo. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
            {onMap && (
              <button type="button" onClick={() => onSetFirstStop(isStart ? null : h.id)} className={FIRST_STOP}
                data-testid="card-first-stop">
                <Flag className="w-3.5 h-3.5" aria-hidden="true" /> {isStart ? "Remover 1ª parada" : "Definir 1ª parada"}
              </button>
            )}
            {onMap && (
              <button type="button" onClick={() => onShowOnMap(h.id)} className={ACTION}
                aria-label={`Ver o hidrante ${h.code} no mapa`}>
                <MapPin className="w-4 h-4" aria-hidden="true" /> Ver no mapa
              </button>
            )}
            {h.url && (
              <a href={h.url} target="_blank" rel="noopener noreferrer" className={ACTION}
                aria-label={`Ficha do hidrante ${h.code} no CB SP`}>
                <ExternalLink className="w-4 h-4" aria-hidden="true" /> Abrir ficha
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// Ações do cartão aberto: discretas (texto pequeno, cor da rota), com área de toque de 44 px.
const ACTION = "inline-flex items-center gap-1 min-h-11 text-label font-mono-t uppercase tracking-wide text-route";
// "Definir 1ª parada" em destaque: fundo suave, contorno e cantos arredondados, com pouca folga entre o texto e a
// borda (área de toque de 32 px, acima do mínimo de 24 px da WCAG).
const FIRST_STOP = "inline-flex items-center gap-1 min-h-8 px-1.5 rounded-md border border-route/40 bg-route/10 " +
  "text-label font-mono-t uppercase tracking-wide text-route active:bg-route/20";
