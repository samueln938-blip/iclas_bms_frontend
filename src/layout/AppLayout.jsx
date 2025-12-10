//src/layout/AppLayout.jsx
import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";

// ✅ Remember last opened shop for landing helpers
import { saveLastShopId } from "../utils/roleLanding.js";

// Shops in the sidebar are loaded from the backend.

function AppLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const HEADER_HEIGHT = 70;
  const MOBILE_BREAKPOINT_PX = 900;

  // ✅ Get user + logout from auth context
  const { user, logout } = useAuth();

  // Support both old ("admin") and new ("OWNER") naming
  const role = String(user?.role || "").toLowerCase(); // "owner" | "manager" | "cashier" | maybe "admin"
  const isOwner = role === "owner" || role === "admin";
  const isManager = role === "manager";
  const isCashier = role === "cashier";

  // Owner + Manager share same layout view now
  const isGlobalViewer = isOwner || isManager;

  // ✅ Detect routes that need "full-bleed" space (no extra layout padding)
  // Purchases pages often use wide tables — we let them control their own padding.
  const pathname = location.pathname || "";
  const isWidePage =
    pathname.includes("/purchases") ||
    pathname.includes("/pos") ||
    pathname.includes("/stock"); // keep safe for other wide grids if needed

  // -------- Responsive sidebar (mobile collapse) --------
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);

    const apply = () => {
      const mobile = !!mq.matches;
      setIsMobile(mobile);
      // Default: desktop = open, mobile = closed
      setSidebarOpen(!mobile);
    };

    apply();

    if (mq.addEventListener) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } else {
      // Safari / older browsers
      mq.addListener(apply);
      return () => mq.removeListener(apply);
    }
  }, []);

  // Close sidebar after navigation on mobile (keeps header + logout visible)
  useEffect(() => {
    if (isMobile && sidebarOpen) setSidebarOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const closeSidebarIfMobile = () => {
    if (isMobile) setSidebarOpen(false);
  };

  // -------- Sidebar shops state --------
  const [sidebarShops, setSidebarShops] = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarError, setSidebarError] = useState("");

  const myShopId = user?.shop_id || null;

  // Only show shops relevant to the current user:
  // - OWNER/MANAGER: all shops
  // - CASHIER: only their assigned shop_id
  const visibleShops = useMemo(() => {
    if (isGlobalViewer) return sidebarShops || [];
    if (!myShopId) return [];
    return (sidebarShops || []).filter((s) => s.id === myShopId);
  }, [isGlobalViewer, sidebarShops, myShopId]);

  useEffect(() => {
    const loadSidebarShops = async () => {
      setSidebarLoading(true);
      setSidebarError("");

      try {
        // only_active=true so we don’t show deactivated shops
        const res = await api.get("/shops/?only_active=true");
        setSidebarShops(res.data || []);
      } catch (err) {
        console.error("Error loading shops for sidebar", err);
        setSidebarError(
          err?.response?.data?.detail ||
            "Failed to load shops (backend may still block this role)."
        );
      } finally {
        setSidebarLoading(false);
      }
    };

    loadSidebarShops();
  }, []);

  // ✅ Cashiers: land on Sales & POS by default
  // (we do NOT block them from going to Credits later)
  useEffect(() => {
    if (!isCashier) return;
    if (!myShopId) return;

    const p = location.pathname || "";

    const isHome =
      p === "/" ||
      p === "/home" ||
      p === "/dashboard" ||
      p === "/shops" ||
      p === `/shops/${myShopId}` ||
      p === `/shops/${myShopId}/` ||
      p === `/shops/${myShopId}/workspace`;

    if (isHome) {
      navigate(`/shops/${myShopId}/pos`, { replace: true });
    }
  }, [isCashier, myShopId, location.pathname, navigate]);

  // ------------------------------------------------------------
  // Display name + logout
  // ------------------------------------------------------------
  const displayName = (() => {
    if (!user) return "Account";
    if (user.first_name || user.last_name) {
      return `${user.first_name || ""} ${user.last_name || ""}`.trim();
    }
    return user.username || "Account";
  })();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // ✅ One-click return if you leave the summary page without logging out
  const homePath = (() => {
    if (isCashier) {
      return myShopId ? `/shops/${myShopId}/pos` : "/unauthorized";
    }
    return "/iclas";
  })();

  // ---------- Inline styles ----------
  const shellStyle = {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  const headerStyle = {
    position: "sticky",
    top: 0,
    zIndex: 50, // above sidebar overlay
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: isMobile ? "0 14px" : "0 32px",
    height: `${HEADER_HEIGHT}px`,
    backgroundColor: "#0f2580",
    color: "#ffffff",
  };

  const headerLeftStyle = {
    display: "flex",
    alignItems: "baseline",
    gap: "12px",
    fontSize: isMobile ? "18px" : "20px",
    fontWeight: 700,
    minWidth: 0,
  };

  const headerSubtitleStyle = {
    fontSize: isMobile ? "13px" : "16px",
    fontWeight: 400,
    opacity: 0.9,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: isMobile ? "42vw" : "none",
  };

  const brandButtonStyle = {
    background: "transparent",
    border: "none",
    color: "#ffffff",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    font: "inherit",
    fontWeight: 800,
    whiteSpace: "nowrap",
  };

  const menuButtonStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "40px",
    height: "40px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.10)",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "18px",
    fontWeight: 800,
    flex: "0 0 auto",
  };

  const userButtonStyle = {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    borderRadius: "999px",
    border: "none",
    padding: isMobile ? "8px 12px" : "10px 24px",
    fontSize: isMobile ? "13px" : "14px",
    fontWeight: 600,
    cursor: "pointer",
    maxWidth: isMobile ? "44vw" : "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const bodyStyle = {
    display: "flex",
    flex: 1,
    minHeight: 0,
    position: "relative", // for overlay anchoring
    overflow: "hidden", // ✅ important: keep scrolling inside MAIN only
  };

  const overlayStyle = {
    position: "fixed",
    top: `${HEADER_HEIGHT}px`,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    zIndex: 40,
  };

  const sidebarStyle = {
    width: "260px",
    padding: isMobile ? "18px 14px" : "24px 16px",
    borderRight: "1px solid #e5e7eb",
    backgroundColor: "#ffffff",
    display: "flex",
    flexDirection: "column",
    gap: "16px",

    // Mobile drawer behavior
    ...(isMobile
      ? {
          position: "fixed",
          top: `${HEADER_HEIGHT}px`,
          left: 0,
          bottom: 0,
          zIndex: 45,
          width: "280px",
          boxShadow: "0 25px 60px rgba(15, 23, 42, 0.25)",
          transform: sidebarOpen ? "translateX(0)" : "translateX(-105%)",
          transition: "transform 0.18s ease",
        }
      : {}),
  };

  const sidebarSectionTitleStyle = {
    fontSize: "12px",
    fontWeight: 600,
    color: "#6b7280",
    letterSpacing: "0.08em",
  };

  const navListStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };

  // ✅ MAIN is the scroll container (both axes), inner wrapper provides padding.
  const mainStyle = {
    flex: 1,
    backgroundColor: "#f3f4f6",
    minWidth: 0,
    overflow: "auto", // ✅ enables horizontal scroll for wide tables (no clipping)
    scrollbarGutter: "stable", // ✅ reduces layout shift when scrollbar appears (supported in modern Chrome)
  };

  // ✅ FIX: wide pages should NOT be padding:0 (that causes the “hitting edges” look)
  const widePadding = isMobile ? "12px 12px" : "16px 18px";

  const mainInnerStyle = {
    padding: isWidePage ? widePadding : isMobile ? "16px 14px" : "24px 32px",
    minWidth: 0,
    boxSizing: "border-box",
  };

  const sidebarLinkBase = {
    display: "block",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "14px",
    textDecoration: "none",
    color: "#111827",
    cursor: "pointer",
  };

  const sidebarLinkActive = {
    backgroundColor: "#0f2580",
    color: "#ffffff",
    fontWeight: 600,
  };

  const shopButtonStyle = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderRadius: "999px",
    border: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
    fontSize: "14px",
    cursor: "pointer",
  };

  const shopArrowStyle = {
    fontSize: "14px",
    color: "#9ca3af",
  };

  return (
    <div style={shellStyle}>
      {/* TOP BLUE BAR */}
      <header style={headerStyle}>
        <div style={headerLeftStyle}>
          {isMobile && (
            <button
              type="button"
              style={menuButtonStyle}
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
              title={sidebarOpen ? "Close menu" : "Open menu"}
            >
              ☰
            </button>
          )}

          {/* ✅ Clickable brand: quick way back to Summary (Owner/Manager) or POS (Cashier) */}
          <button
            type="button"
            style={brandButtonStyle}
            onClick={() => navigate(homePath)}
            title="Go to home"
          >
            ICLAS Ltd
          </button>

          <span style={headerSubtitleStyle}>Business Management System</span>
        </div>

        <button style={userButtonStyle} onClick={handleLogout} title="Logout">
          {displayName} | Logout
        </button>
      </header>

      {/* SIDEBAR + MAIN */}
      <div style={bodyStyle}>
        {/* Mobile overlay */}
        {isMobile && sidebarOpen && (
          <div style={overlayStyle} onClick={() => setSidebarOpen(false)} />
        )}

        {/* LEFT SIDEBAR */}
        <aside style={sidebarStyle}>
          {/* ✅ OWNER + MANAGER GLOBAL MENU (same view) */}
          {isGlobalViewer && (
            <>
              <div style={sidebarSectionTitleStyle}>GLOBAL</div>
              <nav style={navListStyle}>
                <NavLink
                  to="/iclas"
                  onClick={closeSidebarIfMobile}
                  style={({ isActive }) => ({
                    ...sidebarLinkBase,
                    ...(isActive ? sidebarLinkActive : {}),
                  })}
                >
                  ICLAS Summary
                </NavLink>

                <NavLink
                  to="/admin/items"
                  onClick={closeSidebarIfMobile}
                  style={({ isActive }) => ({
                    ...sidebarLinkBase,
                    ...(isActive ? sidebarLinkActive : {}),
                  })}
                >
                  Item Catalogue
                </NavLink>

                <NavLink
                  to="/admin/shops"
                  onClick={closeSidebarIfMobile}
                  style={({ isActive }) => ({
                    ...sidebarLinkBase,
                    ...(isActive ? sidebarLinkActive : {}),
                  })}
                >
                  Shops Management
                </NavLink>

                <NavLink
                  to="/admin/users"
                  onClick={closeSidebarIfMobile}
                  style={({ isActive }) => ({
                    ...sidebarLinkBase,
                    ...(isActive ? sidebarLinkActive : {}),
                  })}
                >
                  User Management
                </NavLink>
              </nav>
            </>
          )}

          {/* ✅ CASHIER MENU (always anchored to their shop) */}
          {isCashier && (
            <>
              <div style={sidebarSectionTitleStyle}>CASHIER MENU</div>

              {!myShopId ? (
                <div style={{ fontSize: "13px", color: "#b91c1c" }}>
                  Your account has no shop assigned. Ask the OWNER to set shop_id.
                </div>
              ) : (
                <nav style={navListStyle}>
                  <NavLink
                    to={`/shops/${myShopId}/pos`}
                    onClick={closeSidebarIfMobile}
                    style={({ isActive }) => ({
                      ...sidebarLinkBase,
                      ...(isActive ? sidebarLinkActive : {}),
                    })}
                  >
                    Sales & POS
                  </NavLink>

                  <NavLink
                    to={`/shops/${myShopId}/credits`}
                    onClick={closeSidebarIfMobile}
                    style={({ isActive }) => ({
                      ...sidebarLinkBase,
                      ...(isActive ? sidebarLinkActive : {}),
                    })}
                  >
                    Credits
                  </NavLink>
                </nav>
              )}
            </>
          )}

          {/* SHOPS PANEL (dynamic) */}
          <div style={{ ...sidebarSectionTitleStyle, marginTop: "12px" }}>
            SHOPS
          </div>

          {sidebarLoading ? (
            <div style={{ fontSize: "13px", color: "#9ca3af" }}>
              Loading shops...
            </div>
          ) : sidebarError ? (
            <div style={{ fontSize: "13px", color: "#b91c1c" }}>
              {sidebarError}
            </div>
          ) : visibleShops.length === 0 ? (
            <div style={{ fontSize: "13px", color: "#9ca3af" }}>
              {isGlobalViewer
                ? "No shops yet."
                : "No shop available for your account."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {visibleShops.map((shop) => (
                <button
                  key={shop.id}
                  style={shopButtonStyle}
                  onClick={() => {
                    closeSidebarIfMobile();

                    // ✅ remember last opened shop
                    saveLastShopId(shop.id);

                    // ✅ Cashier clicking a shop goes straight to POS
                    if (isCashier) return navigate(`/shops/${shop.id}/pos`);

                    // Owner/Manager → shop workspace
                    return navigate(`/shops/${shop.id}`);
                  }}
                >
                  <span>{shop.name}</span>
                  <span style={shopArrowStyle}>›</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* MAIN CONTENT */}
        <main style={mainStyle}>
          <div style={mainInnerStyle}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
