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

// ===============================
// ✅ Session closed helper + cache
// ===============================
function isSessionClosed(meta) {
  const st = String(meta?.session_status || meta?.sessionStatus || "").toUpperCase();
  if (st === "CLOSED") return true;
  if (meta?.closed_at || meta?.closedAt) return true;
  return false;
}

function isSessionOpen(meta) {
  const st = String(meta?.session_status || meta?.sessionStatus || "").toUpperCase();
  if (!st) return false;
  if (st === "OPEN" || st === "IN_PROGRESS" || st === "STARTED") return true;
  return false;
}

function postedCacheKey(shopId, checkId) {
  return `iclas_inv_posted_${shopId}_${checkId}`;
}

// =====================================================
// ✅ IMPORTANT FIX: trailing-slash redirect CORS fallback
// =====================================================
function _toggleTrailingSlashBeforeQuery(url) {
  const s = String(url || "");
  if (!s) return s;

  const qIndex = s.indexOf("?");
  const base = qIndex >= 0 ? s.slice(0, qIndex) : s;
  const query = qIndex >= 0 ? s.slice(qIndex) : "";

  const toggledBase = base.endsWith("/") ? base.slice(0, -1) : `${base}/`;
  return `${toggledBase}${query}`;
}

async function fetchWithSlashFallback(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    const alt = _toggleTrailingSlashBeforeQuery(url);
    if (alt && alt !== url) {
      return await fetch(alt, options);
    }
    throw err;
  }
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

  // ✅ date-level loading
  const [loadingCheck, setLoadingCheck] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [inventoryDate, setInventoryDate] = useState(() => todayISO());

  // current check loaded for selected date
  const [currentCheckId, setCurrentCheckId] = useState(null);
  const [currentCheckStatus, setCurrentCheckStatus] = useState(null);

  // ✅ check meta (from backend)
  const [checkMeta, setCheckMeta] = useState({
    session_status: null,
    started_at: null,
    closed_at: null,
    progress_total_items: null,
    progress_counted_items: null,
    progress_percent: null,
    posted_lines_count: null,
    draft_lines_count: null,
  });

  // timeline for the selected date (from stock movements)
  const [timelineRows, setTimelineRows] = useState([]);

  // pad state
  const [pad, setPad] = useState({
    itemId: "",
    countedPieces: "",
  });

  // lines shown in the main table (draft-only list for editing)
  const [lines, setLines] = useState([]);

  // ✅ posted lines from backend + sticky cache
  const [postedLines, setPostedLines] = useState([]);
  const [postedLinesSticky, setPostedLinesSticky] = useState([]);
  const stickyKeyRef = useRef(null);

  // history list
  const [historyChecks, setHistoryChecks] = useState([]);
  const historyLoadedAtRef = useRef(0);
  const historyAbortRef = useRef(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);

  const [sessionBusy, setSessionBusy] = useState(false);

  const padRef = useRef(null);

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
      map[Number(s.item_id)] = s;
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

  // ✅ Normalize backend line fields (supports many naming styles)
  const normalizeBackendLine = (ln) => {
    const itemId =
      Number(ln?.item_id) ||
      Number(ln?.itemId) ||
      Number(ln?.stock_item_id) ||
      Number(ln?.stockItemId) ||
      Number(ln?.item?.id) ||
      0;

    const itemName =
      ln?.item_name ||
      ln?.itemName ||
      ln?.stock_item_name ||
      ln?.stockItemName ||
      ln?.item?.name ||
      (itemId ? `Item ${itemId}` : "Unknown item");

    const systemPiecesRaw =
      ln?.system_pieces ??
      ln?.systemPieces ??
      ln?.system_qty ??
      ln?.systemQty ??
      ln?.system_quantity ??
      ln?.systemQuantity ??
      ln?.system_count ??
      ln?.systemCount ??
      0;

    const countedPiecesRaw =
      ln?.counted_pieces ??
      ln?.countedPieces ??
      ln?.counted_qty ??
      ln?.countedQty ??
      ln?.counted_quantity ??
      ln?.countedQuantity ??
      ln?.counted_count ??
      ln?.countedCount ??
      0;

    const diffRaw =
      ln?.diff_pieces ??
      ln?.diffPieces ??
      ln?.difference_pieces ??
      ln?.differencePieces ??
      ln?.difference ??
      ln?.diff ??
      null;

    const systemPieces = Number(systemPiecesRaw || 0);
    const countedPieces = Number(countedPiecesRaw || 0);
    const diffPieces = diffRaw === null || diffRaw === undefined ? countedPieces - systemPieces : Number(diffRaw || 0);

    const postedAt =
      ln?.posted_at ||
      ln?.postedAt ||
      ln?.adjustment_created_at ||
      ln?.movement_created_at ||
      ln?.created_at ||
      ln?.createdAt ||
      null;

    const costPerPiece = getCostPerPiece(itemId);

    return {
      raw: ln,
      id: ln?.id ?? ln?.line_id ?? ln?.lineId ?? `${itemId}-${Math.random()}`,
      itemId,
      itemName,
      systemPieces: Number.isFinite(systemPieces) ? systemPieces : 0,
      countedPieces: Number.isFinite(countedPieces) ? countedPieces : 0,
      diffPieces: Number.isFinite(diffPieces) ? diffPieces : 0,
      costPerPiece,
      postedAt,
    };
  };

  // ✅ detect posted line (many possible signals)
  const isLinePosted = (ln) => {
    const s = ln?.raw || ln || {};
    const statusStr = String(s?.status || s?.line_status || s?.lineStatus || "").toUpperCase();

    // ✅ Your backend sends is_posted on line out
    if (s.is_posted === true || s.posted === true) return true;

    if (statusStr === "POSTED") return true;
    if (s.posted_at || s.postedAt) return true;

    // movement / adjustment pointers
    if (s.adjustment_movement_id || s.adjustmentMovementId) return true;
    if (s.adjustment_movement || s.adjustmentMovement) return true;
    if (s.movement_id || s.movementId) return true;

    // some APIs store a boolean like "has_adjustment"
    if (s.has_adjustment === true || s.hasAdjustment === true) return true;

    return false;
  };

  // ✅ collapse to latest per item (latest line id wins)
  const collapseLinesToLatestPerItem = (rawLines, opts = {}) => {
    const { onlyPosted = null } = opts || {};
    const arr = Array.isArray(rawLines) ? rawLines : [];
    const byItem = new Map();

    for (const raw of arr) {
      const norm = normalizeBackendLine(raw);
      const itemId = Number(norm.itemId);
      if (!Number.isFinite(itemId) || itemId <= 0) continue;

      const posted = isLinePosted(norm);
      if (onlyPosted === true && !posted) continue;
      if (onlyPosted === false && posted) continue;

      const idNum = Number(raw?.id ?? raw?.line_id ?? raw?.lineId);
      const prev = byItem.get(itemId);

      if (
        !prev ||
        (Number.isFinite(idNum) && Number.isFinite(prev._lineId) ? idNum > prev._lineId : true)
      ) {
        byItem.set(itemId, {
          _lineId: Number.isFinite(idNum) ? idNum : Date.now(),
          ...norm,
        });
      }
    }

    const out = Array.from(byItem.values()).map(({ _lineId, raw, ...rest }) => rest);
    out.sort((a, b) => String(a.itemName || "").localeCompare(String(b.itemName || "")));
    return out;
  };

  // ✅ posted time map from: postedAt on lines + timeline rows
  const postedTimeByItemId = useMemo(() => {
    const map = new Map();

    // from posted lines (preferred)
    const src = (postedLines && postedLines.length ? postedLines : postedLinesSticky) || [];
    for (const ln of src) {
      const itemId = Number(ln.itemId);
      if (!Number.isFinite(itemId) || itemId <= 0) continue;
      if (ln.postedAt) {
        const prev = map.get(itemId);
        if (!prev || String(ln.postedAt) > String(prev)) map.set(itemId, ln.postedAt);
      }
    }

    // from timeline (fallback)
    const rows = Array.isArray(timelineRows) ? timelineRows : [];
    for (const r of rows) {
      const itemId = Number(r.item_id ?? r.itemId ?? r.stock_item_id ?? r.stockItemId);
      if (!Number.isFinite(itemId) || itemId <= 0) continue;

      const iso =
        r.created_at ??
        r.posted_at ??
        r.occurred_at ??
        r.timestamp ??
        r.createdAt ??
        r.postedAt ??
        null;

      if (!iso) continue;
      const prev = map.get(itemId);
      if (!prev || String(iso) > String(prev)) map.set(itemId, iso);
    }

    return map;
  }, [postedLines, postedLinesSticky, timelineRows]);

  // ✅ posted list rows (keep sticky until CLOSED)
  const postedRowsForTable = useMemo(() => {
    const sourceLines =
      (postedLines && postedLines.length > 0 ? postedLines : postedLinesSticky) || [];

    const arr = sourceLines.map((ln) => {
      const itemId = Number(ln.itemId);
      const timeIso = postedTimeByItemId.get(itemId) || ln.postedAt || null;

      const diffBefore = Number(ln.diffPieces || 0);

      // current stock now
      const nowSystem = Number(stockByItemId[itemId]?.remaining_pieces || 0);
      const diffNow = Number(ln.countedPieces || 0) - nowSystem;

      const cost = Number(ln.costPerPiece || 0);
      const totalDiffCost = diffBefore * cost;

      return {
        ...ln,
        postedTimeIso: timeIso,
        diffBeforeNormalization: diffBefore,
        systemPiecesNow: nowSystem,
        diffNow,
        totalDiffCost,
      };
    });

    arr.sort((a, b) => {
      const ta = a.postedTimeIso ? String(a.postedTimeIso) : "";
      const tb = b.postedTimeIso ? String(b.postedTimeIso) : "";
      if (ta && tb && ta !== tb) return tb.localeCompare(ta);
      return String(a.itemName || "").localeCompare(String(b.itemName || ""));
    });

    return arr;
  }, [postedLines, postedLinesSticky, postedTimeByItemId, stockByItemId]);

  // ---------- Pad derived ----------
  const padStock = pad.itemId ? stockByItemId[Number(pad.itemId)] : null;
  const padSystemPieces = padStock ? Number(padStock.remaining_pieces || 0) : 0;

  const padCountedPieces = pad.countedPieces === "" ? null : Number(pad.countedPieces || 0);

  const padCountedIsValid =
    padCountedPieces !== null && Number.isFinite(padCountedPieces) && padCountedPieces >= 0;

  const padDiff = padCountedPieces === null ? null : padCountedPieces - padSystemPieces;

  // ✅ Summary uses the ONE-row-per-item list
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

  // timeline totals for the whole session/day (depending on timeline filter)
  const timelineTotals = useMemo(() => {
    const rows = Array.isArray(timelineRows) ? timelineRows : [];
    const totalAdj = rows.length;
    const pieces = rows.reduce((s, r) => s + Number(r.pieces_change || r.piecesChange || 0), 0);
    const value = rows.reduce((s, r) => s + Number(r.value_change || r.valueChange || 0), 0);
    const checks = new Set(rows.map((r) => String(r.check_id ?? r.checkId ?? ""))).size;
    return { totalAdj, pieces, value, checks };
  }, [timelineRows]);

  // ---------- Data loading ----------
  useEffect(() => {
    const controller = new AbortController();

    async function loadShopAndStock() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const shopRes = await fetchWithSlashFallback(`${API_BASE}/shops/${shopId}`, {
          headers: authHeadersNoJson,
          signal: controller.signal,
        });
        if (!shopRes.ok) throw new Error(`Failed to load shop. Status: ${shopRes.status}`);
        const shopData = await shopRes.json();

        const stockRes = await fetchWithSlashFallback(`${API_BASE}/stock/?shop_id=${shopId}`, {
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

  const reloadStock = async () => {
    try {
      const stockRes = await fetchWithSlashFallback(`${API_BASE}/stock/?shop_id=${shopId}`, {
        headers: authHeadersNoJson,
      });
      if (!stockRes.ok) return;
      const stockData = await stockRes.json().catch(() => []);
      setStockRows(Array.isArray(stockData) ? stockData : []);
    } catch {
      // ignore
    }
  };

  const loadHistory = async (force = false) => {
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
      const res = await fetchWithSlashFallback(
        `${API_BASE}/inventory-checks/summary?shop_id=${shopId}`,
        {
          headers: authHeadersNoJson,
          signal: controller.signal,
        }
      );
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

  // ✅ Timeline now supports multi-day sessions:
  // Prefer check_id when we have it (shows full session history),
  // otherwise fall back to check_date for legacy behavior.
  const loadTimeline = async ({ isoDate, checkId } = {}) => {
    const dateISO = toISODate(isoDate);
    const cid = Number(checkId || 0);

    try {
      let url = "";
      if (cid > 0) {
        url = `${API_BASE}/inventory-checks/timeline?shop_id=${shopId}&check_id=${encodeURIComponent(cid)}`;
      } else if (dateISO) {
        url = `${API_BASE}/inventory-checks/timeline?shop_id=${shopId}&check_date=${encodeURIComponent(dateISO)}`;
      } else {
        setTimelineRows([]);
        return [];
      }

      const res = await fetchWithSlashFallback(url, { headers: authHeadersNoJson });
      if (!res.ok) {
        // timeline might not exist in some backends => don't fail the page
        setTimelineRows([]);
        return [];
      }
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      setTimelineRows(list);
      return list;
    } catch {
      setTimelineRows([]);
      return [];
    }
  };

  const setMetaFromDetail = (detail) => {
    const d = detail || {};
    setCheckMeta((prev) => ({
      ...prev,
      session_status: d.session_status ?? d.sessionStatus ?? prev.session_status ?? null,
      started_at: d.started_at ?? d.startedAt ?? prev.started_at ?? null,
      closed_at: d.closed_at ?? d.closedAt ?? prev.closed_at ?? null,
      progress_total_items: d.progress_total_items ?? d.progressTotalItems ?? prev.progress_total_items ?? null,
      progress_counted_items: d.progress_counted_items ?? d.progressCountedItems ?? prev.progress_counted_items ?? null,
      progress_percent: d.progress_percent ?? d.progressPercent ?? prev.progress_percent ?? null,
      posted_lines_count: d.posted_lines_count ?? d.postedLinesCount ?? prev.posted_lines_count ?? null,
      draft_lines_count: d.draft_lines_count ?? d.draftLinesCount ?? prev.draft_lines_count ?? null,
    }));
  };

  const ensureStickyKey = (checkId) => {
    if (!checkId) return;
    const k = postedCacheKey(shopId, checkId);
    if (stickyKeyRef.current !== k) {
      stickyKeyRef.current = k;
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setPostedLinesSticky(parsed);
        }
      } catch {
        // ignore
      }
    }
  };

  const updateSticky = (checkId, detail, freshPosted) => {
    if (!checkId) return;

    const closed = isSessionClosed(detail);
    const k = postedCacheKey(shopId, checkId);

    if (closed) {
      setPostedLinesSticky([]);
      try {
        localStorage.removeItem(k);
      } catch {}
      return;
    }

    // only update sticky if backend returned something
    if (freshPosted.length > 0) {
      setPostedLinesSticky(freshPosted);
      try {
        localStorage.setItem(k, JSON.stringify(freshPosted));
      } catch {}
    }
  };

  // ✅ Build correct backend URL for /for-date
  const forDateUrl = (dateISO, includePostedLines) => {
    const d = toISODate(dateISO);
    const inc = includePostedLines ? "true" : "false";
    return `${API_BASE}/inventory-checks/for-date?shop_id=${shopId}&check_date=${encodeURIComponent(d)}&include_posted_lines=${inc}`;
  };

  // ✅ Fast detail loader:
  // 1) fetch include_posted_lines=false for draft-edit table
  // 2) fetch include_posted_lines=true for posted table
  const loadCheckForDateFast = async (isoDate, seq) => {
    const dateISO = toISODate(isoDate);
    if (!dateISO) {
      setCurrentCheckId(null);
      setCurrentCheckStatus(null);
      setLines([]);
      setPostedLines([]);
      setCheckMeta({
        session_status: null,
        started_at: null,
        closed_at: null,
        progress_total_items: null,
        progress_counted_items: null,
        progress_percent: null,
        posted_lines_count: null,
        draft_lines_count: null,
      });
      return { fallbackNeeded: false, checkId: null };
    }

    if (checkAbortRef.current) {
      try {
        checkAbortRef.current.abort();
      } catch {}
    }
    const controller = new AbortController();
    checkAbortRef.current = controller;

    // 1) Draft-only request
    const urlDraft = forDateUrl(dateISO, false);

    const resDraft = await fetchWithSlashFallback(urlDraft, {
      headers: authHeadersNoJson,
      signal: controller.signal,
    });

    if (resDraft.status === 404) {
      return { fallbackNeeded: true, checkId: null };
    }

    if (!resDraft.ok) {
      const errData = await resDraft.json().catch(() => null);
      throw new Error(errData?.detail || `Failed to load inventory check. Status: ${resDraft.status}`);
    }

    const draftDetail = await resDraft.json().catch(() => null);

    if (seq !== checkSeqRef.current) return { fallbackNeeded: false, checkId: null };

    if (!draftDetail) {
      setCurrentCheckId(null);
      setCurrentCheckStatus(null);
      setLines([]);
      setPostedLines([]);
      return { fallbackNeeded: false, checkId: null };
    }

    const checkId = draftDetail.id ?? draftDetail.check_id ?? draftDetail.checkId ?? null;

    setCurrentCheckId(checkId);
    setCurrentCheckStatus(draftDetail.status ?? draftDetail.check_status ?? draftDetail.checkStatus ?? null);
    setMetaFromDetail(draftDetail);

    if (checkId) ensureStickyKey(checkId);

    // Draft-edit lines are from include_posted_lines=false
    const rawDraftLines = draftDetail.lines || draftDetail.check_lines || draftDetail.checkLines || [];
    setLines(collapseLinesToLatestPerItem(rawDraftLines, { onlyPosted: false }));

    // 2) Posted+draft request for posted table (so posted lines exist)
    // If this call fails, we keep sticky cache as fallback and page still works.
    try {
      const urlAll = forDateUrl(dateISO, true);
      const resAll = await fetchWithSlashFallback(urlAll, {
        headers: authHeadersNoJson,
        signal: controller.signal,
      });

      if (resAll.ok) {
        const allDetail = await resAll.json().catch(() => null);
        if (seq === checkSeqRef.current && allDetail) {
          // Use meta from "all" detail too (same fields, but safe)
          setMetaFromDetail(allDetail);

          const allLines = allDetail.lines || allDetail.check_lines || allDetail.checkLines || [];
          const freshPosted = collapseLinesToLatestPerItem(allLines, { onlyPosted: true });

          setPostedLines(freshPosted);
          if (checkId) updateSticky(checkId, allDetail, freshPosted);
        }
      }
    } catch {
      // ignore posted fetch; sticky cache remains
    }

    return { fallbackNeeded: false, checkId };
  };

  // Fallback loader (legacy)
  const loadCheckForDateLegacy = async (isoDate, seq) => {
    const dateISO = toISODate(isoDate);
    const list = await loadHistory(true);
    if (seq !== checkSeqRef.current) return { fallbackNeeded: false, checkId: null };

    const sameDateChecks = (list || []).filter((c) => toISODate(c.check_date) === dateISO);

    if (!sameDateChecks.length) {
      setCurrentCheckId(null);
      setCurrentCheckStatus(null);
      setLines([]);
      setPostedLines([]);
      return { fallbackNeeded: false, checkId: null };
    }

    const match = sameDateChecks[sameDateChecks.length - 1];

    if (checkAbortRef.current) {
      try {
        checkAbortRef.current.abort();
      } catch {}
    }
    const controller = new AbortController();
    checkAbortRef.current = controller;

    // 1) draft-only detail
    const detailResDraft = await fetchWithSlashFallback(
      `${API_BASE}/inventory-checks/${match.id}?include_posted_lines=false`,
      {
        headers: authHeadersNoJson,
        signal: controller.signal,
      }
    );
    if (!detailResDraft.ok) {
      throw new Error(`Failed to load inventory check details. Status: ${detailResDraft.status}`);
    }

    const draftDetail = await detailResDraft.json();
    if (seq !== checkSeqRef.current) return { fallbackNeeded: false, checkId: null };

    const checkId = draftDetail?.id ?? match.id ?? null;

    setCurrentCheckId(checkId);
    setCurrentCheckStatus(draftDetail?.status || match.status || null);
    setMetaFromDetail(draftDetail);

    if (checkId) ensureStickyKey(checkId);

    const rawDraftLines = draftDetail.lines || draftDetail.check_lines || draftDetail.checkLines || [];
    setLines(collapseLinesToLatestPerItem(rawDraftLines, { onlyPosted: false }));

    // 2) include posted for posted table
    try {
      const detailResAll = await fetchWithSlashFallback(
        `${API_BASE}/inventory-checks/${match.id}?include_posted_lines=true`,
        {
          headers: authHeadersNoJson,
          signal: controller.signal,
        }
      );
      if (detailResAll.ok) {
        const allDetail = await detailResAll.json().catch(() => null);
        if (seq === checkSeqRef.current && allDetail) {
          setMetaFromDetail(allDetail);
          const allLines = allDetail.lines || allDetail.check_lines || allDetail.checkLines || [];
          const freshPosted = collapseLinesToLatestPerItem(allLines, { onlyPosted: true });

          setPostedLines(freshPosted);
          if (checkId) updateSticky(checkId, allDetail, freshPosted);
        }
      }
    } catch {
      // ignore posted fetch; sticky cache remains
    }

    return { fallbackNeeded: false, checkId };
  };

  const refreshCurrentDate = async () => {
    const seq = ++checkSeqRef.current;
    setLoadingCheck(true);
    try {
      const iso = toISODate(inventoryDate);
      const fast = await loadCheckForDateFast(iso, seq);
      if (seq !== checkSeqRef.current) return;

      let resolvedCheckId = fast?.checkId ?? null;

      if (fast?.fallbackNeeded) {
        const legacy = await loadCheckForDateLegacy(iso, seq);
        resolvedCheckId = legacy?.checkId ?? resolvedCheckId ?? null;
      }

      if (seq !== checkSeqRef.current) return;

      // timeline after check is known (so we can use check_id for multi-day sessions)
      await loadTimeline({ isoDate: iso, checkId: resolvedCheckId });
    } finally {
      if (seq === checkSeqRef.current) setLoadingCheck(false);
    }
  };

  // when date changes
  useEffect(() => {
    if (loading) return;

    setError("");
    setMessage("");
    setCurrentCheckId(null);
    setCurrentCheckStatus(null);
    setLines([]);
    setPostedLines([]);
    setTimelineRows([]);
    setPad({ itemId: "", countedPieces: "" });
    setCheckMeta({
      session_status: null,
      started_at: null,
      closed_at: null,
      progress_total_items: null,
      progress_counted_items: null,
      progress_percent: null,
      posted_lines_count: null,
      draft_lines_count: null,
    });

    const seq = ++checkSeqRef.current;
    const iso = toISODate(inventoryDate);

    (async () => {
      setLoadingCheck(true);
      try {
        const fast = await loadCheckForDateFast(iso, seq);
        if (seq !== checkSeqRef.current) return;

        let resolvedCheckId = fast?.checkId ?? null;

        if (fast?.fallbackNeeded) {
          const legacy = await loadCheckForDateLegacy(iso, seq);
          resolvedCheckId = legacy?.checkId ?? resolvedCheckId ?? null;
        }

        if (seq !== checkSeqRef.current) return;

        await loadTimeline({ isoDate: iso, checkId: resolvedCheckId });
      } catch (err) {
        const aborted =
          (checkAbortRef.current && checkAbortRef.current.signal?.aborted) || false;
        if (aborted) return;
        console.error(err);
        setError(err?.message || "Failed to fetch inventory check for selected date.");
      } finally {
        if (seq === checkSeqRef.current) setLoadingCheck(false);
      }
    })();

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

  const disableEditing = loadingCheck || posting || savingDraft || sessionBusy;

  const canAddToList = !disableEditing && !!Number(pad.itemId || 0) && padStock && padCountedIsValid;

  const handleAddToList = () => {
    if (loadingCheck) return;

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

      if (existingIndex === -1)
        return [...prev, base].sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)));
      const copy = [...prev];
      copy[existingIndex] = base;
      copy.sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)));
      return copy;
    });

    resetPad();
    if (padRef.current) padRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleEditLine = (line) => {
    if (loadingCheck) return;
    setPad({ itemId: line.itemId, countedPieces: line.countedPieces });
    if (padRef.current) padRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRemoveLine = (id) => {
    if (loadingCheck) return;
    setLines((prev) => prev.filter((ln) => ln.id !== id));
  };

  // ---------- Save draft / post ----------
  const saveDraftInternal = async ({ silent = false } = {}) => {
    if (!lines.length) return null;
    if (loadingCheck) return null;

    setSavingDraft(true);
    setError("");
    if (!silent) setMessage("");

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

      const res = await fetchWithSlashFallback(`${API_BASE}/inventory-checks/draft`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to save inventory draft. Status: ${res.status}`);
      }

      const data = await res.json();
      const newId = data?.id ?? data?.check_id ?? data?.checkId ?? null;

      setCurrentCheckId(newId);
      setCurrentCheckStatus(data.status || "DRAFT");
      setMetaFromDetail(data);

      const rawLines = data.lines || data.check_lines || data.checkLines || [];
      setLines(collapseLinesToLatestPerItem(rawLines, { onlyPosted: false }));

      // ✅ backend draft/post responses do not include posted lines;
      // refresh current date to pick up posted lines via include_posted_lines=true
      ensureStickyKey(newId);

      await loadHistory(true);
      await refreshCurrentDate();

      if (!silent) setMessage("Inventory draft saved. Stock is NOT changed yet.");
      return data;
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to save inventory draft.");
      if (!silent) setMessage("");
      return null;
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveDraft = async () => {
    await saveDraftInternal({ silent: false });
  };

  const handlePostInventory = async () => {
    if (!lines.length) return;
    if (loadingCheck) return;

    setPosting(true);
    setError("");
    setMessage("");

    try {
      let idToPost = currentCheckId;

      if (!idToPost) {
        const saved = await saveDraftInternal({ silent: true });
        idToPost = saved?.id ?? saved?.check_id ?? saved?.checkId ?? null;
      }

      if (!idToPost) {
        throw new Error("Cannot post: draft was not created. Please click Save draft and try again.");
      }

      const res = await fetchWithSlashFallback(`${API_BASE}/inventory-checks/${idToPost}/post`, {
        method: "POST",
        headers: authHeaders,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to post inventory check. Status: ${res.status}`);
      }

      const data = await res.json();
      const checkId = data?.id ?? idToPost;

      setCurrentCheckId(checkId);
      setCurrentCheckStatus(data.status || null);
      setMetaFromDetail(data);

      const rawLines = data.lines || data.check_lines || data.checkLines || [];
      setLines(collapseLinesToLatestPerItem(rawLines, { onlyPosted: false }));

      await reloadStock();
      await loadHistory(true);

      // ✅ refresh to pull posted lines + timeline using check_id (multi-day sessions)
      await refreshCurrentDate();

      setMessage("Posted. Stock is normalized. You can continue counting and post again anytime.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to post inventory check.");
      setMessage("");
    } finally {
      setPosting(false);
    }
  };

  // ---------- Session Open / Close (now aligned with your backend) ----------
  const handleOpenSession = async () => {
    setSessionBusy(true);
    setError("");
    setMessage("");

    try {
      // ✅ Your backend: POST /inventory-checks/open with {shop_id, notes?}
      const body = { shop_id: Number(shopId), notes: null };

      const res = await fetchWithSlashFallback(`${API_BASE}/inventory-checks/open`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to open session. Status: ${res.status}`);
      }

      await res.json().catch(() => ({})); // response is InventoryCheckOut
      setMessage("Session opened.");
      await refreshCurrentDate();
    } catch (e) {
      setError(e?.message || "Failed to open inventory session.");
    } finally {
      setSessionBusy(false);
    }
  };

  const handleCloseSession = async () => {
    setSessionBusy(true);
    setError("");
    setMessage("");

    try {
      // Need a check id to close. If missing, try to refresh first.
      if (!currentCheckId) {
        await refreshCurrentDate();
      }

      const cid = Number(currentCheckId || 0);
      if (!cid) {
        throw new Error("No active inventory check to close. Open a session first.");
      }

      // ✅ Your backend: POST /inventory-checks/{check_id}/close?auto_post=true|false
      const closeOnce = async (autoPost) => {
        const url = `${API_BASE}/inventory-checks/${cid}/close?auto_post=${autoPost ? "true" : "false"}`;
        const res = await fetchWithSlashFallback(url, {
          method: "POST",
          headers: authHeadersNoJson,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          const msg = errData?.detail || `Failed to close session. Status: ${res.status}`;
          const errorObj = new Error(msg);
          errorObj._status = res.status;
          throw errorObj;
        }
        return await res.json().catch(() => ({}));
      };

      try {
        await closeOnce(false);
      } catch (err) {
        // If backend says "you still have draft lines", optionally auto-post them
        const msg = String(err?.message || "");
        if (msg.toLowerCase().includes("draft lines")) {
          const ok = window.confirm(
            "You still have draft lines. Close with auto_post=true (this will post remaining draft lines and normalize stock) ?"
          );
          if (ok) {
            await closeOnce(true);
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      setMessage("Session closed.");
      await loadHistory(true);
      await refreshCurrentDate();
    } catch (e) {
      setError(e?.message || "Failed to close inventory session.");
    } finally {
      setSessionBusy(false);
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

  const canSaveDraft = lines.length > 0 && !savingDraft && !loadingCheck && !posting && !sessionBusy;
  const canPost = lines.length > 0 && !posting && !loadingCheck && !savingDraft && !sessionBusy;

  // summary meta
  const progressCounted = Number(checkMeta?.progress_counted_items ?? 0);
  const progressTotal = Number(checkMeta?.progress_total_items ?? 0);
  const progressPercentRaw = Number(checkMeta?.progress_percent ?? 0);
  const progressPercent =
    Number.isFinite(progressPercentRaw) ? Math.max(0, Math.min(1, progressPercentRaw)) : 0;

  const postedLinesCount = Number(checkMeta?.posted_lines_count ?? 0);
  const draftLinesCount = Number(checkMeta?.draft_lines_count ?? 0);

  const startedHM = checkMeta?.started_at ? formatCAT_HM_FromISO(checkMeta.started_at) : "";
  const sessionStatus = checkMeta?.session_status ? String(checkMeta.session_status).toUpperCase() : "";

  const statTile = {
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    background: "#ffffff",
    padding: "10px 12px",
    minHeight: "68px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 4,
  };

  const statLabel = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#6b7280",
    fontWeight: 800,
  };

  const statValue = (color = "#111827") => ({
    fontSize: "18px",
    fontWeight: 900,
    color,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
  });

  const showOpenBtn = !isSessionClosed(checkMeta) && !isSessionOpen(checkMeta);
  const showCloseBtn = !isSessionClosed(checkMeta) && isSessionOpen(checkMeta);

  return (
    <div style={{ width: "100%", maxWidth: "1500px", margin: "0 auto", boxSizing: "border-box" }}>
      {/* Header */}
      <div
        style={{
          paddingBottom: "10px",
          marginBottom: "10px",
          background:
            "linear-gradient(to bottom, #f3f4f6 0%, #f3f4f6 65%, rgba(243,244,246,0) 100%)",
          borderRadius: "18px",
        }}
      >
        <button
          onClick={() => navigate(`/shops/${shopId}`)}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            margin: "10px 0 6px",
            fontSize: "12px",
            color: "#2563eb",
            cursor: "pointer",
          }}
        >
          ← Back to shop workspace
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "0.03em", margin: 0 }}>
              Inventory check
            </h1>

            <div style={{ marginTop: "2px", fontSize: "13px", fontWeight: 600, color: "#2563eb" }}>
              {shopName}
            </div>

            <div style={{ marginTop: "8px", fontSize: "12px", color: "#6b7280", fontWeight: 800 }}>
              Status:{" "}
              <span style={{ color: "#111827" }}>
                {currentCheckStatus ? String(currentCheckStatus).toUpperCase() : "—"}
              </span>
              {currentCheckId ? ` • Check ID: ${currentCheckId}` : ""}
              {sessionStatus ? ` • Session: ${sessionStatus}` : ""}
              {startedHM ? ` • Started: ${toISODate(inventoryDate)} ${startedHM} CAT` : ""}
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

          {/* date picker (right side) */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: 2, flexWrap: "wrap" }}>
            <div style={{ fontSize: "13px", fontWeight: 800, color: "#111827" }}>Date</div>
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
            <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 800 }}>
              Time (CAT): <span style={{ color: "#111827" }}>{catNowHM}</span>
            </div>
            {loadingCheck && (
              <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 800 }}>Loading…</div>
            )}
          </div>
        </div>
      </div>

      {(error || message) && (
        <div
          style={{
            marginBottom: "10px",
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

      {/* ✅ Session buttons */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        {showOpenBtn && (
          <button
            type="button"
            onClick={handleOpenSession}
            disabled={sessionBusy || loadingCheck}
            style={{
              padding: "0.55rem 1.2rem",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              background: "#ffffff",
              fontWeight: 900,
              fontSize: "12px",
              cursor: sessionBusy || loadingCheck ? "not-allowed" : "pointer",
              opacity: sessionBusy || loadingCheck ? 0.6 : 1,
            }}
          >
            {sessionBusy ? "Opening…" : "Open session"}
          </button>
        )}

        {showCloseBtn && (
          <button
            type="button"
            onClick={handleCloseSession}
            disabled={sessionBusy || loadingCheck}
            style={{
              padding: "0.55rem 1.2rem",
              borderRadius: "999px",
              border: "1px solid #b91c1c",
              background: "#fef2f2",
              color: "#b91c1c",
              fontWeight: 900,
              fontSize: "12px",
              cursor: sessionBusy || loadingCheck ? "not-allowed" : "pointer",
              opacity: sessionBusy || loadingCheck ? 0.6 : 1,
            }}
          >
            {sessionBusy ? "Closing…" : "Close session"}
          </button>
        )}

        <button
          type="button"
          onClick={async () => {
            await reloadStock();
            await refreshCurrentDate();
          }}
          disabled={loadingCheck || sessionBusy}
          style={{
            padding: "0.55rem 1.2rem",
            borderRadius: "999px",
            border: "1px solid #d1d5db",
            background: "#ffffff",
            fontWeight: 900,
            fontSize: "12px",
            cursor: loadingCheck || sessionBusy ? "not-allowed" : "pointer",
            opacity: loadingCheck || sessionBusy ? 0.6 : 1,
          }}
        >
          Refresh
        </button>
      </div>

      {/* ✅ Inventory summary strip (ONLY requested boxes) */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
          padding: "12px 14px",
          marginBottom: "14px",
          border: "1px solid #eef2ff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: 900, color: "#111827" }}>Inventory summary</div>

          <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 800 }}>
            {timelineTotals.totalAdj} post(s) • {lines.length} item(s) • {timelineTotals.checks} check(s) • Draft items:{" "}
            {draftLinesCount} • Posted items: {postedLinesCount}
            {progressTotal > 0 ? ` • Progress: ${progressCounted}/${progressTotal}` : ""}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "10px",
            alignItems: "stretch",
          }}
        >
          <div style={statTile}>
            <div style={statLabel}>Draft table diff (pieces)</div>
            <div
              style={statValue(
                totalDiffPieces === 0 ? "#111827" : totalDiffPieces > 0 ? "#16a34a" : "#b91c1c"
              )}
            >
              {formatDiff(totalDiffPieces)}
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 700 }}>
              From current table (latest per item)
            </div>
          </div>

          <div style={statTile}>
            <div style={statLabel}>Amount before count (RWF)</div>
            <div style={statValue("#111827")}>{formatMoney(totalSystemValueBefore)}</div>
            <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 700 }}>
              System pieces × cost/piece
            </div>
          </div>

          <div style={statTile}>
            <div style={statLabel}>Amount after count (RWF)</div>
            <div style={statValue("#111827")}>{formatMoney(totalSystemValueAfter)}</div>
            <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 700 }}>
              Counted pieces × cost/piece
            </div>
          </div>

          <div style={statTile}>
            <div style={statLabel}>Total difference amount (RWF)</div>
            <div
              style={statValue(
                totalSystemValueDiff === 0 ? "#111827" : totalSystemValueDiff > 0 ? "#16a34a" : "#b91c1c"
              )}
            >
              {totalSystemValueDiff === 0
                ? "0"
                : `${totalSystemValueDiff > 0 ? "+" : ""}${formatMoney(totalSystemValueDiff)}`}
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 700 }}>
              Amount after − amount before
            </div>
          </div>
        </div>
      </div>

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
              <span>Pad: select item, enter counted pieces, then add to table</span>

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
                + Add to table
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
                        padDiff === null
                          ? "#111827"
                          : padDiff > 0
                          ? "#16a34a"
                          : padDiff < 0
                          ? "#b91c1c"
                          : "#111827",
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

          {/* TABLE */}
          {lines.length === 0 ? (
            <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
              No items added yet. Use the pad above and click <strong>+ Add to table</strong>.
            </div>
          ) : (
            <>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                {lines.length} item{lines.length === 1 ? "" : "s"} in this table (latest per item).
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

                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatQty(ln.systemPieces)}</div>
                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatMoney(ln.costPerPiece)}</div>
                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatQty(ln.countedPieces)}</div>

                      <div
                        style={{
                          textAlign: "right",
                          whiteSpace: "nowrap",
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
                          title="Remove from table"
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "14px" }}>
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

          {/* ✅ Posted items list */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: "14px", fontWeight: 900, color: "#111827" }}>
              Posted items (keep visible until inventory is closed)
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 4, fontWeight: 800 }}>
              Count time • Item • System • Counted • Difference • Diff before normalization • Cost/piece • Total difference cost
            </div>

            {postedRowsForTable.length === 0 ? (
              <div style={{ padding: "10px 4px 0", fontSize: "13px", color: "#6b7280" }}>
                No posted items for this date/session yet.
              </div>
            ) : (
              <div
                style={{
                  marginTop: 10,
                  borderRadius: "14px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  overflow: "hidden",
                  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
                }}
              >
                <div style={{ maxHeight: "360px", overflowY: "auto", overflowX: "auto", scrollbarGutter: "stable" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px minmax(220px, 2.2fr) 1fr 1fr 1fr 1.3fr 1fr 1.3fr",
                      minWidth: "1320px",
                      alignItems: "center",
                      padding: "8px 10px",
                      borderBottom: "1px solid #e5e7eb",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#6b7280",
                      fontWeight: 800,
                      backgroundColor: "#f9fafb",
                    }}
                  >
                    <div>Count time (CAT)</div>
                    <div>Item</div>
                    <div style={{ textAlign: "right" }}>System</div>
                    <div style={{ textAlign: "right" }}>Counted</div>
                    <div style={{ textAlign: "right" }}>Difference</div>
                    <div style={{ textAlign: "right" }}>Diff before norm</div>
                    <div style={{ textAlign: "right" }}>Cost/piece</div>
                    <div style={{ textAlign: "right" }}>Total diff cost</div>
                  </div>

                  {postedRowsForTable.map((ln) => (
                    <div
                      key={`posted-${ln.id}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px minmax(220px, 2.2fr) 1fr 1fr 1fr 1.3fr 1fr 1.3fr",
                        minWidth: "1320px",
                        alignItems: "center",
                        padding: "9px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: "13px",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#111827" }}>
                        {ln.postedTimeIso ? formatCAT_HM_FromISO(ln.postedTimeIso) : "—"}
                      </div>

                      <div style={{ fontWeight: 800, color: "#111827" }}>{ln.itemName}</div>

                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatQty(ln.systemPieces)}</div>
                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatQty(ln.countedPieces)}</div>

                      <div
                        style={{
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          color: ln.diffNow > 0 ? "#16a34a" : ln.diffNow < 0 ? "#b91c1c" : "#111827",
                          fontWeight: 800,
                        }}
                        title="Counted minus current system now"
                      >
                        {formatDiff(ln.diffNow)}
                      </div>

                      <div
                        style={{
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          color:
                            ln.diffBeforeNormalization > 0
                              ? "#16a34a"
                              : ln.diffBeforeNormalization < 0
                              ? "#b91c1c"
                              : "#111827",
                          fontWeight: 800,
                        }}
                        title="Difference at the time you posted (before normalization)"
                      >
                        {formatDiff(ln.diffBeforeNormalization)}
                      </div>

                      <div style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>
                        {formatMoney(ln.costPerPiece)}
                      </div>

                      <div
                        style={{
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          fontWeight: 900,
                          color:
                            ln.totalDiffCost > 0 ? "#16a34a" : ln.totalDiffCost < 0 ? "#b91c1c" : "#111827",
                        }}
                      >
                        {ln.totalDiffCost === 0 ? "0" : `${ln.totalDiffCost > 0 ? "+" : ""}${formatMoney(ln.totalDiffCost)}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            One row per date. Click a date to open it.
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
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{g.total_items}</div>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatQty(g.total_system_pieces)}</div>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatQty(g.total_counted_pieces)}</div>
                    <div
                      style={{
                        textAlign: "right",
                        whiteSpace: "nowrap",
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
