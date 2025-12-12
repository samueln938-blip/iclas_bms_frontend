// FILE: src/App.jsx
import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";

import "./App.css";

// Layout
import AppLayout from "./layout/AppLayout.jsx";

// Admin pages
import ItemCataloguePage from "./pages/admin/ItemCataloguePage.jsx";
import ShopsManagementPage from "./pages/admin/ShopsManagementPage.jsx";
import UserManagementPage from "./pages/admin/UserManagementPage.jsx";

// ✅ ICLAS Summary page (Owner/Manager landing)
import ICLASSummaryPage from "./pages/ICLASSummaryPage.jsx";

// Shop pages
import ShopWorkspacePage from "./pages/shop/ShopWorkspacePage.jsx";
import ShopStockPage from "./pages/shop/ShopStockPage.jsx";
import ShopPurchasesPage from "./pages/shop/ShopPurchasesPage.jsx";
import ShopSalesHistoryPage from "./pages/shop/ShopSalesHistoryPage.jsx";
import ShopClosuresHistoryPage from "./pages/shop/ShopClosuresHistoryPage.jsx";
import SalesPOS from "./pages/shop/SalesPOS.jsx";
import CreditPage from "./pages/shop/CreditPage.jsx";
import InventoryChecksPage from "./pages/shop/InventoryChecksPage.jsx"; // ✅ NEW

// Auth
import LoginPage from "./pages/LoginPage.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";

// ✅ Landing helper (for cashier; uses shop_id / shop_ids / last_shop)
import { getLandingPath } from "./utils/roleLanding.js";

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
// ✅ Error Boundary (prevents blank screen)
// =====================================
class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Keep console logs for debugging
    console.error("❌ Page crashed:", error);
    console.error("❌ Component stack:", info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.props.title || "This page crashed";
    const hint =
      this.props.hint ||
      "This usually happens when hooks are called conditionally (React error #310). Check the console for details.";

    return (
      <div className="h-screen flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-2xl shadow p-6 border border-gray-200">
          <div className="text-xl font-semibold text-red-600">{title}</div>
          <div className="mt-2 text-sm text-gray-700">{hint}</div>

          <div className="mt-4 text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-xl p-3">
            {String(this.state.error?.message || this.state.error || "Unknown error")}
          </div>

          <div className="mt-5 flex gap-3">
            <button
              className="px-4 py-2 rounded-full bg-gray-900 text-white font-semibold"
              onClick={() => window.location.reload()}
              type="button"
            >
              Reload
            </button>
            <button
              className="px-4 py-2 rounded-full border border-gray-300 font-semibold"
              onClick={() => this.setState({ hasError: false, error: null })}
              type="button"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
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
// ✅ Role based home redirect (UPDATED)
// - OWNER/MANAGER -> ICLAS Summary (/iclas)
// - CASHIER -> Sales & POS (roleLanding.js)
// =====================================
function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const role = toCanonicalRole(user.role);

  if (role === "admin" || role === "manager") {
    return <Navigate to="/iclas" replace />;
  }

  // Cashier stays on POS (or credits when redirected)
  const path = getLandingPath(user);
  return <Navigate to={path} replace />;
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

          {/* ✅ ICLAS Summary for Owner/Manager */}
          <Route
            path="/iclas"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <ICLASSummaryPage />
              </RequireAuth>
            }
          />

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
          <Route
            path="/admin/users"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <UserManagementPage />
              </RequireAuth>
            }
          />

          {/* ----- Shop section ----- */}
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
                <PageErrorBoundary
                  title="Purchases page crashed"
                  hint="React error #310 = hooks order mismatch. Most often caused by conditional hooks in this page or in a custom hook (like useAuth). Check console for the real stack."
                >
                  <ShopPurchasesPage />
                </PageErrorBoundary>
              </RequireAuth>
            }
          />
          {/* ✅ NEW: Inventory checks (Owner/Manager only) */}
          <Route
            path="/shops/:shopId/inventory-checks"
            element={
              <RequireAuth allowedRoles={["admin", "manager"]}>
                <InventoryChecksPage />
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
