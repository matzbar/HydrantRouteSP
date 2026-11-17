import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useGps from "./useGps";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));

const POS = { coords: { latitude: -23.548, longitude: -46.555 } };

// Navegador simulado: estado da permissão e um GPS que responde (ou recusa) na hora.
function browser(state, { deny = false } = {}) {
  const getCurrentPosition = vi.fn((ok, fail) => (deny ? fail({ code: 1 }) : ok(POS)));
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: { getCurrentPosition },
    permissions: { query: vi.fn().mockResolvedValue({ state }) },
  });
  return getCurrentPosition;
}

const settle = () => act(async () => {});

describe("useGps", () => {
  beforeEach(() => localStorage.clear());

  it("primeira visita: mostra o aviso e NÃO pede a localização sozinho", async () => {
    const gpsCall = browser("prompt");
    const { result } = renderHook(() => useGps());
    await settle();
    expect(result.current.needsConsent).toBe(true);
    expect(gpsCall).not.toHaveBeenCalled();
  });

  it("'Usar minha localização' pede a localização só depois do toque", async () => {
    const gpsCall = browser("prompt");
    const { result } = renderHook(() => useGps());
    await settle();
    act(() => result.current.requestGps());
    expect(gpsCall).toHaveBeenCalledOnce();
    expect(result.current.gps).toEqual({ lat: -23.548, lon: -46.555 });
    expect(result.current.needsConsent).toBe(false);
  });

  it("'Agora não' fica lembrado: na próxima visita, sem aviso e sem GPS", async () => {
    const gpsCall = browser("prompt");
    const first = renderHook(() => useGps());
    await settle();
    act(() => first.result.current.declineGps());
    expect(first.result.current.gpsErr).toMatch(/desativado/);
    first.unmount();

    const again = renderHook(() => useGps());
    await settle();
    expect(again.result.current.needsConsent).toBe(false);
    expect(again.result.current.gpsErr).toMatch(/desativado/);
    expect(gpsCall).not.toHaveBeenCalled();
  });

  it("depois de 'Agora não', o botão do GPS volta a pedir", async () => {
    const gpsCall = browser("prompt");
    localStorage.setItem("hydrantroute:gps", "nao");
    const { result } = renderHook(() => useGps());
    await settle();
    act(() => result.current.requestGps());
    expect(gpsCall).toHaveBeenCalledOnce();
    expect(localStorage.getItem("hydrantroute:gps")).toBeNull();
  });

  it("permissão já dada antes: obtém a localização direto, sem aviso", async () => {
    const gpsCall = browser("granted");
    const { result } = renderHook(() => useGps());
    await settle();
    expect(result.current.needsConsent).toBe(false);
    expect(gpsCall).toHaveBeenCalledOnce();
    expect(result.current.gps).not.toBeNull();
  });

  it("permissão bloqueada no navegador: avisa e não insiste", async () => {
    const gpsCall = browser("denied");
    const { result } = renderHook(() => useGps());
    await settle();
    expect(result.current.needsConsent).toBe(false);
    expect(result.current.gpsErr).toMatch(/bloqueada/);
    expect(gpsCall).not.toHaveBeenCalled();
  });

  it("recusa na pergunta do navegador vira aviso de bloqueio", async () => {
    browser("prompt", { deny: true });
    const { result } = renderHook(() => useGps());
    await settle();
    act(() => result.current.requestGps());
    expect(result.current.gps).toBeNull();
    expect(result.current.gpsErr).toMatch(/bloqueada/);
  });
});
