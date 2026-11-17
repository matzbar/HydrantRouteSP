import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StartPointPicker from "./StartPointPicker";

const H = [
  { id: "a", code: "1396", address: "Rua São Pedro do Piauí", geocoded: true },
  { id: "b", code: "15214", address: "Rua Luis Romanini", geocoded: true },
  { id: "c", code: "4301", address: "Rua Anambés", geocoded: false }, // fora do mapa: não pode ser escolhido
];

function setup(value = null) {
  const onChange = vi.fn();
  render(<StartPointPicker hydrants={H} value={value} onChange={onChange} />);
  return { onChange, input: screen.getByRole("combobox", { name: "Primeira parada" }), user: userEvent.setup() };
}

describe("StartPointPicker", () => {
  it("lista só os hidrantes no mapa e filtra pelo código ou endereço", async () => {
    const { input, user } = setup();
    await user.click(input);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "1396Rua São Pedro do Piauí", "15214Rua Luis Romanini",
    ]);
    await user.type(input, "romanini");
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("funciona pelo teclado: setas destacam, Enter escolhe, Esc fecha", async () => {
    const { input, onChange, user } = setup();
    await user.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    const active = screen.getByRole("option", { selected: true });
    expect(active).toHaveTextContent("15214");
    expect(input).toHaveAttribute("aria-activedescendant", active.id);

    await user.keyboard("{ArrowDown}"); // volta ao primeiro
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("1396");

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("a");
    expect(input).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("mostra a escolhida e permite voltar para automática", async () => {
    const { onChange, user } = setup("b");
    expect(screen.getByTestId("start-point-selected")).toHaveTextContent("15214 · Rua Luis Romanini");
    await user.click(screen.getByRole("button", { name: "Voltar para automática" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
