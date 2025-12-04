// src/utils/roleLanding.js

const LAST_SHOP_KEY = "iclas_last_shop_id";

// You can call this when user clicks a shop in the sidebar
export function saveLastShopId(shopId) {
  try {
    if (shopId == null) return;
    localStorage.setItem(LAST_SHOP_KEY, String(shopId));
  } catch {}
}

export function readLastShopId() {
  try {
    const v = localStorage.getItem(LAST_SHOP_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Pick a shop id safely
export function pickLandingShopId(user) {
  const last = readLastShopId();

  // user.shop_ids comes from your backend auth response (multi-shop safe)
  const shopIds = Array.isArray(user?.shop_ids) ? user.shop_ids : [];

  // For cashiers, limit to their assigned shops
  const role = String(user?.role || "").toLowerCase();
  const isCashier = role === "cashier";

  if (isCashier) {
    if (last != null && shopIds.includes(last)) return last;
    if (user?.shop_id != null) return Number(user.shop_id);
    if (shopIds[0] != null) return Number(shopIds[0]);
    return null;
  }

  // Owner/Manager: can use last shop if present, else fall back
  if (last != null) return last;
  if (user?.shop_id != null) return Number(user.shop_id);
  if (shopIds[0] != null) return Number(shopIds[0]);
  return 1; // final fallback (only for global roles)
}

/**
 * ✅ IMPORTANT:
 * Adjust these paths to match YOUR actual routes:
 * - Shop Workspace route
 * - Sales & POS route
 */
export function getLandingPath(user) {
  const role = String(user?.role || "").toLowerCase();
  const shopId = pickLandingShopId(user);

  // If cashier has no shop assigned, send them to a safe page (or logout screen)
  if (role === "cashier" && !shopId) return "/login";

  if (role === "cashier") {
    // 👇 change this to your real SalesPOS route if different
    return `/shop/${shopId}/pos`;
  }

  // OWNER + MANAGER land on workspace
  // 👇 change this to your real workspace route if different
  return `/shop/${shopId}`;
}
