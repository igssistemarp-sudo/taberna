import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Calculator,
  CalendarClock,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  Cog,
  CreditCard,
  Edit3,
  FileDown,
  FileText,
  Fingerprint,
  Hammer,
  LayoutDashboard,
  LogIn,
  MapPin,
  Package2,
  Phone,
  Printer,
  Settings,
  ShoppingCart,
  Table,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  Wallet
} from "lucide-react";
import "./styles.css";
import CadastroView from "./CadastroView";
import ComandasModule from "./ComandasModule";
import ProductsModule from "./ProductsModule";
import TablesModule from "./TablesModule";
import CustomerModule from "./CustomerModule";
import DeliveryModule from "./DeliveryModule";
import { CashPro, ExecutiveDashboard, FinancePro, ReportsPro } from "./AdminModules";

const API_URL = import.meta.env.VITE_API_URL ?? (window.location.port === "5173" ? "http://localhost:3333" : window.location.origin);
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type User = { id: string; name: string; login: string; role: string };
type SystemUserRecord = { id: string; name: string; login: string; role: string; active: boolean; notes?: string | null };
type Company = { id: string; razaoSocial: string; nomeFantasia: string; onlineMenuSlug: string; serviceFeeEnabled: boolean; serviceFeePercent: number; printerKitchenIp?: string | null; printerBarIp?: string | null; printerCashIp?: string | null; printerPort: number; openingHours?: string | null; logoUrl?: string | null; theme?: string | null };
type Table = { id: string; name: string; status: string; waiterName?: string | null; customerName?: string | null; active: boolean };
type Customer = { id: string; name: string; phone?: string | null; whatsapp?: string | null; neighborhoodId?: string | null; neighborhood?: { id: string; name: string; city: string; deliveryFeeCents: number } | null };
type Neighborhood = { id: string; name: string; city: string; deliveryFeeCents: number; avgDeliveryMinutes: number; active: boolean };
type Category = { id: string; name: string; active: boolean };
type Product = { id: string; code: number; name: string; salePriceCents: number; costCents: number; stockCurrent: number; controlStock: boolean; onlineMenu: boolean; printTarget: string; lowStockThreshold: number; active: boolean; categoryId?: string | null; category?: Category | null };
type Addition = { id: string; name: string; valueCents: number; charge: boolean; category?: string | null; active: boolean };
type PaymentMethod = { id: string; name: string; allowFee: boolean; active: boolean };
type Supplier = { id: string; name: string; tradeName?: string | null; typePerson?: string | null; status?: string | null; document?: string | null; ie?: string | null; im?: string | null; activity?: string | null; phone?: string | null; phone2?: string | null; whatsapp?: string | null; email?: string | null; financeEmail?: string | null; site?: string | null; instagram?: string | null; facebook?: string | null; sellerName?: string | null; sellerPhone?: string | null; sellerWhatsapp?: string | null; sellerEmail?: string | null; cep?: string | null; street?: string | null; number?: string | null; complement?: string | null; district?: string | null; city?: string | null; state?: string | null; reference?: string | null; paymentTerm?: string | null; creditLimitCents?: number; minimumOrderCents?: number; visitDay?: string | null; deliveryFrequency?: string | null; bankName?: string | null; agency?: string | null; account?: string | null; pixKey?: string | null; pixType?: string | null; holderName?: string | null; classification?: string | null; notes?: string | null; active: boolean; payables?: Array<{ id: string; amountCents: number; dueDate: string; paidAt?: string | null; status: string; paymentMethod?: string | null; description: string; createdAt: string }> };
type Printer = { id: string; name: string; type: string; ip: string; port: number; active: boolean; lastTestAt?: string | null };
type Cash = { id: string; openingAmountCents: number; closedAt?: string | null; differenceCents?: number | null; movements: Array<{ id: string; type: string; description: string; amountCents: number; createdAt: string }> } | null;
type Order = { id: string; number: number; type: string; status: string; deliveryFeeCents: number; customerNameSnapshot?: string | null; waiterNameSnapshot?: string | null; table?: Table | null; neighborhood?: Neighborhood | null; items: Array<{ id: string; nameSnapshot: string; quantity: number; unitPriceCents: number; totalCents: number; printTarget: string; note?: string | null; additives: Array<{ id: string; nameSnapshot: string; quantity: number; unitPriceCents: number; totalCents: number }> }>; payments: Array<{ id: string; methodNameSnapshot: string; amountCents: number }> };

