import React from "react";
import { ChevronLeft, DollarSign, Package2, Plus, Printer, Search, Trash2, UserRound, X } from "lucide-react";

type MoneyFn = (value: number) => string;
type TableData = { id: string; name: string; status: string; waiterName?: string | null; customerName?: string | null; active: boolean };
type ProductData = { id: string; code: number; name: string; salePriceCents: number; categoryId?: string | null; category?: { id: string; name: string } | null; printTarget: string };
type AdditionData = { id: string; name: string; valueCents: number; charge: boolean; category?: string | null; active: boolean };
type CustomerData = { id: string; name: string; phone?: string | null };
type PaymentMethodData = { id: string; name: string; allowFee: boolean; active: boolean };

const API_URL = import.meta.env.VITE_API_URL ?? (window.location.port === "5173" ? "http://localhost:3333" : window.location.origin);

const statusColor: Record<string, string> = {
  LIVRE: "#f97316",
  OCUPADA: "#22c55e",
  AGUARDANDO_PREPARO: "#eab308",
  PRONTO: "#22c55e",
  FECHANDO_CONTA: "#3b82f6",
  AGUARDANDO_PAGAMENTO: "#3b82f6",
  BLOQUEADA: "#ef4444"
};

const statusLabel: Record<string, string> = {
  LIVRE: "Livre",
  OCUPADA: "Ocupada",
  AGUARDANDO_PREPARO: "Preparando",
  PRONTO: "Pronto",
  FECHANDO_CONTA: "Fechando",
  AGUARDANDO_PAGAMENTO: "Aguard. Pagto.",
  BLOQUEADA: "Bloqueada"
};

async function api(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("taberna-token");
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message ?? "Erro");
  return data;
}

function calcTotal(items: Array<{ quantity: number; unitPriceCents: number; cancelledAt?: string | null; additives: Array<{ quantity: number; unitPriceCents: number }> }>) {
  return items.reduce((sum, item) => {
    if (item.cancelledAt) return sum;
    const addTotal = item.additives.reduce((a, add) => a + add.quantity * add.unitPriceCents, 0);
    return sum + item.quantity * item.unitPriceCents + addTotal;
  }, 0);
}

