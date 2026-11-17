import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useInstallApp from "./useInstallApp";

const realUA = navigator.userAgent;
const setUA = (ua) => Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });

// Pedido de instalação do Chrome simulado.
function chromeOffersInstall() {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = vi.fn();
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  act(() => { window.dispatchEvent(event); });
  return event;
}

describe("useInstallApp", () => {
  afterEach(() => {
    setUA(realUA);
    act(() => { window.dispatchEvent(new Event("appinstalled")); }); // limpa o pedido guardado entre testes
  });

  it("sem pedido do Chrome e fora do iPhone, não mostra o botão", () => {
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.canInstall).toBe(false);
  });

  it("Chrome/Android: o botão aparece e abre a instalação do navegador uma vez", async () => {
    const { result } = renderHook(() => useInstallApp());
    const event = chromeOffersInstall();
    expect(event.defaultPrevented).toBe(true); // o app mostra o próprio botão
    expect(result.current.canInstall).toBe(true);
    await act(() => result.current.install());
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(result.current.canInstall).toBe(false);
  });

  it("depois de instalado, o botão some", () => {
    const { result } = renderHook(() => useInstallApp());
    chromeOffersInstall();
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(result.current.canInstall).toBe(false);
  });

  it("iPhone: o botão aparece e mostra o passo a passo", async () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1");
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.canInstall).toBe(true);
    await act(() => result.current.install());
    expect(result.current.iosHelpOpen).toBe(true);
    act(() => result.current.closeIosHelp());
    expect(result.current.iosHelpOpen).toBe(false);
  });

  it("aberto como app instalado (tela cheia), não oferece instalar de novo", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    vi.stubGlobal("matchMedia", (q) => ({ matches: q === "(display-mode: standalone)" }));
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.canInstall).toBe(false);
  });
});
