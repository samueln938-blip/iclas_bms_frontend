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
// Time helpers (Kigali)
// =========================

const KIGALI_TZ = "Africa/Kigali";

function _hasTZInfo(s) {
  return /([zZ]|[+-]\d{2}:\d{2})$/.test(String(s || "").trim());
}

/**
 * Parse backend timestamps safely:
 * - If it has timezone (Z or +02:00), normal Date parsing is fine.
 * - If it's naive (no timezone), assume Kigali local time (UTC+2).
 */
function parseDateAssumeKigali(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw;

  const s0 = String(raw).trim();
  if (!s0) return null;

  const s = s0.includes("T") ? s0 : s0.replace(" ", "T");

  if (_hasTZInfo(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const mDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (mDate) {
    const y = Number(mDate[1]);
    const mo = Number(mDate[2]);
    const da = Number(mDate[3]);
    if (!y || !mo || !da) return null;
    return new Date(Date.UTC(y, mo - 1, da, -2, 0, 0, 0));
  }

  const mDT =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      s
    );
  if (mDT) {
    const y = Number(mDT[1]);
    const mo = Number(mDT[2]);
    const da = Number(mDT[3]);
    const hh = Number(mDT[4]);
    const mi = Number(mDT[5]);
    const ss = Number(mDT[6] || 0);
    const ms = Number(mDT[7] || 0);
    if (!y || !mo || !da) return null;
    return new Date(Date.UTC(y, mo - 1, da, hh - 2, mi, ss, ms));
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTimeHM(isoString) {
  if (!isoString) return "";
  const d = parseDateAssumeKigali(isoString);
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("en-RW", {
      timeZone: KIGALI_TZ,
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

export function todayDateString() {
  // Kigali date even if device timezone is wrong
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: KIGALI_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // ignore
  }

  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
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
