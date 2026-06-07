import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, CreditCard, Download, FileSpreadsheet, FileText, Filter, PieChart, Plus, Printer, Receipt, Search, TrendingUp, Wallet } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? (window.location.port === "5173" ? "http://localhost:3333" : window.location.origin);

type MoneyFn = (value: number) => string;
type AppData = any;
type Filters = { from: string; to: string; fromHour: string; toHour: string; userId: string; waiterId: string; driverName: string; customerId: string; neighborhoodId: string; paymentMethod: string };

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const reportGroups = [
  { title: "Vendas", items: [["sales_by_period", "Vendas por período"], ["sales_by_day", "Vendas por dia"], ["sales_by_hour", "Vendas por hora"], ["sales_by_weekday", "Dia da semana"], ["sales_by_month", "Vendas por mês"]] },
  { title: "Produtos", items: [["top_products", "Produtos mais vendidos"], ["bottom_products", "Produtos menos vendidos"], ["profit_by_product", "Lucratividade"], ["sales_by_category", "Categorias"], ["top_additions", "Adicionais"], ["additional_revenue", "Faturamento adicionais"]] },
  { title: "Clientes e Delivery", items: [["top_customers", "Clientes que mais compram"], ["customer_last_purchase", "Última compra"], ["inactive_customers", "Clientes inativos"], ["delivery_by_neighborhood", "Delivery por bairro"], ["delivery_fee_by_neighborhood", "Taxas por bairro"], ["delivery_orders", "Pedidos delivery"]] },
  { title: "Equipe", items: [["delivery_performance", "Entregadores"], ["delivery_driver_commission", "Comissão entregadores"], ["waiter_sales", "Vendas por garçom"], ["waiter_commission", "Comissão garçons"]] },
  { title: "Caixa, financeiro e estoque", items: [["cashbook", "Livro caixa"], ["cash_closing", "Fechamento"], ["payable_summary", "Contas a pagar"], ["receivable_summary", "Contas a receber"], ["flow_cash", "Fluxo de caixa"], ["dre_simplificada", "DRE"], ["stock_current", "Estoque atual"], ["stock_low", "Estoque baixo"], ["cancelled_orders", "Cancelamentos"]] }
] as const;

const reportTitleMap: Record<string, string> = {
  sales_by_period: "Vendas por período",
  sales_by_day: "Vendas por dia",
  sales_by_hour: "Vendas por hora",
  sales_by_weekday: "Dia da semana",
  sales_by_month: "Vendas por mês",
  top_products: "Produtos mais vendidos",
  bottom_products: "Produtos menos vendidos",
  profit_by_product: "Lucratividade",
  sales_by_category: "Categorias",
  top_additions: "Adicionais",
  additional_revenue: "Faturamento adicionais",
  top_customers: "Clientes que mais compram",
  customer_last_purchase: "Última compra",
  inactive_customers: "Clientes inativos",
  delivery_by_neighborhood: "Delivery por bairro",
  delivery_fee_by_neighborhood: "Taxas por bairro",
  delivery_orders: "Pedidos delivery",
  delivery_performance: "Entregadores",
  delivery_driver_commission: "Comissão entregadores",
  waiter_sales: "Vendas por garçom",
  waiter_commission: "Comissão garçons",
  cashbook: "Livro caixa",
  cash_closing: "Fechamento",
  payable_summary: "Contas a pagar",
  receivable_summary: "Contas a receber",
  flow_cash: "Fluxo de caixa",
  dre_simplificada: "DRE",
  stock_current: "Estoque atual",
  stock_low: "Estoque baixo",
  cancelled_orders: "Cancelamentos"
};

function reportDisplayLabel(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, "_").replace(/_+/g, "_").trim();
  for (const group of reportGroups) {
    for (const [key, label] of group.items) {
      const keyNormalized = key.toLowerCase().replace(/\s+/g, "_").replace(/_+/g, "_").trim();
      const labelNormalized = label.toLowerCase().replace(/\s+/g, "_").replace(/_+/g, "_").trim();
      if (normalized === keyNormalized || normalized === labelNormalized) return label;
    }
  }
  return reportTitleMap[normalized] ?? reportTitleMap[value] ?? value;
}

async function api(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("taberna-token");
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) } });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message ?? "Erro na requisição");
  return data;
}

