import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Clock, Edit3, History, MapPin, Phone, Plus, Printer, Repeat, Search, ShoppingCart, Trash2, Truck, UserRound, X } from "lucide-react";
import { CustomerDetail, CustomerForm, phoneMask } from "./CustomerModule";

const API_URL = import.meta.env.VITE_API_URL ?? (window.location.port === "5173" ? "http://localhost:3333" : window.location.origin);

type Neighborhood = { id: string; name: string; city: string; deliveryFeeCents: number; avgDeliveryMinutes: number; active: boolean };
type Product = { id: string; code: number; name: string; salePriceCents: number; printTarget: string; active: boolean; availableDelivery?: boolean };
type Addition = { id: string; name: string; valueCents: number; charge: boolean; active: boolean };
type PaymentMethod = { id: string; name: string; active: boolean };
type DriverUser = { id: string; name: string; role: string; active: boolean };
type Order = { id: string; number: number; type: string; status: string; createdAt?: string; deliveryFeeCents: number; changeForCents?: number; notes?: string | null; customerNameSnapshot?: string | null; customerPhoneSnapshot?: string | null; streetSnapshot?: string | null; numberSnapshot?: string | null; districtSnapshot?: string | null; citySnapshot?: string | null; stateSnapshot?: string | null; complementSnapshot?: string | null; referencePointSnapshot?: string | null; deliveryDriverName?: string | null; items: Array<{ id: string; nameSnapshot: string; quantity: number; unitPriceCents: number; totalCents: number; additives: Array<{ id: string; nameSnapshot: string; quantity: number; totalCents: number }> }>; payments?: Array<{ id: string; paymentMethodId?: string | null; methodNameSnapshot: string; amountCents: number; changeCents?: number }> };
type CustomerAddress = { id: string; label: string; zipCode?: string | null; street?: string | null; number?: string | null; complement?: string | null; district?: string | null; city?: string | null; state?: string | null; neighborhoodId?: string | null; neighborhood?: Neighborhood | null; referencePoint?: string | null; latitude?: number | null; longitude?: number | null; hasDog?: boolean; hasDoorman?: boolean; apartment?: string | null; block?: string | null; condoName?: string | null; bestDeliveryTime?: string | null; deliveryNotes?: string | null; isMain?: boolean };
type Customer = {
  id: string; name: string; nickname?: string | null; phone?: string | null; whatsapp?: string | null; email?: string | null;
  zipCode?: string | null; street?: string | null; number?: string | null; complement?: string | null; district?: string | null; city?: string | null; state?: string | null; referencePoint?: string | null;
  neighborhoodId?: string | null; neighborhood?: Neighborhood | null; notes?: string | null; deliveryNotes?: string | null; bestDeliveryTime?: string | null;
  hasDog?: boolean; hasDoorman?: boolean; apartment?: string | null; block?: string | null; condoName?: string | null;
  totalOrders: number; totalSpentCents: number; classification: string; loyaltyPoints: number; lastPurchaseAt?: string | null; createdAt?: string;
  addresses?: CustomerAddress[]; orders?: Order[]; lastOrder?: Order | null; orderCount?: number;
};
type ItemDraft = { productId: string; quantity: number; note: string; additiveIds: string[] };
type AppData = { products: Product[]; additions: Addition[]; neighborhoods: Neighborhood[]; orders: Order[]; paymentMethods: PaymentMethod[]; users: DriverUser[] } | null;

const emptyDraft = (): ItemDraft => ({ productId: "", quantity: 1, note: "", additiveIds: [] });
const digits = (value?: string | null) => (value ?? "").replace(/\D/g, "");
const moneyInputToCents = (value: string) => {
  const clean = value.replace(/[^\d,.]/g, "").trim();
  if (!clean) return 0;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};
const classColors: Record<string, string> = { BRONZE: "#a16207", PRATA: "#64748b", OURO: "#f59e0b", DIAMANTE: "#0891b2" };
const statusLabel: Record<string, string> = { NOVO: "Novo", ACEITO: "Aceito", EM_PREPARO: "Preparo", PRONTO: "Pronto", SAIU_PARA_ENTREGA: "Saiu", ENTREGUE: "Entregue", PAGO: "Pago", CANCELADO: "Cancelado" };

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("taberna-token");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message ?? "Erro na requisição");
  return data;
}

