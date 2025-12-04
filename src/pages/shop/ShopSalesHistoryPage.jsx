// src/pages/shop/ShopSalesHistoryPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API_BASE = "https://iclas-bms-api-prod-pgtdc.ondigitalocean.app";

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value) || 0;
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function todayDateString() {
  const d = new Date();
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
  return d.toLocaleTimeString("en-RW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * ✅ IMPORTANT:
 * A sale is considered "open credit" ONLY when credit_balance > 0.
 * Even if it started as credit (is_credit_sale = true), once credit_balance
 * is zero it is treated as PAID in history.
 */
function isOpenCreditSale(sale) {
  const creditBalance = Number(sale?.credit_balance ?? 0);
  return creditBalance > 0;
}

function SalesHistoryPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  const [shop, setShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [error, setError] = useState("");

  // Single date selector
  const [selectedDate, setSelectedDate] = useState(todayDateString());

  // Payment filter: all / cash / card / mobile / credit
  const [paymentFilter, setPaymentFilter] = useState("all");

  // View mode: items (detail) OR receipts (summary)
  const [viewMode, setViewMode] = useState("items");

  // Sales + loading
  const [sales, setSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Stock rows to get REAL item names
  const [stockRows, setStockRows] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);

  // ---------------------------------------------------------------------------
  // Load shop info
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadShop() {
      setLoadingShop(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/shops/${shopId}`);
        if (!res.ok) throw new Error("Failed to load shop.");
        const data = await res.json();
        setShop(data);
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load shop.");
      } finally {
        setLoadingShop(false);
      }
    }

    if (shopId) {
      loadShop();
    }
  }, [shopId]);

  const shopName = shop?.name || `Shop ${shopId}`;

  // ---------------------------------------------------------------------------
  // Load stock (to map item_id -> item_name)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadStock() {
      if (!shopId) return;
      setLoadingStock(true);
      try {
        // only_positive=0 so we also get items that might now be at 0 but were sold earlier
        const res = await fetch(
          `${API_BASE}/stock/?shop_id=${shopId}&only_positive=0`
        );
        if (!res.ok) {
          console.warn(
            "Failed to load stock for history page. Status:",
            res.status
          );
          setStockRows([]);
          return;
        }
        const data = await res.json();
        setStockRows(data || []);
      } catch (err) {
        console.error("Error loading stock for history page:", err);
        setStockRows([]);
      } finally {
        setLoadingStock(false);
      }
    }

    loadStock();
  }, [shopId]);

  const stockByItemId = useMemo(() => {
    const map = {};
    for (const row of stockRows || []) {
      map[row.item_id] = row;
    }
    return map;
  }, [stockRows]);

  // ---------------------------------------------------------------------------
  // Load sales for selected date
  // ---------------------------------------------------------------------------
  const loadSales = async () => {
    if (!shopId || !selectedDate) return;
    setLoadingSales(true);
    setError("");
    try {
      // Same date for from & to: daily history
      const url = `${API_BASE}/sales/?shop_id=${shopId}&date_from=${selectedDate}&date_to=${selectedDate}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load sales history. Status: ${res.status}`);
      }
      const data = await res.json();
      setSales(data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load sales history.");
    } finally {
      setLoadingSales(false);
    }
  };

  useEffect(() => {
    loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, selectedDate]);

  // ---------------------------------------------------------------------------
  // Filter by payment / credit
  // ---------------------------------------------------------------------------
  const filteredSales = useMemo(() => {
    return (sales || []).filter((sale) => {
      const paymentType = sale.payment_type || "unknown";
      const creditOpen = isOpenCreditSale(sale);

      if (paymentFilter === "credit") {
        // Only show still-unpaid credit
        return creditOpen;
      }
      if (paymentFilter === "cash") {
        return !creditOpen && paymentType === "cash";
      }
      if (paymentFilter === "card") {
        return !creditOpen && paymentType === "card";
      }
      if (paymentFilter === "mobile") {
        return !creditOpen && paymentType === "mobile";
      }
      return true; // "all"
    });
  }, [sales, paymentFilter]);

  // ---------------------------------------------------------------------------
  // Flatten items for the "Items (detail)" view
  // ---------------------------------------------------------------------------
  const itemsRows = useMemo(() => {
    const rows = [];
    for (const sale of filteredSales || []) {
      const saleTime = sale.sale_date;
      const paymentType = sale.payment_type || "unknown";

      const creditBalance = Number(sale.credit_balance ?? 0);
      const creditOpen = creditBalance > 0; // 🔑 use balance only

      const lines = sale.lines || [];

      for (const line of lines) {
        const itemId = line.item_id;
        const stockRow = stockByItemId[itemId] || {};
        const itemName =
          stockRow.item_name ||
          stockRow.item?.name || // if backend ever returns nested item
          `Item #${itemId}`;

        const qty = Number(line.quantity || 0);
        const unitPrice = Number(line.unit_sale_price || 0);
        const total =
          line.line_sale_amount != null
            ? Number(line.line_sale_amount)
            : qty * unitPrice;
        const profit =
          line.line_profit != null ? Number(line.line_profit) : 0;

        rows.push({
          id: `${sale.id}-${line.id}`,
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

  // ---------------------------------------------------------------------------
  // Daily summary (for selected date + current filter)
  // ---------------------------------------------------------------------------
  const dailySummary = useMemo(() => {
    let totalSales = 0;
    let totalProfit = 0;
    let piecesSold = 0;
    let openCredit = 0;

    for (const sale of filteredSales || []) {
      const saleAmount = Number(sale.total_sale_amount || 0);
      const saleProfit = Number(sale.total_profit || 0);
      const creditBalance = Number(sale.credit_balance ?? 0);

      totalSales += saleAmount;
      totalProfit += saleProfit;

      if (creditBalance > 0) {
        openCredit += creditBalance;
      }
    }

    for (const row of itemsRows || []) {
      piecesSold += row.qtyPieces || 0;
    }

    return {
      totalSales,
      totalProfit,
      piecesSold,
      receiptsCount: filteredSales.length,
      openCredit,
    };
  }, [filteredSales, itemsRows]);

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------
  if (loadingShop) {
    return (
      <div style={{ padding: "24px" }}>
        <p>Loading shop...</p>
      </div>
    );
  }

  if (error && !shop) {
    return (
      <div style={{ padding: "24px", color: "red" }}>
        <p>{error}</p>
      </div>
    );
  }

  const renderItemsTable = () => {
    if (loadingSales || loadingStock) {
      return (
        <div
          style={{
            padding: "10px 4px",
            fontSize: "13px",
            color: "#6b7280",
          }}
        >
          Loading items for this day...
        </div>
      );
    }

    if (itemsRows.length === 0) {
      return (
        <div
          style={{
            padding: "10px 4px",
            fontSize: "13px",
            color: "#6b7280",
          }}
        >
          No items sold for this date / filter.
        </div>
      );
    }

    return (
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
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
            <th style={{ padding: "6px 4px" }}>Time</th>
            <th style={{ padding: "6px 4px" }}>Item</th>
            <th style={{ padding: "6px 4px", textAlign: "right" }}>Qty</th>
            <th style={{ padding: "6px 4px", textAlign: "right" }}>
              Unit price
            </th>
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
                ? "Card"
                : row.paymentType === "mobile"
                ? "Mobile"
                : row.paymentType || "N/A";

            const isCredit = row.isCreditOpen;
            const statusLabel = isCredit ? "Credit" : "Paid";
            const statusBg = isCredit ? "#fef2f2" : "#ecfdf3";
            const statusBorder = isCredit ? "#fecaca" : "#bbf7d0";
            const statusColor = isCredit ? "#b91c1c" : "#166534";

            return (
              <tr
                key={row.id}
                style={{
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                <td style={{ padding: "8px 4px" }}>
                  {formatTimeHM(row.time)}
                </td>
                <td style={{ padding: "8px 4px" }}>
                  <span
                    style={{
                      color: "#2563eb",
                      fontWeight: 600,
                    }}
                  >
                    {row.itemName}
                  </span>
                </td>
                <td
                  style={{
                    padding: "8px 4px",
                    textAlign: "right",
                  }}
                >
                  {formatMoney(row.qtyPieces)}
                </td>
                <td
                  style={{
                    padding: "8px 4px",
                    textAlign: "right",
                  }}
                >
                  {formatMoney(row.unitPrice)}
                </td>
                <td
                  style={{
                    padding: "8px 4px",
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  {formatMoney(row.total)}
                </td>
                <td
                  style={{
                    padding: "8px 4px",
                    textAlign: "right",
                  }}
                >
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
    );
  };

  const renderReceiptsTable = () => {
    if (loadingSales) {
      return (
        <div
          style={{
            padding: "10px 4px",
            fontSize: "13px",
            color: "#6b7280",
          }}
        >
          Loading receipts for this day...
        </div>
      );
    }

    if (filteredSales.length === 0) {
      return (
        <div
          style={{
            padding: "10px 4px",
            fontSize: "13px",
            color: "#6b7280",
          }}
        >
          No receipts for this date / filter.
        </div>
      );
    }

    return (
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
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
          {filteredSales.map((sale) => {
            const lines = sale.lines || [];
            const piecesCount = lines.reduce(
              (sum, l) => sum + Number(l.quantity || 0),
              0
            );
            const paymentType = sale.payment_type || "unknown";

            const creditBalance = Number(sale.credit_balance ?? 0);
            const creditOpen = creditBalance > 0; // 🔑 use balance only

            const paymentLabel =
              paymentType === "cash"
                ? "Cash"
                : paymentType === "card"
                ? "Card"
                : paymentType === "mobile"
                ? "Mobile"
                : paymentType || "N/A";

            const statusLabel = creditOpen ? "Credit" : "Paid";
            const statusBg = creditOpen ? "#fef2f2" : "#ecfdf3";
            const statusBorder = creditOpen ? "#fecaca" : "#bbf7d0";
            const statusColor = creditOpen ? "#b91c1c" : "#166534";

            return (
              <tr
                key={sale.id}
                style={{
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                <td style={{ padding: "8px 4px" }}>
                  {formatDateTime(sale.sale_date)}
                </td>
                <td style={{ padding: "8px 4px" }}>
                  {sale.customer_name ? (
                    <>
                      <span
                        style={{
                          color: "#2563eb",
                          fontWeight: 600,
                        }}
                      >
                        {sale.customer_name}
                      </span>
                      {sale.customer_phone && (
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#6b7280",
                          }}
                        >
                          {sale.customer_phone}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: "#6b7280" }}>Walk-in</span>
                  )}
                </td>
                <td
                  style={{
                    padding: "8px 4px",
                    textAlign: "right",
                  }}
                >
                  {formatMoney(piecesCount)}
                </td>
                <td
                  style={{
                    padding: "8px 4px",
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  {formatMoney(sale.total_sale_amount || 0)}
                </td>
                <td
                  style={{
                    padding: "8px 4px",
                    textAlign: "right",
                  }}
                >
                  {formatMoney(sale.total_profit || 0)}
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

  // ---------------------------------------------------------------------------
  // MAIN RENDER
  // ---------------------------------------------------------------------------
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

      <h1
        style={{
          fontSize: "30px",
          fontWeight: 800,
          letterSpacing: "0.03em",
          margin: 0,
        }}
      >
        Sales History
      </h1>
      <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>
        Select a date and view{" "}
        <strong>all items sold</strong> or <strong>all receipts</strong> for{" "}
        <strong>{shopName}</strong>.
      </p>

      {/* Date + payment filter + view mode */}
      <div
        style={{
          marginTop: "16px",
          marginBottom: "12px",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 16px",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: "13px", color: "#6b7280" }}>
          Date:&nbsp;
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: "4px 8px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              fontSize: "13px",
            }}
          />
        </div>

        <div
          style={{
            display: "inline-flex",
            backgroundColor: "#e5e7eb",
            borderRadius: "999px",
            padding: "2px",
          }}
        >
          {[
            { key: "all", label: "All payments" },
            { key: "cash", label: "Cash" },
            { key: "card", label: "Card" },
            { key: "mobile", label: "Mobile" },
            { key: "credit", label: "Credit only" },
          ].map((opt) => {
            const isActive = paymentFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPaymentFilter(opt.key)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 500,
                  backgroundColor: isActive ? "#ffffff" : "transparent",
                  color: isActive ? "#111827" : "#4b5563",
                  boxShadow: isActive
                    ? "0 2px 6px rgba(0,0,0,0.08)"
                    : "none",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

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
            { key: "items", label: "Items (detail)" },
            { key: "receipts", label: "Receipts (summary)" },
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
                  fontWeight: 500,
                  backgroundColor: isActive ? "#ffffff" : "transparent",
                  color: isActive ? "#111827" : "#4b5563",
                  boxShadow: isActive
                    ? "0 2px 6px rgba(0,0,0,0.08)"
                    : "none",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Daily summary card */}
      <div
        style={{
          marginBottom: "12px",
          backgroundColor: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
          padding: "14px 18px 14px",
          fontSize: "12px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 700,
            marginBottom: "6px",
          }}
        >
          Daily summary
        </div>
        <div
          style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#9ca3af",
            marginBottom: "8px",
          }}
        >
          {selectedDate}
        </div>

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
            <div
              style={{
                fontSize: "18px",
                fontWeight: 800,
              }}
            >
              {formatMoney(dailySummary.totalSales)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Total profit</div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#16a34a",
              }}
            >
              {formatMoney(dailySummary.totalProfit)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Pieces sold</div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
              }}
            >
              {formatMoney(dailySummary.piecesSold)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Receipts</div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
              }}
            >
              {formatMoney(dailySummary.receiptsCount)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>Open credit (created)</div>
            <div
              style={{
                fontWeight: 600,
                color: "#b91c1c",
              }}
            >
              {formatMoney(dailySummary.openCredit)}
            </div>
          </div>
        </div>
      </div>

      {/* Main table: either Items detail OR Receipts summary */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 6px 18px rgba(15,37,128,0.04)",
          padding: "10px 12px 10px",
        }}
      >
        {viewMode === "items" ? renderItemsTable() : renderReceiptsTable()}
      </div>
    </div>
  );
}

export default SalesHistoryPage;