function query(filters: Filters, format = "json") {
  const params = new URLSearchParams({ format });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.toString();
}

function maxValue(rows: Array<{ value: number }>) { return Math.max(1, ...rows.map((item) => item.value)); }

const headerLabels: Record<string, string> = {
  customer: "Cliente",
  customerId: "Cliente",
  customerName: "Cliente",
  supplier: "Fornecedor",
  supplierName: "Fornecedor",
  driver: "Entregador",
  driverName: "Entregador",
  waiter: "Garçom",
  waiterName: "Garçom",
  paymentMethod: "Forma de pagamento",
  payment_method: "Forma de pagamento",
  category: "Categoria",
  product: "Produto",
  products: "Produtos",
  status: "Status",
  type: "Tipo",
  date: "Data",
  hour: "Hora",
  month: "Mês",
  value: "Valor",
  amount: "Valor",
  total: "Total",
  quantity: "Quantidade",
  count: "Quantidade",
  gross: "Bruto",
  net: "Líquido",
  profit: "Lucro",
  stock: "Estoque",
  current: "Atual",
  low: "Baixo",
  open: "Em aberto",
  closing: "Fechamento",
  order: "Pedido",
  orders: "Pedidos",
  deliver: "Entrega"
};

function labelForHeader(header: string) {
  const normalized = header.replace(/_/g, " ");
  if (headerLabels[header]) return headerLabels[header];
  const parts = normalized.split(" ");
  return parts.map((part) => headerLabels[part.toLowerCase()] ?? part).join(" ");
}

function DonutChart({ rows, money }: { rows: Array<{ label: string; value: number; color: string }>; money: MoneyFn }) {
  const total = rows.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 25;
  return <div className="admin-donut-wrap"><svg className="admin-donut" viewBox="0 0 42 42">{rows.map((row) => { const dash = (row.value / total) * 100; const item = <circle key={row.label} cx="21" cy="21" r="15.915" fill="transparent" stroke={row.color} strokeWidth="7" strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={offset} />; offset -= dash; return item; })}<circle cx="21" cy="21" r="10" fill="#fff" /></svg><div className="admin-legend">{rows.map((row) => <span key={row.label}><i style={{ background: row.color }} />{row.label}<b>{money(row.value)}</b></span>)}</div></div>;
}

function BarList({ rows, money }: { rows: Array<{ label: string; value: number; color?: string }>; money?: MoneyFn }) {
  const max = maxValue(rows);
  return <div className="admin-bars">{rows.map((row) => <div className="admin-bar" key={row.label}><span>{row.label}</span><div><i style={{ width: `${Math.max(4, (row.value / max) * 100)}%`, background: row.color ?? "#2563eb" }} /></div><b>{money ? money(row.value) : row.value}</b></div>)}</div>;
}

function ReportTable({ rows, money }: { rows: any[]; money: MoneyFn }) {
  const headers = Object.keys(rows[0] ?? {}).slice(0, 8);
  if (!rows.length) return <div className="admin-empty">Nenhum dado para os filtros selecionados.</div>;
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headers.map((header) => <th key={header}>{labelForHeader(header)}</th>)}</tr></thead><tbody>{rows.slice(0, 80).map((row, index) => <tr key={index}>{headers.map((header) => <td key={header}>{typeof row[header] === "number" && header.match(/valor|total|faturamento|lucro|receita|custo|taxa|fluxo|comissao|ticket|bruto|liquido|desconto|despesa|amount|gross|net|profit|sum|count/) ? money(row[header]) : String(row[header] ?? "")}</td>)}</tr>)}</tbody></table></div>;
}

