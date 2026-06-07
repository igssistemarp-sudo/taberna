import React from "react";
import { Plus, Trash2, X, Search, DollarSign, ChevronLeft, Split, Merge, Printer, Users, UserRound, ArrowLeftRight, Table, UtensilsCrossed, Package2 } from "lucide-react";

type MoneyFn = (value: number) => string;
type TableData = { id: string; name: string; status: string; waiterName?: string | null; customerName?: string | null; active: boolean };
type ProductData = { id: string; code: number; name: string; salePriceCents: number; categoryId?: string | null; category?: { id: string; name: string } | null; printTarget: string };
type AdditionData = { id: string; name: string; valueCents: number; charge: boolean; category?: string | null; active: boolean };
type CustomerData = { id: string; name: string; phone?: string | null };
type PaymentMethodData = { id: string; name: string; allowFee: boolean; active: boolean };

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
  AGUARDANDO_PAGAMENTO: "Aguad. Pagto.",
  BLOQUEADA: "Bloqueada"
};

const API_URL = import.meta.env.VITE_API_URL ?? (window.location.port === "5173" ? "http://localhost:3333" : window.location.origin);

async function api(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("taberna-token");
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) } });
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

function DiningTableIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="5.5" r="1.8" />
      <circle cx="17" cy="5.5" r="1.8" />
      <path d="M4 10.5v6.2" />
      <path d="M20 10.5v6.2" />
      <path d="M6 9.5h12l1.1 2.6H4.9L6 9.5Z" />
      <path d="M7.5 12.1l-1.2 7.2" />
      <path d="M16.5 12.1l1.2 7.2" />
      <path d="M8.8 19.1h6.4" />
    </svg>
  );
}

