import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NO_FILTERS } from "../lib/hydrantFilters";
import HydrantTable from "./HydrantTable";

const H = [
  { id: "1", code: "15214", type: "coluna", status: "possivel_de_uso", address: "Rua A", municipality: "São Paulo",
    last_inspection: "2026-03-14", geocoded: true, location_source: "oficial", url: "https://exemplo/15214" },
  { id: "2", code: "1396", type: "subterraneo", status: "inoperante", address: "Rua B", municipality: "São Paulo",
    geocoded: false, location_source: "endereco" },
];

function setup(filtered = H) {
  const onFiltersChange = vi.fn();
  render(<HydrantTable hydrants={H} filtered={filtered} filters={NO_FILTERS} onFiltersChange={onFiltersChange} />);
  return { onFiltersChange, user: userEvent.setup() };
}

describe("HydrantTable", () => {
  it("mostra cada hidrante com tipo, situação, data no formato brasileiro e avisos de posição", () => {
    setup();
    const row = screen.getByTestId("hydrant-row-15214");
    expect(within(row).getByRole("link", { name: "15214" })).toHaveAttribute("href", "https://exemplo/15214");
    expect(row).toHaveTextContent("Coluna");
    expect(row).toHaveTextContent("Possível de uso");
    expect(row).toHaveTextContent("14/03/2026");
    const other = screen.getByTestId("hydrant-row-1396");
    expect(within(other).getByTitle("Posição aproximada pelo endereço")).toBeTruthy();
    expect(within(other).getByLabelText("Fora do mapa")).toBeTruthy();
    expect(screen.getByText(/2 de 2 hidrantes/)).toBeTruthy();
  });

  it("os filtros têm nome e avisam a página da mudança", async () => {
    const { onFiltersChange, user } = setup();
    const status = screen.getByRole("group", { name: "Situação" });
    await user.click(within(status).getByRole("button", { name: "Inoperante" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...NO_FILTERS, status: "inoperante" });

    await user.click(within(screen.getByRole("group", { name: "Tipo de hidrante" })).getByRole("button", { name: "Coluna" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...NO_FILTERS, type: "coluna" });

    await user.type(screen.getByRole("textbox", { name: "Buscar" }), "x");
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...NO_FILTERS, q: "x" });
  });

  it("Bica só aparece como filtro quando a estação tem hidrante desse tipo", () => {
    setup();
    expect(within(screen.getByRole("group", { name: "Tipo de hidrante" })).queryByRole("button", { name: "Bica" })).toBeNull();
  });
});
