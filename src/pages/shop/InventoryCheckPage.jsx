// src/pages/shop/InventoryCheckPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Same API_BASE pattern as Purchases / POS
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";
const API_BASE = CLIENT_API_BASE;

// ---------- small helpers ----------

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

function formatQty(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("en-RW", { maximumFractionDigits: 2 });
}

function formatMoney(v) {
  if (v === null || v === undefined || v === "") return "0";
  const n = Number(v);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ---------- same style combo box as purchases ----------

function ItemComboBox({ items, valueId, onChangeId, disabled }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(() => {
    if (!valueId) return null;
    return items.find((it) => String(it.id) === String(valueId)) || null;
  }, [items, valueId]);

  // show selected label when closed
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

  // close when clicking outside
  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
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
          onFocus={() => {
            if (!disabled) setOpen(true); // ✅ dropdown only when cursor is in pad
          }}
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
            maxHeight: "260px", // ✅ does not extend past pad
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

// ---------- main page ----------

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

  const [activeTab, setActiveTab] = useState(1); // 1 = Enter counts, 2 = History
  const [shop, setShop] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [itemsCatalog, setItemsCatalog] = useState([]);
  const [loading, setLoading] = useState(true);

  const [inventoryDate, setInventoryDate] = useState(() => todayISO());
  const [headerId, setHeaderId] = useState(null);

  const [lines, setLines] = useState([]); // each: {id, dbId?, itemId, systemPieces, countedPieces}
  const [pad, setPad] = useState({
    itemId: "",
    countedPieces: "",
  });

  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const padRef = useRef(null);

  // ---------- load shop + stock + items (same as Purchases) ----------

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const shopRes = await fetch(`${API_BASE}/shops/${shopId}`, {
          headers: authHeadersNoJson,
        });
        if (!shopRes.ok) {
          throw new Error("Failed to load shop.");
        }
        const shopData = await shopRes.json();

        const stockRes = await fetch(`${API_BASE}/stock/?shop_id=${shopId}`, {
          headers: authHeadersNoJson,
        });
        if (!stockRes.ok) {
          throw new Error("Failed to load stock.");
        }
        const stockData = await stockRes.json();

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
          // fine – pad will still work with stock list
        }

        setShop(shopData);
        setStockRows(Array.isArray(stockData) ? stockData : []);
        setItemsCatalog(Array.isArray(itemsData) ? itemsData : []);
      } catch (e) {
        console.error(e);
        setError(e?.message || "Failed to load inventory check data.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [shopId, authHeadersNoJson]);

  // ---------- derived maps ----------

  const stockByItemId = useMemo(() => {
    const m = {};
    for (const s of stockRows || []) {
      if (s?.item_id == null) continue;
      m[Number(s.item_id)] = s;
    }
    return m;
  }, [stockRows]);

  // use real item names from stock + item catalogue
  const pickerItems = useMemo(() => {
    const byId = new Map();

    for (const s of stockRows || []) {
      if (s?.item_id == null) continue;
      const label = s?.item_name || `Item ${s.item_id}`;
      byId.set(Number(s.item_id), label);
    }

    for (const it of itemsCatalog || []) {
      const id = it?.id ?? it?.item_id;
      if (id == null) continue;
      const label = it?.name ?? it?.item_name ?? `Item ${id}`;
      if (!byId.has(Number(id))) byId.set(Number(id), label);
    }

    return Array.from(byId.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [stockRows, itemsCatalog]);

  const shopName = shop?.name || `Shop ${shopId}`;

  // ---------- load existing draft from backend (behaviour like Purchases) ----------

  async function loadDraftForDate(dateIso) {
    const iso = toISODate(dateIso);
    if (!iso) return;

    try {
      const url = `${API_BASE}/inventory-checks/draft?shop_id=${shopId}&inventory_date=${iso}`;
      const res = await fetch(url, { headers: authHeadersNoJson });

      if (!res.ok) {
        // If 404 or similar: treat as "no data yet", do not scream “Failed to fetch”
        setHeaderId(null);
        setLines([]);
        return;
      }

      const data = await res.json().catch(() => null);
      if (!data) {
        setHeaderId(null);
        setLines([]);
        return;
      }

      setHeaderId(data.id ?? null);

      const mapped =
        (data.lines || []).map((ln) => ({
          id: `db-${ln.id}`,
          dbId: ln.id,
          itemId: ln.item_id,
          systemPieces:
            ln.system_pieces ??
            ln.system_qty ??
            stockByItemId[ln.item_id]?.pieces_in_stock ??
            0,
          countedPieces: ln.counted_pieces ?? ln.counted_qty ?? 0,
          diffPieces: ln.difference_pieces ?? ln.diff_pieces ?? 0,
          diffCost: ln.diff_cost_total ?? 0,
        })) || [];

      setLines(mapped);
    } catch (e) {
      console.error(e);
      // This is where a real network/CORS failure would show – same as other pages.
      setError(
        "Failed to fetch inventory draft. Check backend /inventory-checks endpoints and CORS."
      );
    }
  }

  // load draft whenever date changes (like Purchases "Today" tab)
  useEffect(() => {
    if (!loading) {
      loadDraftForDate(inventoryDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryDate, loading, shopId]);

  // ---------- pad / list behaviour ----------

  const updatePad = (field, raw) => {
    setPad((prev) => ({
      ...prev,
      [field]: raw,
    }));
  };

  const clearPad = () => {
    setPad({
      itemId: "",
      countedPieces: "",
    });
  };

  const handleAddToList = () => {
    const itemId = Number(pad.itemId || 0);
    if (!itemId) {
      setError("Select an item before adding to list.");
      setMessage("");
      return;
    }

    const countedPieces = Number(pad.countedPieces || 0);
    if (!Number.isFinite(countedPieces) || countedPieces < 0) {
      setError("Counted pieces must be zero or more.");
      setMessage("");
      return;
    }

    const stockRow = stockByItemId[itemId];
    const systemPieces =
      stockRow?.pieces_in_stock ??
      stockRow?.stock_pieces ??
      stockRow?.total_pieces ??
      0;

    const diffPieces = countedPieces - Number(systemPieces || 0);

    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === itemId && !l.dbId);
      if (existing) {
        return prev.map((l) =>
          l === existing
            ? {
                ...l,
                systemPieces,
                countedPieces,
                diffPieces,
              }
            : l
        );
      }
      return [
        ...prev,
        {
          id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          itemId,
          systemPieces,
          countedPieces,
          diffPieces,
        },
      ];
    });

    setError("");
    setMessage("");
    clearPad();

    if (padRef.current) {
      padRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const removeLine = (id) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const systemTotalDiffPieces = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + Number(l.diffPieces || 0),
        0
      ),
    [lines]
  );

  // ---------- save draft to backend (similar to Save purchase) ----------

  const handleSaveDraft = async () => {
    if (!lines.length) {
      setError("No items in this inventory check.");
      setMessage("");
      return;
    }

    setSavingDraft(true);
    setError("");
    setMessage("");

    try {
      const iso = toISODate(inventoryDate);
      const payload = {
        shop_id: Number(shopId),
        inventory_date: iso,
        header_id: headerId,
        lines: lines.map((l) => ({
          id: l.dbId ?? null,
          item_id: l.itemId,
          system_pieces: Number(l.systemPieces || 0),
          counted_pieces: Number(l.countedPieces || 0),
        })),
      };

      const res = await fetch(`${API_BASE}/inventory-checks/draft`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body?.detail ||
          `Failed to save inventory draft. Status: ${res.status}`;
        throw new Error(msg);
      }

      const data = await res.json().catch(() => null);

      // refresh header + lines from backend response, like Purchases
      setHeaderId(data?.id ?? null);

      const mapped =
        (data?.lines || []).map((ln) => ({
          id: `db-${ln.id}`,
          dbId: ln.id,
          itemId: ln.item_id,
          systemPieces:
            ln.system_pieces ??
            ln.system_qty ??
            stockByItemId[ln.item_id]?.pieces_in_stock ??
            0,
          countedPieces: ln.counted_pieces ?? ln.counted_qty ?? 0,
          diffPieces: ln.difference_pieces ?? ln.diff_pieces ?? 0,
          diffCost: ln.diff_cost_total ?? 0,
        })) || [];

      setLines(mapped);
      setMessage("Inventory draft saved.");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to save inventory draft.");
      setMessage("");
    } finally {
      setSavingDraft(false);
    }
  };

  // ---------- post inventory check (similar idea to “Save purchase”) ----------

  const handlePostInventory = async () => {
    if (!headerId) {
      setError("Save the inventory draft first before posting.");
      setMessage("");
      return;
    }

    setPosting(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(
        `${API_BASE}/inventory-checks/${headerId}/post`,
        {
          method: "POST",
          headers: authHeaders,
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body?.detail ||
          `Failed to post inventory check. Status: ${res.status}`;
        throw new Error(msg);
      }

      await res.json().catch(() => null);

      setMessage(
        "Inventory check posted. Stock should now be reconciled to counted pieces."
      );

      // reload from backend, in case posted header has updated lines
      await loadDraftForDate(inventoryDate);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to post inventory check.");
      setMessage("");
    } finally {
      setPosting(false);
    }
  };

  // ---------- UI styles (reuse Purchases feel) ----------

  if (loading) {
    return (
      <div style={{ padding: "32px" }}>
        <p>Loading inventory check page…</p>
      </div>
    );
  }

  const labelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: 700,
    color: "#111827",
    marginBottom: "6px",
  };

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
      {/* Header – same layout as Purchases */}
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
                History &amp; differences
              </button>
            </div>
          </div>

          {/* small summary card */}
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
            <div
              style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}
            >
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
              Date: {toISODate(inventoryDate) || inventoryDate}
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
                Total pieces diff
              </div>
              <div
                style={{ fontSize: "18px", fontWeight: 800, color: "#111827" }}
              >
                {formatQty(systemTotalDiffPieces)}
              </div>
            </div>
          </div>
        </div>

        {/* date only (no notes at top) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "160px",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <input
            type="date"
            value={toISODate(inventoryDate)}
            onChange={(e) => setInventoryDate(e.target.value)}
            style={{
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

      {/* TAB 1 – Enter counts (only one fully wired for now) */}
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
            Enter inventory counts for {toISODate(inventoryDate) || inventoryDate}
          </h2>

          {/* PAD */}
          <div
            ref={padRef}
            style={{
              marginTop: 12,
              marginBottom: "12px",
              padding: "14px 14px 16px",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              color: "#111827",
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
                Pad: select item, enter counted pieces, then add to list
              </span>

              <button
                type="button"
                onClick={handleAddToList}
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
                + Add to list
              </button>
            </div>

            <div>
              <label style={labelStyle}>Item</label>
              <ItemComboBox
                items={pickerItems}
                valueId={pad.itemId === "" ? "" : String(pad.itemId)}
                onChangeId={(idStr) => updatePad("itemId", idStr)}
                disabled={false}
              />
            </div>

            <div
              style={{
                marginTop: "12px",
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
                gap: "12px",
                alignItems: "end",
              }}
            >
              {/* system pieces first, then counted, then diff */}
              <div>
                <label style={labelStyle}>System pieces</label>
                <input
                  type="text"
                  readOnly
                  value={
                    pad.itemId
                      ? formatQty(
                          stockByItemId[pad.itemId]?.pieces_in_stock ??
                            stockByItemId[pad.itemId]?.stock_pieces ??
                            stockByItemId[pad.itemId]?.total_pieces ??
                            0
                        )
                      : ""
                  }
                  placeholder="—"
                  style={{ ...inputBase, backgroundColor: "#f3f4f6" }}
                />
              </div>

              <div>
                <label style={labelStyle}>Counted pieces</label>
                <input
                  type="number"
                  step="0.01"
                  value={pad.countedPieces}
                  onChange={(e) => updatePad("countedPieces", e.target.value)}
                  placeholder="e.g. 120"
                  style={inputBase}
                />
              </div>

              <div>
                <label style={labelStyle}>Difference</label>
                <input
                  type="text"
                  readOnly
                  value={
                    pad.itemId && pad.countedPieces !== ""
                      ? formatQty(
                          Number(pad.countedPieces || 0) -
                            Number(
                              stockByItemId[pad.itemId]?.pieces_in_stock ??
                                stockByItemId[pad.itemId]?.stock_pieces ??
                                stockByItemId[pad.itemId]?.total_pieces ??
                                0
                            )
                        )
                      : ""
                  }
                  placeholder="—"
                  style={{ ...inputBase, backgroundColor: "#f3f4f6" }}
                />
              </div>
            </div>
          </div>

          {/* LIST */}
          {lines.length === 0 ? (
            <div
              style={{
                padding: "14px 4px 6px",
                fontSize: "13px",
                color: "#6b7280",
              }}
            >
              No items in this inventory check yet. Use the pad above and click{" "}
              <strong>+ Add to list</strong>.
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  marginBottom: "6px",
                  marginTop: "2px",
                }}
              >
                Items: {lines.length}
              </div>

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
                    backgroundColor: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(220px, 2.3fr) 120px 120px 120px 60px",
                      minWidth: "700px",
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
                    <div style={{ textAlign: "center" }}>System pieces</div>
                    <div style={{ textAlign: "center" }}>Counted pieces</div>
                    <div style={{ textAlign: "center" }}>Difference</div>
                    <div></div>
                  </div>

                  {lines.map((line) => {
                    const itemName =
                      stockByItemId[line.itemId]?.item_name ||
                      pickerItems.find((it) => it.id === line.itemId)?.label ||
                      `Item ${line.itemId}`;

                    return (
                      <div
                        key={line.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "minmax(220px, 2.3fr) 120px 120px 120px 60px",
                          minWidth: "700px",
                          alignItems: "center",
                          padding: "10px 10px",
                          borderBottom: "1px solid #f3f4f6",
                          fontSize: "13px",
                        }}
                      >
                        <div>{itemName}</div>
                        <div style={{ textAlign: "center" }}>
                          {formatQty(line.systemPieces)}
                        </div>
                        <div style={{ textAlign: "center" }}>
                          {formatQty(line.countedPieces)}
                        </div>
                        <div style={{ textAlign: "center" }}>
                          {formatQty(line.diffPieces)}
                        </div>
                        <div style={{ textAlign: "center" }}>
                          {!line.dbId ? (
                            <button
                              type="button"
                              onClick={() => removeLine(line.id)}
                              title="Remove line (not saved yet)"
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
                            >
                              ✕
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
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
              disabled={savingDraft}
              style={{
                padding: "0.6rem 1.6rem",
                borderRadius: "999px",
                border: "none",
                backgroundColor: savingDraft ? "#9ca3af" : "#2563eb",
                color: "white",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: savingDraft ? "not-allowed" : "pointer",
                opacity: savingDraft ? 0.85 : 1,
              }}
            >
              {savingDraft ? "Saving…" : "Save draft"}
            </button>

            <button
              type="button"
              onClick={handlePostInventory}
              disabled={posting || !headerId}
              style={{
                padding: "0.6rem 1.8rem",
                borderRadius: "999px",
                border: "none",
                backgroundColor:
                  posting || !headerId ? "#9ca3af" : "#111827",
                color: "white",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: posting || !headerId ? "not-allowed" : "pointer",
                opacity: posting || !headerId ? 0.85 : 1,
              }}
              title={
                headerId
                  ? ""
                  : "You need to save a draft before posting."
              }
            >
              {posting ? "Posting…" : "Post inventory check"}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2 – just a placeholder for now */}
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
            History &amp; differences
          </h2>
          <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "8px" }}>
            We will connect this tab to /inventory-checks summary once the
            backend part is fully stable. For now, focus on Enter counts and
            saving / posting the inventory check.
          </p>
        </div>
      )}
    </div>
  );
}

export default InventoryCheckPage;
