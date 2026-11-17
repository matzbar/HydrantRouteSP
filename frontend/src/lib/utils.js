import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// text-label e text-note (index.css) são tamanhos de letra do app: ao juntar classes, eles substituem o text-sm
// dos componentes, como um text-[10px] faria.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": ["text-label", "text-note"] } },
});

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
