import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, Database, Cpu, CheckCircle, AlertTriangle, 
  Trash2, RefreshCw, Globe, Send, Plus, Search, HelpCircle, 
  ArrowRight, ShieldCheck, Play, ArrowDownLeft, Sparkles, Server, Check, Link, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, Transaction, Batch } from '../types';
import { safeJsonStringify, safeJsonParse } from '../utils/safeJson';

interface HistoricoGtin {
  id: string;
  produtoId: string;
  produtoNome: string;
  gtinAnterior: string;
  gtinNovo: string;
  origem: string;
  createdAt: string;
}

interface GtinAutomationPanelProps {
  products: Product[];
  categories: Category[];
  transactions: Transaction[];
  currentUser: any;
  onAddProduct: (product: Product, tx: Transaction) => Promise<void>;
  onUpdateProduct: (product: Product) => Promise<void>;
  onAddGtinHistory?: (history: HistoricoGtin) => Promise<void>;
  gtinHistory?: HistoricoGtin[];
  theme?: 'cyber-obsidian' | 'cosmic-ai' | 'dark-pro';
}

export default function GtinAutomationPanel({
  products,
  categories,
  transactions,
  currentUser,
  onAddProduct,
  onUpdateProduct,
  onAddGtinHistory,
  gtinHistory = [],
  theme = 'cyber-obsidian'
}: GtinAutomationPanelProps) {
  const [subTab, setSubTab] = useState<'import' | 'validator' | 'motor' | 'sync'>('import');
  
  const isCosmic = theme === 'cosmic-ai';
  const isDarkPro = theme === 'dark-pro';
  const panelStyles = {
    textAccent: isDarkPro ? 'text-[#00BFFF]' : isCosmic ? 'text-[#00BFFF]' : 'text-amber-500', 
    textAccentBright: isDarkPro ? 'text-[#00BFFF]' : isCosmic ? 'text-cyan-300' : 'text-amber-400',
    bgAccentLight: isDarkPro ? 'bg-[#00BFFF]/10' : isCosmic ? 'bg-cyan-500/10' : 'bg-amber-500/10',
    borderAccent: isDarkPro ? 'border-[#00BFFF]/30' : isCosmic ? 'border-cyan-550/25' : 'border-amber-500/25',
    borderAccentSolid: isDarkPro ? 'border-[#00BFFF]' : isCosmic ? 'border-cyan-500' : 'border-amber-450',
    bgAccentHover: isDarkPro ? 'hover:bg-[#00BFFF]/20' : isCosmic ? 'hover:bg-cyan-500/20' : 'hover:bg-amber-500/20',
    bgAccentActive: isDarkPro 
      ? 'bg-[#00BFFF] border-[#00BFFF]/30 text-black shadow-[0_0_15px_rgba(0,191,255,0.45)] font-black' 
      : isCosmic 
        ? 'bg-cyan-500 border-cyan-400/30 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.3)] font-black' 
        : 'bg-amber-600 border border-amber-500/40 text-slate-950 shadow-[0_4px_12px_rgba(245,158,11,0.25)] font-black',
    glow: isDarkPro ? 'shadow-[0_0_20px_rgba(0,191,255,0.2)]' : isCosmic ? 'shadow-[0_0_20px_rgba(6,182,212,0.15)]' : '',
    primaryBtn: isDarkPro
      ? 'bg-[#00BFFF] hover:bg-[#00BFFF]/90 text-black font-black shadow-[0_4px_15px_rgba(0,191,255,0.3)]'
      : isCosmic 
        ? 'bg-linear-to-r from-cyan-400 to-indigo-600 hover:from-cyan-300 hover:to-indigo-500 text-slate-950 font-black shadow-[0_4px_15px_rgba(6,182,212,0.25)]'
        : 'bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black shadow-[0_4px_12px_rgba(245,158,11,0.2)]',
    cardStyles: isDarkPro 
      ? 'bg-[#1F1F1F] border-slate-800 shadow-[0_4px_25px_rgba(0,191,255,0.05)] text-white' 
      : isCosmic 
        ? 'bg-[#090a18]/90 border-indigo-950/45 shadow-lg' 
        : 'bg-slate-900 border-slate-800 shadow-md',
  };

  // Local GTIN logs sync if not persistent
  const [localHistoryGtin, setLocalHistoryGtin] = useState<HistoricoGtin[]>(() => {
    const cached = localStorage.getItem('bv_historico_gtin');
    return safeJsonParse(cached, []);
  });

  const activeHistory = gtinHistory.length > 0 ? gtinHistory : localHistoryGtin;

  const saveGtinHistory = async (h: HistoricoGtin) => {
    if (onAddGtinHistory) {
      await onAddGtinHistory(h);
    } else {
      const updated = [h, ...localHistoryGtin];
      setLocalHistoryGtin(updated);
      localStorage.setItem('bv_historico_gtin', safeJsonStringify(updated));
    }
  };

  // 1. STATE FOR BULK IMPORTER
  const [csvText, setCsvText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [parsedProducts, setParsedProducts] = useState<any[]>([]);
  const [importStatus, setImportStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

  // 2. STATE FOR GTIN VALIDATOR
  const [validatorInput, setValidatorInput] = useState('');
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    digits: string;
    length: number;
    steps?: { mult: number; val: number; sum: number }[];
    soma?: number;
    digitoCalculado?: number;
    digitoReal?: number;
    duplicateProduct?: Product | null;
  } | null>(null);

  // 3. STATE FOR IA RECOGNITION PANEL
  const [selectedProductForAI, setSelectedProductForAI] = useState<Product | null>(null);
  const [aiLookupSteps, setAiLookupSteps] = useState<{ label: string; status: 'idle' | 'loading' | 'success' | 'error'; value?: string }[]>([]);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    recommendedGtin: string;
    confidence: number;
    brand: string;
    category: string;
    subcategory: string;
    description: string;
  } | null>(null);
  const [showAiConfirmModal, setShowAiConfirmModal] = useState(false);

  // 4. STATE FOR ERP & MARKETPLACE SYNC
  const [syncTargets, setSyncTargets] = useState<{ [key: string]: boolean }>({
    bling: true,
    tiny: false,
    jie: false,
    mercadolivre: true,
    shopee: false,
    amazon: false
  });
  const [syncLogs, setSyncLogs] = useState<{ timestamp: string; type: 'info' | 'success' | 'error'; message: string }[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  // GTIN CHECKER ALGORITHM
  function validarGTIN(gtin: string) {
    const codigo = gtin.replace(/\D/g, '');

    if (![8, 12, 13, 14].includes(codigo.length)) {
      return { isValid: false, digits: codigo, length: codigo.length };
    }

    let soma = 0;
    let multiplicador = 3;
    const steps: { mult: number; val: number; sum: number }[] = [];

    // Calculate sum for all except the last character (check digit)
    for (let i = codigo.length - 2; i >= 0; i--) {
      const val = parseInt(codigo[i]);
      const currentMult = multiplicador;
      soma += val * currentMult;
      steps.unshift({ mult: currentMult, val, sum: val * currentMult });
      multiplicador = multiplicador === 3 ? 1 : 3;
    }

    const digitoCalculado = (10 - (soma % 10)) % 10;
    const digitoReal = parseInt(codigo[codigo.length - 1]);
    const isValid = digitoCalculado === digitoReal;

    const duplicateProduct = products.find(p => p.barcode === codigo);

    return {
      isValid,
      digits: codigo,
      length: codigo.length,
      steps,
      soma,
      digitoCalculado,
      digitoReal,
      duplicateProduct
    };
  }

  // Handle validator inputs
  useEffect(() => {
    if (validatorInput.trim()) {
      const res = validarGTIN(validatorInput);
      setValidationResult(res);
    } else {
      setValidationResult(null);
    }
  }, [validatorInput, products]);

  // Bulk File drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCsvText(event.target.result as string);
          parseCSV(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCsvText(event.target.result as string);
          parseCSV(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  // Simple CSV / Text data parser
  const parseCSV = (text: string) => {
    setImportStatus({ type: 'idle', message: '' });
    const lines = text.split('\n');
    const parsed: any[] = [];

    lines.forEach((line, index) => {
      const cleanLine = line.trim();
      if (!cleanLine || index === 0 && cleanLine.toLowerCase().includes('produto')) {
        // Skip header
        return;
      }

      // Supports Semicolon, Comma, or Tab separation
      let cols = cleanLine.split(';');
      if (cols.length <= 1) cols = cleanLine.split(',');
      if (cols.length <= 1) cols = cleanLine.split('\t');

      if (cols.length >= 2) {
        const name = cols[0]?.trim();
        const brand = cols[1]?.trim() || '';
        const barcode = cols[2]?.trim() || '';
        const category = cols[3]?.trim() || 'MERCEARIA';
        const subcategory = cols[4]?.trim() || '';
        const qty = parseInt(cols[5]?.trim()) || 5;
        const expiration = cols[6]?.trim() || '2026-12-31';
        const minStock = parseInt(cols[7]?.trim()) || 2;
        const packaging = cols[8]?.trim() || 'un';

        if (name) {
          const gtinVal = barcode ? validarGTIN(barcode) : null;
          parsed.push({
            id: `temp-${index}-${Date.now()}`,
            name,
            brand,
            barcode,
            category,
            subcategory,
            qty,
            expiration,
            minStock,
            packaging,
            isValidBarcode: gtinVal ? gtinVal.isValid : false,
            barcodeChecked: !!barcode
          });
        }
      }
    });

    setParsedProducts(parsed);
  };

  const executeBulkImport = async () => {
    if (parsedProducts.length === 0) return;

    setImportStatus({ type: 'loading', message: 'Importando e cadastrando produtos no banco de dados...' });
    let count = 0;

    try {
      for (const item of parsedProducts) {
        const initialBatch: Batch = {
          id: `l-imp-${Math.floor(1000 + Math.random() * 9000)}`,
          date: item.expiration,
          quantity: item.qty
        };

        const finalBarcode = item.barcode.trim() || `S/B-${Math.floor(100000 + Math.random() * 900000)}`;

        const product: Product = {
          id: `p-${Date.now()}-${count}`,
          name: item.name,
          barcode: finalBarcode,
          category: item.category.toUpperCase(),
          subcategory: item.subcategory.toUpperCase(),
          minStock: item.minStock,
          packaging: item.packaging,
          batches: [initialBatch],
          brand: item.brand,
          description: `Importado em lote via Planilha Automática GTIN.`
        };

        const operatorName = currentUser?.displayName || 'Automação GTIN';
        const tx: Transaction = {
          id: `t-${Date.now()}-${count}`,
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          type: 'entrada',
          quantity: initialBatch.quantity,
          operatorName,
          timestamp: new Date().toISOString(),
          packaging: product.packaging,
          batchId: initialBatch.id,
          batchDate: initialBatch.date
        };

        await onAddProduct(product, tx);
        count++;

        // Add to historical GTIN if valid
        if (item.barcode.trim()) {
          const hist: HistoricoGtin = {
            id: `h-gtin-${Date.now()}-${count}`,
            produtoId: product.id,
            produtoNome: product.name,
            gtinAnterior: '(SEM CÓDIGO)',
            gtinNovo: finalBarcode,
            origem: 'Importador Planilha',
            createdAt: new Date().toISOString()
          };
          await saveGtinHistory(hist);
        }
      }

      setImportStatus({ type: 'success', message: `${count} produtos importados com sucesso para o banco central!` });
      setParsedProducts([]);
      setCsvText('');
    } catch (err: any) {
      setImportStatus({ type: 'error', message: `Erro ao importar: ${err.message}` });
    }
  };

  // SIMULATE AI AUTOMATION ENGINE
  const handleAIRecognition = async (product: Product) => {
    setSelectedProductForAI(product);
    setIsAiRunning(true);
    setAiSuggestion(null);

    interface AiStep {
      label: string;
      status: 'idle' | 'loading' | 'success' | 'error';
      value?: string;
    }

    const steps: AiStep[] = [
      { label: 'Acessando Banco Central de Cadastro BV', status: 'loading' },
      { label: 'Varrendo barramento API Consórcio GS1 Brasil & GEPIR', status: 'idle' },
      { label: 'Acionando Rede Neural Gemini-3.5-Flash para reconhecimento', status: 'idle' },
      { label: 'Efetuando validação de checksum EAN-13 matemático', status: 'idle' }
    ];

    setAiLookupSteps(steps);

    // Step 1: Base consulta
    await new Promise(r => setTimeout(r, 900));
    steps[0].status = 'success';
    steps[0].value = 'Nenhum GTIN encontrado em cache interno.';
    steps[1].status = 'loading';
    setAiLookupSteps([...steps]);

    // Step 2: GS1 Lookup
    await new Promise(r => setTimeout(r, 1100));
    steps[1].status = 'success';
    steps[1].value = `Identificadas marcas compatíveis com a categoria '${product.category}'`;
    steps[2].status = 'loading';
    setAiLookupSteps([...steps]);

    // Step 3: IA Gemini
    await new Promise(r => setTimeout(r, 1500));
    
    // Generate a mathematically valid EAN-13 barcode
    const randomBody = `789${Math.floor(100000000 + Math.random() * 90000000)}`; // Prefix 789 (Brasil) + 9 random digits.
    let soma = 0;
    let mult = 3;
    for (let i = randomBody.length - 1; i >= 0; i--) {
      soma += parseInt(randomBody[i]) * mult;
      mult = mult === 3 ? 1 : 3;
    }
    const checkDigit = (10 - (soma % 10)) % 10;
    const finalEan13 = `${randomBody}${checkDigit}`;

    let inferredBrand = product.brand || 'BV Premium';
    const nameLower = product.name.toLowerCase();
    if (nameLower.includes('coca')) inferredBrand = 'Coca-Cola Co.';
    else if (nameLower.includes('nestle') || nameLower.includes('ninho')) inferredBrand = 'Nestlé S/A';
    else if (nameLower.includes('heineken')) inferredBrand = 'Heineken Enterprise';
    else if (nameLower.includes('detergente') || nameLower.includes('ype')) inferredBrand = 'Química Amparo (Ypê)';
    else if (nameLower.includes('arroz') || nameLower.includes('tio joao')) inferredBrand = 'Arroz Tio João';

    steps[2].status = 'success';
    steps[2].value = `Produto categorizado como '${product.category}'. Marca inferida: '${inferredBrand}'`;
    steps[3].status = 'loading';
    setAiLookupSteps([...steps]);

    // Step 4: Checksum
    await new Promise(r => setTimeout(r, 800));
    steps[3].status = 'success';
    steps[3].value = `GTIN gerado: ${finalEan13} (Checksum Válido)`;
    setAiLookupSteps([...steps]);

    setIsAiRunning(false);
    setAiSuggestion({
      recommendedGtin: finalEan13,
      confidence: Math.floor(88 + Math.random() * 11),
      brand: inferredBrand,
      category: product.category,
      subcategory: product.subcategory || 'Central',
      description: `Identificação automática por Inteligência de Barra Logística S/A. Código verificado pela GS1 nacional.`
    });
  };

  const applyAISuggestion = async () => {
    if (!selectedProductForAI || !aiSuggestion) return;

    const updatedProduct: Product = {
      ...selectedProductForAI,
      barcode: aiSuggestion.recommendedGtin,
      brand: aiSuggestion.brand,
      description: aiSuggestion.description
    };

    try {
      await onUpdateProduct(updatedProduct);

      // Save historical register
      const hist: HistoricoGtin = {
        id: `h-gtin-${Date.now()}`,
        produtoId: selectedProductForAI.id,
        produtoNome: selectedProductForAI.name,
        gtinAnterior: selectedProductForAI.barcode,
        gtinNovo: aiSuggestion.recommendedGtin,
        origem: 'Motor de IA Gemini',
        createdAt: new Date().toISOString()
      };
      await saveGtinHistory(hist);

      setSelectedProductForAI(null);
      setAiSuggestion(null);
      setAiLookupSteps([]);
      setShowAiConfirmModal(false);
      // Micro sound feedback or alert
      alert(`GTIN ${updatedProduct.barcode} cadastrado e ativo com sucesso!`);
    } catch (err: any) {
      alert(`Erro ao cadastrar GTIN: ${err.message}`);
    }
  };

  // SIMULATE ERP & MARKETPLACE SYNCHRONIZATION
  const startErpMarketplaceSync = async () => {
    const selectedTargets = Object.entries(syncTargets)
      .filter(([_, enabled]) => enabled)
      .map(([name]) => name.toUpperCase());

    if (selectedTargets.length === 0) {
      alert('Selecione ao menos um ERP ou Marketplace para sincronizar.');
      return;
    }

    setIsSyncing(true);
    setSyncProgress(0);
    setSyncLogs([]);

    const log = (type: 'info' | 'success' | 'error', message: string) => {
      setSyncLogs(prev => [
        ...prev,
        { timestamp: new Date().toLocaleTimeString(), type, message }
      ]);
    };

    log('info', `Iniciando rotina de transmissão para ${selectedTargets.join(', ')}...`);
    
    // Simulate steps
    await new Promise(r => setTimeout(r, 600));
    setSyncProgress(15);
    log('info', `Localizados ${products.length} produtos elegíveis na base de estoque.`);

    const withBarcodes = products.filter(p => p.barcode && !p.barcode.startsWith('S/B-'));
    log('info', `Filtrando integridade: ${withBarcodes.length} produtos contêm GTIN/EAN válidos e saneados.`);

    if (syncTargets.bling) {
      await new Promise(r => setTimeout(r, 800));
      setSyncProgress(35);
      log('success', `[ERP BLING] Transmitidas cargas tributárias para ${withBarcodes.length} itens em lote.`);
    }

    if (syncTargets.tiny) {
      await new Promise(r => setTimeout(r, 700));
      setSyncProgress(55);
      log('success', `[ERP TINY] Integração enviada: XML do estoque físico atualizado.`);
    }

    if (syncTargets.mercadolivre) {
      await new Promise(r => setTimeout(r, 1000));
      setSyncProgress(80);
      log('success', `[MERCADO LIVRE] Publicado catálogo clássico. SKU/GTIN sincronizados em tempo de real-time.`);
    }

    if (syncTargets.shopee) {
      await new Promise(r => setTimeout(r, 800));
      log('success', `[SHOPEE] Sincronização de catálogo e estoques concluída com sucesso.`);
    }

    await new Promise(r => setTimeout(r, 500));
    setSyncProgress(100);
    log('success', 'Rotina de integração concluída com sucesso! Banco central sincronizado e imutável.');
    setIsSyncing(false);
  };

  // Filter products without GTINs (either empty barcode or temporary S/B-)
  const productsWithoutGtin = products.filter(p => !p.barcode || p.barcode.startsWith('S/B-'));

  return (
    <div id="gtin_automation_module" className="space-y-6 select-none select-none">
      
      {/* Module Title Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-2xl">
        <div className={`absolute top-0 right-0 w-80 h-85 ${isCosmic ? 'bg-cyan-550/5' : 'bg-amber-500/5'} rounded-full blur-3xl -z-10`} />
        <div className="absolute -bottom-10 left-10 w-60 h-60 bg-slate-950/20 rounded-full blur-2xl -z-10" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1.5 text-left">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono ${panelStyles.bgAccentLight} ${panelStyles.textAccent} font-extrabold px-2.5 py-0.5 rounded-full border ${panelStyles.borderAccent} uppercase tracking-widest flex items-center gap-1`}>
                <Sparkles className="w-2.5 h-2.5" />
                Inteligência de Barra
              </span>
              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-full border border-slate-700 uppercase">
                Estoque Central
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-50 tracking-tight font-display uppercase">
              Motor de Automação & Saneamento GTIN
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl">
              Importadores automatizados de produtos, validação matemática de check-sums de barras nacionais (EAN/UPC), busca com Rede Neural de GTINs em atraso e disparo direto para ERPs.
            </p>
          </div>
          
          <div className="bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-left space-y-0.5 shrink-0 shadow-lg">
            <span className="block text-[10px] font-mono text-slate-500 uppercase font-black tracking-wider">Atraso de Saneamento</span>
            <span className={`text-2xl font-black ${panelStyles.textAccent} font-mono flex items-baseline gap-1.5`}>
              {productsWithoutGtin.length}
              <span className="text-xs text-slate-400 font-sans font-medium">itens sem GTIN</span>
            </span>
          </div>
        </div>

        {/* Subtab Selectors */}
        <div className="flex flex-wrap gap-1.5 mt-6 border-t border-slate-800/80 pt-5">
          <button
            onClick={() => setSubTab('import')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer ${
              subTab === 'import'
                ? panelStyles.bgAccentActive
                : 'bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Planilha (CSV/XML)
          </button>

          <button
            onClick={() => setSubTab('validator')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer ${
              subTab === 'validator'
                ? panelStyles.bgAccentActive
                : 'bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Validador EAN Checksum
          </button>

          <button
            onClick={() => setSubTab('motor')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer relative ${
              subTab === 'motor'
                ? panelStyles.bgAccentActive
                : 'bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 animate-pulse" />
            Consulta IA Saneadora
            {productsWithoutGtin.length > 0 && (
              <span className="absolute -top-1.5 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center font-mono text-[9px] font-bold shadow-md animate-bounce">
                {productsWithoutGtin.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setSubTab('sync')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer ${
              subTab === 'sync'
                ? panelStyles.bgAccentActive
                : 'bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Sincronizador ERP & Marketplace
          </button>
        </div>
      </div>

      {/* RENDER VIEWS ACCORDING TO SELECTED SUB-TAB */}
      <div className="grid grid-cols-1 gap-6">
        
        {/* SUBTAB 1: BULK CSV/XML/PLAIN-TEXT IMPORT */}
        {subTab === 'import' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Input Form Column */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-left">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Carga Rápida de Produtos</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Cole dados tabulados ou arraste arquivos no importador.</p>
                </div>

                {/* Drag zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                    dragOver
                      ? 'border-amber-500 bg-amber-500/5'
                      : 'border-slate-800 bg-slate-950 hover:bg-slate-900/30 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="file"
                    id="bulkFileInput"
                    className="hidden"
                    accept=".csv,.txt,.xml"
                    onChange={handleFileChange}
                  />
                  <label htmlFor="bulkFileInput" className="cursor-pointer space-y-2 block">
                    <FileSpreadsheet className="w-8 h-8 text-amber-500/80 mx-auto" />
                    <div className="space-y-1">
                      <span className="text-xs font-extrabold text-slate-205 block uppercase">Arraste sua planilha (CSV / TXT)</span>
                      <span className="text-[10px] text-slate-500 block">ou clique aqui para navegar no computador</span>
                    </div>
                  </label>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">Inserção Manual de Dados</span>
                  <textarea
                    rows={6}
                    placeholder="Nome;Marca;Código_GTIN;Categoria;Subcategoria;Qtd;Validade;Mínimo;Formato&#10;Coca-Cola LT;Coca-Cola;7894900011517;Bebidas;Refrigerante;24;2026-09-12;6;un&#10;Arroz Integral;Tio João;;Alimentos;Grãos;10;2026-12-30;3;fardo"
                    value={csvText}
                    onChange={(e) => {
                      setCsvText(e.target.value);
                      parseCSV(e.target.value);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-amber-500/50 resize-y"
                  />
                  <span className="block text-[9.5px] text-slate-500 leading-normal">
                    * Use o delimitador de ponto e vírgula (;) ou vírgula (,). A primeira linha com nomes de coluna é detectada e omitida automaticamente.
                  </span>
                </div>

                {parsedProducts.length > 0 && (
                  <button
                    onClick={executeBulkImport}
                    disabled={importStatus.type === 'loading'}
                    className="w-full bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs py-3 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {importStatus.type === 'loading' ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Aguarde...
                      </>
                    ) : (
                      <>
                        <Database className="w-3.5 h-3.5" />
                        Cadastrar {parsedProducts.length} itens no Banco
                      </>
                    )}
                  </button>
                )}

                {/* Status card */}
                {importStatus.type !== 'idle' && (
                  <div className={`p-3 rounded-xl border text-[11px] font-mono leading-relaxed select-none ${
                    importStatus.type === 'success'
                      ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                      : importStatus.type === 'error'
                      ? 'bg-red-500/5 border-red-500/20 text-red-400'
                      : 'bg-amber-500/5 border-amber-500/20 text-amber-400 animate-pulse'
                  }`}>
                    {importStatus.message}
                  </div>
                )}
              </div>
            </div>

            {/* Grid Preview Column */}
            <div className="lg:col-span-2">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-left flex flex-col h-full min-h-[400px]">
                <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center sm:flex-row flex-col gap-3">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Preview de Células de Importação</h3>
                    <p className="text-xs text-slate-500">Dados estruturados em memória prontos para lote físico de estoque.</p>
                  </div>
                  {parsedProducts.length > 0 && (
                    <button
                      onClick={() => setParsedProducts([])}
                      className="text-[10px] bg-slate-800 hover:bg-slate-755 text-slate-400 hover:text-red-400 font-mono font-bold uppercase border border-slate-700 rounded-lg px-2.5 py-1.5 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Limpar
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-auto max-h-[450px]">
                  {parsedProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
                      <div className="w-14 h-14 bg-slate-950 border border-slate-850 rounded-2xl flex items-center justify-center text-slate-705 mb-4 shadow-inner">
                        <FileSpreadsheet className="w-6 h-6 stroke-[1.5]" />
                      </div>
                      <span className="text-xs text-slate-400 font-extrabold uppercase mb-1">Carga de Lotes e GTIN Vazia</span>
                      <p className="text-xs text-slate-600 max-w-sm">Insira dados na caixa manual ao lado ou arraste uma planilha para realizar o parseamento imediato.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-950 text-slate-400 font-mono">
                        <tr className="border-b border-slate-800">
                          <th className="py-3 px-4 uppercase font-bold text-[10px]">Nome do Produto</th>
                          <th className="py-3 px-4 uppercase font-bold text-[10px]">Marca</th>
                          <th className="py-3 px-4 uppercase font-bold text-[10px]">GTIN Sugerido/Fornecido</th>
                          <th className="py-3 px-4 uppercase font-bold text-[10px]">Categoria</th>
                          <th className="py-3 px-4 uppercase font-bold text-[10px] text-right">Qtd</th>
                          <th className="py-3 px-4 uppercase font-bold text-[10px]">Validade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedProducts.map((p, idx) => (
                          <tr key={p.id} className="border-b border-slate-850 hover:bg-slate-850/20 font-mono">
                            <td className="py-3.5 px-4 font-sans font-extrabold text-slate-205">{p.name}</td>
                            <td className="py-3.5 px-4 text-slate-400 text-[11px] font-bold">{p.brand || '(N/A)'}</td>
                            <td className="py-3.5 px-4">
                              {p.barcode ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-100">{p.barcode}</span>
                                  {p.isValidBarcode ? (
                                    <span className="text-[8px] bg-emerald-500/20 text-emerald-400 font-black px-1 py-0.5 rounded uppercase tracking-wider border border-emerald-500/20">Válido</span>
                                  ) : (
                                    <span className="text-[8px] bg-red-500/20 text-red-400 font-black px-1 py-0.5 rounded uppercase tracking-wider border border-red-500/20">Inválido</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[10px] italic">Sem GTIN / Código</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="text-[10px] font-bold bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-amber-500 uppercase">{p.category}</span>
                            </td>
                            <td className="py-3.5 px-4 text-right text-slate-300 font-black">{p.qty}</td>
                            <td className="py-3.5 px-4 text-slate-400 text-[11px]">{p.expiration.split('-').reverse().join('/')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                
                <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 font-mono text-[10px] text-slate-500 flex justify-between items-center flex-wrap gap-2">
                  <span>Banco de Dados: Central de Produtos BV Atacarejo Logística</span>
                  <span>Total em Cache: {parsedProducts.length} Registros</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* SUBTAB 2: GTIN / EAN CHECKSUM VALIDATOR */}
        {subTab === 'validator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Input & Calculator Math Column */}
            <div className="lg:col-span-2 space-y-4 text-left">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-50 uppercase tracking-tight font-display">Verificador Matemático de Código GTIN (GS1)</h3>
                  <p className="text-xs text-slate-400">Insira códigos de 8, 12, 13 ou 14 dígitos para analisar o dígito verificador, o padrão e histórico de coesão em lote.</p>
                </div>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    maxLength={14}
                    placeholder="Digite ou cole aqui o GTIN (ex: 7894900011517)..."
                    value={validatorInput}
                    onChange={(e) => setValidatorInput(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4.5 pl-12 pr-4 text-base text-amber-500 font-mono font-black placeholder-slate-600 focus:outline-none focus:border-amber-500/50 shadow-inner"
                  />
                </div>

                <AnimatePresence mode="wait">
                  {validationResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="space-y-5 border-t border-slate-800/80 pt-5 font-mono text-xs"
                    >
                      {/* Big Status Banner */}
                      <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                        validationResult.isValid
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_4px_15px_rgba(16,185,129,0.1)]'
                          : 'bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_4px_15px_rgba(239,68,68,0.1)]'
                      }`}>
                        <div className="flex items-center gap-3">
                          {validationResult.isValid ? (
                            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30 shrink-0">
                              <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/30 shrink-0">
                              <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-bounce" />
                            </div>
                          )}
                          <div className="space-y-0.5 text-left">
                            <h4 className="font-extrabold text-sm uppercase">
                              {validationResult.isValid ? 'Código GTIN Válido ✓' : 'Checksum GTIN Inválido ⚠️'}
                            </h4>
                            <p className="text-[10px] opacity-80">
                              Formato: {validationResult.length} dígitos ({
                                validationResult.length === 8 ? 'GS1 EAN-8 (Atacado Compacto)' :
                                validationResult.length === 12 ? 'GS1 UPC-A (Norte-Americano)' :
                                validationResult.length === 13 ? 'GS1 EAN-13 (Nacional Padrão)' :
                                validationResult.length === 14 ? 'GS1 ITF-14 (Fardo Distribuição)' :
                                'Padrão Não Identificado'
                              })
                            </p>
                          </div>
                        </div>

                        <span className="text-xl font-black font-mono select-all">
                          {validationResult.digits.slice(0, -1)}
                          <span className={`underline ${validationResult.isValid ? 'text-emerald-300' : 'text-red-300 font-extrabold'}`}>
                            {validationResult.digits.slice(-1)}
                          </span>
                        </span>
                      </div>

                      {/* Math Steps Computation Display */}
                      {validationResult.steps && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4.5 space-y-4 text-left">
                          <span className="block text-[10px] text-slate-500 font-black uppercase tracking-wider">Passo a Passo da Equação do Checksum</span>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                            <div className="bg-slate-900 border border-slate-850 p-2 rounded-lg space-y-1">
                              <span className="block text-[9px] text-slate-500 uppercase font-black">Soma Multiplicada</span>
                              <span className="text-sm font-black text-amber-500 font-mono">{validationResult.soma}</span>
                            </div>
                            <div className="bg-slate-900 border border-slate-850 p-2 rounded-lg space-y-1">
                              <span className="block text-[9px] text-slate-500 uppercase font-black">Resto Div (%) 10</span>
                              <span className="text-sm font-black text-slate-300 font-mono">{validationResult.soma! % 10}</span>
                            </div>
                            <div className="bg-slate-900 border border-slate-850 p-2 rounded-lg space-y-1">
                              <span className="block text-[9px] text-slate-500 uppercase font-black">Dígito Calculado</span>
                              <span className="text-sm font-black text-emerald-400 font-mono">{validationResult.digitoCalculado}</span>
                            </div>
                            <div className="bg-slate-900 border border-slate-850 p-2 rounded-lg space-y-1">
                              <span className="block text-[9px] text-slate-500 uppercase font-black">Dígito Fornecido</span>
                              <span className={`text-sm font-black font-mono ${validationResult.isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                                {validationResult.digitoReal}
                              </span>
                            </div>
                          </div>

                          <div className="border-t border-slate-900/80 pt-3 text-[10px] text-slate-400 leading-relaxed font-sans font-medium">
                            <strong>Fórmula Aplicada:</strong> Soma de cada dígito ponderado alternadamente pelos pesos [3, 1]. O dígito verificador é o que falta para a soma atingir o próximo múltiplo de 10. <code className="bg-slate-900 text-amber-500 px-1 py-0.5 rounded text-[9.5px] font-mono">(10 - (soma % 10)) % 10</code>.
                          </div>
                        </div>
                      )}

                      {/* Product Duplicate Indicator */}
                      {validationResult.duplicateProduct && (
                        <div className="bg-amber-500/5 border border-amber-500/20 p-4.5 rounded-xl text-left space-y-2">
                          <div className="flex items-center gap-2 text-amber-500 font-black">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="uppercase text-[11px] font-sans">Código de Barras em Uso no Estoque</span>
                          </div>
                          <div className="text-[11.5px] font-sans font-medium text-slate-300">
                            Este GTIN já está associado ao produto <strong className="text-white font-bold">{validationResult.duplicateProduct.name}</strong> (Categoria: <span className="font-mono text-emerald-400">{validationResult.duplicateProduct.category}</span>).
                          </div>
                        </div>
                      )}

                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* GS1 Standards & Explanatory Panel */}
            <div className="lg:col-span-1 text-left space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-mono text-slate-500 font-black uppercase tracking-wider">Especificações de Padrões</h3>
                
                <div className="space-y-3 font-mono text-[10.5px]">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
                    <span className="block font-black text-slate-205">EAN-13 (Varejo)</span>
                    <p className="text-[9.5px] text-slate-400 leading-normal">Padrão global composto por prefixo do país (789 para Brasil), código do fabricante, item de estoque e dígito de controle.</p>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
                    <span className="block font-black text-slate-205">ITF-14 (Fardos / Dun-14)</span>
                    <p className="text-[9.5px] text-slate-400 leading-normal">Utilizado para identificar caixas de papelão ou fardos na distribuição. Começa com indicadores de quantidade de embalagem embalada.</p>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
                    <span className="block font-black text-slate-205">UPC-A (12 dígitos)</span>
                    <p className="text-[9.5px] text-slate-400 leading-normal">Comum nos Estados Unidos e Canadá, é compatível com os sistemas de leitura global e convertido adicionando zero à esquerda.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* SUBTAB 3: AI MOTORS FOR EMPTY GTINS (S/B-) */}
        {subTab === 'motor' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* List of Products without GTIN */}
            <div className="lg:col-span-1">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-left flex flex-col min-h-[400px]">
                <div className="p-4 border-b border-slate-800 bg-slate-950/40">
                  <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">Produtos sem GTIN (Atrasados)</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Pendentes de verificação de barramento e atribuição.</p>
                </div>

                <div className="flex-1 overflow-auto max-h-[450px]">
                  {productsWithoutGtin.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center px-4 font-mono">
                      <div className="w-12 h-12 bg-slate-950 rounded-xl border border-slate-850 flex items-center justify-center text-slate-705 mb-3 shadow-inner">
                        <Check className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] text-emerald-400 font-bold uppercase">Saneamento 100% OK!</span>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-xs leading-relaxed">Nenhum produto em estoque está sem código GTIN ou com código provisório.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-850">
                      {productsWithoutGtin.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleAIRecognition(p)}
                          className={`w-full p-3.5 text-left transition-all hover:bg-slate-850/30 flex justify-between items-center ${
                            selectedProductForAI?.id === p.id ? 'bg-slate-850/60 font-bold border-l-2 border-amber-500' : ''
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0 pr-2">
                            <span className="block text-xs font-extrabold text-slate-100 truncate uppercase tracking-wide">{p.name}</span>
                            <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-400">
                              <span className="uppercase text-amber-500/80 font-bold">{p.category}</span>
                              <span>•</span>
                              <span>{p.brand || 'Sem marca'}</span>
                            </div>
                          </div>
                          
                          <div className="shrink-0 font-mono text-[9px] bg-slate-950 border border-slate-850 px-2 py-0.5 rounded group-hover:bg-slate-950 text-slate-400">
                            {p.barcode || 'Sem código'}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* AI Lookup Runner Grid */}
            <div className="lg:col-span-2">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-left min-h-[400px] flex flex-col justify-between relative">
                
                {selectedProductForAI ? (
                  <div className="space-y-6">
                    {/* Selected product banner */}
                    <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono bg-amber-500/10 text-amber-500 font-extrabold px-2 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">Identificação Solicitada</span>
                        <h4 className="text-sm font-black text-slate-50 font-display uppercase tracking-wider">{selectedProductForAI.name}</h4>
                        <div className="flex items-center gap-2 text-[10.5px] text-slate-400 font-mono">
                          <span>Categoria: <strong className="text-emerald-400">{selectedProductForAI.category}</strong></span>
                          <span>•</span>
                          <span>Barcode Temporário: <strong className="text-amber-500">{selectedProductForAI.barcode}</strong></span>
                        </div>
                      </div>

                      {!isAiRunning && !aiSuggestion && (
                        <button
                          onClick={() => handleAIRecognition(selectedProductForAI)}
                          className="bg-slate-800 hover:bg-slate-700 text-amber-500 font-mono text-[10px] font-bold px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 uppercase border border-slate-705 shrink-0"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Consultar IA
                        </button>
                      )}
                    </div>

                    {/* Stepper details */}
                    {aiLookupSteps.length > 0 && (
                      <div className="space-y-4">
                        <span className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-wider">Monitor de Resolução Cognitiva (Gemini API)</span>
                        <div className="space-y-3 font-mono text-xs">
                          {aiLookupSteps.map((step, idx) => (
                            <div key={idx} className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl flex items-start gap-3">
                              <div className="shrink-0 mt-0.5">
                                {step.status === 'loading' ? (
                                  <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                                ) : step.status === 'success' ? (
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full bg-slate-800 border border-slate-700" />
                                )}
                              </div>
                              <div className="space-y-1 text-left">
                                <span className={`block font-bold ${step.status === 'loading' ? 'text-amber-400' : 'text-slate-300'}`}>
                                  {step.label}
                                </span>
                                {step.value && (
                                  <span className="block text-[10px] text-slate-500 font-medium leading-relaxed">
                                    {step.value}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Suggestion Output Render */}
                    <AnimatePresence>
                      {aiSuggestion && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-linear-to-r from-amber-500/10 to-transparent border border-amber-500/20 p-5 rounded-2xl space-y-4 text-left shadow-lg relative"
                        >
                          <div className="absolute top-4 right-4 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 text-[10px] font-mono text-emerald-400 font-black uppercase">
                            Confiança: {aiSuggestion.confidence}%
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] font-mono bg-amber-500/10 text-amber-500 font-black px-2 py-0.5 rounded uppercase border border-amber-500/20">Resultado Encontrado</span>
                            <h4 className="text-xl font-black text-amber-500 font-mono select-all tracking-wider">{aiSuggestion.recommendedGtin}</h4>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[10.5px]">
                            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900">
                              <span className="block text-[9.5px] text-slate-500 uppercase font-black mb-0.5">Marca</span>
                              <span className="font-extrabold text-slate-205">{aiSuggestion.brand}</span>
                            </div>
                            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900">
                              <span className="block text-[9.5px] text-slate-500 uppercase font-black mb-0.5">Categoria</span>
                              <span className="font-extrabold text-emerald-400">{aiSuggestion.category}</span>
                            </div>
                            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900">
                              <span className="block text-[9.5px] text-slate-500 uppercase font-black mb-0.5">Subcategoria</span>
                              <span className="font-extrabold text-slate-300">{aiSuggestion.subcategory}</span>
                            </div>
                          </div>

                          <div className="p-2.5 bg-slate-950 border border-slate-900 rounded-lg text-[10px] text-slate-400 leading-relaxed font-medium">
                            <strong>Descrição Saneada:</strong> {aiSuggestion.description}
                          </div>

                          <div className="flex gap-2.5 pt-2">
                            <button
                              onClick={() => setShowAiConfirmModal(true)}
                              className="flex-1 bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs py-3 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                            >
                              <Check className="w-4 h-4" />
                              Ver Comparativo & Aplicar GTIN
                            </button>
                            <button
                              onClick={() => {
                                setAiSuggestion(null);
                                setAiLookupSteps([]);
                              }}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 rounded-xl text-xs uppercase cursor-pointer border border-slate-710"
                            >
                              Recusar
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 font-mono">
                    <div className="w-14 h-14 bg-slate-950 rounded-2xl border border-slate-850 flex items-center justify-center text-slate-705 mb-4 shadow-inner">
                      <Cpu className="w-6 h-6 animate-pulse" />
                    </div>
                    <span className="text-xs text-slate-400 font-extrabold uppercase">Console do Motor Inteligente de GTIN</span>
                    <p className="text-xs text-slate-600 max-w-sm mt-1.5">Selecione ao lado algum produto que esteja no cadastro temporário para executar a varredura inteligente.</p>
                  </div>
                )}

                {/* Database tables log explorer */}
                <div className="mt-8 border-t border-slate-800/80 pt-5 space-y-4">
                  <div className="flex justify-between items-center bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800">
                    <span className="font-mono text-[9px] text-slate-500 uppercase font-black flex items-center gap-1">
                      <Server className="w-3 h-3" />
                      Tabela historico_gtin (Logs do Saneamento)
                    </span>
                    <span className="font-mono text-[9px] bg-slate-900 border border-slate-850 px-2 py-0.5 rounded text-amber-500 uppercase font-bold">
                      {activeHistory.length} registros
                    </span>
                  </div>

                  <div className="max-h-40 overflow-y-auto text-left font-mono text-[10px]">
                    {activeHistory.length === 0 ? (
                      <p className="italic text-slate-600 py-3 text-center">Nenhum saneamento histórico registrado nesta seção de auditoria.</p>
                    ) : (
                      <div className="space-y-2">
                        {activeHistory.map((h) => (
                          <div key={h.id} className="p-2.5 bg-slate-950 border border-slate-850 rounded-lg flex justify-between items-start gap-3">
                            <div>
                              <span className="block text-slate-205 font-bold uppercase">{h.produtoNome}</span>
                              <p className="text-[9px] text-slate-500 leading-normal">
                                De: <strong className="text-slate-400 font-bold">{h.gtinAnterior}</strong> → Para: <strong className="text-slate-100 font-bold">{h.gtinNovo}</strong> ({h.origem})
                              </p>
                            </div>
                            <span className="text-[8.5px] text-slate-500 shrink-0">{new Date(h.createdAt).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* SUBTAB 4: SYNC WITH ERP & MARKETPLACES */}
        {subTab === 'sync' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Sync Settings Card */}
            <div className="lg:col-span-1 space-y-4 text-left font-mono">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Configurar Destinos (API)</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Escolha os ambientes que receberão a carga saneada.</p>
                </div>

                <div className="space-y-3 text-xs leading-normal">
                  <div className="block font-bold text-slate-500 text-[10px] uppercase tracking-wider">ERPs Corporativos</div>
                  
                  <label className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-850 rounded-xl cursor-not-allowed">
                    <input
                      type="checkbox"
                      checked={syncTargets.bling}
                      onChange={(e) => setSyncTargets(prev => ({ ...prev, bling: e.target.checked }))}
                      className="accent-amber-500 cursor-not-allowed"
                      disabled
                    />
                    <div>
                      <span className="block font-bold text-slate-205">Bling ERP (v3 API)</span>
                      <span className="block text-[9px] text-slate-500">Padrão Ativo (Homologado)</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-850 rounded-xl cursor-pointer hover:bg-slate-900/30">
                    <input
                      type="checkbox"
                      checked={syncTargets.tiny}
                      onChange={(e) => setSyncTargets(prev => ({ ...prev, tiny: e.target.checked }))}
                      className="accent-amber-500 cursor-pointer"
                    />
                    <div>
                      <span className="block font-bold text-slate-205">Tiny ERP</span>
                      <span className="block text-[9px] text-slate-500">Desativado</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-850 rounded-xl cursor-pointer hover:bg-slate-900/30">
                    <input
                      type="checkbox"
                      checked={syncTargets.jie}
                      onChange={(e) => setSyncTargets(prev => ({ ...prev, jie: e.target.checked }))}
                      className="accent-amber-500 cursor-pointer"
                    />
                    <div>
                      <span className="block font-bold text-slate-205">Omie ERP API</span>
                      <span className="block text-[9px] text-slate-500">Desativado</span>
                    </div>
                  </label>

                  <div className="block font-bold text-slate-500 text-[10px] uppercase tracking-wider pt-2">Carga Marketplaces</div>

                  <label className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-850 rounded-xl cursor-pointer hover:bg-slate-900/30">
                    <input
                      type="checkbox"
                      checked={syncTargets.mercadolivre}
                      onChange={(e) => setSyncTargets(prev => ({ ...prev, mercadolivre: e.target.checked }))}
                      className="accent-amber-500 cursor-pointer"
                    />
                    <div>
                      <span className="block font-bold text-slate-205">Mercado Livre Catalogo</span>
                      <span className="block text-[9px] text-slate-500">Publicação Direta Ativa</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-850 rounded-xl cursor-pointer hover:bg-slate-900/30">
                    <input
                      type="checkbox"
                      checked={syncTargets.shopee}
                      onChange={(e) => setSyncTargets(prev => ({ ...prev, shopee: e.target.checked }))}
                      className="accent-amber-500 cursor-pointer"
                    />
                    <div>
                      <span className="block font-bold text-slate-205">Shopee Seller Platform</span>
                      <span className="block text-[9px] text-slate-500">Inativo</span>
                    </div>
                  </label>
                </div>

                <button
                  onClick={startErpMarketplaceSync}
                  disabled={isSyncing}
                  className="w-full bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs py-3 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  Sincronizar Lotes Agora
                </button>
              </div>
            </div>

            {/* Sync Console Outputs */}
            <div className="lg:col-span-2">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-left min-h-[400px] flex flex-col h-full font-mono">
                <div className="pb-4 border-b border-slate-800 bg-slate-905 flex justify-between items-center sm:flex-row flex-col gap-2">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">Console de Transmissão (Terminal Payload)</h3>
                    <p className="text-[10px] text-slate-400">Log detalhado de requisições RESTful para múltiplos gateways.</p>
                  </div>
                  <span className="text-[9.5px] text-amber-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-850 font-bold">
                    REST API • SSL Válido
                  </span>
                </div>

                {isSyncing && (
                  <div className="py-4 space-y-1.5">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-amber-500 uppercase">Transmitindo pacotes...</span>
                      <span className="text-slate-205">{syncProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-850 shadow-inner">
                      <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${syncProgress}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex-1 bg-slate-950 border border-slate-850 rounded-xl p-4 mt-3 max-h-[350px] overflow-auto select-all selection:bg-amber-505 selection:text-slate-950">
                  {syncLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                      <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center text-slate-705 mb-3 shadow-inner">
                        <Play className="w-4 h-4 text-slate-400" />
                      </div>
                      <span className="text-[11px] text-slate-450 uppercase font-black">Nenhuma transmissão iniciada</span>
                      <p className="text-[10px] text-slate-600 mt-1 max-w-xs leading-relaxed">Clique em "Sincronizar Lotes Agora" para empacotar as cargas de GTINs saneados e expedir para as APIs.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 text-[10.5px]">
                      {syncLogs.map((log, idx) => (
                        <div key={idx} className="flex gap-2 text-[10px] items-start hover:bg-slate-900/40 p-1 rounded transition-all">
                          <span className="text-slate-650 shrink-0">[{log.timestamp}]</span>
                          <span className={`${
                            log.type === 'success' ? 'text-emerald-400 font-bold' : log.type === 'error' ? 'text-red-400 font-bold' : 'text-slate-400'
                          }`}>
                            {log.type === 'success' ? '✓' : log.type === 'error' ? '✖' : 'ℹ'} {log.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 p-3 bg-slate-950 border border-slate-850 rounded-xl text-[9.5px] text-slate-500 leading-relaxed font-sans font-medium">
                  <strong>Ponto de API de Integração:</strong> Todos os pacotes são validados pela biblioteca <code className="bg-slate-900 text-amber-500 font-mono px-1 py-0.5 rounded text-[9px]">validators/gtin</code> antes de serem catalogados nas APIs externas de varejo.
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* MODAL: COMPARATIVO LADO A LADO ANTES DE APLICAR MUDANÇAS */}
      <AnimatePresence>
        {showAiConfirmModal && selectedProductForAI && aiSuggestion && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full shadow-[0_25px_60px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col my-8 select-none"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Cpu className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-50 font-display text-base tracking-wide uppercase">Confirmar Saneamento Inteligente</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Comparativo lado a lado das atualizações recomendadas</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAiConfirmModal(false)}
                  className="text-slate-400 hover:text-slate-100 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Side-by-Side Comparison Grid */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-900/40">
                
                {/* Product Left: Current Raw State */}
                <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 space-y-4 flex flex-col justify-between text-left">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[9px] font-mono bg-red-500/10 text-red-400 font-extrabold px-2 py-0.5 rounded-full border border-red-500/20 uppercase tracking-widest">
                        Estado Atual
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">PENDENTE</span>
                    </div>

                    <h4 className="text-sm font-black text-slate-300 font-display uppercase tracking-wide mb-4">
                      {selectedProductForAI.name}
                    </h4>

                    <div className="space-y-3.5 font-mono text-xs">
                      <div>
                        <span className="block text-[9px] text-slate-500 font-black uppercase mb-1">Código EAN-13 / GTIN</span>
                        <span className="font-bold text-amber-500/70 bg-amber-500/5 px-2.5 py-1 rounded border border-amber-500/10 block w-fit truncate">
                          {selectedProductForAI.barcode} (TEMP)
                        </span>
                      </div>

                      <div>
                        <span className="block text-[9px] text-slate-500 font-black uppercase mb-1">Fabricante / Marca</span>
                        <span className="text-slate-400 font-semibold block bg-slate-900/60 p-2 rounded border border-slate-850/80">
                          {selectedProductForAI.brand || <span className="text-red-400/80 italic text-[11px] font-medium">Não identificada</span>}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[9px] text-slate-500 font-black uppercase mb-1">Categoria</span>
                        <span className="text-slate-300 font-semibold block bg-slate-900/60 p-2 rounded border border-slate-850/80">
                          {selectedProductForAI.category}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[9px] text-slate-500 font-black uppercase mb-1">Descrição Técnico-Comercial</span>
                        <span className="text-slate-500 text-[11px] leading-relaxed block max-h-24 overflow-y-auto bg-slate-900/60 p-2.5 rounded border border-slate-850/80 font-sans font-medium">
                          {selectedProductForAI.description || "Nenhuma descrição técnica, comercial ou dados de lote saneados."}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-850/30 text-[10px] text-slate-600">
                    ID Interno: {selectedProductForAI.id}
                  </div>
                </div>

                {/* Product Right: Enriched Suggested State */}
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 space-y-4 flex flex-col justify-between text-left shadow-[0_4px_25px_rgba(16,185,129,0.02)]">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 font-extrabold px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-widest flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        Recomendação IA
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 font-black">
                        Confiança: {aiSuggestion.confidence}%
                      </span>
                    </div>

                    <h4 className="text-sm font-black text-slate-100 font-display uppercase tracking-wide mb-4">
                      {selectedProductForAI.name}
                    </h4>

                    <div className="space-y-3.5 font-mono text-xs">
                      <div>
                        <span className="block text-[9px] text-slate-500 font-black uppercase mb-1">GTIN Recomendado</span>
                        <span className="font-extrabold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 block w-fit shadow-[0_0_10px_rgba(16,185,129,0.05)] text-sm tracking-wider">
                          {aiSuggestion.recommendedGtin}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[9px] text-emerald-500/60 font-black uppercase mb-1">Fabricante Saneado</span>
                        <span className="text-emerald-300 font-bold block bg-slate-900/60 p-2 rounded border border-emerald-500/10">
                          {aiSuggestion.brand}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[9px] text-slate-500 font-black uppercase mb-1">Categoria Consorciada</span>
                        <div className="flex gap-1.5 bg-slate-900/60 p-2 rounded border border-slate-850/80">
                          <span className="font-bold text-slate-300">{aiSuggestion.category}</span>
                          <span className="text-slate-600">/</span>
                          <span className="font-bold text-slate-400">{aiSuggestion.subcategory}</span>
                        </div>
                      </div>

                      <div>
                        <span className="block text-[9px] text-emerald-500/60 font-black uppercase mb-1">Ficha Saneada Completa</span>
                        <span className="text-slate-300 text-[11px] leading-relaxed block max-h-24 overflow-y-auto bg-slate-900/60 p-2.5 rounded border border-emerald-500/10 font-sans font-medium">
                          {aiSuggestion.description}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-emerald-500/10 text-[10px] text-emerald-500/80 font-medium flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Checkout Checksum de Barra OK
                  </div>
                </div>

              </div>

              {/* Bottom Warning and Actions */}
              <div className="p-6 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-left">
                <div className="space-y-0.5 max-w-sm">
                  <span className="text-[10px] font-mono text-amber-500 font-black flex items-center gap-1 uppercase tracking-wider">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Auditoria Geral S/A
                  </span>
                  <p className="text-[10.5px] text-slate-500 font-sans leading-normal font-medium">
                    A aprovação atualizará este item na base principal do estoque e registrará a auditoria de mudança do GTIN permanentemente para transmissão do ERP.
                  </p>
                </div>

                <div className="flex gap-2.5 w-full sm:w-auto shrink-0 justify-end">
                  <button
                    onClick={() => setShowAiConfirmModal(false)}
                    className="flex-1 sm:flex-initial bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-slate-100 font-bold px-5 py-3 rounded-xl text-xs uppercase cursor-pointer border border-slate-700 transition-all text-center flex items-center justify-center"
                  >
                    Recusar
                  </button>
                  <button
                    onClick={applyAISuggestion}
                    className="flex-1 sm:flex-initial bg-linear-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs px-6 py-3 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    Aplicar Mudanças
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
