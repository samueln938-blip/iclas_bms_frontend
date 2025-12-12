// FILE: src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";

const STORAGE_KEY = "iclas_auth";
const AuthContext = createContext(null);

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

const API_BASE = normalizeBaseUrl(ENV_API_BASE) || PROD_API_BASE;

// ✅ Normalize backend roles -> frontend roles used in guards/menus
function normalizeRole(role) {
  const r = String(role || "").trim();
  const up = r.toUpperCase();

  // Backend style
  if (up === "OWNER") return "admin";
  if (up === "MANAGER") return "manager";
  if (up === "CASHIER") return "cashier";

  // Frontend style already
  const low = r.toLowerCase();
  if (low === "admin" || low === "manager" || low === "cashier") return low;

  // ✅ safest default (never default to admin!)
  return "cashier";
}

function normalizeUser(u) {
  if (!u || typeof u !== "object") return null;
  return { ...u, role: normalizeRole(u.role) };
}

function getErrorMessageFromResponse(data, fallback) {
  // Common FastAPI shapes: {detail:"..."} or {detail:[{msg:"..."}]}
  if (!data) return fallback;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
  if (typeof data.message === "string") return data.message;
  return fallback;
}

// ✅ Decode JWT and extract exp (in ms). Returns null if missing/invalid.
function getTokenExpiryMs(token) {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    // Base64URL → Base64 with padding
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4 !== 0) {
      payload += "=";
    }

    const json = JSON.parse(atob(payload));
    if (!json.exp) return null;

    // exp is in seconds → convert to milliseconds
    return json.exp * 1000;
  } catch {
    return null;
  }
}

// ✅ Read and parse auth payload safely (handy for fallback/debug)
function getStoredAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    const restoredToken =
      parsed?.token ||
      parsed?.access_token ||
      parsed?.accessToken ||
      parsed?.data?.access_token ||
      null;

    const restoredUser = normalizeUser(parsed?.user || parsed?.data?.user) || null;

    const restoredExpiry = parsed?.sessionExpiryMs ?? parsed?.expiry ?? null;

    return {
      token: restoredToken,
      user: restoredUser,
      sessionExpiryMs: restoredExpiry ? Number(restoredExpiry) : null,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔑 Track when this session should expire (ms since epoch)
  const [sessionExpiryMs, setSessionExpiryMs] = useState(null);
  const logoutTimerRef = useRef(null);

  // ✅ Common headers (no Content-Type here, safe for GET/POST without JSON)
  const authHeadersNoJson = useMemo(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  // ✅ JSON headers (used when sending JSON bodies)
  const authHeaders = useMemo(() => {
    return token
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };
  }, [token]);

  // ✅ Optional: a strict getter-style function for pages that call it like authHeadersNoJson()
  const authHeadersNoJsonStrict = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  // Load auth state from localStorage
  useEffect(() => {
    try {
      const restored = getStoredAuth();
      if (restored) {
        setUser(restored.user);
        setToken(restored.token);
        if (restored.sessionExpiryMs) {
          setSessionExpiryMs(restored.sessionExpiryMs);
        }
      }
    } catch (err) {
      console.error("Failed to restore auth state:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    // FastAPI OAuth2PasswordRequestForm expects x-www-form-urlencoded
    const body = new URLSearchParams();
    body.set("grant_type", "password");
    body.set("username", username);
    body.set("password", password);

    let res;
    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body, // ✅ pass URLSearchParams directly
      });
    } catch (e) {
      throw new Error(
        `Cannot reach API server at ${API_BASE}. Check API URL + CORS allow_origins on backend.`
      );
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      // ignore json parse errors
    }

    if (!res.ok) {
      throw new Error(getErrorMessageFromResponse(data, "Invalid username or password"));
    }

    const accessToken = data?.access_token || data?.token || data?.accessToken || null;
    if (!accessToken) {
      console.warn("No access token in login response:", data);
      throw new Error("Login succeeded but no token was returned by the server.");
    }

    // Prefer backend's `user` object
    let me = null;
    if (data?.user && typeof data.user === "object") {
      me = normalizeUser(data.user);
    } else {
      // Fallback: safest default is cashier, never admin
      me = normalizeUser({
        id: data?.user_id ?? data?.id ?? null,
        username: data?.username ?? username,
        role: data?.role ?? data?.user_role ?? data?.user_type ?? "CASHIER",
        shop_id: data?.shop_id ?? null,
        shop_ids: data?.shop_ids ?? [],
        access_shops: data?.access_shops ?? [],
      });
    }

    // 🔑 Compute expiry from token (preferred) or fallback to 24h from now
    let expiryMs = getTokenExpiryMs(accessToken);
    if (!expiryMs) {
      expiryMs = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    }

    const payload = { token: accessToken, user: me, sessionExpiryMs: expiryMs };

    setToken(accessToken);
    setUser(me);
    setSessionExpiryMs(expiryMs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    return payload;
  };

  const logout = useCallback(() => {
    // Clear any scheduled auto-logout
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }

    setUser(null);
    setToken(null);
    setSessionExpiryMs(null);
    localStorage.removeItem(STORAGE_KEY);

    // If you want a visible message, you can uncomment:
    // alert("Your session has expired. Please log in again.");
  }, []);

  // 🔁 Auto-logout when token reaches expiry time
  useEffect(() => {
    // clear any existing timer
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }

    if (!token || !sessionExpiryMs) return;

    const now = Date.now();
    const delay = sessionExpiryMs - now;

    // Already expired → logout immediately
    if (delay <= 0) {
      logout();
      return;
    }

    // Schedule logout
    logoutTimerRef.current = setTimeout(() => {
      logout();
    }, delay);

    // Cleanup
    return () => {
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
    };
  }, [token, sessionExpiryMs, logout]);

  // Extra safety: if app opens and session is already expired, logout instantly
  useEffect(() => {
    if (!token || !sessionExpiryMs) return;
    if (Date.now() >= sessionExpiryMs) {
      logout();
    }
  }, [token, sessionExpiryMs, logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        API_BASE, // helpful for debugging

        // ✅ Headers
        authHeaders, // JSON requests
        authHeadersNoJson, // GET/POST without JSON
        authHeadersNoJsonStrict, // function form if any page expects calling it

        // ✅ Optional helper (useful in some pages)
        getStoredAuth,

        // Optional: session expiry info (could help for UI later)
        sessionExpiryMs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
