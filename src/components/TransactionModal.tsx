/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, Clock, User, Calendar, Plus, Archive, ChevronRight } from 'lucide-react';
import { Product, Transaction, PackagingType, ExpirationBatch } from '../types';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onConfirm: (
    productId: string,
    type: 'entrada' | 'saida',
    quantity: number,
    operatorName: string,
    selectedBatchId: string, // 'new' or existing batch ID
    newBatchDate?: string // if registering a new batch during Entry
  ) => void;
  defaultType?: 'entrada' | 'saida';
  defaultBatchId?: string;
}

export default function TransactionModal({
  isOpen,
  onClose,
  product,
  onConfirm,
  defaultType = 'entrada',
  defaultBatchId = ''
}: TransactionModalProps) {
  const [type, setType] = useState<'entrada' | 'saida'>(defaultType);
  const [operator, setOperator] = useState('');
  const [quantity, setQuantity] = useState<number>(0);
  
  // Expiration batch tracking inside transaction
  // User can select an existing batch ID, or choose to create a 'new' batch (only for 'entrada')
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [newBatchDate, setNewBatchDate] = useState<string>('');

  // Load default configurations when product changes or opens
  useEffect(() => {
    if (product) {
      setType(defaultType);
      
      // Auto-select first batch or passed initial batch if it exists
      if (defaultBatchId && product.batches.some(b => b.id === defaultBatchId)) {
        setSelectedBatchId(defaultBatchId);
      } else if (product.batches && product.batches.length > 0) {
        setSelectedBatchId(product.batches[0].id);
      } else {
        setSelectedBatchId('new');
      }
      
      setNewBatchDate('');
      setQuantity(0);
    }
  }, [product, defaultType, defaultBatchId, isOpen]);

  if (!isOpen || !product) return null;

  // Total current stock of product
  const totalStock = product.batches.reduce((acc, b) => acc + b.quantity, 0);

  // Selected batch details
  const selectedBatchObj = product.batches.find(b => b.id === selectedBatchId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!operator.trim()) {
      alert('Favor preencher o nome de quem está dando entrada ou saída!');
      return;
    }

    if (quantity <= 0) {
      alert('A quantidade deve ser maior que 0!');
      return;
    }

    if (type === 'saida') {
      // Validate enough stock for exit
      if (selectedBatchId !== 'new') {
        const targetBatch = product.batches.find(b => b.id === selectedBatchId);
        if (!targetBatch || targetBatch.quantity < quantity) {
          alert(`Estoque insuficiente no lote de validade selecionado! Disponível: ${targetBatch ? targetBatch.quantity : 0} ${product.packaging}(s).`);
          return;
        }
      } else {
        // Leaving it to generic?
        if (totalStock < quantity) {
          alert(`Estoque total insuficiente! Disponível: ${totalStock} ${product.packaging}(s).`);
          return;
        }
      }
    }

    if (type === 'entrada' && selectedBatchId === 'new') {
      if (!newBatchDate) {
        alert('Favor informar a data de validade para o novo lote!');
        return;
      }
      if (product.batches.length >= 5) {
        alert('Este produto já possui o limite máximo de 5 validades registradas! Favor dar entrada em uma das validades existentes.');
        return;
      }
    }

    onConfirm(
      product.id,
      type,
      quantity,
      operator.trim(),
      selectedBatchId,
      selectedBatchId === 'new' ? newBatchDate : undefined
    );

    // Reset temporary values
    setQuantity(0);
    setNewBatchDate('');
    onClose();
  };

  const getPackageBadgeColor = (pkg: PackagingType) => {
    switch (pkg) {
      case 'palete': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'fardo': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'pacote': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'unidade': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'kg': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
  };

  return (
    <div id="transaction-modal" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white border-2 border-black rounded-xl max-w-lg w-full text-slate-900 overflow-hidden shadow-[6px_6px_0px_rgba(0,0,0,1)]">
        
        {/* Top Type Selector Tabs */}
        <div className="flex border-b-2 border-black">
          <button
            type="button"
            id="tx-type-entrada-tab"
            onClick={() => setType('entrada')}
            className={`flex-1 py-4 flex items-center justify-center gap-2 font-black tracking-wider uppercase text-sm border-r-2 border-black transition-all cursor-pointer ${
              type === 'entrada'
                ? 'bg-emerald-50 text-emerald-800 font-black'
                : 'text-slate-500 hover:text-slate-800 bg-slate-50/50 hover:bg-slate-100/50'
            }`}
          >
            <ArrowUpRight size={18} className="stroke-[3]" />
            <span>Entrada de Estoque</span>
          </button>
          
          <button
            type="button"
            id="tx-type-saida-tab"
            onClick={() => setType('saida')}
            className={`flex-1 py-4 flex items-center justify-center gap-2 font-black tracking-wider uppercase text-sm transition-all cursor-pointer ${
              type === 'saida'
                ? 'bg-red-50 text-red-800 font-black'
                : 'text-slate-500 hover:text-slate-800 bg-slate-50/50 hover:bg-slate-100/50'
            }`}
          >
            <ArrowDownLeft size={18} className="stroke-[3]" />
            <span>Saída de Estoque</span>
          </button>
        </div>

        {/* Modal body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Active Product Preview */}
          <div className="bg-slate-50 p-4 border-2 border-black rounded-lg space-y-2">
            <div className="flex justify-between items-start gap-2">
              <div>
                <span className="text-[10px] text-amber-700 font-mono tracking-wider font-extrabold">{product.barcode}</span>
                <h3 className="font-extrabold text-base text-slate-900">{product.name}</h3>
                <p className="text-xs text-slate-705 mt-1">Categoria: <span className="text-slate-900 font-extrabold">{product.category}</span> &rsaquo; {product.subcategory}</p>
              </div>
              <span className={`text-[10px] uppercase font-black tracking-widest px-2.5 py-1 rounded border-2 border-black ${getPackageBadgeColor(product.packaging)}`}>
                {product.packaging}
              </span>
            </div>
            
            <div className="flex justify-between items-center text-xs border-t-2 border-black pt-2 text-slate-800">
              <span>Total em Estoque:</span>
              <span className="font-mono text-slate-950 font-black text-sm">
                {totalStock} {product.packaging}(s)
              </span>
            </div>
          </div>

          {/* Form Fields container */}
          <div className="space-y-4">
            {/* Operator registration */}
            <div className="space-y-1.5">
              <label htmlFor="tx-operator-name" className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
                <User size={12} className="text-amber-655" />
                Nome do Operador (Quem dá {type}) *
              </label>
              <input
                id="tx-operator-name"
                type="text"
                required
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                placeholder="Ex: Carlos Almoxarifado / Amanda Costas"
                className="w-full bg-white border-2 border-black text-slate-900 rounded-lg py-2 px-3 text-sm outline-none transition-colors"
              />
            </div>

            {/* Dynamic Expiration Dates Selection */}
            <div className="space-y-2 bg-slate-50 p-3 border-2 border-black rounded-lg">
              <label htmlFor="tx-batch-select" className="block text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1">
                <Calendar size={12} className="text-amber-655" />
                Lote de Validade Afetado
              </label>

              <select
                id="tx-batch-select"
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full bg-white border-2 border-black text-slate-900 text-xs px-2.5 py-2 rounded outline-none cursor-pointer"
              >
                {product.batches.map((b, idx) => (
                  <option key={b.id} value={b.id}>
                    Validade: {new Date(b.date + 'T12:00:00').toLocaleDateString('pt-BR')} (Estoque: {b.quantity} {product.packaging}s)
                  </option>
                ))}
                
                {/* Option to spawn a new batch date only for Incoming stock (entrada) */}
                {type === 'entrada' && product.batches.length < 5 && (
                  <option value="new">+ Cadastrar Nova Data de Validade ({product.batches.length}/5)</option>
                )}
              </select>

              {/* Spawn new date template */}
              {selectedBatchId === 'new' && type === 'entrada' && (
                <div className="mt-2.5 p-3 rounded bg-white border-2 border-black space-y-2">
                  <span className="text-[10px] text-amber-800 font-extrabold uppercase">Nova Data de Validade</span>
                  <input
                    type="date"
                    required={selectedBatchId === 'new'}
                    value={newBatchDate}
                    onChange={(e) => setNewBatchDate(e.target.value)}
                    className="w-full bg-white border-2 border-black text-xs px-2 py-1.5 rounded text-slate-900 outline-none"
                  />
                  {product.batches.length >= 5 && (
                    <p className="text-[9px] text-red-650 font-bold">Limite de 5 validades atingido. Não é possível incluir mais datas.</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Quantidade input */}
              <div className="space-y-1.5 col-span-2">
                <label htmlFor="tx-quantity" className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
                  <Archive size={12} className="text-amber-655" />
                  Quantidade a ser {type === 'entrada' ? 'Adicionada' : 'Retirada'} *
                </label>
                <div className="flex items-center bg-white rounded-lg border-2 border-black overflow-hidden">
                  <span className="px-3 bg-slate-100 text-slate-900 border-r-2 border-black font-extrabold text-xs uppercase font-mono">
                    {product.packaging}s
                  </span>
                  <input
                    id="tx-quantity"
                    type="number"
                    min="1"
                    required
                    value={quantity || ''}
                    onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="Ex: 10"
                    className="w-full bg-transparent text-slate-950 font-mono py-2.5 px-3 text-sm outline-none font-black"
                  />
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-600 flex items-center gap-1.5 pt-1">
              <Clock size={12} />
              <span>O sistema salvará o registro em: <span className="font-mono text-slate-950 font-black">{new Date().toLocaleTimeString('pt-BR')}</span></span>
            </div>
          </div>

          {/* Dialog Action Buttons */}
          <div className="flex justify-end gap-2 border-t-2 border-black pt-4">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-900 font-black text-xs px-4 py-2.5 rounded-lg border-2 border-black cursor-pointer shadow-[2px_2px_0_rgba(0,0,0,1)] active:translate-y-0.5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`font-black text-xs text-white px-5 py-2.5 rounded-lg uppercase cursor-pointer border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,1)] active:translate-y-0.5 ${
                type === 'entrada' 
                  ? 'bg-emerald-600 hover:bg-emerald-700' 
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              Confirmar {type === 'entrada' ? 'Entrada' : 'Saída'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
