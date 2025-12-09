// src/pages/shop/posUtils.js

// =========================
// Money & number formatting
// =========================

export function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value) || 0;
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Keep existing behaviour: integer-style plain number.
 * (Used where you want a rounded whole number.)
 */
export function formatPlainNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value) || 0;
  return String(Math.round(num));
}

/**
 * Normalizes a numeric string coming from inputs:
 * - strips commas & spaces
 * - trims
 */
export function normalizeNumberString(raw) {
  return String(raw ?? "").replace(/[, ]+/g, "").trim();
}

/**
 * Parse a decimal quantity (or amount) from user input.
 * Safe for values like "0.5", "1,200.25", "  3 ".
 * Used especially for quantities in POS.
 */
export function parseDecimal(raw, fallback = 0) {
  return parseAmount(raw, fallback);
}

/**
 * Parse an amount (money) from user input or API strings.
 * Backwards compatible with old behaviour, but now uses
 * normalizeNumberString and supports an optional fallback.
 */
export function parseAmount(raw, fallback = 0) {
  if (raw === null || raw === undefined) return fallback;
  const s = normalizeNumberString(raw);
  if (!s) return fallback;
  const cleaned = s.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Format quantities with up to 2 decimal places (for 0.25, 0.5, 1.75, etc.)
 * Used for stock, purchase and sales quantities.
 */
export function formatQty(value, maxFractionDigits = 2) {
  if (value === null || value === undefined || value === "") return "0";
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

// =========================
// Time helpers
// =========================

export function formatTimeHM(isoString) {
  if (!isoString) return "";

  const raw = String(isoString).trim();
  if (!raw) return "";

  // ✅ If backend sends a "naive" datetime (no timezone), treat it as Kigali time (+02:00)
  // Handles:
  // - "2025-12-09T10:30:00"
  // - "2025-12-09 10:30:00"
  // Leaves alone:
  // - "...Z"
  // - "...+02:00" / "...+0200"
  const hasTZ = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(raw);
  const hasTime = raw.includes("T") || /\d{2}:\d{2}/.test(raw);

  let parseable = raw;

  if (hasTime && !hasTZ) {
    // normalize space to T if needed
    if (!parseable.includes("T") && parseable.includes(" ")) {
      parseable = parseable.replace(" ", "T");
    }
    // append Kigali offset
    parseable = `${parseable}+02:00`;
  }

  const d = new Date(parseable);
  if (Number.isNaN(d.getTime())) return "";

  // ✅ Always display in Rwanda time (Africa/Kigali)
  return new Intl.DateTimeFormat("en-RW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Kigali",
  }).format(d);
}

export function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// =========================
// Payments helpers
// =========================

// backend → UI canonical
export function normalizePaymentType(raw) {
  const p = String(raw || "").toLowerCase().trim();
  if (!p) return "unknown";
  if (p === "pos") return "card"; // backend pos -> UI card bucket
  if (p === "momo") return "mobile"; // backend momo -> UI mobile bucket
  return p; // cash, card, mobile, etc.
}

export function coerceNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseCreditPaymentsSummary(raw) {
  let cash = 0;
  let card = 0;
  let mobile = 0;
  let total = 0;
  let count = 0;
  let breakdownAvailable = false;

  if (!raw) return { cash, card, mobile, total, count, breakdownAvailable };

  if (Array.isArray(raw)) {
    for (const p of raw) {
      const method = normalizePaymentType(
        p?.payment_method || p?.paymentType || p?.method || p?.payment_type
      );
      const amt = coerceNum(p?.amount || p?.paid_amount || p?.paid || 0);
      if (method === "cash") cash += amt;
      else if (method === "card") card += amt;
      else if (method === "mobile") mobile += amt;
      total += amt;
      count += 1;
    }
    breakdownAvailable = total > 0;
    return { cash, card, mobile, total, count, breakdownAvailable };
  }

  const obj =
    raw?.summary && typeof raw.summary === "object" ? raw.summary : raw;

  const byMethod =
    obj?.by_method ||
    obj?.byMethod ||
    obj?.payments_by_method ||
    obj?.paymentsByMethod ||
    obj?.totals_by_method ||
    obj?.totalsByMethod;

  if (byMethod && typeof byMethod === "object") {
    for (const [k, v] of Object.entries(byMethod)) {
      const method = normalizePaymentType(k);
      const amt = coerceNum(v);
      if (method === "cash") cash += amt;
      else if (method === "card") card += amt;
      else if (method === "mobile") mobile += amt;
      total += amt;
    }
    breakdownAvailable = total > 0;
  }

  const listCandidates = obj?.payments || obj?.items || obj?.data;
  if (!breakdownAvailable && Array.isArray(listCandidates)) {
    for (const p of listCandidates) {
      const method = normalizePaymentType(
        p?.payment_method || p?.paymentType || p?.method || p?.payment_type
      );
      const amt = coerceNum(p?.amount || p?.paid_amount || p?.paid || 0);
      if (method === "cash") cash += amt;
      else if (method === "card") card += amt;
      else if (method === "mobile") mobile += amt;
      total += amt;
      count += 1;
    }
    breakdownAvailable = total > 0;
    return { cash, card, mobile, total, count, breakdownAvailable };
  }

  cash += coerceNum(
    obj?.cash ??
      obj?.cash_amount ??
      obj?.cash_total ??
      obj?.cash_paid ??
      obj?.cash_collected ??
      0
  );
  card += coerceNum(
    obj?.card ??
      obj?.pos ??
      obj?.pos_amount ??
      obj?.pos_total ??
      obj?.card_amount ??
      obj?.card_total ??
      0
  );
  mobile += coerceNum(
    obj?.mobile ??
      obj?.momo ??
      obj?.momo_amount ??
      obj?.momo_total ??
      obj?.mobile_amount ??
      obj?.mobile_total ??
      0
  );

  total = coerceNum(
    obj?.total ?? obj?.total_amount ?? obj?.total_paid ?? obj?.paid_amount ?? 0
  );
  count = coerceNum(
    obj?.count ?? obj?.payments_count ?? obj?.credits_count ?? 0
  );

  if (!total || total <= 0) total = cash + card + mobile;
  breakdownAvailable = cash + card + mobile > 0;

  return { cash, card, mobile, total, count, breakdownAvailable };
}

export function buildPaymentMap(enumValues) {
  const enums = (enumValues || []).map((x) => String(x).toLowerCase());
  const map = { cash: "cash", card: "card", mobile: "mobile" };

  if (enums.includes("pos")) map.card = "pos";
  else if (enums.includes("card")) map.card = "card";

  if (enums.includes("momo")) map.mobile = "momo";
  else if (enums.includes("mobile")) map.mobile = "mobile";

  return map;
}

export function resolveSchema(schema, components, visited = new Set()) {
  if (!schema) return null;
  if (schema.$ref && typeof schema.$ref === "string") {
    const ref = schema.$ref;
    if (visited.has(ref)) return null;
    visited.add(ref);
    const key = ref.split("/").pop();
    const resolved = components?.schemas?.[key];
    return resolveSchema(resolved, components, visited) || resolved || null;
  }
  return schema;
}

// =========================
// Expenses local storage
// =========================

export function expensesStorageKey(shopId, dateStr) {
  return `iclas_expenses:${shopId}:${dateStr}`;
}

export function readExpenses(shopId, dateStr) {
  try {
    const raw = localStorage.getItem(expensesStorageKey(shopId, dateStr));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeExpenses(shopId, dateStr, list) {
  try {
    localStorage.setItem(
      expensesStorageKey(shopId, dateStr),
      JSON.stringify(list || [])
    );
  } catch {
    // ignore
  }
}
