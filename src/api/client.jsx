// src/api/client.jsx
import axios from "axios";

const AUTH_KEY = "iclas_auth";

// ✅ Use Vite env var in production (DigitalOcean: VITE_API_BASE)
// Fallback to localhost only if env var is missing (local dev)
function normalizeBaseUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

const ENV_API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) || "";

const API_BASE = normalizeBaseUrl(ENV_API_BASE) || "http://127.0.0.1:8000";

function getTokenFromStorage() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    if (typeof parsed === "string") return parsed;

    // Support shapes:
    // { token: "..." }
    // { access_token: "..." }
    // { accessToken: "..." }
    // { data: { access_token: "..." } }
    // { token: "...", user: {...} }  ✅ your current shape
    const token =
      parsed?.token ||
      parsed?.access_token ||
      parsed?.accessToken ||
      parsed?.data?.access_token ||
      null;

    return token;
  } catch {
    // raw wasn't JSON → treat it as token string
    return raw;
  }
}

const api = axios.create({
  baseURL: API_BASE,
});

// Automatically attach Authorization: Bearer <token>
api.interceptors.request.use(
  (config) => {
    const token = getTokenFromStorage();
    if (token) {
      config.headers = config.headers || {};
      const clean = String(token).startsWith("Bearer ")
        ? String(token).slice(7)
        : String(token);
      config.headers.Authorization = `Bearer ${clean}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
