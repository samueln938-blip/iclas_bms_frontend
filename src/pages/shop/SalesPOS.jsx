// FILE: src/pages/shop/SalesPOS.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

import CurrentSaleTab from "./tabs/CurrentSaleTab.jsx";
import ExpensesTodayTab from "./tabs/ExpensesTodayTab.jsx";
import MySalesTodayTab from "./tabs/MySalesTodayTab.jsx";
import DailyClosureTab from "./tabs/DailyClosureTab.jsx";

import { todayDateString, readExpenses, writeExpenses } from "./posUtils.js";

// ✅ Single source of truth for API base (VITE_API_BASE / prod fallback)
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";

// -------------------- Small calculator modal --------------------
function safeNumber(raw) {
  const s = String(raw ?? "").replace(/,/g, "").trim();
  if (!s) return 0;
  // allow decimals
  const cleaned = s.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function CalculatorModal({ open, initialValue, title = "Calculator", onClose, onApply }) {
  const [val, setVal] = useState("");

  useEffect(() => {
    if (!open) return;
    setVal(String(initialValue ?? ""));
  }, [open, initialValue]);

  if (!open) return null;

  const append = (ch) => setVal((p) => `${p ?? ""}${ch}`);

  const backspace = () => setVal((p) => String(p ?? "").slice(0, -1));
  const clear = () => setVal("");

  const apply = () => {
    // ✅ NO rounding; supports decimals
    const num = safeNumber(val);
    onApply?.(num);
    onClose?.();
  };

  const Key = ({ children, onClick, wide }) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 44,
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        background: "#fff",
        cursor: "pointer",
        fontWeight: 800,
        fontSize: 14,
        gridColumn: wide ? "span 2" : "span 1",
      }}
    >
      {children}
    </button>
  );

  const dotDisabled = String(val ?? "").includes(".");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15,23,42,0.35)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360,
          maxWidth: "95vw",
          backgroundColor: "#ffffff",
          borderRadius: 18,
          boxShadow: "0 20px 50px rgba(15,23,42,0.35)",
          padding: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}
            title="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Enter amount"
            // ✅ decimal keypad on mobile
            inputMode="decimal"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 16,
              border: "1px solid #d1d5db",
              fontSize: 18,
              fontWeight: 900,
              textAlign: "right",
            }}
          />
          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", textAlign: "right" }}>
            Preview:{" "}
            <strong style={{ color: "#111827" }}>
              {safeNumber(val).toLocaleString("en-RW", { maximumFractionDigits: 3 })}
            </strong>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <Key onClick={() => append("7")}>7</Key>
          <Key onClick={() => append("8")}>8</Key>
          <Key onClick={() => append("9")}>9</Key>

          <Key onClick={() => append("4")}>4</Key>
          <Key onClick={() => append("5")}>5</Key>
          <Key onClick={() => append("6")}>6</Key>

          <Key onClick={() => append("1")}>1</Key>
          <Key onClick={() => append("2")}>2</Key>
          <Key onClick={() => append("3")}>3</Key>

          <Key onClick={() => append("0")}>0</Key>
          <Key onClick={() => append("00")}>00</Key>

          <Key
            onClick={() => {
              if (!dotDisabled) append(".");
            }}
          >
            .
          </Key>

          <Key wide onClick={backspace}>
            ⌫ Back
          </Key>
          <Key wide onClick={clear}>
            Clear
          </Key>
          <Key wide onClick={apply}>
            Apply ✅
          </Key>
        </div>
      </div>
    </div>
  );
}

