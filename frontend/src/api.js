import axios from "axios";

const API_BASE = "";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

export const fetchWells = (params = {}) => api.get("/api/wells", { params });
export const fetchWellDetail = (id) => api.get(`/api/wells/${id}`);
export const fetchForecast = (id, params = {}) => api.get(`/api/forecast/${id}`, { params });
export const fetchPriorityWells = () => api.get("/api/priority-wells");
export const fetchRetestAlerts = () => api.get("/api/retest-alerts");
export const fetchStats = () => api.get("/api/stats");
export const fetchFilters = () => api.get("/api/filters");
export const fetchDistricts = (state) => api.get(`/api/districts/${encodeURIComponent(state)}`);
export const postNlpQuery = (question) => api.post("/api/nlp", { question });
export const postAnalyzeReport = (params) => api.post("/api/analyze-report", { params });
export const fetchUsability = (wellId) => api.get(`/api/usability/${wellId}`);

export default api;