type Dashboard = {
  totalSoldToday: number;
  pendingOrders: number;
  occupiedTables: number;
  deliveryActive: number;
  overduePayables: number;
  receivablesOpen: number;
  lowStock: Array<{ id: string; name: string; stockCurrent: number; lowStockThreshold: number }>;
  topProducts: Array<{ name: string; quantity: number }>;
  salesByDay: Array<{ day: string; amountCents: number }>;
  paymentSummary: Array<{ name: string; amountCents: number }>;
};

type AppData = {
  user: User;
  company: Company | null;
  dashboard: Dashboard | null;
  tables: Table[];
  customers: Customer[];
  neighborhoods: Neighborhood[];
  categories: Category[];
  products: Product[];
  additions: Addition[];
  paymentMethods: PaymentMethod[];
  suppliers: Supplier[];
  users: SystemUserRecord[];
  printers: Printer[];
  orders: Order[];
  cash: Cash;
};

type ItemDraft = { productId: string; quantity: number; note: string; additiveIds: string[] };

const emptyDraft = (): ItemDraft => ({ productId: "", quantity: 1, note: "", additiveIds: [] });

async function request(path: string, options: RequestInit = {}, token?: string | null) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message ?? "Erro na requisição");
  return data;
}

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("taberna-token"));
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicCompany, setPublicCompany] = useState<Company | null>(null);
  const [page, setPage] = useState<"dashboard" | "products" | "delivery" | "comandas" | "tables" | "customers" | "caixa" | "financeiro" | "reports" | "cadastro" | "config">("dashboard");
  const [data, setData] = useState<AppData | null>(null);
  const [orderDrafts, setOrderDrafts] = useState<ItemDraft[]>([emptyDraft()]);
  const [orderType, setOrderType] = useState("MESA");
  const [orderTableId, setOrderTableId] = useState("");
  const [orderCustomerId, setOrderCustomerId] = useState("");
  const [orderCustomer, setOrderCustomer] = useState<any>(null);
  const [orderNeighborhoodId, setOrderNeighborhoodId] = useState("");
  const [orderWaiter, setOrderWaiter] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("0");
  const [companyDraft, setCompanyDraft] = useState({ razaoSocial: "", nomeFantasia: "", logoUrl: "", onlineMenuSlug: "igs-lanchonete-pro", serviceFeeEnabled: false, serviceFeePercent: 0, openingHours: "", printerKitchenIp: "", printerBarIp: "", printerCashIp: "", printerPort: 9100, theme: "dark" });
  const [customerDraft, setCustomerDraft] = useState({ name: "", phone: "", whatsapp: "", neighborhoodId: "", street: "", number: "", city: "", state: "", notes: "" });
  const [neighborhoodDraft, setNeighborhoodDraft] = useState({ name: "", city: "", deliveryFeeCents: 0, avgDeliveryMinutes: 30, active: true });

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [me, dashboard, company, tables, customers, neighborhoods, categories, products, additions, paymentMethods, suppliers, users, printers, orders, cash] = await Promise.all([
        request("/api/auth/me", {}, token),
        request("/api/dashboard", {}, token),
        request("/api/company", {}, token),
        request("/api/tables", {}, token),
        request("/api/customers", {}, token),
        request("/api/neighborhoods", {}, token),
        request("/api/categories", {}, token),
        request("/api/products", {}, token),
        request("/api/additions", {}, token),
        request("/api/payment-methods", {}, token),
        request("/api/suppliers", {}, token),
        request("/api/users", {}, token),
        request("/api/printers", {}, token),
        request("/api/orders", {}, token),
        request("/api/cash/current", {}, token)
      ]);
      setData({ user: me, dashboard, company, tables, customers, neighborhoods, categories, products, additions, paymentMethods, suppliers, users, printers, orders, cash });
      if (company) {
        setCompanyDraft({
          razaoSocial: company.razaoSocial ?? "",
          nomeFantasia: company.nomeFantasia ?? "",
          logoUrl: company.logoUrl ?? "",
          onlineMenuSlug: company.onlineMenuSlug ?? "igs-lanchonete-pro",
          serviceFeeEnabled: company.serviceFeeEnabled,
          serviceFeePercent: company.serviceFeePercent,
          openingHours: company.openingHours ?? "",
          printerKitchenIp: company.printerKitchenIp ?? "",
          printerBarIp: company.printerBarIp ?? "",
          printerCashIp: company.printerCashIp ?? "",
          printerPort: company.printerPort ?? 9100,
          theme: company.theme ?? "dark"
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void load();
  }, [token]);

  useEffect(() => {
    if (token) return;
    void request("/api/company")
      .then((company) => setPublicCompany(company))
      .catch(() => setPublicCompany(null));
  }, [token]);

  async function doLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ login, password }) });
      localStorage.setItem("taberna-token", result.token);
      setToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("taberna-token");
    setToken(null);
    setData(null);
  }

  async function mutate(path: string, options: RequestInit = {}) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await request(path, options, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => ({
    subtotal: orderDrafts.reduce((sum, draft) => {
      const product = data?.products.find((item) => item.id === draft.productId);
      const extras = draft.additiveIds.reduce((acc, id) => acc + (data?.additions.find((item) => item.id === id)?.valueCents ?? 0), 0);
      return sum + ((product?.salePriceCents ?? 0) * draft.quantity) + extras;
    }, 0),
    fees: orderType === "DELIVERY" ? (data?.neighborhoods.find((item) => item.id === orderNeighborhoodId)?.deliveryFeeCents ?? 0) : 0
  }), [data, orderDrafts, orderType, orderNeighborhoodId]);

  async function createOrder() {
    if (!token || !data) return;
    const items = orderDrafts.filter((draft) => draft.productId).map((draft) => {
      const product = data.products.find((item) => item.id === draft.productId)!;
      return {
        productId: product.id,
        name: product.name,
        quantity: Number(draft.quantity),
        unitPriceCents: product.salePriceCents,
        printTarget: product.printTarget,
        note: draft.note,
        additives: draft.additiveIds.map((id) => {
          const addition = data.additions.find((item) => item.id === id)!;
          return { additionalId: addition.id, name: addition.name, quantity: 1, unitPriceCents: addition.valueCents, charge: addition.charge };
        })
      };
    });
    if (!items.length) return setError("Adicione pelo menos um item.");
    await mutate("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        type: orderType,
        tableId: orderTableId || null,
        customerId: orderCustomerId || null,
        neighborhoodId: orderNeighborhoodId || null,
        waiterNameSnapshot: orderWaiter || null,
        notes: orderNotes || null,
        items,
        payments: []
      })
    });
    setOrderDrafts([emptyDraft()]);
  }

  if (!token) {
    const loginCompany = publicCompany;
    const logoText = (loginCompany?.nomeFantasia ?? "TB")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "TB";

    return (
      <div className="login-shell">
        <div className="login-grid">
          <section className="login-hero" style={{ backgroundImage: `url(https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900&q=80)` }}>
            <div className="login-hero-overlay" />
            <div className="login-hero-top">
              <img className="login-company-logo" src={loginCompany?.logoUrl || "/logo.png"} alt={loginCompany?.nomeFantasia ?? "Logo"} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; document.getElementById("login-fallback-mark")!.style.display = "grid"; }} />
              <div className="login-company-mark" id="login-fallback-mark" style={{ display: "none" }}>{logoText}</div>
              <div className="login-hero-copy">
                <span className="login-kicker">Sistema para lanchonete, bar e delivery</span>
                <h1>{loginCompany?.nomeFantasia ?? "IGS Lanchonete PRO"}</h1>
                <p>{loginCompany?.razaoSocial ?? "Taberna Comida e Bebida"}</p>
              </div>
            </div>

            <div className="login-hero-panel">
              <div>
                <strong>🔥 Operação completa</strong>
                <span>PDV, mesas, comandas, delivery, caixa e muito mais em uma única plataforma.</span>
              </div>
              <div className="login-hero-metrics">
                <span>🚀 Delivery</span>
                <span>👨‍🍳 Cozinha</span>
                <span>💰 Caixa</span>
                <span>📊 Relatórios</span>
              </div>
            </div>
          </section>

          <form className="login-card login-form-card" onSubmit={doLogin}>
            <div className="login-form-head">
              <span className="login-form-tag">Acesso ao sistema</span>
              <h2>Entrar</h2>
              <p>Use seu usuário e senha para acessar o caixa e a operação.</p>
            </div>

            <label>Usuário<input value={login} onChange={(e) => setLogin(e.target.value)} /></label>
            <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>

            {error && <div className="alert">{error}</div>}

            <button disabled={loading}><LogIn size={16} /> Entrar</button>
            <small className="login-hint">Padrão local: admin / 123</small>
          </form>
        </div>
      </div>
    );
  }

  const nav = [
    ["dashboard", "Painel", LayoutDashboard],
    ["products", "Produtos", Package2],
    ["delivery", "Delivery", ShoppingCart],
    ["comandas", "Comandas", ClipboardList],
    ["tables", "Mesas", Table],
    ["customers", "Clientes", UserRound],
    ["caixa", "Caixa", Wallet],
    ["financeiro", "Financeiro", TrendingUp],
    ["reports", "Relatórios", FileText],
    ["cadastro", "Cadastro", Settings],
    ["config", "Configuração", Cog]
  ] as const;

  const pageTitles: Record<typeof page, string> = {
    dashboard: "Visão Geral",
    products: "Produtos",
    delivery: "Delivery",
    comandas: "Comandas",
    tables: "Mesas",
    customers: "Clientes",
    caixa: "Caixa",
    financeiro: "Financeiro",
    reports: "Relatórios",
    cadastro: "Cadastro",
    config: "Configuração"
  };

  useEffect(() => {
    document.title = `IGS Lanchonete PRO - ${pageTitles[page]}`;
  }, [page]);

  return <div className="app-shell">{error && <div className="toast">{error}</div>}<aside className="sidebar"><div className="brand"><div className="logo-mark small">TB</div><div><strong>IGS Lanchonete PRO</strong><span>{data?.user.name} - {data?.user.role}</span></div></div><nav>{nav.map(([key, label, Icon]) => <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)}><span className="sidebar-nav-icon"><Icon size={16} /></span> {label}</button>)}</nav><button className="ghost" onClick={logout}>Sair</button></aside><main className="content">{loading && <div className="loading-bar" />}<header className="topbar"><div><span>IGS Lanchonete PRO</span><h1>{pageTitles[page]}</h1></div><div className="topbar-actions"><button className="ghost" onClick={load}><Bell size={16} /> Atualizar</button><button onClick={() => setPage("delivery")}><ClipboardList size={16} /> Novo pedido</button></div></header>{page === "dashboard" && <ExecutiveDashboard data={data} money={money} />}{page === "products" && <section className="stack"><ProductsModule data={data ? { products: data.products as any, categories: data.categories as any } : null} mutate={mutate} money={money} /></section>}{page === "delivery" && <DeliveryModule data={data ? { products: data.products as any, additions: data.additions as any, neighborhoods: data.neighborhoods as any, orders: data.orders as any, paymentMethods: data.paymentMethods as any, users: data.users as any } : null} money={money} mutate={mutate} reload={load} />}{page === "comandas" && <section className="stack"><ComandasModule data={data ? { tables: data.tables as any, products: data.products as any, additions: data.additions as any, customers: data.customers as any, paymentMethods: data.paymentMethods as any, orders: data.orders as any, company: data.company, user: data.user, users: data.users as any } : null} money={money} mutate={mutate} /></section>}{page === "tables" && <TablesModule data={data ? { tables: data.tables as any, products: data.products as any, additions: data.additions as any, customers: data.customers as any, paymentMethods: data.paymentMethods as any, orders: data.orders as any, company: data.company, user: data.user, users: data.users as any } : null} money={money} mutate={mutate} />}{page === "customers" && <section className="stack"><CustomerModule /></section>}{page === "caixa" && <CashPro data={data} money={money} mutate={mutate} />}{page === "financeiro" && <FinancePro money={money} />}{page === "reports" && <ReportsPro data={data} money={money} />}{page === "cadastro" && <CadastroView data={data} money={money} mutate={mutate} />}{page === "config" && <SettingsView data={data} money={money} companyDraft={companyDraft} setCompanyDraft={setCompanyDraft} mutate={mutate} />}</main></div>;
}

