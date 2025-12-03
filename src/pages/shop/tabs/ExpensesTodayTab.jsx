// src/pages/shop/tabs/ExpensesTodayTab.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { formatMoney, parseAmount, normalizePaymentType } from "../posUtils.js";

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeText(v) {
  return String(v ?? "").trim();
}

function dateValue(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  const d = new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function isNumericId(v) {
  return /^\d+$/.test(String(v ?? "").trim());
}

function normalizeMethodForApi(paymentType) {
  const t = normalizePaymentType(paymentType);
  // UI uses: cash | card | mobile
  // Backend expects: cash | card | momo
  return t === "mobile" ? "momo" : t;
}

function normalizeMethodForUi(methodFromApi) {
  const t = normalizePaymentType(methodFromApi);
  // If backend stores momo -> show as mobile in UI
  return t === "momo" ? "mobile" : t;
}

function extractList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return null;
}

function sameDayAnyField(row, todayStr) {
  const v =
    row?.expense_date ??
    row?.date ??
    row?.closure_date ??
    row?.created_at ??
    row?.ts ??
    row?.time ??
    null;

  if (!v) return false;
  if (typeof v === "string") {
    // handle "YYYY-MM-DD" or ISO "YYYY-MM-DDTHH:mm:ss"
    return v.slice(0, 10) === todayStr;
  }
  const t = new Date(v).toISOString().slice(0, 10);
  return t === todayStr;
}

