import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const listHydrants = () => api.get("/hydrants").then((r) => r.data);
export const createHydrant = (payload) => api.post("/hydrants", payload).then((r) => r.data);
export const updateHydrant = (id, payload) => api.put(`/hydrants/${id}`, payload).then((r) => r.data);
export const deleteHydrant = (id) => api.delete(`/hydrants/${id}`).then((r) => r.data);
export const deleteAllHydrants = () => api.delete("/hydrants").then((r) => r.data);
export const geocodeStatus = () => api.get("/hydrants/geocode-status").then((r) => r.data);
export const geocodeRetry = () => api.post("/hydrants/geocode-retry").then((r) => r.data);
export const scrapeHydrants = () => api.post("/hydrants/scrape").then((r) => r.data);
export const bulkUpload = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/hydrants/bulk", fd, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
};
export const optimizeRoute = (payload) => api.post("/route/optimize", payload).then((r) => r.data);
