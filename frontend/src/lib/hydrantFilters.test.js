import { describe, expect, it } from "vitest";
import { NO_FILTERS, filterHydrants, isFiltering } from "./hydrantFilters";

const H = [
  { id: "1", code: "15214", address: "Rua Luis Romanini", sector: "4289", type: "coluna", status: "possivel_de_uso" },
  { id: "2", code: "1396", address: "Rua São Pedro do Piauí", sector: "4289", type: "subterraneo", status: "inoperante" },
  { id: "3", code: "4301", address: "Rua Anambés", sector: "4490", type: "coluna", status: "nao_localizado" },
  { id: "4", code: "988", address: null, sector: null, type: "coluna", status: "possivel_de_uso" },
];
const ids = (list) => list.map((h) => h.id);

describe("filterHydrants", () => {
  it("sem filtro devolve todos", () => {
    expect(ids(filterHydrants(H, NO_FILTERS))).toEqual(["1", "2", "3", "4"]);
  });

  it("filtra por tipo e por situação ao mesmo tempo (E)", () => {
    expect(ids(filterHydrants(H, { ...NO_FILTERS, type: "coluna" }))).toEqual(["1", "3", "4"]);
    expect(ids(filterHydrants(H, { ...NO_FILTERS, type: "coluna", status: "possivel_de_uso" }))).toEqual(["1", "4"]);
  });

  it("busca em código, endereço e setor, sem diferenciar maiúsculas e ignorando espaços nas pontas", () => {
    expect(ids(filterHydrants(H, { ...NO_FILTERS, q: "  ROMANINI " }))).toEqual(["1"]);
    expect(ids(filterHydrants(H, { ...NO_FILTERS, q: "4289" }))).toEqual(["1", "2"]);
    expect(ids(filterHydrants(H, { ...NO_FILTERS, q: "988" }))).toEqual(["4"]);
  });

  it("aguenta endereço e setor vazios", () => {
    expect(ids(filterHydrants(H, { ...NO_FILTERS, q: "rua" }))).toEqual(["1", "2", "3"]);
  });
});

describe("isFiltering", () => {
  it("só é verdadeiro com algum filtro ativo", () => {
    expect(isFiltering(NO_FILTERS)).toBe(false);
    expect(isFiltering({ ...NO_FILTERS, q: "   " })).toBe(false);
    expect(isFiltering({ ...NO_FILTERS, q: "x" })).toBe(true);
    expect(isFiltering({ ...NO_FILTERS, status: "inoperante" })).toBe(true);
  });
});
