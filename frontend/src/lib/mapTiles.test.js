import { describe, expect, it, vi } from "vitest";
import { OSM_TILES, maptilerAccepts, tilesFromConfig } from "./mapTiles";

const MAPTILER = { map: { provider: "maptiler", maptiler_key: "chave/123", maptiler_style: "streets-v2" } };

describe("tilesFromConfig", () => {
  it("usa o MapTiler com a chave do backend, codificada na URL", () => {
    const tiles = tilesFromConfig(MAPTILER);
    expect(tiles.provider).toBe("maptiler");
    expect(tiles.url).toBe("https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}{r}.png?key=chave%2F123");
    expect(tiles.crossOrigin).toBe("anonymous");
  });

  it("sem chave, ou com o backend indicando OSM, usa o OpenStreetMap", () => {
    expect(tilesFromConfig({ map: { provider: "osm", maptiler_key: null } })).toBe(OSM_TILES);
    expect(tilesFromConfig({ map: { provider: "maptiler", maptiler_key: "" } })).toBe(OSM_TILES);
    expect(tilesFromConfig(null)).toBe(OSM_TILES);
  });
});

describe("maptilerAccepts", () => {
  it("consulta um bloco de teste e diz se o MapTiler aceitou a chave", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    await expect(maptilerAccepts(tilesFromConfig(MAPTILER))).resolves.toBe(true);
    expect(fetch.mock.calls[0][0]).toBe("https://api.maptiler.com/maps/streets-v2/256/0/0/0.png?key=chave%2F123");
  });

  it("chave recusada (403) → false: o app troca para o OpenStreetMap", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(maptilerAccepts(tilesFromConfig(MAPTILER))).resolves.toBe(false);
  });

  it("sem internet → null: não troca, porque nenhum mapa carregaria", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(maptilerAccepts(tilesFromConfig(MAPTILER))).resolves.toBeNull();
  });

  it("OpenStreetMap não precisa de conferência", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(maptilerAccepts(OSM_TILES)).resolves.toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
