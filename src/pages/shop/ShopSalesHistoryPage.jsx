// src/pages/shop/ShopSalesHistoryPage.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Single source of truth for API base (env or prod fallback)
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";
const API_BASE = CLIENT_API_BASE;

// =========================
// Timezone helpers (Kigali)
// =========================
const KIGALI_TZ = "Africa/Kigali";

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

    // Assume input is Kigali local time (UTC+2) => UTC = local - 2h
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

function formatDateLabel(ymd) {
  const d = parseDateAssumeKigali(ymd);
  if (!d) return String(ymd || "");
  try {
    return new Intl.DateTimeFormat("en-RW", {
      timeZone: KIGALI_TZ,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return String(ymd || "");
  }
}

// =========================
// Money + Qty helpers
// =========================
function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value) || 0;
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ✅ Qty/Pieces formatter (keeps decimals like 0.5, 1.25, 49.5)
function formatQty(value) {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function normalizePaymentType(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "momo" || s === "mobile" || s === "mobilemoney" || s === "mobile_money")
    return "mobile";
  if (s === "pos" || s === "card" || s === "bankcard") return "card";
  if (s === "cash") return "cash";
  if (s === "credit") return "credit";
  return s;
}

function pickLines(sale) {
  const lines = sale?.lines ?? sale?.sale_lines ?? sale?.items ?? [];
  return Array.isArray(lines) ? lines : [];
}

function extractLineFields(line) {
  const itemId = line?.item_id ?? line?.itemId ?? line?.item ?? line?.itemID ?? null;

  const qty = Number(
    line?.quantity_pieces ??
      line?.quantity ??
      line?.qty_pieces ??
      line?.qtyPieces ??
      line?.qty ??
      0
  );

  const unitPrice = Number(
    line?.unit_sale_price ??
      line?.sale_price_per_piece ??
      line?.unit_price ??
      line?.unitPrice ??
      line?.price ??
      0
  );

  const total =
    line?.line_sale_amount != null ? Number(line.line_sale_amount) : qty * unitPrice;

  const profit = line?.line_profit != null ? Number(line.line_profit) : 0;
  const lineId = line?.id ?? line?.line_id ?? null;

  return {
    lineId,
    itemId,
    qty,
    unitPrice,
    total: Number(total) || 0,
    profit: Number(profit) || 0,
  };
}

function getRecentDatesList(daysBack = 31) {
  const t = todayDateString();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return [t];

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const base = new Date(Date.UTC(y, mo - 1, da, 0, 0, 0));

  const out = [];
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(base.getTime() - i * 86400000);
    const ymd = _fmtPartsYMD(d);
    if (ymd) out.push(ymd);
  }
  return out;
}

// ✅ Extract totals from a sale object (backend compatibility)
function getSaleTotals(sale) {
  const total = Number(
    sale?.total_sale_amount ??
      sale?.total_amount ??
      sale?.sale_amount ??
      sale?.total ??
      0
  );
  const profit = Number(sale?.total_profit ?? sale?.profit ?? 0);
  return {
    total: Number.isFinite(total) ? total : 0,
    profit: Number.isFinite(profit) ? profit : 0,
  };
}

