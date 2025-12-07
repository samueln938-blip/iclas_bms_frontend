// FILE: src/pages/shop/tabs/CurrentSaleTab.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildPaymentMap,
  formatMoney,
  formatPlainNumber,
  parseAmount,
  resolveSchema,
} from "../posUtils.js";

function CustomerModal({ open, onClose, onSave }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
    }
  }, [open]);

  if (!open) return null;

  const canSave = name.trim().length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15,23,42,0.35)",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 360,
          maxWidth: "95vw",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 20px 50px rgba(15,23,42,0.4)",
          padding: "14px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "14px", fontWeight: 800 }}>Add customer</div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: "16px", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Customer name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: John"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Phone (optional)</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: 078xxxxxxx"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
              }}
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!canSave}
          onClick={() => onSave({ name: name.trim(), phone: phone.trim() })}
          style={{
            marginTop: "12px",
            width: "100%",
            padding: "10px 14px",
            borderRadius: "999px",
            border: "none",
            backgroundColor: canSave ? "#2563eb" : "#9ca3af",
            color: "#fff",
            fontWeight: 800,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          Save customer
        </button>
      </div>
    </div>
  );
}

// ✅ Customer-facing overlay (shows totals only; hides profit & delete/edit controls)
function CustomerDisplay({ open, onClose, lines, total }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15,23,42,0.55)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "14px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 760,
          maxWidth: "96vw",
          maxHeight: "92vh",
          overflow: "auto",
          backgroundColor: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
          padding: "16px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", fontWeight: 800 }}>
              Customer total
            </div>
            <div style={{ fontSize: "30px", fontWeight: 900, marginTop: 4 }}>
              Amount to pay: {formatMoney(total)}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "22px",
              cursor: "pointer",
              padding: "6px 10px",
              borderRadius: "12px",
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
          {(lines || []).length === 0 ? (
            <div style={{ padding: "10px 0", color: "#6b7280", fontSize: 13 }}>No items yet.</div>
          ) : (
            (lines || []).map((l) => (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid #f3f4f6",
                  alignItems: "baseline",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 14, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l?.meta?.itemName || "Item"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {String(l.qtyPieces)} × {formatMoney(l.unitPrice)}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Line total</div>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{formatMoney(l?.computed?.total || 0)}</div>
                </div>
              </div>
            ))
          )}

          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Grand total</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{formatMoney(total)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CurrentSaleTab({
  API_BASE,
  shopId,
  stockRows,
  stockByItemId,
  authHeaders,
  authHeadersNoJson,
  openCalculator,
  onRefreshStock,
  onGoToday,
  setError,
  clearAlerts,
  // ✅ optional legacy prop
  editSaleId,
  onEditDone,
}) {
  // ------------------ small helpers ------------------
  const num = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    return parseAmount(v);
  };

  const formatQty = (v) => {
    const n = num(v);
    return n.toLocaleString("en-RW", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  };

  // Pad + cart
  const [pad, setPad] = useState({ itemId: "", qtyPieces: "", agreedPricePerPiece: "" });
  const [saleLines, setSaleLines] = useState([]);
  const [editingLineId, setEditingLineId] = useState(null);

  // ✅ Customer display (overlay) + optional “hide profit” view
  const [customerDisplayOpen, setCustomerDisplayOpen] = useState(false);
  const [hideProfitInTab, setHideProfitInTab] = useState(false);

  // ✅ Item quick-search (cursor) + dropdown
  const [itemQuery, setItemQuery] = useState("");
  const [itemListOpen, setItemListOpen] = useState(false);
  const [itemHi, setItemHi] = useState(0);
  const itemWrapRef = useRef(null);
  const qtyInputRef = useRef(null);

  // Customers
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [attachCustomer, setAttachCustomer] = useState(false);

  // Payment
  const [paymentMode, setPaymentMode] = useState(null); // cash|card|mobile
  const [isCreditSale, setIsCreditSale] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerDueDate, setCustomerDueDate] = useState("");

  // Credit partial payment
  const [amountCollectedNow, setAmountCollectedNow] = useState("");
  const [saving, setSaving] = useState(false);

  // Detect /sales/ schema fields
  const [salesCaps, setSalesCaps] = useState({
    dueDateKey: null,
    paymentEnum: null,
    paymentMap: { cash: "cash", card: "card", mobile: "mobile" },
  });

  // ✅ Edit mode state
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [editSourceSale, setEditSourceSale] = useState(null);

  // ✅ Flash (<3s) inside this tab
  const [flash, setFlash] = useState(null);
  const flashTimerRef = useRef(null);
  const fireFlash = (msg) => {
    const text = String(msg || "").trim();
    if (!text) return;

    setFlash(text);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 2500);

    try {
      window.dispatchEvent(new CustomEvent("iclas:flash", { detail: { message: text } }));
    } catch {
      // ignore
    }
  };

  // ✅ Keyboard shortcut: Ctrl+Shift+C toggles customer overlay
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
        e.preventDefault();
        setCustomerDisplayOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // -------------- Helpers for reset / cancel edit --------------
  const clearEditHandoffStorage = () => {
    try {
      localStorage.removeItem("iclas_edit_sale_id");
      localStorage.removeItem("iclas_edit_sale_line_id");
    } catch {
      // ignore
    }
  };

  const resetCurrentSaleState = () => {
    setSaleLines([]);
    setEditingLineId(null);
    setPad({ itemId: "", qtyPieces: "", agreedPricePerPiece: "" });

    setItemQuery("");
    setItemListOpen(false);
    setItemHi(0);

    setIsCreditSale(false);
    setPaymentMode(null);

    setAttachCustomer(false);
    setSelectedCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerDueDate("");
    setAmountCollectedNow("");

    setEditingSaleId(null);
    setEditSourceSale(null);

    // ✅ close customer overlay when resetting
    setCustomerDisplayOpen(false);
  };

  const cancelEditMode = () => {
    clearEditHandoffStorage();
    resetCurrentSaleState();
    onEditDone?.();
    fireFlash("Edit cancelled");
  };

  const isEditingExistingSale = !!editingSaleId;

  // ------------------ Customers ------------------
  const normalizeCustomer = (c) => {
    if (!c || typeof c !== "object") return null;
    const id = c.id ?? c.customer_id ?? null;
    const name = c.name ?? c.customer_name ?? c.full_name ?? c.title ?? "";
    const phone = c.phone ?? c.customer_phone ?? c.tel ?? c.mobile ?? "";
    const shop_id = c.shop_id ?? c.shopId ?? null;
    return { ...c, id, name, phone, shop_id };
  };

  const loadCustomers = async () => {
    try {
      const candidates = [
        `${API_BASE}/customers/?shop_id=${shopId}`,
        `${API_BASE}/customers/?shop_id=${shopId}&only_active=true`,
        `${API_BASE}/customers/`,
      ];

      let data = null;
      for (const url of candidates) {
        const res = await fetch(url, { headers: authHeadersNoJson });
        if (!res.ok) continue;
        const json = await res.json();

        if (Array.isArray(json)) {
          data = json;
          break;
        }
        if (json?.customers && Array.isArray(json.customers)) {
          data = json.customers;
          break;
        }
      }

      const list = (data || []).map(normalizeCustomer).filter(Boolean);
      const filtered = list.filter((c) => !c.shop_id || Number(c.shop_id) === Number(shopId));
      setCustomers(filtered);
    } catch {
      setCustomers([]);
    }
  };

  const createCustomer = async ({ name, phone }) => {
    const tries = [
      { shop_id: Number(shopId), name, phone },
      { shop_id: Number(shopId), customer_name: name, customer_phone: phone },
    ];

    let lastErr = null;
    for (const payload of tries) {
      try {
        const res = await fetch(`${API_BASE}/customers/`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          let detail = `Failed to create customer. Status: ${res.status}`;
          try {
            const errData = await res.json();
            if (errData?.detail) {
              detail = typeof errData.detail === "string" ? errData.detail : JSON.stringify(errData.detail);
            }
          } catch {}
          lastErr = new Error(detail);
          continue;
        }

        const created = normalizeCustomer(await res.json());
        if (created) {
          await loadCustomers();
          setSelectedCustomerId(String(created.id));
          setAttachCustomer(true);
          setCustomerName(created.name || name);
          setCustomerPhone(created.phone || phone || "");
          return created;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Failed to create customer.");
  };

  const selectedCustomer = useMemo(() => {
    const id = selectedCustomerId ? Number(selectedCustomerId) : null;
    if (!id) return null;
    return (customers || []).find((c) => Number(c.id) === id) || null;
  }, [selectedCustomerId, customers]);

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  useEffect(() => {
    if (!selectedCustomer) return;
    setAttachCustomer(true);
    setCustomerName(selectedCustomer.name || "");
    setCustomerPhone(selectedCustomer.phone || "");
  }, [selectedCustomer]);

  // ------------------ OpenAPI detection ------------------
  useEffect(() => {
    let cancelled = false;

    async function detectSalesSchema() {
      try {
        const res = await fetch(`${API_BASE}/openapi.json`);
        if (!res.ok) return;
        const openapi = await res.json();

        const path = openapi?.paths?.["/sales/"]?.post;
        const schema0 =
          path?.requestBody?.content?.["application/json"]?.schema ||
          path?.requestBody?.content?.["application/*+json"]?.schema;

        const resolved = resolveSchema(schema0, openapi?.components) || schema0;
        const props = resolved?.properties || {};

        const candidates = ["due_date", "credit_due_date", "customer_due_date"];
        const found = candidates.find((k) => Object.prototype.hasOwnProperty.call(props, k)) || null;

        let paymentEnum = null;
        try {
          const paymentSchema = resolveSchema(props?.payment_type, openapi?.components) || props?.payment_type;
          if (Array.isArray(paymentSchema?.enum)) paymentEnum = paymentSchema.enum;
        } catch {}

        const paymentMap = buildPaymentMap(paymentEnum);

        if (!cancelled) {
          setSalesCaps((prev) => ({ ...prev, dueDateKey: found, paymentEnum, paymentMap }));
        }
      } catch {}
    }

    detectSalesSchema();
    return () => {
      cancelled = true;
    };
  }, [API_BASE]);

  // ------------------ Pad helpers ------------------
  const updatePad = (field, rawValue) => {
    setPad((prev) => {
      if (field === "itemId") {
        const itemId = rawValue === "" ? "" : Number(rawValue);
        const row = itemId ? stockByItemId[itemId] : null;
        const autoPrice = row?.selling_price_per_piece != null ? String(row.selling_price_per_piece) : "";
        return { ...prev, itemId, qtyPieces: prev.qtyPieces || "1", agreedPricePerPiece: autoPrice };
      }
      if (field === "qtyPieces") return { ...prev, qtyPieces: rawValue };
      if (field === "agreedPricePerPiece") return { ...prev, agreedPricePerPiece: rawValue };
      return prev;
    });
  };

  // ✅ only items with remaining_pieces > 0 (decimals safe)
  const inStockOptions = useMemo(() => {
    const rows = stockRows || [];
    return rows
      .filter((r) => num(r?.remaining_pieces) > 0)
      .slice()
      .sort((a, b) => String(a?.item_name || "").localeCompare(String(b?.item_name || "")));
  }, [stockRows]);

  // ✅ filter by typing initials / name / sku
  const filteredOptions = useMemo(() => {
    const q = String(itemQuery || "").trim().toLowerCase();
    if (!q) return inStockOptions;

    return inStockOptions.filter((r) => {
      const name = String(r.item_name || "").toLowerCase();
      const sku = String(r.item_sku || r.sku || "").toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [itemQuery, inStockOptions]);

  const selectedStockForPad = pad.itemId ? stockByItemId[pad.itemId] : null;

  const padPiecesPerUnit =
    selectedStockForPad?.item_pieces_per_unit != null ? selectedStockForPad.item_pieces_per_unit : 1;
  const padRemainingPieces =
    selectedStockForPad?.remaining_pieces != null ? num(selectedStockForPad.remaining_pieces) : 0;
  const padPurchaseCostPerPiece =
    selectedStockForPad?.purchase_cost_per_piece != null ? num(selectedStockForPad.purchase_cost_per_piece) : 0;
  const padWholesalePerPiece =
    selectedStockForPad?.wholesale_price_per_piece != null ? num(selectedStockForPad.wholesale_price_per_piece) : 0;
  const padSellingPerPiece =
    selectedStockForPad?.selling_price_per_piece != null ? num(selectedStockForPad.selling_price_per_piece) : 0;

  const agreedPricePlaceholder = padSellingPerPiece
    ? `Ex: ${formatPlainNumber(padSellingPerPiece)}`
    : "Ex: price per piece";

  const piecesAlreadyInSaleForPadItem = useMemo(() => {
    const itemId = pad.itemId ? Number(pad.itemId) : null;
    if (!itemId) return 0;
    return saleLines.reduce(
      (sum, l) => sum + (Number(l.itemId) === itemId ? num(l.qtyPieces || 0) : 0),
      0
    );
  }, [pad.itemId, saleLines]);

  const padAvailablePieces = useMemo(() => {
    const remaining = num(padRemainingPieces || 0);
    const already = num(piecesAlreadyInSaleForPadItem || 0);
    return Math.max(0, remaining - already);
  }, [padRemainingPieces, piecesAlreadyInSaleForPadItem]);

  const padPreview = useMemo(() => {
    const qty = num(pad.qtyPieces || 0);
    const price = num(pad.agreedPricePerPiece || 0);
    const total = qty > 0 && price > 0 ? qty * price : 0;
    const profitPerPiece = price > 0 ? price - padPurchaseCostPerPiece : 0;
    const profitTotal = qty > 0 && price > 0 ? profitPerPiece * qty : 0;
    return { total, profitPerPiece, profitTotal };
  }, [pad.qtyPieces, pad.agreedPricePerPiece, padPurchaseCostPerPiece]);

  // ✅ close dropdown on outside click
  useEffect(() => {
    const onDown = (e) => {
      const wrap = itemWrapRef.current;
      if (!wrap) return;
      if (!wrap.contains(e.target)) setItemListOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  const selectItemFromList = (row) => {
    updatePad("itemId", row?.item_id);
    setItemQuery(String(row?.item_name || ""));
    setItemListOpen(false);
    setItemHi(0);
    // focus qty
    try {
      qtyInputRef.current?.focus?.();
    } catch {}
  };

  const clearItemSelection = () => {
    setItemQuery("");
    setItemListOpen(false);
    setItemHi(0);
    setPad((prev) => ({ ...prev, itemId: "", qtyPieces: "", agreedPricePerPiece: "" }));
  };

  // ------------------ Cart actions ------------------
  const handleAddItemToSale = () => {
    clearAlerts?.();

    if (!pad.itemId) return setError?.("Select an item before adding to the sale.");

    const qtyPieces = num(pad.qtyPieces || 0);
    if (qtyPieces <= 0) return setError?.("Quantity (pieces) must be greater than zero.");

    const agreedPricePerPiece = num(pad.agreedPricePerPiece || 0);
    if (agreedPricePerPiece <= 0) return setError?.("Enter the agreed price per piece (e.g. 6500).");

    if (qtyPieces > padAvailablePieces) {
      return setError?.(`Not enough stock for this sale. Available pieces: ${formatQty(padAvailablePieces)}.`);
    }

    const purchaseCostPerPiece = padPurchaseCostPerPiece || 0;
    const total = qtyPieces * agreedPricePerPiece;
    const profitPerPiece = agreedPricePerPiece - purchaseCostPerPiece;
    const totalProfit = profitPerPiece * qtyPieces;

    setSaleLines((prev) => [
      ...prev,
      {
        id: Date.now().toString() + Math.random().toString(16),
        itemId: pad.itemId,
        qtyPieces, // store as number
        unitPrice: agreedPricePerPiece, // store as number
        total,
        profit: totalProfit,
      },
    ]);

    setPad((prev) => ({ ...prev, qtyPieces: "1" }));
    try {
      qtyInputRef.current?.focus?.();
      qtyInputRef.current?.select?.();
    } catch {}
  };

  const removeSaleLine = (id) => {
    setSaleLines((prev) => prev.filter((l) => l.id !== id));
    if (editingLineId === id) setEditingLineId(null);
  };

  const beginEditLine = (id) => setEditingLineId(id);

  // ✅ allow decimals & do not force rounding while typing
  const updateSaleLine = (id, patch) => {
    setSaleLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };

        const qty = num(next.qtyPieces || 0);
        const price = num(next.unitPrice || 0);

        next.total = qty * price;

        const purchaseCost = num(stockByItemId[next.itemId]?.purchase_cost_per_piece || 0);
        next.profit = (price - purchaseCost) * qty;

        return next;
      })
    );
  };

  const saleLinesWithMeta = useMemo(() => {
    return saleLines.map((line) => {
      const stockRow = stockByItemId[line.itemId] || {};
      const purchaseCostPerPiece = num(stockRow.purchase_cost_per_piece || 0);
      const qty = num(line.qtyPieces || 0);
      const price = num(line.unitPrice || 0);
      const profitPerPiece = price - purchaseCostPerPiece;
      const total = qty * price;
      const totalProfit = profitPerPiece * qty;

      return {
        ...line,
        computed: { total, profit: totalProfit },
        meta: { itemName: stockRow.item_name || "Unknown item" },
      };
    });
  }, [saleLines, stockByItemId]);

  const saleTotal = useMemo(
    () => saleLinesWithMeta.reduce((sum, line) => sum + (line.computed.total || 0), 0),
    [saleLinesWithMeta]
  );
  const saleTotalProfit = useMemo(
    () => saleLinesWithMeta.reduce((sum, line) => sum + (line.computed.profit || 0), 0),
    [saleLinesWithMeta]
  );

  // ------------------ Payment toggles ------------------
  const toggleCreditSale = (checked) => {
    setIsCreditSale(checked);

    if (checked) {
      setPaymentMode(null);
      setAttachCustomer(true);
      if (amountCollectedNow === "") setAmountCollectedNow("0");
    } else {
      setCustomerDueDate("");
      setAmountCollectedNow("");
    }
  };

  const selectPaymentMode = (mode) => {
    if (isCreditSale) return;
    setPaymentMode(mode);
  };

  const validateSaleAgainstStock = () => {
    const byItem = new Map();
    for (const l of saleLines) {
      const itemId = Number(l.itemId);
      const qty = num(l.qtyPieces || 0);
      byItem.set(itemId, (byItem.get(itemId) || 0) + qty);
    }

    // ✅ When editing, allow original quantity + remaining stock
    const originalByItem = new Map();
    if (editSourceSale && editingSaleId) {
      for (const ln of editSourceSale.lines || []) {
        const itemId = Number(ln.item_id ?? ln.itemId);
        const qty = num(ln.quantity_pieces ?? ln.quantity ?? ln.qty_pieces ?? 0);
        originalByItem.set(itemId, (originalByItem.get(itemId) || 0) + qty);
      }
    }

    for (const [itemId, newQty] of byItem.entries()) {
      const remaining = num(stockByItemId[itemId]?.remaining_pieces || 0);
      const originalQty = originalByItem.get(itemId) || 0;
      const maxAllowed = remaining + originalQty;

      if (newQty > maxAllowed) {
        const name = stockByItemId[itemId]?.item_name || `Item #${itemId}`;
        return `Not enough stock for "${name}". You are trying to sell ${formatQty(newQty)} pieces but maximum allowed (including original sale) is ${formatQty(maxAllowed)}.`;
      }
    }
    return null;
  };

  const computedCollectedNow = useMemo(() => {
    if (!isCreditSale) return saleTotal;
    return Math.max(0, parseAmount(amountCollectedNow));
  }, [amountCollectedNow, isCreditSale, saleTotal]);

  const computedCreditBalance = useMemo(() => {
    if (!isCreditSale) return 0;
    const bal = Number(saleTotal) - Number(computedCollectedNow);
    return Math.max(0, bal);
  }, [computedCollectedNow, isCreditSale, saleTotal]);

  // ------------------ Load sale for editing ------------------
  const loadSaleForEdit = async (saleId, focusServerLineId = null) => {
    clearAlerts?.();
    setSaving(true);
    try {
      let sale = null;
      const candidates = [
        `${API_BASE}/sales/${saleId}`,
        `${API_BASE}/sales/detail/${saleId}`,
        `${API_BASE}/sales/${saleId}/`,
      ];

      for (const url of candidates) {
        try {
          const res = await fetch(url, { headers: authHeadersNoJson });
          if (!res.ok) continue;
          const json = await res.json();
          sale = json?.sale || json;
          break;
        } catch {}
      }

      if (!sale) throw new Error("Could not load sale for editing.");

      const lines = (sale.lines || []).map((ln) => {
        const itemId = ln.item_id ?? ln.itemId;
        const qty = ln.quantity_pieces ?? ln.quantity ?? ln.qty_pieces ?? 0;
        const price = ln.sale_price_per_piece ?? ln.unit_sale_price ?? ln.unit_price ?? 0;

        return {
          id: `edit-${sale.id}-${ln.id ?? itemId}-${Math.random().toString(16).slice(2)}`,
          itemId: Number(itemId),
          qtyPieces: num(qty),
          unitPrice: num(price),
          serverLineId: ln.id ?? null,
        };
      });

      const isCredit = !!sale.is_credit_sale;

      // Map backend payment_type to UI mode (only for non-credit)
      let uiPaymentMode = null;
      if (!isCredit) {
        const raw = String(sale.payment_type || "").toLowerCase();
        if (raw.includes("cash")) uiPaymentMode = "cash";
        else if (raw.includes("mobile") || raw.includes("momo")) uiPaymentMode = "mobile";
        else if (raw.includes("card") || raw.includes("pos")) uiPaymentMode = "card";
      }

      const name = sale.customer_name || sale.customer?.name || "";
      const phone = sale.customer_phone || sale.customer?.phone || "";
      const due = sale.due_date || sale.credit_due_date || sale.customer_due_date || null;

      const collectedNowForCredit =
        isCredit && sale.amount_collected_now != null ? String(sale.amount_collected_now) : "0";

      const hasCustomer = !!(name || phone);

      setSaleLines(lines);
      setPad({ itemId: "", qtyPieces: "", agreedPricePerPiece: "" });

      setItemQuery("");
      setItemListOpen(false);
      setItemHi(0);

      setIsCreditSale(isCredit);
      setPaymentMode(uiPaymentMode);

      setAttachCustomer(isCredit || hasCustomer);
      setSelectedCustomerId("");
      setCustomerName(name || "");
      setCustomerPhone(phone || "");
      setCustomerDueDate(due ? String(due).slice(0, 10) : "");
      setAmountCollectedNow(isCredit ? collectedNowForCredit : "");

      setEditingSaleId(sale.id);
      setEditSourceSale(sale);

      if (focusServerLineId != null) {
        const match = lines.find((l) => Number(l.serverLineId) === Number(focusServerLineId));
        setEditingLineId(match?.id || null);
      } else {
        setEditingLineId(null);
      }

      clearEditHandoffStorage();
    } catch (err) {
      console.error(err);
      setError?.(err.message || "Failed to load sale for editing.");
      setEditingSaleId(null);
      setEditSourceSale(null);
      setEditingLineId(null);
      onEditDone?.();
    } finally {
      setSaving(false);
    }
  };

  const focusLineIfSameSale = (focusServerLineId) => {
    if (!focusServerLineId) return;
    const match = (saleLines || []).find((l) => Number(l.serverLineId) === Number(focusServerLineId));
    if (match) setEditingLineId(match.id);
  };

  // ✅ Legacy prop: SalesPOS can pass editSaleId and we load it here
  useEffect(() => {
    if (!editSaleId) return;
    if (Number(editSaleId) === Number(editingSaleId)) return;
    loadSaleForEdit(editSaleId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSaleId]);

  // ✅ Event-based edit: from MySalesTodayTab (fallback path)
  useEffect(() => {
    const handler = (e) => {
      const sid = e?.detail?.saleId;
      const slid = e?.detail?.saleLineId ?? null;
      if (!sid) return;

      if (Number(sid) === Number(editingSaleId) && slid != null) {
        focusLineIfSameSale(slid);
        return;
      }
      loadSaleForEdit(sid, slid);
    };

    window.addEventListener("iclas:edit-sale", handler);
    return () => window.removeEventListener("iclas:edit-sale", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSaleId, saleLines]);

  // ✅ localStorage edit handoff (survives tab change)
  useEffect(() => {
    let sid = null;
    let slid = null;
    try {
      sid = localStorage.getItem("iclas_edit_sale_id");
      slid = localStorage.getItem("iclas_edit_sale_line_id");
    } catch {}

    if (!sid) return;

    const saleIdNum = Number(sid);
    const lineIdNum = slid != null && slid !== "" ? Number(slid) : null;

    if (saleIdNum && Number(saleIdNum) !== Number(editingSaleId)) {
      loadSaleForEdit(saleIdNum, lineIdNum);
    } else if (saleIdNum && Number(saleIdNum) === Number(editingSaleId) && lineIdNum != null) {
      focusLineIfSameSale(lineIdNum);
      clearEditHandoffStorage();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // ------------------ Save sale (create or update) ------------------
  const handleCompleteSale = async () => {
    clearAlerts?.();

    if (!saleLines.length) return setError?.("No items in the current sale.");
    if (!isCreditSale && !paymentMode) return setError?.("Please select a payment mode (Cash / POS / MoMo).");

    if (isCreditSale && (!customerName || !String(customerName).trim())) {
      return setError?.("For credit sale, select or enter a customer.");
    }

    if (isCreditSale && computedCollectedNow > saleTotal) {
      return setError?.("Amount collected now cannot exceed total sale amount.");
    }

    const stockProblem = validateSaleAgainstStock();
    if (stockProblem) return setError?.(stockProblem);

    setSaving(true);

    try {
      const saleDate =
        isEditingExistingSale && editSourceSale?.sale_date ? editSourceSale.sale_date : new Date().toISOString();

      const shouldSendCustomer = isCreditSale || attachCustomer;

      const payload = {
        shop_id: Number(shopId),
        sale_date: saleDate,
        is_credit_sale: isCreditSale,
        amount_collected_now: isCreditSale ? num(computedCollectedNow) : num(saleTotal),
        credit_balance: isCreditSale ? num(computedCreditBalance) : 0,
        customer_name: shouldSendCustomer ? (customerName || null) : null,
        customer_phone: shouldSendCustomer ? (customerPhone || null) : null,
        lines: saleLines.map((l) => {
          const q = num(l.qtyPieces);
          const p = num(l.unitPrice);
          const base = {
            item_id: l.itemId,
            quantity_pieces: q,
            sale_price_per_piece: p,
          };
          if (isEditingExistingSale && l.serverLineId) base.id = l.serverLineId;
          return base;
        }),
      };

      if (!isCreditSale) payload.payment_type = salesCaps.paymentMap?.[paymentMode] || paymentMode;
      if (isCreditSale && customerDueDate && salesCaps.dueDateKey) payload[salesCaps.dueDateKey] = customerDueDate;

      const url = isEditingExistingSale ? `${API_BASE}/sales/${editingSaleId}` : `${API_BASE}/sales/`;
      const method = isEditingExistingSale ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let detailMessage = isEditingExistingSale
          ? `Failed to update sale. Status: ${res.status}`
          : `Failed to save sale. Status: ${res.status}`;
        try {
          const errData = await res.json();
          if (errData?.detail) {
            if (Array.isArray(errData.detail))
              detailMessage = errData.detail.map((d) => d.msg || JSON.stringify(d)).join(" | ");
            else if (typeof errData.detail === "string") detailMessage = errData.detail;
            else detailMessage = JSON.stringify(errData.detail);
          }
        } catch {}
        throw new Error(detailMessage);
      }

      await res.json();

      fireFlash(isEditingExistingSale ? "Changes saved ✅" : "Sale saved ✅");

      clearEditHandoffStorage();
      resetCurrentSaleState();

      await onRefreshStock?.();
      await loadCustomers();

      onGoToday?.();
      onEditDone?.();
    } catch (err) {
      console.error(err);
      setError?.(err.message || "Failed to save sale.");
    } finally {
      setSaving(false);
    }
  };

  const canCompleteSale = saleLines.length > 0 && (isCreditSale || !!paymentMode) && !saving;
  const primaryButtonLabel = saving ? "Saving..." : isEditingExistingSale ? "Save changes" : "Complete sale";

  // ✅ keep itemQuery aligned when itemId changes via selection
  useEffect(() => {
    if (!pad.itemId) return;
    const row = stockByItemId[pad.itemId];
    if (row?.item_name && itemQuery !== row.item_name) {
      setItemQuery(String(row.item_name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pad.itemId]);

  return (
    <div
      style={{
        marginTop: "16px",
        backgroundColor: "#ffffff",
        borderRadius: "20px",
        boxShadow: "0 10px 30px rgba(15,37,128,0.06)",
        padding: "18px 20px 18px",
      }}
    >
      {/* tiny responsive style (only for pad layout) */}
      <style>{`
        @media (max-width: 640px) {
          .iclas-pad-grid { grid-template-columns: 1fr !important; }
          .iclas-pad-btn { width: 100% !important; }
        }
      `}</style>

      {/* Local flash toast (<3s) */}
      {flash && (
        <div
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 9999,
            background: "#111827",
            color: "white",
            padding: "10px 12px",
            borderRadius: 14,
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          {flash}
        </div>
      )}

      {/* ✅ Minimal edit indicator (no long sentence) */}
      {isEditingExistingSale && (
        <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              backgroundColor: "#eff6ff",
              border: "1px solid #bfdbfe",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            ✏️ Editing receipt #{editingSaleId}
          </div>

          <button
            type="button"
            onClick={cancelEditMode}
            style={{
              padding: "6px 10px",
              borderRadius: "999px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ✅ Customer-friendly controls (no logic change) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setCustomerDisplayOpen(true)}
            disabled={!saleLinesWithMeta.length}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #e5e7eb",
              backgroundColor: saleLinesWithMeta.length ? "#ffffff" : "#f3f4f6",
              cursor: saleLinesWithMeta.length ? "pointer" : "not-allowed",
              fontSize: "13px",
              fontWeight: 800,
            }}
            title="Show a clean total screen for the customer (Ctrl+Shift+C)"
          >
            👁 Customer display
          </button>

          <button
            type="button"
            onClick={() => setHideProfitInTab((v) => !v)}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: hideProfitInTab ? "none" : "1px solid #e5e7eb",
              backgroundColor: hideProfitInTab ? "#111827" : "#ffffff",
              color: hideProfitInTab ? "#ffffff" : "#111827",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 800,
            }}
            title="Hide/mask profit values on this tab"
          >
            {hideProfitInTab ? "🔒 Profit hidden" : "🔓 Hide profit"}
          </button>
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Amount to pay
          </div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{formatMoney(saleTotal)}</div>
        </div>
      </div>

      {/* PAD */}
      <div
        style={{
          padding: "10px 12px 14px",
          borderRadius: "16px",
          border: "1px dashed #d1d5db",
          backgroundColor: "#f9fafb",
          marginBottom: "12px",
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>
          Pad: type item name → select from list → enter pieces & price → add to cart
        </div>

        <div
          className="iclas-pad-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 3.2fr) 120px 200px 140px",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {/* ✅ Item cursor input + dropdown */}
          <div ref={itemWrapRef} style={{ position: "relative", width: "100%" }}>
            <input
              value={itemQuery}
              onChange={(e) => {
                setItemQuery(e.target.value);
                setItemListOpen(true);
                setItemHi(0);
                if (!String(e.target.value || "").trim()) {
                  // if user clears typing, clear selection too
                  setPad((prev) => ({ ...prev, itemId: "", qtyPieces: "", agreedPricePerPiece: "" }));
                }
              }}
              onFocus={() => setItemListOpen(true)}
              placeholder={inStockOptions.length ? "Type item name (e.g. suga)..." : "No stock available"}
              disabled={!inStockOptions.length}
              inputMode="search"
              style={{
                width: "100%",
                padding: "10px 38px 10px 14px",
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
                backgroundColor: inStockOptions.length ? "#ffffff" : "#f3f4f6",
              }}
            />

            {/* small clear X inside the input */}
            {itemQuery ? (
              <button
                type="button"
                onClick={clearItemSelection}
                title="Clear item"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                  lineHeight: "24px",
                }}
              >
                ✕
              </button>
            ) : null}

            {itemListOpen && inStockOptions.length ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "calc(100% + 6px)",
                  zIndex: 50,
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
                  maxHeight: 280,
                  overflowY: "auto",
                  padding: 6,
                }}
              >
                {filteredOptions.length ? (
                  filteredOptions.slice(0, 80).map((row, idx) => {
                    const isHi = idx === itemHi;
                    const remaining = num(row?.remaining_pieces || 0);
                    return (
                      <button
                        key={row.item_id}
                        type="button"
                        onClick={() => selectItemFromList(row)}
                        onMouseEnter={() => setItemHi(idx)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: isHi ? "#eff6ff" : "#ffffff",
                          cursor: "pointer",
                          padding: "10px 10px",
                          borderRadius: 12,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "center",
                        }}
                        title="Tap to select"
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                          {row.item_name}
                          <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>
                            (ID: {row.item_id})
                          </span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#2563eb" }}>
                          {formatQty(remaining)} pcs
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div style={{ padding: "10px 10px", fontSize: 13, color: "#6b7280" }}>
                    No matching items.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* qty pieces (decimals) */}
          <input
            ref={qtyInputRef}
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0"
            value={pad.qtyPieces}
            onChange={(e) => updatePad("qtyPieces", e.target.value)}
            placeholder="Pieces"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              fontSize: "14px",
              textAlign: "center",
            }}
          />

          {/* agreed price */}
          <div style={{ position: "relative", width: "100%" }}>
            <input
              type="number"
              inputMode="decimal"
              value={pad.agreedPricePerPiece}
              onChange={(e) => updatePad("agreedPricePerPiece", e.target.value)}
              placeholder={agreedPricePlaceholder}
              style={{
                width: "100%",
                padding: "10px 40px 10px 14px",
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
              }}
            />
            <button
              type="button"
              onClick={() =>
                openCalculator(pad.agreedPricePerPiece, (amt) => updatePad("agreedPricePerPiece", String(amt)))
              }
              title="Open calculator"
              style={{
                position: "absolute",
                right: "6px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "28px",
                height: "28px",
                borderRadius: "999px",
                border: "none",
                backgroundColor: "#eef2ff",
                color: "#1d4ed8",
                fontSize: "16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              🧮
            </button>
          </div>

          <button
            className="iclas-pad-btn"
            type="button"
            onClick={handleAddItemToSale}
            disabled={!inStockOptions.length}
            style={{
              width: "100%",
              padding: "10px 18px",
              borderRadius: "999px",
              border: "none",
              backgroundColor: inStockOptions.length ? "#2563eb" : "#9ca3af",
              color: "white",
              fontWeight: 700,
              fontSize: "14px",
              cursor: inStockOptions.length ? "pointer" : "not-allowed",
            }}
          >
            Add item
          </button>
        </div>

        {selectedStockForPad && (
          <div
            style={{
              marginTop: "8px",
              fontSize: "12px",
              color: "#4b5563",
              display: "flex",
              flexWrap: "wrap",
              gap: "18px",
            }}
          >
            <div>
              Pieces / unit: <strong>{formatMoney(padPiecesPerUnit)}</strong>
            </div>
            <div>
              Remaining pieces: <strong>{formatQty(padRemainingPieces)}</strong>
            </div>
            <div>
              ✅ Available for this sale: <strong>{formatQty(padAvailablePieces)}</strong>
            </div>
            <div>
              Cost / piece: <strong>{formatMoney(padPurchaseCostPerPiece)}</strong>
            </div>
            <div>
              Wholesale / piece: <strong>{formatMoney(padWholesalePerPiece)}</strong>
            </div>
            <div>
              Selling / piece: <strong>{formatMoney(padSellingPerPiece)}</strong>
            </div>
            <div>
              Preview total: <strong>{formatMoney(padPreview.total)}</strong>
            </div>

            {/* ✅ Profit preview hidden when requested (no logic removed) */}
            {!hideProfitInTab && (
              <>
                <div>
                  Interest/profit per piece: <strong>{formatMoney(padPreview.profitPerPiece)}</strong>
                </div>
                <div>
                  Total interest/profit:{" "}
                  <strong style={{ color: "#16a34a" }}>{formatMoney(padPreview.profitTotal)}</strong>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* CART */}
      {saleLinesWithMeta.length === 0 ? (
        <div style={{ padding: "14px 4px 6px", fontSize: "13px", color: "#6b7280" }}>
          No items in the current sale yet. Use the pad above and click <strong>Add item</strong>.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginBottom: "12px" }}>
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid #e5e7eb",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#6b7280",
              }}
            >
              <th style={{ padding: "6px 4px" }}>Item</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Qty</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Unit price</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>
                {hideProfitInTab ? "—" : "Profit"}
              </th>
              <th style={{ padding: "6px 4px" }}></th>
            </tr>
          </thead>
          <tbody>
            {saleLinesWithMeta.map((line) => {
              const isEditingLine = editingLineId === line.id;

              return (
                <tr
                  key={line.id}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    cursor: "pointer",
                    backgroundColor: isEditingLine ? "#f8fafc" : "transparent",
                  }}
                  onClick={() => beginEditLine(line.id)}
                  title="Click to edit qty/price"
                >
                  <td style={{ padding: "8px 4px" }}>
                    <span style={{ color: "#2563eb", fontWeight: 600 }}>{line.meta.itemName}</span>
                  </td>

                  <td style={{ padding: "8px 4px", textAlign: "right" }}>
                    {isEditingLine ? (
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.001"
                        min="0"
                        value={line.qtyPieces}
                        onChange={(e) => updateSaleLine(line.id, { qtyPieces: e.target.value })}
                        style={{
                          width: 110,
                          padding: "6px 10px",
                          borderRadius: "999px",
                          border: "1px solid #d1d5db",
                          textAlign: "right",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      formatQty(line.qtyPieces)
                    )}
                  </td>

                  <td style={{ padding: "8px 4px", textAlign: "right" }}>
                    {isEditingLine ? (
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        value={line.unitPrice}
                        onChange={(e) => updateSaleLine(line.id, { unitPrice: e.target.value })}
                        style={{
                          width: 120,
                          padding: "6px 10px",
                          borderRadius: "999px",
                          border: "1px solid #d1d5db",
                          textAlign: "right",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      formatMoney(line.unitPrice)
                    )}
                  </td>

                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600 }}>
                    {formatMoney(line.computed.total)}
                  </td>

                  <td style={{ padding: "8px 4px", textAlign: "right" }}>
                    {hideProfitInTab ? "•••" : formatMoney(line.computed.profit)}
                  </td>

                  <td style={{ padding: "8px 4px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => removeSaleLine(line.id)}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "9999px",
                        border: "1px solid #fee2e2",
                        backgroundColor: "#fef2f2",
                        color: "#b91c1c",
                        fontSize: "16px",
                        cursor: "pointer",
                      }}
                      title="Remove from cart"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}

            <tr>
              <td style={{ padding: "8px 4px", fontWeight: 700 }}>Total</td>
              <td></td>
              <td></td>
              <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 800 }}>{formatMoney(saleTotal)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600, color: hideProfitInTab ? "#6b7280" : "#16a34a" }}>
                {hideProfitInTab ? "•••" : formatMoney(saleTotalProfit)}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      )}

      {/* CUSTOMER + PAYMENT (UNCHANGED) */}
      <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "10px", paddingTop: "10px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "14px", alignItems: "start" }}>
          {/* Left side: customer */}
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#6b7280",
                marginBottom: "6px",
              }}
            >
              Customer
            </div>

            {!isCreditSale && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "13px" }}>
                <input
                  id="attachCustomer"
                  type="checkbox"
                  checked={attachCustomer}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAttachCustomer(checked);
                    if (!checked) {
                      setSelectedCustomerId("");
                      setCustomerName("");
                      setCustomerPhone("");
                    }
                  }}
                />
                <label htmlFor="attachCustomer">Attach customer (optional)</label>
              </div>
            )}

            {(isCreditSale || attachCustomer) && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 44px", gap: "10px", marginBottom: "10px" }}>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "999px",
                      border: "1px solid #d1d5db",
                      fontSize: "13px",
                      backgroundColor: "#ffffff",
                    }}
                    title="👥 Customers"
                  >
                    <option value="">{customers.length ? "👥 Select customer…" : "No customers yet"}</option>
                    {(customers || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || "Unnamed"}
                        {c.phone ? ` (${c.phone})` : ""}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setCustomerModalOpen(true)}
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "14px",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "#fff",
                      cursor: "pointer",
                      fontSize: "18px",
                    }}
                    title="Add customer"
                  >
                    ＋
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                  <input
                    type="text"
                    placeholder="Customer name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "999px",
                      border: "1px solid #d1d5db",
                      fontSize: "13px",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Customer phone (optional)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "999px",
                      border: "1px solid #d1d5db",
                      fontSize: "13px",
                    }}
                  />
                </div>

                {isCreditSale && (
                  <div style={{ marginBottom: "10px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "12px", color: "#6b7280", minWidth: "120px" }}>Due date (optional)</div>
                    <input
                      type="date"
                      value={customerDueDate}
                      onChange={(e) => setCustomerDueDate(e.target.value)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "999px",
                        border: "1px solid #d1d5db",
                        fontSize: "13px",
                        width: "220px",
                      }}
                    />
                    <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                      {salesCaps.dueDateKey
                        ? `Will be sent as: ${salesCaps.dueDateKey}`
                        : "Backend due-date field not detected (won't be sent)."}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right side: payment */}
          <div style={{ padding: "12px 12px", borderRadius: "16px", border: "1px solid #e5e7eb", backgroundColor: "#fff" }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#6b7280",
                marginBottom: "6px",
              }}
            >
              Payment
            </div>

            <div style={{ display: "inline-flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
              {[
                { key: "cash", label: "Cash" },
                { key: "card", label: "POS" },
                { key: "mobile", label: "MoMo" },
              ].map((opt) => {
                const isActive = paymentMode === opt.key;
                const disabled = isCreditSale;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => selectPaymentMode(opt.key)}
                    disabled={disabled}
                    style={{
                      padding: "6px 18px",
                      borderRadius: "999px",
                      border: isActive ? "none" : "1px solid #d1d5db",
                      backgroundColor: disabled ? "#f3f4f6" : isActive ? "#2563eb" : "#f9fafb",
                      color: disabled ? "#9ca3af" : isActive ? "#ffffff" : "#111827",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: disabled ? "not-allowed" : "pointer",
                    }}
                    title={disabled ? "Disabled because this is a credit sale" : ""}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <input
                id="credit-sale-checkbox"
                type="checkbox"
                checked={isCreditSale}
                onChange={(e) => toggleCreditSale(e.target.checked)}
              />
              <label htmlFor="credit-sale-checkbox">Credit sale (customer pays later)</label>
            </div>

            {isCreditSale && (
              <div style={{ padding: "10px 10px", borderRadius: "14px", backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 800 }}>Credit details</div>
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>
                    Total: <strong>{formatMoney(saleTotal)}</strong>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 44px", gap: "10px", alignItems: "center" }}>
                  <input
                    type="text"
                    value={amountCollectedNow}
                    onChange={(e) => setAmountCollectedNow(e.target.value)}
                    placeholder="Amount collected now (optional)"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "999px", border: "1px solid #d1d5db", fontSize: "13px" }}
                  />
                  <button
                    type="button"
                    onClick={() => openCalculator(amountCollectedNow, (amt) => setAmountCollectedNow(String(amt)))}
                    title="Calculator"
                    style={{ width: "44px", height: "44px", borderRadius: "14px", border: "1px solid #e5e7eb", backgroundColor: "#fff", cursor: "pointer", fontSize: "16px" }}
                  >
                    🧮
                  </button>
                </div>

                <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setAmountCollectedNow("0")}
                    style={{ padding: "6px 10px", borderRadius: "999px", border: "1px solid #e5e7eb", backgroundColor: "#fff", cursor: "pointer", fontSize: "12px" }}
                  >
                    Collect 0
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountCollectedNow(String(Math.round(saleTotal / 2)))}
                    style={{ padding: "6px 10px", borderRadius: "999px", border: "1px solid #e5e7eb", backgroundColor: "#fff", cursor: "pointer", fontSize: "12px" }}
                  >
                    Half
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountCollectedNow(String(Math.round(saleTotal)))}
                    style={{ padding: "6px 10px", borderRadius: "999px", border: "1px solid #dcfce7", backgroundColor: "#ecfdf3", cursor: "pointer", fontSize: "12px", fontWeight: 700, color: "#166534" }}
                  >
                    Collect All
                  </button>
                </div>

                <div style={{ marginTop: "10px", fontSize: "12px", color: "#4b5563", display: "flex", justifyContent: "space-between" }}>
                  <div>
                    Collected now: <strong>{formatMoney(computedCollectedNow)}</strong>
                  </div>
                  <div>
                    Balance: <strong style={{ color: "#b91c1c" }}>{formatMoney(computedCreditBalance)}</strong>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleCompleteSale}
              disabled={!canCompleteSale}
              style={{
                marginTop: "4px",
                width: "100%",
                padding: "12px 18px",
                borderRadius: "999px",
                border: "none",
                backgroundColor: canCompleteSale ? "#2563eb" : "#9ca3af",
                color: "white",
                fontWeight: 700,
                fontSize: "15px",
                cursor: canCompleteSale ? "pointer" : "not-allowed",
              }}
            >
              {primaryButtonLabel}
            </button>
          </div>
        </div>
      </div>

      <CustomerModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onSave={async (c) => {
          try {
            const created = await createCustomer(c);
            setCustomerModalOpen(false);
            fireFlash(`Customer added: ${created?.name || c.name}`);
          } catch (e) {
            setError?.(e.message || "Failed to add customer.");
          }
        }}
      />

      {/* ✅ Customer overlay */}
      <CustomerDisplay
        open={customerDisplayOpen}
        onClose={() => setCustomerDisplayOpen(false)}
        lines={saleLinesWithMeta}
        total={saleTotal}
      />
    </div>
  );
}
