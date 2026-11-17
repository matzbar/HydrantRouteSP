import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GpsConsent from "./GpsConsent";

function setup() {
  const onAccept = vi.fn();
  const onDecline = vi.fn();
  render(<GpsConsent open onAccept={onAccept} onDecline={onDecline} />);
  return { onAccept, onDecline, user: userEvent.setup() };
}

describe("GpsConsent", () => {
  it("explica para que serve a localização, com título e descrição acessíveis", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Usar sua localização?" });
    expect(dialog).toHaveAccessibleDescription(/usa a localização do seu aparelho/);
    expect(dialog).toHaveTextContent("não é armazenada pelo app");
  });

  it("a ação principal recebe o foco e aceita", async () => {
    const { onAccept, user } = setup();
    const accept = screen.getByRole("button", { name: "Usar minha localização" });
    expect(accept).toHaveFocus();
    await user.click(accept);
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("'Agora não' e Esc recusam", async () => {
    const { onDecline, user } = setup();
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    await user.keyboard("{Escape}");
    expect(onDecline).toHaveBeenCalledTimes(2);
  });
});
