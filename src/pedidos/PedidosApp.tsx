import React from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  Bell,
  CalendarClock,
  ChevronLeft,
  ChefHat,
  CircleDollarSign,
  Clock3,
  Home,
  LogOut,
  Package2,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  Table,
  Users,
  X
} from "lucide-react";

type MoneyFn = (value: number) => string;

type ServerConfig = { baseUrl: string; serverName: string; mode?: "local" | "web" };
type User = { id: string; name: string; login: string; role: string; active: boolean };
type Company = { id: string; razaoSocial: string; nomeFantasia: string; logoUrl?: string | null; theme?: string | null };
type TableData = { id: string; name: string; status: string; waiterName?: string | null; customerName?: string | null; active: boolean };
type ProductData = { id: string; code: number; name: string; salePriceCents: number; category?: { id: string; name: string } | null; printTarget: string; active: boolean };
type AdditionData = { id: string; name: string; valueCents: number; active: boolean };
type OrderData = { id: string; number: number; status: string; tableId?: string | null; createdAt: string; waiterNameSnapshot?: string | null; customerNameSnapshot?: string | null; items: Array<{ id: string; nameSnapshot: string; quantity: number; unitPriceCents: number; totalCents: number; note?: string | null; cancelledAt?: string | null; additives?: Array<{ id: string; nameSnapshot: string; quantity: number; unitPriceCents: number; totalCents: number }> }> };

type Snapshot = { company: Company | null; user: User; tables: TableData[]; products: ProductData[]; additions: AdditionData[]; orders: OrderData[] };
type DraftItem = { product: ProductData; quantity: number; note: string; showAdditions: boolean; selectedAdditions: Array<AdditionData & { qty: number }> };

const CONFIG_KEY = "taberna-garcom-config";
const TOKEN_KEY = "taberna-garcom-token";
const ALLOWED_ROLES = new Set(["GARCOM", "GERENTE", "ADMIN", "CAIXA"]);

function money(value: number) {
  return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function loadConfig(): ServerConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ServerConfig;
    if (!parsed?.baseUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

function inferMode(baseUrl?: string) {
  if (!baseUrl) return "local" as const;
  if (baseUrl === window.location.origin) return "web" as const;
  return "local" as const;
}

function resolveWebBaseUrl() {
  const isDevFrontend = window.location.port === "5173" || window.location.port === "4173";
  if (window.location.protocol === "https:" && !isDevFrontend) return window.location.origin;
  return `http://${window.location.hostname}:3333`;
}

function normalizeBaseUrl(input: string, port: string) {
  const value = input.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  const host = value.replace(/\/+$/, "");
  return `http://${host}${port ? `:${port}` : ""}`.replace(/\/$/, "");
}

async function api<T>(baseUrl: string, path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {})
      }
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message ?? "Erro");
    return data;
  } catch (error: any) {
    if (error instanceof TypeError || /Failed to fetch/i.test(error?.message ?? "")) {
      if (window.location.protocol === "https:" && /^http:\/\//i.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl)) {
        throw new Error("O navegador bloqueou a conexão com o IP local. Se estiver no Render/Web, use o modo Web. Para usar IP local, abra o app na mesma rede/localmente.");
      }
      throw new Error(`Sem conexão com o servidor em ${baseUrl}. Verifique se a API está no ar e se o endereço está correto.`);
    }
    throw error;
  }
}

async function checkHealth(baseUrl: string, token?: string | null) {
  return api<{ ok: boolean }>(baseUrl, "/api/health", {}, token);
}

function statusColor(status: string) {
  switch (status) {
    case "LIVRE": return "#f59e0b";
    case "OCUPADA": return "#22c55e";
    case "AGUARDANDO_PREPARO": return "#eab308";
    case "PRONTO": return "#3b82f6";
    case "FECHANDO_CONTA": return "#8b5cf6";
    case "AGUARDANDO_PAGAMENTO": return "#0ea5e9";
    default: return "#64748b";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "LIVRE": return "Livre";
    case "OCUPADA": return "Ocupada";
    case "AGUARDANDO_PREPARO": return "Em preparo";
    case "PRONTO": return "Pronto";
    case "FECHANDO_CONTA": return "Pré-conta";
    case "AGUARDANDO_PAGAMENTO": return "Caixa";
    default: return status;
  }
}

function calcTotal(items: OrderData["items"]) {
  return items.reduce((sum, item) => sum + (item.cancelledAt ? 0 : item.totalCents), 0);
}

function hasRole(role: string | undefined, allowed: string[]) {
  return !!role && allowed.includes(role.toUpperCase());
}

