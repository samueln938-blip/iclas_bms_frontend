// src/pages/shop/ShopSalesHistoryPage.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Single source of truth for API base (env or prod fallback)
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";
const API_BASE = CLIENT_API_BASE;

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value) || 0;
  return num.toLocaleString("en-RW", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdFromISO(iso) {
  if (!iso) return "";
  if (typeof iso === "string" && iso.length >= 10 && iso[4] === "-" && iso[7] === "-") return iso.slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-RW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeHM(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-RW", { hour: "2-digit", minute: "2-digit" });
}

function addDaysYMD(ymd, deltaDays) {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * ✅ IMPORTANT:
 * A sale is considered "open credit" ONLY when credit_balance > 0.
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
    Number(sale?.total_sale_amount ?? sale?.total_amount ?? sale?.sale_amount ?? sale?.total ?? 0) || 0;
  const profit = Number(sale?.total_profit ?? sale?.profit ?? 0) || 0;
  return { total, profit };
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
    line?.line_profit != null ? Number(line.line_profit) : line?.profit != null ? Number(line.profit) : 0;

  return { itemId, qty, unitPrice, total: Number(total) || 0, profit: Number(profit) || 0 };
}

function SalesHistoryPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  // ✅ Use the same auth headers as Sales & POS
  // Some pages expose authHeadersNoJson, others expose authHeaders.
  const auth = useAuth();
  const authHeadersNoJson = auth?.authHeadersNoJson || auth?.authHeaders || {};

  const [shop, setShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [error, setError] = useState("");

  // Tabs
  const [tab, setTab] = useState("today"); // today | range | month | credits | search

  // View mode: items (detail) OR receipts (summary)
  const [viewMode, setViewMode] = useState("items");

  // Payment filter: all / cash / card / mobile / credit
  const [paymentFilter, setPaymentFilter] = useState("all");

  // Today
  const [selectedDate, setSelectedDate] = useState(todayDateString());

  // Range
  const [rangeFrom, setRangeFrom] = useState(addDaysYMD(todayDateString(), -6)); // last 7 days by default
  const [rangeTo, setRangeTo] = useState(todayDateString());

  // Month
  const [selectedMonth, setSelectedMonth] = useState(todayDateString().slice(0, 7)); // YYYY-MM

  // Credits tab (range)
  const [creditFrom, setCreditFrom] = useState(addDaysYMD(todayDateString(), -30));
  const [creditTo, setCreditTo] = useState(todayDateString());

  // Search tab
  const [searchDaysBack, setSearchDaysBack] = useState(30);
  const [searchQuery, setSearchQuery] = useState("");

  // Sales + loading
  const [sales, setSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Stock rows to get REAL item names
  const [stockRows, setStockRows] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);

  // Auto refresh (Today tab only)
  const [autoRefreshToday, setAutoRefreshToday] = useState(true);
  const autoTimerRef = useRef(null);

  // Last sync info (useful for “is it fresh?” debugging)
  const [lastSalesSyncAt, setLastSalesSyncAt] = useState(null);

  const shopName = shop?.name || `Shop ${shopId}`;

  const headersReady = useMemo(() => {
    return !!authHeadersNoJson && typeof authHeadersNoJson === "object" && Object.keys(authHeadersNoJson).length > 0;
  }, [authHeadersNoJson]);

  // ✅ IMPORTANT: avoid infinite "Loading session..."
  // If headers aren't ready yet, stop blocking the whole page.
  useEffect(() => {
    if (!headersReady) {
      setLoadingShop(false);
      setShop(null);
      setError("Session not ready. Please refresh the page or login again.");
    } else {
      // clear the session warning once headers appear
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
    if (tab === "today") return selectedDate;
    if (tab === "range") return rangeFrom;
    if (tab === "credits") return creditFrom;
    if (tab === "search") return addDaysYMD(todayDateString(), -Math.max(1, Number(searchDaysBack) || 30) + 1);
    if (tab === "month") {
      const [y, m] = String(selectedMonth || "").split("-");
      if (!y || !m) return todayDateString();
      return `${y}-${m}-01`;
    }
    return selectedDate;
  }, [tab, selectedDate, rangeFrom, creditFrom, searchDaysBack, selectedMonth]);

  const activeDateTo = useMemo(() => {
    if (tab === "today") return selectedDate;
    if (tab === "range") return rangeTo;
    if (tab === "credits") return creditTo;
    if (tab === "search") return todayDateString();
    if (tab === "month") {
      const [yStr, mStr] = String(selectedMonth || "").split("-");
      const y = Number(yStr);
      const m = Number(mStr);
      if (!y || !m) return todayDateString();
      const last = new Date(y, m, 0); // last day of month
      const yy = last.getFullYear();
      const mm = String(last.getMonth() + 1).padStart(2, "0");
      const dd = String(last.getDate()).padStart(2, "0");
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
        if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
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

  // -------------------------
  // Load shop info (AUTH)
  // -------------------------
  const loadShop = useCallback(async () => {
    if (!shopId) return;

    // ✅ Don't keep spinner forever if auth headers are not ready
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
      } catch (e) {
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
  }, [API_BASE, authHeadersNoJson, fetchJson, headersReady, shopId]);

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
      } catch (e) {
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
  }, [API_BASE, authHeadersNoJson, fetchJson, headersReady, shopId]);

  useEffect(() => {
    loadStock();
  }, [loadStock]);

  const stockByItemId = useMemo(() => {
    const map = {};
    for (const row of stockRows || []) map[row.item_id] = row;
    return map;
  }, [stockRows]);

  // -------------------------
  // Load sales for active date range (AUTH)
  // -------------------------
  const loadSales = useCallback(async () => {
    if (!shopId || !activeDateFrom || !activeDateTo) return;
    if (!headersReady) return;

    if (salesAbortRef.current) salesAbortRef.current.abort();
    const controller = new AbortController();
    salesAbortRef.current = controller;

    const reqId = ++salesReqIdRef.current;

    setLoadingSales(true);
    setError("");

    try {
      const url = `${API_BASE}/sales/?shop_id=${shopId}&date_from=${activeDateFrom}&date_to=${activeDateTo}`;
      const json = await fetchJson(url, authHeadersNoJson, controller.signal);
      const list = Array.isArray(json) ? json : Array.isArray(json?.sales) ? json.sales : [];

      if (reqId !== salesReqIdRef.current) return;

      setSales(list || []);
      const nowIso = new Date().toISOString();
      setLastSalesSyncAt(nowIso);

      try {
        window.dispatchEvent(
          new CustomEvent("iclas:sales-history-synced", {
            detail: {
              shopId,
              dateFrom: activeDateFrom,
              dateTo: activeDateTo,
              at: Date.now(),
            },
          })
        );
      } catch {}
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error(err);

      if (reqId !== salesReqIdRef.current) return;

      setSales([]);
      setError(err.message || "Failed to load sales history.");
    } finally {
      if (reqId === salesReqIdRef.current) setLoadingSales(false);
    }
  }, [API_BASE, activeDateFrom, activeDateTo, authHeadersNoJson, fetchJson, headersReady, shopId]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

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
      loadSales();
    }, 8000);

    return () => {
      if (autoTimerRef.current) {
        window.clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [tab, autoRefreshToday, loadSales]);

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
  // Flatten items (detail view)
  // -------------------------
  const itemsRows = useMemo(() => {
    const rows = [];
    for (const sale of filteredSales || []) {
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
  }, [filteredSales, stockByItemId]);

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

    for (const row of itemsRows || []) piecesSold += Number(row.qtyPieces || 0);

    return {
      totalSales,
      totalProfit,
      piecesSold,
      receiptsCount: filteredSales.length,
      openCredit,
    };
  }, [filteredSales, itemsRows]);

  // -------------------------
  // Group by day (for Range/Month/Credits/Search tabs)
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

      rows.push({
        day,
        receipts: list.length,
        total,
        profit,
        openCredit,
      });
    }
    return rows;
  }, [groupedByDay]);

  // -------------------------
  // UI states
  // -------------------------
  const [openDays, setOpenDays] = useState({});
  useEffect(() => {
    setOpenDays({});
  }, [tab, activeDateFrom, activeDateTo]);

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
  const renderItemsTable = () => {
    if (loadingSales || loadingStock) {
      return <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>Loading items...</div>;
    }
    if (itemsRows.length === 0) {
      return <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>No items found.</div>;
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
          {itemsRows.map((row) => {
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

            return (
              <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px 4px" }}>{formatTimeHM(row.time)}</td>
                <td style={{ padding: "8px 4px" }}>
                  <span style={{ color: "#2563eb", fontWeight: 600 }}>{row.itemName}</span>
                </td>
                <td style={{ padding: "8px 4px", textAlign: "right" }}>{formatMoney(row.qtyPieces)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right" }}>{formatMoney(row.unitPrice)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600 }}>{formatMoney(row.total)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right" }}>{formatMoney(row.profit)}</td>
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

  const renderReceiptsTable = (salesList) => {
    if (loadingSales) {
      return <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>Loading receipts...</div>;
    }
    if (!salesList?.length) {
      return <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>No receipts found.</div>;
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
            const piecesCount = lines.reduce((sum, l) => sum + Number(extractLineFields(l).qty || 0), 0);

            const paymentType = normalizePaymentType(sale.payment_type);
            const { total, profit } = getSaleTotals(sale);

            const creditOpen = isOpenCreditSale(sale);

            const paymentLabel =
              paymentType === "cash" ? "Cash" : paymentType === "card" ? "POS" : paymentType === "mobile" ? "MoMo" : "N/A";

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
                      <span style={{ color: "#2563eb", fontWeight: 600 }}>{sale.customer_name}</span>
                      {sale.customer_phone && (
                        <span style={{ display: "block", fontSize: "11px", color: "#6b7280" }}>{sale.customer_phone}</span>
                      )}
                      <span style={{ display: "block", fontSize: "11px", color: "#9ca3af" }}>Receipt #{sale.id}</span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: "#6b7280" }}>Walk-in</span>
                      <span style={{ display: "block", fontSize: "11px", color: "#9ca3af" }}>Receipt #{sale.id}</span>
                    </>
                  )}
                </td>
                <td style={{ padding: "8px 4px", textAlign: "right" }}>{formatMoney(piecesCount)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600 }}>{formatMoney(total)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right" }}>{formatMoney(profit)}</td>
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
    tab === "today"
      ? "Sales History — Today"
      : tab === "range"
      ? "Sales History — Date Range"
      : tab === "month"
      ? "Sales History — Monthly"
      : tab === "credits"
      ? "Sales History — Open Credits"
      : "Sales History — Search";

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

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "0.02em", margin: 0 }}>{title}</h1>
          <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>
            <strong>{shopName}</strong> • Range: <strong>{activeDateFrom}</strong> → <strong>{activeDateTo}</strong>
            {lastSalesSyncAt && (
              <span style={{ marginLeft: 10, fontSize: 12, color: "#9ca3af" }}>
                • Synced: {formatTimeHM(lastSalesSyncAt)}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {tab === "today" && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
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
              loadSales();
              loadStock(); // keeps item names fresh too
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
      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: "10px 16px", alignItems: "center" }}>
        {tab === "today" && (
          <div style={{ fontSize: "13px", color: "#6b7280" }}>
            Date:&nbsp;
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                fontSize: "13px",
              }}
            />
            <button
              type="button"
              onClick={() => setSelectedDate(todayDateString())}
              style={{
                marginLeft: 8,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Today
            </button>
          </div>
        )}

        {tab === "range" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", color: "#6b7280", fontSize: 13 }}>
            <div>
              From:&nbsp;
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #d1d5db", fontSize: 13 }}
              />
            </div>
            <div>
              To:&nbsp;
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #d1d5db", fontSize: 13 }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setRangeFrom(addDaysYMD(todayDateString(), -6));
                setRangeTo(todayDateString());
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
              Last 7 days
            </button>
            <button
              type="button"
              onClick={() => {
                setRangeFrom(addDaysYMD(todayDateString(), -29));
                setRangeTo(todayDateString());
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
              Last 30 days
            </button>
          </div>
        )}

        {tab === "month" && (
          <div style={{ color: "#6b7280", fontSize: 13 }}>
            Month:&nbsp;
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #d1d5db", fontSize: 13 }}
            />
          </div>
        )}

        {tab === "credits" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", color: "#6b7280", fontSize: 13 }}>
            <div>
              From:&nbsp;
              <input
                type="date"
                value={creditFrom}
                onChange={(e) => setCreditFrom(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #d1d5db", fontSize: 13 }}
              />
            </div>
            <div>
              To:&nbsp;
              <input
                type="date"
                value={creditTo}
                onChange={(e) => setCreditTo(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #d1d5db", fontSize: 13 }}
              />
            </div>
            <span style={{ fontSize: 12, color: "#b91c1c", fontWeight: 800 }}>Showing credit_balance &gt; 0</span>
          </div>
        )}

        {tab === "search" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              Last&nbsp;
              <input
                type="number"
                min="1"
                step="1"
                value={searchDaysBack}
                onChange={(e) => setSearchDaysBack(e.target.value)}
                style={{ width: 80, padding: "6px 10px", borderRadius: 999, border: "1px solid #d1d5db", fontSize: 13 }}
              />
              &nbsp;days
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search: receipt #, phone, customer, item..."
              style={{
                minWidth: 260,
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                fontSize: 13,
                background: "#fff",
              }}
            />
          </div>
        )}

        {/* Payment filter */}
        <div
          style={{
            display: "inline-flex",
            backgroundColor: "#e5e7eb",
            borderRadius: "999px",
            padding: "2px",
          }}
        >
          {[
            { key: "all", label: "All" },
            { key: "cash", label: "Cash" },
            { key: "card", label: "POS" },
            { key: "mobile", label: "MoMo" },
            { key: "credit", label: "Credit" },
          ].map((opt) => {
            const isActive = (tab === "credits" ? "credit" : paymentFilter) === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => tab !== "credits" && setPaymentFilter(opt.key)}
                style={{
                  border: "none",
                  cursor: tab === "credits" ? "not-allowed" : "pointer",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 700,
                  backgroundColor: isActive ? "#ffffff" : "transparent",
                  color: isActive ? "#111827" : "#4b5563",
                  boxShadow: isActive ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  opacity: tab === "credits" ? 0.6 : 1,
                }}
                title={tab === "credits" ? "Credits tab always shows Credit" : ""}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* View mode */}
        <div
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            backgroundColor: "#e5e7eb",
            borderRadius: "999px",
            padding: "2px",
          }}
        >
          {[
            { key: "items", label: "Items" },
            { key: "receipts", label: "Receipts" },
          ].map((opt) => {
            const isActive = viewMode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setViewMode(opt.key)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 700,
                  backgroundColor: isActive ? "#ffffff" : "transparent",
                  color: isActive ? "#111827" : "#4b5563",
                  boxShadow: isActive ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Errors */}
      {error && shop && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontWeight: 700, fontSize: 13 }}>
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
        <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#9ca3af", marginBottom: "8px" }}>
          {activeDateFrom} → {activeDateTo}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", rowGap: "8px", columnGap: "16px" }}>
          <div>
            <div style={{ color: "#6b7280" }}>Total sales</div>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>{formatMoney(rangeSummary.totalSales)}</div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Total profit</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#16a34a" }}>{formatMoney(rangeSummary.totalProfit)}</div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Pieces sold</div>
            <div style={{ fontSize: "16px", fontWeight: 800 }}>{formatMoney(rangeSummary.piecesSold)}</div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Receipts</div>
            <div style={{ fontSize: "16px", fontWeight: 800 }}>{formatMoney(rangeSummary.receiptsCount)}</div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Open credit</div>
            <div style={{ fontWeight: 900, color: "#b91c1c" }}>{formatMoney(rangeSummary.openCredit)}</div>
          </div>
        </div>
      </div>

      {/* Range/Month/Credits/Search: show daily totals list first */}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>Daily totals</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Tip: click a day to expand receipts</div>
          </div>

          {loadingSales ? (
            <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>Loading daily totals...</div>
          ) : dailyTotalsTable.length === 0 ? (
            <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>No data in this range.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
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
                  <th style={{ padding: "6px 4px" }}></th>
                </tr>
              </thead>
              <tbody>
                {dailyTotalsTable.map((r) => {
                  const open = !!openDays[r.day];
                  return (
                    <React.Fragment key={r.day}>
                      <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 4px", fontWeight: 800 }}>{r.day}</td>
                        <td style={{ padding: "8px 4px", textAlign: "right" }}>{formatMoney(r.receipts)}</td>
                        <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 800 }}>{formatMoney(r.total)}</td>
                        <td style={{ padding: "8px 4px", textAlign: "right", color: "#16a34a", fontWeight: 800 }}>{formatMoney(r.profit)}</td>
                        <td style={{ padding: "8px 4px", textAlign: "right", color: "#b91c1c", fontWeight: 900 }}>{formatMoney(r.openCredit)}</td>
                        <td style={{ padding: "8px 4px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => setOpenDays((prev) => ({ ...prev, [r.day]: !prev[r.day] }))}
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
                            {open ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={6} style={{ padding: "10px 4px" }}>
                            <div style={{ borderRadius: 14, border: "1px solid #e5e7eb", background: "#fafafa", padding: 10 }}>
                              {viewMode === "items"
                                ? renderItemsTable()
                                : renderReceiptsTable(groupedByDay.map.get(r.day) || [])}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
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
          {viewMode === "items" ? renderItemsTable() : renderReceiptsTable(filteredSales)}
        </div>
      )}
    </div>
  );
}

export default SalesHistoryPage;
