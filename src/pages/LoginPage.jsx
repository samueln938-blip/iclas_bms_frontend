// src/pages/LoginPage.jsx
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ---------------- Helpers ----------------
  function canonicalRole(role) {
    const r = String(role || "").trim().toLowerCase();
    // AuthContext normalizes OWNER->admin etc, but keep safe:
    if (r === "owner") return "admin";
    if (r === "admin") return "admin";
    if (r === "manager") return "manager";
    if (r === "cashier") return "cashier";
    // backend raw values
    if (String(role || "").toUpperCase() === "OWNER") return "admin";
    if (String(role || "").toUpperCase() === "MANAGER") return "manager";
    if (String(role || "").toUpperCase() === "CASHIER") return "cashier";
    return "cashier";
  }

  function defaultLandingFor(user) {
    const role = canonicalRole(user?.role);
    const shopId = user?.shop_id;

    if (role === "admin" || role === "manager") return "/admin/shops";
    // cashier
    return shopId ? `/shops/${shopId}/pos` : "/unauthorized";
  }

  function isSafeFromPathForRole(fromPath, user) {
    const p = String(fromPath || "");
    if (!p) return false;

    // never bounce back into auth/error pages
    if (p === "/login" || p === "/unauthorized") return false;

    const role = canonicalRole(user?.role);

    // Admin/Manager: allow internal routes
    if (role === "admin" || role === "manager") {
      return p.startsWith("/admin") || p.startsWith("/shops") || p === "/";
    }

    // Cashier: only allow the pages they’re supposed to use
    // (Sales & POS + Credits + Closures History) and only within /shops/:id/...
    const cashierAllowed = /^\/shops\/\d+\/(pos|sales-pos|credits|closures-history)\/?$/i;
    return cashierAllowed.test(p);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const payload = await login(username.trim(), password);

      const me = payload?.user || null;

      const from = location.state?.from?.pathname || "";
      const target = isSafeFromPathForRole(from, me) ? from : defaultLandingFor(me);

      navigate(target || "/", { replace: true });
    } catch (err) {
      console.error("Login failed:", err);

      const msg = String(err?.message || "").trim();

      // Show clearer message for network/CORS failures (production)
      if (
        msg.toLowerCase().includes("cannot reach api server") ||
        msg.toLowerCase().includes("network error") ||
        msg.toLowerCase().includes("cors")
      ) {
        setError(msg);
      } else {
        setError("Invalid username or password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------- STYLES ----------------
  const pageStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 16px",
    background:
      "linear-gradient(135deg, #0f2580 0%, #0f2580 35%, #f9fafb 35%, #fff 100%)",
  };

  const cardWrapperStyle = {
    width: "100%",
    maxWidth: "960px",
  };

  const cardStyle = {
    backgroundColor: "#ffffff",
    borderRadius: "32px",
    padding: "48px 40px 56px",
    boxShadow: "0 30px 80px rgba(15, 37, 128, 0.20)",
    margin: "0 auto",
  };

  const headingStyle = {
    fontSize: "42px",
    fontWeight: 800,
    textAlign: "center",
    color: "#0b1120",
    letterSpacing: "0.02em",
    marginBottom: "16px",
  };

  const accentRowStyle = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "10px",
    marginBottom: "24px",
  };

  const blueLineStyle = {
    width: "140px",
    height: "4px",
    borderRadius: "999px",
    background: "#2563eb",
  };

  const redLineStyle = {
    width: "55px",
    height: "4px",
    borderRadius: "999px",
    background: "#ef4444",
  };

  const subtitleStyle = {
    textAlign: "center",
    fontSize: "18px",
    color: "#4b5563",
    marginBottom: "40px",
  };

  const formStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "24px",
  };

  const fieldBlockStyle = {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
  };

  const labelStyle = {
    fontSize: "16px",
    fontWeight: 600,
    color: "#111827",
  };

  const inputStyle = {
    width: "70%",
    maxWidth: "720px",
    height: "46px",
    borderRadius: "999px",
    border: "1px solid #e5e7eb",
    backgroundColor: "#eff6ff",
    padding: "0 18px",
    fontSize: "16px",
    outline: "none",
    boxShadow: "0 0 0 1px transparent",
  };

  const buttonStyle = {
    marginTop: "10px",
    width: "70%",
    maxWidth: "720px",
    height: "56px",
    borderRadius: "999px",
    border: "none",
    cursor: submitting ? "default" : "pointer",
    fontSize: "18px",
    fontWeight: 700,
    color: "#ffffff",
    background:
      "linear-gradient(90deg, #2563eb 0%, #4f46e5 40%, #ec4899 80%, #ef4444 100%)",
    boxShadow: "0 18px 40px rgba(37, 99, 235, 0.35)",
    opacity: submitting ? 0.85 : 1,
  };

  const errorBoxStyle = {
    width: "70%",
    maxWidth: "720px",
    margin: "0 auto 8px auto",
    padding: "10px 14px",
    borderRadius: "12px",
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
    fontSize: "14px",
    textAlign: "center",
  };

  return (
    <div style={pageStyle}>
      <div style={cardWrapperStyle}>
        <div style={cardStyle}>
          <h1 style={headingStyle}>ICLAS BMS – Login</h1>

          <div style={accentRowStyle}>
            <span style={blueLineStyle} />
            <span style={redLineStyle} />
            <span style={redLineStyle} />
          </div>

          <p style={subtitleStyle}>
            Sign in to manage your shops and daily business operations.
          </p>

          {error && <div style={errorBoxStyle}>{error}</div>}

          <form onSubmit={handleSubmit} style={formStyle}>
            <div style={fieldBlockStyle}>
              <label style={labelStyle} htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
                autoComplete="username"
                autoFocus
                disabled={submitting}
              />
            </div>

            <div style={fieldBlockStyle}>
              <label style={labelStyle} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                autoComplete="current-password"
                disabled={submitting}
              />
            </div>

            <button type="submit" style={buttonStyle} disabled={submitting}>
              {submitting ? "Logging in…" : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
