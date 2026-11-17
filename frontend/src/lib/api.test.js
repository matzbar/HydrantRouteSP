import { describe, expect, it, vi } from "vitest";
import { ApiError, errorMessage, getStationHydrants, optimizeRoute } from "./api";

const respond = (status, body) => vi.fn().mockResolvedValue({
  ok: status >= 200 && status < 300,
  status,
  json: () => (body === undefined ? Promise.reject(new SyntaxError("vazio")) : Promise.resolve(body)),
});

describe("chamadas à API", () => {
  it("GET devolve o JSON da resposta", async () => {
    const fetch = respond(200, { hydrants: [] });
    vi.stubGlobal("fetch", fetch);
    await expect(getStationHydrants("701031102")).resolves.toEqual({ hydrants: [] });
    expect(fetch).toHaveBeenCalledWith("/api/stations/701031102/hydrants", expect.objectContaining({ method: "GET" }));
  });

  it("POST da rota manda JSON e repassa o sinal de cancelamento", async () => {
    const fetch = respond(200, { stops: [] });
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await optimizeRoute({ origin_lat: -23.5 }, signal);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/route/optimize");
    expect(init).toMatchObject({ method: "POST", signal, headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(init.body)).toEqual({ origin_lat: -23.5 });
  });

  it("erro HTTP vira ApiError com o status e o texto do backend", async () => {
    vi.stubGlobal("fetch", respond(429, { detail: "Muitas requisições em pouco tempo." }));
    const err = await optimizeRoute({}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(errorMessage(err, "padrão")).toBe("Muitas requisições em pouco tempo.");
  });

  it("erro sem corpo JSON também vira ApiError", async () => {
    vi.stubGlobal("fetch", respond(502));
    const err = await getStationHydrants("701031102").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
  });
});

describe("errorMessage", () => {
  it("usa a mensagem padrão quando o backend manda uma lista de validação ou quando não há resposta", () => {
    expect(errorMessage(new ApiError(422, [{ msg: "campo inválido" }]), "padrão")).toBe("padrão");
    expect(errorMessage(new TypeError("Failed to fetch"), "padrão")).toBe("padrão");
    expect(errorMessage(undefined, "padrão")).toBe("padrão");
  });
});
