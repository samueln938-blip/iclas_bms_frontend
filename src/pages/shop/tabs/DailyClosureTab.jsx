// FILE: src/pages/shop/tabs/DailyClosureTab.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { formatMoney, parseAmount, todayDateString } from "../posUtils.js";

/**
 * Money input that:
 * - Lets you type naturally (including delete/backspace)
 * - Automatically formats with commas
 * - Keeps cursor position stable (so it doesn't feel "mechanical")
 */
function MoneyInput({ value, onChange, placeholder, onTouched }) {
  const ref = useRef(null);

  const formatWithCommas = (digits) => {
    if (!digits) return "";
    // remove leading zeros but keep single "0"
    const clean = digits.replace(/^0+(?=\d)/, "");
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const countDigitsBeforeCursor = (s, cursorIdx) => {
    let count = 0;
    for (let i = 0; i < Math.max(0, cursorIdx); i++) {
      if (/\d/.test(s[i])) count++;
    }
    return count;
  };

  const cursorIndexForDigitsCount = (formatted, digitCount) => {
    if (digitCount <= 0) return 0;
    let count = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) count++;
      if (count >= digitCount) return i + 1;
    }
    return formatted.length;
  };

  const handleChange = (e) => {
    onTouched?.();

    const raw = e.target.value || "";
    const cursor = e.target.selectionStart ?? raw.length;

    const digitsBefore = countDigitsBeforeCursor(raw, cursor);

    // Keep digits only
    const digitsOnly = raw.replace(/[^\d]/g, "");
    const formatted = formatWithCommas(digitsOnly);

    onChange(formatted);

    // Restore cursor on next frame after state updates
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const nextCursor = cursorIndexForDigitsCount(formatted, digitsBefore);
      try {
        el.setSelectionRange(nextCursor, nextCursor);
      } catch {
        // ignore
      }
    });
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid #d1d5db",
        fontSize: 13,
        textAlign: "right",
      }}
    />
  );
}

