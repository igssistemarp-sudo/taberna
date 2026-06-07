import React from "react";
import { CheckCircle2, CircleDashed, CircleOff, DoorOpen, Search, Table2 } from "lucide-react";

type CadastroData = {
  categories: Array<{ id: string; name: string; active: boolean; products?: Array<unknown> }>;
  neighborhoods: Array<{ id: string; name: string; city: string; deliveryFeeCents: number; avgDeliveryMinutes: number; active: boolean }>;
  paymentMethods: Array<{ id: string; name: string; allowFee: boolean; active: boolean }>;
  suppliers: Array<{ id: string; name: string; tradeName?: string | null; typePerson?: string | null; status?: string | null; document?: string | null; ie?: string | null; im?: string | null; activity?: string | null; phone?: string | null; phone2?: string | null; whatsapp?: string | null; email?: string | null; financeEmail?: string | null; site?: string | null; instagram?: string | null; facebook?: string | null; sellerName?: string | null; sellerPhone?: string | null; sellerWhatsapp?: string | null; sellerEmail?: string | null; cep?: string | null; street?: string | null; number?: string | null; complement?: string | null; district?: string | null; city?: string | null; state?: string | null; reference?: string | null; paymentTerm?: string | null; creditLimitCents?: number; minimumOrderCents?: number; visitDay?: string | null; deliveryFrequency?: string | null; bankName?: string | null; agency?: string | null; account?: string | null; pixKey?: string | null; pixType?: string | null; holderName?: string | null; classification?: string | null; notes?: string | null; active: boolean; createdAt?: string; updatedAt?: string; payables?: Array<{ id: string; amountCents: number; dueDate: string; paidAt?: string | null; status: string; paymentMethod?: string | null; description: string; createdAt: string }> }>;
  users: Array<{ id: string; name: string; login: string; role: string; active: boolean }>;
  printers: Array<{ id: string; name: string; type: string; ip: string; port: number; active: boolean }>;
  products: Array<{ id: string; code: number; name: string; salePriceCents: number; costCents: number; stockCurrent: number; active: boolean; categoryId?: string | null; category?: { id: string; name: string } | null; printTarget: string }>;
  tables: Array<{ id: string; name: string; status: string; active: boolean; customerName?: string | null; waiterName?: string | null }>;
};

type CadastroProps = {
  data: CadastroData | null;
  money: (value: number) => string;
  mutate: (path: string, options?: RequestInit) => Promise<void>;
};

