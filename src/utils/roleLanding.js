// FILE: src/utils/roleLanding.js

const LAST_SHOP_KEY = "iclas_last_shop_id";

// Call this when user clicks a shop in the sidebar (optional but recommended)
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

// Decide best shopId to land on
export function pickLandingShopId(user) {
  const last = readLastShopId();
  const shopIds = Array.isArray(user?.shop_ids) ? user.shop_ids : [];

  const role = String(user?.role || "").toLowerCase();
  const isCashier = role === "cashier";

  // Cashier: must stay within assigned shop(s)
  if (isCashier) {
    if (last != null && shopIds.includes(last)) return last;
    if (user?.shop_id != null) return Number(user.shop_id);
    if (shopIds[0] != null) return Number(shopIds[0]);
    return null;
  }

  // Owner/Manager: can use last shop, else fallback
  if (last != null) return last;
  if (user?.shop_id != null) return Number(user.shop_id);
  if (shopIds[0] != null) return Number(shopIds[0]);
  return 1; // final fallback
}

/**
 * Your actual routes (based on ShopWorkspacePage navigation):
 * - Workspace: /shops/:shopId
 * - Sales & POS: /shops/:shopId/sales-pos
 */
export function getLandingPath(user) {
  const role = String(user?.role || "").toLowerCase();
  const shopId = pickLandingShopId(user);

  if (!user) return "/login";

  // CASHIER -> Sales & POS
  if (role === "cashier") {
    if (!shopId) return "/login";
    return `/shops/${shopId}/sales-pos`;
  }

  // OWNER + MANAGER -> Shop Workspace
  if (!shopId) return "/login";
  return `/shops/${shopId}`;
}
