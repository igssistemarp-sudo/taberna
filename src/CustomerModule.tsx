import React, { useState, useEffect, useRef } from "react";
import { Search, Plus, Phone, MapPin, Package2, Star, Clock, ArrowLeft, History, Repeat, X, Edit3, Trash2, MapPinOff, Dog, DoorOpen, Building2, Home, Briefcase, TreePine, Heart, Award, CreditCard, ShoppingCart, Filter, List, User, ChevronDown, ChevronUp, Pencil } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? (window.location.port === "5173" ? "http://localhost:3333" : window.location.origin);

type CustomerRecord = {
  id: string; name: string; nickname?: string | null; document?: string | null; rg?: string | null;
  birthDate?: string | null; gender?: string | null;
  phone?: string | null; whatsapp?: string | null; commercialPhone?: string | null; email?: string | null;
  zipCode?: string | null; street?: string | null; number?: string | null;
  neighborhoodId?: string | null; neighborhood?: { id: string; name: string; city: string; deliveryFeeCents: number; avgDeliveryMinutes: number } | null;
  district?: string | null; city?: string | null; state?: string | null;
  complement?: string | null; referencePoint?: string | null;
  latitude?: number | null; longitude?: number | null;
  hasDog: boolean; hasDoorman: boolean;
  apartment?: string | null; block?: string | null; condoName?: string | null;
  bestDeliveryTime?: string | null; deliveryNotes?: string | null;
  notes?: string | null;
  totalOrders: number; totalSpentCents: number;
  classification: string; loyaltyPoints: number;
  lastPurchaseAt?: string | null;
  createdAt?: string;
  addresses?: CustomerAddress[];
  orders?: OrderRecord[];
  totalSpent?: number;
  lastOrder?: OrderRecord | null;
  orderCount?: number;
};

type CustomerAddress = {
  id: string; customerId: string; label: string;
  zipCode?: string | null; street?: string | null; number?: string | null;
  complement?: string | null; district?: string | null; city?: string | null; state?: string | null;
  neighborhoodId?: string | null; neighborhood?: { id: string; name: string; city: string; deliveryFeeCents: number } | null;
  referencePoint?: string | null;
  latitude?: number | null; longitude?: number | null;
  hasDog: boolean; hasDoorman: boolean;
  apartment?: string | null; block?: string | null; condoName?: string | null;
  bestDeliveryTime?: string | null; deliveryNotes?: string | null;
  isMain: boolean;
};

type OrderRecord = {
  id: string; number: number; type: string; status: string; createdAt: string;
  deliveryFeeCents: number; discountCents: number;
  customerNameSnapshot?: string | null; waiterNameSnapshot?: string | null;
  items: Array<{ id: string; nameSnapshot: string; quantity: number; unitPriceCents: number; totalCents: number; additives: Array<{ id: string; nameSnapshot: string; quantity: number; totalCents: number }> }>;
  payments: Array<{ id: string; methodNameSnapshot: string; amountCents: number }>;
};

type Neighborhood = { id: string; name: string; city: string; deliveryFeeCents: number; avgDeliveryMinutes: number; active: boolean };

