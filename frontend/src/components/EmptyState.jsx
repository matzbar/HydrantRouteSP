import { Loader2 } from "lucide-react";

/** Mensagem centralizada no lugar da lista (carregando, nada selecionado...), com ícone girando se `spin`. */
export default function EmptyState({ text, spin }) {
  return (
    <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-400">
      {spin && <Loader2 className="w-4 h-4 animate-spin" />}
      {text}
    </div>
  );
}
