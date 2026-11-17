import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RoutePanel from "./RoutePanel";

const base = {
  visible: [], startId: null, onStartChange: vi.fn(), onMap: 33, stopsShown: 5, stopsLimit: 25, routeMaxStops: 25,
  onStopsChange: vi.fn(), filtering: false, noStopsReason: null, loading: false, onGenerate: vi.fn(),
};

describe("RoutePanel", () => {
  it("mostra a quantidade e o limite, avisa quando há mais hidrantes que paradas e gera a rota", async () => {
    const onGenerate = vi.fn();
    render(<RoutePanel {...base} onGenerate={onGenerate} />);
    expect(screen.getByRole("spinbutton", { name: "Quantidade de hidrantes" })).toHaveValue(5);
    expect(screen.getByRole("slider", { name: "Quantidade de hidrantes" })).toBeInTheDocument();
    expect(screen.getByTestId("max-stops-note")).toHaveTextContent("33 hidrantes no mapa · máximo de 25 paradas");
    await userEvent.setup().click(screen.getByRole("button", { name: /Gerar Rota Otimizada/i }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it("limita o número digitado entre 1 e o máximo", async () => {
    const onStopsChange = vi.fn();
    render(<RoutePanel {...base} stopsShown={5} stopsLimit={25} onStopsChange={onStopsChange} />);
    const input = screen.getByRole("spinbutton", { name: "Quantidade de hidrantes" });
    const user = userEvent.setup();
    await user.clear(input);
    expect(onStopsChange).toHaveBeenLastCalledWith(1); // vazio → 1
    await user.type(input, "999");
    expect(onStopsChange).toHaveBeenLastCalledWith(25);
  });

  it("sem hidrantes no mapa: quantidade 0, controles e botão desabilitados, com o motivo", () => {
    const reason = "Esta estação não tem hidrantes pendentes de vistoria: não há rota a gerar.";
    render(<RoutePanel {...base} onMap={0} stopsShown={0} stopsLimit={0} noStopsReason={reason} />);
    expect(screen.getByRole("spinbutton", { name: "Quantidade de hidrantes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Gerar Rota Otimizada/i })).toBeDisabled();
    expect(screen.getByTestId("no-stops-note")).toHaveTextContent(reason);
  });

  it("com filtro ativo, avisa que a rota considera só os hidrantes do filtro", () => {
    render(<RoutePanel {...base} onMap={6} filtering />);
    expect(screen.getByTestId("route-filter-note")).toHaveTextContent("só os 6 hidrante(s) do filtro");
  });
});