function DashboardView({ data, money, mutate }: { data: AppData | null; money: (value: number) => string; mutate: (path: string, options?: RequestInit) => Promise<void>; }) {
  const dashboard = data?.dashboard;
  const metrics = [
    { label: "Total vendido hoje", value: money(dashboard?.totalSoldToday ?? 0), Icon: CircleDollarSign },
    { label: "Pedidos abertos", value: String(dashboard?.pendingOrders ?? 0), Icon: ClipboardList },
    { label: "Mesas ocupadas", value: String(dashboard?.occupiedTables ?? 0), Icon: Table },
    { label: "Entregas em andamento", value: String(dashboard?.deliveryActive ?? 0), Icon: Truck },
    { label: "Contas vencidas", value: money(dashboard?.overduePayables ?? 0), Icon: Hammer },
    { label: "A receber", value: money(dashboard?.receivablesOpen ?? 0), Icon: Calculator }
  ];

  return (
    <div className="stack">
      <section className="cards">
        {metrics.map((metric) => (
          <article className="card metric" key={metric.label}>
            <metric.Icon size={18} />
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel-grid">
        <div className="panel">
          <h3>Produtos mais vendidos</h3>
          {dashboard?.topProducts.map((item) => (
            <div className="bar-row" key={item.name}>
              <span>{item.name}</span>
              <div>
                <i style={{ width: `${Math.min(100, item.quantity * 12)}%` }} />
                <b>{item.quantity}</b>
              </div>
            </div>
          )) ?? null}
        </div>
        <div className="panel">
          <h3>Vendas por dia</h3>
          {dashboard?.salesByDay.map((item) => (
            <div className="bar-row" key={item.day}>
              <span>{item.day}</span>
              <div>
                <i className="accent" style={{ width: `${Math.min(100, item.amountCents / 1000)}%` }} />
                <b>{money(item.amountCents)}</b>
              </div>
            </div>
          )) ?? null}
        </div>
      </section>
    </div>
  );
}

function CustomersView({ data, mutate, customerDraft, setCustomerDraft, neighborhoodDraft, setNeighborhoodDraft }: { data: AppData | null; mutate: (path: string, options?: RequestInit) => Promise<void>; customerDraft: { name: string; phone: string; whatsapp: string; neighborhoodId: string; street: string; number: string; city: string; state: string; notes: string }; setCustomerDraft: React.Dispatch<React.SetStateAction<{ name: string; phone: string; whatsapp: string; neighborhoodId: string; street: string; number: string; city: string; state: string; notes: string }>>; neighborhoodDraft: { name: string; city: string; deliveryFeeCents: number; avgDeliveryMinutes: number; active: boolean }; setNeighborhoodDraft: React.Dispatch<React.SetStateAction<{ name: string; city: string; deliveryFeeCents: number; avgDeliveryMinutes: number; active: boolean }>>; }) {
  return <div className="panel-grid"><section className="panel"><h3>Novo cliente</h3><div className="grid-2"><label>Nome<input value={customerDraft.name} onChange={(e) => setCustomerDraft((state) => ({ ...state, name: e.target.value }))} /></label><label>Telefone<input value={customerDraft.phone} onChange={(e) => setCustomerDraft((state) => ({ ...state, phone: e.target.value }))} /></label><label>WhatsApp<input value={customerDraft.whatsapp} onChange={(e) => setCustomerDraft((state) => ({ ...state, whatsapp: e.target.value }))} /></label><label>Bairro<select value={customerDraft.neighborhoodId} onChange={(e) => setCustomerDraft((state) => ({ ...state, neighborhoodId: e.target.value }))}><option value="">Sem bairro</option>{data?.neighborhoods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Rua<input value={customerDraft.street} onChange={(e) => setCustomerDraft((state) => ({ ...state, street: e.target.value }))} /></label><label>Número<input value={customerDraft.number} onChange={(e) => setCustomerDraft((state) => ({ ...state, number: e.target.value }))} /></label><label>Cidade<input value={customerDraft.city} onChange={(e) => setCustomerDraft((state) => ({ ...state, city: e.target.value }))} /></label><label>UF<input value={customerDraft.state} onChange={(e) => setCustomerDraft((state) => ({ ...state, state: e.target.value }))} /></label></div><label>Observações<textarea rows={3} value={customerDraft.notes} onChange={(e) => setCustomerDraft((state) => ({ ...state, notes: e.target.value }))} /></label><button onClick={() => mutate("/api/customers", { method: "POST", body: JSON.stringify(customerDraft) })}>Salvar cliente</button></section><section className="panel"><h3>Bairros e taxa de entrega</h3><div className="grid-2"><label>Nome<input value={neighborhoodDraft.name} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, name: e.target.value }))} /></label><label>Cidade<input value={neighborhoodDraft.city} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, city: e.target.value }))} /></label><label>Taxa<input type="number" value={neighborhoodDraft.deliveryFeeCents} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, deliveryFeeCents: Number(e.target.value) }))} /></label><label>Tempo medio<input type="number" value={neighborhoodDraft.avgDeliveryMinutes} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, avgDeliveryMinutes: Number(e.target.value) }))} /></label></div><button onClick={() => mutate("/api/neighborhoods", { method: "POST", body: JSON.stringify(neighborhoodDraft) })}>Salvar bairro</button></section><section className="panel"><h3>Clientes cadastrados</h3><div className="table-list">{data?.customers.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.phone}</span><span>{item.neighborhood?.name ?? "-"}</span></div>)}</div></section></div>;
}

