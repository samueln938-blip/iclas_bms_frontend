// FILE: src/pages/shop/ShopWorkspacePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";

function ShopWorkspacePage() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---------------- Responsive helpers ----------------
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 760;
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const loadShop = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get(`/shops/${shopId}`);
        setShop(res.data);
      } catch (err) {
        console.error("Failed to load shop", err);
        setError("Failed to load shop information.");
      } finally {
        setLoading(false);
      }
    };

    if (shopId) {
      loadShop();
    }
  }, [shopId]);

  const shopName = shop?.name || `Shop ${shopId}`;

  const cards = useMemo(
    () => [
      {
        key: "purchases",
        title: "Purchases",
        description: "Record and manage all purchases for this shop.",
        accentColor: "#2563eb",
        bgColor: "#eff6ff",
        onClick: () => navigate(`/shops/${shopId}/purchases`),
      },
      {
        key: "stock",
        title: "Stock",
        description: "View and manage current stock by units and pieces.",
        accentColor: "#16a34a",
        bgColor: "#ecfdf3",
        onClick: () => navigate(`/shops/${shopId}/stock`),
      },
      {
        key: "inventory-checks",
        title: "Inventory check",
        description:
          "Compare system stock with physical counts and post adjustments.",
        accentColor: "#0f766e",
        bgColor: "#ecfeff",
        onClick: () => navigate(`/shops/${shopId}/inventory-checks`),
      },
      {
        key: "sales-pos",
        title: "Sales & POS",
        description: "Make sales, view your today's sales, and cashier closure.",
        accentColor: "#dc2626",
        bgColor: "#fef2f2",
        onClick: () => navigate(`/shops/${shopId}/sales-pos`),
      },
      {
        key: "sales-history",
        title: "Sales History",
        description: "View all sales across all dates for this shop.",
        accentColor: "#7c3aed",
        bgColor: "#f5f3ff",
        onClick: () => navigate(`/shops/${shopId}/sales-history`),
      },
      {
        key: "closure-history",
        title: "Daily Closure History",
        description:
          "View daily closure summaries for all cashiers for this shop.",
        accentColor: "#ea580c",
        bgColor: "#fff7ed",
        onClick: () => navigate(`/shops/${shopId}/closures-history`),
      },
      {
        key: "credits",
        title: "Credits",
        description:
          "See customer credits and payments linked to this shop's sales.",
        accentColor: "#0f766e",
        bgColor: "#ecfeff",
        onClick: () => navigate(`/shops/${shopId}/credits`),
      },
    ],
    [navigate, shopId]
  );

  if (loading) {
    return (
      <div style={{ padding: "32px" }}>
        <p>Loading shop workspace...</p>
      </div>
    );
  }

  if (error && !shop) {
    return (
      <div style={{ padding: "32px", color: "red" }}>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: isMobile ? "18px 14px 22px" : "32px 40px 40px",
      }}
    >
      <h1
        style={{
          fontSize: isMobile ? "28px" : "40px",
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          margin: 0,
          lineHeight: 1.15,
          wordBreak: "break-word",
        }}
      >
        {shopName}
      </h1>

      {/* ✅ removed the explanation under page name */}

      <div
        style={{
          marginTop: isMobile ? "16px" : "28px",
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(3, minmax(0, 1fr))",
          gap: isMobile ? "12px" : "20px 24px",
        }}
      >
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={card.onClick}
            style={{
              textAlign: "left",
              border: "none",
              cursor: "pointer",
              borderRadius: "24px",
              padding: isMobile ? "18px 16px" : "26px 24px 26px",
              backgroundColor: "#ffffff",
              boxShadow: "0 18px 45px rgba(15,37,128,0.06)",
              transition: "transform 0.12s ease, box-shadow 0.12s ease",
              touchAction: "manipulation",
            }}
            onMouseEnter={(e) => {
              if (isMobile) return;
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 22px 55px rgba(15,37,128,0.10)";
            }}
            onMouseLeave={(e) => {
              if (isMobile) return;
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 18px 45px rgba(15,37,128,0.06)";
            }}
          >
            {/* ✅ removed the dot */}
            <div
              style={{
                fontSize: isMobile ? "18px" : "22px",
                fontWeight: 800,
                marginBottom: "8px",
                color: card.accentColor,
              }}
            >
              {card.title}
            </div>

            <p
              style={{
                margin: 0,
                fontSize: isMobile ? "13px" : "14px",
                lineHeight: 1.5,
                color: "#4b5563",
              }}
            >
              {card.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ShopWorkspacePage;
