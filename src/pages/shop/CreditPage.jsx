// FILE: src/pages/shop/CreditPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

function normalizeBaseUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

const API_BASE =
  normalizeBaseUrl(import.meta?.env?.VITE_API_BASE) ||
  "https://iclas-bms-api-prod-pgtdc.ondigitalocean.app";

// -----------------------------
// Formatting helpers
// -----------------------------
function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value) || 0;
  return num.toLocaleString("en-RW", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function formatCount(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("en-RW");
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
function formatDateOnly(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-RW", { year: "numeric", month: "2-digit", day: "2-digit" });
}
function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Grouping key:
 * - phone first
 * - else name
 * - else include saleId to avoid merging unrelated unknowns
 */
function normalizeKey(name, phone, saleId) {
  const p = String(phone || "").trim();
  const n = String(name || "").trim().toLowerCase();
  if (p) return `phone:${p}`;
  if (n) return `name:${n}`;
  return `unknown:${saleId ?? "nosale"}`;
}

function isOpenCredit(c) {
  return safeNumber(c?.balance ?? c?.credit_balance ?? c?.creditBalance ?? 0) > 0;
}

function normalizeCreditItems(creditDetail) {
  const raw =
    creditDetail?.items ||
    creditDetail?.lines ||
    creditDetail?.sale_lines ||
    creditDetail?.saleItems ||
    [];
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((it, idx) => {
    const item_id = it.item_id ?? it.itemId ?? it.id ?? idx;
    const item_name = it.item_name ?? it.itemName ?? it.name ?? `Item #${item_id}`;

    const quantity_pieces = safeNumber(it.quantity_pieces ?? it.quantityPieces ?? it.quantity ?? 0);

    const unit_sale_price = safeNumber(
      it.unit_sale_price ??
        it.unitSalePrice ??
        it.sale_price_per_piece ??
        it.salePricePerPiece ??
        it.unit_price ??
        it.unitPrice ??
        0
    );

    const line_total =
      it.line_total ??
      it.lineTotal ??
      it.line_sale_amount ??
      it.lineSaleAmount ??
      it.total ??
      quantity_pieces * unit_sale_price;

    return {
      item_id,
      item_name,
      quantity_pieces,
      unit_sale_price,
      line_total: safeNumber(line_total),
    };
  });
}

// -----------------------------
// Networking helpers (rest kept as-is)
// -----------------------------
async function promisePool(items, worker, limit = 6) {
  const results = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}

function normalizePaymentMethod(m) {
  const s = String(m || "").toUpperCase();
  if (s === "CASH" || s === "MOMO" || s === "POS") return s;
  return s || "METHOD";
}

function makePaymentKey(p, idx) {
  const pid = p.id ?? p.payment_id ?? p.paymentId ?? "";
  const sale = p.sale_id ?? p.saleId ?? "";
  const at = p.paid_at ?? p.paidAt ?? p.created_at ?? p.createdAt ?? "";
  const amt = p.amount ?? "";
  return `${sale}-${pid || "noid"}-${at || "noat"}-${amt}-${idx}`;
}

// -----------------------------
// Small UI helper components
// -----------------------------
function StatCard({ label, value, color }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "#fff" }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || "#111827", marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Badge({ children, tone = "gray" }) {
  const tones = {
    gray: { bg: "#f3f4f6", fg: "#374151", bd: "#e5e7eb" },
    red: { bg: "#fff1f2", fg: "#991b1b", bd: "#fecdd3" },
    green: { bg: "#ecfdf3", fg: "#166534", bd: "#bbf7d0" },
    blue: { bg: "#eff6ff", fg: "#1d4ed8", bd: "#bfdbfe" },
  };
  const t = tones[tone] || tones.gray;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        color: t.fg,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export default function CreditPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  // ✅ CHANGE: use authHeaders so deployed API works
  const { user, authHeaders } = useAuth();

  // ✅ CHANGE: local fetchJson that always attaches authHeaders (NO feature change)
  async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(authHeaders || {}),
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      let detail = `Request failed. Status: ${res.status}`;
      try {
        const data = await res.json();
        if (data?.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      } catch {}
      throw new Error(detail);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  const roleRaw = user?.role ?? user?.role_name ?? user?.user_role ?? "";
  const role = String(roleRaw).toLowerCase();
  const canSeeWorkspaceLink = ["admin", "manager", "owner", "superadmin"].includes(role);

  const [shop, setShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);

  const [creditsRaw, setCreditsRaw] = useState([]);
  const [summary, setSummary] = useState({
    credits_count: 0,
    original_amount: 0,
    paid_amount: 0,
    profit: 0,
    open_balance: 0,
  });
  const [loadingCredits, setLoadingCredits] = useState(false);

  const [statusFilter, setStatusFilter] = useState("open"); // "open" | "closed" | "all"
  const [search, setSearch] = useState("");

  const [selectedCustomerKey, setSelectedCustomerKey] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedGroupDetails, setSelectedGroupDetails] = useState(null);
  const [loadingSelected, setLoadingSelected] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [activeTab, setActiveTab] = useState("open"); // open | details | payment

  const openReqRef = useRef(0);
  const detailReqRef = useRef(0);

  // ------------------------------------------------------------
  // Load shop
  // ------------------------------------------------------------
  useEffect(() => {
    let mounted = true;
    async function loadShop() {
      setLoadingShop(true);
      setError("");
      try {
        const data = await fetchJson(`${API_BASE}/shops/${shopId}`);
        if (mounted) setShop(data);
      } catch (err) {
        console.error(err);
        if (mounted) setError(err?.message || "Failed to load shop.");
      } finally {
        if (mounted) setLoadingShop(false);
      }
    }
    if (shopId) loadShop();
    return () => (mounted = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // ------------------------------------------------------------
  // Load credits list (open/closed/all)
  // ------------------------------------------------------------
  const loadCredits = async (status = statusFilter) => {
    if (!shopId) return [];
    const reqId = ++openReqRef.current;

    setLoadingCredits(true);
    setError("");
    setMessage("");

    try {
      let data;
      try {
        data = await fetchJson(`${API_BASE}/credits/list?shop_id=${shopId}&status=${status}`);
      } catch (e) {
        if (status === "open") {
          data = await fetchJson(`${API_BASE}/credits/open?shop_id=${shopId}`);
        } else if (status === "closed") {
          data = await fetchJson(`${API_BASE}/credits/closed?shop_id=${shopId}`);
        } else {
          data = await fetchJson(`${API_BASE}/credits/all?shop_id=${shopId}`);
        }
      }

      if (reqId !== openReqRef.current) return [];

      let apiSummary = {};
      let credits = [];

      if (Array.isArray(data)) {
        credits = data;
      } else {
        apiSummary = data.summary || {};
        credits = data.credits || [];
      }

      const safeCredits = Array.isArray(credits) ? credits : [];
      setCreditsRaw(safeCredits);

      if (apiSummary && Object.keys(apiSummary).length > 0) {
        setSummary({
          credits_count: safeNumber(apiSummary.credits_count || 0),
          original_amount: safeNumber(apiSummary.original_amount || 0),
          paid_amount: safeNumber(apiSummary.paid_amount || 0),
          profit: safeNumber(apiSummary.profit || 0),
          open_balance: safeNumber(apiSummary.open_balance || 0),
        });
      } else {
        const totals = safeCredits.reduce(
          (acc, c) => {
            acc.credits_count += 1;
            acc.original_amount += safeNumber(c.original_amount || 0);
            acc.paid_amount += safeNumber(c.paid_amount || 0);
            acc.open_balance += safeNumber(c.balance || 0);
            return acc;
          },
          { credits_count: 0, original_amount: 0, paid_amount: 0, open_balance: 0 }
        );

        setSummary((prev) => ({
          credits_count: totals.credits_count,
          original_amount: totals.original_amount,
          paid_amount: totals.paid_amount,
          profit: prev.profit || 0,
          open_balance: totals.open_balance,
        }));
      }

      if (selectedCustomerKey) {
        const stillExists = safeCredits.some(
          (c) => normalizeKey(c.customer_name, c.customer_phone, c.sale_id) === selectedCustomerKey
        );
        if (!stillExists) {
          setSelectedCustomerKey(null);
          setSelectedCustomer(null);
          setSelectedGroupDetails(null);
          setActiveTab("open");
        }
      }

      return safeCredits;
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load credits.");
      return [];
    } finally {
      if (reqId === openReqRef.current) setLoadingCredits(false);
    }
  };

  useEffect(() => {
    loadCredits(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, statusFilter]);

  // ------------------------------------------------------------
  // Group credits by customer
  // ------------------------------------------------------------
  const groupedCredits = useMemo(() => {
    const groups = {};
    const today0 = startOfTodayMs();

    for (const c of creditsRaw || []) {
      const key = normalizeKey(c.customer_name, c.customer_phone, c.sale_id);

      if (!groups[key]) {
        groups[key] = {
          key,
          customer_name: c.customer_name || "Unknown customer",
          customer_phone: c.customer_phone || "",
          credits: [],
          totals: { credits_count: 0, original_amount: 0, paid_amount: 0, open_balance: 0 },
          oldest_date: null,
          newest_date: null,
          next_due_date: null,
          overdue_count: 0,
          open_count: 0,
          closed_count: 0,
        };
      }

      const saleDate = c.sale_date || null;
      const due = c.due_date ?? c.dueDate ?? null;

      groups[key].credits.push(c);
      groups[key].totals.credits_count += 1;
      groups[key].totals.original_amount += safeNumber(c.original_amount || 0);
      groups[key].totals.paid_amount += safeNumber(c.paid_amount || 0);
      groups[key].totals.open_balance += safeNumber(c.balance || 0);

      if (isOpenCredit(c)) groups[key].open_count += 1;
      else groups[key].closed_count += 1;

      if (saleDate) {
        const t = new Date(saleDate).getTime();
        if (!Number.isNaN(t)) {
          const oldT = groups[key].oldest_date ? new Date(groups[key].oldest_date).getTime() : null;
          const newT = groups[key].newest_date ? new Date(groups[key].newest_date).getTime() : null;
          if (!oldT || t < oldT) groups[key].oldest_date = saleDate;
          if (!newT || t > newT) groups[key].newest_date = saleDate;
        }
      }

      if (due && isOpenCredit(c)) {
        const dt = new Date(due).getTime();
        if (!Number.isNaN(dt)) {
          const next = groups[key].next_due_date ? new Date(groups[key].next_due_date).getTime() : null;
          if (!next || dt < next) groups[key].next_due_date = due;
          if (dt < today0) groups[key].overdue_count += 1;
        }
      }
    }

    const list = Object.values(groups);
    list.sort((a, b) => (b.totals.open_balance || 0) - (a.totals.open_balance || 0));
    return list;
  }, [creditsRaw]);

  const filteredGroupedCredits = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return groupedCredits;
    return groupedCredits.filter((g) => {
      const name = (g.customer_name || "").toLowerCase();
      const phone = (g.customer_phone || "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [groupedCredits, search]);

  const hasCredits = groupedCredits.length > 0;

  // ------------------------------------------------------------
  // Load details for ALL sales in a customer group
  // ------------------------------------------------------------
  const loadCustomerGroupDetail = async (group) => {
    if (!group || !group.key) return null;
    const reqId = ++detailReqRef.current;

    setLoadingSelected(true);
    setError("");
    setMessage("");

    try {
      setSelectedCustomerKey(group.key);
      setSelectedCustomer({ name: group.customer_name || "Unknown customer", phone: group.customer_phone || "" });

      const sales = [...(group.credits || [])].sort((a, b) => {
        const da = new Date(a.sale_date || 0).getTime();
        const db = new Date(b.sale_date || 0).getTime();
        return da - db;
      });

      const details = await promisePool(
        sales,
        async (s) => {
          const saleId = s.sale_id;
          if (!saleId) return null;
          return fetchJson(`${API_BASE}/credits/${saleId}`);
        },
        6
      );

      if (reqId !== detailReqRef.current) return null;

      const detailsSafe = details.filter(Boolean);

      const creditsByDate = detailsSafe
        .map((cd) => {
          const items = normalizeCreditItems(cd);
          const sale_id = cd.sale_id ?? cd.saleId ?? cd.id;
          const sale_date = cd.sale_date ?? cd.saleDate;
          const due_date = cd.due_date ?? cd.dueDate ?? null;

          const original_amount = safeNumber(cd.original_amount ?? cd.originalAmount ?? cd.total_sale_amount ?? cd.totalSaleAmount ?? 0);
          const paid_amount = safeNumber(cd.paid_amount ?? cd.paidAmount ?? 0);
          const balance = safeNumber(cd.balance ?? cd.credit_balance ?? cd.creditBalance ?? 0);
          const profit = safeNumber(cd.total_profit ?? cd.profit ?? 0);

          const rawPayments = cd.payments ?? cd.payment_history ?? cd.paymentHistory ?? [];
          const payments = Array.isArray(rawPayments) ? rawPayments : [];

          return { ...cd, sale_id, sale_date, due_date, original_amount, paid_amount, balance, profit, items, payments };
        })
        .sort((a, b) => new Date(a.sale_date || 0).getTime() - new Date(b.sale_date || 0).getTime());

      const groupTotalsAll = creditsByDate.reduce(
        (acc, cd) => {
          acc.credits_count += 1;
          acc.original_amount += safeNumber(cd.original_amount || 0);
          acc.paid_amount += safeNumber(cd.paid_amount || 0);
          acc.open_balance += safeNumber(cd.balance || 0);
          acc.profit += safeNumber(cd.profit || 0);
          return acc;
        },
        { credits_count: 0, original_amount: 0, paid_amount: 0, profit: 0, open_balance: 0 }
      );

      const paymentsAll = [];
      for (const cd of creditsByDate) {
        for (const p of cd.payments || []) {
          paymentsAll.push({ ...p, sale_id: cd.sale_id, credit_sale_date: cd.sale_date });
        }
      }

      paymentsAll.sort((a, b) => {
        const ta = new Date(a.paid_at ?? a.paidAt ?? a.created_at ?? a.createdAt ?? 0).getTime();
        const tb = new Date(b.paid_at ?? b.paidAt ?? b.created_at ?? b.createdAt ?? 0).getTime();
        return ta - tb;
      });

      const baseOpen = groupTotalsAll.original_amount;
      let runningPaid = 0;

      const paymentsWithRunning = paymentsAll.map((p) => {
        const amt = safeNumber(p.amount ?? p.paid_amount ?? p.paidAmount ?? 0);
        runningPaid += amt;

        return {
          ...p,
          amount: amt,
          payment_method: normalizePaymentMethod(p.payment_method ?? p.method ?? p.paymentMethod),
          paid_at: p.paid_at ?? p.paidAt ?? p.created_at ?? p.createdAt ?? null,
          note: p.note ?? p.notes ?? null,
          group_open_balance_after: Math.max(0, baseOpen - runningPaid),
        };
      });

      const aggregated = {
        customer: { name: group.customer_name || "Unknown customer", phone: group.customer_phone || "" },
        totals: groupTotalsAll,
        credits: creditsByDate,
        payments: paymentsWithRunning,
      };

      setSelectedGroupDetails(aggregated);

      const openOnlyTotals = creditsByDate.reduce(
        (acc, cd) => {
          if (safeNumber(cd.balance || 0) > 0) {
            acc.original_amount += safeNumber(cd.original_amount || 0);
            acc.paid_amount += safeNumber(cd.paid_amount || 0);
            acc.open_balance += safeNumber(cd.balance || 0);
          }
          return acc;
        },
        { original_amount: 0, paid_amount: 0, open_balance: 0 }
      );
      setPaymentAmount(openOnlyTotals.open_balance != null ? String(Math.round(openOnlyTotals.open_balance)) : "");

      setActiveTab("details");
      return aggregated;
    } catch (err) {
      console.error(err);
      if (reqId === detailReqRef.current) setError(err?.message || "Failed to load customer credit details.");
      return null;
    } finally {
      if (reqId === detailReqRef.current) setLoadingSelected(false);
    }
  };

  const reloadSelectedGroup = async () => {
    if (!selectedCustomerKey) return;
    const fresh = await loadCredits(statusFilter);

    const credits = fresh.filter((c) => normalizeKey(c.customer_name, c.customer_phone, c.sale_id) === selectedCustomerKey);
    if (!credits.length) {
      setSelectedCustomerKey(null);
      setSelectedCustomer(null);
      setSelectedGroupDetails(null);
      setPaymentAmount("");
      setPaymentNote("");
      setActiveTab("open");
      return;
    }
    const groupObj = {
      key: selectedCustomerKey,
      customer_name: selectedCustomer?.name || credits[0]?.customer_name || "Unknown customer",
      customer_phone: selectedCustomer?.phone || credits[0]?.customer_phone || "",
      credits,
    };
    await loadCustomerGroupDetail(groupObj);
  };

  // ------------------------------------------------------------
  // Save GROUP payment (only applies to open credits in this group)
  // ------------------------------------------------------------
  const handleSaveGroupPayment = async () => {
    if (!selectedGroupDetails || !selectedGroupDetails.credits?.length) return;

    const openOnlyBalance = selectedGroupDetails.credits.reduce((acc, cd) => {
      const bal = safeNumber(cd.balance || 0);
      if (bal > 0) acc += bal;
      return acc;
    }, 0);

    const amountNum = safeNumber(paymentAmount || 0);

    if (!amountNum || amountNum <= 0) {
      setError("Enter a valid payment amount.");
      setMessage("");
      return;
    }
    if (amountNum > openOnlyBalance) {
      setError("Payment cannot be greater than the customer OPEN balance.");
      setMessage("");
      return;
    }

    setSavingPayment(true);
    setError("");
    setMessage("");

    try {
      const methodForBackend =
        paymentMethod === "cash"
          ? "CASH"
          : paymentMethod === "card"
          ? "POS"
          : paymentMethod === "mobile"
          ? "MOMO"
          : String(paymentMethod || "").toUpperCase();

      let remaining = amountNum;

      const creditsSorted = [...selectedGroupDetails.credits].sort(
        (a, b) => new Date(a.sale_date || 0).getTime() - new Date(b.sale_date || 0).getTime()
      );

      for (const credit of creditsSorted) {
        const saleId = credit.sale_id;
        const bal = safeNumber(credit.balance || 0);
        if (!saleId || bal <= 0) continue;

        const payNow = Math.min(bal, remaining);
        if (payNow <= 0) continue;

        await fetchJson(`${API_BASE}/credits/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sale_id: saleId,
            amount: payNow,
            payment_method: methodForBackend,
            note: paymentNote || null,
          }),
        });

        remaining -= payNow;
        if (remaining <= 0) break;
      }

      setMessage("Payment recorded successfully.");
      setError("");
      setPaymentNote("");

      await reloadSelectedGroup();
      setActiveTab("details");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to save payment.");
      setMessage("");
    } finally {
      setSavingPayment(false);
    }
  };

  const selectedCredits = selectedGroupDetails?.credits || [];

  const selectedOpenTotals = useMemo(() => {
    const t = selectedCredits.reduce(
      (acc, cd) => {
        const bal = safeNumber(cd.balance || 0);
        if (bal > 0) {
          acc.original += safeNumber(cd.original_amount || 0);
          acc.paid += safeNumber(cd.paid_amount || 0);
          acc.balance += bal;
          acc.open_sales += 1;
        }
        return acc;
      },
      { open_sales: 0, original: 0, paid: 0, balance: 0 }
    );
    return t;
  }, [selectedCredits]);

  const canPay = !!selectedGroupDetails && safeNumber(selectedOpenTotals.balance || 0) > 0;

  if (loadingShop) return <div style={{ padding: "24px" }}><p>Loading shop...</p></div>;
  if (error && !shop) return <div style={{ padding: "24px", color: "red" }}><p>{error}</p></div>;

  const statusLabel = statusFilter === "open" ? "Open" : statusFilter === "closed" ? "Closed (History)" : "All (History)";
  const shopTitle = shop?.name || `Shop ${shopId}`;

  return (
    <div style={{ padding: "16px 24px 24px" }}>
      {/* header unchanged */}
      {canSeeWorkspaceLink ? (
        <button onClick={() => navigate(`/shops/${shopId}`)} style={{ border: "none", background: "transparent", padding: 0, marginBottom: "4px", fontSize: "12px", color: "#2563eb", cursor: "pointer" }}>
          ← Back to shop workspace
        </button>
      ) : (
        <button onClick={() => navigate(-1)} style={{ border: "none", background: "transparent", padding: 0, marginBottom: "4px", fontSize: "12px", color: "#2563eb", cursor: "pointer" }}>
          ← Back
        </button>
      )}

      {/* ✅ The rest of your UI remains exactly as you pasted it originally */}
      {/* (Customers / Details / Payment tabs full content kept) */}

      {/* --- START ORIGINAL UI --- */}

      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline" }}>
        <div>
          <h1 style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "0.03em", margin: 0 }}>Credits</h1>
          <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>
            <strong>{statusLabel}</strong> credits grouped by customer for <strong>{shopTitle}</strong>.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {selectedCustomerKey && (
            <button type="button" onClick={() => {
              setSelectedCustomerKey(null);
              setSelectedCustomer(null);
              setSelectedGroupDetails(null);
              setPaymentAmount("");
              setPaymentNote("");
              setActiveTab("open");
            }} style={{ border: "1px solid #e5e7eb", background: "#ffffff", borderRadius: "999px", padding: "8px 10px", fontSize: "12px", cursor: "pointer" }}>
              ✕ Clear
            </button>
          )}
          <button type="button" onClick={() => loadCredits(statusFilter)} style={{ border: "1px solid #e5e7eb", background: "#ffffff", borderRadius: "999px", padding: "8px 10px", fontSize: "12px", cursor: "pointer" }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {(error || message) && (
        <div style={{ marginTop: "10px", marginBottom: "8px", padding: "0.6rem 0.8rem", borderRadius: "0.75rem", backgroundColor: error ? "#fef2f2" : "#ecfdf3", color: error ? "#b91c1c" : "#166534", fontSize: "0.9rem" }}>
          {error || message}
        </div>
      )}

      <div style={{ marginTop: "12px", marginBottom: "14px", backgroundColor: "#ffffff", borderRadius: "18px", boxShadow: "0 10px 30px rgba(15,37,128,0.06)", padding: "14px 18px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "6px" }}>Credit summary</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "open", label: "Open" },
                { id: "closed", label: "Closed (History)" },
                { id: "all", label: "All (History)" },
              ].map((s) => {
                const active = statusFilter === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(s.id);
                      setActiveTab("open");
                      setSelectedGroupDetails(null);
                      setSelectedCustomerKey(null);
                      setSelectedCustomer(null);
                    }}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: active ? "#111827" : "#ffffff",
                      color: active ? "#ffffff" : "#111827",
                      borderRadius: "999px",
                      padding: "6px 10px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ minWidth: "260px", maxWidth: "420px", width: "35%" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer name or phone…"
              style={{ width: "100%", padding: "10px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#ffffff" }}
            />
            <div style={{ marginTop: "4px", fontSize: "11px", color: "#9ca3af" }}>
              Showing {formatCount(filteredGroupedCredits.length)} customers (from {formatCount(groupedCredits.length)})
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", columnGap: "18px", rowGap: "8px", fontSize: "12px", marginTop: 10 }}>
          <div>
            <div style={{ color: "#6b7280" }}>Credits count</div>
            <div style={{ fontSize: "20px", fontWeight: 800 }}>{formatCount(summary.credits_count)}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280" }}>Original amount</div>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>{formatMoney(summary.original_amount)}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280" }}>Paid so far</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#16a34a" }}>{formatMoney(summary.paid_amount)}</div>
          </div>
          <div>
            <div style={{ color: "#6b7280" }}>Profit (if available)</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: summary.profit < 0 ? "#b91c1c" : "#16a34a" }}>
              {formatMoney(summary.profit || 0)}
            </div>
          </div>
          <div>
            <div style={{ color: "#6b7280" }}>Open balance</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#b91c1c" }}>{formatMoney(summary.open_balance)}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "0.75rem", display: "inline-flex", borderRadius: "999px", backgroundColor: "#e5e7eb", padding: "0.15rem", marginBottom: "12px" }}>
        {[
          { id: "open", label: "Customers" },
          { id: "details", label: "Customer details", disabled: !selectedCustomerKey },
          { id: "payment", label: "Record payment", disabled: !selectedCustomerKey },
        ].map((tab) => {
          const active = activeTab === tab.id;
          const disabled = !!tab.disabled;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => !disabled && setActiveTab(tab.id)}
              style={{
                border: "none",
                cursor: disabled ? "not-allowed" : "pointer",
                padding: "0.45rem 0.9rem",
                borderRadius: "999px",
                fontSize: "0.9rem",
                fontWeight: active ? 700 : 500,
                backgroundColor: active ? "white" : "transparent",
                color: disabled ? "#9ca3af" : active ? "#111827" : "#4b5563",
                boxShadow: active ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                opacity: disabled ? 0.7 : 1,
              }}
              title={disabled ? "Select a customer first" : ""}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* CUSTOMERS TAB */}
      {activeTab === "open" && (
        <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", boxShadow: "0 6px 18px rgba(15,37,128,0.04)", padding: "14px 16px 14px", minHeight: "260px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>
            Customers · <span style={{ color: "#6b7280" }}>{statusLabel}</span>
          </div>

          {loadingCredits ? (
            <div style={{ fontSize: "13px", color: "#6b7280" }}>Loading credits...</div>
          ) : !hasCredits ? (
            <div style={{ fontSize: "13px", color: "#6b7280", paddingTop: "4px" }}>No credits found for this filter.</div>
          ) : filteredGroupedCredits.length === 0 ? (
            <div style={{ fontSize: "13px", color: "#6b7280", paddingTop: "4px" }}>No customers match your search.</div>
          ) : (
            <div style={{ maxHeight: "520px", overflowY: "auto" }}>
              {filteredGroupedCredits.map((g) => {
                const isActive = g.key === selectedCustomerKey;
                const hasOverdue = (g.overdue_count || 0) > 0;
                const isFullyClosed = safeNumber(g.totals.open_balance || 0) <= 0;

                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => loadCustomerGroupDetail(g)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      borderRadius: "12px",
                      border: isActive
                        ? "1px solid #2563eb"
                        : isFullyClosed
                        ? "1px solid #16a34a"
                        : hasOverdue
                        ? "1px solid #ef4444"
                        : "1px solid #e5e7eb",
                      backgroundColor: isActive ? "#eff6ff" : isFullyClosed ? "#ecfdf3" : hasOverdue ? "#fff1f2" : "#ffffff",
                      padding: "10px 12px",
                      marginBottom: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 800, color: "#111827" }}>
                          {g.customer_name || "Unknown customer"}{" "}
                          {isFullyClosed ? (
                            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 900, color: "#166534" }}>CLOSED</span>
                          ) : hasOverdue ? (
                            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 900, color: "#b91c1c" }}>OVERDUE ({g.overdue_count})</span>
                          ) : null}
                        </div>

                        {!!g.customer_phone && <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{g.customer_phone}</div>}

                        {g.oldest_date && (
                          <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                            Oldest: <strong>{formatDateOnly(g.oldest_date)}</strong> · Latest: <strong>{formatDateOnly(g.newest_date)}</strong>
                          </div>
                        )}

                        {g.next_due_date && !isFullyClosed && (
                          <div style={{ fontSize: "11px", color: hasOverdue ? "#b91c1c" : "#9ca3af", marginTop: "2px" }}>
                            Next due: <strong>{formatDateOnly(g.next_due_date)}</strong>
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "11px", color: "#6b7280" }}>Open balance</div>
                        <div style={{ fontSize: "16px", fontWeight: 800, color: isFullyClosed ? "#16a34a" : "#b91c1c" }}>
                          {formatMoney(g.totals.open_balance || 0)}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: "6px", display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "11px", color: "#6b7280" }}>
                      <span>
                        Credits: <strong>{formatCount(g.totals.credits_count)}</strong> · Open:{" "}
                        <strong style={{ color: "#b91c1c" }}>{formatCount(g.open_count)}</strong> · Closed:{" "}
                        <strong style={{ color: "#16a34a" }}>{formatCount(g.closed_count)}</strong>
                      </span>
                      <span>
                        Orig: {formatMoney(g.totals.original_amount)} · Paid: {formatMoney(g.totals.paid_amount)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DETAILS TAB */}
      {activeTab === "details" && (
        <div style={{ marginTop: "6px", backgroundColor: "#ffffff", borderRadius: "18px", boxShadow: "0 6px 18px rgba(15,37,128,0.04)", padding: "14px 16px 14px", minHeight: "260px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "6px" }}>Selected customer details</div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {selectedCustomerKey && (
                <button type="button" onClick={() => reloadSelectedGroup()} style={{ border: "1px solid #e5e7eb", background: "#ffffff", borderRadius: "999px", padding: "8px 10px", fontSize: "12px", cursor: "pointer" }}>
                  ↻ Refresh
                </button>
              )}

              {canPay && (
                <button type="button" onClick={() => setActiveTab("payment")} style={{ border: "none", backgroundColor: "#2563eb", color: "#ffffff", padding: "8px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                  Pay credit
                </button>
              )}
            </div>
          </div>

          {!selectedGroupDetails ? (
            <div style={{ fontSize: "13px", color: "#6b7280" }}>Select a customer from Customers to view full details.</div>
          ) : loadingSelected ? (
            <div style={{ fontSize: "13px", color: "#6b7280" }}>Loading customer credit details...</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>{selectedCustomer?.name || "Unknown customer"}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    Phone: <strong>{selectedCustomer?.phone || "—"}</strong>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Total OPEN balance</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: safeNumber(selectedOpenTotals.balance || 0) > 0 ? "#b91c1c" : "#16a34a" }}>
                    {formatMoney(selectedOpenTotals.balance || 0)}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>Open credit summary (customer)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                  <StatCard label="Original (open only)" value={formatMoney(selectedOpenTotals.original)} />
                  <StatCard label="Paid (open only)" value={formatMoney(selectedOpenTotals.paid)} color="#16a34a" />
                  <StatCard label="Balance (open only)" value={formatMoney(selectedOpenTotals.balance)} color="#b91c1c" />
                </div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>Credit sales (items)</div>

              {selectedCredits.length === 0 ? (
                <div style={{ fontSize: 13, color: "#6b7280" }}>No credit sales found.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selectedCredits.map((cd) => {
                    const open = safeNumber(cd.balance || 0) > 0;
                    const items = Array.isArray(cd.items) ? cd.items : [];
                    const itemsTotal = items.reduce((acc, it) => acc + safeNumber(it.line_total || 0), 0);

                    const due = cd.due_date || null;
                    const overdue = open && due ? new Date(due).getTime() < startOfTodayMs() : false;

                    return (
                      <div key={cd.sale_id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: "12px 12px", background: "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>Sale #{cd.sale_id}</div>
                              {open ? <Badge tone={overdue ? "red" : "blue"}>{overdue ? "OPEN · OVERDUE" : "OPEN"}</Badge> : <Badge tone="green">CLOSED</Badge>}
                              {due ? (
                                <span style={{ fontSize: 12, color: overdue ? "#b91c1c" : "#6b7280" }}>
                                  Due: <strong>{formatDateOnly(due)}</strong>
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: "#9ca3af" }}>Due: —</span>
                              )}
                            </div>

                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                              Date: <strong>{formatDateTime(cd.sale_date)}</strong>
                            </div>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>Balance</div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: open ? "#b91c1c" : "#16a34a" }}>
                              {formatMoney(cd.balance || 0)}
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>Items taken</div>

                          {items.length === 0 ? (
                            <div style={{ fontSize: 12, color: "#6b7280" }}>No item lines returned by the API for this sale.</div>
                          ) : (
                            <div style={{ overflowX: "auto", border: "1px solid #f3f4f6", borderRadius: 12 }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: "#f9fafb" }}>
                                    <th style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid #e5e7eb" }}>Item</th>
                                    <th style={{ textAlign: "right", padding: "10px 10px", borderBottom: "1px solid #e5e7eb" }}>Qty (pcs)</th>
                                    <th style={{ textAlign: "right", padding: "10px 10px", borderBottom: "1px solid #e5e7eb" }}>Unit price</th>
                                    <th style={{ textAlign: "right", padding: "10px 10px", borderBottom: "1px solid #e5e7eb" }}>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((it) => (
                                    <tr key={`${cd.sale_id}-${it.item_id}`}>
                                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, color: "#111827" }}>
                                        {it.item_name}
                                      </td>
                                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>
                                        {formatCount(it.quantity_pieces || 0)}
                                      </td>
                                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>
                                        {formatMoney(it.unit_sale_price || 0)}
                                      </td>
                                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right", fontWeight: 800 }}>
                                        {formatMoney(it.line_total || 0)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td colSpan={3} style={{ padding: "10px 10px", textAlign: "right", fontWeight: 900 }}>
                                      Items total
                                    </td>
                                    <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 900 }}>
                                      {formatMoney(itemsTotal)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* PAYMENT TAB */}
      {activeTab === "payment" && (
        <div style={{ marginTop: "6px", backgroundColor: "#ffffff", borderRadius: "18px", boxShadow: "0 6px 18px rgba(15,37,128,0.04)", padding: "14px 16px 14px", minHeight: "260px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>Record payment (customer total)</div>
            {selectedCustomerKey && (
              <button type="button" onClick={() => setActiveTab("details")} style={{ border: "1px solid #e5e7eb", background: "#ffffff", borderRadius: "999px", padding: "8px 10px", fontSize: "12px", cursor: "pointer" }}>
                ← Back to details
              </button>
            )}
          </div>

          {!selectedGroupDetails ? (
            <div style={{ fontSize: "13px", color: "#6b7280" }}>First select a customer.</div>
          ) : !canPay ? (
            <div style={{ fontSize: "13px", color: "#16a34a" }}>All OPEN credits are fully paid (history only).</div>
          ) : (
            <>
              <div style={{ fontSize: "12px", marginBottom: "4px", color: "#6b7280" }}>
                Customer: <strong>{selectedCustomer?.name || "Unknown"}</strong> {selectedCustomer?.phone ? `(${selectedCustomer.phone})` : ""}
              </div>
              <div style={{ fontSize: "12px", marginBottom: "10px", color: "#6b7280" }}>
                OPEN balance: <strong>{formatMoney(selectedOpenTotals.balance || 0)}</strong>
              </div>

              <div style={{ marginTop: "6px", marginBottom: "10px" }}>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Amount</div>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "14px" }}
                />
              </div>

              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Payment method</div>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "14px", backgroundColor: "#ffffff" }}
                >
                  <option value="cash">Cash</option>
                  <option value="card">POS / Card</option>
                  <option value="mobile">MoMo / Mobile</option>
                </select>
              </div>

              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Note (optional)</div>
                <textarea
                  rows={4}
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "12px", border: "1px solid #d1d5db", fontSize: "13px", resize: "vertical" }}
                />
              </div>

              <button
                type="button"
                onClick={handleSaveGroupPayment}
                disabled={!canPay || savingPayment}
                style={{
                  width: "100%",
                  padding: "12px 18px",
                  borderRadius: "999px",
                  border: "none",
                  backgroundColor: !canPay || savingPayment ? "#9ca3af" : "#2563eb",
                  color: "white",
                  fontWeight: 700,
                  fontSize: "15px",
                  cursor: !canPay || savingPayment ? "not-allowed" : "pointer",
                }}
              >
                {savingPayment ? "Saving payment..." : "Save payment"}
              </button>
            </>
          )}
        </div>
      )}

      {/* --- END ORIGINAL UI --- */}
    </div>
  );
}
