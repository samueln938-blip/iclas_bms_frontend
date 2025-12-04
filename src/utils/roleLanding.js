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

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Decide best shopId to land on
export function pickLandingShopId(user) {
  const last = readLastShopId();

  // backend gives these sometimes:
  const shopIds = Array.isArray(user?.shop_ids) ? user.shop_ids : [];
  const primary = toInt(user?.shop_id);

  const role = String(user?.role || "").toLowerCase();
  const isCashier = role === "cashier";

  // Cashier: must stay within assigned shop(s)
  if (isCashier) {
    if (last != null && shopIds.includes(last)) return last;
    if (primary != null) return primary;
    if (shopIds[0] != null) return toInt(shopIds[0]);
    return null;
  }

  // Owner/Manager: prefer last shop (if set), then primary, then first accessible shop
  if (last != null) return last;
  if (primary != null) return primary;
  if (shopIds[0] != null) return toInt(shopIds[0]);

  // ✅ SAFE: no fake fallback shop id in production
  return null;
}

/**
 * App routes (based on your routing):
 * - Workspace: /shops/:shopId/workspace  (or /shops/:shopId)
 * - Sales & POS: /shops/:shopId/pos
 */
export function getLandingPath(user) {
  if (!user) return "/login";

  const role = String(user?.role || "").toLowerCase();
  const shopId = pickLandingShopId(user);

  // CASHIER -> Sales & POS
  if (role === "cashier") {
    if (!shopId) return "/unauthorized";
    return `/shops/${shopId}/pos`;
  }

  // OWNER + MANAGER -> Shop Workspace
  if (!shopId) return "/admin/shops"; // no shop known yet
  return `/shops/${shopId}/workspace`;
}