function FinanceiroView({ data, money }: { data: AppData | null; money: (value: number) => string }) {
  return <section className="panel"><h3>Financeiro</h3><div className="summary-grid"><div className="summary-card"><span>Contas a pagar</span><strong>{money(data?.dashboard?.overduePayables ?? 0)}</strong></div><div className="summary-card"><span>A receber</span><strong>{money(data?.dashboard?.receivablesOpen ?? 0)}</strong></div><div className="summary-card"><span>Vendido hoje</span><strong>{money(data?.dashboard?.totalSoldToday ?? 0)}</strong></div></div></section>;
}

function FinanceView({ data, money, mutate, openingCash, setOpeningCash, closingCash, setClosingCash }: { data: AppData | null; money: (value: number) => string; mutate: (path: string, options?: RequestInit) => Promise<void>; openingCash: string; setOpeningCash: React.Dispatch<React.SetStateAction<string>>; closingCash: string; setClosingCash: React.Dispatch<React.SetStateAction<string>>; }) {
  return <div className="panel-grid"><section className="panel"><h3>Caixa</h3><div className="grid-2"><label>Abertura<input type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} /></label><label>Fechamento<input type="number" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} /></label></div><div className="row-actions"><button onClick={() => mutate("/api/cash/open", { method: "POST", body: JSON.stringify({ openingAmountCents: Number(openingCash) }) })}>Abrir caixa</button><button className="ghost" onClick={() => mutate("/api/cash/close", { method: "POST", body: JSON.stringify({ closingAmountCents: Number(closingCash) }) })}>Fechar caixa</button></div>{data?.cash && <div className="summary-grid"><div className="summary-card"><span>Abertura</span><strong>{money(data.cash.openingAmountCents)}</strong></div><div className="summary-card"><span>Diferenca</span><strong>{money(data.cash.differenceCents ?? 0)}</strong></div></div>}</section><section className="panel"><h3>Movimentos</h3><div className="table-list">{data?.cash?.movements.map((item) => <div className="list-row" key={item.id}><strong>{item.type}</strong><span>{item.description}</span><span>{money(item.amountCents)}</span><span>{new Date(item.createdAt).toLocaleString("pt-BR")}</span></div>)}</div></section></div>;
}

