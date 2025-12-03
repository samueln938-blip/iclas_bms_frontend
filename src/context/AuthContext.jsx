// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";
const STORAGE_KEY = "iclas_auth";

const AuthContext = createContext(null);

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
  return {
    ...u,
    role: normalizeRole(u.role),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load auth state from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setUser(normalizeUser(parsed.user) || null);
        setToken(parsed.token || null);
      }
    } catch (err) {
      console.error("Failed to restore auth state:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const body = new URLSearchParams();
    body.set("grant_type", "password");
    body.set("username", username);
    body.set("password", password);

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) throw new Error("Invalid username or password");

    const data = await res.json();

    const accessToken = data.access_token || data.token || data.accessToken || null;
    if (!accessToken) console.warn("No access token in login response:", data);

    // Prefer backend's `user` object
    let me = null;
    if (data.user && typeof data.user === "object") {
      me = normalizeUser(data.user);
    } else {
      // Fallback: safest default is cashier, never admin
      me = normalizeUser({
        id: data.user_id ?? data.id ?? null,
        username: data.username ?? username,
        role: data.role ?? data.user_role ?? data.user_type ?? "CASHIER",
        shop_id: data.shop_id ?? null,
      });
    }

    const payload = { token: accessToken, user: me };
    setToken(accessToken);
    setUser(me);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
