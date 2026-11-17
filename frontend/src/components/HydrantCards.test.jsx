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

function setup(startId = null) {
  const onShowOnMap = vi.fn();
  const onSetFirstStop = vi.fn();
  render(<HydrantCards hydrants={H} startId={startId} onShowOnMap={onShowOnMap} onSetFirstStop={onSetFirstStop} />);
  return { onShowOnMap, onSetFirstStop, user: userEvent.setup() };
}
const row = (code) => within(screen.getByTestId(`hydrant-card-${code}`)).getByRole("button", { expanded: false });

describe("HydrantCards", () => {
  it("fechado, cada hidrante é uma linha: código, endereço e situação (cor do ícone; nome para leitor de tela)", () => {
    setup();
    const line = row("15214");
    expect(line).toHaveTextContent("15214");
    expect(line).toHaveTextContent("Rua Luis Romanini");
    expect(line).not.toHaveTextContent("INOP"); // só a cor do ícone na tela
    expect(line).toHaveTextContent("Inoperante"); // nome da situação só para leitor de tela
    expect(screen.queryByTestId("hydrant-card-details")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("tocar na linha abre o cartão com o resto das informações; um aberto por vez", async () => {
    const { user } = setup();
    await user.click(row("15214"));
    const card = screen.getByTestId("hydrant-card-15214");
    expect(within(card).getByRole("button", { expanded: true })).toBeInTheDocument();
    const details = within(card).getByTestId("hydrant-card-details");
    expect(details).toHaveTextContent("Subterrâneo");
    expect(details).toHaveTextContent("São Paulo · Setor 4289");
    expect(details).toHaveTextContent("Últ. vistoria 05/02/2026 · Vazão NÃO MEDIDA");
    expect(within(details).getByRole("link", { name: "Ficha do hidrante 15214 no CB SP" })).toHaveAttribute("href", "https://exemplo/15214");

    await user.click(row("1396"));
    expect(screen.getAllByTestId("hydrant-card-details")).toHaveLength(1);
    expect(screen.getByTestId("hydrant-card-1396")).toHaveTextContent("posição aproximada pelo endereço");
  });

  it("'Ver no mapa' e 'Definir 1ª parada' no cartão aberto", async () => {
    const { onShowOnMap, onSetFirstStop, user } = setup();
    await user.click(row("15214"));
    await user.click(screen.getByRole("button", { name: "Ver o hidrante 15214 no mapa" }));
    expect(onShowOnMap).toHaveBeenCalledWith("a");
    await user.click(screen.getByRole("button", { name: "Definir 1ª parada" }));
    expect(onSetFirstStop).toHaveBeenCalledWith("a");
  });

  it("a primeira parada atual aparece marcada e o cartão oferece removê-la", async () => {
    const { onSetFirstStop, user } = setup("b");
    expect(row("1396")).toHaveTextContent("(primeira parada)");
    await user.click(row("1396"));
    await user.click(screen.getByRole("button", { name: "Remover 1ª parada" }));
    expect(onSetFirstStop).toHaveBeenCalledWith(null);
  });

  it("hidrante fora do mapa: avisa e não oferece mapa nem primeira parada", async () => {
    const { user } = setup();
    await user.click(row("4301"));
    const details = screen.getByTestId("hydrant-card-details");
    expect(details).toHaveTextContent("Fora do mapa: endereço não localizado");
    expect(within(details).queryByRole("button")).toBeNull();
  });
});
