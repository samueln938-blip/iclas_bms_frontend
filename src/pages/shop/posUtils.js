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
    maximumFractionDigits: maxFractionDigits,
  });
}

// =========================
// Time helpers
// =========================

// ✅ Force Rwanda time everywhere (regardless of device timezone)
const DEFAULT_TIME_ZONE = "Africa/Kigali";
const KIGALI_OFFSET = "+02:00";

/**
 * Trim fractional seconds to milliseconds for safe JS parsing:
 *   .123456+02:00 -> .123+02:00
 *   .123456Z      -> .123Z
 *   .123456       -> .123
 */
function _trimIsoFractionToMillis(s) {
  try {
    return String(s)
      .replace(/(\.\d{3})\d+([Zz]|[+-]\d{2}:\d{2})$/, "$1$2")
      .replace(/(\.\d{3})\d+$/, "$1");
  } catch {
    return s;
  }
}

/**
 * ✅ Kigali-correct normalization:
 * Your backend stores Kigali-local time as naive (no TZ),
 * and attaches Kigali TZ in responses.
 *
 * Therefore:
 * - If timestamp has NO TZ info -> assume Kigali (+02:00), NOT UTC.
 * - Normalize "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss"
 * - Date-only "YYYY-MM-DD" -> midnight Kigali
 */
function normalizeIsoForParsing(raw) {
  const s0 = String(raw ?? "").trim();
  if (!s0) return "";

  // Date-only
  if (/^\d{4}-\d{2}-\d{2}$/.test(s0)) {
    return `${s0}T00:00:00${KIGALI_OFFSET}`;
  }

  // Normalize "YYYY-MM-DD HH:mm:ss" -> ISO
  let s = s0.includes(" ") && !s0.includes("T") ? s0.replace(" ", "T") : s0;

  // Trim microseconds -> milliseconds
  s = _trimIsoFractionToMillis(s);

  // Already has timezone info (Z or ±hh:mm or ±hhmm)
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s)) {
    return s;
  }

  // Naive ISO date-time (no timezone) -> treat as Kigali local
  const naiveIsoDateTime =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/.test(s);

  if (naiveIsoDateTime) return `${s}${KIGALI_OFFSET}`;

  // Unknown format: return as-is (best effort)
  return s;
}

function parseDateSmart(raw) {
  const s = normalizeIsoForParsing(raw);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Format time as HH:mm in Kigali time.
 */
export function formatTimeHM(raw) {
  if (!raw) return "";
  const d = parseDateSmart(raw);
  if (!d) return "";

  // en-GB + hour12:false gives predictable "14:05"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DEFAULT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * ✅ Kigali-correct YYYY-MM-DD (even if device timezone differs)
 */
export function todayDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
