// FILE: src/pages/shop/InventoryCheckPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Same single source of truth as other pages
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";
const API_BASE = CLIENT_API_BASE;

/* ---------- Small helpers ---------- */

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toISODate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }
  const dt = new Date(s);
  if (!Number.isFinite(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatQty(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-RW", { maximumFractionDigits: 2 });
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  return safe.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/* ---------- ComboBox copied from Purchases (lightly simplified) ---------- */

function ItemComboBox({ items, valueId, onChangeId, disabled }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(() => {
    if (!valueId) return null;
    return items.find((it) => String(it.id) === String(valueId)) || null;
  }, [items, valueId]);

  useEffect(() => {
    if (!open) setQ(selected ? selected.label : "");
  }, [selected, open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 800);
    return items
      .filter((it) => String(it.label || "").toLowerCase().includes(s))
      .slice(0, 800);
  }, [items, q]);

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
          value={disabled ? selected?.label || "" : q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => !disabled && setOpen(true)}
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
          placeholder={disabled ? "" : "Type item name or SKU…"}
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
            <div
              style={{
                padding: "10px 12px",
                fontSize: "13px",
                color: "#6b7280",
              }}
            >
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

/* ---------- Main page ---------- */

function InventoryCheckPage() {
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

  const [activeTab, setActiveTab] = useState(1); // 1=Enter counts, 2=History

  const [shop, setShop] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [itemsCatalog, setItemsCatalog] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Current check state
  const [checkDate, setCheckDate] = useState(() => todayISO());
  const [notes, setNotes] = useState("");
  const [currentCheckId, setCurrentCheckId] = useState(null);
  const [currentStatus, setCurrentStatus] = useState("DRAFT"); // DRAFT | POSTED

  const [lines, setLines] = useState([]); // [{tempId, itemId, itemName, systemPieces, countedPieces, diffPieces, direction}]
  const [pad, setPad] = useState({ itemId: "", countedPieces: "" });
  const [editingLineTempId, setEditingLineTempId] = useState(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);

  // History summaries
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState([]);

  /* ------ Derived helpers ------ */

  const stockByItemId = useMemo(() => {
    const m = {};
    for (const s of stockRows) {
      m[s.item_id] = s;
    }
    return m;
  }, [stockRows]);

  const pickerItems = useMemo(() => {
    const byId = new Map();

    // Prefer item_name from stock
    for (const s of stockRows || []) {
      if (s?.item_id == null) continue;
      const label = s.item_name || `Item #${s.item_id}`;
      byId.set(Number(s.item_id), label);
    }

    // Add any missing items from catalogue
    for (const it of itemsCatalog || []) {
      const id = it?.id ?? it?.item_id;
      if (id == null) continue;
      const label = it?.name ?? it?.item_name ?? `Item #${id}`;
      if (!byId.has(Number(id))) byId.set(Number(id), label);
    }

    return Array.from(byId.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [stockRows, itemsCatalog]);

  const shopName = shop?.name || `Shop ${shopId}`;

  const totalDiffPieces = useMemo(
    () =>
      lines.reduce((sum, l) => sum + Number(l.diffPieces || 0), 0),
    [lines]
  );

  /* ------ Loading initial data (shop, stock, items, summary) ------ */

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        // shop
        const shopRes = await fetch(`${API_BASE}/shops/${shopId}`, {
          headers: authHeadersNoJson,
        });
        if (!shopRes.ok) {
          throw new Error("Failed to load shop.");
        }
        const shopData = await shopRes.json();

        // stock for system pieces
        const stockRes = await fetch(`${API_BASE}/stock/?shop_id=${shopId}`, {
          headers: authHeadersNoJson,
        });
        if (!stockRes.ok) throw new Error("Failed to load stock.");
        const stockData = await stockRes.json();

        // items for real item names
        let itemsData = [];
        try {
          const itemsResShop = await fetch(
            `${API_BASE}/items/?shop_id=${shopId}`,
            { headers: authHeadersNoJson }
          );
          if (itemsResShop.ok) {
            itemsData = await itemsResShop.json().catch(() => []);
          } else {
            const itemsRes = await fetch(`${API_BASE}/items/`, {
              headers: authHeadersNoJson,
            });
            if (itemsRes.ok) {
              itemsData = await itemsRes.json().catch(() => []);
            }
          }
        } catch {
          itemsData = [];
        }

        setShop(shopData);
        setStockRows(Array.isArray(stockData) ? stockData : []);
        setItemsCatalog(Array.isArray(itemsData) ? itemsData : []);
      } catch (e) {
        console.error(e);
        setError(
          e?.message || "Failed to load shop / stock / items for inventory check."
        );
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [shopId, authHeadersNoJson]);

  // History summary
  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/inventory-checks/summary?shop_id=${shopId}`,
        { headers: authHeadersNoJson }
      );
      if (!res.ok) {
        throw new Error(`Failed to load inventory checks (status ${res.status}).`);
      }
      const data = await res.json().catch(() => []);
      setSummary(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to load inventory history.");
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) {
      loadSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  /* ------ Loading an existing check (when selecting from history or date) ------ */

  const loadCheckById = async (checkId) => {
    if (!checkId) return;
    try {
      const res = await fetch(`${API_BASE}/inventory-checks/${checkId}`, {
        headers: authHeadersNoJson,
      });
      if (!res.ok) {
        throw new Error(`Failed to load inventory check (status ${res.status}).`);
      }
      const data = await res.json();

      setCurrentCheckId(data.id);
      setCheckDate(toISODate(data.check_date));
      setNotes(data.notes || "");
      setCurrentStatus(data.status || "DRAFT");

      const newLines = (data.lines || []).map((ln) => {
        const sys = Number(ln.system_pieces || 0);
        const counted = Number(ln.counted_pieces || 0);
        const diff = Number(ln.diff_pieces || 0);

        return {
          tempId: `db-${ln.id}`,
          itemId: ln.item_id,
          itemName: ln.item_name || `Item #${ln.item_id}`,
          systemPieces: sys,
          countedPieces: counted,
          diffPieces: diff,
          direction: ln.difference_direction || (diff === 0
            ? "match"
            : diff > 0
            ? "over"
            : "short"),
          fromDb: true,
        };
      });

      setLines(newLines);
      setPad({ itemId: "", countedPieces: "" });
      setEditingLineTempId(null);
      setMessage("");
      setError("");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to load inventory check.");
    }
  };

  // When date changes: if there is a check for that date in summary, load it. Otherwise clear.
  useEffect(() => {
    const iso = toISODate(checkDate);
    if (!iso || summary.length === 0) return;

    const existing = summary.find((s) => toISODate(s.check_date) === iso);
    if (existing) {
      loadCheckById(existing.id);
    } else {
      // new draft
      setCurrentCheckId(null);
      setCurrentStatus("DRAFT");
      setNotes("");
      setLines([]);
      setPad({ itemId: "", countedPieces: "" });
      setEditingLineTempId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkDate, summary.length]);

  /* ------ Pad behaviour ------ */

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
    color: "#111827",
    marginBottom: "6px",
  };

  const updatePad = (field, value) => {
    setPad((prev) => ({ ...prev, [field]: value }));
  };

  const handlePadAddOrUpdate = () => {
    const itemId = Number(pad.itemId || 0);
    if (!itemId) {
      setError("Select an item first.");
      return;
    }

    const counted = Number(pad.countedPieces || 0);
    if (counted < 0) {
      setError("Counted pieces cannot be negative.");
      return;
    }

    const s = stockByItemId[itemId];
    const systemPieces = s ? Number(s.remaining_pieces || 0) : 0;
    const diff = counted - systemPieces;
    const direction = diff === 0 ? "match" : diff > 0 ? "over" : "short";

    const nameEntry = pickerItems.find((i) => Number(i.id) === itemId);
    const itemName = nameEntry?.label || `Item #${itemId}`;

    if (!editingLineTempId) {
      // new line
      setLines((prev) => [
        ...prev,
        {
          tempId: `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          itemId,
          itemName,
          systemPieces,
          countedPieces: counted,
          diffPieces: diff,
          direction,
          fromDb: false,
        },
      ]);
    } else {
      // edit existing
      setLines((prev) =>
        prev.map((l) =>
          l.tempId === editingLineTempId
            ? {
                ...l,
                itemId,
                itemName,
                systemPieces,
                countedPieces: counted,
                diffPieces: diff,
                direction,
              }
            : l
        )
      );
    }

    setEditingLineTempId(null);
    setPad({ itemId: "", countedPieces: "" });
    setError("");
  };

  const startEditLine = (tempId) => {
    const l = lines.find((x) => x.tempId === tempId);
    if (!l) return;
    setEditingLineTempId(tempId);
    setPad({
      itemId: String(l.itemId),
      countedPieces: String(l.countedPieces ?? ""),
    });
  };

  const removeLine = (tempId) => {
    setLines((prev) => prev.filter((l) => l.tempId !== tempId));
    if (editingLineTempId === tempId) {
      setEditingLineTempId(null);
      setPad({ itemId: "", countedPieces: "" });
    }
  };

  /* ------ Save draft / Post ------ */

  const handleSaveDraft = async () => {
    if (!lines.length) {
      setError("Add at least one item before saving draft.");
      return;
    }

    const iso = toISODate(checkDate);
    if (!iso) {
      setError("Choose a valid inventory date.");
      return;
    }

    setSavingDraft(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        id: currentCheckId ?? null,
        shop_id: Number(shopId),
        check_date: iso,
        notes: notes || null,
        lines: lines.map((l) => ({
          item_id: l.itemId,
          counted_pieces: Number(l.countedPieces || 0),
        })),
      };

      const res = await fetch(`${API_BASE}/inventory-checks/draft`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let detail = "";
        try {
          const data = await res.json();
          detail = data?.detail || "";
        } catch {
          // ignore
        }
        throw new Error(
          detail || `Failed to save draft (status ${res.status}).`
        );
      }

      const data = await res.json();

      setCurrentCheckId(data.id);
      setCurrentStatus(data.status || "DRAFT");
      setCheckDate(toISODate(data.check_date));
      setNotes(data.notes || "");

      const newLines = (data.lines || []).map((ln) => {
        const sys = Number(ln.system_pieces || 0);
        const counted = Number(ln.counted_pieces || 0);
        const diff = Number(ln.diff_pieces || 0);
        return {
          tempId: `db-${ln.id}`,
          itemId: ln.item_id,
          itemName: ln.item_name || `Item #${ln.item_id}`,
          systemPieces: sys,
          countedPieces: counted,
          diffPieces: diff,
          direction:
            ln.difference_direction ||
            (diff === 0 ? "match" : diff > 0 ? "over" : "short"),
          fromDb: true,
        };
      });

      setLines(newLines);
      setPad({ itemId: "", countedPieces: "" });
      setEditingLineTempId(null);

      await loadSummary();

      setMessage("Inventory draft saved.");
      setError("");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to save inventory draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  const handlePost = async () => {
    if (!currentCheckId) {
      setError("Save a draft first before posting.");
      return;
    }
    if (currentStatus === "POSTED") {
      setError("This inventory check is already POSTED.");
      return;
    }

    setPosting(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(
        `${API_BASE}/inventory-checks/${currentCheckId}/post`,
        {
          method: "POST",
          headers: authHeaders,
        }
      );

      if (!res.ok) {
        let detail = "";
        try {
          const data = await res.json();
          detail = data?.detail || "";
        } catch {
          // ignore
        }
        throw new Error(
          detail || `Failed to post inventory check (status ${res.status}).`
        );
      }

      const data = await res.json();

      setCurrentStatus(data.status || "POSTED");
      setCheckDate(toISODate(data.check_date));
      setNotes(data.notes || "");

      const newLines = (data.lines || []).map((ln) => {
        const sys = Number(ln.system_pieces || 0);
        const counted = Number(ln.counted_pieces || 0);
        const diff = Number(ln.diff_pieces || 0);
        return {
          tempId: `db-${ln.id}`,
          itemId: ln.item_id,
          itemName: ln.item_name || `Item #${ln.item_id}`,
          systemPieces: sys,
          countedPieces: counted,
          diffPieces: diff,
          direction:
            ln.difference_direction ||
            (diff === 0 ? "match" : diff > 0 ? "over" : "short"),
          fromDb: true,
        };
      });

      setLines(newLines);
      await loadSummary();

      setMessage(
        "Inventory check POSTED and stock adjusted using these differences."
      );
      setError("");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to post inventory check.");
    } finally {
      setPosting(false);
    }
  };

  /* ---------- Rendering ---------- */

  if (loading) {
    return (
      <div style={{ padding: "32px" }}>
        <p>Loading inventory check page…</p>
      </div>
    );
  }

  const tabBtn = (active) => ({
    padding: "8px 12px",
    borderRadius: "999px",
    border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
    background: active ? "#eff6ff" : "#ffffff",
    color: active ? "#1d4ed8" : "#111827",
    fontWeight: 800,
    fontSize: "12px",
    cursor: "pointer",
  });

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "1500px",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      {/* Header block (same style as Purchases) */}
      <div
        style={{
          paddingBottom: "8px",
          marginBottom: "8px",
          background:
            "linear-gradient(to bottom, #f3f4f6 0%, #f3f4f6 65%, rgba(243,244,246,0) 100%)",
          borderRadius: "18px",
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
              Inventory check
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
                marginTop: "10px",
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                style={tabBtn(activeTab === 1)}
                onClick={() => setActiveTab(1)}
              >
                Enter counts
              </button>
              <button
                type="button"
                style={tabBtn(activeTab === 2)}
                onClick={() => setActiveTab(2)}
              >
                History & differences
              </button>
            </div>
          </div>

          <div
            style={{
              minWidth: "260px",
              maxWidth: "360px",
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
              Inventory summary
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
              Date: {toISODate(checkDate) || checkDate}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>
              Status:{" "}
              <strong
                style={{
                  color: currentStatus === "POSTED" ? "#16a34a" : "#92400e",
                }}
              >
                {currentStatus}
              </strong>
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>
              Total diff pieces:{" "}
              <strong>{formatQty(totalDiffPieces)}</strong>
            </div>
          </div>
        </div>

        {/* Date & notes row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "160px minmax(0, 1fr)",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <input
            type="date"
            value={toISODate(checkDate)}
            onChange={(e) => setCheckDate(e.target.value)}
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
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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

      {(error || message) && (
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

      {/* ================= TAB 1: Enter counts ================= */}
      {activeTab === 1 && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: "16px 18px 14px",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
            Enter inventory counts for {toISODate(checkDate) || checkDate}
          </h2>

          {/* Pad */}
          <div
            style={{
              marginTop: 12,
              marginBottom: 12,
              padding: "14px 14px 16px",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
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
              <span>
                Pad: select item, see system pieces, enter counted pieces, then
                add to list
              </span>

              <button
                type="button"
                onClick={handlePadAddOrUpdate}
                style={{
                  padding: "0.55rem 1.3rem",
                  borderRadius: "9999px",
                  border: "none",
                  backgroundColor: "#2563eb",
                  color: "white",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                {editingLineTempId ? "Update item" : "+ Add to list"}
              </button>
            </div>

            <div style={{ marginBottom: "10px" }}>
              <label style={labelStyle}>Item</label>
              <ItemComboBox
                items={pickerItems}
                valueId={pad.itemId === "" ? "" : String(pad.itemId)}
                onChangeId={(idStr) => updatePad("itemId", idStr)}
                disabled={currentStatus === "POSTED"}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(3, minmax(0, 1fr)) minmax(0, 1.2fr)",
                gap: "12px",
                alignItems: "end",
              }}
            >
              {/* System pieces first */}
              <div>
                <label style={labelStyle}>System pieces</label>
                <input
                  type="text"
                  readOnly
                  value={
                    pad.itemId
                      ? formatQty(
                          stockByItemId[pad.itemId]?.remaining_pieces || 0
                        )
                      : ""
                  }
                  placeholder="—"
                  style={{
                    ...inputBase,
                    backgroundColor: "#f3f4f6",
                    fontWeight: 700,
                  }}
                />
              </div>

              {/* Counted pieces input */}
              <div>
                <label style={labelStyle}>Counted pieces</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pad.countedPieces}
                  onChange={(e) => updatePad("countedPieces", e.target.value)}
                  style={inputBase}
                  disabled={currentStatus === "POSTED"}
                />
              </div>

              {/* Difference */}
              <div>
                <label style={labelStyle}>Difference (counted - system)</label>
                <input
                  type="text"
                  readOnly
                  value={
                    pad.itemId && pad.countedPieces !== ""
                      ? formatQty(
                          Number(pad.countedPieces || 0) -
                            Number(
                              stockByItemId[pad.itemId]?.remaining_pieces || 0
                            )
                        )
                      : ""
                  }
                  placeholder="—"
                  style={{
                    ...inputBase,
                    backgroundColor: "#f3f4f6",
                    fontWeight: 700,
                  }}
                />
              </div>

              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                <strong>Direction:</strong>{" "}
                {(() => {
                  if (!pad.itemId || pad.countedPieces === "") return "—";
                  const sys =
                    Number(
                      stockByItemId[pad.itemId]?.remaining_pieces || 0
                    ) || 0;
                  const counted = Number(pad.countedPieces || 0) || 0;
                  const diff = counted - sys;
                  if (diff === 0) return "match";
                  if (diff > 0) return "over (too many pieces)";
                  return "short (missing pieces)";
                })()}
              </div>
            </div>
          </div>

          {/* Lines list */}
          {lines.length === 0 ? (
            <div
              style={{
                padding: "14px 4px 6px",
                fontSize: "13px",
                color: "#6b7280",
              }}
            >
              No items in this inventory check yet. Use the pad above and click{" "}
              <strong>{editingLineTempId ? "Update item" : "+ Add to list"}</strong>.
            </div>
          ) : (
            <div
              style={{
                borderRadius: "14px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                overflow: "hidden",
                boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
              }}
            >
              <div
                style={{
                  maxHeight: "420px",
                  overflowY: "auto",
                  overflowX: "auto",
                  scrollbarGutter: "stable",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(200px, 2.4fr) 120px 120px 120px 130px 80px",
                    minWidth: "820px",
                    alignItems: "center",
                    padding: "8px 10px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#6b7280",
                    fontWeight: 700,
                    position: "sticky",
                    top: 0,
                    backgroundColor: "#f9fafb",
                    zIndex: 5,
                  }}
                >
                  <div>Item</div>
                  <div style={{ textAlign: "right" }}>System pieces</div>
                  <div style={{ textAlign: "right" }}>Counted pieces</div>
                  <div style={{ textAlign: "right" }}>Difference</div>
                  <div style={{ textAlign: "right" }}>Direction</div>
                  <div></div>
                </div>

                {lines.map((l) => (
                  <div
                    key={l.tempId}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(200px, 2.4fr) 120px 120px 120px 130px 80px",
                      minWidth: "820px",
                      alignItems: "center",
                      padding: "10px 10px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: "13px",
                    }}
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          currentStatus === "POSTED"
                            ? null
                            : startEditLine(l.tempId)
                        }
                        style={{
                          padding: 0,
                          margin: 0,
                          border: "none",
                          background: "transparent",
                          color:
                            currentStatus === "POSTED" ? "#111827" : "#2563eb",
                          fontWeight: 600,
                          fontSize: "13px",
                          cursor:
                            currentStatus === "POSTED"
                              ? "default"
                              : "pointer",
                          textAlign: "left",
                        }}
                      >
                        {l.itemName}
                      </button>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {formatQty(l.systemPieces)}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {formatQty(l.countedPieces)}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {formatQty(l.diffPieces)}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        textTransform: "capitalize",
                        color:
                          l.direction === "over"
                            ? "#16a34a"
                            : l.direction === "short"
                            ? "#b91c1c"
                            : "#4b5563",
                      }}
                    >
                      {l.direction || "match"}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      {currentStatus === "POSTED" ? null : (
                        <button
                          type="button"
                          onClick={() => removeLine(l.tempId)}
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
                          title="Remove line"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              marginTop: "14px",
            }}
          >
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingDraft || currentStatus === "POSTED"}
              style={{
                padding: "0.6rem 1.4rem",
                borderRadius: "999px",
                border: "none",
                backgroundColor:
                  savingDraft || currentStatus === "POSTED"
                    ? "#9ca3af"
                    : "#2563eb",
                color: "white",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor:
                  savingDraft || currentStatus === "POSTED"
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  savingDraft || currentStatus === "POSTED" ? 0.85 : 1,
              }}
            >
              {savingDraft ? "Saving..." : "Save draft"}
            </button>

            <button
              type="button"
              onClick={handlePost}
              disabled={
                posting || !currentCheckId || currentStatus === "POSTED"
              }
              style={{
                padding: "0.6rem 1.8rem",
                borderRadius: "999px",
                border: "none",
                backgroundColor:
                  posting || !currentCheckId || currentStatus === "POSTED"
                    ? "#9ca3af"
                    : "#111827",
                color: "white",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor:
                  posting || !currentCheckId || currentStatus === "POSTED"
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  posting || !currentCheckId || currentStatus === "POSTED"
                    ? 0.85
                    : 1,
              }}
            >
              {posting ? "Posting…" : "Post inventory check"}
            </button>
          </div>
        </div>
      )}

      {/* ================= TAB 2: History & differences ================= */}
      {activeTab === 2 && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: "16px 18px 14px",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
            Inventory checks history
          </h2>

          {summaryLoading ? (
            <div
              style={{
                padding: "14px 4px 6px",
                fontSize: "13px",
                color: "#6b7280",
              }}
            >
              Loading…
            </div>
          ) : summary.length === 0 ? (
            <div
              style={{
                padding: "14px 4px 6px",
                fontSize: "13px",
                color: "#6b7280",
              }}
            >
              No inventory checks for this shop yet.
            </div>
          ) : (
            <div
              style={{
                marginTop: 12,
                borderRadius: "14px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  maxHeight: "420px",
                  overflowY: "auto",
                  overflowX: "auto",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "140px 120px 160px 160px 160px 120px",
                    minWidth: "820px",
                    alignItems: "center",
                    padding: "8px 10px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#6b7280",
                    fontWeight: 700,
                    position: "sticky",
                    top: 0,
                    backgroundColor: "#f9fafb",
                    zIndex: 5,
                  }}
                >
                  <div>Date</div>
                  <div>Status</div>
                  <div style={{ textAlign: "right" }}>Total items</div>
                  <div style={{ textAlign: "right" }}>System pieces</div>
                  <div style={{ textAlign: "right" }}>Counted pieces</div>
                  <div style={{ textAlign: "right" }}>Diff pieces</div>
                </div>

                {summary.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "140px 120px 160px 160px 160px 120px",
                      minWidth: "820px",
                      alignItems: "center",
                      padding: "10px 10px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: "13px",
                    }}
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab(1);
                          setCheckDate(toISODate(s.check_date));
                          loadCheckById(s.id);
                        }}
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
                        title="Open this inventory check"
                      >
                        {toISODate(s.check_date)}
                      </button>
                    </div>
                    <div
                      style={{
                        color:
                          s.status === "POSTED" ? "#16a34a" : "#92400e",
                        textTransform: "capitalize",
                      }}
                    >
                      {s.status.toLowerCase()}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {formatQty(s.total_items)}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {formatQty(s.total_system_pieces)}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {formatQty(s.total_counted_pieces)}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {formatQty(s.total_diff_pieces)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default InventoryCheckPage;
