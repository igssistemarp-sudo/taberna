import React from "react";
import { Package2, Plus, Pencil, Trash2, Copy, Search, X, ToggleLeft, ToggleRight, Percent, DollarSign, Filter } from "lucide-react";

type MoneyFn = (value: number) => string;
type Product = { id: string; code: number; name: string; salePriceCents: number; costCents: number; marginPercent: number; profitCents: number; stockCurrent: number; stockMin: number; stockMax: number; stockUnit: string; controlStock: boolean; printTarget: string; prepTimeMinutes: number; photoUrl?: string | null; photos?: Array<{ id: string; url: string; sortOrder: number }>; active: boolean; onlineMenu: boolean; featured: boolean; categoryId?: string | null; category?: { id: string; name: string } | null; description?: string | null; shortDescription?: string | null; fullDescription?: string | null; barcode?: string | null; internalCode?: string | null; subcategory?: string | null; availableDelivery: boolean; availableBalcao: boolean; availableMesas: boolean; promoPriceCents?: number | null; promoStart?: string | null; promoEnd?: string | null; containsGluten: boolean; containsLactose: boolean; isVegan: boolean; isVegetarian: boolean; observations?: string | null; nutritionWeight?: string | null; nutritionCalories?: string | null };

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

function productPhoto(p: Product) { return p.photoUrl || p.photos?.[0]?.url || undefined; }

