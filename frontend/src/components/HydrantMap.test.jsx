import { describe, expect, it } from "vitest";
import { hydrantIcon } from "./HydrantMap";

const h = { code: "15214", type: "coluna", status: "possivel_de_uso" };

describe("hydrantIcon", () => {
  it("reaproveita o mesmo ícone para o mesmo tipo, situação e texto (o mapa não redesenha o marcador)", () => {
    expect(hydrantIcon(h)).toBe(hydrantIcon({ ...h }));
    expect(hydrantIcon(h, 3)).toBe(hydrantIcon({ ...h, code: "999" }, 3)); // na rota, vale a ordem
  });

  it("cria outro ícone quando muda a situação, o tipo ou a ordem", () => {
    expect(hydrantIcon(h)).not.toBe(hydrantIcon({ ...h, status: "inoperante" }));
    expect(hydrantIcon(h)).not.toBe(hydrantIcon({ ...h, type: "subterraneo" }));
    expect(hydrantIcon(h, 1)).not.toBe(hydrantIcon(h, 2));
  });

  it("mostra os 3 últimos dígitos do código e escapa o texto", () => {
    expect(hydrantIcon(h).options.html).toContain("<span>214</span>");
    expect(hydrantIcon({ ...h, code: "<b>" }).options.html).toContain("&lt;b&gt;");
  });
});
