import React from "react";
import { Plus, Trash2, X, Search, DollarSign, ChevronLeft, Split, Merge, Printer, Users, UserRound, ArrowLeftRight, Table, UtensilsCrossed } from "lucide-react";

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

export default function TablesModule({ data: initialData, money, mutate: reload }: { data: { tables: TableData[]; products: ProductData[]; additions: AdditionData[]; customers: CustomerData[]; paymentMethods: PaymentMethodData[]; orders: any[]; company: any; user: any; users: any[] } | null; money: MoneyFn; mutate: (path: string, options?: RequestInit) => Promise<void> }) {
  const [tables, setTables] = React.useState<TableData[]>(initialData?.tables ?? []);
  const [selectedTable, setSelectedTable] = React.useState<TableData | null>(null);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [view, setView] = React.useState<"grid" | "order" | "payment" | "transfer" | "merge">("grid");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedProducts, setSelectedProducts] = React.useState<Array<{ product: ProductData; quantity: number; note: string; selectedAdditions: Array<AdditionData & { qty: number }> }>>([]);
  const [showAddItem, setShowAddItem] = React.useState(false);

  const [customerSearch, setCustomerSearch] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerData | null>(null);
  const [payments, setPayments] = React.useState<Array<{ method: PaymentMethodData; amountCents: number; receivedCents: number; changeCents: number }>>([]);
  const [receivableDueDate, setReceivableDueDate] = React.useState("");
  const [discountCents, setDiscountCents] = React.useState(0);
  const [discountPercent, setDiscountPercent] = React.useState(0);

  const [transferTarget, setTransferTarget] = React.useState("");
  const [mergeSources, setMergeSources] = React.useState<string[]>([]);

  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelItemId, setCancelItemId] = React.useState<string | null>(null);
  const [showOpenDialog, setShowOpenDialog] = React.useState(false);

  React.useEffect(() => { if (initialData) setTables(initialData.tables); }, [initialData]);

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
      const order = await api("/api/orders", { method: "POST", body: JSON.stringify({ type: "MESA", tableId: opened.id, items: [], payments: [] }) });
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
      await reload("/api/company", {});
      const updated = await api("/api/tables");
      setTables(updated);
      setView("grid");
      setSelectedTable(null);
      setOrders([]);
      setPayments([]);
      setDiscountCents(0);
      setDiscountPercent(0);
      setSelectedCustomer(null);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  async function transferTable() {
    if (!selectedTable || !transferTarget) return;
    setLoading(true);
    try {
      await api("/api/tables/transfer", { method: "POST", body: JSON.stringify({ fromTableId: selectedTable.id, toTableId: transferTarget }) });
      setTables(await api("/api/tables"));
      setView("grid");
      setSelectedTable(null);
      setTransferTarget("");
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  async function mergeTables() {
    if (!selectedTable || !mergeSources.length) return;
    setLoading(true);
    try {
      await api("/api/tables/merge", { method: "POST", body: JSON.stringify({ mainTableId: selectedTable.id, secondaryTableIds: mergeSources }) });
      setTables(await api("/api/tables"));
      setView("grid");
      setSelectedTable(null);
      setMergeSources([]);
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
    if (selectedProducts.some((sp) => sp.product.id === product.id)) return;
    setSelectedProducts([...selectedProducts, { product, quantity: 1, note: "", selectedAdditions: [] }]);
  }

  function updateProductQty(index: number, qty: number) { const copy = [...selectedProducts]; copy[index] = { ...copy[index], quantity: Math.max(1, qty) }; setSelectedProducts(copy); }
  function updateProductNote(index: number, note: string) { const copy = [...selectedProducts]; copy[index] = { ...copy[index], note }; setSelectedProducts(copy); }
  function removeProduct(index: number) { setSelectedProducts(selectedProducts.filter((_, i) => i !== index)); }

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

  const items = orders[0]?.items ?? [];
  const subtotal = calcTotal(items);
  const discVal = discountCents + Math.round(discountPercent / 100 * subtotal);
  const totalFinal = subtotal - discVal;

  if ((view as string) === "order" && selectedTable) {
    const isAPrazo = payments.some((p) => p.method.name.toUpperCase().includes("PRAZO"));
    return (
      <div className="stack">
        {error && <div className="toast" style={{ position: "static", marginBottom: 8 }}>{error}<button className="ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>OK</button></div>}
        {loading && <div className="loading-bar" />}
        <div className="row-between">
          <div><h2 style={{ margin: 0 }}>{selectedTable.name}</h2><small style={{ color: "var(--text-muted)" }}>{statusLabel[selectedTable.status]} · {orders[0]?.createdAt ? new Date(orders[0].createdAt).toLocaleString("pt-BR") : ""}</small><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, background: "linear-gradient(135deg, #dbeafe, #eff6ff)", borderRadius: 50, padding: "4px 14px 4px 10px", width: "fit-content", border: "1px solid #93c5fd" }}><UserRound size={14} style={{ color: "#2563eb" }} /><span style={{ fontSize: 13, fontWeight: 600, color: "#1e40af" }}>Cliente:</span><input value={selectedTable.customerName ?? ""} autoFocus={!selectedTable.customerName} onChange={async (e) => { const v = e.target.value; await api(`/api/tables/${selectedTable.id}`, { method: "PUT", body: JSON.stringify({ customerName: v || null }) }); const updated = await api("/api/tables"); setTables(updated); setSelectedTable(updated.find((t: any) => t.id === selectedTable.id) ?? null); }} style={{ background: "transparent", border: "none", color: "#1e3a5f", fontWeight: 700, fontSize: 14, padding: "2px 4px", minWidth: 100, outline: "none" }} placeholder="Digite o nome..." /></div></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => { setView("transfer"); setTransferTarget(""); }} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", borderRadius: 50, padding: "8px 18px", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(245,158,11,0.3)" }}><ArrowLeftRight size={15} /> Transferir</button>
            <button onClick={() => { setView("merge"); setMergeSources([]); }} style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", borderRadius: 50, padding: "8px 18px", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(139,92,246,0.3)" }}><Merge size={15} /> Juntar</button>
            <button onClick={() => setView("payment")} style={{ background: "linear-gradient(135deg, #10b981, #059669)", border: "none", borderRadius: 50, padding: "8px 18px", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}><DollarSign size={15} /> Pagamento</button>
            <button onClick={() => { setView("grid"); setSelectedTable(null); setOrders([]); }} style={{ background: "linear-gradient(135deg, #64748b, #475569)", border: "none", borderRadius: 50, padding: "8px 18px", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(100,116,139,0.3)" }}><ChevronLeft size={15} /> Voltar</button>
          </div>
        </div>

        <section className="panel">
          <div className="row-between"><h3>Itens</h3><button onClick={() => setShowAddItem(true)}><Plus size={16} /> Lançar Item</button></div>
          <div className="table-list">
            {items.filter((i: any) => !i.cancelledAt).map((item: any, idx: number) => (
              <div className="list-row" key={item.id ?? idx}>
                <strong>{item.nameSnapshot}</strong>
                <span>{item.quantity}x {money(item.unitPriceCents)}</span>
                <span>{item.note && <small style={{ color: "var(--accent-light)" }}>{item.note}</small>}</span>
                <span>{money(item.totalCents)}</span>
                <button className="ghost danger" onClick={() => { setCancelItemId(item.id); setCancelReason(""); }}><Trash2 size={14} /></button>
              </div>
            ))}
            {!items.filter((i: any) => !i.cancelledAt).length && <small style={{ color: "var(--text-dim)", padding: 12 }}>Nenhum item lançado.</small>}
          </div>
          <div style={{ textAlign: "right", marginTop: 12, fontWeight: 700, fontSize: 18 }}>Total: {money(subtotal)}</div>
        </section>

        {showAddItem && (
          <section className="panel">
            <div className="row-between"><h3>Lançar Item</h3><button className="ghost" onClick={() => setShowAddItem(false)}><X size={16} /></button></div>
            <label>Buscar produto<input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Nome ou código..." autoFocus /></label>
            <div style={{ display: "grid", gap: 6, maxHeight: 240, overflow: "auto", marginTop: 8 }}>
              {filteredProducts.map((p) => (
                <button key={p.id} className="ghost" style={{ textAlign: "left", justifyContent: "flex-start", display: "flex", gap: 12, alignItems: "center", padding: "8px 12px" }} onClick={() => selectProduct(p)}>
                  <span style={{ color: "var(--text-dim)", minWidth: 40 }}>#{p.code}</span>
                  <strong>{p.name}</strong>
                  <span style={{ marginLeft: "auto", color: "var(--accent)" }}>{money(p.salePriceCents)}</span>
                </button>
              ))}
            </div>
            {selectedProducts.map((sp, idx) => (
              <div key={sp.product.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginTop: 8 }}>
                <div className="row-between"><strong>{sp.product.name}</strong><button className="ghost danger" onClick={() => removeProduct(idx)}><X size={14} /></button></div>
                <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center" }}>
                  <label style={{ flex: 1 }}>Qtd<input type="number" value={sp.quantity} onChange={(e) => updateProductQty(idx, Number(e.target.value))} min={1} /></label>
                  <span style={{ fontWeight: 700, color: "var(--accent)" }}>{money(sp.quantity * sp.product.salePriceCents)}</span>
                </div>
                <label style={{ marginTop: 6 }}>Obs.<input value={sp.note} onChange={(e) => updateProductNote(idx, e.target.value)} placeholder="Ex: sem cebola, bem passado..." /></label>
                <div style={{ marginTop: 8 }}>
                  <small style={{ color: "var(--text-dim)", display: "block", marginBottom: 4 }}>Adicionais:</small>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {additions.filter((a) => a.active).map((add) => {
                      const selected = sp.selectedAdditions.find((sa) => sa.id === add.id);
                      return (
                        <button key={add.id} className={selected ? "" : "ghost"} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8 }} onClick={() => toggleAddition(idx, add)}>
                          {add.name} {selected ? `(${selected.qty}x)` : ""} {money(add.valueCents)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
            {!!selectedProducts.length && <button style={{ marginTop: 12 }} onClick={addItems}><Plus size={16} /> Confirmar itens</button>}
          </section>
        )}

        {cancelItemId && (
          <section className="panel">
            <h3>Cancelar Item</h3>
            <label>Motivo<select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}><option value="">Selecione...</option><option value="Cliente desistiu">Cliente desistiu</option><option value="Produto lancado errado">Produto lançado errado</option><option value="Produto indisponivel">Produto indisponível</option><option value="Erro do garcom">Erro do garçom</option><option value="Cortesia autorizada">Cortesia autorizada</option></select></label>
            <div className="row-actions"><button disabled={!cancelReason} onClick={cancelItem}>Confirmar cancelamento</button><button className="ghost" onClick={() => setCancelItemId(null)}>Voltar</button></div>
          </section>
        )}

        {(view as string) === "transfer" && (
          <section className="panel">
            <h3>Transferir Mesa {selectedTable.name}</h3>
            <label>Mesa destino<select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}><option value="">Selecione...</option>{tables.filter((t) => t.id !== selectedTable.id && t.status === "LIVRE").map((t) => <option key={t.id} value={t.id}>Mesa {t.name}</option>)}</select></label>
            <div className="row-actions"><button disabled={!transferTarget} onClick={transferTable}>Transferir</button><button className="ghost" onClick={() => setView("order")}>Cancelar</button></div>
          </section>
        )}

        {(view as string) === "merge" && (
          <section className="panel">
            <h3>Juntar Mesas em {selectedTable.name}</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Selecione as mesas para juntar:</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>{tables.filter((t) => t.id !== selectedTable.id && t.status === "OCUPADA").map((t) => (<button key={t.id} className={mergeSources.includes(t.id) ? "" : "ghost"} onClick={() => setMergeSources((prev) => prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id])}>Mesa {t.name}</button>))}</div>
            <div className="row-actions"><button disabled={!mergeSources.length} onClick={mergeTables}>Juntar {mergeSources.length} mesa(s)</button><button className="ghost" onClick={() => setView("order")}>Cancelar</button></div>
          </section>
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
              <label>Desconto R$<input type="number" value={discountCents} onChange={(e) => setDiscountCents(Number(e.target.value))} /></label>
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
                        <button onClick={() => setPayments([...payments, { method: pm, amountCents: 0, receivedCents: 0, changeCents: 0 }])}>Adicionar</button>
                      )}
                    </div>
                    {existing && (
                      <div className="grid-2" style={{ marginTop: 6 }}>
                        <label>Valor<input type="number" value={existing.amountCents} onChange={(e) => setPayments(payments.map((p) => p.method.id === pm.id ? { ...p, amountCents: Number(e.target.value) } : p))} /></label>
                        {pm.name === "Dinheiro" && (
                          <>
                            <label>Recebido<input type="number" value={existing.receivedCents} onChange={(e) => { const rec = Number(e.target.value); setPayments(payments.map((p) => p.method.id === pm.id ? { ...p, receivedCents: rec, changeCents: Math.max(0, rec - p.amountCents) } : p)); }} /></label>
                            {existing.changeCents > 0 && <small style={{ color: "var(--accent)", gridColumn: "span 2" }}>Troco: {money(existing.changeCents)}</small>}
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

            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button disabled={paidTotal < totalFinal || (isAPrazo && !selectedCustomer)} onClick={payOrder} style={{ fontSize: 16, padding: "14px 24px" }}>
                <DollarSign size={18} /> Finalizar - {money(totalFinal)}
              </button>
            </div>
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
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: color, display: "grid", placeItems: "center", margin: "0 auto 8px", color: "#fff" }}>
                {table.status === "LIVRE" ? <Table size={22} /> : <Users size={22} />}
              </div>
              <strong style={{ display: "block", fontSize: 15 }}>{table.name}</strong>
              <span style={{ fontSize: 12, color: color, fontWeight: 700 }}>{statusLabel[table.status] ?? table.status}</span>
              {table.customerName ? <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, background: "#dbeafe", borderRadius: 20, padding: "2px 10px 2px 6px", fontSize: 11, fontWeight: 700, color: "#1e40af" }}><UserRound size={12} />{table.customerName}</div> : <div style={{ minHeight: 22 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