export default function PedidosApp({ moneyFn = money }: { moneyFn?: MoneyFn }) {
  const [config, setConfig] = React.useState<ServerConfig | null>(loadConfig());
  const isHostedWeb = window.location.protocol === "https:" && !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const activeConfig = React.useMemo(() => {
    if (!config) return null;
    if (config.mode === "web" || isHostedWeb) return { ...config, baseUrl: resolveWebBaseUrl(), mode: "web" as const };
    return config;
  }, [config, isHostedWeb]);
  const [configDraft, setConfigDraft] = React.useState({ mode: isHostedWeb ? "web" as const : (activeConfig?.mode ?? inferMode(activeConfig?.baseUrl)), serverUrl: activeConfig?.baseUrl ?? "", serverName: activeConfig?.serverName ?? "Servidor Taberna", port: "8000" });
  const [token, setToken] = React.useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = React.useState<User | null>(null);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<"config" | "login" | "home" | "tables" | "comandas" | "detail">(config ? (token ? "home" : "login") : "config");
  const [login, setLogin] = React.useState("admin");
  const [password, setPassword] = React.useState("123");
  const [selectedTable, setSelectedTable] = React.useState<TableData | null>(null);
  const [detailOrders, setDetailOrders] = React.useState<OrderData[]>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedProducts, setSelectedProducts] = React.useState<DraftItem[]>([]);
  const [activeProductIndex, setActiveProductIndex] = React.useState<number | null>(null);
  const [customerDraft, setCustomerDraft] = React.useState("");
  const [showTransferModal, setShowTransferModal] = React.useState(false);
  const [transferTarget, setTransferTarget] = React.useState("");
  const [transferItemIds, setTransferItemIds] = React.useState<string[]>([]);
  const [showMergeModal, setShowMergeModal] = React.useState(false);
  const [mergeSources, setMergeSources] = React.useState<string[]>([]);

  const baseUrl = activeConfig?.baseUrl ?? "";
  const role = user?.role?.toUpperCase();
  const canTransfer = hasRole(role, ["ADMIN", "GERENTE", "CAIXA"]);
  const canJoin = hasRole(role, ["ADMIN", "GERENTE", "CAIXA"]);

  React.useEffect(() => {
    document.title = "IGS Lanchonete PRO - Garcom";
  }, []);

  React.useEffect(() => {
    if (activeConfig) setConfigDraft((current) => ({ ...current, mode: isHostedWeb ? "web" : (activeConfig.mode ?? inferMode(activeConfig.baseUrl)), serverUrl: activeConfig.baseUrl, serverName: activeConfig.serverName }));
  }, [activeConfig, isHostedWeb]);

  React.useEffect(() => {
    if (!activeConfig || !token) return;
    void loadSnapshot();
  }, [activeConfig?.baseUrl, token]);

  async function testConnection() {
    const mode = isHostedWeb ? "web" : configDraft.mode;
    const url = mode === "web" ? resolveWebBaseUrl() : normalizeBaseUrl(configDraft.serverUrl, configDraft.port);
    if (!url) return setError("Informe o IP ou URL do servidor.");
    setLoading(true);
    setError(null);
    try {
      await checkHealth(url);
      await api(url, "/api/company");
      setMessage("Conectado com sucesso.");
    } catch (e: any) {
      setError(e.message || "Servidor não encontrado. Verifique IP, porta ou rede Wi-Fi.");
    } finally {
      setLoading(false);
    }
  }

  function saveConfig() {
    const mode = isHostedWeb ? "web" : configDraft.mode;
    const url = mode === "web" ? resolveWebBaseUrl() : normalizeBaseUrl(configDraft.serverUrl, configDraft.port);
    if (!url) return setError("Informe o IP ou URL do servidor.");
    const next = { baseUrl: url, serverName: configDraft.serverName.trim() || "Servidor Taberna", mode };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    setConfig(next);
    setStage(token ? "home" : "login");
    setMessage("Configuração salva.");
  }

  async function doLogin() {
    if (!activeConfig) return;
    setLoading(true);
    setError(null);
    try {
      await checkHealth(activeConfig.baseUrl);
      const result = await api<{ token: string }>(activeConfig.baseUrl, "/api/auth/login", { method: "POST", body: JSON.stringify({ login, password }) });
      localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      const me = await api<User>(activeConfig.baseUrl, "/api/auth/me", {}, result.token);
      if (!ALLOWED_ROLES.has(me.role.toUpperCase())) throw new Error("Perfil sem acesso ao app do garçom.");
      setUser(me);
      await loadSnapshot(result.token);
      setStage("home");
      setMessage("Login realizado.");
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/Login ou senha invalidos/i.test(msg)) setError(msg);
      else if (/Sem conexão com o servidor/i.test(msg) || /Failed to fetch/i.test(msg)) setError("API indisponível. Verifique se o servidor está ligado e se o app está usando a URL correta.");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadSnapshot(overrideToken?: string) {
    if (!activeConfig) return;
    const authToken = overrideToken ?? token;
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const [company, me, tables, products, additions, orders] = await Promise.all([
        api<Company | null>(activeConfig.baseUrl, "/api/company", {}, authToken),
        api<User>(activeConfig.baseUrl, "/api/auth/me", {}, authToken),
        api<TableData[]>(activeConfig.baseUrl, "/api/tables", {}, authToken),
        api<ProductData[]>(activeConfig.baseUrl, "/api/products", {}, authToken),
        api<AdditionData[]>(activeConfig.baseUrl, "/api/additions", {}, authToken),
        api<OrderData[]>(activeConfig.baseUrl, "/api/orders", {}, authToken)
      ]);
      setUser(me);
      setSnapshot({ company, user: me, tables: tables ?? [], products: products ?? [], additions: additions ?? [], orders: orders ?? [] });
    } catch (e: any) {
      setError(e.message);
      if (/nao autenticado|sem permissao/i.test(e.message ?? "")) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setStage("login");
      }
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setSnapshot(null);
    setSelectedTable(null);
    setStage("login");
  }

  function openTable(table: TableData) {
    setSelectedTable(table);
    setCustomerDraft(table.customerName ?? "");
    setActiveProductIndex(null);
    setSelectedProducts([]);
    setShowAddModal(false);
    setShowTransferModal(false);
    setShowMergeModal(false);
    setStage("detail");
    if (table.status === "LIVRE") {
      void openSelectedTable(table);
      return;
    }
    void loadTableDetail(table.id);
  }

  async function loadTableDetail(tableId: string) {
    if (!activeConfig || !token) return;
    const data = await api<{ table: TableData; orders: OrderData[] }>(activeConfig.baseUrl, `/api/tables/${tableId}/pre-conta`, {}, token);
    setSelectedTable(data.table);
    setDetailOrders(data.orders ?? []);
    setSnapshot((state) => state ? { ...state, tables: state.tables.map((item) => item.id === data.table.id ? data.table : item) } : state);
  }

  function currentOrder() {
    return detailOrders.find((order) => order.status !== "CANCELADO" && order.status !== "PAGO");
  }

  async function openSelectedTable(table: TableData = selectedTable as TableData) {
    if (!activeConfig || !token || !table) return;
    setLoading(true);
    try {
      const opened = await api<TableData>(activeConfig.baseUrl, `/api/tables/${table.id}/open`, { method: "PUT", body: JSON.stringify({ customerName: customerDraft || null }) }, token);
      await api<OrderData>(activeConfig.baseUrl, "/api/orders", { method: "POST", body: JSON.stringify({ type: "MESA", tableId: opened.id, customerNameSnapshot: opened.customerName ?? null, items: [], payments: [] }) }, token);
      setSelectedTable(opened);
      await loadSnapshot();
      await loadTableDetail(opened.id);
      setMessage("Mesa aberta.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveCustomerName() {
    if (!activeConfig || !token || !selectedTable) return;
    const value = customerDraft.trim();
    if ((selectedTable.customerName ?? "") === value) return;
    await api<TableData>(activeConfig.baseUrl, `/api/tables/${selectedTable.id}`, { method: "PUT", body: JSON.stringify({ customerName: value || null }) }, token);
    await loadSnapshot();
    await loadTableDetail(selectedTable.id);
  }

  function selectProduct(product: ProductData) {
    const existing = selectedProducts.findIndex((item) => item.product.id === product.id);
    if (existing >= 0) {
      setActiveProductIndex(existing);
      return;
    }
    setSelectedProducts((prev) => [...prev, { product, quantity: 1, note: "", showAdditions: false, selectedAdditions: [] }]);
    setActiveProductIndex(selectedProducts.length);
  }

  function updateDraftQty(index: number, qty: number) {
    const copy = [...selectedProducts];
    copy[index] = { ...copy[index], quantity: Math.max(1, qty) };
    setSelectedProducts(copy);
  }

  function updateDraftNote(index: number, note: string) {
    const copy = [...selectedProducts];
    copy[index] = { ...copy[index], note };
    setSelectedProducts(copy);
  }

  function toggleDraftAdditions(index: number) {
    const copy = [...selectedProducts];
    copy[index] = { ...copy[index], showAdditions: !copy[index].showAdditions };
    setSelectedProducts(copy);
  }

  function toggleAddition(spIndex: number, add: AdditionData) {
    const copy = [...selectedProducts];
    const existing = copy[spIndex].selectedAdditions.find((item) => item.id === add.id);
    if (existing) copy[spIndex] = { ...copy[spIndex], selectedAdditions: copy[spIndex].selectedAdditions.filter((item) => item.id !== add.id) };
    else copy[spIndex] = { ...copy[spIndex], selectedAdditions: [...copy[spIndex].selectedAdditions, { ...add, qty: 1 }] };
    setSelectedProducts(copy);
  }

  function updateAdditionQty(spIndex: number, addId: string, qty: number) {
    const copy = [...selectedProducts];
    copy[spIndex] = { ...copy[spIndex], selectedAdditions: copy[spIndex].selectedAdditions.map((item) => item.id === addId ? { ...item, qty: Math.max(1, qty) } : item) };
    setSelectedProducts(copy);
  }

  async function submitItems() {
    if (!activeConfig || !token || !selectedTable) return;
    const order = currentOrder();
    if (!order) return setError("Abra a mesa/comanda antes de lançar itens.");
    setLoading(true);
    try {
      for (const draft of selectedProducts) {
        const additives = draft.selectedAdditions.filter((add) => add.qty > 0).map((add) => ({ additionalId: add.id, name: add.name, quantity: add.qty, unitPriceCents: add.valueCents }));
        const addTotal = additives.reduce((sum, add) => sum + (add.quantity * add.unitPriceCents), 0);
        const totalCents = (draft.quantity * draft.product.salePriceCents) + addTotal;
        await api(activeConfig.baseUrl, `/api/orders/${order.id}/items`, {
          method: "POST",
          body: JSON.stringify({
            productId: draft.product.id,
            nameSnapshot: draft.product.name,
            quantity: draft.quantity,
            unitPriceCents: draft.product.salePriceCents,
            totalCents,
            printTarget: draft.product.printTarget,
            note: draft.note || null,
            additives
          })
        }, token);
      }
      await loadSnapshot();
      await loadTableDetail(selectedTable.id);
      setSelectedProducts([]);
      setShowAddModal(false);
      setMessage("Pedido enviado com sucesso.");
    } catch (e: any) {
      setError(e.message);
      setMessage("Pedido salvo, mas impressão pendente.");
    } finally {
      setLoading(false);
    }
  }

  async function requestPreConta() {
    if (!activeConfig || !token || !selectedTable) return;
    setLoading(true);
    try {
      await api(activeConfig.baseUrl, `/api/tables/${selectedTable.id}`, { method: "PUT", body: JSON.stringify({ status: "FECHANDO_CONTA" }) }, token);
      await loadSnapshot();
      await loadTableDetail(selectedTable.id);
      setMessage("Pré-conta solicitada.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function requestCashClose() {
    if (!activeConfig || !token || !selectedTable) return;
    setLoading(true);
    try {
      await api(activeConfig.baseUrl, `/api/tables/${selectedTable.id}`, { method: "PUT", body: JSON.stringify({ status: "AGUARDANDO_PAGAMENTO" }) }, token);
      await loadSnapshot();
      await loadTableDetail(selectedTable.id);
      setMessage("Mesa enviada para o caixa.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function transferItems() {
    if (!activeConfig || !token || !selectedTable || !transferTarget || !transferItemIds.length) return;
    setLoading(true);
    try {
      await api(activeConfig.baseUrl, "/api/orders/transfer-items", { method: "POST", body: JSON.stringify({ fromTableId: selectedTable.id, toTableId: transferTarget, orderItemIds: transferItemIds }) }, token);
      await loadSnapshot();
      await loadTableDetail(selectedTable.id);
      setShowTransferModal(false);
      setTransferItemIds([]);
      setTransferTarget("");
      setMessage("Itens transferidos.");
    } catch (e: any) {
      setError(canTransfer ? e.message : "Você não tem permissão para transferir itens.");
    } finally {
      setLoading(false);
    }
  }

  async function mergeTables() {
    if (!activeConfig || !token || !selectedTable || !mergeSources.length) return;
    setLoading(true);
    try {
      await api(activeConfig.baseUrl, "/api/tables/merge", { method: "POST", body: JSON.stringify({ mainTableId: selectedTable.id, secondaryTableIds: mergeSources }) }, token);
      await loadSnapshot();
      await loadTableDetail(selectedTable.id);
      setShowMergeModal(false);
      setMergeSources([]);
      setMessage("Mesas juntadas.");
    } catch (e: any) {
      setError(canJoin ? e.message : "Você não tem permissão para juntar mesas/comandas. Chame o caixa ou gerente.");
    } finally {
      setLoading(false);
    }
  }

  const tables = snapshot?.tables ?? [];
  const orders = snapshot?.orders ?? [];
  const products = snapshot?.products ?? [];
  const additions = snapshot?.additions ?? [];
  const company = snapshot?.company;
  const activeOrders = orders.filter((order) => order.status !== "CANCELADO" && order.status !== "PAGO");
  const openTables = tables.filter((table) => table.status !== "LIVRE");
  const myTables = tables.filter((table) => table.waiterName?.toLowerCase() === user?.name.toLowerCase());
  const preparingOrders = orders.filter((order) => ["ACEITO", "EM_PREPARO"].includes(order.status));
  const readyOrders = orders.filter((order) => order.status === "PRONTO");
  const comandas = tables.filter((table) => table.name.toLowerCase().startsWith("comanda"));
  const filteredProducts = searchTerm ? products.filter((product) => product.name.toLowerCase().includes(searchTerm.toLowerCase()) || String(product.code).includes(searchTerm) || (product.category?.name ?? "").toLowerCase().includes(searchTerm.toLowerCase())) : products;

  if (!activeConfig) {
    return renderConfigScreen();
  }
  if (!token || !user) {
    return renderLoginScreen();
  }

  function renderConfigScreen() {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0f172a, #172554)", color: "#fff", padding: 18, display: "grid", placeItems: "center" }}>
        <div style={{ width: "min(520px, 100%)", background: "rgba(15,23,42,0.92)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, padding: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 18, background: "linear-gradient(135deg, #2563eb, #1d4ed8)", display: "grid", placeItems: "center" }}><Settings size={22} /></div>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: "#93c5fd", fontWeight: 800 }}>Configurar Servidor</div>
              <h2 style={{ margin: 0 }}>Primeiro acesso</h2>
              <p style={{ margin: "6px 0 0", color: "#cbd5e1", fontSize: 13 }}>Escolha `Local` para usar o IP do PC na mesma rede. Escolha `Web` para usar a URL pública do Render.</p>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <small style={{ color: "#93c5fd", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Tipo de conexão</small>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" disabled={isHostedWeb} onClick={() => setConfigDraft((state) => ({ ...state, mode: "local" }))} style={configDraft.mode === "local" && !isHostedWeb ? primaryButton : secondaryButton}>Local</button>
                <button type="button" onClick={() => setConfigDraft((state) => ({ ...state, mode: "web" }))} style={configDraft.mode === "web" || isHostedWeb ? primaryButton : secondaryButton}>Web</button>
              </div>
            </div>
            {(configDraft.mode === "web" || isHostedWeb) ? <div style={{ ...alertStyle, borderColor: "rgba(59,130,246,0.25)", color: "#dbeafe", background: "rgba(59,130,246,0.12)" }}>Web usa a API em <strong>{resolveWebBaseUrl()}</strong></div> : null}
            {(!isHostedWeb && configDraft.mode === "local") && <><label style={{ display: "grid", gap: 6 }}>IP do Servidor<input value={configDraft.serverUrl} onChange={(e) => setConfigDraft((state) => ({ ...state, serverUrl: e.target.value }))} placeholder="192.168.0.100" style={fieldStyle} /></label><label style={{ display: "grid", gap: 6 }}>Porta<input value={configDraft.port} onChange={(e) => setConfigDraft((state) => ({ ...state, port: e.target.value }))} placeholder="3333" style={fieldStyle} /></label></>}
            {(configDraft.mode === "web" || isHostedWeb) && <label style={{ display: "grid", gap: 6 }}>URL da API<input value={resolveWebBaseUrl()} readOnly style={fieldStyle} /></label>}
            <label style={{ display: "grid", gap: 6 }}>Nome do Servidor<input value={configDraft.serverName} onChange={(e) => setConfigDraft((state) => ({ ...state, serverName: e.target.value }))} placeholder="Servidor Taberna" style={fieldStyle} /></label>
            {error && <div style={alertStyle}>{error}</div>}
            {message && <div style={{ ...alertStyle, borderColor: "rgba(34,197,94,0.25)", color: "#dcfce7", background: "rgba(34,197,94,0.12)" }}>{message}</div>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={testConnection} style={primaryButton}><Bell size={16} /> Testar Conexão</button>
              <button onClick={saveConfig} style={secondaryButton}>Salvar Configuração</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderLoginScreen() {
    return (
      <div style={{ minHeight: "100vh", background: "radial-gradient(circle at top, #1e3a8a, #0f172a 65%)", color: "#fff", padding: 18, display: "grid", placeItems: "center" }}>
        <div style={{ width: "min(480px, 100%)", background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, padding: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div style={{ width: 52, height: 52, borderRadius: 18, background: "linear-gradient(135deg, #2563eb, #1d4ed8)", display: "grid", placeItems: "center" }}><ChefHat size={22} /></div>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: "#93c5fd", fontWeight: 800 }}>{activeConfig?.serverName ?? "Servidor Taberna"}</div>
              <h2 style={{ margin: 0 }}>Acesso do Garçom</h2>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>Usuário<input value={login} onChange={(e) => setLogin(e.target.value)} style={fieldStyle} /></label>
            <label style={{ display: "grid", gap: 6 }}>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} /></label>
            {error && <div style={alertStyle}>{error}</div>}
            {message && <div style={{ ...alertStyle, borderColor: "rgba(34,197,94,0.25)", color: "#dcfce7", background: "rgba(34,197,94,0.12)" }}>{message}</div>}
            <button onClick={doLogin} style={primaryButton}><ShoppingCart size={16} /> Entrar</button>
            <button onClick={() => setStage("config")} style={secondaryButton}><Settings size={16} /> Trocar Servidor</button>
          </div>
        </div>
      </div>
    );
  }

  function renderListPage(title: string, rows: TableData[]) {
    return (
      <div style={{ padding: 14, display: "grid", gap: 12 }}>
        <div style={mobileHeaderStyle}>
          <button onClick={() => setStage("home")} style={iconButton}><ChevronLeft size={18} /></button>
          <div>
            <div style={{ fontSize: 12, color: "#93c5fd", textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 800 }}>IGS Lanchonete PRO</div>
            <h3 style={{ margin: 0 }}>{title}</h3>
          </div>
          <button onClick={() => void loadSnapshot()} style={iconButton}><RefreshCw size={18} /></button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((table) => {
            const tableOrders = orders.filter((order) => order.tableId === table.id);
            const total = calcTotal(tableOrders.flatMap((order) => order.items));
            const itemCount = tableOrders.reduce((sum, order) => sum + order.items.filter((item) => !item.cancelledAt).length, 0);
            return (
              <button key={table.id} onClick={() => openTable(table)} style={{ ...cardStyle, textAlign: "left", color: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{table.name}</div>
                    <div style={{ color: "#cbd5e1", fontSize: 12 }}>{table.customerName ?? "Sem cliente"} · {table.waiterName ?? "Sem garçom"}</div>
                  </div>
                  <span style={{ background: statusColor(table.status), color: "#fff", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 800 }}>{statusLabel(table.status)}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <span style={pillStyle}><CircleDollarSign size={12} /> {moneyFn(total)}</span>
                  <span style={pillStyle}><Package2 size={12} /> {itemCount} itens</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderComandasPage() {
    return renderListPage("Comandas", comandas);
  }

  function renderTablesPage() {
    return renderListPage("Mesas", tables);
  }

  function renderHome() {
    return (
      <div style={{ padding: 14, display: "grid", gap: 14 }}>
        <div style={heroStyle}>
          <div>
            <div style={{ fontSize: 12, color: "#93c5fd", letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 800 }}>{company?.nomeFantasia ?? activeConfig?.serverName ?? "IGS Lanchonete PRO"}</div>
            <h2 style={{ margin: "6px 0 4px" }}>{user?.name ?? "Usuário"}</h2>
            <div style={{ color: "#cbd5e1" }}>Perfil: {user?.role ?? ""}</div>
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <button style={homeButton} onClick={() => setStage("tables")}><Table size={18} /> Mesas</button>
            <button style={homeButton} onClick={() => setStage("comandas")}><Users size={18} /> Comandas</button>
            <button style={homeButton} onClick={() => { setStage("tables"); setMessage("Escolha uma mesa para lançar itens."); }}><ShoppingCart size={18} /> Novo Pedido Balcão</button>
            <button style={homeButton} onClick={() => void loadSnapshot()}><RefreshCw size={18} /> Atualizar</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <StatCard label="Mesas abertas" value={String(openTables.length)} icon={<Table size={16} />} />
          <StatCard label="Minhas mesas" value={String(myTables.length)} icon={<Users size={16} />} />
          <StatCard label="Pedidos preparo" value={String(preparingOrders.length)} icon={<ChefHat size={16} />} />
          <StatCard label="Pedidos prontos" value={String(readyOrders.length)} icon={<Bell size={16} />} />
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <button onClick={() => setStage("tables")} style={bigNavButton}><Table size={18} /> Mesas</button>
          <button onClick={() => setStage("comandas")} style={bigNavButton}><Users size={18} /> Comandas</button>
          <button onClick={() => void loadSnapshot()} style={bigNavButton}><RefreshCw size={18} /> Atualizar</button>
          <button onClick={logout} style={{ ...bigNavButton, background: "linear-gradient(135deg, #334155, #475569)" }}><LogOut size={18} /> Sair</button>
        </div>
      </div>
    );
  }

  function renderDetail() {
    if (!selectedTable) return null;
    const order = currentOrder();
    const activeItems = order?.items.filter((item) => !item.cancelledAt) ?? [];
    const total = calcTotal(order?.items ?? []);
    const filtered = filteredProducts;

    return (
      <div style={{ padding: 14, display: "grid", gap: 14, paddingBottom: 24 }}>
        <div style={mobileHeaderStyle}>
          <button onClick={() => setStage("home")} style={iconButton}><ChevronLeft size={18} /></button>
          <div>
            <div style={{ fontSize: 12, color: "#93c5fd", textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 800 }}>{selectedTable.name}</div>
            <h3 style={{ margin: 0 }}>{statusLabel(selectedTable.status)} · {selectedTable.customerName ?? "Sem cliente"}</h3>
          </div>
          <button onClick={() => void loadTableDetail(selectedTable.id)} style={iconButton}><RefreshCw size={18} /></button>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "#93c5fd", textTransform: "uppercase", letterSpacing: 1 }}>Cliente</div>
              <input value={customerDraft} onChange={(e) => setCustomerDraft(e.target.value)} onBlur={() => void saveCustomerName()} placeholder="Digite o nome..." style={fieldInlineStyle} />
            </div>
            <button onClick={() => setShowAddModal(true)} style={primaryButton}><ShoppingCart size={16} /> Lançar Item</button>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => void requestPreConta()} style={ghostActionButton}>Solicitar Pré-conta</button>
            <button onClick={() => void requestCashClose()} style={ghostActionButton}>Solicitar Fechamento no Caixa</button>
            <button disabled={!canTransfer} onClick={() => setShowTransferModal(true)} style={ghostActionButton}>Transferir Item</button>
            <button disabled={!canJoin} onClick={() => setShowMergeModal(true)} style={ghostActionButton}>Juntar Mesas</button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <strong>Itens lançados</strong>
            <span style={{ color: "#cbd5e1" }}>Total {moneyFn(total)}</span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {activeItems.length === 0 && <div style={{ color: "#94a3b8", textAlign: "center", padding: 12 }}>Nenhum item lançado.</div>}
            {activeItems.map((item) => (
              <div key={item.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <strong style={{ display: "block" }}>{item.nameSnapshot}</strong>
                  <small style={{ color: "#94a3b8" }}>{item.quantity}x · {moneyFn(item.unitPriceCents)}</small>
                  {item.note && <div style={{ marginTop: 4, color: "#fbbf24", fontSize: 12 }}>Obs: {item.note}</div>}
                </div>
                <div style={{ fontWeight: 900, color: "#dbeafe" }}>{moneyFn(item.totalCents)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <button onClick={() => void loadSnapshot()} style={bigNavButton}><RefreshCw size={18} /> Atualizar</button>
          <button onClick={logout} style={{ ...bigNavButton, background: "linear-gradient(135deg, #334155, #475569)" }}><LogOut size={18} /> Sair</button>
        </div>

        {showAddModal && createPortal(
          <div style={modalBackdrop} onClick={() => setShowAddModal(false)}>
            <div style={modalCard} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <strong style={{ fontSize: 18 }}>Lançar Itens</strong>
                <button onClick={() => setShowAddModal(false)} style={iconButton}><X size={18} /></button>
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1.2fr 0.9fr", minHeight: 0 }}>
                <div style={{ minWidth: 0, display: "grid", gap: 10 }}>
                  <div style={{ position: "relative" }}>
                    <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                    <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por nome, código ou categoria..." style={{ ...fieldStyle, paddingLeft: 36 }} />
                  </div>
                  <div style={{ display: "grid", gap: 8, maxHeight: 360, overflow: "auto" }}>
                    {filteredProducts.map((product) => {
                      const selected = selectedProducts.some((item) => item.product.id === product.id);
                      return (
                        <button key={product.id} onClick={() => selected ? setSelectedProducts((prev) => prev.filter((item) => item.product.id !== product.id)) : selectProduct(product)} style={{ background: selected ? "rgba(37,99,235,0.16)" : "rgba(255,255,255,0.06)", border: selected ? "1px solid rgba(59,130,246,0.45)" : "1px solid rgba(255,255,255,0.08)", color: "#fff", borderRadius: 14, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textAlign: "left" }}>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ display: "block" }}>{product.name}</strong>
                            <small style={{ color: "#94a3b8" }}>#{product.code} · {product.category?.name ?? "Sem grupo"}</small>
                          </div>
                          <span style={{ fontWeight: 900, color: "#93c5fd" }}>{moneyFn(product.salePriceCents)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ minWidth: 0, display: "grid", gap: 8, alignContent: "start" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>Selecionados</strong>
                    <small style={{ color: "#94a3b8" }}>{selectedProducts.length}</small>
                  </div>
                  {selectedProducts.length === 0 && <div style={{ padding: 16, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.16)", color: "#94a3b8", textAlign: "center" }}>Nenhum item selecionado.</div>}
                  {selectedProducts.map((draft, idx) => (
                    <div key={draft.product.id} style={{ background: idx === activeProductIndex ? "rgba(37,99,235,0.16)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                        <button onClick={() => setActiveProductIndex(idx)} style={{ background: "transparent", border: 0, color: "#fff", textAlign: "left", padding: 0 }}>
                          <strong style={{ display: "block" }}>{draft.product.name}</strong>
                          <small style={{ color: "#94a3b8" }}>{draft.quantity}x</small>
                        </button>
                        <button onClick={() => setSelectedProducts((prev) => prev.filter((_, i) => i !== idx))} style={{ ...iconButton, width: 32, height: 32 }}><X size={14} /></button>
                      </div>
                      {idx === activeProductIndex && (
                        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <label style={{ flex: 0 }}>
                              <small style={{ display: "block", color: "#94a3b8", marginBottom: 4 }}>Qtd</small>
                              <input type="number" min={1} value={draft.quantity} onChange={(e) => updateDraftQty(idx, Number(e.target.value))} style={{ width: 64, ...fieldStyle }} />
                            </label>
                            <label style={{ flex: 1 }}>
                              <small style={{ display: "block", color: "#94a3b8", marginBottom: 4 }}>Observação</small>
                              <input value={draft.note} onChange={(e) => updateDraftNote(idx, e.target.value)} placeholder="Sem cebola, bem passado..." style={fieldStyle} />
                            </label>
                          </div>
                          <button onClick={() => toggleDraftAdditions(idx)} style={ghostActionButton}>Opcionais {draft.selectedAdditions.length ? `(${draft.selectedAdditions.length})` : ""}</button>
                          {draft.showAdditions && <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{additions.filter((add) => add.active).map((add) => {
                            const selected = draft.selectedAdditions.find((item) => item.id === add.id);
                            return <button key={add.id} onClick={() => toggleAddition(idx, add)} style={{ ...chipButton, ...(selected ? { background: "rgba(37,99,235,0.2)", borderColor: "rgba(59,130,246,0.45)", color: "#dbeafe" } : {}) }}>{add.name} {selected ? `(${selected.qty}x)` : ""} <span style={{ opacity: 0.6 }}>{moneyFn(add.valueCents)}</span></button>;
                          })}</div>}
                          {draft.selectedAdditions.length > 0 && <div style={{ display: "grid", gap: 6 }}>{draft.selectedAdditions.map((add) => <div key={add.id} style={{ display: "flex", alignItems: "center", gap: 8 }}><small style={{ color: "#cbd5e1" }}>{add.name}</small><input type="number" min={1} value={add.qty} onChange={(e) => updateAdditionQty(idx, add.id, Number(e.target.value))} style={{ width: 60, ...fieldStyle }} /><small style={{ color: "#94a3b8" }}>{moneyFn(add.valueCents)}</small></div>)}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => setShowAddModal(false)} style={secondaryButton}>Cancelar</button>
                <button onClick={() => void submitItems()} style={primaryButton}><Package2 size={16} /> Confirmar itens</button>
              </div>
            </div>
          </div>, document.body
        )}

        {showTransferModal && createPortal(
          <div style={modalBackdrop} onClick={() => setShowTransferModal(false)}>
            <div style={modalCard} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><strong style={{ fontSize: 18 }}>Transferir Itens</strong><button onClick={() => setShowTransferModal(false)} style={iconButton}><X size={18} /></button></div>
              <div style={{ display: "grid", gap: 8, maxHeight: 320, overflow: "auto", marginBottom: 12 }}>
                {activeOrders.flatMap((order) => order.items.filter((item) => !item.cancelledAt)).map((item) => {
                  const checked = transferItemIds.includes(item.id);
                  return <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, background: checked ? "rgba(37,99,235,0.16)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}><input type="checkbox" checked={checked} onChange={() => setTransferItemIds((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])} /><strong style={{ flex: 1 }}>{item.nameSnapshot}</strong><span style={{ color: "#dbeafe" }}>{moneyFn(item.totalCents)}</span></label>;
                })}
              </div>
              <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>Mesa destino<select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} style={fieldStyle}><option value="">Selecione...</option>{tables.filter((table) => table.id !== selectedTable.id).map((table) => <option key={table.id} value={table.id}>{table.name} ({statusLabel(table.status)})</option>)}</select></label>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => setShowTransferModal(false)} style={secondaryButton}>Cancelar</button>
                <button disabled={!canTransfer || !transferTarget || !transferItemIds.length} onClick={() => void transferItems()} style={primaryButton}><ArrowLeftRight size={16} /> Transferir</button>
              </div>
            </div>
          </div>, document.body
        )}

        {showMergeModal && createPortal(
          <div style={modalBackdrop} onClick={() => setShowMergeModal(false)}>
            <div style={modalCard} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><strong style={{ fontSize: 18 }}>Juntar Mesas</strong><button onClick={() => setShowMergeModal(false)} style={iconButton}><X size={18} /></button></div>
              <div style={{ display: "grid", gap: 8, maxHeight: 320, overflow: "auto", marginBottom: 12 }}>
                {tables.filter((table) => table.id !== selectedTable.id && table.status === "OCUPADA").map((table) => {
                  const checked = mergeSources.includes(table.id);
                  return <label key={table.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, background: checked ? "rgba(37,99,235,0.16)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}><input type="checkbox" checked={checked} onChange={() => setMergeSources((prev) => prev.includes(table.id) ? prev.filter((id) => id !== table.id) : [...prev, table.id])} /><Users size={16} /><strong style={{ flex: 1 }}>{table.name}</strong></label>;
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => setShowMergeModal(false)} style={secondaryButton}>Cancelar</button>
                <button disabled={!canJoin || !mergeSources.length} onClick={() => void mergeTables()} style={primaryButton}><Users size={16} /> Juntar</button>
              </div>
            </div>
          </div>, document.body
        )}
      </div>
    );
  }

  function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
    return <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 14, minHeight: 96 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div><div style={{ color: "#93c5fd", fontSize: 12, textTransform: "uppercase", fontWeight: 800 }}>{label}</div><strong style={{ fontSize: 26 }}>{value}</strong></div><div style={{ width: 34, height: 34, borderRadius: 12, background: "rgba(59,130,246,0.18)", display: "grid", placeItems: "center" }}>{icon}</div></div></div>;
  }

  return null;
}

const fieldStyle: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.95)", color: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 14px", outline: "none", fontWeight: 600 };
const fieldInlineStyle: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.95)", color: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "10px 14px", outline: "none", fontWeight: 700 };
const alertStyle: React.CSSProperties = { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#fecaca", padding: 12, borderRadius: 14 };
const primaryButton: React.CSSProperties = { background: "linear-gradient(135deg, #fff, #e2e8f0)", color: "#1e3a5f", border: 0, borderRadius: 14, padding: "12px 16px", fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", cursor: "pointer" };
const secondaryButton: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, padding: "12px 16px", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", cursor: "pointer" };
const homeButton: React.CSSProperties = { background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "14px 12px", fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", cursor: "pointer" };
const bigNavButton: React.CSSProperties = { background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", border: 0, borderRadius: 18, padding: "16px 14px", fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 10, justifyContent: "center", cursor: "pointer" };
const cardStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 14 };
const heroStyle: React.CSSProperties = { background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,64,175,0.85))", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 24, padding: 16, display: "grid", gap: 14 };
const mobileHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 12 };
const iconButton: React.CSSProperties = { width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" };
const pillStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,0.08)", color: "#e2e8f0", fontSize: 12, fontWeight: 800 };
const ghostActionButton: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "11px 14px", fontWeight: 800, cursor: "pointer" };
const chipButton: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "7px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const modalBackdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.72)", zIndex: 1000, display: "grid", placeItems: "center", padding: 14 };
const modalCard: React.CSSProperties = { width: "min(980px, 100%)", maxHeight: "92vh", overflow: "auto", background: "linear-gradient(135deg, #0f172a, #1d4ed8)", color: "#fff", borderRadius: 24, padding: 18, boxShadow: "0 24px 80px rgba(37,99,235,0.35)" };
