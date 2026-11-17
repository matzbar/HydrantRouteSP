import { Share, SquarePlus, Smartphone } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

/** Passo a passo para instalar no iPhone/iPad, que não tem o botão de instalação do Chrome. */
export default function IosInstallHelp({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="bg-surface border-line text-slate-100 max-w-md w-[calc(100%-1.5rem)] rounded-lg" data-testid="ios-install-help">
        <DialogHeader className="text-left space-y-2">
          <div className="w-11 h-11 rounded-lg bg-route/15 border border-route/30 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-route" aria-hidden="true" />
          </div>
          <DialogTitle className="font-display uppercase tracking-wider text-2xl">Instalar no iPhone</DialogTitle>
          <DialogDescription className="text-sm text-slate-300">
            No Safari, são dois toques:
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm text-slate-300">
          <li className="flex gap-3 items-start">
            <span className="w-6 h-6 shrink-0 rounded-full bg-route text-page font-display font-black flex items-center justify-center" aria-hidden="true">1</span>
            <span>
              Toque em <b className="text-white">Compartilhar</b>{" "}
              <Share className="inline w-4 h-4 -mt-1 text-route" aria-label="(ícone de quadrado com seta para cima)" />, na barra do Safari.
            </span>
          </li>
          <li className="flex gap-3 items-start">
            <span className="w-6 h-6 shrink-0 rounded-full bg-route text-page font-display font-black flex items-center justify-center" aria-hidden="true">2</span>
            <span>
              Role a lista e toque em <b className="text-white">Adicionar à Tela de Início</b>{" "}
              <SquarePlus className="inline w-4 h-4 -mt-1 text-route" aria-hidden="true" />.
            </span>
          </li>
        </ol>
        <p className="text-xs text-slate-400">
          O HydrantRoute SP aparece na tela inicial com o ícone da chama e abre em tela cheia. No Chrome do iPhone, o
          caminho é o mesmo, pelo botão Compartilhar.
        </p>
        <Button onClick={onClose} className="h-11 btn-tactical-red font-display uppercase tracking-wider text-base font-bold">
          Entendi
        </Button>
      </DialogContent>
    </Dialog>
  );
}
