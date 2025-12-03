// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import "./App.css";

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
// Role based home redirect
// - OWNER -> /admin/shops
// - MANAGER -> /admin/shops  ✅ same as owner (full view)
// - CASHIER -> /shops/:shopId/pos
// =====================================
function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const role = toCanonicalRole(user.role);
  const shopId = user.shop_id;

  if (role === "admin") return <Navigate to="/admin/shops" replace />;

  if (role === "manager") {
    // ✅ manager lands like owner
    return <Navigate to="/admin/shops" replace />;
  }

  // cashier
  return shopId ? <Navigate to={`/shops/${shopId}/pos`} replace /> : <Navigate to="/unauthorized" replace />;
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
          {/* ✅ Manager can VIEW admin pages. Read-only is enforced inside pages + backend. */}
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
          <Route
            path="/admin/users"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <UserManagementPage />
              </RequireAuth>
            }
          />

          {/* ----- Shop section ----- */}
          {/* Cashiers should NOT access workspace routes */}
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

          {/* ✅ Cashier CAN access closures history */}
          <Route
            path="/shops/:shopId/closures-history"
            element={
              <RequireAuth allowedRoles={["admin", "manager", "cashier"]}>
                <ShopClosuresHistoryPage />
              </RequireAuth>
            }
          />

          {/* ✅ Sales & POS */}
          <Route
            path="/shops/:shopId/pos"
            element={
              <RequireAuth allowedRoles={["admin", "manager", "cashier"]}>
                <SalesPOS />
              </RequireAuth>
            }
          />
          <Route
            path="/shops/:shopId/sales-pos"
            element={
              <RequireAuth allowedRoles={["admin", "manager", "cashier"]}>
                <SalesPOS />
              </RequireAuth>
            }
          />

          {/* ✅ Credits */}
          <Route
            path="/shops/:shopId/credits"
            element={
              <RequireAuth allowedRoles={["admin", "manager", "cashier"]}>
                <CreditPage />
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