async function downloadReport(token: string, report: string, format: string) {
  const response = await fetch(`${API_URL}/api/reports/${report}?format=${format}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Falha ao exportar relatorio");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${report}.${format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv"}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ReportsView({ token }: { token: string | null }) {
  const reports = [
    ["sales_by_day", "Vendas por dia"],
    ["sales_by_product", "Vendas por produto"],
    ["sales_by_category", "Vendas por categoria"],
    ["sales_by_waiter", "Vendas por garçom"],
    ["sales_by_payment", "Vendas por pagamento"],
    ["delivery_by_neighborhood", "Entregas por bairro"],
    ["delivery_fees", "Taxas de entrega"],
    ["top_products", "Produtos mais vendidos"],
    ["top_additions", "Adicionais mais vendidos"],
    ["cancelled_orders", "Pedidos cancelados"],
    ["cancelled_items", "Itens cancelados"],
    ["profit", "Lucro"],
    ["payables", "Contas a pagar"],
    ["receivables", "Contas a receber"],
    ["cashbook", "Livro caixa"],
    ["cash_closing", "Fechamento de caixa"],
    ["financial_overall", "Resumo financeiro"]
  ] as const;
  return <section className="panel"><h3>Relatórios</h3><div className="report-grid">{reports.map(([report, label]) => <article className="report-card" key={report}><strong>{label}</strong><div className="row-actions wrap"><button className="ghost" disabled={!token} onClick={() => token && void downloadReport(token, report, "csv")}>CSV</button><button className="ghost" disabled={!token} onClick={() => token && void downloadReport(token, report, "xlsx")}>Planilha</button><button className="ghost" disabled={!token} onClick={() => token && void downloadReport(token, report, "pdf")}>PDF</button></div></article>)}</div></section>;
}

function SettingsView({ data, money, companyDraft, setCompanyDraft, mutate }: { data: AppData | null; money: (value: number) => string; companyDraft: { razaoSocial: string; nomeFantasia: string; logoUrl: string; onlineMenuSlug: string; serviceFeeEnabled: boolean; serviceFeePercent: number; openingHours: string; printerKitchenIp: string; printerBarIp: string; printerCashIp: string; printerPort: number; theme: string }; setCompanyDraft: React.Dispatch<React.SetStateAction<{ razaoSocial: string; nomeFantasia: string; logoUrl: string; onlineMenuSlug: string; serviceFeeEnabled: boolean; serviceFeePercent: number; openingHours: string; printerKitchenIp: string; printerBarIp: string; printerCashIp: string; printerPort: number; theme: string }>>; mutate: (path: string, options?: RequestInit) => Promise<void>; }) {
  return <div className="panel-grid"><section className="panel"><h3>Empresa</h3><div className="grid-2"><label>Razão social<input value={companyDraft.razaoSocial} onChange={(e) => setCompanyDraft((state) => ({ ...state, razaoSocial: e.target.value }))} /></label><label>Nome fantasia<input value={companyDraft.nomeFantasia} onChange={(e) => setCompanyDraft((state) => ({ ...state, nomeFantasia: e.target.value }))} /></label><label>Logo da empresa<div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>{companyDraft.logoUrl ? <img src={companyDraft.logoUrl} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: "50%", border: "3px solid var(--border)", padding: 2 }} /> : <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--bg-elevated)", border: "2px dashed var(--border)" }} />}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => setCompanyDraft((state) => ({ ...state, logoUrl: ev.target?.result as string })); reader.readAsDataURL(file); } }} /></div></label><label>Link do cardápio<input value={companyDraft.onlineMenuSlug} onChange={(e) => setCompanyDraft((state) => ({ ...state, onlineMenuSlug: e.target.value }))} /></label><label>Horário<input value={companyDraft.openingHours} onChange={(e) => setCompanyDraft((state) => ({ ...state, openingHours: e.target.value }))} /></label><label>IP cozinha<input value={companyDraft.printerKitchenIp} onChange={(e) => setCompanyDraft((state) => ({ ...state, printerKitchenIp: e.target.value }))} /></label><label>IP bar<input value={companyDraft.printerBarIp} onChange={(e) => setCompanyDraft((state) => ({ ...state, printerBarIp: e.target.value }))} /></label><label>IP caixa<input value={companyDraft.printerCashIp} onChange={(e) => setCompanyDraft((state) => ({ ...state, printerCashIp: e.target.value }))} /></label><label>Porta<input type="number" value={companyDraft.printerPort} onChange={(e) => setCompanyDraft((state) => ({ ...state, printerPort: Number(e.target.value) }))} /></label><label>Taxa de serviço<input type="number" value={companyDraft.serviceFeePercent} onChange={(e) => setCompanyDraft((state) => ({ ...state, serviceFeePercent: Number(e.target.value) }))} /></label></div><label><input type="checkbox" checked={companyDraft.serviceFeeEnabled} onChange={(e) => setCompanyDraft((state) => ({ ...state, serviceFeeEnabled: e.target.checked }))} /> Habilitar taxa de serviço</label><button onClick={() => mutate("/api/company", { method: "PUT", body: JSON.stringify(companyDraft) })}>Salvar configurações</button></section><section className="panel"><h3>Impressoras</h3><div className="table-list">{data?.printers.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.type}</span><span>{item.ip}:{item.port}</span><button className="ghost" onClick={() => mutate(`/api/printers/${item.id}/test`, { method: "POST" })}>Testar</button></div>)}</div></section></div>;
}

createRoot(document.getElementById("root")!).render(<App />);
