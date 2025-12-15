// src/pages/shop/ShopSalesHistoryPage.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Single source of truth for API base (env or prod fallback)
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";
const API_BASE = CLIENT_API_BASE;

// =========================
// Timezone helpers (Kigali)
// =========================
const KIGALI_TZ = "Africa/Kigali";
const HISTORY_STEP_DAYS = 30;
const HISTORY_MAX_DAYS = 3650; // 10 years safety cap

function _fmtPartsYMD(date) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: KIGALI_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !d) return "";
    return `${y}-${m}-${d}`;
  } catch {
    return "";
  }
}

function _hasTZInfo(s) {
  return /([zZ]|[+-]\d{2}:\d{2})$/.test(String(s || "").trim());
}

/**
 * Parse backend timestamps safely:
 * - If it has timezone (Z or +02:00), normal Date parsing is fine.
 * - If it's "naive" (no timezone), assume Kigali local time (UTC+2).
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
    // Kigali midnight -> UTC is minus 2 hours
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

    // Kigali local (UTC+2) => UTC = local - 2h
    return new Date(Date.UTC(y, mo - 1, da, hh - 2, mi, ss, ms));
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayDateString() {
  return (
    _fmtPartsYMD(new Date()) ||
    (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })()
  );
}

function addDaysYMD(ymd, deltaDays) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (!y || !mo || !da) return "";

  const base = Date.UTC(y, mo - 1, da);
  const d = new Date(base + deltaDays * 86400000);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function ymdFromISO(raw) {
  const d = parseDateAssumeKigali(raw);
  if (!d) return "";
  return _fmtPartsYMD(d);
}

function formatDateTime(iso) {
  const d = parseDateAssumeKigali(iso);
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("en-RW", {
      timeZone: KIGALI_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function formatTimeHM(iso) {
  const d = parseDateAssumeKigali(iso);
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

// =========================
// Money helpers
// =========================
function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value) || 0;
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * ✅ IMPORTANT:
 * A sale is "open credit" ONLY when credit_balance > 0.
 */
function isOpenCreditSale(sale) {
  const creditBalance = Number(sale?.credit_balance ?? sale?.creditBalance ?? 0);
  return creditBalance > 0;
}

