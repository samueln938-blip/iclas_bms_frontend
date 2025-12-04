// FILE: src/App.jsx
import React, { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";

import "./App.css";

// ✅ API client (used only to pick a default shop for OWNER/MANAGER when shop_id is missing)
import api from "./api/client";

// Layout
import AppLayout from "./layout/AppLayout.jsx";

// Admin pages
import ItemCataloguePage from "./pages/admin/ItemCataloguePage.jsx";
import ShopsManagementPage from "./pages/admin/ShopsManagementPage.jsx";
import UserManagementPage from "./pages/admin/UserManagementPage.jsx";

// Shop pages
import ShopWorkspacePage from "./pages/shop/ShopWorkspacePage.jsx";
import ShopStockPage from "./pages/shop/ShopStockPage.jsx";
import ShopPurchasesPage from "./pages/shop/ShopPurchasesPage.jsx";
import ShopSalesHistoryPage from "./pages/shop/ShopSalesHistoryPage.jsx";
import ShopClosuresHistoryPage from "./pages/shop/ShopClosuresHistoryPage.jsx";
import SalesPOS from "./pages/shop/SalesPOS.jsx";
import CreditPage from "./pages/shop/CreditPage.jsx";

// Auth
import LoginPage from "./pages/LoginPage.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";

// =====================================
// Role normalization (supports OWNER/MANAGER/CASHIER too)
// =====================================
function toCanonicalRole(role) {
  const r = String(role || "").trim();

  // Backend role strings (OWNER/MANAGER/CASHIER)
  if (r.toUpperCase() === "OWNER") return "admin";
  if (r.toUpperCase() === "MANAGER") return "manager";
  if (r.toUpperCase() === "CASHIER") return "cashier";

  // Frontend/admin legacy
  return r.toLowerCase();
}

function normalizeAllowedRoles(allowedRoles) {
  if (!allowedRoles || !Array.isArray(allowedRoles)) return null;
  return allowedRoles.map((r) => toCanonicalRole(r));
}

// =====================================
// Auth guard
// =====================================
function RequireAuth({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-700 text-lg">
        Checking session…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const canonicalUserRole = toCanonicalRole(user.role);
  const canonicalAllowed = normalizeAllowedRoles(allowedRoles);

  if (canonicalAllowed && !canonicalAllowed.includes(canonicalUserRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

// =====================================
// Shop access guard
// - Cashier must ONLY access their assigned shop_id
// - Owner/Manager can access any shop
// =====================================
function RequireShopAccess({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { shopId } = useParams();

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  const role = toCanonicalRole(user.role);

  // Owner/Manager: global access
  if (role === "admin" || role === "manager") return children;

  // Cashier: must match their assigned shop_id
  const myShopId = user.shop_id;

  if (!myShopId) {
    return <Navigate to="/unauthorized" replace />;
  }

  const requested = String(shopId || "");
  const mine = String(myShopId);

  if (requested !== mine) {
    // Friendly redirect to the cashier’s own shop, keeping POS/Credits intent
    const wantsCredits = location.pathname.includes("/credits");
    const dest = wantsCredits ? `/shops/${mine}/credits` : `/shops/${mine}/pos`;
    return <Navigate to={dest} replace />;
  }

  return children;
}

// =====================================
// Simple pages
// =====================================
function NotFound() {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <a href="/" className="text-blue-600 underline">
        Go back to home
      </a>
    </div>
  );
}

function Unauthorized() {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold text-red-600 text-center">
        You don&apos;t have access to this page
      </h1>
      <a href="/" className="text-blue-600 underline">
        Go back to home
      </a>
    </div>
  );
}

// =====================================
// ✅ NEW: If OWNER/MANAGER has no shop_id,
// pick the first active shop and go to its workspace.
// =====================================
function GlobalDefaultShopRedirect() {
  const [shopId, setShopId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await api.get("/shops/", {
          params: { only_active: true, skip: 0, limit: 1 },
        });

        const first = Array.isArray(res.data) ? res.data[0] : null;
        const id = first?.id ?? null;

        if (!alive) return;

        if (id) setShopId(id);
        else setFailed(true);
      } catch (e) {
        if (!alive) return;
        setFailed(true);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-700 text-lg">
        Opening workspace…
      </div>
    );
  }

  if (!shopId || failed) {
    // No shops exist OR request failed → only then open Shops Management
    return <Navigate to="/admin/shops" replace />;
  }

  return <Navigate to={`/shops/${shopId}/workspace`} replace />;
}

// =====================================
// ✅ Role based home redirect (FIXED)
// - OWNER/MANAGER -> Shop Workspace (their shop_id if set, otherwise auto-pick first shop)
// - CASHIER -> Sales & POS
// =====================================
function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const role = toCanonicalRole(user.role);
  const shopId = user.shop_id;

  // Owner/Manager -> workspace
  if (role === "admin" || role === "manager") {
    return shopId ? (
      <Navigate to={`/shops/${shopId}/workspace`} replace />
    ) : (
      <GlobalDefaultShopRedirect />
    );
  }

  // Cashier -> POS
  return shopId ? (
    <Navigate to={`/shops/${shopId}/pos`} replace />
  ) : (
    <Navigate to="/unauthorized" replace />
  );
}

// =====================================
// Protected application (inside layout)
// =====================================
function ProtectedApp() {
  return (
    <RequireAuth allowedRoles={["admin", "manager", "cashier"]}>
      <AppLayout>
        <Routes>
          {/* Default after login */}
          <Route path="/" element={<HomeRedirect />} />

          {/* ----- Admin section ----- */}
          <Route
            path="/admin/items"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <ItemCataloguePage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/shops"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <ShopsManagementPage />
              </RequireAuth>
            }
          />

          {/* ✅ Manager can VIEW users. Read-only is enforced inside UserManagementPage + backend */}
          <Route
            path="/admin/users"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <UserManagementPage />
              </RequireAuth>
            }
          />

          {/* ----- Shop section ----- */}
          {/* Admin/Manager shop pages */}
          <Route
            path="/shops/:shopId"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <ShopWorkspacePage />
              </RequireAuth>
            }
          />
          <Route
            path="/shops/:shopId/workspace"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <ShopWorkspacePage />
              </RequireAuth>
            }
          />
          <Route
            path="/shops/:shopId/stock"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <ShopStockPage />
              </RequireAuth>
            }
          />
          <Route
            path="/shops/:shopId/purchases"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <ShopPurchasesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/shops/:shopId/sales-history"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <ShopSalesHistoryPage />
              </RequireAuth>
            }
          />

          {/* ❌ Cashier should NOT access separate closures history page (they use the tabs inside SalesPOS instead) */}
          <Route
            path="/shops/:shopId/closures-history"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <ShopClosuresHistoryPage />
              </RequireAuth>
            }
          />

          {/* ✅ Sales & POS (Cashier allowed, but ONLY for assigned shop) */}
          <Route
            path="/shops/:shopId/pos"
            element={
              <RequireAuth allowedRoles={["admin", "manager", "cashier"]}>
                <RequireShopAccess>
                  <SalesPOS />
                </RequireShopAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/shops/:shopId/sales-pos"
            element={
              <RequireAuth allowedRoles={["admin", "manager", "cashier"]}>
                <RequireShopAccess>
                  <SalesPOS />
                </RequireShopAccess>
              </RequireAuth>
            }
          />

          {/* ✅ Credits (Cashier allowed, but ONLY for assigned shop) */}
          <Route
            path="/shops/:shopId/credits"
            element={
              <RequireAuth allowedRoles={["admin", "manager", "cashier"]}>
                <RequireShopAccess>
                  <CreditPage />
                </RequireShopAccess>
              </RequireAuth>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </RequireAuth>
  );
}

// =====================================
// Root App
// =====================================
function AppInner() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/*" element={<ProtectedApp />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </AuthProvider>
  );
}