export function phoneMask(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function cepMask(v: string) { const d = v.replace(/\D/g, "").slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; }

function documentMask(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function money(value: number) { return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

const statusLabel: Record<string, string> = {
  NOVO: "Novo", ACEITO: "Aceito", EM_PREPARO: "Preparo", PRONTO: "Pronto",
  SAIU_PARA_ENTREGA: "Saiu p/ entrega", ENTREGUE: "Entregue", FECHANDO_CONTA: "Fechando",
  PAGO: "Pago", CANCELADO: "Cancelado"
};

const classColors: Record<string, string> = {
  BRONZE: "#cd7f32", PRATA: "#a0a0a0", OURO: "#ffd700", DIAMANTE: "#00bfff"
};

function calcOrderTotal(o: OrderRecord) {
  return o.items.reduce((s, i) => s + i.totalCents, 0) + o.deliveryFeeCents - o.discountCents;
}

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("taberna-token");
  const res = await fetch(`${API_URL}${path}`, {
    ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) }
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message ?? "Erro");
  return data;
}

function CustomerCard({ customer, onSelect, compact }: { customer: CustomerRecord; onSelect: (c: CustomerRecord) => void; compact?: boolean }) {
  const cls = customer.classification || "BRONZE";
  return <div className={`cs-card ${compact ? "compact" : ""}`} onClick={() => onSelect(customer)}>
    <div className="cs-card-avatar" style={{ background: classColors[cls] || "#cd7f32" }}>
      {customer.name.charAt(0).toUpperCase()}
    </div>
    <div className="cs-card-body">
      <div className="cs-card-name"><strong>{customer.name}</strong>{customer.nickname ? <small>({customer.nickname})</small> : null}</div>
      <div className="cs-card-meta">
        <span><Phone size={12} /> {customer.phone || customer.whatsapp || "—"}</span>
        {customer.neighborhood && <span><MapPin size={12} /> {customer.neighborhood.name}</span>}
      </div>
      {!compact && <div className="cs-card-stats">
        <span><Package2 size={12} /> {customer.totalOrders || customer.orderCount || 0} pedidos</span>
        <span><Star size={12} style={{ color: classColors[cls] }} /> {cls}</span>
        {customer.totalSpentCents > 0 && <span>{money(customer.totalSpentCents)}</span>}
      </div>}
    </div>
    {!compact && <div className="cs-card-action"><span className="cs-badge" style={{ background: classColors[cls] }}>{cls}</span></div>}
  </div>;
}

export function CustomerForm({ customer, onSave, onClose, neighborhoods: _nb }: { customer?: CustomerRecord | null; onSave: (c: CustomerRecord) => void; onClose: () => void; neighborhoods: Neighborhood[] }) {
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [form, setForm] = useState({
    name: customer?.name ?? "", nickname: customer?.nickname ?? "",
    document: customer?.document ?? "", rg: customer?.rg ?? "", birthDate: customer?.birthDate ?? "", gender: customer?.gender ?? "",
    phone: customer?.phone ?? "", whatsapp: customer?.whatsapp ?? "", commercialPhone: customer?.commercialPhone ?? "", email: customer?.email ?? "",
    zipCode: customer?.zipCode ?? "", street: customer?.street ?? "", number: customer?.number ?? "",
    neighborhoodId: customer?.neighborhoodId ?? "", district: customer?.district ?? "", city: customer?.city ?? "", state: customer?.state ?? "",
    complement: customer?.complement ?? "", referencePoint: customer?.referencePoint ?? "",
    latitude: customer?.latitude ?? "", longitude: customer?.longitude ?? "",
    hasDog: customer?.hasDog ?? false, hasDoorman: customer?.hasDoorman ?? false,
    apartment: customer?.apartment ?? "", block: customer?.block ?? "", condoName: customer?.condoName ?? "",
    bestDeliveryTime: customer?.bestDeliveryTime ?? "", deliveryNotes: customer?.deliveryNotes ?? "", notes: customer?.notes ?? ""
  });
  const [addresses, setAddresses] = useState<CustomerAddress[]>(customer?.addresses ?? []);
  const selectedNeighborhood = neighborhoods.find(n => n.id === form.neighborhoodId);

  useEffect(() => { request("/api/neighborhoods").then(setNeighborhoods).catch(() => {}); }, []);

  async function fetchCep(cep: string) {
    if (cep.replace(/\D/g, "").length !== 8) return;
    try {
      const data = await (await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g, "")}/json/`)).json();
      if (data.erro) return;
      setForm(f => ({ ...f, street: data.logradouro || f.street, district: data.bairro || f.district, city: data.localidade || f.city, state: data.uf || f.state }));
    } catch {}
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: any = { ...form };
      if (body.birthDate && body.birthDate.length === 10) body.birthDate = new Date(body.birthDate.split("/").reverse().join("-")).toISOString();
      if (body.document) body.document = body.document.replace(/\D/g, "");
      if (body.phone) body.phone = body.phone.replace(/\D/g, "");
      if (body.whatsapp) body.whatsapp = body.whatsapp.replace(/\D/g, "");
      if (body.commercialPhone) body.commercialPhone = body.commercialPhone.replace(/\D/g, "");
      body.latitude = body.latitude ? Number(body.latitude) : undefined;
      body.longitude = body.longitude ? Number(body.longitude) : undefined;
      const result = customer
        ? await request(`/api/customers/${customer.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await request("/api/customers", { method: "POST", body: JSON.stringify(body) });
      onSave({ ...result, addresses, orders: customer?.orders ?? [] });
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  const tabs = ["Dados Pessoais", "Contatos", "Endereço", "Entrega", "Observações"];

  return <div className="modal-overlay" onClick={onClose}>
    <div className="cf-modal" onClick={e => e.stopPropagation()}>
      <div className="cf-header"><h3>{customer ? "Editar Cliente" : "Novo Cliente"}</h3><button className="cf-close" onClick={onClose}><X size={18} /></button></div>
      <div className="cf-tabs">{tabs.map((t, i) => <button key={t} className={tab === i ? "active" : ""} onClick={() => setTab(i)}>{t}</button>)}</div>
      <div className="cf-body">
        {tab === 0 && <div className="cf-grid"><label>Nome *<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
          <label>Apelido<input value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} /></label>
          <label>CPF / CNPJ<input value={documentMask(form.document)} onChange={e => setForm(f => ({ ...f, document: e.target.value }))} placeholder="000.000.000-00" /></label>
          <label>RG<input value={form.rg} onChange={e => setForm(f => ({ ...f, rg: e.target.value }))} /></label>
          <label>Data Nasc.<input type="date" value={form.birthDate?.slice(0, 10) ?? ""} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} /></label>
          <label>Sexo<select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}><option value="">Selecione</option><option value="M">Masculino</option><option value="F">Feminino</option><option value="O">Outro</option></select></label></div>}
        {tab === 1 && <div className="cf-grid"><label>Telefone *<input value={phoneMask(form.phone)} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" /></label>
          <label>WhatsApp<input value={phoneMask(form.whatsapp)} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="(00) 00000-0000" /></label>
          <label>Comercial<input value={phoneMask(form.commercialPhone)} onChange={e => setForm(f => ({ ...f, commercialPhone: e.target.value }))} placeholder="(00) 00000-0000" /></label>
          <label>E-mail<input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></label></div>}
        {tab === 2 && <div className="cf-grid"><label>CEP<input value={cepMask(form.zipCode)} onChange={e => { const v = cepMask(e.target.value); setForm(f => ({ ...f, zipCode: v })); if (v.replace(/\D/g, "").length === 8) fetchCep(v); }} placeholder="00000-000" /></label>
          <label>Logradouro<input value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} /></label>
          <label>Número *<input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} /></label>
          <label>Complemento<input value={form.complement} onChange={e => setForm(f => ({ ...f, complement: e.target.value }))} /></label>
          <label>Bairro<select value={form.neighborhoodId} onChange={e => setForm(f => ({ ...f, neighborhoodId: e.target.value }))}><option value="">Selecione</option>{neighborhoods.map(n => <option key={n.id} value={n.id}>{n.name} - {money(n.deliveryFeeCents)}</option>)}</select></label>{selectedNeighborhood && <div className="cf-delivery-fee-card"><strong>Taxa: {money(selectedNeighborhood.deliveryFeeCents)}</strong><span>Tempo: {selectedNeighborhood.avgDeliveryMinutes} min · {selectedNeighborhood.city}</span></div>}
          <label>Distrito<input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} /></label>
          <label>Cidade<input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></label>
          <label>Estado<input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} /></label>
          <label>Ponto Ref.<input value={form.referencePoint} onChange={e => setForm(f => ({ ...f, referencePoint: e.target.value }))} /></label>
          <label>Latitude<input type="number" step="any" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} /></label>
          <label>Longitude<input type="number" step="any" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} /></label></div>}
        {tab === 3 && <div className="cf-grid">
          <label className="cf-check"><input type="checkbox" checked={form.hasDog} onChange={e => setForm(f => ({ ...f, hasDog: e.target.checked }))} /> <Dog size={16} /> Tem cachorro</label>
          <label className="cf-check"><input type="checkbox" checked={form.hasDoorman} onChange={e => setForm(f => ({ ...f, hasDoorman: e.target.checked }))} /> <DoorOpen size={16} /> Porteiro</label>
          <label>Apartamento<input value={form.apartment} onChange={e => setForm(f => ({ ...f, apartment: e.target.value }))} /></label>
          <label>Bloco<input value={form.block} onChange={e => setForm(f => ({ ...f, block: e.target.value }))} /></label>
          <label>Condomínio<input value={form.condoName} onChange={e => setForm(f => ({ ...f, condoName: e.target.value }))} /></label>
          <label>Melhor horário entrega<input value={form.bestDeliveryTime} onChange={e => setForm(f => ({ ...f, bestDeliveryTime: e.target.value }))} placeholder="Ex: 19h às 20h" /></label>
          <label>Obs. entrega<textarea rows={3} value={form.deliveryNotes} onChange={e => setForm(f => ({ ...f, deliveryNotes: e.target.value }))} placeholder="Não tocar campainha..." /></label></div>}
        {tab === 4 && <div className="cf-grid"><label>Observações<textarea rows={6} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Alergias, preferências..." /></label></div>}
      </div>
      <div className="cf-footer">
        <button className="ghost" onClick={onClose}>Cancelar</button>
        <button disabled={!form.name || saving} onClick={handleSave}>{saving ? "Salvando..." : customer ? "Atualizar" : "Cadastrar"}</button>
      </div>
    </div>
  </div>;
}

