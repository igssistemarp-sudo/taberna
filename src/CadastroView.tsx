import React from "react";

type CadastroData = {
  categories: Array<{ id: string; name: string; active: boolean; products?: Array<unknown> }>;
  neighborhoods: Array<{ id: string; name: string; city: string; deliveryFeeCents: number; avgDeliveryMinutes: number; active: boolean }>;
  paymentMethods: Array<{ id: string; name: string; allowFee: boolean; active: boolean }>;
  suppliers: Array<{ id: string; name: string; document?: string | null; phone?: string | null; email?: string | null; active: boolean }>;
  users: Array<{ id: string; name: string; login: string; role: string; active: boolean }>;
  printers: Array<{ id: string; name: string; type: string; ip: string; port: number; active: boolean }>;
  products: Array<{ id: string; code: number; name: string; salePriceCents: number; costCents: number; stockCurrent: number; active: boolean; categoryId?: string | null; category?: { id: string; name: string } | null; printTarget: string }>;
};

type CadastroProps = {
  data: CadastroData | null;
  money: (value: number) => string;
  companyDraft: { razaoSocial: string; nomeFantasia: string; onlineMenuSlug: string; serviceFeeEnabled: boolean; serviceFeePercent: number; openingHours: string; printerKitchenIp: string; printerBarIp: string; printerCashIp: string; printerPort: number; theme: string };
  setCompanyDraft: React.Dispatch<React.SetStateAction<{ razaoSocial: string; nomeFantasia: string; onlineMenuSlug: string; serviceFeeEnabled: boolean; serviceFeePercent: number; openingHours: string; printerKitchenIp: string; printerBarIp: string; printerCashIp: string; printerPort: number; theme: string }>>;
  mutate: (path: string, options?: RequestInit) => Promise<void>;
};

