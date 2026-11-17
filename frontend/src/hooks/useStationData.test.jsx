import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import useStationData from "./useStationData";

vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

const page = (pending) => ({ station: { code: "701031102" }, cycle: "2026 2º SEM", hydrants: [], geocode: { pending, failed: 0 } });

// Deixa as promessas pendentes terminarem dentro do act (sem avançar os temporizadores).
const flush = () => act(async () => {});

describe("useStationData", () => {
  it("carrega a estação e repete a cada 3 s enquanto há endereços sendo localizados", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(api, "getStationHydrants")
      .mockResolvedValueOnce(page(5))
      .mockResolvedValueOnce(page(0));
    const { result } = renderHook(() => useStationData("701031102"));
    await flush();
    expect(result.current.data.geocode.pending).toBe(5);
    expect(spy).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.current.data.geocode.pending).toBe(0);

    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(spy).toHaveBeenCalledTimes(2); // terminou: parou de consultar
  });

  it("erro na primeira carga mostra a mensagem do backend", async () => {
    vi.spyOn(api, "getStationHydrants").mockRejectedValue(new api.ApiError(502, "Página do CB SP indisponível"));
    const { result } = renderHook(() => useStationData("701031102"));
    await flush();
    expect(result.current.error).toBe("Página do CB SP indisponível");
    expect(result.current.loading).toBe(false);
  });

  it("trocar de estação limpa os dados da anterior e para as consultas dela", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(api, "getStationHydrants").mockImplementation((code) =>
      Promise.resolve({ ...page(code === "701031102" ? 3 : 0), station: { code } }));
    const { result, rerender } = renderHook(({ code }) => useStationData(code), { initialProps: { code: "701031102" } });
    await flush();
    expect(result.current.data.station.code).toBe("701031102");

    rerender({ code: "701011201" });
    await flush();
    expect(result.current.data.station.code).toBe("701011201");
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(spy.mock.calls.map(([code]) => code)).toEqual(["701031102", "701011201"]);
  });

  it("sem estação escolhida, não consulta nada", async () => {
    const spy = vi.spyOn(api, "getStationHydrants");
    renderHook(() => useStationData(""));
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });
});
