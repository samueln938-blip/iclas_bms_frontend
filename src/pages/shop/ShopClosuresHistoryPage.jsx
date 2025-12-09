// src/pages/shop/ShopClosuresHistoryPage.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Single source of truth for API base (env or prod fallback)
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";
const API_BASE = CLIENT_API_BASE;

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

function sevenDaysAgoString() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toISODateOnly(v) {
  if (!v) return "";
  const s = String(v);
  // supports "2025-11-30" or "2025-11-30T00:00:00"
  return s.includes("T") ? s.split("T")[0] : s;
}

function DailyClosureHistoryPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  // ✅ AUTH (same pattern as other shop pages)
  const { authHeadersNoJson } = useAuth();
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

  const [dateFrom, setDateFrom] = useState(sevenDaysAgoString());
  const [dateTo, setDateTo] = useState(todayDateString());

  const [closures, setClosures] = useState([]);
  const [loadingClosures, setLoadingClosures] = useState(false);

  const [subTab, setSubTab] = useState("list"); // "list" | "details"
  const [selectedClosureId, setSelectedClosureId] = useState(null);

  // ✅ System totals per day (recomputed from backend)
  const [systemByDate, setSystemByDate] = useState({});
  const [loadingSystem, setLoadingSystem] = useState(false);

  const [viewMode, setViewMode] = useState("system"); // "system" | "saved"

  // --------------------------------------------------
  // Helpers
  // --------------------------------------------------
  const tryJsonCandidates = useCallback(
    async (candidates, { method = "GET" } = {}) => {
      let saw404 = false;

      for (const url of candidates) {
        try {
          const res = await fetch(url, {
            method,
            headers: authHeadersNoJson,
            cache: "no-store",
          });

          if (res.status === 404) {
            saw404 = true;
            continue; // try next candidate
          }

          if (res.status === 401) {
            throw new Error("Unauthorized (401). Please logout and login again.");
          }

          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(`Request failed (HTTP ${res.status}): ${txt || url}`);
          }

          const data = await res.json();
          return { data, saw404: false };
        } catch (e) {
          // If it was 404 we already handled by continue.
          // For other errors, stop early (real issue).
          if (String(e?.message || "").includes("Unauthorized (401)")) throw e;
          if (String(e?.message || "").startsWith("Request failed")) throw e;
          // network parsing errors: try next candidate
          continue;
        }
      }

      return { data: null, saw404 };
    },
    [authHeadersNoJson]
  );

  // --------------------------------------------------
  // Load shop info (AUTH)
  // --------------------------------------------------
  const shopAbortRef = useRef(null);

  useEffect(() => {
    async function loadShop() {
      if (!shopId) return;
      if (!headersReady) return;

      if (shopAbortRef.current) shopAbortRef.current.abort();
      const controller = new AbortController();
      shopAbortRef.current = controller;

      setLoadingShop(true);
      setError("");

      try {
        const candidates = [
          `${API_BASE}/shops/${shopId}`,
          `${API_BASE}/shops/${shopId}/`,
        ];

        // try sequentially (simple + stable)
        let lastErr = null;
        let data = null;

        for (const url of candidates) {
          const res = await fetch(url, {
            headers: authHeadersNoJson,
            signal: controller.signal,
            cache: "no-store",
          });

          if (res.status === 401) {
            throw new Error("Unauthorized (401). Please logout and login again.");
          }

          if (!res.ok) {
            lastErr = new Error("Failed to load shop.");
            continue;
          }

          data = await res.json();
          break;
        }

        if (!data) throw lastErr || new Error("Failed to load shop.");

        setShop(data);
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error(err);
        setShop(null);
        setError(err.message || "Failed to load shop.");
      } finally {
        setLoadingShop(false);
      }
    }

    loadShop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, headersReady, API_BASE, authHeadersNoJson]);

  const shopName = shop?.name || `Shop ${shopId}`;

  // --------------------------------------------------
  // Load daily closures history (saved values) (AUTH)
  // --------------------------------------------------
  const loadClosures = useCallback(async () => {
    if (!shopId || !dateFrom || !dateTo) return;
    if (!headersReady) return;

    setLoadingClosures(true);
    setError("");

    try {
      const qs = `shop_id=${shopId}&date_from=${dateFrom}&date_to=${dateTo}`;

      // ✅ Try both dash and underscore routes (prevents “looks lost” on 404 mismatch)
      const candidates = [
        `${API_BASE}/daily-closures/?${qs}`,
        `${API_BASE}/daily-closures?${qs}`,
        `${API_BASE}/daily_closures/?${qs}`,
        `${API_BASE}/daily_closures?${qs}`,
      ];

      const { data, saw404 } = await tryJsonCandidates(candidates);

      if (data == null) {
        // all candidates 404 or unreachable
        setClosures([]);
        setSelectedClosureId(null);
        if (saw404) {
          setError(
            "Daily closure history endpoint not found (404). Backend route mismatch (daily-closures vs daily_closures)."
          );
        }
        return;
      }

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.closures)
        ? data.closures
        : Array.isArray(data?.rows)
        ? data.rows
        : [];

      setClosures(rows || []);
      if (rows && rows.length > 0) setSelectedClosureId(rows[0].id);
      else setSelectedClosureId(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load daily closure history.");
      setClosures([]);
      setSelectedClosureId(null);
    } finally {
      setLoadingClosures(false);
    }
  }, [shopId, dateFrom, dateTo, headersReady, API_BASE, tryJsonCandidates]);

  useEffect(() => {
    loadClosures();
  }, [loadClosures]);

  // --------------------------------------------------
  // ✅ Load system totals for each day shown (AUTH)
  // --------------------------------------------------
  const loadSystemTotalsForClosures = useCallback(
    async (rows) => {
      if (!shopId || !headersReady || !rows || rows.length === 0) {
        setSystemByDate({});
        return;
      }

      setLoadingSystem(true);
      try {
        const uniqueDates = Array.from(
          new Set(rows.map((c) => toISODateOnly(c.closure_date)))
        ).filter(Boolean);

        const entries = await Promise.all(
          uniqueDates.map(async (dStr) => {
            const qs = `shop_id=${shopId}&closure_date=${dStr}`;
            const candidates = [
              `${API_BASE}/daily-closures/system-totals?${qs}`,
              `${API_BASE}/daily_closures/system-totals?${qs}`,
            ];

            try {
              const { data } = await tryJsonCandidates(candidates);
              return [dStr, data || null];
            } catch {
              return [dStr, null];
            }
          })
        );

        const map = {};
        for (const [k, v] of entries) map[k] = v;
        setSystemByDate(map);
      } finally {
        setLoadingSystem(false);
      }
    },
    [shopId, headersReady, API_BASE, tryJsonCandidates]
  );

  useEffect(() => {
    loadSystemTotalsForClosures(closures);
  }, [closures, loadSystemTotalsForClosures]);

  // --------------------------------------------------
  // Rebuild range in DB (fix saved rows) (AUTH)
  // --------------------------------------------------
  const handleRebuildRange = useCallback(async () => {
    if (!shopId || !dateFrom || !dateTo) return;
    if (!headersReady) return;

    setError("");
    try {
      const qs = `shop_id=${shopId}&date_from=${dateFrom}&date_to=${dateTo}`;

      const candidates = [
        `${API_BASE}/daily-closures/rebuild-range?${qs}`,
        `${API_BASE}/daily_closures/rebuild-range?${qs}`,
      ];

      // Try both; first OK wins
      let ok = false;
      let lastStatus = null;
      let lastText = "";

      for (const url of candidates) {
        const res = await fetch(url, {
          method: "POST",
          headers: authHeadersNoJson,
          cache: "no-store",
        });

        if (res.status === 404) {
          lastStatus = 404;
          continue;
        }
        if (res.status === 401) {
          throw new Error("Unauthorized (401). Please logout and login again.");
        }
        if (!res.ok) {
          lastStatus = res.status;
          lastText = await res.text().catch(() => "");
          continue;
        }
        ok = true;
        break;
      }

      if (!ok) {
        if (lastStatus === 404) {
          throw new Error(
            "Rebuild endpoint not found (404). Backend route mismatch (daily-closures vs daily_closures)."
          );
        }
        throw new Error(`Rebuild failed (HTTP ${lastStatus || "?"}): ${lastText || "Unknown error"}`);
      }

      await loadClosures();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to rebuild range.");
    }
  }, [shopId, dateFrom, dateTo, headersReady, API_BASE, authHeadersNoJson, loadClosures]);

  // --------------------------------------------------
  // Period summary
  // --------------------------------------------------
  const savedSummary = useMemo(() => {
    let totalSold = 0;
    let totalProfit = 0;
    let totalExpenses = 0;
    let totalNetProfit = 0;
    let totalDifference = 0;

    for (const c of closures || []) {
      totalSold += Number(c.total_sold_amount || 0);
      totalProfit += Number(c.total_profit || 0);
      totalExpenses += Number(c.total_expenses || 0);
      totalNetProfit += Number(c.net_profit || 0);
      totalDifference += Number(c.difference_amount || 0);
    }

    return {
      totalSold,
      totalProfit,
      totalExpenses,
      totalNetProfit,
      totalDifference,
      daysCount: (closures || []).length,
    };
  }, [closures]);

  const systemSummary = useMemo(() => {
    // We recompute "difference" from system totals (more trustworthy)
    let totalSold = 0;
    let totalProfit = 0;
    let totalExpenses = 0;
    let totalNetProfit = 0;
    let totalDifference = 0;

    for (const c of closures || []) {
      const day = toISODateOnly(c.closure_date);
      const sys = systemByDate[day];

      const sold = Number(c.total_sold_amount || 0);
      const profit = Number(c.total_profit || 0);

      const exp = Number(sys?.expenses_total ?? c.total_expenses ?? 0);
      const net = profit - exp;

      const counted = Number(c.total_counted_amount || 0);
      const expectedAfter = Number(sys?.expected_after_expenses_total ?? 0);
      const diff = sys ? counted - expectedAfter : Number(c.difference_amount || 0);

      totalSold += sold;
      totalProfit += profit;
      totalExpenses += exp;
      totalNetProfit += net;
      totalDifference += diff;
    }

    return {
      totalSold,
      totalProfit,
      totalExpenses,
      totalNetProfit,
      totalDifference,
      daysCount: (closures || []).length,
    };
  }, [closures, systemByDate]);

  const summary = viewMode === "system" ? systemSummary : savedSummary;

  const selectedClosure = useMemo(() => {
    if (!selectedClosureId) return null;
    return closures.find((c) => c.id === selectedClosureId) || null;
  }, [closures, selectedClosureId]);

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
      </div>
    );
  }

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

      <h1 style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "0.03em", margin: 0 }}>
        Daily Closure History
      </h1>
      <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>
        Summary of daily closures for <strong>{shopName}</strong>.
      </p>

      {/* Filters */}
      <div
        style={{
          marginTop: "14px",
          marginBottom: "10px",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 16px",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: "13px", color: "#6b7280" }}>
          Period:&nbsp;
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              padding: "4px 8px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              fontSize: "13px",
            }}
          />{" "}
          <span style={{ margin: "0 4px" }}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              padding: "4px 8px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              fontSize: "13px",
            }}
          />
        </div>

        <div style={{ display: "inline-flex", backgroundColor: "#e5e7eb", borderRadius: "999px", padding: "2px" }}>
          {[
            { key: "system", label: "Recomputed (system)" },
            { key: "saved", label: "Saved (DB)" },
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
                  fontWeight: 600,
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

        <button
          type="button"
          onClick={handleRebuildRange}
          style={{
            border: "none",
            padding: "6px 12px",
            borderRadius: "999px",
            backgroundColor: "#111827",
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Rebuild range (fix DB)
        </button>

        {loadingSystem && <span style={{ fontSize: "12px", color: "#6b7280" }}>Recomputing system totals...</span>}
      </div>

      {error && (
        <div style={{ marginBottom: 10, color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Period summary */}
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
        <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "6px" }}>
          Period summary ({viewMode === "system" ? "recomputed" : "saved"})
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
          {dateFrom} to {dateTo}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", rowGap: "8px", columnGap: "16px" }}>
          <div>
            <div style={{ color: "#6b7280" }}>Days closed</div>
            <div style={{ fontSize: "18px", fontWeight: 800 }}>{formatMoney(summary.daysCount)}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280" }}>Total sold</div>
            <div style={{ fontSize: "18px", fontWeight: 800 }}>{formatMoney(summary.totalSold)}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280" }}>Total profit</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#16a34a" }}>{formatMoney(summary.totalProfit)}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280" }}>Total expenses</div>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>{formatMoney(summary.totalExpenses)}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280" }}>Net profit (sum)</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#16a34a" }}>{formatMoney(summary.totalNetProfit)}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280" }}>Total difference</div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: summary.totalDifference > 0 ? "#16a34a" : summary.totalDifference < 0 ? "#b91c1c" : "#4b5563",
              }}
            >
              {formatMoney(summary.totalDifference)}
            </div>
          </div>
        </div>
      </div>

      {/* Daily closures list + details */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 6px 18px rgba(15,37,128,0.04)",
          padding: "10px 12px 14px",
        }}
      >
        {/* Sub-tabs */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <div style={{ display: "inline-flex", backgroundColor: "#e5e7eb", borderRadius: "999px", padding: "2px" }}>
            {[
              { key: "list", label: "Closures list" },
              { key: "details", label: "Selected day details" },
            ].map((opt) => {
              const isActive = subTab === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSubTab(opt.key)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 12px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 500,
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

        {loadingClosures ? (
          <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>Loading daily closure history...</div>
        ) : closures.length === 0 ? (
          <div style={{ padding: "10px 4px", fontSize: "13px", color: "#6b7280" }}>No daily closures for this period.</div>
        ) : subTab === "list" ? (
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
                <th style={{ padding: "6px 4px" }}>Date</th>
                <th style={{ padding: "6px 4px", textAlign: "right" }}>Sold</th>
                <th style={{ padding: "6px 4px", textAlign: "right" }}>Profit</th>
                <th style={{ padding: "6px 4px", textAlign: "right" }}>Counted</th>
                <th style={{ padding: "6px 4px", textAlign: "right" }}>Difference</th>
                <th style={{ padding: "6px 4px", textAlign: "right" }}>Expenses</th>
                <th style={{ padding: "6px 4px", textAlign: "right" }}>Net profit</th>
                <th style={{ padding: "6px 4px" }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {closures.map((c) => {
                const day = toISODateOnly(c.closure_date);
                const sys = systemByDate[day];

                const counted = Number(c.total_counted_amount || 0);
                const exp = Number((viewMode === "system" ? sys?.expenses_total : c.total_expenses) || 0);

                const expectedAfter = Number(sys?.expected_after_expenses_total || 0);
                const diff = viewMode === "system" && sys ? counted - expectedAfter : Number(c.difference_amount || 0);

                const netProfit = Number(c.total_profit || 0) - exp;

                const diffColor = diff > 0 ? "#16a34a" : diff < 0 ? "#b91c1c" : "#4b5563";

                const isSelected = selectedClosureId === c.id;

                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedClosureId(c.id)}
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      backgroundColor: isSelected ? "#f5f5ff" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "8px 4px" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!day) return;
                          navigate(`/shops/${shopId}/sales-pos?tab=closure&closureDate=${day}`);
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          margin: 0,
                          cursor: "pointer",
                          color: "#2563eb",
                          textDecoration: "underline",
                          fontSize: "13px",
                        }}
                      >
                        {day}
                      </button>
                    </td>

                    <td style={{ padding: "8px 4px", textAlign: "right" }}>{formatMoney(c.total_sold_amount || 0)}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right" }}>{formatMoney(c.total_profit || 0)}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right" }}>{formatMoney(counted)}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", color: diffColor }}>{formatMoney(diff)}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right" }}>{formatMoney(exp)}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", color: "#16a34a" }}>{formatMoney(netProfit)}</td>
                    <td style={{ padding: "8px 4px" }}>
                      <span style={{ fontSize: "11px", color: "#6b7280" }}>{c.note || ""}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: "6px 4px", fontSize: "13px" }}>
            {!selectedClosure ? (
              <div style={{ color: "#6b7280" }}>Select a closure in the list tab to see full details.</div>
            ) : (
              (() => {
                const day = toISODateOnly(selectedClosure.closure_date);
                const sys = systemByDate[day];

                const counted = Number(selectedClosure.total_counted_amount || 0);
                const exp = Number((viewMode === "system" ? sys?.expenses_total : selectedClosure.total_expenses) || 0);

                const expectedAfter = Number(sys?.expected_after_expenses_total || 0);
                const diff = viewMode === "system" && sys ? counted - expectedAfter : Number(selectedClosure.difference_amount || 0);

                const netProfit = Number(selectedClosure.total_profit || 0) - exp;

                return (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 700 }}>Selected day details</div>
                        <div style={{ fontSize: "12px", color: "#6b7280" }}>{day}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/shops/${shopId}/sales-pos?tab=closure&closureDate=${day}`)}
                        style={{
                          border: "none",
                          padding: "6px 14px",
                          borderRadius: "999px",
                          backgroundColor: "#2563eb",
                          color: "#ffffff",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Edit this closure
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", rowGap: "8px", columnGap: "16px" }}>
                      <div>
                        <div style={{ color: "#6b7280" }}>Total sold</div>
                        <div style={{ fontSize: "16px", fontWeight: 700 }}>{formatMoney(selectedClosure.total_sold_amount || 0)}</div>
                      </div>
                      <div>
                        <div style={{ color: "#6b7280" }}>Total profit</div>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "#16a34a" }}>{formatMoney(selectedClosure.total_profit || 0)}</div>
                      </div>
                      <div>
                        <div style={{ color: "#6b7280" }}>Counted total</div>
                        <div style={{ fontSize: "16px", fontWeight: 700 }}>{formatMoney(counted)}</div>
                      </div>
                      <div>
                        <div style={{ color: "#6b7280" }}>Difference ({viewMode})</div>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: diff > 0 ? "#16a34a" : diff < 0 ? "#b91c1c" : "#4b5563" }}>
                          {formatMoney(diff)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "#6b7280" }}>Expenses ({viewMode})</div>
                        <div style={{ fontSize: "16px", fontWeight: 700 }}>{formatMoney(exp)}</div>
                      </div>
                      <div>
                        <div style={{ color: "#6b7280" }}>Net profit ({viewMode})</div>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "#16a34a" }}>{formatMoney(netProfit)}</div>
                      </div>
                    </div>

                    {selectedClosure.note && (
                      <div style={{ marginTop: "10px" }}>
                        <div style={{ color: "#6b7280", marginBottom: "2px" }}>Note</div>
                        <div style={{ fontSize: "12px" }}>{selectedClosure.note}</div>
                      </div>
                    )}
                  </>
                );
              })()
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DailyClosureHistoryPage;
