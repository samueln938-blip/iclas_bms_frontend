// FILE: src/pages/admin/UserManagementPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext.jsx";

const ROLE_OPTIONS = [
  { value: "OWNER", label: "Owner" },
  { value: "MANAGER", label: "Manager" },
  { value: "CASHIER", label: "Cashier" },
];

const EMPTY_FORM = {
  id: null,
  first_name: "",
  last_name: "",
  national_id: "",
  username: "",
  role: "CASHIER",
  shop_id: "",
  is_active: true,
  password: "",
  confirm_password: "",
};

function readCurrentRoleFromStorage() {
  try {
    const raw = localStorage.getItem("iclas_auth");
    if (!raw) return "";
    const parsed = JSON.parse(raw);

    const role =
      parsed?.user?.role ||
      parsed?.role ||
      parsed?.user_role ||
      parsed?.profile?.role ||
      "";

    return String(role || "").toUpperCase();
  } catch {
    return "";
  }
}

function makeUsername(first, last) {
  const f = String(first || "").trim().toLowerCase();
  const l = String(last || "").trim().toLowerCase();
  const base = [f, l].filter(Boolean).join(".");
  if (!base) return "";

  // keep letters/numbers/dot/underscore only, collapse dots
  return base
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function UserManagementPage() {
  const { user } = useAuth();

  const [shops, setShops] = useState([]);
  const [users, setUsers] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // quick inline save (table shop change)
  const [quickSavingUserId, setQuickSavingUserId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Password reset result (edit-only)
  const [tempPassword, setTempPassword] = useState("");

  // Role detection
  const [currentRole, setCurrentRole] = useState("");

  // Track whether user manually edited username (for auto-fill behavior)
  const [usernameTouched, setUsernameTouched] = useState(false);

  const isOwnerViewer = currentRole === "OWNER";
  const isManagerViewer = currentRole === "MANAGER";
  const readOnly = isManagerViewer; // manager can only read this page

  // main tabs: "create" or "list"
  const [tab, setTab] = useState("list");

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  const shopMap = useMemo(() => {
    const m = new Map();
    (shops || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [shops]);

  const getShopName = (shopId) => {
    if (!shopId) return "—";
    const shop = shopMap.get(shopId);
    return shop ? shop.name : `Shop #${shopId}`;
  };

  const suggestedUsername = useMemo(() => {
    // for new user creation, auto-suggest username as first.last
    return makeUsername(form.first_name, form.last_name);
  }, [form.first_name, form.last_name]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [shopsRes, usersRes] = await Promise.all([
        api.get("/shops/", { params: { only_active: true } }),
        api.get("/users/"),
      ]);

      setShops(shopsRes.data || []);
      setUsers(usersRes.data || []);
    } catch (err) {
      console.error("Error loading user management data:", err);
      const msg =
        err?.response?.status === 401
          ? "Unauthorized. Log in as OWNER or MANAGER."
          : err?.response?.data?.detail ||
            "Failed to load users or shops. Check the backend permissions.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ Role comes from AuthContext (same source as AppLayout)
  // Fallback to localStorage only if user is not ready yet.
  useEffect(() => {
    const roleFromContext = String(user?.role || "").toUpperCase();
    if (roleFromContext) {
      setCurrentRole(roleFromContext);
      return;
    }
    const roleFromStorage = readCurrentRoleFromStorage();
    setCurrentRole(roleFromStorage);
  }, [user?.role]);

  // Set default tab by role
  useEffect(() => {
    setTab(isOwnerViewer ? "create" : "list");
  }, [isOwnerViewer]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Auto-fill username for NEW user while typing names (unless user manually edits username)
  useEffect(() => {
    if (readOnly) return;
    if (form.id) return; // only new user
    if (usernameTouched) return;
    setForm((prev) => ({
      ...prev,
      username: suggestedUsername,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedUsername, form.id, readOnly]);

  const startCreateNew = () => {
    if (readOnly) return;
    resetMessages();
    setTempPassword("");
    setUsernameTouched(false);
    setForm(EMPTY_FORM);
    setTab("create");
  };

  const startEdit = (u) => {
    if (readOnly) return;
    resetMessages();
    setTempPassword("");
    setUsernameTouched(true); // keep username stable in edit mode

    setForm({
      id: u.id,
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      national_id: u.national_id || "",
      username: u.username || "",
      role: u.role || "CASHIER",
      shop_id: u.shop_id ?? "",
      is_active: !!u.is_active,
      password: "",
      confirm_password: "",
    });

    setTab("create");
  };

  const handleChange = (e) => {
    if (readOnly) return;
    resetMessages();
    const { name, value, type, checked } = e.target;

    if (name === "username") setUsernameTouched(true);

    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const validateBeforeSubmit = () => {
    if (readOnly) return "This page is read-only for MANAGER.";

    if (!form.first_name.trim() || !form.last_name.trim()) {
      return "First name and last name are required.";
    }
    if (!ROLE_OPTIONS.some((r) => r.value === form.role)) {
      return "Invalid role.";
    }

    // CASHIER must have a primary shop
    if (form.role === "CASHIER" && (form.shop_id === "" || form.shop_id == null)) {
      return "Cashier must be assigned to a shop.";
    }

    // For new user: password required
    if (!form.id) {
      if (!form.password) return "Password is required for a new user.";
      if (form.password !== form.confirm_password) return "Password and confirmation do not match.";
    }

    return null;
  };

  const buildPayload = () => {
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      national_id: form.national_id ? form.national_id.trim() : null,
      role: form.role,
      shop_id: form.shop_id === "" ? null : Number(form.shop_id),
    };

    // Managers are GLOBAL NOW → do not send shop_ids at all.
    // shop_id is just a "default/primary" shop (optional).

    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    resetMessages();
    setTempPassword("");

    const validationError = validateBeforeSubmit();
    if (validationError) {
      setError(validationError);
      return;
    }

    const basePayload = buildPayload();

    setSaving(true);
    try {
      if (form.id) {
        // UPDATE existing user (PATCH /users/{id}) (OWNER only)
        const payload = {
          ...basePayload,
          is_active: form.is_active,
        };
        await api.patch(`/users/${form.id}`, payload);
        setSuccess("User updated successfully.");
      } else {
        // CREATE new user (POST /users/) (OWNER only)
        const username =
          (form.username || "").trim().toLowerCase() ||
          suggestedUsername ||
          null;

        const payload = {
          ...basePayload,
          username,
          password: form.password,
        };
        await api.post("/users/", payload);
        setSuccess("User created successfully.");
      }

      // reload users
      const usersRes = await api.get("/users/");
      setUsers(usersRes.data || []);

      // clear passwords (and reset fully if new user)
      setForm((prev) =>
        form.id ? { ...prev, password: "", confirm_password: "" } : { ...EMPTY_FORM }
      );
      setUsernameTouched(false);
    } catch (err) {
      console.error("Error saving user:", err);
      const backendDetail =
        err?.response?.data?.detail || err?.response?.data?.message || err?.message;
      setError(backendDetail || "Failed to save user.");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickCashierShopChange = async (userId, newShopId) => {
    if (readOnly) return;

    resetMessages();
    setQuickSavingUserId(userId);

    try {
      const sid = newShopId === "" ? null : Number(newShopId);
      if (!sid) {
        setError("Cashier must be assigned to a shop.");
        return;
      }

      await api.patch(`/users/${userId}`, { shop_id: sid });
      setSuccess("Cashier shop updated.");

      const usersRes = await api.get("/users/");
      setUsers(usersRes.data || []);
    } catch (err) {
      console.error("Quick change cashier shop error:", err);
      const backendDetail =
        err?.response?.data?.detail || err?.response?.data?.message || err?.message;
      setError(backendDetail || "Failed to update cashier shop.");
    } finally {
      setQuickSavingUserId(null);
    }
  };

  const handleResetPassword = async () => {
    if (readOnly) return;

    resetMessages();
    setTempPassword("");

    if (!form.id) return;

    const yes = window.confirm(
      "Reset this user's password? A temporary password will be generated."
    );
    if (!yes) return;

    try {
      const res = await api.post(`/users/${form.id}/reset-password`);
      const p = res?.data?.temporary_password || "";
      setTempPassword(p);
      setSuccess("Password reset successfully. Temporary password shown below.");
    } catch (err) {
      console.error("Reset password error:", err);
      const backendDetail =
        err?.response?.data?.detail || err?.response?.data?.message || err?.message;
      setError(backendDetail || "Failed to reset password.");
    }
  };

  const copyTempPassword = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setSuccess("Temporary password copied.");
    } catch {
      setError("Could not copy. Please copy manually.");
    }
  };

  // ---------- Simple inline styles ----------
  const panelStyle = {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "20px 24px",
    boxShadow: "0 10px 30px rgba(15, 37, 128, 0.08)",
    maxWidth: 820,
    margin: "0 auto",
  };

  const labelStyle = {
    fontSize: "14px",
    fontWeight: 600,
    marginBottom: "4px",
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    boxSizing: "border-box",
  };

  const smallText = {
    fontSize: "12px",
    color: "#6b7280",
  };

  const tabsBarStyle = {
    display: "inline-flex",
    gap: 4,
    backgroundColor: "#f3f4f6",
    padding: 2,
    borderRadius: 999,
    marginBottom: 20,
  };

  const tabBaseStyle = {
    padding: "6px 18px",
    borderRadius: 999,
    border: "1px solid transparent",
    fontSize: 14,
    cursor: "pointer",
    backgroundColor: "transparent",
  };

  const tabActiveStyle = {
    backgroundColor: "#0f2580",
    color: "#ffffff",
    borderColor: "#0f2580",
    fontWeight: 600,
  };

  const tabInactiveStyle = {
    backgroundColor: "#ffffff",
    color: "#4b5563",
    borderColor: "#d1d5db",
  };

  const chipStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
    fontSize: 12,
    color: "#374151",
    marginRight: 6,
    marginBottom: 6,
    whiteSpace: "nowrap",
  };

  const roleLabel = currentRole || "UNKNOWN";

  return (
    <div>
      <h1
        style={{
          fontSize: "32px",
          fontWeight: 800,
          marginBottom: 4,
          textAlign: "center",
        }}
      >
        User Management
      </h1>

      <p style={{ marginBottom: 10, color: "#4b5563", textAlign: "center" }}>
        {readOnly ? (
          <>
            You are logged in as <b>MANAGER</b>. This page is <b>read-only</b>.
          </>
        ) : isOwnerViewer ? (
          <>
            You are logged in as <b>OWNER</b>. You can create and manage users.
          </>
        ) : (
          <>
            Logged in role: <b>{roleLabel}</b>. If you expected OWNER, log out and log in again.
          </>
        )}
      </p>

      <p style={{ marginBottom: 24, color: "#4b5563", textAlign: "center" }}>
        Note: <b>Managers automatically have access to ALL shops</b>. The “Primary shop”
        is only a default shop to open first (optional).
      </p>

      {loading ? (
        <div style={{ textAlign: "center" }}>Loading users and shops…</div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={tabsBarStyle}>
              {isOwnerViewer && (
                <button
                  type="button"
                  onClick={() => setTab("create")}
                  style={{
                    ...tabBaseStyle,
                    ...(tab === "create" ? tabActiveStyle : tabInactiveStyle),
                  }}
                >
                  Create / Edit
                </button>
              )}
              <button
                type="button"
                onClick={() => setTab("list")}
                style={{
                  ...tabBaseStyle,
                  ...(tab === "list" ? tabActiveStyle : tabInactiveStyle),
                }}
              >
                Existing users ({users.length})
              </button>
            </div>
          </div>

          {/* Alerts */}
          {(error || success) && (
            <div style={{ margin: "0 auto 12px", maxWidth: 820 }}>
              {error && (
                <div
                  style={{
                    marginBottom: 8,
                    padding: "8px 12px",
                    borderRadius: 10,
                    backgroundColor: "#fee2e2",
                    color: "#b91c1c",
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}
              {success && (
                <div
                  style={{
                    marginBottom: 8,
                    padding: "8px 12px",
                    borderRadius: 10,
                    backgroundColor: "#dcfce7",
                    color: "#166534",
                    fontSize: 13,
                  }}
                >
                  {success}
                </div>
              )}
            </div>
          )}

          {/* CREATE / EDIT (OWNER ONLY) */}
          {tab === "create" && isOwnerViewer && (
            <div style={panelStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                  {form.id ? "Edit user" : "Create new user"}
                </h2>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={loadAll}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      backgroundColor: "#ffffff",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                    title="Reload users & shops"
                  >
                    Refresh
                  </button>

                  {form.id && (
                    <button
                      type="button"
                      onClick={startCreateNew}
                      style={{
                        border: "none",
                        background: "none",
                        color: "#2563eb",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      + New user
                    </button>
                  )}
                </div>
              </div>

              <form
                onSubmit={handleSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {/* Names */}
                <div>
                  <div style={labelStyle}>First name</div>
                  <input
                    type="text"
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <div style={labelStyle}>Last name</div>
                  <input
                    type="text"
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                    style={inputStyle}
                    required
                  />
                </div>

                {/* National ID */}
                <div>
                  <div style={labelStyle}>National ID (optional)</div>
                  <input
                    type="text"
                    name="national_id"
                    value={form.national_id}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </div>

                {/* Role */}
                <div>
                  <div style={labelStyle}>Role</div>
                  <select
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <div style={smallText}>
                    MANAGER = global access to all shops. CASHIER must be assigned to one shop.
                  </div>
                </div>

                {/* Primary Shop */}
                <div>
                  <div style={labelStyle}>
                    {form.role === "CASHIER" ? "Assigned shop (required)" : "Primary shop (optional)"}
                  </div>
                  <select
                    name="shop_id"
                    value={form.shop_id}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">
                      {form.role === "CASHIER" ? "— Select shop —" : "— No specific shop —"}
                    </option>
                    {shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Username */}
                <div>
                  <div style={labelStyle}>Username</div>
                  <input
                    type="text"
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    style={inputStyle}
                    disabled={!!form.id}
                    required={!form.id}
                    placeholder="first.last"
                  />
                  <div style={smallText}>
                    Default is <b>first.last</b>. You can edit it before saving (new user only).
                  </div>
                </div>

                {/* Active flag (edit only) */}
                {form.id && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      id="is_active"
                      name="is_active"
                      checked={form.is_active}
                      onChange={handleChange}
                    />
                    <label htmlFor="is_active" style={smallText}>
                      User is active
                    </label>
                  </div>
                )}

                {/* Password fields (new user only) */}
                {!form.id && (
                  <>
                    <div>
                      <div style={labelStyle}>
                        Password{" "}
                        <span style={{ fontWeight: 400, fontSize: 12 }}>
                          (required for new user)
                        </span>
                      </div>
                      <input
                        type="password"
                        name="password"
                        value={form.password}
                        onChange={handleChange}
                        style={inputStyle}
                        autoComplete="new-password"
                        required
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>Confirm password</div>
                      <input
                        type="password"
                        name="confirm_password"
                        value={form.confirm_password}
                        onChange={handleChange}
                        style={inputStyle}
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  </>
                )}

                {/* Reset password (edit only) */}
                {form.id && (
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>Password tools</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 999,
                          border: "1px solid #d1d5db",
                          backgroundColor: "#ffffff",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        Reset password (generate temp)
                      </button>

                      {tempPassword && (
                        <>
                          <span
                            style={{
                              ...chipStyle,
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                              fontSize: 12,
                            }}
                            title="Temporary password"
                          >
                            Temp: {tempPassword}
                          </span>
                          <button
                            type="button"
                            onClick={copyTempPassword}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 999,
                              border: "1px solid #d1d5db",
                              backgroundColor: "#ffffff",
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Copy
                          </button>
                        </>
                      )}
                    </div>
                    <div style={{ ...smallText, marginTop: 4 }}>
                      Use this when a cashier forgets password. Share temp password once.
                    </div>
                  </div>
                )}

                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={startCreateNew}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      backgroundColor: "#ffffff",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    Clear
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: "6px 18px",
                      borderRadius: 999,
                      border: "none",
                      backgroundColor: saving ? "#9ca3af" : "#0f2580",
                      color: "#ffffff",
                      cursor: saving ? "default" : "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {saving ? "Saving…" : form.id ? "Save changes" : "Create user"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* LIST */}
          {tab === "list" && (
            <div style={panelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>Existing users</h2>
                <button
                  type="button"
                  onClick={loadAll}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: "1px solid #d1d5db",
                    backgroundColor: "#ffffff",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Refresh
                </button>
              </div>

              {users.length === 0 ? (
                <div style={{ fontSize: 14, color: "#6b7280" }}>
                  No users yet.
                </div>
              ) : (
                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                        <th style={{ padding: "8px 6px" }}>Name</th>
                        <th style={{ padding: "8px 6px" }}>Username</th>
                        <th style={{ padding: "8px 6px" }}>Role</th>
                        <th style={{ padding: "8px 6px" }}>Primary shop</th>
                        <th style={{ padding: "8px 6px" }}>Shop access</th>
                        <th style={{ padding: "8px 6px" }}>Active</th>
                        {isOwnerViewer && <th style={{ padding: "8px 6px" }}></th>}
                      </tr>
                    </thead>

                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "6px 6px" }}>
                            {u.first_name} {u.last_name}
                          </td>
                          <td style={{ padding: "6px 6px" }}>{u.username}</td>
                          <td style={{ padding: "6px 6px" }}>{u.role}</td>

                          <td style={{ padding: "6px 6px", minWidth: 180 }}>
                            {isOwnerViewer && u.role === "CASHIER" ? (
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <select
                                  value={u.shop_id ?? ""}
                                  onChange={(e) => handleQuickCashierShopChange(u.id, e.target.value)}
                                  style={{ ...inputStyle, padding: "6px 8px", fontSize: 13 }}
                                  disabled={quickSavingUserId === u.id}
                                >
                                  <option value="">— Select shop —</option>
                                  {shops.map((shop) => (
                                    <option key={shop.id} value={shop.id}>
                                      {shop.name}
                                    </option>
                                  ))}
                                </select>
                                {quickSavingUserId === u.id && <span style={smallText}>Saving…</span>}
                              </div>
                            ) : (
                              getShopName(u.shop_id)
                            )}
                          </td>

                          <td style={{ padding: "6px 6px", minWidth: 200 }}>
                            {u.role === "MANAGER" ? (
                              <span style={chipStyle}>All shops</span>
                            ) : (
                              <span style={smallText}>—</span>
                            )}
                          </td>

                          <td style={{ padding: "6px 6px" }}>{u.is_active ? "Yes" : "No"}</td>

                          {isOwnerViewer && (
                            <td style={{ padding: "6px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <button
                                type="button"
                                onClick={() => startEdit(u)}
                                style={{
                                  border: "none",
                                  background: "none",
                                  color: "#2563eb",
                                  cursor: "pointer",
                                  fontSize: 13,
                                }}
                              >
                                Edit
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ ...smallText, marginTop: 8 }}>
                    {readOnly
                      ? "Read-only: managers can view users, but cannot edit here."
                      : "Tip: for CASHIER you can change shop directly in the table, or click Edit for full changes."}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default UserManagementPage;