export function ExecutiveDashboard({ data, money }: { data: AppData | null; money: MoneyFn }) {
  const dashboard = data?.dashboard ?? {};
  const orders = data?.orders ?? [];
  const todayOrders = orders.filter((order: any) => new Date(order.createdAt ?? Date.now()).toISOString().slice(0, 10) === today());
  const monthOrders = orders.filter((order: any) => new Date(order.createdAt ?? Date.now()).toISOString().slice(0, 7) === today().slice(0, 7));
  const totalToday = dashboard.totalSoldToday ?? todayOrders.reduce((sum: number, order: any) => sum + order.items.reduce((s: number, item: any) => s + item.totalCents, 0) + order.deliveryFeeCents, 0);
  const totalMonth = monthOrders.reduce((sum: number, order: any) => sum + order.items.reduce((s: number, item: any) => s + item.totalCents, 0) + order.deliveryFeeCents, 0);
  const byType = (dashboard.salesByType ?? []).map((item: any, index: number) => ({ label: item.type, value: item.amountCents, color: ["#ef4444", "#2563eb", "#22c55e", "#f59e0b"][index % 4] }));
  const hourRows = (dashboard.salesByHour ?? []).filter((_: any, index: number) => index % 2 === 0).map((item: any) => ({ label: item.hour, value: item.amountCents, color: "#8b5cf6" }));
  const metricCards = [
    ["Faturamento hoje", money(totalToday), "#ef4444"], ["Faturamento mês", money(totalMonth), "#2563eb"], ["Pedidos hoje", String(todayOrders.length), "#22c55e"], ["Delivery hoje", String(todayOrders.filter((o: any) => o.type === "DELIVERY" || o.type === "ONLINE").length), "#f59e0b"], ["Ticket médio", money(todayOrders.length ? Math.round(totalToday / todayOrders.length) : 0), "#8b5cf6"], ["Fluxo caixa", money((dashboard.totalSoldToday ?? 0) - (dashboard.overduePayables ?? 0)), "#0891b2"]
  ];
  return <div className="admin-shell"><section className="admin-hero"><div><span>Dashboard Executivo</span><h2>Visão completa da lanchonete</h2><p>Vendas, delivery, caixa, produtos e alertas em tempo real.</p></div><button onClick={() => location.reload()}><TrendingUp size={16} /> Atualizar</button></section><section className="admin-kpis">{metricCards.map(([label, value, color]) => <article key={label} style={{ borderTopColor: color }}><span>{label}</span><strong>{value}</strong></article>)}</section><section className="admin-analytics-grid"><div className="admin-card"><h3>Vendas por tipo</h3><DonutChart rows={byType.length ? byType : [{ label: "Sem vendas", value: 1, color: "#cbd5e1" }]} money={money} /></div><div className="admin-card"><h3>Horários de pico</h3><BarList rows={hourRows} money={money} /></div><div className="admin-card"><h3>Produtos mais vendidos</h3><BarList rows={(dashboard.topProducts ?? []).map((item: any) => ({ label: item.name, value: item.quantity, color: "#22c55e" }))} /></div><div className="admin-card"><h3>Alertas executivos</h3><div className="admin-alerts"><span>Contas vencidas <b>{money(dashboard.overduePayables ?? 0)}</b></span><span>A receber <b>{money(dashboard.receivablesOpen ?? 0)}</b></span><span>Mesas ocupadas <b>{dashboard.occupiedTables ?? 0}</b></span><span>Entregas ativas <b>{dashboard.deliveryActive ?? 0}</b></span></div></div></section></div>;
}

