// Verificações de DOM (toHaveAttribute, toHaveTextContent...) para o expect do Vitest.
import "@testing-library/jest-dom/vitest";
// Depois de cada teste: desmonta o que foi renderizado e desfaz os mocks (fetch, temporizadores...).
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// O jsdom não tem ResizeObserver, que o controle deslizante (Radix) usa para medir o polegar.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
