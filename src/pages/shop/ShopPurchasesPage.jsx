// src/pages/shop/ShopPurchasesPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Single source of truth for API base (VITE_API_BASE / prod)
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";

const API_BASE = CLIENT_API_BASE;

// ✅ You requested: header should NOT be sticky (but keep same format)
const HEADER_IS_STICKY = false;

// ✅ Added "All pieces" column after PIECES/UNIT
const PURCHASE_GRID_COLUMNS =
  "minmax(200px, 2.3fr) 90px 90px 110px 140px 140px 140px 130px 130px 130px 130px 110px 40px";

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value) || 0;
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatQty(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-RW", { maximumFractionDigits: 2 });
}

// ✅ local-safe today (no UTC shifting)
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ✅ Normalize "YYYY-MM-DD" or "DD/MM/YYYY"
function toISODate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }

  const dt = new Date(s);
  if (!Number.isFinite(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISOToDate(iso) {
  const v = toISODate(iso);
  if (!v) return null;
  const [y, m, d] = v.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function fmtDateLocal(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysISO(iso, deltaDays) {
  const dt = parseISOToDate(iso);
  if (!dt) return todayISO();
  dt.setDate(dt.getDate() + Number(deltaDays || 0));
  return fmtDateLocal(dt);
}

// ✅ Return list of ISO dates inclusive
function listDaysInclusive(fromISO, toISO, maxDaysHard = 366) {
  const f = parseISOToDate(fromISO);
  const t = parseISOToDate(toISO);
  if (!f || !t)
    return {
      ok: false,
      error: "Choose valid From and To dates.",
      days: [],
      daysCount: 0,
    };
  if (f.getTime() > t.getTime())
    return {
      ok: false,
      error: '"From" date must be <= "To" date.',
      days: [],
      daysCount: 0,
    };

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((t.getTime() - f.getTime()) / msPerDay) + 1;

  if (diffDays > maxDaysHard) {
    return {
      ok: false,
      error: `Date range too large (>${maxDaysHard} days). Please reduce the range.`,
      days: [],
      daysCount: diffDays,
    };
  }

  const days = [];
  const cur = new Date(f.getTime());
  for (let i = 0; i < diffDays; i++) {
    days.push(fmtDateLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return { ok: true, error: "", days, daysCount: diffDays };
}

/**
 * ✅ Mobile-friendly searchable dropdown
 */
function ItemComboBox({ items, valueId, onChangeId, disabled }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(() => {
    if (!valueId) return null;
    return items.find((it) => String(it.id) === String(valueId)) || null;
  }, [items, valueId]);

  useEffect(() => {
    if (!open) setQ(selected ? selected.label : "");
  }, [selected, open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 500);
    return items
      .filter((it) => String(it.label || "").toLowerCase().includes(s))
      .slice(0, 500);
  }, [items, q]);

  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const clearSelection = () => {
    setQ("");
    setOpen(false);
    onChangeId("");
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative" }}>
        <input
          value={disabled ? selected?.label || "" : q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtered.length > 0) {
                onChangeId(String(filtered[0].id));
                setOpen(false);
              }
            }
          }}
          placeholder={disabled ? "" : "Type item name to search…"}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          readOnly={disabled}
          style={{
            width: "100%",
            padding: "10px 36px 10px 12px",
            borderRadius: "12px",
            border: "1px solid #d1d5db",
            fontSize: "13px",
            outline: "none",
            backgroundColor: disabled ? "#f9fafb" : "#ffffff",
            color: "#111827",
            cursor: disabled ? "not-allowed" : "text",
          }}
        />

        {!disabled && (q || selected) ? (
          <button
            type="button"
            onClick={clearSelection}
            title="Clear"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 24,
              height: 24,
              borderRadius: "999px",
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              cursor: "pointer",
              color: "#6b7280",
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {!disabled && open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
            maxHeight: "280px",
            overflowY: "auto",
            zIndex: 999,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: "13px", color: "#6b7280" }}>
              No matching items
            </div>
          ) : (
            filtered.map((it) => (
              <button
                key={it.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChangeId(String(it.id));
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: "#111827",
                }}
              >
                <span style={{ fontWeight: 600 }}>{it.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// --- helper: pick prices from purchase line if backend returns them ---
function pickLineWholesale(pl, fallback) {
  const v =
    pl?.wholesale_price_per_piece ??
    pl?.wholesale_per_piece ??
    pl?.wholesale_price ??
    null;
  return v === null || v === undefined || v === "" ? fallback : v;
}
function pickLineRetail(pl, fallback) {
  const v =
    pl?.retail_price_per_piece ??
    pl?.selling_price_per_piece ??
    pl?.retail_per_piece ??
    pl?.retail_price ??
    null;
  return v === null || v === undefined || v === "" ? fallback : v;
}

function ShopPurchasesPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();

  const authHeaders = useMemo(() => {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const authHeadersNoJson = useMemo(() => {
    const h = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  // ✅ Tabs
  const [activeTab, setActiveTab] = useState(1); // 1=Entry, 2=History
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [historyInitialized, setHistoryInitialized] = useState(false);

  const [shop, setShop] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [purchaseDate, setPurchaseDate] = useState(() => todayISO());
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const [lines, setLines] = useState([]);

  const [pad, setPad] = useState({
    itemId: "",
    qtyUnits: 1,
    newUnitCost: "",
    newWholesalePerPiece: "",
    newRetailPerPiece: "",
  });

  const [editingLineId, setEditingLineId] = useState(null);
  const [editingDbId, setEditingDbId] = useState(null);
  const [editingDbUiId, setEditingDbUiId] = useState(null);

  const [selectedLineId, setSelectedLineId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [saving, setSaving] = useState(false);
  const [padSaving, setPadSaving] = useState(false);
  const [message, setMessage] = useState("");

  const padRef = useRef(null);
  const headerRef = useRef(null);

  const [headerHeight, setHeaderHeight] = useState(180);
  useEffect(() => {
    if (!HEADER_IS_STICKY) return;
    const calc = () => {
      if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight || 180);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // -------------------- Tab 2: History state --------------------
  const [historyFrom, setHistoryFrom] = useState(() => addDaysISO(todayISO(), -30));
  const [historyTo, setHistoryTo] = useState(() => todayISO());
  const [historyRunToken, setHistoryRunToken] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyHint, setHistoryHint] = useState("");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyLines, setHistoryLines] = useState([]);
  const [historyProgress, setHistoryProgress] = useState({ done: 0, total: 0 });

  // ✅ best practice: cache + abort for history fetch
  const historyCacheRef = useRef(new Map()); // key: `${shopId}|${date}`
  const historyAbortRef = useRef(null);
  const historyReqSeqRef = useRef(0);

  useEffect(() => {
    // clear cache when switching shop
    historyCacheRef.current = new Map();
  }, [shopId]);

  const resetPadToDefaults = () => {
    setPad({
      itemId: "",
      qtyUnits: 1,
      newUnitCost: "",
      newWholesalePerPiece: "",
      newRetailPerPiece: "",
    });
  };

  const cancelAnyEdit = () => {
    setEditingLineId(null);
    setEditingDbId(null);
    setEditingDbUiId(null);
    setSelectedLineId(null);
    resetPadToDefaults();
  };

  const scrollPadIntoView = () => {
    if (!padRef.current) return;
    padRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const reloadStockRows = async () => {
    try {
      const stockRes = await fetch(`${API_BASE}/stock/?shop_id=${shopId}`, {
        headers: authHeadersNoJson,
      });
      if (!stockRes.ok) return;
      const stockData = await stockRes.json();
      setStockRows(stockData || []);
    } catch (e) {
      // silent: stock is supportive data; don't break UX
      console.error("reloadStockRows failed:", e);
    }
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const shopRes = await fetch(`${API_BASE}/shops/${shopId}`, {
          headers: authHeadersNoJson,
        });
        if (!shopRes.ok) throw new Error("Failed to load shop.");
        const shopData = await shopRes.json();

        const stockRes = await fetch(`${API_BASE}/stock/?shop_id=${shopId}`, {
          headers: authHeadersNoJson,
        });
        if (!stockRes.ok) throw new Error("Failed to load stock.");
        const stockData = await stockRes.json();

        setShop(shopData);
        setStockRows(stockData || []);
      } catch (err) {
        console.error(err);
        setError(err?.message || "Failed to load shop and stock for this shop.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [shopId, authHeadersNoJson]);

  const stockByItemId = useMemo(() => {
    const map = {};
    for (const s of stockRows) map[s.item_id] = s;
    return map;
  }, [stockRows]);

  const shopName = shop?.name || `Shop ${shopId}`;

  // ✅ Items list for combobox
  const pickerItems = useMemo(
    () =>
      (stockRows || []).map((s) => ({
        id: s.item_id,
        label: s.item_name,
      })),
    [stockRows]
  );

  useEffect(() => {
    if (!stockRows.length) return;
    setPad((prev) => (prev.itemId ? prev : { ...prev, itemId: "" }));
  }, [stockRows]);

  const loadExistingLines = async () => {
    // ✅ IMPORTANT FIX: do NOT depend on stockRows length
    // (history items may exist even if stock endpoint doesn't return them)
    try {
      const iso = toISODate(purchaseDate);
      if (!iso) {
        setLines([]);
        return;
      }

      const url = `${API_BASE}/purchases/by-shop-date/?shop_id=${shopId}&purchase_date=${iso}`;
      const res = await fetch(url, { headers: authHeadersNoJson });
      if (!res.ok) {
        setLines([]);
        return;
      }
      const data = await res.json();

      const mapped = (data || []).map((pl) => {
        const fallbackWholesale = stockByItemId[pl.item_id]?.wholesale_price_per_piece || "";
        const fallbackRetail = stockByItemId[pl.item_id]?.selling_price_per_piece || "";
        return {
          id: `db-${pl.id}`,
          isFromDb: true,
          dbId: pl.id,
          itemId: pl.item_id,
          qtyUnits: pl.quantity,
          newUnitCost: pl.unit_cost_price,
          // ✅ prefer values from purchase line if backend provides them
          newWholesalePerPiece: pickLineWholesale(pl, fallbackWholesale),
          newRetailPerPiece: pickLineRetail(pl, fallbackRetail),
          purchaseDate: iso,
        };
      });

      setLines(mapped);
    } catch (err) {
      console.error("Error loading existing purchase lines:", err);
      // don't hard-fail UI
      setLines([]);
    }
  };

  useEffect(() => {
    loadExistingLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, purchaseDate, stockByItemId, authHeadersNoJson]);

  useEffect(() => {
    cancelAnyEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseDate]);

  const updatePad = (field, rawValue) => {
    setPad((prev) => {
      if (field === "itemId") {
        if (editingDbId !== null) return prev;

        if (rawValue === "") {
          return {
            ...prev,
            itemId: "",
            newUnitCost: "",
            newWholesalePerPiece: "",
            newRetailPerPiece: "",
          };
        }

        const itemId = Number(rawValue);
        const s = stockByItemId[itemId];

        return {
          ...prev,
          itemId,
          newUnitCost: s?.last_purchase_unit_price ?? "",
          newWholesalePerPiece: s?.wholesale_price_per_piece ?? "",
          newRetailPerPiece: s?.selling_price_per_piece ?? "",
        };
      }

      if (["qtyUnits", "newUnitCost", "newWholesalePerPiece", "newRetailPerPiece"].includes(field)) {
        const value = rawValue === "" ? "" : Number(rawValue);
        return { ...prev, [field]: value };
      }

      return { ...prev, [field]: rawValue };
    });
  };

  const startEditNewLine = (lineId) => {
    const baseLine = lines.find((l) => l.id === lineId);
    if (!baseLine || baseLine.isFromDb) return;

    setEditingDbId(null);
    setEditingDbUiId(null);

    setEditingLineId(lineId);
    setSelectedLineId(lineId);

    setPad({
      itemId: baseLine.itemId,
      qtyUnits: baseLine.qtyUnits,
      newUnitCost: baseLine.newUnitCost,
      newWholesalePerPiece: baseLine.newWholesalePerPiece,
      newRetailPerPiece: baseLine.newRetailPerPiece,
    });

    scrollPadIntoView();
  };

  const startEditSavedLine = (line) => {
    setSelectedLineId(line.id);

    setEditingLineId(null);
    setEditingDbId(line.dbId);
    setEditingDbUiId(line.id);

    setPad({
      itemId: line.itemId,
      qtyUnits: line.qtyUnits,
      newUnitCost: line.newUnitCost,
      newWholesalePerPiece: line.newWholesalePerPiece,
      newRetailPerPiece: line.newRetailPerPiece,
    });

    scrollPadIntoView();
  };

  const removeLine = (id) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
    if (editingLineId === id) {
      setEditingLineId(null);
      resetPadToDefaults();
    }
    if (selectedLineId === id) setSelectedLineId(null);
  };

  const deleteSavedLine = async (dbId) => {
    const ok = window.confirm(
      "Delete this saved purchase item?\n\nThis will reduce stock accordingly and cannot be undone."
    );
    if (!ok) return;

    setPadSaving(true);
    setError("");
    setMessage("");
    setHistoryError("");

    try {
      const res = await fetch(`${API_BASE}/purchases/lines/${dbId}`, {
        method: "DELETE",
        headers: authHeadersNoJson,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to delete line. Status: ${res.status}`);
      }

      await res.json().catch(() => null);

      // ✅ sync UI from backend after delete
      setMessage("Saved purchase line deleted and stock recalculated.");
      cancelAnyEdit();

      await reloadStockRows();
      await loadExistingLines();

      // refresh history
      setHistoryRefreshToken((x) => x + 1);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to delete saved line.");
      setMessage("");
    } finally {
      setPadSaving(false);
    }
  };

  const handleSubmitPad = async () => {
    const itemId = Number(pad.itemId || 0);
    if (!itemId) {
      setError("Select an item in the pad before saving.");
      return;
    }

    const qtyUnits = Number(pad.qtyUnits || 0);
    if (qtyUnits <= 0) {
      setError("Quantity (units) must be greater than zero.");
      return;
    }

    const newUnitCost = Number(pad.newUnitCost || 0);
    if (newUnitCost <= 0) {
      setError("Purchase cost (unit) must be greater than zero.");
      return;
    }

    setError("");
    setMessage("");

    if (editingDbId !== null) {
      setPadSaving(true);
      try {
        const payload = {
          quantity: qtyUnits,
          unit_cost_price: newUnitCost,
          wholesale_price_per_piece:
            pad.newWholesalePerPiece === "" || pad.newWholesalePerPiece == null
              ? null
              : Number(pad.newWholesalePerPiece),
          retail_price_per_piece:
            pad.newRetailPerPiece === "" || pad.newRetailPerPiece == null
              ? null
              : Number(pad.newRetailPerPiece),
        };

        const res = await fetch(`${API_BASE}/purchases/lines/${editingDbId}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.detail || `Failed to update saved line. Status: ${res.status}`);
        }

        await res.json().catch(() => null);

        // ✅ reload after update
        setMessage("Saved purchase line updated and stock recalculated.");
        await reloadStockRows();
        await loadExistingLines();

        cancelAnyEdit();
        scrollPadIntoView();

        setHistoryRefreshToken((x) => x + 1);
        return;
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to update saved purchase line.");
        setMessage("");
        return;
      } finally {
        setPadSaving(false);
      }
    }

    // new (unsaved) list item
    if (editingLineId === null) {
      setLines((prev) => [
        ...prev,
        {
          id: Date.now().toString() + Math.random().toString(16),
          isFromDb: false,
          itemId,
          qtyUnits,
          newUnitCost,
          newWholesalePerPiece: pad.newWholesalePerPiece || "",
          newRetailPerPiece: pad.newRetailPerPiece || "",
        },
      ]);
    } else {
      setLines((prev) =>
        prev.map((l) =>
          l.id === editingLineId
            ? {
                ...l,
                itemId,
                qtyUnits,
                newUnitCost,
                newWholesalePerPiece: pad.newWholesalePerPiece || "",
                newRetailPerPiece: pad.newRetailPerPiece || "",
              }
            : l
        )
      );
    }

    setEditingLineId(null);
    setSelectedLineId(null);
    resetPadToDefaults();
    scrollPadIntoView();
  };

  const linesWithComputed = useMemo(() => {
    return lines.map((line) => {
      const s = stockByItemId[line.itemId] || {};
      const piecesPerUnit = s.item_pieces_per_unit || 1;

      const recentUnitCost = Number(s.last_purchase_unit_price || 0);
      const recentWholesalePerPiece = Number(s.wholesale_price_per_piece || 0);
      const recentRetailPerPiece = Number(s.selling_price_per_piece || 0);

      const qtyUnits = Number(line.qtyUnits || 0);
      const newUnitCost = Number(line.newUnitCost || 0);

      const newCostPerPiece = piecesPerUnit > 0 ? newUnitCost / piecesPerUnit : 0;
      const lineTotal = qtyUnits * newUnitCost;
      const allPieces = qtyUnits * piecesPerUnit;

      return {
        ...line,
        meta: {
          itemName: s.item_name,
          category: s.item_category,
          piecesPerUnit,
          recentUnitCost,
          recentWholesalePerPiece,
          recentRetailPerPiece,
        },
        computed: {
          newCostPerPiece,
          lineTotal,
          allPieces,
        },
      };
    });
  }, [lines, stockByItemId]);

  const filteredLinesWithComputed = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return linesWithComputed;
    return linesWithComputed.filter((line) => {
      const name = (line.meta.itemName || "").toLowerCase();
      return name.includes(term);
    });
  }, [linesWithComputed, searchTerm]);

  const purchaseTotal = useMemo(() => {
    return linesWithComputed.reduce((sum, line) => sum + (line.computed.lineTotal || 0), 0);
  }, [linesWithComputed]);

  const padStock = pad.itemId ? stockByItemId[pad.itemId] : null;
  const padPiecesPerUnit = padStock?.item_pieces_per_unit || 1;
  const padPurchaseCostPerPiece =
    pad.itemId && padPiecesPerUnit > 0 ? Number(pad.newUnitCost || 0) / padPiecesPerUnit : 0;

  // -------------------- TAB 2: HISTORY LOADER --------------------
  const loadHistoryRangeLines = async () => {
    // abort previous
    if (historyAbortRef.current) {
      try {
        historyAbortRef.current.abort();
      } catch {}
    }
    const controller = new AbortController();
    historyAbortRef.current = controller;

    const mySeq = ++historyReqSeqRef.current;

    setHistoryLoading(true);
    setHistoryError("");
    setHistoryHint("");
    setHistoryProgress({ done: 0, total: 0 });

    try {
      const fromISO = toISODate(historyFrom);
      const toISO = toISODate(historyTo);

      const chk = listDaysInclusive(fromISO, toISO, 366);
      if (!chk.ok) {
        setHistoryLines([]);
        setHistoryError(chk.error);
        return;
      }

      if (chk.daysCount > 93) {
        setHistoryHint(`Large range (${chk.daysCount} days). It may be slower. Tip: use Last 30d.`);
      }

      const days = chk.days;
      setHistoryProgress({ done: 0, total: days.length });

      const CONCURRENCY = 8;
      const collected = [];

      for (let i = 0; i < days.length; i += CONCURRENCY) {
        if (controller.signal.aborted) return;
        if (historyReqSeqRef.current !== mySeq) return;

        const chunk = days.slice(i, i + CONCURRENCY);

        // eslint-disable-next-line no-await-in-loop
        const results = await Promise.all(
          chunk.map(async (d) => {
            const cacheKey = `${shopId}|${d}`;
            const cached = historyCacheRef.current.get(cacheKey);
            if (cached) return cached;

            const url = `${API_BASE}/purchases/by-shop-date/?shop_id=${shopId}&purchase_date=${d}`;
            const res = await fetch(url, {
              headers: authHeadersNoJson,
              signal: controller.signal,
            });
            if (!res.ok) {
              historyCacheRef.current.set(cacheKey, []);
              return [];
            }
            const data = await res.json().catch(() => []);
            if (!Array.isArray(data)) {
              historyCacheRef.current.set(cacheKey, []);
              return [];
            }

            const mapped = data.map((pl) => {
              const fallbackWholesale = stockByItemId[pl.item_id]?.wholesale_price_per_piece || "";
              const fallbackRetail = stockByItemId[pl.item_id]?.selling_price_per_piece || "";
              return {
                id: `h-db-${pl.id}`,
                isFromDb: true,
                dbId: pl.id,
                itemId: pl.item_id,
                qtyUnits: pl.quantity,
                newUnitCost: pl.unit_cost_price,
                newWholesalePerPiece: pickLineWholesale(pl, fallbackWholesale),
                newRetailPerPiece: pickLineRetail(pl, fallbackRetail),
                purchaseDate: d,
              };
            });

            historyCacheRef.current.set(cacheKey, mapped);
            return mapped;
          })
        );

        for (const arr of results) collected.push(...arr);

        setHistoryProgress((p) => ({
          done: Math.min(p.total, p.done + chunk.length),
          total: p.total,
        }));
      }

      collected.sort((a, b) => {
        const da = String(a.purchaseDate || "");
        const db = String(b.purchaseDate || "");
        if (da !== db) return db.localeCompare(da);
        return Number(b.dbId || 0) - Number(a.dbId || 0);
      });

      if (controller.signal.aborted) return;
      if (historyReqSeqRef.current !== mySeq) return;

      setHistoryLines(collected);
    } catch (e) {
      if (String(e?.name || "") === "AbortError") return;
      console.error(e);
      setHistoryLines([]);
      setHistoryError(e?.message || "Failed to load history.");
    } finally {
      if (historyReqSeqRef.current === mySeq) {
        setHistoryLoading(false);
      }
    }
  };

  useEffect(() => {
    if (activeTab !== 2) return;
    // ✅ IMPORTANT FIX: do NOT block history when stockRows is empty
    loadHistoryRangeLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, historyRunToken, historyRefreshToken]);

  const historyLinesWithComputed = useMemo(() => {
    return historyLines.map((line) => {
      const s = stockByItemId[line.itemId] || {};
      const piecesPerUnit = s.item_pieces_per_unit || 1;

      const recentUnitCost = Number(s.last_purchase_unit_price || 0);
      const recentWholesalePerPiece = Number(s.wholesale_price_per_piece || 0);
      const recentRetailPerPiece = Number(s.selling_price_per_piece || 0);

      const qtyUnits = Number(line.qtyUnits || 0);
      const newUnitCost = Number(line.newUnitCost || 0);

      const newCostPerPiece = piecesPerUnit > 0 ? newUnitCost / piecesPerUnit : 0;
      const lineTotal = qtyUnits * newUnitCost;
      const allPieces = qtyUnits * piecesPerUnit;

      return {
        ...line,
        meta: {
          itemName: s.item_name,
          category: s.item_category,
          piecesPerUnit,
          recentUnitCost,
          recentWholesalePerPiece,
          recentRetailPerPiece,
        },
        computed: {
          newCostPerPiece,
          lineTotal,
          allPieces,
        },
      };
    });
  }, [historyLines, stockByItemId]);

  const filteredHistoryLinesWithComputed = useMemo(() => {
    const term = historySearchTerm.trim().toLowerCase();
    if (!term) return historyLinesWithComputed;
    return historyLinesWithComputed.filter((line) => {
      const name = (line.meta.itemName || "").toLowerCase();
      return name.includes(term) || String(line.purchaseDate || "").includes(term);
    });
  }, [historyLinesWithComputed, historySearchTerm]);

  const openHistoryLineForEdit = (line) => {
    const d = line.purchaseDate || "";
    if (d) setPurchaseDate(d);
    setActiveTab(1);
    setMessage("");
    setError("");
    setHistoryError("");
  };

  const handleSave = async () => {
    const newLinesForSave = linesWithComputed.filter((l) => !l.isFromDb);

    if (!newLinesForSave.length) {
      setMessage("");
      setError("No new items to save for this date.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        shop_id: Number(shopId),
        purchase_date: toISODate(purchaseDate),
        supplier_name: supplierName || null,
        invoice_number: invoiceNumber || null,
        lines: newLinesForSave.map((l) => ({
          item_id: l.itemId,
          quantity: Number(l.qtyUnits || 0),
          unit_cost_price: Number(l.newUnitCost || 0),
          wholesale_price_per_piece:
            l.newWholesalePerPiece === "" || l.newWholesalePerPiece == null ? null : Number(l.newWholesalePerPiece),
          retail_price_per_piece:
            l.newRetailPerPiece === "" || l.newRetailPerPiece == null ? null : Number(l.newRetailPerPiece),
        })),
      };

      const res = await fetch(`${API_BASE}/purchases/`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to save purchase. Status: ${res.status}`);
      }

      await res.json().catch(() => null);

      setMessage("Purchase saved and stock updated successfully.");
      setError("");

      // ✅ KEY FIX: reload from backend (Tab 1 shows DB lines immediately)
      cancelAnyEdit();
      resetPadToDefaults();

      await reloadStockRows();
      await loadExistingLines();

      // refresh history (Tab2)
      setHistoryRefreshToken((x) => x + 1);

      // keep Tab2 aligned
      const base = toISODate(purchaseDate) || todayISO();
      setHistoryFrom(addDaysISO(base, -30));
      setHistoryTo(base);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save purchase.");
      setMessage("");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "32px" }}>
        <p>Loading purchases page...</p>
      </div>
    );
  }

  if (error && !lines.length && !message) {
    return (
      <div style={{ padding: "32px", color: "red" }}>
        <p>{error}</p>
      </div>
    );
  }

  const padDark = false;
  const padBg = padDark ? "#0b1220" : "#ffffff";
  const padText = padDark ? "#e5e7eb" : "#111827";
  const padMuted = padDark ? "#9ca3af" : "#6b7280";
  const padBorder = padDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid #e5e7eb";

  const inputBase = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    fontSize: "13px",
    outline: "none",
    backgroundColor: "#ffffff",
    color: "#111827",
  };

  const labelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: 700,
    color: padText,
    marginBottom: "6px",
  };

  const helperGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    columnGap: "14px",
    rowGap: "6px",
    marginTop: "8px",
    fontSize: "12px",
    color: padMuted,
    alignItems: "center",
  };

  const isEditingSaved = editingDbId !== null;
  const isEditingNew = editingLineId !== null;

  const padTitle = isEditingSaved
    ? "Edit saved item (updates database)"
    : isEditingNew
    ? "Edit new item, then click Update item to save changes"
    : "Pad: select item, set prices, then add to list";

  const padButtonText = isEditingSaved ? "Update saved item" : isEditingNew ? "Update item" : "+ Add to list";

  const tabBtn = (active) => ({
    padding: "8px 12px",
    borderRadius: "999px",
    border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
    background: active ? "#eff6ff" : "#ffffff",
    color: active ? "#1d4ed8" : "#111827",
    fontWeight: 800,
    fontSize: "12px",
    cursor: "pointer",
  });

  return (
    <div style={{ padding: "16px 24px 24px" }}>
      {/* Header */}
      <div
        ref={headerRef}
        style={{
          position: HEADER_IS_STICKY ? "sticky" : "static",
          top: HEADER_IS_STICKY ? 0 : undefined,
          zIndex: 15,
          paddingBottom: "8px",
          marginBottom: "8px",
          background: "linear-gradient(to bottom, #f3f4f6 0%, #f3f4f6 65%, rgba(243,244,246,0) 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "6px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <button
              onClick={() => navigate(`/shops/${shopId}`)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                marginBottom: "6px",
                fontSize: "12px",
                color: "#2563eb",
                cursor: "pointer",
              }}
            >
              ← Back to shop workspace
            </button>

            <h1 style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "0.03em", margin: 0 }}>Purchases</h1>
            <div style={{ marginTop: "2px", fontSize: "13px", fontWeight: 600, color: "#2563eb" }}>{shopName}</div>

            {/* Tabs */}
            <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                style={tabBtn(activeTab === 1)}
                onClick={() => {
                  setActiveTab(1);
                  setHistoryError("");
                  setHistoryHint("");
                }}
              >
                Tab 1: Purchase entry
              </button>
              <button
                type="button"
                style={tabBtn(activeTab === 2)}
                onClick={() => {
                  setActiveTab(2);
                  setError("");
                  setMessage("");
                  setHistoryError("");
                  setHistoryHint("");

                  if (!historyInitialized) {
                    const base = toISODate(purchaseDate) || todayISO();
                    setHistoryFrom(addDaysISO(base, -30));
                    setHistoryTo(base);
                    setHistoryRunToken((x) => x + 1);
                    setHistoryInitialized(true);
                  }
                }}
              >
                Tab 2: History (date range)
              </button>
            </div>
          </div>

          <div
            style={{
              minWidth: "260px",
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              padding: "10px 14px",
              boxShadow: "0 6px 18px rgba(15,37,128,0.06)",
              display: "grid",
              gridTemplateColumns: "1fr",
              rowGap: "2px",
              fontSize: "12px",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Purchase summary</div>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.14em", color: "#9ca3af", marginBottom: "4px" }}>
              All items on {toISODate(purchaseDate) || purchaseDate}
            </div>
            <div>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280" }}>Total amount</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#111827" }}>{formatMoney(purchaseTotal)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0, 1fr) 220px", gap: "12px", marginBottom: "8px" }}>
          <input
            type="date"
            value={toISODate(purchaseDate)}
            onChange={(e) => setPurchaseDate(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
          />
          <input
            type="text"
            placeholder="Supplier name (optional)"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
          />
          <input
            type="text"
            placeholder="Invoice number (optional)"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
          />
        </div>
      </div>

      {(message || error || historyError || historyHint) && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.6rem 0.8rem",
            borderRadius: "0.75rem",
            backgroundColor: error || historyError ? "#fef2f2" : historyHint ? "#fffbeb" : "#ecfdf3",
            color: error || historyError ? "#b91c1c" : historyHint ? "#92400e" : "#166534",
            fontSize: "0.9rem",
          }}
        >
          {error || historyError || historyHint || message}
        </div>
      )}

      {/* ======================= TAB 1 (unchanged UI) ======================= */}
      {activeTab === 1 && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: "16px 18px 14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
                Items purchased on {toISODate(purchaseDate) || purchaseDate}
              </h2>
            </div>
          </div>

          {/* PAD */}
          <div
            ref={padRef}
            style={{
              marginBottom: "12px",
              padding: "14px 14px 16px",
              borderRadius: "18px",
              background: padBg,
              border: padBorder,
              color: padText,
              scrollMarginTop: HEADER_IS_STICKY ? `${headerHeight + 12}px` : "12px",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
              <span>{padTitle}</span>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {(isEditingNew || isEditingSaved) && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelAnyEdit();
                      scrollPadIntoView();
                    }}
                    disabled={padSaving}
                    style={{
                      padding: "0.4rem 1rem",
                      borderRadius: "9999px",
                      border: "1px solid #d1d5db",
                      backgroundColor: "#ffffff",
                      color: "#111827",
                      fontSize: "0.8rem",
                      cursor: padSaving ? "not-allowed" : "pointer",
                      opacity: padSaving ? 0.7 : 1,
                    }}
                  >
                    Cancel edit
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSubmitPad}
                  disabled={padSaving}
                  style={{
                    padding: "0.55rem 1.3rem",
                    borderRadius: "9999px",
                    border: "none",
                    backgroundColor: "#2563eb",
                    color: "white",
                    fontWeight: 800,
                    fontSize: "0.9rem",
                    cursor: padSaving ? "not-allowed" : "pointer",
                    opacity: padSaving ? 0.8 : 1,
                  }}
                >
                  {padSaving ? "Updating..." : padButtonText}
                </button>
              </div>
            </div>

            {isEditingSaved && (
              <div style={{ marginBottom: "10px", padding: "8px 10px", borderRadius: "12px", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", fontSize: "12px", lineHeight: 1.35 }}>
                Note: Item cannot be changed when editing a saved line. If you need a different item, delete the saved line and add a new one.
              </div>
            )}

            {/* ITEM */}
            <div>
              <label style={labelStyle}>Item</label>
              <ItemComboBox
                items={pickerItems}
                valueId={pad.itemId === "" ? "" : String(pad.itemId)}
                onChangeId={(idStr) => updatePad("itemId", idStr)}
                disabled={isEditingSaved}
              />

              <div style={helperGridStyle}>
                <div>
                  Pieces / unit: <strong style={{ color: padText }}>{padStock ? padPiecesPerUnit : "—"}</strong>
                </div>
                <div>
                  Recent unit cost: <strong style={{ color: padText }}>{padStock ? formatMoney(padStock.last_purchase_unit_price || 0) : "—"}</strong>
                </div>
                <div>
                  Recent wholesale / piece: <strong style={{ color: padText }}>{padStock ? formatMoney(padStock.wholesale_price_per_piece || 0) : "—"}</strong>
                </div>
                <div>
                  Recent retail / piece: <strong style={{ color: padText }}>{padStock ? formatMoney(padStock.selling_price_per_piece || 0) : "—"}</strong>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: "12px",
                display: "grid",
                gridTemplateColumns: "140px minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr)",
                gap: "12px",
                alignItems: "end",
              }}
            >
              <div>
                <label style={labelStyle}>Qty units</label>
                <input type="number" min={0.01} step="0.01" value={pad.qtyUnits} onChange={(e) => updatePad("qtyUnits", e.target.value)} style={inputBase} />
              </div>

              <div>
                <label style={labelStyle}>Purchase cost (unit)</label>
                <input type="number" value={pad.newUnitCost} onChange={(e) => updatePad("newUnitCost", e.target.value)} placeholder="0" style={inputBase} />
              </div>

              <div>
                <label style={labelStyle}>Purchase cost / piece</label>
                <input type="text" readOnly value={pad.itemId ? formatMoney(padPurchaseCostPerPiece) : ""} placeholder="—" style={{ ...inputBase, backgroundColor: "#f3f4f6", fontWeight: 800 }} />
              </div>

              <div>
                <label style={labelStyle}>New wholesale / piece</label>
                <input type="number" value={pad.newWholesalePerPiece} onChange={(e) => updatePad("newWholesalePerPiece", e.target.value)} placeholder="0" style={inputBase} />
              </div>

              <div>
                <label style={labelStyle}>New retail / piece</label>
                <input type="number" value={pad.newRetailPerPiece} onChange={(e) => updatePad("newRetailPerPiece", e.target.value)} placeholder="0" style={inputBase} />
              </div>
            </div>
          </div>

          {/* LIST (kept) */}
          {linesWithComputed.length === 0 ? (
            <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
              No items in this purchase date yet. Use the pad above and click <strong>{padButtonText}</strong>.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", marginTop: "2px" }}>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                  Items for {toISODate(purchaseDate) || purchaseDate}: {linesWithComputed.length}{" "}
                  {searchTerm ? `(showing ${filteredLinesWithComputed.length} after filter)` : ""}
                </div>
                <input
                  type="text"
                  placeholder="Search in items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ width: "240px", padding: "6px 10px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "12px" }}
                />
              </div>

              <div style={{ maxHeight: "420px", overflowY: "auto", overflowX: "auto", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "0 8px 4px 0", backgroundColor: "#fcfcff" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: PURCHASE_GRID_COLUMNS,
                    minWidth: "1260px",
                    alignItems: "center",
                    padding: "6px 4px 6px 8px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#6b7280",
                    fontWeight: 600,
                    position: "sticky",
                    top: 0,
                    backgroundColor: "#f9fafb",
                    zIndex: 5,
                  }}
                >
                  <div>Item</div>
                  <div style={{ textAlign: "center" }}>Qty units</div>
                  <div style={{ textAlign: "center" }}>Pieces / unit</div>
                  <div style={{ textAlign: "center" }}>All pieces</div>
                  <div style={{ textAlign: "right" }}>Recent cost/unit</div>
                  <div style={{ textAlign: "right" }}>New cost/unit</div>
                  <div style={{ textAlign: "right" }}>Cost / piece</div>
                  <div style={{ textAlign: "right" }}>Recent wholesale</div>
                  <div style={{ textAlign: "right" }}>New wholesale</div>
                  <div style={{ textAlign: "right" }}>Recent retail</div>
                  <div style={{ textAlign: "right" }}>New retail</div>
                  <div style={{ textAlign: "right" }}>Line total</div>
                  <div></div>
                </div>

                {filteredLinesWithComputed.map((line) => {
                  const { meta, computed } = line;
                  const { itemName, piecesPerUnit, recentUnitCost, recentWholesalePerPiece, recentRetailPerPiece } = meta;
                  const { newCostPerPiece, lineTotal, allPieces } = computed;

                  const isFromDb = line.isFromDb;
                  const isSelected = selectedLineId === line.id;
                  const isEditingThisSaved = isFromDb && editingDbUiId === line.id;

                  return (
                    <div
                      key={line.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: PURCHASE_GRID_COLUMNS,
                        minWidth: "1260px",
                        alignItems: "center",
                        padding: "8px 4px 8px 8px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: "13px",
                        backgroundColor: isSelected ? "#eff6ff" : "transparent",
                      }}
                    >
                      <div>
                        {isFromDb ? (
                          <button
                            type="button"
                            onClick={() => startEditSavedLine(line)}
                            style={{ padding: 0, margin: 0, border: "none", background: "transparent", color: "#111827", fontWeight: 700, fontSize: "13px", cursor: "pointer", textAlign: "left" }}
                            title="Edit saved purchase line"
                          >
                            {itemName || `Item ${line.itemId}`}{" "}
                            {isEditingThisSaved ? <span style={{ color: "#2563eb", fontWeight: 800, marginLeft: 6 }}>(editing)</span> : null}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditNewLine(line.id)}
                            style={{ padding: 0, margin: 0, border: "none", background: "transparent", color: "#2563eb", fontWeight: 600, fontSize: "13px", cursor: "pointer", textAlign: "left" }}
                            title="Edit new (unsaved) line"
                          >
                            {itemName || `Item ${line.itemId}`}
                          </button>
                        )}
                      </div>

                      <div style={{ textAlign: "center" }}>{formatQty(line.qtyUnits)}</div>
                      <div style={{ textAlign: "center" }}>{formatQty(piecesPerUnit)}</div>
                      <div style={{ textAlign: "center" }}>{formatQty(allPieces)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(recentUnitCost)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(line.newUnitCost)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(newCostPerPiece)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(recentWholesalePerPiece)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(line.newWholesalePerPiece)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(recentRetailPerPiece)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(line.newRetailPerPiece)}</div>
                      <div style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(lineTotal)}</div>

                      <div style={{ textAlign: "center" }}>
                        {isFromDb ? (
                          <button
                            type="button"
                            onClick={() => deleteSavedLine(line.dbId)}
                            disabled={padSaving}
                            title="Delete saved line"
                            style={{ width: "28px", height: "28px", borderRadius: "9999px", border: "1px solid #fee2e2", backgroundColor: "#fef2f2", color: "#b91c1c", fontSize: "14px", cursor: padSaving ? "not-allowed" : "pointer", opacity: padSaving ? 0.7 : 1 }}
                          >
                            🗑
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            style={{ width: "28px", height: "28px", borderRadius: "9999px", border: "1px solid #fee2e2", backgroundColor: "#fef2f2", color: "#b91c1c", fontSize: "16px", cursor: "pointer" }}
                            title="Remove new line (not saved yet)"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "14px" }}>
            <button
              type="button"
              onClick={() => navigate(`/shops/${shopId}/stock`)}
              style={{ padding: "0.6rem 1.4rem", borderRadius: "999px", border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#111827", fontWeight: 600, fontSize: "0.95rem", cursor: "pointer" }}
            >
              View stock
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "0.6rem 1.8rem", borderRadius: "999px", border: "none", backgroundColor: saving ? "#2563eb99" : "#2563eb", color: "white", fontWeight: 700, fontSize: "0.95rem", cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Saving..." : "Save purchase"}
            </button>
          </div>
        </div>
      )}

      {/* ======================= TAB 2 (History) ======================= */}
      {activeTab === 2 && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: "16px 18px 14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "end" }}>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>Purchase history (saved lines)</h2>
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 4 }}>
                Click an item to open its date in Tab 1 and edit inline.
              </div>
              {historyLoading && historyProgress.total > 0 && (
                <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 6 }}>
                  Loading days: {historyProgress.done}/{historyProgress.total}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "end" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>From</div>
                <input
                  type="date"
                  value={toISODate(historyFrom)}
                  onChange={(e) => setHistoryFrom(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
                />
              </div>

              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>To</div>
                <input
                  type="date"
                  value={toISODate(historyTo)}
                  onChange={(e) => setHistoryTo(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
                />
              </div>

              <button
                type="button"
                onClick={() => setHistoryRunToken((x) => x + 1)}
                style={{
                  padding: "0.55rem 1.2rem",
                  borderRadius: "9999px",
                  border: "none",
                  backgroundColor: "#111827",
                  color: "white",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  height: 40,
                }}
              >
                {historyLoading ? "Loading..." : "Apply"}
              </button>

              <button
                type="button"
                onClick={() => {
                  const t = todayISO();
                  setHistoryFrom(t);
                  setHistoryTo(t);
                  setHistoryRunToken((x) => x + 1);
                }}
                style={{ padding: "0.5rem 1rem", borderRadius: "9999px", border: "1px solid #d1d5db", backgroundColor: "#ffffff", fontWeight: 800, fontSize: "0.85rem", cursor: "pointer", height: 40 }}
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => {
                  const t = todayISO();
                  setHistoryFrom(addDaysISO(t, -7));
                  setHistoryTo(t);
                  setHistoryRunToken((x) => x + 1);
                }}
                style={{ padding: "0.5rem 1rem", borderRadius: "9999px", border: "1px solid #d1d5db", backgroundColor: "#ffffff", fontWeight: 800, fontSize: "0.85rem", cursor: "pointer", height: 40 }}
              >
                Last 7d
              </button>

              <button
                type="button"
                onClick={() => {
                  const t = todayISO();
                  setHistoryFrom(addDaysISO(t, -30));
                  setHistoryTo(t);
                  setHistoryRunToken((x) => x + 1);
                }}
                style={{ padding: "0.5rem 1rem", borderRadius: "9999px", border: "1px solid #d1d5db", backgroundColor: "#ffffff", fontWeight: 800, fontSize: "0.85rem", cursor: "pointer", height: 40 }}
              >
                Last 30d
              </button>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <input
              type="text"
              placeholder="Search item or date…"
              value={historySearchTerm}
              onChange={(e) => setHistorySearchTerm(e.target.value)}
              style={{ width: "260px", padding: "6px 10px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "12px" }}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            {historyLoading ? (
              <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>Loading history…</div>
            ) : filteredHistoryLinesWithComputed.length === 0 ? (
              <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
                No saved purchase lines in this date range.
              </div>
            ) : (
              <div style={{ maxHeight: "520px", overflowY: "auto", overflowX: "auto", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "0 8px 4px 0", backgroundColor: "#fcfcff" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: PURCHASE_GRID_COLUMNS,
                    minWidth: "1260px",
                    alignItems: "center",
                    padding: "6px 4px 6px 8px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#6b7280",
                    fontWeight: 600,
                    position: "sticky",
                    top: 0,
                    backgroundColor: "#f9fafb",
                    zIndex: 5,
                  }}
                >
                  <div>Item</div>
                  <div style={{ textAlign: "center" }}>Qty units</div>
                  <div style={{ textAlign: "center" }}>Pieces / unit</div>
                  <div style={{ textAlign: "center" }}>All pieces</div>
                  <div style={{ textAlign: "right" }}>Recent cost/unit</div>
                  <div style={{ textAlign: "right" }}>New cost/unit</div>
                  <div style={{ textAlign: "right" }}>Cost / piece</div>
                  <div style={{ textAlign: "right" }}>Recent wholesale</div>
                  <div style={{ textAlign: "right" }}>New wholesale</div>
                  <div style={{ textAlign: "right" }}>Recent retail</div>
                  <div style={{ textAlign: "right" }}>New retail</div>
                  <div style={{ textAlign: "right" }}>Line total</div>
                  <div></div>
                </div>

                {filteredHistoryLinesWithComputed.map((line) => {
                  const { meta, computed } = line;
                  const { itemName, piecesPerUnit, recentUnitCost, recentWholesalePerPiece, recentRetailPerPiece } = meta;
                  const { newCostPerPiece, lineTotal, allPieces } = computed;

                  return (
                    <div
                      key={line.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: PURCHASE_GRID_COLUMNS,
                        minWidth: "1260px",
                        alignItems: "center",
                        padding: "8px 4px 8px 8px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: "13px",
                      }}
                    >
                      <div>
                        <button
                          type="button"
                          onClick={() => openHistoryLineForEdit(line)}
                          style={{ padding: 0, margin: 0, border: "none", background: "transparent", color: "#111827", fontWeight: 700, fontSize: "13px", cursor: "pointer", textAlign: "left" }}
                          title="Open this date in Tab 1"
                        >
                          {itemName || `Item ${line.itemId}`}
                        </button>
                        <div style={{ fontSize: "11px", color: "#6b7280", marginTop: 2 }}>
                          Date: {line.purchaseDate}
                        </div>
                      </div>

                      <div style={{ textAlign: "center" }}>{formatQty(line.qtyUnits)}</div>
                      <div style={{ textAlign: "center" }}>{formatQty(piecesPerUnit)}</div>
                      <div style={{ textAlign: "center" }}>{formatQty(allPieces)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(recentUnitCost)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(line.newUnitCost)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(newCostPerPiece)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(recentWholesalePerPiece)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(line.newWholesalePerPiece)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(recentRetailPerPiece)}</div>
                      <div style={{ textAlign: "right" }}>{formatMoney(line.newRetailPerPiece)}</div>
                      <div style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(lineTotal)}</div>

                      <div style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => deleteSavedLine(line.dbId)}
                          disabled={padSaving}
                          title="Delete saved line"
                          style={{ width: "28px", height: "28px", borderRadius: "9999px", border: "1px solid #fee2e2", backgroundColor: "#fef2f2", color: "#b91c1c", fontSize: "14px", cursor: padSaving ? "not-allowed" : "pointer", opacity: padSaving ? 0.7 : 1 }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ShopPurchasesPage;
