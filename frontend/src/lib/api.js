import axios from "axios";

// Vazio = mesma origem (o backend serve o frontend). Defina VITE_BACKEND_URL só se hospedá-los separados.
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const getConfig = () => api.get("/config").then((r) => r.data);
export const listStations = () => api.get("/stations").then((r) => r.data);
export const getStationHydrants = (code) => api.get(`/stations/${code}/hydrants`).then((r) => r.data);
export const retryStationGeocode = (code) => api.post(`/stations/${code}/geocode-retry`).then((r) => r.data);
export const optimizeRoute = (payload) => api.post("/route/optimize", payload).then((r) => r.data);
