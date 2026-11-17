import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import useRoute from "./useRoute";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { toast } = await import("sonner");

const located = [
  { id: "a", code: "1396", lat: -23.56, lon: -46.54, geocoded: true },
  { id: "b", code: "15214", lat: -23.57, lon: -46.55, geocoded: true },
];
const visible = [...located, { id: "c", code: "4301", lat: null, lon: null, geocoded: false }];
const ORIGIN = { lat: -23.548, lon: -46.555 };
const RESULT = { stops: [{ order: 1, id: "b" }, { order: 2, id: "a" }], total_distance_km: 3, total_duration_min: 7 };
const args = { origin: ORIGIN, located, visible, maxStops: 2, startId: null };

// Resposta controlada pelo teste: o cálculo só termina quando `finish` é chamado.
function pendingRoute() {
  let finish;
  const spy = vi.spyOn(api, "optimizeRoute").mockImplementation(
    () => new Promise((resolve) => { finish = resolve; }),
  );
  return { spy, finish: (value) => finish(value) };
}

describe("useRoute", () => {
  it("gera a rota: manda os pontos, liga cada parada ao hidrante e abre o resultado", async () => {
    const spy = vi.spyOn(api, "optimizeRoute").mockResolvedValue(RESULT);
    const { result } = renderHook(() => useRoute());
    await act(() => result.current.generate(args));

    expect(spy.mock.calls[0][0]).toEqual({
      origin_lat: ORIGIN.lat, origin_lon: ORIGIN.lon, max_stops: 2, start_id: null,
      points: [{ id: "a", lat: -23.56, lon: -46.54 }, { id: "b", lat: -23.57, lon: -46.55 }],
    });
    expect(result.current.route.stops.map((s) => s.hydrant.code)).toEqual(["15214", "1396"]);
    expect(result.current.route.unreachable).toEqual(["4301"]);
    expect(result.current.route.origin).toEqual(ORIGIN);
    expect(result.current.open).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Rota com 2 paradas gerada");
  });

  it("clear() no meio do cálculo cancela: a resposta antiga é ignorada e não há erro", async () => {
    const { spy, finish } = pendingRoute();
    const { result } = renderHook(() => useRoute());
    let pending;
    act(() => { pending = result.current.generate(args); });
    expect(result.current.loading).toBe(true);
    const signal = spy.mock.calls[0][1];

    act(() => result.current.clear()); // troca de estação ou de filtro
    expect(signal.aborted).toBe(true);
    expect(result.current.loading).toBe(false);

    await act(async () => { finish(RESULT); await pending; });
    expect(result.current.route).toBeNull();
    expect(result.current.open).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("um novo cálculo cancela o anterior", async () => {
    const first = pendingRoute();
    const { result } = renderHook(() => useRoute());
    act(() => { result.current.generate(args); });
    const firstSignal = first.spy.mock.calls[0][1];

    vi.spyOn(api, "optimizeRoute").mockResolvedValue(RESULT);
    await act(() => result.current.generate(args));
    expect(firstSignal.aborted).toBe(true);
    expect(result.current.route.stops).toHaveLength(2);
  });

  it("erro do backend aparece para o usuário e o botão volta ao normal", async () => {
    vi.spyOn(api, "optimizeRoute").mockRejectedValue(new api.ApiError(429, "Muitas requisições em pouco tempo."));
    const { result } = renderHook(() => useRoute());
    await act(() => result.current.generate(args));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(toast.error).toHaveBeenCalledWith("Muitas requisições em pouco tempo.");
    expect(result.current.route).toBeNull();
  });
});
