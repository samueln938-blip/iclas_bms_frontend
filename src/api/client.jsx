// src/api/client.jsx
import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";
const AUTH_KEY = "iclas_auth";

function getTokenFromStorage() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;

  // Sometimes people store plain token string; support it.
  try {
    const parsed = JSON.parse(raw);

    if (typeof parsed === "string") return parsed;

    // Support multiple common shapes:
    // { token: "..." }
    // { access_token: "..." }
    // { accessToken: "..." }
    // { data: { access_token: "..." } }
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
      // If someone already stored "Bearer xxx", normalize it
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
