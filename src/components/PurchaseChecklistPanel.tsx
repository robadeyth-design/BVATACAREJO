import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ClipboardCheck,
  Copy,
  Package,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  X
} from 'lucide-react';
import { Category, Product, PurchaseOrder, PurchaseOrderItem } from '../types';

interface PurchaseChecklistPanelProps {
  products: Product[];
  categories: Category[];
  productSectorsSums: { [productId: string]: { loja: number; anexo: number; '3019': number; totalTransferred: number } };
  savedOrders: PurchaseOrder[];
  operatorName: string;
  resetToken: number;
  onSaveOrder: (order: PurchaseOrder) => Promise<void> | void;
  onDeleteOrder?: (orderId: string) => Promise<void> | void;
}

function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[çÇ]/g, 'c')
    .trim();
}

export function extractPurchaseUnit(packagingStr: string, qty: number): string {
  const raw = (packagingStr || 'unidade').trim();
  const norm = raw.toLowerCase();

  if (norm.startsWith('caixa') || norm === 'box') {
    return qty === 1 ? 'caixa' : 'caixas';
  }
  if (norm.startsWith('fardo')) {
    return qty === 1 ? 'fardo' : 'fardos';
  }
  if (norm.startsWith('unidade') || norm === 'un' || norm === 'unidades') {
    return qty === 1 ? 'unidade' : 'unidades';
  }
  if (norm.startsWith('palete') || norm.startsWith('pallet')) {
    return qty === 1 ? 'palete' : 'paletes';
  }
  if (norm.startsWith('pacote') || norm === 'pct') {
    return qty === 1 ? 'pacote' : 'pacotes';
  }
  if (norm.startsWith('engradado')) {
    return qty === 1 ? 'engradado' : 'engradados';
  }
  if (norm.startsWith('barril')) {
    return qty === 1 ? 'barril' : 'barris';
  }
  if (norm.startsWith('garrafa')) {
    return qty === 1 ? 'garrafa' : 'garrafas';
  }
  if (norm.startsWith('lata')) {
    return qty === 1 ? 'lata' : 'latas';
  }
  if (norm === 'kg' || norm === 'quilo' || norm === 'kilo' || norm === 'kgs') {
    return 'kg';
  }

  const first = norm.split(/\s+/)[0] || 'unidade';
  if (qty === 1) {
    return first.endsWith('s') && first.length > 2 ? first.slice(0, -1) : first;
  }
  return first.endsWith('s') ? first : `${first}s`;
}

function formatProductDisplayName(prod: Product): string {
  const name = (prod.name || '').trim();
  const vol = (prod.weightVolume || '').trim();
  if (!vol) return name;
  if (normalizeText(name).includes(normalizeText(vol))) return name;
  return `${name} ${vol}`;
}

function isPositiveIntegerString(val: string): boolean {
  const trimmed = val.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const num = Number(trimmed);
  return Number.isInteger(num) && num > 0;
}