export function CustomerDetail({ customer, onBack, onEdit, onRepeatOrder }: { customer: CustomerRecord; onBack: () => void; onEdit?: (c: CustomerRecord) => void; onRepeatOrder?: (o: OrderRecord) => void }) {
  const [tab, setTab] = useState(0);
  const [fullData, setFullData] = useState<CustomerRecord | null>(null);

  useEffect(() => { request(`/api/customers/${customer.id}`).then(setFullData).catch(() => {}); }, [customer.id]);

  const data = fullData || customer;
  const cls = data.classification || "BRONZE";
  const lastOrder = Array.isArray(data.orders) && data.orders.length > 0 ? data.orders[0] : data.lastOrder;

  return <div className="cd-shell">
    <div className="cd-topbar"><button className="ghost" onClick={onBack}><ArrowLeft size={16} /> Voltar</button><h3>Cliente</h3>{onEdit && <button className="ghost" onClick={() => onEdit(data)} style={{ marginLeft: "auto" }}><Pencil size={15} /> Editar</button>}</div>
    <div className="cd-header">
      <div className="cd-avatar" style={{ background: classColors[cls] }}>{data.name.charAt(0)}</div>
      <div className="cd-info">
        <h2>{data.name} {data.nickname ? <small>({data.nickname})</small> : null}</h2>
        <div className="cd-meta">
          <span><Phone size={14} /> {data.phone || data.whatsapp || "—"}</span>
          {data.neighborhood && <span><MapPin size={14} /> {data.neighborhood.name} - {money(data.neighborhood.deliveryFeeCents)}</span>}
          {data.street && <span><MapPinOff size={14} /> {data.street}, {data.number}{data.district ? ` - ${data.district}` : ""}</span>}
        </div>
      </div>
      <div className="cd-class-badge" style={{ background: classColors[cls], color: cls === "OURO" || cls === "DIAMANTE" ? "#1a1a1a" : "#fff" }}>
        <Award size={20} /> {cls}
      </div>
    </div>

    <div className="cd-stats-grid">
      <div className="cd-stat"><span>Pedidos</span><strong>{data.totalOrders || 0}</strong></div>
      <div className="cd-stat"><span>Total gasto</span><strong>{money(data.totalSpentCents || 0)}</strong></div>
      <div className="cd-stat"><span>Ticket médio</span><strong>{(data.totalOrders > 0 ? money(Math.round((data.totalSpentCents || 0) / data.totalOrders)) : money(0))}</strong></div>
      <div className="cd-stat"><span>Cliente desde</span><strong>{new Date(data.createdAt || customer.createdAt!).toLocaleDateString("pt-BR")}</strong></div>
      {data.loyaltyPoints > 0 && <div className="cd-stat"><span>Pontos fidelidade</span><strong style={{ color: "#f59e0b" }}>{data.loyaltyPoints} pts</strong></div>}
      {lastOrder && <div className="cd-stat"><span>Última compra</span><strong>{new Date(lastOrder.createdAt).toLocaleDateString("pt-BR")}</strong></div>}
    </div>

    {data.notes && <div className="cd-notes"><Heart size={14} /> {data.notes}</div>}
    {data.deliveryNotes && <div className="cd-notes cd-notes-delivery"><MapPin size={14} /> {data.deliveryNotes}{data.bestDeliveryTime ? ` (melhor: ${data.bestDeliveryTime})` : ""}</div>}

    <div className="cd-tabs"><button className={tab === 0 ? "active" : ""} onClick={() => setTab(0)}>Endereços</button><button className={tab === 1 ? "active" : ""} onClick={() => setTab(1)}>Histórico</button></div>

    {tab === 0 && <div className="cd-addresses">{(data.addresses && data.addresses.length > 0 ? data.addresses : [{ id: "main", label: "Principal", street: data.street, number: data.number, neighborhood: data.neighborhood, district: data.district, city: data.city, state: data.state, complement: data.complement, referencePoint: data.referencePoint, hasDog: data.hasDog, hasDoorman: data.hasDoorman, apartment: data.apartment, block: data.block, condoName: data.condoName, zipCode: data.zipCode, bestDeliveryTime: data.bestDeliveryTime, deliveryNotes: data.deliveryNotes, isMain: true } as any]).map(a => <div key={a.id} className="cd-addr"><div className="cd-addr-header"><Home size={16} /><strong>{a.label}</strong>{a.isMain && <span className="cd-badge-sm">Principal</span>}</div><div className="cd-addr-body"><span>{a.street}, {a.number}{a.complement ? ` - ${a.complement}` : ""}</span><span>{a.neighborhood?.name}{a.district ? ` - ${a.district}` : ""}{a.city ? `, ${a.city}${a.state ? `-${a.state}` : ""}` : ""}</span>{a.referencePoint && <span>Ref: {a.referencePoint}</span>}</div><div className="cd-addr-details">{(a.hasDog || a.hasDoorman || a.apartment || a.block || a.condoName) && <span className="cd-delivery-tags">{a.hasDog && <span><Dog size={12} /> Cachorro</span>}{a.hasDoorman && <span><DoorOpen size={12} /> Porteiro</span>}{a.apartment && <span><Building2 size={12} /> AP {a.apartment}</span>}{a.block && <span>Bloco {a.block}</span>}{a.condoName && <span>{a.condoName}</span>}</span>}</div></div>)}</div>}

    {tab === 1 && <div className="cd-history">{(data.orders || []).slice(0, 30).map(o => <div key={o.id} className="cd-order"><div className="cd-order-num"><strong>#{o.number}</strong><span className={`cd-order-status ${o.status.toLowerCase()}`}>{statusLabel[o.status] || o.status}</span></div><div className="cd-order-info"><span>{new Date(o.createdAt).toLocaleDateString("pt-BR")} {new Date(o.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span><span>{o.type === "MESA" ? "Mesa" : o.type === "DELIVERY" ? "Delivery" : o.type === "BALCAO" ? "Balcão" : "Online"}</span></div><div className="cd-order-total"><strong>{money(calcOrderTotal(o))}</strong>{o.payments?.length > 0 && <small>{o.payments.map(p => p.methodNameSnapshot).join(", ")}</small>}</div>{onRepeatOrder && <button className="cd-repeat" onClick={() => onRepeatOrder(o)} title="Repetir pedido"><Repeat size={16} /></button>}</div>)}</div>}
  </div>;
}

function CustomerList({ customers: allCustomers, onSelect, onNew }: { customers: CustomerRecord[]; onSelect: (c: CustomerRecord) => void; onNew: () => void }) {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "orders" | "spent">("name");
  const [expandedFilter, setExpandedFilter] = useState(false);

  const filtered = allCustomers.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      const name = (c.name ?? "").toLowerCase();
      const phone = (c.phone ?? c.whatsapp ?? "");
      if (!name.includes(q) && !phone.includes(q.replace(/\D/g, ""))) return false;
    }
    if (classFilter && c.classification !== classFilter) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "orders") return (b.totalOrders || 0) - (a.totalOrders || 0);
    if (sortBy === "spent") return (b.totalSpentCents || 0) - (a.totalSpentCents || 0);
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  return <div className="cl-shell">
    <div className="cl-toolbar">
      <div className="cl-search">
        <Search size={18} />
        <input placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        {search && <button className="cs-clear" onClick={() => setSearch("")}><X size={16} /></button>}
      </div>
      <button className="cl-filter-btn" onClick={() => setExpandedFilter(!expandedFilter)}><Filter size={15} /> Filtros</button>
      <button className="cl-add-btn" onClick={onNew}><Plus size={15} /> Novo</button>
    </div>
    {expandedFilter && <div className="cl-filters">
      <select value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="">Todas as classes</option><option value="BRONZE">Bronze</option><option value="PRATA">Prata</option><option value="OURO">Ouro</option><option value="DIAMANTE">Diamante</option></select>
      <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}><option value="name">Nome</option><option value="orders">Mais pedidos</option><option value="spent">Mais gasto</option></select>
    </div>}
    <div className="cl-count">{filtered.length} cliente{filtered.length !== 1 ? "s" : ""}</div>
    <div className="cl-grid">{filtered.map(c => <CustomerCard key={c.id} customer={c} onSelect={onSelect} />)}</div>
    {filtered.length === 0 && <div className="cl-empty">Nenhum cliente encontrado com esse filtro.</div>}
  </div>;
}

