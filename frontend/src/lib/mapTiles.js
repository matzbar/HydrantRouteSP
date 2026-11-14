// Camada de fundo do mapa: MapTiler quando o backend informa uma chave; senão, OpenStreetMap.

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

export const OSM_TILES = {
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
