import { describe, expect, it } from "vitest";
import { GPS_ZOOM, haversineKm, mapView } from "./mapView";

const VILA_FORMOSA = [[-23.567, -46.545], [-23.571, -46.539]];

describe("haversineKm", () => {
  it("mede a distância em linha reta", () => {
    // Praça da Sé → Av. Paulista (MASP): cerca de 2,6 km
    expect(haversineKm([-23.5503, -46.6339], [-23.5614, -46.6559])).toBeCloseTo(2.6, 1);
    expect(haversineKm([-23.5, -46.6], [-23.5, -46.6])).toBe(0);
  });
});

describe("mapView", () => {
  it("enquadra os hidrantes e inclui o GPS quando está perto (até 10 km)", () => {
    const gps = { lat: -23.548, lon: -46.555 };
    expect(mapView(VILA_FORMOSA, gps)).toEqual({ bounds: [...VILA_FORMOSA, [gps.lat, gps.lon]] });
  });

  it("deixa o GPS de fora quando está longe, para não afastar o mapa", () => {
    const campinas = { lat: -22.9, lon: -47.06 };
    expect(mapView(VILA_FORMOSA, campinas)).toEqual({ bounds: VILA_FORMOSA });
  });

  it("sem hidrantes, centraliza no GPS; sem nada, mantém a vista", () => {
    expect(mapView([], { lat: -23.5, lon: -46.6 })).toEqual({ center: [-23.5, -46.6], zoom: GPS_ZOOM });
    expect(mapView([], null)).toBeNull();
  });
});