export function CashPro({ data, money, mutate }: { data: AppData | null; money: MoneyFn; mutate: (path: string, options?: RequestInit) => Promise<void> }) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [opening, setOpening] = useState("0");
  const [closing, setClosing] = useState("0");
  const movements = data?.cash?.movements ?? [];
  const entries = movements.filter((item: any) => ["ENTRADA", "PAGAMENTO", "REFORCO"].includes(item.type)).reduce((sum: number, item: any) => sum + item.amountCents, 0);
  const exits = movements.filter((item: any) => ["SAIDA", "SANGRIA"].includes(item.type)).reduce((sum: number, item: any) => sum + item.amountCents, 0);
  return <div className="admin-shell"><section className="admin-hero cash"><div><span>Caixa profissional</span><h2>Controle operacional do caixa</h2><p>Abertura, fechamento, sangrias, reforços, filtros e conciliação.</p></div><div className="admin-filter-inline"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></section><section className="admin-kpis"><article><span>Abertura</span><strong>{money(data?.cash?.openingAmountCents ?? 0)}</strong></article><article><span>Entradas</span><strong>{money(entries)}</strong></article><article><span>Saídas</span><strong>{money(exits)}</strong></article><article><span>Saldo previsto</span><strong>{money((data?.cash?.openingAmountCents ?? 0) + entries - exits)}</strong></article></section><section className="admin-analytics-grid two"><div className="admin-card"><h3>Abertura e fechamento</h3><div className="admin-form-grid"><label>Abertura<input value={opening} onChange={(e) => setOpening(e.target.value)} /></label><label>Fechamento<input value={closing} onChange={(e) => setClosing(e.target.value)} /></label><button onClick={() => mutate("/api/cash/open", { method: "POST", body: JSON.stringify({ openingAmountCents: Math.round(Number(opening.replace(",", ".")) * 100) }) })}>Abrir caixa</button><button className="ghost" onClick={() => mutate("/api/cash/close", { method: "POST", body: JSON.stringify({ closingAmountCents: Math.round(Number(closing.replace(",", ".")) * 100) }) })}>Fechar caixa</button></div></div><div className="admin-card"><h3>Entradas x saídas</h3><DonutChart rows={[{ label: "Entradas", value: entries || 1, color: "#22c55e" }, { label: "Saídas", value: exits || 1, color: "#ef4444" }]} money={money} /></div></section><section className="admin-card"><h3>Livro caixa</h3><ReportTable rows={movements.map((item: any) => ({ tipo: item.type, descricao: item.description, valor: item.amountCents, data: new Date(item.createdAt).toLocaleString("pt-BR") }))} money={money} /></section></div>;
}

export function FinancePro({ money }: { money: MoneyFn }) {
  const [tab, setTab] = useState<"payables" | "receivables" | "plan">("payables");
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState({ description: "", name: "", category: "Operacional", amount: "0", dueDate: today(), paymentMethod: "" });
  async function load() { setRows(await api(`/api/finance/${tab === "receivables" ? "receivables" : "payables"}`)); }
  useEffect(() => { if (tab !== "plan") void load(); }, [tab]);
  async function save() { await api(`/api/finance/${tab}`, { method: "POST", body: JSON.stringify({ supplierName: draft.name, customerName: draft.name, description: draft.description, category: draft.category, amountCents: Math.round(Number(draft.amount.replace(",", ".")) * 100), dueDate: draft.dueDate, paymentMethod: draft.paymentMethod }) }); await load(); }
  const open = rows.filter((item) => item.status === "ABERTO").reduce((sum, item) => sum + item.amountCents, 0);
  const overdue = rows.filter((item) => item.status === "VENCIDO" || new Date(item.dueDate) < new Date()).reduce((sum, item) => sum + item.amountCents, 0);
  return <div className="admin-shell"><section className="admin-hero finance"><div><span>Financeiro</span><h2>Contas, plano e fluxo</h2><p>Separe pagar, receber, fiado, despesas e plano de contas.</p></div></section><div className="admin-tabs"><button className={tab === "payables" ? "active" : ""} onClick={() => setTab("payables")}>Contas a pagar</button><button className={tab === "receivables" ? "active" : ""} onClick={() => setTab("receivables")}>Contas a receber</button><button className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")}>Plano de contas</button></div>{tab === "plan" ? <section className="admin-card"><h3>Plano de contas sugerido</h3><div className="admin-plan-grid">{["Insumos", "Bebidas", "Salários", "Motoboy", "Aluguel", "Energia", "Marketing", "Manutenção", "Impostos", "Fiado/Clientes"].map((item) => <span key={item}>{item}</span>)}</div></section> : <><section className="admin-kpis"><article><span>Em aberto</span><strong>{money(open)}</strong></article><article><span>Vencidas</span><strong>{money(overdue)}</strong></article><article><span>Quantidade</span><strong>{rows.length}</strong></article></section><section className="admin-analytics-grid two"><div className="admin-card"><h3>Novo lançamento</h3><div className="admin-form-grid"><label>{tab === "payables" ? "Fornecedor" : "Cliente"}<input value={draft.name} onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))} /></label><label>Descrição<input value={draft.description} onChange={(e) => setDraft((s) => ({ ...s, description: e.target.value }))} /></label><label>Plano de conta<input value={draft.category} onChange={(e) => setDraft((s) => ({ ...s, category: e.target.value }))} /></label><label>Valor<input value={draft.amount} onChange={(e) => setDraft((s) => ({ ...s, amount: e.target.value }))} /></label><label>Vencimento<input type="date" value={draft.dueDate} onChange={(e) => setDraft((s) => ({ ...s, dueDate: e.target.value }))} /></label><button onClick={save}><Plus size={16} /> Lançar</button></div></div><div className="admin-card"><h3>Resumo por status</h3><DonutChart rows={[{ label: "Aberto", value: open || 1, color: "#f59e0b" }, { label: "Vencido", value: overdue || 1, color: "#ef4444" }]} money={money} /></div></section><section className="admin-card"><h3>{tab === "payables" ? "Contas a pagar" : "Contas a receber"}</h3><ReportTable rows={rows.map((item) => ({ nome: item.supplierName ?? item.customerName ?? "", descricao: item.description, categoria: item.category ?? "", valor: item.amountCents, vencimento: new Date(item.dueDate).toLocaleDateString("pt-BR"), status: item.status }))} money={money} /></section></>}</div>;
}

