/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Tag, Calendar, BadgeAlert, Sparkles, Check, CheckCircle } from 'lucide-react';
import { Product, PackagingType, ExpirationBatch, Category } from '../types';

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product, operatorName: string) => void;
  categories: Category[];
  existingBarcodes: string[];
  initialBarcode?: string; // If scanned first and doesn't exist
}

export default function NewProductModal({
  isOpen,
  onClose,
  onSave,
  categories,
  existingBarcodes,
  initialBarcode = ''
}: NewProductModalProps) {
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [packaging, setPackaging] = useState<PackagingType>('unidade');
  const [minStock, setMinStock] = useState(10);
  const [notes, setNotes] = useState('');
  const [operator, setOperator] = useState('');

  // Manage up to 5 expiration dates
  const [batches, setBatches] = useState<Omit<ExpirationBatch, 'id'>[]>([
    { date: '', quantity: 0 }
  ]);

  const [barcodeError, setBarcodeError] = useState('');

  // Load scanned barcode if supplied
  useEffect(() => {
    if (initialBarcode) {
      setBarcode(initialBarcode);
    } else {
      setBarcode('');
    }
  }, [initialBarcode, isOpen]);

  // Set default subcategory when category changes
  useEffect(() => {
    const selectedCat = categories.find(c => c.name === category);
    if (selectedCat && selectedCat.subcategories.length > 0) {
      setSubcategory(selectedCat.subcategories[0]);
    } else {
      setSubcategory('');
    }
  }, [category, categories]);

  // Set initial category on open
  useEffect(() => {
    if (categories.length > 0 && !category) {
      setCategory(categories[0].name);
    }
  }, [categories, isOpen]);

  if (!isOpen) return null;

  const handleAddBatch = () => {
    if (batches.length >= 5) {
      alert('Limite de 5 validades diferentes atingido para este produto.');
      return;
    }
    setBatches([...batches, { date: '', quantity: 0 }]);
  };

  const handleRemoveBatch = (index: number) => {
    const newBatches = [...batches];
    newBatches.splice(index, 1);
    // Keep at least one or none
    setBatches(newBatches);
  };

  const handleBatchChange = (index: number, field: 'date' | 'quantity', value: any) => {
    const newBatches = [...batches];
    if (field === 'date') {
      newBatches[index].date = value;
    } else {
      newBatches[index].quantity = Math.max(0, parseInt(value) || 0);
    }
    setBatches(newBatches);
  };

  const handleBarcodeChange = (val: string) => {
    const sanitized = val.trim();
    setBarcode(sanitized);
    if (existingBarcodes.includes(sanitized)) {
      setBarcodeError('Este código de barras já está cadastrado!');
    } else {
      setBarcodeError('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (existingBarcodes.includes(barcode)) {
      setBarcodeError('Código de barras já cadastrado.');
      return;
    }
    if (!barcode.trim() || !name.trim() || !operator.trim()) {
      alert('Por favor, preencha o código de barras, nome do produto e nome do operador.');
      return;
    }

    // Filter out invalid batches (empty dates)
    const validBatches: ExpirationBatch[] = batches
      .filter(b => b.date !== '')
      .map((b, idx) => ({
        id: `b-${barcode}-${Date.now()}-${idx}`,
        date: b.date,
        quantity: b.quantity
      }));

    const newProduct: Product = {
      id: barcode,
      barcode,
      name: name.trim(),
      category,
      subcategory,
      packaging,
      minStock: Math.max(0, minStock),
      batches: validBatches,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(newProduct, operator.trim());
    
    // Reset states
    setName('');
    setNotes('');
    setMinStock(10);
    setBatches([{ date: '', quantity: 0 }]);
    onClose();
  };

  const selectedCatObj = categories.find(c => c.name === category);

  return (
    <div id="new-product-modal" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white border-2 border-black rounded-xl max-w-2xl w-full text-slate-900 overflow-hidden shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col my-8">
        
        {/* Header */}
        <div className="bg-slate-100 px-6 py-4 border-b-2 border-black flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Tag className="text-amber-600" size={20} />
            <span className="font-black text-lg tracking-tight text-slate-950">CADASTRAR NOVO PRODUTO</span>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-900 hover:bg-slate-200 p-2 rounded-lg border-2 border-transparent hover:border-black transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          
          {/* Operator identification */}
          <div className="bg-amber-100/40 p-4 rounded-lg border-2 border-black space-y-2">
            <label htmlFor="operator-name-input" className="block text-xs font-black text-slate-900 uppercase tracking-wider">
              Operador da Logística (Quem está cadastrando) *
            </label>
            <input
              id="operator-name-input"
              type="text"
              required
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="Ex: Carlos Almoxarifado / João Silva"
              className="w-full bg-white border-2 border-black text-slate-900 placeholder-slate-500 rounded-lg py-2 px-3.5 text-sm outline-none transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Barcode input */}
            <div className="space-y-1.5">
              <label htmlFor="barcode-new-input" className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                Código de Barras *
              </label>
              <input
                id="barcode-new-input"
                type="text"
                required
                value={barcode}
                onChange={(e) => handleBarcodeChange(e.target.value)}
                placeholder="Ex: 7891000300306"
                className={`w-full bg-white border-2 text-slate-900 placeholder-slate-505 font-mono rounded-lg py-2 px-3.5 text-sm outline-none transition-all ${
                  barcodeError 
                    ? 'border-red-600 bg-red-50' 
                    : 'border-black focus:border-amber-500'
                }`}
              />
              {barcodeError ? (
                <p className="text-[11px] text-red-650 font-black flex items-center gap-1">
                  <BadgeAlert size={12} /> {barcodeError}
                </p>
              ) : (
                <p className="text-[10px] text-slate-600">Pode bipar com o leitor portátil ou digitar.</p>
              )}
            </div>

            {/* Product name */}
            <div className="space-y-1.5">
              <label htmlFor="name-new-input" className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                Nome do Produto *
              </label>
              <input
                id="name-new-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Arroz Prato Fino 5kg ou Café Pilão 500g"
                className="w-full bg-white border-2 border-black text-slate-900 placeholder-slate-500 rounded-lg py-2 px-3.5 text-sm outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Category selection */}
            <div className="space-y-1.5">
              <label htmlFor="category-select" className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                Categoria *
              </label>
              <select
                id="category-select"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border-2 border-black text-slate-900 rounded-lg py-2 px-3.5 text-sm outline-none cursor-pointer focus:border-amber-500"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Subcategory selection */}
            <div className="space-y-1.5">
              <label htmlFor="subcategory-select" className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                Subcategoria *
              </label>
              <select
                id="subcategory-select"
                required
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className="w-full bg-white border-2 border-black text-slate-900 rounded-lg py-2 px-3.5 text-sm outline-none cursor-pointer focus:border-amber-500"
              >
                {selectedCatObj?.subcategories.map(sc => (
                  <option key={sc} value={sc}>{sc}</option>
                )) || <option value="">Sem subcategoria</option>}
              </select>
            </div>

            {/* Packaging type selections */}
            <div className="space-y-1.5">
              <label htmlFor="packaging-select" className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                Tipo De Embalagem *
              </label>
              <select
                id="packaging-select"
                required
                value={packaging}
                onChange={(e) => setPackaging(e.target.value as PackagingType)}
                className="w-full bg-white border-2 border-black text-slate-900 rounded-lg py-2 px-3.5 text-sm outline-none cursor-pointer focus:border-amber-500"
              >
                <option value="palete">Palete</option>
                <option value="fardo">Fardo</option>
                <option value="pacote">Pacote</option>
                <option value="unidade">Unidade</option>
                <option value="kg">kg (Quilograma)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Min stock for warnings */}
            <div className="space-y-1.5">
              <label htmlFor="min-stock-input" className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                Estoque Mínimo de Segurança *
              </label>
              <input
                id="min-stock-input"
                type="number"
                min="0"
                required
                value={minStock}
                onChange={(e) => setMinStock(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-white border-2 border-black text-slate-900 rounded-lg py-2 px-3.5 text-sm outline-none transition-all"
              />
              <p className="text-[10px] text-slate-600">Emite alertas quando o estoque consolidado ficar abaixo deste nível.</p>
            </div>

            {/* Product notes */}
            <div className="space-y-1.5">
              <label htmlFor="notes-new-input" className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                Observações de Armazenamento
              </label>
              <input
                id="notes-new-input"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Próximo à câmara fria / Manter empilhado"
                className="w-full bg-white border-2 border-black text-slate-900 placeholder-slate-550 rounded-lg py-2 px-3.5 text-sm outline-none"
              />
            </div>
          </div>

          {/* Dynamic MULTIPLE Expiration Dates Control - Max 5 */}
          <div className="border-t-2 border-black pt-5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-amber-600" />
                  Validades do Produto (Máx 5 Diferentes)
                </span>
                <p className="text-[11px] text-slate-600">Gerencie até 5 validades distintas de recebimento se aplicável.</p>
              </div>
              <button
                type="button"
                onClick={handleAddBatch}
                disabled={batches.length >= 5}
                className="inline-flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg bg-white hover:bg-slate-55 border-2 border-black text-slate-900 font-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
              >
                <Plus size={14} />
                <span>Adicionar Validade</span>
              </button>
            </div>

            <div className="space-y-3 bg-slate-100 p-4 border-2 border-black rounded-lg">
              {batches.map((batch, index) => (
                <div key={index} className="flex flex-wrap sm:flex-nowrap items-center gap-3 bg-white p-3 rounded-lg border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  <span className="text-xs font-black text-slate-900 bg-amber-200 border-2 border-black w-6 h-6 rounded-full flex items-center justify-center">
                    {index + 1}
                  </span>

                  {/* Expiration Date Input */}
                  <div className="flex-1 min-w-[140px] space-y-1">
                    <label htmlFor={`batch-date-${index}`} className="block text-[10px] font-black text-slate-705 uppercase">Data de Validade</label>
                    <input
                      id={`batch-date-${index}`}
                      type="date"
                      value={batch.date}
                      onChange={(e) => handleBatchChange(index, 'date', e.target.value)}
                      className="w-full bg-white border-2 border-black text-slate-900 text-xs px-2 py-1.5 rounded outline-none cursor-pointer"
                    />
                  </div>

                  {/* Initial stock for this batch */}
                  <div className="w-[120px] space-y-1">
                    <label htmlFor={`batch-qty-${index}`} className="block text-[10px] font-black text-slate-750 uppercase">Qtd Inicial ({packaging})</label>
                    <input
                      id={`batch-qty-${index}`}
                      type="number"
                      min="0"
                      value={batch.quantity || ''}
                      onChange={(e) => handleBatchChange(index, 'quantity', e.target.value)}
                      placeholder="0"
                      className="w-full bg-white border-2 border-black text-slate-950 text-xs px-2 py-1.5 rounded outline-none"
                    />
                  </div>

                  {/* Action row to remove */}
                  <div className="pt-4 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRemoveBatch(index)}
                      className="text-red-650 hover:bg-red-50 p-2 rounded-lg border-2 border-transparent hover:border-black transition-colors cursor-pointer"
                      title="Excluir validade"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {batches.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-500 italic font-bold">
                  Sem validades registradas. O produto será adicionado como estoque geral livre.
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 border-t-2 border-black pt-5">
            <button
              type="button"
              onClick={onClose}
              className="bg-white hover:bg-slate-100 text-slate-900 font-black text-sm px-5 py-2.5 rounded-lg border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-amber-450 text-slate-950 font-black text-sm px-6 py-2.5 rounded-lg hover:bg-amber-500 transition-colors flex items-center gap-2 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5 cursor-pointer"
            >
              <CheckCircle size={16} />
              <span>Concluir Cadastro</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
