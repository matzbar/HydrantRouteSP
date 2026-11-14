// Camada de fundo do mapa: MapTiler quando o backend informa uma chave; senão, OpenStreetMap.

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

export const OSM_TILES = {
  provider: "osm",
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: OSM_ATTRIBUTION,
  maxZoom: 19,
};

export function tilesFromConfig(config) {
  const map = config?.map;
  if (map?.provider !== "maptiler" || !map.maptiler_key) return OSM_TILES;
  const style = encodeURIComponent(map.maptiler_style || "streets-v2");
  const key = encodeURIComponent(map.maptiler_key);
  return {
    provider: "maptiler",
    // {r} vira "@2x" em telas de alta densidade (celulares), com blocos mais nítidos.
    url: `https://api.maptiler.com/maps/${style}/256/{z}/{x}/{y}{r}.png?key=${key}`,
    attribution:
      '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">&copy; MapTiler</a> ' +
      OSM_ATTRIBUTION,
    maxZoom: 19,
    // A chave do MapTiler é restrita por origem, e o MapTiler confere o cabeçalho Origin. Imagens comuns não o
    // enviam; com crossOrigin, o navegador envia, e os blocos são aceitos.
    crossOrigin: "anonymous",
  };
}

// O MapTiler, ao recusar a chave (inválida, cota esgotada, origem não autorizada), responde 403 com uma imagem
// "Invalid key" que o navegador exibe como bloco normal: o mapa não "erra", fica coberto de avisos. Por isso o app
// consulta um bloco de teste e lê o status da resposta (o MapTiler permite a leitura: CORS "*").
export const PROBE_INTERVAL_MS = 15 * 60 * 1000;

/** true = MapTiler aceitou; false = recusou (trocar para o mapa alternativo); null = sem resposta (rede). */
export async function maptilerAccepts(tiles, timeoutMs = 8000) {
  if (tiles?.provider !== "maptiler") return true;
  const url = tiles.url.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0").replace("{r}", "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store", signal: ctrl.signal });
    return res.ok;
  } catch {
    return null; // sem internet ou tempo esgotado: nenhum mapa carregaria, então não troca
  } finally {
    clearTimeout(timer);
  }
}
