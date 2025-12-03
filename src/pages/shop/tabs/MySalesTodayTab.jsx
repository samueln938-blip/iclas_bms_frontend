// src/pages/shop/tabs/MySalesTodayTab.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  formatMoney,
  formatTimeHM,
  normalizePaymentType,
  todayDateString,
} from "../posUtils.js";

export default function MySalesTodayTab({
  API_BASE,
  shopId,
  isCashier,
  isAdmin,
  isManager,
  stockByItemId,
  authHeaders,
  authHeadersNoJson,
  onRefreshStock,
  setError,
  setMessage,
  clearAlerts,

  // ✅ Parent handler: switch to Current sale tab and start editing a sale (SalesPOS passes this)
  onEditSale,
}) {
  const [salesToday, setSalesToday] = useState([]);
  const [loadingSalesToday, setLoadingSalesToday] = useState(false);

  const [todayFilter, setTodayFilter] = useState("all"); // all|paid|credit
  const [todayPaymentFilter, setTodayPaymentFilter] = useState("all"); // all|cash|card|mobile|credit
  const [todayView, setTodayView] = useState("items"); // items|receipts|customers

  // receipt-details is only for Receipts tab
  const [selectedSaleId, setSelectedSaleId] = useState(null);

  const [todaySystemTotals, setTodaySystemTotals] = useState(null);

  // ✅ New: canonical summary from /sales/today/ (keeps in sync with Daily Closure)
  const [todayCanonicalSummary, setTodayCanonicalSummary] = useState(null);
  const [loadingCanonicalSummary, setLoadingCanonicalSummary] = useState(false);

  // ============================================================
  // EDIT HANDOFF: click item -> open Current sale tab to edit
  // We store saleId (+ optional lineId) in localStorage so CurrentSaleTab can auto-load.
  // ============================================================
  const startEditReceipt = (saleId, saleLineId) => {
    const sid = saleId != null ? Number(saleId) : null;
    const slid = saleLineId != null ? Number(saleLineId) : null;
    if (!sid) return;

    // Persist edit intent for CurrentSaleTab
    try {
      localStorage.setItem("iclas_edit_sale_id", String(sid));
      if (slid != null) localStorage.setItem("iclas_edit_sale_line_id", String(slid));
      else localStorage.removeItem("iclas_edit_sale_line_id");
    } catch {
      // ignore
    }

    // Prefer parent-driven navigation (SalesPOS will set tab=current & editSaleId in URL)
    try {
      onEditSale?.(sid);
      return;
    } catch {
      // ignore
    }

    // Fallback (if parent handler not passed): emit event (works only if CurrentSaleTab is mounted)
    try {
      window.dispatchEvent(
        new CustomEvent("iclas:edit-sale", {
          detail: { saleId: sid, saleLineId: slid, openTab: "current" },
        })
      );
    } catch {
      // ignore
    }
  };

  const loadSalesToday = async () => {
    setLoadingSalesToday(true);
    try {
      const today = todayDateString();
      const url = `${API_BASE}/sales/?shop_id=${shopId}&date_from=${today}&date_to=${today}`;
      const res = await fetch(url, { headers: authHeadersNoJson });
      if (!res.ok) return;
      const data = await res.json();
      setSalesToday(data || []);
    } catch (err) {
      console.error("Error loading today's sales:", err);
    } finally {
      setLoadingSalesToday(false);
    }
  };

  const loadTodaySystemTotals = async () => {
    try {
      const today = todayDateString();
      const totalsUrl = `${API_BASE}/daily-closures/system-totals?shop_id=${shopId}&closure_date=${today}`;
      const res = await fetch(totalsUrl, { headers: authHeadersNoJson });
      if (!res.ok) {
        setTodaySystemTotals(null);
        return;
      }
      const data = await res.json();
      setTodaySystemTotals(data);
    } catch (err) {
      console.error("Error loading today system totals:", err);
      setTodaySystemTotals(null);
    }
  };

  // ✅ NEW: canonical summary from /sales/today/ (same logic as Daily Closure cards)
  const loadTodayCanonicalSummary = async () => {
    setLoadingCanonicalSummary(true);
    try {
      const url = `${API_BASE}/sales/today/?shop_id=${shopId}`;
      const res = await fetch(url, { headers: authHeadersNoJson });
      if (!res.ok) {
        setTodayCanonicalSummary(null);
        return;
      }
      const json = await res.json();
      setTodayCanonicalSummary(json?.summary || null);
    } catch (err) {
      console.error("Error loading canonical sales today summary:", err);
      setTodayCanonicalSummary(null);
    } finally {
      setLoadingCanonicalSummary(false);
    }
  };

  useEffect(() => {
    if (!shopId) return;
    loadSalesToday();
    loadTodaySystemTotals();
    loadTodayCanonicalSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const todayCreditPayers = Number(
    todaySystemTotals?.credit_payers_count_today ??
      todaySystemTotals?.credit_payers_today ??
      0
  );
  const totalProfitRealizedToday = Number(
    todaySystemTotals?.total_profit_realized_today ??
      todaySystemTotals?.total_profit ??
      0
  );

  const summaryToday = useMemo(() => {
    let totalSales = 0;
    let totalProfitCreated = 0;
    let totalPieces = 0;
    let totalCreditCreated = 0;

    for (const sale of salesToday || []) {
      const saleAmount = Number(sale.total_sale_amount || 0);
      const saleProfit = Number(sale.total_profit || 0);
      const isCredit = !!sale.is_credit_sale;

      totalSales += saleAmount;
      totalProfitCreated += saleProfit;

      if (isCredit) {
        const bal =
          sale.credit_balance != null
            ? Number(sale.credit_balance || 0)
            : Math.max(
                0,
                saleAmount - Number(sale.amount_collected_now || 0)
              );
        totalCreditCreated += Math.max(0, bal);
      }

      const lines = sale.lines || [];
      for (const line of lines)
        totalPieces += Number(line.quantity || line.quantity_pieces || 0);
    }

    return {
      totalSales,
      totalProfitCreated,
      totalPieces,
      totalCreditCreated,
      receiptsCount: (salesToday || []).length,
    };
  }, [salesToday]);

  // ============================================================
  // ✅ TODAY SUMMARY: 3 cards driven by canonical summary
  // /sales/today/ → summary.sales_collected_by_type, summary.credit_paid_by_type, summary.collected_by_type
  // each: { cash, momo, pos, other }
  // We convert momo→mobile, pos→card for UI.
  // ============================================================
  function bucketsToUi(b) {
    if (!b) b = {};
    return {
      cash: Number(b.cash || 0),
      mobile: Number(b.momo || 0),
      card: Number(b.pos || 0),
    };
  }

  const todayByPayment = useMemo(() => {
    if (todayCanonicalSummary) {
      const s = todayCanonicalSummary;

      const current = bucketsToUi(s.sales_collected_by_type);
      const creditPayments = bucketsToUi(s.credit_paid_by_type);
      const total = bucketsToUi(s.collected_by_type);

      return {
        current,
        creditPayments,
        total,
        sums: {
          current: current.cash + current.mobile + current.card,
          credit:
            creditPayments.cash +
            creditPayments.mobile +
            creditPayments.card,
          total: total.cash + total.mobile + total.card,
        },
      };
    }

    // Fallback: if canonical summary is missing, show zeros instead of lying.
    const zero = { cash: 0, mobile: 0, card: 0 };
    return {
      current: zero,
      creditPayments: zero,
      total: zero,
      sums: { current: 0, credit: 0, total: 0 },
    };
  }, [todayCanonicalSummary]);

  const SummaryCard = ({ title, big, rows }) => (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "18px",
        padding: "12px 14px",
        background: "#ffffff",
        opacity: loadingCanonicalSummary ? 0.6 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: "12px",
            color: "#6b7280",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: "18px", fontWeight: 900 }}>
          {formatMoney(big)}
        </div>
      </div>

      <div
        style={{
          marginTop: 8,
          display: "grid",
          gap: 6,
          color: "#6b7280",
          fontSize: "12px",
        }}
      >
        {rows.map((r) => (
          <div
            key={r.label}
            style={{ display: "flex", justifyContent: "space_between", gap: 10 }}
          >
            <span>{r.label}</span>
            <strong style={{ color: "#111827" }}>
              {formatMoney(r.value)}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );

  const flattenedItemsToday = useMemo(() => {
    const rows = [];
    for (const sale of salesToday || []) {
      const saleDate = sale.sale_date;
      const paymentType = normalizePaymentType(sale.payment_type);
      const isCreditSaleRow = !!sale.is_credit_sale;

      const creditBalance = isCreditSaleRow
        ? Number(
            sale.credit_balance ??
              Math.max(
                0,
                Number(sale.total_sale_amount || 0) -
                  Number(sale.amount_collected_now || 0)
              )
          )
        : 0;

      const dueDate =
        sale.due_date ||
        sale.credit_due_date ||
        sale.customer_due_date ||
        sale.dueDate ||
        null;

      const lines = sale.lines || [];
      for (const line of lines) {
        const stockRow = stockByItemId[line.item_id] || {};
        const itemName =
          line.item_name ||
          stockRow.item_name ||
          `Item #${line.item_id}`;
        const qty = Number(line.quantity || line.quantity_pieces || 0);
        const unitPrice = Number(
          line.unit_sale_price || line.sale_price_per_piece || 0
        );

        const lineTotal =
          line.line_sale_amount != null
            ? Number(line.line_sale_amount)
            : qty * unitPrice;
        const lineProfit =
          line.line_profit != null ? Number(line.line_profit) : 0;

        rows.push({
          id: `${sale.id}-${line.id}`,
          saleId: sale.id,
          saleLineId: line.id,
          time: saleDate,
          itemId: line.item_id,
          itemName,
          qtyPieces: qty,
          unitPrice,
          total: lineTotal,
          profit: lineProfit,
          paymentType,
          isCreditSale: isCreditSaleRow,
          creditBalance,
          customerName: sale.customer_name || "",
          customerPhone: sale.customer_phone || "",
          dueDate,
        });
      }
    }
    return rows;
  }, [salesToday, stockByItemId]);

  const receiptsToday = useMemo(() => {
    return (salesToday || []).map((sale) => {
      const isCredit = !!sale.is_credit_sale;
      const payment = isCredit
        ? "credit"
        : normalizePaymentType(sale.payment_type);
      const total = Number(sale.total_sale_amount || 0);
      const profit = Number(sale.total_profit || 0);
      const collected = Number(
        sale.amount_collected_now ?? (isCredit ? 0 : total)
      );
      const balance = Number(
        sale.credit_balance ?? (isCredit ? total : 0)
      );
      const dueDate =
        sale.due_date ||
        sale.credit_due_date ||
        sale.customer_due_date ||
        null;

      return {
        id: sale.id,
        time: sale.sale_date,
        customerName: sale.customer_name || "",
        customerPhone: sale.customer_phone || "",
        isCredit,
        payment,
        total,
        profit,
        collected,
        balance,
        dueDate,
        lines: sale.lines || [],
      };
    });
  }, [salesToday]);

  const customersTodayRollup = useMemo(() => {
    const map = new Map();
    for (const r of receiptsToday) {
      const key = `${(r.customerName || "").trim()}||${(
        r.customerPhone || ""
      ).trim()}`.trim();
      const label = r.customerName
        ? `${r.customerName}${
            r.customerPhone ? ` (${r.customerPhone})` : ""
          }`
        : "Unknown customer";

      if (!map.has(key))
        map.set(key, {
          key,
          label,
          receipts: 0,
          totalBought: 0,
          creditCreated: 0,
          creditBalance: 0,
          collectedToday: 0,
        });

      const agg = map.get(key);
      agg.receipts += 1;
      agg.totalBought += r.total;
      agg.collectedToday += r.collected;

      if (r.isCredit) {
        agg.creditCreated += r.total;
        agg.creditBalance += r.balance;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (b.totalBought || 0) - (a.totalBought || 0)
    );
  }, [receiptsToday]);

  const filteredItemsToday = useMemo(() => {
    let rows = flattenedItemsToday;

    if (todayFilter === "credit")
      rows = rows.filter((row) => row.isCreditSale);
    else if (todayFilter === "paid")
      rows = rows.filter((row) => !row.isCreditSale);

    if (todayPaymentFilter !== "all") {
      if (todayPaymentFilter === "credit")
        rows = rows.filter((r) => r.isCreditSale);
      else
        rows = rows.filter(
          (r) =>
            !r.isCreditSale &&
            (r.paymentType || "") === todayPaymentFilter
        );
    }

    return rows;
  }, [flattenedItemsToday, todayFilter, todayPaymentFilter]);

  const selectedReceipt = useMemo(() => {
    if (!selectedSaleId) return null;
    return (
      receiptsToday.find(
        (r) => Number(r.id) === Number(selectedSaleId)
      ) || null
    );
  }, [selectedSaleId, receiptsToday]);

  const renderSaleDetails = () => {
    if (todayView !== "receipts") return null;
    if (!selectedReceipt) return null;

    const customerLabel = selectedReceipt.customerName
      ? `${selectedReceipt.customerName}${
          selectedReceipt.customerPhone
            ? ` (${selectedReceipt.customerPhone})`
            : ""
        }`
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div>
            <div style={{ fontSize: "14px", fontWeight: 900 }}>
              Sale details
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginTop: "2px",
              }}
            >
              Receipt #{selectedReceipt.id} ·{" "}
              {formatTimeHM(selectedReceipt.time)} · {paymentLabel}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>
              Customer: <strong>{customerLabel}</strong>
              {selectedReceipt.dueDate
                ? ` · Due: ${String(
                    selectedReceipt.dueDate
                  ).slice(0, 10)}`
                : ""}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#9ca3af",
                marginTop: "4px",
              }}
            >
              Tip: click a line below to edit that receipt in{" "}
              <strong>Current sale</strong>.
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
            }}
          >
            Close ✕
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
            marginTop: "12px",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>
              Total
            </div>
            <div
              style={{ fontSize: "18px", fontWeight: 900 }}
            >
              {formatMoney(selectedReceipt.total)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>
              Profit
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 800,
                color: "#16a34a",
              }}
            >
              {formatMoney(selectedReceipt.profit)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>
              Collected now
            </div>
            <div
              style={{ fontSize: "16px", fontWeight: 800 }}
            >
              {formatMoney(selectedReceipt.collected)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>
              Credit balance
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 900,
                color:
                  selectedReceipt.balance > 0
                    ? "#b91c1c"
                    : "#166534",
              }}
            >
              {formatMoney(selectedReceipt.balance)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "12px" }}>
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
                <th style={{ padding: "6px 4px" }}>Item</th>
                <th
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                  }}
                >
                  Qty
                </th>
                <th
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                  }}
                >
                  Unit
                </th>
                <th
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                  }}
                >
                  Total
                </th>
                <th
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                  }}
                >
                  Profit
                </th>
              </tr>
            </thead>
            <tbody>
              {(selectedReceipt.lines || []).map((line) => {
                const itemName =
                  line.item_name ||
                  stockByItemId[line.item_id]?.item_name ||
                  `Item #${line.item_id}`;
                const qty = Number(
                  line.quantity || line.quantity_pieces || 0
                );
                const unit = Number(
                  line.unit_sale_price ||
                    line.sale_price_per_piece ||
                    0
                );
                const total =
                  line.line_sale_amount != null
                    ? Number(line.line_sale_amount)
                    : qty * unit;
                const profit =
                  line.line_profit != null
                    ? Number(line.line_profit)
                    : 0;

                return (
                  <tr
                    key={line.id || `${selectedReceipt.id}-${line.item_id}`}
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      cursor: "pointer",
                    }}
                    title="Click to edit this receipt in Current sale"
                    onClick={() => {
                      setSelectedSaleId(null);
                      startEditReceipt(
                        selectedReceipt.id,
                        line.id ?? null
                      );
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 4px",
                        color: "#2563eb",
                        fontWeight: 700,
                      }}
                    >
                      {itemName}
                    </td>
                    <td
                      style={{
                        padding: "8px 4px",
                        textAlign: "right",
                      }}
                    >
                      {formatMoney(qty)}
                    </td>
                    <td
                      style={{
                        padding: "8px 4px",
                        textAlign: "right",
                      }}
                    >
                      {formatMoney(unit)}
                    </td>
                    <td
                      style={{
                        padding: "8px 4px",
                        textAlign: "right",
                        fontWeight: 700,
                      }}
                    >
                      {formatMoney(total)}
                    </td>
                    <td
                      style={{
                        padding: "8px 4px",
                        textAlign: "right",
                      }}
                    >
                      {formatMoney(profit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const handleCancelLine = async (saleId, saleLineId) => {
    if (!saleId || !saleLineId) return;
    if (!(isAdmin || isManager)) return;

    const confirmCancel = window.confirm(
      "Cancel this item from the sale and return it to stock?"
    );
    if (!confirmCancel) return;

    try {
      clearAlerts?.();

      const res = await fetch(
        `${API_BASE}/sales/${saleId}/cancel-line`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ sale_line_id: saleLineId }),
        }
      );

      if (!res.ok) {
        let detailMessage = `Failed to cancel item. Status: ${res.status}`;
        try {
          const errData = await res.json();
          if (errData?.detail) {
            if (Array.isArray(errData.detail))
              detailMessage = errData.detail
                .map((d) => d.msg || JSON.stringify(d))
                .join(" | ");
            else if (typeof errData.detail === "string")
              detailMessage = errData.detail;
            else
              detailMessage = JSON.stringify(errData.detail);
          }
        } catch {
          // ignore
        }
        throw new Error(detailMessage);
      }

      await res.json();
      setMessage?.("Item cancelled and stock updated.");

      await loadSalesToday();
      await loadTodaySystemTotals();
      await loadTodayCanonicalSummary();
      await onRefreshStock?.();
    } catch (err) {
      console.error(err);
      setError?.(err.message || "Failed to cancel item from sale.");
    }
  };

  return (
    <div style={{ marginTop: "16px" }}>
      {/* Summary card */}
      <div
        style={{
          marginBottom: "14px",
          backgroundColor: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
          padding: "14px 18px 14px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "10px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 700,
                marginBottom: "6px",
              }}
            >
              Today summary
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
              All sales made today in this shop
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "4px 10px",
                borderRadius: "999px",
                backgroundColor: "#f3f4f6",
                color: "#111827",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              Credit payers: {formatMoney(todayCreditPayers)}
            </span>
            <button
              type="button"
              onClick={() => {
                loadSalesToday();
                loadTodaySystemTotals();
                loadTodayCanonicalSummary();
              }}
              style={{
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                borderRadius: "999px",
                padding: "6px 10px",
                fontSize: "12px",
                cursor: "pointer",
              }}
              title="Refresh"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* ✅ 3 big cards driven by canonical /sales/today/ summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "10px",
            marginTop: "8px",
          }}
        >
          <SummaryCard
            title="Current sale"
            big={todayByPayment.sums.current}
            rows={[
              { label: "Cash", value: todayByPayment.current.cash },
              { label: "MoMo", value: todayByPayment.current.mobile },
              { label: "POS", value: todayByPayment.current.card },
            ]}
          />

          <SummaryCard
            title="Credit"
            big={todayByPayment.sums.credit}
            rows={[
              {
                label: "Cash",
                value: todayByPayment.creditPayments.cash,
              },
              {
                label: "MoMo",
                value: todayByPayment.creditPayments.mobile,
              },
              {
                label: "POS",
                value: todayByPayment.creditPayments.card,
              },
            ]}
          />

          <SummaryCard
            title="Total"
            big={todayByPayment.sums.total}
            rows={[
              { label: "Cash", value: todayByPayment.total.cash },
              { label: "MoMo", value: todayByPayment.total.mobile },
              { label: "POS", value: todayByPayment.total.card },
            ]}
          />
        </div>

        {/* Existing overall stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            rowGap: "8px",
            columnGap: "16px",
            fontSize: "12px",
            marginTop: "10px",
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
              {formatMoney(summaryToday.totalSales)}
            </div>
          </div>

          <div>
            <div style={{ color: "#6b7280" }}>
              Profit (realized today)
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#16a34a",
              }}
            >
              {formatMoney(totalProfitRealizedToday)}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#9ca3af",
              }}
              title="This includes profit from credit payments made today"
            >
              Created: {formatMoney(summaryToday.totalProfitCreated)}
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
              {formatMoney(summaryToday.totalPieces)}
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
              {formatMoney(summaryToday.receiptsCount)}
            </div>
          </div>
        </div>
      </div>

      {/* View switch + filters */}
      <div
        style={{
          marginBottom: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            backgroundColor: "#e5e7eb",
            borderRadius: "999px",
            padding: "2px",
          }}
        >
          {[
            { key: "items", label: "Items" },
            { key: "receipts", label: "Receipts" },
            { key: "customers", label: "Customers" },
          ].map((opt) => {
            const isActive = todayView === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setTodayView(opt.key);
                  setSelectedSaleId(null);
                }}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 12px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 700,
                  backgroundColor: isActive
                    ? "#ffffff"
                    : "transparent",
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
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
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
              { key: "paid", label: "Paid only" },
              { key: "credit", label: "Credit only" },
            ].map((opt) => {
              const isActive = todayFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTodayFilter(opt.key)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 600,
                    backgroundColor: isActive
                      ? "#ffffff"
                      : "transparent",
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

          <select
            value={todayPaymentFilter}
            onChange={(e) => setTodayPaymentFilter(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              backgroundColor: "#fff",
              fontSize: "12px",
            }}
            title="Payment filter"
          >
            <option value="all">Payment: All</option>
            <option value="cash">Cash</option>
            <option value="mobile">MoMo</option>
            <option value="card">POS</option>
            <option value="credit">Credit</option>
          </select>
        </div>
      </div>

      {/* Receipts-only details */}
      {renderSaleDetails()}

      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 6px 18px rgba(15,37,128,0.04)",
          padding: "10px 12px 10px",
        }}
      >
        {loadingSalesToday ? (
          <div
            style={{
              padding: "10px 4px",
              fontSize: "13px",
              color: "#6b7280",
            }}
          >
            Loading today&apos;s sales...
          </div>
        ) : todayView === "items" ? (
          filteredItemsToday.length === 0 ? (
            <div
              style={{
                padding: "10px 4px",
                fontSize: "13px",
                color: "#6b7280",
              }}
            >
              No sales recorded today for this filter.
            </div>
          ) : (
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
                  <th style={{ padding: "6px 4px" }}>Customer</th>
                  <th style={{ padding: "6px 4px" }}>Due</th>
                  <th
                    style={{
                      padding: "6px 4px",
                      textAlign: "right",
                    }}
                  >
                    Qty
                  </th>
                  <th
                    style={{
                      padding: "6px 4px",
                      textAlign: "right",
                    }}
                  >
                    Unit price
                  </th>
                  <th
                    style={{
                      padding: "6px 4px",
                      textAlign: "right",
                    }}
                  >
                    Total
                  </th>
                  <th
                    style={{
                      padding: "6px 4px",
                      textAlign: "right",
                    }}
                  >
                    Profit
                  </th>
                  <th style={{ padding: "6px 4px" }}>Payment</th>
                  <th style={{ padding: "6px 4px" }}>Status</th>
                  {!isCashier && (
                    <th style={{ padding: "6px 4px" }}></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredItemsToday.map((row) => {
                  const isOpenCredit =
                    row.isCreditSale &&
                    Number(row.creditBalance || 0) > 0;
                  const isSettledCredit =
                    row.isCreditSale && !isOpenCredit;

                  const statusLabel = isOpenCredit
                    ? "Credit (Open)"
                    : isSettledCredit
                    ? "Paid (Credit settled)"
                    : "Paid";

                  const statusBg = isOpenCredit
                    ? "#fef2f2"
                    : "#ecfdf3";
                  const statusBorder = isOpenCredit
                    ? "#fecaca"
                    : "#bbf7d0";
                  const statusColor = isOpenCredit
                    ? "#b91c1c"
                    : "#166534";

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
                    ? `${row.customerName}${
                        row.customerPhone
                          ? ` (${row.customerPhone})`
                          : ""
                      }`
                    : "-";
                  const dueLabel = row.dueDate
                    ? String(row.dueDate).slice(0, 10)
                    : "-";

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

                      {/* ✅ Click item = Edit receipt in Current Sale */}
                      <td style={{ padding: "8px 4px" }}>
                        <div
                          role="button"
                          tabIndex={0}
                          title={`Click to edit receipt #${row.saleId}`}
                          onClick={() =>
                            startEditReceipt(
                              row.saleId,
                              row.saleLineId
                            )
                          }
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" ||
                              e.key === " "
                            )
                              startEditReceipt(
                                row.saleId,
                                row.saleLineId
                              );
                          }}
                          style={{
                            cursor: "pointer",
                            userSelect: "none",
                            display: "inline-block",
                            maxWidth: "100%",
                          }}
                        >
                          <span
                            style={{
                              color: "#2563eb",
                              fontWeight: 700,
                            }}
                          >
                            {row.itemName}
                          </span>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#9ca3af",
                              marginTop: "2px",
                            }}
                          >
                            Receipt #{row.saleId}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "8px 4px" }}>
                        {customerLabel}
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        {dueLabel}
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

                      {!isCashier && (
                        <td
                          style={{
                            padding: "8px 4px",
                            textAlign: "center",
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelLine(
                                row.saleId,
                                row.saleLineId
                              );
                            }}
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "999px",
                              border: "1px solid #fecaca",
                              backgroundColor: "#fef2f2",
                              color: "#b91c1c",
                              fontSize: "14px",
                              cursor: "pointer",
                            }}
                            title="Cancel this item"
                            disabled={!(isAdmin || isManager)}
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : todayView === "receipts" ? (
          receiptsToday.length === 0 ? (
            <div
              style={{
                padding: "10px 4px",
                fontSize: "13px",
                color: "#6b7280",
              }}
            >
              No receipts today.
            </div>
          ) : (
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
                  <th style={{ padding: "6px 4px" }}>Receipt</th>
                  <th style={{ padding: "6px 4px" }}>Customer</th>
                  <th style={{ padding: "6px 4px" }}>Payment</th>
                  <th
                    style={{
                      padding: "6px 4px",
                      textAlign: "right",
                    }}
                  >
                    Total
                  </th>
                  <th
                    style={{
                      padding: "6px 4px",
                      textAlign: "right",
                    }}
                  >
                    Profit
                  </th>
                  <th
                    style={{
                      padding: "6px 4px",
                      textAlign: "right",
                    }}
                  >
                    Balance
                  </th>
                  <th style={{ padding: "6px 4px" }}></th>
                </tr>
              </thead>
              <tbody>
                {receiptsToday.map((r) => {
                  const customerLabel = r.customerName
                    ? `${r.customerName}${
                        r.customerPhone
                          ? ` (${r.customerPhone})`
                          : ""
                      }`
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
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <td style={{ padding: "8px 4px" }}>
                        {formatTimeHM(r.time)}
                      </td>
                      <td
                        style={{
                          padding: "8px 4px",
                          fontWeight: 800,
                        }}
                      >
                        #{r.id}
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        {customerLabel}
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        {paymentLabel}
                      </td>
                      <td
                        style={{
                          padding: "8px 4px",
                          textAlign: "right",
                          fontWeight: 800,
                        }}
                      >
                        {formatMoney(r.total)}
                      </td>
                      <td
                        style={{
                          padding: "8px 4px",
                          textAlign: "right",
                          color: "#16a34a",
                        }}
                      >
                        {formatMoney(r.profit)}
                      </td>
                      <td
                        style={{
                          padding: "8px 4px",
                          textAlign: "right",
                          color:
                            r.balance > 0
                              ? "#b91c1c"
                              : "#166534",
                          fontWeight: 800,
                        }}
                      >
                        {formatMoney(r.balance)}
                      </td>
                      <td
                        style={{
                          padding: "8px 4px",
                          textAlign: "right",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedSaleId(r.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "999px",
                            border: "1px solid #e5e7eb",
                            backgroundColor: "#fff",
                            cursor: "pointer",
                            fontSize: "12px",
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
          )
        ) : customersTodayRollup.length === 0 ? (
          <div
            style={{
              padding: "10px 4px",
              fontSize: "13px",
              color: "#6b7280",
            }}
          >
            No customers today.
          </div>
        ) : (
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
                <th style={{ padding: "6px 4px" }}>Customer</th>
                <th
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                  }}
                >
                  Receipts
                </th>
                <th
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                  }}
                >
                  Total bought
                </th>
                <th
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                  }}
                >
                  Collected
                </th>
                <th
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                  }}
                >
                  Credit balance
                </th>
              </tr>
            </thead>
            <tbody>
              {customersTodayRollup.map((c) => (
                <tr
                  key={c.key}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <td
                    style={{
                      padding: "8px 4px",
                      fontWeight: 800,
                    }}
                  >
                    {c.label}
                  </td>
                  <td
                    style={{
                      padding: "8px 4px",
                      textAlign: "right",
                    }}
                  >
                    {formatMoney(c.receipts)}
                  </td>
                  <td
                    style={{
                      padding: "8px 4px",
                      textAlign: "right",
                      fontWeight: 800,
                    }}
                  >
                    {formatMoney(c.totalBought)}
                  </td>
                  <td
                    style={{
                      padding: "8px 4px",
                      textAlign: "right",
                    }}
                  >
                    {formatMoney(c.collectedToday)}
                  </td>
                  <td
                    style={{
                      padding: "8px 4px",
                      textAlign: "right",
                      fontWeight: 900,
                      color:
                        c.creditBalance > 0
                          ? "#b91c1c"
                          : "#166534",
                    }}
                  >
                    {formatMoney(c.creditBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
