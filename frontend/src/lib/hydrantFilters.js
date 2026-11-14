// Filtros da lista de hidrantes (busca, tipo e situação). O mesmo resultado vale para a tabela, o mapa e a rota.

export const NO_FILTERS = { q: "", type: "todos", status: "todos" };

export const isFiltering = (f) => f.q.trim() !== "" || f.type !== "todos" || f.status !== "todos";

export function filterHydrants(hydrants, f) {
  const n = f.q.trim().toLowerCase();
  return hydrants.filter((h) => {
    if (f.type !== "todos" && h.type !== f.type) return false;
    if (f.status !== "todos" && h.status !== f.status) return false;
    if (n) {
      const fields = [h.code, h.address, h.sector].map((v) => (v || "").toLowerCase());
      if (!fields.some((v) => v.includes(n))) return false;
    }
    return true;
  });
}
