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

// Kigali is UTC+2 (no DST)
const KIGALI_UTC_OFFSET_HOURS = 2;

/**
 * Detect whether a datetime string already contains timezone info.
 * Examples that DO contain TZ:
 * - 2025-12-09T10:15:00Z
 * - 2025-12-09T10:15:00+02:00
 * - 2025-12-09T10:15:00-0500
 */
function hasExplicitTimezone(s) {
  return (
    /[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s)
  );
}

/**
 * Parse backend datetime safely and consistently across browsers.
 *
 * Supported inputs:
 * - "YYYY-MM-DD HH:mm:ss"  (common FastAPI/SQLAlchemy string)
 * - "YYYY-MM-DDTHH:mm:ss"  (naive ISO without timezone)
 * - ISO with timezone: "...Z" or "...+02:00" etc.
 *
 * Important rule:
 * - If NO timezone info is included, we treat the value as Kigali local time,
 *   then convert it to a real JS Date (UTC internally).
 */
function parseBackendDateTime(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // If already timezone-aware ISO, let browser parse (safe)
  if (s.includes("T") && hasExplicitTimezone(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD HH:mm"
  let m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (m) {
    const Y = Number(m[1]);
    const Mo = Number(m[2]) - 1;
    const D = Number(m[3]);
    const H = Number(m[4]);
    const Mi = Number(m[5]);
    const S = Number(m[6] || 0);

    // Treat as Kigali local -> convert to UTC by subtracting 2 hours
    const utcMs = Date.UTC(Y, Mo, D, H - KIGALI_UTC_OFFSET_HOURS, Mi, S);
    return new Date(utcMs);
  }

  // "YYYY-MM-DDTHH:mm(:ss(.sss)?)?" naive ISO (no timezone)
  m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/
  );
  if (m) {
    const Y = Number(m[1]);
    const Mo = Number(m[2]) - 1;
    const D = Number(m[3]);
    const H = Number(m[4]);
    const Mi = Number(m[5]);
    const S = Number(m[6] || 0);
    const msRaw = m[7] || "0";
    const ms = Number(String(msRaw).padEnd(3, "0").slice(0, 3)) || 0;

    const utcMs = Date.UTC(Y, Mo, D, H - KIGALI_UTC_OFFSET_HOURS, Mi, S, ms);
    return new Date(utcMs);
  }

  // ISO date only "YYYY-MM-DD"
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const Y = Number(m[1]);
    const Mo = Number(m[2]) - 1;
    const D = Number(m[3]);

    // Midnight Kigali -> UTC midnight minus 2h
    const utcMs = Date.UTC(Y, Mo, D, -KIGALI_UTC_OFFSET_HOURS, 0, 0);
    return new Date(utcMs);
  }

  // Last resort: try browser parse (may work for already-good formats)
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTimeHM(dateTimeString) {
  if (!dateTimeString) return "";
  const d = parseBackendDateTime(dateTimeString);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-RW", {
    timeZone: DEFAULT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Today's date in Kigali (not device timezone).
 * Prevents “yesterday/tomorrow” bugs when device timezone differs.
 */
export function todayDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;

  if (!y || !m || !d) {
    // fallback (should be rare)
    const dt = new Date();
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  return `${y}-${m}-${d}`;
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
