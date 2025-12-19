// FILE: src/pages/shop/InventoryCheckPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ Single source of truth for API base (VITE_API_BASE / prod)
import { API_BASE as CLIENT_API_BASE } from "../../api/client.jsx";

const API_BASE = CLIENT_API_BASE;

// =========================
// Timezone helpers (CAT)
// Rwanda is CAT (UTC+2)
// =========================
const CAT_TZ = "Africa/Kigali";

function _fmtPartsYMD(date) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: CAT_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fallthrough
  }
  const dt = date instanceof Date ? date : new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatCAT_HM(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: CAT_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    const dt = date instanceof Date ? date : new Date();
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
}

function formatCAT_HM_FromISO(isoLike) {
  if (!isoLike) return "";
  const d = new Date(isoLike);
  if (!Number.isFinite(d.getTime())) return "";
  return formatCAT_HM(d);
}

function todayISO() {
  // ✅ CAT-safe today (no browser timezone drift)
  return _fmtPartsYMD(new Date());
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
  return _fmtPartsYMD(dt);
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

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "0";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ---------- Searchable dropdown ----------
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
            <div style={{ padding: "10px 12px", fontSize: "13px", color: "#6b7280" }}>
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

  // ✅ date-level loading (prevents “old day shows for seconds”)
  const [loadingCheck, setLoadingCheck] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [inventoryDate, setInventoryDate] = useState(() => todayISO());

  // current check loaded for selected date (could be DRAFT or POSTED)
  const [currentCheckId, setCurrentCheckId] = useState(null);
  const [currentCheckStatus, setCurrentCheckStatus] = useState(null); // "DRAFT" | "POSTED" | null

  // ✅ Daily posted totals (history that survives normalization)
  const [daySummary, setDaySummary] = useState(null);

  // pad state
  const [pad, setPad] = useState({
    itemId: "",
    countedPieces: "",
  });

  // lines for current run
  const [lines, setLines] = useState([]);

  // history list for "History & differences"
  const [historyChecks, setHistoryChecks] = useState([]);
  const historyLoadedAtRef = useRef(0);
  const historyAbortRef = useRef(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);

  const padRef = useRef(null);

  const isPosted = String(currentCheckStatus || "").toUpperCase() === "POSTED";

  // CAT “now” display
  const [catNowHM, setCatNowHM] = useState(() => formatCAT_HM(new Date()));
  useEffect(() => {
    const t = setInterval(() => setCatNowHM(formatCAT_HM(new Date())), 30_000);
    return () => clearInterval(t);
  }, []);

  // Abort + race protection
  const checkAbortRef = useRef(null);
  const checkSeqRef = useRef(0);

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
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [stockRows]);

  const getCostPerPiece = (itemId) => {
    const row = stockByItemId[Number(itemId)];
    if (!row) return 0;
    const raw =
      row.cost_per_piece ??
      row.cost_price_per_piece ??
      row.unit_cost ??
      row.average_cost_per_piece ??
      row.latest_cost_per_piece ??
      row.purchase_cost_per_piece;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const padStock = pad.itemId ? stockByItemId[Number(pad.itemId)] : null;
  const padSystemPieces = padStock ? Number(padStock.remaining_pieces || 0) : 0;

  const padCountedPieces = pad.countedPieces === "" ? null : Number(pad.countedPieces || 0);

  const padCountedIsValid =
    padCountedPieces !== null && Number.isFinite(padCountedPieces) && padCountedPieces >= 0;

  const padDiff = padCountedPieces === null ? null : padCountedPieces - padSystemPieces;

  const totalDiffPieces = useMemo(
    () => lines.reduce((sum, ln) => sum + Number(ln.diffPieces || 0), 0),
    [lines]
  );

  const totalSystemValueBefore = useMemo(
    () =>
      lines.reduce(
        (sum, ln) => sum + Number(ln.costPerPiece || 0) * Number(ln.systemPieces || 0),
        0
      ),
    [lines]
  );

  const totalSystemValueAfter = useMemo(
    () =>
      lines.reduce(
        (sum, ln) => sum + Number(ln.costPerPiece || 0) * Number(ln.countedPieces || 0),
        0
      ),
    [lines]
  );

  const totalSystemValueDiff = totalSystemValueAfter - totalSystemValueBefore;

  const postedTotalPieces = Number(daySummary?.total_adjustment_pieces || 0);
  const postedTotalValue = Number(daySummary?.total_adjustment_value || 0);
  const postedRuns = Number(daySummary?.posted_runs || 0);

  // ---------- Data loading ----------
  useEffect(() => {
    const controller = new AbortController();

    async function loadShopAndStock() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const shopRes = await fetch(`${API_BASE}/shops/${shopId}`, {
          headers: authHeadersNoJson,
          signal: controller.signal,
        });
        if (!shopRes.ok) throw new Error(`Failed to load shop. Status: ${shopRes.status}`);
        const shopData = await shopRes.json();

        const stockRes = await fetch(`${API_BASE}/stock/?shop_id=${shopId}`, {
          headers: authHeadersNoJson,
          signal: controller.signal,
        });
        if (!stockRes.ok) throw new Error(`Failed to load stock. Status: ${stockRes.status}`);
        const stockData = await stockRes.json();

        setShop(shopData);
        setStockRows(Array.isArray(stockData) ? stockData : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        setError(err?.message || "Failed to load shop / stock for inventory check.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadShopAndStock();
    return () => controller.abort();
  }, [shopId, authHeadersNoJson]);

  // load history list for the shop (ONLY when History tab is opened, or after save/post)
  const loadHistory = async (force = false) => {
    // TTL cache
    if (!force && historyChecks.length > 0) {
      const ageMs = Date.now() - historyLoadedAtRef.current;
      if (ageMs < 20_000) return historyChecks;
    }

    if (historyAbortRef.current) {
      try {
        historyAbortRef.current.abort();
      } catch {}
    }
    const controller = new AbortController();
    historyAbortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/inventory-checks/summary?shop_id=${shopId}`, {
        headers: authHeadersNoJson,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to load inventory checks. Status: ${res.status}`);
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      setHistoryChecks(list);
      historyLoadedAtRef.current = Date.now();
      return list;
    } catch (err) {
      if (controller.signal.aborted) return [];
      console.error(err);
      setError(err?.message || "Failed to fetch inventory checks.");
      return [];
    }
  };

  const loadDaySummary = async (isoDate) => {
    const dateISO = toISODate(isoDate);
    if (!dateISO) {
      setDaySummary(null);
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/inventory-checks/day-summary?shop_id=${shopId}&check_date=${encodeURIComponent(dateISO)}`,
        { headers: authHeadersNoJson }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to load day summary. Status: ${res.status}`);
      }
      const data = await res.json().catch(() => null);
      setDaySummary(data || null);
    } catch (err) {
      console.error(err);
      // Don't block the page if summary fails
      setDaySummary(null);
    }
  };

  // ✅ Fast detail loader
  const loadCheckForDateFast = async (isoDate, seq) => {
    const dateISO = toISODate(isoDate);
    if (!dateISO) {
      setCurrentCheckId(null);
      setCurrentCheckStatus(null);
      setLines([]);
      return { fallbackNeeded: false };
    }

    // cancel prior detail request
    if (checkAbortRef.current) {
      try {
        checkAbortRef.current.abort();
      } catch {}
    }
    const controller = new AbortController();
    checkAbortRef.current = controller;

    const url = `${API_BASE}/inventory-checks/for-date?shop_id=${shopId}&check_date=${encodeURIComponent(dateISO)}`;

    const res = await fetch(url, { headers: authHeadersNoJson, signal: controller.signal });

    if (res.status === 404) {
      return { fallbackNeeded: true };
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.detail || `Failed to load inventory check. Status: ${res.status}`);
    }

    const detail = await res.json().catch(() => null);

    if (!detail) {
      if (seq !== checkSeqRef.current) return { fallbackNeeded: false };
      setCurrentCheckId(null);
      setCurrentCheckStatus(null);
      setLines([]);
      return { fallbackNeeded: false };
    }

    if (seq !== checkSeqRef.current) return { fallbackNeeded: false };

    setCurrentCheckId(detail.id ?? null);
    setCurrentCheckStatus(detail.status ?? null);

    const mapped = (detail.lines || []).map((ln) => ({
      id: ln.id,
      itemId: ln.item_id,
      itemName: ln.item_name,
      systemPieces: Number(ln.system_pieces || 0),
      countedPieces: Number(ln.counted_pieces || 0),
      diffPieces: Number(ln.diff_pieces || 0),
      costPerPiece: getCostPerPiece(ln.item_id),
    }));
    setLines(mapped);

    return { fallbackNeeded: false };
  };

  // Fallback loader (legacy)
  const loadCheckForDateLegacy = async (isoDate, seq) => {
    const dateISO = toISODate(isoDate);
    const list = await loadHistory(true);
    if (seq !== checkSeqRef.current) return;

    const sameDateChecks = (list || []).filter((c) => toISODate(c.check_date) === dateISO);

    if (!sameDateChecks.length) {
      setCurrentCheckId(null);
      setCurrentCheckStatus(null);
      setLines([]);
      return;
    }

    const match =
      sameDateChecks.find((c) => String(c.status).toUpperCase() === "DRAFT") ||
      sameDateChecks.find((c) => String(c.status).toUpperCase() === "POSTED") ||
      sameDateChecks[sameDateChecks.length - 1];

    if (checkAbortRef.current) {
      try {
        checkAbortRef.current.abort();
      } catch {}
    }
    const controller = new AbortController();
    checkAbortRef.current = controller;

    const detailRes = await fetch(`${API_BASE}/inventory-checks/${match.id}`, {
      headers: authHeadersNoJson,
      signal: controller.signal,
    });
    if (!detailRes.ok) {
      throw new Error(`Failed to load inventory check details. Status: ${detailRes.status}`);
    }

    const detail = await detailRes.json();
    if (seq !== checkSeqRef.current) return;

    setCurrentCheckId(detail.id || match.id);
    setCurrentCheckStatus(detail.status || match.status || null);

    const mapped = (detail.lines || []).map((ln) => ({
      id: ln.id,
      itemId: ln.item_id,
      itemName: ln.item_name,
      systemPieces: Number(ln.system_pieces || 0),
      countedPieces: Number(ln.counted_pieces || 0),
      diffPieces: Number(ln.diff_pieces || 0),
      costPerPiece: getCostPerPiece(ln.item_id),
    }));
    setLines(mapped);
  };

  // when date changes
  useEffect(() => {
    if (loading) return;

    setError("");
    setMessage("");
    setCurrentCheckId(null);
    setCurrentCheckStatus(null);
    setLines([]);
    setPad({ itemId: "", countedPieces: "" });

    const seq = ++checkSeqRef.current;
    const iso = toISODate(inventoryDate);

    (async () => {
      setLoadingCheck(true);
      try {
        const fast = await loadCheckForDateFast(iso, seq);
        if (seq !== checkSeqRef.current) return;

        if (fast?.fallbackNeeded) {
          await loadCheckForDateLegacy(iso, seq);
        }
      } catch (err) {
        const aborted = (checkAbortRef.current && checkAbortRef.current.signal?.aborted) || false;
        if (aborted) return;
        console.error(err);
        setError(err?.message || "Failed to fetch inventory check for selected date.");
      } finally {
        if (seq === checkSeqRef.current) setLoadingCheck(false);
      }
    })();

    // Always load posted totals for the date
    loadDaySummary(iso);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryDate, loading]);

  // ---------- Pad + list logic ----------
  const resetPad = () => setPad({ itemId: "", countedPieces: "" });

  const handlePadChange = (field, value) => {
    if (error) setError("");
    if (message) setMessage("");

    if (field === "itemId") {
      setPad((prev) => ({ ...prev, itemId: value === "" ? "" : Number(value) }));
      return;
    }
    if (field === "countedPieces") {
      setPad((prev) => ({ ...prev, countedPieces: value }));
      return;
    }
  };

  // ✅ Best practice: posted runs are immutable; to continue counting, start a NEW run.
  const disableEditing = loadingCheck || isPosted;

  const canAddToList = !disableEditing && !!Number(pad.itemId || 0) && padStock && padCountedIsValid;

  const handleAddToList = () => {
    if (loadingCheck) return;

    if (isPosted) {
      setError("This run is POSTED. Click “Start new run” to continue counting for this date.");
      return;
    }

    const itemId = Number(pad.itemId || 0);
    if (!itemId) {
      setError("Select an item first.");
      return;
    }

    const s = stockByItemId[itemId];
    if (!s) {
      setError("This item has no stock record in this shop. Add stock via Purchases first.");
      return;
    }

    const counted = pad.countedPieces === "" ? null : Number(pad.countedPieces);
    if (counted === null || !Number.isFinite(counted) || counted < 0) {
      setError("Enter counted pieces (0 or more).");
      return;
    }

    const system = Number(s.remaining_pieces || 0);
    const diff = counted - system;
    const costPerPiece = getCostPerPiece(itemId);

    setLines((prev) => {
      const existingIndex = prev.findIndex((ln) => Number(ln.itemId) === itemId);
      const base = {
        id: prev[existingIndex]?.id ?? `local-${Date.now()}-${Math.random()}`,
        itemId,
        itemName: s.item_name || `Item ${itemId}`,
        systemPieces: system,
        countedPieces: counted,
        diffPieces: diff,
        costPerPiece,
      };

      if (existingIndex === -1) return [...prev, base];
      const copy = [...prev];
      copy[existingIndex] = base;
      return copy;
    });

    resetPad();
    if (padRef.current) padRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleEditLine = (line) => {
    if (loadingCheck) return;
    if (isPosted) return;

    setPad({ itemId: line.itemId, countedPieces: line.countedPieces });
    if (padRef.current) padRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRemoveLine = (id) => {
    if (loadingCheck) return;
    if (isPosted) return;
    setLines((prev) => prev.filter((ln) => ln.id !== id));
  };

  const handleStartNewRun = () => {
    setError("");
    setMessage("New run started for this date. Add items, then Save/Post.");
    setCurrentCheckId(null);
    setCurrentCheckStatus("DRAFT");
    setLines([]);
    setPad({ itemId: "", countedPieces: "" });
    if (padRef.current) padRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ---------- Save draft / post ----------
  const saveDraftInternal = async ({ silent = false } = {}) => {
    if (!lines.length) throw new Error("No items to save.");
    if (loadingCheck) throw new Error("Please wait…");

    setSavingDraft(true);
    if (!silent) {
      setError("");
      setMessage("");
    }

    try {
      const payload = {
        id: currentCheckId, // update existing draft or create if null
        shop_id: Number(shopId),
        check_date: toISODate(inventoryDate),
        notes: null,
        lines: lines.map((ln) => ({
          item_id: ln.itemId,
          counted_pieces: ln.countedPieces,
        })),
      };

      const res = await fetch(`${API_BASE}/inventory-checks/draft`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to save inventory draft. Status: ${res.status}`);
      }

      const data = await res.json();

      setCurrentCheckId(data.id);
      setCurrentCheckStatus(data.status || "DRAFT");

      const syncedLines = (data.lines || []).map((ln) => ({
        id: ln.id,
        itemId: ln.item_id,
        itemName: ln.item_name,
        systemPieces: Number(ln.system_pieces || 0),
        countedPieces: Number(ln.counted_pieces || 0),
        diffPieces: Number(ln.diff_pieces || 0),
        costPerPiece: getCostPerPiece(ln.item_id),
      }));
      setLines(syncedLines);

      await loadHistory(true);
      await loadDaySummary(toISODate(inventoryDate));

      if (!silent) setMessage("Inventory draft saved. Stock is NOT changed yet.");

      return data;
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!lines.length) return;
    if (loadingCheck) return;

    if (isPosted) {
      setError("This run is POSTED. Click “Start new run” to continue counting for this date.");
      return;
    }

    try {
      await saveDraftInternal({ silent: false });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to save inventory draft.");
      setMessage("");
    }
  };

  const handlePostInventory = async () => {
    if (!lines.length) return;
    if (loadingCheck) return;

    if (isPosted) {
      setError("This run is already POSTED. Click “Start new run” to post another run for this date.");
      return;
    }

    setPosting(true);
    setError("");
    setMessage("");

    try {
      // ✅ If no check id yet, auto-save draft first, then post.
      let checkId = currentCheckId;
      if (!checkId) {
        const saved = await saveDraftInternal({ silent: true });
        checkId = saved?.id;
      }

      if (!checkId) throw new Error("Failed to create draft before posting.");

      const res = await fetch(`${API_BASE}/inventory-checks/${checkId}/post`, {
        method: "POST",
        headers: authHeaders,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to post inventory check. Status: ${res.status}`);
      }

      const data = await res.json();

      setCurrentCheckId(data.id ?? checkId);
      setCurrentCheckStatus(data.status || "POSTED");

      const syncedLines = (data.lines || []).map((ln) => ({
        id: ln.id,
        itemId: ln.item_id,
        itemName: ln.item_name,
        systemPieces: Number(ln.system_pieces || 0),
        countedPieces: Number(ln.counted_pieces || 0),
        diffPieces: Number(ln.diff_pieces || 0),
        costPerPiece: getCostPerPiece(ln.item_id),
      }));
      setLines(syncedLines);

      await loadHistory(true);
      await loadDaySummary(toISODate(inventoryDate));

      setMessage("Inventory check posted. Stock levels have been updated. Click “Start new run” to continue counting.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to post inventory check.");
      setMessage("");
    } finally {
      setPosting(false);
    }
  };

  // ---------- History tab helpers ----------
  const groupedHistory = useMemo(() => {
    const map = new Map();
    for (const c of historyChecks || []) {
      const dateISO = toISODate(c.check_date);
      if (!dateISO) continue;
      let g = map.get(dateISO);
      if (!g) {
        g = {
          date: dateISO,
          total_items: 0,
          total_system_pieces: 0,
          total_counted_pieces: 0,
          total_diff_pieces: 0,
          status: c.status || "DRAFT",
          last_created_at: c.created_at || null,
        };
        map.set(dateISO, g);
      }
      g.total_items += Number(c.total_items || 0);
      g.total_system_pieces += Number(c.total_system_pieces || 0);
      g.total_counted_pieces += Number(c.total_counted_pieces || 0);
      g.total_diff_pieces += Number(c.total_diff_pieces || 0);
      if (String(c.status).toUpperCase() === "POSTED") g.status = "POSTED";

      if (c.created_at && (!g.last_created_at || String(c.created_at) > String(g.last_created_at))) {
        g.last_created_at = c.created_at;
      }
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => b.date.localeCompare(a.date));
    return arr;
  }, [historyChecks]);

  const openHistoryCheck = (dateISO) => {
    const iso = toISODate(dateISO);
    setActiveTab("enter");
    setInventoryDate(iso);
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
    border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
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

  const canSaveDraft = lines.length > 0 && !savingDraft && !isPosted && !loadingCheck;
  // ✅ Keep Post active after Save, and even before save (auto-save will happen)
  const canPost = lines.length > 0 && !posting && !isPosted && !loadingCheck;

  const numCell = { whiteSpace: "nowrap" };

  return (
    <div style={{ width: "100%", maxWidth: "1500px", margin: "0 auto", boxSizing: "border-box" }}>
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
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

            <h1 style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "0.03em", margin: 0 }}>
              Inventory check
            </h1>

            <div style={{ marginTop: "2px", fontSize: "13px", fontWeight: 600, color: "#2563eb" }}>
              {shopName}
            </div>

            <div style={{ marginTop: "6px", fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>
              Status:{" "}
              <span style={{ color: isPosted ? "#b91c1c" : "#111827" }}>
                {currentCheckStatus ? String(currentCheckStatus).toUpperCase() : "—"}
              </span>
              {currentCheckId ? ` • Check ID: ${currentCheckId}` : ""}
            </div>

            <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" style={tabBtn(activeTab === "enter")} onClick={() => setActiveTab("enter")}>
                Enter counts
              </button>

              <button
                type="button"
                style={tabBtn(activeTab === "history")}
                onClick={() => {
                  setActiveTab("history");
                  loadHistory(true);
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
              maxWidth: "380px",
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              padding: "10px 14px",
              boxShadow: "0 6px 18px rgba(15,37,128,0.06)",
              display: "grid",
              gridTemplateColumns: "1fr",
              rowGap: "6px",
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
              Date: {toISODate(inventoryDate)} • Time (CAT): {catNowHM}
            </div>

            {/* ✅ Daily posted totals (history) */}
            <div
              style={{
                padding: "8px 10px",
                borderRadius: "12px",
                border: "1px dashed #e5e7eb",
                background: "#f9fafb",
              }}
            >
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280" }}>
                Posted totals for this date
              </div>

              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  color: postedTotalPieces === 0 ? "#111827" : postedTotalPieces > 0 ? "#16a34a" : "#b91c1c",
                }}
              >
                {formatDiff(postedTotalPieces)}{" "}
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#6b7280" }}>
                  ({postedRuns} run{postedRuns === 1 ? "" : "s"})
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginTop: 4 }}>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Money impact (RWF)</div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: "12px",
                    color: postedTotalValue === 0 ? "#111827" : postedTotalValue > 0 ? "#16a34a" : "#b91c1c",
                  }}
                >
                  {postedTotalValue === 0 ? "0" : `${postedTotalValue > 0 ? "+" : ""}${formatMoney(postedTotalValue)}`}
                </div>
              </div>
            </div>

            {/* Current run totals */}
            <div style={{ marginTop: "6px" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280" }}>
                This run diff (not history)
              </div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 800,
                  color: totalDiffPieces === 0 ? "#111827" : totalDiffPieces > 0 ? "#16a34a" : "#b91c1c",
                }}
              >
                {formatDiff(totalDiffPieces)}
              </div>
            </div>

            <div
              style={{
                marginTop: "6px",
                paddingTop: "6px",
                borderTop: "1px dashed #e5e7eb",
                display: "grid",
                gridTemplateColumns: "1fr",
                rowGap: "4px",
              }}
            >
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280" }}>
                System stock value (RWF) — this run
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Before</div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "#111827" }}>
                  {formatMoney(totalSystemValueBefore)}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>After (counted)</div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "#111827" }}>
                  {formatMoney(totalSystemValueAfter)}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Difference</div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "13px",
                    color: totalSystemValueDiff === 0 ? "#111827" : totalSystemValueDiff > 0 ? "#16a34a" : "#b91c1c",
                  }}
                >
                  {totalSystemValueDiff === 0
                    ? "0"
                    : `${totalSystemValueDiff > 0 ? "+" : ""}${formatMoney(totalSystemValueDiff)}`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* date picker */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>
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

          {loadingCheck && <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>Loading…</div>}
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
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
            Enter inventory counts for {toISODate(inventoryDate)}
          </h2>

          {isPosted && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: "14px",
                background: "#fef2f2",
                color: "#b91c1c",
                fontWeight: 700,
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <div>
                This run is <strong>POSTED</strong>
                {currentCheckId ? ` (ID: ${currentCheckId})` : ""}. To continue counting for the same date, start a new run.
              </div>

              <button
                type="button"
                onClick={handleStartNewRun}
                style={{
                  padding: "0.55rem 1.2rem",
                  borderRadius: "9999px",
                  border: "none",
                  backgroundColor: "#2563eb",
                  color: "white",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                Start new run
              </button>
            </div>
          )}

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
              opacity: disableEditing ? 0.9 : 1,
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
              <span>Pad: select item, enter counted pieces, then add to list</span>

              <button
                type="button"
                onClick={handleAddToList}
                disabled={!canAddToList}
                style={{
                  padding: "0.55rem 1.3rem",
                  borderRadius: "9999px",
                  border: "none",
                  backgroundColor: !canAddToList ? "#9ca3af" : "#2563eb",
                  color: "white",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                  cursor: !canAddToList ? "not-allowed" : "pointer",
                  opacity: !canAddToList ? 0.85 : 1,
                }}
              >
                + Add to list
              </button>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                Item
              </label>
              <ItemComboBox
                items={pickerItems}
                valueId={pad.itemId === "" ? "" : String(pad.itemId)}
                onChangeId={(idStr) => handlePadChange("itemId", idStr)}
                disabled={disableEditing}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  columnGap: "14px",
                  rowGap: "6px",
                  marginTop: "10px",
                  fontSize: "12px",
                  color: "#6b7280",
                }}
              >
                <div>
                  System pieces:{" "}
                  <strong style={{ color: "#111827" }}>{pad.itemId ? formatQty(padSystemPieces) : "—"}</strong>
                </div>
                <div>
                  Counted pieces:{" "}
                  <strong style={{ color: "#111827" }}>
                    {padCountedPieces === null ? "—" : formatQty(padCountedPieces)}
                  </strong>
                </div>
                <div>
                  Difference:{" "}
                  <strong
                    style={{
                      color:
                        padDiff === null ? "#111827" : padDiff > 0 ? "#16a34a" : padDiff < 0 ? "#b91c1c" : "#111827",
                    }}
                  >
                    {padDiff === null ? "—" : formatDiff(padDiff)}
                  </strong>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: "12px",
                display: "grid",
                gridTemplateColumns: "minmax(140px, 1.5fr) minmax(140px, 1fr) minmax(140px, 1fr)",
                gap: "12px",
                alignItems: "end",
              }}
            >
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                  System pieces
                </label>
                <input
                  type="text"
                  readOnly
                  value={pad.itemId ? formatQty(padSystemPieces) : ""}
                  style={{ ...inputBase, backgroundColor: "#f3f4f6", fontWeight: 600 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                  Counted pieces (physical)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pad.countedPieces}
                  disabled={disableEditing}
                  onChange={(e) => handlePadChange("countedPieces", e.target.value)}
                  style={{
                    ...inputBase,
                    backgroundColor: disableEditing ? "#f9fafb" : "#ffffff",
                    cursor: disableEditing ? "not-allowed" : "text",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                  Difference
                </label>
                <input
                  type="text"
                  readOnly
                  value={padDiff === null ? "" : formatDiff(padDiff)}
                  style={{ ...inputBase, backgroundColor: "#f3f4f6", fontWeight: 600 }}
                />
              </div>
            </div>
          </div>

          {/* LIST */}
          {lines.length === 0 ? (
            <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
              No items added yet. Use the pad above and click <strong>+ Add to list</strong>.
            </div>
          ) : (
            <>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                {lines.length} item{lines.length === 1 ? "" : "s"} in this run.
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
                      gridTemplateColumns: "minmax(220px, 2.5fr) 1fr 1fr 1fr 1fr 60px",
                      minWidth: "980px",
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
                    <div style={{ textAlign: "right" }}>System pieces</div>
                    <div style={{ textAlign: "right" }}>Cost / piece</div>
                    <div style={{ textAlign: "right" }}>Counted pieces</div>
                    <div style={{ textAlign: "right" }}>Difference</div>
                    <div />
                  </div>

                  {lines.map((ln) => (
                    <div
                      key={ln.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(220px, 2.5fr) 1fr 1fr 1fr 1fr 60px",
                        minWidth: "980px",
                        alignItems: "center",
                        padding: "9px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: "13px",
                      }}
                    >
                      <div>
                        <button
                          type="button"
                          onClick={() => handleEditLine(ln)}
                          disabled={disableEditing}
                          style={{
                            padding: 0,
                            margin: 0,
                            border: "none",
                            background: "transparent",
                            color: "#111827",
                            fontWeight: 600,
                            fontSize: "13px",
                            cursor: disableEditing ? "not-allowed" : "pointer",
                            textAlign: "left",
                            opacity: disableEditing ? 0.7 : 1,
                          }}
                          title="Edit this item in the pad"
                        >
                          {ln.itemName || "Unknown item"}
                        </button>
                      </div>

                      <div style={{ textAlign: "right", ...numCell }}>{formatQty(ln.systemPieces)}</div>
                      <div style={{ textAlign: "right", ...numCell }}>{formatMoney(ln.costPerPiece)}</div>
                      <div style={{ textAlign: "right", ...numCell }}>{formatQty(ln.countedPieces)}</div>

                      <div
                        style={{
                          textAlign: "right",
                          ...numCell,
                          color: ln.diffPieces > 0 ? "#16a34a" : ln.diffPieces < 0 ? "#b91c1c" : "#111827",
                          fontWeight: 600,
                        }}
                      >
                        {formatDiff(ln.diffPieces)}
                      </div>

                      <div style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(ln.id)}
                          disabled={disableEditing}
                          style={{
                            width: "26px",
                            height: "26px",
                            borderRadius: "9999px",
                            border: "1px solid #fee2e2",
                            backgroundColor: disableEditing ? "#f3f4f6" : "#fef2f2",
                            color: disableEditing ? "#9ca3af" : "#b91c1c",
                            fontSize: "14px",
                            cursor: disableEditing ? "not-allowed" : "pointer",
                            opacity: disableEditing ? 0.7 : 1,
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "14px", flexWrap: "wrap" }}>
            {isPosted && (
              <button
                type="button"
                onClick={handleStartNewRun}
                style={{
                  padding: "0.6rem 1.4rem",
                  borderRadius: "999px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                }}
              >
                Start new run
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={!canSaveDraft}
              style={{
                padding: "0.6rem 1.4rem",
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                color: "#111827",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: !canSaveDraft ? "not-allowed" : "pointer",
                opacity: !canSaveDraft ? 0.55 : 1,
              }}
            >
              {savingDraft ? "Saving…" : "Save draft"}
            </button>

            <button
              type="button"
              onClick={handlePostInventory}
              disabled={!canPost}
              style={{
                padding: "0.6rem 1.8rem",
                borderRadius: "999px",
                border: "none",
                backgroundColor: !canPost ? "#9ca3af" : "#2563eb",
                color: "white",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: !canPost ? "not-allowed" : "pointer",
                opacity: !canPost ? 0.85 : 1,
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
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>Previous inventory checks</h2>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 4 }}>
            One row per date. Click a date to open its latest run.
          </div>

          {groupedHistory.length === 0 ? (
            <div style={{ marginTop: 10, fontSize: "13px", color: "#6b7280" }}>
              No inventory checks recorded yet.
            </div>
          ) : (
            <div style={{ marginTop: 12, borderRadius: "14px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
              <div style={{ maxHeight: "420px", overflowY: "auto" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px 1fr 1fr 1fr 120px",
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
                  <div style={{ textAlign: "right" }}>Items</div>
                  <div style={{ textAlign: "right" }}>System pieces</div>
                  <div style={{ textAlign: "right" }}>Counted pieces</div>
                  <div style={{ textAlign: "right" }}>Diff (pieces)</div>
                </div>

                {groupedHistory.map((g) => (
                  <div
                    key={g.date}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px 1fr 1fr 1fr 120px",
                      minWidth: "720px",
                      alignItems: "center",
                      padding: "9px 10px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: "13px",
                    }}
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => openHistoryCheck(g.date)}
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
                        {g.date}
                      </button>
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: 2 }}>
                        {g.status === "POSTED" ? "Posted" : "Draft"}
                        {g.last_created_at ? ` • ${formatCAT_HM_FromISO(g.last_created_at)} CAT` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", ...numCell }}>{g.total_items}</div>
                    <div style={{ textAlign: "right", ...numCell }}>{formatQty(g.total_system_pieces)}</div>
                    <div style={{ textAlign: "right", ...numCell }}>{formatQty(g.total_counted_pieces)}</div>
                    <div
                      style={{
                        textAlign: "right",
                        ...numCell,
                        color:
                          Number(g.total_diff_pieces || 0) > 0
                            ? "#16a34a"
                            : Number(g.total_diff_pieces || 0) < 0
                            ? "#b91c1c"
                            : "#111827",
                        fontWeight: 600,
                      }}
                    >
                      {formatDiff(g.total_diff_pieces)}
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
