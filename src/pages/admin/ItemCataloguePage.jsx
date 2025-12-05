// src/pages/admin/ItemCataloguePage.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import api from "../../api/client";

// Empty form template
const EMPTY_FORM = {
  id: null,
  name: "",
  sku: "",
  unit: "",
  category: "",
  pieces_per_unit: 1,
  reorder_level_pieces: 0,
};

function ItemCataloguePage() {
  const [items, setItems] = useState([]);
  const [shops, setShops] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  const isEditing = editingItemId !== null;

  // Item → shops usage map { [itemId]: { count, names, ids } }
  const [itemShopUsage, setItemShopUsage] = useState({});

  const fileInputRef = useRef(null);
  const formCardRef = useRef(null);

  const [activeTab, setActiveTab] = useState("manage");

  // ✅ Pagination/progress (backend default is limit=200)
  const ITEMS_PAGE_LIMIT = 200;
  const [itemsProgress, setItemsProgress] = useState({
    fetching: false,
    fetched: 0,
  });

  // ✅ UI: “Manage shops” dropdown per row
  const [openShopPanelForItemId, setOpenShopPanelForItemId] = useState(null);

  useEffect(() => {
    const onDocClick = (e) => {
      // Close panel when clicking outside
      if (!e.target.closest?.("[data-shop-panel-root='true']")) {
        setOpenShopPanelForItemId(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // ------------------------------------------------
  //  Load items from backend (FETCH ALL PAGES)
  // ------------------------------------------------
  const loadItems = async () => {
    setLoading(true);
    setError("");
    setItemsProgress({ fetching: true, fetched: 0 });

    try {
      let all = [];
      let skip = 0;
      const MAX_PAGES = 2000;

      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await api.get("/items/", {
          params: { skip, limit: ITEMS_PAGE_LIMIT },
        });

        const chunk = Array.isArray(res.data) ? res.data : [];
        all = all.concat(chunk);

        setItemsProgress({ fetching: true, fetched: all.length });

        if (chunk.length < ITEMS_PAGE_LIMIT) break;
        skip += ITEMS_PAGE_LIMIT;
      }

      setItems(all);
    } catch (err) {
      console.error("Error loading items", err);
      setError("Failed to load items from server.");
    } finally {
      setLoading(false);
      setItemsProgress((p) => ({ ...p, fetching: false }));
    }
  };

  const loadShops = async () => {
    try {
      const res = await api.get("/shops/");
      setShops(res.data || []);
    } catch (err) {
      console.error("Error loading shops", err);
      setError((prev) =>
        prev ? prev + " Also failed to load shops." : "Failed to load shops list."
      );
    }
  };

  const loadItemShopUsage = async () => {
    try {
      const res = await api.get("/items/shop-usage");
      const usageArray = res.data || [];

      const map = {};
      for (const entry of usageArray) {
        map[entry.item_id] = {
          count: entry.shop_ids?.length || 0,
          names: entry.shop_names || [],
          ids: entry.shop_ids || [],
        };
      }
      setItemShopUsage(map);
    } catch (err) {
      console.error("Error loading item-shop usage", err);
    }
  };

  useEffect(() => {
    loadItems();
    loadShops();
    loadItemShopUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------
  //  Form handlers
  // ------------------------------------------------
  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingItemId(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const numericFields = ["pieces_per_unit", "reorder_level_pieces"];
    setForm((prev) => ({
      ...prev,
      [name]: numericFields.includes(name) ? Number(value || 0) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku?.trim() || null,
        unit: form.unit?.trim() || null,
        category: form.category?.trim() || null,
        pieces_per_unit: form.pieces_per_unit || 1,
        reorder_level_pieces: Number(form.reorder_level_pieces || 0),
      };

      if (!payload.name || !payload.unit) {
        setError("Name and Unit are required.");
        setSaving(false);
        return;
      }
      if (payload.pieces_per_unit <= 0) {
        setError("Pieces per unit must be greater than 0.");
        setSaving(false);
        return;
      }
      if (payload.reorder_level_pieces < 0) {
        setError("Reorder level (pieces) cannot be negative.");
        setSaving(false);
        return;
      }

      if (isEditing) {
        await api.put(`/items/${editingItemId}`, payload);
        setMessage("Item updated successfully.");
      } else {
        await api.post("/items/", payload);
        setMessage("Item added successfully.");
      }

      resetForm();
      await loadItems();
      await loadItemShopUsage();
    } catch (err) {
      console.error("Error saving item", err);
      const backendMsg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to save item.";
      setError(backendMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (item) => {
    setError("");
    setMessage("");
    setEditingItemId(item.id);
    setForm({
      id: item.id,
      name: item.name || "",
      sku: item.sku || "",
      unit: item.unit || "",
      category: item.category || "",
      pieces_per_unit: item.pieces_per_unit ?? 1,
      reorder_level_pieces: item.reorder_level_pieces ?? 0,
    });

    setActiveTab("manage");

    setTimeout(() => {
      if (formCardRef.current) {
        formCardRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 50);
  };

  const handleCancelEdit = () => {
    resetForm();
    setMessage("Edit cancelled.");
  };

  // ------------------------------------------------
  // Activate / Deactivate
  // ------------------------------------------------
  const handleDeleteClick = async (item) => {
    const desiredStatus = !item.is_active;
    const confirmText = desiredStatus
      ? `Do you want to ACTIVATE "${item.name}" again?`
      : `Are you sure you want to DEACTIVATE "${item.name}"?`;

    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    try {
      setError("");
      setMessage("");
      await api.put(`/items/${item.id}`, { is_active: desiredStatus });

      setMessage(
        desiredStatus
          ? `Item "${item.name}" activated again.`
          : `Item "${item.name}" marked as inactive.`
      );

      await loadItems();
      await loadItemShopUsage();
    } catch (err) {
      console.error("Error toggling item status", err);
      const backendMsg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to update item status.";
      setError(backendMsg);
    }
  };

  // ------------------------------------------------
  // Bulk upload
  // ------------------------------------------------
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setBulkFile(file || null);
    setMessage("");
    setError("");
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      setError("Please choose a CSV file first.");
      return;
    }

    setBulkUploading(true);
    setMessage("");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", bulkFile);

      const res = await api.post("/items/bulk-upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const summary = res.data;
      setMessage(
        `Bulk upload completed: ${summary.created_count} new, ` +
          `${summary.updated_count || 0} updated, ` +
          `${summary.skipped_count} skipped.`
      );

      await loadItems();
      await loadItemShopUsage();

      setBulkFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("Bulk upload error", err);
      setError("Failed to upload CSV. Check console / backend logs.");
    } finally {
      setBulkUploading(false);
    }
  };

  // ------------------------------------------------
  // Search + sort
  // ------------------------------------------------
  const handleSortChange = (field) => {
    if (sortField === field) setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) return "⇅";
    return sortDirection === "asc" ? "▲" : "▼";
  };

  const filteredAndSortedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let data = items;

    if (q) {
      data = data.filter((item) => {
        const name = (item.name || "").toLowerCase();
        const unit = (item.unit || "").toLowerCase();
        const category = (item.category || "").toLowerCase();
        const sku = (item.sku || "").toLowerCase();
        return name.includes(q) || unit.includes(q) || category.includes(q) || sku.includes(q);
      });
    }

    return [...data].sort((a, b) => {
      let aVal, bVal;

      if (sortField === "pieces_per_unit") {
        aVal = a.pieces_per_unit ?? 0;
        bVal = b.pieces_per_unit ?? 0;
      } else if (sortField === "reorder_level_pieces") {
        aVal = a.reorder_level_pieces ?? 0;
        bVal = b.reorder_level_pieces ?? 0;
      } else if (sortField === "category") {
        aVal = (a.category || "").toLowerCase();
        bVal = (b.category || "").toLowerCase();
      } else {
        aVal = (a.name || "").toLowerCase();
        bVal = (b.name || "").toLowerCase();
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [items, searchQuery, sortField, sortDirection]);

  const listSummaryText = useMemo(() => {
    const total = items.length;
    const shown = filteredAndSortedItems.length;
    const q = searchQuery.trim();
    if (!q) return `Total items: ${total}`;
    return `Showing ${shown} of ${total} (filter: "${q}")`;
  }, [items.length, filteredAndSortedItems.length, searchQuery]);

  // ------------------------------------------------
  // Assign / Remove helpers
  // ------------------------------------------------
  const removeUsageLocally = (itemId, shopId) => {
    setItemShopUsage((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;

      const ids = Array.isArray(cur.ids) ? cur.ids : [];
      const names = Array.isArray(cur.names) ? cur.names : [];

      const idx = ids.indexOf(shopId);
      if (idx === -1) return prev;

      const nextIds = ids.filter((id) => id !== shopId);
      const nextNames = names.filter((_, i) => i !== idx);

      return {
        ...prev,
        [itemId]: {
          ids: nextIds,
          names: nextNames,
          count: nextIds.length,
        },
      };
    });
  };

  const handleAssignToShop = async (itemId, shopIdStr) => {
    if (!shopIdStr) return;
    const shopId = Number(shopIdStr);
    if (!shopId) return;

    setError("");
    setMessage("");

    try {
      await api.post(`/items/${itemId}/assign-to-shops`, { shop_ids: [shopId] });

      const shopName = shops.find((s) => s.id === shopId)?.name || `Shop ${shopId}`;
      setMessage(`Item assigned to "${shopName}".`);
      await loadItemShopUsage();
    } catch (err) {
      console.error("Error assigning item to shop", err);
      const backendMsg =
        err?.response?.data?.detail || err?.response?.data?.message || "Failed to add item to shop.";
      setError(backendMsg);
    }
  };

  const handleRemoveFromShop = async (itemId, shopId) => {
    if (!shopId) return;

    setError("");
    setMessage("");

    const shopName = shops.find((s) => s.id === shopId)?.name || `Shop ${shopId}`;

    // optimistic UI
    removeUsageLocally(itemId, shopId);

    const candidates = [
      { method: "post", url: `/items/${itemId}/remove-from-shops`, data: { shop_ids: [shopId] } },
      { method: "post", url: `/items/${itemId}/unassign-from-shops`, data: { shop_ids: [shopId] } },
      { method: "delete", url: `/items/${itemId}/shops/${shopId}` },
      { method: "delete", url: `/items/${itemId}/unassign/${shopId}` },
    ];

    let ok = false;
    for (const c of candidates) {
      try {
        if (c.method === "post") await api.post(c.url, c.data);
        else await api.delete(c.url);
        ok = true;
        break;
      } catch {
        // try next
      }
    }

    if (ok) {
      setMessage(`Removed item from "${shopName}".`);
      await loadItemShopUsage();
      return;
    }

    setMessage(
      `Removed "${shopName}" in the UI. If it returns after refresh, your backend has no remove endpoint yet.`
    );
  };

  // ------------------------------------------------
  // Styles
  // ------------------------------------------------
  const tabsWrapperStyle = {
    display: "inline-flex",
    padding: "0.15rem",
    borderRadius: "9999px",
    backgroundColor: "#e5e7eb",
    marginBottom: "1.5rem",
  };

  const tabButtonBase = {
    border: "none",
    borderRadius: "9999px",
    padding: "0.4rem 1.4rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
    background: "transparent",
    color: "#4b5563",
  };

  const getTabButtonStyle = (tab) =>
    tab === activeTab
      ? { ...tabButtonBase, backgroundColor: "#111827", color: "#ffffff" }
      : tabButtonBase;

  const pillStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.18rem 0.7rem",
    borderRadius: "9999px",
    fontSize: "0.78rem",
    fontWeight: 700,
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #dbeafe",
    maxWidth: "220px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const manageBtnStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.34rem 0.65rem",
    borderRadius: "9999px",
    border: "1px solid #e5e7eb",
    backgroundColor: "#ffffff",
    fontSize: "0.8rem",
    fontWeight: 800,
    color: "#111827",
    cursor: "pointer",
  };

  const panelStyle = {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    zIndex: 20,
    width: "320px",
    borderRadius: "14px",
    border: "1px solid #e5e7eb",
    backgroundColor: "#ffffff",
    boxShadow: "0 20px 40px rgba(15,23,42,0.12)",
    padding: "12px",
  };

  // ------------------------------------------------
  // Render
  // ------------------------------------------------
  return (
    <div style={{ padding: "2.5rem 3rem" }}>
      <h1
        style={{
          fontSize: "2.5rem",
          fontWeight: 800,
          marginBottom: "0.5rem",
          color: "#111827",
          letterSpacing: "-0.03em",
        }}
      >
        Item Catalogue
      </h1>

      <p
        style={{
          color: "#6b7280",
          marginBottom: "1.5rem",
          fontSize: "0.95rem",
          maxWidth: "44rem",
        }}
      >
        Manage all items sold in all ICLAS shops. You can add items one by one,
        update existing ones, or upload from a CSV exported from your Google Sheet.
      </p>

      <div style={{ marginBottom: "1.5rem" }}>
        <div style={tabsWrapperStyle}>
          <button type="button" style={getTabButtonStyle("manage")} onClick={() => setActiveTab("manage")}>
            Manage items
          </button>
          <button type="button" style={getTabButtonStyle("list")} onClick={() => setActiveTab("list")}>
            Items list ({items.length})
          </button>
        </div>
      </div>

      {(message || error) && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem 1rem",
            borderRadius: "0.75rem",
            backgroundColor: error ? "#fef2f2" : "#ecfdf3",
            color: error ? "#b91c1c" : "#166534",
            fontSize: "0.92rem",
          }}
        >
          {error || message}
        </div>
      )}

      {activeTab === "manage" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "3fr 2fr",
            gap: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          {/* Item Form */}
          <div
            ref={formCardRef}
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "1.25rem",
              padding: "1.75rem 2rem",
              boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "0.75rem" }}>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Item</h2>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span
                  style={{
                    padding: "0.2rem 0.7rem",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    backgroundColor: isEditing ? "#e0f2fe" : "#ecfdf5",
                    color: isEditing ? "#0369a1" : "#047857",
                  }}
                >
                  {isEditing ? "Update mode" : "Add mode"}
                </span>

                {isEditing && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    style={{
                      padding: "0.45rem 1rem",
                      borderRadius: "9999px",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "#f9fafb",
                      color: "#374151",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 1.5rem", marginBottom: "1.25rem" }}>
                {/* Name */}
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Name <span style={{ color: "#b91c1c" }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. MUGURUSI 10KG"
                    required
                    style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.95rem" }}
                  />
                </div>

                {/* SKU */}
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    SKU
                  </label>
                  <input
                    type="text"
                    name="sku"
                    value={form.sku}
                    onChange={handleChange}
                    placeholder="Optional code"
                    style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.95rem" }}
                  />
                </div>

                {/* Unit */}
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Unit <span style={{ color: "#b91c1c" }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="unit"
                    value={form.unit}
                    onChange={handleChange}
                    placeholder="e.g. 10 Kg, Box, Crate"
                    required
                    style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.95rem" }}
                  />
                </div>

                {/* Category */}
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Category
                  </label>
                  <input
                    type="text"
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    placeholder="e.g. Sugar, Cooking Oil"
                    style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.95rem" }}
                  />
                </div>

                {/* Pieces per unit */}
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Pieces per unit
                  </label>
                  <input
                    type="number"
                    name="pieces_per_unit"
                    value={form.pieces_per_unit}
                    onChange={handleChange}
                    min={1}
                    style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.95rem" }}
                  />
                </div>

                {/* Reorder */}
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Reorder level (pieces)
                  </label>
                  <input
                    type="number"
                    name="reorder_level_pieces"
                    value={form.reorder_level_pieces}
                    onChange={handleChange}
                    min={0}
                    placeholder="0 = no alert"
                    style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.95rem" }}
                  />
                  <div style={{ marginTop: "0.35rem", fontSize: "0.8rem", color: "#6b7280" }}>
                    If remaining stock is ≤ this number, it appears in “To Buy”.
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  marginTop: "0.5rem",
                  padding: "0.7rem 1.9rem",
                  borderRadius: "9999px",
                  border: "none",
                  backgroundColor: saving ? "#4b6bfb99" : "#4b6bfb",
                  color: "white",
                  fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: "0.98rem",
                }}
              >
                {saving ? (isEditing ? "Saving changes..." : "Saving...") : isEditing ? "Save changes" : "Add Item"}
              </button>
            </form>
          </div>

          {/* Bulk */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "1.25rem",
              padding: "1.75rem 2rem",
              boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            }}
          >
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
              Bulk upload from CSV
            </h2>

            <p style={{ color: "#6b7280", fontSize: "0.95rem", marginBottom: "0.75rem" }}>
              Columns supported:
            </p>
            <p style={{ color: "#111827", fontWeight: 600, fontSize: "0.95rem", marginBottom: "1rem" }}>
              name, sku, unit, category, pieces_per_unit, reorder_level_pieces
            </p>

            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} style={{ marginBottom: "0.75rem" }} />

            <button
              type="button"
              onClick={handleBulkUpload}
              disabled={bulkUploading || !bulkFile}
              style={{
                padding: "0.6rem 1.5rem",
                borderRadius: "9999px",
                border: "none",
                backgroundColor: bulkUploading || !bulkFile ? "#0f766e66" : "#0f766e",
                color: "white",
                fontWeight: 600,
                cursor: bulkUploading || !bulkFile ? "not-allowed" : "pointer",
                fontSize: "0.95rem",
              }}
            >
              {bulkUploading ? "Uploading..." : "Upload CSV"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "list" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "1.25rem",
            padding: "1.75rem 2rem",
            boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            marginBottom: "3rem",
          }}
        >
          {/* Summary + Search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.28rem 0.75rem",
                  borderRadius: "9999px",
                  backgroundColor: "#f3f4f6",
                  border: "1px solid #e5e7eb",
                  color: "#111827",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                }}
              >
                {listSummaryText}
              </span>

              {(loading || itemsProgress.fetching) && (
                <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                  Loading… fetched {itemsProgress.fetched}
                </span>
              )}

              <button
                type="button"
                onClick={() => loadItems()}
                disabled={loading || itemsProgress.fetching}
                style={{
                  padding: "0.32rem 0.8rem",
                  borderRadius: "9999px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: loading || itemsProgress.fetching ? "#f3f4f6" : "#ffffff",
                  color: "#111827",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: loading || itemsProgress.fetching ? "not-allowed" : "pointer",
                }}
                title="Reload all items"
              >
                ↻ Refresh
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.9rem", color: "#4b5563" }}>Search:</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items..."
                style={{
                  padding: "0.4rem 0.6rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #d1d5db",
                  fontSize: "0.9rem",
                  minWidth: "220px",
                }}
              />
            </div>
          </div>

          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "1rem" }}>Items</h2>

          {loading ? (
            <p style={{ color: "#6b7280" }}>Loading items...</p>
          ) : filteredAndSortedItems.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No items match your search.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", color: "#111827" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", color: "#6b7280" }}>
                    <th style={{ padding: "0.55rem 0.75rem", width: "64px" }}>#</th>

                    <th style={{ padding: "0.55rem 0.75rem" }}>
                      <button
                        type="button"
                        onClick={() => handleSortChange("name")}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          margin: 0,
                          cursor: "pointer",
                          color: "#6b7280",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        Name <span style={{ fontSize: "0.7rem" }}>{renderSortIcon("name")}</span>
                      </button>
                    </th>

                    <th style={{ padding: "0.55rem 0.75rem" }}>Unit</th>

                    <th style={{ padding: "0.55rem 0.75rem" }}>
                      <button
                        type="button"
                        onClick={() => handleSortChange("category")}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          margin: 0,
                          cursor: "pointer",
                          color: "#6b7280",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        Category <span style={{ fontSize: "0.7rem" }}>{renderSortIcon("category")}</span>
                      </button>
                    </th>

                    <th style={{ padding: "0.55rem 0.75rem" }}>
                      <button
                        type="button"
                        onClick={() => handleSortChange("pieces_per_unit")}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          margin: 0,
                          cursor: "pointer",
                          color: "#6b7280",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        Pieces / unit <span style={{ fontSize: "0.7rem" }}>{renderSortIcon("pieces_per_unit")}</span>
                      </button>
                    </th>

                    <th style={{ padding: "0.55rem 0.75rem" }}>
                      <button
                        type="button"
                        onClick={() => handleSortChange("reorder_level_pieces")}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          margin: 0,
                          cursor: "pointer",
                          color: "#6b7280",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        Reorder (pcs) <span style={{ fontSize: "0.7rem" }}>{renderSortIcon("reorder_level_pieces")}</span>
                      </button>
                    </th>

                    <th style={{ padding: "0.55rem 0.75rem" }}>Status</th>
                    <th style={{ padding: "0.55rem 0.75rem" }}>Shop</th>
                    <th style={{ padding: "0.55rem 0.75rem" }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredAndSortedItems.map((item, idx) => {
                    const usage = itemShopUsage[item.id] || { names: [], ids: [], count: 0 };
                    const names = usage.names || [];
                    const ids = usage.ids || [];

                    const assignedShops = shops.filter((s) => ids.includes(s.id));
                    const availableShopsToAdd = shops.filter((s) => !ids.includes(s.id));

                    // Show only ONE selected shop by default:
                    const primaryName = names?.[0] || null;
                    const extraCount = Math.max(0, (names?.length || 0) - 1);

                    const isInactive = !item.is_active;
                    const panelOpen = openShopPanelForItemId === item.id;

                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          backgroundColor: isInactive ? "#f9fafb" : "inherit",
                          opacity: isInactive ? 0.85 : 1,
                        }}
                      >
                        <td style={{ padding: "0.55rem 0.75rem", color: "#6b7280" }}>{idx + 1}</td>

                        <td style={{ padding: "0.55rem 0.75rem" }}>
                          <button
                            type="button"
                            onClick={() => handleEditClick(item)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              margin: 0,
                              color: "#1d4ed8",
                              textDecoration: "underline",
                              cursor: "pointer",
                              font: "inherit",
                              fontWeight: 600,
                            }}
                          >
                            {item.name}
                          </button>
                        </td>

                        <td style={{ padding: "0.55rem 0.75rem" }}>{item.unit || "—"}</td>
                        <td style={{ padding: "0.55rem 0.75rem" }}>{item.category || "—"}</td>
                        <td style={{ padding: "0.55rem 0.75rem" }}>{item.pieces_per_unit ?? 1}</td>
                        <td style={{ padding: "0.55rem 0.75rem" }}>{item.reorder_level_pieces ?? 0}</td>

                        <td style={{ padding: "0.55rem 0.75rem" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              padding: "0.18rem 0.7rem",
                              borderRadius: "9999px",
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              backgroundColor: item.is_active ? "#dcfce7" : "#fee2e2",
                              color: item.is_active ? "#166534" : "#b91c1c",
                            }}
                          >
                            <span
                              style={{
                                width: "7px",
                                height: "7px",
                                borderRadius: "9999px",
                                backgroundColor: item.is_active ? "#16a34a" : "#ef4444",
                              }}
                            />
                            {item.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        {/* ✅ Clean “Shop” cell: show only selected, hide actions under ˅ */}
                        <td style={{ padding: "0.55rem 0.75rem" }}>
                          <div
                            data-shop-panel-root="true"
                            style={{
                              position: "relative",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              flexWrap: "wrap",
                              minWidth: "240px",
                            }}
                          >
                            {primaryName ? (
                              <span style={pillStyle} title={(names || []).join(", ")}>
                                {primaryName}
                                {extraCount > 0 && (
                                  <span
                                    style={{
                                      marginLeft: "6px",
                                      padding: "2px 8px",
                                      borderRadius: "9999px",
                                      backgroundColor: "#e5e7eb",
                                      color: "#374151",
                                      fontSize: "0.72rem",
                                      fontWeight: 800,
                                    }}
                                  >
                                    +{extraCount}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span
                                style={{
                                  ...pillStyle,
                                  backgroundColor: "#f3f4f6",
                                  color: "#6b7280",
                                  border: "1px solid #e5e7eb",
                                }}
                              >
                                Not in any shop
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => setOpenShopPanelForItemId((cur) => (cur === item.id ? null : item.id))}
                              style={manageBtnStyle}
                              title="Manage shops"
                            >
                              <span style={{ fontSize: "0.95rem", lineHeight: 1 }}>˅</span>
                              Manage
                            </button>

                            {panelOpen && (
                              <div style={panelStyle}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                                  <div style={{ fontWeight: 800, color: "#111827", fontSize: "0.9rem" }}>Shops for this item</div>
                                  <button
                                    type="button"
                                    onClick={() => setOpenShopPanelForItemId(null)}
                                    style={{
                                      border: "none",
                                      background: "transparent",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                      fontSize: "1rem",
                                      color: "#6b7280",
                                    }}
                                    aria-label="Close"
                                    title="Close"
                                  >
                                    ✕
                                  </button>
                                </div>

                                {/* Assigned list */}
                                {assignedShops.length === 0 ? (
                                  <div style={{ fontSize: "0.85rem", color: "#6b7280", padding: "8px 0" }}>
                                    Not assigned to any shop yet.
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
                                    {assignedShops.map((s) => (
                                      <div
                                        key={s.id}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          gap: "10px",
                                          padding: "8px 10px",
                                          borderRadius: "12px",
                                          border: "1px solid #e5e7eb",
                                          backgroundColor: "#f9fafb",
                                        }}
                                      >
                                        <span style={{ fontSize: "0.86rem", fontWeight: 800, color: "#111827" }}>{s.name}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveFromShop(item.id, s.id)}
                                          style={{
                                            padding: "6px 10px",
                                            borderRadius: "9999px",
                                            border: "1px solid #fca5a5",
                                            backgroundColor: "#fff1f2",
                                            color: "#991b1b",
                                            fontSize: "0.78rem",
                                            fontWeight: 900,
                                            cursor: "pointer",
                                          }}
                                          title={`Remove from ${s.name}`}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Add dropdown */}
                                <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: "10px" }}>
                                  <div style={{ fontSize: "0.82rem", fontWeight: 900, color: "#374151", marginBottom: "6px" }}>
                                    Add to shop
                                  </div>

                                  {availableShopsToAdd.length === 0 ? (
                                    <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Already in all shops.</div>
                                  ) : (
                                    <select
                                      defaultValue=""
                                      onChange={(e) => {
                                        handleAssignToShop(item.id, e.target.value);
                                        e.target.value = "";
                                      }}
                                      style={{
                                        width: "100%",
                                        padding: "10px 10px",
                                        borderRadius: "12px",
                                        border: "1px solid #d1d5db",
                                        backgroundColor: "#ffffff",
                                        fontSize: "0.9rem",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <option value="" disabled>
                                        Select shop…
                                      </option>
                                      {availableShopsToAdd.map((s) => (
                                        <option key={s.id} value={String(s.id)}>
                                          {s.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: "0.55rem 0.75rem" }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(item)}
                            title={item.is_active ? "Deactivate item" : "Activate item"}
                            aria-label={`${item.is_active ? "Deactivate" : "Activate"} ${item.name}`}
                            style={{
                              padding: "0.35rem 0.9rem",
                              borderRadius: "9999px",
                              border: item.is_active ? "1px solid #fecaca" : "1px solid #bbf7d0",
                              backgroundColor: item.is_active ? "#fef2f2" : "#ecfdf5",
                              color: item.is_active ? "#b91c1c" : "#047857",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                            }}
                          >
                            <span aria-hidden="true">{item.is_active ? "⛔" : "✅"}</span>
                            {item.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ItemCataloguePage;
