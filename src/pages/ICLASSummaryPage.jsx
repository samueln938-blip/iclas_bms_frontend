// FILE: src/pages/ICLASSummaryPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

export default function ICLASSummaryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("welcome"); // welcome | summary

  // Shops list (so "Shops" quick link shows Mulindi 1 / Mulindi 2)
  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [shopsError, setShopsError] = useState("");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setShopsLoading(true);
      setShopsError("");
      try {
        const res = await api.get("/shops/", { params: { only_active: true } });
        if (!alive) return;
        setShops(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        if (!alive) return;
        setShopsError("Failed to load shops list.");
      } finally {
        if (!alive) return;
        setShopsLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  const styles = useMemo(() => {
    const shell = {
      maxWidth: 980,
      margin: "0 auto",
      padding: "10px 0 24px",
    };

    const card = {
      backgroundColor: "#ffffff",
      borderRadius: 20,
      padding: "24px 22px",
      boxShadow: "0 18px 45px rgba(15,37,128,0.06)",
      border: "1px solid #eef2ff",
    };

    const title = {
      fontSize: 30,
      fontWeight: 900,
      textAlign: "center",
      margin: 0,
      letterSpacing: "0.02em",
      color: "#0f2580",
    };

    const motto = {
      marginTop: 8,
      textAlign: "center",
      fontSize: 16,
      color: "#4b5563",
      fontStyle: "italic",
    };

    const tabsBar = {
      display: "inline-flex",
      gap: 4,
      backgroundColor: "#f3f4f6",
      padding: 3,
      borderRadius: 999,
    };

    const tabBtn = {
      padding: "8px 16px",
      borderRadius: 999,
      border: "1px solid transparent",
      fontSize: 14,
      cursor: "pointer",
      backgroundColor: "transparent",
      userSelect: "none",
      whiteSpace: "nowrap",
    };

    const tabActive = {
      backgroundColor: "#0f2580",
      color: "#ffffff",
      borderColor: "#0f2580",
      fontWeight: 700,
    };

    const tabInactive = {
      backgroundColor: "#ffffff",
      color: "#374151",
      borderColor: "#e5e7eb",
      fontWeight: 600,
    };

    const sectionTitle = {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: "0.12em",
      color: "#6b7280",
      marginBottom: 10,
      textAlign: "center",
    };

    const linkGrid = {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 12,
      marginTop: 18,
    };

    const blockCard = (borderColor) => ({
      borderRadius: 18,
      padding: "16px 16px",
      backgroundColor: "#ffffff",
      boxShadow: "0 12px 30px rgba(15,37,128,0.06)",
      border: `1px solid ${borderColor}`,
    });

    const badge = (accent, bg) => ({
      width: 36,
      height: 36,
      borderRadius: 999,
      backgroundColor: bg,
      color: accent,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 900,
      fontSize: 18,
      marginBottom: 10,
    });

    const blockTitle = (accent) => ({
      fontSize: 18,
      fontWeight: 900,
      margin: 0,
      color: accent,
    });

    const blockDesc = {
      margin: "6px 0 12px 0",
      fontSize: 13,
      lineHeight: 1.45,
      color: "#4b5563",
    };

    const miniBtn = (accent, bg) => ({
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #e5e7eb",
      backgroundColor: bg,
      color: accent,
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 800,
      textAlign: "left",
    });

    const arrow = {
      fontWeight: 900,
      opacity: 0.8,
    };

    const small = {
      fontSize: 12,
      color: "#6b7280",
      marginTop: 8,
      lineHeight: 1.4,
    };

    const error = {
      fontSize: 13,
      color: "#b91c1c",
      marginTop: 8,
    };

    const note = {
      marginTop: 10,
      padding: "14px 14px",
      borderRadius: 14,
      backgroundColor: "#f9fafb",
      border: "1px dashed #d1d5db",
      color: "#374151",
      fontSize: 14,
      lineHeight: 1.55,
    };

    const footerHint = {
      marginTop: 14,
      fontSize: 12,
      color: "#6b7280",
      textAlign: "center",
    };

    const responsiveTag = `
      @media (max-width: 640px) {
        .iclas-link-grid { grid-template-columns: 1fr !important; }
      }
    `;

    return {
      shell,
      card,
      title,
      motto,
      tabsBar,
      tabBtn,
      tabActive,
      tabInactive,
      sectionTitle,
      linkGrid,
      blockCard,
      badge,
      blockTitle,
      blockDesc,
      miniBtn,
      arrow,
      small,
      error,
      note,
      footerHint,
      responsiveTag,
    };
  }, []);

  const goItemCatalogue = () => navigate("/admin/items");
  const goShopsManagement = () => navigate("/admin/shops");
  const goUserManagement = () => navigate("/admin/users");
  const openShopWorkspace = (shopId) => navigate(`/shops/${shopId}/workspace`);

  return (
    <div style={styles.shell}>
      <style>{styles.responsiveTag}</style>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <div style={styles.tabsBar}>
          <button
            type="button"
            onClick={() => setTab("welcome")}
            style={{
              ...styles.tabBtn,
              ...(tab === "welcome" ? styles.tabActive : styles.tabInactive),
            }}
          >
            Welcome
          </button>
          <button
            type="button"
            onClick={() => setTab("summary")}
            style={{
              ...styles.tabBtn,
              ...(tab === "summary" ? styles.tabActive : styles.tabInactive),
            }}
          >
            Business Summary (Later)
          </button>
        </div>
      </div>

      <div style={styles.card}>
        {tab === "welcome" ? (
          <>
            <h1 style={styles.title}>ICLAS Business Management System</h1>
            <div style={styles.motto}>&ldquo;Good Things Take Time&rdquo;</div>

            <div style={{ marginTop: 18 }}>
              <div style={styles.sectionTitle}>QUICK LINKS</div>

              <div className="iclas-link-grid" style={styles.linkGrid}>
                {/* GLOBAL BLOCK (shows list of global pages) */}
                <div style={styles.blockCard("#dbeafe")}>
                  <div style={styles.badge("#0f2580", "#e0e7ff")}>G</div>
                  <h3 style={styles.blockTitle("#0f2580")}>Global</h3>
                  <p style={styles.blockDesc}>
                    Choose where you want to go in the Global section.
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button
                      type="button"
                      style={styles.miniBtn("#0f2580", "#ffffff")}
                      onClick={goItemCatalogue}
                    >
                      <span>Item Catalogue</span>
                      <span style={styles.arrow}>›</span>
                    </button>

                    <button
                      type="button"
                      style={styles.miniBtn("#0f2580", "#ffffff")}
                      onClick={goShopsManagement}
                    >
                      <span>Shops Management</span>
                      <span style={styles.arrow}>›</span>
                    </button>

                    <button
                      type="button"
                      style={styles.miniBtn("#0f2580", "#ffffff")}
                      onClick={goUserManagement}
                    >
                      <span>User Management</span>
                      <span style={styles.arrow}>›</span>
                    </button>
                  </div>

                  <div style={styles.small}>
                    Tip: You can always return here using <b>ICLAS Summary</b> in the left menu.
                  </div>
                </div>

                {/* SHOPS BLOCK (shows list of shops to open workspace directly) */}
                <div style={styles.blockCard("#dcfce7")}>
                  <div style={styles.badge("#166534", "#dcfce7")}>S</div>
                  <h3 style={styles.blockTitle("#166534")}>Shops</h3>
                  <p style={styles.blockDesc}>
                    Open a shop workspace directly from the list below.
                  </p>

                  {shopsLoading ? (
                    <div style={styles.small}>Loading shops…</div>
                  ) : shopsError ? (
                    <>
                      <div style={styles.error}>{shopsError}</div>
                      <button
                        type="button"
                        style={{ ...styles.miniBtn("#166534", "#ffffff"), marginTop: 10 }}
                        onClick={goShopsManagement}
                      >
                        <span>Go to Shops Management</span>
                        <span style={styles.arrow}>›</span>
                      </button>
                    </>
                  ) : shops.length === 0 ? (
                    <>
                      <div style={styles.small}>No active shops yet.</div>
                      <button
                        type="button"
                        style={{ ...styles.miniBtn("#166534", "#ffffff"), marginTop: 10 }}
                        onClick={goShopsManagement}
                      >
                        <span>Create / Manage shops</span>
                        <span style={styles.arrow}>›</span>
                      </button>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {shops.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          style={styles.miniBtn("#166534", "#ffffff")}
                          onClick={() => openShopWorkspace(s.id)}
                        >
                          <span>{s.name}</span>
                          <span style={styles.arrow}>›</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={styles.small}>
                    Prefer managing shops first? Use <b>Shops Management</b> under Global.
                  </div>
                </div>
              </div>

              <div style={styles.footerHint}>
                Tip: This page is just a clean starting shape — we’ll expand it slowly.
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 style={styles.title}>ICLAS Business Summary</h1>
            <div style={styles.motto}>&ldquo;Good Things Take Time&rdquo;</div>

            <div style={styles.note}>
              This tab will include a summary for ICLAS Business. I will develop it later.
            </div>

            <div style={styles.footerHint}>
              (No backend changes needed for this placeholder.)
            </div>
          </>
        )}
      </div>
    </div>
  );
}
