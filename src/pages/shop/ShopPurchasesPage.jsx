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

// ✅ Display-only date format: DD / MM / YY (keeps inputs + API as YYYY-MM-DD)
function formatDateDMY(iso) {
  if (!iso) return "";
  const s = String(iso);
  const base = s.includes("T") ? s.split("T")[0] : s;
  const m = base.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  const yy = m[1].slice(-2);
  const mm = m[2];
  const dd = m[3];
  return `${dd} / ${mm} / ${yy}`;
}

/**
 * ✅ Mobile-friendly searchable dropdown:
 * - type to search (keyboard appears on phone)
 * - scroll list below
 * - click to select
 */
function ItemComboBox({ items, valueId, onChangeId, disabled }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(() => {
    if (!valueId) return null;
    return items.find((it) => String(it.id) === String(valueId)) || null;
  }, [items, valueId]);

  // Keep input text aligned with selected item when dropdown closes
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

  // Close on outside click
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
          value={disabled ? (selected?.label || "") : q}
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

// --- helpers for view tabs (best-effort supplier extraction) ---
function _readSupplierNameFromApi(obj) {
  if (!obj) return null;
  return (
    obj.supplier_name ||
    obj.supplierName ||
    obj.supplier ||
    obj.vendor_name ||
    obj.vendorName ||
    obj.purchase_supplier_name ||
    obj.purchaseSupplierName ||
    obj?.purchase?.supplier_name ||
    obj?.purchase?.supplierName ||
    null
  );
}

function _readInvoiceFromApi(obj) {
  if (!obj) return null;
  return (
    obj.invoice_number ||
    obj.invoiceNumber ||
    obj.invoice ||
    obj.purchase_invoice_number ||
    obj?.purchase?.invoice_number ||
    null
  );
}

function _safeIsoDate(d) {
  try {
    if (!d) return null;
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    if (typeof d === "string" && d.includes("T")) return d.split("T")[0];
    return String(d).slice(0, 10);
  } catch {
    return null;
  }
}

function _utcDateFromISO(iso) {
  const [y, m, d] = String(iso).split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function _isoFromUTCDate(dt) {
  return dt.toISOString().slice(0, 10);
}

function _enumerateISODateRange(fromISO, toISO, maxDays = 62) {
  const from = _utcDateFromISO(fromISO);
  const to = _utcDateFromISO(toISO);
  if (!from || !to) return { dates: [], error: "Invalid date range." };

  let start = from;
  let end = to;
  if (start.getTime() > end.getTime()) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  const dates = [];
  let cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    dates.push(_isoFromUTCDate(cur));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
    if (dates.length > maxDays) {
      return {
        dates: [],
        error: `Date range too large. Please select at most ${maxDays} days.`,
      };
    }
  }
  return { dates, error: "" };
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

  const [activeTab, setActiveTab] = useState("entry"); // "entry" | "supplier" | "date"

  const [shop, setShop] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
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

  const [viewDate, setViewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [viewFromDate, setViewFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [viewToDate, setViewToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [viewLinesRaw, setViewLinesRaw] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");
  const [viewSearch, setViewSearch] = useState("");

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

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const shopRes = await fetch(`${API_BASE}/shops/${shopId}`, { headers: authHeadersNoJson });
        if (!shopRes.ok) throw new Error("Failed to load shop.");
        const shopData = await shopRes.json();

        const stockRes = await fetch(`${API_BASE}/stock/?shop_id=${shopId}`, { headers: authHeadersNoJson });
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

  // ✅ Items list for combobox (HOOK SAFE)
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
    if (!stockRows.length) {
      setLines([]);
      return;
    }

    try {
      const url = `${API_BASE}/purchases/by-shop-date/?shop_id=${shopId}&purchase_date=${purchaseDate}`;
      const res = await fetch(url, { headers: authHeadersNoJson });
      if (!res.ok) return;
      const data = await res.json();

      const mapped = (data || []).map((pl) => {
        const s = stockByItemId[pl.item_id] || {};
        return {
          id: `db-${pl.id}`,
          isFromDb: true,
          dbId: pl.id,
          itemId: pl.item_id,
          qtyUnits: pl.quantity,
          newUnitCost: pl.unit_cost_price,

          // ✅ KEEP "new vs recent" correctly: prefer values from purchase line if backend returns them
          newWholesalePerPiece:
            pl.wholesale_price_per_piece ?? pl.wholesale ?? pl.new_wholesale_per_piece ?? s.wholesale_price_per_piece ?? "",
          newRetailPerPiece:
            pl.retail_price_per_piece ?? pl.retail ?? pl.new_retail_per_piece ?? s.selling_price_per_piece ?? "",

          supplierName: _readSupplierNameFromApi(pl) || null,
          invoiceNumber: _readInvoiceFromApi(pl) || null,
          purchaseDate: _safeIsoDate(pl.purchase_date || pl.date || purchaseDate) || purchaseDate,
        };
      });

      setLines(mapped);
    } catch (err) {
      console.error("Error loading existing purchase lines:", err);
    }
  };

  useEffect(() => {
    loadExistingLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, purchaseDate, stockRows, stockByItemId]);

  useEffect(() => {
    cancelAnyEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseDate]);

  const loadViewLinesForDate = async (dateStr) => {
    if (!stockRows.length) {
      setViewLinesRaw([]);
      return;
    }

    setViewLoading(true);
    setViewError("");
    try {
      const url = `${API_BASE}/purchases/by-shop-date/?shop_id=${shopId}&purchase_date=${dateStr}`;
      const res = await fetch(url, { headers: authHeadersNoJson });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to load purchases. Status: ${res.status}`);
      }
      const data = await res.json();

      const normalized = (data || []).map((pl) => ({
        id: `view-db-${pl.id}`,
        dbId: pl.id,
        itemId: pl.item_id,
        qtyUnits: pl.quantity,
        newUnitCost: pl.unit_cost_price,

        // ✅ restore new prices in view tabs too
        newWholesalePerPiece: pl.wholesale_price_per_piece ?? pl.wholesale ?? pl.new_wholesale_per_piece ?? null,
        newRetailPerPiece: pl.retail_price_per_piece ?? pl.retail ?? pl.new_retail_per_piece ?? null,

        supplierName: _readSupplierNameFromApi(pl) || null,
        invoiceNumber: _readInvoiceFromApi(pl) || null,
        purchaseDate: _safeIsoDate(pl.purchase_date || pl.date || dateStr) || dateStr,
      }));

      setViewLinesRaw(normalized);
    } catch (err) {
      console.error(err);
      setViewError(err?.message || "Failed to load purchases.");
      setViewLinesRaw([]);
    } finally {
      setViewLoading(false);
    }
  };

  const loadViewLinesForRange = async (fromISO, toISO) => {
    if (!stockRows.length) {
      setViewLinesRaw([]);
      return;
    }

    const { dates, error: rangeErr } = _enumerateISODateRange(fromISO, toISO, 62);
    if (rangeErr) {
      setViewError(rangeErr);
      setViewLinesRaw([]);
      return;
    }

    setViewLoading(true);
    setViewError("");

    try {
      const all = [];
      for (const d of dates) {
        const url = `${API_BASE}/purchases/by-shop-date/?shop_id=${shopId}&purchase_date=${d}`;
        const res = await fetch(url, { headers: authHeadersNoJson });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.detail || `Failed to load purchases for ${d}. Status: ${res.status}`);
        }
        const data = await res.json();

        for (const pl of data || []) {
          all.push({
            id: `view-db-${pl.id}`,
            dbId: pl.id,
            itemId: pl.item_id,
            qtyUnits: pl.quantity,
            newUnitCost: pl.unit_cost_price,

            // ✅ restore new prices in range view too
            newWholesalePerPiece: pl.wholesale_price_per_piece ?? pl.wholesale ?? pl.new_wholesale_per_piece ?? null,
            newRetailPerPiece: pl.retail_price_per_piece ?? pl.retail ?? pl.new_retail_per_piece ?? null,

            supplierName: _readSupplierNameFromApi(pl) || null,
            invoiceNumber: _readInvoiceFromApi(pl) || null,
            purchaseDate: _safeIsoDate(pl.purchase_date || pl.date || d) || d,
          });
        }
      }

      setViewLinesRaw(all);
    } catch (err) {
      console.error(err);
      setViewError(err?.message || "Failed to load purchases for range.");
      setViewLinesRaw([]);
    } finally {
      setViewLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "supplier") {
      loadViewLinesForDate(viewDate);
    }
    if (activeTab === "date") {
      loadViewLinesForRange(viewFromDate, viewToDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "supplier") loadViewLinesForDate(viewDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  useEffect(() => {
    if (activeTab === "date") loadViewLinesForRange(viewFromDate, viewToDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewFromDate, viewToDate]);

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

  // ✅ RESTORED inline edit behavior (same as your original)
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

  // ✅ RESTORED inline edit behavior (same as your original)
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
      setMessage("Saved purchase line deleted and stock recalculated.");
      cancelAnyEdit();
      await loadExistingLines();

      if (activeTab === "supplier") await loadViewLinesForDate(viewDate);
      if (activeTab === "date") await loadViewLinesForRange(viewFromDate, viewToDate);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to delete saved line.");
      setMessage("");
    } finally {
      setPadSaving(false);
    }
  };

  const handleSubmitPad = async () => {
    if (!stockRows.length) return;

    const itemId = Number(pad.itemId || 0);
    if (!itemId) {
      setError("Select an item in the pad before saving.");
      return;
    }

    // ✅ Allow 0.5 units etc (only require > 0)
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
        setMessage("Saved purchase line updated and stock recalculated.");
        await loadExistingLines();

        if (activeTab === "supplier") await loadViewLinesForDate(viewDate);
        if (activeTab === "date") await loadViewLinesForRange(viewFromDate, viewToDate);

        cancelAnyEdit();
        scrollPadIntoView();
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

      // ✅ New column value
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
        purchase_date: purchaseDate,
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

      await res.json();
      setMessage("Purchase saved and stock updated successfully.");
      setError("");

      setLines([]);
      setSelectedLineId(null);
      resetPadToDefaults();

      await loadExistingLines();
      if (activeTab === "supplier") await loadViewLinesForDate(viewDate);
      if (activeTab === "date") await loadViewLinesForRange(viewFromDate, viewToDate);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save purchase.");
      setMessage("");
    } finally {
      setSaving(false);
    }
  };

  const viewLinesWithComputed = useMemo(() => {
    return (viewLinesRaw || []).map((line) => {
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
  }, [viewLinesRaw, stockByItemId]);

  const viewFiltered = useMemo(() => {
    const t = viewSearch.trim().toLowerCase();
    if (!t) return viewLinesWithComputed;
    return viewLinesWithComputed.filter((l) => {
      const name = (l.meta.itemName || "").toLowerCase();
      const sup = (l.supplierName || "").toLowerCase();
      return name.includes(t) || sup.includes(t);
    });
  }, [viewLinesWithComputed, viewSearch]);

  const viewTotal = useMemo(() => {
    return viewFiltered.reduce((sum, l) => sum + (l.computed.lineTotal || 0), 0);
  }, [viewFiltered]);

  const groupedBySupplier = useMemo(() => {
    const groups = {};
    for (const l of viewFiltered) {
      const key = (l.supplierName || "").trim() || "Unknown supplier";
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map(([supplier, arr]) => {
        const total = arr.reduce((s, x) => s + (x.computed.lineTotal || 0), 0);
        return { supplier, lines: arr, total };
      });
  }, [viewFiltered]);

  // ✅ Early returns must come AFTER all hooks
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

  // ✅ Purchase Pad white
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

  const rangeLabel =
    activeTab === "date"
      ? `${formatDateDMY(viewFromDate)} → ${formatDateDMY(viewToDate)}`
      : formatDateDMY(viewDate);

  const TabsBar = (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px", marginBottom: "8px" }}>
      {[
        { id: "entry", label: "1) Purchase entry" },
        { id: "supplier", label: "2) By supplier" },
        { id: "date", label: "3) By date range" },
      ].map((t) => {
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setActiveTab(t.id);
              setMessage("");
              setError("");
              setViewError("");
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "999px",
              border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
              backgroundColor: active ? "#eff6ff" : "#ffffff",
              color: active ? "#1d4ed8" : "#111827",
              fontWeight: 800,
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  // ✅ Read-only table for tabs 2 & 3 (kept separate so Tab 1 inline-edit stays intact)
  const ViewTable = ({ rows }) => {
    if (!rows || rows.length === 0) {
      return (
        <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
          No purchased items found.
        </div>
      );
    }

    return (
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

        {rows.map((line) => {
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
              <div style={{ fontWeight: 700, color: "#111827" }}>{itemName || "Unknown item"}</div>
              <div style={{ textAlign: "center" }}>{formatQty(line.qtyUnits)}</div>
              <div style={{ textAlign: "center" }}>{formatQty(piecesPerUnit)}</div>
              <div style={{ textAlign: "center" }}>{formatQty(allPieces)}</div>
              <div style={{ textAlign: "right" }}>{formatMoney(recentUnitCost)}</div>
              <div style={{ textAlign: "right" }}>{formatMoney(line.newUnitCost)}</div>
              <div style={{ textAlign: "right" }}>{formatMoney(newCostPerPiece)}</div>
              <div style={{ textAlign: "right" }}>{formatMoney(recentWholesalePerPiece)}</div>
              <div style={{ textAlign: "right" }}>
                {line.newWholesalePerPiece != null && line.newWholesalePerPiece !== "" ? formatMoney(line.newWholesalePerPiece) : "—"}
              </div>
              <div style={{ textAlign: "right" }}>{formatMoney(recentRetailPerPiece)}</div>
              <div style={{ textAlign: "right" }}>
                {line.newRetailPerPiece != null && line.newRetailPerPiece !== "" ? formatMoney(line.newRetailPerPiece) : "—"}
              </div>
              <div style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(lineTotal)}</div>

              <div style={{ textAlign: "center" }}>
                <button
                  type="button"
                  onClick={() => deleteSavedLine(line.dbId)}
                  disabled={padSaving}
                  title="Delete saved line"
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "9999px",
                    border: "1px solid #fee2e2",
                    backgroundColor: "#fef2f2",
                    color: "#b91c1c",
                    fontSize: "14px",
                    cursor: padSaving ? "not-allowed" : "pointer",
                    opacity: padSaving ? 0.7 : 1,
                  }}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

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

            {TabsBar}
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
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>
              {activeTab === "entry" ? "Purchase summary" : "View summary"}
            </div>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.14em", color: "#9ca3af", marginBottom: "4px" }}>
              {activeTab === "entry"
                ? `All items on ${formatDateDMY(purchaseDate)}`
                : `All items on ${rangeLabel}`}
            </div>
            <div>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280" }}>Total amount</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#111827" }}>
                {activeTab === "entry" ? formatMoney(purchaseTotal) : formatMoney(viewTotal)}
              </div>
            </div>
          </div>
        </div>

        {/* Filters per tab */}
        {activeTab === "entry" ? (
          <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0, 1fr) 220px", gap: "12px", marginBottom: "8px" }}>
            <input
              type="date"
              value={purchaseDate}
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
        ) : activeTab === "supplier" ? (
          <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0, 1fr)", gap: "12px", marginBottom: "8px" }}>
            <input
              type="date"
              value={viewDate}
              onChange={(e) => setViewDate(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
            />
            <input
              type="text"
              placeholder="Search supplier or item..."
              value={viewSearch}
              onChange={(e) => setViewSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
            />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "160px 160px minmax(0, 1fr)", gap: "12px", marginBottom: "8px" }}>
            <input
              type="date"
              value={viewFromDate}
              onChange={(e) => setViewFromDate(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
              title="From date"
            />
            <input
              type="date"
              value={viewToDate}
              onChange={(e) => setViewToDate(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
              title="To date"
            />
            <input
              type="text"
              placeholder="Search supplier or item..."
              value={viewSearch}
              onChange={(e) => setViewSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
            />
          </div>
        )}
      </div>

      {(message || error || viewError) && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.6rem 0.8rem",
            borderRadius: "0.75rem",
            backgroundColor: (error || viewError) ? "#fef2f2" : "#ecfdf3",
            color: (error || viewError) ? "#b91c1c" : "#166534",
            fontSize: "0.9rem",
          }}
        >
          {error || viewError || message}
        </div>
      )}

      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
          padding: "16px 18px 14px",
        }}
      >
        {/* TAB 1: ENTRY (✅ inline edit restored exactly as before) */}
        {activeTab === "entry" && (
          <>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, marginBottom: "10px" }}>
              Items purchased on {formatDateDMY(purchaseDate)}
            </h2>

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
                    disabled={!stockRows.length || padSaving}
                    style={{
                      padding: "0.55rem 1.3rem",
                      borderRadius: "9999px",
                      border: "none",
                      backgroundColor: stockRows.length ? "#2563eb" : "#9ca3af",
                      color: "white",
                      fontWeight: 800,
                      fontSize: "0.9rem",
                      cursor: !stockRows.length || padSaving ? "not-allowed" : "pointer",
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

              <div>
                <label style={labelStyle}>Item</label>
                <ItemComboBox
                  items={pickerItems}
                  valueId={pad.itemId === "" ? "" : String(pad.itemId)}
                  onChangeId={(idStr) => updatePad("itemId", idStr)}
                  disabled={!stockRows.length || isEditingSaved}
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
                  gridTemplateColumns: "140px minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr)",
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

            {/* LIST (✅ original inline edit restored) */}
            {linesWithComputed.length === 0 ? (
              <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
                No items in this purchase date yet. Use the pad above and click <strong>{padButtonText}</strong>.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", marginTop: "2px" }}>
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>
                    Items for {formatDateDMY(purchaseDate)}: {linesWithComputed.length}{" "}
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
                              {itemName || "Unknown item"}{" "}
                              {isEditingThisSaved ? <span style={{ color: "#2563eb", fontWeight: 800, marginLeft: 6 }}>(editing)</span> : null}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditNewLine(line.id)}
                              style={{ padding: 0, margin: 0, border: "none", background: "transparent", color: "#2563eb", fontWeight: 600, fontSize: "13px", cursor: "pointer", textAlign: "left" }}
                              title="Edit new (unsaved) line"
                            >
                              {itemName || "Unknown item"}
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
          </>
        )}

        {/* TAB 2: BY SUPPLIER */}
        {activeTab === "supplier" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>
                  Purchases grouped by supplier — {formatDateDMY(viewDate)}
                </h2>
                <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                  Showing {viewFiltered.length} item lines
                </div>
              </div>

              <button
                type="button"
                onClick={() => loadViewLinesForDate(viewDate)}
                disabled={viewLoading}
                style={{
                  padding: "0.55rem 1.2rem",
                  borderRadius: "999px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                  cursor: viewLoading ? "not-allowed" : "pointer",
                  opacity: viewLoading ? 0.7 : 1,
                }}
              >
                {viewLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {viewLoading ? (
              <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>Loading purchases…</div>
            ) : groupedBySupplier.length === 0 ? (
              <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
                No purchases found for {formatDateDMY(viewDate)}.
              </div>
            ) : (
              <div style={{ display: "grid", rowGap: "14px" }}>
                {groupedBySupplier.map((g) => (
                  <div key={g.supplier} style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "10px 10px 12px", background: "#ffffff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", padding: "4px 6px 10px" }}>
                      <div style={{ fontSize: "15px", fontWeight: 900, color: "#111827" }}>{g.supplier}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>
                        {g.lines.length} items • Total:{" "}
                        <span style={{ color: "#111827", fontWeight: 900 }}>{formatMoney(g.total)}</span>
                      </div>
                    </div>
                    <ViewTable rows={g.lines} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* TAB 3: BY DATE RANGE */}
        {activeTab === "date" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>
                  All purchased items — {formatDateDMY(viewFromDate)} → {formatDateDMY(viewToDate)}
                </h2>
                <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                  Showing {viewFiltered.length} item lines
                </div>
              </div>

              <button
                type="button"
                onClick={() => loadViewLinesForRange(viewFromDate, viewToDate)}
                disabled={viewLoading}
                style={{
                  padding: "0.55rem 1.2rem",
                  borderRadius: "999px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                  cursor: viewLoading ? "not-allowed" : "pointer",
                  opacity: viewLoading ? 0.7 : 1,
                }}
              >
                {viewLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {viewLoading ? (
              <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>Loading purchases…</div>
            ) : (
              <ViewTable rows={viewFiltered} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ShopPurchasesPage;