export default function ComandasModule({ data: initialData, money, mutate: reload }: { data: { tables: TableData[]; products: ProductData[]; additions: AdditionData[]; customers: CustomerData[]; paymentMethods: PaymentMethodData[]; orders: any[]; company: any; user: any; users: any[] } | null; money: MoneyFn; mutate: (path: string, options?: RequestInit) => Promise<void> }) {
  const filterComandas = React.useCallback((list: TableData[]) => list.filter((table) => table.name.toLowerCase().startsWith("comanda")), []);
  const [tables, setTables] = React.useState<TableData[]>(filterComandas(initialData?.tables ?? []));
  const [selectedTable, setSelectedTable] = React.useState<TableData | null>(null);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [view, setView] = React.useState<"grid" | "order" | "payment">("grid");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedProducts, setSelectedProducts] = React.useState<Array<{ product: ProductData; quantity: number; note: string; selectedAdditions: Array<AdditionData & { qty: number }> }>>([]);
  const [showAddItem, setShowAddItem] = React.useState(false);
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerData | null>(null);
  const [payments, setPayments] = React.useState<Array<{ method: PaymentMethodData; amountCents: number }>>([]);
  const [receivableDueDate, setReceivableDueDate] = React.useState("");
  const [discountCents, setDiscountCents] = React.useState(0);
  const [discountPercent, setDiscountPercent] = React.useState(0);
  const [showOpenDialog, setShowOpenDialog] = React.useState(false);
  const [openCustomerName, setOpenCustomerName] = React.useState("");
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelItemId, setCancelItemId] = React.useState<string | null>(null);
  const [showCancelTable, setShowCancelTable] = React.useState(false);
  const [showTransfer, setShowTransfer] = React.useState(false);
  const [transferTarget, setTransferTarget] = React.useState("");
  const [transferItemIds, setTransferItemIds] = React.useState<string[]>([]);
  const [showMergeModal, setShowMergeModal] = React.useState(false);
  const [mergeSources, setMergeSources] = React.useState<string[]>([]);
  const [showPrintDialog, setShowPrintDialog] = React.useState(false);
  const [paidOrderId, setPaidOrderId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!initialData) return;
    setTables(filterComandas(initialData.tables));
  }, [initialData, filterComandas]);

  React.useEffect(() => {
    if (view !== "grid") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  async function loadComandas() {
    const all = await api("/api/tables");
    setTables(filterComandas(all ?? []));
  }

  async function loadComandaOrders() {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const data = await api(`/api/tables/${selectedTable.id}/pre-conta`);
      setOrders(data.orders ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (selectedTable && (view === "order" || view === "payment")) void loadComandaOrders();
  }, [selectedTable, view]);

  async function openTable() {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const opened = await api(`/api/tables/${selectedTable.id}/open`, { method: "PUT", body: JSON.stringify({ customerName: openCustomerName || null }) });
      setSelectedTable(opened);
      await reload("/api/company", {});
      const order = await api("/api/orders", { method: "POST", body: JSON.stringify({ type: "MESA", tableId: opened.id, items: [], payments: [] }) });
      setOrders([order]);
      await loadComandas();
      setView("order");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addItems() {
    if (!selectedTable || !selectedProducts.length) return;
    setLoading(true);
    try {
      const existingOrder = orders.find((o: any) => o.tableId === selectedTable.id && o.status !== "PAGO" && o.status !== "CANCELADO");
      const orderId = existingOrder?.id;
      if (!orderId) return setError("Nenhuma comanda aberta.");
      for (const sp of selectedProducts) {
        const addData = sp.selectedAdditions.filter((a) => a.qty > 0).map((a) => ({ additionalId: a.id, name: a.name, quantity: a.qty, unitPriceCents: a.valueCents }));
        const unitPriceCents = sp.product.salePriceCents;
        const addTotal = addData.reduce((s, a) => s + a.quantity * a.unitPriceCents, 0);
        const totalCents = sp.quantity * unitPriceCents + addTotal;
        await api(`/api/orders/${orderId}/items`, { method: "POST", body: JSON.stringify({ productId: sp.product.id, nameSnapshot: sp.product.name, quantity: sp.quantity, unitPriceCents, totalCents, printTarget: sp.product.printTarget, note: sp.note || null, additives: addData }) });
      }
      await loadComandaOrders();
      await loadComandas();
      setSelectedProducts([]);
      setShowAddItem(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function cancelItem() {
    if (!cancelItemId || !cancelReason) return;
    setLoading(true);
    try {
      await api(`/api/orders/${orders[0]?.id}/cancel-item`, { method: "POST", body: JSON.stringify({ itemId: cancelItemId, reason: cancelReason }) });
      await loadComandaOrders();
      setCancelItemId(null);
      setCancelReason("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function cancelTable() {
    if (!selectedTable) return;
    setLoading(true);
    try {
      await api(`/api/tables/${selectedTable.id}/cancel`, { method: "POST" });
      await loadComandas();
      setShowCancelTable(false);
      setView("grid");
      setSelectedTable(null);
      setOrders([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function transferItems() {
    if (!selectedTable || !transferTarget || !transferItemIds.length) return;
    setLoading(true);
    try {
      await api("/api/orders/transfer-items", { method: "POST", body: JSON.stringify({ fromTableId: selectedTable.id, toTableId: transferTarget, orderItemIds: transferItemIds }) });
      await loadComandas();
      await loadComandaOrders();
      setShowTransfer(false);
      setTransferItemIds([]);
      setTransferTarget("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function mergeTables() {
    if (!selectedTable || !mergeSources.length) return;
    setLoading(true);
    try {
      await api("/api/tables/merge", { method: "POST", body: JSON.stringify({ mainTableId: selectedTable.id, secondaryTableIds: mergeSources }) });
      await loadComandas();
      await loadComandaOrders();
      setShowMergeModal(false);
      setMergeSources([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function payOrder() {
    if (!selectedTable || !orders.length) return;
    setLoading(true);
    try {
      const orderId = orders[0].id;
      const subtotal = calcTotal(orders[0]?.items ?? []);
      const total = subtotal - discountCents - Math.round((discountPercent / 100) * subtotal);
      const paymentTotal = payments.reduce((s, p) => s + p.amountCents, 0);
      if (paymentTotal < total) return setError("Total dos pagamentos é menor que o valor da conta.");
      await api(`/api/orders/${orderId}/pay`, { method: "POST", body: JSON.stringify({ customerId: selectedCustomer?.id, payments: payments.map((p) => ({ paymentMethodId: p.method.id, methodNameSnapshot: p.method.name, amountCents: p.amountCents, feeCents: 0, changeCents: 0 })), generateReceivable: false, receivableDueDate: receivableDueDate || undefined }) });
      setPaidOrderId(orderId);
      setShowPrintDialog(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function finishPayment(doPrint: boolean) {
    if (!paidOrderId) return;
    setShowPrintDialog(false);
    setLoading(true);
    try {
      if (doPrint) await api(`/api/orders/${paidOrderId}/reprint`, { method: "POST" }).catch(() => {});
      await reload("/api/company", {});
      await loadComandas();
      setView("grid");
      setSelectedTable(null);
      setOrders([]);
      setPayments([]);
      setDiscountCents(0);
      setDiscountPercent(0);
      setSelectedCustomer(null);
      setPaidOrderId(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const products = initialData?.products ?? [];
  const customers = initialData?.customers ?? [];
  const paymentMethods = initialData?.paymentMethods ?? [];
  const additions = initialData?.additions ?? [];
  const filteredProducts = searchTerm ? products.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || String(p.code).includes(searchTerm)) : products.slice(0, 20);
  const filteredCustomers = customerSearch ? customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase())) : customers;
  const items = orders[0]?.items ?? [];
  const subtotal = calcTotal(items);
  const discVal = discountCents + Math.round((discountPercent / 100) * subtotal);
  const totalFinal = subtotal - discVal;
  const paidTotal = payments.reduce((s, p) => s + p.amountCents, 0);
  const remaining = totalFinal - paidTotal;
  const currentWaiterName = orders[0]?.waiter?.name ?? orders[0]?.waiterNameSnapshot ?? selectedTable?.waiterName ?? "Sem garçom";
  const [showItemMeta, setShowItemMeta] = React.useState(true);
  const [showCancelledItems, setShowCancelledItems] = React.useState(false);
  const activeItems = items.filter((i: any) => !i.cancelledAt);
  const cancelledItems = items.filter((i: any) => i.cancelledAt);

  function selectProduct(product: ProductData) {
    if (selectedProducts.some((sp) => sp.product.id === product.id)) return;
    setSelectedProducts([...selectedProducts, { product, quantity: 1, note: "", selectedAdditions: [] }]);
  }

  function updateProductQty(index: number, qty: number) {
    const copy = [...selectedProducts];
    copy[index] = { ...copy[index], quantity: Math.max(1, qty) };
    setSelectedProducts(copy);
  }

  function updateProductNote(index: number, note: string) {
    const copy = [...selectedProducts];
    copy[index] = { ...copy[index], note };
    setSelectedProducts(copy);
  }

  function removeProduct(index: number) {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  }

  function toggleAddition(spIndex: number, add: AdditionData) {
    const copy = [...selectedProducts];
    const existing = copy[spIndex].selectedAdditions.find((a) => a.id === add.id);
    if (existing) copy[spIndex] = { ...copy[spIndex], selectedAdditions: copy[spIndex].selectedAdditions.filter((a) => a.id !== add.id) };
    else copy[spIndex] = { ...copy[spIndex], selectedAdditions: [...copy[spIndex].selectedAdditions, { ...add, qty: 1 }] };
    setSelectedProducts(copy);
  }

  function updateAddQty(spIndex: number, addId: string, qty: number) {
    const copy = [...selectedProducts];
    copy[spIndex] = { ...copy[spIndex], selectedAdditions: copy[spIndex].selectedAdditions.map((a) => (a.id === addId ? { ...a, qty } : a)) };
    setSelectedProducts(copy);
  }

  if (view === "order" && selectedTable) {
    return (
      <div className="stack">
        {error && <div className="toast" style={{ position: "static", marginBottom: 8 }}>{error}<button className="ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>OK</button></div>}
        {loading && <div className="loading-bar" />}
        <div style={{ display: "grid", gridTemplateColumns: "260px 1px minmax(0, 1fr)", gap: 0, alignItems: "stretch" }}>
          <aside className="panel" style={{ position: "sticky", top: 16, display: "grid", gap: 8, marginRight: 14, padding: "16px 12px 16px 16px", overflow: "hidden", background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(30,41,59,0.92))", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 18px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "2px 2px 4px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 2 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(226,232,240,0.55)", fontWeight: 700 }}>Menu da comanda</div>
              <div style={{ fontSize: 12, color: "rgba(226,232,240,0.78)", marginTop: 2 }}>Ações rápidas</div>
            </div>
            <div>
              <h2 style={{ margin: 0 }}>{selectedTable.name}</h2>
              <small style={{ color: "var(--text-muted)" }}>{statusLabel[selectedTable.status]} · {orders[0]?.createdAt ? new Date(orders[0].createdAt).toLocaleString("pt-BR") : ""}</small>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #dbeafe, #eff6ff)", borderRadius: 50, padding: "5px 12px 5px 10px", width: "fit-content", border: "1px solid #93c5fd" }}>
              <UserRound size={14} style={{ color: "#2563eb" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1e40af" }}>Cliente:</span>
              <input value={selectedTable.customerName ?? ""} autoFocus={!selectedTable.customerName} onChange={async (e) => { const v = e.target.value; await api(`/api/tables/${selectedTable.id}`, { method: "PUT", body: JSON.stringify({ customerName: v || null }) }); await loadComandas(); setSelectedTable((prev) => prev ? { ...prev, customerName: v || null } : prev); }} style={{ background: "transparent", border: "none", color: "#1e3a5f", fontWeight: 700, fontSize: 13, padding: "1px 4px", minWidth: 86, outline: "none" }} placeholder="Digite o nome..." />
            </div>
            <div style={{ display: "grid", gap: 7, paddingRight: 10 }}>
              <button onClick={() => setShowAddItem(true)} style={{ background: "linear-gradient(135deg, #10b981, #059669)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><Plus size={12} /> Lançar Item</button>
              <button onClick={() => setShowCancelTable(true)} style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><Trash2 size={12} /> Cancelar Comanda</button>
              <button onClick={() => setShowTransfer(true)} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><Trash2 size={12} /> Transferir</button>
              <button onClick={() => setShowMergeModal(true)} style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><UserRound size={12} /> Juntar</button>
              <button onClick={() => { api(`/api/orders/${orders[0]?.id}/reprint`, { method: "POST" }).catch(() => {}); }} style={{ background: "linear-gradient(135deg, #06b6d4, #0891b2)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><Printer size={12} /> Imprimir</button>
              <button onClick={() => setView("payment")} style={{ background: "linear-gradient(135deg, #10b981, #059669)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><DollarSign size={12} /> Conta</button>
              <button onClick={() => { setView("grid"); setSelectedTable(null); setOrders([]); }} style={{ background: "linear-gradient(135deg, #64748b, #475569)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><ChevronLeft size={12} /> Voltar</button>
            </div>
          </aside>

          <div aria-hidden="true" style={{ width: 1, alignSelf: "stretch", margin: "16px 0", background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.88), rgba(255,255,255,0.35), transparent)", boxShadow: "0 0 12px rgba(255,255,255,0.18)" }} />

          <section className="panel" style={{ minWidth: 0, marginLeft: 16, background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(30,41,59,0.92))", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 18px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <h3 style={{ marginBottom: 2 }}>Itens</h3>
                <small style={{ color: "var(--text-dim)", fontSize: 12 }}>{activeItems.length} itens lançados</small>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={() => setShowItemMeta((v) => !v)} style={{ background: showItemMeta ? "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(37,99,235,0.25))" : "rgba(255,255,255,0.06)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{showItemMeta ? "Ocultar garçom/horário" : "Mostrar garçom/horário"}</button>
                <span style={{ background: "rgba(255,255,255,0.06)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>Toque duplo para editar</span>
              </div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {activeItems.map((item: any, idx: number) => (
                <div key={item.id ?? idx} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto auto auto", gap: 12, alignItems: "center", padding: "14px 16px", borderRadius: 16, background: "linear-gradient(180deg, rgba(71,85,105,0.58), rgba(71,85,105,0.38))", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ color: "#f8fafc", fontSize: 14, display: "block" }}>{item.nameSnapshot}</strong>
                    {showItemMeta && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        <span style={{ background: "rgba(255,255,255,0.08)", color: "#dbeafe", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>Garçom: {currentWaiterName}</span>
                        <span style={{ background: "rgba(255,255,255,0.08)", color: "#dbeafe", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span>
                      </div>
                    )}
                  </div>
                  <span style={{ color: "#cbd5e1", fontSize: 13, whiteSpace: "nowrap" }}>{item.quantity}x {money(item.unitPriceCents)}</span>
                    <span>{item.note && <small style={{ color: "#78350f", background: "linear-gradient(135deg, #fef3c7, #fde68a)", border: "1px solid rgba(180,83,9,0.18)", fontWeight: 800, fontSize: 12, padding: "3px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>Obs: {item.note}</small>}</span>
                    <span style={{ color: "#dbeafe", fontWeight: 700, whiteSpace: "nowrap" }}>{money(item.totalCents)}</span>
                    <button className="ghost danger" onClick={() => { setCancelItemId(item.id); setCancelReason(""); }} style={{ width: 30, height: 30, padding: 0, borderRadius: 999, display: "grid", placeItems: "center" }}><Trash2 size={13} /></button>
                </div>
              ))}
              {!activeItems.length && <small style={{ color: "var(--text-dim)", padding: 12 }}>Nenhum item lançado.</small>}
            </div>
            {cancelledItems.length > 0 && (
              <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
                <button onClick={() => setShowCancelledItems((v) => !v)} style={{ background: "rgba(239,68,68,0.12)", color: "#fecaca", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  {showCancelledItems ? "Ocultar cancelados" : `Ver cancelados (${cancelledItems.length})`}
                </button>
                {showCancelledItems && (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {cancelledItems.map((item: any) => (
                      <div key={item.id} style={{ padding: "12px 14px", borderRadius: 14, background: "linear-gradient(180deg, rgba(127,29,29,0.45), rgba(69,10,10,0.36))", border: "1px solid rgba(248,113,113,0.18)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ color: "#fee2e2", display: "block" }}>{item.nameSnapshot}</strong>
                          <small style={{ color: "#fecaca" }}>{item.cancelledReason ?? "Cancelado"} · {item.cancelledAt ? new Date(item.cancelledAt).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</small>
                        </div>
                        <span style={{ color: "#fca5a5", fontWeight: 800, whiteSpace: "nowrap" }}>-{money(item.totalCents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <div style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.24), rgba(16,185,129,0.16))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "10px 14px", fontWeight: 800, fontSize: 17, color: "#fff" }}>Total: {money(subtotal)}</div>
            </div>
          </section>
        </div>

        {showAddItem && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 998, display: "grid", placeItems: "center", backdropFilter: "blur(4px)" }} onClick={() => { if (!selectedProducts.length) setShowAddItem(false); }}>
            <div style={{ background: "#fff", borderRadius: 20, width: 740, maxWidth: "96vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 80px rgba(37,99,235,0.15)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
              <div className="row-between" style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <h3 style={{ margin: 0, fontSize: 17, color: "#1e293b" }}><Package2 size={18} style={{ marginRight: 8, color: "#2563eb" }} />Lançar Itens</h3>
                <button className="ghost" onClick={() => setShowAddItem(false)} style={{ borderRadius: 10, padding: 6 }}><X size={18} /></button>
              </div>
              <div style={{ padding: "12px 24px", borderBottom: "1px solid #e2e8f0" }}>
                <div style={{ position: "relative" }}>
                  <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                  <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por nome ou código..." autoFocus style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" }} />
                </div>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "12px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "#f8fafc" }}>
                {filteredProducts.map((p) => {
                  const isSelected = selectedProducts.some((sp) => sp.product.id === p.id);
                  return (
                    <button key={p.id} onClick={() => { if (!isSelected) selectProduct(p); else removeProduct(selectedProducts.findIndex((sp) => sp.product.id === p.id)); }} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: 12, border: isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0", background: isSelected ? "#eff6ff" : "#fff", cursor: "pointer", textAlign: "left", fontSize: 13 }}>
                      <span style={{ color: "#94a3b8", fontWeight: 700, minWidth: 32, fontSize: 12 }}>#{p.code}</span>
                      <div style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 14, color: "#1e293b" }}>{p.name}</strong><small style={{ color: "#94a3b8" }}>{p.category?.name ?? ""}</small></div>
                      <span style={{ fontWeight: 700, color: "#2563eb", whiteSpace: "nowrap", fontSize: 14 }}>{money(p.salePriceCents)}</span>
                    </button>
                  );
                })}
              </div>
              {selectedProducts.length > 0 && (
                <div style={{ borderTop: "1px solid #e2e8f0", padding: "16px 24px", background: "#fff" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {selectedProducts.map((sp, idx) => (
                      <div key={sp.product.id} style={{ background: "#f8fafc", borderRadius: 12, padding: 14, border: "1px solid #e2e8f0" }}>
                        <div className="row-between"><strong style={{ fontSize: 15, color: "#1e293b" }}>{sp.product.name}</strong><button className="ghost danger" onClick={() => removeProduct(idx)} style={{ padding: 4 }}><X size={16} /></button></div>
                        <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#475569" }}>Qtd<input type="number" value={sp.quantity} onChange={(e) => updateProductQty(idx, Number(e.target.value))} min={1} style={{ width: 58, padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, textAlign: "center", background: "#fff" }} /></label>
                          <input value={sp.note} onChange={(e) => updateProductNote(idx, e.target.value)} placeholder="Obs: sem cebola, bem passado..." style={{ flex: 1, minWidth: 160, padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, background: "#fff" }} />
                          <span style={{ fontWeight: 700, color: "#2563eb", fontSize: 16, marginLeft: "auto", whiteSpace: "nowrap" }}>{money(sp.quantity * sp.product.salePriceCents)}</span>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {additions.filter((a) => a.active).map((add) => {
                              const sel = sp.selectedAdditions.find((sa) => sa.id === add.id);
                              return (
                                <button key={add.id} onClick={() => toggleAddition(idx, add)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "5px 12px", borderRadius: 20, border: sel ? "2px solid #2563eb" : "1px solid #cbd5e1", background: sel ? "#eff6ff" : "#fff", color: sel ? "#1e40af" : "#475569", cursor: "pointer" }}>
                                  {add.name} {sel ? `(${sel.qty}x)` : ""} <span style={{ opacity: 0.5 }}>{money(add.valueCents)}</span>
                                </button>
                              );
                            })}
                          </div>
                          {sp.selectedAdditions.map((add) => (
                            <div key={add.id} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                              <small style={{ color: "#64748b" }}>{add.name}</small>
                              <input type="number" min={1} value={add.qty} onChange={(e) => updateAddQty(idx, add.id, Number(e.target.value))} style={{ width: 60, padding: "5px 8px", borderRadius: 8, border: "1px solid #cbd5e1" }} />
                              <small style={{ color: "#64748b" }}>{money(add.valueCents)}</small>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={addItems} style={{ marginTop: 14, width: "100%", padding: "12px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Plus size={18} /> Confirmar itens</button>
                </div>
              )}
            </div>
          </div>
        )}

        {cancelItemId && (
          <section className="panel">
            <h3>Cancelar Item</h3>
            <label>Motivo<select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}><option value="">Selecione...</option><option value="Cliente desistiu">Cliente desistiu</option><option value="Produto lançado errado">Produto lançado errado</option><option value="Produto indisponível">Produto indisponível</option><option value="Erro do garçom">Erro do garçom</option><option value="Cortesia autorizada">Cortesia autorizada</option></select></label>
            <div className="row-actions"><button disabled={!cancelReason} onClick={cancelItem}>Confirmar cancelamento</button><button className="ghost" onClick={() => setCancelItemId(null)}>Voltar</button></div>
          </section>
        )}

        {showCancelTable && selectedTable && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 998, display: "grid", placeItems: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowCancelTable(false)}>
            <div style={{ background: "#fff", borderRadius: 20, width: 400, maxWidth: "90vw", boxShadow: "0 25px 80px rgba(0,0,0,0.2)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "28px 24px 20px", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fef2f2", display: "grid", placeItems: "center", margin: "0 auto 12px" }}><Trash2 size={24} style={{ color: "#ef4444" }} /></div>
                <h3 style={{ margin: "0 0 4px", color: "#1e293b" }}>Cancelar {selectedTable.name}?</h3>
                <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>Todos os itens desta comanda serão cancelados e ela será liberada.</p>
              </div>
              <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="ghost" onClick={() => setShowCancelTable(false)} style={{ borderRadius: 10, padding: "10px 20px" }}>Voltar</button>
                <button onClick={cancelTable} style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Sim, Cancelar Comanda</button>
              </div>
            </div>
          </div>
        )}

        {showOpenDialog && selectedTable && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 999, backdropFilter: "blur(4px)" }} onClick={() => setShowOpenDialog(false)}>
            <div style={{ background: "linear-gradient(135deg, #0f172a, #1d4ed8)", borderRadius: 20, padding: 28, width: 380, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(37,99,235,0.4)", color: "#fff" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>🧾</div>
              <h2 style={{ margin: "0 0 4px", textAlign: "center", fontSize: 24 }}>Abrir {selectedTable.name}</h2>
              <p style={{ textAlign: "center", opacity: 0.8, margin: "0 0 16px", fontSize: 14 }}>Confirma a abertura da comanda?</p>
              <label style={{ display: "block", marginBottom: 16 }}>Nome/Cliente<input value={openCustomerName} onChange={(e) => setOpenCustomerName(e.target.value)} placeholder="Opcional" style={{ width: "100%", marginTop: 6 }} /></label>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="ghost" onClick={() => setShowOpenDialog(false)} style={{ color: "rgba(255,255,255,0.88)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, padding: "11px 24px", fontSize: 14, background: "rgba(255,255,255,0.06)" }}>Cancelar</button>
                <button onClick={() => { setShowOpenDialog(false); void openTable(); }} style={{ background: "linear-gradient(135deg, #ffffff, #e2e8f0)", color: "#1e3a5f", border: "none", borderRadius: 14, padding: "11px 24px", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(0,0,0,0.16)" }}>Sim, Abrir</button>
              </div>
            </div>
          </div>
        )}

        {showPrintDialog && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 999, backdropFilter: "blur(4px)" }}>
            <div style={{ background: "#fff", borderRadius: 20, width: 360, maxWidth: "92vw", maxHeight: "90vh", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "20px 24px", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}><Printer size={28} style={{ color: "#2563eb", marginBottom: 4 }} /><h3 style={{ margin: 0, fontSize: 16 }}>Comprovante de Venda</h3></div>
              <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", fontFamily: "'Courier New', monospace", fontSize: 12, lineHeight: 1.5, background: "#fafafa", color: "#1e293b" }}>
                <div style={{ textAlign: "center", marginBottom: 12 }}><strong style={{ fontSize: 14 }}>{initialData?.company?.nomeFantasia ?? "Lanchonete"}</strong></div>
                <div style={{ borderTop: "1px dashed #94a3b8", borderBottom: "1px dashed #94a3b8", padding: "8px 0", marginBottom: 8 }}>
                  <div>Pedido #{orders[0]?.number}</div>
                  <div>Comanda: {selectedTable?.name}</div>
                  {selectedTable?.customerName && <div>Cliente: {selectedTable.customerName}</div>}
                  <div>Garçom: {currentWaiterName}</div>
                  <div>Horário: {orders[0]?.createdAt ? new Date(orders[0].createdAt).toLocaleString("pt-BR") : ""}</div>
                </div>
                <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                  {activeItems.map((item: any) => (
                    <div key={item.id} style={{ borderBottom: "1px dotted #cbd5e1", paddingBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong>{item.quantity}x {item.nameSnapshot}</strong>
                        <span>{money(item.totalCents)}</span>
                      </div>
                      {item.note && <div style={{ color: "#475569" }}>Obs: {item.note}</div>}
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}><div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}><span>TOTAL</span><span>{money(totalFinal)}</span></div></div>
              </div>
              <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "center" }}><button onClick={() => finishPayment(false)} className="ghost" style={{ borderRadius: 12, padding: "10px 20px", fontSize: 14 }}>Pular</button><button onClick={() => finishPayment(true)} style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: 12, padding: "10px 24px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Printer size={16} /> Imprimir</button></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === "payment" && selectedTable) {
    return (
      <div className="stack">
        {error && <div className="toast" style={{ position: "static", marginBottom: 8 }}>{error}<button className="ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>OK</button></div>}
        {loading && <div className="loading-bar" />}
        <div className="row-between">
          <div><h2 style={{ margin: 0 }}>Pagamento - Comanda {selectedTable.name}</h2><small style={{ color: "var(--text-muted)" }}>Pedido #{orders[0]?.number}</small></div>
          <button className="ghost" onClick={() => setView("order")}><ChevronLeft size={16} /> Voltar</button>
        </div>

        <div className="panel-grid">
          <section className="panel">
            <h3>Resumo</h3>
            <div className="summary-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="summary-card"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
              <div className="summary-card"><span>Desconto</span><strong style={{ color: "var(--accent)" }}>-{money(discVal)}</strong></div>
              <div className="summary-card"><span>Total</span><strong style={{ fontSize: 24 }}>{money(totalFinal)}</strong></div>
              <div className="summary-card"><span>Restante</span><strong style={{ color: remaining <= 0 ? "#22c55e" : "#ef4444" }}>{money(Math.max(0, remaining))}</strong></div>
            </div>
            <div className="grid-2" style={{ marginTop: 12 }}>
              <label>Desconto R$<input type="number" step="0.01" value={discountCents / 100} onChange={(e) => setDiscountCents(Math.round(Number(e.target.value) * 100))} /></label>
              <label>Desconto %<input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} /></label>
            </div>
          </section>

          <section className="panel">
            <h3>Formas de Pagamento</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {paymentMethods.filter((pm) => pm.active).map((pm) => {
                const existing = payments.find((p) => p.method.id === pm.id);
                return (
                  <div key={pm.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10 }}>
                    <div className="row-between">
                      <strong>{pm.name}</strong>
                      {existing ? <button className="ghost danger" onClick={() => setPayments(payments.filter((p) => p.method.id !== pm.id))}><X size={14} /></button> : <button onClick={() => setPayments([...payments, { method: pm, amountCents: remaining > 0 ? remaining : 0 }])}>Adicionar</button>}
                    </div>
                    {existing && (
                      <div className="grid-2" style={{ marginTop: 6 }}>
                        <label>Valor R$<input type="number" step="0.01" value={existing.amountCents / 100} onChange={(e) => setPayments(payments.map((p) => p.method.id === pm.id ? { ...p, amountCents: Math.round(Number(e.target.value) * 100) } : p))} autoFocus={existing.amountCents === 0} /></label>
                        <div />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="row-actions" style={{ marginTop: 16 }}><button onClick={() => setView("order")} className="ghost"><ChevronLeft size={16} /> Voltar</button><button disabled={paidTotal < totalFinal} onClick={payOrder}><DollarSign size={18} /> Finalizar - {money(totalFinal)}</button></div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <div className="toast" style={{ position: "static", marginBottom: 8 }}>{error}<button className="ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>OK</button></div>}
      {loading && <div className="loading-bar" />}
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Comandas</h2>
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{tables.filter((t) => t.status !== "LIVRE").length} abertas · {tables.filter((t) => t.status === "LIVRE").length} livres</span>
      </div>

      <div className="table-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
        {tables.filter((table) => (searchTerm ? table.name.toLowerCase().includes(searchTerm.toLowerCase()) : true)).map((table) => {
          const color = statusColor[table.status] ?? "#6b7280";
          return (
            <div key={table.id} onClick={() => { if (table.status === "LIVRE") { setSelectedTable(table); setShowOpenDialog(true); } }} onDoubleClick={() => { if (table.status !== "LIVRE") { setSelectedTable(table); setOrders([]); setView("order"); void loadComandaOrders(); window.scrollTo({ top: 0, behavior: "smooth" }); } }} style={{ background: `linear-gradient(145deg, ${color}22, ${color}11)`, border: `2px solid ${color}44`, borderRadius: 16, padding: 20, cursor: "pointer", textAlign: "center" }}>
              <div className="table-icon-bubble" style={{ background: color }}><UserRound size={24} /></div>
              <strong style={{ display: "block", fontSize: 15 }}>{table.name}</strong>
              <span style={{ fontSize: 12, color: color, fontWeight: 700 }}>{statusLabel[table.status] ?? table.status}</span>
              {table.customerName ? <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, background: "#dbeafe", borderRadius: 20, padding: "2px 10px 2px 6px", fontSize: 11, fontWeight: 700, color: "#1e40af" }}><UserRound size={12} />{table.customerName}</div> : <div style={{ minHeight: 22 }} />}
              {table.status !== "LIVRE" && (() => {
                const tblOrders = (initialData?.orders ?? []).filter((o: any) => o.tableId === table.id && o.status !== "PAGO" && o.status !== "CANCELADO");
                const total = tblOrders.reduce((s: number, o: any) => s + (o.items ?? []).reduce((si: number, i: any) => si + (i.cancelledAt ? 0 : i.totalCents + (i.additives ?? []).reduce((sa: number, a: any) => sa + a.totalCents, 0)), 0), 0);
                return total > 0 ? <div style={{ fontWeight: 800, fontSize: 17, color: "#a16207", marginTop: 4, background: "#fef9c3", borderRadius: 8, padding: "2px 10px", display: "inline-block", border: "1px solid #facc15" }}>{money(total)}</div> : null;
              })()}
            </div>
          );
        })}
      </div>

      {showAddItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 998, display: "grid", placeItems: "center", backdropFilter: "blur(4px)" }} onClick={() => { if (!selectedProducts.length) setShowAddItem(false); }}>
          <div style={{ background: "#fff", borderRadius: 20, width: 740, maxWidth: "96vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 80px rgba(37,99,235,0.15)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div className="row-between" style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <h3 style={{ margin: 0, fontSize: 17, color: "#1e293b" }}><Package2 size={18} style={{ marginRight: 8, color: "#2563eb" }} />Lançar Itens</h3>
              <button className="ghost" onClick={() => setShowAddItem(false)} style={{ borderRadius: 10, padding: 6 }}><X size={18} /></button>
            </div>
            <div style={{ padding: "12px 24px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por nome ou código..." autoFocus style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" }} />
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "12px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "#f8fafc" }}>
              {filteredProducts.map((p) => {
                const isSelected = selectedProducts.some((sp) => sp.product.id === p.id);
                return (
                  <button key={p.id} onClick={() => { if (!isSelected) selectProduct(p); else removeProduct(selectedProducts.findIndex((sp) => sp.product.id === p.id)); }} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: 12, border: isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0", background: isSelected ? "#eff6ff" : "#fff", cursor: "pointer", textAlign: "left", fontSize: 13 }}>
                    <span style={{ color: "#94a3b8", fontWeight: 700, minWidth: 32, fontSize: 12 }}>#{p.code}</span>
                    <div style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 14, color: "#1e293b" }}>{p.name}</strong><small style={{ color: "#94a3b8" }}>{p.category?.name ?? ""}</small></div>
                    <span style={{ fontWeight: 700, color: "#2563eb", whiteSpace: "nowrap", fontSize: 14 }}>{money(p.salePriceCents)}</span>
                  </button>
                );
              })}
            </div>
            {selectedProducts.length > 0 && (
              <div style={{ borderTop: "1px solid #e2e8f0", padding: "16px 24px", background: "#fff" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selectedProducts.map((sp, idx) => (
                    <div key={sp.product.id} style={{ background: "#f8fafc", borderRadius: 12, padding: 14, border: "1px solid #e2e8f0" }}>
                      <div className="row-between"><strong style={{ fontSize: 15, color: "#1e293b" }}>{sp.product.name}</strong><button className="ghost danger" onClick={() => removeProduct(idx)} style={{ padding: 4 }}><X size={16} /></button></div>
                      <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#475569" }}>Qtd<input type="number" value={sp.quantity} onChange={(e) => updateProductQty(idx, Number(e.target.value))} min={1} style={{ width: 58, padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, textAlign: "center", background: "#fff" }} /></label>
                        <input value={sp.note} onChange={(e) => updateProductNote(idx, e.target.value)} placeholder="Obs: sem cebola, bem passado..." style={{ flex: 1, minWidth: 160, padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, background: "#fff" }} />
                        <span style={{ fontWeight: 700, color: "#2563eb", fontSize: 16, marginLeft: "auto", whiteSpace: "nowrap" }}>{money(sp.quantity * sp.product.salePriceCents)}</span>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {additions.filter((a) => a.active).map((add) => {
                            const sel = sp.selectedAdditions.find((sa) => sa.id === add.id);
                            return (
                              <button key={add.id} onClick={() => toggleAddition(idx, add)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "5px 12px", borderRadius: 20, border: sel ? "2px solid #2563eb" : "1px solid #cbd5e1", background: sel ? "#eff6ff" : "#fff", color: sel ? "#1e40af" : "#475569", cursor: "pointer" }}>
                                {add.name} {sel ? `(${sel.qty}x)` : ""} <span style={{ opacity: 0.5 }}>{money(add.valueCents)}</span>
                              </button>
                            );
                          })}
                        </div>
                        {sp.selectedAdditions.map((add) => (
                          <div key={add.id} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <small style={{ color: "#64748b" }}>{add.name}</small>
                            <input type="number" min={1} value={add.qty} onChange={(e) => updateAddQty(idx, add.id, Number(e.target.value))} style={{ width: 60, padding: "5px 8px", borderRadius: 8, border: "1px solid #cbd5e1" }} />
                            <small style={{ color: "#64748b" }}>{money(add.valueCents)}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={addItems} style={{ marginTop: 14, width: "100%", padding: "12px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Plus size={18} /> Confirmar itens</button>
              </div>
            )}
          </div>
        </div>
      )}

      {cancelItemId && (
        <section className="panel">
          <h3>Cancelar Item</h3>
          <label>Motivo<select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}><option value="">Selecione...</option><option value="Cliente desistiu">Cliente desistiu</option><option value="Produto lançado errado">Produto lançado errado</option><option value="Produto indisponível">Produto indisponível</option><option value="Erro do garçom">Erro do garçom</option><option value="Cortesia autorizada">Cortesia autorizada</option></select></label>
          <div className="row-actions"><button disabled={!cancelReason} onClick={cancelItem}>Confirmar cancelamento</button><button className="ghost" onClick={() => setCancelItemId(null)}>Voltar</button></div>
        </section>
      )}

      {showCancelTable && selectedTable && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 998, display: "grid", placeItems: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowCancelTable(false)}>
          <div style={{ background: "#fff", borderRadius: 20, width: 400, maxWidth: "90vw", boxShadow: "0 25px 80px rgba(0,0,0,0.2)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "28px 24px 20px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fef2f2", display: "grid", placeItems: "center", margin: "0 auto 12px" }}><Trash2 size={24} style={{ color: "#ef4444" }} /></div>
              <h3 style={{ margin: "0 0 4px", color: "#1e293b" }}>Cancelar {selectedTable.name}?</h3>
              <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>Todos os itens desta comanda serão cancelados e ela será liberada.</p>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="ghost" onClick={() => setShowCancelTable(false)} style={{ borderRadius: 10, padding: "10px 20px" }}>Voltar</button>
              <button onClick={cancelTable} style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Sim, Cancelar Comanda</button>
            </div>
          </div>
        </div>
      )}

      {showOpenDialog && selectedTable && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 999, backdropFilter: "blur(4px)" }} onClick={() => setShowOpenDialog(false)}>
          <div style={{ background: "linear-gradient(135deg, #0f172a, #1d4ed8)", borderRadius: 20, padding: 28, width: 380, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(37,99,235,0.4)", color: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>🧾</div>
            <h2 style={{ margin: "0 0 4px", textAlign: "center", fontSize: 24 }}>Abrir {selectedTable.name}</h2>
            <p style={{ textAlign: "center", opacity: 0.8, margin: "0 0 16px", fontSize: 14 }}>Confirma a abertura da comanda?</p>
            <label style={{ display: "block", marginBottom: 16 }}>Nome/Cliente<input value={openCustomerName} onChange={(e) => setOpenCustomerName(e.target.value)} placeholder="Opcional" style={{ width: "100%", marginTop: 6 }} /></label>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="ghost" onClick={() => setShowOpenDialog(false)} style={{ color: "rgba(255,255,255,0.88)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, padding: "11px 24px", fontSize: 14, background: "rgba(255,255,255,0.06)" }}>Cancelar</button>
              <button onClick={() => { setShowOpenDialog(false); void openTable(); }} style={{ background: "linear-gradient(135deg, #ffffff, #e2e8f0)", color: "#1e3a5f", border: "none", borderRadius: 14, padding: "11px 24px", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(0,0,0,0.16)" }}>Sim, Abrir</button>
            </div>
          </div>
        </div>
      )}

      {showTransfer && selectedTable && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 998, display: "grid", placeItems: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowTransfer(false)}>
          <div style={{ background: "#fff", borderRadius: 20, width: 520, maxWidth: "96vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 80px rgba(0,0,0,0.2)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div className="row-between" style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <h3 style={{ margin: 0 }}>Transferir Itens</h3>
              <button className="ghost" onClick={() => setShowTransfer(false)} style={{ borderRadius: 10, padding: 6 }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 16, display: "grid", gap: 8 }}>
              {items.filter((i: any) => !i.cancelledAt).map((item: any) => {
                const checked = transferItemIds.includes(item.id);
                return (
                  <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, border: checked ? "2px solid #f59e0b" : "1px solid #e2e8f0", background: checked ? "#fffbeb" : "#fff" }}>
                    <input type="checkbox" checked={checked} onChange={() => setTransferItemIds((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])} />
                    <strong style={{ flex: 1 }}>{item.nameSnapshot}</strong>
                    <span>{money(item.totalCents)}</span>
                  </label>
                );
              })}
              <label>Comanda destino<select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}><option value="">Selecione...</option>{tables.filter((t) => t.id !== selectedTable.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            </div>
            <div style={{ padding: 16, borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="ghost" onClick={() => setShowTransfer(false)}>Cancelar</button>
              <button disabled={!transferTarget || !transferItemIds.length} onClick={transferItems} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", border: 0, borderRadius: 10, padding: "10px 24px", fontWeight: 700 }}>Transferir</button>
            </div>
          </div>
        </div>
      )}

      {showMergeModal && selectedTable && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 998, display: "grid", placeItems: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowMergeModal(false)}>
          <div style={{ background: "#fff", borderRadius: 20, width: 440, maxWidth: "96vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 80px rgba(0,0,0,0.2)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div className="row-between" style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <h3 style={{ margin: 0 }}>Juntar Mesas</h3>
              <button className="ghost" onClick={() => setShowMergeModal(false)} style={{ borderRadius: 10, padding: 6 }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 16, display: "grid", gap: 8 }}>
              {tables.filter((t) => t.id !== selectedTable.id && t.status === "OCUPADA").map((t) => {
                const checked = mergeSources.includes(t.id);
                return (
                  <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, border: checked ? "2px solid #8b5cf6" : "1px solid #e2e8f0", background: checked ? "#f5f3ff" : "#fff" }}>
                    <input type="checkbox" checked={checked} onChange={() => setMergeSources((prev) => prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id])} />
                    <strong style={{ flex: 1 }}>{t.name}</strong>
                    {t.customerName && <small>{t.customerName}</small>}
                  </label>
                );
              })}
            </div>
            <div style={{ padding: 16, borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="ghost" onClick={() => setShowMergeModal(false)}>Cancelar</button>
              <button disabled={!mergeSources.length} onClick={mergeTables} style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", border: 0, borderRadius: 10, padding: "10px 24px", fontWeight: 700 }}>Juntar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
