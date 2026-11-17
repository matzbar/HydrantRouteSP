// Nomes, siglas e cores dos tipos e situações de hidrante, usados pela tabela, pelo mapa e pelo resultado da rota.
// As cores ficam aqui em hexadecimal porque vão para estilos em linha e para o Leaflet, que não leem classes.

export const typeLabel = { subterraneo: "Subterrâneo", coluna: "Coluna", bica: "Bica" };

export const statusLabel = {
  possivel_de_uso: "Possível de uso",
  inoperante: "Inoperante",
  nao_localizado: "Não localizado",
  sem_vistoria: "Sem vistoria",
};

// Siglas dos botões de filtro; o nome completo aparece ao passar o mouse e é o que o leitor de tela anuncia.
export const statusShort = { possivel_de_uso: "OP", inoperante: "INOP", nao_localizado: "N/LOC" };

export const statusColor = {
  possivel_de_uso: "#10B981",
  inoperante: "#EF4444",
  nao_localizado: "#F59E0B",
  sem_vistoria: "#94A3B8",
  outro: "#94A3B8",
};
export const colorOfStatus = (status) => statusColor[status] || statusColor.outro;

// Cor do marcador no mapa, por tipo.
export const typeColor = { subterraneo: "#3B82F6", coluna: "#8B5CF6", bica: "#14B8A6", outro: "#64748B" };

// Etiqueta do tipo na tabela (fundo translúcido + texto claro).
export const typeBadgeStyle = {
  subterraneo: { backgroundColor: "#1E3A8A33", color: "#93C5FD" },
  coluna: { backgroundColor: "#5B21B633", color: "#C4B5FD" },
  bica: { backgroundColor: "#0F766E33", color: "#5EEAD4" },
  outro: { backgroundColor: "#33415533", color: "#CBD5E1" },
};

export const hasCoords = (h) => h.lat != null && h.lon != null;