export default function CustomerModule({ onSelectCustomer }: { onSelectCustomer?: (c: CustomerRecord) => void }) {
  const [selected, setSelected] = useState<CustomerRecord | null>(null);
  const [viewDetail, setViewDetail] = useState(false);
  const [tab, setTab] = useState<"search" | "list">("search");
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [allCustomers, setAllCustomers] = useState<CustomerRecord[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);

  useEffect(() => {
    request("/api/customers").then(setAllCustomers).catch(() => {});
    request("/api/neighborhoods").then(setNeighborhoods).catch(() => {});
  }, []);

  function handleSelect(c: CustomerRecord) {
    setSelected(c);
    if (onSelectCustomer) onSelectCustomer(c);
    else setViewDetail(true);
  }

  function handleEdit(c: CustomerRecord) {
    setEditingCustomer(c);
    setShowForm(true);
  }

  function handleSave(c: CustomerRecord) {
    setShowForm(false);
    setEditingCustomer(null);
    setSelected(c);
    setViewDetail(true);
    request("/api/customers").then(setAllCustomers).catch(() => {});
  }

  if (showForm) {
    return <div className="cm-shell">
      <CustomerForm customer={editingCustomer} onSave={handleSave} onClose={() => { setShowForm(false); setEditingCustomer(null); }} neighborhoods={neighborhoods} />
    </div>;
  }

  if (viewDetail && selected) {
    return <div className="cm-shell">
      <CustomerDetail customer={selected} onBack={() => setViewDetail(false)} onEdit={handleEdit} />
    </div>;
  }

  return <div className="cm-shell">
    <div className="cs-hero">
      <div><span>Clientes</span><h2>Gestão de Clientes</h2><p>Cadastro completo com busca rápida, histórico e classificação.</p></div>
    </div>
    <div className="cs-tabs-bar">
      <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}><Search size={15} /> Busca Rápida</button>
      <button className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}><List size={15} /> Todos os Clientes</button>
    </div>
    {tab === "search" && <CustomerSearch onSelect={handleSelect} neighborhoods={neighborhoods} onNew={() => setShowForm(true)} />}
    {tab === "list" && <CustomerList customers={allCustomers} onSelect={handleSelect} onNew={() => setShowForm(true)} />}
  </div>;
}