function orderTotal(order: Order) {
  return order.items.reduce((sum, item) => sum + item.totalCents, 0) + order.deliveryFeeCents;
}

function inactiveWarning(customer: Customer) {
  if (!customer.lastPurchaseAt) return null;
  const days = Math.floor((Date.now() - new Date(customer.lastPurchaseAt).getTime()) / 86400000);
  if (days >= 90) return `Cliente sem comprar há ${days} dias`;
  if (days >= 60) return `Cliente sem comprar há ${days} dias`;
  if (days >= 30) return `Cliente sem comprar há ${days} dias`;
  return null;
}

function mainAddress(customer: Customer): CustomerAddress {
  const address = customer.addresses?.find((item) => item.isMain) ?? customer.addresses?.[0];
  if (address) return address;
  return {
    id: "main", label: "Principal", zipCode: customer.zipCode, street: customer.street, number: customer.number,
    complement: customer.complement, district: customer.district, city: customer.city, state: customer.state,
    neighborhoodId: customer.neighborhoodId, neighborhood: customer.neighborhood, referencePoint: customer.referencePoint,
    hasDog: customer.hasDog, hasDoorman: customer.hasDoorman, apartment: customer.apartment, block: customer.block,
    condoName: customer.condoName, bestDeliveryTime: customer.bestDeliveryTime, deliveryNotes: customer.deliveryNotes, isMain: true
  };
}

function CustomerQuickSearch({ onSelect, onEdit, onHistory }: { onSelect: (customer: Customer) => void; onEdit: (customer?: Customer | null) => void; onHistory: (customer: Customer) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (digits(query).length < 2) { setResults([]); return; }
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try { setResults(await request(`/api/customers/search?q=${encodeURIComponent(query)}`)); } catch { setResults([]); }
      setLoading(false);
    }, 180);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query]);

  return <section className="dv-search-panel">
    <div className="dv-section-title"><Search size={18} /><div><strong>Pesquisa rápida</strong><span>Telefone / WhatsApp</span></div></div>
    <div className="dv-phone-search"><Phone size={24} /><input autoFocus value={query} placeholder="(00) 00000-0000" onChange={(event) => setQuery(phoneMask(event.target.value))} />{loading && <span className="dv-loader" />}{query && <button className="ghost" onClick={() => { setQuery(""); setResults([]); }}><X size={16} /></button>}</div>
    <div className="dv-search-results">
      {results.map((customer) => <CustomerResult key={customer.id} customer={customer} onSelect={onSelect} onEdit={onEdit} onHistory={onHistory} />)}
      {results.length === 0 && digits(query).length >= 8 && !loading && <div className="dv-empty-customer"><strong>Cliente não encontrado</strong><span>Cadastre sem sair do atendimento.</span><button onClick={() => onEdit(null)}><Plus size={16} /> Cadastrar Novo Cliente</button></div>}
    </div>
  </section>;
}

function CustomerResult({ customer, onSelect, onEdit, onHistory }: { customer: Customer; onSelect: (customer: Customer) => void; onEdit: (customer: Customer) => void; onHistory: (customer: Customer) => void }) {
  const address = mainAddress(customer);
  const warning = inactiveWarning(customer);
  return <article className="dv-customer-result">
    <div className="dv-customer-head"><div className="dv-avatar" style={{ background: classColors[customer.classification] ?? classColors.BRONZE }}>{customer.name.charAt(0)}</div><div><strong>{customer.name}</strong><span>{phoneMask(customer.phone || customer.whatsapp || "")}</span></div><span className="dv-class">{customer.classification || "BRONZE"}</span></div>
    <div className="dv-customer-grid"><span>Bairro <b>{address.neighborhood?.name ?? customer.neighborhood?.name ?? "-"}</b></span><span>Endereço <b>{address.street ?? "-"}, {address.number ?? ""}</b></span><span>Último pedido <b>{customer.lastOrder ? `#${customer.lastOrder.number}` : "-"}</b></span><span>Última compra <b>{customer.lastPurchaseAt ? new Date(customer.lastPurchaseAt).toLocaleDateString("pt-BR") : "-"}</b></span><span>Total gasto <b>{money(customer.totalSpentCents || 0)}</b></span></div>
    {warning && <div className="dv-warning">{warning}</div>}
    <div className="dv-actions"><button onClick={() => onSelect(customer)}><ArrowRight size={16} /> Selecionar Cliente</button><button className="ghost" onClick={() => onEdit(customer)}><Edit3 size={16} /> Editar Cadastro</button><button className="ghost" onClick={() => onHistory(customer)}><History size={16} /> Ver Histórico</button></div>
  </article>;
}

