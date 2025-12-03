// src/pages/shop/ShopPurchasesPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Single source of truth for API base (VITE_API_BASE / prod)
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";

const API_BASE = CLIENT_API_BASE;

// Grid definition for the summary table
const PURCHASE_GRID_COLUMNS =
  "minmax(200px, 2.3fr) 80px 90px 120px 120px 120px 130px 130px 130px 130px 110px 40px";

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value) || 0;
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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

  const [shop, setShop] = useState(null);
  const [stockRows, setStockRows] = useState([]); // /stock/?shop_id=...
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Purchase header fields
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  // Purchase lines in this entry (both from DB and new)
  const [lines, setLines] = useState([]);

  // PAD for entering one item
  const [pad, setPad] = useState({
    itemId: "", // keep blank initially (Select item)
    qtyUnits: 1,
    newUnitCost: "",
    newWholesalePerPiece: "",
    newRetailPerPiece: "",
  });

  // Which NEW line is being edited (null = adding new)
  const [editingLineId, setEditingLineId] = useState(null);

  // ✅ NEW: which SAVED DB line is being edited (null = not editing saved)
  const [editingDbId, setEditingDbId] = useState(null); // numeric DB purchase_line.id
  const [editingDbUiId, setEditingDbUiId] = useState(null); // "db-123" for selection highlight

  // Which line is currently highlighted/selected (for both DB & new)
  const [selectedLineId, setSelectedLineId] = useState(null);

  // Search term for the list
  const [searchTerm, setSearchTerm] = useState("");

  const [saving, setSaving] = useState(false); // save purchase (POST /purchases/)
  const [padSaving, setPadSaving] = useState(false); // update/delete saved line
  const [message, setMessage] = useState("");

  // Refs
  const padRef = useRef(null);
  const stickyHeaderRef = useRef(null);

  // Track sticky header height for accurate scroll offset
  const [headerHeight, setHeaderHeight] = useState(180);
  useEffect(() => {
    const calc = () => {
      if (stickyHeaderRef.current) {
        setHeaderHeight(stickyHeaderRef.current.offsetHeight || 180);
      }
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // ------------------------------------------------
  // Helpers: reset/cancel pad mode
  // ------------------------------------------------
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

  // Smooth scroll so the pad stops *below* the sticky header
  const scrollPadIntoView = () => {
    if (!padRef.current) return;
    padRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ------------------------------------------------
  // Load shop + stock for this shop
  // ------------------------------------------------
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

  // Map item_id -> stock row
  const stockByItemId = useMemo(() => {
    const map = {};
    for (const s of stockRows) {
      map[s.item_id] = s;
    }
    return map;
  }, [stockRows]);

  const shopName = shop?.name || `Shop ${shopId}`;

  // ------------------------------------------------
  // Initialize pad when stock loads (DO NOT auto-select)
  // ------------------------------------------------
  useEffect(() => {
    if (!stockRows.length) return;
    setPad((prev) => (prev.itemId ? prev : { ...prev, itemId: "" }));
  }, [stockRows]);

  // ------------------------------------------------
  // Load existing PURCHASE LINES from DB for this date
  // ------------------------------------------------
  const loadExistingLines = async () => {
    if (!stockRows.length) {
      setLines([]);
      return;
    }

    try {
      const url = `${API_BASE}/purchases/by-shop-date/?shop_id=${shopId}&purchase_date=${purchaseDate}`;
      const res = await fetch(url, { headers: authHeadersNoJson });
      if (!res.ok) {
        console.error("Failed to load purchase lines for date", purchaseDate);
        return;
      }
      const data = await res.json(); // [{id, item_id, quantity, unit_cost_price}, ...]

      const mapped = data.map((pl) => ({
        id: `db-${pl.id}`,
        isFromDb: true,
        dbId: pl.id,
        itemId: pl.item_id,
        qtyUnits: pl.quantity,
        newUnitCost: pl.unit_cost_price,
        // For historical lines, use current wholesale/retail from stock as "new" prices
        newWholesalePerPiece: stockByItemId[pl.item_id]?.wholesale_price_per_piece || "",
        newRetailPerPiece: stockByItemId[pl.item_id]?.selling_price_per_piece || "",
      }));

      setLines(mapped);

      // If the user was editing a saved line, keep highlight as long as it still exists
      setSelectedLineId((prev) => {
        if (!prev) return null;
        const exists = mapped.some((m) => m.id === prev) || lines.some((l) => l.id === prev && !l.isFromDb);
        return exists ? prev : null;
      });
    } catch (err) {
      console.error("Error loading existing purchase lines:", err);
    }
  };

  useEffect(() => {
    loadExistingLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, purchaseDate, stockRows, stockByItemId]);

  // When date changes, cancel edit mode (prevents editing wrong date)
  useEffect(() => {
    cancelAnyEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseDate]);

  // ------------------------------------------------
  // PAD helpers
  // ------------------------------------------------
  const updatePad = (field, rawValue) => {
    setPad((prev) => {
      if (field === "itemId") {
        // ✅ Do NOT allow changing item when editing a saved DB line
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

  // ------------------------------------------------
  // Start editing (NEW unsaved line)
  // ------------------------------------------------
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

  // ------------------------------------------------
  // ✅ Start editing (SAVED DB line)
  // ------------------------------------------------
  const startEditSavedLine = (line) => {
    setSelectedLineId(line.id);

    setEditingLineId(null); // not editing a "new" line
    setEditingDbId(line.dbId); // numeric purchase_line.id
    setEditingDbUiId(line.id); // e.g. "db-12"

    setPad({
      itemId: line.itemId,
      qtyUnits: line.qtyUnits,
      newUnitCost: line.newUnitCost,
      newWholesalePerPiece: line.newWholesalePerPiece,
      newRetailPerPiece: line.newRetailPerPiece,
    });
    scrollPadIntoView();
  };

  // ------------------------------------------------
  // Remove NEW line only (existing behavior)
  // ------------------------------------------------
  const removeLine = (id) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
    if (editingLineId === id) {
      setEditingLineId(null);
      resetPadToDefaults();
    }
    if (selectedLineId === id) {
      setSelectedLineId(null);
    }
  };

  // ------------------------------------------------
  // ✅ Delete SAVED DB line (optional but very useful)
  // ------------------------------------------------
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
        const detail = errData?.detail || `Failed to delete line. Status: ${res.status}`;
        throw new Error(detail);
      }

      await res.json().catch(() => null);

      setMessage("Saved purchase line deleted and stock recalculated.");
      setError("");

      cancelAnyEdit();

      // Reload lines + stock
      await loadExistingLines();
      try {
        const stockRes = await fetch(`${API_BASE}/stock/?shop_id=${shopId}`, { headers: authHeadersNoJson });
        if (stockRes.ok) {
          const stockData = await stockRes.json();
          setStockRows(stockData || []);
        }
      } catch (e) {
        console.warn("Could not reload stock after delete:", e);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to delete saved line.");
      setMessage("");
    } finally {
      setPadSaving(false);
    }
  };

  // ------------------------------------------------
  // Submit pad:
  // - if editing saved DB line => PUT backend
  // - else existing behavior (add/update NEW line locally)
  // ------------------------------------------------
  const handleSubmitPad = async () => {
    if (!stockRows.length) return;

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

    // ✅ Editing SAVED line: call backend PUT
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
          const detail = errData?.detail || `Failed to update saved line. Status: ${res.status}`;
          throw new Error(detail);
        }

        await res.json().catch(() => null);

        setMessage("Saved purchase line updated and stock recalculated.");
        setError("");

        // reload lines + stock to reflect new values immediately
        await loadExistingLines();
        try {
          const stockRes = await fetch(`${API_BASE}/stock/?shop_id=${shopId}`, { headers: authHeadersNoJson });
          if (stockRes.ok) {
            const stockData = await stockRes.json();
            setStockRows(stockData || []);
          }
        } catch (e) {
          console.warn("Could not reload stock after update:", e);
        }

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

    // Existing behavior: add/update NEW (unsaved) line locally
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

    // After adding/editing, go back to blank pad (Select item)
    resetPadToDefaults();
    scrollPadIntoView();
  };

  // ------------------------------------------------
  // Totals and computed fields
  // ------------------------------------------------
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

  // Pad computed cost per piece (for display)
  const padStock = pad.itemId ? stockByItemId[pad.itemId] : null;
  const padPiecesPerUnit = padStock?.item_pieces_per_unit || 1;
  const padPurchaseCostPerPiece =
    pad.itemId && padPiecesPerUnit > 0 ? Number(pad.newUnitCost || 0) / padPiecesPerUnit : 0;

  // ------------------------------------------------
  // Save: calls backend /purchases/ with ONLY NEW lines
  // ------------------------------------------------
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
        const detail = errData?.detail || `Failed to save purchase. Status: ${res.status}`;
        throw new Error(detail);
      }

      await res.json();

      setMessage("Purchase saved and stock updated successfully.");
      setError("");

      // Clear ONLY new lines; DB lines will be reloaded below
      setLines([]);
      setSelectedLineId(null);
      resetPadToDefaults();

      // Reload stock
      try {
        const stockRes = await fetch(`${API_BASE}/stock/?shop_id=${shopId}`, { headers: authHeadersNoJson });
        if (stockRes.ok) {
          const stockData = await stockRes.json();
          setStockRows(stockData || []);
        }
      } catch (e) {
        console.warn("Could not reload stock after purchase:", e);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save purchase.");
      setMessage("");
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------
  // Render
  // ------------------------------------------------
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

  // Pad theme
  const padDark = true; // keep the style you liked
  const padBg = padDark
    ? "radial-gradient(1200px 400px at 30% -40%, rgba(59,130,246,0.25), rgba(0,0,0,0) 60%), linear-gradient(180deg, #0b1220, #050812)"
    : "#f9fafb";
  const padText = padDark ? "#e5e7eb" : "#111827";
  const padMuted = padDark ? "#9ca3af" : "#6b7280";
  const padBorder = padDark ? "1px solid rgba(255,255,255,0.10)" : "1px dashed #d1d5db";

  const inputBase = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "12px",
    border: padDark ? "1px solid rgba(255,255,255,0.18)" : "1px solid #d1d5db",
    fontSize: "13px",
    outline: "none",
    backgroundColor: padDark ? "rgba(255,255,255,0.06)" : "#ffffff",
    color: padDark ? "#ffffff" : "#111827",
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

  // force readable option text when dropdown opens
  const optionStyle = { color: "#111827", backgroundColor: "#ffffff" };

  const isEditingSaved = editingDbId !== null;
  const isEditingNew = editingLineId !== null;

  const padTitle = isEditingSaved
    ? "Edit saved item (updates database)"
    : isEditingNew
    ? "Edit new item, then click Update item to save changes"
    : "Pad: select item, set prices, then add to list";

  const padButtonText = isEditingSaved ? "Update saved item" : isEditingNew ? "Update item" : "+ Add to list";

  return (
    <div style={{ padding: "16px 24px 24px" }}>
      {/* Sticky header */}
      <div
        ref={stickyHeaderRef}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 15,
          paddingBottom: "8px",
          marginBottom: "8px",
          background: "linear-gradient(to bottom, #f3f4f6 0%, #f3f4f6 65%, rgba(243,244,246,0) 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "6px",
          }}
        >
          {/* Title */}
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

            <h1
              style={{
                fontSize: "30px",
                fontWeight: 800,
                letterSpacing: "0.03em",
                margin: 0,
              }}
            >
              Purchases
            </h1>
            <div
              style={{
                marginTop: "2px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#2563eb",
              }}
            >
              {shopName}
            </div>
          </div>

          {/* Summary card */}
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
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827", marginBottom: "0" }}>
              Purchase summary
            </div>
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "#9ca3af",
                marginBottom: "4px",
              }}
            >
              All items on {purchaseDate}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
              <div>
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#6b7280",
                  }}
                >
                  Total amount
                </div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#111827" }}>
                  {formatMoney(purchaseTotal)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Date + Supplier + invoice */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "160px minmax(0, 1fr) 220px",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              fontSize: "13px",
              backgroundColor: "#ffffff",
            }}
          />
          <input
            type="text"
            placeholder="Supplier name (optional)"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              fontSize: "13px",
              backgroundColor: "#ffffff",
            }}
          />
          <input
            type="text"
            placeholder="Invoice number (optional)"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              fontSize: "13px",
              backgroundColor: "#ffffff",
            }}
          />
        </div>
      </div>

      {/* Messages */}
      {(message || error) && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.6rem 0.8rem",
            borderRadius: "0.75rem",
            backgroundColor: error ? "#fef2f2" : "#ecfdf3",
            color: error ? "#b91c1c" : "#166534",
            fontSize: "0.9rem",
          }}
        >
          {error || message}
        </div>
      )}

      {/* MAIN CARD: Pad (top) + List (bottom) */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
          padding: "16px 18px 14px",
        }}
      >
        {/* Card title */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>Items purchased on {purchaseDate}</h2>
          </div>
        </div>

        {/* PART 1: PAD */}
        <div
          ref={padRef}
          style={{
            marginBottom: "12px",
            padding: "14px 14px 16px",
            borderRadius: "18px",
            background: padBg,
            border: padBorder,
            color: padText,
            scrollMarginTop: `${headerHeight + 12}px`,
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              marginBottom: "10px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "8px",
            }}
          >
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
                    border: padDark ? "1px solid rgba(255,255,255,0.22)" : "1px solid #d1d5db",
                    backgroundColor: padDark ? "rgba(255,255,255,0.06)" : "#ffffff",
                    color: padDark ? "#ffffff" : "#111827",
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
            <div
              style={{
                marginBottom: "10px",
                padding: "8px 10px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                color: padMuted,
                fontSize: "12px",
                lineHeight: 1.35,
              }}
            >
              Note: Item cannot be changed when editing a saved line. If you need a different item, delete the saved line
              and add a new one.
            </div>
          )}

          {/* ITEM SELECT */}
          <div>
            <label style={labelStyle}>Item</label>
            <select
              value={pad.itemId === "" ? "" : String(pad.itemId)}
              onChange={(e) => updatePad("itemId", e.target.value)}
              disabled={!stockRows.length || isEditingSaved}
              style={{
                ...inputBase,
                cursor: !stockRows.length || isEditingSaved ? "not-allowed" : "pointer",
                opacity: isEditingSaved ? 0.75 : 1,
              }}
            >
              <option value="" disabled style={optionStyle}>
                Select item
              </option>
              {stockRows.map((s) => (
                <option key={s.item_id} value={String(s.item_id)} style={optionStyle}>
                  {s.item_name}
                </option>
              ))}
            </select>

            {/* Helpers */}
            <div style={helperGridStyle}>
              <div>
                Pieces / unit: <strong style={{ color: padText }}>{padStock ? padPiecesPerUnit : "—"}</strong>
              </div>
              <div>
                Recent unit cost:{" "}
                <strong style={{ color: padText }}>
                  {padStock ? formatMoney(padStock.last_purchase_unit_price || 0) : "—"}
                </strong>
              </div>
              <div>
                Recent wholesale / piece:{" "}
                <strong style={{ color: padText }}>
                  {padStock ? formatMoney(padStock.wholesale_price_per_piece || 0) : "—"}
                </strong>
              </div>
              <div>
                Recent retail / piece:{" "}
                <strong style={{ color: padText }}>
                  {padStock ? formatMoney(padStock.selling_price_per_piece || 0) : "—"}
                </strong>
              </div>
            </div>
          </div>

          {/* INPUTS ROW */}
          <div
            style={{
              marginTop: "12px",
              display: "grid",
              gridTemplateColumns:
                "140px minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr)",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <div>
              <label style={labelStyle}>Qty units</label>
              <input type="number" min={1} value={pad.qtyUnits} onChange={(e) => updatePad("qtyUnits", e.target.value)} style={inputBase} />
            </div>

            <div>
              <label style={labelStyle}>Purchase cost (unit)</label>
              <input type="number" value={pad.newUnitCost} onChange={(e) => updatePad("newUnitCost", e.target.value)} placeholder="0" style={inputBase} />
            </div>

            <div>
              <label style={labelStyle}>Purchase cost / piece</label>
              <input
                type="text"
                readOnly
                value={pad.itemId ? formatMoney(padPurchaseCostPerPiece) : ""}
                placeholder="—"
                style={{
                  ...inputBase,
                  backgroundColor: padDark ? "rgba(255,255,255,0.10)" : "#f3f4f6",
                  color: padDark ? "#ffffff" : "#111827",
                  fontWeight: 800,
                }}
              />
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

        {/* PART 2: LIST */}
        {linesWithComputed.length === 0 ? (
          <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
            No items in this purchase date yet. Use the pad above and click <strong>{padButtonText}</strong>.
          </div>
        ) : (
          <>
            {/* Search bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
                marginTop: "2px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                Items for {purchaseDate}: {linesWithComputed.length}{" "}
                {searchTerm ? `(showing ${filteredLinesWithComputed.length} after filter)` : ""}
              </div>
              <input
                type="text"
                placeholder="Search in items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "240px",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  border: "1px solid #d1d5db",
                  fontSize: "12px",
                }}
              />
            </div>

            {/* Table */}
            <div
              style={{
                maxHeight: "420px",
                overflowY: "auto",
                overflowX: "auto",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                padding: "0 8px 4px 0",
                backgroundColor: "#fcfcff",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: PURCHASE_GRID_COLUMNS,
                  minWidth: "1150px",
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
                <div style={{ textAlign: "right" }}>Recent unit</div>
                <div style={{ textAlign: "right" }}>New unit</div>
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

                const { newCostPerPiece, lineTotal } = computed;

                const isFromDb = line.isFromDb;
                const isSelected = selectedLineId === line.id;
                const isEditingThisSaved = isFromDb && editingDbUiId === line.id;

                return (
                  <div
                    key={line.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: PURCHASE_GRID_COLUMNS,
                      minWidth: "1150px",
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
                          style={{
                            padding: 0,
                            margin: 0,
                            border: "none",
                            background: "transparent",
                            color: "#111827",
                            fontWeight: 700,
                            fontSize: "13px",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          title="Edit saved purchase line"
                        >
                          {itemName || "Unknown item"}{" "}
                          {isEditingThisSaved ? (
                            <span style={{ color: "#2563eb", fontWeight: 800, marginLeft: 6 }}>(editing)</span>
                          ) : null}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditNewLine(line.id)}
                          style={{
                            padding: 0,
                            margin: 0,
                            border: "none",
                            background: "transparent",
                            color: "#2563eb",
                            fontWeight: 600,
                            fontSize: "13px",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          title="Edit new (unsaved) line"
                        >
                          {itemName || "Unknown item"}
                        </button>
                      )}
                    </div>

                    <div style={{ textAlign: "center" }}>{line.qtyUnits}</div>
                    <div style={{ textAlign: "center" }}>{piecesPerUnit}</div>
                    <div style={{ textAlign: "right" }}>{formatMoney(recentUnitCost)}</div>
                    <div style={{ textAlign: "right" }}>{formatMoney(line.newUnitCost)}</div>
                    <div style={{ textAlign: "right" }}>{formatMoney(newCostPerPiece)}</div>
                    <div style={{ textAlign: "right" }}>{formatMoney(recentWholesalePerPiece)}</div>
                    <div style={{ textAlign: "right" }}>{formatMoney(line.newWholesalePerPiece)}</div>
                    <div style={{ textAlign: "right" }}>{formatMoney(recentRetailPerPiece)}</div>
                    <div style={{ textAlign: "right" }}>{formatMoney(line.newRetailPerPiece)}</div>

                    <div style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(lineTotal)}</div>

                    {/* Last column */}
                    <div style={{ textAlign: "center" }}>
                      {isFromDb ? (
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
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "9999px",
                            border: "1px solid #fee2e2",
                            backgroundColor: "#fef2f2",
                            color: "#b91c1c",
                            fontSize: "16px",
                            cursor: "pointer",
                          }}
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

        {/* Footer buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "14px" }}>
          <button
            type="button"
            onClick={() => navigate(`/shops/${shopId}/stock`)}
            style={{
              padding: "0.6rem 1.4rem",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              color: "#111827",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            View stock
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "0.6rem 1.8rem",
              borderRadius: "999px",
              border: "none",
              backgroundColor: saving ? "#2563eb99" : "#2563eb",
              color: "white",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save purchase"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShopPurchasesPage;
