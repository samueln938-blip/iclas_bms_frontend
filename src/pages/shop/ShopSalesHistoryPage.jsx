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

function SalesHistoryPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  const auth = useAuth();
  const authHeadersNoJson = auth?.authHeadersNoJson || auth?.authHeaders || {};
  const user = auth?.user || null;

  // Roles
  const role = String(user?.role || "").toLowerCase();
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

  const [selectedDate, setSelectedDate] = useState(todayDateString());

  // Sales + loading
  const [sales, setSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [lastSalesSyncAt, setLastSalesSyncAt] = useState(null);

  // Stock rows to get REAL item names
  const [stockRows, setStockRows] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);

  const shopName = shop?.name || `Shop ${shopId}`;

  // ✅ IMPORTANT: avoid infinite "Loading session..."
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
  // Load stock (AUTH)
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
  // Load sales for selected date
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

  // Load when date changes
  useEffect(() => {
    if (!headersReady) return;
    loadSalesForDate(selectedDate);
  }, [headersReady, selectedDate, loadSalesForDate]);

  // -------------------------
  // Build "clean items list" rows for this date
  // -------------------------
  const itemsRows = useMemo(() => {
    const rows = [];
    for (const sale of sales || []) {
      const saleTime = sale?.sale_date;
      const lines = pickLines(sale);
      for (const line of lines) {
        const { lineId, itemId, qty, unitPrice, total, profit } = extractLineFields(line);

        const stockRow = itemId ? stockByItemId[itemId] : null;
        const itemName =
          stockRow?.item_name ||
          stockRow?.item?.name ||
          line?.item_name ||
          line?.name ||
          (itemId != null ? `Item #${itemId}` : "Unknown item");

        rows.push({
          id: `${sale.id}-${lineId ?? Math.random().toString(16).slice(2)}`,
          saleId: sale.id,
          saleDate: sale?.sale_date,
          lineId: lineId ?? null,
          itemId,
          itemName,
          qtyPieces: qty,
          unitPrice,
          total,
          profit,
        });
      }
    }

    // Newest first (by sale time)
    rows.sort((a, b) => {
      const ta = parseDateAssumeKigali(a.saleDate)?.getTime?.() || 0;
      const tb = parseDateAssumeKigali(b.saleDate)?.getTime?.() || 0;
      if (tb !== ta) return tb - ta;
      return Number(b.saleId || 0) - Number(a.saleId || 0);
    });

    return rows;
  }, [sales, stockByItemId]);

  // -------------------------
  // Summary
  // -------------------------
  const summary = useMemo(() => {
    let totalSales = 0;
    let totalProfit = 0;
    let piecesSold = 0;

    for (const sale of sales || []) {
      const { total, profit } = getSaleTotals(sale);
      totalSales += total;
      totalProfit += profit;
    }

    for (const row of itemsRows || []) {
      piecesSold += Number(row.qtyPieces || 0);
    }

    return {
      totalSales,
      totalProfit,
      piecesSold,
      receiptsCount: (sales || []).length,
    };
  }, [sales, itemsRows]);

  // =========================
  // Receipt Item Pad (modal)
  // =========================
  const [padOpen, setPadOpen] = useState(false);
  const [padSaleId, setPadSaleId] = useState(null);

  const [padLoading, setPadLoading] = useState(false);
  const [padError, setPadError] = useState("");

  const [padSale, setPadSale] = useState(null); // full sale object (with lines)
  const [padDraftLines, setPadDraftLines] = useState([]); // editable lines

  // Add-item sub-panel
  const [addMode, setAddMode] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addItemId, setAddItemId] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addPrice, setAddPrice] = useState("");

  const closePad = useCallback(() => {
    setPadOpen(false);
    setPadSaleId(null);
    setPadSale(null);
    setPadDraftLines([]);
    setPadError("");
    setAddMode(false);
    setAddSearch("");
    setAddItemId("");
    setAddQty("");
    setAddPrice("");
  }, []);

  // ESC closes
  useEffect(() => {
    if (!padOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") closePad();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [padOpen, closePad]);

  const openPadForSale = useCallback(
    async (saleId) => {
      if (!saleId) return;
      setPadOpen(true);
      setPadSaleId(saleId);
      setPadSale(null);
      setPadDraftLines([]);
      setPadError("");
      setAddMode(false);

      try {
        setPadLoading(true);

        const res = await fetch(`${API_BASE}/sales/${saleId}`, {
          headers: authHeadersNoJson,
          cache: "no-store",
        });

        if (!res.ok) {
          let detail = `Failed to load receipt #${saleId} (status ${res.status}).`;
          try {
            const j = await res.json();
            if (j?.detail) {
              detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
            }
          } catch {}
          throw new Error(detail);
        }

        const fullSale = await res.json();
        const lines = pickLines(fullSale);

        setPadSale(fullSale);
        // Normalize into editable lines
        setPadDraftLines(
          lines.map((ln) => {
            const f = extractLineFields(ln);
            return {
              _key: String(f.lineId ?? Math.random().toString(16).slice(2)),
              lineId: f.lineId ?? null,
              itemId: f.itemId ?? null,
              qtyPieces: f.qty ?? 0,
              unitPrice: f.unitPrice ?? 0,
            };
          })
        );
      } catch (err) {
        console.error(err);
        setPadError(err.message || "Failed to load receipt.");
      } finally {
        setPadLoading(false);
      }
    },
    [authHeadersNoJson]
  );

  const updateDraftLine = useCallback((key, patch) => {
    setPadDraftLines((prev) =>
      (prev || []).map((l) => (l._key === key ? { ...l, ...patch } : l))
    );
  }, []);

  const itemsForAddPicker = useMemo(() => {
    const q = String(addSearch || "").trim().toLowerCase();
    const list = (stockRows || []).map((r) => {
      const id = r?.item_id;
      const nm = r?.item_name || r?.item?.name || `Item #${id}`;
      return { id, name: nm };
    });

    if (!q) return list.slice(0, 200);
    return list
      .filter((x) => String(x.name).toLowerCase().includes(q) || String(x.id).includes(q))
      .slice(0, 200);
  }, [stockRows, addSearch]);

  const buildPutPayloadFromDraft = useCallback(
    (saleObj, draftLines) => {
      const sale = saleObj || {};
      const linesPayload = (draftLines || []).map((l) => {
        return {
          item_id: l.itemId,
          quantity_pieces: Number(l.qtyPieces),
          sale_price_per_piece: Number(l.unitPrice),
        };
      });

      return {
        shop_id: sale.shop_id ?? sale.shopId,
        payment_type: sale.payment_type ?? sale.paymentType ?? null,
        is_credit_sale: sale.is_credit_sale ?? sale.isCreditSale ?? false,
        customer_name: sale.customer_name ?? sale.customerName ?? null,
        customer_phone: sale.customer_phone ?? sale.customerPhone ?? null,
        lines: linesPayload,
      };
    },
    []
  );

  const savePadChanges = useCallback(async () => {
    if (!padSaleId) return;
    if (!padSale) return;

    // Permission guard
    if (!canEditHistory) {
      setPadError("Only Owner/Manager can edit past sales.");
      return;
    }

    // Validate lines
    for (const l of padDraftLines || []) {
      const qty = Number(l.qtyPieces);
      const price = Number(l.unitPrice);
      if (!Number.isFinite(qty) || qty <= 0) {
        setPadError("Each line quantity must be greater than 0.");
        return;
      }
      if (!Number.isFinite(price) || price <= 0) {
        setPadError("Each line price must be greater than 0.");
        return;
      }
      if (!l.itemId) {
        setPadError("Each line must have an item.");
        return;
      }
    }

    try {
      setPadLoading(true);
      setPadError("");

      const payload = buildPutPayloadFromDraft(padSale, padDraftLines);

      const putRes = await fetch(`${API_BASE}/sales/${padSaleId}`, {
        method: "PUT",
        headers: {
          ...authHeadersNoJson,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!putRes.ok) {
        let detail = `Failed to update receipt (status ${putRes.status}).`;
        try {
          const j = await putRes.json();
          if (j?.detail) {
            detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
          }
        } catch {}
        throw new Error(detail);
      }

      await putRes.json();

      // Reload day + stock to keep UI consistent
      await loadSalesForDate(selectedDate);
      await loadStock();

      // Reload pad with fresh sale
      await openPadForSale(padSaleId);
    } catch (err) {
      console.error(err);
      setPadError(err.message || "Failed to update receipt.");
    } finally {
      setPadLoading(false);
    }
  }, [
    padSaleId,
    padSale,
    padDraftLines,
    authHeadersNoJson,
    canEditHistory,
    buildPutPayloadFromDraft,
    loadSalesForDate,
    selectedDate,
    loadStock,
    openPadForSale,
  ]);

  const addNewItemToReceipt = useCallback(async () => {
    if (!padSaleId || !padSale) return;

    if (!canEditHistory) {
      setPadError("Only Owner/Manager can add items to past sales.");
      return;
    }

    const itemIdNum = Number(addItemId);
    const qtyNum = Number(addQty);
    const priceNum = Number(addPrice);

    if (!Number.isFinite(itemIdNum) || itemIdNum <= 0) {
      setPadError("Choose an item to add.");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setPadError("Quantity must be greater than 0.");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setPadError("Unit price must be greater than 0.");
      return;
    }

    try {
      setPadLoading(true);
      setPadError("");

      const nextDraft = [
        ...(padDraftLines || []),
        {
          _key: `new-${Date.now()}`,
          lineId: null,
          itemId: itemIdNum,
          qtyPieces: qtyNum,
          unitPrice: priceNum,
        },
      ];

      const payload = buildPutPayloadFromDraft(padSale, nextDraft);

      const putRes = await fetch(`${API_BASE}/sales/${padSaleId}`, {
        method: "PUT",
        headers: {
          ...authHeadersNoJson,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!putRes.ok) {
        let detail = `Failed to add item (status ${putRes.status}).`;
        try {
          const j = await putRes.json();
          if (j?.detail) {
            detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
          }
        } catch {}
        throw new Error(detail);
      }

      await putRes.json();

      // reload day + stock, then reload pad
      await loadSalesForDate(selectedDate);
      await loadStock();
      await openPadForSale(padSaleId);

      // reset add form
      setAddMode(false);
      setAddSearch("");
      setAddItemId("");
      setAddQty("");
      setAddPrice("");
    } catch (err) {
      console.error(err);
      setPadError(err.message || "Failed to add item.");
    } finally {
      setPadLoading(false);
    }
  }, [
    padSaleId,
    padSale,
    padDraftLines,
    addItemId,
    addQty,
    addPrice,
    authHeadersNoJson,
    canEditHistory,
    buildPutPayloadFromDraft,
    loadSalesForDate,
    selectedDate,
    loadStock,
    openPadForSale,
  ]);

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

  const isViewingToday = selectedDate === todayDateString();

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
            Sales History
          </h1>
          <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>
            <strong>{shopName}</strong> • Date: <strong>{selectedDate}</strong>
            {lastSalesSyncAt && (
              <span style={{ marginLeft: 10, fontSize: 12, color: "#9ca3af" }}>
                • Synced: {formatTimeHM(lastSalesSyncAt)}
              </span>
            )}
          </p>
          {isCashier && (
            <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 800 }}>
              Cashier view is read-only here. Use SalesPOS for today’s selling.
            </div>
          )}
          {!canEditHistory && !isCashier && (
            <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 800 }}>
              You do not have permission to edit history. Only Owner/Manager can edit past
              sales.
            </div>
          )}
          {canEditHistory && !isViewingToday && (
            <div style={{ fontSize: 12, color: "#374151", fontWeight: 700 }}>
              You’re editing history for <strong>{selectedDate}</strong>. Changes affect stock
              and totals.
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
              fontWeight: 700,
              fontSize: 12,
            }}
            title="Refresh from backend"
          >
            ⟳ Refresh
          </button>
        </div>
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
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            rowGap: "8px",
            columnGap: "16px",
          }}
        >
          <div>
            <div style={{ color: "#6b7280" }}>Total sales</div>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>
              {formatMoney(summary.totalSales)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Total profit</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#16a34a" }}>
              {formatMoney(summary.totalProfit)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Pieces sold</div>
            <div style={{ fontSize: "16px", fontWeight: 800 }}>
              {formatMoney(summary.piecesSold)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Receipts</div>
            <div style={{ fontSize: "16px", fontWeight: 800 }}>
              {formatMoney(summary.receiptsCount)}
            </div>
          </div>
        </div>
      </div>

      {/* Clean items list */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 6px 18px rgba(15,37,128,0.04)",
          padding: "10px 12px 10px",
        }}
      >
        {(loadingSales || loadingStock) && (
          <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>
            Loading items...
          </div>
        )}

        {!loadingSales && itemsRows.length === 0 && (
          <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>
            No sales/items found for this date.
          </div>
        )}

        {itemsRows.length > 0 && (
          <>
            <div style={{ marginBottom: 8, fontSize: 12, color: "#6b7280" }}>
              Tip: click a row to open the <strong>Receipt Item Pad</strong> and{" "}
              <strong>add forgotten items</strong>.
            </div>

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
                  <th style={{ padding: "6px 4px" }}>Receipt</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Qty</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Unit price</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Total</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {itemsRows.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      cursor: "pointer",
                    }}
                    onClick={() => openPadForSale(row.saleId)}
                    title="Open Receipt Item Pad"
                  >
                    <td style={{ padding: "8px 4px" }}>{formatTimeHM(row.saleDate)}</td>

                    <td style={{ padding: "8px 4px" }}>
                      <div style={{ fontWeight: 800, color: "#111827" }}>{row.itemName}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                        {formatDateTime(row.saleDate)}
                      </div>
                    </td>

                    <td style={{ padding: "8px 4px" }}>
                      <span style={{ fontWeight: 900, color: "#2563eb" }}>#{row.saleId}</span>
                    </td>

                    <td style={{ padding: "8px 4px", textAlign: "right" }}>
                      {formatMoney(row.qtyPieces)}
                    </td>
                    <td style={{ padding: "8px 4px", textAlign: "right" }}>
                      {formatMoney(row.unitPrice)}
                    </td>
                    <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 800 }}>
                      {formatMoney(row.total)}
                    </td>
                    <td style={{ padding: "8px 4px", textAlign: "right" }}>
                      {formatMoney(row.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Receipt Item Pad Modal */}
      {padOpen && (
        <div
          onClick={closePad}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
              background: "#ffffff",
              borderRadius: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                  Receipt Item Pad
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    color: "#111827",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Receipt #{padSaleId} • {selectedDate}
                </div>
                {padSale?.sale_date && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    Time: {formatDateTime(padSale.sale_date)}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={closePad}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  Close
                </button>

                <button
                  type="button"
                  disabled={padLoading || !canEditHistory}
                  onClick={() => setAddMode((v) => !v)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "none",
                    background: canEditHistory
                      ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                      : "#9ca3af",
                    color: "#fff",
                    cursor: canEditHistory ? "pointer" : "not-allowed",
                    fontWeight: 900,
                    fontSize: 12,
                    boxShadow: canEditHistory ? "0 4px 14px rgba(37, 99, 235, 0.35)" : "none",
                  }}
                  title={canEditHistory ? "Add forgotten item to this receipt" : "Owner/Manager only"}
                >
                  + Add item
                </button>

                <button
                  type="button"
                  disabled={padLoading || !canEditHistory}
                  onClick={savePadChanges}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: "none",
                    background: canEditHistory
                      ? "linear-gradient(135deg, #16a34a, #15803d)"
                      : "#9ca3af",
                    color: "#fff",
                    cursor: canEditHistory ? "pointer" : "not-allowed",
                    fontWeight: 900,
                    fontSize: 12,
                    boxShadow: canEditHistory ? "0 4px 14px rgba(22, 163, 74, 0.28)" : "none",
                  }}
                  title={canEditHistory ? "Save receipt changes" : "Owner/Manager only"}
                >
                  {padLoading ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>

            {padError && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 14,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {padError}
              </div>
            )}

            {!canEditHistory && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                This pad is read-only for your role. Only Owner/Manager can edit or add items.
              </div>
            )}

            {padLoading && !padSale && (
              <div style={{ marginTop: 12, fontSize: 13, color: "#6b7280" }}>
                Loading receipt...
              </div>
            )}

            {addMode && (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 16,
                  border: "1px dashed #d1d5db",
                  background: "linear-gradient(135deg, #f9fafb 0%, #eef2ff 100%)",
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
                  Add forgotten item
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Search item name / id..."
                    style={{
                      minWidth: 240,
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                      background: "#fff",
                    }}
                  />

                  <select
                    value={addItemId}
                    onChange={(e) => setAddItemId(e.target.value)}
                    style={{
                      minWidth: 240,
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                      background: "#fff",
                    }}
                  >
                    <option value="">Select item…</option>
                    {itemsForAddPicker.map((it) => (
                      <option key={it.id} value={String(it.id)}>
                        #{it.id} — {it.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    step="0.01"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    placeholder="Qty"
                    style={{
                      width: 120,
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                      textAlign: "right",
                      background: "#fff",
                    }}
                  />

                  <input
                    type="number"
                    step="1"
                    value={addPrice}
                    onChange={(e) => setAddPrice(e.target.value)}
                    placeholder="Unit price"
                    style={{
                      width: 140,
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                      textAlign: "right",
                      background: "#fff",
                    }}
                  />

                  <button
                    type="button"
                    disabled={padLoading || !canEditHistory}
                    onClick={addNewItemToReceipt}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: "none",
                      background: canEditHistory
                        ? "linear-gradient(135deg, #111827, #0f172a)"
                        : "#9ca3af",
                      color: "#fff",
                      cursor: canEditHistory ? "pointer" : "not-allowed",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    Add
                  </button>
                </div>

                <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
                  Tip: After adding, press <strong>Save changes</strong> if you also edited other
                  lines.
                </div>
              </div>
            )}

            {/* Lines editor */}
            {padSale && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>
                  Items in this receipt
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
                      <th style={{ padding: "6px 4px" }}>Item</th>
                      <th style={{ padding: "6px 4px", textAlign: "right" }}>Qty</th>
                      <th style={{ padding: "6px 4px", textAlign: "right" }}>Unit price</th>
                      <th style={{ padding: "6px 4px", textAlign: "right" }}>Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {padDraftLines.map((l) => {
                      const stockRow = l.itemId ? stockByItemId[l.itemId] : null;
                      const nm =
                        stockRow?.item_name ||
                        stockRow?.item?.name ||
                        (l.itemId != null ? `Item #${l.itemId}` : "Unknown item");
                      const qty = Number(l.qtyPieces) || 0;
                      const price = Number(l.unitPrice) || 0;
                      const lineTotal = qty > 0 && price > 0 ? qty * price : 0;

                      return (
                        <tr key={l._key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "8px 4px" }}>
                            <div style={{ fontWeight: 800 }}>{nm}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>
                              {l.itemId != null ? `#${l.itemId}` : "No item id"}
                            </div>
                          </td>

                          <td style={{ padding: "8px 4px", textAlign: "right" }}>
                            <input
                              type="number"
                              step="0.01"
                              disabled={!canEditHistory || padLoading}
                              value={String(l.qtyPieces ?? "")}
                              onChange={(e) =>
                                updateDraftLine(l._key, { qtyPieces: e.target.value })
                              }
                              style={{
                                width: 110,
                                padding: "8px 10px",
                                borderRadius: 999,
                                border: "1px solid #d1d5db",
                                fontSize: 13,
                                textAlign: "right",
                                background: !canEditHistory ? "#f3f4f6" : "#fff",
                              }}
                            />
                          </td>

                          <td style={{ padding: "8px 4px", textAlign: "right" }}>
                            <input
                              type="number"
                              step="1"
                              disabled={!canEditHistory || padLoading}
                              value={String(l.unitPrice ?? "")}
                              onChange={(e) =>
                                updateDraftLine(l._key, { unitPrice: e.target.value })
                              }
                              style={{
                                width: 130,
                                padding: "8px 10px",
                                borderRadius: 999,
                                border: "1px solid #d1d5db",
                                fontSize: 13,
                                textAlign: "right",
                                background: !canEditHistory ? "#f3f4f6" : "#fff",
                              }}
                            />
                          </td>

                          <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 900 }}>
                            {formatMoney(lineTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                  Note: Editing history changes totals and stock, so keep it Owner/Manager only.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SalesHistoryPage;