function CustomerSideCard({ customer, address, money }: { customer: Customer | null; address: CustomerAddress | null; money: (value: number) => string }) {
  if (!customer || !address) return <aside className="dv-side-card empty"><UserRound size={38} /><strong>Nenhum cliente selecionado</strong><span>Digite o telefone para iniciar em segundos.</span></aside>;
  const warning = inactiveWarning(customer);
  const fee = address.neighborhood?.deliveryFeeCents ?? customer.neighborhood?.deliveryFeeCents ?? 0;
  return <aside className="dv-side-card">
    <div className="dv-side-top"><div className="dv-avatar big" style={{ background: classColors[customer.classification] ?? classColors.BRONZE }}>{customer.name.charAt(0)}</div><div><strong>{customer.name}</strong><span>{phoneMask(customer.phone || customer.whatsapp || "")}</span></div></div>
    <div className="dv-side-lines"><span><MapPin size={14} /> {address.street}, {address.number}{address.complement ? ` - ${address.complement}` : ""}</span><span>{address.neighborhood?.name ?? customer.neighborhood?.name ?? "Sem bairro"} · taxa {money(fee)}</span>{address.referencePoint && <span>Ref: {address.referencePoint}</span>}{address.deliveryNotes && <span>{address.deliveryNotes}</span>}{address.bestDeliveryTime && <span>Melhor horário: {address.bestDeliveryTime}</span>}</div>
    <div className="dv-mini-stats"><span>Pedidos <b>{customer.totalOrders || customer.orderCount || 0}</b></span><span>Total <b>{money(customer.totalSpentCents || 0)}</b></span><span>Pontos <b>{customer.loyaltyPoints || 0}</b></span></div>
    {warning && <div className="dv-warning">{warning}</div>}
  </aside>;
}

