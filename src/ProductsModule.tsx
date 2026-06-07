import React from "react";
import { Package2, Plus, Pencil, Trash2, Copy, Search, ChevronDown, ChevronUp, ToggleLeft, ToggleRight } from "lucide-react";

type MoneyFn = (value: number) => string;
type Product = { id: string; code: number; name: string; salePriceCents: number; costCents: number; marginPercent: number; profitCents: number; stockCurrent: number; stockMin: number; stockMax: number; stockUnit: string; controlStock: boolean; printTarget: string; prepTimeMinutes: number; photoUrl?: string | null; active: boolean; onlineMenu: boolean; featured: boolean; categoryId?: string | null; category?: { id: string; name: string } | null; description?: string | null; shortDescription?: string | null; fullDescription?: string | null; barcode?: string | null; internalCode?: string | null; subcategory?: string | null; availableDelivery: boolean; availableBalcao: boolean; availableMesas: boolean; promoPriceCents?: number | null; promoStart?: string | null; promoEnd?: string | null; containsGluten: boolean; containsLactose: boolean; isVegan: boolean; isVegetarian: boolean; observations?: string | null; nutritionWeight?: string | null; nutritionCalories?: string | null };

type ProductDraft = { name: string; salePriceCents: number; costCents: number; marginPercent: number; profitCents: number; stockCurrent: number; stockMin: number; stockMax: number; stockUnit: string; controlStock: boolean; printTarget: string; prepTimeMinutes: number; photoUrl: string; categoryId: string; description: string; shortDescription: string; fullDescription: string; barcode: string; internalCode: string; subcategory: string; active: boolean; onlineMenu: boolean; featured: boolean; availableDelivery: boolean; availableBalcao: boolean; availableMesas: boolean; promoPriceCents: number; promoStart: string; promoEnd: string; containsGluten: boolean; containsLactose: boolean; isVegan: boolean; isVegetarian: boolean; observations: string; nutritionWeight: string; nutritionCalories: string };

const emptyDraft = (): ProductDraft => ({
  name: "", salePriceCents: 0, costCents: 0, marginPercent: 0, profitCents: 0,
  stockCurrent: 0, stockMin: 0, stockMax: 0, stockUnit: "UN", controlStock: false,
  printTarget: "COZINHA", prepTimeMinutes: 0, photoUrl: "", categoryId: "",
  description: "", shortDescription: "", fullDescription: "", barcode: "", internalCode: "",
  subcategory: "", active: true, onlineMenu: true, featured: false,
  availableDelivery: true, availableBalcao: true, availableMesas: true,
  promoPriceCents: 0, promoStart: "", promoEnd: "",
  containsGluten: false, containsLactose: false, isVegan: false, isVegetarian: false,
  observations: "", nutritionWeight: "", nutritionCalories: ""
});

const printTargets = ["COZINHA", "BAR", "CHURRASQUEIRA", "PIZZA", "LANCHES", "BEBIDAS"];
const stockUnits = ["UN", "KG", "G", "L", "ML", "PORÇÃO"];

function calcProfit(cost: number, sale: number) { return sale - cost; }
function calcMargin(cost: number, sale: number) { return cost > 0 ? Math.round(((sale - cost) / cost) * 100 * 100) / 100 : 0; }
function calcSaleFromMargin(cost: number, margin: number) { return Math.round(cost * (1 + margin / 100)); }