export default function SalesPOS() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();

  // ✅ Use centralized API base instead of localhost
  const API_BASE = CLIENT_API_BASE;

  // ✅ role normalize (supports: role, user_role, userRole, type)
  const role = (user?.role ?? user?.user_role ?? user?.userRole ?? user?.type ?? "")
    .toString()
    .toLowerCase();

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isCashier = role === "cashier";
  const isOwner = role === "owner";

  // ✅ allow workspace link for Admin/Owner/Manager only
  const canGoWorkspace = isAdmin || isManager || isOwner;

  // ✅ best-effort workspace path (keeps your existing /shop/:id route)
  const workspacePath = useMemo(() => {
    const p = (location?.pathname || "").replace(/\/+$/g, "");
    const trimmed = p.replace(/\/(salespos|sales-pos|pos)$/i, "");
    if (trimmed && trimmed !== p) return trimmed;
    return `/shop/${shopId}`;
  }, [location?.pathname, shopId]);

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

  // ✅ Tabs (cashier MUST see closure too)
  const baseTabs = useMemo(
    () => [
      { key: "current", label: "Current Sale" },
      { key: "expenses", label: "Today Expenses" },
      { key: "today", label: "My Sales Today" },
      { key: "closure", label: "Daily Closure" },
    ],
    []
  );

  // ✅ IMPORTANT FIX: do NOT filter out closure for cashier
  const allowedTabs = useMemo(() => baseTabs, [baseTabs]);
  const allowedTabKeys = useMemo(() => new Set(allowedTabs.map((t) => t.key)), [allowedTabs]);

  const [activeTab, setActiveTab] = useState("current");
  const [closureDate, setClosureDate] = useState(todayDateString());

  // ✅ Sale edit handoff (from Today tab → Current tab)
  const [editSaleId, setEditSaleId] = useState(null);

  // Global alerts
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const clearAlerts = useCallback(() => {
    setError("");
    setMessage("");
  }, []);

  const navigateWithSearch = useCallback(
    (sp) => {
      navigate({ pathname: location.pathname, search: `?${sp.toString()}` }, { replace: true });
    },
    [navigate, location.pathname]
  );

  // URL sync (?tab=... & ?closureDate=... & ?editSaleId=...)
  const setTabAndUrl = useCallback(
    (tabKey) => {
      const key = allowedTabKeys.has(tabKey) ? tabKey : "current";
      setActiveTab(key);

      const sp = new URLSearchParams(location.search);
      sp.set("tab", key);

      const cd = closureDate || todayDateString();
      if (key === "closure") sp.set("closureDate", cd);
      else sp.delete("closureDate");

      // ✅ Leaving Current tab clears editSaleId
      if (key !== "current") {
        sp.delete("editSaleId");
        setEditSaleId(null);
      }

      navigateWithSearch(sp);
    },
    [allowedTabKeys, location.search, closureDate, navigateWithSearch]
  );

  // ✅ Called by MySalesTodayTab when user clicks an item/receipt
  const startEditSale = useCallback(
    (saleId) => {
      const sId = saleId != null ? String(saleId) : "";
      if (!sId) return;

      clearAlerts();

      setActiveTab("current");
      setEditSaleId(sId);

      const sp = new URLSearchParams(location.search);
      sp.set("tab", "current");
      sp.set("editSaleId", sId);
      sp.delete("closureDate");
      navigateWithSearch(sp);
    },
    [location.search, navigateWithSearch, clearAlerts]
  );

  // ✅ Called by CurrentSaleTab after cancel OR after successful save
  const clearEditSale = useCallback(() => {
    setEditSaleId(null);
    const sp = new URLSearchParams(location.search);
    sp.delete("editSaleId");
    sp.set("tab", "current");
    navigateWithSearch(sp);
  }, [location.search, navigateWithSearch]);

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const tabFromUrl = search.get("tab");
    const dateFromUrl = search.get("closureDate");
    const editFromUrl = search.get("editSaleId");

    if (tabFromUrl && allowedTabKeys.has(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    } else if (tabFromUrl && !allowedTabKeys.has(tabFromUrl)) {
      setActiveTab("current");
    }

    setClosureDate(dateFromUrl || todayDateString());

    // ✅ Only allow editSaleId when current tab
    if (tabFromUrl === "current" && editFromUrl) setEditSaleId(String(editFromUrl));
    else setEditSaleId(null);
  }, [location.search, allowedTabKeys]);

  useEffect(() => {
    if (!allowedTabKeys.has(activeTab)) setActiveTab("current");
  }, [allowedTabKeys, activeTab]);

  useEffect(() => {
    if (activeTab !== "closure") return;

    const sp = new URLSearchParams(location.search);
    sp.set("tab", "closure");
    sp.set("closureDate", closureDate || todayDateString());
    sp.delete("editSaleId");

    navigateWithSearch(sp);
  }, [activeTab, closureDate, location.search, navigateWithSearch]);

  // -------------------- Shop + stock --------------------
  const [shop, setShop] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Expenses shared (for Expenses tab + Closure) - tied to TODAY
  const todayStr = todayDateString();
  const [expenses, setExpenses] = useState(() => readExpenses(shopId, todayStr));

  useEffect(() => {
    setExpenses(readExpenses(shopId, todayStr));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, todayStr]);

  useEffect(() => {
    writeExpenses(shopId, todayStr, expenses);
  }, [expenses, shopId, todayStr]);

  const expensesTotalToday = useMemo(() => {
    return (expenses || []).reduce((sum, e) => sum + safeNumber(e?.amount || 0), 0);
  }, [expenses]);

  const stockByItemId = useMemo(() => {
    const map = {};
    for (const row of stockRows || []) {
      const id = Number(row?.item_id);
      if (Number.isFinite(id)) map[id] = row;
    }
    return map;
  }, [stockRows]);

  const shopName = shop?.name || `Shop ${shopId}`;

  const reloadShopAndStock = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const shopRes = await fetch(`${API_BASE}/shops/${shopId}`, { headers: authHeadersNoJson });
      if (!shopRes.ok) throw new Error("Failed to load shop.");
      const shopData = await shopRes.json();

      const stockUrls = [
        `${API_BASE}/stock/?shop_id=${shopId}&only_positive=1`,
        `${API_BASE}/stock/?shop_id=${shopId}&only_positive=true`,
        `${API_BASE}/stock/?shop_id=${shopId}`,
      ];

      let stockData = null;
      let stockOk = false;

      for (const u of stockUrls) {
        const r = await fetch(u, { headers: authHeadersNoJson });
        if (!r.ok) continue;
        stockData = await r.json();
        stockOk = true;
        break;
      }

      if (!stockOk) throw new Error("Failed to load stock.");

      // ✅ decimals safe: 0.5 remaining pieces should count as positive
      const positiveStock = (stockData || []).filter((row) => safeNumber(row?.remaining_pieces) > 0);

      setShop(shopData);
      setStockRows(positiveStock);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load Sales & POS data for this shop.");
    } finally {
      setLoading(false);
    }
  }, [shopId, authHeadersNoJson, API_BASE]);

  useEffect(() => {
    if (shopId) reloadShopAndStock();
  }, [shopId, token, reloadShopAndStock]);

  // -------------------- Calculator (shared) --------------------
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcInitial, setCalcInitial] = useState("");
  const [calcTitle, setCalcTitle] = useState("Calculator");
  const [calcApplyFn, setCalcApplyFn] = useState(() => null);

  const openCalculator = useCallback((initialValue, onApply, title = "Calculator") => {
    setCalcInitial(String(initialValue ?? ""));
    setCalcTitle(title || "Calculator");
    setCalcApplyFn(() => onApply);
    setCalcOpen(true);
  }, []);

  return (
    <div style={{ padding: "18px 18px 28px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <button
            type="button"
            onClick={() => {
              if (!canGoWorkspace) return;
              navigate(workspacePath);
            }}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              fontSize: "12px",
              color: canGoWorkspace ? "#6b7280" : "#94a3b8",
              cursor: canGoWorkspace ? "pointer" : "not-allowed",
              fontWeight: 800,
            }}
            title={canGoWorkspace ? "Back to Shop Workspace" : "Only Admin/Owner/Manager can open workspace"}
          >
            ← Back to Shop Workspace
          </button>

          <div style={{ fontSize: "18px", fontWeight: 900, marginTop: "4px" }}>
            Sales & POS{" "}
            <span style={{ fontSize: "13px", color: "#2563eb", fontWeight: 700 }}>· {shopName}</span>
          </div>
        </div>

        {/* ✅ Mobile friendly tabs: horizontal scroll instead of wrapping */}
        <div
          style={{
            display: "inline-flex",
            backgroundColor: "#e5e7eb",
            borderRadius: "999px",
            padding: "2px",
            maxWidth: "100%",
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            gap: "2px",
          }}
        >
          {allowedTabs.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTabAndUrl(t.key)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 12px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 800,
                  backgroundColor: isActive ? "#ffffff" : "transparent",
                  color: isActive ? "#111827" : "#4b5563",
                  boxShadow: isActive ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  whiteSpace: "nowrap",
                  flex: "0 0 auto",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div
          style={{
            marginTop: "14px",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "18px",
            padding: "14px 16px",
            color: "#6b7280",
          }}
        >
          Loading Sales & POS…
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: "12px",
            padding: "10px 12px",
            borderRadius: "14px",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <div
          style={{
            marginTop: "12px",
            padding: "10px 12px",
            borderRadius: "14px",
            backgroundColor: "#ecfdf3",
            border: "1px solid #bbf7d0",
            color: "#166534",
            fontSize: "13px",
          }}
        >
          {message}
        </div>
      ) : null}

      {!loading && activeTab === "current" ? (
        <CurrentSaleTab
          API_BASE={API_BASE}
          shopId={shopId}
          stockRows={stockRows}
          stockByItemId={stockByItemId}
          authHeaders={authHeaders}
          authHeadersNoJson={authHeadersNoJson}
          openCalculator={openCalculator}
          expenses={expenses}
          setExpenses={setExpenses}
          expensesTotalToday={expensesTotalToday}
          onRefreshStock={reloadShopAndStock}
          onGoToday={() => setTabAndUrl("today")}
          setError={setError}
          clearAlerts={clearAlerts}
          editSaleId={editSaleId}
          onEditDone={clearEditSale}
        />
      ) : null}

      {!loading && activeTab === "expenses" ? (
        <ExpensesTodayTab
          API_BASE={API_BASE}
          authHeadersNoJson={authHeadersNoJson}
          shopId={shopId}
          todayStr={todayStr}
          expenses={expenses}
          setExpenses={setExpenses}
          openCalculator={openCalculator}
          setError={setError}
          setMessage={setMessage}
          clearAlerts={clearAlerts}
          onExpensesChanged={() => {
            // no-op
          }}
        />
      ) : null}

      {!loading && activeTab === "today" ? (
        <MySalesTodayTab
          API_BASE={API_BASE}
          shopId={shopId}
          isCashier={isCashier}
          isAdmin={isAdmin}
          isManager={isManager}
          stockByItemId={stockByItemId}
          authHeaders={authHeaders}
          authHeadersNoJson={authHeadersNoJson}
          onRefreshStock={reloadShopAndStock}
          setError={setError}
          setMessage={setMessage}
          clearAlerts={clearAlerts}
          onEditSale={startEditSale}
        />
      ) : null}

      {activeTab === "closure" ? (
        <DailyClosureTab
          API_BASE={API_BASE}
          shopId={shopId}
          authHeaders={authHeaders}
          authHeadersNoJson={authHeadersNoJson}
          setError={setError}
          setMessage={setMessage}
          clearAlerts={clearAlerts}
        />
      ) : null}

      <CalculatorModal
        open={calcOpen}
        initialValue={calcInitial}
        title={calcTitle}
        onClose={() => setCalcOpen(false)}
        onApply={(num) => {
          try {
            calcApplyFn?.(num);
          } catch {
            // ignore
          }
        }}
      />
    </div>
  );
}
