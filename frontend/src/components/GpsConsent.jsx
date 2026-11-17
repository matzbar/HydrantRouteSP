import { LocateFixed, MapPin, Navigation, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

/**
 * Aviso antes do pedido de localização do navegador: explica para que ela serve e só então, com o toque em
 * "Usar minha localização", o navegador pergunta. Fechar o aviso (Esc, fora dele ou "Agora não") recusa.
 */
export default function GpsConsent({ open, onAccept, onDecline }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDecline()}>
      <DialogContent
        className="bg-surface border-line text-slate-100 max-w-md w-[calc(100%-1.5rem)] rounded-lg"
        data-testid="gps-consent"
      >
        <DialogHeader className="text-left space-y-2">
          <div className="w-11 h-11 rounded-lg bg-route/15 border border-route/30 flex items-center justify-center">
            <LocateFixed className="w-5 h-5 text-route" aria-hidden="true" />
          </div>
          <DialogTitle className="font-display uppercase tracking-wider text-2xl">Usar sua localização?</DialogTitle>
          <DialogDescription className="text-sm text-slate-300">
            O HydrantRoute SP usa a localização do seu aparelho para:
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 text-sm text-slate-300">
          <li className="flex gap-3">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-route" aria-hidden="true" />
            <span>mostrar onde você está no mapa, junto dos hidrantes da estação;</span>
          </li>
          <li className="flex gap-3">
            <Navigation className="w-4 h-4 mt-0.5 shrink-0 text-route" aria-hidden="true" />
            <span>começar a rota de vistoria a partir de onde você está.</span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-ok" aria-hidden="true" />
            <span>
              Ela fica só no seu aparelho até você gerar a rota, e não é armazenada pelo app. Sem ela, a rota parte
              do centro de São Paulo.
            </span>
          </li>
        </ul>

        {/* A ação principal vem primeiro: recebe o foco ao abrir e fica no topo no celular, à direita no computador. */}
        <div className="flex flex-col sm:flex-row-reverse gap-2 pt-2">
          <Button
            onClick={onAccept}
            data-testid="gps-consent-accept"
            className="sm:flex-1 h-11 btn-tactical-red font-display uppercase tracking-wider text-base font-bold"
          >
            Usar minha localização
          </Button>
          <Button
            variant="ghost"
            onClick={onDecline}
            data-testid="gps-consent-decline"
            className="sm:flex-1 h-11 text-slate-300 hover:text-white hover:bg-elevated font-mono-t text-xs uppercase tracking-widest"
          >
            Agora não
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          Você pode mudar isso depois no botão do GPS, no topo da página.
        </p>
      </DialogContent>
    </Dialog>
  );
}
