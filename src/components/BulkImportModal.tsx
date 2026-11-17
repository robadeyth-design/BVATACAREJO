import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, Upload, Download, CheckCircle, AlertTriangle, 
  AlertOctagon, X, RefreshCw, Plus, Trash2, Edit3, Check, Search, 
  HelpCircle, Eye, ShieldAlert, ArrowRight, ArrowDownLeft, Store, 
  Warehouse, Factory, Layers, Package, FileText, Sparkles, Filter
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Product, Category, Transaction, Batch } from '../types';

export interface BulkImportItem {
  id: string; // temporary key for preview
  nome: string;
  codigoBarras: string;
  marca: string;
  categoria: string;
  subcategoria: string;
  volume: string;
  embalagem: string;
  qtdPorCaixa: number;
  estoqueDeposito: number;
  estoqueLoja: number;
  validade: string; // YYYY-MM-DD
  estoqueMinimo: number;
  descricao?: string;
  
  // Validation status
  status: 'valido' | 'duplicado_banco' | 'duplicado_arquivo' | 'incompleto';
  statusMessage?: string;
  matchedExistingProduct?: Product;
  resolution: 'importar_novo' | 'atualizar_existente' | 'pular';
}

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: Product[];
  categories: Category[];
  allBrandsList: string[];
  currentUser: any;
  onConfirmImport: (newProducts: Product[], updatedProducts: Product[], transactions: Transaction[]) => Promise<void>;
}

