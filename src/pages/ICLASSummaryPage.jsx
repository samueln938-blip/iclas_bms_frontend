// FILE: src/pages/ICLASSummaryPage.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ICLASSummaryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("welcome"); // welcome | summary

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
    };

    const linkGrid = {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 12,
      marginTop: 18,
    };

    const linkCard = {
      width: "100%",
      border: "none",
      cursor: "pointer",
      borderRadius: 18,
      padding: "16px 16px",
      backgroundColor: "#ffffff",
      boxShadow: "0 12px 30px rgba(15,37,128,0.06)",
      textAlign: "left",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      transition: "transform 0.12s ease, box-shadow 0.12s ease",
      outline: "1px solid #eef2ff",
      position: "relative",
      overflow: "hidden",
    };

    const dot = (accent, bg) => ({
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
      marginBottom: 6,
      flex: "0 0 auto",
    });

    const linkTitle = (accent) => ({
      fontSize: 18,
      fontWeight: 800,
      margin: 0,
      color: accent,
    });

    const linkDesc = {
      margin: 0,
      fontSize: 13,
      lineHeight: 1.45,
      color: "#4b5563",
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

    // Responsive: 1 column on small screens
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
      linkCard,
      dot,
      linkTitle,
      linkDesc,
      note,
      footerHint,
      responsiveTag,
    };
  }, []);

  const goGlobal = () => navigate("/admin/items");
  const goShops = () => navigate("/admin/shops");

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
                <button
                  type="button"
                  style={styles.linkCard}
                  onClick={goGlobal}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 16px 38px rgba(15,37,128,0.10)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 12px 30px rgba(15,37,128,0.06)";
                  }}
                >
                  <div style={styles.dot("#0f2580", "#e0e7ff")}>G</div>
                  <h3 style={styles.linkTitle("#0f2580")}>Global</h3>
                  <p style={styles.linkDesc}>
                    Item Catalogue, Shops Management, User Management.
                  </p>
                </button>

                <button
                  type="button"
                  style={styles.linkCard}
                  onClick={goShops}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 16px 38px rgba(15,37,128,0.10)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 12px 30px rgba(15,37,128,0.06)";
                  }}
                >
                  <div style={styles.dot("#166534", "#dcfce7")}>S</div>
                  <h3 style={styles.linkTitle("#166534")}>Shops</h3>
                  <p style={styles.linkDesc}>
                    Open a shop workspace and manage stock, purchases, sales, closures, and credits.
                  </p>
                </button>
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
