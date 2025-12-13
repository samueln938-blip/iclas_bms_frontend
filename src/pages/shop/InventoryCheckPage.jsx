// FILE: src/pages/shop/InventoryCheckPage.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Single source of truth for API base (VITE_API_BASE / prod)
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";

const API_BASE = CLIENT_API_BASE;

// ---------- Small helpers ----------

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
  if (value === null || value === undefined || value === "") return "0";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-RW", { maximumFractionDigits: 2 });
}

function formatDiff(value) {
  if (value === null || value === undefined || value === "") return "0";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const s = n.toLocaleString("en-RW", { maximumFractionDigits: 2 });
  if (n > 0) return `+${s}`;
  return s;
}

// ---------- Searchable dropdown (same behaviour as Purchases pad) ----------

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
      .filter((it) =>
        String(it.label || "").toLowerCase().includes(s)
      )
      .slice(0, 800);
  }, [items, q]);

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
            if (!disabled) setOpen(true);
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
                <div style={{ fontWeight: 600 }}>{it.label}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Main page ----------

export default function InventoryCheckPage() {
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

  const [activeTab, setActiveTab] = useState("enter"); // "enter" | "history"

  const [shop, setShop] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [inventoryDate, setInventoryDate] = useState(() => todayISO());

  // current draft / posted check loaded for selected date
  const [currentCheckId, setCurrentCheckId] = useState(null);

  // pad state
  const [pad, setPad] = useState({
    itemId: "",
    countedPieces: "",
  });

  // lines for current date (mirror of backend draft / posted)
  const [lines, setLines] = useState([]); // {id?, itemId, itemName, systemPieces, countedPieces, diffPieces}

  // history list for "History & differences"
  const [historyChecks, setHistoryChecks] = useState([]);

  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);

  const padRef = useRef(null);

  // ---------- Derived maps ----------

  const stockByItemId = useMemo(() => {
    const map = {};
    for (const s of stockRows || []) {
      map[s.item_id] = s;
    }
    return map;
  }, [stockRows]);

  const pickerItems = useMemo(() => {
    return (stockRows || [])
      .map((s) => ({
        id: s.item_id,
        label: s.item_name || `Item ${s.item_id}`,
      }))
      .sort((a, b) =>
        String(a.label).localeCompare(String(b.label))
      );
  }, [stockRows]);

  const padStock = pad.itemId
    ? stockByItemId[Number(pad.itemId)]
    : null;
  const padSystemPieces = padStock
    ? Number(padStock.remaining_pieces || 0)
    : 0;
  const padCountedPieces =
    pad.countedPieces === "" ? null : Number(pad.countedPieces || 0);
  const padDiff =
    padCountedPieces === null
      ? null
      : padCountedPieces - padSystemPieces;

  const totalDiffPieces = useMemo(
    () =>
      lines.reduce(
        (sum, ln) => sum + Number(ln.diffPieces || 0),
        0
      ),
    [lines]
  );

  // ---------- Data loading ----------

  useEffect(() => {
    async function loadShopAndStock() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const shopRes = await fetch(`${API_BASE}/shops/${shopId}`, {
          headers: authHeadersNoJson,
        });
        if (!shopRes.ok) {
          throw new Error(
            `Failed to load shop. Status: ${shopRes.status}`
          );
        }
        const shopData = await shopRes.json();

        const stockRes = await fetch(
          `${API_BASE}/stock/?shop_id=${shopId}`,
          { headers: authHeadersNoJson }
        );
        if (!stockRes.ok) {
          throw new Error(
            `Failed to load stock. Status: ${stockRes.status}`
          );
        }
        const stockData = await stockRes.json();

        setShop(shopData);
        setStockRows(Array.isArray(stockData) ? stockData : []);
      } catch (err) {
        console.error(err);
        setError(
          err?.message ||
            "Failed to load shop / stock for inventory check."
        );
      } finally {
        setLoading(false);
      }
    }

    loadShopAndStock();
  }, [shopId, authHeadersNoJson]);

  // load history list for the shop
  const loadHistory = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/inventory-checks/summary?shop_id=${shopId}`,
        { headers: authHeadersNoJson }
      );
      if (!res.ok) {
        throw new Error(
          `Failed to load inventory checks. Status: ${res.status}`
        );
      }
      const data = await res.json().catch(() => []);
      setHistoryChecks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(
        err?.message || "Failed to fetch inventory checks."
      );
    }
  };

  // load details for currently selected date (draft or posted)
  const loadCheckForDate = async (isoDate) => {
    setError("");
    setMessage("");

    try {
      // ensure we have up-to-date history list
      await loadHistory();

      const dateISO = toISODate(isoDate);
      const match =
        historyChecks.find(
          (c) => toISODate(c.check_date) === dateISO
        ) || null;

      if (!match) {
        // no check yet for this date
        setCurrentCheckId(null);
        setLines([]);
        return;
      }

      const detailRes = await fetch(
        `${API_BASE}/inventory-checks/${match.id}`,
        {
          headers: authHeadersNoJson,
        }
      );

      if (!detailRes.ok) {
        throw new Error(
          `Failed to load inventory check details. Status: ${detailRes.status}`
        );
      }

      const detail = await detailRes.json();

      setCurrentCheckId(detail.id || match.id);
      const mapped = (detail.lines || []).map((ln) => ({
        id: ln.id,
        itemId: ln.item_id,
        itemName: ln.item_name,
        systemPieces: Number(ln.system_pieces || 0),
        countedPieces: Number(ln.counted_pieces || 0),
        diffPieces: Number(ln.diff_pieces || 0),
      }));
      setLines(mapped);
    } catch (err) {
      console.error(err);
      setError(
        err?.message ||
          "Failed to fetch inventory check for selected date."
      );
    }
  };

  // when date changes, load any existing check
  useEffect(() => {
    if (!loading) {
      loadCheckForDate(inventoryDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryDate, loading]);

  // ---------- Pad + list logic ----------

  const resetPad = () =>
    setPad({
      itemId: "",
      countedPieces: "",
    });

  const handlePadChange = (field, value) => {
    if (field === "itemId") {
      setPad((prev) => ({
        ...prev,
        itemId: value === "" ? "" : Number(value),
      }));
      return;
    }
    if (field === "countedPieces") {
      setPad((prev) => ({
        ...prev,
        countedPieces: value,
      }));
      return;
    }
  };

  const handleAddToList = () => {
    const itemId = Number(pad.itemId || 0);
    if (!itemId) {
      setError("Select an item first.");
      return;
    }

    const s = stockByItemId[itemId];
    if (!s) {
      setError(
        "This item has no stock record in this shop. Add stock via Purchases first."
      );
      return;
    }

    const counted =
      pad.countedPieces === "" ? null : Number(pad.countedPieces);
    if (counted === null || !Number.isFinite(counted) || counted < 0) {
      setError("Enter counted pieces (0 or more).");
      return;
    }

    const system = Number(s.remaining_pieces || 0);
    const diff = counted - system;

    setError("");
    setMessage("");

    setLines((prev) => {
      const existingIndex = prev.findIndex(
        (ln) => Number(ln.itemId) === itemId
      );
      const base = {
        id: prev[existingIndex]?.id ?? `local-${Date.now()}-${Math.random()}`,
        itemId,
        itemName: s.item_name || `Item ${itemId}`,
        systemPieces: system,
        countedPieces: counted,
        diffPieces: diff,
      };

      if (existingIndex === -1) {
        return [...prev, base];
      }
      const copy = [...prev];
      copy[existingIndex] = base;
      return copy;
    });

    resetPad();
    if (padRef.current) {
      padRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const handleEditLine = (line) => {
    setPad({
      itemId: line.itemId,
      countedPieces: line.countedPieces,
    });
    if (padRef.current) {
      padRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const handleRemoveLine = (id) => {
    setLines((prev) => prev.filter((ln) => ln.id !== id));
  };

  // ---------- Save draft / post ----------

  const handleSaveDraft = async () => {
    if (!lines.length) {
      setError(
        "Add at least one item to the list before saving a draft."
      );
      return;
    }

    setSavingDraft(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        id: currentCheckId,
        shop_id: Number(shopId),
        check_date: toISODate(inventoryDate),
        notes: null,
        lines: lines.map((ln) => ({
          item_id: ln.itemId,
          counted_pieces: ln.countedPieces,
        })),
      };

      const res = await fetch(
        `${API_BASE}/inventory-checks/draft`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(
          errData?.detail ||
            `Failed to save inventory draft. Status: ${res.status}`
        );
      }

      const data = await res.json();

      setCurrentCheckId(data.id);
      const syncedLines = (data.lines || []).map((ln) => ({
        id: ln.id,
        itemId: ln.item_id,
        itemName: ln.item_name,
        systemPieces: Number(ln.system_pieces || 0),
        countedPieces: Number(ln.counted_pieces || 0),
        diffPieces: Number(ln.diff_pieces || 0),
      }));
      setLines(syncedLines);

      await loadHistory();

      setMessage(
        "Inventory draft saved. Stock is NOT changed yet."
      );
    } catch (err) {
      console.error(err);
      setError(
        err?.message || "Failed to save inventory draft."
      );
      setMessage("");
    } finally {
      setSavingDraft(false);
    }
  };

  const handlePostInventory = async () => {
    if (!currentCheckId) {
      setError(
        "Save a draft first, then you can post the inventory check."
      );
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
        const errData = await res.json().catch(() => null);
        throw new Error(
          errData?.detail ||
            `Failed to post inventory check. Status: ${res.status}`
        );
      }

      const data = await res.json();

      const syncedLines = (data.lines || []).map((ln) => ({
        id: ln.id,
        itemId: ln.item_id,
        itemName: ln.item_name,
        systemPieces: Number(ln.system_pieces || 0),
        countedPieces: Number(ln.counted_pieces || 0),
        diffPieces: Number(ln.diff_pieces || 0),
      }));
      setLines(syncedLines);

      await loadHistory();

      setMessage(
        "Inventory check posted. Stock levels have been updated."
      );
    } catch (err) {
      console.error(err);
      setError(
        err?.message || "Failed to post inventory check."
      );
      setMessage("");
    } finally {
      setPosting(false);
    }
  };

  // ---------- History tab helpers ----------

  const openHistoryCheck = async (check) => {
    const iso = toISODate(check.check_date);
    setInventoryDate(iso);
    setActiveTab("enter");
    await loadCheckForDate(iso);
  };

  // ---------- Rendering ----------

  if (loading) {
    return (
      <div style={{ padding: "32px" }}>
        <p>Loading inventory check page…</p>
      </div>
    );
  }

  const shopName = shop?.name || `Shop ${shopId}`;

  const tabBtn = (active) => ({
    padding: "8px 12px",
    borderRadius: "999px",
    border: active
      ? "1px solid #2563eb"
      : "1px solid #d1d5db",
    background: active ? "#eff6ff" : "#ffffff",
    color: active ? "#1d4ed8" : "#111827",
    fontWeight: 800,
    fontSize: "12px",
    cursor: "pointer",
  });

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

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "1500px",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
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
                style={tabBtn(activeTab === "enter")}
                onClick={() => setActiveTab("enter")}
              >
                Enter counts
              </button>
              <button
                type="button"
                style={tabBtn(activeTab === "history")}
                onClick={() => {
                  setActiveTab("history");
                  loadHistory();
                }}
              >
                History &amp; differences
              </button>
            </div>
          </div>

          {/* Summary card */}
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
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "#111827",
              }}
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
              Date: {toISODate(inventoryDate)}
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
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  color:
                    totalDiffPieces === 0
                      ? "#111827"
                      : totalDiffPieces > 0
                      ? "#16a34a"
                      : "#b91c1c",
                }}
              >
                {formatDiff(totalDiffPieces)}
              </div>
            </div>
          </div>
        </div>

        {/* date picker (no notes as requested) */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#111827",
            }}
          >
            Inventory check date
          </div>
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

      {/* ================= TAB: Enter counts ================= */}
      {activeTab === "enter" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: "16px 18px 18px",
          }}
        >
          <h2
            style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}
          >
            Enter inventory counts for {toISODate(inventoryDate)}
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
                Pad: select item, enter counted pieces, then add to
                list
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
                valueId={
                  pad.itemId === "" ? "" : String(pad.itemId)
                }
                onChangeId={(idStr) =>
                  handlePadChange("itemId", idStr)
                }
                disabled={false}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3, minmax(0, 1fr))",
                  columnGap: "14px",
                  rowGap: "6px",
                  marginTop: "10px",
                  fontSize: "12px",
                  color: "#6b7280",
                }}
              >
                <div>
                  System pieces:{" "}
                  <strong style={{ color: "#111827" }}>
                    {pad.itemId ? formatQty(padSystemPieces) : "—"}
                  </strong>
                </div>
                <div>
                  Counted pieces:{" "}
                  <strong style={{ color: "#111827" }}>
                    {padCountedPieces === null
                      ? "—"
                      : formatQty(padCountedPieces)}
                  </strong>
                </div>
                <div>
                  Difference:{" "}
                  <strong
                    style={{
                      color:
                        padDiff === null
                          ? "#111827"
                          : padDiff > 0
                          ? "#16a34a"
                          : padDiff < 0
                          ? "#b91c1c"
                          : "#111827",
                    }}
                  >
                    {padDiff === null
                      ? "—"
                      : formatDiff(padDiff)}
                  </strong>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: "12px",
                display: "grid",
                gridTemplateColumns:
                  "minmax(140px, 1.5fr) minmax(140px, 1fr) minmax(140px, 1fr)",
                gap: "12px",
                alignItems: "end",
              }}
            >
              <div>
                <label style={labelStyle}>System pieces</label>
                <input
                  type="text"
                  readOnly
                  value={
                    pad.itemId
                      ? formatQty(padSystemPieces)
                      : ""
                  }
                  style={{
                    ...inputBase,
                    backgroundColor: "#f3f4f6",
                    fontWeight: 600,
                  }}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Counted pieces (physical)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pad.countedPieces}
                  onChange={(e) =>
                    handlePadChange(
                      "countedPieces",
                      e.target.value
                    )
                  }
                  style={inputBase}
                />
              </div>

              <div>
                <label style={labelStyle}>Difference</label>
                <input
                  type="text"
                  readOnly
                  value={
                    padDiff === null ? "" : formatDiff(padDiff)
                  }
                  style={{
                    ...inputBase,
                    backgroundColor: "#f3f4f6",
                    fontWeight: 600,
                  }}
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
              No items added yet. Use the pad above and click{" "}
              <strong>+ Add to list</strong>.
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  marginBottom: "6px",
                }}
              >
                {lines.length} item
                {lines.length === 1 ? "" : "s"} in this inventory
                check.
              </div>

              <div
                style={{
                  borderRadius: "14px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  overflow: "hidden",
                  boxShadow:
                    "0 6px 18px rgba(15, 23, 42, 0.05)",
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
                        "minmax(220px, 2.5fr) 1fr 1fr 1fr 60px",
                      minWidth: "820px",
                      alignItems: "center",
                      padding: "8px 10px",
                      borderBottom: "1px solid #e5e7eb",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#6b7280",
                      fontWeight: 700,
                      backgroundColor: "#f9fafb",
                    }}
                  >
                    <div>Item</div>
                    <div style={{ textAlign: "right" }}>
                      System pieces
                    </div>
                    <div style={{ textAlign: "right" }}>
                      Counted pieces
                    </div>
                    <div style={{ textAlign: "right" }}>
                      Difference
                    </div>
                    <div></div>
                  </div>

                  {lines.map((ln) => (
                    <div
                      key={ln.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(220px, 2.5fr) 1fr 1fr 1fr 60px",
                        minWidth: "820px",
                        alignItems: "center",
                        padding: "9px 10px",
                        borderBottom:
                          "1px solid #f3f4f6",
                        fontSize: "13px",
                      }}
                    >
                      <div>
                        <button
                          type="button"
                          onClick={() => handleEditLine(ln)}
                          style={{
                            padding: 0,
                            margin: 0,
                            border: "none",
                            background: "transparent",
                            color: "#111827",
                            fontWeight: 600,
                            fontSize: "13px",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          title="Edit this item in the pad"
                        >
                          {ln.itemName || "Unknown item"}
                        </button>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {formatQty(ln.systemPieces)}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {formatQty(ln.countedPieces)}
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          color:
                            ln.diffPieces > 0
                              ? "#16a34a"
                              : ln.diffPieces < 0
                              ? "#b91c1c"
                              : "#111827",
                          fontWeight: 600,
                        }}
                      >
                        {formatDiff(ln.diffPieces)}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(ln.id)}
                          style={{
                            width: "26px",
                            height: "26px",
                            borderRadius: "9999px",
                            border:
                              "1px solid #fee2e2",
                            backgroundColor: "#fef2f2",
                            color: "#b91c1c",
                            fontSize: "14px",
                            cursor: "pointer",
                          }}
                          title="Remove from list"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
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
                padding: "0.6rem 1.4rem",
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                color: "#111827",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: savingDraft
                  ? "not-allowed"
                  : "pointer",
                opacity: savingDraft ? 0.8 : 1,
              }}
            >
              {savingDraft ? "Saving…" : "Save draft"}
            </button>

            <button
              type="button"
              onClick={handlePostInventory}
              disabled={posting}
              style={{
                padding: "0.6rem 1.8rem",
                borderRadius: "999px",
                border: "none",
                backgroundColor: posting
                  ? "#9ca3af"
                  : "#2563eb",
                color: "white",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: posting
                  ? "not-allowed"
                  : "pointer",
                opacity: posting ? 0.85 : 1,
              }}
            >
              {posting ? "Posting…" : "Post inventory check"}
            </button>
          </div>
        </div>
      )}

      {/* ================= TAB: History & differences ================= */}
      {activeTab === "history" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: "16px 18px 18px",
          }}
        >
          <h2
            style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}
          >
            Previous inventory checks
          </h2>
          <div
            style={{
              fontSize: "12px",
              color: "#6b7280",
              marginTop: 4,
            }}
          >
            Click a date to see its details and differences.
          </div>

          {historyChecks.length === 0 ? (
            <div
              style={{
                marginTop: 10,
                fontSize: "13px",
                color: "#6b7280",
              }}
            >
              No inventory checks recorded yet.
            </div>
          ) : (
            <div
              style={{
                marginTop: 12,
                borderRadius: "14px",
                border: "1px solid #e5e7eb",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  maxHeight: "420px",
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "160px 1fr 1fr 1fr 120px",
                    minWidth: "720px",
                    alignItems: "center",
                    padding: "8px 10px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#6b7280",
                    fontWeight: 700,
                    backgroundColor: "#f9fafb",
                  }}
                >
                  <div>Date</div>
                  <div style={{ textAlign: "right" }}>
                    Items
                  </div>
                  <div style={{ textAlign: "right" }}>
                    System pieces
                  </div>
                  <div style={{ textAlign: "right" }}>
                    Counted pieces
                  </div>
                  <div style={{ textAlign: "right" }}>
                    Diff (pieces)
                  </div>
                </div>

                {historyChecks.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "160px 1fr 1fr 1fr 120px",
                      minWidth: "720px",
                      alignItems: "center",
                      padding: "9px 10px",
                      borderBottom:
                        "1px solid #f3f4f6",
                      fontSize: "13px",
                    }}
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => openHistoryCheck(c)}
                        style={{
                          padding: 0,
                          margin: 0,
                          border: "none",
                          background: "transparent",
                          color: "#2563eb",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {toISODate(c.check_date)}
                      </button>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#6b7280",
                          marginTop: 2,
                        }}
                      >
                        {c.status === "POSTED"
                          ? "Posted"
                          : "Draft"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {c.total_items}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {formatQty(c.total_system_pieces)}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {formatQty(c.total_counted_pieces)}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        color:
                          Number(c.total_diff_pieces || 0) > 0
                            ? "#16a34a"
                            : Number(
                                c.total_diff_pieces || 0
                              ) < 0
                            ? "#b91c1c"
                            : "#111827",
                        fontWeight: 600,
                      }}
                    >
                      {formatDiff(c.total_diff_pieces)}
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