export default function ExpensesTodayTab({
  // ✅ Add these two props from parent if your API is protected
  API_BASE = "http://127.0.0.1:8000",
  authHeadersNoJson,

  shopId,
  todayStr,

  // Parent still owns these (we keep your existing structure)
  expenses,
  setExpenses,

  openCalculator,
  setError,
  setMessage,
  clearAlerts,

  // ✅ Optional: parent (DailyClosureTab / SalesPOS) can pass this to refresh totals
  onExpensesChanged,
}) {
  const [editingId, setEditingId] = useState(null);
  const [loadingRemote, setLoadingRemote] = useState(false);

  const [form, setForm] = useState({
    category: "",
    payment_type: "cash",
    amount: "",
    description: "",
  });

  const normalized = useMemo(() => {
    const arr = Array.isArray(expenses) ? expenses : [];
    return arr
      .map((e) => {
        const id = e?.id ?? e?._id ?? uid();

        const category =
          e?.category ?? e?.expense_category ?? e?.expenseCategory ?? "";

        const method =
          e?.payment_method ??
          e?.payment ??
          e?.method ??
          e?.payment_type ??
          e?.paymentType ??
          e?.pay_type ??
          "cash";

        const payment_type = normalizeMethodForUi(method);

        const amount = parseAmount(e?.amount ?? e?.cost ?? 0);
        const description = e?.description ?? e?.details ?? e?.note ?? "";

        const created_at = e?.created_at ?? e?.ts ?? e?.time ?? null;

        return {
          id,
          category,
          payment_type,
          amount,
          description,
          created_at,
          raw: e,
        };
      })
      .sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at));
  }, [expenses]);

  const totalAll = useMemo(() => {
    return normalized.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  }, [normalized]);

  const apiHeaders = useMemo(() => {
    // authHeadersNoJson usually already contains Authorization header
    const h = { ...(authHeadersNoJson || {}) };
    // Only set content-type when sending JSON body (we'll do it per request)
    return h;
  }, [authHeadersNoJson]);

  const apiFetchJson = useCallback(
    async (url, opts = {}) => {
      const res = await fetch(url, {
        ...opts,
        headers: {
          ...(apiHeaders || {}),
          ...(opts.headers || {}),
        },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt || ""}`.trim());
      }

      // ✅ Handle "No Content" responses (common for DELETE)
      if (res.status === 204) return null;

      // ✅ Robust JSON handling: even if content-type is wrong or body is empty
      const raw = await res.text().catch(() => "");
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    [apiHeaders]
  );

  const mergeIntoState = useCallback(
    (saved) => {
      if (!saved) return;

      const savedId = saved?.id ?? saved?._id;
      if (savedId === undefined || savedId === null) return;

      setExpenses?.((prev) => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const idx = arr.findIndex((x) => String(x?.id) === String(savedId));
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...saved };
          return arr;
        }
        // Put newest first
        return [saved, ...arr];
      });
    },
    [setExpenses]
  );

  const replaceTempId = useCallback(
    (tempId, saved) => {
      if (!saved) return;
      const savedId = saved?.id ?? saved?._id;
      if (savedId === undefined || savedId === null) return;

      setExpenses?.((prev) => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const idx = arr.findIndex((x) => String(x?.id) === String(tempId));
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...saved, id: savedId };
          return arr;
        }
        return [saved, ...arr];
      });
    },
    [setExpenses]
  );

  const loadTodayFromApi = useCallback(async () => {
    if (!shopId || !todayStr) return;

    setLoadingRemote(true);
    try {
      // Try a few common patterns without breaking if your backend uses a different query
      const candidates = [
        `${API_BASE}/expenses/?shop_id=${shopId}&expense_date=${encodeURIComponent(
          todayStr
        )}`,
        `${API_BASE}/expenses/?shop_id=${shopId}&date=${encodeURIComponent(todayStr)}`,
        `${API_BASE}/expenses/?shop_id=${shopId}&date_from=${encodeURIComponent(
          todayStr
        )}&date_to=${encodeURIComponent(todayStr)}`,
        `${API_BASE}/expenses/today?shop_id=${shopId}&date=${encodeURIComponent(
          todayStr
        )}`,
        `${API_BASE}/expenses/today?shop_id=${shopId}`,
        // ✅ last resort: load by shop, then filter in UI by date
        `${API_BASE}/expenses/?shop_id=${shopId}`,
        `${API_BASE}/expenses/`,
      ];

      let data = null;
      let lastErr = null;

      for (const url of candidates) {
        try {
          const got = await apiFetchJson(url, { method: "GET" });
          const list = extractList(got);
          if (list) {
            data = list;
            break;
          }
          // Some APIs might return a single object when filtered
          if (got && typeof got === "object" && !Array.isArray(got)) {
            // If it looks like an expense object with id, treat as one-item list
            if (got?.id || got?._id) {
              data = [got];
              break;
            }
          }
        } catch (e) {
          lastErr = e;
        }
      }

      if (!data) {
        if (lastErr) console.warn("Could not load expenses from API:", lastErr);
        return;
      }

      // ✅ Ensure we only show today's expenses (prevents "ghost" rows)
      const todayOnly = (Array.isArray(data) ? data : []).filter((row) =>
        sameDayAnyField(row, todayStr)
      );

      setExpenses?.(todayOnly);
    } finally {
      setLoadingRemote(false);
    }
  }, [API_BASE, apiFetchJson, setExpenses, shopId, todayStr]);

  useEffect(() => {
    loadTodayFromApi();
  }, [loadTodayFromApi]);

  function resetForm() {
    setEditingId(null);
    setForm({
      category: "",
      payment_type: "cash",
      amount: "",
      description: "",
    });
  }

  function startEdit(x) {
    setEditingId(x.id);
    setForm({
      category: x.category || "",
      payment_type: x.payment_type || "cash",
      amount: String(Math.round(x.amount || 0)),
      description: x.description || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    clearAlerts?.();

    const category = safeText(form.category);
    const payment_type = normalizePaymentType(form.payment_type);
    const amount = Math.round(parseAmount(form.amount));
    const description = safeText(form.description);

    if (!category) return setError?.("Category is required.");
    if (!amount || amount <= 0) return setError?.("Amount must be > 0.");

    const payment_method = normalizeMethodForApi(payment_type);

    // ✅ Canonical payload for your backend totals logic:
    // models.Expense.shop_id, models.Expense.expense_date, models.Expense.payment_method, models.Expense.amount
    const payload = {
      shop_id: Number(shopId),
      expense_date: todayStr, // "YYYY-MM-DD"
      category,
      payment_method, // "cash" | "card" | "momo"
      amount,
      description,
    };

    try {
      const now = Date.now();

      if (editingId && isNumericId(editingId)) {
        // Update existing (best guess: PUT /expenses/{id})
        const url = `${API_BASE}/expenses/${editingId}`;
        const saved = await apiFetchJson(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (saved) mergeIntoState(saved);

        // ✅ Always reload to guarantee UI==DB (removes duplicates/ghosts)
        await loadTodayFromApi();

        setMessage?.("Expense updated.");
      } else {
        // Create new (best guess: POST /expenses/)
        const tempId = editingId || uid();

        // Optimistic row
        setExpenses?.((prev) => [
          {
            id: tempId,
            ...payload,
            payment_type, // UI-friendly
            ts: now,
            created_at: new Date().toISOString(),
          },
          ...(Array.isArray(prev) ? prev : []),
        ]);

        const saved = await apiFetchJson(`${API_BASE}/expenses/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (saved) replaceTempId(tempId, saved);

        // ✅ Always reload to guarantee UI==DB (removes duplicates/ghosts)
        await loadTodayFromApi();

        setMessage?.("Expense saved.");
      }

      resetForm();
      onExpensesChanged?.();
    } catch (e) {
      console.error(e);
      setError?.(`Failed to save expense. ${e?.message || ""}`.trim());
      await loadTodayFromApi();
    }
  }

  async function del(x) {
    const ok = window.confirm(
      `Delete expense "${x.category}" (${formatMoney(x.amount)} RWF)?`
    );
    if (!ok) return;

    clearAlerts?.();

    try {
      // Optimistic remove first
      setExpenses?.((prev) =>
        Array.isArray(prev)
          ? prev.filter((e) => String(e?.id) !== String(x.id))
          : []
      );

      if (isNumericId(x.id)) {
        // ✅ This may return 204 No Content — apiFetchJson handles that now.
        await apiFetchJson(`${API_BASE}/expenses/${x.id}`, { method: "DELETE" });
      }

      // ✅ Force reload to remove any stale/ghost local rows
      await loadTodayFromApi();

      setMessage?.("Expense deleted.");
      if (String(editingId) === String(x.id)) resetForm();

      onExpensesChanged?.();
    } catch (e) {
      console.error(e);
      setError?.(`Failed to delete expense. ${e?.message || ""}`.trim());
      await loadTodayFromApi();
    }
  }

  const label = {
    fontSize: 11,
    fontWeight: 900,
    color: "#0f172a",
    marginBottom: 6,
  };
  const input = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    fontSize: 13,
    outline: "none",
    background: "#fff",
  };

  const card = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 12,
  };

  return (
    <div style={{ marginTop: 14 }}>
      {/* Header + pad */}
      <div style={{ ...card, padding: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 950 }}>Today Expenses</div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>
            Shop {shopId} · {todayStr} {loadingRemote ? "· loading…" : ""}
          </div>
        </div>

        {/* Simple clean pad */}
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr .9fr 1fr",
              gap: 10,
              alignItems: "end",
            }}
          >
            <div>
              <div style={label}>Category</div>
              <input
                value={form.category}
                onChange={(e) =>
                  setForm((s) => ({ ...s, category: e.target.value }))
                }
                placeholder="Type category…"
                style={input}
              />
            </div>

            <div>
              <div style={label}>Payment</div>
              <select
                value={form.payment_type}
                onChange={(e) =>
                  setForm((s) => ({ ...s, payment_type: e.target.value }))
                }
                style={input}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile">MoMo</option>
              </select>
            </div>

            <div>
              <div style={label}>Amount</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={form.amount}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, amount: e.target.value }))
                  }
                  placeholder="e.g. 2500"
                  inputMode="numeric"
                  style={{ ...input, textAlign: "right", fontWeight: 900 }}
                />
                <button
                  type="button"
                  onClick={() =>
                    openCalculator?.(
                      form.amount,
                      (num) =>
                        setForm((s) => ({ ...s, amount: String(num) })),
                      "Expense Amount"
                    )
                  }
                  style={{
                    width: 56,
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 950,
                    fontSize: 12,
                  }}
                  title="Calculator"
                >
                  🧮
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={label}>Description</div>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((s) => ({ ...s, description: e.target.value }))
              }
              placeholder="Short note…"
              style={input}
            />
          </div>

          {/* Bottom save (sticky, always visible) */}
          <div
            style={{
              marginTop: 12,
              position: "sticky",
              bottom: 0,
              background: "#fff",
              paddingTop: 10,
              borderTop: "1px solid #eef2f7",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                Cancel edit
              </button>
            ) : null}

            <button
              type="button"
              onClick={save}
              style={{
                padding: "10px 14px",
                borderRadius: 14,
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 950,
                fontSize: 12,
              }}
            >
              {editingId ? "Update expense" : "Save expense"}
            </button>
          </div>
        </div>
      </div>

      {/* Details box with Total at top */}
      <div style={{ marginTop: 12, ...card, overflow: "hidden" }}>
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 950 }}>
            Expenses ({normalized.length})
          </div>
          <div
            style={{
              marginLeft: "auto",
              fontSize: 13,
              fontWeight: 950,
              color: "#0f172a",
            }}
          >
            Total expenses:{" "}
            <span style={{ color: "#b91c1c" }}>{formatMoney(totalAll)}</span>
          </div>
        </div>

        {normalized.length === 0 ? (
          <div style={{ padding: 12, fontSize: 12, color: "#64748b" }}>
            No expenses for today.
          </div>
        ) : (
          normalized.map((x) => (
            <div
              key={String(x.id)}
              onClick={() => startEdit(x)}
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr .8fr .9fr 1.6fr 44px",
                gap: 10,
                padding: "10px 12px",
                borderTop: "1px solid #f1f5f9",
                alignItems: "center",
                cursor: "pointer",
                fontSize: 12,
              }}
              title="Click to edit"
            >
              <div style={{ fontWeight: 950, color: "#0f172a" }}>
                {x.category || "-"}
              </div>

              <div
                style={{
                  fontWeight: 900,
                  color: "#334155",
                  textTransform: "uppercase",
                }}
              >
                {x.payment_type === "mobile" ? "MOMO" : x.payment_type}
              </div>

              <div style={{ fontWeight: 950, textAlign: "right" }}>
                {formatMoney(x.amount)}
              </div>

              <div
                style={{
                  color: "#64748b",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {x.description || ""}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  del(x);
                }}
                style={{
                  width: 36,
                  height: 30,
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 950,
                  fontSize: 12,
                }}
                title="Delete"
              >
                X
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
