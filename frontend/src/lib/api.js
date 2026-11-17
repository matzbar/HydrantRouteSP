// Chamadas à API do backend, com o fetch nativo do navegador.

// Vazio = mesma origem (o backend serve o frontend). Defina VITE_BACKEND_URL só se hospedá-los separados.
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
export const API = `${BACKEND_URL}/api`;

/** Erro de uma resposta da API: `status` HTTP e `detail`, o texto que a API manda para mostrar ao usuário. */
export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    signal,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.detail);
  return data;
}

// Mensagem de erro para mostrar ao usuário. A API manda texto em "detail"; nas recusas de validação ela manda
// uma lista de objetos, que não pode ir direto para a tela. Falha de rede: usa a mensagem padrão.
export function errorMessage(e, fallback) {
  const detail = e?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
}

export const getConfig = () => request("/config");
export const listStations = () => request("/stations");
export const getStationHydrants = (code) => request(`/stations/${encodeURIComponent(code)}/hydrants`);
export const retryStationGeocode = (code) => request(`/stations/${encodeURIComponent(code)}/geocode-retry`, { method: "POST" });
// `signal` (AbortController) cancela o pedido quando a rota deixa de valer (troca de estação ou de filtro).
export const optimizeRoute = (payload, signal) => request("/route/optimize", { method: "POST", body: payload, signal });