export default function SalesHistoryPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const auth = useAuth();
  const authHeadersNoJson = auth?.authHeadersNoJson || auth?.authHeaders || {};
  const user = auth?.user || null;

  // Roles
  const rawRole = user?.role ?? user?.user_role ?? user?.userRole ?? user?.type ?? "";
  const role = String(rawRole || "").trim().toLowerCase();
  const isOwner = role === "owner" || role === "admin";
  const isManager = role === "manager";
  const isCashier = role === "cashier";
  const canEditHistory = isOwner || isManager;

  const headersReady = useMemo(() => {
    return (
      !!authHeadersNoJson &&
      typeof authHeadersNoJson === "object" &&
      Object.keys(authHeadersNoJson).length > 0
    );
  }, [authHeadersNoJson]);

  const [shop, setShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [error, setError] = useState("");

  const todayStr = todayDateString();
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // ✅ Two-screen UX:
  // - Owner/Manager: start on "dates" screen (dates list only).
  // - Cashier/other: go straight to "details" (today only).
  const [pageMode, setPageMode] = useState(() => (canEditHistory ? "dates" : "details")); // "dates" | "details"

  // IMPORTANT: keep safe guard (cashier stays today)
  useEffect(() => {
    if (!canEditHistory && selectedDate !== todayStr) {
      setSelectedDate(todayStr);
    }
  }, [canEditHistory, selectedDate, todayStr]);

  // Sales + loading
  const [sales, setSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [lastSalesSyncAt, setLastSalesSyncAt] = useState(null);

  // Stock rows to get item names
  const [stockRows, setStockRows] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);

  const shopName = shop?.name || `Shop ${shopId}`;

  // -------------------------
  // Safe JSON fetch helper
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

  // Abort + latest-wins guards
  const shopAbortRef = useRef(null);
  const stockAbortRef = useRef(null);
  const salesAbortRef = useRef(null);

  const shopReqIdRef = useRef(0);
  const stockReqIdRef = useRef(0);
  const salesReqIdRef = useRef(0);

  // ✅ Date-summary loader (for dates screen)
  const dateSummaryAbortRef = useRef(null);
  const dateSummaryReqIdRef = useRef(0);
  const [dateSummaryMap, setDateSummaryMap] = useState({}); // { [ymd]: { loading, totalSales, totalProfit, receiptsCount, error } }

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
      const candidates = [`${API_BASE}/shops/${shopId}`, `${API_BASE}/shops/${shopId}/`];

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
  // Load stock (AUTH)
  // ✅ Only needed in DETAILS view (for item names)
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
    if (!headersReady) return;
    if (pageMode !== "details") return;
    loadStock();
  }, [headersReady, pageMode, loadStock]);

  const stockByItemId = useMemo(() => {
    const map = {};
    for (const row of stockRows || []) {
      const id = Number(row?.item_id);
      if (Number.isFinite(id)) map[id] = row;
    }
    return map;
  }, [stockRows]);

  // -------------------------
  // Load sales for selected date
  // ✅ Only in DETAILS view (for Owner/Manager browsing)
  // -------------------------
  const loadSalesForDate = useCallback(
    async (ymd) => {
      if (!shopId) return;
      if (!headersReady) return;

      const date = String(ymd || "").trim();
      if (!date) return;

      if (salesAbortRef.current) salesAbortRef.current.abort();
      const controller = new AbortController();
      salesAbortRef.current = controller;

      const reqId = ++salesReqIdRef.current;

      setLoadingSales(true);
      setError("");

      try {
        const url = `${API_BASE}/sales/?shop_id=${shopId}&date_from=${date}&date_to=${date}`;
        const json = await fetchJson(url, authHeadersNoJson, controller.signal);
        const list = Array.isArray(json)
          ? json
          : Array.isArray(json?.sales)
          ? json.sales
          : [];

        if (reqId !== salesReqIdRef.current) return;

        setSales(list || []);
        setLastSalesSyncAt(new Date().toISOString());
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error(err);

        if (reqId !== salesReqIdRef.current) return;

        setSales([]);
        setError(err.message || "Failed to load sales history.");
      } finally {
        if (reqId === salesReqIdRef.current) setLoadingSales(false);
      }
    },
    [shopId, headersReady, fetchJson, authHeadersNoJson]
  );

  useEffect(() => {
    if (!headersReady) return;

    // Cashier/others (no history browsing) always show details for today
    if (!canEditHistory) {
      loadSalesForDate(selectedDate);
      return;
    }

    // Owner/Manager: only fetch when actually viewing details
    if (pageMode !== "details") return;
    loadSalesForDate(selectedDate);
  }, [headersReady, selectedDate, loadSalesForDate, pageMode, canEditHistory]);

  // -------------------------
  // ✅ Date summaries for the Dates screen
  // - Date | Total sales | Total profit | Receipts
  // -------------------------
  const historyDates = useMemo(() => {
    if (!canEditHistory) return [todayStr];
    return getRecentDatesList(31);
  }, [canEditHistory, todayStr]);

  const loadDateSummaries = useCallback(
    async (dates) => {
      if (!shopId) return;
      if (!headersReady) return;
      if (!canEditHistory) return;
      if (!Array.isArray(dates) || dates.length === 0) return;

      if (dateSummaryAbortRef.current) dateSummaryAbortRef.current.abort();
      const controller = new AbortController();
      dateSummaryAbortRef.current = controller;

      const reqId = ++dateSummaryReqIdRef.current;

      // mark missing ones as loading
      setDateSummaryMap((prev) => {
        const next = { ...prev };
        for (const d of dates) {
          if (!next[d]) {
            next[d] = { loading: true, totalSales: 0, totalProfit: 0, receiptsCount: 0, error: "" };
          } else if (next[d]?.loading) {
            // keep
          } else if (next[d]?.error) {
            // keep error until reloaded by refresh
          } else {
            // already loaded
          }
        }
        return next;
      });

      const concurrency = 3;
      let idx = 0;

      const worker = async () => {
        while (idx < dates.length) {
          const d = dates[idx++];
          if (!d) continue;
          if (controller.signal.aborted) return;

          // skip already loaded (no error)
          const already = dateSummaryMap?.[d];
          if (already && !already.loading && !already.error) continue;

          try {
            const url = `${API_BASE}/sales/?shop_id=${shopId}&date_from=${d}&date_to=${d}`;
            const json = await fetchJson(url, authHeadersNoJson, controller.signal);
            const list = Array.isArray(json)
              ? json
              : Array.isArray(json?.sales)
              ? json.sales
              : [];

            let totalSales = 0;
            let totalProfit = 0;

            for (const s of list || []) {
              const t = getSaleTotals(s);
              totalSales += Number(t.total || 0);
              totalProfit += Number(t.profit || 0);
            }

            if (reqId !== dateSummaryReqIdRef.current) return;

            setDateSummaryMap((prev) => ({
              ...prev,
              [d]: {
                loading: false,
                totalSales,
                totalProfit,
                receiptsCount: (list || []).length,
                error: "",
              },
            }));
          } catch (err) {
            if (err?.name === "AbortError") return;
            if (reqId !== dateSummaryReqIdRef.current) return;

            setDateSummaryMap((prev) => ({
              ...prev,
              [d]: {
                loading: false,
                totalSales: 0,
                totalProfit: 0,
                receiptsCount: 0,
                error: err?.message || "Failed",
              },
            }));
          }
        }
      };

      try {
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
      } catch {
        // ignore
      }
    },
    [shopId, headersReady, canEditHistory, fetchJson, authHeadersNoJson, dateSummaryMap]
  );

  useEffect(() => {
    if (!canEditHistory) return;
    if (pageMode !== "dates") return;
    // load summaries for all 31 days
    loadDateSummaries(historyDates);
  }, [canEditHistory, pageMode, historyDates, loadDateSummaries]);

  // -------------------------
  // ✅ View state (Items | Receipts | Customers)
  // -------------------------
  const [historyView, setHistoryView] = useState("items"); // items|receipts|customers
  const [filterPaidCredit, setFilterPaidCredit] = useState("all"); // all|paid|credit
  const [paymentFilter, setPaymentFilter] = useState("all"); // all|cash|card|mobile|credit
  const [selectedSaleId, setSelectedSaleId] = useState(null);

  useEffect(() => {
    setSelectedSaleId(null);
  }, [selectedDate]);

  // -------------------------
  // Build receipts + items + customers
  // -------------------------
  const receiptsForDay = useMemo(() => {
    return (sales || []).map((sale) => {
      const total = Number(
        sale?.total_sale_amount ??
          sale?.total_amount ??
          sale?.sale_amount ??
          sale?.total ??
          0
      );
      const profit = Number(sale?.total_profit ?? sale?.profit ?? 0);

      const isCredit = !!(sale?.is_credit_sale ?? sale?.isCreditSale);
      const payment = isCredit ? "credit" : normalizePaymentType(sale?.payment_type);

      const collected = Number(
        sale?.amount_collected_now ??
          sale?.collected_now ??
          sale?.collected ??
          (isCredit ? 0 : total)
      );

      const balance = Number(
        sale?.credit_balance ??
          sale?.balance ??
          (isCredit ? Math.max(0, total - collected) : 0)
      );

      const dueDate =
        sale?.due_date ||
        sale?.credit_due_date ||
        sale?.customer_due_date ||
        sale?.dueDate ||
        null;

      return {
        id: sale?.id,
        time: sale?.sale_date,
        customerName: sale?.customer_name || "",
        customerPhone: sale?.customer_phone || "",
        isCredit,
        payment,
        total: Number.isFinite(total) ? total : 0,
        profit: Number.isFinite(profit) ? profit : 0,
        collected: Number.isFinite(collected) ? collected : 0,
        balance: Number.isFinite(balance) ? balance : 0,
        dueDate,
        lines: pickLines(sale),
      };
    });
  }, [sales]);

  const flattenedItems = useMemo(() => {
    const rows = [];
    for (const r of receiptsForDay || []) {
      for (const line of r.lines || []) {
        const f = extractLineFields(line);
        const stockRow = f.itemId != null ? stockByItemId[f.itemId] : null;
        const itemName =
          line?.item_name ||
          stockRow?.item_name ||
          stockRow?.item?.name ||
          (f.itemId != null ? `Item #${f.itemId}` : "Unknown item");

        rows.push({
          id: `${r.id}-${f.lineId ?? Math.random().toString(16).slice(2)}`,
          saleId: r.id,
          saleLineId: f.lineId ?? null,
          time: r.time,
          itemId: f.itemId,
          itemName,
          qtyPieces: f.qty,
          unitPrice: f.unitPrice,
          total: f.total,
          profit: f.profit,
          paymentType: r.payment,
          isCreditSale: r.isCredit,
          creditBalance: r.balance,
          customerName: r.customerName,
          customerPhone: r.customerPhone,
          dueDate: r.dueDate,
        });
      }
    }

    rows.sort((a, b) => {
      const ta = parseDateAssumeKigali(a.time)?.getTime?.() || 0;
      const tb = parseDateAssumeKigali(b.time)?.getTime?.() || 0;
      if (tb !== ta) return tb - ta;
      return Number(b.saleId || 0) - Number(a.saleId || 0);
    });

    return rows;
  }, [receiptsForDay, stockByItemId]);

  const customersRollup = useMemo(() => {
    const map = new Map();
    for (const r of receiptsForDay || []) {
      const key = `${(r.customerName || "").trim()}||${(r.customerPhone || "").trim()}`.trim();
      const label = r.customerName
        ? `${r.customerName}${r.customerPhone ? ` (${r.customerPhone})` : ""}`
        : "Unknown customer";

      if (!map.has(key))
        map.set(key, {
          key,
          label,
          receipts: 0,
          totalBought: 0,
          creditBalance: 0,
          collectedToday: 0,
        });

      const agg = map.get(key);
      agg.receipts += 1;
      agg.totalBought += Number(r.total || 0);
      agg.collectedToday += Number(r.collected || 0);
      if (r.isCredit) agg.creditBalance += Number(r.balance || 0);
    }

    return Array.from(map.values()).sort(
      (a, b) => (b.totalBought || 0) - (a.totalBought || 0)
    );
  }, [receiptsForDay]);

  const filteredItems = useMemo(() => {
    let rows = flattenedItems;

    if (filterPaidCredit === "credit") rows = rows.filter((row) => row.isCreditSale);
    else if (filterPaidCredit === "paid") rows = rows.filter((row) => !row.isCreditSale);

    if (paymentFilter !== "all") {
      if (paymentFilter === "credit") rows = rows.filter((r) => r.isCreditSale);
      else rows = rows.filter((r) => !r.isCreditSale && (r.paymentType || "") === paymentFilter);
    }

    return rows;
  }, [flattenedItems, filterPaidCredit, paymentFilter]);

  const selectedReceipt = useMemo(() => {
    if (!selectedSaleId) return null;
    return receiptsForDay.find((r) => Number(r.id) === Number(selectedSaleId)) || null;
  }, [selectedSaleId, receiptsForDay]);

  // -------------------------
  // Summary (details screen)
  // -------------------------
  const summary = useMemo(() => {
    let totalSales = 0;
    let totalProfit = 0;
    let piecesSold = 0;

    for (const r of receiptsForDay || []) {
      totalSales += Number(r.total || 0);
      totalProfit += Number(r.profit || 0);
    }
    for (const row of flattenedItems || []) {
      piecesSold += Number(row.qtyPieces || 0);
    }

    return {
      totalSales,
      totalProfit,
      piecesSold,
      receiptsCount: (receiptsForDay || []).length,
    };
  }, [receiptsForDay, flattenedItems]);

  // -------------------------
  // ✅ Navigation targets based on your App.jsx routes
  // -------------------------
  const basePrefix = useMemo(() => {
    const p = String(location?.pathname || "");
    if (p.startsWith("/shops/")) return "/shops";
    if (p.startsWith("/shop/")) return "/shop";
    return "/shops";
  }, [location?.pathname]);

  const workspacePath = useMemo(() => `${basePrefix}/${shopId}`, [basePrefix, shopId]);
  const salesPosPath = useMemo(() => `${basePrefix}/${shopId}/pos`, [basePrefix, shopId]);

  const goToSalesPOS = useCallback(
    (paramsObj) => {
      const sp = new URLSearchParams();
      Object.entries(paramsObj || {}).forEach(([k, v]) => {
        if (v === undefined || v === null || String(v).trim() === "") return;
        sp.set(k, String(v));
      });
      const url = sp.toString() ? `${salesPosPath}?${sp.toString()}` : salesPosPath;
      navigate(url);
    },
    [navigate, salesPosPath]
  );

  const startEditReceipt = useCallback(
    (saleId, saleLineId) => {
      const sid = saleId != null ? Number(saleId) : null;
      const slid = saleLineId != null ? Number(saleLineId) : null;
      if (!sid) return;

      try {
        localStorage.setItem("iclas_edit_sale_id", String(sid));
        if (slid != null) localStorage.setItem("iclas_edit_sale_line_id", String(slid));
        else localStorage.removeItem("iclas_edit_sale_line_id");
      } catch {}

      goToSalesPOS({ tab: "current", editSaleId: sid });
    },
    [goToSalesPOS]
  );

  const openAddMissingSaleForDate = useCallback(() => {
    if (!canEditHistory) return;
    goToSalesPOS({ tab: "current", workDate: selectedDate });
  }, [canEditHistory, goToSalesPOS, selectedDate]);

  const openDateDetails = useCallback(
    (d) => {
      const dd = String(d || "").trim();
      if (!dd) return;
      if (!canEditHistory && dd !== todayStr) return;

      setSelectedDate(dd);
      setHistoryView("items");
      setFilterPaidCredit("all");
      setPaymentFilter("all");
      setSelectedSaleId(null);
      setPageMode("details");
    },
    [canEditHistory, todayStr]
  );

  const backToDates = useCallback(() => {
    setSelectedSaleId(null);
    setPageMode("dates");
  }, []);

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

  const isViewingToday = selectedDate === todayStr;

  // =========================
  // UI: Dates screen (FULL WIDTH TABLE)
  // =========================
  const renderDatesOnly = () => {
    const anyLoading = historyDates.some((d) => dateSummaryMap?.[d]?.loading);

    return (
      <div style={{ padding: "18px 24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <button
              onClick={() => navigate(workspacePath)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                marginBottom: "6px",
                fontSize: "12px",
                color: "#2563eb",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              ← Back to shop workspace
            </button>

            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: "44px", fontWeight: 950, letterSpacing: "0.01em", margin: 0 }}>
                Sales History
              </h1>
              <span style={{ color: "#6b7280", fontWeight: 900, fontSize: 18 }}>
                · <strong style={{ color: "#111827" }}>{shopName}</strong>
              </span>
            </div>

            <div style={{ marginTop: 8, color: "#6b7280", fontSize: 14, fontWeight: 700 }}>
              Pick a date to open full details. This table shows: <strong>Total sales</strong>,{" "}
              <strong>Total profit</strong>, <strong>Total receipts</strong>.
              {anyLoading ? (
                <span style={{ marginLeft: 10, color: "#9ca3af", fontWeight: 800 }}>
                  (Loading summaries…)
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => openDateDetails(todayStr)}
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 950,
                fontSize: 14,
              }}
              title="Open today"
            >
              Open Today
            </button>

            <button
              type="button"
              onClick={() => {
                // refresh summaries
                setDateSummaryMap({});
                loadDateSummaries(historyDates);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 950,
                fontSize: 14,
              }}
              title="Refresh date totals"
            >
              ⟳ Refresh totals
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 20,
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: 12,
            width: "100%",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#6b7280",
                    fontWeight: 950,
                  }}
                >
                  <th style={{ padding: "12px 10px" }}>Date</th>
                  <th style={{ padding: "12px 10px", textAlign: "right" }}>Total sales</th>
                  <th style={{ padding: "12px 10px", textAlign: "right" }}>Total profit</th>
                  <th style={{ padding: "12px 10px", textAlign: "right" }}>Receipts</th>
                </tr>
              </thead>

              <tbody>
                {historyDates.map((d) => {
                  const isToday = d === todayStr;
                  const s = dateSummaryMap?.[d] || { loading: true, totalSales: 0, totalProfit: 0, receiptsCount: 0, error: "" };

                  return (
                    <tr
                      key={d}
                      onClick={() => openDateDetails(d)}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        cursor: "pointer",
                      }}
                      title="Click to open this date"
                    >
                      <td style={{ padding: "14px 10px", fontWeight: 950, color: "#111827" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 16 }}>{formatDateLabel(d)}</span>
                          {isToday ? (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 950,
                                color: "#166534",
                                background: "#ecfdf3",
                                border: "1px solid #bbf7d0",
                                padding: "2px 10px",
                                borderRadius: 999,
                              }}
                            >
                              Today
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, marginTop: 2 }}>{d}</div>
                        {s.error ? (
                          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 900, marginTop: 4 }}>
                            Failed to load totals
                          </div>
                        ) : null}
                      </td>

                      <td style={{ padding: "14px 10px", textAlign: "right", fontWeight: 950 }}>
                        {s.loading ? (
                          <span style={{ color: "#9ca3af", fontWeight: 900 }}>…</span>
                        ) : (
                          formatMoney(s.totalSales)
                        )}
                      </td>

                      <td style={{ padding: "14px 10px", textAlign: "right", fontWeight: 950, color: "#16a34a" }}>
                        {s.loading ? (
                          <span style={{ color: "#9ca3af", fontWeight: 900 }}>…</span>
                        ) : (
                          formatMoney(s.totalProfit)
                        )}
                      </td>

                      <td style={{ padding: "14px 10px", textAlign: "right", fontWeight: 950 }}>
                        {s.loading ? (
                          <span style={{ color: "#9ca3af", fontWeight: 900 }}>…</span>
                        ) : (
                          formatMoney(s.receiptsCount)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // =========================
  // UI: Details screen (unchanged logic, just full-width tables)
  // =========================
  const renderReceiptDetails = () => {
    if (historyView !== "receipts") return null;
    if (!selectedReceipt) return null;

    const customerLabel = selectedReceipt.customerName
      ? `${selectedReceipt.customerName}${selectedReceipt.customerPhone ? ` (${selectedReceipt.customerPhone})` : ""}`
      : "-";

    const paymentLabel = selectedReceipt.isCredit
      ? "Credit"
      : selectedReceipt.payment === "cash"
      ? "Cash"
      : selectedReceipt.payment === "card"
      ? "POS"
      : selectedReceipt.payment === "mobile"
      ? "MoMo"
      : selectedReceipt.payment;

    return (
      <div
        style={{
          marginBottom: "14px",
          backgroundColor: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
          padding: "14px 18px 14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 950 }}>Sale details</div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
              Receipt #{selectedReceipt.id} · {formatTimeHM(selectedReceipt.time)} · {paymentLabel}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>
              Customer: <strong>{customerLabel}</strong>
              {selectedReceipt.dueDate ? ` · Due: ${String(selectedReceipt.dueDate).slice(0, 10)}` : ""}
            </div>
            <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
              Tip: click a line below to edit the receipt in <strong>SalesPOS → Current sale</strong>.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedSaleId(null)}
            style={{
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              borderRadius: "999px",
              padding: "6px 10px",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            Close ✕
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "12px",
            marginTop: "12px",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Total</div>
            <div style={{ fontSize: "18px", fontWeight: 950 }}>{formatMoney(selectedReceipt.total)}</div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Profit</div>
            <div style={{ fontSize: "16px", fontWeight: 950, color: "#16a34a" }}>{formatMoney(selectedReceipt.profit)}</div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Collected now</div>
            <div style={{ fontSize: "16px", fontWeight: 950 }}>{formatMoney(selectedReceipt.collected)}</div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Credit balance</div>
            <div style={{ fontSize: "16px", fontWeight: 950, color: selectedReceipt.balance > 0 ? "#b91c1c" : "#166534" }}>
              {formatMoney(selectedReceipt.balance)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "12px", overflowX: "auto" }}>
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
                  fontWeight: 900,
                }}
              >
                <th style={{ padding: "8px 6px" }}>Item</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Qty</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Unit</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Total</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {(selectedReceipt.lines || []).map((line) => {
                const f = extractLineFields(line);
                const itemName = line.item_name || stockByItemId[f.itemId]?.item_name || `Item #${f.itemId}`;

                return (
                  <tr
                    key={line.id || `${selectedReceipt.id}-${f.itemId}`}
                    style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                    title="Click to edit this receipt in Current sale"
                    onClick={() => {
                      setSelectedSaleId(null);
                      startEditReceipt(selectedReceipt.id, f.lineId ?? null);
                    }}
                  >
                    <td style={{ padding: "10px 6px", color: "#2563eb", fontWeight: 900 }}>{itemName}</td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 900 }}>{formatQty(f.qty)}</td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 900 }}>{formatMoney(f.unitPrice)}</td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 950 }}>{formatMoney(f.total)}</td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 900 }}>{formatMoney(f.profit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderDetails = () => {
    return (
      <div style={{ padding: "16px 24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            {canEditHistory ? (
              <button
                onClick={backToDates}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  marginBottom: "4px",
                  fontSize: "12px",
                  color: "#2563eb",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                ← Back to dates
              </button>
            ) : (
              <button
                onClick={() => navigate(workspacePath)}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  marginBottom: "4px",
                  fontSize: "12px",
                  color: "#2563eb",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                ← Back to shop workspace
              </button>
            )}

            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: "34px", fontWeight: 950, letterSpacing: "0.01em", margin: 0 }}>
                Sales History
              </h1>
              <span style={{ color: "#6b7280", fontWeight: 900 }}>
                · <strong style={{ color: "#111827" }}>{shopName}</strong>
              </span>
            </div>

            <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
              Date: <strong style={{ color: "#111827" }}>{selectedDate}</strong>
              {lastSalesSyncAt ? (
                <span style={{ marginLeft: 10, fontSize: 12, color: "#9ca3af" }}>
                  • Synced: {formatTimeHM(lastSalesSyncAt)}
                </span>
              ) : null}
            </div>

            {isCashier ? (
              <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 900, marginTop: 6 }}>
                Cashier can view <strong>Today only</strong>. Use SalesPOS for selling.
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {canEditHistory && !isViewingToday ? (
              <button
                type="button"
                onClick={openAddMissingSaleForDate}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "none",
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 950,
                  fontSize: 12,
                  boxShadow: "0 6px 18px rgba(37, 99, 235, 0.35)",
                }}
                title="Open SalesPOS Current Sale for this date (add missing sale)"
              >
                + Add missing sale (this date)
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                loadSalesForDate(selectedDate);
                loadStock();
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 950,
                fontSize: 12,
              }}
              title="Refresh from backend"
            >
              ⟳ Refresh
            </button>
          </div>
        </div>

        {error && shop ? (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 14,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 14,
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: "14px 18px 14px",
            fontSize: "12px",
            width: "100%",
          }}
        >
          <div style={{ fontSize: "14px", fontWeight: 950, marginBottom: "6px" }}>Summary</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              rowGap: "10px",
              columnGap: "18px",
            }}
          >
            <div>
              <div style={{ color: "#6b7280", fontWeight: 900 }}>Total sales</div>
              <div style={{ fontSize: "20px", fontWeight: 950 }}>{formatMoney(summary.totalSales)}</div>
            </div>

            <div>
              <div style={{ color: "#6b7280", fontWeight: 900 }}>Total profit</div>
              <div style={{ fontSize: "18px", fontWeight: 950, color: "#16a34a" }}>
                {formatMoney(summary.totalProfit)}
              </div>
            </div>

            <div>
              <div style={{ color: "#6b7280", fontWeight: 900 }}>Pieces sold</div>
              <div style={{ fontSize: "18px", fontWeight: 950 }}>{formatQty(summary.piecesSold)}</div>
            </div>

            <div>
              <div style={{ color: "#6b7280", fontWeight: 900 }}>Receipts</div>
              <div style={{ fontSize: "18px", fontWeight: 950 }}>{formatMoney(summary.receiptsCount)}</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, marginBottom: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", backgroundColor: "#e5e7eb", borderRadius: "999px", padding: "2px" }}>
            {[
              { key: "items", label: "Items" },
              { key: "receipts", label: "Receipts" },
              { key: "customers", label: "Customers" },
            ].map((opt) => {
              const isActive = historyView === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setHistoryView(opt.key);
                    setSelectedSaleId(null);
                  }}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    padding: "7px 12px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 950,
                    backgroundColor: isActive ? "#ffffff" : "transparent",
                    color: isActive ? "#111827" : "#4b5563",
                    boxShadow: isActive ? "0 2px 6px rgba(0,0,0,0.10)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", backgroundColor: "#e5e7eb", borderRadius: "999px", padding: "2px" }}>
              {[
                { key: "all", label: "All" },
                { key: "paid", label: "Paid only" },
                { key: "credit", label: "Credit only" },
              ].map((opt) => {
                const isActive = filterPaidCredit === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFilterPaidCredit(opt.key)}
                    style={{
                      border: "none",
                      cursor: "pointer",
                      padding: "5px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 900,
                      backgroundColor: isActive ? "#ffffff" : "transparent",
                      color: isActive ? "#111827" : "#4b5563",
                      boxShadow: isActive ? "0 2px 6px rgba(0,0,0,0.10)" : "none",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                backgroundColor: "#fff",
                fontSize: "12px",
                fontWeight: 900,
              }}
            >
              <option value="all">Payment: All</option>
              <option value="cash">Cash</option>
              <option value="mobile">MoMo</option>
              <option value="card">POS</option>
              <option value="credit">Credit</option>
            </select>
          </div>
        </div>

        {renderReceiptDetails()}

        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: "12px 14px 12px",
            width: "100%",
          }}
        >
          {loadingSales || loadingStock ? (
            <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280", fontWeight: 900 }}>
              Loading…
            </div>
          ) : historyView === "items" ? (
            filteredItems.length === 0 ? (
              <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280", fontWeight: 900 }}>
                No sales recorded for this filter on this date.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
                  Tip: click an item to edit the receipt in <strong>SalesPOS → Current sale</strong>.
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr
                        style={{
                          textAlign: "left",
                          borderBottom: "1px solid #e5e7eb",
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: "#6b7280",
                          fontWeight: 900,
                        }}
                      >
                        <th style={{ padding: "10px 6px" }}>Time</th>
                        <th style={{ padding: "10px 6px" }}>Item</th>
                        <th style={{ padding: "10px 6px" }}>Customer</th>
                        <th style={{ padding: "10px 6px" }}>Due</th>
                        <th style={{ padding: "10px 6px", textAlign: "right" }}>Qty</th>
                        <th style={{ padding: "10px 6px", textAlign: "right" }}>Unit price</th>
                        <th style={{ padding: "10px 6px", textAlign: "right" }}>Total</th>
                        <th style={{ padding: "10px 6px", textAlign: "right" }}>Profit</th>
                        <th style={{ padding: "10px 6px" }}>Payment</th>
                        <th style={{ padding: "10px 6px" }}>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredItems.map((row) => {
                        const isOpenCredit = row.isCreditSale && Number(row.creditBalance || 0) > 0;
                        const statusLabel = isOpenCredit
                          ? "Credit (Open)"
                          : row.isCreditSale
                          ? "Paid (Credit settled)"
                          : "Paid";
                        const statusBg = isOpenCredit ? "#fef2f2" : "#ecfdf3";
                        const statusBorder = isOpenCredit ? "#fecaca" : "#bbf7d0";
                        const statusColor = isOpenCredit ? "#b91c1c" : "#166534";

                        const paymentLabel = row.isCreditSale
                          ? "Credit"
                          : row.paymentType === "cash"
                          ? "Cash"
                          : row.paymentType === "card"
                          ? "POS"
                          : row.paymentType === "mobile"
                          ? "MoMo"
                          : row.paymentType || "N/A";

                        const customerLabel = row.customerName
                          ? `${row.customerName}${row.customerPhone ? ` (${row.customerPhone})` : ""}`
                          : "-";
                        const dueLabel = row.dueDate ? String(row.dueDate).slice(0, 10) : "-";

                        return (
                          <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "12px 6px", fontWeight: 900 }}>{formatTimeHM(row.time)}</td>

                            <td style={{ padding: "12px 6px" }}>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => startEditReceipt(row.saleId, row.saleLineId)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") startEditReceipt(row.saleId, row.saleLineId);
                                }}
                                style={{ cursor: "pointer", userSelect: "none", display: "inline-block" }}
                                title={`Click to edit receipt #${row.saleId}`}
                              >
                                <span style={{ color: "#2563eb", fontWeight: 950, fontSize: 14 }}>
                                  {row.itemName}
                                </span>
                                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, fontWeight: 900 }}>
                                  Receipt #{row.saleId}
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: "12px 6px" }}>{customerLabel}</td>
                            <td style={{ padding: "12px 6px" }}>{dueLabel}</td>

                            <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 950 }}>{formatQty(row.qtyPieces)}</td>
                            <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 950 }}>{formatMoney(row.unitPrice)}</td>
                            <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 950 }}>{formatMoney(row.total)}</td>
                            <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 950 }}>{formatMoney(row.profit)}</td>

                            <td style={{ padding: "12px 6px" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "3px 9px",
                                  borderRadius: "999px",
                                  backgroundColor: "#eff6ff",
                                  color: "#1d4ed8",
                                  fontSize: 11,
                                  fontWeight: 950,
                                }}
                              >
                                {paymentLabel}
                              </span>
                            </td>

                            <td style={{ padding: "12px 6px" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "3px 9px",
                                  borderRadius: "999px",
                                  background: statusBg,
                                  border: `1px solid ${statusBorder}`,
                                  color: statusColor,
                                  fontSize: 11,
                                  fontWeight: 950,
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
                </div>
              </>
            )
          ) : historyView === "receipts" ? (
            receiptsForDay.length === 0 ? (
              <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280", fontWeight: 900 }}>
                No receipts for this date.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #e5e7eb",
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "#6b7280",
                        fontWeight: 900,
                      }}
                    >
                      <th style={{ padding: "10px 6px" }}>Time</th>
                      <th style={{ padding: "10px 6px" }}>Receipt</th>
                      <th style={{ padding: "10px 6px" }}>Customer</th>
                      <th style={{ padding: "10px 6px" }}>Payment</th>
                      <th style={{ padding: "10px 6px", textAlign: "right" }}>Total</th>
                      <th style={{ padding: "10px 6px", textAlign: "right" }}>Profit</th>
                      <th style={{ padding: "10px 6px", textAlign: "right" }}>Balance</th>
                      <th style={{ padding: "10px 6px" }}></th>
                    </tr>
                  </thead>

                  <tbody>
                    {receiptsForDay.map((r) => {
                      const customerLabel = r.customerName
                        ? `${r.customerName}${r.customerPhone ? ` (${r.customerPhone})` : ""}`
                        : "-";
                      const paymentLabel = r.isCredit
                        ? "Credit"
                        : r.payment === "cash"
                        ? "Cash"
                        : r.payment === "card"
                        ? "POS"
                        : r.payment === "mobile"
                        ? "MoMo"
                        : r.payment;

                      return (
                        <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "12px 6px", fontWeight: 900 }}>{formatTimeHM(r.time)}</td>
                          <td style={{ padding: "12px 6px", fontWeight: 950 }}>#{r.id}</td>
                          <td style={{ padding: "12px 6px" }}>{customerLabel}</td>
                          <td style={{ padding: "12px 6px", fontWeight: 900 }}>{paymentLabel}</td>
                          <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 950 }}>{formatMoney(r.total)}</td>
                          <td style={{ padding: "12px 6px", textAlign: "right", color: "#16a34a", fontWeight: 950 }}>{formatMoney(r.profit)}</td>
                          <td style={{ padding: "12px 6px", textAlign: "right", color: r.balance > 0 ? "#b91c1c" : "#166534", fontWeight: 950 }}>
                            {formatMoney(r.balance)}
                          </td>
                          <td style={{ padding: "12px 6px", textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => setSelectedSaleId(r.id)}
                              style={{
                                padding: "7px 12px",
                                borderRadius: "999px",
                                border: "1px solid #e5e7eb",
                                backgroundColor: "#fff",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: 950,
                              }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : customersRollup.length === 0 ? (
            <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280", fontWeight: 900 }}>
              No customers for this date.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #e5e7eb",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#6b7280",
                      fontWeight: 900,
                    }}
                  >
                    <th style={{ padding: "10px 6px" }}>Customer</th>
                    <th style={{ padding: "10px 6px", textAlign: "right" }}>Receipts</th>
                    <th style={{ padding: "10px 6px", textAlign: "right" }}>Total bought</th>
                    <th style={{ padding: "10px 6px", textAlign: "right" }}>Collected</th>
                    <th style={{ padding: "10px 6px", textAlign: "right" }}>Credit balance</th>
                  </tr>
                </thead>
                <tbody>
                  {customersRollup.map((c) => (
                    <tr key={c.key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "12px 6px", fontWeight: 950 }}>{c.label}</td>
                      <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 900 }}>{formatMoney(c.receipts)}</td>
                      <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 950 }}>{formatMoney(c.totalBought)}</td>
                      <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 900 }}>{formatMoney(c.collectedToday)}</td>
                      <td style={{ padding: "12px 6px", textAlign: "right", fontWeight: 950, color: c.creditBalance > 0 ? "#b91c1c" : "#166534" }}>
                        {formatMoney(c.creditBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ✅ If Owner/Manager: default is Dates screen
  // ✅ If Cashier/other: details screen (today only)
  if (canEditHistory && pageMode === "dates") return renderDatesOnly();
  return renderDetails();
}
