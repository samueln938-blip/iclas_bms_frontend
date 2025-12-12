// FILE: src/pages/shop/InventoryCheckPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext.jsx";

const STATUS_DRAFT = "DRAFT";
const STATUS_POSTED = "POSTED";

function formatPieces(value) {
  if (value === null || value === undefined) return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatMoney(value) {
  if (value === null || value === undefined) return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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
    return d.toISOString().slice(0, 10);
  } catch {
    return String(iso);
  }
}

function InventoryCheckPage() {
  const { shopId: shopIdParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // -------------------------------
  // Role guard
  // -------------------------------
  const role = String(user?.role || "").toLowerCase();
  const isOwner = role === "owner" || role === "admin";
  const isManager = role === "manager";
  const canUseInventoryCheck = isOwner || isManager;

  // -------------------------------
  // Shop
  // -------------------------------
  const initialShopId = useMemo(() => {
    if (shopIdParam) return Number(shopIdParam);
    if (user?.shop_id) return Number(user.shop_id);
    return null;
  }, [shopIdParam, user]);

  const [shopId] = useState(initialShopId);
  const [shop, setShop] = useState(null);

  // -------------------------------
  // State
  // -------------------------------
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // stock rows (ShopItem), enriched with real item names
  const [stockRows, setStockRows] = useState([]);

  // current draft
  const [currentCheckId, setCurrentCheckId] = useState(null);
  const [checkDate, setCheckDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState("");

  // counted pieces keyed by item_id (only added items)
  const [counts, setCounts] = useState({}); // { [itemId]: "123.45" }

  // pad UI
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [countInput, setCountInput] = useState("");

  // history tab
  const [activeTab, setActiveTab] = useState("enter"); // "enter" | "history"
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [selectedHistoryCheck, setSelectedHistoryCheck] = useState(null);
  const [selectedHistoryLoading, setSelectedHistoryLoading] = useState(false);

  // -------------------------------
  // Derived helpers
  // -------------------------------
  const shopName = shop?.name || `Shop #${shopId}`;

  const stockByItemId = useMemo(() => {
    const map = {};
    for (const row of stockRows) {
      map[row.item_id] = row;
    }
    return map;
  }, [stockRows]);

  const filteredStockRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return stockRows;
    return stockRows.filter((row) => {
      const name = String(row.item_name || "").toLowerCase();
      const sku = String(row.item_sku || "").toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [stockRows, searchQuery]);

  const linesForPayload = useMemo(() => {
    const result = [];
    for (const row of stockRows) {
      const itemId = row.item_id;
      const inputRaw = counts[itemId];
      if (inputRaw === undefined || inputRaw === null || inputRaw === "") continue;

      const counted = Number(inputRaw);
      if (!Number.isFinite(counted) || counted < 0) continue;

      result.push({
        item_id: itemId,
        counted_pieces: counted,
      });
    }
    return result;
  }, [stockRows, counts]);

  const hasAnyLine = linesForPayload.length > 0;

  const displayLines = useMemo(() => {
    return linesForPayload.map((line) => {
      const stock = stockByItemId[line.item_id] || {};
      const systemPieces = Number(stock.remaining_pieces || 0);
      const pricePerPiece = Number(stock.selling_price_per_piece || 0);
      const counted = Number(line.counted_pieces || 0);
      const diffPieces = counted - systemPieces;
      const costDiff = diffPieces * pricePerPiece;

      return {
        ...line,
        item_name: stock.item_name || `Item #${line.item_id}`,
        systemPieces,
        pricePerPiece,
        counted,
        diffPieces,
        costDiff,
      };
    });
  }, [linesForPayload, stockByItemId]);

  const totalsForCurrent = useMemo(() => {
    let totalDiffPieces = 0;
    let totalCostDiff = 0;
    for (const ln of displayLines) {
      totalDiffPieces += ln.diffPieces;
      totalCostDiff += ln.costDiff;
    }
    return { totalDiffPieces, totalCostDiff };
  }, [displayLines]);

  const historyCostView = useMemo(() => {
    if (!selectedHistoryCheck) {
      return { lines: [], totalCostDiff: 0 };
    }

    const lines = selectedHistoryCheck.lines.map((line) => {
      const stock = stockByItemId[line.item_id] || {};
      const pricePerPiece = Number(stock.selling_price_per_piece || 0);
      const diffPieces = Number(line.diff_pieces || 0);
      const costDiff = diffPieces * pricePerPiece;
      return {
        ...line,
        pricePerPiece,
        costDiff,
      };
    });

    const totalCostDiff = lines.reduce(
      (acc, ln) => acc + (Number(ln.costDiff) || 0),
      0
    );

    return { lines, totalCostDiff };
  }, [selectedHistoryCheck, stockByItemId]);

  // -------------------------------
  // Load shop + stock + item names
  // -------------------------------
  useEffect(() => {
    if (!canUseInventoryCheck) return;
    if (!shopId) return;

    const load = async () => {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const [stockRes, shopRes, itemsRes] = await Promise.all([
          api.get(`/shops/${shopId}/stock`),
          api.get(`/shops/${shopId}`),
          api.get("/items", {
            params: { skip: 0, limit: 10000 },
          }),
        ]);

        setShop(shopRes.data || null);

        let items = [];
        const itemsData = itemsRes.data;
        if (Array.isArray(itemsData)) {
          items = itemsData;
        } else if (itemsData && Array.isArray(itemsData.items)) {
          items = itemsData.items;
        }

        const namesById = {};
        const skuById = {};
        for (const it of items) {
          if (it && typeof it.id === "number") {
            if (it.name) namesById[it.id] = it.name;
            if (it.sku) skuById[it.id] = it.sku;
          }
        }

        const rows = stockRes.data || [];

        const normalized = rows.map((row) => {
          const id = row.item_id;
          const fromItemsName = namesById[id];
          const fromItemsSku = skuById[id];

          return {
            ...row,
            item_name:
              fromItemsName ||
              row.item_name ||
              row.item?.name ||
              row.name ||
              `Item #${row.item_id}`,
            item_sku:
              fromItemsSku ||
              row.item_sku ||
              row.item?.sku ||
              row.sku ||
              "",
          };
        });

        setStockRows(normalized);
      } catch (err) {
        console.error("Error loading stock / shop / item names:", err);
        setError(
          err?.response?.data?.detail ||
            "Failed to load stock and item names for this shop."
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [shopId, canUseInventoryCheck]);

  // -------------------------------
  // Load history summary
  // -------------------------------
  const loadHistory = async () => {
    if (!canUseInventoryCheck) return;
    if (!shopId) return;

    setHistoryLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await api.get("/inventory-checks/summary", {
        params: {
          shop_id: shopId,
          skip: 0,
          limit: 100,
        },
      });
      setHistoryRows(res.data || []);
    } catch (err) {
      console.error("Error loading inventory checks history:", err);
      setError(
        err?.response?.data?.detail ||
          "Failed to load inventory checks history."
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

  // -------------------------------
  // Load single check for details
  // -------------------------------
  const handleHistoryRowClick = async (row) => {
    setSelectedHistoryCheck(null);
    setSelectedHistoryLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await api.get(`/inventory-checks/${row.id}`);
      setSelectedHistoryCheck(res.data || null);
    } catch (err) {
      console.error("Error loading inventory check details:", err);
      setError(
        err?.response?.data?.detail ||
          "Failed to load inventory check details."
      );
    } finally {
      setSelectedHistoryLoading(false);
    }
  };

  // -------------------------------
  // Pad input handlers
  // -------------------------------
  const handleItemClick = (itemId) => {
    setSelectedItemId(itemId);
    setError("");
    setMessage("");
  };

  const handleCountChange = (itemId, value) => {
    setCounts((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const handleAddItem = () => {
    if (!selectedItemId) {
      setError("Select an item from the list first.");
      setMessage("");
      return;
    }
    if (countInput === "" || Number(countInput) < 0) {
      setError("Enter a valid counted quantity (>= 0).");
      setMessage("");
      return;
    }

    const numericId = Number(selectedItemId);
    const stock = stockByItemId[numericId];
    if (!stock) {
      setError("Selected item not found in stock.");
      setMessage("");
      return;
    }

    setError("");
    setMessage("");

    setCounts((prev) => ({
      ...prev,
      [numericId]: countInput,
    }));

    // keep selection, clear physical count
    setCountInput("");
  };

  const handleRemoveLine = (itemId) => {
    setCounts((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
  };

  // -------------------------------
  // Save Draft
  // -------------------------------
  const handleSaveDraft = async () => {
    if (!shopId) {
      setError("No shop selected.");
      return;
    }
    if (!hasAnyLine) {
      setError("Add at least one item with counted pieces before saving.");
      return;
    }

    setSavingDraft(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        id: currentCheckId,
        shop_id: shopId,
        check_date: checkDate,
        notes: notes || null,
        lines: linesForPayload,
      };

      const res = await api.post("/inventory-checks/draft", payload);
      const data = res.data;

      setCurrentCheckId(data.id);
      setMessage(
        data.status === STATUS_POSTED
          ? "Inventory check has already been posted."
          : "Inventory check draft saved."
      );
    } catch (err) {
      console.error("Error saving inventory check draft:", err);
      setError(
        err?.response?.data?.detail || "Failed to save inventory check draft."
      );
    } finally {
      setSavingDraft(false);
    }
  };

  // -------------------------------
  // Post (apply) check
  // -------------------------------
  const handlePostCheck = async () => {
    if (!currentCheckId) {
      setError("Save a draft first before posting.");
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
      const res = await api.post(`/inventory-checks/${currentCheckId}/post`);
      const data = res.data || null;

      setMessage("Inventory check posted and stock updated.");
      setCurrentCheckId(data?.id || currentCheckId);

      // After posting, reload history + stock
      await Promise.all([loadHistory(), api.get(`/shops/${shopId}/stock`)])
        .then(([historyRes, stockRes]) => {
          setHistoryRows(historyRes.data || []);
          const rows = stockRes.data || [];
          const normalized = rows.map((row) => ({
            ...row,
            item_name:
              row.item_name || row.item?.name || row.name || `Item #${row.item_id}`,
            item_sku: row.item_sku || row.item?.sku || row.sku || "",
          }));
          setStockRows(normalized);
        })
        .catch((err) => {
          console.error("Post succeeded but reload failed:", err);
        });
    } catch (err) {
      console.error("Error posting inventory check:", err);
      setError(
        err?.response?.data?.detail || "Failed to post inventory check."
      );
    } finally {
      setPosting(false);
    }
  };

  // -------------------------------
  // Unauthorized / no shop
  // -------------------------------
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
          No shop selected. Open this page from a shop context (e.g.
          /shops/1/inventory-checks).
        </p>
      </div>
    );
  }

  // -------------------------------
  // Render
  // -------------------------------
  return (
    <div style={{ padding: "2.2rem 2.6rem" }}>
      {/* Back link like Purchases page */}
      <button
        type="button"
        onClick={() => navigate(`/shops/${shopId}/workspace`)}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          marginBottom: "0.6rem",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          color: "#2563eb",
          fontSize: "0.9rem",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: "1.1rem" }}>←</span>
        <span>Back to shop workspace</span>
      </button>

      {/* Header like Purchases: title + shop name under it */}
      <h1
        style={{
          fontSize: "2.8rem",
          fontWeight: 800,
          marginBottom: "0.3rem",
          color: "#111827",
        }}
      >
        Inventory check
      </h1>

      <div
        style={{
          color: "#2563eb",
          fontWeight: 600,
          marginBottom: "1.0rem",
          fontSize: "1rem",
        }}
      >
        {shopName}
      </div>

      {/* Tabs (Enter / History) aligned to the right, like pills */}
      <div
        style={{
          marginBottom: "1.2rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        <div
          style={{
            padding: "0.28rem 0.75rem",
            borderRadius: "999px",
            backgroundColor: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1d4ed8",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          Shop ID: #{shopId}
        </div>

        {currentCheckId && (
          <div
            style={{
              padding: "0.28rem 0.75rem",
              borderRadius: "999px",
              backgroundColor: "#ecfdf3",
              border: "1px solid #bbf7d0",
              color: "#166534",
              fontWeight: 600,
              fontSize: "0.9rem",
            }}
          >
            Draft ID: {currentCheckId}
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={() => setActiveTab("enter")}
            style={{
              padding: "0.45rem 1.35rem",
              borderRadius: "999px",
              border:
                activeTab === "enter"
                  ? "none"
                  : "1px solid rgba(209,213,219,1)",
              backgroundColor:
                activeTab === "enter" ? "#0f2580" : "rgba(249,250,251,1)",
              color: activeTab === "enter" ? "#ffffff" : "#374151",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow:
                activeTab === "enter"
                  ? "0 10px 25px rgba(15,37,128,0.35)"
                  : "none",
            }}
          >
            Enter counts
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            style={{
              padding: "0.45rem 1.35rem",
              borderRadius: "999px",
              border:
                activeTab === "history"
                  ? "none"
                  : "1px solid rgba(209,213,219,1)",
              backgroundColor:
                activeTab === "history" ? "#0f2580" : "rgba(249,250,251,1)",
              color: activeTab === "history" ? "#ffffff" : "#374151",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow:
                activeTab === "history"
                  ? "0 10px 25px rgba(15,37,128,0.35)"
                  : "none",
            }}
          >
            History & differences
          </button>
        </div>
      </div>

      {(message || error) && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: "0.75rem",
            backgroundColor: error ? "#fef2f2" : "#ecfdf3",
            color: error ? "#b91c1c" : "#166534",
            fontSize: "0.95rem",
          }}
        >
          {error || message}
        </div>
      )}

      {/* TAB: Enter counts */}
      {activeTab === "enter" && (
        <div>
          {/* Date + notes row (like Purchases filters row) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "1rem",
              marginBottom: "1.2rem",
              alignItems: "center",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  marginBottom: "0.3rem",
                }}
              >
                Inventory check date
              </label>
              <input
                type="date"
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "999px",
                  border: "1px solid #d1d5db",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  marginBottom: "0.3rem",
                }}
              >
                Notes (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Full stock count at end of month"
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "999px",
                  border: "1px solid #d1d5db",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            <div />
          </div>

          {/* Pad container – styled like Purchases pad */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "1.4rem",
              padding: "1.4rem 1.6rem",
              boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
              marginBottom: "1.2rem",
            }}
          >
            <div
              style={{
                marginBottom: "0.9rem",
                fontWeight: 600,
                fontSize: "0.92rem",
                color: "#111827",
              }}
            >
              Pad: select item, see system stock, enter physical pieces, then
              add to list
            </div>

            {/* Search + system preview + counted input row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 2.4fr) minmax(0, 1.5fr) minmax(0, 1.4fr)",
                gap: "1rem",
                alignItems: "center",
                marginBottom: "0.9rem",
              }}
            >
              {/* Search input – type initials like Purchases */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.3rem",
                  }}
                >
                  Type item name to search…
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type item name or SKU…"
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.9rem",
                    borderRadius: "999px",
                    border: "1px solid #d1d5db",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              {/* System preview */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.3rem",
                  }}
                >
                  System pieces & price
                </label>
                {selectedItemId ? (
                  (() => {
                    const stock = stockByItemId[selectedItemId] || {};
                    return (
                      <div
                        style={{
                          borderRadius: "1rem",
                          border: "1px solid #e5e7eb",
                          padding: "0.6rem 0.9rem",
                          fontSize: "0.86rem",
                          backgroundColor: "#f9fafb",
                        }}
                      >
                        <div>
                          System:{" "}
                          <b>
                            {formatPieces(stock.remaining_pieces || 0)} pcs
                          </b>
                        </div>
                        <div style={{ marginTop: 2 }}>
                          Price / piece:{" "}
                          <b>
                            {formatMoney(stock.selling_price_per_piece || 0)}{" "}
                            RWF
                          </b>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div
                    style={{
                      borderRadius: "1rem",
                      border: "1px solid #e5e7eb",
                      padding: "0.6rem 0.9rem",
                      fontSize: "0.86rem",
                      backgroundColor: "#f9fafb",
                      color: "#9ca3af",
                    }}
                  >
                    Select an item below to see system stock.
                  </div>
                )}
              </div>

              {/* Physical pieces + Add item */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.3rem",
                  }}
                >
                  Physical (counted) pieces
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={countInput}
                    onChange={(e) => setCountInput(e.target.value)}
                    placeholder="e.g. 120"
                    style={{
                      flex: 1,
                      padding: "0.6rem 0.8rem",
                      borderRadius: "999px",
                      border: "1px solid #d1d5db",
                      fontSize: "0.9rem",
                      textAlign: "right",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddItem}
                    style={{
                      padding: "0.6rem 1.4rem",
                      borderRadius: "999px",
                      border: "none",
                      backgroundColor: "#2563eb",
                      color: "#ffffff",
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Add item
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable item list like Purchases */}
            <div
              style={{
                maxHeight: "260px",
                overflow: "auto",
                borderRadius: "1.1rem",
                border: "1px solid #e5e7eb",
              }}
            >
              {loading ? (
                <div
                  style={{
                    padding: "0.9rem 1rem",
                    fontSize: "0.9rem",
                    color: "#6b7280",
                  }}
                >
                  Loading current stock…
                </div>
              ) : filteredStockRows.length === 0 ? (
                <div
                  style={{
                    padding: "0.9rem 1rem",
                    fontSize: "0.9rem",
                    color: "#6b7280",
                  }}
                >
                  No stock items found for this shop.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      padding: "0.5rem 1rem",
                      fontSize: "0.82rem",
                      color: "#9ca3af",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    {filteredStockRows.length} items in dropdown after filter.
                    Type initials above to get to your item quickly.
                  </div>
                  {filteredStockRows.map((row) => {
                    const isSelected = selectedItemId === row.item_id;
                    const systemPieces = Number(row.remaining_pieces || 0);

                    return (
                      <button
                        key={row.item_id}
                        type="button"
                        onClick={() => handleItemClick(row.item_id)}
                        style={{
                          width: "100%",
                          border: "none",
                          borderBottom: "1px solid #f3f4f6",
                          backgroundColor: isSelected ? "#eef2ff" : "#ffffff",
                          padding: "0.7rem 1rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "0.9rem",
                              fontWeight: 600,
                              color: "#111827",
                            }}
                          >
                            {row.item_name}
                          </div>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#6b7280",
                              marginTop: 2,
                            }}
                          >
                            ID: {row.item_id}
                            {row.item_sku ? ` · SKU: ${row.item_sku}` : ""}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            color: "#2563eb",
                          }}
                        >
                          {formatPieces(systemPieces)} pcs
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Save / Post buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              marginBottom: "0.9rem",
            }}
          >
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingDraft || loading || !hasAnyLine}
              style={{
                padding: "0.6rem 1.6rem",
                borderRadius: "999px",
                border: "none",
                backgroundColor:
                  savingDraft || loading || !hasAnyLine
                    ? "#9ca3af"
                    : "#111827",
                color: "#ffffff",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor:
                  savingDraft || loading || !hasAnyLine
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {savingDraft ? "Saving draft..." : "Save draft"}
            </button>

            <button
              type="button"
              onClick={handlePostCheck}
              disabled={posting || !currentCheckId}
              style={{
                padding: "0.6rem 1.8rem",
                borderRadius: "999px",
                border: "none",
                backgroundColor:
                  posting || !currentCheckId ? "#6b7280" : "#16a34a",
                color: "#ffffff",
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor:
                  posting || !currentCheckId ? "not-allowed" : "pointer",
              }}
            >
              {posting ? "Posting..." : "Post inventory check"}
            </button>
          </div>

          {/* Counted items table */}
          {displayLines.length === 0 ? (
            <p style={{ color: "#6b7280" }}>
              No items added yet. Use the pad above: select item, enter physical
              pieces, and click <b>Add item</b>.
            </p>
          ) : (
            <>
              <div
                style={{
                  marginBottom: "0.6rem",
                  fontSize: "0.9rem",
                  color: "#4b5563",
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <span>
                  <b>{displayLines.length}</b> item
                  {displayLines.length > 1 ? "s" : ""} in this inventory check.
                </span>
                <span>
                  Total pieces diff:{" "}
                  <b>{formatDiff(totalsForCurrent.totalDiffPieces)}</b> ·
                  Approx. total cost diff:{" "}
                  <b>{formatMoney(totalsForCurrent.totalCostDiff)} RWF</b>
                </span>
              </div>

              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "1.1rem",
                  padding: "1rem 1.2rem",
                  boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
                }}
              >
                <div style={{ maxHeight: "65vh", overflow: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.9rem",
                      minWidth: "820px",
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
                            fontWeight: 600,
                          }}
                        >
                          Item
                        </th>
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "right",
                            fontWeight: 600,
                          }}
                        >
                          System pieces
                        </th>
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "right",
                            fontWeight: 600,
                          }}
                        >
                          Price / piece
                        </th>
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "right",
                            fontWeight: 600,
                          }}
                        >
                          Counted pieces
                        </th>
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "right",
                            fontWeight: 600,
                          }}
                        >
                          Difference
                        </th>
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "right",
                            fontWeight: 600,
                          }}
                        >
                          Cost diff (approx.)
                        </th>
                        <th
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "center",
                            fontWeight: 600,
                          }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayLines.map((row) => (
                        <tr
                          key={row.item_id}
                          style={{ borderBottom: "1px solid #f3f4f6" }}
                        >
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              fontWeight: 500,
                              color: "#111827",
                            }}
                          >
                            {row.item_name}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              textAlign: "right",
                            }}
                          >
                            {formatPieces(row.systemPieces)}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              textAlign: "right",
                            }}
                          >
                            {formatMoney(row.pricePerPiece)} RWF
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              textAlign: "right",
                            }}
                          >
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={counts[row.item_id] ?? row.counted}
                              onChange={(e) =>
                                handleCountChange(row.item_id, e.target.value)
                              }
                              style={{
                                width: "110px",
                                padding: "0.32rem 0.45rem",
                                borderRadius: "999px",
                                border: "1px solid #d1d5db",
                                fontSize: "0.85rem",
                                textAlign: "right",
                              }}
                            />
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              textAlign: "right",
                              fontWeight: 600,
                              color:
                                row.diffPieces === 0
                                  ? "#6b7280"
                                  : row.diffPieces > 0
                                  ? "#16a34a"
                                  : "#b91c1c",
                            }}
                          >
                            {formatDiff(row.diffPieces)}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              textAlign: "right",
                              fontWeight: 600,
                              color:
                                row.costDiff === 0
                                  ? "#6b7280"
                                  : row.costDiff > 0
                                  ? "#16a34a"
                                  : "#b91c1c",
                            }}
                          >
                            {formatMoney(row.costDiff)} RWF
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.6rem",
                              textAlign: "center",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(row.item_id)}
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "#b91c1c",
                                fontSize: "0.85rem",
                                cursor: "pointer",
                              }}
                            >
                              Remove
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
        </div>
      )}

      {/* TAB: History & differences */}
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
              <div style={{ maxHeight: "65vh", overflow: "auto" }}>
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
                  <div style={{ marginTop: "0.4rem" }}>
                    <b>Total cost difference (approx.):</b>{" "}
                    {formatMoney(historyCostView.totalCostDiff)} RWF
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#9ca3af",
                      marginTop: "0.1rem",
                    }}
                  >
                    Based on current price/piece; historical cost may differ
                    slightly.
                  </div>
                </div>

                <div style={{ maxHeight: "55vh", overflow: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.86rem",
                      minWidth: "620px",
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
                        <th
                          style={{
                            padding: "0.45rem 0.55rem",
                            textAlign: "right",
                          }}
                        >
                          Price / piece
                        </th>
                        <th
                          style={{
                            padding: "0.45rem 0.55rem",
                            textAlign: "right",
                          }}
                        >
                          Cost diff (approx.)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyCostView.lines.map((line) => (
                        <tr
                          key={line.id}
                          style={{ borderBottom: "1px solid #f3f4f6" }}
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
                          <td
                            style={{
                              padding: "0.45rem 0.55rem",
                              textAlign: "right",
                            }}
                          >
                            {formatMoney(line.pricePerPiece || 0)} RWF
                          </td>
                          <td
                            style={{
                              padding: "0.45rem 0.55rem",
                              textAlign: "right",
                              fontWeight: 600,
                              color:
                                Number(line.costDiff || 0) === 0
                                  ? "#6b7280"
                                  : Number(line.costDiff || 0) > 0
                                  ? "#16a34a"
                                  : "#b91c1c",
                            }}
                          >
                            {formatMoney(line.costDiff || 0)} RWF
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