export default function TablesModule({ data: initialData, money, mutate: reload }: { data: { tables: TableData[]; products: ProductData[]; additions: AdditionData[]; customers: CustomerData[]; paymentMethods: PaymentMethodData[]; orders: any[]; company: any; user: any; users: any[] } | null; money: MoneyFn; mutate: (path: string, options?: RequestInit) => Promise<void> }) {
  const mesaOnly = (list: TableData[]) => list.filter((table) => table.name.toLowerCase().startsWith("mesa"));
  const [tables, setTables] = React.useState<TableData[]>(mesaOnly(initialData?.tables ?? []));
  const [selectedTable, setSelectedTable] = React.useState<TableData | null>(null);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [view, setView] = React.useState<"grid" | "order" | "payment">("grid");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedProducts, setSelectedProducts] = React.useState<Array<{ product: ProductData; quantity: number; note: string; showAdditions: boolean; selectedAdditions: Array<AdditionData & { qty: number }> }>>([]);
  const [activeProductIndex, setActiveProductIndex] = React.useState<number | null>(null);
  const [showAddItem, setShowAddItem] = React.useState(false);

  const [customerSearch, setCustomerSearch] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerData | null>(null);
  const [payments, setPayments] = React.useState<Array<{ method: PaymentMethodData; amountCents: number; receivedCents: number; changeCents: number }>>([]);
  const [receivableDueDate, setReceivableDueDate] = React.useState("");
  const [discountCents, setDiscountCents] = React.useState(0);
  const [discountPercent, setDiscountPercent] = React.useState(0);

  const [transferTarget, setTransferTarget] = React.useState("");
  const [transferItemIds, setTransferItemIds] = React.useState<string[]>([]);
  const [showTransfer, setShowTransfer] = React.useState(false);
  const [showMergeModal, setShowMergeModal] = React.useState(false);
  const [mergeSources, setMergeSources] = React.useState<string[]>([]);

  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelItemId, setCancelItemId] = React.useState<string | null>(null);
  const [showCancelTable, setShowCancelTable] = React.useState(false);
  const [showOpenDialog, setShowOpenDialog] = React.useState(false);
  const [showPrintDialog, setShowPrintDialog] = React.useState(false);
  const [paidOrderId, setPaidOrderId] = React.useState<string | null>(null);
  const [showItemMeta, setShowItemMeta] = React.useState(true);
  const [showCancelledItems, setShowCancelledItems] = React.useState(false);

  React.useEffect(() => { if (initialData) setTables(mesaOnly(initialData.tables)); }, [initialData]);

  async function loadTableOrders() {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const data = await api(`/api/tables/${selectedTable.id}/pre-conta`);
    setOrders(data.orders ?? []);
  } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  React.useEffect(() => { if (selectedTable && (view === "order" || view === "payment")) loadTableOrders(); }, [selectedTable, view]);

  async function openTable(name: string) {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const opened = await api(`/api/tables/${selectedTable.id}/open`, { method: "PUT", body: JSON.stringify({ customerName: name || null }) });
      setSelectedTable(opened);
      setTables((prev) => prev.map((t) => t.id === opened.id ? opened : t));
      await reload("/api/company", {});
      const order = await api("/api/orders", { method: "POST", body: JSON.stringify({ type: "MESA", tableId: opened.id, customerNameSnapshot: opened.customerName ?? null, items: [], payments: [] }) });
      setOrders([order]);
      setView("order");
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  async function addItems() {
    if (!selectedTable || !selectedProducts.length) return;
    setLoading(true);
    try {
      const existingOrder = orders.find((o: any) => o.tableId === selectedTable.id && o.status !== "PAGO" && o.status !== "CANCELADO");
      const orderId = existingOrder?.id;
      if (!orderId) return setError("Nenhum pedido aberto para esta mesa.");
      for (const sp of selectedProducts) {
        const addData = sp.selectedAdditions.filter((a) => a.qty > 0).map((a) => ({ additionalId: a.id, name: a.name, quantity: a.qty, unitPriceCents: a.valueCents }));
        const unitPriceCents = sp.product.salePriceCents;
        const addTotal = addData.reduce((s, a) => s + a.quantity * a.unitPriceCents, 0);
        const totalCents = sp.quantity * unitPriceCents + addTotal;
        await api(`/api/orders/${orderId}/items`, { method: "POST", body: JSON.stringify({ productId: sp.product.id, nameSnapshot: sp.product.name, quantity: sp.quantity, unitPriceCents, totalCents, printTarget: sp.product.printTarget, note: sp.note || null, additives: addData }) });
      }
      await loadTableOrders();
      setSelectedProducts([]);
      setShowAddItem(false);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  async function cancelItem() {
    if (!cancelItemId || !cancelReason) return;
    setLoading(true);
    try {
      await api(`/api/orders/${orders[0]?.id}/cancel-item`, { method: "POST", body: JSON.stringify({ itemId: cancelItemId, reason: cancelReason }) });
      await loadTableOrders();
      setCancelItemId(null);
      setCancelReason("");
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  async function payOrder() {
    if (!selectedTable || !orders.length) return;
    setLoading(true);
    try {
      const orderId = orders[0].id;
      const total = calcTotal(orders[0]?.items ?? []) - discountCents - Math.round(discountPercent / 100 * calcTotal(orders[0]?.items ?? []));
      const paymentTotal = payments.reduce((s, p) => s + p.amountCents, 0);
      if (paymentTotal < total) return setError("Total dos pagamentos é menor que o valor da conta.");
      const isAPrazo = payments.some((p) => p.method.name.toUpperCase().includes("PRAZO"));
      await api(`/api/orders/${orderId}/pay`, { method: "POST", body: JSON.stringify({ customerId: selectedCustomer?.id, payments: payments.map((p) => ({ paymentMethodId: p.method.id, methodNameSnapshot: p.method.name, amountCents: p.amountCents, changeCents: p.changeCents })), generateReceivable: isAPrazo, receivableDueDate: isAPrazo ? receivableDueDate : undefined }) });
      setPaidOrderId(orderId);
      setShowPrintDialog(true);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  async function finishPayment(doPrint: boolean) {
    if (!paidOrderId) return;
    setShowPrintDialog(false);
    setLoading(true);
    try {
      if (doPrint) await api(`/api/orders/${paidOrderId}/reprint`, { method: "POST" }).catch(() => {});
      await reload("/api/company", {});
      const updated = mesaOnly(await api("/api/tables"));
      setTables(updated);
      setView("grid");
      setSelectedTable(null);
      setOrders([]);
      setPayments([]);
      setDiscountCents(0);
      setDiscountPercent(0);
      setSelectedCustomer(null);
      setPaidOrderId(null);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  async function cancelTable() {
    if (!selectedTable) return;
    setLoading(true);
    try {
      await api(`/api/tables/${selectedTable.id}/cancel`, { method: "POST" });
      setTables(mesaOnly(await api("/api/tables")));
      setShowCancelTable(false);
      setView("grid");
      setSelectedTable(null);
      setOrders([]);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  async function transferItems() {
    if (!selectedTable || !transferTarget || !transferItemIds.length) return;
    setLoading(true);
    try {
      await api("/api/orders/transfer-items", { method: "POST", body: JSON.stringify({ fromTableId: selectedTable.id, toTableId: transferTarget, orderItemIds: transferItemIds }) });
      setTables(mesaOnly(await api("/api/tables")));
      setShowTransfer(false);
      setTransferItemIds([]);
      setTransferTarget("");
      await loadTableOrders();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  async function mergeTables() {
    if (!selectedTable || !mergeSources.length) return;
    setLoading(true);
    try {
      await api("/api/tables/merge", { method: "POST", body: JSON.stringify({ mainTableId: selectedTable.id, secondaryTableIds: mergeSources }) });
      setTables(mesaOnly(await api("/api/tables")));
      setShowMergeModal(false);
      setMergeSources([]);
      await loadTableOrders();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  const products = initialData?.products ?? [];
  const customers = initialData?.customers ?? [];
  const paymentMethods = initialData?.paymentMethods ?? [];
  const additions = initialData?.additions ?? [];
  const company = initialData?.company;

  const filteredProducts = searchTerm ? products.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || String(p.code).includes(searchTerm)) : products.slice(0, 20);
  const filteredCustomers = customerSearch ? customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase())) : customers;

  function selectProduct(product: ProductData) {
    const existingIndex = selectedProducts.findIndex((sp) => sp.product.id === product.id);
    if (existingIndex >= 0) {
      setActiveProductIndex(existingIndex);
      return;
    }
    setSelectedProducts([...selectedProducts, { product, quantity: 1, note: "", showAdditions: false, selectedAdditions: [] }]);
    setActiveProductIndex(selectedProducts.length);
  }

  function updateProductQty(index: number, qty: number) { const copy = [...selectedProducts]; copy[index] = { ...copy[index], quantity: Math.max(1, qty) }; setSelectedProducts(copy); }
  function updateProductNote(index: number, note: string) { const copy = [...selectedProducts]; copy[index] = { ...copy[index], note }; setSelectedProducts(copy); }
  function removeProduct(index: number) {
    setSelectedProducts((prev) => prev.filter((_, i) => i !== index));
    setActiveProductIndex((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
  }

  function toggleAddition(spIndex: number, add: AdditionData) {
    const copy = [...selectedProducts];
    const existing = copy[spIndex].selectedAdditions.find((a) => a.id === add.id);
    if (existing) { copy[spIndex] = { ...copy[spIndex], selectedAdditions: copy[spIndex].selectedAdditions.filter((a) => a.id !== add.id) }; }
    else { copy[spIndex] = { ...copy[spIndex], selectedAdditions: [...copy[spIndex].selectedAdditions, { ...add, qty: 1 }] }; }
    setSelectedProducts(copy);
  }

  function updateAddQty(spIndex: number, addId: string, qty: number) {
    const copy = [...selectedProducts];
    copy[spIndex] = { ...copy[spIndex], selectedAdditions: copy[spIndex].selectedAdditions.map((a) => a.id === addId ? { ...a, qty } : a) };
    setSelectedProducts(copy);
  }

  function toggleProductAdditions(index: number) {
    const copy = [...selectedProducts];
    copy[index] = { ...copy[index], showAdditions: !copy[index].showAdditions };
    setSelectedProducts(copy);
  }

  function openAddItemModal() {
    setSelectedProducts([]);
    setSearchTerm("");
    setActiveProductIndex(null);
    setShowAddItem(true);
  }

  function closeAddItemModal() {
    setSelectedProducts([]);
    setSearchTerm("");
    setActiveProductIndex(null);
    setShowAddItem(false);
  }

  const items = orders[0]?.items ?? [];
  const subtotal = calcTotal(items);
  const discVal = discountCents + Math.round(discountPercent / 100 * subtotal);
  const totalFinal = subtotal - discVal;
  const activeItems = items.filter((i: any) => !i.cancelledAt);
  const cancelledItems = items.filter((i: any) => i.cancelledAt);
  const currentWaiterName = orders[0]?.waiter?.name ?? orders[0]?.waiterNameSnapshot ?? selectedTable?.waiterName ?? "Sem garçom";

  if ((view as string) === "order" && selectedTable) {
    return (
      <div className="stack">
        {error && <div className="toast" style={{ position: "static", marginBottom: 8 }}>{error}<button className="ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>OK</button></div>}
        {loading && <div className="loading-bar" />}
        <div style={{ display: "grid", gridTemplateColumns: "300px 1px minmax(0, 1fr)", gap: 0, alignItems: "stretch" }}>
          <aside className="panel" style={{ position: "sticky", top: 16, display: "grid", gap: 8, marginRight: 14, padding: "16px 18px", overflow: "hidden", minWidth: 0, background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(30,41,59,0.92))", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 18px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "2px 2px 4px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 2 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(226,232,240,0.55)", fontWeight: 700 }}>Menu da mesa</div>
              <div style={{ fontSize: 12, color: "rgba(226,232,240,0.78)", marginTop: 2 }}>Ações rápidas</div>
            </div>
            <div>
              <h2 style={{ margin: 0 }}>{selectedTable.name}</h2>
              <small style={{ color: "var(--text-muted)" }}>{statusLabel[selectedTable.status]} · {orders[0]?.createdAt ? new Date(orders[0].createdAt).toLocaleString("pt-BR") : ""}</small>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #dbeafe, #eff6ff)", borderRadius: 50, padding: "5px 12px 5px 10px", width: "100%", maxWidth: "100%", border: "1px solid #93c5fd", boxSizing: "border-box" }}>
              <UserRound size={14} style={{ color: "#2563eb" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1e40af" }}>Cliente:</span>
              <input value={selectedTable.customerName ?? ""} autoFocus={!selectedTable.customerName} onChange={async (e) => { const v = e.target.value; await api(`/api/tables/${selectedTable.id}`, { method: "PUT", body: JSON.stringify({ customerName: v || null }) }); await reload("/api/company", {}); const updated = await api("/api/tables"); setTables(updated); setSelectedTable(updated.find((t: any) => t.id === selectedTable.id) ?? null); }} style={{ background: "transparent", border: "none", color: "#1e3a5f", fontWeight: 700, fontSize: 13, padding: "1px 4px", minWidth: 0, flex: 1, outline: "none" }} placeholder="Digite o nome..." />
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <button type="button" onClick={openAddItemModal} style={{ background: "linear-gradient(135deg, #10b981, #059669)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><Plus size={12} /> Lançar Item</button>
              <button type="button" onClick={() => setShowCancelTable(true)} style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><Trash2 size={12} /> Cancelar Mesa</button>
              <button type="button" onClick={() => { setError(null); setTransferItemIds([]); setTransferTarget(""); setShowTransfer(true); }} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><ArrowLeftRight size={12} /> Transferir</button>
              <button type="button" onClick={() => { setError(null); setMergeSources([]); setShowMergeModal(true); }} style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><Merge size={12} /> Juntar</button>
              <button type="button" onClick={() => { api(`/api/orders/${orders[0]?.id}/reprint`, { method: "POST" }).catch(() => {}); }} style={{ background: "linear-gradient(135deg, #06b6d4, #0891b2)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><Printer size={12} /> Imprimir</button>
              <button type="button" onClick={() => setView("payment")} style={{ background: "linear-gradient(135deg, #10b981, #059669)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><DollarSign size={12} /> Conta</button>
              <button type="button" onClick={() => { setShowTransfer(false); setShowMergeModal(false); setTransferItemIds([]); setTransferTarget(""); setMergeSources([]); setView("grid"); setSelectedTable(null); setOrders([]); }} style={{ background: "linear-gradient(135deg, #64748b, #475569)", border: 0, borderRadius: 50, padding: "7px 8px 7px 18px", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 7, minHeight: 32, width: "100%" }}><ChevronLeft size={12} /> Voltar</button>
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
            <div style={{ display: "grid", gap: 10, maxHeight: "calc(100vh - 310px)", overflowY: "auto", paddingRight: 8, scrollbarGutter: "stable" }}>
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
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 998, display: "grid", placeItems: "center", backdropFilter: "blur(4px)" }} onClick={closeAddItemModal}>
            <div style={{ background: "#fff", borderRadius: 20, width: 1100, maxWidth: "98vw", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 80px rgba(37,99,235,0.15)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
              <div className="row-between" style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <h3 style={{ margin: 0, fontSize: 17, color: "#1e293b" }}><Package2 size={18} style={{ marginRight: 8, color: "#2563eb" }} />Lançar Itens</h3>
                <button className="ghost" onClick={closeAddItemModal} style={{ borderRadius: 10, padding: 6 }}><X size={18} /></button>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1.25fr 0.95fr", background: "#f8fafc" }}>
                <div style={{ minWidth: 0, borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <div style={{ padding: "12px 24px", borderBottom: "1px solid #e2e8f0" }}>
                    <div style={{ position: "relative" }}>
                      <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                      <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por nome ou código..." autoFocus style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" }} />
                    </div>
                  </div>
                  <div style={{ flex: 1, overflow: "auto", padding: "12px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
                </div>

                <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "#fff" }}>
                  <div style={{ padding: "12px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #e2e8f0", background: "linear-gradient(180deg, #fff, #f8fbff)", boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.8)" }}>
                    <small style={{ color: "#334155", fontWeight: 800 }}>{selectedProducts.length} item(ns) selecionado(s)</small>
                    <strong style={{ color: "#0f172a", fontSize: 14, background: "#eff6ff", border: "1px solid rgba(37,99,235,0.18)", borderRadius: 999, padding: "5px 10px" }}>Subtotal: {money(selectedProducts.reduce((sum, sp) => sum + (sp.quantity * sp.product.salePriceCents), 0))}</strong>
                  </div>

                  <div style={{ flex: 1, overflow: "auto", padding: 12, display: "grid", gap: 8 }}>
                    {selectedProducts.length === 0 && <div style={{ padding: 18, color: "#64748b", textAlign: "center", border: "1px dashed #cbd5e1", borderRadius: 12, background: "#f8fafc" }}>Nenhum item selecionado.</div>}
                    {selectedProducts.map((sp, idx) => (
                      <div key={sp.product.id} style={{ background: idx === activeProductIndex ? "linear-gradient(180deg, #f8fbff, #ffffff)" : "#fff", borderRadius: 12, padding: 12, border: idx === activeProductIndex ? "1px solid #93c5fd" : "1px solid #e2e8f0", boxShadow: idx === activeProductIndex ? "0 10px 24px rgba(37,99,235,0.10)" : "none" }}>
                        <div className="row-between" style={{ cursor: "pointer" }} onClick={() => setActiveProductIndex(idx)}>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ fontSize: 14, color: "#1e293b", display: "block" }}>{sp.product.name}</strong>
                            <small style={{ color: "#64748b" }}>{sp.quantity}x · {money(sp.quantity * sp.product.salePriceCents)}</small>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button className="item-action-button obs" onClick={(e) => { e.stopPropagation(); setActiveProductIndex(idx); }}>Obs</button>
                            <button className={`item-action-button options${sp.selectedAdditions.length ? " active" : ""}`} onClick={(e) => { e.stopPropagation(); setActiveProductIndex(idx); toggleProductAdditions(idx); }}>{sp.selectedAdditions.length ? `Opcionais (${sp.selectedAdditions.length})` : "Opcionais"}</button>
                            <button className="item-action-button remove" onClick={(e) => { e.stopPropagation(); removeProduct(idx); }}><X size={15} /></button>
                          </div>
                        </div>

                        {idx === activeProductIndex && (
                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#475569" }}>Qtd<input type="number" value={sp.quantity} onChange={(e) => updateProductQty(idx, Number(e.target.value))} min={1} style={{ width: 54, padding: "5px 8px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, textAlign: "center", background: "#fff" }} /></label>
                              <input value={sp.note} onChange={(e) => updateProductNote(idx, e.target.value)} placeholder="Obs: sem cebola, bem passado..." style={{ flex: 1, minWidth: 150, padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, background: "#fff" }} />
                            </div>
                            <button onClick={() => toggleProductAdditions(idx)} style={{ alignSelf: "flex-start", background: sp.showAdditions ? "#eef2ff" : "#fff", color: "#0f172a", border: "1px solid rgba(37,99,235,0.22)", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>
                              Opcionais {sp.selectedAdditions.length ? `(${sp.selectedAdditions.length})` : ""}
                            </button>
                            {sp.showAdditions && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {additions.filter((a) => a.active).map((add) => {
                                  const sel = sp.selectedAdditions.find((sa) => sa.id === add.id);
                                  return (
                                    <button key={add.id} onClick={() => toggleAddition(idx, add)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, padding: "4px 10px", borderRadius: 18, border: sel ? "1px solid rgba(37,99,235,0.35)" : "1px solid #cbd5e1", background: sel ? "linear-gradient(135deg, rgba(59,130,246,0.16), rgba(37,99,235,0.08))" : "#fff", color: sel ? "#1d4ed8" : "#475569", cursor: "pointer", fontWeight: sel ? 800 : 600 }}>
                                      {add.name} {sel ? `(${sel.qty}x)` : ""} <span style={{ opacity: 0.5 }}>{money(add.valueCents)}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {sp.selectedAdditions.length > 0 && (
                              <div style={{ display: "grid", gap: 6 }}>
                                {sp.selectedAdditions.map((add) => (
                                  <div key={add.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <small style={{ color: "#64748b", fontSize: 11.5 }}>{add.name}</small>
                                    <input type="number" min={1} value={add.qty} onChange={(e) => updateAddQty(idx, add.id, Number(e.target.value))} style={{ width: 56, padding: "4px 8px", borderRadius: 8, border: "1px solid #cbd5e1" }} />
                                    <small style={{ color: "#64748b", fontSize: 11.5 }}>{money(add.valueCents)}</small>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: "1px solid #e2e8f0", padding: "12px 18px", background: "linear-gradient(180deg, #fff, #f8fbff)", position: "sticky", bottom: 0 }}>
                    <button onClick={addItems} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg, #1d4ed8, #2563eb)", color: "#fff", border: "none", borderRadius: 14, fontSize: 14, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 12px 24px rgba(37,99,235,0.18)" }}><Plus size={17} /> Confirmar itens</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {cancelItemId && (
          <section className="panel">
            <h3>Cancelar Item</h3>
            <label>Motivo<select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}><option value="">Selecione...</option><option value="Cliente desistiu">Cliente desistiu</option><option value="Produto lancado errado">Produto lançado errado</option><option value="Produto indisponivel">Produto indisponível</option><option value="Erro do garcom">Erro do garçom</option><option value="Cortesia autorizada">Cortesia autorizada</option></select></label>
            <div className="row-actions"><button disabled={!cancelReason} onClick={cancelItem}>Confirmar cancelamento</button><button className="ghost" onClick={() => setCancelItemId(null)}>Voltar</button></div>
          </section>
        )}

        {showCancelTable && selectedTable && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 998, display: "grid", placeItems: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowCancelTable(false)}>
            <div style={{ background: "#fff", borderRadius: 20, width: 400, maxWidth: "90vw", boxShadow: "0 25px 80px rgba(0,0,0,0.2)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "28px 24px 20px", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fef2f2", display: "grid", placeItems: "center", margin: "0 auto 12px" }}><Trash2 size={24} style={{ color: "#ef4444" }} /></div>
                <h3 style={{ margin: "0 0 4px", color: "#1e293b" }}>Cancelar {selectedTable.name}?</h3>
                <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>Todos os itens desta mesa serão cancelados e a mesa será liberada.</p>
              </div>
              <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="ghost" onClick={() => setShowCancelTable(false)} style={{ borderRadius: 10, padding: "10px 20px" }}>Voltar</button>
                <button onClick={cancelTable} style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Sim, Cancelar Mesa</button>
              </div>
            </div>
          </div>
        )}

        {showTransfer && selectedTable && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 998, display: "grid", placeItems: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowTransfer(false)}>
            <div style={{ background: "linear-gradient(135deg, #0f172a, #1d4ed8)", borderRadius: 22, width: 560, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 80px rgba(37,99,235,0.4)", color: "#fff", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "26px 24px 18px", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "grid", placeItems: "center", margin: "0 auto 12px", border: "1px solid rgba(255,255,255,0.18)" }}>
                  <ArrowLeftRight size={26} style={{ color: "#fff" }} />
                </div>
                <h3 style={{ margin: "0 0 4px", fontSize: 24 }}>Transferir Itens</h3>
                <p style={{ margin: 0, opacity: 0.82, fontSize: 14 }}>Escolha os itens e a mesa de destino.</p>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "0 24px 20px", display: "grid", gap: 8 }}>
                <p style={{ margin: 0, color: "rgba(255,255,255,0.75)", fontSize: 13 }}>Selecione os itens que deseja mover para outra mesa.</p>
                {items.filter((i: any) => !i.cancelledAt).map((item: any, idx: number) => {
                  const checked = transferItemIds.includes(item.id);
                  return (
                    <label key={item.id ?? idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, border: checked ? "2px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.12)", background: checked ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)", cursor: "pointer" }}>
                      <input type="checkbox" checked={checked} onChange={() => setTransferItemIds((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])} />
                      <strong style={{ flex: 1, color: "#fff" }}>{item.nameSnapshot}</strong>
                      <span style={{ color: "#dbeafe", fontWeight: 800 }}>{money(item.totalCents)}</span>
                    </label>
                  );
                })}
                <label style={{ color: "#fff" }}>Mesa destino<select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} style={{ background: "rgba(255,255,255,0.95)", color: "#0f172a" }}><option value="">Selecione...</option>{tables.filter((t) => t.id !== selectedTable.id).map((t) => <option key={t.id} value={t.id}>Mesa {t.name} ({statusLabel[t.status]})</option>)}</select></label>
              </div>
              <div style={{ padding: "16px 24px 24px", display: "flex", gap: 10, justifyContent: "center" }}>
                <button type="button" className="ghost" onClick={() => setShowTransfer(false)} style={{ color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, padding: "11px 24px", fontSize: 14, background: "rgba(255,255,255,0.06)" }}>Cancelar</button>
                <button type="button" disabled={!transferTarget || !transferItemIds.length} onClick={transferItems} style={{ background: !transferTarget || !transferItemIds.length ? "rgba(255,255,255,0.3)" : "linear-gradient(135deg, #ffffff, #e2e8f0)", color: "#1e3a5f", border: "none", borderRadius: 14, padding: "11px 24px", fontSize: 14, fontWeight: 800, cursor: !transferTarget || !transferItemIds.length ? "default" : "pointer", boxShadow: "0 10px 24px rgba(0,0,0,0.16)" }}><ArrowLeftRight size={16} /> Transferir {transferItemIds.length ? `${transferItemIds.length} item(ns)` : ""}</button>
              </div>
            </div>
          </div>
        )}

        {showMergeModal && selectedTable && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 998, display: "grid", placeItems: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowMergeModal(false)}>
            <div style={{ background: "linear-gradient(135deg, #0f172a, #1d4ed8)", borderRadius: 22, width: 560, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 80px rgba(37,99,235,0.4)", color: "#fff", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "26px 24px 18px", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "grid", placeItems: "center", margin: "0 auto 12px", border: "1px solid rgba(255,255,255,0.18)" }}>
                  <Merge size={26} style={{ color: "#fff" }} />
                </div>
                <h3 style={{ margin: "0 0 4px", fontSize: 24 }}>Juntar Mesas</h3>
                <p style={{ margin: 0, opacity: 0.82, fontSize: 14 }}>Selecione as mesas que vão ser reunidas.</p>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "0 24px 20px", display: "grid", gap: 8 }}>
                <p style={{ margin: 0, color: "rgba(255,255,255,0.75)", fontSize: 13 }}>Escolha as mesas ocupadas que serão reunidas nesta mesa principal.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tables.filter((t) => t.id !== selectedTable.id && t.status === "OCUPADA").map((t) => {
                    const checked = mergeSources.includes(t.id);
                    return (
                      <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, border: checked ? "2px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.12)", background: checked ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)", cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} onChange={() => setMergeSources((prev) => prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id])} />
                        <Users size={18} style={{ color: "#fff" }} />
                        <span style={{ flex: 1, fontWeight: 700, color: "#fff" }}>{t.name}</span>
                        {t.customerName && <small style={{ color: "#dbeafe" }}>{t.customerName}</small>}
                      </label>
                    );
                  })}
                  {!tables.filter((t) => t.id !== selectedTable.id && t.status === "OCUPADA").length && <div style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.75)", border: "1px dashed rgba(255,255,255,0.18)", borderRadius: 12, background: "rgba(255,255,255,0.06)" }}>Nenhuma mesa ocupada disponível.</div>}
                </div>
              </div>
              <div style={{ padding: "16px 24px 24px", display: "flex", gap: 10, justifyContent: "center" }}>
                <button type="button" className="ghost" onClick={() => setShowMergeModal(false)} style={{ color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, padding: "11px 24px", fontSize: 14, background: "rgba(255,255,255,0.06)" }}>Cancelar</button>
                <button type="button" disabled={!mergeSources.length} onClick={mergeTables} style={{ background: !mergeSources.length ? "rgba(255,255,255,0.3)" : "linear-gradient(135deg, #ffffff, #e2e8f0)", color: "#1e3a5f", border: "none", borderRadius: 14, padding: "11px 24px", fontSize: 14, fontWeight: 800, cursor: !mergeSources.length ? "default" : "pointer", boxShadow: "0 10px 24px rgba(0,0,0,0.16)" }}><Merge size={16} /> Juntar {mergeSources.length ? `${mergeSources.length} mesa(s)` : ""}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if ((view as string) === "payment" && selectedTable) {
    const items = orders[0]?.items ?? [];
    const subtotal = calcTotal(items);
    const discVal = discountCents + Math.round(discountPercent / 100 * subtotal);
    const totalFinal = subtotal - discVal;
    const paidTotal = payments.reduce((s, p) => s + p.amountCents, 0);
    const remaining = totalFinal - paidTotal;
    const isAPrazo = payments.some((p) => p.method.name.toUpperCase().includes("PRAZO"));

    return (
      <div className="stack">
        {error && <div className="toast" style={{ position: "static", marginBottom: 8 }}>{error}<button className="ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>OK</button></div>}
        {loading && <div className="loading-bar" />}
        <div className="row-between">
          <div><h2 style={{ margin: 0 }}>Pagamento - Mesa {selectedTable.name}</h2><small style={{ color: "var(--text-muted)" }}>Comanda #{orders[0]?.number}</small></div>
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
                      {existing ? (
                        <button className="ghost danger" onClick={() => setPayments(payments.filter((p) => p.method.id !== pm.id))}><X size={14} /></button>
                      ) : (
                        <button onClick={() => setPayments([...payments, { method: pm, amountCents: remaining > 0 ? remaining : 0, receivedCents: 0, changeCents: 0 }])}>Adicionar</button>
                      )}
                    </div>
                    {existing && (
                      <div className="grid-2" style={{ marginTop: 6 }}>
                        <label>{pm.name === "Dinheiro" ? "Recebido R$" : "Valor R$"}<input type="number" step="0.01" value={existing.amountCents / 100} onChange={(e) => setPayments(payments.map((p) => p.method.id === pm.id ? { ...p, amountCents: Math.round(Number(e.target.value) * 100) } : p))} autoFocus={existing.amountCents === 0} style={{ fontWeight: 700 }} /></label>
                        {pm.name !== "Dinheiro" ? <button onClick={() => setPayments(payments.map((p) => p.method.id === pm.id ? { ...p, amountCents: remaining > 0 ? p.amountCents + remaining : p.amountCents } : p))} disabled={remaining <= 0} style={{ fontSize: 12, padding: "4px 10px", alignSelf: "flex-end", marginBottom: 2 }}>Completar R$ {money(remaining)}</button> : <div />}
                        {pm.name === "Dinheiro" && (
                          <>
                            <div style={{ gridColumn: "span 2" }}>
                              {(() => {
                                const paidOthers = payments.filter((p) => p.method.id !== pm.id).reduce((s, p) => s + p.amountCents, 0);
                                const needFromCash = Math.max(0, totalFinal - paidOthers);
                                const troco = Math.max(0, existing.amountCents - needFromCash);
                                return (
                                  <div>
                                    {troco > 0 ? <small style={{ display: "block", color: "#059669", fontWeight: 700, background: "#d1fae5", padding: "4px 10px", borderRadius: 8, textAlign: "center", marginBottom: 4 }}>Troco: {money(troco)}</small> : null}
                                  </div>
                                );
                              })()}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {isAPrazo && (
              <div style={{ marginTop: 12 }}>
                <label>Cliente<select value={selectedCustomer?.id ?? ""} onChange={(e) => { const c = customers.find((c) => c.id === e.target.value); setSelectedCustomer(c ?? null); }}><option value="">Selecione...</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label style={{ marginTop: 8 }}>Vencimento<input type="date" value={receivableDueDate} onChange={(e) => setReceivableDueDate(e.target.value)} /></label>
              </div>
            )}

            <div className="row-actions" style={{ marginTop: 16 }}>
              <button onClick={() => setView("order")} className="ghost"><ChevronLeft size={16} /> Voltar</button>
              <button disabled={paidTotal < totalFinal || (isAPrazo && !selectedCustomer)} onClick={payOrder} style={{ fontSize: 16, padding: "14px 24px" }}>
                <DollarSign size={18} /> Finalizar - {money(totalFinal)}
              </button>
            </div>
          </section>
        </div>

        {showPrintDialog && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 999, backdropFilter: "blur(4px)" }} onClick={() => {}}>
            <div style={{ background: "#fff", borderRadius: 20, width: 360, maxWidth: "92vw", maxHeight: "90vh", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "20px 24px", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}>
                <Printer size={28} style={{ color: "#2563eb", marginBottom: 4 }} />
                <h3 style={{ margin: 0, fontSize: 16 }}>Comprovante de Venda</h3>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", fontFamily: "'Courier New', monospace", fontSize: 12, lineHeight: 1.5, background: "#fafafa", color: "#1e293b" }}>
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <strong style={{ fontSize: 14 }}>{initialData?.company?.nomeFantasia ?? "Lanchonete"}</strong>
                </div>
                <div style={{ borderTop: "1px dashed #94a3b8", borderBottom: "1px dashed #94a3b8", padding: "8px 0", marginBottom: 8 }}>
                  <div>Pedido #{orders[0]?.number}</div>
                  <div>Mesa: {selectedTable?.name}</div>
                  {selectedTable?.customerName && <div>Cliente: {selectedTable.customerName}</div>}
                  <div>{new Date().toLocaleString("pt-BR")}</div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  {orders[0]?.items?.filter((i: any) => !i.cancelledAt).map((item: any, idx: number) => (
                    <div key={idx} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{item.quantity}x {item.nameSnapshot}</span>
                        <span>{money(item.totalCents)}</span>
                      </div>
                      {item.note && <div style={{ color: "#b45309", fontSize: 11 }}>  Obs: {item.note}</div>}
                      {item.additives?.map((add: any, ai: number) => (
                        <div key={ai} style={{ color: "#64748b", fontSize: 11 }}>  + {add.quantity}x {add.nameSnapshot} {money(add.totalCents)}</div>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{money(subtotal)}</span></div>
                  {discVal > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#ef4444" }}><span>Desconto</span><span>-{money(discVal)}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}><span>TOTAL</span><span>{money(totalFinal)}</span></div>
                </div>
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                  {payments.filter((p) => p.amountCents > 0).map((p, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{p.method.name}</span><span>{money(p.amountCents)}</span>
                    </div>
                  ))}
                  {payments.filter((p) => p.changeCents > 0).map((p, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", color: "#059669" }}>
                      <span>Troco ({p.method.name})</span><span>{money(p.changeCents)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: "center", marginTop: 12, color: "#94a3b8", fontSize: 10 }}>Obrigado pela preferência!</div>
              </div>
              <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => finishPayment(false)} className="ghost" style={{ borderRadius: 12, padding: "10px 20px", fontSize: 14 }}>Pular</button>
                <button onClick={() => finishPayment(true)} style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: 12, padding: "10px 24px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Printer size={16} /> Imprimir</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <div className="toast" style={{ position: "static", marginBottom: 8 }}>{error}<button className="ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>OK</button></div>}
      {loading && <div className="loading-bar" />}
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Mesas</h2>
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{tables.filter((t) => t.status !== "LIVRE").length} ocupadas · {tables.filter((t) => t.status === "LIVRE").length} livres</span>
      </div>
      {showOpenDialog && selectedTable && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 999, backdropFilter: "blur(4px)" }} onClick={() => setShowOpenDialog(false)}>
          <div style={{ background: "linear-gradient(135deg, #1e3a5f, #2563eb)", borderRadius: 20, padding: 36, width: 380, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(37,99,235,0.4)", color: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>🍽️</div>
            <h2 style={{ margin: "0 0 4px", textAlign: "center", fontSize: 24 }}>Abrir {selectedTable.name}</h2>
            <p style={{ textAlign: "center", opacity: 0.8, margin: "0 0 20px", fontSize: 14 }}>Confirma a abertura da mesa?</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="ghost" onClick={() => setShowOpenDialog(false)} style={{ color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "10px 24px", fontSize: 14 }}>Cancelar</button>
              <button onClick={() => { setShowOpenDialog(false); openTable(""); }} style={{ background: "#fff", color: "#1e3a5f", border: "none", borderRadius: 12, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Sim, Abrir</button>
            </div>
          </div>
        </div>
      )}
      <div className="table-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
        {tables.map((table) => {
          const color = statusColor[table.status] ?? "#6b7280";
          return (
            <div
              key={table.id}
              onClick={() => {
                if (table.status === "LIVRE") { setSelectedTable(table); setShowOpenDialog(true); }
                else { setSelectedTable(table); setOrders([]); setView("order"); loadTableOrders(); }
              }}
              style={{
                background: `linear-gradient(145deg, ${color}22, ${color}11)`,
                border: `2px solid ${color}44`,
                borderRadius: 16,
                padding: 20,
                cursor: "pointer",
                textAlign: "center",
                transition: "all 0.15s",
                userSelect: "none"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}88`; e.currentTarget.style.transform = "translateY(-2px)" }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${color}44`; e.currentTarget.style.transform = "none" }}
            >
                <div className="table-icon-bubble" style={{ background: color }}>
                <DiningTableIcon size={24} />
                </div>
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
    </div>
  );
}
