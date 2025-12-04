// FILE: src/utils/roleLanding.js

const LAST_SHOP_KEY = "iclas_last_shop_id";

// Call this when user clicks a shop in the sidebar (optional but recommended)
export function saveLastShopId(shopId) {
  try {
    const n = Number(shopId);
    if (!Number.isFinite(n)) return;
    localStorage.setItem(LAST_SHOP_KEY, String(n));
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

function toIntArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    const n = toInt(x);
    if (n != null) out.push(n);
  }
  // unique (stable)
  const seen = new Set();
  const uniq = [];
  for (const n of out) {
    if (!seen.has(n)) {
      seen.add(n);
      uniq.push(n);
    }
  }
  return uniq;
}

// Decide best shopId to land on
export function pickLandingShopId(user) {
  const last = readLastShopId();

  // backend gives these sometimes (might be [1,2] or ["1","2"])
  const shopIds = toIntArray(user?.shop_ids);
  const primary = toInt(user?.shop_id);

  const role = String(user?.role || "").toLowerCase();
  const isCashier = role === "cashier";

  // ✅ CASHIER: must stay within assigned shop(s)
  if (isCashier) {
    if (last != null && shopIds.includes(last)) return last;
    if (primary != null) return primary;
    if (shopIds[0] != null) return shopIds[0];
    return null;
  }

  // ✅ OWNER/MANAGER: prefer last (if exists), then primary, then first accessible
  if (last != null) return last;
  if (primary != null) return primary;
  if (shopIds[0] != null) return shopIds[0];

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
  if (!shopId) return "/admin/shops";
  return `/shops/${shopId}/workspace`;
}