export default function DailyClosureTab({
  API_BASE,
  shopId,
  authHeaders,
  authHeadersNoJson,
  setError,
  setMessage,
  clearAlerts,
  // 🔑 new props
  closureDate, // string "YYYY-MM-DD" from URL / SalesPOS
  isCashier,
  isManager,
  isOwner,
  isAdmin, // ✅ NEW: admin flag so admin can edit past days
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 🔑 Decide which date this tab is working on
  const todayStr = todayDateString();
  const dateStr = closureDate || todayStr;
  const isToday = dateStr === todayStr;

  // Owner, Manager & Admin are allowed to work on past days
  const canEditPast = !!(isOwner || isManager || isAdmin);
  const isPastDate = !isToday;
  const isLockedReadOnly = isPastDate && !canEditPast;

  // System totals from backend (single source of truth)
  const [system, setSystem] = useState(null);

  // Expense summary (direct from /expenses/summary as a cross-check)
  const [expenseSummary, setExpenseSummary] = useState(null);

  // Last saved closure row (info only)
  const [lastClosure, setLastClosure] = useState(null);

  // Cashier pad (what you count physically)
  const [cashDrawer, setCashDrawer] = useState("");
  const [momoDrawer, setMomoDrawer] = useState("");
  const [posDrawer, setPosDrawer] = useState("");

  // prevent auto-refresh from overwriting what cashier is typing
  const touchedRef = useRef(false);
  const markTouched = () => {
    touchedRef.current = true;
  };

  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const diffColor = (v) => {
    if (Math.abs(v) < 1) return "#6b7280";
    return v >= 0 ? "#16a34a" : "#b91c1c";
  };

  // -------------------------
  // Abort + latest-wins guards
  // -------------------------
  const sysAbortRef = useRef(null);
  const expAbortRef = useRef(null);
  const lastAbortRef = useRef(null);

  const sysReqIdRef = useRef(0);
  const expReqIdRef = useRef(0);
  const lastReqIdRef = useRef(0);

  // Simple throttle: avoid burst refresh calls (focus + interval + events)
  const lastRefreshTickRef = useRef(0);
  const shouldThrottle = (minMs = 1500) => {
    const now = Date.now();
    if (now - lastRefreshTickRef.current < minMs) return true;
    lastRefreshTickRef.current = now;
    return false;
  };

  // ------------------------------------------------------------
  // Load system totals from /daily-closures/system-totals for this date
  // ------------------------------------------------------------
  const loadSystemTotals = useCallback(
    async ({ silent = false } = {}) => {
      if (!shopId || !dateStr) return;

      // Abort previous
      if (sysAbortRef.current) sysAbortRef.current.abort();
      const controller = new AbortController();
      sysAbortRef.current = controller;

      const reqId = ++sysReqIdRef.current;

      if (!silent) {
        setLoading(true);
        clearAlerts?.();
        setMessage?.("");
      }

      try {
        const url = `${API_BASE}/daily-closures/system-totals?shop_id=${shopId}&closure_date=${dateStr}`;
        const res = await fetch(url, {
          headers: authHeadersNoJson,
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Failed to load system totals (HTTP ${res.status}): ${txt}`);
        }

        const data = await res.json();

        // latest-wins guard
        if (reqId !== sysReqIdRef.current) return;

        setSystem(data || null);
        setLastRefreshedAt(new Date());
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error(err);

        if (reqId !== sysReqIdRef.current) return;

        setError?.(err?.message || "Failed to load daily closure totals.");
      } finally {
        if (!silent && reqId === sysReqIdRef.current) setLoading(false);
      }
    },
    [API_BASE, shopId, dateStr, authHeadersNoJson, clearAlerts, setError, setMessage]
  );

  // ------------------------------------------------------------
  // Load expense summary directly from expenses router
  // ------------------------------------------------------------
  const loadExpenseSummary = useCallback(
    async ({ silent = true } = {}) => {
      if (!shopId || !dateStr) return;

      if (expAbortRef.current) expAbortRef.current.abort();
      const controller = new AbortController();
      expAbortRef.current = controller;

      const reqId = ++expReqIdRef.current;

      try {
        const url = `${API_BASE}/expenses/summary?shop_id=${shopId}&expense_date=${dateStr}`;
        const res = await fetch(url, {
          headers: authHeadersNoJson,
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return; // don't break the tab if summary isn't available
        const data = await res.json();

        if (reqId !== expReqIdRef.current) return;

        setExpenseSummary(data || null);
      } catch (err) {
        if (err?.name === "AbortError") return;
        // ignore
      } finally {
        // no-op
      }
    },
    [API_BASE, shopId, dateStr, authHeadersNoJson]
  );

  // ------------------------------------------------------------
  // Load last saved closure for this day (info only)
  // ------------------------------------------------------------
  const loadLastClosure = useCallback(async () => {
    if (!shopId || !dateStr) return;

    if (lastAbortRef.current) lastAbortRef.current.abort();
    const controller = new AbortController();
    lastAbortRef.current = controller;

    const reqId = ++lastReqIdRef.current;

    try {
      const url = `${API_BASE}/daily-closures/${shopId}/${dateStr}`;
      const res = await fetch(url, {
        headers: authHeadersNoJson,
        signal: controller.signal,
        cache: "no-store",
      });

      if (res.status === 404) {
        if (reqId !== lastReqIdRef.current) return;
        setLastClosure(null);
        return;
      }
      if (!res.ok) return;

      const data = await res.json();

      if (reqId !== lastReqIdRef.current) return;

      setLastClosure(data || null);

      // Restore cashier pad from last saved ONLY if user hasn't started typing
      if (data && !touchedRef.current) {
        const c = Number(data.cash_amount || 0);
        const p = Number(data.pos_amount || 0);
        const m = Number(data.momo_amount || 0);
        setCashDrawer(c ? formatMoney(c) : "");
        setPosDrawer(p ? formatMoney(p) : "");
        setMomoDrawer(m ? formatMoney(m) : "");
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      // ignore
    }
  }, [API_BASE, shopId, dateStr, authHeadersNoJson]);

  const refreshAll = useCallback(
    async ({ silent = false, throttleMs = 1500 } = {}) => {
      if (!shopId || !dateStr) return;
      if (shouldThrottle(throttleMs)) return;

      await Promise.all([loadSystemTotals({ silent }), loadExpenseSummary({ silent: true }), loadLastClosure()]);
    },
    [shopId, dateStr, loadSystemTotals, loadExpenseSummary, loadLastClosure]
  );

  // Reload everything whenever the date changes (today or past)
  useEffect(() => {
    touchedRef.current = false;
    setSystem(null);
    setExpenseSummary(null);
    setLastClosure(null);
    setCashDrawer("");
    setMomoDrawer("");
    setPosDrawer("");
    refreshAll({ silent: false, throttleMs: 0 });
  }, [dateStr, refreshAll]);

  // Auto-refresh (so expenses created in other tabs show up here)
  useEffect(() => {
    if (!shopId || !dateStr) return;

    const onFocus = () => refreshAll({ silent: true });
    const onVis = () => {
      if (document.visibilityState === "visible") refreshAll({ silent: true });
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    const t = setInterval(() => {
      refreshAll({ silent: true });
    }, 15000); // 15s

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, [shopId, dateStr, refreshAll]);

  // ✅ Immediate sync when Sales History refreshes
  useEffect(() => {
    if (!shopId) return;

    const onSalesHistorySynced = (e) => {
      const detailShopId = e?.detail?.shopId;
      if (detailShopId != null && String(detailShopId) !== String(shopId)) return;

      // silent refresh (never clears your messages) + throttle prevents spam
      refreshAll({ silent: true, throttleMs: 1000 });
    };

    window.addEventListener("iclas:sales-history-synced", onSalesHistorySynced);
    return () => {
      window.removeEventListener("iclas:sales-history-synced", onSalesHistorySynced);
    };
  }, [shopId, refreshAll]);

  // ------------------------------------------------------------
  // Derived (system + expense summary)
  // ------------------------------------------------------------
  const expectedCashSystem = Number(system?.expected_cash_total || 0);
  const expectedPosSystem = Number(system?.expected_card_total || 0);
  const expectedMomoSystem = Number(system?.expected_mobile_total || 0);

  const expectedMoney = Number(system?.expected_collections || 0);

  // Expenses from system totals (if backend counts them)
  const expensesTotalSystem = Number(system?.expenses_total || 0);

  // Expenses from expense summary (direct from expenses router)
  const expSumTotal = Number(expenseSummary?.expenses_total || 0);
  const expSumCash = Number(expenseSummary?.expenses_cash || 0);
  const expSumCard = Number(expenseSummary?.expenses_card || 0);
  const expSumMomo = Number(expenseSummary?.expenses_momo || 0);

  // Effective expenses for display (handles "not reflected" cases)
  const expensesTotal = Math.max(expensesTotalSystem, expSumTotal);

  // Expected AFTER expenses:
  const expectedAfterExpenses = useMemo(() => {
    const backendAfter = Number(system?.expected_after_expenses_total ?? NaN);
    const backendLooksOk = Number.isFinite(backendAfter) && Math.abs(expensesTotalSystem - expensesTotal) < 1;

    if (backendLooksOk) return backendAfter;

    // fallback: compute from expectedMoney - effective expenses
    return expectedMoney - expensesTotal;
  }, [system, expectedMoney, expensesTotalSystem, expensesTotal]);

  // Profit tracking (system)
  const totalSoldAmount = Number(system?.total_sold_amount || 0);
  const totalProfitRealized = Number(system?.total_profit_realized_today || 0);
  const creditGivenToday = Number(system?.credit_created_today || 0);
  const creditPaidToday = Number(system?.credit_paid_today || 0);
  const creditPayersCount = Number(system?.credit_payers_count_today || 0);

  // Expected by method AFTER expenses (prefer backend; fallback compute)
  const expectedCashAfter = Number.isFinite(Number(system?.expected_cash_after_expenses))
    ? Number(system?.expected_cash_after_expenses || 0)
    : expectedCashSystem - expSumCash;

  const expectedMomoAfter = Number.isFinite(Number(system?.expected_mobile_after_expenses))
    ? Number(system?.expected_mobile_after_expenses || 0)
    : expectedMomoSystem - expSumMomo;

  const expectedPosAfter = Number.isFinite(Number(system?.expected_card_after_expenses))
    ? Number(system?.expected_card_after_expenses || 0)
    : expectedPosSystem - expSumCard;

  // Cashier pad values
  const countedCash = parseAmount(cashDrawer);
  const countedPos = parseAmount(posDrawer);
  const countedMomo = parseAmount(momoDrawer);
  const countedTotal = countedCash + countedPos + countedMomo;

  // Differences (compare to expected AFTER expenses by wallet)
  const diffCash = countedCash - expectedCashAfter;
  const diffPos = countedPos - expectedPosAfter;
  const diffMomo = countedMomo - expectedMomoAfter;

  const diffTotalAfterExpenses = countedTotal - expectedAfterExpenses;

  // Interest: profit vs expenses
  const totalInterest = totalProfitRealized;
  const remainingInterest = totalInterest - expensesTotal;

  const systemNotIncludingExpensesWarning = expSumTotal > 0 && expensesTotalSystem === 0;

  // ------------------------------------------------------------
  // Save closure (POST /daily-closures/)
  // ------------------------------------------------------------
  const handleSaveClosure = useCallback(async () => {
    if (!shopId || !dateStr) return;

    clearAlerts?.();
    setError?.("");
    setMessage?.("");

    setSaving(true);
    try {
      const payload = {
        shop_id: shopId,
        closure_date: dateStr,
        cash_amount: countedCash,
        pos_amount: countedPos,
        momo_amount: countedMomo,
        note: null,
      };

      const res = await fetch(`${API_BASE}/daily-closures/`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to save daily closure (HTTP ${res.status}): ${txt}`);
      }

      const data = await res.json();
      setLastClosure(data || null);
      setMessage?.("Daily closure saved.");

      // After save, refresh totals so expenses/credit are up-to-date on screen
      await refreshAll({ silent: true, throttleMs: 0 });
    } catch (err) {
      console.error(err);
      setError?.(err?.message || "Failed to save daily closure.");
    } finally {
      setSaving(false);
    }
  }, [
    API_BASE,
    shopId,
    dateStr,
    countedCash,
    countedPos,
    countedMomo,
    authHeaders,
    clearAlerts,
    setError,
    setMessage,
    refreshAll,
  ]);

  const saveDisabled = saving || isLockedReadOnly;

  return (
    <div
      style={{
        marginTop: 16,
        backgroundColor: "#ffffff",
        borderRadius: 20,
        boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
        padding: "16px 18px 18px",
      }}
    >
      {/* Responsive: desktop shows CASH/MOMO/POS in one row with vertical separators; mobile stays stacked */}
      <style>{`
        .iclas-cashier-mobile { display: block; }
        .iclas-cashier-desktop { display: none; }

        @media (min-width: 900px) {
          .iclas-cashier-mobile { display: none; }
          .iclas-cashier-desktop { display: block; }
        }
      `}</style>

      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6b7280",
            }}
          >
            Daily Closure
          </div>
          <div style={{ fontSize: 13, marginTop: 2, color: "#4b5563" }}>
            Shop #{shopId} · Date: <span style={{ fontWeight: 700 }}>{dateStr}</span>{" "}
            {!isToday && <span style={{ fontSize: 11, color: "#9ca3af" }}>(past day)</span>}
          </div>

          {lastClosure && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#059669" }}>
              Last saved closure: <strong>{toISO(lastClosure?.closure_date)}</strong> · ID #{lastClosure?.id}
            </div>
          )}

          {lastRefreshedAt && (
            <div style={{ marginTop: 3, fontSize: 11, color: "#6b7280" }}>
              Last refreshed:{" "}
              <strong>
                {String(
                  lastRefreshedAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                )}
              </strong>
            </div>
          )}

          {isLockedReadOnly && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#b91c1c", fontWeight: 600 }}>
              Read-only: only Owner/Manager/Admin can save closures for past days.
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => refreshAll({ silent: false, throttleMs: 0 })}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              backgroundColor: "#e5e7eb",
              color: "#111827",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {loading ? "Refreshing..." : "Refresh totals"}
          </button>

          <button
            type="button"
            onClick={handleSaveClosure}
            disabled={saveDisabled}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 700,
              cursor: saveDisabled ? "not-allowed" : "pointer",
              backgroundColor: saveDisabled ? "#9ca3af" : "#2563eb",
              color: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {saving ? "Saving..." : "Save closure"}
          </button>
        </div>
      </div>

      {/* Top summary chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, marginBottom: 10 }}>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            backgroundColor: "#eff6ff",
            border: "1px solid #bfdbfe",
            fontSize: 12,
          }}
        >
          Total sold: <strong>{formatMoney(totalSoldAmount)} RWF</strong>
        </div>

        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            backgroundColor: "#ecfdf3",
            border: "1px solid #bbf7d0",
            fontSize: 12,
          }}
        >
          Profit realized:{" "}
          <strong style={{ color: "#166534" }}>{formatMoney(totalProfitRealized)} RWF</strong>
        </div>

        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            fontSize: 12,
          }}
        >
          Credit given that day: <strong>{formatMoney(creditGivenToday)} RWF</strong>
        </div>

        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            backgroundColor: "#fefce8",
            border: "1px solid #fef3c7",
            fontSize: 12,
          }}
        >
          Credit paid that day: <strong>{formatMoney(creditPaidToday)} RWF</strong>
        </div>
      </div>

      {/* 1) SYSTEM SUMMARY (full width, first) */}
      <div
        style={{
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          padding: "12px 12px",
          backgroundColor: "#f9fafb",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.10em",
            color: "#6b7280",
            marginBottom: 6,
          }}
        >
          System Summary
        </div>

        {systemNotIncludingExpensesWarning && (
          <div
            style={{
              marginBottom: 8,
              padding: "8px 10px",
              borderRadius: 12,
              backgroundColor: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Note: Expenses exist in DB but system totals returned 0. This tab will still show correct expenses using
            /expenses/summary.
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr
              style={{
                borderBottom: "1px solid #e5e7eb",
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <th style={{ padding: "6px 4px", textAlign: "left" }}></th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Cash</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>MoMo</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>POS</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "6px 4px" }}>Expected totals (system)</td>
              <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700 }}>{formatMoney(expectedCashSystem)}</td>
              <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700 }}>{formatMoney(expectedMomoSystem)}</td>
              <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700 }}>{formatMoney(expectedPosSystem)}</td>
            </tr>

            <tr>
              <td style={{ padding: "6px 4px", fontWeight: 700 }}>Expected money (all methods)</td>
              <td colSpan={3} style={{ padding: "6px 4px", textAlign: "right", fontWeight: 800, color: "#111827" }}>
                {formatMoney(expectedMoney)} RWF
              </td>
            </tr>

            <tr>
              <td style={{ padding: "6px 4px" }}>Expenses (DB)</td>
              <td colSpan={3} style={{ padding: "6px 4px", textAlign: "right", color: "#b91c1c", fontWeight: 600 }}>
                − {formatMoney(expensesTotal)} RWF
              </td>
            </tr>

            <tr>
              <td style={{ padding: "6px 4px", fontWeight: 800 }}>Net expected after expenses</td>
              <td
                colSpan={3}
                style={{
                  padding: "6px 4px",
                  textAlign: "right",
                  fontWeight: 800,
                  color: expectedAfterExpenses >= 0 ? "#166534" : "#b91c1c",
                }}
              >
                {formatMoney(expectedAfterExpenses)} RWF
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
          <div>
            Credit payments count: <strong>{creditPayersCount}</strong>
          </div>
          <div>
            Total credit paid that day: <strong>{formatMoney(creditPaidToday)} RWF</strong>
          </div>
        </div>
      </div>

      {/* 2) CASHIER CLOSURE (second) */}
      <div
        style={{
          marginTop: 14,
          borderRadius: 18,
          border: "1px solid #e5e7eb",
          backgroundColor: "#ffffff",
          padding: "14px 14px 12px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "#6b7280",
            marginBottom: 10,
          }}
        >
          Cashier Closure
        </div>

        {/* Top metrics row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginBottom: 10,
          }}
        >
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Expected money (after expenses)</div>
            <div style={{ fontSize: 28, fontWeight: 950, color: "#111827", marginTop: 4 }}>
              {formatMoney(expectedAfterExpenses)} RWF
            </div>
          </div>

          <div style={{ minWidth: 220, textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Counted total (all methods)</div>
            <div style={{ fontSize: 18, fontWeight: 950, color: "#111827", marginTop: 6 }}>
              {formatMoney(countedTotal)} RWF
            </div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: diffColor(diffTotalAfterExpenses) }}>
              Diff: {formatMoney(diffTotalAfterExpenses)} RWF
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
          Type what you actually counted (mobile: vertical · desktop: Cash | MoMo | POS).
        </div>

        {/* MOBILE: keep vertical stack (unchanged feeling) */}
        <div className="iclas-cashier-mobile">
          {/* CASH */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ textAlign: "center", fontWeight: 900, color: "#111827", marginBottom: 6 }}>CASH</div>
            <MoneyInput value={cashDrawer} onChange={setCashDrawer} placeholder="Type cash total" onTouched={markTouched} />
            <div style={{ marginTop: 6, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Expected: {formatMoney(expectedCashAfter)} RWF</span>
              <span style={{ color: diffColor(diffCash) }}>Diff: {formatMoney(diffCash)}</span>
            </div>
          </div>

          {/* MOMO */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ textAlign: "center", fontWeight: 900, color: "#111827", marginBottom: 6 }}>MOMO</div>
            <MoneyInput value={momoDrawer} onChange={setMomoDrawer} placeholder="Type MoMo total" onTouched={markTouched} />
            <div style={{ marginTop: 6, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Expected: {formatMoney(expectedMomoAfter)} RWF</span>
              <span style={{ color: diffColor(diffMomo) }}>Diff: {formatMoney(diffMomo)}</span>
            </div>
          </div>

          {/* POS */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ textAlign: "center", fontWeight: 900, color: "#111827", marginBottom: 6 }}>POS</div>
            <MoneyInput value={posDrawer} onChange={setPosDrawer} placeholder="Type POS total" onTouched={markTouched} />
            <div style={{ marginTop: 6, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Expected: {formatMoney(expectedPosAfter)} RWF</span>
              <span style={{ color: diffColor(diffPos) }}>Diff: {formatMoney(diffPos)}</span>
            </div>
          </div>
        </div>

        {/* DESKTOP: one row with vertical separators */}
        <div className="iclas-cashier-desktop">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 0,
              border: "1px solid #e5e7eb",
              borderRadius: 18,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            {/* CASH */}
            <div style={{ padding: "12px 14px" }}>
              <div style={{ textAlign: "center", fontWeight: 950, color: "#111827", marginBottom: 10 }}>CASH</div>
              <MoneyInput value={cashDrawer} onChange={setCashDrawer} placeholder="Type cash total" onTouched={markTouched} />
              <div style={{ marginTop: 8, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#6b7280" }}>Expected: {formatMoney(expectedCashAfter)} RWF</span>
                <span style={{ color: diffColor(diffCash), fontWeight: 800 }}>Diff: {formatMoney(diffCash)}</span>
              </div>
            </div>

            {/* MOMO */}
            <div style={{ padding: "12px 14px", borderLeft: "1px solid #e5e7eb" }}>
              <div style={{ textAlign: "center", fontWeight: 950, color: "#111827", marginBottom: 10 }}>MOMO</div>
              <MoneyInput value={momoDrawer} onChange={setMomoDrawer} placeholder="Type MoMo total" onTouched={markTouched} />
              <div style={{ marginTop: 8, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#6b7280" }}>Expected: {formatMoney(expectedMomoAfter)} RWF</span>
                <span style={{ color: diffColor(diffMomo), fontWeight: 800 }}>Diff: {formatMoney(diffMomo)}</span>
              </div>
            </div>

            {/* POS */}
            <div style={{ padding: "12px 14px", borderLeft: "1px solid #e5e7eb" }}>
              <div style={{ textAlign: "center", fontWeight: 950, color: "#111827", marginBottom: 10 }}>POS</div>
              <MoneyInput value={posDrawer} onChange={setPosDrawer} placeholder="Type POS total" onTouched={markTouched} />
              <div style={{ marginTop: 8, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#6b7280" }}>Expected: {formatMoney(expectedPosAfter)} RWF</span>
                <span style={{ color: diffColor(diffPos), fontWeight: 800 }}>Diff: {formatMoney(diffPos)}</span>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <div style={{ color: "#6b7280" }}>Counted total (all methods)</div>
            <div style={{ fontWeight: 950 }}>{formatMoney(countedTotal)} RWF</div>
          </div>
        </div>

        {/* Keep this line (difference vs system) SAME concept as before */}
        <div
          style={{
            marginTop: 10,
            borderTop: "1px solid #e5e7eb",
            paddingTop: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            fontSize: 12,
          }}
        >
          <div style={{ color: "#111827" }}>Difference vs system expected (after expenses)</div>
          <div style={{ fontWeight: 950, color: diffColor(diffTotalAfterExpenses) }}>
            {formatMoney(diffTotalAfterExpenses)} RWF
          </div>
        </div>
      </div>

      {/* Bottom summary (kept) */}
      <div
        style={{
          marginTop: 18,
          borderRadius: 18,
          border: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
          padding: "12px 14px 14px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ color: "#6b7280", marginBottom: 4 }}>Counted totals</div>
            <div style={{ fontWeight: 700 }}>{formatMoney(countedTotal)} RWF</div>
          </div>

          <div>
            <div style={{ color: "#6b7280", marginBottom: 4 }}>Total interest</div>
            <div style={{ fontWeight: 700 }}>{formatMoney(totalInterest)} RWF</div>
          </div>

          <div>
            <div style={{ color: "#6b7280", marginBottom: 4 }}>Expenses</div>
            <div style={{ fontWeight: 700, color: "#b91c1c" }}>{formatMoney(expensesTotal)} RWF</div>
          </div>

          <div>
            <div style={{ color: "#6b7280", marginBottom: 4 }}>Remaining interest</div>
            <div style={{ fontWeight: 700, color: remainingInterest >= 0 ? "#15803d" : "#b91c1c" }}>
              {formatMoney(remainingInterest)} RWF
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: "#6b7280" }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>DIFFERENCE COUNTED VS SYSTEM EXPECTED</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: diffColor(diffTotalAfterExpenses) }}>
            {formatMoney(diffTotalAfterExpenses)} RWF
          </div>
          <div style={{ marginTop: 3 }}>
            Auto-refreshes totals (expenses + credit paid) every 15 seconds and on focus.
          </div>
        </div>
      </div>
    </div>
  );
}

function toISO(v) {
  if (!v) return "";
  try {
    const s = String(v);
    if (s.includes("T")) return s.split("T")[0];
    return s;
  } catch {
    return "";
  }
}
