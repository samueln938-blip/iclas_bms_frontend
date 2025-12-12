// src/pages/shop/ShopStockPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Single source of truth for API base (VITE_API_BASE / prod)
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";
const API_BASE = CLIENT_API_BASE;

/**
 * ✅ For integer-like values (IDs, pieces-per-unit)
 * NOTE: This will round if you pass decimals, so only use it for true integers.
 */
function formatInt(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return Math.round(num).toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * ✅ For quantities that may be decimals (0.5 units, 0.25 pieces, etc.)
 * Shows up to N decimals without forcing trailing zeros.
 */
function formatQty(value, maxFractionDigits = 2) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value) || 0;
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function ShopStockPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();

  const authHeadersNoJson = useMemo(() => {
    const h = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const [shop, setShop] = useState(null);
  const [stockRows, setStockRows] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // ✅ Tabs
  const [activeTab, setActiveTab] = useState("ALL");

  // ✅ Low stock controls
  const [lowStockMode, setLowStockMode] = useState("PIECES"); // "PIECES" | "UNITS"
  const [lowStockThreshold, setLowStockThreshold] = useState(10); // can be decimal now

  // sort configuration
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "asc",
  });

  // ✅ Refresh helpers (fixes “backend has it, UI doesn’t”)
  const [reloadTick, setReloadTick] = useState(0);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  const forceReload = () => setReloadTick((n) => n + 1);

  // ✅ Proper abort handling: signal is created by the effect and passed in
  const loadData = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");

      try {
        // Cache busting so you always see the newest DB state
        const bust = `&_=${Date.now()}`;

        const shopRes = await fetch(`${API_BASE}/shops/${shopId}`, {
          headers: authHeadersNoJson,
          signal,
          cache: "no-store",
        });
        if (!shopRes.ok) throw new Error("Failed to load shop.");
        const shopData = await shopRes.json();

        const stockRes = await fetch(
          `${API_BASE}/stock/?shop_id=${shopId}${bust}`,
          {
            headers: authHeadersNoJson,
            signal,
            cache: "no-store",
          }
        );
        if (!stockRes.ok) throw new Error("Failed to load stock.");
        const stockData = await stockRes.json();

        setShop(shopData);
        setStockRows(stockData || []);
        setLastLoadedAt(new Date());
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error(err);
        setError(err?.message || "Failed to load stock for this shop.");
      } finally {
        // If aborted, React will ignore state updates anyway, but we keep it clean
        if (signal?.aborted) return;
        setLoading(false);
      }
    },
    [shopId, authHeadersNoJson]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData, reloadTick]);

  // ✅ Auto-refresh when you come back to the browser tab/window
  useEffect(() => {
    const onFocus = () => {
      forceReload();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map raw stock records into the row shape used by the table
  const baseRows = useMemo(() => {
    return (stockRows || []).map((s) => {
      const piecesPerUnit =
        s.item_pieces_per_unit != null ? Number(s.item_pieces_per_unit) : 1;

      const totalUnits = Number(s.total_quantity || 0); // ✅ may be decimal
      const soldPieces = Number(s.total_pieces_sold || 0); // ✅ may be decimal

      const defaultUnitCost = Number(s.default_unit_cost_price || 0);
      const recentUnitCost = Number(s.last_purchase_unit_price || 0);

      // UI-only: "Total cost (recent × units)" – not stored in DB
      const totalCostRecentUnits = recentUnitCost * totalUnits;

      const totalPieces =
        "total_pieces" in s
          ? Number(s.total_pieces || 0) // ✅ may be decimal if backend supports
          : totalUnits * (piecesPerUnit || 1);

      const remainingPieces =
        "remaining_pieces" in s
          ? Number(s.remaining_pieces || 0) // ✅ may be decimal
          : totalPieces - soldPieces; // ✅ keep decimals (don’t clamp/round)

      const costPerPiece =
        "purchase_cost_per_piece" in s
          ? Number(s.purchase_cost_per_piece || 0)
          : piecesPerUnit > 0
          ? recentUnitCost / piecesPerUnit
          : 0;

      const wholesalePerPiece = Number(s.wholesale_price_per_piece || 0);
      const salePerPiece = Number(s.selling_price_per_piece || 0);

      const interestPerPiece =
        "interest_per_piece" in s
          ? Number(s.interest_per_piece || 0)
          : salePerPiece - costPerPiece;

      // These 3 are already calculated on backend:
      const stockValue = Number(s.total_cost_value || 0);
      const expectedSaleValue = Number(s.total_expected_sale_value || 0);
      const expectedInterest = Number(s.total_expected_profit_value || 0);

      return {
        itemId: s.item_id,
        itemName: s.item_name,
        category: s.item_category,
        unit: s.item_unit,
        piecesPerUnit,

        totalUnits,
        defaultUnitCost,
        recentUnitCost,
        totalCostRecentUnits,

        totalPieces,
        soldPieces,
        remainingPieces,

        costPerPiece,
        wholesalePerPiece,
        salePerPiece,
        interestPerPiece,

        stockValue,
        expectedSaleValue,
        expectedInterest,
      };
    });
  }, [stockRows]);

  // ✅ In stock / zero stock
  const inStockRows = useMemo(() => {
    return baseRows.filter((r) => Number(r.remainingPieces || 0) > 0);
  }, [baseRows]);

  const zeroStockRows = useMemo(() => {
    return baseRows.filter((r) => Number(r.remainingPieces || 0) <= 0);
  }, [baseRows]);

  // ✅ Low stock (close to zero)
  const lowStockRows = useMemo(() => {
    const th = Number(lowStockThreshold || 0);
    if (th <= 0) return [];

    return baseRows.filter((r) => {
      const remaining = Number(r.remainingPieces || 0);
      if (remaining <= 0) return false;

      const ppu =
        Number(r.piecesPerUnit || 1) > 0 ? Number(r.piecesPerUnit || 1) : 1;

      const thresholdPieces = lowStockMode === "UNITS" ? th * ppu : th;

      return remaining <= thresholdPieces;
    });
  }, [baseRows, lowStockMode, lowStockThreshold]);

  // ✅ Choose rows by tab
  const tabRows = useMemo(() => {
    if (activeTab === "IN_STOCK") return inStockRows;
    if (activeTab === "LOW_STOCK") return lowStockRows;
    if (activeTab === "ZERO_STOCK") return zeroStockRows;
    return baseRows;
  }, [activeTab, baseRows, inStockRows, lowStockRows, zeroStockRows]);

  // Search filters on TOP of tab rows
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tabRows;

    return tabRows.filter((row) => {
      const byName = row.itemName?.toLowerCase().includes(term);
      const byId = String(row.itemId).includes(term);
      const byCategory = row.category?.toLowerCase().includes(term);
      return byName || byId || byCategory;
    });
  }, [tabRows, search]);

  // apply sorting on top of filtered rows
  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    if (!sortConfig.key) return rows;

    rows.sort((a, b) => {
      let v1 = a[sortConfig.key];
      let v2 = b[sortConfig.key];

      if (v1 === null || v1 === undefined) v1 = "";
      if (v2 === null || v2 === undefined) v2 = "";

      const bothNumbers = typeof v1 === "number" && typeof v2 === "number";

      if (bothNumbers) {
        return sortConfig.direction === "asc" ? v1 - v2 : v2 - v1;
      } else {
        const s1 = String(v1).toLowerCase();
        const s2 = String(v2).toLowerCase();
        return sortConfig.direction === "asc"
          ? s1.localeCompare(s2)
          : s2.localeCompare(s1);
      }
    });

    return rows;
  }, [filteredRows, sortConfig]);

  // Summary reflects what you are currently viewing (tab + search)
  const summary = useMemo(() => {
    let stockValue = 0;
    let expectedSaleValue = 0;
    let expectedInterest = 0;

    for (const row of filteredRows) {
      stockValue += row.stockValue;
      expectedSaleValue += row.expectedSaleValue;
      expectedInterest += row.expectedInterest;
    }

    return { stockValue, expectedSaleValue, expectedInterest };
  }, [filteredRows]);

  // helper: change sort when clicking a header
  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  // helper: show arrow icon
  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return "↕";
    return sortConfig.direction === "asc" ? "▲" : "▼";
  };

  if (loading) {
    return (
      <div style={{ padding: "32px" }}>
        <p>Loading stock...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "32px", color: "red" }}>
        <p>{error}</p>
      </div>
    );
  }

  const shopName = shop?.name || `Shop ${shopId}`;

  const sortableHeaderStyle = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    cursor: "pointer",
  };

  const headerIconStyle = (key) => ({
    fontSize: "10px",
    color: sortConfig.key === key ? "#111827" : "#9ca3af",
  });

  const tabWrapStyle = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  };

  const tabButtonStyle = (isActive) => ({
    padding: "7px 12px",
    borderRadius: "999px",
    border: isActive ? "1px solid #2563eb" : "1px solid #d1d5db",
    backgroundColor: isActive ? "#eff6ff" : "#ffffff",
    color: isActive ? "#1d4ed8" : "#111827",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    userSelect: "none",
  });

  const tinyBadge = (isActive) => ({
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 800,
    backgroundColor: isActive ? "#2563eb" : "#f3f4f6",
    color: isActive ? "#ffffff" : "#374151",
  });

  const lowWrapStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    border: "1px solid #e5e7eb",
    borderRadius: "999px",
    backgroundColor: "#ffffff",
  };

  const smallSelectStyle = {
    padding: "6px 10px",
    borderRadius: "999px",
    border: "1px solid #d1d5db",
    fontSize: "12px",
    backgroundColor: "#ffffff",
  };

  const smallInputStyle = {
    width: "90px",
    padding: "6px 10px",
    borderRadius: "999px",
    border: "1px solid #d1d5db",
    fontSize: "12px",
    backgroundColor: "#ffffff",
  };

  return (
    <div style={{ padding: "16px 24px 24px" }}>
      {/* STICKY SHOP HEADER + SUMMARY + SEARCH */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 15,
          paddingBottom: "8px",
          marginBottom: "8px",
          background:
            "linear-gradient(to bottom, #f3f4f6 0%, #f3f4f6 65%, rgba(243,244,246,0) 100%)",
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
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
              Stock
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

            <div
              style={{
                marginTop: "6px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={forceReload}
                style={{
                  padding: "7px 12px",
                  borderRadius: "999px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
                title="Refresh stock from server"
              >
                ⟳ Refresh
              </button>

              {lastLoadedAt ? (
                <span style={{ fontSize: "12px", color: "#6b7280" }}>
                  Updated:{" "}
                  {lastLoadedAt.toLocaleTimeString("en-RW", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </div>
          </div>

          {/* SUMMARY CARD */}
          <div
            style={{
              minWidth: "300px",
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
              Stock Summary
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
              Based on remaining pieces
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
                  Stock value
                </div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                  {formatMoney(summary.stockValue)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#6b7280",
                  }}
                >
                  Expected sale
                </div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                  {formatMoney(summary.expectedSaleValue)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#6b7280",
                  }}
                >
                  Expected interest
                </div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                  {formatMoney(summary.expectedInterest)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs + low-stock controls + search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={tabWrapStyle}>
            <button type="button" onClick={() => setActiveTab("ALL")} style={tabButtonStyle(activeTab === "ALL")}>
              All <span style={tinyBadge(activeTab === "ALL")}>{baseRows.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("IN_STOCK")}
              style={tabButtonStyle(activeTab === "IN_STOCK")}
            >
              In stock <span style={tinyBadge(activeTab === "IN_STOCK")}>{inStockRows.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("LOW_STOCK")}
              style={tabButtonStyle(activeTab === "LOW_STOCK")}
            >
              Low stock <span style={tinyBadge(activeTab === "LOW_STOCK")}>{lowStockRows.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("ZERO_STOCK")}
              style={tabButtonStyle(activeTab === "ZERO_STOCK")}
            >
              0 stock <span style={tinyBadge(activeTab === "ZERO_STOCK")}>{zeroStockRows.length}</span>
            </button>

            <div style={lowWrapStyle} title="Set what 'Low stock' means">
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>Low stock =</span>

              <input
                type="number"
                min={0.01}
                step="0.01"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(Number(e.target.value || 0))}
                style={smallInputStyle}
              />

              <select value={lowStockMode} onChange={(e) => setLowStockMode(e.target.value)} style={smallSelectStyle}>
                <option value="PIECES">pieces</option>
                <option value="UNITS">units</option>
              </select>
            </div>
          </div>

          <input
            type="text"
            placeholder="Search by item name, ID or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              minWidth: "260px",
              fontSize: "13px",
              backgroundColor: "#ffffff",
            }}
          />
        </div>
      </div>

      {/* TABLE CARD */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
          padding: "10px 0 6px",
        }}
      >
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 180px)", position: "relative" }}>
          {/* HEADER ROW */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              backgroundColor: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              display: "grid",
              gridTemplateColumns:
                "220px 140px 90px 120px 120px 130px 90px 110px 90px 120px 110px 120px 110px 130px 130px 150px 160px",
              gap: "4px",
              padding: "6px 16px",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6b7280",
              fontWeight: 600,
            }}
          >
            <div
              style={{
                position: "sticky",
                left: 0,
                zIndex: 11,
                backgroundColor: "#f9fafb",
                boxShadow: "2px 0 4px rgba(0,0,0,0.04)",
              }}
            >
              <div style={sortableHeaderStyle} onClick={() => handleSort("itemName")}>
                <span>Item</span>
                <span style={headerIconStyle("itemName")}>{getSortIndicator("itemName")}</span>
              </div>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("category")}>
              <span>Category</span>
              <span style={headerIconStyle("category")}>{getSortIndicator("category")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("totalUnits")}>
              <span>Total units</span>
              <span style={headerIconStyle("totalUnits")}>{getSortIndicator("totalUnits")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("defaultUnitCost")}>
              <span>Default unit cost</span>
              <span style={headerIconStyle("defaultUnitCost")}>{getSortIndicator("defaultUnitCost")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("recentUnitCost")}>
              <span>Recent unit cost</span>
              <span style={headerIconStyle("recentUnitCost")}>{getSortIndicator("recentUnitCost")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("totalCostRecentUnits")}>
              <span>Total cost (recent × units)</span>
              <span style={headerIconStyle("totalCostRecentUnits")}>{getSortIndicator("totalCostRecentUnits")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("piecesPerUnit")}>
              <span>Pieces / unit</span>
              <span style={headerIconStyle("piecesPerUnit")}>{getSortIndicator("piecesPerUnit")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("totalPieces")}>
              <span>Total pieces</span>
              <span style={headerIconStyle("totalPieces")}>{getSortIndicator("totalPieces")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("soldPieces")}>
              <span>Sold pieces</span>
              <span style={headerIconStyle("soldPieces")}>{getSortIndicator("soldPieces")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("remainingPieces")}>
              <span>Remaining pieces</span>
              <span style={headerIconStyle("remainingPieces")}>{getSortIndicator("remainingPieces")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("costPerPiece")}>
              <span>Cost / piece</span>
              <span style={headerIconStyle("costPerPiece")}>{getSortIndicator("costPerPiece")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("wholesalePerPiece")}>
              <span>Wholesale / piece</span>
              <span style={headerIconStyle("wholesalePerPiece")}>{getSortIndicator("wholesalePerPiece")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("salePerPiece")}>
              <span>Sale / piece</span>
              <span style={headerIconStyle("salePerPiece")}>{getSortIndicator("salePerPiece")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("interestPerPiece")}>
              <span>Interest / piece</span>
              <span style={headerIconStyle("interestPerPiece")}>{getSortIndicator("interestPerPiece")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("stockValue")}>
              <span>Stock value</span>
              <span style={headerIconStyle("stockValue")}>{getSortIndicator("stockValue")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("expectedSaleValue")}>
              <span>Expected sale value</span>
              <span style={headerIconStyle("expectedSaleValue")}>{getSortIndicator("expectedSaleValue")}</span>
            </div>

            <div style={sortableHeaderStyle} onClick={() => handleSort("expectedInterest")}>
              <span>Expected interest</span>
              <span style={headerIconStyle("expectedInterest")}>{getSortIndicator("expectedInterest")}</span>
            </div>
          </div>

          {/* BODY ROWS */}
          {sortedRows.length === 0 ? (
            <div style={{ padding: "16px", fontSize: "14px", color: "#6b7280" }}>No items found for this shop.</div>
          ) : (
            sortedRows.map((row) => (
              <div
                key={row.itemId}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "220px 140px 90px 120px 120px 130px 90px 110px 90px 120px 110px 120px 110px 130px 130px 150px 160px",
                  gap: "4px",
                  padding: "5px 16px",
                  borderBottom: "1px solid #f3f4f6",
                  fontSize: "13px",
                  alignItems: "center",
                  whiteSpace: "nowrap",
                  backgroundColor: activeTab === "LOW_STOCK" ? "#fff7ed" : "#ffffff",
                }}
              >
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 9,
                    backgroundColor: activeTab === "LOW_STOCK" ? "#fff7ed" : "#ffffff",
                    paddingRight: "8px",
                    boxShadow: "2px 0 4px rgba(0,0,0,0.03)",
                    textAlign: "left",
                  }}
                >
                  {row.itemName}{" "}
                  <span style={{ color: "#9ca3af", fontSize: "11px" }}>(ID: {row.itemId})</span>
                </div>

                <div>{row.category || "-"}</div>

                {/* ✅ DECIMALS IMPORTANT */}
                <div>{formatQty(row.totalUnits, 2)}</div>

                <div>{formatMoney(row.defaultUnitCost)}</div>
                <div>{formatMoney(row.recentUnitCost)}</div>
                <div>{formatMoney(row.totalCostRecentUnits)}</div>

                {/* piecesPerUnit is usually integer */}
                <div>{formatInt(row.piecesPerUnit)}</div>

                {/* ✅ These may be decimals now */}
                <div>{formatQty(row.totalPieces, 2)}</div>
                <div>{formatQty(row.soldPieces, 2)}</div>
                <div>{formatQty(row.remainingPieces, 2)}</div>

                <div>{formatMoney(row.costPerPiece)}</div>
                <div>{formatMoney(row.wholesalePerPiece)}</div>
                <div>{formatMoney(row.salePerPiece)}</div>
                <div>{formatMoney(row.interestPerPiece)}</div>
                <div>{formatMoney(row.stockValue)}</div>
                <div>{formatMoney(row.expectedSaleValue)}</div>
                <div>{formatMoney(row.expectedInterest)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ShopStockPage;
