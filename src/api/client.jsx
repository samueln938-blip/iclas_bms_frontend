// FILE: src/api/client.jsx
import axios from "axios";

const AUTH_KEY = "iclas_auth";

// ✅ Production API base (DigitalOcean backend)
const PROD_API_BASE = "https://iclas-bms-api-prod-pgtdc.ondigitalocean.app";

// ✅ Normalize base URL (remove trailing slash)
function normalizeBaseUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

// ✅ Prefer Vite env var if present; otherwise default to production API
const ENV_API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE) ||
  "";

export const API_BASE = normalizeBaseUrl(ENV_API_BASE) || PROD_API_BASE;

function getTokenFromStorage() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    if (typeof parsed === "string") return parsed;

    const token =
      parsed?.token ||
      parsed?.access_token ||
      parsed?.accessToken ||
      parsed?.data?.access_token ||
      null;

    return token;
  } catch {
    return raw;
  }
}

function cleanToken(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  if (t === "null" || t === "undefined") return null;
  // remove "Bearer " (any case) + trim
  return t.replace(/^bearer\s+/i, "").trim();
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// ✅ Automatically attach Authorization: Bearer <token>
api.interceptors.request.use(
  (config) => {
    const stored = getTokenFromStorage();
    const token = cleanToken(stored);

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ clearer error message for network/CORS failures
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (!error?.response) {
      return Promise.reject(
        new Error(
          `Network error: cannot reach API at ${API_BASE}. Check backend is up and CORS allows your frontend domain.`
        )
      );
    }
    return Promise.reject(error);
  }
);

export default api;