export function CustomerSearch({ onSelect, neighborhoods: _nb, onNew }: { onSelect: (c: CustomerRecord) => void; neighborhoods?: Neighborhood[]; onNew?: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const timer = useRef<number | null>(null);

  useEffect(() => { request("/api/neighborhoods").then(setNeighborhoods).catch(() => {}); }, []);

  useEffect(() => {
    const digits = query.replace(/\D/g, "");
    if (digits.length < 2 && query.length < 2) { setResults([]); return; }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try { setResults(await request(`/api/customers/search?q=${encodeURIComponent(query)}`)); } catch { setResults([]); }
      setLoading(false);
    }, 300);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query]);

  const isPhone = query.replace(/\D/g, "").length >= 3;

  return <div className="cs-shell">
    <div className="cs-search-box">
      <Phone size={20} />
      <input className="cs-phone-input" placeholder="Nome, telefone ou WhatsApp..." value={query}
        onChange={e => setQuery(e.target.value)} autoFocus />
      {loading && <span className="cs-spinner" />}
      {query && <button className="cs-clear" onClick={() => { setQuery(""); setResults([]); }}><X size={16} /></button>}
    </div>
    {results.length > 0 && <div className="cs-results">{results.map(c => <CustomerCard key={c.id} customer={c} onSelect={onSelect} />)}</div>}
    {results.length === 0 && query.replace(/\D/g, "").length >= 8 && <div className="cs-empty"><p>Cliente não encontrado por telefone</p><button onClick={() => setShowCreate(true)}><Plus size={16} /> Cadastrar Novo</button></div>}
    {results.length === 0 && query.length >= 3 && query.replace(/\D/g, "").length < 8 && <div className="cs-empty"><p>Nenhum cliente encontrado com esse nome</p><button onClick={() => setShowCreate(true)}><Plus size={16} /> Cadastrar Novo</button></div>}
    {showCreate && <CustomerForm onSave={(c) => { setShowCreate(false); onSelect(c); }} neighborhoods={neighborhoods} onClose={() => setShowCreate(false)} />}
    {onNew && <div className="cs-quick-new"><button onClick={onNew}><Plus size={16} /> Cadastrar Novo Cliente</button></div>}
  </div>;
}
