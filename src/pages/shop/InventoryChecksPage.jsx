// FILE: src/pages/shop/InventoryChecksPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext.jsx";

function toNumberSafe(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatPieces(value) {
  const n = toNumberSafe(value);
  return n.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Robustly extract an array from many possible backend shapes:
 * - []
 * - { items: [] }
 * - { results: [] }
 * - { data: [] }
 */
function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

/**
 * Normalize stock rows so dropdown never shows blank due to field name mismatch.
 */
function normalizeStockRow(row) {
  const itemId = row?.item_id ?? row?.itemId ?? row?.item?.id ?? row?.id ?? null;

  const itemName =
    row?.item_name ??
    row?.itemName ??
    row?.name ??
    row?.item?.name ??
    row?.item?.item_name ??
    "";

  const remainingPieces =
    row?.remaining_pieces ??
    row?.remainingPieces ??
    row?.remaining ??
    row?.pieces ??
    row?.current_pieces ??
    0;

  return {
    ...row,
    item_id: itemId,
    item_name: itemName,
    remaining_pieces: remainingPieces,
  };
}

function InventoryChecksPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();

  const [shop, setShop] = useState(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [pageError, setPageError] = useState("");

  const [activeTab, setActiveTab] = useState("entry"); // "entry" | "history"

  // Stock items for this shop (used for system remaining_pieces + item name)
  const [stockItems, setStockItems] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockHint, setStockHint] = useState("");

  // Summary list
  const [summary, setSummary] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Current check details (from backend)
  const [currentCheck, setCurrentCheck] = useState(null);

  // Editable header fields
  const [checkDate, setCheckDate] = useState(todayInputDate());
  const [notes, setNotes] = useState("");

  // Editable lines in the form
  const [linesDraft, setLinesDraft] = useState([]);

  // New line entry inputs
  const [selectedItemId, setSelectedItemId] = useState("");
  const [entryCountedPieces, setEntryCountedPieces] = useState("");

  // Flags + alerts
  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 760;
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isDraft = currentCheck?.status === "DRAFT";
  const isPosted = currentCheck?.status === "POSTED";

  // ------------------------------------------
  // Inventory checks endpoint compatibility
  // Many backends use "/inventory_checks" instead of "/inventory-checks"
  // We try both safely.
  // ------------------------------------------
  const INV_PREFIXES = ["/inventory-checks", "/inventory_checks"];

  const invGet = async (suffix, config) => {
    let lastErr = null;
    for (const p of INV_PREFIXES) {
      try {
        return await api.get(`${p}${suffix}`, config);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  };

  const invPost = async (suffix, data, config) => {
    let lastErr = null;
    for (const p of INV_PREFIXES) {
      try {
        return await api.post(`${p}${suffix}`, data, config);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  };

  // ------------------------------------------
  // Load shop + stock + summary
  // IMPORTANT: wait for auth to finish loading to avoid storms
  // ------------------------------------------
  const loadControllerRef = useRef(null);

  useEffect(() => {
    if (!shopId) return;

    // Wait until auth restoration completes
    if (auth?.loading) {
      setLoadingPage(true);
      return;
    }

    // If no token after loading, bounce to login
    if (!auth?.token) {
      setLoadingPage(false);
      setPageError("Not authenticated. Please login again.");
      // optional: navigate("/login");
      return;
    }

    // cancel previous in-flight load
    if (loadControllerRef.current) {
      loadControllerRef.current.abort();
    }
    const controller = new AbortController();
    loadControllerRef.current = controller;

    const loadAll = async () => {
      setLoadingPage(true);
      setPageError("");
      setMessage("");
      setError("");
      setStockHint("");

      try {
        // 1) Load shop basic info
        const shopRes = await api.get(`/shops/${shopId}`, { signal: controller.signal });
        setShop(shopRes.data);

        // 2) Load stock items for this shop
        setStockLoading(true);
        try {
          const stockRes = await api.get("/stock/summary", {
            params: { shop_id: shopId },
            signal: controller.signal,
          });

          let items = extractArray(stockRes.data).map(normalizeStockRow);

          items = items.filter(
            (r) => r && Number.isFinite(Number(r.item_id)) && Number(r.item_id) > 0
          );

          items = [...items].sort((a, b) =>
            String(a.item_name || "")
              .toLowerCase()
              .localeCompare(String(b.item_name || "").toLowerCase())
          );

          setStockItems(items);

          if (items.length === 0) {
            setStockHint(
              "No stock items returned. If Stock page shows items, share backend stock summary response shape."
            );
          }
        } finally {
          setStockLoading(false);
        }

        // 3) Load summary and try to pick latest DRAFT
        await loadSummaryAndMaybeDraft(shopId, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;

        console.error("Error loading inventory check page", err);

        // If token became invalid, show clear message
        const status = err?.response?.status;
        if (status === 401) {
          setPageError("Session expired or invalid token. Please logout/login again.");
          return;
        }

        setPageError(err?.response?.data?.detail || err?.message || "Failed to load inventory check page.");
      } finally {
        if (!controller.signal.aborted) setLoadingPage(false);
      }
    };

    loadAll();

    return () => {
      controller.abort();
    };
    // Depend only on shopId + auth.loading + auth.token (avoid object identity loops)
  }, [shopId, auth?.loading, auth?.token]);

  const loadSummaryAndMaybeDraft = async (shopIdToLoad, signal) => {
    setSummaryLoading(true);
    setSummary([]);
    try {
      const res = await invGet(
        "/summary",
        {
          params: { shop_id: shopIdToLoad, skip: 0, limit: 100 },
          signal,
        }
      );

      const list = extractArray(res.data);
      setSummary(list);

      const draft = list.find((row) => row.status === "DRAFT");
      if (draft) {
        await loadCheckDetails(draft.id, { switchToEntry: true }, signal);
      } else {
        resetEntryFormToNew();
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error("Error loading inventory checks summary", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to load inventory checks summary. (Likely wrong route name or backend not deployed.)"
      );
    } finally {
      if (!signal?.aborted) setSummaryLoading(false);
    }
  };

  const loadCheckDetails = async (checkId, opts = {}, signal) => {
    const { switchToEntry = false } = opts;
    setError("");
    setMessage("");
    try {
      const res = await invGet(`/${checkId}`, { signal });
      const check = res.data;
      setCurrentCheck(check);

      if (check.check_date) setCheckDate(String(check.check_date));
      else setCheckDate(todayInputDate());

      setNotes(check.notes || "");

      const newLines =
        (check.lines || []).map((ln) => ({
          id: ln.id,
          item_id: ln.item_id,
          item_name: ln.item_name,
          system_pieces: toNumberSafe(ln.system_pieces),
          counted_pieces: toNumberSafe(ln.counted_pieces),
          diff_pieces: toNumberSafe(ln.diff_pieces),
        })) || [];

      setLinesDraft(newLines);

      if (switchToEntry) setActiveTab("entry");
    } catch (err) {
      if (signal?.aborted) return;
      console.error("Error loading inventory check details", err);
      setError(err?.response?.data?.detail || err?.message || "Failed to load inventory check details.");
    }
  };

  const resetEntryFormToNew = () => {
    setCurrentCheck(null);
    setCheckDate(todayInputDate());
    setNotes("");
    setLinesDraft([]);
    setSelectedItemId("");
    setEntryCountedPieces("");
  };

  // ------------------------------------------
  // Helpers for stock lookups
  // ------------------------------------------
  const shopName = shop?.name || `Shop ${shopId}`;

  const stockByItemId = useMemo(() => {
    const map = {};
    (stockItems || []).forEach((row) => {
      const id = Number(row?.item_id);
      if (!Number.isFinite(id) || id <= 0) return;
      map[id] = row;
    });
    return map;
  }, [stockItems]);

  // ------------------------------------------
  // Entry tab: add/update lines
  // ------------------------------------------
  const handleAddOrUpdateLine = () => {
    if (!selectedItemId) {
      setError("Please select an item first.");
      return;
    }
    const itemId = Number(selectedItemId);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      setError("Invalid item selected.");
      return;
    }

    const counted = toNumberSafe(entryCountedPieces);
    if (counted < 0) {
      setError("Counted pieces cannot be negative.");
      return;
    }

    const stockRow = stockByItemId[itemId];
    if (!stockRow) {
      setError(
        "No system stock found for this item in this shop. Please create stock via Purchases first."
      );
      return;
    }

    const systemPieces = toNumberSafe(stockRow.remaining_pieces);
    const diffPieces = counted - systemPieces;

    const itemName = stockRow.item_name || `Item #${itemId}`;

    setLinesDraft((prev) => {
      const existingIndex = prev.findIndex((ln) => ln.item_id === itemId);
      const newLine = {
        id: prev[existingIndex]?.id || null,
        item_id: itemId,
        item_name: itemName,
        system_pieces: systemPieces,
        counted_pieces: counted,
        diff_pieces: diffPieces,
      };

      if (existingIndex >= 0) {
        const copy = [...prev];
        copy[existingIndex] = newLine;
        return copy;
      }
      return [...prev, newLine];
    });

    setError("");
    setMessage("");
    setSelectedItemId("");
    setEntryCountedPieces("");
  };

  const handleLineCountChange = (itemId, newCountedStr) => {
    const counted = toNumberSafe(newCountedStr);
    setLinesDraft((prev) =>
      prev.map((ln) => {
        if (ln.item_id !== itemId) return ln;
        const systemPieces = toNumberSafe(ln.system_pieces);
        const diffPieces = counted - systemPieces;
        return { ...ln, counted_pieces: counted, diff_pieces: diffPieces };
      })
    );
  };

  const handleRemoveLine = (itemId) => {
    setLinesDraft((prev) => prev.filter((ln) => ln.item_id !== itemId));
  };

  // ------------------------------------------
  // Save draft
  // ------------------------------------------
  const handleSaveDraft = async () => {
    if (!shopId) return;
    if (linesDraft.length === 0) {
      setError("Add at least one item to the inventory check.");
      return;
    }

    setSavingDraft(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        id: isDraft ? currentCheck?.id : null,
        shop_id: Number(shopId),
        check_date: checkDate || todayInputDate(),
        notes: notes || null,
        lines: linesDraft.map((ln) => ({
          item_id: ln.item_id,
          counted_pieces: ln.counted_pieces,
        })),
      };

      const res = await invPost("/draft", payload);
      const saved = res.data;
      setCurrentCheck(saved);

      await loadCheckDetails(saved.id);
      await loadSummaryAndMaybeDraft(shopId);

      setMessage("Inventory check draft saved.");
    } catch (err) {
      console.error("Error saving inventory check draft", err);
      setError(err?.response?.data?.detail || err?.message || "Failed to save inventory check draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  // ------------------------------------------
  // Post (apply) inventory check
  // ------------------------------------------
  const handlePostCheck = async () => {
    if (!currentCheck || !isDraft) return;
    if (linesDraft.length === 0) {
      setError("Cannot post an inventory check with no lines.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to POST this inventory check?\n\n" +
        "This will adjust the stock (remaining pieces) for all listed items."
    );
    if (!confirmed) return;

    setPosting(true);
    setError("");
    setMessage("");

    try {
      const res = await invPost(`/${currentCheck.id}/post`, null);
      const posted = res.data;
      setCurrentCheck(posted);

      await loadCheckDetails(posted.id);
      await loadSummaryAndMaybeDraft(shopId);

      setMessage("Inventory check posted and stock updated.");
    } catch (err) {
      console.error("Error posting inventory check", err);
      setError(err?.response?.data?.detail || err?.message || "Failed to post inventory check.");
    } finally {
      setPosting(false);
    }
  };

  const handleStartNewDraft = () => {
    const ok = window.confirm(
      "Start a new inventory check draft for this shop?\n\n" +
        "This will not delete older checks, but you will work on a new one."
    );
    if (!ok) return;
    resetEntryFormToNew();
    setMessage("New inventory check draft started.");
    setError("");
  };

  // ------------------------------------------
  // Derived totals
  // ------------------------------------------
  const totalsDraft = useMemo(() => {
    let totalSystem = 0;
    let totalCounted = 0;
    let totalDiff = 0;
    (linesDraft || []).forEach((ln) => {
      totalSystem += toNumberSafe(ln.system_pieces);
      totalCounted += toNumberSafe(ln.counted_pieces);
      totalDiff += toNumberSafe(ln.diff_pieces);
    });
    return { totalSystem, totalCounted, totalDiff };
  }, [linesDraft]);

  // ------------------------------------------
  // Render
  // ------------------------------------------
  if (loadingPage) {
    return (
      <div style={{ padding: "24px" }}>
        <p>Loading inventory check page...</p>
      </div>
    );
  }

  if (pageError && !shop) {
    return (
      <div style={{ padding: "24px", color: "red" }}>
        <p>{pageError}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            marginTop: "10px",
            padding: "0.5rem 1rem",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "18px 14px 22px" : "26px 32px 32px" }}>
      <div style={{ marginBottom: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <h1 style={{ fontSize: isMobile ? "24px" : "30px", fontWeight: 800, margin: 0 }}>
          Inventory check – {shopName}
        </h1>
        <p style={{ margin: 0, fontSize: isMobile ? "13px" : "14px", color: "#4b5563" }}>
          Compare system remaining pieces with physical counts, adjust, and post to keep stock in sync.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("entry")}
          style={{
            padding: "0.4rem 1.2rem",
            borderRadius: "999px",
            border: activeTab === "entry" ? "none" : "1px solid rgba(209,213,219,1)",
            backgroundColor: activeTab === "entry" ? "#0f2580" : "rgba(249,250,251,1)",
            color: activeTab === "entry" ? "#ffffff" : "#374151",
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: activeTab === "entry" ? "0 10px 25px rgba(15,37,128,0.35)" : "none",
          }}
        >
          Enter counts
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          style={{
            padding: "0.4rem 1.2rem",
            borderRadius: "999px",
            border: activeTab === "history" ? "none" : "1px solid rgba(209,213,219,1)",
            backgroundColor: activeTab === "history" ? "#0f2580" : "rgba(249,250,251,1)",
            color: activeTab === "history" ? "#ffffff" : "#374151",
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: activeTab === "history" ? "0 10px 25px rgba(15,37,128,0.35)" : "none",
          }}
        >
          History
        </button>
      </div>

      {(message || error) && (
        <div
          style={{
            marginBottom: "1.1rem",
            padding: "0.7rem 0.9rem",
            borderRadius: "0.75rem",
            backgroundColor: error ? "#fef2f2" : "#ecfdf3",
            color: error ? "#b91c1c" : "#166534",
            fontSize: "0.9rem",
          }}
        >
          {error || message}
        </div>
      )}

      {/* ENTRY TAB */}
      {activeTab === "entry" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "1.2rem",
            padding: isMobile ? "14px 12px" : "18px 18px 20px",
            boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            marginBottom: "2rem",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#6b7280", marginBottom: "0.2rem" }}>
                  Check date
                </div>
                <input
                  type="date"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                  disabled={isPosted}
                  style={{
                    padding: "0.4rem 0.6rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #d1d5db",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#6b7280", marginBottom: "0.2rem" }}>
                  Status
                </div>
                <span
                  style={{
                    display: "inline-block",
                    padding: "0.25rem 0.7rem",
                    borderRadius: "999px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    backgroundColor: isPosted ? "#dcfce7" : "#fef3c7",
                    color: isPosted ? "#166534" : "#92400e",
                  }}
                >
                  {currentCheck ? (currentCheck.status === "POSTED" ? "POSTED" : "DRAFT") : "NEW DRAFT"}
                </span>
              </div>

              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#6b7280", marginBottom: "0.2rem" }}>
                  Check ID
                </div>
                <span style={{ fontSize: "0.9rem", color: "#4b5563" }}>
                  {currentCheck ? `#${currentCheck.id}` : "Not saved yet"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
              <button
                type="button"
                onClick={handleStartNewDraft}
                style={{
                  padding: "0.45rem 1.1rem",
                  borderRadius: "999px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#f9fafb",
                  color: "#374151",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                New draft
              </button>

              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft || isPosted}
                style={{
                  padding: "0.45rem 1.4rem",
                  borderRadius: "999px",
                  border: "none",
                  backgroundColor: savingDraft || isPosted ? "#4b6bfb99" : "#4b6bfb",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: savingDraft || isPosted ? "not-allowed" : "pointer",
                }}
              >
                {savingDraft ? "Saving..." : "Save draft"}
              </button>

              <button
                type="button"
                onClick={handlePostCheck}
                disabled={!isDraft || posting || linesDraft.length === 0}
                style={{
                  padding: "0.45rem 1.4rem",
                  borderRadius: "999px",
                  border: "none",
                  backgroundColor: !isDraft || posting || linesDraft.length === 0 ? "#05966966" : "#059669",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: !isDraft || posting || linesDraft.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {posting ? "Posting..." : "Post inventory check"}
              </button>
            </div>
          </div>

          {/* New line entry */}
          <div
            style={{
              marginBottom: "0.9rem",
              padding: "0.8rem 0.8rem",
              borderRadius: "0.9rem",
              backgroundColor: "#f9fafb",
              border: "1px dashed #d1d5db",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: "0.75rem",
              alignItems: isMobile ? "flex-start" : "center",
            }}
          >
            <div style={{ flex: 3, width: "100%" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#4b5563", marginBottom: "0.2rem" }}>Item</div>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                disabled={isPosted || stockLoading}
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #d1d5db",
                  fontSize: "0.9rem",
                }}
              >
                <option value="">Select item...</option>
                {stockItems.map((row) => (
                  <option key={row.item_id} value={String(row.item_id)}>
                    {(row.item_name || `Item #${row.item_id}`) + " — system: "}
                    {formatPieces(row.remaining_pieces)} pcs
                  </option>
                ))}
              </select>

              {stockLoading && (
                <div style={{ marginTop: "0.2rem", fontSize: "0.75rem", color: "#6b7280" }}>
                  Loading stock items...
                </div>
              )}

              {!stockLoading && stockItems.length > 0 && (
                <div style={{ marginTop: "0.2rem", fontSize: "0.75rem", color: "#6b7280" }}>
                  Loaded {stockItems.length} stock items.
                </div>
              )}

              {!stockLoading && stockItems.length === 0 && stockHint && (
                <div
                  style={{
                    marginTop: "0.35rem",
                    fontSize: "0.78rem",
                    color: "#b45309",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "0.6rem",
                  }}
                >
                  {stockHint}
                </div>
              )}
            </div>

            <div style={{ flex: 1, width: "100%" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#4b5563", marginBottom: "0.2rem" }}>
                Physical pieces
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                value={entryCountedPieces}
                disabled={isPosted}
                onChange={(e) => setEntryCountedPieces(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #d1d5db",
                  fontSize: "0.9rem",
                }}
                placeholder="e.g. 5"
              />
            </div>

            <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-end", width: isMobile ? "100%" : "auto" }}>
              <button
                type="button"
                onClick={handleAddOrUpdateLine}
                disabled={isPosted}
                style={{
                  width: isMobile ? "100%" : "auto",
                  padding: "0.55rem 1.2rem",
                  borderRadius: "999px",
                  border: "none",
                  backgroundColor: "#0f2580",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: isPosted ? "not-allowed" : "pointer",
                }}
              >
                Add / update line
              </button>
            </div>
          </div>

          {/* Lines table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", color: "#6b7280" }}>
                  <th style={{ padding: "0.4rem 0.55rem", minWidth: 200 }}>Item</th>
                  <th style={{ padding: "0.4rem 0.55rem", minWidth: 110 }}>System pieces</th>
                  <th style={{ padding: "0.4rem 0.55rem", minWidth: 110 }}>Physical pieces</th>
                  <th style={{ padding: "0.4rem 0.55rem", minWidth: 110 }}>Difference</th>
                  <th style={{ padding: "0.4rem 0.55rem", minWidth: 60 }}>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {linesDraft.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "0.55rem 0.55rem", color: "#9ca3af", fontSize: "0.88rem" }}>
                      No lines yet. Select an item above and add physical pieces.
                    </td>
                  </tr>
                ) : (
                  linesDraft.map((ln) => (
                    <tr key={ln.item_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "0.5rem 0.55rem" }}>{ln.item_name}</td>
                      <td style={{ padding: "0.5rem 0.55rem" }}>{formatPieces(ln.system_pieces)}</td>
                      <td style={{ padding: "0.5rem 0.55rem" }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ln.counted_pieces === 0 ? "0" : String(ln.counted_pieces)}
                          disabled={isPosted}
                          onChange={(e) => handleLineCountChange(ln.item_id, e.target.value)}
                          style={{
                            width: "100%",
                            padding: "0.35rem 0.5rem",
                            borderRadius: "0.45rem",
                            border: "1px solid #d1d5db",
                            fontSize: "0.85rem",
                          }}
                        />
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.55rem",
                          color: ln.diff_pieces > 0 ? "#059669" : ln.diff_pieces < 0 ? "#b91c1c" : "#4b5563",
                          fontWeight: 600,
                        }}
                      >
                        {formatPieces(ln.diff_pieces)}
                      </td>
                      <td style={{ padding: "0.5rem 0.55rem" }}>
                        {!isPosted && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(ln.item_id)}
                            style={{
                              width: "1.9rem",
                              height: "1.9rem",
                              borderRadius: "999px",
                              border: "1px solid #fee2e2",
                              backgroundColor: "#fef2f2",
                              color: "#b91c1c",
                              fontSize: "1rem",
                              cursor: "pointer",
                            }}
                            title="Remove line"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {linesDraft.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid #e5e7eb", backgroundColor: "#f9fafb" }}>
                    <td style={{ padding: "0.5rem 0.55rem", fontWeight: 600, fontSize: "0.9rem" }}>
                      Totals ({linesDraft.length} items)
                    </td>
                    <td style={{ padding: "0.5rem 0.55rem", fontWeight: 600 }}>
                      {formatPieces(totalsDraft.totalSystem)}
                    </td>
                    <td style={{ padding: "0.5rem 0.55rem", fontWeight: 600 }}>
                      {formatPieces(totalsDraft.totalCounted)}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.55rem",
                        fontWeight: 600,
                        color:
                          totalsDraft.totalDiff > 0 ? "#059669" : totalsDraft.totalDiff < 0 ? "#b91c1c" : "#111827",
                      }}
                    >
                      {formatPieces(totalsDraft.totalDiff)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === "history" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "1.2rem",
            padding: isMobile ? "14px 12px" : "18px 18px 20px",
            boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
          }}
        >
          <div style={{ marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Inventory checks history</h2>
            <button
              type="button"
              onClick={() => loadSummaryAndMaybeDraft(shopId)}
              style={{
                padding: "0.3rem 0.9rem",
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                backgroundColor: "#f9fafb",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
          </div>

          {summaryLoading ? (
            <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>Loading checks...</p>
          ) : summary.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>No inventory checks recorded yet for this shop.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", color: "#6b7280" }}>
                    <th style={{ padding: "0.4rem 0.55rem" }}>Date</th>
                    <th style={{ padding: "0.4rem 0.55rem" }}>Check ID</th>
                    <th style={{ padding: "0.4rem 0.55rem" }}>Status</th>
                    <th style={{ padding: "0.4rem 0.55rem" }}>Items</th>
                    <th style={{ padding: "0.4rem 0.55rem" }}>System pieces</th>
                    <th style={{ padding: "0.4rem 0.55rem" }}>Counted pieces</th>
                    <th style={{ padding: "0.4rem 0.55rem" }}>Difference</th>
                    <th style={{ padding: "0.4rem 0.55rem" }}>Created at</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => {
                        loadCheckDetails(row.id, { switchToEntry: true });
                        setActiveTab("entry");
                      }}
                      style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                    >
                      <td style={{ padding: "0.45rem 0.55rem" }}>{row.check_date}</td>
                      <td style={{ padding: "0.45rem 0.55rem" }}>#{row.id}</td>
                      <td style={{ padding: "0.45rem 0.55rem" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.15rem 0.55rem",
                            borderRadius: "999px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            backgroundColor: row.status === "POSTED" ? "#dcfce7" : "#fef3c7",
                            color: row.status === "POSTED" ? "#166534" : "#92400e",
                          }}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.45rem 0.55rem" }}>{row.total_items}</td>
                      <td style={{ padding: "0.45rem 0.55rem" }}>{formatPieces(row.total_system_pieces)}</td>
                      <td style={{ padding: "0.45rem 0.55rem" }}>{formatPieces(row.total_counted_pieces)}</td>
                      <td
                        style={{
                          padding: "0.45rem 0.55rem",
                          color:
                            toNumberSafe(row.total_diff_pieces) > 0
                              ? "#059669"
                              : toNumberSafe(row.total_diff_pieces) < 0
                              ? "#b91c1c"
                              : "#111827",
                          fontWeight: 600,
                        }}
                      >
                        {formatPieces(row.total_diff_pieces)}
                      </td>
                      <td style={{ padding: "0.45rem 0.55rem" }}>
                        {row.created_at ? String(row.created_at).replace("T", " ").slice(0, 16) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default InventoryChecksPage;
