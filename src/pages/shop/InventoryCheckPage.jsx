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

function formatCAT_YMD_FromISO(isoLike) {
  if (!isoLike) return "";
  const d = new Date(isoLike);
  if (!Number.isFinite(d.getTime())) return "";
  return _fmtPartsYMD(d);
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
  if (Number.isFinite(n)) {
    return n.toLocaleString("en-RW", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  // backend sometimes returns Decimal as string
  const asNum = Number(String(value));
  if (Number.isFinite(asNum)) {
    return asNum.toLocaleString("en-RW", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return String(value);
}

// =====================================================
// ✅ IMPORTANT FIX: trailing-slash redirect CORS fallback
// Some deployments redirect /path -> /path/ (307) or vice-versa.
// Redirect responses may miss CORS headers => browser blocks.
// We retry the alternate URL once IF fetch throws.
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

  // ✅ date-level loading (prevents “old day shows for seconds”)
  const [loadingCheck, setLoadingCheck] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [inventoryDate, setInventoryDate] = useState(() => todayISO());

  // current check loaded for selected date
  const [checkMeta, setCheckMeta] = useState({
    id: null,
    status: null, // "DRAFT" | "IN_PROGRESS" | "POSTED" | ...
    session_status: null, // "OPEN" | "CLOSED" | null
    started_at: null,
    closed_at: null,
    progress_total_items: null,
    progress_counted_items: null,
    progress_percent: null,
    posted_lines_count: null,
    draft_lines_count: null,
    shrink_value: null,
    gain_value: null,
    net_value: null,
    created_at: null,
    updated_at: null,
  });

  const currentCheckId = checkMeta.id;
  const currentCheckStatus = checkMeta.status;
  const sessionStatus = checkMeta.session_status;

  // timeline for the selected date (from stock movements)
  const [timelineRows, setTimelineRows] = useState([]);

  // pad state
  const [pad, setPad] = useState({
    itemId: "",
    countedPieces: "",
  });

  // ✅ DRAFT lines (editable table)
  const [draftLines, setDraftLines] = useState([]);

  // ✅ POSTED lines (read-only table below pad)
  const [postedLines, setPostedLines] = useState([]);

  // ✅ draft dirtiness controls Save/Post buttons
  const [draftDirty, setDraftDirty] = useState(false);

  // history list
  const [historyChecks, setHistoryChecks] = useState([]);
  const historyLoadedAtRef = useRef(0);
  const historyAbortRef = useRef(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);
  const [togglingSession, setTogglingSession] = useState(false);

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

  // ✅ normalize backend lines into UI shape
  const normalizeLinesFromDetail = (rawLines) => {
    const arr = Array.isArray(rawLines) ? rawLines : [];
    const out = [];

    for (const ln of arr) {
      const itemId = Number(ln?.item_id);
      if (!Number.isFinite(itemId) || itemId <= 0) continue;

      const costPerPiece = getCostPerPiece(itemId);

      out.push({
        id: ln?.id,
        itemId,
        itemName: ln?.item_name || `Item ${itemId}`,
        systemPieces: Number(ln?.system_pieces || 0),
        countedPieces: Number(ln?.counted_pieces || 0),
        diffPieces: Number(ln?.diff_pieces || 0),
        costPerPiece,
        isPosted: Boolean(ln?.is_posted),
        differenceDirection: ln?.difference_direction || null,
      });
    }

    return out;
  };

  // ✅ collapse DRAFT lines to ONE row per item (latest line id wins)
  const collapseToLatestPerItem = (rawLines) => {
    const arr = Array.isArray(rawLines) ? rawLines : [];
    const byItem = new Map();

    for (const ln of arr) {
      const itemId = Number(ln?.itemId);
      if (!Number.isFinite(itemId) || itemId <= 0) continue;

      const id = Number(ln?.id);
      const prev = byItem.get(itemId);

      if (!prev || (Number.isFinite(id) && Number.isFinite(prev._lineId) ? id > prev._lineId : true)) {
        byItem.set(itemId, {
          _lineId: Number.isFinite(id) ? id : -1,
          ...ln,
        });
      }
    }

    const out = Array.from(byItem.values()).map(({ _lineId, ...rest }) => rest);
    out.sort((a, b) => String(a.itemName || "").localeCompare(String(b.itemName || "")));
    return out;
  };

  // pad-derived
  const padStock = pad.itemId ? stockByItemId[Number(pad.itemId)] : null;
  const padSystemPieces = padStock ? Number(padStock.remaining_pieces || 0) : 0;

  const padCountedPieces = pad.countedPieces === "" ? null : Number(pad.countedPieces || 0);

  const padCountedIsValid =
    padCountedPieces !== null && Number.isFinite(padCountedPieces) && padCountedPieces >= 0;

  const padDiff = padCountedPieces === null ? null : padCountedPieces - padSystemPieces;

  // ✅ Summary for DRAFT table only (editable)
  const totalDraftDiffPieces = useMemo(
    () => draftLines.reduce((sum, ln) => sum + Number(ln.diffPieces || 0), 0),
    [draftLines]
  );

  const totalDraftValueBefore = useMemo(
    () =>
      draftLines.reduce(
        (sum, ln) => sum + Number(ln.costPerPiece || 0) * Number(ln.systemPieces || 0),
        0
      ),
    [draftLines]
  );

  const totalDraftValueAfter = useMemo(
    () =>
      draftLines.reduce(
        (sum, ln) => sum + Number(ln.costPerPiece || 0) * Number(ln.countedPieces || 0),
        0
      ),
    [draftLines]
  );

  const totalDraftValueDiff = totalDraftValueAfter - totalDraftValueBefore;

  // timeline totals for the whole day (sum of adjustments that were posted)
  const timelineTotals = useMemo(() => {
    const rows = Array.isArray(timelineRows) ? timelineRows : [];
    const totalAdj = rows.length;
    const pieces = rows.reduce((s, r) => s + Number(r.pieces_change || 0), 0);
    const value = rows.reduce((s, r) => s + Number(r.value_change || 0), 0);
    const checks = new Set(rows.map((r) => String(r.check_id))).size;
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

  // ✅ refresh stock (important after POST, because remaining_pieces changed)
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

  // load history list for the shop
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
      const res = await fetchWithSlashFallback(`${API_BASE}/inventory-checks/summary?shop_id=${shopId}`, {
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

  // load adjustment timeline (posted movements) for a date
  const loadTimeline = async (isoDate) => {
    const dateISO = toISODate(isoDate);
    if (!dateISO) {
      setTimelineRows([]);
      return [];
    }
    try {
      const res = await fetchWithSlashFallback(
        `${API_BASE}/inventory-checks/timeline?shop_id=${shopId}&check_date=${encodeURIComponent(dateISO)}`,
        { headers: authHeadersNoJson }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to load timeline. Status: ${res.status}`);
      }
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      setTimelineRows(list);
      return list;
    } catch (err) {
      console.error(err);
      setTimelineRows([]);
      return [];
    }
  };

  const applyDetailToState = (detail) => {
    const normalized = normalizeLinesFromDetail(detail?.lines || []);

    const posted = normalized
      .filter((x) => x.isPosted)
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

    const draft = normalized.filter((x) => !x.isPosted);

    setCheckMeta({
      id: detail?.id ?? null,
      status: detail?.status ?? null,
      session_status: detail?.session_status ?? null,
      started_at: detail?.started_at ?? null,
      closed_at: detail?.closed_at ?? null,
      progress_total_items: detail?.progress_total_items ?? null,
      progress_counted_items: detail?.progress_counted_items ?? null,
      progress_percent: detail?.progress_percent ?? null,
      posted_lines_count: detail?.posted_lines_count ?? null,
      draft_lines_count: detail?.draft_lines_count ?? null,
      shrink_value: detail?.shrink_value ?? null,
      gain_value: detail?.gain_value ?? null,
      net_value: detail?.net_value ?? null,
      created_at: detail?.created_at ?? null,
      updated_at: detail?.updated_at ?? null,
    });

    setPostedLines(posted);

    // Editable table should only be DRAFT (not posted)
    setDraftLines(collapseToLatestPerItem(draft));

    // When we load from server, it is the baseline => not dirty
    setDraftDirty(false);
  };

  // ✅ Load check for date (preferred) with posted lines included
  const loadCheckForDateFast = async (isoDate, seq) => {
    const dateISO = toISODate(isoDate);
    if (!dateISO) {
      setCheckMeta({
        id: null,
        status: null,
        session_status: null,
        started_at: null,
        closed_at: null,
        progress_total_items: null,
        progress_counted_items: null,
        progress_percent: null,
        posted_lines_count: null,
        draft_lines_count: null,
        shrink_value: null,
        gain_value: null,
        net_value: null,
        created_at: null,
        updated_at: null,
      });
      setDraftLines([]);
      setPostedLines([]);
      setDraftDirty(false);
      return;
    }

    if (checkAbortRef.current) {
      try {
        checkAbortRef.current.abort();
      } catch {}
    }
    const controller = new AbortController();
    checkAbortRef.current = controller;

    const url =
      `${API_BASE}/inventory-checks/for-date?shop_id=${shopId}` +
      `&check_date=${encodeURIComponent(dateISO)}` +
      `&include_posted_lines=true`;

    const res = await fetchWithSlashFallback(url, {
      headers: authHeadersNoJson,
      signal: controller.signal,
    });

    if (res.status === 404) {
      return { fallbackNeeded: true };
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.detail || `Failed to load inventory check. Status: ${res.status}`);
    }

    const detail = await res.json().catch(() => null);

    if (seq !== checkSeqRef.current) return { fallbackNeeded: false };

    if (!detail) {
      setCheckMeta({
        id: null,
        status: null,
        session_status: null,
        started_at: null,
        closed_at: null,
        progress_total_items: null,
        progress_counted_items: null,
        progress_percent: null,
        posted_lines_count: null,
        draft_lines_count: null,
        shrink_value: null,
        gain_value: null,
        net_value: null,
        created_at: null,
        updated_at: null,
      });
      setDraftLines([]);
      setPostedLines([]);
      setDraftDirty(false);
      return { fallbackNeeded: false };
    }

    applyDetailToState(detail);
    return { fallbackNeeded: false };
  };

  // Legacy fallback: find check in summary then load detail by id
  const loadCheckForDateLegacy = async (isoDate, seq) => {
    const dateISO = toISODate(isoDate);
    const list = await loadHistory(true);
    if (seq !== checkSeqRef.current) return;

    const sameDateChecks = (list || []).filter((c) => toISODate(c.check_date) === dateISO);

    if (!sameDateChecks.length) {
      setCheckMeta({
        id: null,
        status: null,
        session_status: null,
        started_at: null,
        closed_at: null,
        progress_total_items: null,
        progress_counted_items: null,
        progress_percent: null,
        posted_lines_count: null,
        draft_lines_count: null,
        shrink_value: null,
        gain_value: null,
        net_value: null,
        created_at: null,
        updated_at: null,
      });
      setDraftLines([]);
      setPostedLines([]);
      setDraftDirty(false);
      return;
    }

    const match = sameDateChecks[sameDateChecks.length - 1];

    if (checkAbortRef.current) {
      try {
        checkAbortRef.current.abort();
      } catch {}
    }
    const controller = new AbortController();
    checkAbortRef.current = controller;

    const detailRes = await fetchWithSlashFallback(
      `${API_BASE}/inventory-checks/${match.id}?include_posted_lines=true`,
      {
        headers: authHeadersNoJson,
        signal: controller.signal,
      }
    );
    if (!detailRes.ok) {
      throw new Error(`Failed to load inventory check details. Status: ${detailRes.status}`);
    }

    const detail = await detailRes.json().catch(() => null);
    if (seq !== checkSeqRef.current) return;

    if (!detail) return;

    applyDetailToState(detail);
  };

  // reload current check detail (after save/post/open/close)
  const reloadCurrentDetail = async (opts = {}) => {
    const seq = ++checkSeqRef.current;
    const iso = toISODate(inventoryDate);
    setLoadingCheck(true);
    try {
      if (opts.reloadTimeline) await loadTimeline(iso);

      // Always prefer for-date
      const fast = await loadCheckForDateFast(iso, seq);
      if (seq !== checkSeqRef.current) return;

      if (fast?.fallbackNeeded) {
        await loadCheckForDateLegacy(iso, seq);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to refresh inventory check.");
    } finally {
      if (seq === checkSeqRef.current) setLoadingCheck(false);
    }
  };

  // when date changes
  useEffect(() => {
    if (loading) return;

    setError("");
    setMessage("");
    setDraftLines([]);
    setPostedLines([]);
    setDraftDirty(false);
    setTimelineRows([]);
    setPad({ itemId: "", countedPieces: "" });

    const seq = ++checkSeqRef.current;
    const iso = toISODate(inventoryDate);

    (async () => {
      setLoadingCheck(true);
      try {
        await loadTimeline(iso);
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryDate, loading]);

  // ---------- Pad + draft list logic ----------
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

  // ✅ DO NOT lock editing after posting; only block during active request
  const disableEditing = loadingCheck || posting || savingDraft || togglingSession;

  const canAddToDraft = !disableEditing && !!Number(pad.itemId || 0) && padStock && padCountedIsValid;

  const handleAddToDraft = () => {
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

    setDraftLines((prev) => {
      const existingIndex = prev.findIndex((ln) => Number(ln.itemId) === itemId);
      const base = {
        id: prev[existingIndex]?.id ?? `local-${Date.now()}-${Math.random()}`,
        itemId,
        itemName: s.item_name || `Item ${itemId}`,
        systemPieces: system,
        countedPieces: counted,
        diffPieces: diff,
        costPerPiece,
        isPosted: false,
      };

      if (existingIndex === -1)
        return [...prev, base].sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)));
      const copy = [...prev];
      copy[existingIndex] = base;
      copy.sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)));
      return copy;
    });

    setDraftDirty(true);
    resetPad();

    if (padRef.current) padRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleEditDraftLine = (line) => {
    if (loadingCheck) return;
    setPad({ itemId: line.itemId, countedPieces: line.countedPieces });
    if (padRef.current) padRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRemoveDraftLine = (id) => {
    if (loadingCheck) return;
    setDraftLines((prev) => prev.filter((ln) => ln.id !== id));
    setDraftDirty(true);
  };

  // ---------- Save draft / post ----------
  const saveDraftInternal = async ({ silent = false } = {}) => {
    if (!draftLines.length) return null;
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
        lines: draftLines.map((ln) => ({
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

      // We still refresh after this to guarantee posted table is correct
      await res.json().catch(() => null);

      await loadHistory(true);
      await reloadCurrentDetail({ reloadTimeline: false });

      if (!silent) setMessage("Draft saved. (Nothing posted yet)");
      return true;
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
    if (!draftLines.length) return;
    if (loadingCheck) return;

    setPosting(true);
    setError("");
    setMessage("");

    try {
      let idToPost = currentCheckId;

      if (!idToPost) {
        const saved = await saveDraftInternal({ silent: true });
        if (!saved) throw new Error("Cannot post: failed to save draft.");
        // reloadCurrentDetail will set the id
        idToPost = checkMeta.id;
      }

      // If still missing, refresh once
      if (!idToPost) {
        await reloadCurrentDetail({ reloadTimeline: false });
        idToPost = checkMeta.id;
      }

      if (!idToPost) {
        throw new Error("Cannot post: no inventory check ID found for this date.");
      }

      const res = await fetchWithSlashFallback(`${API_BASE}/inventory-checks/${idToPost}/post`, {
        method: "POST",
        headers: authHeadersNoJson,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to post inventory check. Status: ${res.status}`);
      }

      await res.json().catch(() => null);

      await reloadStock();
      await loadHistory(true);
      await reloadCurrentDetail({ reloadTimeline: true });

      setMessage("Posted. Stock is normalized. You can continue counting and post again anytime.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to post inventory check.");
      setMessage("");
    } finally {
      setPosting(false);
    }
  };

  // ---------- Session OPEN/CLOSE controls ----------
  // NOTE: endpoints used:
  // - POST /inventory-checks/{id}/close
  // - POST /inventory-checks/{id}/open
  // If your backend names differ, adjust here only (frontend UI stays same).
  const handleCloseSession = async () => {
    if (!currentCheckId) return;
    setTogglingSession(true);
    setError("");
    setMessage("");
    try {
      const res = await fetchWithSlashFallback(`${API_BASE}/inventory-checks/${currentCheckId}/close`, {
        method: "POST",
        headers: authHeadersNoJson,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to close inventory. Status: ${res.status}`);
      }
      await res.json().catch(() => null);
      await loadHistory(true);
      await reloadCurrentDetail({ reloadTimeline: true });
      setMessage("Inventory closed.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to close inventory.");
    } finally {
      setTogglingSession(false);
    }
  };

  const handleOpenSession = async () => {
    if (!currentCheckId) return;
    setTogglingSession(true);
    setError("");
    setMessage("");
    try {
      const res = await fetchWithSlashFallback(`${API_BASE}/inventory-checks/${currentCheckId}/open`, {
        method: "POST",
        headers: authHeadersNoJson,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Failed to open inventory. Status: ${res.status}`);
      }
      await res.json().catch(() => null);
      await loadHistory(true);
      await reloadCurrentDetail({ reloadTimeline: false });
      setMessage("Inventory opened.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to open inventory.");
    } finally {
      setTogglingSession(false);
    }
  };

  // ---------- History tab helpers ----------
  // Prefer showing CLOSED sessions as ranges when fields exist
  const sessionHistory = useMemo(() => {
    const list = Array.isArray(historyChecks) ? historyChecks : [];
    const closed = list.filter((c) => c?.closed_at || String(c?.session_status || "").toUpperCase() === "CLOSED");
    closed.sort((a, b) => String(b?.closed_at || b?.check_date || "").localeCompare(String(a?.closed_at || a?.check_date || "")));
    return closed;
  }, [historyChecks]);

  const groupedHistoryByDate = useMemo(() => {
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

  // ✅ Button rules you requested:
  // - Save draft only when there are NEW/changed draft lines
  // - Post only when there are draft lines to post
  const canSaveDraft = draftLines.length > 0 && draftDirty && !savingDraft && !loadingCheck && !posting && !togglingSession;
  const canPost = draftLines.length > 0 && !posting && !loadingCheck && !savingDraft && !togglingSession;

  const numCell = { whiteSpace: "nowrap" };

  // show shrink/gain/net from backend if present
  const shrinkValue = checkMeta.shrink_value;
  const gainValue = checkMeta.gain_value;
  const netValue = checkMeta.net_value;

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
              <span style={{ color: "#111827" }}>
                {currentCheckStatus ? String(currentCheckStatus).toUpperCase() : "—"}
              </span>
              {currentCheckId ? ` • Check ID: ${currentCheckId}` : ""}
              {sessionStatus ? ` • Session: ${String(sessionStatus).toUpperCase()}` : ""}
            </div>

            {(checkMeta.started_at || checkMeta.closed_at) && (
              <div style={{ marginTop: "6px", fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>
                {checkMeta.started_at ? (
                  <span>
                    Started:{" "}
                    <span style={{ color: "#111827" }}>
                      {formatCAT_YMD_FromISO(checkMeta.started_at)} {formatCAT_HM_FromISO(checkMeta.started_at)} CAT
                    </span>
                  </span>
                ) : null}
                {checkMeta.closed_at ? (
                  <span>
                    {" "}
                    • Closed:{" "}
                    <span style={{ color: "#111827" }}>
                      {formatCAT_YMD_FromISO(checkMeta.closed_at)} {formatCAT_HM_FromISO(checkMeta.closed_at)} CAT
                    </span>
                  </span>
                ) : null}
              </div>
            )}

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
              maxWidth: "420px",
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
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Inventory summary</div>

            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "#9ca3af",
                marginBottom: "2px",
              }}
            >
              Date: {toISODate(inventoryDate)} • Time (CAT): {catNowHM}
            </div>

            <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>
              {timelineTotals.totalAdj} post(s) • Draft items: {draftLines.length} • Posted items:{" "}
              {postedLines.length}
            </div>

            {/* Progress */}
            {(checkMeta.progress_total_items !== null || checkMeta.progress_counted_items !== null) && (
              <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>
                Progress:{" "}
                <span style={{ color: "#111827" }}>
                  {Number(checkMeta.progress_counted_items || 0)}/{Number(checkMeta.progress_total_items || 0)}
                </span>
                {checkMeta.progress_percent ? (
                  <span style={{ color: "#6b7280" }}>
                    {" "}
                    • {String(checkMeta.progress_percent).slice(0, 6)}%
                  </span>
                ) : null}
              </div>
            )}

            {/* Draft table summary */}
            <div>
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#6b7280",
                }}
              >
                Draft table: total pieces diff
              </div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  color:
                    totalDraftDiffPieces === 0
                      ? "#111827"
                      : totalDraftDiffPieces > 0
                      ? "#16a34a"
                      : "#b91c1c",
                }}
              >
                {formatDiff(totalDraftDiffPieces)}
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
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#6b7280",
                }}
              >
                Draft value (RWF) using current cost/piece
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Before (system)</div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "#111827" }}>
                  {formatMoney(totalDraftValueBefore)}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>After (counted)</div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "#111827" }}>
                  {formatMoney(totalDraftValueAfter)}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Difference</div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "13px",
                    color:
                      totalDraftValueDiff === 0
                        ? "#111827"
                        : totalDraftValueDiff > 0
                        ? "#16a34a"
                        : "#b91c1c",
                  }}
                >
                  {totalDraftValueDiff === 0
                    ? "0"
                    : `${totalDraftValueDiff > 0 ? "+" : ""}${formatMoney(totalDraftValueDiff)}`}
                </div>
              </div>
            </div>

            {/* Posted shrink / gain (from backend) */}
            {(shrinkValue !== null || gainValue !== null || netValue !== null) && (
              <div
                style={{
                  marginTop: "6px",
                  paddingTop: "6px",
                  borderTop: "1px dashed #e5e7eb",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#6b7280",
                  }}
                >
                  Posted impact (RWF)
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginTop: 4 }}>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>Shrink (loss)</div>
                  <div style={{ fontWeight: 800, fontSize: "13px", color: "#b91c1c" }}>
                    {shrinkValue ? formatMoney(shrinkValue) : "0"}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>Gain</div>
                  <div style={{ fontWeight: 800, fontSize: "13px", color: "#16a34a" }}>
                    {gainValue ? formatMoney(gainValue) : "0"}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>Net</div>
                  <div style={{ fontWeight: 900, fontSize: "13px", color: "#111827" }}>
                    {netValue ? formatMoney(netValue) : "0"}
                  </div>
                </div>
              </div>
            )}

            {/* Whole day posted movement totals */}
            <div
              style={{
                marginTop: "6px",
                paddingTop: "6px",
                borderTop: "1px dashed #e5e7eb",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#6b7280",
                }}
              >
                Whole day (posted): pieces & value
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginTop: 4 }}>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Pieces adjusted</div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: "13px",
                    color:
                      timelineTotals.pieces === 0
                        ? "#111827"
                        : timelineTotals.pieces > 0
                        ? "#16a34a"
                        : "#b91c1c",
                  }}
                >
                  {formatDiff(timelineTotals.pieces)}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Value (RWF)</div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: "13px",
                    color:
                      timelineTotals.value === 0
                        ? "#111827"
                        : timelineTotals.value > 0
                        ? "#16a34a"
                        : "#b91c1c",
                  }}
                >
                  {timelineTotals.value === 0
                    ? "0"
                    : `${timelineTotals.value > 0 ? "+" : ""}${formatMoney(timelineTotals.value)}`}
                </div>
              </div>
            </div>

            {/* Session controls */}
            <div style={{ marginTop: "10px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              {sessionStatus && String(sessionStatus).toUpperCase() === "OPEN" ? (
                <button
                  type="button"
                  onClick={handleCloseSession}
                  disabled={!currentCheckId || disableEditing}
                  style={{
                    padding: "0.55rem 1rem",
                    borderRadius: "999px",
                    border: "1px solid #fecaca",
                    backgroundColor: disableEditing ? "#f3f4f6" : "#fef2f2",
                    color: disableEditing ? "#9ca3af" : "#b91c1c",
                    fontWeight: 900,
                    fontSize: "12px",
                    cursor: disableEditing ? "not-allowed" : "pointer",
                  }}
                >
                  {togglingSession ? "Closing…" : "Close inventory"}
                </button>
              ) : sessionStatus && String(sessionStatus).toUpperCase() === "CLOSED" ? (
                <button
                  type="button"
                  onClick={handleOpenSession}
                  disabled={!currentCheckId || disableEditing}
                  style={{
                    padding: "0.55rem 1rem",
                    borderRadius: "999px",
                    border: "1px solid #bbf7d0",
                    backgroundColor: disableEditing ? "#f3f4f6" : "#ecfdf3",
                    color: disableEditing ? "#9ca3af" : "#166534",
                    fontWeight: 900,
                    fontSize: "12px",
                    cursor: disableEditing ? "not-allowed" : "pointer",
                  }}
                >
                  {togglingSession ? "Opening…" : "Open inventory"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* date picker */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Inventory check date</div>
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

          {loadingCheck && (
            <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>Loading…</div>
          )}
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
              <span>Pad: select item, enter counted pieces, then add to draft table</span>

              <button
                type="button"
                onClick={handleAddToDraft}
                disabled={!canAddToDraft}
                style={{
                  padding: "0.55rem 1.3rem",
                  borderRadius: "9999px",
                  border: "none",
                  backgroundColor: !canAddToDraft ? "#9ca3af" : "#2563eb",
                  color: "white",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                  cursor: !canAddToDraft ? "not-allowed" : "pointer",
                  opacity: !canAddToDraft ? 0.85 : 1,
                }}
              >
                + Add to draft
              </button>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#111827",
                  marginBottom: "6px",
                }}
              >
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
                  <strong style={{ color: "#111827" }}>
                    {pad.itemId ? formatQty(padSystemPieces) : "—"}
                  </strong>
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
                gridTemplateColumns:
                  "minmax(140px, 1.5fr) minmax(140px, 1fr) minmax(140px, 1fr)",
                gap: "12px",
                alignItems: "end",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#111827",
                    marginBottom: "6px",
                  }}
                >
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
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#111827",
                    marginBottom: "6px",
                  }}
                >
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
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#111827",
                    marginBottom: "6px",
                  }}
                >
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

          {/* ✅ POSTED ITEMS TABLE (below pad) */}
          <div style={{ marginTop: 8, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 10 }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#111827" }}>
                  Posted items (this session)
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                  {postedLines.length === 0
                    ? "No posted items yet."
                    : `${postedLines.length} posted line${postedLines.length === 1 ? "" : "s"} (latest first).`}
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setError("");
                  setMessage("");
                  await reloadStock();
                  await reloadCurrentDetail({ reloadTimeline: true });
                }}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "999px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  fontWeight: 900,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Refresh
              </button>
            </div>

            {postedLines.length > 0 && (
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
                <div style={{ maxHeight: "280px", overflowY: "auto", overflowX: "auto", minWidth: "980px" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 2.5fr) 1fr 1fr 1fr 1fr",
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
                    <div style={{ textAlign: "right" }}>System</div>
                    <div style={{ textAlign: "right" }}>Counted</div>
                    <div style={{ textAlign: "right" }}>Diff</div>
                    <div style={{ textAlign: "right" }}>Direction</div>
                  </div>

                  {postedLines.map((ln) => (
                    <div
                      key={`posted-${ln.id}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(220px, 2.5fr) 1fr 1fr 1fr 1fr",
                        alignItems: "center",
                        padding: "9px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: "13px",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{ln.itemName || "Unknown item"}</div>
                      <div style={{ textAlign: "right", ...numCell }}>{formatQty(ln.systemPieces)}</div>
                      <div style={{ textAlign: "right", ...numCell }}>{formatQty(ln.countedPieces)}</div>
                      <div
                        style={{
                          textAlign: "right",
                          ...numCell,
                          color: ln.diffPieces > 0 ? "#16a34a" : ln.diffPieces < 0 ? "#b91c1c" : "#111827",
                          fontWeight: 800,
                        }}
                      >
                        {formatDiff(ln.diffPieces)}
                      </div>
                      <div style={{ textAlign: "right", ...numCell, color: "#6b7280", fontWeight: 800 }}>
                        {ln.differenceDirection ? String(ln.differenceDirection) : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ✅ DRAFT TABLE (editable) */}
          {draftLines.length === 0 ? (
            <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
              No draft items yet. Use the pad above and click <strong>+ Add to draft</strong>.
            </div>
          ) : (
            <>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                Draft items: {draftLines.length} (latest per item).{" "}
                {draftDirty ? <strong style={{ color: "#111827" }}>Unsaved changes</strong> : null}
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

                  {draftLines.map((ln) => (
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
                          onClick={() => handleEditDraftLine(ln)}
                          disabled={disableEditing}
                          style={{
                            padding: 0,
                            margin: 0,
                            border: "none",
                            background: "transparent",
                            color: "#111827",
                            fontWeight: 700,
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
                          fontWeight: 800,
                        }}
                      >
                        {formatDiff(ln.diffPieces)}
                      </div>

                      <div style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftLine(ln.id)}
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
                          title="Remove from draft"
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
                fontWeight: 700,
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
                fontWeight: 900,
                fontSize: "0.95rem",
                cursor: !canPost ? "not-allowed" : "pointer",
                opacity: !canPost ? 0.85 : 1,
              }}
            >
              {posting ? "Posting…" : "Post inventory check"}
            </button>
          </div>

          {/* small refresh row */}
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={async () => {
                await reloadStock();
                await reloadCurrentDetail({ reloadTimeline: true });
              }}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                fontWeight: 900,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Refresh stock & day totals
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
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>Inventory history</h2>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 4 }}>
            Shows closed sessions (when available). Click a date to open it.
          </div>

          {sessionHistory.length > 0 ? (
            <div style={{ marginTop: 12, borderRadius: "14px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
              <div style={{ maxHeight: "420px", overflowY: "auto" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "260px 260px 1fr 1fr 1fr",
                    minWidth: "920px",
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
                  <div>Started</div>
                  <div>Closed</div>
                  <div style={{ textAlign: "right" }}>Items</div>
                  <div style={{ textAlign: "right" }}>Diff (pieces)</div>
                  <div style={{ textAlign: "right" }}>Net (RWF)</div>
                </div>

                {sessionHistory.map((c) => {
                  const start = c.started_at ? `${formatCAT_YMD_FromISO(c.started_at)} ${formatCAT_HM_FromISO(c.started_at)} CAT` : "—";
                  const end = c.closed_at ? `${formatCAT_YMD_FromISO(c.closed_at)} ${formatCAT_HM_FromISO(c.closed_at)} CAT` : "—";
                  const net = c.net_value ?? c.value_change ?? null;

                  return (
                    <div
                      key={`sess-${c.id}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "260px 260px 1fr 1fr 1fr",
                        minWidth: "920px",
                        alignItems: "center",
                        padding: "9px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: "13px",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#111827" }}>{start}</div>
                      <div style={{ fontWeight: 700, color: "#111827" }}>{end}</div>
                      <div style={{ textAlign: "right", ...numCell }}>{Number(c.total_items || 0)}</div>
                      <div
                        style={{
                          textAlign: "right",
                          ...numCell,
                          color:
                            Number(c.total_diff_pieces || 0) > 0
                              ? "#16a34a"
                              : Number(c.total_diff_pieces || 0) < 0
                              ? "#b91c1c"
                              : "#111827",
                          fontWeight: 800,
                        }}
                      >
                        {formatDiff(c.total_diff_pieces)}
                      </div>
                      <div style={{ textAlign: "right", ...numCell, fontWeight: 900 }}>{net ? formatMoney(net) : "—"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : groupedHistoryByDate.length === 0 ? (
            <div style={{ marginTop: 10, fontSize: "13px", color: "#6b7280" }}>No inventory checks recorded yet.</div>
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

                {groupedHistoryByDate.map((g) => (
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
                          fontWeight: 800,
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
                        fontWeight: 800,
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
