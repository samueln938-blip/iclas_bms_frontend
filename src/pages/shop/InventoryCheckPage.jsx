// FILE: src/pages/shop/InventoryCheckPage.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

function formatCAT_YMD_HM_FromISO(isoLike) {
  if (!isoLike) return "";
  const d = new Date(isoLike);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: CAT_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const hm = formatCAT_HM(d);
    return `${ymd} ${hm}`;
  } catch {
    return `${_fmtPartsYMD(d)} ${formatCAT_HM(d)}`;
  }
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
                <div style={{ fontWeight: 600, textAlign: "left" }}>{it.label}</div>
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

  // timeline for the selected date / session
  const [timelineRows, setTimelineRows] = useState([]);

  // pad state
  const [pad, setPad] = useState({
    itemId: "",
    countedPieces: "",
  });

  // lines to post (LOCAL list only)
  const [lines, setLines] = useState([]);

  // ✅ posted lines from backend + sticky cache
  const [postedLines, setPostedLines] = useState([]);
  const [postedLinesSticky, setPostedLinesSticky] = useState([]);
  const stickyKeyRef = useRef(null);

  // history list
  const [historyChecks, setHistoryChecks] = useState([]);
  const historyLoadedAtRef = useRef(0);
  const historyAbortRef = useRef(null);

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
      0;

    const countedPiecesRaw =
      ln?.counted_pieces ??
      ln?.countedPieces ??
      ln?.counted_qty ??
      ln?.countedQty ??
      ln?.counted_quantity ??
      ln?.countedQuantity ??
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
    const diffPieces =
      diffRaw === null || diffRaw === undefined ? countedPieces - systemPieces : Number(diffRaw || 0);

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

    if (s.is_posted === true || s.posted === true) return true;
    if (statusStr === "POSTED") return true;
    if (s.posted_at || s.postedAt) return true;

    if (s.adjustment_movement_id || s.adjustmentMovementId) return true;
    if (s.movement_id || s.movementId) return true;
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

    const src = (postedLines && postedLines.length ? postedLines : postedLinesSticky) || [];
    for (const ln of src) {
      const itemId = Number(ln.itemId);
      if (!Number.isFinite(itemId) || itemId <= 0) continue;
      if (ln.postedAt) {
        const prev = map.get(itemId);
        if (!prev || String(ln.postedAt) > String(prev)) map.set(itemId, ln.postedAt);
      }
    }

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
  // ❌ REMOVED "Difference now" (diffNow). We keep only the posted diff at the time of posting.
  const postedRowsForTable = useMemo(() => {
    const sourceLines =
      (postedLines && postedLines.length > 0 ? postedLines : postedLinesSticky) || [];

    const arr = sourceLines.map((ln) => {
      const itemId = Number(ln.itemId);
      const timeIso = postedTimeByItemId.get(itemId) || ln.postedAt || null;

      const diffBefore = Number(ln.diffPieces || 0);
      const cost = Number(ln.costPerPiece || 0);
      const totalDiffCost = diffBefore * cost;

      // live stock now (useful to confirm normalization)
      const nowSystem = Number(stockByItemId[itemId]?.remaining_pieces || 0);

      return {
        ...ln,
        postedTimeIso: timeIso,
        diffBeforeNormalization: diffBefore,
        systemPiecesNow: nowSystem,
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

  // (Preview only — before posting)
  const padPreviewDiff = padCountedPieces === null ? null : padCountedPieces - padSystemPieces;

  // =========================================================
  // ✅ Summary includes:
  // - posted rows (session history)
  // - current local "to post" table (lines)
  // Draft API is removed; table is local until you click Post.
  // =========================================================
  const summaryLatestRows = useMemo(() => {
    const byItem = new Map();

    for (const p of postedRowsForTable || []) {
      const itemId = Number(p.itemId);
      if (!Number.isFinite(itemId) || itemId <= 0) continue;

      const systemPieces = Number(p.systemPieces || 0);
      const countedPieces = Number(p.countedPieces || 0);
      const costPerPiece = Number(p.costPerPiece || 0);

      const diffPieces = Number.isFinite(Number(p.diffBeforeNormalization))
        ? Number(p.diffBeforeNormalization)
        : countedPieces - systemPieces;

      byItem.set(itemId, {
        itemId,
        systemPieces,
        countedPieces,
        diffPieces,
        costPerPiece,
      });
    }

    // overlay local lines (what you are about to post)
    for (const d of lines || []) {
      const itemId = Number(d.itemId);
      if (!Number.isFinite(itemId) || itemId <= 0) continue;

      byItem.set(itemId, {
        itemId,
        systemPieces: Number(d.systemPieces || 0),
        countedPieces: Number(d.countedPieces || 0),
        diffPieces: Number(d.diffPieces || 0),
        costPerPiece: Number(d.costPerPiece || 0),
      });
    }

    return Array.from(byItem.values());
  }, [postedRowsForTable, lines]);

  const totalSystemValueBefore = useMemo(
    () =>
      summaryLatestRows.reduce(
        (sum, r) => sum + Number(r.costPerPiece || 0) * Number(r.systemPieces || 0),
        0
      ),
    [summaryLatestRows]
  );

  const totalSystemValueAfter = useMemo(
    () =>
      summaryLatestRows.reduce(
        (sum, r) => sum + Number(r.costPerPiece || 0) * Number(r.countedPieces || 0),
        0
      ),
    [summaryLatestRows]
  );

  const totalSystemValueDiff = totalSystemValueAfter - totalSystemValueBefore;

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

  const reloadStock = useCallback(async () => {
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
  }, [shopId, authHeadersNoJson]);

  // ✅ Live stock polling: while session OPEN + Enter tab
  useEffect(() => {
    if (activeTab !== "enter") return;
    if (loading) return;

    const open = isSessionOpen(checkMeta) && !isSessionClosed(checkMeta);
    if (!open) return;

    const t = setInterval(() => {
      reloadStock();
    }, 10_000);

    return () => clearInterval(t);
  }, [activeTab, loading, checkMeta, reloadStock]);

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

    if (freshPosted.length > 0) {
      setPostedLinesSticky(freshPosted);
      try {
        localStorage.setItem(k, JSON.stringify(freshPosted));
      } catch {}
    }
  };

  const forDateUrl = (dateISO, includePostedLines) => {
    const d = toISODate(dateISO);
    const inc = includePostedLines ? "true" : "false";
    return `${API_BASE}/inventory-checks/for-date?shop_id=${shopId}&check_date=${encodeURIComponent(
      d
    )}&include_posted_lines=${inc}`;
  };

  // ✅ Fast loader (NO draft table from backend anymore)
  // We fetch include_posted_lines=true once, extract posted lines.
  const loadCheckForDateSingle = async (isoDate, seq) => {
    const dateISO = toISODate(isoDate);
    if (!dateISO) {
      setCurrentCheckId(null);
      setCurrentCheckStatus(null);
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

    const urlAll = forDateUrl(dateISO, true);
    const resAll = await fetchWithSlashFallback(urlAll, {
      headers: authHeadersNoJson,
      signal: controller.signal,
    });

    if (resAll.status === 404) return { fallbackNeeded: true, checkId: null };

    if (!resAll.ok) {
      const errData = await resAll.json().catch(() => null);
      throw new Error(errData?.detail || `Failed to load inventory check. Status: ${resAll.status}`);
    }

    const allDetail = await resAll.json().catch(() => null);
    if (seq !== checkSeqRef.current) return { fallbackNeeded: false, checkId: null };

    if (!allDetail) return { fallbackNeeded: false, checkId: null };

    const checkId = allDetail.id ?? allDetail.check_id ?? allDetail.checkId ?? null;

    setCurrentCheckId(checkId);
    setCurrentCheckStatus(allDetail.status ?? allDetail.check_status ?? allDetail.checkStatus ?? null);
    setMetaFromDetail(allDetail);

    if (checkId) ensureStickyKey(checkId);

    const allLines = allDetail.lines || allDetail.check_lines || allDetail.checkLines || [];
    const freshPosted = collapseLinesToLatestPerItem(allLines, { onlyPosted: true });
    setPostedLines(freshPosted);
    if (checkId) updateSticky(checkId, allDetail, freshPosted);

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

    const detailResAll = await fetchWithSlashFallback(
      `${API_BASE}/inventory-checks/${match.id}?include_posted_lines=true`,
      {
        headers: authHeadersNoJson,
        signal: controller.signal,
      }
    );
    if (!detailResAll.ok) {
      throw new Error(`Failed to load inventory check details. Status: ${detailResAll.status}`);
    }

    const allDetail = await detailResAll.json();
    if (seq !== checkSeqRef.current) return { fallbackNeeded: false, checkId: null };

    const checkId = allDetail?.id ?? match.id ?? null;

    setCurrentCheckId(checkId);
    setCurrentCheckStatus(allDetail?.status || match.status || null);
    setMetaFromDetail(allDetail);

    if (checkId) ensureStickyKey(checkId);

    const allLines = allDetail.lines || allDetail.check_lines || allDetail.checkLines || [];
    const freshPosted = collapseLinesToLatestPerItem(allLines, { onlyPosted: true });

    setPostedLines(freshPosted);
    if (checkId) updateSticky(checkId, allDetail, freshPosted);

    return { fallbackNeeded: false, checkId };
  };

  const refreshCurrentDate = async () => {
    const seq = ++checkSeqRef.current;
    setLoadingCheck(true);
    try {
      const iso = toISODate(inventoryDate);

      const fast = await loadCheckForDateSingle(iso, seq);
      if (seq !== checkSeqRef.current) return;

      let resolvedCheckId = fast?.checkId ?? null;

      if (fast?.fallbackNeeded) {
        const legacy = await loadCheckForDateLegacy(iso, seq);
        resolvedCheckId = legacy?.checkId ?? resolvedCheckId ?? null;
      }

      if (seq !== checkSeqRef.current) return;

      await loadTimeline({ isoDate: iso, checkId: resolvedCheckId });
      await reloadStock();
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
        const fast = await loadCheckForDateSingle(iso, seq);
        if (seq !== checkSeqRef.current) return;

        let resolvedCheckId = fast?.checkId ?? null;

        if (fast?.fallbackNeeded) {
          const legacy = await loadCheckForDateLegacy(iso, seq);
          resolvedCheckId = legacy?.checkId ?? resolvedCheckId ?? null;
        }

        if (seq !== checkSeqRef.current) return;

        await loadTimeline({ isoDate: iso, checkId: resolvedCheckId });
        await reloadStock();
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

  const disableEditing = loadingCheck || posting || sessionBusy;

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

    const liveSystem = Number(s.remaining_pieces || 0);
    const costPerPiece = getCostPerPiece(itemId);

    setLines((prev) => {
      const existingIndex = prev.findIndex((ln) => Number(ln.itemId) === itemId);

      // ✅ lock baseline (systemPieces) once the line exists
      const lockedSystem =
        existingIndex >= 0 && Number.isFinite(Number(prev[existingIndex]?.systemPieces))
          ? Number(prev[existingIndex]?.systemPieces)
          : liveSystem;

      const diff = counted - lockedSystem;

      const base = {
        id: prev[existingIndex]?.id ?? `local-${Date.now()}-${Math.random()}`,
        itemId,
        itemName: s.item_name || `Item ${itemId}`,
        systemPieces: lockedSystem,
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

  // ---------- Post only (NO save draft) ----------
  const handlePostInventory = async () => {
    if (!lines.length) return;
    if (loadingCheck) return;

    setPosting(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        shop_id: Number(shopId),
        check_date: toISODate(inventoryDate),
        notes: null,
        lines: lines.map((ln) => ({
          item_id: ln.itemId,
          counted_pieces: ln.countedPieces,
        })),
      };

      const res = await fetchWithSlashFallback(`${API_BASE}/inventory-checks/post-with-lines`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to post inventory check. Status: ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      const checkId = data?.id ?? data?.check_id ?? data?.checkId ?? null;

      if (checkId) {
        setCurrentCheckId(checkId);
        ensureStickyKey(checkId);
      }

      setCurrentCheckStatus(data?.status || "IN_PROGRESS");
      setMetaFromDetail(data);

      // ✅ clear local list instantly (so you continue fast)
      setLines([]);
      resetPad();

      // ✅ refresh posted table + stock quickly (single fetch for-date + stock)
      historyLoadedAtRef.current = 0; // history will refresh when you open History tab
      await refreshCurrentDate();

      setMessage("Posted. Stock is normalized. Continue counting and post again anytime.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to post inventory check.");
      setMessage("");
    } finally {
      setPosting(false);
    }
  };

  // ---------- Session Open / Close ----------
  const handleOpenSession = async () => {
    setSessionBusy(true);
    setError("");
    setMessage("");

    try {
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

      await res.json().catch(() => ({}));
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
      if (!currentCheckId) {
        await refreshCurrentDate();
      }

      const cid = Number(currentCheckId || 0);
      if (!cid) {
        throw new Error("No active inventory check to close. Open a session first.");
      }

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
        const msg = String(err?.message || "");
        if (msg.toLowerCase().includes("draft lines")) {
          const ok = window.confirm(
            "Backend reports draft lines exist. Close with auto_post=true (this posts remaining draft lines) ?"
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
      await refreshCurrentDate();
    } catch (e) {
      setError(e?.message || "Failed to close inventory session.");
    } finally {
      setSessionBusy(false);
    }
  };

  // ---------- History tab helpers ----------
  const groupedHistory = useMemo(() => {
    const arr = Array.isArray(historyChecks) ? historyChecks : [];
    // Keep it simple: show each session row (multi-day) as-is (not grouped by date).
    // If your backend returns many rows per day, you can re-group later.
    return arr.slice().sort((a, b) => {
      const sa = String(a.started_at || a.created_at || "");
      const sb = String(b.started_at || b.created_at || "");
      return sb.localeCompare(sa);
    });
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

  const canPost = lines.length > 0 && !posting && !loadingCheck && !sessionBusy;

  const progressCounted = Number(checkMeta?.progress_counted_items ?? 0);
  const progressTotal = Number(checkMeta?.progress_total_items ?? 0);

  const postedLinesCount = Number(checkMeta?.posted_lines_count ?? 0);

  const sessionStatus = checkMeta?.session_status ? String(checkMeta.session_status).toUpperCase() : "";
  const startedAtLabel = checkMeta?.started_at ? formatCAT_YMD_HM_FromISO(checkMeta.started_at) : "";
  const closedAtLabel = checkMeta?.closed_at ? formatCAT_YMD_HM_FromISO(checkMeta.closed_at) : "";

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
                textAlign: "left",
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

            <div style={{ marginTop: "8px", fontSize: "12px", color: "#6b7280", fontWeight: 800 }}>
              Status:{" "}
              <span style={{ color: "#111827" }}>
                {currentCheckStatus ? String(currentCheckStatus).toUpperCase() : "—"}
              </span>
              {currentCheckId ? ` • Check ID: ${currentCheckId}` : ""}
              {sessionStatus ? ` • Session: ${sessionStatus}` : ""}
              {startedAtLabel ? ` • Started: ${startedAtLabel} CAT` : ""}
              {closedAtLabel ? ` • Closed: ${closedAtLabel} CAT` : ""}
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
                History
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

      {/* ✅ Inventory summary strip */}
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
            {timelineTotals.totalAdj} post(s) • {summaryLatestRows.length} item(s) • Posted items: {postedLinesCount}
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
                  System pieces (live):{" "}
                  <strong style={{ color: "#111827" }}>{pad.itemId ? formatQty(padSystemPieces) : "—"}</strong>
                </div>
                <div>
                  Counted pieces:{" "}
                  <strong style={{ color: "#111827" }}>
                    {padCountedPieces === null ? "—" : formatQty(padCountedPieces)}
                  </strong>
                </div>
                <div>
                  Diff (preview):{" "}
                  <strong
                    style={{
                      color:
                        padPreviewDiff === null
                          ? "#111827"
                          : padPreviewDiff > 0
                          ? "#16a34a"
                          : padPreviewDiff < 0
                          ? "#b91c1c"
                          : "#111827",
                    }}
                  >
                    {padPreviewDiff === null ? "—" : formatDiff(padPreviewDiff)}
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
                  System pieces (live)
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
                  Diff (preview)
                </label>
                <input
                  type="text"
                  readOnly
                  value={padPreviewDiff === null ? "" : formatDiff(padPreviewDiff)}
                  style={{ ...inputBase, backgroundColor: "#f3f4f6", fontWeight: 600 }}
                />
              </div>
            </div>
          </div>

          {/* TABLE (local items to post) */}
          {lines.length === 0 ? (
            <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
              No items added yet. Use the pad above and click <strong>+ Add to table</strong>.
            </div>
          ) : (
            <>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                {lines.length} item{lines.length === 1 ? "" : "s"} ready to post (latest per item).
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
                      minWidth: "1020px",
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
                    <div style={{ textAlign: "left" }}>Item</div>
                    <div style={{ textAlign: "right" }}>System (locked)</div>
                    <div style={{ textAlign: "right" }}>Cost / piece</div>
                    <div style={{ textAlign: "right" }}>Counted</div>
                    <div style={{ textAlign: "right" }}>Diff (locked)</div>
                    <div />
                  </div>

                  {lines.map((ln) => (
                    <div
                      key={ln.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(220px, 2.5fr) 1fr 1fr 1fr 1fr 60px",
                        minWidth: "1020px",
                        alignItems: "center",
                        padding: "9px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: "13px",
                      }}
                    >
                      <div style={{ textAlign: "left" }}>
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

                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }} title="Locked snapshot at time you added/updated this line">
                        {formatQty(ln.systemPieces)}
                      </div>

                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatMoney(ln.costPerPiece)}</div>
                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatQty(ln.countedPieces)}</div>

                      <div
                        style={{
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          color: ln.diffPieces > 0 ? "#16a34a" : ln.diffPieces < 0 ? "#b91c1c" : "#111827",
                          fontWeight: 600,
                        }}
                        title="Locked difference vs locked system snapshot"
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

          {/* Actions (POST ONLY) */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "14px" }}>
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
                fontWeight: 900,
                fontSize: "0.95rem",
                cursor: !canPost ? "not-allowed" : "pointer",
                opacity: !canPost ? 0.85 : 1,
              }}
            >
              {posting ? "Posting…" : "Post inventory items"}
            </button>
          </div>

          {/* ✅ Posted items list (DATE + TIME, NO 'Difference now') */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: "14px", fontWeight: 900, color: "#111827" }}>
              Posted items (kept visible until inventory is closed)
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 4, fontWeight: 800 }}>
              Count date &amp; time • Item • System (locked) • Live stock now • Counted • Diff at post time • Cost/piece • Total diff cost
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
                      gridTemplateColumns:
                        "170px minmax(220px, 2.2fr) 1fr 1fr 1fr 1.3fr 1fr 1.3fr",
                      minWidth: "1400px",
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
                    <div>Count date/time (CAT)</div>
                    <div style={{ textAlign: "left" }}>Item</div>
                    <div style={{ textAlign: "right" }}>System (locked)</div>
                    <div style={{ textAlign: "right" }}>Live stock now</div>
                    <div style={{ textAlign: "right" }}>Counted</div>
                    <div style={{ textAlign: "right" }}>Diff at post time</div>
                    <div style={{ textAlign: "right" }}>Cost/piece</div>
                    <div style={{ textAlign: "right" }}>Total diff cost</div>
                  </div>

                  {postedRowsForTable.map((ln) => (
                    <div
                      key={`posted-${ln.id}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "170px minmax(220px, 2.2fr) 1fr 1fr 1fr 1.3fr 1fr 1.3fr",
                        minWidth: "1400px",
                        alignItems: "center",
                        padding: "9px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: "13px",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#111827" }}>
                        {ln.postedTimeIso ? formatCAT_YMD_HM_FromISO(ln.postedTimeIso) : "—"}
                      </div>

                      <div style={{ fontWeight: 800, color: "#111827", textAlign: "left" }}>{ln.itemName}</div>

                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }} title="Locked snapshot at post time">
                        {formatQty(ln.systemPieces)}
                      </div>

                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }} title="Live stock now">
                        {formatQty(ln.systemPiecesNow)}
                      </div>

                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatQty(ln.countedPieces)}</div>

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
                          fontWeight: 900,
                        }}
                        title="Difference at the time you posted"
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

      {/* ================= TAB: History ================= */}
      {activeTab === "history" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
            padding: "16px 18px 18px",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>Inventory sessions</h2>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 4 }}>
            Each row is a session (multi-day supported). Click the date to open.
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
                    gridTemplateColumns: "160px 200px 200px 120px 120px",
                    minWidth: "900px",
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
                  <div>Started (CAT)</div>
                  <div>Closed (CAT)</div>
                  <div style={{ textAlign: "right" }}>Items</div>
                  <div style={{ textAlign: "right" }}>Status</div>
                </div>

                {groupedHistory.map((c) => {
                  const dateISO = toISODate(c.check_date);
                  const started = c.started_at ? formatCAT_YMD_HM_FromISO(c.started_at) : "";
                  const closed = c.closed_at ? formatCAT_YMD_HM_FromISO(c.closed_at) : "";
                  const sess = String(c.session_status || "").toUpperCase();
                  const items = Number(c.total_items || 0);

                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "160px 200px 200px 120px 120px",
                        minWidth: "900px",
                        alignItems: "center",
                        padding: "9px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: "13px",
                      }}
                    >
                      <div>
                        <button
                          type="button"
                          onClick={() => openHistoryCheck(dateISO)}
                          style={{
                            padding: 0,
                            margin: 0,
                            border: "none",
                            background: "transparent",
                            color: "#2563eb",
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          {dateISO || "—"}
                        </button>
                      </div>

                      <div style={{ fontWeight: 800, color: "#111827" }}>{started || "—"}</div>
                      <div style={{ fontWeight: 800, color: "#111827" }}>{closed || "—"}</div>
                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{items}</div>
                      <div style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 900 }}>
                        {sess || (c.status ? String(c.status).toUpperCase() : "—")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