export default function DeliveryModule({ data, money, mutate, reload }: { data: AppData; money: (value: number) => string; mutate: (path: string, options?: RequestInit) => Promise<void>; reload: () => Promise<void> }) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [orderType, setOrderType] = useState<"DELIVERY" | "ONLINE">("DELIVERY");
  const [items, setItems] = useState<ItemDraft[]>([emptyDraft()]);
  const [notes, setNotes] = useState("");
  const [orderPaymentMethodId, setOrderPaymentMethodId] = useState("");
  const [orderChangeFor, setOrderChangeFor] = useState("");
  const [customerForm, setCustomerForm] = useState<Customer | null | undefined>(undefined);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [optionItemIndex, setOptionItemIndex] = useState<number | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const [orderEditor, setOrderEditor] = useState({ status: "ACEITO", driver: "", paymentMethodId: "", amount: "", changeFor: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const addresses = selectedCustomer ? (selectedCustomer.addresses?.length ? selectedCustomer.addresses : [mainAddress(selectedCustomer)]) : [];
  const selectedAddress = addresses.find((item) => item.id === selectedAddressId) ?? addresses[0] ?? null;
  const activeProducts = (data?.products ?? []).filter((item) => item.active && item.availableDelivery !== false);
  const activeAdditions = (data?.additions ?? []).filter((item) => item.active);
  const deliveryOrders = (data?.orders ?? []).filter((order) => order.type === "DELIVERY" || order.type === "ONLINE");
  const openDeliveryOrders = deliveryOrders.filter((order) => !["PAGO", "CANCELADO"].includes(order.status));
  const paymentMethods = (data?.paymentMethods ?? []).filter((method) => method.active);
  const drivers = (data?.users ?? []).filter((user) => user.active && user.role === "ENTREGADOR");
  const orderPaymentMethod = paymentMethods.find((method) => method.id === orderPaymentMethodId);
  const isCashPayment = (orderPaymentMethod?.name ?? "").toLowerCase().includes("dinheiro");

  useEffect(() => { if (selectedCustomer) setSelectedAddressId((selectedCustomer.addresses?.find((item) => item.isMain)?.id ?? selectedCustomer.addresses?.[0]?.id ?? "main")); }, [selectedCustomer?.id]);
  useEffect(() => {
    if (!selectedOrder) return;
    const payment = selectedOrder.payments?.[0];
    setOrderEditor({
      status: selectedOrder.status,
      driver: selectedOrder.deliveryDriverName ?? "",
      paymentMethodId: payment?.paymentMethodId ?? paymentMethods.find((method) => method.name === payment?.methodNameSnapshot)?.id ?? "",
      amount: String((payment?.amountCents ?? orderTotal(selectedOrder)) / 100),
      changeFor: String((selectedOrder.changeForCents ?? payment?.changeCents ?? 0) / 100),
      notes: selectedOrder.notes ?? ""
    });
  }, [selectedOrder?.id]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      const product = activeProducts.find((productItem) => productItem.id === item.productId);
      const extras = item.additiveIds.reduce((acc, id) => acc + (activeAdditions.find((addition) => addition.id === id)?.valueCents ?? 0), 0);
      return sum + ((product?.salePriceCents ?? 0) + extras) * item.quantity;
    }, 0);
    const fee = selectedAddress?.neighborhood?.deliveryFeeCents ?? selectedCustomer?.neighborhood?.deliveryFeeCents ?? 0;
    return { subtotal, fee, total: subtotal + fee };
  }, [items, activeProducts, activeAdditions, selectedAddress, selectedCustomer]);

  async function refreshCustomer(customer: Customer) {
    const full = await request(`/api/customers/${customer.id}`);
    setSelectedCustomer(full);
  }

  async function createOrder() {
    if (!selectedCustomer || !selectedAddress) return alert("Selecione um cliente e endereço.");
    const orderItems = items.filter((item) => item.productId).map((item) => {
      const product = activeProducts.find((productItem) => productItem.id === item.productId)!;
      return { productId: product.id, name: product.name, quantity: Number(item.quantity), unitPriceCents: product.salePriceCents, printTarget: product.printTarget, note: item.note, additives: item.additiveIds.map((id) => { const addition = activeAdditions.find((additionItem) => additionItem.id === id)!; return { additionalId: addition.id, name: addition.name, quantity: 1, unitPriceCents: addition.valueCents, charge: addition.charge }; }) };
    });
    if (!orderItems.length) return alert("Adicione pelo menos um produto.");
    setSaving(true);
    try {
      const changeForCents = isCashPayment ? moneyInputToCents(orderChangeFor) : 0;
      const paymentNote = orderPaymentMethod ? `Forma prevista: ${orderPaymentMethod.name}${changeForCents > 0 ? ` | Levar troco para ${money(changeForCents)}` : ""}` : "Forma prevista: Não informada";
      await request("/api/orders", { method: "POST", body: JSON.stringify({ type: orderType, customerId: selectedCustomer.id, neighborhoodId: selectedAddress.neighborhoodId ?? selectedCustomer.neighborhoodId, customerNameSnapshot: selectedCustomer.name, customerPhoneSnapshot: selectedCustomer.phone || selectedCustomer.whatsapp, streetSnapshot: selectedAddress.street, numberSnapshot: selectedAddress.number, districtSnapshot: selectedAddress.district ?? selectedAddress.neighborhood?.name, citySnapshot: selectedAddress.city, stateSnapshot: selectedAddress.state, zipCodeSnapshot: selectedAddress.zipCode, complementSnapshot: selectedAddress.complement, referencePointSnapshot: selectedAddress.referencePoint, changeForCents, notes: [paymentNote, notes].filter(Boolean).join("\n"), items: orderItems, payments: [] }) });
      await reload();
      setItems([emptyDraft()]);
      setNotes("");
      setOrderPaymentMethodId("");
      setOrderChangeFor("");
      setSelectedCustomer(null);
      setSelectedAddressId("");
      setSearchKey((current) => current + 1);
    } catch (error: any) { alert(error.message ?? "Falha ao confirmar pedido."); }
    finally { setSaving(false); }
  }

  async function repeatOrder(order: Order) {
    if (!selectedCustomer) return;
    await mutate(`/api/customers/${selectedCustomer.id}/orders/${order.id}/repeat`, { method: "POST" });
  }

  async function saveOrderDelivery() {
    if (!selectedOrder) return;
    await request(`/api/orders/${selectedOrder.id}/delivery`, { method: "PUT", body: JSON.stringify({ status: orderEditor.status, deliveryDriverName: orderEditor.driver || null, changeForCents: moneyInputToCents(orderEditor.changeFor), notes: orderEditor.notes || null }) });
    await reload();
    setSelectedOrder(null);
  }

  async function payOrder() {
    if (!selectedOrder) return;
    const method = paymentMethods.find((item) => item.id === orderEditor.paymentMethodId);
    if (!method) return alert("Selecione a forma de pagamento.");
    const amountCents = moneyInputToCents(orderEditor.amount);
    const changeForCents = moneyInputToCents(orderEditor.changeFor);
    try {
      await request(`/api/orders/${selectedOrder.id}/pay`, { method: "POST", body: JSON.stringify({ payments: [{ paymentMethodId: method.id, methodNameSnapshot: method.name, amountCents, feeCents: 0, changeCents: Math.max(0, changeForCents - amountCents) }] }) });
      await reload();
      setSelectedOrder(null);
    } catch (error: any) { alert(error.message ?? "Falha ao finalizar pagamento."); }
  }

  return <div className="dv-shell">
    <div className="dv-status-strip"><StatusPill label="Em processo" count={openDeliveryOrders.filter((order) => ["NOVO", "ACEITO", "EM_PREPARO"].includes(order.status)).length} /><StatusPill label="Em trânsito" count={openDeliveryOrders.filter((order) => order.status === "SAIU_PARA_ENTREGA").length} /><StatusPill label="A acertar" count={openDeliveryOrders.filter((order) => order.status === "ENTREGUE").length} /></div>
    <div className="dv-grid">
      <div className="dv-left"><CustomerQuickSearch key={searchKey} onSelect={setSelectedCustomer} onEdit={setCustomerForm} onHistory={setHistoryCustomer} />{selectedCustomer && addresses.length > 1 && <section className="dv-address-picker"><strong>Qual endereço deseja utilizar?</strong><div>{addresses.map((address) => <button key={address.id} className={selectedAddress?.id === address.id ? "active" : ""} onClick={() => setSelectedAddressId(address.id)}><MapPin size={14} /> {address.label}<small>{address.neighborhood?.name} · {money(address.neighborhood?.deliveryFeeCents ?? 0)}</small></button>)}</div></section>}</div>
      <div className="dv-center"><section className="dv-order-panel"><div className="dv-order-head"><div><span>Novo pedido</span><h3>Delivery rápido</h3></div><select value={orderType} onChange={(event) => setOrderType(event.target.value as "DELIVERY" | "ONLINE")}><option value="DELIVERY">Telefone / WhatsApp</option><option value="ONLINE">Online</option></select></div>{items.map((item, index) => <div className="dv-item" key={index}><select value={item.productId} onChange={(event) => setItems((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, productId: event.target.value } : draft))}><option value="">Pesquisar produto</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.code} - {product.name} - {money(product.salePriceCents)}</option>)}</select><input type="number" min={1} value={item.quantity} onChange={(event) => setItems((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, quantity: Number(event.target.value) } : draft))} /><input placeholder="Observação do item" value={item.note} onChange={(event) => setItems((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, note: event.target.value } : draft))} /><button className="dv-options-button" onClick={() => setOptionItemIndex(index)}>Opcionais {item.additiveIds.length > 0 && <b>{item.additiveIds.length}</b>}</button><button className="dv-remove-item" onClick={() => setItems((current) => current.length === 1 ? [emptyDraft()] : current.filter((_, draftIndex) => draftIndex !== index))}><Trash2 size={16} /> Remover</button></div>)}<button className="dv-add-item" onClick={() => setItems((current) => [...current, emptyDraft()])}><Plus size={16} /> Adicionar produto</button><div className="dv-prepay-box"><label>Forma que o cliente vai pagar<select value={orderPaymentMethodId} onChange={(event) => setOrderPaymentMethodId(event.target.value)}><option value="">Perguntar ao cliente</option>{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>{isCashPayment && <label>Troco para quanto?<input value={orderChangeFor} onChange={(event) => setOrderChangeFor(event.target.value)} placeholder="Ex: 100,00" /></label>}</div><textarea rows={3} placeholder="Observações do pedido" value={notes} onChange={(event) => setNotes(event.target.value)} /><div className="dv-total-box"><span>Subtotal <b>{money(totals.subtotal)}</b></span><span>Taxa <b>{money(totals.fee)}</b></span><strong>Total {money(totals.total)}</strong><button disabled={saving || !selectedCustomer} onClick={createOrder}><ShoppingCart size={18} /> {saving ? "Enviando..." : "Confirmar pedido"}</button></div></section></div>
      <div className="dv-right"><CustomerSideCard customer={selectedCustomer} address={selectedAddress} money={money} /><section className="dv-recent"><div className="dv-section-title"><Truck size={18} /><div><strong>Pedidos em aberto</strong><span>Entregas e acertos pendentes</span></div></div>{openDeliveryOrders.length === 0 && <div className="dv-empty-list">Nenhum delivery pendente.</div>}{openDeliveryOrders.slice(0, 20).map((order) => <div key={order.id} className="dv-recent-order"><div><strong>#{order.number}</strong><span>{order.customerNameSnapshot ?? "Sem cliente"}</span>{order.deliveryDriverName && <small>Motoqueiro: {order.deliveryDriverName}</small>}</div><span className={`dv-order-status ${order.status.toLowerCase()}`}>{statusLabel[order.status] ?? order.status}</span><b>{money(orderTotal(order))}</b><button className="ghost" onClick={() => setSelectedOrder(order)}>Abrir</button></div>)}</section></div>
    </div>
    {customerForm !== undefined && <CustomerForm customer={(customerForm ?? null) as any} neighborhoods={data?.neighborhoods ?? []} onClose={() => setCustomerForm(undefined)} onSave={(customer) => { setCustomerForm(undefined); setSelectedCustomer(customer as Customer); }} />}
    {historyCustomer && <div className="modal-overlay" onClick={() => setHistoryCustomer(null)}><div className="dv-history-modal" onClick={(event) => event.stopPropagation()}><CustomerDetail customer={historyCustomer as any} onBack={() => setHistoryCustomer(null)} onRepeatOrder={repeatOrder as any} /></div></div>}
    {optionItemIndex !== null && items[optionItemIndex] && <div className="modal-overlay" onClick={() => setOptionItemIndex(null)}><div className="dv-options-modal" onClick={(event) => event.stopPropagation()}><div className="dv-modal-head"><div><span>Opcionais</span><h3>{activeProducts.find((product) => product.id === items[optionItemIndex].productId)?.name ?? "Produto"}</h3></div><button className="cf-close" onClick={() => setOptionItemIndex(null)}><X size={18} /></button></div><div className="dv-options-grid">{activeAdditions.map((addition, additionIndex) => { const checked = items[optionItemIndex].additiveIds.includes(addition.id); return <button key={addition.id} className={checked ? "selected" : ""} style={{ borderColor: ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"][additionIndex % 6] }} onClick={() => setItems((current) => current.map((draft, draftIndex) => draftIndex === optionItemIndex ? { ...draft, additiveIds: checked ? draft.additiveIds.filter((id) => id !== addition.id) : [...draft.additiveIds, addition.id] } : draft))}><strong>{addition.name}</strong><span>{addition.valueCents > 0 ? `+ ${money(addition.valueCents)}` : "Sem custo"}</span></button>; })}</div><div className="dv-options-footer"><span>{items[optionItemIndex].additiveIds.length} opcionais selecionados</span><button onClick={() => setOptionItemIndex(null)}>Confirmar opcionais</button></div></div></div>}
    {selectedOrder && <div className="modal-overlay" onClick={() => setSelectedOrder(null)}><div className="dv-order-modal" onClick={(event) => event.stopPropagation()}><div className="dv-modal-head"><div><span>Pedido #{selectedOrder.number}</span><h3>{selectedOrder.customerNameSnapshot ?? "Cliente"}</h3></div><button className="cf-close" onClick={() => setSelectedOrder(null)}><X size={18} /></button></div><div className="dv-modal-grid"><section><h4>Entrega</h4><div className="dv-modal-address"><strong>{selectedOrder.streetSnapshot}, {selectedOrder.numberSnapshot}</strong><span>{selectedOrder.districtSnapshot} - {selectedOrder.citySnapshot}{selectedOrder.stateSnapshot ? `/${selectedOrder.stateSnapshot}` : ""}</span>{selectedOrder.complementSnapshot && <span>Compl: {selectedOrder.complementSnapshot}</span>}{selectedOrder.referencePointSnapshot && <span>Ref: {selectedOrder.referencePointSnapshot}</span>}<span>Tel: {phoneMask(selectedOrder.customerPhoneSnapshot ?? "")}</span></div><label>Status<select value={orderEditor.status} onChange={(event) => setOrderEditor((state) => ({ ...state, status: event.target.value }))}>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Motoqueiro / Entregador<select value={orderEditor.driver} onChange={(event) => setOrderEditor((state) => ({ ...state, driver: event.target.value }))}><option value="">Selecione</option>{drivers.map((driver) => <option key={driver.id} value={driver.name}>{driver.name}</option>)}</select></label><label>Observações<textarea rows={3} value={orderEditor.notes} onChange={(event) => setOrderEditor((state) => ({ ...state, notes: event.target.value }))} /></label><button onClick={saveOrderDelivery}><Truck size={16} /> Salvar entrega/status</button></section><section><h4>Pagamento</h4><label>Forma de pagamento<select value={orderEditor.paymentMethodId} onChange={(event) => setOrderEditor((state) => ({ ...state, paymentMethodId: event.target.value }))}><option value="">Selecione</option>{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label><label>Valor pago<input value={orderEditor.amount} onChange={(event) => setOrderEditor((state) => ({ ...state, amount: event.target.value }))} /></label><label>Troco para<input value={orderEditor.changeFor} onChange={(event) => setOrderEditor((state) => ({ ...state, changeFor: event.target.value }))} /></label><div className="dv-payment-summary"><span>Total do pedido</span><strong>{money(orderTotal(selectedOrder))}</strong></div><button onClick={payOrder}><ShoppingCart size={16} /> Salvar pagamento / finalizar</button><button className="ghost" onClick={() => void mutate(`/api/orders/${selectedOrder.id}/reprint`, { method: "POST" })}><Printer size={16} /> Imprimir comprovante</button></section><section><h4>Itens</h4><div className="dv-modal-items">{selectedOrder.items.map((item) => <div key={item.id}><span>{item.quantity}x {item.nameSnapshot}</span><b>{money(item.totalCents)}</b>{item.additives.length > 0 && <small>{item.additives.map((addition) => addition.nameSnapshot).join(", ")}</small>}</div>)}</div></section></div></div></div>}
  </div>;
}

function StatusPill({ label, count }: { label: string; count: number }) {
  return <div className="dv-status-pill"><Clock size={16} /><span>{label}</span><strong>{count}</strong></div>;
}

function money(value: number) { return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