export default function ProductsModule({ data, mutate, money }: { data: { products: Product[]; categories: Array<{ id: string; name: string; sortOrder: number; active: boolean }> } | null; mutate: (path: string, options?: RequestInit) => Promise<void>; money: MoneyFn }) {
  const [draft, setDraft] = React.useState<ProductDraft>(emptyDraft());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [tab, setTab] = React.useState<"geral" | "precos" | "estoque" | "ficha" | "adicionais" | "entrega">("geral");
  const [filter, setFilter] = React.useState({ search: "", categoryId: "", showInactive: false });
  const [showCategories, setShowCategories] = React.useState(false);
  const [categoryName, setCategoryName] = React.useState("");
  const [categorySort, setCategorySort] = React.useState(0);
  const [editingCategory, setEditingCategory] = React.useState<string | null>(null);

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];

  const filteredProducts = products.filter((p) => {
    if (filter.search && !p.name.toLowerCase().includes(filter.search.toLowerCase()) && !String(p.code).includes(filter.search)) return false;
    if (filter.categoryId && p.categoryId !== filter.categoryId) return false;
    if (!filter.showInactive && !p.active) return false;
    return true;
  });

  function openNew() { setDraft(emptyDraft()); setEditingId(null); setShowForm(true); setTab("geral"); }

  function openEdit(product: Product) {
    setDraft({
      name: product.name, salePriceCents: product.salePriceCents, costCents: product.costCents,
      marginPercent: product.marginPercent, profitCents: product.profitCents,
      stockCurrent: product.stockCurrent, stockMin: product.stockMin, stockMax: product.stockMax,
      stockUnit: product.stockUnit, controlStock: product.controlStock,
      printTarget: product.printTarget, prepTimeMinutes: product.prepTimeMinutes,
      photoUrl: product.photoUrl ?? "", categoryId: product.categoryId ?? "",
      description: product.description ?? "", shortDescription: product.shortDescription ?? "",
      fullDescription: product.fullDescription ?? "", barcode: product.barcode ?? "",
      internalCode: product.internalCode ?? "", subcategory: product.subcategory ?? "",
      active: product.active, onlineMenu: product.onlineMenu, featured: product.featured,
      availableDelivery: product.availableDelivery, availableBalcao: product.availableBalcao,
      availableMesas: product.availableMesas,
      promoPriceCents: product.promoPriceCents ?? 0,
      promoStart: product.promoStart ?? "", promoEnd: product.promoEnd ?? "",
      containsGluten: product.containsGluten, containsLactose: product.containsLactose,
      isVegan: product.isVegan, isVegetarian: product.isVegetarian,
      observations: product.observations ?? "",
      nutritionWeight: product.nutritionWeight ?? "",
      nutritionCalories: product.nutritionCalories ?? ""
    });
    setEditingId(product.id);
    setShowForm(true);
    setTab("geral");
  }

  function duplicate(product: Product) {
    setDraft({
      ...emptyDraft(),
      name: `${product.name} (cópia)`,
      salePriceCents: product.salePriceCents,
      costCents: product.costCents,
      marginPercent: product.marginPercent,
      categoryId: product.categoryId ?? "",
      printTarget: product.printTarget,
      onlineMenu: product.onlineMenu,
      active: true
    });
    setEditingId(null);
    setShowForm(true);
    setTab("geral");
  }

  function handleCostChange(value: number) {
    const cost = value;
    const sale = draft.salePriceCents;
    setDraft((s) => ({ ...s, costCents: cost, profitCents: calcProfit(cost, sale), marginPercent: calcMargin(cost, sale) }));
  }

  function handlePriceChange(value: number) {
    const sale = value;
    const cost = draft.costCents;
    setDraft((s) => ({ ...s, salePriceCents: sale, profitCents: calcProfit(cost, sale), marginPercent: calcMargin(cost, sale) }));
  }

  function handleMarginChange(value: number) {
    const cost = draft.costCents;
    const sale = cost > 0 ? calcSaleFromMargin(cost, value) : draft.salePriceCents;
    setDraft((s) => ({ ...s, marginPercent: value, salePriceCents: sale, profitCents: calcProfit(cost, sale) }));
  }

  function handleCostMarginChange(cost: number, margin: number) {
    const sale = cost > 0 ? calcSaleFromMargin(cost, margin) : 0;
    setDraft((s) => ({ ...s, costCents: cost, marginPercent: margin, salePriceCents: sale, profitCents: calcProfit(cost, sale) }));
  }

  async function save() {
    const body: Record<string, unknown> = { ...draft, promoStart: draft.promoStart || null, promoEnd: draft.promoEnd || null };
    if (editingId) {
      await mutate(`/api/products/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await mutate("/api/products", { method: "POST", body: JSON.stringify(body) });
    }
    setShowForm(false);
  }

  async function saveCategory() {
    if (editingCategory) {
      await mutate(`/api/categories/${editingCategory}`, { method: "PUT", body: JSON.stringify({ name: categoryName, sortOrder: categorySort }) });
    } else {
      await mutate("/api/categories", { method: "POST", body: JSON.stringify({ name: categoryName, sortOrder: categorySort }) });
    }
    setCategoryName("");
    setCategorySort(0);
    setEditingCategory(null);
  }

  function editCategory(cat: { id: string; name: string; sortOrder: number }) {
    setCategoryName(cat.name);
    setCategorySort(cat.sortOrder);
    setEditingCategory(cat.id);
  }

  function moneyInput(value: number) { return value; }

  const marginDraft = draft.costCents > 0 ? Math.round(((draft.salePriceCents - draft.costCents) / draft.costCents) * 100) : 0;
  const profitDraft = draft.salePriceCents - draft.costCents;

  return (
    <div className="stack">
      {/* Sub-header */}
      <div className="row-between">
        <h3 style={{ margin: 0 }}><Package2 size={20} /> Gestão de Produtos</h3>
        <div className="row-actions">
          <button className={showCategories ? "active" : "ghost"} onClick={() => setShowCategories(!showCategories)}>Grupos</button>
          <button onClick={openNew}><Plus size={16} /> Novo produto</button>
        </div>
      </div>

      {/* Categories panel */}
      {showCategories && (
        <div className="panel">
          <h3>Grupos / Categorias</h3>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <div className="row-actions">
              <input placeholder="Nome do grupo" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} style={{ width: 240 }} />
              <input type="number" placeholder="Ordem" value={categorySort} onChange={(e) => setCategorySort(Number(e.target.value))} style={{ width: 80 }} />
              <button onClick={saveCategory}><Plus size={14} /> {editingCategory ? "Atualizar" : "Criar"}</button>
              {editingCategory && <button className="ghost" onClick={() => { setCategoryName(""); setCategorySort(0); setEditingCategory(null); }}>Cancelar</button>}
            </div>
          </div>
          <div className="table-list">
            {categories.sort((a, b) => a.sortOrder - b.sortOrder).map((cat) => (
              <div className="list-row" key={cat.id}>
                <strong>{cat.name}</strong>
                <span>Ordem: {cat.sortOrder}</span>
                <span>{cat.active ? "Ativo" : "Inativo"}</span>
                <div className="row-actions">
                  <button className="ghost" onClick={() => editCategory(cat)}><Pencil size={14} /></button>
                  <button className="ghost danger" onClick={() => mutate(`/api/categories/${cat.id}`, { method: "DELETE" })}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="row-between">
        <div className="row-actions">
          <input placeholder="Buscar produto..." value={filter.search} onChange={(e) => setFilter((s) => ({ ...s, search: e.target.value }))} style={{ width: 260 }} />
          <select value={filter.categoryId} onChange={(e) => setFilter((s) => ({ ...s, categoryId: e.target.value }))}>
            <option value="">Todos os grupos</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, color: "#d8c3a5" }}>
            <input type="checkbox" checked={filter.showInactive} onChange={(e) => setFilter((s) => ({ ...s, showInactive: e.target.checked }))} /> Inativos
          </label>
        </div>
        <span style={{ color: "#d8c3a5", fontSize: 13 }}>{filteredProducts.length} produto(s)</span>
      </div>

      {/* Grid */}
      <div className="panel" style={{ overflowX: "auto" }}>
        <div className="table-list">
          <div className="list-row" style={{ fontWeight: 800, color: "#d8c3a5", fontSize: 12, textTransform: "uppercase" }}>
            <span>Cód</span><span>Produto</span><span>Grupo</span><span>Custo</span><span>Venda</span><span>Margem</span><span>Estoque</span><span>Impressão</span><span>Ativo</span><span />
          </div>
          {filteredProducts.map((p) => (
            <div className="list-row" key={p.id}>
              <span style={{ fontWeight: 700 }}>{p.code}</span>
              <span><strong>{p.name}</strong>{p.shortDescription && <small style={{ display: "block", color: "#d8c3a5" }}>{p.shortDescription}</small>}</span>
              <span>{p.category?.name ?? "-"}</span>
              <span>{money(p.costCents)}</span>
              <span>{p.promoPriceCents && p.promoPriceCents > 0 ? <><small style={{ textDecoration: "line-through" }}>{money(p.salePriceCents)}</small> {money(p.promoPriceCents)}</> : money(p.salePriceCents)}</span>
              <span style={{ color: p.marginPercent > 50 ? "#5cf2a5" : p.marginPercent > 20 ? "#ffae42" : "#ff6a40" }}>{p.marginPercent}%</span>
              <span>{p.controlStock ? `${p.stockCurrent} ${p.stockUnit}` : "-"}</span>
              <span>{p.printTarget}</span>
              <span>{p.active ? <ToggleRight size={16} style={{ color: "#5cf2a5" }} /> : <ToggleLeft size={16} style={{ color: "#888" }} />}</span>
              <div className="row-actions">
                <button className="ghost" onClick={() => openEdit(p)}><Pencil size={14} /></button>
                <button className="ghost" onClick={() => duplicate(p)}><Copy size={14} /></button>
                <button className="ghost danger" onClick={() => mutate(`/api/products/${p.id}`, { method: "DELETE" })}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="panel" style={{ border: "2px solid rgba(255,183,77,.3)" }}>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{editingId ? "Editar" : "Novo"} produto</h3>
            <button className="ghost" onClick={() => setShowForm(false)}>Fechar</button>
          </div>

          {/* Tabs */}
          <div className="row-actions" style={{ marginBottom: 14, borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 10 }}>
            {([["geral", "Dados Gerais"], ["precos", "Preços"], ["estoque", "Estoque"], ["ficha", "Ficha Técnica"], ["adicionais", "Adicionais"], ["entrega", "Entrega/Promoção"]] as const).map(([key, label]) => (
              <button key={key} className={tab === key ? "" : "ghost"} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          {/* Geral */}
          {tab === "geral" && (
            <div className="grid-2">
              <label>Nome<input value={draft.name} onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))} /></label>
              <label>Código interno<input value={draft.internalCode} onChange={(e) => setDraft((s) => ({ ...s, internalCode: e.target.value }))} /></label>
              <label>Código de barras<input value={draft.barcode} onChange={(e) => setDraft((s) => ({ ...s, barcode: e.target.value }))} /></label>
              <label>Grupo<select value={draft.categoryId} onChange={(e) => setDraft((s) => ({ ...s, categoryId: e.target.value }))}><option value="">Selecione</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>
              <label>Subgrupo<input value={draft.subcategory} onChange={(e) => setDraft((s) => ({ ...s, subcategory: e.target.value }))} /></label>
              <label>Descrição curta<input value={draft.shortDescription} onChange={(e) => setDraft((s) => ({ ...s, shortDescription: e.target.value }))} /></label>
              <label style={{ gridColumn: "1 / -1" }}>Descrição completa<textarea rows={3} value={draft.fullDescription} onChange={(e) => setDraft((s) => ({ ...s, fullDescription: e.target.value }))} /></label>
              <label>URL da foto<input value={draft.photoUrl} onChange={(e) => setDraft((s) => ({ ...s, photoUrl: e.target.value }))} /></label>
              <label>Observações<textarea rows={2} value={draft.observations} onChange={(e) => setDraft((s) => ({ ...s, observations: e.target.value }))} /></label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.active} onChange={(e) => setDraft((s) => ({ ...s, active: e.target.checked }))} /> Ativo</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.featured} onChange={(e) => setDraft((s) => ({ ...s, featured: e.target.checked }))} /> Destaque no cardápio</label>
              <label>Local de impressão<select value={draft.printTarget} onChange={(e) => setDraft((s) => ({ ...s, printTarget: e.target.value }))}>{printTargets.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
              <label>Tempo de preparo (min)<input type="number" value={draft.prepTimeMinutes} onChange={(e) => setDraft((s) => ({ ...s, prepTimeMinutes: Number(e.target.value) }))} /></label>
              <label style={{ gridColumn: "1 / -1" }}>Disponível para:<div className="row-actions"><label style={{ fontWeight: 400 }}><input type="checkbox" checked={draft.onlineMenu} onChange={(e) => setDraft((s) => ({ ...s, onlineMenu: e.target.checked }))} /> Cardápio Online</label><label style={{ fontWeight: 400 }}><input type="checkbox" checked={draft.availableDelivery} onChange={(e) => setDraft((s) => ({ ...s, availableDelivery: e.target.checked }))} /> Delivery</label><label style={{ fontWeight: 400 }}><input type="checkbox" checked={draft.availableBalcao} onChange={(e) => setDraft((s) => ({ ...s, availableBalcao: e.target.checked }))} /> Balcão</label><label style={{ fontWeight: 400 }}><input type="checkbox" checked={draft.availableMesas} onChange={(e) => setDraft((s) => ({ ...s, availableMesas: e.target.checked }))} /> Mesas</label></div></label>
            </div>
          )}

          {/* Preços */}
          {tab === "precos" && (
            <div className="grid-2">
              <label>Custo unitário (R$)<input type="number" step="0.01" value={draft.costCents / 100} onChange={(e) => handleCostChange(Math.round(Number(e.target.value) * 100))} /></label>
              <label>Preço de venda (R$)<input type="number" step="0.01" value={draft.salePriceCents / 100} onChange={(e) => handlePriceChange(Math.round(Number(e.target.value) * 100))} /></label>
              <label>Margem desejada (%)<input type="number" step="0.1" value={draft.marginPercent} onChange={(e) => handleMarginChange(Number(e.target.value))} /></label>
              <label>Lucro unitário<strong style={{ fontSize: 24, color: "#5cf2a5" }}>{money(profitDraft)}</strong></label>
              <label style={{ gridColumn: "1 / -1" }}>
                <div className="panel" style={{ background: "rgba(92,242,165,.06)", border: "1px solid rgba(92,242,165,.15)" }}>
                  <strong>Formação automática</strong>
                  <div className="grid-2" style={{ marginTop: 8 }}>
                    <label>Custo (R$)<input type="number" step="0.01" value={draft.costCents / 100} onChange={(e) => handleCostMarginChange(Math.round(Number(e.target.value) * 100), draft.marginPercent)} /></label>
                    <label>Margem desejada (%)<input type="number" step="0.1" value={draft.marginPercent} onChange={(e) => handleCostMarginChange(draft.costCents, Number(e.target.value))} /></label>
                  </div>
                  <p style={{ margin: "8px 0 0", color: "#d8c3a5" }}>Preço calculado: <strong style={{ color: "#fff", fontSize: 18 }}>{money(draft.salePriceCents)}</strong>  |  Lucro: <strong style={{ color: "#5cf2a5" }}>{money(profitDraft)}</strong>  |  Margem: <strong>{marginDraft}%</strong></p>
                </div>
              </label>
              <label>Preço promocional (R$)<input type="number" step="0.01" value={draft.promoPriceCents / 100} onChange={(e) => setDraft((s) => ({ ...s, promoPriceCents: Math.round(Number(e.target.value) * 100) }))} /></label>
              <label>Início promoção<input type="date" value={draft.promoStart} onChange={(e) => setDraft((s) => ({ ...s, promoStart: e.target.value }))} /></label>
              <label>Fim promoção<input type="date" value={draft.promoEnd} onChange={(e) => setDraft((s) => ({ ...s, promoEnd: e.target.value }))} /></label>
            </div>
          )}

          {/* Estoque */}
          {tab === "estoque" && (
            <div className="grid-2">
              <label style={{ gridColumn: "1 / -1" }}><input type="checkbox" checked={draft.controlStock} onChange={(e) => setDraft((s) => ({ ...s, controlStock: e.target.checked }))} /> Controlar estoque</label>
              <label>Estoque atual<input type="number" value={draft.stockCurrent} onChange={(e) => setDraft((s) => ({ ...s, stockCurrent: Number(e.target.value) }))} /></label>
              <label>Estoque mínimo<input type="number" value={draft.stockMin} onChange={(e) => setDraft((s) => ({ ...s, stockMin: Number(e.target.value) }))} /></label>
              <label>Estoque máximo<input type="number" value={draft.stockMax} onChange={(e) => setDraft((s) => ({ ...s, stockMax: Number(e.target.value) }))} /></label>
              <label>Unidade<select value={draft.stockUnit} onChange={(e) => setDraft((s) => ({ ...s, stockUnit: e.target.value }))}>{stockUnits.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
            </div>
          )}

          {/* Ficha Técnica */}
          {tab === "ficha" && (
            <div>
              <p style={{ color: "#d8c3a5" }}>Ingredientes da ficha técnica (baixam do estoque ao vender) — <em>funcionalidade disponível via API</em></p>
              <div className="grid-2">
                <label>Peso / Volume<input value={draft.nutritionWeight} onChange={(e) => setDraft((s) => ({ ...s, nutritionWeight: e.target.value }))} placeholder="Ex: 250g" /></label>
                <label>Calorias<input value={draft.nutritionCalories} onChange={(e) => setDraft((s) => ({ ...s, nutritionCalories: e.target.value }))} placeholder="Ex: 450 kcal" /></label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.containsGluten} onChange={(e) => setDraft((s) => ({ ...s, containsGluten: e.target.checked }))} /> Contém glúten</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.containsLactose} onChange={(e) => setDraft((s) => ({ ...s, containsLactose: e.target.checked }))} /> Contém lactose</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.isVegan} onChange={(e) => setDraft((s) => ({ ...s, isVegan: e.target.checked }))} /> Vegano</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.isVegetarian} onChange={(e) => setDraft((s) => ({ ...s, isVegetarian: e.target.checked }))} /> Vegetariano</label>
              </div>
            </div>
          )}

          {/* Adicionais */}
          {tab === "adicionais" && (
            <div>
              <p style={{ color: "#d8c3a5" }}>Os adicionais disponíveis para este produto são gerenciados separadamente no cadastro de adicionais.</p>
            </div>
          )}

          {/* Entrega/Promoção */}
          {tab === "entrega" && (
            <div className="grid-2">
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.onlineMenu} onChange={(e) => setDraft((s) => ({ ...s, onlineMenu: e.target.checked }))} /> Cardápio Online</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.availableDelivery} onChange={(e) => setDraft((s) => ({ ...s, availableDelivery: e.target.checked }))} /> Disponível para Delivery</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.featured} onChange={(e) => setDraft((s) => ({ ...s, featured: e.target.checked }))} /> Produto em destaque</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.onlineMenu} onChange={(e) => setDraft((s) => ({ ...s, onlineMenu: e.target.checked }))} /> Exibir no cardápio online</label>
            </div>
          )}

          <div className="row-actions" style={{ marginTop: 16 }}>
            <button onClick={save}>{editingId ? "Atualizar" : "Criar"} produto</button>
            <button className="ghost" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
