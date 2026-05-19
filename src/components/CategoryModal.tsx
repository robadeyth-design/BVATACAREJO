/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Plus, FolderPlus, Trash2, Layers, CheckCircle } from 'lucide-react';
import { Category } from '../types';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onAddCategory: (categoryName: string) => void;
  onAddSubcategory: (categoryId: string, subcategoryName: string) => void;
  onDeleteCategory?: (categoryId: string) => void;
  onDeleteSubcategory?: (categoryId: string, subCategoryName: string) => void;
}

export default function CategoryModal({
  isOpen,
  onClose,
  categories,
  onAddCategory,
  onAddSubcategory,
  onDeleteCategory,
  onDeleteSubcategory
}: CategoryModalProps) {
  const [newCatName, setNewCatName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('');

  // Set default category to first if not set
  React.useEffect(() => {
    if (categories.length > 0 && !selectedCatId) {
      setSelectedCatId(categories[0].id);
    }
  }, [categories, selectedCatId]);

  if (!isOpen) return null;

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    // Check if category name already exists
    if (categories.some(c => c.name.toLowerCase() === newCatName.trim().toLowerCase())) {
      alert('Esta categoria já existe!');
      return;
    }

    onAddCategory(newCatName.trim());
    setNewCatName('');
  };

  const handleCreateSubcategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim() || !selectedCatId) return;

    const targetCat = categories.find(c => c.id === selectedCatId);
    if (targetCat && targetCat.subcategories.some(s => s.toLowerCase() === newSubName.trim().toLowerCase())) {
      alert('Esta subcategoria já existe nesta categoria!');
      return;
    }

    onAddSubcategory(selectedCatId, newSubName.trim());
    setNewSubName('');
  };

  return (
    <div id="category-modal" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white border-2 border-black rounded-xl max-w-xl w-full text-slate-900 overflow-hidden shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-slate-100 px-6 py-4 border-b-2 border-black flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Layers className="text-amber-600" size={18} />
            <span className="font-black text-base tracking-tight text-slate-950 uppercase">GERENCIAR CATEGORIAS E SUBCATEGORIAS</span>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-900 hover:bg-slate-200 p-1.5 rounded-lg border-2 border-transparent hover:border-black transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Create Category form */}
          <form onSubmit={handleCreateCategory} className="space-y-2 bg-slate-50 p-4 border-2 border-black rounded-lg">
            <label htmlFor="category-creation-input" className="block text-xs font-black text-slate-900 uppercase tracking-wider">
              Cadastrar Nova Categoria
            </label>
            <p className="text-[11px] text-slate-700">Insira um grupo principal de logística (ex: "Frios", "Higiene Pessoal").</p>
            <div className="flex gap-2 mt-1">
              <input
                id="category-creation-input"
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Ex: Utilidades"
                className="flex-1 bg-white border-2 border-black text-slate-900 rounded-lg py-2 px-3 text-xs outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="bg-amber-450 text-slate-950 font-black text-xs hover:bg-amber-500 transition-colors px-4 rounded-lg flex items-center gap-1 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Cadastrar</span>
              </button>
            </div>
          </form>

          {/* Create Subcategory Form */}
          <form onSubmit={handleCreateSubcategory} className="space-y-2 bg-slate-50 p-4 border-2 border-black rounded-lg">
            <label htmlFor="category-for-sub-select" className="block text-xs font-black text-slate-900 uppercase tracking-wider">
              Cadastrar Nova Subcategoria
            </label>
            <p className="text-[11px] text-slate-705">Selecione a categoria alvo e digite a subcategoria secundária.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              <div>
                <select
                  id="category-for-sub-select"
                  value={selectedCatId}
                  onChange={(e) => setSelectedCatId(e.target.value)}
                  className="w-full bg-white border-2 border-black text-slate-900 rounded-lg py-2.5 px-3 text-xs outline-none cursor-pointer"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <input
                  id="subcategory-creation-input"
                  type="text"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="Ex: Escovas, Papelaria..."
                  className="flex-1 bg-white border-2 border-black text-slate-900 rounded-lg py-2 px-3 text-xs outline-none transition-colors focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="bg-amber-450 text-slate-950 font-black text-xs hover:bg-amber-500 transition-colors px-4 rounded-lg flex items-center gap-1 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>
          </form>

          {/* Categories List View with delete controls */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Lista de Relações Atuais</h4>
            
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {categories.map(c => (
                <div key={c.id} className="p-3 bg-white border-2 border-black rounded-lg space-y-2 animate-fade-in shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  <div className="flex justify-between items-center border-b-2 border-black pb-1.5">
                    <span className="font-extrabold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1">
                      📁 {c.name}
                    </span>
                    {onDeleteCategory && (
                      <button
                        onClick={() => onDeleteCategory(c.id)}
                        className="text-slate-500 hover:text-red-650 transition-colors cursor-pointer border-2 border-transparent hover:border-black rounded p-0.5"
                        title="Deletar categoria e suas subcategorias"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {c.subcategories.map(sub => (
                      <div key={sub} className="inline-flex items-center gap-1 bg-amber-50 border border-black text-[10px] text-slate-900 py-1 px-2 rounded font-black shadow-sm">
                        <span>{sub}</span>
                        {onDeleteSubcategory && (
                          <button
                            onClick={() => onDeleteSubcategory(c.id, sub)}
                            className="text-slate-505 hover:text-red-650 ml-1 transition-colors font-bold text-xs cursor-pointer"
                            title="Deletar subcategoria"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                    {c.subcategories.length === 0 && (
                      <span className="text-[10px] text-slate-500 italic font-bold">Nenhuma subcategoria vinculada.</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="bg-slate-100 p-4 border-t-2 border-black flex justify-end">
          <button
            onClick={onClose}
            className="bg-white hover:bg-slate-50 text-slate-900 border-2 border-black font-black text-xs px-5 py-2.5 rounded-lg transition-colors cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
