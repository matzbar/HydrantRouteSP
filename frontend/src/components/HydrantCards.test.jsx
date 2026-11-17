import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import HydrantCards from "./HydrantCards";

const H = [
  { id: "a", code: "15214", type: "subterraneo", status: "inoperante", address: "Rua Luis Romanini esquina com a Rua Doutor Carlos Camilo Haddad",
    municipality: "São Paulo", sector: "4289", last_inspection: "2026-02-05", flow: "NÃO MEDIDA", lat: -23.56, lon: -46.54,
    location_source: "oficial", url: "https://exemplo/15214" },
  { id: "b", code: "1396", type: "coluna", status: "possivel_de_uso", address: "Rua B", municipality: "São Paulo",
    lat: -23.57, lon: -46.55, location_source: "endereco" },
  { id: "c", code: "4301", type: "coluna", status: "nao_localizado", address: "Rua C", municipality: "São Paulo",
    lat: null, lon: null },
];

function setup() {
  const onShowOnMap = vi.fn();
  render(<HydrantCards hydrants={H} onShowOnMap={onShowOnMap} />);
  return { onShowOnMap, user: userEvent.setup() };
}

describe("HydrantCards", () => {
  it("mostra tudo de cada hidrante, sem precisar rolar para o lado", () => {
    setup();
    const card = screen.getByTestId("hydrant-card-15214");
    expect(within(card).getByRole("link", { name: "15214" })).toHaveAttribute("href", "https://exemplo/15214");
    expect(card).toHaveTextContent("Inoperante");
    expect(card).toHaveTextContent("Subterrâneo");
    expect(card).toHaveTextContent("Rua Luis Romanini esquina com a Rua Doutor Carlos Camilo Haddad");
    expect(card).toHaveTextContent("São Paulo · Setor 4289");
    expect(card).toHaveTextContent("Últ. vistoria 05/02/2026 · Vazão NÃO MEDIDA");
    expect(screen.getByTestId("hydrant-card-1396")).toHaveTextContent("posição aproximada pelo endereço");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("tocar no cartão ou em 'Ver no mapa' leva ao hidrante no mapa", async () => {
    const { onShowOnMap, user } = setup();
    await user.click(screen.getByText("Rua B"));
    expect(onShowOnMap).toHaveBeenLastCalledWith("b");
    await user.click(screen.getByRole("button", { name: "Ver o hidrante 15214 no mapa" }));
    expect(onShowOnMap).toHaveBeenLastCalledWith("a");
    expect(onShowOnMap).toHaveBeenCalledTimes(2); // o botão não dispara o toque do cartão de novo
  });

  it("o link do código abre a ficha e não move o mapa", async () => {
    const { onShowOnMap, user } = setup();
    await user.click(screen.getByRole("link", { name: "15214" }));
    expect(onShowOnMap).not.toHaveBeenCalled();
  });

  it("hidrante fora do mapa: avisa e não oferece 'Ver no mapa'", async () => {
    const { onShowOnMap, user } = setup();
    const card = screen.getByTestId("hydrant-card-4301");
    expect(card).toHaveTextContent("Fora do mapa: endereço não localizado");
    expect(within(card).queryByRole("button")).toBeNull();
    await user.click(within(card).getByText("Rua C"));
    expect(onShowOnMap).not.toHaveBeenCalled();
  });
});