async function fileToCompressedDataUrl(file: File, maxSize = 900, quality = 0.82) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fileToDataUrl(file);
  ctx.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(image.src);

  return await new Promise<string>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(fileToDataUrl(file));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    }, file.type === "image/png" ? "image/png" : "image/jpeg", quality);
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

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
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];
  const activeCount = products.filter((p) => p.active).length;
  const photoCount = products.filter((p) => productPhoto(p)).length;
  const featuredCount = products.filter((p) => p.featured).length;
  const lowStockCount = products.filter((p) => p.controlStock && p.stockCurrent <= p.stockMin).length;

  const filteredProducts = products.filter((p) => {
    if (filter.search && !p.name.toLowerCase().includes(filter.search.toLowerCase()) && !String(p.code).includes(filter.search) && !(p.barcode && p.barcode.includes(filter.search)) && !(p.internalCode && p.internalCode.toLowerCase().includes(filter.search.toLowerCase()))) return false;
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
      photoUrl: product.photoUrl ?? product.photos?.[0]?.url ?? "", categoryId: product.categoryId ?? "",
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
    setDraft({ ...emptyDraft(), name: `${product.name} (cópia)`, salePriceCents: product.salePriceCents, costCents: product.costCents, marginPercent: product.marginPercent, categoryId: product.categoryId ?? "", printTarget: product.printTarget, onlineMenu: product.onlineMenu, active: true });
    setEditingId(null);
    setShowForm(true);
    setTab("geral");
  }

  async function toggleActive(product: Product) {
    try { await mutate(`/api/products/${product.id}`, { method: "PUT", body: JSON.stringify({ active: !product.active }) }); } catch (e: any) { setError(e.message); }
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
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...draft, promoStart: draft.promoStart || null, promoEnd: draft.promoEnd || null };
      if (editingId) {
        await mutate(`/api/products/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await mutate("/api/products", { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
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

  const marginDraft = draft.costCents > 0 ? Math.round(((draft.salePriceCents - draft.costCents) / draft.costCents) * 100) : 0;
  const profitDraft = draft.salePriceCents - draft.costCents;

  return (
    <div className="stack products-module">
      {error && <div className="toast" style={{ position: "static", marginBottom: 8 }}>{error}<button className="ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>OK</button></div>}
      {loading && <div className="loading-bar" />}
      <section className="products-hero">
        <div>
          <span>Cadastro de Produtos</span>
          <h2>Cardápio, foto, preço e estoque</h2>
          <p>Controle visual para criar, editar, duplicar e organizar seus produtos mais rápido.</p>
        </div>
        <div className="products-kpis">
          <article><strong>{products.length}</strong><span>Produtos</span></article>
          <article><strong>{activeCount}</strong><span>Ativos</span></article>
          <article><strong>{photoCount}</strong><span>Com foto</span></article>
          <article><strong>{lowStockCount}</strong><span>Estoque baixo</span></article>
          <article><strong>{featuredCount}</strong><span>Destaque</span></article>
        </div>
      </section>
      {/* Header */}
      <div className="row-between">
        <div><h2 style={{ margin: 0 }}><Package2 size={22} style={{ marginRight: 8, color: "#059669" }} />Produtos</h2><span style={{ color: "var(--text-muted)", fontSize: 13 }}>{products.length} cadastrados</span></div>
        <div className="row-actions">
          <button className={showCategories ? "active" : "ghost"} onClick={() => setShowCategories(!showCategories)} style={{ borderRadius: 10, padding: "8px 16px" }}><Filter size={15} /> Grupos</button>
          <button onClick={openNew} style={{ background: "linear-gradient(135deg, #059669, #0d9488)", border: "none", borderRadius: 10, padding: "8px 18px", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(5,150,105,0.3)" }}><Plus size={15} /> Novo Produto</button>
        </div>
      </div>

      {/* Categories panel */}
      {showCategories && (
        <div className="panel products-category-panel" style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, background: "#fff" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#1e293b" }}>Grupos / Categorias</h3>
          <div className="row-between" style={{ marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <div className="row-actions" style={{ gap: 8 }}>
              <input placeholder="Nome do grupo" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} style={{ width: 220, borderRadius: 8, border: "1px solid #e2e8f0", padding: "8px 12px", fontSize: 13 }} />
              <input type="number" placeholder="Ordem" value={categorySort} onChange={(e) => setCategorySort(Number(e.target.value))} style={{ width: 70, borderRadius: 8, border: "1px solid #e2e8f0", padding: "8px 12px", fontSize: 13 }} />
              <button onClick={saveCategory} style={{ background: "linear-gradient(135deg, #10b981, #059669)", border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}><Plus size={14} /> {editingCategory ? "Atualizar" : "Criar"}</button>
              {editingCategory && <button className="ghost" onClick={() => { setCategoryName(""); setCategorySort(0); setEditingCategory(null); }} style={{ borderRadius: 8, padding: "8px 16px", fontSize: 13 }}>Cancelar</button>}
            </div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {categories.sort((a, b) => a.sortOrder - b.sortOrder).map((cat) => (
              <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <strong style={{ flex: 1, color: "#1e293b", fontSize: 14 }}>{cat.name}</strong>
                <span style={{ color: "#64748b", fontSize: 12 }}>Ordem: {cat.sortOrder}</span>
                <span style={{ fontSize: 12, color: cat.active ? "#10b981" : "#ef4444", fontWeight: 600 }}>{cat.active ? "Ativo" : "Inativo"}</span>
                <div className="row-actions">
                  <button className="ghost" onClick={() => editCategory(cat)} style={{ padding: 6, borderRadius: 8 }}><Pencil size={14} /></button>
                  <button className="ghost danger" onClick={() => mutate(`/api/categories/${cat.id}`, { method: "DELETE" })} style={{ padding: 6, borderRadius: 8 }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="products-toolbar">
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input placeholder="Buscar por nome, código, código de barras ou código interno..." value={filter.search} onChange={(e) => setFilter((s) => ({ ...s, search: e.target.value }))} autoFocus style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }} onFocus={(e) => e.target.style.borderColor = "#2563eb"} onBlur={(e) => e.target.style.borderColor = "#e2e8f0"} />
          {filter.search && <button onClick={() => setFilter((s) => ({ ...s, search: "" }))} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}><X size={14} /></button>}
        </div>
        <select value={filter.categoryId} onChange={(e) => setFilter((s) => ({ ...s, categoryId: e.target.value }))} style={{ borderRadius: 10, border: "1px solid #e2e8f0", padding: "10px 12px", fontSize: 13, background: "#fff", minWidth: 140 }}>
          <option value="">Todos os grupos</option>
          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, fontSize: 13, color: "#64748b", cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={filter.showInactive} onChange={(e) => setFilter((s) => ({ ...s, showInactive: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Inativos
        </label>
        <span style={{ color: "#64748b", fontSize: 13, whiteSpace: "nowrap" }}>{filteredProducts.length} resultado(s)</span>
      </div>

      {/* Product Grid */}
      <div className="products-grid">
        {filteredProducts.map((p) => (
          <div key={p.id} className={`product-row ${p.active ? "" : "inactive"}`} onClick={() => openEdit(p)}>
            {productPhoto(p) ? (
              <img src={productPhoto(p)} alt={p.name} className="product-photo" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).parentElement!.querySelector(".fallback")?.removeAttribute("style"); }} />
            ) : null}
            <div className="fallback product-fallback" style={{ display: productPhoto(p) ? "none" : "grid" }}>#{p.code}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: 14, color: "var(--text)" }}>{p.name} {!p.active && <span style={{ fontSize: 11, color: "#f87171", fontWeight: 600 }}>(inativo)</span>}</strong>
              <div className="product-meta" style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {p.category?.name && <span>{p.category.name}</span>}
                {p.shortDescription && <span>• {p.shortDescription}</span>}
              </div>
              <div className="product-badges">
                <span className={p.controlStock ? "badge green" : "badge muted"}>{p.controlStock ? `Estoque ${p.stockCurrent}` : "Sem controle de estoque"}</span>
                <span className="badge">{p.printTarget}</span>
                {p.featured && <span className="badge accent">Destaque</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
              <div className="product-price-box" style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{p.promoPriceCents && p.promoPriceCents > 0 ? <><small style={{ textDecoration: "line-through", color: "var(--text-dim)", fontWeight: 400, fontSize: 12 }}>{money(p.salePriceCents)}</small> <span style={{ color: "#34d399" }}>{money(p.promoPriceCents)}</span></> : money(p.salePriceCents)}</div>
                <div className="product-margin" style={{ fontSize: 11, color: p.marginPercent > 50 ? "#34d399" : p.marginPercent > 20 ? "#f59e0b" : "#f87171", fontWeight: 600 }}>{p.marginPercent}% margem</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={(e) => { e.stopPropagation(); duplicate(p); }} className="ghost" style={{ padding: 6, borderRadius: 8 }} title="Duplicar"><Copy size={14} /></button>
                <button onClick={(e) => { e.stopPropagation(); toggleActive(p); }} className="ghost" style={{ padding: 6, borderRadius: 8 }} title={p.active ? "Inativar" : "Ativar"}>{p.active ? <ToggleRight size={14} style={{ color: "#10b981" }} /> : <ToggleLeft size={14} style={{ color: "#94a3b8" }} />}</button>
                <button onClick={(e) => { e.stopPropagation(); if (confirm(`Excluir "${p.name}"?`)) mutate(`/api/products/${p.id}`, { method: "DELETE" }); }} className="ghost danger" style={{ padding: 6, borderRadius: 8 }} title="Excluir"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
        {filteredProducts.length === 0 && (
            <div className="products-empty">
            <Package2 size={40} style={{ color: "var(--text-dim)", marginBottom: 8 }} />
            <p style={{ margin: 0, fontSize: 15 }}>Nenhum produto encontrado.</p>
            <p style={{ margin: "4px 0 0", fontSize: 13 }}>Tente alterar os filtros ou <button onClick={openNew} style={{ background: "none", border: "none", color: "var(--accent-light)", fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline", fontSize: 13 }}>criar um novo produto</button>.</p>
            </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="products-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="products-modal" onClick={(e) => e.stopPropagation()}>
            <div className="row-between products-modal-header">
              <div>
                <h3 className="products-modal-title"><Package2 size={18} />{editingId ? "Editar" : "Novo"} Produto</h3>
                {editingId && <span className="products-modal-subtitle">Código #{products.find((p) => p.id === editingId)?.code}</span>}
              </div>
              <button className="ghost" onClick={() => setShowForm(false)} style={{ borderRadius: 10, padding: 6 }}><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div className="products-modal-tabs">
              {([["geral", "Dados Gerais"], ["precos", "Preços"], ["estoque", "Estoque"], ["ficha", "Ficha Técnica"], ["adicionais", "Adicionais"], ["entrega", "Disponibilidade"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} className={tab === key ? "active" : ""}>{label}</button>
              ))}
            </div>

            <div className="products-modal-body">
              {/* Dados Gerais */}
              {tab === "geral" && (
                <div>
                  {/* Photo Upload */}
                  <div className="product-photo-panel">
                    <div className="product-photo-preview">
                      {draft.photoUrl ? (
                        <img src={draft.photoUrl} alt="preview" onError={(e) => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <span>Sem foto</span>
                      )}
                    </div>
                    <div className="product-photo-actions">
                      <strong>Foto do Produto</strong>
                      <div className="product-photo-row">
                        <label className="product-photo-upload">
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) { void (async () => { const dataUrl = await fileToCompressedDataUrl(file); setDraft((s) => ({ ...s, photoUrl: dataUrl })); })(); } }} /> Enviar Foto
                        </label>
                        <input value={draft.photoUrl} onChange={(e) => setDraft((s) => ({ ...s, photoUrl: e.target.value }))} placeholder="Ou cole uma URL da foto..." className="product-photo-input" />
                        {draft.photoUrl && <button className="ghost product-photo-clear" onClick={() => setDraft((s) => ({ ...s, photoUrl: "" }))}><X size={14} /></button>}
                      </div>
                    </div>
                  </div>
                  <div className="grid-2">
                    <label style={{ gridColumn: "1 / -1", marginBottom: 4, fontSize: 13, fontWeight: 600, color: "#475569" }}>Nome do Produto <input value={draft.name} onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))} placeholder="Ex: X-Tudo" style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} /></label>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Código Interno <input value={draft.internalCode} onChange={(e) => setDraft((s) => ({ ...s, internalCode: e.target.value }))} placeholder="Ex: XT-001" style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Código de Barras <input value={draft.barcode} onChange={(e) => setDraft((s) => ({ ...s, barcode: e.target.value }))} placeholder="Ex: 789..." style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Grupo <select value={draft.categoryId} onChange={(e) => setDraft((s) => ({ ...s, categoryId: e.target.value }))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, background: "#fff", boxSizing: "border-box" }}><option value="">Selecione um grupo</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Subgrupo <input value={draft.subcategory} onChange={(e) => setDraft((s) => ({ ...s, subcategory: e.target.value }))} placeholder="Ex: Lanches Artesanais" style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Descrição Curta <input value={draft.shortDescription} onChange={(e) => setDraft((s) => ({ ...s, shortDescription: e.target.value }))} placeholder="Ex: Hambúrguer artesanal com queijo" style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                    <label style={{ gridColumn: "1 / -1", fontSize: 13, fontWeight: 600, color: "#475569" }}>Descrição Completa <textarea rows={2} value={draft.fullDescription} onChange={(e) => setDraft((s) => ({ ...s, fullDescription: e.target.value }))} placeholder="Descrição detalhada para cardápio online" style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} /></label>
                    <label style={{ gridColumn: "1 / -1", fontSize: 13, fontWeight: 600, color: "#475569" }}>Observações Internas <textarea rows={2} value={draft.observations} onChange={(e) => setDraft((s) => ({ ...s, observations: e.target.value }))} placeholder="Ex: Produto sazonal, verificar disponibilidade" style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} /></label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569" }}>
                      <input type="checkbox" checked={draft.active} onChange={(e) => setDraft((s) => ({ ...s, active: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Produto Ativo
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569" }}>
                      <input type="checkbox" checked={draft.featured} onChange={(e) => setDraft((s) => ({ ...s, featured: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Destaque no Cardápio
                    </label>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Local de Impressão <select value={draft.printTarget} onChange={(e) => setDraft((s) => ({ ...s, printTarget: e.target.value }))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, background: "#fff", boxSizing: "border-box" }}>{printTargets.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Tempo de Preparo (min) <input type="number" value={draft.prepTimeMinutes} onChange={(e) => setDraft((s) => ({ ...s, prepTimeMinutes: Number(e.target.value) }))} min={0} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                  </div>
                </div>
              )}

              {/* Preços */}
              {tab === "precos" && (
                <div className="grid-2">
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Custo Unitário (R$) <input type="number" step="0.01" value={draft.costCents / 100} onChange={(e) => handleCostChange(Math.round(Number(e.target.value) * 100))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} /></label>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Preço de Venda (R$) <input type="number" step="0.01" value={draft.salePriceCents / 100} onChange={(e) => handlePriceChange(Math.round(Number(e.target.value) * 100))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} /></label>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Margem Desejada (%) <input type="number" step="0.1" value={draft.marginPercent} onChange={(e) => handleMarginChange(Number(e.target.value))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} /></label>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Lucro Unitário <div style={{ fontSize: 28, fontWeight: 800, color: profitDraft > 0 ? "#10b981" : profitDraft < 0 ? "#ef4444" : "#64748b", marginTop: 4 }}>{money(profitDraft)}</div></label>
                  <div className="panel" style={{ gridColumn: "1 / -1", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 16 }}>
                    <strong style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#166534" }}><Percent size={14} style={{ marginRight: 4 }} />Formação de Preço Automática</strong>
                    <div className="grid-2" style={{ gap: 12 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Custo (R$) <input type="number" step="0.01" value={draft.costCents / 100} onChange={(e) => handleCostMarginChange(Math.round(Number(e.target.value) * 100), draft.marginPercent)} style={{ marginTop: 4, width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Margem (%) <input type="number" step="0.1" value={draft.marginPercent} onChange={(e) => handleCostMarginChange(draft.costCents, Number(e.target.value))} style={{ marginTop: 4, width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                    </div>
                    <div style={{ marginTop: 8, color: "#166534", fontSize: 14 }}>Preço Calculado: <strong style={{ fontSize: 20, color: "#059669" }}>{money(draft.salePriceCents)}</strong>  |  Lucro: <strong style={{ color: "#059669" }}>{money(profitDraft)}</strong>  |  Margem: <strong>{marginDraft}%</strong></div>
                  </div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Preço Promocional (R$) <input type="number" step="0.01" value={draft.promoPriceCents / 100} onChange={(e) => setDraft((s) => ({ ...s, promoPriceCents: Math.round(Number(e.target.value) * 100) }))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} /></label>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Início da Promoção <input type="date" value={draft.promoStart} onChange={(e) => setDraft((s) => ({ ...s, promoStart: e.target.value }))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Fim da Promoção <input type="date" value={draft.promoEnd} onChange={(e) => setDraft((s) => ({ ...s, promoEnd: e.target.value }))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                </div>
              )}

              {/* Estoque */}
              {tab === "estoque" && (
                <div className="grid-2">
                  <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569" }}>
                    <input type="checkbox" checked={draft.controlStock} onChange={(e) => setDraft((s) => ({ ...s, controlStock: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Controlar Estoque
                  </label>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Estoque Atual <input type="number" value={draft.stockCurrent} onChange={(e) => setDraft((s) => ({ ...s, stockCurrent: Number(e.target.value) }))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Unidade <select value={draft.stockUnit} onChange={(e) => setDraft((s) => ({ ...s, stockUnit: e.target.value }))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, background: "#fff", boxSizing: "border-box" }}>{stockUnits.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Estoque Mínimo <input type="number" value={draft.stockMin} onChange={(e) => setDraft((s) => ({ ...s, stockMin: Number(e.target.value) }))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Estoque Máximo <input type="number" value={draft.stockMax} onChange={(e) => setDraft((s) => ({ ...s, stockMax: Number(e.target.value) }))} style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                </div>
              )}

              {/* Ficha Técnica */}
              {tab === "ficha" && (
                <div>
                  <div className="panel" style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                    <span style={{ fontSize: 13, color: "#92400e" }}>Informações para ficha técnica e cardápio online.</span>
                  </div>
                  <div className="grid-2">
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Peso / Volume <input value={draft.nutritionWeight} onChange={(e) => setDraft((s) => ({ ...s, nutritionWeight: e.target.value }))} placeholder="Ex: 250g" style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Calorias <input value={draft.nutritionCalories} onChange={(e) => setDraft((s) => ({ ...s, nutritionCalories: e.target.value }))} placeholder="Ex: 450 kcal" style={{ marginTop: 4, width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569" }}><input type="checkbox" checked={draft.containsGluten} onChange={(e) => setDraft((s) => ({ ...s, containsGluten: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Contém Glúten</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569" }}><input type="checkbox" checked={draft.containsLactose} onChange={(e) => setDraft((s) => ({ ...s, containsLactose: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Contém Lactose</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569" }}><input type="checkbox" checked={draft.isVegan} onChange={(e) => setDraft((s) => ({ ...s, isVegan: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Vegano</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569" }}><input type="checkbox" checked={draft.isVegetarian} onChange={(e) => setDraft((s) => ({ ...s, isVegetarian: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Vegetariano</label>
                  </div>
                </div>
              )}

              {/* Adicionais */}
              {tab === "adicionais" && (
                <div className="panel" style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 12, padding: 14 }}>
                  <span style={{ fontSize: 13, color: "#075985" }}>Os adicionais disponíveis para este produto são gerenciados separadamente no cadastro de adicionais (configurações do sistema).</span>
                </div>
              )}

              {/* Disponibilidade */}
              {tab === "entrega" && (
                <div className="grid-2">
                  <label style={{ gridColumn: "1 / -1", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#475569" }}>Disponível para:</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#1e293b" }}><input type="checkbox" checked={draft.onlineMenu} onChange={(e) => setDraft((s) => ({ ...s, onlineMenu: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Cardápio Online</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#1e293b" }}><input type="checkbox" checked={draft.availableDelivery} onChange={(e) => setDraft((s) => ({ ...s, availableDelivery: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Delivery</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#1e293b" }}><input type="checkbox" checked={draft.availableBalcao} onChange={(e) => setDraft((s) => ({ ...s, availableBalcao: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Balcão</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#1e293b" }}><input type="checkbox" checked={draft.availableMesas} onChange={(e) => setDraft((s) => ({ ...s, availableMesas: e.target.checked }))} style={{ accentColor: "#2563eb" }} /> Mesas</label>
                </div>
              )}
            </div>

            <div className="products-modal-footer">
              <button className="ghost" onClick={() => setShowForm(false)} style={{ borderRadius: 10, padding: "10px 20px", fontSize: 14 }}>Cancelar</button>
              <button onClick={save} className="products-save-btn"><DollarSign size={16} /> {editingId ? "Atualizar" : "Criar"} Produto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