export function ReportsPro({ data, money }: { data: AppData | null; money: MoneyFn }) {
  const [filters, setFilters] = useState<Filters>({ from: monthStart(), to: today(), fromHour: "", toHour: "", userId: "", waiterId: "", driverName: "", customerId: "", neighborhoodId: "", paymentMethod: "" });
  const [report, setReport] = useState("sales_by_period");
  const [rows, setRows] = useState<any[]>([]);
  const reportLabel = reportDisplayLabel(report);
  async function load() { setRows(await api(`/api/reports/${report}?${query(filters)}`)); }
  useEffect(() => { void load(); }, [report]);
  function setFilter(key: keyof Filters, value: string) { setFilters((state) => ({ ...state, [key]: value })); }
  async function download(format: string) {
    const token = localStorage.getItem("taberna-token");
    const response = await fetch(`${API_URL}/api/reports/${report}?${query(filters, format)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error("Falha ao exportar relatorio");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report}.${format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv"}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <div className="admin-shell"><section className="admin-hero reports"><div><span>Relatórios gerenciais</span><h2>Gestão completa por filtros</h2><p>Vendas, produtos, delivery, equipe, caixa, financeiro e estoque.</p></div><div className="admin-report-current"><span>Relatório selecionado</span><strong>{reportLabel}</strong></div><button onClick={load}><Search size={16} /> Visualizar</button></section><section className="admin-report-filters"><label>Data inicial<input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} /></label><label>Data final<input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} /></label><label>Hora inicial<input type="number" min="0" max="23" value={filters.fromHour} onChange={(e) => setFilter("fromHour", e.target.value)} /></label><label>Hora final<input type="number" min="0" max="23" value={filters.toHour} onChange={(e) => setFilter("toHour", e.target.value)} /></label><label>Cliente<select value={filters.customerId} onChange={(e) => setFilter("customerId", e.target.value)}><option value="">Todos</option>{data?.customers?.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Bairro<select value={filters.neighborhoodId} onChange={(e) => setFilter("neighborhoodId", e.target.value)}><option value="">Todos</option>{data?.neighborhoods?.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Pagamento<select value={filters.paymentMethod} onChange={(e) => setFilter("paymentMethod", e.target.value)}><option value="">Todos</option>{data?.paymentMethods?.map((item: any) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label>Entregador<input value={filters.driverName} onChange={(e) => setFilter("driverName", e.target.value)} /></label></section><section className="admin-reports-layout"><aside className="admin-report-menu">{reportGroups.map((group) => <div key={group.title}><strong>{group.title}</strong>{group.items.map(([key, label]) => <button key={key} className={report === key ? "active" : ""} onClick={() => setReport(key)}>{label}</button>)}</div>)}</aside><main className="admin-card"><div className="admin-report-head"><div><span>Relatório</span><h3>{report.replace(/_/g, " ")}</h3></div><div><button className="ghost" onClick={() => download("csv")}><FileText size={15} /> CSV</button><button className="ghost" onClick={() => download("xlsx")}><FileSpreadsheet size={15} /> Excel</button><button className="ghost" onClick={() => download("pdf")}><Download size={15} /> PDF</button><button className="ghost" onClick={() => window.print()}><Printer size={15} /> Imprimir</button></div></div><ReportTable rows={rows} money={money} /></main></section></div>;
}