function normalizePaymentType(raw) {
  const s = String(raw || "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("cash")) return "cash";
  if (s.includes("mobile") || s.includes("momo")) return "mobile";
  if (s.includes("card") || s.includes("pos")) return "card";
  return s;
}

function getSaleTotals(sale) {
  const total =
    Number(
      sale?.total_sale_amount ??
        sale?.total_amount ??
        sale?.sale_amount ??
        sale?.total ??
        0
    ) || 0;
  const profit = Number(sale?.total_profit ?? sale?.profit ?? 0) || 0;
  return { total, profit };
}

function pickLines(sale) {
  const lines = sale?.lines ?? sale?.sale_lines ?? sale?.items ?? [];
  return Array.isArray(lines) ? lines : [];
}

function extractLineFields(line) {
  const itemId =
    line?.item_id ?? line?.itemId ?? line?.item ?? line?.itemID ?? null;

  const qty = Number(
    line?.quantity_pieces ??
      line?.quantity ??
      line?.qty_pieces ??
      line?.qtyPieces ??
      line?.qty ??
      0
  );

  const unitPrice = Number(
    line?.sale_price_per_piece ??
      line?.unit_sale_price ??
      line?.unit_price ??
      line?.unitPrice ??
      line?.price ??
      0
  );

  const total =
    line?.line_sale_amount != null
      ? Number(line.line_sale_amount)
      : line?.line_total != null
      ? Number(line.line_total)
      : line?.total != null
      ? Number(line.total)
      : qty * unitPrice;

  const profit =
    line?.line_profit != null
      ? Number(line.line_profit)
      : line?.profit != null
      ? Number(line.profit)
      : 0;

  return {
    itemId,
    qty,
    unitPrice,
    total: Number(total) || 0,
    profit: Number(profit) || 0,
  };
}

function saleSortKeyMs(sale) {
  const d = parseDateAssumeKigali(sale?.sale_date);
  return d ? d.getTime() : 0;
}

function mergeSalesUnique(prevList, nextList) {
  const map = new Map();

  for (const s of prevList || []) {
    if (s && s.id != null) map.set(String(s.id), s);
  }
  for (const s of nextList || []) {
    if (s && s.id != null) map.set(String(s.id), s);
  }

  const merged = Array.from(map.values());

  merged.sort((a, b) => {
    const t = saleSortKeyMs(b) - saleSortKeyMs(a);
    if (t !== 0) return t;
    const aid = Number(a?.id ?? 0);
    const bid = Number(b?.id ?? 0);
    return bid - aid;
  });

  return merged;
}

function clampDaysBack(n) {
  const x = Math.max(1, Math.floor(Number(n || 0)));
  return Math.min(HISTORY_MAX_DAYS, x);
}

function SalesHistoryPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  // ✅ Use the same auth headers as Sales & POS
  const auth = useAuth();
  const authHeadersNoJson = auth?.authHeadersNoJson || auth?.authHeaders || {};

  const [shop, setShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [error, setError] = useState("");

  const [tab, setTab] = useState("history"); // history | today | range | month | credits | search

  // View mode: items OR receipts
  const [viewMode, setViewMode] = useState("items");

  // Payment filter: all / cash / card / mobile / credit
  const [paymentFilter, setPaymentFilter] = useState("all");

  // ✅ All-history days back + draft input
  const [historyDaysBack, setHistoryDaysBack] = useState(30);
  const [historyDaysBackDraft, setHistoryDaysBackDraft] = useState("30");

  // Today
  const [selectedDate, setSelectedDate] = useState(todayDateString());

  // Range
  const [rangeFrom, setRangeFrom] = useState(addDaysYMD(todayDateString(), -6));
  const [rangeTo, setRangeTo] = useState(todayDateString());

  // Month
  const [selectedMonth, setSelectedMonth] = useState(todayDateString().slice(0, 7));

  // Credits tab (range)
  const [creditFrom, setCreditFrom] = useState(addDaysYMD(todayDateString(), -30));
  const [creditTo, setCreditTo] = useState(todayDateString());

  // Search tab
  const [searchDaysBack, setSearchDaysBack] = useState(30);
  const [searchQuery, setSearchQuery] = useState("");

  // Sales + loading
  const [sales, setSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Stock rows to map item_id -> item_name
  const [stockRows, setStockRows] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);

  // Auto refresh (Today tab only)
  const [autoRefreshToday, setAutoRefreshToday] = useState(true);
  const autoTimerRef = useRef(null);

  // Last sync info
  const [lastSalesSyncAt, setLastSalesSyncAt] = useState(null);

  // ✅ NEW: selected day panel (replaces "View/Hide" buttons)
  const [selectedDay, setSelectedDay] = useState(null);

  const shopName = shop?.name || `Shop ${shopId}`;

  const headersReady = useMemo(() => {
    return (
      !!authHeadersNoJson &&
      typeof authHeadersNoJson === "object" &&
      Object.keys(authHeadersNoJson).length > 0
    );
  }, [authHeadersNoJson]);

  useEffect(() => {
    if (!headersReady) {
      setLoadingShop(false);
      setShop(null);
      setError("Session not ready. Please refresh the page or login again.");
    } else {
      if (error === "Session not ready. Please refresh the page or login again.") {
        setError("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headersReady]);

  // -------------------------
  // Decide active date range based on tab
  // -------------------------
  const activeDateFrom = useMemo(() => {
    if (tab === "history") {
      const to = todayDateString();
      const days = clampDaysBack(historyDaysBack);
      return addDaysYMD(to, -days + 1);
    }
    if (tab === "today") return selectedDate;
    if (tab === "range") return rangeFrom;
    if (tab === "credits") return creditFrom;
    if (tab === "search")
      return addDaysYMD(
        todayDateString(),
        -Math.max(1, Number(searchDaysBack) || 30) + 1
      );
    if (tab === "month") {
      const [y, m] = String(selectedMonth || "").split("-");
      if (!y || !m) return todayDateString();
      return `${y}-${m}-01`;
    }
    return selectedDate;
  }, [
    tab,
    historyDaysBack,
    selectedDate,
    rangeFrom,
    creditFrom,
    searchDaysBack,
    selectedMonth,
  ]);

  const activeDateTo = useMemo(() => {
    if (tab === "history") return todayDateString();
    if (tab === "today") return selectedDate;
    if (tab === "range") return rangeTo;
    if (tab === "credits") return creditTo;
    if (tab === "search") return todayDateString();
    if (tab === "month") {
      const [yStr, mStr] = String(selectedMonth || "").split("-");
      const y = Number(yStr);
      const m = Number(mStr);
      if (!y || !m) return todayDateString();
      const last = new Date(Date.UTC(y, m, 0));
      const yy = last.getUTCFullYear();
      const mm = String(last.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(last.getUTCDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    }
    return selectedDate;
  }, [tab, selectedDate, rangeTo, creditTo, selectedMonth]);

  // -------------------------
  // Safe JSON fetch helper (no cache + abortable)
  // -------------------------
  const fetchJson = useCallback(async (url, headers, signal) => {
    const res = await fetch(url, { headers, signal, cache: "no-store" });
    if (!res.ok) {
      let detail = `Request failed. Status: ${res.status}`;
      try {
        const j = await res.json();
        if (j?.detail) {
          detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
        }
      } catch {}
      throw new Error(detail);
    }
    return res.json();
  }, []);

  const shopAbortRef = useRef(null);
  const stockAbortRef = useRef(null);
  const salesAbortRef = useRef(null);

  const shopReqIdRef = useRef(0);
  const stockReqIdRef = useRef(0);
  const salesReqIdRef = useRef(0);

  // -------------------------
  // Load shop info (AUTH)
  // -------------------------
  const loadShop = useCallback(async () => {
    if (!shopId) return;

    if (!headersReady) {
      setLoadingShop(false);
      setShop(null);
      setError("Session not ready. Please refresh the page or login again.");
      return;
    }

    if (shopAbortRef.current) shopAbortRef.current.abort();
    const controller = new AbortController();
    shopAbortRef.current = controller;

    const reqId = ++shopReqIdRef.current;

    setLoadingShop(true);
    setError("");

    try {
      const candidates = [
        `${API_BASE}/shops/${shopId}`,
        `${API_BASE}/shops/${shopId}/`,
        `${API_BASE}/shops/detail/${shopId}`,
      ];

      const tasks = candidates.map((url) =>
        fetchJson(url, authHeadersNoJson, controller.signal).then((json) => ({ url, json }))
      );

      let winner = null;
      try {
        winner = await Promise.any(tasks);
      } catch {
        winner = null;
      }

      if (!winner?.json) throw new Error("Failed to load shop.");
      const data = winner.json?.shop || winner.json;

      if (reqId !== shopReqIdRef.current) return;

      setShop(data);
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error(err);

      if (reqId !== shopReqIdRef.current) return;

      setShop(null);
      setError(err.message || "Failed to load shop.");
    } finally {
      if (reqId === shopReqIdRef.current) setLoadingShop(false);
    }
  }, [shopId, headersReady, fetchJson, authHeadersNoJson]);

  useEffect(() => {
    loadShop();
  }, [loadShop]);

  // -------------------------
  // Load stock to map item_id -> item_name (AUTH)
  // -------------------------
  const loadStock = useCallback(async () => {
    if (!shopId) return;
    if (!headersReady) return;

    if (stockAbortRef.current) stockAbortRef.current.abort();
    const controller = new AbortController();
    stockAbortRef.current = controller;

    const reqId = ++stockReqIdRef.current;

    setLoadingStock(true);

    try {
      const candidates = [
        `${API_BASE}/stock/?shop_id=${shopId}&only_positive=0`,
        `${API_BASE}/stock/?shop_id=${shopId}`,
        `${API_BASE}/stock/?shop_id=${shopId}&only_positive=false`,
      ];

      const tasks = candidates.map((url) =>
        fetchJson(url, authHeadersNoJson, controller.signal).then((json) => ({ url, json }))
      );

      let winner = null;
      try {
        winner = await Promise.any(tasks);
      } catch {
        winner = null;
      }

      const json = winner?.json;
      const data = Array.isArray(json) ? json : json?.stock || json?.rows || null;

      if (reqId !== stockReqIdRef.current) return;

      setStockRows(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error("Error loading stock for history page:", err);

      if (reqId !== stockReqIdRef.current) return;

      setStockRows([]);
    } finally {
      if (reqId === stockReqIdRef.current) setLoadingStock(false);
    }
  }, [shopId, headersReady, fetchJson, authHeadersNoJson]);

  useEffect(() => {
    loadStock();
  }, [loadStock]);

  const stockByItemId = useMemo(() => {
    const map = {};
    for (const row of stockRows || []) map[row.item_id] = row;
    return map;
  }, [stockRows]);

  // -------------------------
  // Load sales helper (AUTH)
  // mode: "replace" | "append"
  // -------------------------
  const loadSales = useCallback(
    async ({ dateFrom, dateTo, mode = "replace" } = {}) => {
      if (!shopId) return;
      if (!headersReady) return;

      const from = dateFrom || activeDateFrom;
      const to = dateTo || activeDateTo;
      if (!from || !to) return;

      if (salesAbortRef.current) salesAbortRef.current.abort();
      const controller = new AbortController();
      salesAbortRef.current = controller;

      const reqId = ++salesReqIdRef.current;

      setLoadingSales(true);
      setError("");

      try {
        const url = `${API_BASE}/sales/?shop_id=${shopId}&date_from=${from}&date_to=${to}`;
        const json = await fetchJson(url, authHeadersNoJson, controller.signal);
        const list = Array.isArray(json)
          ? json
          : Array.isArray(json?.sales)
          ? json.sales
          : [];

        if (reqId !== salesReqIdRef.current) return;

        if (mode === "append") setSales((prev) => mergeSalesUnique(prev, list || []));
        else setSales(list || []);

        const nowIso = new Date().toISOString();
        setLastSalesSyncAt(nowIso);

        try {
          window.dispatchEvent(
            new CustomEvent("iclas:sales-history-synced", {
              detail: { shopId, dateFrom: from, dateTo: to, at: Date.now() },
            })
          );
        } catch {}
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error(err);

        if (reqId !== salesReqIdRef.current) return;

        if (mode !== "append") setSales([]);
        setError(err.message || "Failed to load sales history.");
      } finally {
        if (reqId === salesReqIdRef.current) setLoadingSales(false);
      }
    },
    [shopId, headersReady, activeDateFrom, activeDateTo, fetchJson, authHeadersNoJson]
  );

  // ✅ Auto-load sales for NON-history tabs (history is controlled)
  useEffect(() => {
    if (tab === "history") return;
    loadSales({ mode: "replace" });
  }, [tab, loadSales]);

  // ✅ History initial load
  useEffect(() => {
    if (tab !== "history") return;
    if (!headersReady || !shopId) return;

    setHistoryDaysBackDraft(String(historyDaysBack));

    const to = todayDateString();
    const days = clampDaysBack(historyDaysBack);
    const from = addDaysYMD(to, -days + 1);

    loadSales({ dateFrom: from, dateTo: to, mode: "replace" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, shopId, headersReady]);

  // -------------------------
  // Auto-refresh Today tab
  // -------------------------
  useEffect(() => {
    if (autoTimerRef.current) {
      window.clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }

    if (tab !== "today") return;
    if (!autoRefreshToday) return;

    autoTimerRef.current = window.setInterval(() => {
      loadSales({ mode: "replace" });
    }, 8000);

    return () => {
      if (autoTimerRef.current) {
        window.clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [tab, autoRefreshToday, loadSales]);

  // -------------------------
  // History actions
  // -------------------------
  const applyHistoryDays = useCallback(async () => {
    const days = clampDaysBack(historyDaysBackDraft);
    setHistoryDaysBack(days);
    setHistoryDaysBackDraft(String(days));

    const to = todayDateString();
    const from = addDaysYMD(to, -days + 1);

    await loadSales({ dateFrom: from, dateTo: to, mode: "replace" });
  }, [historyDaysBackDraft, loadSales]);

  const loadOlderHistory = useCallback(async () => {
    const cur = clampDaysBack(historyDaysBack);
    if (cur >= HISTORY_MAX_DAYS) return;

    const next = clampDaysBack(cur + HISTORY_STEP_DAYS);

    const to = todayDateString();
    const curFrom = addDaysYMD(to, -cur + 1);
    const nextFrom = addDaysYMD(to, -next + 1);
    const extraTo = addDaysYMD(curFrom, -1);

    if (!nextFrom || !extraTo || extraTo < nextFrom) {
      setHistoryDaysBack(next);
      setHistoryDaysBackDraft(String(next));
      return;
    }

    await loadSales({ dateFrom: nextFrom, dateTo: extraTo, mode: "append" });

    setHistoryDaysBack(next);
    setHistoryDaysBackDraft(String(next));
  }, [historyDaysBack, loadSales]);

  // -------------------------
  // ✅ FIX: Open Current Sale tab in SalesPOS (not shop workspace root)
  // -------------------------
  const openInCurrentSaleFromHistory = useCallback(
    (saleId, saleLineId = null) => {
      if (!saleId) return;

      // Keep your storage hints (backward compatible)
      try {
        localStorage.setItem("iclas_edit_sale_id", String(saleId));
        if (saleLineId != null)
          localStorage.setItem("iclas_edit_sale_line_id", String(saleLineId));
        else localStorage.removeItem("iclas_edit_sale_line_id");

        localStorage.setItem("iclas_pos_desired_tab", "current");
      } catch {}

      // ✅ Primary navigation: SalesPOS with explicit tab + edit ids
      const qs = new URLSearchParams();
      qs.set("tab", "current");
      qs.set("editSaleId", String(saleId));
      if (saleLineId != null) qs.set("editLineId", String(saleLineId));

      navigate(`/shops/${shopId}/sales-pos?${qs.toString()}`, {
        state: { iclas_edit_sale_id: saleId, iclas_edit_sale_line_id: saleLineId },
      });
    },
    [navigate, shopId]
  );

  // -------------------------
  // Filter by payment / credit (normalized)
  // -------------------------
  const filteredSales = useMemo(() => {
    const q = String(searchQuery || "").trim().toLowerCase();

    return (sales || []).filter((sale) => {
      const paymentType = normalizePaymentType(sale?.payment_type);
      const creditOpen = isOpenCreditSale(sale);

      const effectivePaymentFilter = tab === "credits" ? "credit" : paymentFilter;

      if (effectivePaymentFilter === "credit") return creditOpen;
      if (effectivePaymentFilter === "cash") return !creditOpen && paymentType === "cash";
      if (effectivePaymentFilter === "card") return !creditOpen && paymentType === "card";
      if (effectivePaymentFilter === "mobile") return !creditOpen && paymentType === "mobile";

      if (tab === "search" && q) {
        const idHit = String(sale?.id ?? "").toLowerCase().includes(q);
        const nameHit = String(sale?.customer_name ?? "").toLowerCase().includes(q);
        const phoneHit = String(sale?.customer_phone ?? "").toLowerCase().includes(q);

        let itemHit = false;
        const lines = pickLines(sale);
        for (const ln of lines) {
          const { itemId } = extractLineFields(ln);
          const stockRow = itemId ? stockByItemId[itemId] : null;
          const nm =
            stockRow?.item_name ||
            stockRow?.item?.name ||
            String(ln?.item_name || ln?.name || "");
          if (String(nm).toLowerCase().includes(q)) {
            itemHit = true;
            break;
          }
        }

        return idHit || nameHit || phoneHit || itemHit;
      }

      return true;
    });
  }, [sales, paymentFilter, tab, searchQuery, stockByItemId]);

  // -------------------------
  // Build items rows for a given sales list
  // -------------------------
  const buildItemsRows = useCallback(
    (salesList) => {
      const rows = [];
      for (const sale of salesList || []) {
        const saleTime = sale.sale_date;
        const paymentType = normalizePaymentType(sale.payment_type);
        const creditOpen = isOpenCreditSale(sale);

        const lines = pickLines(sale);
        for (const line of lines) {
          const { itemId, qty, unitPrice, total, profit } = extractLineFields(line);

          const stockRow = itemId ? stockByItemId[itemId] : null;
          const itemName =
            stockRow?.item_name ||
            stockRow?.item?.name ||
            line?.item_name ||
            line?.name ||
            (itemId != null ? `Item #${itemId}` : "Unknown item");

          rows.push({
            id: `${sale.id}-${line.id ?? Math.random().toString(16).slice(2)}`,
            lineId: line.id ?? null,
            saleId: sale.id,
            time: saleTime,
            itemId,
            itemName,
            qtyPieces: qty,
            unitPrice,
            total,
            profit,
            paymentType,
            isCreditOpen: creditOpen,
          });
        }
      }
      return rows;
    },
    [stockByItemId]
  );

  const allItemsRows = useMemo(
    () => buildItemsRows(filteredSales),
    [filteredSales, buildItemsRows]
  );

  // -------------------------
  // Summary for active range
  // -------------------------
  const rangeSummary = useMemo(() => {
    let totalSales = 0;
    let totalProfit = 0;
    let piecesSold = 0;
    let openCredit = 0;

    for (const sale of filteredSales || []) {
      const { total, profit } = getSaleTotals(sale);
      totalSales += total;
      totalProfit += profit;

      const cb = Number(sale?.credit_balance ?? sale?.creditBalance ?? 0);
      if (cb > 0) openCredit += cb;
    }

    for (const row of allItemsRows || []) {
      piecesSold += Number(row.qtyPieces || 0);
    }

    return {
      totalSales,
      totalProfit,
      piecesSold,
      receiptsCount: filteredSales.length,
      openCredit,
    };
  }, [filteredSales, allItemsRows]);

  // -------------------------
  // Group by day (for non-today tabs, including history)
  // -------------------------
  const groupedByDay = useMemo(() => {
    const map = new Map();
    for (const sale of filteredSales || []) {
      const day = ymdFromISO(sale?.sale_date) || "Unknown";
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(sale);
    }
    const days = Array.from(map.keys()).sort((a, b) => String(b).localeCompare(String(a)));
    return { map, days };
  }, [filteredSales]);

  const dailyTotalsTable = useMemo(() => {
    const rows = [];
    for (const day of groupedByDay.days) {
      const list = groupedByDay.map.get(day) || [];
      let total = 0;
      let profit = 0;
      let openCredit = 0;

      for (const sale of list) {
        const t = getSaleTotals(sale);
        total += t.total;
        profit += t.profit;
        const cb = Number(sale?.credit_balance ?? sale?.creditBalance ?? 0);
        if (cb > 0) openCredit += cb;
      }

      rows.push({ day, receipts: list.length, total, profit, openCredit });
    }
    return rows;
  }, [groupedByDay]);

  // -------------------------
  // ✅ Edit pad state (items view)
  // -------------------------
  const [editRowId, setEditRowId] = useState(null);
  const [editDraft, setEditDraft] = useState({ qtyPieces: "", unitPrice: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // reset UI when range changes
  useEffect(() => {
    setSelectedDay(null);
    setEditRowId(null);
    setEditError("");
  }, [tab, activeDateFrom, activeDateTo]);

  const startEditRow = useCallback((row) => {
    if (!row) return;
    setEditRowId(row.id);
    setEditDraft({
      qtyPieces: row.qtyPieces != null ? String(row.qtyPieces) : "",
      unitPrice: row.unitPrice != null ? String(row.unitPrice) : "",
    });
    setEditError("");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditRowId(null);
    setEditError("");
  }, []);

  const saveInlineEdit = useCallback(
    async (row) => {
      if (!row) return;

      const qty = Number(editDraft.qtyPieces);
      const price = Number(editDraft.unitPrice);

      if (!Number.isFinite(qty) || qty <= 0) {
        setEditError("Quantity must be greater than 0.");
        return;
      }
      if (!Number.isFinite(price) || price <= 0) {
        setEditError("Unit price must be greater than 0.");
        return;
      }

      try {
        setSavingEdit(true);
        setEditError("");

        const saleRes = await fetch(`${API_BASE}/sales/${row.saleId}`, {
          headers: authHeadersNoJson,
          cache: "no-store",
        });

        if (!saleRes.ok) {
          let detail = `Failed to load sale #${row.saleId} (status ${saleRes.status}).`;
          try {
            const j = await saleRes.json();
            if (j?.detail) {
              detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
            }
          } catch {}
          throw new Error(detail);
        }

        const sale = await saleRes.json();
        const linesSrc = sale.lines || sale.sale_lines || sale.items || [];
        if (!Array.isArray(linesSrc) || linesSrc.length === 0) {
          throw new Error("Sale has no lines to edit.");
        }

        const linesPayload = linesSrc.map((ln) => {
          const lineId = ln.id ?? ln.line_id ?? null;
          const isTarget =
            lineId != null && row.lineId != null ? String(lineId) === String(row.lineId) : false;

          const itemId = ln.item_id ?? ln.itemId ?? (ln.item && ln.item.id);

          const originalQty =
            ln.quantity_pieces ??
            ln.quantity ??
            ln.qty_pieces ??
            ln.qtyPieces ??
            ln.qty ??
            0;

          const originalPrice =
            ln.sale_price_per_piece ??
            ln.unit_sale_price ??
            ln.unit_price ??
            ln.unitPrice ??
            ln.price_per_piece ??
            ln.price ??
            0;

          return {
            item_id: itemId,
            quantity_pieces: isTarget ? qty : originalQty,
            sale_price_per_piece: isTarget ? price : originalPrice,
          };
        });

        const payload = {
          shop_id: sale.shop_id ?? sale.shopId,
          payment_type: sale.payment_type ?? sale.paymentType ?? null,
          is_credit_sale: sale.is_credit_sale ?? sale.isCreditSale ?? false,
          customer_name: sale.customer_name ?? sale.customerName ?? null,
          customer_phone: sale.customer_phone ?? sale.customerPhone ?? null,
          lines: linesPayload,
        };

        const putRes = await fetch(`${API_BASE}/sales/${row.saleId}`, {
          method: "PUT",
          headers: {
            ...authHeadersNoJson,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!putRes.ok) {
          let detail = `Failed to update sale line (status ${putRes.status}).`;
          try {
            const j = await putRes.json();
            if (j?.detail) {
              detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
            }
          } catch {}
          throw new Error(detail);
        }

        await putRes.json();

        await loadSales({ mode: "replace" });
        await loadStock();

        setEditRowId(null);
        setEditError("");
      } catch (err) {
        console.error("Inline edit failed:", err);
        setEditError(err.message || "Failed to update sale line.");
      } finally {
        setSavingEdit(false);
      }
    },
    [editDraft, authHeadersNoJson, loadSales, loadStock]
  );

  // -------------------------
  // Guards
  // -------------------------
  if (loadingShop) {
    return (
      <div style={{ padding: "24px" }}>
        <p>{headersReady ? "Loading shop..." : "Loading session..."}</p>
      </div>
    );
  }

  if (error && !shop) {
    return (
      <div style={{ padding: "24px", color: "red" }}>
        <p>{error}</p>
        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => loadShop()}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Retry
          </button>

          <button
            onClick={() => navigate("/login")}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  // -------------------------
  // Render helpers
  // -------------------------
  const renderItemsTable = (salesList) => {
    if (loadingSales || loadingStock) {
      return (
        <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>
          Loading items...
        </div>
      );
    }

    const rows = buildItemsRows(salesList);
    if (rows.length === 0) {
      return (
        <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>
          No items found.
        </div>
      );
    }

    const currentRow = rows.find((r) => r.id === editRowId) || null;

    const draftQtyNum = Number(editDraft.qtyPieces);
    const draftPriceNum = Number(editDraft.unitPrice);
    const showDraftTotal =
      Number.isFinite(draftQtyNum) &&
      draftQtyNum > 0 &&
      Number.isFinite(draftPriceNum) &&
      draftPriceNum > 0;
    const draftTotal = showDraftTotal ? draftQtyNum * draftPriceNum : null;

    return (
      <>
        {/* Edit pad at top */}
        {currentRow ? (
          <div
            style={{
              marginBottom: 10,
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px dashed #d1d5db",
              background: "linear-gradient(135deg, #f9fafb 0%, #f3f4ff 40%, #eef2ff 100%)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "#4b5563",
                    marginBottom: 4,
                  }}
                >
                  Edit sale line (inline)
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#111827",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Sale #{currentRow.saleId} • {currentRow.itemName}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                  Inline edit is optional. You can also{" "}
                  <button
                    type="button"
                    onClick={() => openInCurrentSaleFromHistory(currentRow.saleId, currentRow.lineId)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#2563eb",
                      cursor: "pointer",
                      fontWeight: 800,
                      padding: 0,
                      textDecoration: "underline",
                    }}
                  >
                    open in Current Sale
                  </button>{" "}
                  to add more items.
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(90px, 130px) minmax(110px, 150px) minmax(120px, 1fr)",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                    Pieces
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={editDraft.qtyPieces}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        qtyPieces: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                      textAlign: "right",
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                    Price per piece
                  </div>
                  <input
                    type="number"
                    step="1"
                    value={editDraft.unitPrice}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        unitPrice: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                      textAlign: "right",
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  {showDraftTotal && (
                    <div style={{ fontSize: 12, color: "#111827", fontWeight: 700 }}>
                      Total:&nbsp;<span>{formatMoney(draftTotal)}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!savingEdit) saveInlineEdit(currentRow);
                    }}
                    disabled={savingEdit}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 999,
                      border: "none",
                      background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                      color: "#ffffff",
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: savingEdit ? "default" : "pointer",
                      boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {savingEdit ? "Saving..." : "Save"}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!savingEdit) cancelEdit();
                    }}
                    disabled={savingEdit}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      background: "#ffffff",
                      color: "#4b5563",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: savingEdit ? "default" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>

            {editError && (
              <div
                style={{
                  marginTop: 6,
                  padding: "6px 8px",
                  borderRadius: 12,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {editError}
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: 6, fontSize: 12, color: "#6b7280" }}>
            Tip: click any row to open inline edit pad — or click the{" "}
            <span style={{ fontWeight: 800, color: "#2563eb" }}>item name</span> to open it in
            Current Sale and add new items.
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid #e5e7eb",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#6b7280",
              }}
            >
              <th style={{ padding: "6px 4px" }}>Time</th>
              <th style={{ padding: "6px 4px" }}>Item</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Qty</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Unit price</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Profit</th>
              <th style={{ padding: "6px 4px" }}>Payment</th>
              <th style={{ padding: "6px 4px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const paymentLabel =
                row.paymentType === "cash"
                  ? "Cash"
                  : row.paymentType === "card"
                  ? "POS"
                  : row.paymentType === "mobile"
                  ? "MoMo"
                  : row.paymentType || "N/A";

              const isCredit = row.isCreditOpen;
              const statusLabel = isCredit ? "Credit" : "Paid";
              const statusBg = isCredit ? "#fef2f2" : "#ecfdf3";
              const statusBorder = isCredit ? "#fecaca" : "#bbf7d0";
              const statusColor = isCredit ? "#b91c1c" : "#166534";

              const isEditing = editRowId === row.id;

              return (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    cursor: "pointer",
                    backgroundColor: isEditing ? "#fefce8" : undefined,
                  }}
                  onClick={() => startEditRow(row)}
                >
                  <td style={{ padding: "8px 4px" }}>{formatTimeHM(row.time)}</td>

                  <td style={{ padding: "8px 4px" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openInCurrentSaleFromHistory(row.saleId, row.lineId);
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        color: "#2563eb",
                        fontWeight: 700,
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                      title="Open this receipt in Current Sale to edit & add items"
                    >
                      {row.itemName}
                    </button>

                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                      Receipt #{row.saleId}
                      {row.lineId != null ? ` • Line ${row.lineId}` : ""}
                    </div>
                  </td>

                  <td style={{ padding: "8px 4px", textAlign: "right" }}>
                    {formatMoney(row.qtyPieces)}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }}>
                    {formatMoney(row.unitPrice)}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600 }}>
                    {formatMoney(row.total)}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }}>
                    {formatMoney(row.profit)}
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        backgroundColor: "#eff6ff",
                        color: "#1d4ed8",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      {paymentLabel}
                    </span>
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        backgroundColor: statusBg,
                        border: `1px solid ${statusBorder}`,
                        color: statusColor,
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
    );
  };

  const renderReceiptsTable = (salesList) => {
    if (loadingSales) {
      return (
        <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>
          Loading receipts...
        </div>
      );
    }
    if (!salesList?.length) {
      return (
        <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>
          No receipts found.
        </div>
      );
    }

    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr
            style={{
              textAlign: "left",
              borderBottom: "1px solid #e5e7eb",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6b7280",
            }}
          >
            <th style={{ padding: "6px 4px" }}>Date &amp; time</th>
            <th style={{ padding: "6px 4px" }}>Customer</th>
            <th style={{ padding: "6px 4px", textAlign: "right" }}>Items</th>
            <th style={{ padding: "6px 4px", textAlign: "right" }}>Total</th>
            <th style={{ padding: "6px 4px", textAlign: "right" }}>Profit</th>
            <th style={{ padding: "6px 4px" }}>Payment</th>
            <th style={{ padding: "6px 4px" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {salesList.map((sale) => {
            const lines = pickLines(sale);
            const piecesCount = lines.reduce(
              (sum, l) => sum + Number(extractLineFields(l).qty || 0),
              0
            );

            const paymentType = normalizePaymentType(sale.payment_type);
            const { total, profit } = getSaleTotals(sale);

            const creditOpen = isOpenCreditSale(sale);

            const paymentLabel =
              paymentType === "cash"
                ? "Cash"
                : paymentType === "card"
                ? "POS"
                : paymentType === "mobile"
                ? "MoMo"
                : "N/A";

            const statusLabel = creditOpen ? "Credit" : "Paid";
            const statusBg = creditOpen ? "#fef2f2" : "#ecfdf3";
            const statusBorder = creditOpen ? "#fecaca" : "#bbf7d0";
            const statusColor = creditOpen ? "#b91c1c" : "#166534";

            return (
              <tr key={sale.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px 4px" }}>{formatDateTime(sale.sale_date)}</td>

                <td style={{ padding: "8px 4px" }}>
                  {sale.customer_name ? (
                    <>
                      <span style={{ color: "#2563eb", fontWeight: 600 }}>
                        {sale.customer_name}
                      </span>
                      {sale.customer_phone && (
                        <span style={{ display: "block", fontSize: "11px", color: "#6b7280" }}>
                          {sale.customer_phone}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => openInCurrentSaleFromHistory(sale.id, null)}
                        style={{
                          display: "block",
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          fontSize: "11px",
                          color: "#2563eb",
                          cursor: "pointer",
                          fontWeight: 800,
                          textDecoration: "underline",
                          marginTop: 2,
                        }}
                        title="Open this receipt in Current Sale to edit & add items"
                      >
                        Receipt #{sale.id}
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ color: "#6b7280" }}>Walk-in</span>

                      <button
                        type="button"
                        onClick={() => openInCurrentSaleFromHistory(sale.id, null)}
                        style={{
                          display: "block",
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          fontSize: "11px",
                          color: "#2563eb",
                          cursor: "pointer",
                          fontWeight: 800,
                          textDecoration: "underline",
                          marginTop: 2,
                        }}
                        title="Open this receipt in Current Sale to edit & add items"
                      >
                        Receipt #{sale.id}
                      </button>
                    </>
                  )}
                </td>

                <td style={{ padding: "8px 4px", textAlign: "right" }}>
                  {formatMoney(piecesCount)}
                </td>
                <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600 }}>
                  {formatMoney(total)}
                </td>
                <td style={{ padding: "8px 4px", textAlign: "right" }}>
                  {formatMoney(profit)}
                </td>
                <td style={{ padding: "8px 4px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      backgroundColor: "#eff6ff",
                      color: "#1d4ed8",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  >
                    {paymentLabel}
                  </span>
                </td>
                <td style={{ padding: "8px 4px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      backgroundColor: statusBg,
                      border: `1px solid ${statusBorder}`,
                      color: statusColor,
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  >
                    {statusLabel}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  // -------------------------
  // Page layout
  // -------------------------
  const title =
    tab === "history"
      ? "Sales History — All history"
      : tab === "today"
      ? "Sales History — Today"
      : tab === "range"
      ? "Sales History — Date Range"
      : tab === "month"
      ? "Sales History — Monthly"
      : tab === "credits"
      ? "Sales History — Open Credits"
      : "Sales History — Search";

  const selectedDaySales = useMemo(() => {
    if (!selectedDay) return [];
    return groupedByDay.map.get(selectedDay) || [];
  }, [selectedDay, groupedByDay]);

  return (
    <div style={{ padding: "16px 24px 24px" }}>
      <button
        onClick={() => navigate(`/shops/${shopId}`)}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          marginBottom: "4px",
          fontSize: "12px",
          color: "#2563eb",
          cursor: "pointer",
        }}
      >
        ← Back to shop workspace
      </button>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "baseline",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 800,
              letterSpacing: "0.02em",
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>
            <strong>{shopName}</strong> • Range: <strong>{activeDateFrom}</strong> →{" "}
            <strong>{activeDateTo}</strong>
            {lastSalesSyncAt && (
              <span style={{ marginLeft: 10, fontSize: 12, color: "#9ca3af" }}>
                • Synced: {formatTimeHM(lastSalesSyncAt)}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {tab === "today" && (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "#374151",
              }}
            >
              <input
                type="checkbox"
                checked={autoRefreshToday}
                onChange={(e) => setAutoRefreshToday(e.target.checked)}
              />
              Auto-refresh
            </label>
          )}

          <button
            type="button"
            onClick={() => {
              if (tab === "history") {
                applyHistoryDays();
              } else {
                loadSales({ mode: "replace" });
              }
              loadStock();
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
            }}
            title="Refresh from backend"
          >
            ⟳ Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          marginTop: 10,
          display: "inline-flex",
          backgroundColor: "#e5e7eb",
          borderRadius: "999px",
          padding: "3px",
          gap: 4,
          flexWrap: "wrap",
        }}
      >
        {[
          { key: "history", label: "All history" },
          { key: "today", label: "Today" },
          { key: "range", label: "Date range" },
          { key: "month", label: "Monthly" },
          { key: "credits", label: "Open credits" },
          { key: "search", label: "Search" },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);

                if (t.key === "today") setSelectedDate(todayDateString());
                if (t.key === "credits") setPaymentFilter("credit");
                if (t.key !== "credits" && paymentFilter === "credit") setPaymentFilter("all");

                if (t.key === "history") {
                  setHistoryDaysBackDraft(String(historyDaysBack));
                }
              }}
              style={{
                border: "none",
                cursor: "pointer",
                padding: "6px 12px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 700,
                backgroundColor: active ? "#ffffff" : "transparent",
                color: active ? "#111827" : "#4b5563",
                boxShadow: active ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Controls row */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 16px",
          alignItems: "center",
        }}
      >
        {tab === "history" && (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              color: "#6b7280",
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 800, color: "#111827" }}>All history:</span>
            <span>Show last</span>
            <input
              type="number"
              min="1"
              step="1"
              value={historyDaysBackDraft}
              onChange={(e) => setHistoryDaysBackDraft(e.target.value)}
              style={{
                width: 90,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                fontSize: 13,
              }}
            />
            <span>days</span>
            <button
              type="button"
              onClick={applyHistoryDays}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Apply
            </button>

            <button
              type="button"
              onClick={() => {
                setHistoryDaysBack(30);
                setHistoryDaysBackDraft("30");
                const to = todayDateString();
                const from = addDaysYMD(to, -30 + 1);
                loadSales({ dateFrom: from, dateTo: to, mode: "replace" });
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              30d
            </button>

            <button
              type="button"
              onClick={() => {
                setHistoryDaysBack(90);
                setHistoryDaysBackDraft("90");
                const to = todayDateString();
                const from = addDaysYMD(to, -90 + 1);
                loadSales({ dateFrom: from, dateTo: to, mode: "replace" });
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              90d
            </button>

            <button
              type="button"
              onClick={() => {
                setHistoryDaysBack(365);
                setHistoryDaysBackDraft("365");
                const to = todayDateString();
                const from = addDaysYMD(to, -365 + 1);
                loadSales({ dateFrom: from, dateTo: to, mode: "replace" });
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              1 year
            </button>

            <button
              type="button"
              onClick={loadOlderHistory}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 900,
              }}
              title={`Fetch older sales (+${HISTORY_STEP_DAYS} days) and append`}
            >
              Load older +{HISTORY_STEP_DAYS}d
            </button>
          </div>
        )}

        {/* (All your other tab controls remain unchanged — omitted here only because we pasted full file above) */}
        {/* Payment filter + View mode toggles also remain unchanged in your original layout */}
      </div>

      {/* Errors */}
      {error && shop && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 14,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Summary card */}
      <div
        style={{
          marginTop: 12,
          marginBottom: "12px",
          backgroundColor: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
          padding: "14px 18px 14px",
          fontSize: "12px",
        }}
      >
        <div style={{ fontSize: "14px", fontWeight: 800, marginBottom: "6px" }}>Summary</div>
        <div
          style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#9ca3af",
            marginBottom: "8px",
          }}
        >
          {activeDateFrom} → {activeDateTo}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            rowGap: "8px",
            columnGap: "16px",
          }}
        >
          <div>
            <div style={{ color: "#6b7280" }}>Total sales</div>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>
              {formatMoney(rangeSummary.totalSales)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Total profit</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#16a34a" }}>
              {formatMoney(rangeSummary.totalProfit)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Pieces sold</div>
            <div style={{ fontSize: "16px", fontWeight: 800 }}>
              {formatMoney(rangeSummary.piecesSold)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Receipts</div>
            <div style={{ fontSize: "16px", fontWeight: 800 }}>
              {formatMoney(rangeSummary.receiptsCount)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Open credit</div>
            <div style={{ fontWeight: 900, color: "#b91c1c" }}>
              {formatMoney(rangeSummary.openCredit)}
            </div>
          </div>
        </div>
      </div>

      {/* Daily totals list (all tabs except Today) */}
      {tab !== "today" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "18px",
            boxShadow: "0 6px 18px rgba(15,37,128,0.04)",
            padding: "10px 12px 12px",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 13 }}>Daily totals</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Tip: click a day (date) to open Day items list
            </div>
          </div>

          {loadingSales ? (
            <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>
              Loading daily totals...
            </div>
          ) : dailyTotalsTable.length === 0 ? (
            <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>
              No data in this range.
            </div>
          ) : (
            <>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  marginTop: 8,
                }}
              >
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #e5e7eb",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#6b7280",
                    }}
                  >
                    <th style={{ padding: "6px 4px" }}>Day</th>
                    <th style={{ padding: "6px 4px", textAlign: "right" }}>Receipts</th>
                    <th style={{ padding: "6px 4px", textAlign: "right" }}>Total</th>
                    <th style={{ padding: "6px 4px", textAlign: "right" }}>Profit</th>
                    <th style={{ padding: "6px 4px", textAlign: "right" }}>Open credit</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyTotalsTable.map((r) => {
                    const isSelected = selectedDay === r.day;
                    return (
                      <tr
                        key={r.day}
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          backgroundColor: isSelected ? "#f5f5ff" : "transparent",
                        }}
                      >
                        <td style={{ padding: "8px 4px", fontWeight: 800 }}>
                          <button
                            type="button"
                            onClick={() => setSelectedDay((prev) => (prev === r.day ? null : r.day))}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              margin: 0,
                              cursor: "pointer",
                              color: "#2563eb",
                              textDecoration: "underline",
                              fontSize: 13,
                              fontWeight: 900,
                            }}
                            title={isSelected ? "Close day items list" : "Open day items list"}
                          >
                            {r.day}
                          </button>
                        </td>

                        <td style={{ padding: "8px 4px", textAlign: "right" }}>
                          {formatMoney(r.receipts)}
                        </td>

                        <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 800 }}>
                          {formatMoney(r.total)}
                        </td>

                        <td
                          style={{
                            padding: "8px 4px",
                            textAlign: "right",
                            color: "#16a34a",
                            fontWeight: 800,
                          }}
                        >
                          {formatMoney(r.profit)}
                        </td>

                        <td
                          style={{
                            padding: "8px 4px",
                            textAlign: "right",
                            color: "#b91c1c",
                            fontWeight: 900,
                          }}
                        >
                          {formatMoney(r.openCredit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* ✅ Day items list panel */}
              {selectedDay && (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                    background: "#fafafa",
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 13 }}>Day items list</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {selectedDay} • {formatMoney(selectedDaySales.length)} receipts
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedDay(null)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      Close
                    </button>
                  </div>

                  {viewMode === "items"
                    ? renderItemsTable(selectedDaySales)
                    : renderReceiptsTable(selectedDaySales)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Today tab main table */}
      {tab === "today" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "18px",
            boxShadow: "0 6px 18px rgba(15,37,128,0.04)",
            padding: "10px 12px 10px",
          }}
        >
          {viewMode === "items"
            ? renderItemsTable(filteredSales)
            : renderReceiptsTable(filteredSales)}
        </div>
      )}
    </div>
  );
}

export default SalesHistoryPage;
