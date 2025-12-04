// FILE: src/layout/AppLayout.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";

// Shops in the sidebar are loaded from the backend.

function AppLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Get user + logout from auth context
  const { user, logout } = useAuth();

  // Support both old ("admin") and new ("OWNER") naming
  const role = String(user?.role || "").toLowerCase(); // "owner" | "manager" | "cashier" | maybe "admin"
  const isOwner = role === "owner" || role === "admin";
  const isManager = role === "manager";
  const isCashier = role === "cashier";

  // Owner + Manager share same layout view now
  const isGlobalViewer = isOwner || isManager;

  // -------- Sidebar shops state --------
  const [sidebarShops, setSidebarShops] = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarError, setSidebarError] = useState("");

  const myShopId = user?.shop_id || null;

  // ✅ Mobile drawer state
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // ✅ Detect mobile width (no extra libraries)
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);

      // If user expands to desktop, keep sidebar visible and close overlay
      if (!mobile) {
        setSidebarOpen(false);
      }
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ✅ Close drawer when route changes (mobile)
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  // ✅ Close drawer on ESC
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

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
    zIndex: 50, // above overlay
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    height: "70px",
    backgroundColor: "#0f2580",
    color: "#ffffff",
  };

  const headerLeftStyle = {
    display: "flex",
    alignItems: "baseline",
    gap: "12px",
    fontSize: "20px",
    fontWeight: 700,
    minWidth: 0,
  };

  const headerTitleWrapStyle = {
    display: "flex",
    alignItems: "baseline",
    gap: "12px",
    minWidth: 0,
  };

  const headerSubtitleStyle = {
    fontSize: "16px",
    fontWeight: 400,
    opacity: 0.9,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const userButtonStyle = {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    borderRadius: "999px",
    border: "none",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const menuButtonStyle = {
    width: 42,
    height: 42,
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.10)",
    color: "#ffffff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    fontWeight: 800,
    flex: "0 0 auto",
  };

  const bodyStyle = {
    display: "flex",
    flex: 1,
    minHeight: 0,
  };

  const sidebarStyle = {
    width: "260px",
    padding: "24px 16px",
    borderRight: "1px solid #e5e7eb",
    backgroundColor: "#ffffff",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    overflowY: "auto",
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

  const mainStyle = {
    flex: 1,
    padding: isMobile ? "16px 14px" : "24px 32px",
    backgroundColor: "#f3f4f6",
    overflowY: "auto",
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

  // Mobile drawer overlay styles
  const overlayStyle = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    zIndex: 40,
    display: sidebarOpen ? "block" : "none",
  };

  const drawerStyle = {
    position: "fixed",
    top: 70, // below header
    left: 0,
    bottom: 0,
    width: "280px",
    maxWidth: "85vw",
    backgroundColor: "#ffffff",
    borderRight: "1px solid #e5e7eb",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    zIndex: 45,
    transform: sidebarOpen ? "translateX(0)" : "translateX(-105%)",
    transition: "transform 0.18s ease",
    display: "flex",
    flexDirection: "column",
  };

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

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((v) => !v);
  }, []);

  const SidebarContent = (
    <div style={sidebarStyle}>
      {/* ✅ OWNER + MANAGER GLOBAL MENU (same view) */}
      {isGlobalViewer && (
        <>
          <div style={sidebarSectionTitleStyle}>GLOBAL</div>
          <nav style={navListStyle}>
            <NavLink
              to="/admin/items"
              style={({ isActive }) => ({
                ...sidebarLinkBase,
                ...(isActive ? sidebarLinkActive : {}),
              })}
            >
              Item Catalogue
            </NavLink>

            <NavLink
              to="/admin/shops"
              style={({ isActive }) => ({
                ...sidebarLinkBase,
                ...(isActive ? sidebarLinkActive : {}),
              })}
            >
              Shops Management
            </NavLink>

            {/* Manager can open it; page itself will be read-only for manager */}
            <NavLink
              to="/admin/users"
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
                style={({ isActive }) => ({
                  ...sidebarLinkBase,
                  ...(isActive ? sidebarLinkActive : {}),
                })}
              >
                Sales & POS
              </NavLink>

              <NavLink
                to={`/shops/${myShopId}/credits`}
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
        <div style={{ fontSize: "13px", color: "#b91c1c" }}>{sidebarError}</div>
      ) : visibleShops.length === 0 ? (
        <div style={{ fontSize: "13px", color: "#9ca3af" }}>
          {isGlobalViewer ? "No shops yet." : "No shop available for your account."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {visibleShops.map((shop) => (
            <button
              key={shop.id}
              style={shopButtonStyle}
              onClick={() => {
                // ✅ Cashier clicking a shop goes straight to POS
                if (isCashier) return navigate(`/shops/${shop.id}/pos`);
                return navigate(`/shops/${shop.id}`);
              }}
            >
              <span>{shop.name}</span>
              <span style={shopArrowStyle}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={shellStyle}>
      {/* TOP BLUE BAR */}
      <header style={headerStyle}>
        <div style={headerLeftStyle}>
          {/* ✅ Mobile menu button (collapses sidebar) */}
          {isMobile && (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
              title={sidebarOpen ? "Close menu" : "Open menu"}
              style={menuButtonStyle}
            >
              ☰
            </button>
          )}

          <div style={headerTitleWrapStyle}>
            <span style={{ whiteSpace: "nowrap" }}>ICLAS Ltd</span>
            <span style={headerSubtitleStyle}>Business Management System</span>
          </div>
        </div>

        <button style={userButtonStyle} onClick={handleLogout}>
          {displayName} | Logout
        </button>
      </header>

      {/* Mobile overlay + drawer */}
      {isMobile && (
        <>
          <div
            style={overlayStyle}
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside style={drawerStyle} aria-label="Sidebar">
            {SidebarContent}
          </aside>
        </>
      )}

      {/* Desktop layout */}
      <div style={bodyStyle}>
        {!isMobile && <aside style={sidebarStyle}>{SidebarContent.props.children}</aside>}

        {/* MAIN CONTENT */}
        <main style={mainStyle}>{children}</main>
      </div>
    </div>
  );
}

export default AppLayout;
