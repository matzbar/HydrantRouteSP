import axios from "axios";

// Empty = same origin (frontend served by the backend). Set REACT_APP_BACKEND_URL when hosting them separately.
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const listStations = () => api.get("/stations").then((r) => r.data);
export const getStationHydrants = (code) => api.get(`/stations/${code}/hydrants`).then((r) => r.data);
export const retryStationGeocode = (code) => api.post(`/stations/${code}/geocode-retry`).then((r) => r.data);
export const optimizeRoute = (payload) => api.post("/route/optimize", payload).then((r) => r.data);