// Top beverage & food volume patterns for smart regex extraction
const VOLUME_REGEX = /\b(\d+(?:[.,]\d+)?\s*(?:ml|l|litros?|g|kg|quilos?))\b/i;
const PACKAGING_REGEX = /\b(unidade|unidades|fardo|fardos|caixa|caixas|cx|pallet|pallets|palete|pack|packs|lata|latas|garrafa|garrafas|pet|litr[ãa]o|litrinho|long\s*neck)\b/i;
const UNITS_PER_BOX_REGEX = /(?:c\/|cx\s*c\/|cx\s*com|fardo\s*c\/|fardo\s*com|pack\s*c\/|pack\s*com|\bcom\s*|\bcontendo\s*|\bx\s*)(\d+)\s*(?:un|latas?|garrafas?|unidades?)?/i;

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  existingProducts,
  categories,
  allBrandsList,
  currentUser,
  onConfirmImport
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<BulkImportItem[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'paste'>('upload');
  const [pasteText, setPasteText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [globalDuplicateAction, setGlobalDuplicateAction] = useState<'pular' | 'atualizar'>('pular');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'validos' | 'duplicados' | 'com_estoque' | 'sem_estoque'>('todos');
  const [searchPreview, setSearchPreview] = useState('');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<BulkImportItem | null>(null);
  const [importSummary, setImportSummary] = useState<{
    newCount: number;
    updatedCount: number;
    skippedCount: number;
    totalDepositoQty: number;
    totalLojaQty: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Helper to normalize strings for comparison (remove accents, lowercase)
  const normalize = (str: string) => {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  // Smart volume extraction from product name if empty
  const extractVolume = (name: string, rawVolume?: string): string => {
    if (rawVolume && rawVolume.trim()) return rawVolume.trim();
    const match = name.match(VOLUME_REGEX);
    if (match && match[1]) {
      return match[1].replace(/\s+/g, ' ').trim();
    }
    return '';
  };

  // Smart packaging extraction
  const extractPackaging = (name: string, rawPkg?: string): string => {
    if (rawPkg && rawPkg.trim()) {
      const lower = rawPkg.toLowerCase().trim();
      if (lower.includes('fardo')) return 'fardo';
      if (lower.includes('caixa') || lower === 'cx') return 'caixa';
      if (lower.includes('pallet') || lower.includes('palete')) return 'pallet';
      if (lower.includes('pack')) return 'pack';
      return rawPkg.trim();
    }
    const match = name.match(PACKAGING_REGEX);
    if (match && match[1]) {
      const found = match[1].toLowerCase();
      if (found.includes('fardo')) return 'fardo';
      if (found.includes('caixa') || found === 'cx') return 'caixa';
      if (found.includes('pallet') || found.includes('palete')) return 'pallet';
      if (found.includes('pack')) return 'pack';
      return found;
    }
    return 'unidade';
  };

  // Smart units per box extraction
  const extractUnitsPerBox = (name: string, rawUnits?: any): number => {
    if (rawUnits !== undefined && rawUnits !== null && rawUnits !== '') {
      const parsed = parseInt(String(rawUnits).replace(/\D/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const match = name.match(UNITS_PER_BOX_REGEX);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 1;
  };

  // Smart category extraction
  const extractCategoryAndSubcategory = (name: string, rawCat?: string, rawSub?: string) => {
    let cat = (rawCat || '').trim();
    let sub = (rawSub || '').trim();

    if (cat) {
      // Find matching category in existing catalog
      const matched = categories.find(c => normalize(c.name) === normalize(cat));
      if (matched) {
        cat = matched.name;
        if (sub) {
          const matchedSub = matched.subcategories.find(s => normalize(s) === normalize(sub));
          if (matchedSub) sub = matchedSub;
        } else if (matched.subcategories.length > 0) {
          sub = matched.subcategories[0];
        }
        return { cat, sub };
      }
    }

    // Infer from product name
    const n = normalize(name);
    if (n.includes('cerveja') || n.includes('chopp') || n.includes('heineken') || n.includes('brahma') || n.includes('skol') || n.includes('amstel')) {
      return { cat: 'Bebidas', sub: 'Cervejas' };
    }
    if (n.includes('refrigerante') || n.includes('coca') || n.includes('guarana') || n.includes('fanta') || n.includes('sprite')) {
      return { cat: 'Bebidas', sub: 'Refrigerantes' };
    }
    if (n.includes('suco') || n.includes('agua') || n.includes('energetico') || n.includes('red bull') || n.includes('monster') || n.includes('isotonico')) {
      return { cat: 'Bebidas', sub: 'Sucos e Águas' };
    }
    if (n.includes('arroz') || n.includes('feijao') || n.includes('oleo') || n.includes('azeite') || n.includes('macarrao') || n.includes('farinha') || n.includes('acucar') || n.includes('cafe')) {
      return { cat: 'Alimentos', sub: 'Arroz e Grãos' };
    }
    if (n.includes('sabao') || n.includes('detergente') || n.includes('amaciante') || n.includes('desinfetante') || n.includes('cloro') || n.includes('limpeza')) {
      return { cat: 'Limpeza', sub: 'Detergentes' };
    }
    if (n.includes('chocolate') || n.includes('biscoito') || n.includes('bolacha') || n.includes('doce') || n.includes('bala') || n.includes('bombom')) {
      return { cat: 'Doces e Confeitos', sub: 'Chocolates' };
    }
    if (n.includes('carne') || n.includes('frango') || n.includes('linguica') || n.includes('queijo') || n.includes('presunto') || n.includes('sorvete') || n.includes('congelado')) {
      return { cat: 'Frios e Congelados', sub: 'Carnes' };
    }

    // Fallback to first existing category
    const defaultCat = categories[0]?.name || 'Geral';
    const defaultSub = categories[0]?.subcategories[0] || '';
    return { cat: defaultCat, sub: defaultSub };
  };

  // Smart manufacturer / brand extraction
  const extractBrand = (name: string, rawBrand?: string): string => {
    if (rawBrand && rawBrand.trim()) return rawBrand.trim();
    const n = normalize(name);
    for (const b of allBrandsList) {
      if (n.includes(normalize(b))) {
        return b;
      }
    }
    // Check known beverage brands
    if (n.includes('brahma') || n.includes('skol') || n.includes('antarctica') || n.includes('corona') || n.includes('budweiser') || n.includes('stella')) {
      return 'Ambev';
    }
    if (n.includes('heineken') || n.includes('amstel') || n.includes('devassa') || n.includes('eisenbahn')) {
      return 'Heineken Brasil';
    }
    if (n.includes('coca') || n.includes('fanta') || n.includes('sprite') || n.includes('schweppes') || n.includes('del valle') || n.includes('crystal')) {
      return 'Coca-Cola FEMSA';
    }
    if (n.includes('nestle') || n.includes('passatempo') || n.includes('ninho') || n.includes('kitkat') || n.includes('garoto')) {
      return 'Nestlé';
    }
    if (n.includes('unilever') || n.includes('omo') || n.includes('comfort') || n.includes('rexona') || n.includes('dove') || n.includes('kibon') || n.includes('hellmanns')) {
      return 'Unilever';
    }
    if (n.includes('tio joao') || n.includes('pirahy')) {
      return 'Pirahy Alimentos';
    }
    if (n.includes('gallo')) {
      return 'Gallo Worldwide';
    }
    if (n.includes('camil')) {
      return 'Camil Alimentos';
    }
    return '';
  };

  // Format date safely as YYYY-MM-DD
  const formatValidade = (rawDate: any): string => {
    if (!rawDate) return '';
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      return rawDate.toISOString().split('T')[0];
    }
    const str = String(rawDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }
    // DD/MM/YYYY
    const brMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (brMatch) {
      const d = brMatch[1].padStart(2, '0');
      const m = brMatch[2].padStart(2, '0');
      const y = brMatch[3];
      return `${y}-${m}-${d}`;
    }
    return '';
  };

  // Build the complete BulkImportItem array from raw objects
  const processRawData = (rows: any[]) => {
    const processed: BulkImportItem[] = [];
    const seenBarcodesInFile = new Set<string>();
    const seenNamesInFile = new Set<string>();

    rows.forEach((row, idx) => {
      // Find matching keys flexibly
      const keys = Object.keys(row);
      const findVal = (keywords: string[]) => {
        for (const k of keys) {
          const normKey = normalize(k);
          for (const kw of keywords) {
            if (normKey === kw || normKey.includes(kw)) {
              return row[k];
            }
          }
        }
        return undefined;
      };

      const rawNome = findVal(['nome', 'produto', 'descricao do produto', 'descricao', 'item', 'artigo']);
      const rawBarcode = findVal(['codigo de barras', 'codigo', 'ean', 'gtin', 'cod_barras', 'barcode']);
      const rawMarca = findVal(['marca', 'fabricante', 'industria', 'fornecedor', 'brand']);
      const rawCat = findVal(['categoria', 'departamento', 'secao', 'grupo']);
      const rawSub = findVal(['subcategoria', 'sub-categoria', 'familia', 'tipo']);
      const rawVol = findVal(['volume', 'conteudo', 'peso', 'medida', 'tamanho', 'capacidade']);
      const rawPkg = findVal(['embalagem', 'tipo de embalagem', 'tipo embalagem', 'acondicionamento']);
      const rawUnitsPerBox = findVal(['qtd por caixa', 'qtd_por_caixa', 'unidades por caixa', 'fator', 'unidades por fardo', 'fardo', 'caixa', 'unidades']);
      const rawEstoqueDep = findVal(['estoque deposito', 'deposito', 'estoque_deposito', 'deposito central', 'anexo', 'galpao', 'qtde deposito']);
      const rawEstoqueLoja = findVal(['estoque loja', 'loja', 'estoque_loja', 'gondola', 'gondolas', 'prateleira', 'loja fisica', 'qtde loja']);
      const rawValidade = findVal(['validade', 'data de validade', 'vencimento', 'data_validade']);
      const rawMinStock = findVal(['estoque minimo', 'minimo', 'min_stock', 'estoque_minimo']);
      const rawDesc = findVal(['observacao', 'obs', 'detalhes', 'nota']);

      const nome = String(rawNome || '').trim();
      if (!nome) return; // Ignore blank lines

      const cleanBarcode = String(rawBarcode || '').replace(/\D/g, '').trim();
      const volume = extractVolume(nome, String(rawVol || ''));
      const embalagem = extractPackaging(nome, String(rawPkg || ''));
      const qtdPorCaixa = extractUnitsPerBox(nome, rawUnitsPerBox);
      const marca = extractBrand(nome, String(rawMarca || ''));
      const { cat: categoria, sub: subcategoria } = extractCategoryAndSubcategory(nome, String(rawCat || ''), String(rawSub || ''));

      const estoqueDeposito = Math.max(0, parseInt(String(rawEstoqueDep || '0').replace(/\D/g, ''), 10) || 0);
      const estoqueLoja = Math.max(0, parseInt(String(rawEstoqueLoja || '0').replace(/\D/g, ''), 10) || 0);
      const estoqueMinimo = Math.max(0, parseInt(String(rawMinStock || '10').replace(/\D/g, ''), 10) || 10);
      const validade = formatValidade(rawValidade);

      // Check duplicates against existing catalog
      let matchedProd: Product | undefined;
      if (cleanBarcode) {
        matchedProd = existingProducts.find(p => p.barcode && p.barcode.trim() === cleanBarcode);
      }
      if (!matchedProd) {
        matchedProd = existingProducts.find(p => {
          const nameMatch = normalize(p.name) === normalize(nome);
          if (!nameMatch) return false;
          if (marca && p.brand) {
            return normalize(p.brand) === normalize(marca);
          }
          return true;
        });
      }

      // Check duplicates within the uploaded file
      const normName = normalize(nome);
      const isBarcodeDupInFile = cleanBarcode ? seenBarcodesInFile.has(cleanBarcode) : false;
      const isNameDupInFile = seenNamesInFile.has(normName);

      if (cleanBarcode) seenBarcodesInFile.add(cleanBarcode);
      seenNamesInFile.add(normName);

      let status: 'valido' | 'duplicado_banco' | 'duplicado_arquivo' | 'incompleto' = 'valido';
      let statusMessage = 'Pronto para cadastrar';
      let resolution: 'importar_novo' | 'atualizar_existente' | 'pular' = 'importar_novo';

      if (matchedProd) {
        status = 'duplicado_banco';
        statusMessage = `Já cadastrado no banco: "${matchedProd.name}" (${matchedProd.category})`;
        resolution = globalDuplicateAction === 'atualizar' ? 'atualizar_existente' : 'pular';
      } else if (isBarcodeDupInFile || isNameDupInFile) {
        status = 'duplicado_arquivo';
        statusMessage = isBarcodeDupInFile 
          ? `Código EAN ${cleanBarcode} repetido neste mesmo arquivo` 
          : `Item "${nome}" repetido neste mesmo arquivo`;
        resolution = 'pular';
      } else if (!nome) {
        status = 'incompleto';
        statusMessage = 'Nome do item não informado';
        resolution = 'pular';
      }

      processed.push({
        id: `row-${idx}-${Date.now()}`,
        nome,
        codigoBarras: cleanBarcode,
        marca,
        categoria,
        subcategoria,
        volume,
        embalagem,
        qtdPorCaixa,
        estoqueDeposito,
        estoqueLoja,
        validade,
        estoqueMinimo,
        descricao: rawDesc ? String(rawDesc).trim() : undefined,
        status,
        statusMessage,
        matchedExistingProduct: matchedProd,
        resolution
      });
    });

    setParsedRows(processed);
    setActiveTab('preview');
  };

  const [isDragging, setIsDragging] = useState(false);

  // Process a selected file (from picker or drag-drop)
  const handleProcessFile = (uploadedFile: File) => {
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setFileName(uploadedFile.name);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        // Pick first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to array of objects
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (!rawJson || rawJson.length === 0) {
          alert('A planilha está vazia ou não contém linhas de dados válidas.');
          setIsProcessing(false);
          return;
        }

        processRawData(rawJson);
      } catch (err) {
        console.error('Erro ao processar arquivo:', err);
        alert('Erro ao ler a planilha. Certifique-se de que é um arquivo Excel (.xlsx, .xls) ou CSV válido.');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      alert('Falha ao ler o arquivo selecionado.');
      setIsProcessing(false);
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  // Handle file upload event
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleProcessFile(files[0]);
    }
  };

  // Handle copy-pasted text (from Google Sheets or Excel)
  const handlePasteProcess = () => {
    if (!pasteText.trim()) {
      alert('Cole o conteúdo da tabela no campo de texto.');
      return;
    }

    try {
      setIsProcessing(true);
      // Read pasted CSV/TSV table using SheetJS
      const workbook = XLSX.read(pasteText, { type: 'string' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rawJson || rawJson.length === 0) {
        alert('Não foi possível identificar linhas de dados no texto colado.');
        setIsProcessing(false);
        return;
      }

      setFileName('Dados Colados do Clipboard');
      processRawData(rawJson);
    } catch (err) {
      console.error('Erro ao processar texto colado:', err);
      alert('Erro ao interpretar os dados colados. Verifique se a primeira linha contém os cabeçalhos das colunas.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Download sample template (Excel & CSV)
  const handleDownloadTemplate = (format: 'xlsx' | 'csv') => {
    const templateData = [
      {
        'Nome do Produto': 'Cerveja Brahma Chopp Lata 350ml',
        'Codigo de Barras': '7891991000826',
        'Marca / Fabricante': 'Ambev',
        'Categoria': 'Bebidas',
        'Subcategoria': 'Cervejas',
        'Volume': '350 ml',
        'Tipo de Embalagem': 'fardo',
        'Qtd por Caixa': 12,
        'Estoque Deposito': 150,
        'Estoque Loja': 24,
        'Validade': '2026-11-20',
        'Estoque Minimo': 20
      },
      {
        'Nome do Produto': 'Cerveja Heineken Long Neck 330ml',
        'Codigo de Barras': '7896045505020',
        'Marca / Fabricante': 'Heineken Brasil',
        'Categoria': 'Bebidas',
        'Subcategoria': 'Cervejas',
        'Volume': '330 ml',
        'Tipo de Embalagem': 'caixa',
        'Qtd por Caixa': 24,
        'Estoque Deposito': 80,
        'Estoque Loja': 12,
        'Validade': '2026-10-15',
        'Estoque Minimo': 15
      },
      {
        'Nome do Produto': 'Refrigerante Coca-Cola Original 2L',
        'Codigo de Barras': '7894900010015',
        'Marca / Fabricante': 'Coca-Cola FEMSA',
        'Categoria': 'Bebidas',
        'Subcategoria': 'Refrigerantes',
        'Volume': '2 L',
        'Tipo de Embalagem': 'fardo',
        'Qtd por Caixa': 6,
        'Estoque Deposito': 120,
        'Estoque Loja': 18,
        'Validade': '2026-09-30',
        'Estoque Minimo': 12
      },
      {
        'Nome do Produto': 'Arroz Branco Tio João Tipo 1 5kg',
        'Codigo de Barras': '7896006700013',
        'Marca / Fabricante': 'Pirahy Alimentos',
        'Categoria': 'Alimentos',
        'Subcategoria': 'Arroz e Grãos',
        'Volume': '5 kg',
        'Tipo de Embalagem': 'fardo',
        'Qtd por Caixa': 6,
        'Estoque Deposito': 60,
        'Estoque Loja': 10,
        'Validade': '2027-04-10',
        'Estoque Minimo': 10
      },
      {
        'Nome do Produto': 'Detergente Líquido OMO Lavagem Perfeita 1L',
        'Codigo de Barras': '7891150045612',
        'Marca / Fabricante': 'Unilever',
        'Categoria': 'Limpeza',
        'Subcategoria': 'Detergentes',
        'Volume': '1 L',
        'Tipo de Embalagem': 'caixa',
        'Qtd por Caixa': 12,
        'Estoque Deposito': 40,
        'Estoque Loja': 8,
        'Validade': '2027-12-31',
        'Estoque Minimo': 10
      },
      {
        'Nome do Produto': 'Azeite de Oliva Extra Virgem Gallo Vidro 500ml',
        'Codigo de Barras': '5601115000010',
        'Marca / Fabricante': 'Gallo Worldwide',
        'Categoria': 'Alimentos',
        'Subcategoria': 'Óleos e Azeites',
        'Volume': '500 ml',
        'Tipo de Embalagem': 'caixa',
        'Qtd por Caixa': 12,
        'Estoque Deposito': 0, // Exemplo de produto cadastrado SEM estoque inicial para preencher depois!
        'Estoque Loja': 0,
        'Validade': '',
        'Estoque Minimo': 5
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Produtos');

    if (format === 'xlsx') {
      XLSX.writeFile(workbook, 'Modelo_Importacao_Produtos_BV_Atacarejo.xlsx');
    } else {
      XLSX.writeFile(workbook, 'Modelo_Importacao_Produtos_BV_Atacarejo.csv');
    }
  };

  // Update global duplicate resolution
  const handleToggleGlobalDuplicateAction = (action: 'pular' | 'atualizar') => {
    setGlobalDuplicateAction(action);
    setParsedRows(prev => prev.map(row => {
      if (row.status === 'duplicado_banco') {
        return {
          ...row,
          resolution: action === 'atualizar' ? 'atualizar_existente' : 'pular'
        };
      }
      return row;
    }));
  };

  // Inline edit handlers
  const handleStartEdit = (item: BulkImportItem) => {
    setEditingRowId(item.id);
    setEditFormData({ ...item });
  };

  const handleSaveEdit = () => {
    if (!editFormData) return;
    setParsedRows(prev => prev.map(row => {
      if (row.id === editFormData.id) {
        // Recalculate status with updated data
        const cleanBarcode = editFormData.codigoBarras ? editFormData.codigoBarras.replace(/\D/g, '').trim() : '';
        let matchedProd = existingProducts.find(p => p.barcode && p.barcode.trim() === cleanBarcode);
        if (!matchedProd) {
          matchedProd = existingProducts.find(p => normalize(p.name) === normalize(editFormData.nome));
        }

        let status = editFormData.status;
        let resolution = editFormData.resolution;
        let statusMessage = editFormData.statusMessage;

        if (matchedProd) {
          status = 'duplicado_banco';
          statusMessage = `Já cadastrado no banco: "${matchedProd.name}"`;
          resolution = globalDuplicateAction === 'atualizar' ? 'atualizar_existente' : 'pular';
        } else {
          status = 'valido';
          statusMessage = 'Pronto para cadastrar';
          resolution = 'importar_novo';
        }

        return {
          ...editFormData,
          codigoBarras: cleanBarcode,
          status,
          statusMessage,
          matchedExistingProduct: matchedProd,
          resolution
        };
      }
      return row;
    }));
    setEditingRowId(null);
    setEditFormData(null);
  };

  const handleDeleteRow = (id: string) => {
    setParsedRows(prev => prev.filter(r => r.id !== id));
  };

  // Filter preview items
  const filteredPreview = useMemo(() => {
    return parsedRows.filter(row => {
      // Search
      if (searchPreview.trim()) {
        const q = normalize(searchPreview);
        const matchesName = normalize(row.nome).includes(q);
        const matchesBarcode = row.codigoBarras.includes(q);
        const matchesBrand = normalize(row.marca).includes(q);
        const matchesCat = normalize(row.categoria).includes(q);
        if (!matchesName && !matchesBarcode && !matchesBrand && !matchesCat) {
          return false;
        }
      }

      // Status
      if (filterStatus === 'validos') {
        return row.status === 'valido';
      }
      if (filterStatus === 'duplicados') {
        return row.status === 'duplicado_banco' || row.status === 'duplicado_arquivo';
      }
      if (filterStatus === 'com_estoque') {
        return row.estoqueDeposito > 0 || row.estoqueLoja > 0;
      }
      if (filterStatus === 'sem_estoque') {
        return row.estoqueDeposito === 0 && row.estoqueLoja === 0;
      }

      return true;
    });
  }, [parsedRows, searchPreview, filterStatus]);

  // Analytical stats
  const previewStats = useMemo(() => {
    const total = parsedRows.length;
    const validos = parsedRows.filter(r => r.status === 'valido').length;
    const duplicados = parsedRows.filter(r => r.status === 'duplicado_banco' || r.status === 'duplicado_arquivo').length;
    const comEstoque = parsedRows.filter(r => r.estoqueDeposito > 0 || r.estoqueLoja > 0).length;
    const semEstoque = parsedRows.filter(r => r.estoqueDeposito === 0 && r.estoqueLoja === 0).length;
    const willImport = parsedRows.filter(r => r.resolution === 'importar_novo' || r.resolution === 'atualizar_existente').length;
    const willSkip = parsedRows.filter(r => r.resolution === 'pular').length;

    let totalDepQty = 0;
    let totalLojaQty = 0;
    parsedRows.forEach(r => {
      if (r.resolution !== 'pular') {
        totalDepQty += r.estoqueDeposito;
        totalLojaQty += r.estoqueLoja;
      }
    });

    return {
      total,
      validos,
      duplicados,
      comEstoque,
      semEstoque,
      willImport,
      willSkip,
      totalDepQty,
      totalLojaQty
    };
  }, [parsedRows]);

  // Final confirmation & database persistence
  const handleConfirmAndSave = async () => {
    const rowsToProcess = parsedRows.filter(r => r.resolution !== 'pular');
    if (rowsToProcess.length === 0) {
      alert('Nenhum produto selecionado para importação. Todos os itens estão marcados para "Pular".');
      return;
    }

    setIsSaving(true);

    try {
      const newProductsToCreate: Product[] = [];
      const existingProductsToUpdate: Product[] = [];
      const transactionsToRecord: Transaction[] = [];

      const operator = currentUser?.displayName || 'Importação em Massa';
      const timestamp = new Date().toISOString();

      rowsToProcess.forEach((row, index) => {
        if (row.resolution === 'atualizar_existente' && row.matchedExistingProduct) {
          // Update existing product
          const existing = row.matchedExistingProduct;
          const updatedBatches = [...existing.batches];

          // Add depósito batch if quantity informed
          if (row.estoqueDeposito > 0) {
            const batchId = `l-imp-${Date.now().toString().slice(-4)}-${index}`;
            updatedBatches.push({
              id: batchId,
              date: row.validade || '',
              quantity: row.estoqueDeposito
            });

            transactionsToRecord.push({
              id: `t-imp-dep-${Date.now()}-${index}`,
              productId: existing.id,
              productName: existing.name,
              barcode: existing.barcode || '',
              type: 'entrada',
              quantity: row.estoqueDeposito,
              operatorName: operator,
              timestamp,
              packaging: row.embalagem || existing.packaging,
              batchId,
              batchDate: row.validade || ''
            });
          }

          // Register store transfer if store quantity informed
          if (row.estoqueLoja > 0) {
            transactionsToRecord.push({
              id: `t-imp-loja-${Date.now()}-${index}`,
              productId: existing.id,
              productName: existing.name,
              barcode: existing.barcode || '',
              type: 'transferencia',
              quantity: row.estoqueLoja,
              operatorName: operator,
              timestamp,
              packaging: row.embalagem || existing.packaging,
              batchId: 'transf-inicial',
              batchDate: row.validade || '',
              transferDestination: 'loja'
            });
          }

          const updated: Product = {
            ...existing,
            packaging: row.embalagem || existing.packaging,
            brand: row.marca || existing.brand,
            weightVolume: row.volume || existing.weightVolume,
            batches: updatedBatches
          };

          existingProductsToUpdate.push(updated);
        } else {
          // Create new product
          const newProdId = `p-${Date.now()}-${index}`;
          const initialBatches: Batch[] = [];

          if (row.estoqueDeposito > 0) {
            const batchId = `l-imp-${Date.now().toString().slice(-4)}-${index}`;
            initialBatches.push({
              id: batchId,
              date: row.validade || '',
              quantity: row.estoqueDeposito
            });

            transactionsToRecord.push({
              id: `t-imp-dep-${Date.now()}-${index}`,
              productId: newProdId,
              productName: row.nome,
              barcode: row.codigoBarras,
              type: 'entrada',
              quantity: row.estoqueDeposito,
              operatorName: operator,
              timestamp,
              packaging: row.embalagem,
              batchId,
              batchDate: row.validade || ''
            });
          }

          // Separate store stock without contaminating depósito batches
          if (row.estoqueLoja > 0) {
            transactionsToRecord.push({
              id: `t-imp-loja-${Date.now()}-${index}`,
              productId: newProdId,
              productName: row.nome,
              barcode: row.codigoBarras,
              type: 'transferencia',
              quantity: row.estoqueLoja,
              operatorName: operator,
              timestamp,
              packaging: row.embalagem,
              batchId: 'transf-inicial',
              batchDate: row.validade || '',
              transferDestination: 'loja'
            });
          }

          const newProd: Product = {
            id: newProdId,
            name: row.nome,
            barcode: row.codigoBarras,
            category: row.categoria,
            subcategory: row.subcategoria,
            minStock: row.estoqueMinimo || 10,
            packaging: row.embalagem,
            batches: initialBatches,
            ...(row.marca ? { brand: row.marca } : {}),
            ...(row.volume ? { weightVolume: row.volume } : {}),
            ...(row.descricao ? { description: row.descricao } : {})
          };

          newProductsToCreate.push(newProd);
        }
      });

      // Call parent commit function that writes to Firestore and local state
      await onConfirmImport(newProductsToCreate, existingProductsToUpdate, transactionsToRecord);

      setImportSummary({
        newCount: newProductsToCreate.length,
        updatedCount: existingProductsToUpdate.length,
        skippedCount: previewStats.willSkip,
        totalDepositoQty: previewStats.totalDepQty,
        totalLojaQty: previewStats.totalLojaQty
      });

      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.5 }
      });
    } catch (err) {
      console.error('Erro ao gravar importação:', err);
      alert('Ocorreu um erro ao gravar os produtos no banco de dados. Verifique a conexão e tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-[70] animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Top Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-emerald-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-100 text-sm sm:text-base uppercase tracking-tight font-display">
                  IMPORTAR PRODUTOS EM MASSA
                </h3>
                <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase">
                  Excel / CSV
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans">
                Cadastro veloz em lote com identificação de fabricante, separação de depósito e gôndolas e proteção contra duplicados.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1.5 bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Splash Screen when import completes */}
        {importSummary ? (
          <div className="p-8 text-center space-y-6 max-w-lg mx-auto my-auto">
            <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500/50 rounded-3xl flex items-center justify-center text-emerald-400 mx-auto animate-bounce">
              <CheckCircle className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <h4 className="text-xl font-black text-slate-100 tracking-tight font-display">
                IMPORTAÇÃO CONCLUÍDA COM SUCESSO!
              </h4>
              <p className="text-xs text-slate-400">
                Os produtos foram validados e gravados com sucesso no banco de dados e no catálogo do BV Atacarejo.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-500 font-bold block">Novos Produtos</span>
                <span className="text-xl font-black text-emerald-400 font-mono">+{importSummary.newCount}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-500 font-bold block">Atualizados</span>
                <span className="text-xl font-black text-sky-400 font-mono">{importSummary.updatedCount}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-500 font-bold block">Entrada Depósito</span>
                <span className="text-base font-black text-slate-200 font-mono">{importSummary.totalDepositoQty} un</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-500 font-bold block">Entrada Loja</span>
                <span className="text-base font-black text-amber-400 font-mono">{importSummary.totalLojaQty} un</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_4px_14px_rgba(16,185,129,0.3)] cursor-pointer"
            >
              Concluir e Ver no Estoque
            </button>
          </div>
        ) : (
          <>
            {/* Step Navigation Tabs */}
            <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap justify-between items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'upload'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm font-black'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>1. Enviar Arquivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'paste'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm font-black'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Colar Tabela</span>
                </button>

                {parsedRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('preview')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'preview'
                        ? 'bg-emerald-500 text-slate-950 shadow-sm font-black'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>2. Pré-Visualização & Correção ({parsedRows.length})</span>
                  </button>
                )}
              </div>

              {/* Template Download Buttons */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold hidden sm:inline">
                  Modelos Prontos:
                </span>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate('xlsx')}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 rounded-xl text-[10.5px] font-bold font-mono flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Baixar planilha padrão preenchida com exemplos de atacarejo em formato Excel (.xlsx)"
                >
                  <Download className="w-3 h-3 text-emerald-400" />
                  <span>Modelo Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate('csv')}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 rounded-xl text-[10.5px] font-bold font-mono flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Baixar planilha padrão em formato CSV (.csv)"
                >
                  <Download className="w-3 h-3 text-amber-400" />
                  <span>Modelo CSV</span>
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              
              {/* TAB 1: UPLOAD FILE */}
              {activeTab === 'upload' && (
                <div className="space-y-6">
                  {/* Drag and Drop Zone & Direct File Button */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                      const files = e.dataTransfer.files;
                      if (files && files[0]) {
                        handleProcessFile(files[0]);
                      }
                    }}
                    className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all space-y-4 ${
                      isDragging 
                        ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]' 
                        : 'border-slate-700 hover:border-emerald-500/60 bg-slate-950/70 hover:bg-slate-950'
                    }`}
                  >
                    <input
                      id="bulk-file-upload-input"
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />

                    <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto shadow-md">
                      <Upload className="w-8 h-8 stroke-[2.2]" />
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="font-black text-slate-100 text-base sm:text-lg">
                        Importar Arquivo de Planilha
                      </h4>
                      <p className="text-xs text-slate-300 font-sans max-w-md mx-auto">
                        Arraste sua planilha aqui ou clique no botão abaixo para escolher o arquivo do seu computador ou celular.
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Formatos aceitos: <strong>.XLSX</strong>, <strong>.XLS</strong> ou <strong>.CSV</strong>
                      </p>
                    </div>

                    {/* Prominent Direct Button to open OS file dialog */}
                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                      <label
                        htmlFor="bulk-file-upload-input"
                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-[0_4px_16px_rgba(16,185,129,0.35)] flex items-center gap-2 cursor-pointer select-none"
                      >
                        <FileSpreadsheet className="w-4 h-4 stroke-[2.5]" />
                        <span>SELECIONAR ARQUIVO NO DISPOSITIVO</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => setActiveTab('paste')}
                        className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all border border-slate-700 flex items-center gap-2 cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span>Ou Colar Tabela (Copiar/Colar)</span>
                      </button>
                    </div>

                    {fileName && (
                      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-300 mt-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span>Arquivo selecionado: <strong>{fileName}</strong></span>
                      </div>
                    )}

                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[10.5px] font-mono text-slate-400 mt-2">
                      <span>Colunas reconhecidas: Nome, Código EAN, Marca, Categoria, Volume, Estoque Depósito e Loja</span>
                    </div>
                  </div>

                  {/* Highlights / Features Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <div className="flex items-center gap-2 text-emerald-400 font-bold">
                        <Warehouse className="w-4 h-4" />
                        <span className="uppercase font-mono text-[10px]">Depósito & Loja Separados</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Quantidades para gôndolas e galpão são mantidas isoladas. Se não informar estoque inicial, cadastra a ficha com estoque zerado para preenchimento posterior.
                      </p>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <div className="flex items-center gap-2 text-sky-400 font-bold">
                        <Factory className="w-4 h-4" />
                        <span className="uppercase font-mono text-[10px]">Identificação de Fabricante</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Reconhece automaticamente as indústrias parceiras (Ambev, Coca-Cola FEMSA, Heineken, Nestlé, Unilever, Pirahy, etc.) organizando seu catálogo.
                      </p>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <div className="flex items-center gap-2 text-amber-400 font-bold">
                        <ShieldAlert className="w-4 h-4" />
                        <span className="uppercase font-mono text-[10px]">Anti-Duplicidade</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Evita duplicações indesejadas checando código de barras EAN e nome. Você escolhe se deseja ignorar duplicados ou atualizar o saldo.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PASTE TABLE DIRECTLY */}
              {activeTab === 'paste' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-100 text-sm">
                      Copiar e Colar Tabela do Excel ou Google Sheets
                    </h4>
                    <p className="text-xs text-slate-400">
                      Selecione as linhas na sua planilha com o cabeçalho, aperte <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px]">Ctrl+C</kbd> e cole abaixo com <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px]">Ctrl+V</kbd>.
                    </p>
                  </div>

                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={10}
                    placeholder={"Nome\tCodigo de Barras\tMarca\tCategoria\tVolume\tEstoque Deposito\tEstoque Loja\nCerveja Brahma 350ml\t7891991000826\tAmbev\tBebidas\t350 ml\t100\t20\nCoca-Cola 2L\t7894900010015\tCoca-Cola FEMSA\tBebidas\t2 L\t80\t12"}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-2xl p-4 font-mono text-xs text-slate-200 focus:outline-none transition-colors"
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPasteText('')}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Limpar Texto
                    </button>
                    <button
                      type="button"
                      onClick={handlePasteProcess}
                      disabled={isProcessing || !pasteText.trim()}
                      className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_4px_12px_rgba(16,185,129,0.25)] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 stroke-[2.5]" />
                      <span>Processar e Pré-Visualizar</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: INTERACTIVE PREVIEW & CORRECTION */}
              {activeTab === 'preview' && (
                <div className="space-y-4">
                  {/* KPI Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <span className="text-[9.5px] uppercase font-mono text-slate-400 font-bold block">
                        Linhas Identificadas
                      </span>
                      <span className="text-xl font-black text-slate-100 font-mono">
                        {previewStats.total}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <span className="text-[9.5px] uppercase font-mono text-emerald-400 font-bold block">
                        Novos Itens Válidos
                      </span>
                      <span className="text-xl font-black text-emerald-400 font-mono">
                        {previewStats.validos}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <span className="text-[9.5px] uppercase font-mono text-amber-400 font-bold block">
                        Duplicados / Alerta
                      </span>
                      <span className="text-xl font-black text-amber-400 font-mono">
                        {previewStats.duplicados}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <span className="text-[9.5px] uppercase font-mono text-slate-400 font-bold block">
                        Estoque Depósito
                      </span>
                      <span className="text-xl font-black text-slate-200 font-mono">
                        {previewStats.totalDepQty} un
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <span className="text-[9.5px] uppercase font-mono text-amber-400 font-bold block">
                        Estoque Loja
                      </span>
                      <span className="text-xl font-black text-amber-400 font-mono">
                        {previewStats.totalLojaQty} un
                      </span>
                    </div>
                  </div>

                  {/* Duplicate Policy Selector & Filter Toolbar */}
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    {/* Duplicate Action */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase font-mono font-bold text-slate-400 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        Regra p/ Itens Duplicados:
                      </span>
                      <div className="inline-flex rounded-xl p-0.5 bg-slate-900 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleToggleGlobalDuplicateAction('pular')}
                          className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg transition-all cursor-pointer ${
                            globalDuplicateAction === 'pular'
                              ? 'bg-amber-500 text-slate-950 font-black'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Pular / Ignorar (Seguro)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleGlobalDuplicateAction('atualizar')}
                          className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg transition-all cursor-pointer ${
                            globalDuplicateAction === 'atualizar'
                              ? 'bg-sky-500 text-slate-950 font-black'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Atualizar Saldo do Existente
                        </button>
                      </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setFilterStatus('todos')}
                        className={`px-2 py-0.5 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                          filterStatus === 'todos'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        Todos ({parsedRows.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterStatus('validos')}
                        className={`px-2 py-0.5 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                          filterStatus === 'validos'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        Válidos ({previewStats.validos})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterStatus('duplicados')}
                        className={`px-2 py-0.5 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                          filterStatus === 'duplicados'
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        Duplicados ({previewStats.duplicados})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterStatus('sem_estoque')}
                        className={`px-2 py-0.5 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                          filterStatus === 'sem_estoque'
                            ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        Sem Estoque ({previewStats.semEstoque})
                      </button>
                    </div>
                  </div>

                  {/* Search within preview */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="text"
                      value={searchPreview}
                      onChange={(e) => setSearchPreview(e.target.value)}
                      placeholder="Pesquisar produto, código EAN, marca ou categoria na pré-visualização..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none font-sans"
                    />
                  </div>

                  {/* Spreadsheet Grid Table */}
                  <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-x-auto max-h-96">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900/90 text-slate-400 font-mono text-[10px] uppercase sticky top-0 z-10 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Código de Barras</th>
                          <th className="py-2.5 px-3">Nome do Produto</th>
                          <th className="py-2.5 px-3">Fabricante / Marca</th>
                          <th className="py-2.5 px-3">Categoria</th>
                          <th className="py-2.5 px-3">Volume</th>
                          <th className="py-2.5 px-3">Embalagem</th>
                          <th className="py-2.5 px-3 text-center">Depósito</th>
                          <th className="py-2.5 px-3 text-center">Loja</th>
                          <th className="py-2.5 px-3">Validade</th>
                          <th className="py-2.5 px-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {filteredPreview.map((row) => {
                          const isEditing = editingRowId === row.id;

                          return (
                            <tr
                              key={row.id}
                              className={`hover:bg-slate-900/40 transition-colors ${
                                row.resolution === 'pular'
                                  ? 'opacity-50 bg-slate-950/40'
                                  : row.status === 'duplicado_banco'
                                  ? 'bg-amber-950/15'
                                  : ''
                              }`}
                            >
                              {/* Status Badge */}
                              <td className="py-2 px-3 align-middle whitespace-nowrap">
                                {row.status === 'valido' ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    <CheckCircle className="w-3 h-3" /> Novo
                                  </span>
                                ) : row.status === 'duplicado_banco' ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30" title={row.statusMessage}>
                                    <AlertTriangle className="w-3 h-3" /> {row.resolution === 'atualizar_existente' ? 'Atualizar' : 'Duplicado'}
                                  </span>
                                ) : row.status === 'duplicado_arquivo' ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30" title={row.statusMessage}>
                                    <AlertOctagon className="w-3 h-3" /> No Arquivo
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                                    Incompleto
                                  </span>
                                )}
                              </td>

                              {/* Barcode */}
                              <td className="py-2 px-3 align-middle font-mono text-[11px]">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editFormData?.codigoBarras || ''}
                                    onChange={(e) => setEditFormData(prev => prev ? { ...prev, codigoBarras: e.target.value } : null)}
                                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-amber-400 w-28 focus:outline-none"
                                  />
                                ) : (
                                  <span className={row.codigoBarras ? 'text-slate-300 font-bold' : 'text-slate-500 italic'}>
                                    {row.codigoBarras || 'Sem EAN'}
                                  </span>
                                )}
                              </td>

                              {/* Name */}
                              <td className="py-2 px-3 align-middle font-semibold text-slate-100 max-w-xs truncate">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editFormData?.nome || ''}
                                    onChange={(e) => setEditFormData(prev => prev ? { ...prev, nome: e.target.value } : null)}
                                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-100 w-full focus:outline-none"
                                  />
                                ) : (
                                  <span title={row.nome}>{row.nome}</span>
                                )}
                              </td>

                              {/* Brand */}
                              <td className="py-2 px-3 align-middle whitespace-nowrap">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editFormData?.marca || ''}
                                    onChange={(e) => setEditFormData(prev => prev ? { ...prev, marca: e.target.value } : null)}
                                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 w-24 focus:outline-none"
                                  />
                                ) : (
                                  <span className="text-[11px] text-emerald-400 font-medium">
                                    {row.marca || '-'}
                                  </span>
                                )}
                              </td>

                              {/* Category */}
                              <td className="py-2 px-3 align-middle whitespace-nowrap">
                                {isEditing ? (
                                  <select
                                    value={editFormData?.categoria || ''}
                                    onChange={(e) => setEditFormData(prev => prev ? { ...prev, categoria: e.target.value } : null)}
                                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none"
                                  >
                                    {categories.map(c => (
                                      <option key={c.id} value={c.name}>{c.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-[11px] text-slate-300">
                                    {row.categoria}
                                  </span>
                                )}
                              </td>

                              {/* Volume */}
                              <td className="py-2 px-3 align-middle whitespace-nowrap text-[11px] text-slate-400">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editFormData?.volume || ''}
                                    onChange={(e) => setEditFormData(prev => prev ? { ...prev, volume: e.target.value } : null)}
                                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 w-16 focus:outline-none"
                                  />
                                ) : (
                                  <span>{row.volume || '-'}</span>
                                )}
                              </td>

                              {/* Packaging */}
                              <td className="py-2 px-3 align-middle whitespace-nowrap text-[11px] text-slate-400">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editFormData?.embalagem || ''}
                                    onChange={(e) => setEditFormData(prev => prev ? { ...prev, embalagem: e.target.value } : null)}
                                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 w-20 focus:outline-none"
                                  />
                                ) : (
                                  <span>
                                    {row.embalagem} {row.qtdPorCaixa > 1 ? `(c/${row.qtdPorCaixa})` : ''}
                                  </span>
                                )}
                              </td>

                              {/* Depósito Stock */}
                              <td className="py-2 px-3 align-middle text-center whitespace-nowrap">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    value={editFormData?.estoqueDeposito || 0}
                                    onChange={(e) => setEditFormData(prev => prev ? { ...prev, estoqueDeposito: Math.max(0, parseInt(e.target.value) || 0) } : null)}
                                    className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-xs text-center text-slate-200 w-14 focus:outline-none"
                                  />
                                ) : (
                                  <span className={`font-mono text-xs font-bold ${row.estoqueDeposito > 0 ? 'text-slate-100' : 'text-slate-500'}`}>
                                    {row.estoqueDeposito}
                                  </span>
                                )}
                              </td>

                              {/* Loja Stock */}
                              <td className="py-2 px-3 align-middle text-center whitespace-nowrap">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    value={editFormData?.estoqueLoja || 0}
                                    onChange={(e) => setEditFormData(prev => prev ? { ...prev, estoqueLoja: Math.max(0, parseInt(e.target.value) || 0) } : null)}
                                    className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-xs text-center text-slate-200 w-14 focus:outline-none"
                                  />
                                ) : (
                                  <span className={`font-mono text-xs font-bold ${row.estoqueLoja > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                    {row.estoqueLoja}
                                  </span>
                                )}
                              </td>

                              {/* Expiry Date */}
                              <td className="py-2 px-3 align-middle whitespace-nowrap text-[11px] font-mono text-slate-400">
                                {isEditing ? (
                                  <input
                                    type="date"
                                    value={editFormData?.validade || ''}
                                    onChange={(e) => setEditFormData(prev => prev ? { ...prev, validade: e.target.value } : null)}
                                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none"
                                  />
                                ) : (
                                  <span>{row.validade ? row.validade.split('-').reverse().join('/') : '-'}</span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="py-2 px-3 align-middle text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={handleSaveEdit}
                                        className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer"
                                        title="Salvar alterações"
                                      >
                                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingRowId(null);
                                          setEditFormData(null);
                                        }}
                                        className="p-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                                        title="Cancelar"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {/* Toggle resolution for duplicate items */}
                                      {row.status === 'duplicado_banco' && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setParsedRows(prev => prev.map(r => {
                                              if (r.id === row.id) {
                                                const nextRes = r.resolution === 'pular' ? 'atualizar_existente' : 'pular';
                                                return { ...r, resolution: nextRes };
                                              }
                                              return r;
                                            }));
                                          }}
                                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                                            row.resolution === 'atualizar_existente'
                                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                              : 'bg-slate-800 text-slate-400 border-slate-700'
                                          }`}
                                          title="Alterar ação individual para este item duplicado"
                                        >
                                          {row.resolution === 'atualizar_existente' ? 'Atualizar' : 'Pular'}
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => handleStartEdit(row)}
                                        className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer transition-colors"
                                        title="Editar linha"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteRow(row.id)}
                                        className="p-1 rounded text-rose-450 hover:text-rose-300 hover:bg-rose-950/30 cursor-pointer transition-colors"
                                        title="Remover linha da importação"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {filteredPreview.length === 0 && (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      Nenhum produto corresponde ao filtro atual.
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Bottom Modal Actions Footer */}
            <div className="px-5 py-4 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
              <div className="text-xs text-slate-400 font-sans text-center sm:text-left">
                {parsedRows.length > 0 ? (
                  <span>
                    Serão importados/atualizados <strong>{previewStats.willImport}</strong> produto(s) • <strong>{previewStats.willSkip}</strong> ignorado(s).
                  </span>
                ) : (
                  <span>Envie uma planilha ou cole os dados para iniciar a conferência.</span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>

                {parsedRows.length > 0 && activeTab !== 'preview' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('preview')}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-4 h-4 text-emerald-400" />
                    <span>Ver Prévia</span>
                  </button>
                )}

                {parsedRows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleConfirmAndSave}
                    disabled={isSaving || previewStats.willImport === 0}
                    className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_4px_14px_rgba(16,185,129,0.3)] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Gravando no Banco...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>Confirmar e Gravar no Banco ({previewStats.willImport})</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
};