export default function CadastroView({ data, money, companyDraft, setCompanyDraft, mutate }: CadastroProps) {
  const [section, setSection] = React.useState<"produtos" | "grupos" | "bairros" | "pagamentos" | "fornecedores" | "funcionarios" | "usuarios" | "empresa">("produtos");
  const [productDraft, setProductDraft] = React.useState({ name: "", salePriceCents: 0, costCents: 0, stockCurrent: 0, categoryId: "", printTarget: "COZINHA", active: true });
  const [groupName, setGroupName] = React.useState("");
  const [neighborhoodDraft, setNeighborhoodDraft] = React.useState({ name: "", city: "", deliveryFeeCents: 0, avgDeliveryMinutes: 30, active: true });
  const [paymentDraft, setPaymentDraft] = React.useState({ name: "", allowFee: false, active: true });
  const [supplierDraft, setSupplierDraft] = React.useState({ name: "", document: "", phone: "", email: "", active: true });
  const [userDraft, setUserDraft] = React.useState({ name: "", login: "", password: "123", role: "GARCOM", active: true });

  const sections = [
    ["produtos", "Produtos"],
    ["grupos", "Grupos"],
    ["bairros", "Bairros"],
    ["pagamentos", "Formas de pagamento"],
    ["fornecedores", "Fornecedores"],
    ["funcionarios", "Funcionários"],
    ["usuarios", "Usuários"],
    ["empresa", "Empresa"]
  ] as const;

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
          <div className="cadastro-menu">
            {sections.map(([key, label]) => (
              <button key={key} type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)}>{label}</button>
            ))}
          </div>

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
                  <h3>Produtos</h3>
                  <div className="table-list">{data?.products.map((item) => <div className="list-row" key={item.id}><strong>{item.code} - {item.name}</strong><span>{money(item.salePriceCents)}</span><span>{item.printTarget}</span><span>{item.active ? "Ativo" : "Inativo"}</span></div>)}</div>
                </section>
              </div>
            ) : null}

            {section === "grupos" ? (
              <div className="panel-grid">
                <section className="panel"><h3>Novo grupo</h3><label>Nome<input value={groupName} onChange={(e) => setGroupName(e.target.value)} /></label><button onClick={() => mutate("/api/categories", { method: "POST", body: JSON.stringify({ name: groupName, active: true }) })}>Salvar grupo</button></section>
                <section className="panel"><h3>Grupos</h3><div className="table-list">{data?.categories.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.active ? "Ativo" : "Inativo"}</span><span>{item.products?.length ?? 0} produtos</span></div>)}</div></section>
              </div>
            ) : null}

            {section === "bairros" ? (
              <div className="panel-grid">
                <section className="panel"><h3>Novo bairro</h3><div className="grid-2"><label>Nome<input value={neighborhoodDraft.name} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, name: e.target.value }))} /></label><label>Cidade<input value={neighborhoodDraft.city} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, city: e.target.value }))} /></label><label>Taxa de entrega<input type="number" value={neighborhoodDraft.deliveryFeeCents} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, deliveryFeeCents: Number(e.target.value) }))} /></label><label>Tempo médio<input type="number" value={neighborhoodDraft.avgDeliveryMinutes} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, avgDeliveryMinutes: Number(e.target.value) }))} /></label></div><label><input type="checkbox" checked={neighborhoodDraft.active} onChange={(e) => setNeighborhoodDraft((state) => ({ ...state, active: e.target.checked }))} /> Ativo</label><button onClick={() => mutate("/api/neighborhoods", { method: "POST", body: JSON.stringify(neighborhoodDraft) })}>Salvar bairro</button></section>
                <section className="panel"><h3>Bairros</h3><div className="table-list">{data?.neighborhoods.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.city}</span><span>{money(item.deliveryFeeCents)}</span><span>{item.avgDeliveryMinutes} min</span></div>)}</div></section>
              </div>
            ) : null}

            {section === "pagamentos" ? (
              <div className="panel-grid">
                <section className="panel"><h3>Nova forma de pagamento</h3><div className="grid-2"><label>Nome<input value={paymentDraft.name} onChange={(e) => setPaymentDraft((state) => ({ ...state, name: e.target.value }))} /></label><label><input type="checkbox" checked={paymentDraft.allowFee} onChange={(e) => setPaymentDraft((state) => ({ ...state, allowFee: e.target.checked }))} /> Permite taxa</label><label><input type="checkbox" checked={paymentDraft.active} onChange={(e) => setPaymentDraft((state) => ({ ...state, active: e.target.checked }))} /> Ativo</label></div><button onClick={() => mutate("/api/payment-methods", { method: "POST", body: JSON.stringify(paymentDraft) })}>Salvar forma</button></section>
                <section className="panel"><h3>Formas de pagamento</h3><div className="table-list">{data?.paymentMethods.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.allowFee ? "Com taxa" : "Sem taxa"}</span><span>{item.active ? "Ativa" : "Inativa"}</span></div>)}</div></section>
              </div>
            ) : null}

            {section === "fornecedores" ? (
              <div className="panel-grid">
                <section className="panel"><h3>Novo fornecedor</h3><div className="grid-2"><label>Nome<input value={supplierDraft.name} onChange={(e) => setSupplierDraft((state) => ({ ...state, name: e.target.value }))} /></label><label>Documento<input value={supplierDraft.document} onChange={(e) => setSupplierDraft((state) => ({ ...state, document: e.target.value }))} /></label><label>Telefone<input value={supplierDraft.phone} onChange={(e) => setSupplierDraft((state) => ({ ...state, phone: e.target.value }))} /></label><label>E-mail<input value={supplierDraft.email} onChange={(e) => setSupplierDraft((state) => ({ ...state, email: e.target.value }))} /></label></div><label><input type="checkbox" checked={supplierDraft.active} onChange={(e) => setSupplierDraft((state) => ({ ...state, active: e.target.checked }))} /> Ativo</label><button onClick={() => mutate("/api/suppliers", { method: "POST", body: JSON.stringify(supplierDraft) })}>Salvar fornecedor</button></section>
                <section className="panel"><h3>Fornecedores</h3><div className="table-list">{data?.suppliers.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.phone ?? "-"}</span><span>{item.active ? "Ativo" : "Inativo"}</span></div>)}</div></section>
              </div>
            ) : null}

            {section === "funcionarios" ? (
              <div className="panel-grid">
                <section className="panel"><h3>Novo funcionário</h3><div className="grid-2"><label>Nome<input value={userDraft.name} onChange={(e) => setUserDraft((state) => ({ ...state, name: e.target.value }))} /></label><label>Login<input value={userDraft.login} onChange={(e) => setUserDraft((state) => ({ ...state, login: e.target.value }))} /></label><label>Senha<input type="password" value={userDraft.password} onChange={(e) => setUserDraft((state) => ({ ...state, password: e.target.value }))} /></label><label>Função<select value={userDraft.role} onChange={(e) => setUserDraft((state) => ({ ...state, role: e.target.value }))}><option value="GARCOM">Garçom</option><option value="ENTREGADOR">Entregador</option><option value="COZINHA">Cozinha</option><option value="CAIXA">Caixa</option><option value="GERENTE">Gerente</option></select></label></div><label><input type="checkbox" checked={userDraft.active} onChange={(e) => setUserDraft((state) => ({ ...state, active: e.target.checked }))} /> Ativo</label><button onClick={() => mutate("/api/users", { method: "POST", body: JSON.stringify({ ...userDraft, notes: null }) })}>Salvar funcionário</button></section>
                <section className="panel"><h3>Funcionários</h3><div className="table-list">{data?.users.filter((item) => item.role !== "ADMIN").map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.role}</span><span>{item.active ? "Ativo" : "Inativo"}</span></div>)}</div></section>
              </div>
            ) : null}

            {section === "usuarios" ? (
              <div className="panel-grid">
                <section className="panel"><h3>Novo usuário</h3><div className="grid-2"><label>Nome<input value={userDraft.name} onChange={(e) => setUserDraft((state) => ({ ...state, name: e.target.value }))} /></label><label>Login<input value={userDraft.login} onChange={(e) => setUserDraft((state) => ({ ...state, login: e.target.value }))} /></label><label>Senha<input type="password" value={userDraft.password} onChange={(e) => setUserDraft((state) => ({ ...state, password: e.target.value }))} /></label><label>Perfil<select value={userDraft.role} onChange={(e) => setUserDraft((state) => ({ ...state, role: e.target.value }))}><option value="ADMIN">Administrador</option><option value="GERENTE">Gerente</option><option value="CAIXA">Caixa</option><option value="GARCOM">Garçom</option><option value="ENTREGADOR">Entregador</option><option value="COZINHA">Cozinha</option></select></label></div><label><input type="checkbox" checked={userDraft.active} onChange={(e) => setUserDraft((state) => ({ ...state, active: e.target.checked }))} /> Ativo</label><button onClick={() => mutate("/api/users", { method: "POST", body: JSON.stringify({ ...userDraft, notes: null }) })}>Salvar usuário</button></section>
                <section className="panel"><h3>Usuários</h3><div className="table-list">{data?.users.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.login}</span><span>{item.role}</span><span>{item.active ? "Ativo" : "Inativo"}</span></div>)}</div></section>
              </div>
            ) : null}

            {section === "empresa" ? (
              <div className="panel-grid">
                <section className="panel"><h3>Empresa</h3><div className="grid-2"><label>Razão social<input value={companyDraft.razaoSocial} onChange={(e) => setCompanyDraft((state) => ({ ...state, razaoSocial: e.target.value }))} /></label><label>Nome fantasia<input value={companyDraft.nomeFantasia} onChange={(e) => setCompanyDraft((state) => ({ ...state, nomeFantasia: e.target.value }))} /></label><label>Link do cardápio<input value={companyDraft.onlineMenuSlug} onChange={(e) => setCompanyDraft((state) => ({ ...state, onlineMenuSlug: e.target.value }))} /></label><label>Horário<input value={companyDraft.openingHours} onChange={(e) => setCompanyDraft((state) => ({ ...state, openingHours: e.target.value }))} /></label><label>IP cozinha<input value={companyDraft.printerKitchenIp} onChange={(e) => setCompanyDraft((state) => ({ ...state, printerKitchenIp: e.target.value }))} /></label><label>IP bar<input value={companyDraft.printerBarIp} onChange={(e) => setCompanyDraft((state) => ({ ...state, printerBarIp: e.target.value }))} /></label><label>IP caixa<input value={companyDraft.printerCashIp} onChange={(e) => setCompanyDraft((state) => ({ ...state, printerCashIp: e.target.value }))} /></label><label>Porta<input type="number" value={companyDraft.printerPort} onChange={(e) => setCompanyDraft((state) => ({ ...state, printerPort: Number(e.target.value) }))} /></label><label>Taxa de serviço<input type="number" value={companyDraft.serviceFeePercent} onChange={(e) => setCompanyDraft((state) => ({ ...state, serviceFeePercent: Number(e.target.value) }))} /></label></div><label><input type="checkbox" checked={companyDraft.serviceFeeEnabled} onChange={(e) => setCompanyDraft((state) => ({ ...state, serviceFeeEnabled: e.target.checked }))} /> Habilitar taxa de serviço</label><button onClick={() => mutate("/api/company", { method: "PUT", body: JSON.stringify(companyDraft) })}>Salvar configurações</button></section><section className="panel"><h3>Impressoras</h3><div className="table-list">{data?.printers.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.type}</span><span>{item.ip}:{item.port}</span><span>{item.active ? "Ativa" : "Inativa"}</span></div>)}</div></section></div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
