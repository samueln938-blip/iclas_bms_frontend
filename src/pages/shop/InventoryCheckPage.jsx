// FILE: src/pages/shop/InventoryCheckPage.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Same API base style as Purchases page
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";
const API_BASE = CLIENT_API_BASE;

const STATUS_DRAFT = "DRAFT";
const STATUS_POSTED = "POSTED";

// --------- Helpers ---------

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatPieces(value) {
  if (value === null || value === undefined) return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDiff(value) {
  const num = Number(value || 0);
  const formatted = formatPieces(num);
  if (num > 0) return `+${formatted}`;
  return formatted;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return String(iso);
  }
}

/**
 * ✅ Mobile-friendly searchable dropdown
 *    - Opens only when field is focused/typed
 *    - Width is exactly the pad width (does not extend outside)
 */
function ItemComboBox({ items, valueId, onChangeId }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(() => {
    if (!valueId) return null;
    return (
      items.find((it) => String(it.id) === String(valueId)) || null
    );
  }, [items, valueId]);

  useEffect(() => {
    if (!open) setQ(selected ? selected.label : "");
  }, [selected, open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 800);
    return items
      .filter((it) =>
        String(it.label || "")
          .toLowerCase()
          .includes(s)
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
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtered.length > 0) {
                onChangeId(String(filtered[0].id));
                setOpen(false);
              }
            }
          }}
          placeholder="Type item name to search…"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: "100%",
            padding: "10px 36px 10px 12px",
            borderRadius: "12px",
            border: "1px solid #d1d5db",
            fontSize: "13px",
            outline: "none",
            backgroundColor: "#ffffff",
            color: "#111827",
          }}
        />

        {(q || selected) && (
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
        )}
      </div>

      {open && (
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

// --------- Main component ---------

function InventoryCheckPage() {
  const { shopId: shopIdParam } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  // ✅ Same auth headers pattern as Purchases
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

  // Roles
  const role = String(user?.role || "").toLowerCase();
  const isOwner = role === "owner" || role === "admin";
  const isManager = role === "manager";
  const canUseInventoryCheck = isOwner || isManager;

  const initialShopId = useMemo(() => {
    if (shopIdParam) return Number(shopIdParam);
    if (user?.shop_id) return Number(user.shop_id);
    return null;
  }, [shopIdParam, user]);
  const [shopId] = useState(initialShopId);

  // Core state
  const [shop, setShop] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Inventory check header
  const [currentCheckId, setCurrentCheckId] = useState(null);
  const [checkDate, setCheckDate] = useState(() => todayISO());

  // PAD (single item editor)
  const [pad, setPad] = useState({
    itemId: "",
    countedPieces: "",
  });
  const [editingLineId, setEditingLineId] = useState(null);
  const [padSaving, setPadSaving] = useState(false);
  const padRef = useRef(null);

  // Lines in current draft (local view)
  const [lines, setLines] = useState([]); // {id,itemId,itemName,systemPieces,countedPieces,diffPieces}

  // History tab
  const [activeTab, setActiveTab] = useState("enter"); // "enter" | "history"
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [selectedHistoryCheck, setSelectedHistoryCheck] =
    useState(null);
  const [selectedHistoryLoading, setSelectedHistoryLoading] =
    useState(false);

  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);

  // --------- Derived helpers ---------

  const shopName = shop?.name || (shopId ? `Shop ${shopId}` : "");

  const stockByItemId = useMemo(() => {
    const map = {};
    for (const row of stockRows) {
      if (row.item_id == null) continue;
      map[row.item_id] = row;
    }
    return map;
  }, [stockRows]);

  const pickerItems = useMemo(() => {
    // ✅ Use real item_name from /stock/?shop_id endpoint
    const arr = (stockRows || []).map((row) => ({
      id: row.item_id,
      label:
        row.item_name ||
        row.item?.name ||
        `Item #${row.item_id}`,
    }));
    return arr.sort((a, b) =>
      String(a.label).localeCompare(String(b.label))
    );
  }, [stockRows]);

  const padStock =
    pad.itemId && stockByItemId[Number(pad.itemId)]
      ? stockByItemId[Number(pad.itemId)]
      : null;
  const padSystemPieces = padStock
    ? Number(padStock.remaining_pieces || 0)
    : 0;
  const padCountedPieces =
    pad.countedPieces === "" ? null : Number(pad.countedPieces);
  const padDiff =
    padCountedPieces === null || !Number.isFinite(padCountedPieces)
      ? 0
      : padCountedPieces - padSystemPieces;

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

  const padDark = false;
  const padBg = padDark ? "#0b1220" : "#ffffff";
  const padText = padDark ? "#e5e7eb" : "#111827";
  const padMuted = padDark ? "#9ca3af" : "#6b7280";
  const padBorder = padDark
    ? "1px solid rgba(255,255,255,0.10)"
    : "1px solid #e5e7eb";

  const labelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: 700,
    color: padText,
    marginBottom: "6px",
  };

  const helperGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    columnGap: "14px",
    rowGap: "6px",
    marginTop: "8px",
    fontSize: "12px",
    color: padMuted,
    alignItems: "center",
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

  const padTitle = editingLineId
    ? "Edit counted item, then update list"
    : "Pad: select item, enter counted pieces, then add to list";

  const padButtonText = editingLineId ? "Update item" : "+ Add to list";

  // --------- Load shop + stock (using same fetch style as Purchases) ---------

  useEffect(() => {
    if (!canUseInventoryCheck) return;
    if (!shopId) return;

    const load = async () => {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const shopRes = await fetch(
          `${API_BASE}/shops/${shopId}`,
          {
            headers: authHeadersNoJson,
          }
        );
        if (!shopRes.ok) {
          throw new Error("Failed to load shop.");
        }
        const shopData = await shopRes.json();

        const stockRes = await fetch(
          `${API_BASE}/stock/?shop_id=${shopId}`,
          {
            headers: authHeadersNoJson,
          }
        );
        if (!stockRes.ok) {
          throw new Error("Failed to load stock.");
        }
        const stockData = await stockRes.json();

        setShop(shopData);
        setStockRows(Array.isArray(stockData) ? stockData : []);
      } catch (err) {
        console.error(
          "Error loading shop/stock for inventory check:",
          err
        );
        setError(
          err?.message ||
            "Failed to load shop and stock for inventory check."
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [shopId, canUseInventoryCheck, authHeadersNoJson]);

  // --------- History (also using fetch) ---------

  const loadHistory = async () => {
    if (!canUseInventoryCheck) return;
    if (!shopId) return;

    setHistoryLoading(true);
    setError("");
    setMessage("");
    try {
      const url = `${API_BASE}/inventory-checks/summary?shop_id=${shopId}&skip=0&limit=100`;
      const res = await fetch(url, {
        headers: authHeadersNoJson,
      });
      if (!res.ok) {
        throw new Error("Failed to load inventory checks history.");
      }
      const data = await res.json();
      setHistoryRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading inventory checks history:", err);
      setError(
        err?.message || "Failed to load inventory checks history."
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, shopId, canUseInventoryCheck]);

  const handleHistoryRowClick = async (row) => {
    setSelectedHistoryCheck(null);
    setSelectedHistoryLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(
        `${API_BASE}/inventory-checks/${row.id}`,
        {
          headers: authHeadersNoJson,
        }
      );
      if (!res.ok) {
        throw new Error("Failed to load inventory check details.");
      }
      const data = await res.json();
      setSelectedHistoryCheck(data || null);
    } catch (err) {
      console.error("Error loading inventory check details:", err);
      setError(
        err?.message ||
          "Failed to load inventory check details."
      );
    } finally {
      setSelectedHistoryLoading(false);
    }
  };

  // --------- Pad + lines actions ---------

  const scrollPadIntoView = () => {
    if (!padRef.current) return;
    padRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const updatePad = (field, rawValue) => {
    setPad((prev) => {
      if (field === "itemId") {
        return {
          ...prev,
          itemId: rawValue,
        };
      }

      if (field === "countedPieces") {
        return {
          ...prev,
          countedPieces: rawValue,
        };
      }

      return { ...prev, [field]: rawValue };
    });
  };

  const resetPad = () => {
    setPad({
      itemId: "",
      countedPieces: "",
    });
    setEditingLineId(null);
  };

  const handlePadSubmit = () => {
    const itemIdNum = Number(pad.itemId || 0);
    if (!itemIdNum) {
      setError("Select an item before adding to list.");
      return;
    }

    const countedVal = Number(pad.countedPieces || 0);
    if (!Number.isFinite(countedVal) || countedVal < 0) {
      setError("Counted pieces must be zero or more (e.g. 0, 1, 2, 0.5).");
      return;
    }

    setError("");
    setMessage("");

    const stock = stockByItemId[itemIdNum];
    const sysPieces = stock ? Number(stock.remaining_pieces || 0) : 0;
    const itemName =
      stock?.item_name || stock?.item?.name || `Item #${itemIdNum}`;

    const diff = countedVal - sysPieces;

    if (!editingLineId) {
      // Add new
      setLines((prev) => [
        ...prev,
        {
          id: Date.now().toString() + Math.random().toString(16),
          itemId: itemIdNum,
          itemName,
          systemPieces: sysPieces,
          countedPieces: countedVal,
          diffPieces: diff,
        },
      ]);
    } else {
      // Update existing
      setLines((prev) =>
        prev.map((l) =>
          l.id === editingLineId
            ? {
                ...l,
                itemId: itemIdNum,
                itemName,
                systemPieces: sysPieces,
                countedPieces: countedVal,
                diffPieces: diff,
              }
            : l
        )
      );
    }

    resetPad();
    scrollPadIntoView();
  };

  const handleEditLine = (lineId) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    setEditingLineId(lineId);
    setPad({
      itemId: String(line.itemId),
      countedPieces: String(line.countedPieces),
    });
    scrollPadIntoView();
  };

  const handleRemoveLine = (lineId) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
    if (editingLineId === lineId) {
      resetPad();
    }
  };

  const hasAnyLine = lines.length > 0;

  // --------- Save draft (fetch POST) ---------

  const handleSaveDraft = async () => {
    if (!shopId) {
      setError("No shop selected.");
      return;
    }
    if (!hasAnyLine) {
      setError(
        "Add at least one counted item to the list before saving."
      );
      return;
    }

    setSavingDraft(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        id: currentCheckId, // null = create; number = update
        shop_id: shopId,
        check_date: checkDate,
        notes: null, // no notes in UI
        lines: lines.map((l) => ({
          item_id: l.itemId,
          counted_pieces: l.countedPieces,
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
        let errText = "Failed to save inventory check draft.";
        try {
          const errData = await res.json();
          if (errData?.detail) errText = errData.detail;
        } catch {
          /* ignore */
        }
        throw new Error(errText);
      }
      const data = await res.json();

      setCurrentCheckId(data.id);
      setCheckDate(formatDate(data.check_date));

      // Rebuild lines from backend response (ensures diffs match server)
      const rebuilt =
        (data.lines || []).map((line) => ({
          id: String(line.id),
          itemId: line.item_id,
          itemName: line.item_name,
          systemPieces: Number(line.system_pieces || 0),
          countedPieces: Number(line.counted_pieces || 0),
          diffPieces: Number(line.diff_pieces || 0),
        })) || [];

      setLines(rebuilt);

      setMessage(
        data.status === STATUS_POSTED
          ? "Inventory check has already been posted."
          : "Inventory check draft saved."
      );
    } catch (err) {
      console.error("Error saving inventory check draft:", err);
      setError(
        err?.message || "Failed to save inventory check draft."
      );
    } finally {
      setSavingDraft(false);
    }
  };

  // --------- Post (apply) ---------

  const handlePostCheck = async () => {
    if (!currentCheckId) {
      setError("Save a draft first before posting.");
      return;
    }
    if (!hasAnyLine) {
      setError(
        "Cannot post an empty inventory check. Add at least one counted item and save draft first."
      );
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to POST this inventory check?\n\n" +
        "This will adjust system stock to match your counted quantities."
    );
    if (!confirmed) return;

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
        let errText = "Failed to post inventory check.";
        try {
          const errData = await res.json();
          if (errData?.detail) errText = errData.detail;
        } catch {
          /* ignore */
        }
        throw new Error(errText);
      }
      const data = await res.json().catch(() => null);

      setMessage("Inventory check posted and stock updated.");
      setCurrentCheckId(data?.id || currentCheckId);

      // After posting, reload history + stock (both via fetch)
      await Promise.all([
        (async () => {
          try {
            await loadHistory();
          } catch {
            /* ignore */
          }
        })(),
        (async () => {
          try {
            const stockRes = await fetch(
              `${API_BASE}/stock/?shop_id=${shopId}`,
              { headers: authHeadersNoJson }
            );
            if (!stockRes.ok) return;
            const rows = await stockRes.json();
            setStockRows(Array.isArray(rows) ? rows : []);
          } catch (e) {
            console.error(
              "Post succeeded but reload stock failed:",
              e
            );
          }
        })(),
      ]);
    } catch (err) {
      console.error("Error posting inventory check:", err);
      setError(
        err?.message || "Failed to post inventory check."
      );
    } finally {
      setPosting(false);
    }
  };

  // --------- Guards ---------

  if (!canUseInventoryCheck) {
    return (
      <div style={{ padding: "2rem 3rem" }}>
        <h1
          style={{
            fontSize: "2rem",
            fontWeight: 800,
            marginBottom: "0.5rem",
            color: "#111827",
          }}
        >
          Inventory check
        </h1>
        <p style={{ color: "#b91c1c" }}>
          Only OWNER and MANAGER can perform inventory checks.
        </p>
      </div>
    );
  }

  if (!shopId) {
    return (
      <div style={{ padding: "2rem 3rem" }}>
        <h1
          style={{
            fontSize: "2rem",
            fontWeight: 800,
            marginBottom: "0.5rem",
            color: "#111827",
          }}
        >
          Inventory check
        </h1>
        <p style={{ color: "#b91c1c" }}>
          No shop selected. Open this page from a shop workspace (e.g.
          /shops/1/inventory-checks).
        </p>
      </div>
    );
  }

  if (loading && !shop) {
    return (
      <div style={{ padding: "32px" }}>
        <p>Loading inventory check page...</p>
      </div>
    );
  }

  // --------- Render ---------

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
                onClick={() => {
                  setActiveTab("enter");
                  setError("");
                  setMessage("");
                }}
              >
                Enter counts
              </button>

              <button
                type="button"
                style={tabBtn(activeTab === "history")}
                onClick={() => {
                  setActiveTab("history");
                  setError("");
                  setMessage("");
                }}
              >
                History & differences
              </button>
            </div>
          </div>
        </div>

        {/* Date line – no extra notes at top */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#6b7280",
            }}
          >
            Inventory check date
          </div>
          <input
            type="date"
            value={checkDate}
            onChange={(e) => setCheckDate(e.target.value)}
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

      {(message || error) && (
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

      {/* ================= TAB: ENTER COUNTS ================= */}
      {activeTab === "enter" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: "16px 18px 14px",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              margin: 0,
            }}
          >
            Enter inventory counts for {checkDate}
          </h2>

          {/* PAD */}
          <div
            ref={padRef}
            style={{
              marginTop: 12,
              marginBottom: "12px",
              padding: "14px 14px 16px",
              borderRadius: "18px",
              background: padBg,
              border: padBorder,
              color: padText,
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
              <span>{padTitle}</span>

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                {editingLineId && (
                  <button
                    type="button"
                    onClick={resetPad}
                    disabled={padSaving}
                    style={{
                      padding: "0.4rem 1rem",
                      borderRadius: "9999px",
                      border: "1px solid #d1d5db",
                      backgroundColor: "#ffffff",
                      color: "#111827",
                      fontSize: "0.8rem",
                      cursor: padSaving ? "not-allowed" : "pointer",
                      opacity: padSaving ? 0.7 : 1,
                    }}
                  >
                    Cancel edit
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePadSubmit}
                  disabled={padSaving}
                  style={{
                    padding: "0.55rem 1.3rem",
                    borderRadius: "9999px",
                    border: "none",
                    backgroundColor: "#2563eb",
                    color: "white",
                    fontWeight: 800,
                    fontSize: "0.9rem",
                    cursor: padSaving ? "not-allowed" : "pointer",
                    opacity: padSaving ? 0.8 : 1,
                  }}
                >
                  {padSaving ? "Updating..." : padButtonText}
                </button>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Item</label>
              <ItemComboBox
                items={pickerItems}
                valueId={pad.itemId === "" ? "" : String(pad.itemId)}
                onChangeId={(idStr) => updatePad("itemId", idStr)}
              />

              <div style={helperGridStyle}>
                <div>
                  System pieces:{" "}
                  <strong style={{ color: padText }}>
                    {pad.itemId ? formatPieces(padSystemPieces) : "—"}
                  </strong>
                </div>
                <div>
                  Counted pieces:{" "}
                  <strong style={{ color: padText }}>
                    {pad.itemId &&
                    padCountedPieces !== null &&
                    Number.isFinite(padCountedPieces)
                      ? formatPieces(padCountedPieces)
                      : "—"}
                  </strong>
                </div>
                <div>
                  Difference:{" "}
                  <strong
                    style={{
                      color:
                        padDiff === 0
                          ? "#6b7280"
                          : padDiff > 0
                          ? "#16a34a"
                          : "#b91c1c",
                    }}
                  >
                    {pad.itemId ? formatDiff(padDiff) : "—"}
                  </strong>
                </div>
              </div>
            </div>

            {/* ✅ Reordered: System pieces first, then Counted pieces */}
            <div
              style={{
                marginTop: "12px",
                display: "grid",
                gridTemplateColumns: "180px minmax(0, 1fr) 180px",
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
                    pad.itemId ? formatPieces(padSystemPieces) : ""
                  }
                  placeholder="—"
                  style={{
                    ...inputBase,
                    backgroundColor: "#f3f4f6",
                    fontWeight: 700,
                  }}
                />
              </div>

              <div>
                <label style={labelStyle}>Counted pieces</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pad.countedPieces}
                  onChange={(e) =>
                    updatePad("countedPieces", e.target.value)
                  }
                  style={inputBase}
                />
              </div>

              <div>
                <label style={labelStyle}>Difference</label>
                <input
                  type="text"
                  readOnly
                  value={pad.itemId ? formatDiff(padDiff) : ""}
                  placeholder="—"
                  style={{
                    ...inputBase,
                    backgroundColor: "#f3f4f6",
                    fontWeight: 700,
                    color:
                      padDiff === 0
                        ? "#6b7280"
                        : padDiff > 0
                        ? "#16a34a"
                        : "#b91c1c",
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
              No items counted yet. Use the pad above and click{" "}
              <strong>{padButtonText}</strong>.
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
                Items counted: {lines.length}
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
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "13px",
                      minWidth: "720px",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid #e5e7eb",
                          backgroundColor: "#f9fafb",
                          color: "#6b7280",
                        }}
                      >
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "left",
                            fontWeight: 700,
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          Item
                        </th>
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "right",
                            fontWeight: 700,
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          System pieces
                        </th>
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "right",
                            fontWeight: 700,
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          Counted pieces
                        </th>
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "right",
                            fontWeight: 700,
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          Difference
                        </th>
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "center",
                          }}
                        >
                          {/* actions */}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr
                          key={line.id}
                          style={{
                            borderBottom: "1px solid #f3f4f6",
                          }}
                        >
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleEditLine(line.id)
                              }
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
                              title="Edit this line"
                            >
                              {line.itemName}
                            </button>
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              textAlign: "right",
                            }}
                          >
                            {formatPieces(line.systemPieces)}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              textAlign: "right",
                            }}
                          >
                            {formatPieces(line.countedPieces)}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              textAlign: "right",
                              fontWeight: 600,
                              color:
                                Number(line.diffPieces || 0) === 0
                                  ? "#6b7280"
                                  : Number(line.diffPieces || 0) > 0
                                  ? "#16a34a"
                                  : "#b91c1c",
                            }}
                          >
                            {formatDiff(line.diffPieces)}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              textAlign: "center",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveLine(line.id)
                              }
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
                              title="Remove line from list"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
              disabled={savingDraft || loading}
              style={{
                padding: "0.6rem 1.4rem",
                borderRadius: "999px",
                border: "none",
                backgroundColor: savingDraft ? "#4b6bfb99" : "#4b6bfb",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor:
                  savingDraft || loading ? "not-allowed" : "pointer",
                opacity: savingDraft || loading ? 0.85 : 1,
              }}
            >
              {savingDraft ? "Saving draft..." : "Save draft"}
            </button>

            <button
              type="button"
              onClick={handlePostCheck}
              disabled={posting || !currentCheckId || !hasAnyLine}
              title={
                !currentCheckId
                  ? "Save draft first before posting."
                  : !hasAnyLine
                  ? "Cannot post an empty inventory check."
                  : ""
              }
              style={{
                padding: "0.6rem 1.8rem",
                borderRadius: "999px",
                border: "none",
                backgroundColor:
                  posting || !currentCheckId || !hasAnyLine
                    ? "#9ca3af"
                    : "#16a34a",
                color: "white",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor:
                  posting || !currentCheckId || !hasAnyLine
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  posting || !currentCheckId || !hasAnyLine ? 0.85 : 1,
              }}
            >
              {posting ? "Posting..." : "Post inventory check"}
            </button>
          </div>
        </div>
      )}

      {/* ============== TAB: HISTORY & DIFFERENCES ============== */}
      {activeTab === "history" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
            gap: "1.1rem",
            alignItems: "flex-start",
          }}
        >
          {/* Left: list */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "1.1rem",
              padding: "1.3rem 1.4rem",
              boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
            }}
          >
            <h2
              style={{
                fontSize: "1.2rem",
                fontWeight: 700,
                marginBottom: "0.8rem",
              }}
            >
              Inventory check history
            </h2>

            {historyLoading ? (
              <p style={{ color: "#6b7280" }}>Loading history...</p>
            ) : historyRows.length === 0 ? (
              <p style={{ color: "#6b7280" }}>
                No inventory checks recorded yet for this shop.
              </p>
            ) : (
              <div
                style={{
                  maxHeight: "65vh",
                  overflow: "auto",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.9rem",
                    minWidth: "520px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid #e5e7eb",
                        backgroundColor: "#f9fafb",
                        color: "#6b7280",
                      }}
                    >
                      <th
                        style={{
                          padding: "0.5rem 0.6rem",
                          textAlign: "left",
                        }}
                      >
                        Date
                      </th>
                      <th
                        style={{
                          padding: "0.5rem 0.6rem",
                          textAlign: "left",
                        }}
                      >
                        Status
                      </th>
                      <th
                        style={{
                          padding: "0.5rem 0.6rem",
                          textAlign: "right",
                        }}
                      >
                        Items
                      </th>
                      <th
                        style={{
                          padding: "0.5rem 0.6rem",
                          textAlign: "right",
                        }}
                      >
                        System pieces
                      </th>
                      <th
                        style={{
                          padding: "0.5rem 0.6rem",
                          textAlign: "right",
                        }}
                      >
                        Counted pieces
                      </th>
                      <th
                        style={{
                          padding: "0.5rem 0.6rem",
                          textAlign: "right",
                        }}
                      >
                        Diff (pieces)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => handleHistoryRowClick(row)}
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          cursor: "pointer",
                        }}
                      >
                        <td
                          style={{
                            padding: "0.5rem 0.6rem",
                            fontWeight: 500,
                          }}
                        >
                          {formatDate(row.check_date)}
                        </td>
                        <td
                          style={{
                            padding: "0.5rem 0.6rem",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.12rem 0.55rem",
                              borderRadius: "999px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor:
                                row.status === STATUS_POSTED
                                  ? "#dcfce7"
                                  : "#e0f2fe",
                              color:
                                row.status === STATUS_POSTED
                                  ? "#166534"
                                  : "#0369a1",
                            }}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "0.5rem 0.6rem",
                            textAlign: "right",
                          }}
                        >
                          {row.total_items}
                        </td>
                        <td
                          style={{
                            padding: "0.5rem 0.6rem",
                            textAlign: "right",
                          }}
                        >
                          {formatPieces(row.total_system_pieces)}
                        </td>
                        <td
                          style={{
                            padding: "0.5rem 0.6rem",
                            textAlign: "right",
                          }}
                        >
                          {formatPieces(row.total_counted_pieces)}
                        </td>
                        <td
                          style={{
                            padding: "0.5rem 0.6rem",
                            textAlign: "right",
                            fontWeight: 600,
                            color:
                              Number(row.total_diff_pieces || 0) === 0
                                ? "#6b7280"
                                : Number(row.total_diff_pieces || 0) > 0
                                ? "#16a34a"
                                : "#b91c1c",
                          }}
                        >
                          {formatDiff(row.total_diff_pieces)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right: details */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "1.1rem",
              padding: "1.3rem 1.4rem",
              boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
            }}
          >
            <h2
              style={{
                fontSize: "1.2rem",
                fontWeight: 700,
                marginBottom: "0.6rem",
              }}
            >
              Inventory check details
            </h2>

            {selectedHistoryLoading ? (
              <p style={{ color: "#6b7280" }}>Loading details...</p>
            ) : !selectedHistoryCheck ? (
              <p style={{ color: "#6b7280" }}>
                Click a row on the left to see full details.
              </p>
            ) : (
              <>
                <div
                  style={{
                    marginBottom: "0.9rem",
                    fontSize: "0.9rem",
                    color: "#4b5563",
                  }}
                >
                  <div>
                    <b>Date:</b>{" "}
                    {formatDate(selectedHistoryCheck.check_date)}
                  </div>
                  <div>
                    <b>Status:</b> {selectedHistoryCheck.status}
                  </div>
                  {selectedHistoryCheck.performed_by_username && (
                    <div>
                      <b>Performed by:</b>{" "}
                      {selectedHistoryCheck.performed_by_username}
                    </div>
                  )}
                  {selectedHistoryCheck.notes && (
                    <div>
                      <b>Notes:</b> {selectedHistoryCheck.notes}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    maxHeight: "55vh",
                    overflow: "auto",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.86rem",
                      minWidth: "520px",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid #e5e7eb",
                          backgroundColor: "#f9fafb",
                          color: "#6b7280",
                        }}
                      >
                        <th
                          style={{
                            padding: "0.45rem 0.55rem",
                            textAlign: "left",
                          }}
                        >
                          Item
                        </th>
                        <th
                          style={{
                            padding: "0.45rem 0.55rem",
                            textAlign: "right",
                          }}
                        >
                          System pieces
                        </th>
                        <th
                          style={{
                            padding: "0.45rem 0.55rem",
                            textAlign: "right",
                          }}
                        >
                          Counted pieces
                        </th>
                        <th
                          style={{
                            padding: "0.45rem 0.55rem",
                            textAlign: "right",
                          }}
                        >
                          Diff
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedHistoryCheck.lines.map((line) => (
                        <tr
                          key={line.id}
                          style={{
                            borderBottom: "1px solid #f3f4f6",
                          }}
                        >
                          <td
                            style={{
                              padding: "0.45rem 0.55rem",
                              fontWeight: 500,
                              color: "#111827",
                            }}
                          >
                            {line.item_name}
                          </td>
                          <td
                            style={{
                              padding: "0.45rem 0.55rem",
                              textAlign: "right",
                            }}
                          >
                            {formatPieces(line.system_pieces)}
                          </td>
                          <td
                            style={{
                              padding: "0.45rem 0.55rem",
                              textAlign: "right",
                            }}
                          >
                            {formatPieces(line.counted_pieces)}
                          </td>
                          <td
                            style={{
                              padding: "0.45rem 0.55rem",
                              textAlign: "right",
                              fontWeight: 600,
                              color:
                                Number(line.diff_pieces || 0) === 0
                                  ? "#6b7280"
                                  : Number(line.diff_pieces || 0) > 0
                                  ? "#16a34a"
                                  : "#b91c1c",
                            }}
                          >
                            {formatDiff(line.diff_pieces)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default InventoryCheckPage;