export default function CadastroView({ data, money, mutate }: CadastroProps) {
  const [section, setSection] = React.useState<"produtos" | "grupos" | "mesas" | "comandas" | "bairros" | "pagamentos" | "fornecedores" | "funcionarios" | "usuarios" | "empresa">("grupos");
  const [productDraft, setProductDraft] = React.useState({ name: "", salePriceCents: 0, costCents: 0, stockCurrent: 0, categoryId: "", printTarget: "COZINHA", active: true });
  const [productSearch, setProductSearch] = React.useState("");
  const [productStatusFilter, setProductStatusFilter] = React.useState("");
  const [groupName, setGroupName] = React.useState("");
  const [groupActive, setGroupActive] = React.useState(true);
  const [editingCategoryId, setEditingCategoryId] = React.useState<string | null>(null);
  const [groupSearch, setGroupSearch] = React.useState("");
  const [groupStatusFilter, setGroupStatusFilter] = React.useState("");
  const [tableDraft, setTableDraft] = React.useState({ prefix: "Mesa", quantity: 10, startAt: 1, endAt: "", padWidth: 2, deactivateExtra: true });
  const [comandaDraft, setComandaDraft] = React.useState({ quantity: 10, startAt: 1, endAt: "", padWidth: 2, deactivateExtra: true });
  const [neighborhoodDraft, setNeighborhoodDraft] = React.useState({ name: "", city: "", deliveryFeeCents: 0, avgDeliveryMinutes: 30, active: true });
  const [editingNeighborhoodId, setEditingNeighborhoodId] = React.useState<string | null>(null);
  const [neighborhoodSearch, setNeighborhoodSearch] = React.useState("");
  const [neighborhoodStatusFilter, setNeighborhoodStatusFilter] = React.useState("");
  const [paymentDraft, setPaymentDraft] = React.useState({ name: "", allowFee: false, active: true });
  const [editingPaymentMethodId, setEditingPaymentMethodId] = React.useState<string | null>(null);
  const [paymentSearch, setPaymentSearch] = React.useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = React.useState("");
  const [supplierTab, setSupplierTab] = React.useState<"geral" | "contatos" | "endereco" | "comercial" | "financeiro" | "produtos" | "historico" | "anexos" | "observacoes">("geral");
  const [selectedSupplierId, setSelectedSupplierId] = React.useState<string | null>(null);
  const [supplierSearch, setSupplierSearch] = React.useState("");
  const [supplierStatusFilter, setSupplierStatusFilter] = React.useState("");
  const [supplierDraft, setSupplierDraft] = React.useState({
    name: "",
    tradeName: "",
    typePerson: "PJ",
    status: "ATIVO",
    document: "",
    ie: "",
    im: "",
    activity: "",
    phone: "",
    phone2: "",
    whatsapp: "",
    email: "",
    financeEmail: "",
    site: "",
    instagram: "",
    facebook: "",
    sellerName: "",
    sellerPhone: "",
    sellerWhatsapp: "",
    sellerEmail: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    reference: "",
    paymentTerm: "",
    creditLimitCents: 0,
    minimumOrderCents: 0,
    visitDay: "",
    deliveryFrequency: "",
    bankName: "",
    agency: "",
    account: "",
    pixKey: "",
    pixType: "PIX",
    holderName: "",
    classification: "Padrão",
    notes: "",
    active: true
  });
  const [userDraft, setUserDraft] = React.useState({ name: "", login: "", password: "123", role: "GARCOM", active: true });
  const [editingUserId, setEditingUserId] = React.useState<string | null>(null);
  const [staffSearch, setStaffSearch] = React.useState("");
  const [staffStatusFilter, setStaffStatusFilter] = React.useState("");
  const [userSearch, setUserSearch] = React.useState("");
  const [userStatusFilter, setUserStatusFilter] = React.useState("");

  const sections = [
    ["grupos", "Grupos"],
    ["mesas", "Mesas"],
    ["comandas", "Comandas"],
    ["bairros", "Bairros"],
    ["pagamentos", "Formas de pagamento"],
    ["fornecedores", "Fornecedores"],
    ["funcionarios", "Funcionários"],
    ["usuarios", "Usuários"]
  ] as const;
  const sectionTheme: Record<string, string> = {
    grupos: "theme-groups",
    mesas: "theme-tables",
    bairros: "theme-neighborhoods",
    pagamentos: "theme-payments",
    fornecedores: "theme-suppliers",
    funcionarios: "theme-staff",
    usuarios: "theme-users"
  };

  const tableStats = React.useMemo(() => {
    const tables = data?.tables ?? [];
    return {
      total: tables.length,
      active: tables.filter((table) => table.active).length,
      inactive: tables.filter((table) => !table.active).length,
      free: tables.filter((table) => table.status === "LIVRE").length,
      occupied: tables.filter((table) => table.status !== "LIVRE").length
    };
  }, [data]);

  function submitTables(overrides: Record<string, unknown> = {}) {
    const payload: Record<string, unknown> = {
      prefix: tableDraft.prefix,
      startAt: tableDraft.startAt,
      padWidth: tableDraft.padWidth,
      deactivateExtra: tableDraft.deactivateExtra,
      ...overrides
    };
    if (!("endAt" in payload) && tableDraft.endAt !== "") {
      payload.endAt = Number(tableDraft.endAt);
    }
    if (!("endAt" in payload)) {
      payload.quantity = tableDraft.quantity;
    }
    return mutate("/api/tables/bulk", { method: "POST", body: JSON.stringify(payload) });
  }

  function submitComandas(overrides: Record<string, unknown> = {}) {
    const payload: Record<string, unknown> = {
      prefix: "Comanda",
      startAt: comandaDraft.startAt,
      padWidth: comandaDraft.padWidth,
      deactivateExtra: comandaDraft.deactivateExtra,
      ...overrides
    };
    if (!("endAt" in payload) && comandaDraft.endAt !== "") {
      payload.endAt = Number(comandaDraft.endAt);
    }
    if (!("endAt" in payload)) {
      payload.quantity = comandaDraft.quantity;
    }
    return mutate("/api/tables/bulk", { method: "POST", body: JSON.stringify(payload) });
  }

  const supplierList = (data?.suppliers ?? []).filter((item) => {
    const search = supplierSearch.trim().toLowerCase();
    if (supplierStatusFilter && (item.status ?? (item.active ? "ATIVO" : "INATIVO")) !== supplierStatusFilter) return false;
    if (!search) return true;
    const haystack = [item.name, item.tradeName, item.document, item.city, item.phone, item.whatsapp, item.activity].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(search);
  });

  const selectedSupplier = React.useMemo(() => (data?.suppliers ?? []).find((item) => item.id === selectedSupplierId) ?? null, [data, selectedSupplierId]);
  const featuredSupplier = selectedSupplier ?? supplierList[0] ?? null;

  const categoryList = (data?.categories ?? [])
    .filter((item) => {
      const search = groupSearch.trim().toLowerCase();
      if (groupStatusFilter && (item.active ? "ATIVO" : "INATIVO") !== groupStatusFilter) return false;
      if (!search) return true;
      return item.name.toLowerCase().includes(search);
    })
    .slice(0, 2);

  const neighborhoodList = (data?.neighborhoods ?? [])
    .filter((item) => {
      const search = neighborhoodSearch.trim().toLowerCase();
      if (neighborhoodStatusFilter && (item.active ? "ATIVO" : "INATIVO") !== neighborhoodStatusFilter) return false;
      if (!search) return true;
      return [item.name, item.city].join(" ").toLowerCase().includes(search);
    })
    .slice(0, 2);

  const paymentList = (data?.paymentMethods ?? [])
    .filter((item) => {
      const search = paymentSearch.trim().toLowerCase();
      if (paymentStatusFilter && (item.active ? "ATIVA" : "INATIVA") !== paymentStatusFilter) return false;
      if (!search) return true;
      return item.name.toLowerCase().includes(search);
    })
    .slice(0, 2);

  const staffList = (data?.users ?? [])
    .filter((item) => item.role !== "ADMIN")
    .filter((item) => {
      const search = staffSearch.trim().toLowerCase();
      if (staffStatusFilter && (item.active ? "ATIVO" : "INATIVO") !== staffStatusFilter) return false;
      if (!search) return true;
      return [item.name, item.login, item.role].join(" ").toLowerCase().includes(search);
    })
    .slice(0, 2);

  const userList = (data?.users ?? [])
    .filter((item) => {
      const search = userSearch.trim().toLowerCase();
      if (userStatusFilter && (item.active ? "ATIVO" : "INATIVO") !== userStatusFilter) return false;
      if (!search) return true;
      return [item.name, item.login, item.role].join(" ").toLowerCase().includes(search);
    })
    .slice(0, 2);

  const productList = (data?.products ?? [])
    .filter((item) => {
      const search = productSearch.trim().toLowerCase();
      if (productStatusFilter && (item.active ? "ATIVO" : "INATIVO") !== productStatusFilter) return false;
      if (!search) return true;
      return [String(item.code), item.name, item.category?.name ?? "", item.printTarget].join(" ").toLowerCase().includes(search);
    })
    .slice(0, 2);

  function resetSupplierDraft() {
    setSupplierDraft({
      name: "",
      tradeName: "",
      typePerson: "PJ",
      status: "ATIVO",
      document: "",
      ie: "",
      im: "",
      activity: "",
      phone: "",
      phone2: "",
      whatsapp: "",
      email: "",
      financeEmail: "",
      site: "",
      instagram: "",
      facebook: "",
      sellerName: "",
      sellerPhone: "",
      sellerWhatsapp: "",
      sellerEmail: "",
      cep: "",
      street: "",
      number: "",
      complement: "",
      district: "",
      city: "",
      state: "",
      reference: "",
      paymentTerm: "",
      creditLimitCents: 0,
      minimumOrderCents: 0,
      visitDay: "",
      deliveryFrequency: "",
      bankName: "",
      agency: "",
      account: "",
      pixKey: "",
      pixType: "PIX",
      holderName: "",
      classification: "Padrão",
      notes: "",
      active: true
    });
    setSelectedSupplierId(null);
    setSupplierTab("geral");
  }

  function resetBasicDrafts() {
    setGroupName("");
    setGroupActive(true);
    setEditingCategoryId(null);
    setNeighborhoodDraft({ name: "", city: "", deliveryFeeCents: 0, avgDeliveryMinutes: 30, active: true });
    setEditingNeighborhoodId(null);
    setPaymentDraft({ name: "", allowFee: false, active: true });
    setEditingPaymentMethodId(null);
    setUserDraft({ name: "", login: "", password: "123", role: "GARCOM", active: true });
    setEditingUserId(null);
  }

  async function saveCategory() {
    const body = { name: groupName.trim(), active: groupActive };
    if (!body.name) return;
    if (editingCategoryId) await mutate(`/api/categories/${editingCategoryId}`, { method: "PUT", body: JSON.stringify(body) });
    else await mutate("/api/categories", { method: "POST", body: JSON.stringify(body) });
    resetBasicDrafts();
  }

  async function saveNeighborhood() {
    const body = { ...neighborhoodDraft, name: neighborhoodDraft.name.trim(), city: neighborhoodDraft.city.trim() };
    if (!body.name || !body.city) return;
    if (editingNeighborhoodId) await mutate(`/api/neighborhoods/${editingNeighborhoodId}`, { method: "PUT", body: JSON.stringify(body) });
    else await mutate("/api/neighborhoods", { method: "POST", body: JSON.stringify(body) });
    resetBasicDrafts();
  }

  async function savePaymentMethod() {
    const body = { ...paymentDraft, name: paymentDraft.name.trim() };
    if (!body.name) return;
    if (editingPaymentMethodId) await mutate(`/api/payment-methods/${editingPaymentMethodId}`, { method: "PUT", body: JSON.stringify(body) });
    else await mutate("/api/payment-methods", { method: "POST", body: JSON.stringify(body) });
    resetBasicDrafts();
  }

  async function saveUser() {
    const body = { ...userDraft, name: userDraft.name.trim(), login: userDraft.login.trim(), notes: null };
    if (!body.name || !body.login) return;
    if (editingUserId) await mutate(`/api/users/${editingUserId}`, { method: "PUT", body: JSON.stringify(body) });
    else await mutate("/api/users", { method: "POST", body: JSON.stringify(body) });
    resetBasicDrafts();
  }

  function applySupplierDraft(supplier: NonNullable<typeof selectedSupplier>) {
    setSupplierDraft({
      name: supplier.name ?? "",
      tradeName: supplier.tradeName ?? "",
      typePerson: supplier.typePerson ?? "PJ",
      status: supplier.status ?? (supplier.active ? "ATIVO" : "INATIVO"),
      document: supplier.document ?? "",
      ie: supplier.ie ?? "",
      im: supplier.im ?? "",
      activity: supplier.activity ?? "",
      phone: supplier.phone ?? "",
      phone2: supplier.phone2 ?? "",
      whatsapp: supplier.whatsapp ?? "",
      email: supplier.email ?? "",
      financeEmail: supplier.financeEmail ?? "",
      site: supplier.site ?? "",
      instagram: supplier.instagram ?? "",
      facebook: supplier.facebook ?? "",
      sellerName: supplier.sellerName ?? "",
      sellerPhone: supplier.sellerPhone ?? "",
      sellerWhatsapp: supplier.sellerWhatsapp ?? "",
      sellerEmail: supplier.sellerEmail ?? "",
      cep: supplier.cep ?? "",
      street: supplier.street ?? "",
      number: supplier.number ?? "",
      complement: supplier.complement ?? "",
      district: supplier.district ?? "",
      city: supplier.city ?? "",
      state: supplier.state ?? "",
      reference: supplier.reference ?? "",
      paymentTerm: supplier.paymentTerm ?? "",
      creditLimitCents: supplier.creditLimitCents ?? 0,
      minimumOrderCents: supplier.minimumOrderCents ?? 0,
      visitDay: supplier.visitDay ?? "",
      deliveryFrequency: supplier.deliveryFrequency ?? "",
      bankName: supplier.bankName ?? "",
      agency: supplier.agency ?? "",
      account: supplier.account ?? "",
      pixKey: supplier.pixKey ?? "",
      pixType: supplier.pixType ?? "PIX",
      holderName: supplier.holderName ?? "",
      classification: supplier.classification ?? "Padrão",
      notes: supplier.notes ?? "",
      active: supplier.active
    });
    setSelectedSupplierId(supplier.id);
  }

  function digits(value: string) {
    return value.replace(/\D/g, "");
  }

  function maskCnpj(value: string) {
    const v = digits(value).slice(0, 14);
    return v.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  }

  function maskCep(value: string) {
    const v = digits(value).slice(0, 8);
    return v.replace(/^(\d{5})(\d)/, "$1-$2");
  }

  function maskPhone(value: string) {
    const v = digits(value).slice(0, 11);
    if (v.length <= 10) return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
  }

  async function consultCnpj() {
    const clean = digits(supplierDraft.document);
    if (clean.length !== 14) return;
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
    if (!response.ok) return;
    const payload = await response.json();
    setSupplierDraft((state) => ({
      ...state,
      name: payload.razao_social ?? state.name,
      tradeName: payload.nome_fantasia ?? state.tradeName,
      cep: payload.cep ? maskCep(String(payload.cep)) : state.cep,
      street: payload.logradouro ?? state.street,
      district: payload.bairro ?? state.district,
      city: payload.municipio ?? state.city,
      state: payload.uf ?? state.state
    }));
  }

  async function consultCep() {
    const clean = digits(supplierDraft.cep);
    if (clean.length !== 8) return;
    const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    if (!response.ok) return;
    const payload = await response.json();
    if (payload.erro) return;
    setSupplierDraft((state) => ({
      ...state,
      street: payload.logradouro ?? state.street,
      district: payload.bairro ?? state.district,
      city: payload.localidade ?? state.city,
      state: payload.uf ?? state.state,
      complement: payload.complemento ?? state.complement
    }));
  }

  async function saveSupplier() {
    const body = {
      ...supplierDraft,
      document: digits(supplierDraft.document),
      cep: digits(supplierDraft.cep),
      phone: digits(supplierDraft.phone),
      phone2: digits(supplierDraft.phone2),
      whatsapp: digits(supplierDraft.whatsapp),
      sellerPhone: digits(supplierDraft.sellerPhone),
      sellerWhatsapp: digits(supplierDraft.sellerWhatsapp),
      creditLimitCents: Number(supplierDraft.creditLimitCents) || 0,
      minimumOrderCents: Number(supplierDraft.minimumOrderCents) || 0,
      active: supplierDraft.status === "ATIVO"
    };
    if (selectedSupplierId) await mutate(`/api/suppliers/${selectedSupplierId}`, { method: "PUT", body: JSON.stringify(body) });
    else await mutate("/api/suppliers", { method: "POST", body: JSON.stringify(body) });
    resetSupplierDraft();
  }

  return (
    <section className="page-section cadastro-page">
      <div className="panel cadastro-shell">
        <div className="panel-title">
          <div>
            <h2>Cadastro</h2>
            <span>Submenus organizados para operação rápida</span>
          </div>
        </div>

        <div className="cadastro-layout">
          <aside className="cadastro-menu">
            <div className="cadastro-menu-header">
              <span>Menu</span>
              <strong>Cadastro</strong>
            </div>
            {sections.map(([key, label]) => (
              <button key={key} type="button" className={`${section === key ? "active" : ""} ${sectionTheme[key] ?? ""}`} onClick={() => setSection(key)}>
                <span className="cadastro-menu-label">{label}</span>
                <span className="cadastro-menu-arrow">›</span>
              </button>
            ))}
          </aside>

          <div className="cadastro-content">
            {section === "produtos" ? (
              <div className="panel-grid">
                <section className="panel">
                  <h3>Novo produto</h3>
                  <div className="grid-2">
                    <label>Nome<input value={productDraft.name} onChange={(e) => setProductDraft((state) => ({ ...state, name: e.target.value }))} /></label>
                    <label>Categoria<select value={productDraft.categoryId} onChange={(e) => setProductDraft((state) => ({ ...state, categoryId: e.target.value }))}><option value="">Selecione</option>{data?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    <label>Venda<input type="number" value={productDraft.salePriceCents} onChange={(e) => setProductDraft((state) => ({ ...state, salePriceCents: Number(e.target.value) }))} /></label>
                    <label>Custo<input type="number" value={productDraft.costCents} onChange={(e) => setProductDraft((state) => ({ ...state, costCents: Number(e.target.value) }))} /></label>
                    <label>Estoque<input type="number" value={productDraft.stockCurrent} onChange={(e) => setProductDraft((state) => ({ ...state, stockCurrent: Number(e.target.value) }))} /></label>
                    <label>Impressão<select value={productDraft.printTarget} onChange={(e) => setProductDraft((state) => ({ ...state, printTarget: e.target.value }))}><option value="COZINHA">Cozinha</option><option value="BAR">Bar</option><option value="CAIXA">Caixa</option></select></label>
                  </div>
                  <button onClick={() => mutate("/api/products", { method: "POST", body: JSON.stringify(productDraft) })}>Salvar produto</button>
                </section>
                <section className="panel">
                  <div className="row-between"><h3>Produtos</h3><span style={{ color: "var(--text-muted)", fontSize: 12 }}>Mostrando 2 mais recentes</span></div>
                  <div className="grid-2 supplier-filters">
                    <label>Buscar<input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Código, nome ou categoria" /></label>
                    <label>Status<select value={productStatusFilter} onChange={(e) => setProductStatusFilter(e.target.value)}><option value="">Todos</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label>
                  </div>
                  <div className="table-list">{productList.map((item) => <div className="list-row" key={item.id}><strong>{item.code} - {item.name}</strong><span>{money(item.salePriceCents)}</span><span>{item.printTarget}</span><span>{item.active ? "Ativo" : "Inativo"}</span></div>)}{!productList.length ? <div className="products-empty">Nenhum produto encontrado.</div> : null}</div>
                </section>
              </div>
            ) : null}

            {section === "grupos" ? (
              <div className="panel-grid">
                <section className="panel"><h3>{editingCategoryId ? "Editar grupo" : "Novo grupo"}</h3><label>Nome<input value={groupName} onChange={(e) => setGroupName(e.target.value)} /></label><label><input type="checkbox" checked={groupActive} onChange={(e) => setGroupActive(e.target.checked)} /> Ativo</label><div className="row-actions wrap"><button onClick={() => void saveCategory()}>{editingCategoryId ? "Atualizar grupo" : "Salvar grupo"}</button><button className="ghost" onClick={() => { setGroupName(""); setGroupActive(true); setEditingCategoryId(null); }}>Limpar</button></div></section>
                <section className="panel"><div className="row-between"><h3>Grupos</h3><span style={{ color: "var(--text-muted)", fontSize: 12 }}>Mostrando 2 mais recentes</span></div><div className="grid-2 supplier-filters"><label>Buscar<input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Nome do grupo" /></label><label>Status<select value={groupStatusFilter} onChange={(e) => setGroupStatusFilter(e.target.value)}><option value="">Todos</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label></div><div className="table-list">{categoryList.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.active ? "Ativo" : "Inativo"}</span><span>{item.products?.length ?? 0} produtos</span><div className="row-actions wrap"><button className="ghost" onClick={() => { setGroupName(item.name); setGroupActive(item.active); setEditingCategoryId(item.id); }}>Editar</button><button className="ghost" onClick={() => void mutate(`/api/categories/${item.id}`, { method: "PUT", body: JSON.stringify({ active: !item.active }) })}>{item.active ? "Inativar" : "Ativar"}</button><button className="ghost danger" onClick={() => { if (confirm(`Excluir grupo ${item.name}?`)) void mutate(`/api/categories/${item.id}`, { method: "DELETE" }); }}>Excluir</button></div></div>)}{!categoryList.length ? <div className="products-empty">Nenhum grupo encontrado.</div> : null}</div></section>
              </div>
            ) : null}

            {section === "mesas" ? (
              <div className="panel-grid">
                <section className="panel cadastro-table-panel">
                  <h3>Criar mesas em lote</h3>
                  <p className="cadastro-table-note">Informe quantas mesas o estabelecimento tem. Você pode usar número com dois dígitos, desativar extras e recriar um intervalo inteiro.</p>
                  <div className="summary-grid cadastro-table-stats">
                    <div className="summary-card table-stat total"><span><Table2 size={13} /> Total de mesas</span><strong>{tableStats.total}</strong></div>
                    <div className="summary-card table-stat active"><span><CheckCircle2 size={13} /> Ativas</span><strong>{tableStats.active}</strong></div>
                    <div className="summary-card table-stat inactive"><span><CircleOff size={13} /> Inativas</span><strong>{tableStats.inactive}</strong></div>
                    <div className="summary-card table-stat free"><span><DoorOpen size={13} /> Livres</span><strong>{tableStats.free}</strong></div>
                    <div className="summary-card table-stat occupied"><span><CircleDashed size={13} /> Ocupadas</span><strong>{tableStats.occupied}</strong></div>
                  </div>
                  <div className="grid-2">
                    <label>Prefixo<input value={tableDraft.prefix} onChange={(e) => setTableDraft((state) => ({ ...state, prefix: e.target.value }))} placeholder="Mesa" /></label>
                    <label>Quantidade<input type="number" min={1} value={tableDraft.quantity} onChange={(e) => setTableDraft((state) => ({ ...state, quantity: Number(e.target.value) }))} /></label>
                    <label>Número inicial<input type="number" min={1} value={tableDraft.startAt} onChange={(e) => setTableDraft((state) => ({ ...state, startAt: Number(e.target.value) }))} /></label>
                    <label>Número final (opcional)<input type="number" min={1} value={tableDraft.endAt} onChange={(e) => setTableDraft((state) => ({ ...state, endAt: e.target.value }))} placeholder="Ex: 20" /></label>
                    <label><input type="checkbox" checked={tableDraft.padWidth > 0} onChange={(e) => setTableDraft((state) => ({ ...state, padWidth: e.target.checked ? 2 : 0 }))} /> Usar 2 dígitos</label>
                    <label><input type="checkbox" checked={tableDraft.deactivateExtra} onChange={(e) => setTableDraft((state) => ({ ...state, deactivateExtra: e.target.checked }))} /> Desativar mesas fora da faixa</label>
                    <div className="cadastro-table-summary">
                      <span>Mesas cadastradas</span>
                      <strong>{data?.tables.length ?? 0}</strong>
                    </div>
                  </div>
                  <div className="row-actions wrap">
                    <button onClick={() => submitTables()}>Gerar mesas</button>
                    <button className="ghost" onClick={() => submitTables({ startAt: 1, endAt: 20, quantity: 20, padWidth: 2, deactivateExtra: true })}>Recriar grade 1-20</button>
                    <button className="ghost" onClick={() => mutate("/api/tables/activate-all", { method: "POST" })}>Ativar todas</button>
                    <button className="ghost danger" onClick={() => mutate("/api/tables/deactivate-all", { method: "POST" })}>Desativar todas</button>
                  </div>
                </section>
                <section className="panel">
                  <h3>Mesas existentes</h3>
                  <div className="table-list cadastro-table-list">{data?.tables.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.status}</span><span>{item.active ? "Ativa" : "Inativa"}</span></div>)}</div>
                </section>
              </div>
            ) : null}

            {section === "comandas" ? (
              <div className="panel-grid">
                <section className="panel cadastro-table-panel">
                  <h3>Criar comandas em lote</h3>
                  <p className="cadastro-table-note">Use este bloco para abrir comandas numeradas e manter o fluxo separado das mesas.</p>
                  <div className="grid-2">
                    <label>Quantidade<input type="number" min={1} value={comandaDraft.quantity} onChange={(e) => setComandaDraft((state) => ({ ...state, quantity: Number(e.target.value) }))} /></label>
                    <label>Número inicial<input type="number" min={1} value={comandaDraft.startAt} onChange={(e) => setComandaDraft((state) => ({ ...state, startAt: Number(e.target.value) }))} /></label>
                    <label>Número final (opcional)<input type="number" min={1} value={comandaDraft.endAt} onChange={(e) => setComandaDraft((state) => ({ ...state, endAt: e.target.value }))} placeholder="Ex: 20" /></label>
                    <label><input type="checkbox" checked={comandaDraft.padWidth > 0} onChange={(e) => setComandaDraft((state) => ({ ...state, padWidth: e.target.checked ? 2 : 0 }))} /> Usar 2 dígitos</label>
                    <label><input type="checkbox" checked={comandaDraft.deactivateExtra} onChange={(e) => setComandaDraft((state) => ({ ...state, deactivateExtra: e.target.checked }))} /> Desativar comandas fora da faixa</label>
                  </div>
                  <div className="row-actions wrap">
                    <button onClick={() => void submitComandas()}>Gerar comandas</button>
                    <button className="ghost" onClick={() => setComandaDraft({ quantity: 10, startAt: 1, endAt: "", padWidth: 2, deactivateExtra: true })}>Limpar</button>
                  </div>
                </section>
                <section className="panel"><h3>Comandas existentes</h3><div className="table-list">{data?.tables.filter((item) => item.name.toLowerCase().startsWith("comanda")).map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.status}</span><span>{item.active ? "Ativa" : "Inativa"}</span></div>)}{!data?.tables.filter((item) => item.name.toLowerCase().startsWith("comanda")).length ? <div className="products-empty">Nenhuma comanda cadastrada.</div> : null}</div></section>
              </div>
            ) : null}

            {section === "bairros" ? (
              <div className="panel-grid">
                <section className="panel"><h3>{editingNeighborhoodId ? "Editar bairro" : "Novo bairro"}</h3><div className="grid-2"><label>Nome<input value={neighborhoodDraft.name} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, name: e.target.value }))} /></label><label>Cidade<input value={neighborhoodDraft.city} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, city: e.target.value }))} /></label><label>Taxa de entrega<input type="number" value={neighborhoodDraft.deliveryFeeCents} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, deliveryFeeCents: Number(e.target.value) }))} /></label><label>Tempo médio<input type="number" value={neighborhoodDraft.avgDeliveryMinutes} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, avgDeliveryMinutes: Number(e.target.value) }))} /></label></div><label><input type="checkbox" checked={neighborhoodDraft.active} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, active: e.target.checked }))} /> Ativo</label><div className="row-actions wrap"><button onClick={() => void saveNeighborhood()}>{editingNeighborhoodId ? "Atualizar bairro" : "Salvar bairro"}</button><button className="ghost" onClick={() => { setNeighborhoodDraft({ name: "", city: "", deliveryFeeCents: 0, avgDeliveryMinutes: 30, active: true }); setEditingNeighborhoodId(null); }}>Limpar</button></div></section>
                <section className="panel"><div className="row-between"><h3>Bairros</h3><span style={{ color: "var(--text-muted)", fontSize: 12 }}>Mostrando 2 mais recentes</span></div><div className="grid-2 supplier-filters"><label>Buscar<input value={neighborhoodSearch} onChange={(e) => setNeighborhoodSearch(e.target.value)} placeholder="Nome ou cidade" /></label><label>Status<select value={neighborhoodStatusFilter} onChange={(e) => setNeighborhoodStatusFilter(e.target.value)}><option value="">Todos</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label></div><div className="table-list">{neighborhoodList.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.city}</span><span>{money(item.deliveryFeeCents)}</span><span>{item.avgDeliveryMinutes} min</span><div className="row-actions wrap"><button className="ghost" onClick={() => { setNeighborhoodDraft({ name: item.name, city: item.city, deliveryFeeCents: item.deliveryFeeCents, avgDeliveryMinutes: item.avgDeliveryMinutes, active: item.active }); setEditingNeighborhoodId(item.id); }}>Editar</button><button className="ghost" onClick={() => void mutate(`/api/neighborhoods/${item.id}`, { method: "PUT", body: JSON.stringify({ active: !item.active }) })}>{item.active ? "Inativar" : "Ativar"}</button><button className="ghost danger" onClick={() => { if (confirm(`Excluir bairro ${item.name}?`)) void mutate(`/api/neighborhoods/${item.id}`, { method: "DELETE" }); }}>Excluir</button></div></div>)}{!neighborhoodList.length ? <div className="products-empty">Nenhum bairro encontrado.</div> : null}</div></section>
              </div>
            ) : null}

            {section === "pagamentos" ? (
              <div className="panel-grid">
                <section className="panel"><h3>{editingPaymentMethodId ? "Editar forma de pagamento" : "Nova forma de pagamento"}</h3><div className="grid-2"><label>Nome<input value={paymentDraft.name} onChange={(e) => setPaymentDraft((state) => ({ ...state, name: e.target.value }))} /></label><label><input type="checkbox" checked={paymentDraft.allowFee} onChange={(e) => setPaymentDraft((state) => ({ ...state, allowFee: e.target.checked }))} /> Permite taxa</label><label><input type="checkbox" checked={paymentDraft.active} onChange={(e) => setPaymentDraft((state) => ({ ...state, active: e.target.checked }))} /> Ativo</label></div><div className="row-actions wrap"><button onClick={() => void savePaymentMethod()}>{editingPaymentMethodId ? "Atualizar forma" : "Salvar forma"}</button><button className="ghost" onClick={() => { setPaymentDraft({ name: "", allowFee: false, active: true }); setEditingPaymentMethodId(null); }}>Limpar</button></div></section>
                <section className="panel"><div className="row-between"><h3>Formas de pagamento</h3><span style={{ color: "var(--text-muted)", fontSize: 12 }}>Mostrando 2 mais recentes</span></div><div className="grid-2 supplier-filters"><label>Buscar<input value={paymentSearch} onChange={(e) => setPaymentSearch(e.target.value)} placeholder="Nome da forma" /></label><label>Status<select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)}><option value="">Todos</option><option value="ATIVA">Ativa</option><option value="INATIVA">Inativa</option></select></label></div><div className="table-list">{paymentList.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.allowFee ? "Com taxa" : "Sem taxa"}</span><span>{item.active ? "Ativa" : "Inativa"}</span><div className="row-actions wrap"><button className="ghost" onClick={() => { setPaymentDraft({ name: item.name, allowFee: item.allowFee, active: item.active }); setEditingPaymentMethodId(item.id); }}>Editar</button><button className="ghost" onClick={() => void mutate(`/api/payment-methods/${item.id}`, { method: "PUT", body: JSON.stringify({ active: !item.active }) })}>{item.active ? "Inativar" : "Ativar"}</button><button className="ghost danger" onClick={() => { if (confirm(`Excluir forma de pagamento ${item.name}?`)) void mutate(`/api/payment-methods/${item.id}`, { method: "DELETE" }); }}>Excluir</button></div></div>)}{!paymentList.length ? <div className="products-empty">Nenhuma forma encontrada.</div> : null}</div></section>
              </div>
            ) : null}

            {section === "fornecedores" ? (
              <div className="panel-grid supplier-layout">
                <section className="panel supplier-panel">
                  <div className="row-between">
                    <div>
                      <h3>{selectedSupplierId ? "Editar fornecedor" : "Novo fornecedor"}</h3>
                      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Cadastro completo para compras, financeiro, estoque e histórico.</span>
                    </div>
                    <div className="row-actions wrap">
                      <button className="ghost" onClick={resetSupplierDraft}>Novo</button>
                      <button onClick={saveSupplier}>{selectedSupplierId ? "Atualizar fornecedor" : "Salvar fornecedor"}</button>
                    </div>
                  </div>

                  <div className="summary-grid supplier-summary-grid">
                    <div className="summary-card"><span>Total comprado</span><strong>{money((selectedSupplier?.payables ?? []).reduce((sum, item) => sum + item.amountCents, 0))}</strong></div>
                    <div className="summary-card"><span>Total pago</span><strong>{money((selectedSupplier?.payables ?? []).filter((item) => item.status === "PAGO").reduce((sum, item) => sum + item.amountCents, 0))}</strong></div>
                    <div className="summary-card"><span>Saldo em aberto</span><strong>{money((selectedSupplier?.payables ?? []).filter((item) => item.status !== "PAGO").reduce((sum, item) => sum + item.amountCents, 0))}</strong></div>
                    <div className="summary-card"><span>Última compra</span><strong>{selectedSupplier?.payables?.[0]?.createdAt ? new Date(selectedSupplier.payables[0].createdAt).toLocaleDateString("pt-BR") : "-"}</strong></div>
                    <div className="summary-card"><span>Compras</span><strong>{selectedSupplier?.payables?.length ?? 0}</strong></div>
                  </div>

                  <div className="admin-tabs supplier-tabs">
                    {(["geral", "contatos", "endereco", "comercial", "financeiro", "produtos", "historico", "anexos", "observacoes"] as const).map((tabKey) => (
                      <button key={tabKey} type="button" className={supplierTab === tabKey ? "active" : ""} onClick={() => setSupplierTab(tabKey)}>{tabKey === "geral" ? "Dados Gerais" : tabKey === "contatos" ? "Contatos" : tabKey === "endereco" ? "Endereço" : tabKey === "comercial" ? "Comercial" : tabKey === "financeiro" ? "Financeiro" : tabKey === "produtos" ? "Produtos" : tabKey === "historico" ? "Histórico" : tabKey === "anexos" ? "Anexos" : "Observações"}</button>
                    ))}
                  </div>

                  {supplierTab === "geral" && (
                    <div className="grid-2 supplier-form-grid">
                      <label style={{ gridColumn: "1 / -1" }}>Razão Social<div className="supplier-name-row"><input value={supplierDraft.name} onChange={(e) => setSupplierDraft((state) => ({ ...state, name: e.target.value }))} /><button className="supplier-cnpj-btn" type="button" onClick={() => void consultCnpj()}><Search size={14} /> Consultar CNPJ</button></div></label>
                      <label>Nome Fantasia<input value={supplierDraft.tradeName} onChange={(e) => setSupplierDraft((state) => ({ ...state, tradeName: e.target.value }))} /></label>
                      <label>Tipo<select value={supplierDraft.typePerson} onChange={(e) => setSupplierDraft((state) => ({ ...state, typePerson: e.target.value }))}><option value="PJ">Pessoa Jurídica</option><option value="PF">Pessoa Física</option></select></label>
                      <label>Status<select value={supplierDraft.status} onChange={(e) => setSupplierDraft((state) => ({ ...state, status: e.target.value, active: e.target.value === "ATIVO" }))}><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></label>
                      <label>CNPJ<input value={supplierDraft.document} onChange={(e) => setSupplierDraft((state) => ({ ...state, document: maskCnpj(e.target.value) }))} placeholder="00.000.000/0000-00" /></label>
                      <label>Ramo de atividade<input value={supplierDraft.activity} onChange={(e) => setSupplierDraft((state) => ({ ...state, activity: e.target.value }))} placeholder="Distribuidora de bebidas" /></label>
                      <label>Inscrição Estadual<input value={supplierDraft.ie} onChange={(e) => setSupplierDraft((state) => ({ ...state, ie: e.target.value }))} /></label>
                      <label>Inscrição Municipal<input value={supplierDraft.im} onChange={(e) => setSupplierDraft((state) => ({ ...state, im: e.target.value }))} /></label>
                      <label>Classificação<select value={supplierDraft.classification} onChange={(e) => setSupplierDraft((state) => ({ ...state, classification: e.target.value }))}><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="VIP">VIP</option><option value="Preferencial">Preferencial</option><option value="Bloqueado">Bloqueado</option><option value="Padrão">Padrão</option></select></label>
                      <label>Dia de visita<select value={supplierDraft.visitDay} onChange={(e) => setSupplierDraft((state) => ({ ...state, visitDay: e.target.value }))}><option value="">Selecione</option><option value="Segunda">Segunda</option><option value="Terça">Terça</option><option value="Quarta">Quarta</option><option value="Quinta">Quinta</option><option value="Sexta">Sexta</option></select></label>
                    </div>
                  )}

                  {supplierTab === "contatos" && (
                    <div className="grid-2 supplier-form-grid">
                      <label>Telefone Principal<input value={supplierDraft.phone} onChange={(e) => setSupplierDraft((state) => ({ ...state, phone: maskPhone(e.target.value) }))} placeholder="(00) 0000-0000" /></label>
                      <label>WhatsApp<input value={supplierDraft.whatsapp} onChange={(e) => setSupplierDraft((state) => ({ ...state, whatsapp: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" /></label>
                      <label>Telefone Secundário<input value={supplierDraft.phone2} onChange={(e) => setSupplierDraft((state) => ({ ...state, phone2: maskPhone(e.target.value) }))} /></label>
                      <label>E-mail Comercial<input value={supplierDraft.email} onChange={(e) => setSupplierDraft((state) => ({ ...state, email: e.target.value }))} /></label>
                      <label>E-mail Financeiro<input value={supplierDraft.financeEmail} onChange={(e) => setSupplierDraft((state) => ({ ...state, financeEmail: e.target.value }))} /></label>
                      <label>Site<input value={supplierDraft.site} onChange={(e) => setSupplierDraft((state) => ({ ...state, site: e.target.value }))} /></label>
                      <label>Instagram<input value={supplierDraft.instagram} onChange={(e) => setSupplierDraft((state) => ({ ...state, instagram: e.target.value }))} /></label>
                      <label>Facebook<input value={supplierDraft.facebook} onChange={(e) => setSupplierDraft((state) => ({ ...state, facebook: e.target.value }))} /></label>
                    </div>
                  )}

                  {supplierTab === "endereco" && (
                    <div className="grid-2 supplier-form-grid">
                      <label>CEP<input value={supplierDraft.cep} onChange={(e) => setSupplierDraft((state) => ({ ...state, cep: maskCep(e.target.value) }))} placeholder="00000-000" /></label>
                      <label>Estado<input value={supplierDraft.state} onChange={(e) => setSupplierDraft((state) => ({ ...state, state: e.target.value.toUpperCase().slice(0, 2) }))} maxLength={2} /></label>
                      <label>Rua<input value={supplierDraft.street} onChange={(e) => setSupplierDraft((state) => ({ ...state, street: e.target.value }))} /></label>
                      <label>Número<input value={supplierDraft.number} onChange={(e) => setSupplierDraft((state) => ({ ...state, number: e.target.value }))} /></label>
                      <label>Complemento<input value={supplierDraft.complement} onChange={(e) => setSupplierDraft((state) => ({ ...state, complement: e.target.value }))} /></label>
                      <label>Bairro<input value={supplierDraft.district} onChange={(e) => setSupplierDraft((state) => ({ ...state, district: e.target.value }))} /></label>
                      <label>Cidade<input value={supplierDraft.city} onChange={(e) => setSupplierDraft((state) => ({ ...state, city: e.target.value }))} /></label>
                      <label>Referência<input value={supplierDraft.reference} onChange={(e) => setSupplierDraft((state) => ({ ...state, reference: e.target.value }))} /></label>
                      <div className="row-actions wrap" style={{ gridColumn: "1 / -1" }}>
                        <button className="ghost" type="button" onClick={() => void consultCep()}>Consultar CEP</button>
                      </div>
                    </div>
                  )}

                  {supplierTab === "comercial" && (
                    <div className="grid-2 supplier-form-grid">
                      <label>Prazo de pagamento<input value={supplierDraft.paymentTerm} onChange={(e) => setSupplierDraft((state) => ({ ...state, paymentTerm: e.target.value }))} placeholder="15 dias" /></label>
                      <label>Limite de crédito<input type="number" value={supplierDraft.creditLimitCents} onChange={(e) => setSupplierDraft((state) => ({ ...state, creditLimitCents: Number(e.target.value) }))} /></label>
                      <label>Pedido mínimo<input type="number" value={supplierDraft.minimumOrderCents} onChange={(e) => setSupplierDraft((state) => ({ ...state, minimumOrderCents: Number(e.target.value) }))} /></label>
                      <label>Frequência de entrega<select value={supplierDraft.deliveryFrequency} onChange={(e) => setSupplierDraft((state) => ({ ...state, deliveryFrequency: e.target.value }))}><option value="">Selecione</option><option value="Diária">Diária</option><option value="Semanal">Semanal</option><option value="Quinzenal">Quinzenal</option><option value="Mensal">Mensal</option></select></label>
                      <label>Banco<input value={supplierDraft.bankName} onChange={(e) => setSupplierDraft((state) => ({ ...state, bankName: e.target.value }))} /></label>
                      <label>Conta<input value={supplierDraft.account} onChange={(e) => setSupplierDraft((state) => ({ ...state, account: e.target.value }))} /></label>
                      <label>Agência<input value={supplierDraft.agency} onChange={(e) => setSupplierDraft((state) => ({ ...state, agency: e.target.value }))} /></label>
                      <label>Favorecido<input value={supplierDraft.holderName} onChange={(e) => setSupplierDraft((state) => ({ ...state, holderName: e.target.value }))} /></label>
                    </div>
                  )}

                  {supplierTab === "financeiro" && (
                    <div className="grid-2 supplier-form-grid">
                      <label>PIX<input value={supplierDraft.pixKey} onChange={(e) => setSupplierDraft((state) => ({ ...state, pixKey: e.target.value }))} /></label>
                      <label>Tipo PIX<select value={supplierDraft.pixType} onChange={(e) => setSupplierDraft((state) => ({ ...state, pixType: e.target.value }))}><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="Telefone">Telefone</option><option value="E-mail">E-mail</option><option value="Chave Aleatória">Chave Aleatória</option><option value="PIX">PIX</option></select></label>
                      <label>Representante<input value={supplierDraft.sellerName} onChange={(e) => setSupplierDraft((state) => ({ ...state, sellerName: e.target.value }))} /></label>
                      <label>Telefone representante<input value={supplierDraft.sellerPhone} onChange={(e) => setSupplierDraft((state) => ({ ...state, sellerPhone: maskPhone(e.target.value) }))} /></label>
                      <label>WhatsApp representante<input value={supplierDraft.sellerWhatsapp} onChange={(e) => setSupplierDraft((state) => ({ ...state, sellerWhatsapp: maskPhone(e.target.value) }))} /></label>
                      <label>E-mail representante<input value={supplierDraft.sellerEmail} onChange={(e) => setSupplierDraft((state) => ({ ...state, sellerEmail: e.target.value }))} /></label>
                    </div>
                  )}

                  {supplierTab === "produtos" && (
                    <div className="panel" style={{ background: "var(--bg-elevated)" }}>
                      <strong style={{ display: "block", marginBottom: 8 }}>Produtos fornecidos</strong>
                      <p style={{ margin: 0, color: "var(--text-muted)" }}>A vinculação de produtos será conectada ao estoque e histórico de compras na próxima etapa.</p>
                    </div>
                  )}

                  {supplierTab === "historico" && (
                    <div className="table-list supplier-history-list">
                      {(selectedSupplier?.payables ?? []).length ? (selectedSupplier!.payables ?? []).map((item) => <div className="list-row" key={item.id}><strong>{new Date(item.dueDate).toLocaleDateString("pt-BR")}</strong><span>{item.description}</span><span>{money(item.amountCents)}</span><span>{item.status}</span></div>) : <div className="products-empty">Nenhum histórico encontrado para este fornecedor.</div>}
                    </div>
                  )}

                  {supplierTab === "anexos" && (
                    <div className="panel" style={{ background: "var(--bg-elevated)" }}><strong style={{ display: "block", marginBottom: 8 }}>Anexos</strong><p style={{ margin: 0, color: "var(--text-muted)" }}>Contrato, tabela de preços, boletos, notas fiscais e documentos serão adicionados nesta etapa.</p></div>
                  )}

                  {supplierTab === "observacoes" && (
                    <label>Observações<textarea rows={5} value={supplierDraft.notes} onChange={(e) => setSupplierDraft((state) => ({ ...state, notes: e.target.value }))} placeholder="Entrega somente pela manhã..." /></label>
                  )}
                </section>
                <section className="panel supplier-panel">
                  <div className="row-between">
                    <h3>Fornecedores</h3>
                    <button className="ghost" onClick={() => setSupplierStatusFilter("")}>Limpar filtros</button>
                  </div>
                  <div className="grid-2 supplier-filters">
                    <label>Buscar<input value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Razão social, fantasia, CNPJ..." /></label>
                    <label>Status<select value={supplierStatusFilter} onChange={(e) => setSupplierStatusFilter(e.target.value)}><option value="">Todos</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></label>
                  </div>
                  <div className="table-list supplier-list">
                    {featuredSupplier ? (() => {
                      const item = featuredSupplier;
                      const payables = item.payables ?? [];
                      const totalBought = payables.reduce((sum, payable) => sum + payable.amountCents, 0);
                      const lastPurchase = payables[0]?.createdAt ? new Date(payables[0].createdAt).toLocaleDateString("pt-BR") : "-";
                      return <div className="supplier-card featured" key={item.id} onClick={() => applySupplierDraft(item as any)}>
                        <div className="row-between">
                          <div>
                            <strong>{item.tradeName || item.name}</strong>
                            <span>{item.name}</span>
                          </div>
                          <span className={`supplier-badge ${item.status ?? (item.active ? "ATIVO" : "INATIVO")}`}>{item.status ?? (item.active ? "ATIVO" : "INATIVO")}</span>
                        </div>
                        <div className="supplier-mini-grid">
                          <span>CNPJ <b>{item.document ?? "-"}</b></span>
                          <span>Cidade <b>{item.city ?? "-"}</b></span>
                          <span>Telefone <b>{item.phone ?? "-"}</b></span>
                          <span>WhatsApp <b>{item.whatsapp ?? "-"}</b></span>
                          <span>Última compra <b>{lastPurchase}</b></span>
                          <span>Total comprado <b>{money(totalBought)}</b></span>
                        </div>
                        <div className="row-actions wrap">
                          <button className="ghost" onClick={(event) => { event.stopPropagation(); applySupplierDraft(item as any); }}>Editar</button>
                          <button className="ghost" onClick={(event) => { event.stopPropagation(); setSupplierTab("historico"); applySupplierDraft(item as any); }}>Histórico</button>
                          <button className="ghost danger" onClick={(event) => { event.stopPropagation(); if (confirm(`Excluir fornecedor ${item.name}?`)) void mutate(`/api/suppliers/${item.id}`, { method: "DELETE" }); }}>Excluir</button>
                        </div>
                      </div>;
                    })() : <div className="products-empty">Nenhum fornecedor encontrado.</div>}
                  </div>
                  <p className="supplier-hint">Use a busca para localizar outros fornecedores. Aqui mostramos apenas o último ou o selecionado.</p>
                </section>
              </div>
            ) : null}

            {section === "funcionarios" ? (
              <div className="panel-grid">
                <section className="panel"><h3>{editingUserId && userDraft.role !== "ADMIN" ? "Editar funcionário" : "Novo funcionário"}</h3><div className="grid-2"><label>Nome<input value={userDraft.name} onChange={(e) => setUserDraft((state) => ({ ...state, name: e.target.value }))} /></label><label>Login<input value={userDraft.login} onChange={(e) => setUserDraft((state) => ({ ...state, login: e.target.value }))} /></label><label>Senha<input type="password" value={userDraft.password} onChange={(e) => setUserDraft((state) => ({ ...state, password: e.target.value }))} /></label><label>Função<select value={userDraft.role} onChange={(e) => setUserDraft((state) => ({ ...state, role: e.target.value }))}><option value="GARCOM">Garçom</option><option value="ENTREGADOR">Entregador</option><option value="COZINHA">Cozinha</option><option value="CAIXA">Caixa</option><option value="GERENTE">Gerente</option></select></label></div><label><input type="checkbox" checked={userDraft.active} onChange={(e) => setUserDraft((state) => ({ ...state, active: e.target.checked }))} /> Ativo</label><div className="row-actions wrap"><button onClick={() => void saveUser()}>{editingUserId ? "Atualizar funcionário" : "Salvar funcionário"}</button><button className="ghost" onClick={() => { setUserDraft({ name: "", login: "", password: "123", role: "GARCOM", active: true }); setEditingUserId(null); }}>Limpar</button></div></section>
                <section className="panel"><div className="row-between"><h3>Funcionários</h3><span style={{ color: "var(--text-muted)", fontSize: 12 }}>Mostrando 2 mais recentes</span></div><div className="grid-2 supplier-filters"><label>Buscar<input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="Nome, login ou função" /></label><label>Status<select value={staffStatusFilter} onChange={(e) => setStaffStatusFilter(e.target.value)}><option value="">Todos</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label></div><div className="table-list">{staffList.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.role}</span><span>{item.active ? "Ativo" : "Inativo"}</span><div className="row-actions wrap"><button className="ghost" onClick={() => { setUserDraft({ name: item.name, login: item.login, password: "", role: item.role, active: item.active }); setEditingUserId(item.id); }}>Editar</button><button className="ghost" onClick={() => void mutate(`/api/users/${item.id}`, { method: "PUT", body: JSON.stringify({ active: !item.active }) })}>{item.active ? "Inativar" : "Ativar"}</button><button className="ghost danger" onClick={() => { if (confirm(`Excluir funcionário ${item.name}?`)) void mutate(`/api/users/${item.id}`, { method: "DELETE" }); }}>Excluir</button></div></div>)}{!staffList.length ? <div className="products-empty">Nenhum funcionário encontrado.</div> : null}</div></section>
              </div>
            ) : null}

            {section === "usuarios" ? (
              <div className="panel-grid">
                <section className="panel"><h3>{editingUserId && userDraft.role === "ADMIN" ? "Editar usuário" : "Novo usuário"}</h3><div className="grid-2"><label>Nome<input value={userDraft.name} onChange={(e) => setUserDraft((state) => ({ ...state, name: e.target.value }))} /></label><label>Login<input value={userDraft.login} onChange={(e) => setUserDraft((state) => ({ ...state, login: e.target.value }))} /></label><label>Senha<input type="password" value={userDraft.password} onChange={(e) => setUserDraft((state) => ({ ...state, password: e.target.value }))} /></label><label>Perfil<select value={userDraft.role} onChange={(e) => setUserDraft((state) => ({ ...state, role: e.target.value }))}><option value="ADMIN">Administrador</option><option value="GERENTE">Gerente</option><option value="CAIXA">Caixa</option><option value="GARCOM">Garçom</option><option value="ENTREGADOR">Entregador</option><option value="COZINHA">Cozinha</option></select></label></div><label><input type="checkbox" checked={userDraft.active} onChange={(e) => setUserDraft((state) => ({ ...state, active: e.target.checked }))} /> Ativo</label><div className="row-actions wrap"><button onClick={() => void saveUser()}>{editingUserId ? "Atualizar usuário" : "Salvar usuário"}</button><button className="ghost" onClick={() => { setUserDraft({ name: "", login: "", password: "123", role: "ADMIN", active: true }); setEditingUserId(null); }}>Limpar</button></div></section>
                <section className="panel"><div className="row-between"><h3>Usuários</h3><span style={{ color: "var(--text-muted)", fontSize: 12 }}>Mostrando 2 mais recentes</span></div><div className="grid-2 supplier-filters"><label>Buscar<input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Nome, login ou perfil" /></label><label>Status<select value={userStatusFilter} onChange={(e) => setUserStatusFilter(e.target.value)}><option value="">Todos</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label></div><div className="table-list">{userList.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.login}</span><span>{item.role}</span><span>{item.active ? "Ativo" : "Inativo"}</span><div className="row-actions wrap"><button className="ghost" onClick={() => { setUserDraft({ name: item.name, login: item.login, password: "", role: item.role, active: item.active }); setEditingUserId(item.id); }}>Editar</button><button className="ghost" onClick={() => void mutate(`/api/users/${item.id}`, { method: "PUT", body: JSON.stringify({ active: !item.active }) })}>{item.active ? "Inativar" : "Ativar"}</button><button className="ghost danger" onClick={() => { if (confirm(`Excluir usuário ${item.name}?`)) void mutate(`/api/users/${item.id}`, { method: "DELETE" }); }}>Excluir</button></div></div>)}{!userList.length ? <div className="products-empty">Nenhum usuário encontrado.</div> : null}</div></section>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
