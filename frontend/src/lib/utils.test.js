import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("text-label e text-note substituem outros tamanhos de letra", () => {
    expect(cn("text-sm font-medium", "text-label")).toBe("font-medium text-label");
    expect(cn("text-xs", "text-note")).toBe("text-note");
  });

  it("não confunde tamanho de letra com cor", () => {
    expect(cn("text-label", "text-slate-400")).toBe("text-label text-slate-400");
  });
});
