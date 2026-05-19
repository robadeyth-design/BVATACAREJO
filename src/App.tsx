/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Download, 
  Upload, 
  Layers, 
  AlertTriangle, 
  Clock, 
  History, 
  Package, 
  TrendingUp, 
  TrendingDown, 
  Filter, 
  Trash2, 
  CheckCircle,
  FileSpreadsheet,
  RefreshCw,
  QrCode,
  Info
} from 'lucide-react';
import { Product, Transaction, Category, PackagingType, ExpirationBatch } from './types';
import Logo from './components/Logo';
import BarcodeScanner from './components/BarcodeScanner';
import NewProductModal from './components/NewProductModal';
import TransactionModal from './components/TransactionModal';
import CategoryModal from './components/CategoryModal';

// Mock initial datasets
import { 
  INITIAL_CATEGORIES, 
  INITIAL_PRODUCTS, 
  INITIAL_TRANSACTIONS 
} from './utils/initialData';

const CURRENT_DATE_STR = '2026-05-19'; // Fixed anchor date based on metadata for consistent alerts

export default function App() {
  // Application State
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  // App views
  const [activeTab, setActiveTab] = useState<'products' | 'transactions'>('products');

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [selectedSubcategory, setSelectedSubcategory] = useState('todos');
  const [stockStatusFilter, setStockStatusFilter] = useState<'todos' | 'baixo_estoque' | 'vencimento_breve' | 'vencido'>('todos');

  // Modal control states
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);

  // Focus and transaction intermediates
  const [activeProductForTx, setActiveProductForTx] = useState<Product | null>(null);
  const [defaultTxType, setDefaultTxType] = useState<'entrada' | 'saida'>('entrada');
  const [defaultBatchId, setDefaultBatchId] = useState<string>('');
  const [scannedBarcodePending, setScannedBarcodePending] = useState<string>('');

  // Status logs for visual user feedback
  const [userNotification, setUserNotification] = useState<{message: string, type: 'success' | 'info' | 'error'} | null>(null);

  // Load from Backend API or use fallback LocalStorage/mock data on initial load
  useEffect(() => {
    // 1. Initial quick load from LocalStorage for immediate UI paint
    const savedProducts = localStorage.getItem('bv_logistics_products');
    const savedTransactions = localStorage.getItem('bv_logistics_transactions');
    const savedCategories = localStorage.getItem('bv_logistics_categories');

    if (savedProducts) {
      setProducts(JSON.parse(savedProducts));
    } else {
      setProducts(INITIAL_PRODUCTS);
    }

    if (savedTransactions) {
      setTransactions(JSON.parse(savedTransactions));
    } else {
      setTransactions(INITIAL_TRANSACTIONS);
    }

    if (savedCategories) {
      setCategories(JSON.parse(savedCategories));
    } else {
      setCategories(INITIAL_CATEGORIES);
    }

    // 2. Fetch the actual golden record from the Express Backend Database
    fetch('/api/data')
      .then(res => {
        if (!res.ok) throw new Error('Código de status não-OK retornado pelo backend.');
        return res.json();
      })
      .then(data => {
        if (data.products && data.transactions && data.categories) {
          setProducts(data.products);
          setTransactions(data.transactions);
          setCategories(data.categories);
          
          // Also sync local storage so fallback is updated
          localStorage.setItem('bv_logistics_products', JSON.stringify(data.products));
          localStorage.setItem('bv_logistics_transactions', JSON.stringify(data.transactions));
          localStorage.setItem('bv_logistics_categories', JSON.stringify(data.categories));
        }
      })
      .catch(err => {
        console.warn('Rodando em modo persistência local (Backend offline):', err);
      });
  }, []);

  // Sync to local storage & save to real Express Backend Database
  const saveAllToLocalStorage = (newProducts: Product[], newTransactions: Transaction[], newCategories: Category[]) => {
    // Keep local storage safe as secondary mirror
    localStorage.setItem('bv_logistics_products', JSON.stringify(newProducts));
    localStorage.setItem('bv_logistics_transactions', JSON.stringify(newTransactions));
    localStorage.setItem('bv_logistics_categories', JSON.stringify(newCategories));

    // Async push to our Express container database
    fetch('/api/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        products: newProducts,
        transactions: newTransactions,
        categories: newCategories
      })
    })
    .then(res => {
      if (!res.ok) throw new Error('Erro na resposta do servidor.');
      return res.json();
    })
    .then(data => {
      console.log('Banco de dados sincronizado no backend:', data.message || 'Ok');
    })
    .catch(err => {
      console.error('Erro de rede ao sincronizar dados com o backend:', err);
    });
  };

  const notifyUser = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setUserNotification({ message, type });
    setTimeout(() => {
      setUserNotification(null);
    }, 4500);
  };

  // --- Logic for evaluating and classifying expiration dates ---
  // returns days remaining until expiration date
  const getDaysRemaining = (expDate: string) => {
    const today = new Date(CURRENT_DATE_STR + 'T12:00:00');
    const exp = new Date(expDate + 'T12:00:00');
    const diffTime = exp.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getExpirationStatus = (expDate: string) => {
    const remaining = getDaysRemaining(expDate);
    if (remaining <= 0) return 'expired'; // Vencido
    if (remaining <= 30) return 'warning'; // Vence breve (30 dias)
    return 'good';
  };

  // --- Barcode / Scanner Scan trigger ---
  const handleBarcodeScanned = (barcode: string) => {
    const foundProduct = products.find(p => p.barcode === barcode);
    if (foundProduct) {
      // Product exists! Triggers the entrada/saida transaction modal
      setActiveProductForTx(foundProduct);
      setDefaultTxType('entrada');
      setIsTransactionOpen(true);
      notifyUser(`Produto encontrado bipado: ${foundProduct.name}`, 'success');
    } else {
      // Product not found! Ask to register the product and preset the barcode field
      setScannedBarcodePending(barcode);
      setIsNewProductOpen(true);
      notifyUser(`Código de barras ${barcode} não cadastrado. Preenchendo ficha de cadastro!`, 'info');
    }
  };

  // --- Transaction actions ---
  const handleConfirmTransaction = (
    productId: string,
    type: 'entrada' | 'saida',
    quantity: number,
    operatorName: string,
    batchId: string, // 'new' or existing batch ID
    newBatchDate?: string
  ) => {
    const nowTimestamp = new Date().toISOString();
    
    const updatedProducts = products.map(product => {
      if (product.id !== productId) return product;

      let updatedBatches = [...product.batches];

      if (type === 'entrada') {
        if (batchId === 'new' && newBatchDate) {
          // Add a brand new batch (up to 5 maximum)
          const newBatch: ExpirationBatch = {
            id: `b-${product.id}-${Date.now()}`,
            date: newBatchDate,
            quantity: quantity
          };
          updatedBatches.push(newBatch);
        } else {
          // Increment existing batch quantity
          updatedBatches = updatedBatches.map(b => {
            if (b.id === batchId) {
              return { ...b, quantity: b.quantity + quantity };
            }
            return b;
          });
        }
      } else {
        // Output / Exit transaction
        // Decrement selected batch quantity
        updatedBatches = updatedBatches.map(b => {
          if (b.id === batchId) {
            return { ...b, quantity: Math.max(0, b.quantity - quantity) };
          }
          return b;
        });

        // Filter out empty batches if they hit 0?
        // Actually, let's keep expired batches with 0 in list for visibility, or clean them up.
        // Keeping them is fine, but cleaning up 0-qty old batches is great to free slots inside the max 5 limit!
        // Let's filter out batches that have 0 quantity AND are expired or have been fully exhausted
        // so that new slots open up for active batches!
        updatedBatches = updatedBatches.filter(b => b.quantity > 0 || getDaysRemaining(b.date) > 0);
      }

      return {
        ...product,
        batches: updatedBatches,
        updatedAt: nowTimestamp
      };
    });

    const targetProduct = products.find(p => p.id === productId)!;
    const targetBatch = targetProduct.batches.find(b => b.id === batchId);
    
    // Create operation transaction history item
    const newTx: Transaction = {
      id: `t-${Date.now()}`,
      productId,
      productName: targetProduct.name,
      barcode: targetProduct.barcode,
      type,
      quantity,
      operatorName,
      timestamp: nowTimestamp,
      packaging: targetProduct.packaging,
      batchId: batchId === 'new' ? undefined : batchId,
      batchDate: batchId === 'new' ? newBatchDate : targetBatch?.date
    };

    const newTransactions = [newTx, ...transactions];

    setProducts(updatedProducts);
    setTransactions(newTransactions);
    saveAllToLocalStorage(updatedProducts, newTransactions, categories);
    
    notifyUser(
      `Estoque atualizado! ${type.toUpperCase()}: ${quantity} ${targetProduct.packaging}(s) de ${targetProduct.name}.`, 
      type === 'entrada' ? 'success' : 'info'
    );
  };

  // --- Register new product ---
  const handleSaveNewProduct = (newProduct: Product, operatorName: string) => {
    const updatedProducts = [...products, newProduct];
    
    // If the product creation includes an initial batch with quantity, log it as an entrance transaction
    let newTransactions = [...transactions];
    newProduct.batches.forEach((batch, idx) => {
      if (batch.quantity > 0) {
        const initialTx: Transaction = {
          id: `t-${Date.now()}-${idx}`,
          productId: newProduct.id,
          productName: newProduct.name,
          barcode: newProduct.barcode,
          type: 'entrada',
          quantity: batch.quantity,
          operatorName: operatorName,
          timestamp: new Date().toISOString(),
          packaging: newProduct.packaging,
          batchId: batch.id,
          batchDate: batch.date
        };
        newTransactions = [initialTx, ...newTransactions];
      }
    });

    setProducts(updatedProducts);
    setTransactions(newTransactions);
    setScannedBarcodePending(''); // Reset scanned state
    saveAllToLocalStorage(updatedProducts, newTransactions, categories);
    
    notifyUser(`Novo produto cadastrado: ${newProduct.name}`, 'success');
  };

  // --- Category / Subcategory mutation handlers ---
  const handleAddCategory = (categoryName: string) => {
    const newCategoryObj: Category = {
      id: `cat-${Date.now()}`,
      name: categoryName,
      subcategories: []
    };
    const updatedCategories = [...categories, newCategoryObj];
    setCategories(updatedCategories);
    saveAllToLocalStorage(products, transactions, updatedCategories);
    notifyUser(`Categoria "${categoryName}" cadastrada com sucesso!`, 'success');
  };

  const handleAddSubcategory = (categoryId: string, subcategoryName: string) => {
    const updatedCategories = categories.map(c => {
      if (c.id === categoryId) {
        return {
          ...c,
          subcategories: [...c.subcategories, subcategoryName]
        };
      }
      return c;
    });
    setCategories(updatedCategories);
    saveAllToLocalStorage(products, transactions, updatedCategories);
    notifyUser(`Subcategoria "${subcategoryName}" adicionada com sucesso!`, 'success');
  };

  const handleDeleteCategory = (categoryId: string) => {
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) return;
    if (!window.confirm(`Tem certeza que deseja excluir a categoria "${cat.name}" e todas suas subcategorias?`)) return;

    const updatedCategories = categories.filter(c => c.id !== categoryId);
    setCategories(updatedCategories);
    saveAllToLocalStorage(products, transactions, updatedCategories);
    notifyUser(`Categoria "${cat.name}" removida.`, 'info');
  };

  const handleDeleteSubcategory = (categoryId: string, subCategoryName: string) => {
    const updatedCategories = categories.map(c => {
      if (c.id === categoryId) {
        return {
          ...c,
          subcategories: c.subcategories.filter(sc => sc !== subCategoryName)
        };
      }
      return c;
    });
    setCategories(updatedCategories);
    saveAllToLocalStorage(products, transactions, updatedCategories);
    notifyUser(`Subcategoria "${subCategoryName}" removida.`, 'info');
  };

  const handleDeleteProduct = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente o produto "${product.name}"? Isso não apagará o histórico de transações.`)) return;

    const updatedProducts = products.filter(p => p.id !== productId);
    setProducts(updatedProducts);
    saveAllToLocalStorage(updatedProducts, transactions, categories);
    notifyUser(`Produto "${product.name}" excluído do catálogo.`, 'info');
  };

  // --- Export and Import functions (JSON and CSV formats) ---
  const handleExportData = (format: 'json' | 'csv') => {
    if (format === 'json') {
      const exportObject = {
        products,
        transactions,
        categories,
        exportedAt: new Date().toISOString()
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObject, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `BV_Logistica_Backup_${CURRENT_DATE_STR}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      notifyUser('Backup completo baixado como JSON!', 'success');
    } else {
      // CSV format exports the Products Catalog with consolidated stock
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Codigo_Barras,Nome_Produto,Categoria,Subcategoria,Embalagem,Estoque_Total,Qtde_Validades,Minimo_Seguranca\n";
      
      products.forEach(p => {
        const totalQty = p.batches.reduce((sum, b) => sum + b.quantity, 0);
        const line = `"${p.barcode}","${p.name.replace(/"/g, '""')}","${p.category}","${p.subcategory}","${p.packaging}",${totalQty},${p.batches.length},${p.minStock}`;
        csvContent += line + "\n";
      });

      const encodedUri = encodeURI(csvContent);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", encodedUri);
      downloadAnchor.setAttribute("download", `BV_Logistica_Estoque_${CURRENT_DATE_STR}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      notifyUser('Catálogo de estoque baixado como CSV!', 'success');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = e.target.files?.[0];
    if (!file) return;

    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.products && Array.isArray(parsed.products)) {
          setProducts(parsed.products);
          setTransactions(parsed.transactions || []);
          setCategories(parsed.categories || INITIAL_CATEGORIES);
          
          saveAllToLocalStorage(parsed.products, parsed.transactions || [], parsed.categories || INITIAL_CATEGORIES);
          notifyUser('Dados importados com sucesso a partir do arquivo!', 'success');
        } else {
          notifyUser('Formato de arquivo inválido. Certifique-se de que é um arquivo JSON válido do BV Logística.', 'error');
        }
      } catch (err) {
        notifyUser('Erro ao decodificar arquivo JSON de backup.', 'error');
      }
    };
    fileReader.readAsText(file);
    // Reset file input target
    e.target.value = '';
  };

  // --- Statistics computations ---
  const statistics = useMemo(() => {
    let totalItemsStock = 0;
    let lowStockCount = 0;
    let nearExpirationCount = 0;
    let expiredCount = 0;

    products.forEach(product => {
      const productTotalStock = product.batches.reduce((sum, b) => sum + b.quantity, 0);
      totalItemsStock += productTotalStock;

      if (productTotalStock < product.minStock) {
        lowStockCount++;
      }

      product.batches.forEach(b => {
        const status = getExpirationStatus(b.date);
        if (status === 'expired' && b.quantity > 0) {
          expiredCount++;
        } else if (status === 'warning' && b.quantity > 0) {
          nearExpirationCount++;
        }
      });
    });

    const entriesToday = transactions.filter(t => t.type === 'entrada' && t.timestamp.startsWith(CURRENT_DATE_STR)).length;
    const exitsToday = transactions.filter(t => t.type === 'saida' && t.timestamp.startsWith(CURRENT_DATE_STR)).length;

    return {
      totalProductsCount: products.length,
      totalItemsStock,
      lowStockCount,
      nearExpirationCount,
      expiredCount,
      entriesToday,
      exitsToday
    };
  }, [products, transactions]);

  // --- Filter and Search products ---
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // 1. Search Query
      const matchesSearch = 
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.barcode.includes(searchQuery) ||
        product.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.subcategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.notes && product.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      // 2. Category Filter
      const matchesCategory = selectedCategory === 'todos' || product.category === selectedCategory;

      // 3. Subcategory Filter
      const matchesSubcategory = selectedSubcategory === 'todos' || product.subcategory === selectedSubcategory;

      // 4. Stock Alarm Status Filter
      const totalStock = product.batches.reduce((sum, b) => sum + b.quantity, 0);
      let matchesAlarm = true;
      if (stockStatusFilter === 'baixo_estoque') {
        matchesAlarm = totalStock < product.minStock;
      } else if (stockStatusFilter === 'vencimento_breve') {
        matchesAlarm = product.batches.some(b => b.quantity > 0 && getExpirationStatus(b.date) === 'warning');
      } else if (stockStatusFilter === 'vencido') {
        matchesAlarm = product.batches.some(b => b.quantity > 0 && getExpirationStatus(b.date) === 'expired');
      }

      return matchesSearch && matchesCategory && matchesSubcategory && matchesAlarm;
    });
  }, [products, searchQuery, selectedCategory, selectedSubcategory, stockStatusFilter]);

  // Clean filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('todos');
    setSelectedSubcategory('todos');
    setStockStatusFilter('todos');
  };

  // List of active subcategories depending on category
  const activeSubcategoriesList = useMemo(() => {
    if (selectedCategory === 'todos') return [];
    const cat = categories.find(c => c.name === selectedCategory);
    return cat ? cat.subcategories : [];
  }, [selectedCategory, categories]);

  return (
    <div id="logistic-app-container" className="min-h-screen bg-[#f1f5f9] text-slate-800 flex flex-col font-sans selection:bg-amber-400 selection:text-black">
      
      {/* 1. Header Navigation */}
      <header id="app-header" className="bg-[#0b0c11]/90 border-b-4 border-black sticky top-0 z-40 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Brand Logo & Presentation */}
          <div className="flex items-center gap-3">
            <Logo size="md" className="shadow-[0_0_20px_rgba(0,0,0,0.8)] border-2 border-black" />
            <div className="hidden md:block h-8 w-[1px] bg-neutral-800/100"></div>
            <div className="hidden md:block">
              <span className="text-[9px] text-neutral-350 uppercase tracking-widest block font-extrabold font-display">Data Operação</span>
              <span id="header-time" className="text-xs text-amber-405 font-mono flex items-center gap-1.5 font-black">
                <Clock size={12} className="inline text-amber-400" /> 
                19/05/2026 (UTC)
              </span>
            </div>
          </div>

          {/* Real-time Header Search Bar Integration */}
          <div className="relative w-full md:max-w-md mx-0 md:mx-4" id="header-search-bar-wrapper">
            <Search className="absolute left-3.5 top-3 text-neutral-400" size={14} />
            <input
              id="header-search-bar"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                // Switch back to catalog directory if looking at logs to view search results
                if (activeTab !== 'products') {
                  setActiveTab('products');
                }
              }}
              placeholder="Pesquisa rápida (Código de barras, Produto...)"
              className="w-full bg-neutral-950/80 border-2 border-black text-white placeholder-neutral-400 rounded-lg pl-9 pr-4 py-2 text-xs outline-none focus:border-amber-400 transition-all font-display tracking-wide font-extrabold shadow-sm hover:border-black"
            />
          </div>

          {/* Quick Tools Header Info */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <button
              onClick={() => setIsCategoryOpen(true)}
              className="bg-neutral-900 hover:bg-neutral-800 text-amber-400 border-2 border-black rounded-lg px-4 py-2 text-xs font-black font-display tracking-wide transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
            >
              <Layers size={14} className="text-amber-400" />
              <span>Categorias ({categories.length})</span>
            </button>

            <button
              id="cadastrar-produto-action-btn"
              onClick={() => {
                setScannedBarcodePending('');
                setIsNewProductOpen(true);
              }}
              className="bg-amber-400 hover:bg-amber-305 text-black border-2 border-black font-black rounded-lg px-4 py-2 text-xs font-display tracking-wider transition-all duration-250 flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Novo Produto</span>
            </button>
          </div>

        </div>
      </header>

      {/* 2. Visual Toast Notifications */}
      {userNotification && (
        <div id="global-toast-notification" className="fixed top-20 right-4 sm:right-8 z-50 animate-bounce">
          <div className={`p-4 rounded-lg shadow-2xl border flex items-center gap-3 max-w-sm backdrop-blur-md ${
            userNotification.type === 'success' 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-lg' 
              : userNotification.type === 'error'
              ? 'bg-red-50 text-red-700 border-red-200 shadow-lg'
              : 'bg-white text-slate-800 border-slate-200 shadow-lg'
          }`}>
            <CheckCircle size={18} className="flex-shrink-0 text-amber-500 animate-pulse" />
            <p className="text-xs font-medium leading-relaxed">{userNotification.message}</p>
          </div>
        </div>
      )}

      {/* 3. Main Dashboard Workspace */}
      <main id="main-content" className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
        
        {/* Statistics Widgets Banner */}
        <div id="statistics-panels-grid" className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          
          <button 
            type="button"
            onClick={() => {
              setActiveTab('products');
              handleResetFilters();
            }}
            className="group bg-white hover:bg-slate-50 border-2 border-black p-4 rounded-xl flex flex-col justify-between transition-all duration-305 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] cursor-pointer text-left w-full hover:-translate-y-0.5"
            title="Ver catálogo completo"
          >
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-800 font-display group-hover:text-amber-600 transition-colors">Total Produtos</span>
            <div className="flex items-baseline gap-1 mt-2.5">
              <span className="text-2xl font-black font-mono tracking-tight text-slate-900">{statistics.totalProductsCount}</span>
              <span className="text-xs text-slate-500 font-extrabold">itens</span>
            </div>
          </button>

          <button 
            type="button"
            onClick={() => {
              setActiveTab('products');
              handleResetFilters();
            }}
            className="group bg-white hover:bg-slate-50 border-2 border-black p-4 rounded-xl flex flex-col justify-between transition-all duration-305 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] cursor-pointer text-left w-full hover:-translate-y-0.5"
            title="Ver catálogo completo"
          >
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-800 font-display group-hover:text-amber-600 transition-colors">Volume em Estoque</span>
            <div className="flex items-baseline gap-1 mt-2.5">
              <span className="text-2xl font-black font-mono tracking-tight text-slate-900">{statistics.totalItemsStock}</span>
              <span className="text-xs text-slate-500 font-extrabold">und</span>
            </div>
          </button>

          <button 
            type="button"
            onClick={() => {
              setActiveTab('products');
              setSelectedCategory('todos');
              setSelectedSubcategory('todos');
              setSearchQuery('');
              setStockStatusFilter('baixo_estoque');
            }}
            className={`group p-4 rounded-xl flex flex-col justify-between transition-all duration-305 relative overflow-hidden cursor-pointer text-left w-full border-2 border-black hover:-translate-y-0.5 ${
              stockStatusFilter === 'baixo_estoque' 
                ? 'bg-red-50 shadow-[4px_4px_0px_rgba(0,0,0,1)]' 
                : 'bg-white hover:bg-red-50/10 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)]'
            }`}
            title="Filtrar por produtos com estoque abaixo do seguro"
          >
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-800 font-display group-hover:text-red-750 transition-colors">Baixo Estoque</span>
            <div className="flex items-baseline gap-1.5 mt-2.5">
              <span className={`text-2xl font-black font-mono tracking-tight ${statistics.lowStockCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                {statistics.lowStockCount}
              </span>
              <span className="text-xs text-slate-600 font-extrabold">produtos</span>
            </div>
            {statistics.lowStockCount > 0 && <div className="absolute right-2 bottom-1.5 text-red-500/10"><AlertTriangle size={32} /></div>}
          </button>

          <button 
            type="button"
            onClick={() => {
              setActiveTab('products');
              setSelectedCategory('todos');
              setSelectedSubcategory('todos');
              setSearchQuery('');
              setStockStatusFilter('vencimento_breve');
            }}
            className={`group p-4 rounded-xl flex flex-col justify-between transition-all duration-305 relative overflow-hidden cursor-pointer text-left w-full border-2 border-black hover:-translate-y-0.5 ${
              stockStatusFilter === 'vencimento_breve' 
                ? 'bg-amber-50 shadow-[4px_4px_0px_rgba(0,0,0,1)]' 
                : 'bg-white hover:bg-amber-50/10 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)]'
            }`}
            title="Filtrar por lotes que vencem em breve"
          >
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-800 font-display group-hover:text-amber-700 transition-colors">Vence em Breve</span>
            <div className="flex items-baseline gap-1.5 mt-2.5">
              <span className={`text-2xl font-black font-mono tracking-tight ${statistics.nearExpirationCount > 0 ? 'text-amber-600 animate-pulse' : 'text-slate-400'}`}>
                {statistics.nearExpirationCount}
              </span>
              <span className="text-xs text-slate-600 font-extrabold">lotes</span>
            </div>
          </button>

          <button 
            type="button"
            onClick={() => {
              setActiveTab('transactions');
            }}
            className={`group p-4 rounded-xl flex flex-col justify-between col-span-2 sm:col-span-1 transition-all duration-305 cursor-pointer text-left w-full border-2 border-black hover:-translate-y-0.5 ${
              activeTab === 'transactions'
                ? 'bg-amber-50 shadow-[4px_4px_0px_rgba(0,0,0,1)]'
                : 'bg-white hover:bg-slate-50 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)]'
            }`}
            title="Ver histórico de movimentações de hoje"
          >
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-500 font-display group-hover:text-amber-600 transition-colors">Operações Hoje</span>
            <div className="flex items-center gap-3 mt-3.5 text-xs">
              <span className="font-mono text-emerald-600 font-black flex items-center gap-0.5">
                <TrendingUp size={12} className="text-emerald-500 animate-bounce" /> +{statistics.entriesToday}
              </span>
              <span className="font-mono text-red-655 font-black flex items-center gap-0.5">
                <TrendingDown size={12} className="text-red-500 animate-bounce" /> -{statistics.exitsToday}
              </span>
            </div>
          </button>

        </div>

        {/* Scanning & Fast Entry Section */}
        <div id="scanning-station-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Main Barcode Scanner Block */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping"></div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-600 font-display">LEITOR EXCLUSIVO BV ATACAREJO</h2>
            </div>
            <BarcodeScanner 
              onScan={handleBarcodeScanned}
              availableProducts={products}
            />
          </div>

          {/* Quick Informational Guide & Operations Configurator */}
          <div className="bg-white border-2 border-black rounded-xl p-5 space-y-4 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            <h3 className="font-black text-sm text-slate-800 flex items-center gap-1.5 uppercase tracking-wider font-display">
              <Info size={16} className="text-amber-600" />
              Instruções de Estoque
            </h3>
            
            <div className="text-xs text-slate-700 space-y-2.5 leading-relaxed">
              <p>
                O applet do <strong>BV ATACAREJO</strong> permite o controle integrado de embalagens (Paletes, Fardos, Pacotes, Unidades e kg) com controle detalhado de até <strong>5 validades diferentes por lote</strong>.
              </p>
              <div className="bg-slate-100 border-2 border-black p-3 rounded-lg space-y-2">
                <p className="text-[11px] text-amber-800 font-black uppercase tracking-wider flex items-center gap-1.5">
                  <span>⚙️</span> Configurações de Fluxo
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-800">
                  <li><strong>Entrada:</strong> Soma unidades ao lote selecionado ou cria um novo lote de validade (max 5).</li>
                  <li><strong>Saída:</strong> Subtrai do lote selecionado, prevenindo vencidos (método FEFO).</li>
                </ul>
              </div>
              <p className="text-[11px] italic text-slate-500">
                Caso use leitor USB ou Bluetooth externo no Android, deixe a aba "Leitor Portátil" ativa. O leitor portatíl atuará globalmente sob qualquer foco de tela!
              </p>
            </div>

            {/* Backups Export & Import Buttons */}
            <div className="border-t-2 border-black pt-4 space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-800 font-display">Backup & Integração externa</h4>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleExportData('json')}
                  className="bg-white hover:bg-slate-50 border-2 border-black text-slate-800 rounded-lg py-2 px-3 text-[10px] md:text-sm font-black tracking-wide transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                  title="Exportar todos os dados em arquivo JSON"
                >
                  <Download size={12} className="text-amber-650" />
                  <span>Backup JSON</span>
                </button>

                <button
                  onClick={() => handleExportData('csv')}
                  className="bg-white hover:bg-slate-50 border-2 border-black text-slate-800 rounded-lg py-2 px-3 text-[10px] md:text-sm font-black tracking-wide transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                  title="Exportar catálogo consolidado em CSV"
                >
                  <FileSpreadsheet size={12} className="text-amber-650" />
                  <span>Estoque CSV</span>
                </button>
              </div>

              {/* Import trigger */}
              <div className="relative">
                <label 
                  htmlFor="import-backup-file" 
                  className="w-full bg-amber-150 hover:bg-amber-200 border-2 border-black rounded-lg py-2.5 px-3 text-[11px] text-slate-900 font-black tracking-wider transition-all duration-205 flex items-center justify-center gap-2 cursor-pointer text-center shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                >
                  <Upload size={12} className="text-amber-600" />
                  <span>IMPORTAR BACKUP DE DADOS</span>
                </label>
                <input
                  id="import-backup-file"
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </div>

            </div>
          </div>

        </div>

        {/* Interactive Query Filters & Core Tab Controllers */}
        <div className="space-y-4">
          
          {/* Main Visual Tabs */}
          <div className="flex border-b-4 border-black" id="main-view-tabs">
            <button
              onClick={() => setActiveTab('products')}
              className={`py-3 px-6 text-xs font-black tracking-widest uppercase flex items-center gap-2.5 border-t-2 border-l-2 border-r-2 rounded-t-lg transition-all font-display duration-200 cursor-pointer ${
                activeTab === 'products'
                  ? 'border-black bg-amber-450/15 text-slate-900 translate-y-1'
                  : 'border-transparent text-slate-500 hover:text-slate-850'
              }`}
            >
              <Package size={16} className={activeTab === 'products' ? "text-amber-650 font-black animate-pulse" : "text-slate-500"} />
              <span>Catálogo & Validades</span>
            </button>

            <button
              id="transactions-history-tab"
              onClick={() => setActiveTab('transactions')}
              className={`py-3 px-6 text-xs font-black tracking-widest uppercase flex items-center gap-2.5 border-t-2 border-l-2 border-r-2 rounded-t-lg transition-all font-display duration-200 cursor-pointer ${
                activeTab === 'transactions'
                  ? 'border-black bg-amber-450/15 text-slate-900 translate-y-1'
                  : 'border-transparent text-slate-500 hover:text-slate-850'
              }`}
            >
              <History size={16} className={activeTab === 'transactions' ? "text-amber-655 font-black animate-pulse" : "text-slate-500"} />
              <span>Histórico de Entrada/Saída</span>
            </button>
          </div>

          {activeTab === 'products' && (
            <div className="space-y-4" id="products-catalog-view">
              
              {/* Filter Toolbelt controls */}
              <div className="bg-white border-2 border-black rounded-xl p-5 space-y-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <div className="flex flex-col md:flex-row gap-3">
                  
                  {/* Home screen search bar requested: "barra de pesquisa na tela inicial" */}
                  <div className="relative flex-1" id="home-search-bar-wrapper">
                    <Search className="absolute left-3.5 top-3.5 text-slate-800" size={16} />
                    <input
                      id="home-search-bar"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Pesquisar por Código de Barras, Nome do Produto, Categoria..."
                      className="w-full bg-white border-2 border-black text-slate-900 placeholder-slate-500 rounded-lg pl-10 pr-4 py-2.5 text-xs outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap gap-2">
                    {/* Category Dropdown */}
                    <div className="w-full sm:w-[160px]">
                      <select
                        id="filter-category"
                        value={selectedCategory}
                        onChange={(e) => {
                          setSelectedCategory(e.target.value);
                          setSelectedSubcategory('todos'); // reset subcategory on category swap
                        }}
                        className="w-full bg-white border-2 border-black text-slate-800 rounded-lg p-2.5 text-xs cursor-pointer outline-none focus:border-amber-500"
                      >
                        <option value="todos">🗂️ Todas Categorias</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Subcategory Dropdown */}
                    <div className="w-full sm:w-[160px]">
                      <select
                        id="filter-subcategory"
                        value={selectedSubcategory}
                        onChange={(e) => setSelectedSubcategory(e.target.value)}
                        disabled={selectedCategory === 'todos'}
                        className="w-full bg-white border-2 border-black text-slate-800 rounded-lg p-2.5 text-xs cursor-pointer outline-none focus:border-amber-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <option value="todos">🏷️ Subcategorias (Todas)</option>
                        {activeSubcategoriesList.map(sc => (
                          <option key={sc} value={sc}>{sc}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Alarm shortcuts pill selection */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setStockStatusFilter('todos')}
                      className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-black font-display transition-all duration-200 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5 ${
                        stockStatusFilter === 'todos'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-805 hover:bg-slate-50'
                      }`}
                    >
                      Todos Produtos
                    </button>
                    
                    <button
                      onClick={() => setStockStatusFilter('baixo_estoque')}
                      className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-black font-display flex items-center gap-1.5 transition-all duration-200 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5 ${
                        stockStatusFilter === 'baixo_estoque'
                          ? 'bg-red-50 text-red-800'
                          : 'bg-white text-slate-805 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                      Estoque Baixo ({statistics.lowStockCount})
                    </button>

                    <button
                      onClick={() => setStockStatusFilter('vencimento_breve')}
                      className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-black font-display flex items-center gap-1.5 transition-all duration-200 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5 ${
                        stockStatusFilter === 'vencimento_breve'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-white text-slate-805 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
                      Vencimento Breve ({statistics.nearExpirationCount})
                    </button>

                    <button
                      onClick={() => setStockStatusFilter('vencido')}
                      className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-black font-display flex items-center gap-1.5 transition-all duration-200 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5 ${
                        stockStatusFilter === 'vencido'
                          ? 'bg-red-150 text-red-900'
                          : 'bg-white text-slate-805 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                      Lote Vencido ({statistics.expiredCount})
                    </button>
                  </div>

                  {/* Clear button */}
                  {(searchQuery || selectedCategory !== 'todos' || stockStatusFilter !== 'todos') && (
                    <button
                      onClick={handleResetFilters}
                      className="inline-flex items-center gap-1.5 text-slate-900 hover:text-amber-800 py-1.5 px-3 border-2 border-black bg-white hover:bg-slate-50 text-[10px] font-black rounded-lg cursor-pointer transition-colors font-display shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                    >
                      <RefreshCw size={11} className="text-amber-600 animate-spin" style={{ animationDuration: '3s' }} />
                      <span>Limpar Filtros</span>
                    </button>
                  )}
                </div>

              </div>

              {/* Products Table/Listing */}
              <div className="bg-white border-2 border-black rounded-xl overflow-hidden shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse" id="products-table">
                    <thead>
                      <tr className="bg-slate-100 border-b-2 border-black text-slate-900 text-[10px] md:text-xs font-black uppercase tracking-wider font-display">
                        <th className="py-4 px-4 font-mono">Código de Barras</th>
                        <th className="py-4 px-4">Produto</th>
                        <th className="py-4 px-4 hidden sm:table-cell">Categoria &rsaquo; Sub</th>
                        <th className="py-4 px-4 text-center justify-center">Validades (Máx 5)</th>
                        <th className="py-4 px-4 text-right">Estoque</th>
                        <th className="py-4 px-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {filteredProducts.map(p => {
                        const totalStock = p.batches.reduce((sum, b) => sum + b.quantity, 0);
                        const isUnderStock = totalStock < p.minStock;

                        // Sort batches chronologically so closest to expiration is first
                        const sortedBatches = [...p.batches].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Barcode code */}
                            <td 
                              onClick={() => {
                                setActiveProductForTx(p);
                                setDefaultTxType('entrada');
                                setDefaultBatchId('');
                                setIsTransactionOpen(true);
                              }}
                              className="py-4 px-4 font-mono font-bold text-amber-600 tracking-wide text-[11px] md:text-xs whitespace-nowrap cursor-pointer hover:bg-amber-50/40 transition-colors"
                              title="Clique para nova movimentação de entrada/saída"
                            >
                              {p.barcode}
                            </td>
                            
                            {/* Product Info */}
                            <td 
                              onClick={() => {
                                setActiveProductForTx(p);
                                setDefaultTxType('entrada');
                                setDefaultBatchId('');
                                setIsTransactionOpen(true);
                              }}
                              className="py-4 px-4 cursor-pointer hover:bg-amber-50/40 transition-colors"
                              title="Clique para nova movimentação de entrada/saída"
                            >
                              <div className="font-extrabold text-slate-800">{p.name}</div>
                              {p.notes && (
                                <p className="text-[10px] text-slate-400 mt-1 italic leading-relaxed line-clamp-1">📌 {p.notes}</p>
                              )}
                              <div className="sm:hidden text-[10px] text-slate-500 mt-1 flex items-center gap-1.5">
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded">{p.category}</span>
                                <span>&rsaquo;</span>
                                <span>{p.subcategory}</span>
                              </div>
                            </td>

                            {/* Category columns */}
                            <td className="py-4 px-4 hidden sm:table-cell">
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCategory(p.category);
                                  setSelectedSubcategory('todos');
                                }}
                                className="bg-slate-100 hover:bg-amber-150 hover:text-amber-800 hover:border-amber-300 border border-slate-205 text-[10px] text-slate-650 font-extrabold uppercase tracking-wider px-2 py-0.5 rounded cursor-pointer transition-all duration-150"
                                title={`Filtrar pela categoria: ${p.category}`}
                              >
                                {p.category}
                              </span>
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCategory(p.category);
                                  setSelectedSubcategory(p.subcategory);
                                }}
                                className="text-[10px] text-slate-400 hover:text-amber-700 font-medium cursor-pointer mt-1 hover:underline transition-colors"
                                title={`Filtrar pela subcategoria: ${p.subcategory}`}
                              >
                                {p.subcategory}
                              </div>
                            </td>

                            {/* Individual batches displaying up to 5 validation states (requested check 5 validades) */}
                            <td className="py-4 px-4">
                              <div className="flex flex-col gap-1.5 max-w-[240px] mx-auto">
                                {sortedBatches.map((b) => {
                                  const status = getExpirationStatus(b.date);
                                  const days = getDaysRemaining(b.date);
                                  
                                  let dateBadgeStyle = 'bg-slate-50 text-slate-600 border-slate-200';
                                  let timeText = `${days} dias`;
                                  
                                  if (status === 'expired') {
                                    dateBadgeStyle = 'bg-red-50 text-red-600 border-red-200 animate-pulse';
                                    timeText = 'VENCIDO';
                                  } else if (status === 'warning') {
                                    dateBadgeStyle = 'bg-amber-50 text-amber-700 border-amber-205';
                                    timeText = `Vence em ${days}d`;
                                  }

                                  return (
                                    <div 
                                      key={b.id} 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveProductForTx(p);
                                        setDefaultTxType('saida');
                                        setDefaultBatchId(b.id);
                                        setIsTransactionOpen(true);
                                      }}
                                      className={`flex items-center justify-between text-[10px] px-2 py-1 rounded border leading-tight ${dateBadgeStyle} cursor-pointer hover:scale-[1.03] hover:border-amber-500 transition-all`}
                                      title={`Lote de validade: ${b.date}. Clique para dar saída automática deste lote.`}
                                    >
                                      <span className="font-mono">{new Date(b.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                      <span className="font-semibold text-[9px] uppercase space-x-1">
                                        <span>({timeText})</span>
                                        <span className="text-slate-800 font-extrabold bg-slate-200/50 px-1 py-0.2 rounded-sm">{b.quantity}u</span>
                                      </span>
                                    </div>
                                  );
                                })}

                                {p.batches.length === 0 && (
                                  <span className="text-[10px] text-slate-400 italic text-center">Nenhuma validade ativa</span>
                                )}
                              </div>
                            </td>

                            {/* Total consolidated stock count */}
                            <td 
                              onClick={() => {
                                setActiveProductForTx(p);
                                setDefaultTxType(totalStock > 0 ? 'saida' : 'entrada');
                                setDefaultBatchId('');
                                setIsTransactionOpen(true);
                              }}
                              className="py-4 px-4 text-right whitespace-nowrap font-mono text-xs md:text-sm cursor-pointer hover:bg-amber-50/40 transition-colors text-right"
                              title="Clique para nova movimentação de entrada/saída"
                            >
                              <span className={`font-black ${isUnderStock ? 'text-red-650 animate-pulse' : 'text-slate-800'}`}>
                                {totalStock}
                              </span>
                              <span className="text-[10px] text-slate-400 uppercase tracking-widest pl-1 block font-sans font-bold">
                                {p.packaging}(s)
                              </span>
                              {isUnderStock && (
                                <span className="text-[9px] text-red-600 font-bold bg-red-50 border border-red-200 px-1 py-0.2 rounded-sm inline-block mt-1">
                                  REGISTRO CRÍTICO
                                </span>
                              )}
                            </td>

                            {/* Operations controls */}
                            <td className="py-4 px-4">
                              <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setActiveProductForTx(p);
                                    setDefaultTxType('entrada');
                                    setIsTransactionOpen(true);
                                  }}
                                  className="w-full sm:w-auto bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 font-semibold text-[11px] py-1 px-2.5 rounded-lg cursor-pointer transition-colors"
                                  title="Registrar entrada de produto (Estoque)"
                                >
                                  + Entrada
                                </button>
                                
                                <button
                                  onClick={() => {
                                    setActiveProductForTx(p);
                                    setDefaultTxType('saida');
                                    setIsTransactionOpen(true);
                                  }}
                                  className="w-full sm:w-auto bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-semibold text-[11px] py-1 px-2.5 rounded-lg cursor-pointer transition-colors"
                                  title="Registrar saída do produto"
                                  disabled={totalStock <= 0}
                                >
                                  - Saída
                                </button>

                                <button
                                  onClick={() => handleDeleteProduct(p.id)}
                                  className="text-slate-450 hover:text-red-500 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                                  title="Remover produto do catálogo"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-xs text-slate-400 italic">
                            Nenhum produto atende aos filtros de busca atuais. Experimente limpar os filtros ou cadastrar um novo produto.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-4" id="transactions-log-view">
              
              {/* Transactions list layout */}
              <div className="bg-white border-2 border-black rounded-xl overflow-hidden shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                <div className="p-4 bg-slate-100 border-b-2 border-black flex justify-between items-center text-xs text-slate-900">
                  <span className="font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5 font-display">
                    <History size={14} className="text-amber-650" />
                    REGISTRO TEMPORAL EXATO DE ENTRADAS E SAÍDAS
                  </span>
                  <span className="font-black tracking-wider text-[10px] bg-amber-450/20 text-slate-900 border border-black px-2.5 py-1 rounded-md">{transactions.length} movimentações</span>
                </div>

                <div className="divide-y divide-slate-100 overflow-y-auto max-h-[500px]">
                  {transactions.map(tx => {
                    const exactTimeStr = new Date(tx.timestamp).toLocaleString('pt-BR');
                    const isEntry = tx.type === 'entrada';

                    return (
                      <div key={tx.id} className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        
                        {/* Transaction core identifier & Type badges */}
                        <div className="flex items-start gap-4">
                          <div className={`p-2.5 rounded-xl flex-shrink-0 ${
                            isEntry ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-inner' : 'bg-red-50 text-red-655 border border-red-200 shadow-inner'
                          }`}>
                            {isEntry ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-baseline gap-2">
                              <span className={`text-[10px] font-bold uppercase tracking-widest font-display ${
                                isEntry ? 'text-emerald-600' : 'text-red-600'
                              }`}>
                                {isEntry ? 'Entrada' : 'Saída'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">({tx.barcode})</span>
                            </div>

                            <h4 className="font-bold text-slate-800 text-xs sm:text-sm">{tx.productName}</h4>
                            
                            {/* Operator register info and expiration dates metadata */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-0.5">
                              <span className="font-medium flex items-center gap-0.5 text-slate-400">
                                👤 Movimentador: <span className="text-slate-800 font-semibold capitalize ml-1">{tx.operatorName}</span>
                              </span>
                              {tx.batchDate && (
                                <span className="bg-slate-105 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-lg font-mono text-[10px]">
                                  Lote Validade: {new Date(tx.batchDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Exact transaction log and timestamp (as requested: "marcar hora exata do produto que deu entrada") */}
                        <div className="text-right flex sm:flex-col justify-between sm:justify-center items-center sm:items-end w-full sm:w-auto border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0">
                          <span className={`text-sm md:text-base font-black font-mono ${isEntry ? 'text-emerald-600' : 'text-red-750'}`}>
                            {isEntry ? '+' : '-'}{tx.quantity} {tx.packaging}(s)
                          </span>
                          
                          <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                            <Clock size={11} className="text-amber-600" />
                            Hora Exata: <span className="font-mono text-slate-600">{exactTimeStr}</span>
                          </span>
                        </div>

                      </div>
                    );
                  })}

                  {transactions.length === 0 && (
                    <div className="py-12 text-center text-xs text-slate-400 italic">
                      Histórico vazio. Nenhuma movimentação recente detectada.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>

      </main>

      {/* 4. Footnote footer */}
      <footer id="app-footer" className="bg-white border-t border-slate-200 py-6 text-center text-[11px] text-slate-400 mt-12 shadow-sm">
        <p>© 2026 BV ATACAREJO LOGÍSTICA. Sistema Homologado para Operação Local de Alta Performance.</p>
        <p className="mt-1 font-mono">UTC: 2026-05-19 20:35:48 | Terminal Atacarejo Android e Web Integrados</p>
      </footer>

      {/* 5. Registration Modals & Managers */}
      <NewProductModal
        isOpen={isNewProductOpen}
        onClose={() => setIsNewProductOpen(false)}
        onSave={handleSaveNewProduct}
        categories={categories}
        existingBarcodes={products.map(p => p.barcode)}
        initialBarcode={scannedBarcodePending}
      />

      <TransactionModal
        isOpen={isTransactionOpen}
        onClose={() => setIsTransactionOpen(false)}
        product={activeProductForTx}
        onConfirm={handleConfirmTransaction}
        defaultType={defaultTxType}
        defaultBatchId={defaultBatchId}
      />

      <CategoryModal
        isOpen={isCategoryOpen}
        onClose={() => setIsCategoryOpen(false)}
        categories={categories}
        onAddCategory={handleAddCategory}
        onAddSubcategory={handleAddSubcategory}
        onDeleteCategory={handleDeleteCategory}
        onDeleteSubcategory={handleDeleteSubcategory}
      />

    </div>
  );
}