export const PurchaseChecklistPanel: React.FC<PurchaseChecklistPanelProps> = ({
  products,
  categories,
  productSectorsSums,
  savedOrders,
  operatorName,
  resetToken,
  onSaveOrder,
  onDeleteOrder
}) => {
  const [step, setStep] = useState<'build' | 'review' | 'finalized'>('build');
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Selection & quantities keyed by productId (preserved across filter/search changes)
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [invalidIds, setInvalidIds] = useState<Record<string, boolean>>({});
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const [orderSaved, setOrderSaved] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [copiedOrder, setCopiedOrder] = useState(false);
  const [copiedSavedOrderId, setCopiedSavedOrderId] = useState<string | null>(null);

  const startFreshChecklist = () => {
    setStep('build');
    setSearchQuery('');
    setBrandFilter('all');
    setCategoryFilter('all');
    setCheckedIds({});
    setQuantities({});
    setInvalidIds({});
    setValidationMessage(null);
    setOrderSaved(false);
    setSavingOrder(false);
    setCopiedOrder(false);
  };

  // Whenever the parent triggers a new checklist via resetToken, reset everything to unchecked & 0
  useEffect(() => {
    startFreshChecklist();
  }, [resetToken]);

  // Deduplicate products by ID (one row per registered product even across multiple pallets/batches) and sort A-Z
  const catalogProducts = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => {
      if (p && p.id && !map.has(p.id)) {
        map.set(p.id, p);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })
    );
  }, [products]);

  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    catalogProducts.forEach((p) => {
      const b = (p.brand || '').trim();
      if (b) set.add(b);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [catalogProducts]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    categories.forEach((c) => {
      if (c.name) set.add(c.name);
    });
    catalogProducts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [categories, catalogProducts]);

  const filteredProducts = useMemo(() => {
    const q = normalizeText(searchQuery);
    return catalogProducts.filter((prod) => {
      if (brandFilter !== 'all' && (prod.brand || '').trim() !== brandFilter) {
        return false;
      }
      if (categoryFilter !== 'all' && (prod.category || '') !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      const display = normalizeText(formatProductDisplayName(prod));
      const rawName = normalizeText(prod.name || '');
      return display.includes(q) || rawName.includes(q);
    });
  }, [catalogProducts, searchQuery, brandFilter, categoryFilter]);

  const selectedProductList = useMemo(() => {
    return catalogProducts.filter((p) => !!checkedIds[p.id]);
  }, [catalogProducts, checkedIds]);

  const validSelectedItems: PurchaseOrderItem[] = useMemo(() => {
    return selectedProductList
      .filter((p) => isPositiveIntegerString(quantities[p.id] ?? '0'))
      .map((p) => {
        const qty = parseInt((quantities[p.id] || '0').trim(), 10);
        return {
          productId: p.id,
          productName: formatProductDisplayName(p),
          packaging: p.packaging || 'Unidade',
          weightVolume: p.weightVolume || '',
          purchaseUnit: extractPurchaseUnit(p.packaging || 'Unidade', qty),
          quantity: qty
        };
      });
  }, [selectedProductList, quantities]);

  const handleToggleProduct = (productId: string, checked: boolean) => {
    setValidationMessage(null);
    if (checked) {
      setCheckedIds((prev) => ({ ...prev, [productId]: true }));
      setQuantities((prev) => ({
        ...prev,
        [productId]: prev[productId] && prev[productId] !== '' ? prev[productId] : '0'
      }));
    } else {
      setCheckedIds((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      setQuantities((prev) => ({ ...prev, [productId]: '0' }));
      setInvalidIds((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
  };

  const handleQuantityChange = (productId: string, rawValue: string) => {
    // Allow digits only or empty while editing so integer validation stays clean
    const sanitized = rawValue.replace(/[^\d]/g, '');
    setQuantities((prev) => ({ ...prev, [productId]: sanitized }));
    if (isPositiveIntegerString(sanitized)) {
      setInvalidIds((prev) => {
        if (!prev[productId]) return prev;
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      setValidationMessage(null);
    }
  };

  const handleReviewOrder = () => {
    if (selectedProductList.length === 0) {
      setValidationMessage('Marque pelo menos um produto e informe a quantidade desejada antes de revisar o pedido.');
      return;
    }

    const invalids: Record<string, boolean> = {};
    selectedProductList.forEach((p) => {
      const val = quantities[p.id] ?? '0';
      if (!isPositiveIntegerString(val)) {
        invalids[p.id] = true;
      }
    });

    if (Object.keys(invalids).length > 0) {
      setInvalidIds(invalids);
      setValidationMessage(
        'Há produto(s) marcado(s) com quantidade 0 ou inválida. Preencha uma quantidade inteira maior que zero nos campos destacados ou desmarque o item antes de finalizar.'
      );
      return;
    }

    setInvalidIds({});
    setValidationMessage(null);
    setStep('review');
  };

  const handleFinalizeOrder = () => {
    setOrderSaved(false);
    setCopiedOrder(false);
    setStep('finalized');
  };

  const buildOrderSummaryText = (items: PurchaseOrderItem[], createdAt?: string) => {
    const dateStr = createdAt
      ? new Date(createdAt).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR');
    const lines = [
      `Pedido de Compra — ${dateStr}`,
      `Operador: ${operatorName || 'Equipe BV'}`,
      '',
      ...items.map((item) => `${item.productName} — ${item.quantity} ${item.purchaseUnit}`),
      '',
      `Total de itens: ${items.length}`
    ];
    return lines.join('\n');
  };

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback below
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopySummary = async () => {
    const text = buildOrderSummaryText(validSelectedItems);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedOrder(true);
      setTimeout(() => setCopiedOrder(false), 3000);
    }
  };

  const handleSaveOrder = async () => {
    if (validSelectedItems.length === 0 || savingOrder || orderSaved) return;
    setSavingOrder(true);
    try {
      const totalUnits = validSelectedItems.reduce((sum, i) => sum + i.quantity, 0);
      const newOrder: PurchaseOrder = {
        id: `po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        operatorName: operatorName || 'Equipe BV',
        items: validSelectedItems,
        totalItemsCount: validSelectedItems.length,
        totalUnitsCount: totalUnits
      };
      await onSaveOrder(newOrder);
      setOrderSaved(true);
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in text-left">
      {/* Cabeçalho Principal */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 shrink-0">
            <ShoppingCart className="w-5 h-5 stroke-[2.5]" />
          </span>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-black tracking-tight">
              Novo checklist de compra
            </h2>
            <p className="text-xs text-slate-600">
              Selecione os produtos cadastrados e informe as quantidades para montar o pedido. Os saldos da loja e do depósito não são alterados.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={startFreshChecklist}
          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
          title="Recarregar cadastro completo com tudo desmarcado e zerado"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Novo checklist de compra</span>
        </button>
      </div>

      {/* ETAPA 1: SELEÇÃO E MONTAGEM DO PEDIDO */}
      {step === 'build' && (
        <>
          {/* Barra de Busca e Filtros */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Pesquisa por nome */}
              <div className="md:col-span-6 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar produto por nome..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-9 py-2.5 text-xs text-black font-medium focus:border-emerald-600 focus:bg-white focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    title="Limpar pesquisa"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filtro por Marca */}
              <div className="md:col-span-3">
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  aria-label="Filtrar por marca"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-black font-semibold focus:border-emerald-600 focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas as marcas</option>
                  {availableBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      Marca: {brand}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Categoria */}
              <div className="md:col-span-3">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Filtrar por categoria"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-black font-semibold focus:border-emerald-600 focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas as categorias</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      Categoria: {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Barra de status e botão Revisar pedido */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold text-black">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'produto exibido' : 'produtos exibidos'}
                </span>
                <span>•</span>
                <span className="font-bold text-emerald-700">
                  {selectedProductList.length} {selectedProductList.length === 1 ? 'produto marcado' : 'produtos marcados'}
                </span>
                {(searchQuery || brandFilter !== 'all' || categoryFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setBrandFilter('all');
                      setCategoryFilter('all');
                    }}
                    className="text-xs font-bold text-slate-600 hover:text-black underline cursor-pointer ml-1"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleReviewOrder}
                className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs px-5 py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Revisar pedido ({selectedProductList.length})</span>
              </button>
            </div>

            {validationMessage && (
              <div className="bg-rose-50 border-2 border-rose-500 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="font-semibold">{validationMessage}</div>
              </div>
            )}
          </div>

          {/* Lista Alfabética de Produtos */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 text-[10px] font-mono font-bold uppercase text-slate-600">
              <div className="col-span-1 text-center">Sel.</div>
              <div className="col-span-6">Produto / Embalagem ou Volume</div>
              <div className="col-span-2 text-center">Unidade de compra</div>
              <div className="col-span-3 text-right">Quantidade a comprar</div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Package className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">
                  Nenhum produto encontrado com os filtros atuais.
                </p>
                <p className="text-[11px] text-slate-500">
                  Suas seleções anteriores continuam preservadas.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredProducts.map((prod) => {
                  const isChecked = !!checkedIds[prod.id];
                  const rawQtyStr = isChecked ? (quantities[prod.id] ?? '0') : '0';
                  const numericQty = parseInt(rawQtyStr || '0', 10) || 0;
                  const unitLabel = extractPurchaseUnit(prod.packaging || 'Unidade', numericQty);
                  const isInvalid = isChecked && !!invalidIds[prod.id];

                  const depQty = (prod.batches || []).reduce((sum, b) => sum + b.quantity, 0);
                  const realTotalStock = depQty + (productSectorsSums[prod.id]?.totalTransferred || 0);

                  return (
                    <div
                      key={prod.id}
                      className={`p-3.5 sm:px-4 sm:py-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center transition-colors ${
                        isInvalid
                          ? 'bg-rose-50/70'
                          : isChecked
                            ? 'bg-emerald-50/50'
                            : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="sm:col-span-1 flex items-center sm:justify-center gap-2">
                        <input
                          id={`chk-${prod.id}`}
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggleProduct(prod.id, e.target.checked)}
                          className="w-5 h-5 accent-emerald-600 rounded cursor-pointer border-slate-300"
                          aria-label={`Selecionar ${prod.name}`}
                        />
                        <label htmlFor={`chk-${prod.id}`} className="sm:hidden text-xs font-bold text-slate-700 cursor-pointer">
                          Selecionar item
                        </label>
                      </div>

                      {/* Nome com embalagem ou volume */}
                      <div
                        onClick={() => handleToggleProduct(prod.id, !isChecked)}
                        className="sm:col-span-6 cursor-pointer select-none space-y-0.5"
                      >
                        <p className="text-xs sm:text-sm font-black text-black leading-snug">
                          {formatProductDisplayName(prod)}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                          <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded font-semibold text-slate-700">
                            {prod.packaging || 'Unidade'}
                          </span>
                          {prod.brand && (
                            <span className="text-slate-500 font-medium">• {prod.brand}</span>
                          )}
                          {prod.category && (
                            <span className="text-slate-500">• {prod.category}</span>
                          )}
                          <span className={`font-mono font-bold ${realTotalStock === 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                            • Estoque atual: {realTotalStock}
                          </span>
                        </div>
                      </div>

                      {/* Unidade de compra */}
                      <div className="sm:col-span-2 flex sm:justify-center items-center gap-2">
                        <span className="sm:hidden text-[11px] font-semibold text-slate-500">Unidade de compra:</span>
                        <span className="text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg capitalize">
                          {unitLabel}
                        </span>
                      </div>

                      {/* Campo Quantidade a comprar */}
                      <div className="sm:col-span-3 flex flex-col sm:items-end gap-1">
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                          <label htmlFor={`qty-${prod.id}`} className="sm:hidden text-xs font-bold text-slate-700">
                            Quantidade a comprar:
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              id={`qty-${prod.id}`}
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              disabled={!isChecked}
                              value={rawQtyStr}
                              onFocus={(e) => {
                                if (isChecked && e.target.value === '0') {
                                  e.target.select();
                                }
                              }}
                              onChange={(e) => handleQuantityChange(prod.id, e.target.value)}
                              aria-label={`Quantidade a comprar de ${prod.name}`}
                              className={`w-24 text-center rounded-xl py-2 px-2.5 font-mono font-black text-sm border transition-all focus:outline-none ${
                                !isChecked
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : isInvalid
                                    ? 'bg-rose-50 border-2 border-rose-600 text-rose-800 ring-2 ring-rose-500/25'
                                    : 'bg-white border-emerald-600 text-black focus:ring-2 focus:ring-emerald-500/25'
                              }`}
                            />
                            <span className="text-xs font-bold text-slate-700 min-w-[54px]">
                              {unitLabel}
                            </span>
                          </div>
                        </div>
                        {isInvalid && (
                          <span className="text-[10px] font-bold text-rose-700">
                            Informe quantidade maior que 0
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ETAPA 2: REVISÃO DO PEDIDO */}
      {step === 'review' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base sm:text-lg font-black text-black">
                Revisão do pedido
              </h3>
              <p className="text-xs text-slate-600">
                Confira abaixo apenas os produtos selecionados com quantidade maior que zero antes de finalizar.
              </p>
            </div>
            <span className="text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full self-start sm:self-center">
              {validSelectedItems.length} {validSelectedItems.length === 1 ? 'item no pedido' : 'itens no pedido'}
            </span>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {validSelectedItems.map((item) => (
              <div key={item.productId} className="p-3.5 flex items-center justify-between gap-3 bg-white">
                <div>
                  <p className="text-xs sm:text-sm font-black text-black">
                    {item.productName}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Embalagem cadastrada: {item.packaging}
                  </p>
                </div>
                <div className="text-right font-mono font-black text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl shrink-0">
                  {item.quantity} {item.purchaseUnit}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 font-medium">
            Os saldos atuais da loja e do depósito continuam preservados. A entrada no estoque deve ser registrada somente quando a mercadoria for recebida.
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setStep('build')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 cursor-pointer transition-all"
            >
              ← Voltar e editar itens
            </button>
            <button
              type="button"
              onClick={handleFinalizeOrder}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Finalizar pedido</span>
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 3: RESUMO FINAL (SALVAR E COPIAR COMO TEXTO) */}
      {step === 'finalized' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-base sm:text-lg font-black text-black">
                  Resumo do pedido de compra
                </h3>
                <p className="text-xs text-slate-600">
                  Salve o pedido no histórico de compras ou copie o resumo em texto para enviar ao fornecedor.
                </p>
              </div>
            </div>
            {orderSaved && (
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-full">
                ✓ Pedido salvo
              </span>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            {validSelectedItems.map((item) => (
              <div key={item.productId} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-b-0 border-slate-200/70 text-xs sm:text-sm">
                <span className="font-black text-black">{item.productName}</span>
                <span className="font-mono font-black text-emerald-700">
                  {item.quantity} {item.purchaseUnit}
                </span>
              </div>
            ))}
          </div>

          <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-[11px] font-mono text-slate-700 whitespace-pre-wrap select-all">
            {buildOrderSummaryText(validSelectedItems)}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 font-medium">
            Nenhuma movimentação de entrada foi lançada no estoque. Registre a entrada apenas quando receber a mercadoria no depósito ou loja.
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveOrder}
                disabled={orderSaved || savingOrder}
                className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                  orderSaved
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>{savingOrder ? 'Salvando...' : orderSaved ? 'Pedido salvo' : 'Salvar pedido'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopySummary}
                className="px-4 py-2.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-2 cursor-pointer transition-all"
              >
                {copiedOrder ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedOrder ? 'Resumo copiado!' : 'Copiar resumo como texto'}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {!orderSaved && (
                <button
                  type="button"
                  onClick={() => setStep('review')}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 cursor-pointer transition-all"
                >
                  Voltar
                </button>
              )}
              <button
                type="button"
                onClick={startFreshChecklist}
                className="px-4 py-2.5 rounded-xl text-xs font-black bg-white hover:bg-slate-100 text-black border-2 border-black flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Abrir outro checklist</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PEDIDOS DE COMPRA SALVOS */}
      {savedOrders.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-black uppercase tracking-wide flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                Pedidos de Compra Salvos ({savedOrders.length})
              </h3>
              <p className="text-xs text-slate-500">
                Pedidos salvos para conferência na entrega. Lembre-se de registrar a entrada no estoque somente ao receber os produtos.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {savedOrders.map((order) => (
              <div key={order.id} className="p-3.5 space-y-2 bg-white hover:bg-slate-50/60 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-black">
                      Pedido de {new Date(order.createdAt).toLocaleString('pt-BR')}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Operador: {order.operatorName} • {order.totalItemsCount} {order.totalItemsCount === 1 ? 'item' : 'itens'} ({order.totalUnitsCount} un/vol.)
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyTextToClipboard(buildOrderSummaryText(order.items, order.createdAt));
                        if (ok) {
                          setCopiedSavedOrderId(order.id);
                          setTimeout(() => setCopiedSavedOrderId(null), 2500);
                        }
                      }}
                      className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      {copiedSavedOrderId === order.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSavedOrderId === order.id ? 'Copiado' : 'Copiar texto'}</span>
                    </button>
                    {onDeleteOrder && (
                      <button
                        type="button"
                        onClick={() => onDeleteOrder(order.id)}
                        className="text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 p-1.5 rounded-lg cursor-pointer"
                        title="Excluir pedido salvo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {order.items.map((item) => (
                    <span
                      key={item.productId}
                      className="text-[11px] font-semibold bg-slate-100 border border-slate-200 text-slate-800 px-2 py-0.5 rounded-lg"
                    >
                      {item.productName} — <strong className="font-mono text-emerald-700">{item.quantity} {item.purchaseUnit}</strong>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseChecklistPanel;
