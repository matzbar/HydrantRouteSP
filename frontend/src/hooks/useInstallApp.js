import { useCallback, useEffect, useState } from "react";

// O Chrome (Android, computador) avisa que o app pode ser instalado com o evento "beforeinstallprompt", às vezes
// antes de a página montar. Ele é guardado aqui, no carregamento do módulo, para não se perder.
let deferredPrompt = null;
const listeners = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // o app mostra o próprio botão "Instalar app"
    deferredPrompt = event;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

// iPhone e iPad (o iPad recente se apresenta como Mac, mas tem tela de toque).
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Botão "Instalar app": no Chrome/Android abre a instalação do navegador; no iPhone, que não tem esse recurso,
 * mostra como adicionar à Tela de Início. Some quando o app já está instalado (aberto em tela cheia).
 *
 * @returns {{ canInstall: boolean, iosHelpOpen: boolean, install: Function, closeIosHelp: Function }}
 */
export default function useInstallApp() {
  const [, refresh] = useState(0);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    listeners.add(update);
    return () => listeners.delete(update);
  }, []);

  const standalone = isStandalone();
  const ios = isIos();
  const canInstall = !standalone && (deferredPrompt !== null || ios);

  const install = useCallback(async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null; // o Chrome só deixa usar o pedido uma vez
      prompt.prompt();
      await prompt.userChoice.catch(() => null);
      listeners.forEach((fn) => fn());
    } else if (ios) {
      setIosHelpOpen(true);
    }
  }, [ios]);

  const closeIosHelp = useCallback(() => setIosHelpOpen(false), []);

  return { canInstall, iosHelpOpen, install, closeIosHelp };
}
