// FILE: src/pages/admin/ShopsManagementPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/client";

const EMPTY_FORM = {
  id: null,
  name: "",
  location: "",
};

function ShopManagementPage() {
  const [shops, setShops] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingShopId, setEditingShopId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const formCardRef = useRef(null);
  const isEditing = editingShopId !== null;

  // NEW: tabs ("create" or "shops")
  const [activeTab, setActiveTab] = useState("create");

  // ------------------------------------------------
  // Load shops
  // ------------------------------------------------
  const loadShops = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/shops/");
      setShops(res.data || []);
    } catch (err) {
      console.error("Error loading shops", err);
      setError("Failed to load shops from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  // ------------------------------------------------
  // Form helpers
  // ------------------------------------------------
  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingShopId(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
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
        location: form.location.trim() || null,
      };

      if (!payload.name) {
        setError("Shop name is required.");
        setSaving(false);
        return;
      }

      if (isEditing) {
        await api.put(`/shops/${editingShopId}`, payload);
        setMessage("Shop updated successfully.");
      } else {
        await api.post("/shops/", payload);
        setMessage("Shop created successfully.");
      }

      resetForm();
      await loadShops();
    } catch (err) {
      console.error("Error saving shop", err);
      setError("Failed to save shop.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (shop) => {
    setError("");
    setMessage("");
    setEditingShopId(shop.id);
    setForm({
      id: shop.id,
      name: shop.name || "",
      location: shop.location || "",
    });

    // Switch to "Create shop" tab when editing
    setActiveTab("create");

    // Scroll to form after tab is rendered
    setTimeout(() => {
      if (formCardRef.current) {
        formCardRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      } else {
        // Fallback: scroll top
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 0);
  };

  const handleCancelEdit = () => {
    resetForm();
    setMessage("Edit cancelled.");
  };

  // ------------------------------------------------
  // Delete (soft delete)
  // ------------------------------------------------
  const handleDeleteClick = async (shop) => {
    const confirmText = shop.is_active
      ? `Are you sure you want to deactivate "${shop.name}"?`
      : `Shop "${shop.name}" is already inactive. Deactivate again?`;

    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    try {
      setError("");
      setMessage("");
      await api.delete(`/shops/${shop.id}`);
      setMessage(`Shop "${shop.name}" marked as inactive.`);
      await loadShops();
    } catch (err) {
      console.error("Error deleting shop", err);
      setError("Failed to delete shop.");
    }
  };

  // ------------------------------------------------
  // Search
  // ------------------------------------------------
  const filteredShops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return shops;

    return shops.filter((shop) => {
      const name = (shop.name || "").toLowerCase();
      const location = (shop.location || "").toLowerCase();
      return name.includes(q) || location.includes(q);
    });
  }, [shops, searchQuery]);

  // ------------------------------------------------
  // Render
  // ------------------------------------------------
  return (
    <div style={{ padding: "2.5rem 3rem" }}>
      {/* Header */}
      <h1
        style={{
          fontSize: "2.75rem",
          fontWeight: 800,
          marginBottom: "0.75rem",
          color: "#111827",
        }}
      >
        Shops Management
      </h1>
      <p style={{ color: "#6b7280", marginBottom: "1.25rem" }}>
        Manage your ICLAS shops: create new shops, update their details, and
        deactivate shops that are no longer in use.
      </p>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("create")}
          style={{
            padding: "0.45rem 1.4rem",
            borderRadius: "9999px",
            border:
              activeTab === "create"
                ? "none"
                : "1px solid rgba(209,213,219,1)",
            backgroundColor:
              activeTab === "create" ? "#4b6bfb" : "rgba(249,250,251,1)",
            color: activeTab === "create" ? "#ffffff" : "#374151",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow:
              activeTab === "create"
                ? "0 10px 25px rgba(59,130,246,0.35)"
                : "none",
          }}
        >
          Create shop
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("shops")}
          style={{
            padding: "0.45rem 1.4rem",
            borderRadius: "9999px",
            border:
              activeTab === "shops"
                ? "none"
                : "1px solid rgba(209,213,219,1)",
            backgroundColor:
              activeTab === "shops" ? "#4b6bfb" : "rgba(249,250,251,1)",
            color: activeTab === "shops" ? "#ffffff" : "#374151",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow:
              activeTab === "shops"
                ? "0 10px 25px rgba(59,130,246,0.35)"
                : "none",
          }}
        >
          Shops ({shops.length})
        </button>
      </div>

      {(message || error) && (
        <div
          style={{
            marginBottom: "1.5rem",
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

      {/* Top section: form (Create shop tab) */}
      {activeTab === "create" && (
        <div
          ref={formCardRef}
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "1.25rem",
            padding: "1.75rem 2rem",
            boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            marginBottom: "2rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
              gap: "0.75rem",
            }}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
              }}
            >
              Shop
            </h2>

            <div
              style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
            >
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem 1.5rem",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                  }}
                >
                  Shop name <span style={{ color: "#b91c1c" }}>*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. ICLAS Mulindi Shop 1"
                  required
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "0.6rem",
                    border: "1px solid #d1d5db",
                    fontSize: "0.95rem",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                  }}
                >
                  Location
                </label>
                <input
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="e.g. Mulindi Market, Kigali"
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "0.6rem",
                    border: "1px solid #d1d5db",
                    fontSize: "0.95rem",
                  }}
                />
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
              {saving
                ? isEditing
                  ? "Saving changes..."
                  : "Saving..."
                : isEditing
                ? "Save changes"
                : "Add Shop"}
            </button>
          </form>
        </div>
      )}

      {/* Shops table (Shops tab) */}
      {activeTab === "shops" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "1.25rem",
            padding: "1.75rem 2rem",
            boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            marginBottom: "3rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: "0.75rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span style={{ fontSize: "0.9rem", color: "#4b5563" }}>
                Search:
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search shops..."
                style={{
                  padding: "0.4rem 0.6rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #d1d5db",
                  fontSize: "0.9rem",
                  minWidth: "200px",
                }}
              />
            </div>
          </div>

          <h2
            style={{
              fontSize: "1.4rem",
              fontWeight: 700,
              marginBottom: "1rem",
            }}
          >
            Shops
          </h2>

          {loading ? (
            <p style={{ color: "#6b7280" }}>Loading shops...</p>
          ) : filteredShops.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No shops match your search.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.95rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #e5e7eb",
                      color: "#6b7280",
                    }}
                  >
                    <th style={{ padding: "0.5rem 0.75rem" }}>Name</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>Location</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>Status</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShops.map((shop) => (
                    <tr
                      key={shop.id}
                      style={{ borderBottom: "1px solid #f3f4f6" }}
                    >
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        {/* Click name to edit */}
                        <button
                          type="button"
                          onClick={() => handleEditClick(shop)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            margin: 0,
                            color: "#1d4ed8",
                            textDecoration: "underline",
                            cursor: "pointer",
                            font: "inherit",
                          }}
                        >
                          {shop.name}
                        </button>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        {shop.location || "—"}
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.15rem 0.55rem",
                            borderRadius: "9999px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            backgroundColor: shop.is_active
                              ? "#dcfce7"
                              : "#fee2e2",
                            color: shop.is_active ? "#166534" : "#b91c1c",
                          }}
                        >
                          {shop.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(shop)}
                          title="Deactivate shop"
                          aria-label={`Deactivate ${shop.name}`}
                          style={{
                            width: "2rem",
                            height: "2rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "9999px",
                            border: "1px solid #fee2e2",
                            backgroundColor: "#fef2f2",
                            color: "#b91c1c",
                            fontSize: "1rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            opacity: shop.is_active ? 1 : 0.6,
                          }}
                        >
                          🗑️
                        </button>
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

export default ShopManagementPage;
