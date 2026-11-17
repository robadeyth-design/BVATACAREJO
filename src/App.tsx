import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Search, Scan, History, User, LogOut, Calendar, 
  AlertTriangle, CheckCircle, FileText, ArrowUpRight, 
  ArrowDownLeft, Save, X, Loader, ChevronDown, ChevronUp,
  Package, Layers, Boxes, ArrowRight, AlertOctagon, HelpCircle,
  Download, Wifi, WifiOff, Trash2, Globe, RefreshCw, Share2,
  Cpu, Sparkles, Palette, Settings2, Sliders, Type, Eye, EyeOff,
  Camera, LayoutDashboard, GlassWater, Snowflake, Cookie, ExternalLink,
  Check, Edit2, Volume2, VolumeX, Factory, Building2, FileSpreadsheet,
  ClipboardCheck, ArrowLeftRight, Filter, ShieldCheck, CheckSquare, Clock,
  Warehouse, Store, ShoppingBag, SlidersHorizontal, Lock, Unlock, ShieldAlert,
  ListChecks, Menu, ShoppingCart
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, 
  Cell, PieChart, Pie, Legend, AreaChart, Area, CartesianGrid
} from 'recharts';

// Firebase core configuration
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, getDocs, writeBatch, deleteDoc, runTransaction } from 'firebase/firestore';

import { Product, Category, Transaction, Batch, VasilhameItem, VasilhameTransaction, PurchaseOrder } from './types';
import { INITIAL_CATEGORIES, INITIAL_PRODUCTS, INITIAL_TRANSACTIONS, INITIAL_VASILHAMES, INITIAL_VASILHAME_TRANSACTIONS } from './utils/initialData';
import { safeJsonStringify, safeJsonParse } from './utils/safeJson';
import BarcodeScanner from './components/BarcodeScanner';
import GtinAutomationPanel from './components/GtinAutomationPanel';
import NfImportPanel from './components/NfImportPanel';
import VasilhamesPanel from './components/VasilhamesPanel';
import { BulkImportModal } from './components/BulkImportModal';
import PurchaseChecklistPanel from './components/PurchaseChecklistPanel';

const ANCHOR_DATE_STR = '2026-05-19'; // Static temporal anchor for valid expiration checking

// Sanitization utility to completely filter out 'undefined' values which would crash the Firebase Web SDK
function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)) as any;
  }
  if (typeof obj === 'object') {
    const clean: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = (obj as any)[key];
        if (value !== undefined) {
          clean[key] = sanitizeForFirestore(value);
        }
      }
    }
    return clean;
  }
  return obj;
}

function sortProductsAlphabetically(list: Product[]): Product[] {
  return [...list].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })
  );
}

// Helper to format quantity with the correct, pluralized packaging format name
function formatPackaging(qty: number, packagingStr: string): string {
  const norm = (packagingStr || 'unidade').trim().toLowerCase();
  
  if (norm === 'unidade' || norm === 'un' || norm === 'unidades') {
    return qty === 1 ? '1 unidade' : `${qty} unidades`;
  }
  if (norm === 'palete' || norm === 'pallet' || norm === 'paletes' || norm === 'pallets') {
    return qty === 1 ? '1 palete' : `${qty} paletes`;
  }
  if (norm === 'caixa' || norm === 'caixas' || norm === 'box') {
    return qty === 1 ? '1 caixa' : `${qty} caixas`;
  }
  if (norm === 'fardo' || norm === 'fardos') {
    return qty === 1 ? '1 fardo' : `${qty} fardos`;
  }
  if (norm === 'kg' || norm === 'quilo' || norm === 'kilo' || norm === 'kgs') {
    return `${qty} kg`;
  }
  
  // Custom formats like "fardo de 5kg" or "caixa de 12un"
  // Let's pluralize the first word if it has spaces
  const parts = norm.split(' ');
  const first = parts[0];
  let firstPlural = first;
  if (qty !== 1) {
    if (first === 'fardo') firstPlural = 'fardos';
    else if (first === 'caixa') firstPlural = 'caixas';
    else if (first === 'palete' || first === 'pallet') firstPlural = 'paletes';
    else if (first === 'unidade' || first === 'un') firstPlural = 'unidades';
    else if (!first.endsWith('s')) firstPlural = first + 's';
  } else {
    if (first === 'un') firstPlural = 'unidade';
  }
  parts[0] = firstPlural;
  return `${qty} ${parts.join(' ')}`;
}

// Helper to return only the pluralized packaging name for compact displays
function formatOnlyPackagingSingularPlural(qty: number, packagingStr: string): string {
  const norm = (packagingStr || 'un').trim().toLowerCase();
  if (norm === 'unidade' || norm === 'un' || norm === 'unidades') {
    return qty === 1 ? 'unidade' : 'unidades';
  }
  if (norm === 'palete' || norm === 'pallet' || norm === 'paletes' || norm === 'pallets') {
    return qty === 1 ? 'palete' : 'paletes';
  }
  if (norm === 'caixa' || norm === 'caixas' || norm === 'box') {
    return qty === 1 ? 'caixa' : 'caixas';
  }
  if (norm === 'fardo' || norm === 'fardos') {
    return qty === 1 ? 'fardo' : 'fardos';
  }
  if (norm === 'kg' || norm === 'quilo' || norm === 'kilo' || norm === 'kgs') {
    return 'kg';
  }
  
  const parts = norm.split(' ');
  const first = parts[0];
  let firstPlural = first;
  if (qty !== 1) {
    if (first === 'fardo') firstPlural = 'fardos';
    else if (first === 'caixa') firstPlural = 'caixas';
    else if (first === 'palete' || first === 'pallet') firstPlural = 'paletes';
    else if (first === 'unidade' || first === 'un') firstPlural = 'unidades';
    else if (!first.endsWith('s')) firstPlural = first + 's';
  } else {
    if (first === 'un') firstPlural = 'unidade';
  }
  parts[0] = firstPlural;
  return parts.join(' ');
}

// Helper to normalize Portuguese text for accent-insensitive search queries
function normalizeTextForSearch(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove all diacritics/accents
    .replace(/[çÇ]/g, "c")
    .trim();
}

// Helper to strip non-alphanumeric chars for flexible hyphen/space-agnostic matching
function cleanAlphaNum(text: string): string {
  return normalizeTextForSearch(text).replace(/[^a-z0-9]/g, '');
}

// Matches a product's registered name and attributes against query keywords, always prioritizing the registered name and ignoring accents
function matchProductWithKeywords(product: Product, queryStr: string): boolean {
  if (!queryStr || !queryStr.trim()) return true;
  
  const normQuery = normalizeTextForSearch(queryStr);
  const cleanQuery = cleanAlphaNum(queryStr);
  const keywords = normQuery.split(/[\s,;/+|-]+/).filter(Boolean);
  if (keywords.length === 0) return true;

  // 1. PRIMARY: Match against registered product name directly (accent-insensitive)
  const normName = normalizeTextForSearch(product.name || '');
  const cleanName = cleanAlphaNum(product.name || '');

  // Exact or substring match in name (e.g. "coca cola" matching "Coca-Cola", "guarana" matching "Guaraná")
  if (normName.includes(normQuery) || (cleanQuery.length > 0 && cleanName.includes(cleanQuery))) {
    return true;
  }

  // All individual words present in product.name
  if (keywords.every(kw => {
    const cleanKw = cleanAlphaNum(kw);
    return normName.includes(kw) || (cleanKw.length > 0 && cleanName.includes(cleanKw));
  })) {
    return true;
  }

  // 2. SECONDARY: Match against all other product attributes (barcode, brand, category, subcategory, weight, description, batch IDs)
  const batchIds = product.batches ? product.batches.map(b => b.id).join(' ') : '';
  const fieldsToSearch = [
    product.name || '',
    product.barcode || '',
    product.category || '',
    product.subcategory || '',
    product.brand || '',
    product.weightVolume || '',
    product.description || '',
    batchIds
  ];

  const combinedTargetText = normalizeTextForSearch(fieldsToSearch.join(' '));
  const combinedClean = cleanAlphaNum(fieldsToSearch.join(' '));

  if (cleanQuery.length > 0 && combinedClean.includes(cleanQuery)) {
    return true;
  }

  return keywords.every(kw => {
    const cleanKw = cleanAlphaNum(kw);
    return combinedTargetText.includes(kw) || (cleanKw.length > 0 && combinedClean.includes(cleanKw));
  });
}


const PRESET_PALETTES = [
  {
    name: "Esmeralda Atacarejo - Escuro Premium",
    config: {
      colorBgPage: "#070B0A",
      colorBgCard: "#101715",
      colorBgCardSubtle: "#1B2622",
      colorBorder: "#1D2B27",
      colorTextTitle: "#FFFFFF",
      colorTextMain: "#F1F5F9",
      colorTextMuted: "#86EFAC",
      colorNavbar: "#101715",
      colorFooter: "#070B0A",
      colorButtons: "#10B981",
      colorButtonsText: "#000000",
      colorAccent: "#10B981",
      colorLogo: "#10B981"
    }
  },
  {
    name: "Esmeralda Atacarejo - Claro Limpo",
    config: {
      colorBgPage: "#F4FAF7",
      colorBgCard: "#FFFFFF",
      colorBgCardSubtle: "#E6F5EC",
      colorBorder: "#D1E7DD",
      colorTextTitle: "#042F1A",
      colorTextMain: "#0B1F15",
      colorTextMuted: "#0B5B33",
      colorNavbar: "#FFFFFF",
      colorFooter: "#042F1A",
      colorButtons: "#059669",
      colorButtonsText: "#FFFFFF",
      colorAccent: "#059669",
      colorLogo: "#059669"
    }
  },
  {
    name: "Esmeralda Atacarejo - Midnight OLED",
    config: {
      colorBgPage: "#000000",
      colorBgCard: "#060F0C",
      colorBgCardSubtle: "#0C1D18",
      colorBorder: "#16332A",
      colorTextTitle: "#FFFFFF",
      colorTextMain: "#F1F5F9",
      colorTextMuted: "#34D399",
      colorNavbar: "#060F0C",
      colorFooter: "#000000",
      colorButtons: "#34D399",
      colorButtonsText: "#000000",
      colorAccent: "#34D399",
      colorLogo: "#34D399"
    }
  }
];

export default function App() {
  // Auth & Sync State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [usingFirebase, setUsingFirebase] = useState(false);
  const [firebaseSyncError, setFirebaseSyncError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Armazenamento dinâmico de ajustes rápidos pendentes (evita concorrência e flickering de dados no Firestore)
  const pendingAdjustmentsRef = useRef<{ 
    [productId: string]: { 
      timer: NodeJS.Timeout | null; 
      latestProduct: Product; 
      txs: Transaction[] 
    } 
  }>({});
  const pendingDeletedIdsRef = useRef<Set<string>>(new Set());

  // PWA & Connectivity State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);

  // Connectivity and PWA Installer Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Let's trigger a small visual success or alert when coming back online
      console.log('App reconectado à internet!');
    };
    const handleOffline = () => {
      setIsOnline(false);
      console.log('App operando offline em modo cache!');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Save PWA prompt event for rendering the download trigger
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall as any);

    // Detect if already launched as an installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandaloneApp(true);
    }

    const handleAppInstalled = () => {
      setIsStandaloneApp(true);
      setDeferredPrompt(null);
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall as any);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const initiatePWAInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Escolha do usuário para instalar:', outcome);
    if (outcome === 'accepted') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
    setDeferredPrompt(null);
  };

  // Business State
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // Memoized sum of quantities allocated/transferred to 'loja', 'anexo', and '3019' per product
  const productSectorsSums = useMemo(() => {
    const sums: { [productId: string]: { loja: number; anexo: number; '3019': number; totalTransferred: number } } = {};
    const sorted = [...transactions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    sorted.forEach(t => {
      if (!sums[t.productId]) {
        sums[t.productId] = { loja: 0, anexo: 0, '3019': 0, totalTransferred: 0 };
      }
      if (t.type === 'transferencia' && t.transferDestination) {
        const dest = t.transferDestination;
        sums[t.productId][dest] += t.quantity;
      } else if (t.type === 'saida') {
        const sector = t.sourceSector || t.transferDestination;
        if (sector === 'loja' || sector === 'anexo' || sector === '3019') {
          sums[t.productId][sector] = Math.max(0, sums[t.productId][sector] - t.quantity);
        } else if (!t.sourceSector && (t.batchId === 'loja' || t.batchId === 'sem-lote')) {
          let rem = t.quantity;
          const deductLoja = Math.min(sums[t.productId].loja, rem);
          sums[t.productId].loja -= deductLoja;
          rem -= deductLoja;
          if (rem > 0) {
            const deductAnexo = Math.min(sums[t.productId].anexo, rem);
            sums[t.productId].anexo -= deductAnexo;
            rem -= deductAnexo;
          }
          if (rem > 0) {
            const deduct3019 = Math.min(sums[t.productId]['3019'], rem);
            sums[t.productId]['3019'] -= deduct3019;
          }
        }
      }
      sums[t.productId].totalTransferred =
        sums[t.productId].loja + sums[t.productId].anexo + sums[t.productId]['3019'];
    });
    return sums;
  }, [transactions]);

  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [vasilhames, setVasilhames] = useState<VasilhameItem[]>(INITIAL_VASILHAMES);
  const [vasilhameTransactions, setVasilhameTransactions] = useState<VasilhameTransaction[]>(INITIAL_VASILHAME_TRANSACTIONS);
  // Navigation & Filtering State - Organized by task
  const [activeTab, setActiveTab] = useState<'inicio' | 'produtos' | 'estoque' | 'movimentacoes' | 'checklist' | 'checklist_compra' | 'relatorios' | 'configuracoes' | 'nota_fiscal' | 'vasilhames' | 'dashboard' | 'fabricantes' | 'historico' | 'gtin'>('inicio');
  const [configSubTab, setConfigSubTab] = useState<'fabricantes' | 'gtin' | 'vasilhames' | 'administracao'>('fabricantes');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminConfirmCode, setAdminConfirmCode] = useState('');
  const [productsLocationFilter, setProductsLocationFilter] = useState<'todos' | 'loja' | 'deposito'>('todos');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'todos' | 'entrada' | 'saida' | 'transferencia'>('todos');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    const saved = localStorage.getItem('bv_purchase_orders');
    return saved ? safeJsonParse(saved, []) : [];
  });
  const [purchaseChecklistResetToken, setPurchaseChecklistResetToken] = useState(0);
  const [checklistCompletedTasks, setChecklistCompletedTasks] = useState<{ [id: string]: boolean }>({});
  const [expandedCategories, setExpandedCategories] = useState<{ [categoryName: string]: boolean }>({});
  const [expandedBrands, setExpandedBrands] = useState<{ [brandName: string]: boolean }>({});
  const [designConfig, setDesignConfig] = useState({
    showHeader: true,
    showFooter: true,
    showLogo: true,
    showStatsCards: true,
    showAutomationsFooterBox: true,
    showQuickActions: true,
    showCharts: false,
    colorBgPage: "#F1F5F9",
    colorBgCard: "#FFFFFF",
    colorBgCardSubtle: "#F8FAFC",
    colorBorder: "#CBD5E1",
    colorTextTitle: "#0F172A",
    colorTextMain: "#1E293B",
    colorTextMuted: "#059669",
    colorNavbar: "#FFFFFF",
    colorFooter: "#F1F5F9",
    colorButtons: "#10B981",
    colorButtonsText: "#FFFFFF",
    colorAccent: "#10B981",
    colorLogo: "#10B981",
    fontFamily: "sans", // 'sans', 'serif', 'mono'
    titleFontSize: "lg", // 'sm', 'md', 'lg', 'xl', '2xl'
    bodyFontSize: "sm", // 'xs', 'sm', 'md', 'lg'
    titleFontWeight: "black", // 'normal', 'semibold', 'bold', 'black'
    borderRadius: "xl", // 'none', 'sm', 'md', 'lg', 'xl', '2xl'
    shadowStyle: "glow", // 'none', 'sm', 'md', 'lg', 'xl', 'glow'
    glowColor: "#10B981",
    glowOpacity: 0.15,
    gradientStyle: false
  });

  const [showDesignCustomizer, setShowDesignCustomizer] = useState(false);
  const [customizerTab, setCustomizerTab] = useState<'layout' | 'colors' | 'font'>('layout');

  const [currentTheme, setCurrentTheme] = useState<'cyber-obsidian' | 'cosmic-ai' | 'dark-pro' | 'personalizado'>('dark-pro');

  // Expiration sound alert settings
  const [useAudioAlert, setUseAudioAlert] = useState<boolean>(() => {
    const s = localStorage.getItem('bv_audio_alert_enabled');
    return s === null ? true : s === 'true';
  });

  const [audioAlertInterval, setAudioAlertInterval] = useState<'1_dia' | '15_dias' | 'agendado_nextel'>(() => {
    const s = localStorage.getItem('bv_audio_alert_interval');
    return (s as '1_dia' | '15_dias' | 'agendado_nextel') || 'agendado_nextel';
  });

  const [audioAlertThresholdDays, setAudioAlertThresholdDays] = useState<number>(() => {
    const s = localStorage.getItem('bv_audio_alert_threshold');
    return s ? parseInt(s, 10) : 45;
  });

  const isCosmic = false;
  const isDarkPro = true;
  const isCustom = false;
  
  const themeStyles = {
    bgPage: isCustom 
      ? 'bg-[var(--custom-bg-page)] text-[var(--custom-text-main)] transition-colors duration-300' 
      : isDarkPro 
        ? 'bg-[#F1F5F9] text-[#0F172A] transition-colors duration-500' 
        : isCosmic 
          ? 'bg-[#F4FAF7] text-[#0B1F15] transition-colors duration-500' 
          : 'bg-[#F1F5F9] text-[#0F172A] transition-colors duration-500',
    bgCard: isCustom
      ? 'bg-[var(--custom-bg-card)] border-[var(--custom-border)]/80 shadow-none text-[var(--custom-text-main)] transition-all duration-300'
      : isDarkPro
        ? 'bg-[#FFFFFF] border-[#CBD5E1] border shadow-none text-[#0F172A]'
        : isCosmic 
          ? 'bg-[#FFFFFF] border-[#D1E7DD] shadow-none text-[#0B1F15]' 
          : 'bg-[#FFFFFF] border-[#CBD5E1] border shadow-none text-[#0F172A]',
    bgCardSubtle: isCustom
      ? 'bg-[var(--custom-bg-card-subtle)] border-[var(--custom-border)]/50'
      : isDarkPro
        ? 'bg-[#F8FAFC] border-[#E2E8F0] border'
        : isCosmic 
          ? 'bg-[#E6F5EC] border-[#D1E7DD]' 
          : 'bg-[#F8FAFC] border-[#E2E8F0] border',
    
    borderAccent: isCustom
      ? 'border-[var(--custom-accent)]/30'
      : isDarkPro
        ? 'border-[#10B981]/40'
        : isCosmic 
          ? 'border-[#059669]/20' 
          : 'border-[#10B981]/40',
    borderAccentSolid: isCustom
      ? 'border-[var(--custom-accent)]'
      : isDarkPro
        ? 'border-[#10B981]'
        : isCosmic 
          ? 'border-[#059669]' 
          : 'border-[#10B981]',
    textAccent: isCustom
      ? 'text-[var(--custom-accent)] font-semibold'
      : isDarkPro
        ? 'text-[#059669] font-black'
        : isCosmic 
          ? 'text-[#059669] font-bold' 
          : 'text-[#059669] font-black',
    textAccentBright: isCustom
      ? 'text-[var(--custom-accent)] font-bold'
      : isDarkPro
        ? 'text-[#047857] font-black'
        : isCosmic 
          ? 'text-[#047857] font-bold' 
          : 'text-[#047857] font-black',
    bgAccentLight: isCustom
      ? 'bg-[var(--custom-accent)]/10 text-[var(--custom-accent)]'
      : isDarkPro
        ? 'bg-[#E6F4EA] text-[#059669]'
        : isCosmic 
          ? 'bg-[#E6F5EC] text-[#059669]' 
          : 'bg-[#E6F4EA] text-[#059669]',
    bgAccentHover: isCustom
      ? 'hover:bg-[var(--custom-bg-card-subtle)] text-[var(--custom-text-title)] border-[var(--custom-border)]/75'
      : isDarkPro
        ? 'hover:bg-[#F1F5F9] text-[#0F172A]'
        : isCosmic 
          ? 'hover:bg-[#E6F5EC]/70 text-[#059669] border-[#D1E7DD]' 
          : 'hover:bg-[#F1F5F9] text-[#0F172A]',
    
    headerLine: isCustom
      ? 'bg-gradient-to-r from-[var(--custom-accent)] via-[var(--custom-navbar)] to-[var(--custom-accent)]'
      : isDarkPro
        ? 'bg-[#10B981]'
        : isCosmic 
          ? 'bg-gradient-to-r from-[#059669] via-[#E6F5EC] to-[#059669]' 
          : 'bg-[#10B981]',
    logoBlock: isCustom
      ? 'bg-gradient-to-tr from-[var(--custom-logo)] to-[var(--custom-accent)] text-[var(--custom-buttons-text)] font-semibold font-mono'
      : isDarkPro
        ? 'bg-[#059669] text-white shadow-sm font-black'
        : isCosmic 
          ? 'bg-[#059669] text-white shadow-[0_3px_10px_rgba(5,150,105,0.25)] font-black' 
          : 'bg-[#059669] text-white shadow-sm font-black',
    primaryButton: isCustom
      ? 'bg-[var(--custom-buttons)] hover:scale-[1.02] active:scale-98 text-[var(--custom-buttons-text)] font-bold transition-all'
      : isDarkPro
        ? 'bg-[#10B981] hover:bg-[#059669] active:scale-98 text-white font-black shadow-[0_4px_12px_rgba(16,185,129,0.15)] transition-all'
        : isCosmic 
          ? 'bg-[#059669] hover:bg-[#047857] active:scale-98 text-white font-bold shadow-md transition-all' 
          : 'bg-[#10B981] hover:bg-[#059669] active:scale-98 text-white font-black shadow-[0_4px_12px_rgba(16,185,129,0.15)] transition-all',
    pulseGlow: isCustom
      ? 'shadow-[0_0_15px_rgba(0,191,255,0.1)] border-[var(--custom-accent)]/45'
      : isDarkPro
        ? 'shadow-xs border-[#10B981]/45'
        : isCosmic 
          ? 'border-[#D1E7DD] shadow-sm' 
          : 'shadow-xs border-[#10B981]/45',
    
    // Extra dynamic styles for minimalist tables / categories / forms
    textTitle: isCustom ? 'text-[var(--custom-text-title)] font-bold' : isDarkPro ? 'text-[#0F172A] font-black' : isCosmic ? 'text-[#042F1A] font-extrabold' : 'text-[#0F172A] font-black',
    textMain: isCustom ? 'text-[var(--custom-text-main)]' : isDarkPro ? 'text-[#1E293B]' : isCosmic ? 'text-[#0B1F15]' : 'text-[#1E293B]',
    textMuted: isCustom ? 'text-[var(--custom-text-muted)] font-medium' : isDarkPro ? 'text-[#059669] font-black' : isCosmic ? 'text-[#0B5B33] font-medium' : 'text-[#059669] font-black',
    textMutedDark: isCustom ? 'text-[var(--custom-border)]' : isDarkPro ? 'text-[#64748B]' : isCosmic ? 'text-[#A3D9C9]' : 'text-[#64748B]',
    inputBg: isCustom
      ? 'bg-[var(--custom-bg-card-subtle)] border-[var(--custom-border)] text-[var(--custom-text-main)] focus:border-[var(--custom-accent)] focus:ring-[var(--custom-accent)]/10'
      : isDarkPro
        ? 'bg-[#FFFFFF] border-[#CBD5E1] text-[#0F172A] focus:border-[#10B981] focus:ring-[#10B981]/15'
        : isCosmic 
          ? 'bg-white border-[#D1E7DD] text-[#0B1F15] focus:border-[#059669] focus:ring-[#059669]/15' 
          : 'bg-[#FFFFFF] border-[#CBD5E1] text-[#0F172A] focus:border-[#10B981] focus:ring-[#10B981]/15',
    badgeOk: isCustom
      ? 'bg-[var(--custom-accent)]/10 text-[var(--custom-accent)] border border-[var(--custom-accent)]/30 font-semibold'
      : isDarkPro
        ? 'bg-[#E6F4EA] text-[#059669] border border-[#A7F3D0] font-black'
        : isCosmic 
          ? 'bg-[#E6F5EC] text-[#059669] border border-[#D1E7DD]/50 font-semibold' 
          : 'bg-[#E6F4EA] text-[#059669] border border-[#A7F3D0] font-black',
    badgeExpired: isCustom
      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/35 font-semibold'
      : isDarkPro
        ? 'bg-rose-50 text-rose-700 border border-rose-200 font-black'
        : isCosmic 
          ? 'bg-rose-50 text-rose-700 border border-rose-250 font-semibold' 
          : 'bg-rose-50 text-rose-700 border border-rose-200 font-black',
    badgeCritical: isCustom
      ? 'bg-amber-500/15 text-rose-400 border border-[#10B981]/30 font-semibold'
      : isDarkPro
        ? 'bg-amber-50 text-amber-800 border border-amber-250 font-black'
        : isCosmic 
          ? 'bg-amber-50 text-amber-800 border border-amber-300 font-semibold' 
          : 'bg-amber-50 text-amber-800 border border-amber-250 font-black',
    cardLover: isCustom ? 'hover:bg-[var(--custom-bg-card-subtle)]/85' : isDarkPro ? 'hover:bg-[#F8FAFC]' : isCosmic ? 'hover:bg-[#E6F5EC]/45' : 'hover:bg-[#F8FAFC]',
  };

  const [gtinHistory, setGtinHistory] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [inventoryGrouping, setInventoryGrouping] = useState<'categoria' | 'fabricante'>('categoria');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'todos' | 'vencidos' | 'criticos' | 'ok'>('todos');
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // Modals Toggles & Active Entries
  const [showScanner, setShowScanner] = useState(false);
  const [scanActionMode, setScanActionMode] = useState<'entrada' | 'saida' | 'consulta'>('consulta');
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<Product | null>(null);
  const [showProductDetailsModal, setShowProductDetailsModal] = useState(false);
  const [isEditingBarcode, setIsEditingBarcode] = useState(false);
  const [tempBarcode, setTempBarcode] = useState('');
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [tempCategory, setTempCategory] = useState('');
  const [tempSubcategory, setTempSubcategory] = useState('');
  const [isEditingBrand, setIsEditingBrand] = useState(false);
  const [tempBrand, setTempBrand] = useState('');
  const [isEditingPackaging, setIsEditingPackaging] = useState(false);
  const [tempPackaging, setTempPackaging] = useState('');
  const [editingBatchDateId, setEditingBatchDateId] = useState<string | null>(null);
  const [tempBatchEditDate, setTempBatchEditDate] = useState<string>('');
  const [showAddNewBatchForm, setShowAddNewBatchForm] = useState(false);
  const [newBatchFormDate, setNewBatchFormDate] = useState('');
  const [newBatchFormQty, setNewBatchFormQty] = useState('10');
  const [newBatchFormId, setNewBatchFormId] = useState('');
  const [scannedExistingAlert, setScannedExistingAlert] = useState<{ name: string; barcode: string; mode: string } | null>(null);
  // Modal imediato de opções (Entrada ou Saída) ao escanear produto já cadastrado
  const [scannedRegisteredProduct, setScannedRegisteredProduct] = useState<Product | null>(null);
  // Notificação de leitura e preenchimento automático para produtos ainda não cadastrados
  const [autoFillNotification, setAutoFillNotification] = useState<{
    barcode: string;
    status: 'searching' | 'found' | 'notFound';
    productName?: string;
  } | null>(null);
  const [productSavedSuccess, setProductSavedSuccess] = useState<Product | null>(null);
  const [duplicateRejectionModal, setDuplicateRejectionModal] = useState<{
    type: 'barcode' | 'name';
    existingProduct: Product;
    title: string;
    fieldLabel: string;
    conflictValue: string;
    reason: string;
    detailedReason: string;
    suggestion: string;
  } | null>(null);
  const [rejectionModalPackaging, setRejectionModalPackaging] = useState('unidade');
  const [rejectionModalIncludeBatch, setRejectionModalIncludeBatch] = useState(true);
  const [addFormIncludeBatchOnPackagingUpdate, setAddFormIncludeBatchOnPackagingUpdate] = useState(true);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isSearchingNetwork, setIsSearchingNetwork] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    mode: 'single' | 'bulk' | 'category';
    title: string;
    description: string;
    products: Product[];
    categoryName?: string;
  } | null>(null);
  const [isDeletingProducts, setIsDeletingProducts] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);
  const [isSelectionModeProdutos, setIsSelectionModeProdutos] = useState(false);
  const [selectedProdutoIdsToDelete, setSelectedProdutoIdsToDelete] = useState<string[]>([]);
  const [categoryEditProduct, setCategoryEditProduct] = useState<Product | null>(null);
  const [modalEditCategory, setModalEditCategory] = useState('');
  const [modalEditSubcategory, setModalEditSubcategory] = useState('');
  const [modalNewCategoryInput, setModalNewCategoryInput] = useState('');
  const [modalNewSubcategoryInput, setModalNewSubcategoryInput] = useState('');
  const [isCreatingCatInModal, setIsCreatingCatInModal] = useState(false);
  const [isCreatingSubInModal, setIsCreatingSubInModal] = useState(false);
  const [isSavingCategoryEdit, setIsSavingCategoryEdit] = useState(false);
  const [categorySuccessMessage, setCategorySuccessMessage] = useState<string | null>(null);
  const [showGlobalSaidaModal, setShowGlobalSaidaModal] = useState(false);
  const [globalSaidaSearch, setGlobalSaidaSearch] = useState('');
  const [showAllInSaida, setShowAllInSaida] = useState(false);
  const [showGlobalEntradaModal, setShowGlobalEntradaModal] = useState(false);
  const [globalEntradaSearch, setGlobalEntradaSearch] = useState('');
  const [showAllInEntrada, setShowAllInEntrada] = useState(false);
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [showManageCategoriesModal, setShowManageCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState<{ [catId: string]: string }>({});
  const [showMovementModal, setShowMovementModal] = useState(false);
  
  // On the fly category creation inside the Add Product modal
  const [isCreatingCategoryOnTheFly, setIsCreatingCategoryOnTheFly] = useState(false);
  const [onTheFlyCategoryName, setOnTheFlyCategoryName] = useState('');
  const [onTheFlySubcategoryName, setOnTheFlySubcategoryName] = useState('');

  // Export reports modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSelectedCategoryName, setExportSelectedCategoryName] = useState('all');
  const [exportSelectedSubcategoryName, setExportSelectedSubcategoryName] = useState('all');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappPreamble, setWhatsappPreamble] = useState('Olá! Segue o balanço e relatório de estoque de hoje:');
  const [showPWAHelpModal, setShowPWAHelpModal] = useState(false);
  const [showAdminTools, setShowAdminTools] = useState(false);
  const [movementType, setMovementType] = useState<'entrada' | 'saida' | 'transferencia'>('entrada');
  const [transferDestination, setTransferDestination] = useState<'anexo' | 'loja' | '3019' | ''>('');
  const [moveSourceSector, setMoveSourceSector] = useState<'deposito' | 'loja' | 'anexo' | '3019'>('deposito');
  const [selectedProductForMovement, setSelectedProductForMovement] = useState<Product | null>(null);

  // Forms Fields state
  // New Product
  const [newProdName, setNewProdName] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdCategory, setNewProdCategory] = useState(INITIAL_CATEGORIES[0].name);
  const [newProdSubcategory, setNewProdSubcategory] = useState(INITIAL_CATEGORIES[0].subcategories[0]);
  const [newProdMinStock, setNewProdMinStock] = useState('10');
  const [newProdPackaging, setNewProdPackaging] = useState('unidade');
  const [newProdDescription, setNewProdDescription] = useState('');
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdWeightVolume, setNewProdWeightVolume] = useState('');
  const [newProdImage, setNewProdImage] = useState('');
  // New Product initial Batch
  const [newProdBatchId, setNewProdBatchId] = useState('');
  const [newProdBatchDate, setNewProdBatchDate] = useState('');
  const [newProdBatchQty, setNewProdBatchQty] = useState('10');

  // Movement Form
  const [moveQuantity, setMoveQuantity] = useState('5');
  const [moveBatchId, setMoveBatchId] = useState('');
  const [moveBatchDate, setMoveBatchDate] = useState('');
  const [moveOperatorName, setMoveOperatorName] = useState('');
  const [isNewBatchForEntrada, setIsNewBatchForEntrada] = useState(true);
  const [newProdNfPhoto, setNewProdNfPhoto] = useState('');
  const [moveNfPhoto, setMoveNfPhoto] = useState('');
  const [selectedNfPhotoForZoom, setSelectedNfPhotoForZoom] = useState<string | null>(null);
  const [isAddingNewSubcategory, setIsAddingNewSubcategory] = useState(false);
  const [newSubcategoryInputValue, setNewSubcategoryInputValue] = useState('');

  // Verificação em tempo real de duplicidade ao cadastrar produto:
  // Se o item já estiver cadastrado (por código de barras ou por nome), não aceita novo cadastramento e informa o motivo
  const duplicateConflict = useMemo(() => {
    const trimmedBarcode = newProdBarcode ? newProdBarcode.trim() : '';
    const trimmedName = newProdName ? newProdName.trim() : '';
    const trimmedBrand = newProdBrand ? newProdBrand.trim() : '';

    // 1. Verificação por Código de Barras (se informado pelo usuário)
    if (trimmedBarcode) {
      const existingByBarcode = products.find(p => p.barcode && p.barcode.trim().toLowerCase() === trimmedBarcode.toLowerCase());
      if (existingByBarcode) {
        const isPackagingDifferent = (newProdPackaging || 'unidade').trim().toLowerCase() !== (existingByBarcode.packaging || 'unidade').trim().toLowerCase();
        return {
          type: 'barcode' as const,
          existingProduct: existingByBarcode,
          title: 'Código de Barras Já Cadastrado',
          fieldLabel: 'Código de Barras (EAN)',
          conflictValue: trimmedBarcode,
          reason: `O código de barras "${trimmedBarcode}" já pertence ao produto "${existingByBarcode.name}" (Categoria: ${existingByBarcode.category}).`,
          detailedReason: `Não é aceito um novo cadastramento com este código de barras, pois ele já está vinculado a um item ativo no sistema ("${existingByBarcode.name}"). Para garantir a integridade dos dados e o funcionamento correto dos leitores de código de barras, cada código deve ser único.`,
          suggestion: `Você pode alterar a embalagem do produto existente para "${newProdPackaging || 'unidade'}", dar entrada de lote ou consultar sua ficha técnica.`,
          isPackagingDifferent,
          newPackaging: newProdPackaging || 'unidade'
        };
      }
    }

    // 2. Verificação por Nome do Produto (+ Marca se especificada)
    if (trimmedName) {
      const normNewName = normalizeTextForSearch(trimmedName);
      const normNewBrand = normalizeTextForSearch(trimmedBrand);

      const existingByName = products.find(p => {
        const normName = normalizeTextForSearch(p.name);
        if (normName !== normNewName) return false;
        
        const normBrand = normalizeTextForSearch(p.brand || '');
        if (normNewBrand && normBrand) {
          return normBrand === normNewBrand;
        }
        return true;
      });

      if (existingByName) {
        const isPackagingDifferent = (newProdPackaging || 'unidade').trim().toLowerCase() !== (existingByName.packaging || 'unidade').trim().toLowerCase();
        return {
          type: 'name' as const,
          existingProduct: existingByName,
          title: 'Produto com Este Nome Já Cadastrado',
          fieldLabel: 'Nome do Produto',
          conflictValue: existingByName.name,
          reason: `Já existe um produto cadastrado com o nome "${existingByName.name}"${existingByName.brand ? ` (Marca: ${existingByName.brand})` : ''} na categoria "${existingByName.category}".`,
          detailedReason: `Não é aceito duplicar o cadastro de um produto existente ("${existingByName.name}"). Cadastrar o mesmo produto duas vezes fragmenta o saldo de estoque, compromete o histórico de movimentações e gera inconsistências no inventário.`,
          suggestion: `Você pode alterar a embalagem deste produto para "${newProdPackaging || 'unidade'}", cadastrar como variação ou registrar novas entradas.`,
          isPackagingDifferent,
          newPackaging: newProdPackaging || 'unidade'
        };
      }
    }

    return null;
  }, [newProdBarcode, newProdName, newProdBrand, newProdPackaging, products]);

  // Sincroniza o valor de embalagem do modal de rejeição/duplicidade quando o usuário digita na tela de cadastro
  useEffect(() => {
    if (newProdPackaging) {
      setRejectionModalPackaging(newProdPackaging);
    }
  }, [newProdPackaging]);

  // Referência para evitar buscar o mesmo código repetidamente em loops infinitos
  const lastAttemptedBarcodeRef = useRef<string>('');

  // Autocomplete automático ao colar ou digitar códigos de barras (EAN-13, EAN-8, UPC, ITF-14)
  useEffect(() => {
    const clean = newProdBarcode.trim();
    if (clean.length >= 8 && clean.length <= 14 && /^\d+$/.test(clean)) {
      if (lastAttemptedBarcodeRef.current === clean) {
        return; // Já buscou ou está buscando esse código nesta sessão
      }
      // Verifica se o produto já existe localmente
      const isExisting = products.some(p => p.barcode === clean);
      if (!isExisting && !isSearchingNetwork) {
        const timer = setTimeout(() => {
          if (lastAttemptedBarcodeRef.current === clean) return;
          lastAttemptedBarcodeRef.current = clean;
          fetchProductFromNetwork(clean);
        }, 600);
        return () => clearTimeout(timer);
      }
    } else {
      // Limpa a trava se o usuário limpar
      if (clean === '') {
        lastAttemptedBarcodeRef.current = '';
      }
    }
  }, [newProdBarcode]);

  const handleCloseAddProductModal = () => {
    setNewProdName('');
    setNewProdBarcode('');
    setNewProdDescription('');
    setNewProdBrand('');
    setNewProdWeightVolume('');
    setNewProdImage('');
    setNewProdNfPhoto('');
    setNewProdBatchId('');
    setNewProdBatchDate('');
    setNewProdBatchQty('10');
    setDuplicateRejectionModal(null);
    setAutoFillNotification(null);
    setShowAddProductModal(false);
  };

  // Auto-dismiss product saved success notification after 10s
  useEffect(() => {
    if (productSavedSuccess) {
      const timer = setTimeout(() => {
        setProductSavedSuccess(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [productSavedSuccess]);

  useEffect(() => {
    if (deleteSuccessMessage) {
      const timer = setTimeout(() => {
        setDeleteSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [deleteSuccessMessage]);

  useEffect(() => {
    if (categorySuccessMessage) {
      const timer = setTimeout(() => {
        setCategorySuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [categorySuccessMessage]);

  // 1. Listen to Firebase Auth state changing
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      if (user) {
        setUsingFirebase(true);
        setMoveOperatorName(user.displayName || '');
      } else {
        setUsingFirebase(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch and real-time sync with database/localstorage
  useEffect(() => {
    if (authLoading) return;

    const loadLocalStorageBackup = () => {
      console.log('Loading local backup data due to Firestore sync block/error...');
      const localProducts = localStorage.getItem('bv_products');
      const localTxs = localStorage.getItem('bv_transactions');
      const localCats = localStorage.getItem('bv_categories');
      const hasReset = localStorage.getItem('bv_was_reset') === 'true';

      if (localProducts) {
        setProducts(sortProductsAlphabetically(safeJsonParse(localProducts, [])));
      } else {
        const initProds = hasReset ? [] : INITIAL_PRODUCTS;
        setProducts(sortProductsAlphabetically(initProds));
      }

      if (localTxs) {
        const parsedTxs: Transaction[] = safeJsonParse(localTxs, []);
        parsedTxs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTransactions(parsedTxs);
      } else {
        const initTxs = hasReset ? [] : [...INITIAL_TRANSACTIONS].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTransactions(initTxs);
      }

      if (localCats) {
        const parsedCats: Category[] = safeJsonParse(localCats, INITIAL_CATEGORIES);
        setCategories(
          Array.isArray(parsedCats)
            ? parsedCats.map(c => ({ ...c, subcategories: Array.isArray(c.subcategories) ? c.subcategories : [] }))
            : INITIAL_CATEGORIES
        );
      } else {
        const initCats = hasReset ? [] : INITIAL_CATEGORIES;
        setCategories(initCats);
      }

      const localGtinHistory = localStorage.getItem('bv_historico_gtin');
      if (localGtinHistory) {
        setGtinHistory(safeJsonParse(localGtinHistory, []));
      } else {
        setGtinHistory([]);
      }

      const localPurchaseOrders = localStorage.getItem('bv_purchase_orders');
      if (localPurchaseOrders) {
        const parsedOrders: PurchaseOrder[] = safeJsonParse(localPurchaseOrders, []);
        parsedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setPurchaseOrders(parsedOrders);
      }
    };

    if (currentUser) {
      // Connect to secure Firestore snapshot listeners
      console.log('Syncing in real-time with Firestore...');
      setFirebaseSyncError(null);
      
      const handleSyncError = (err: any, source: string) => {
        console.warn(`Firestore sync blocked/failed for ${source}:`, err);
        setFirebaseSyncError("A sincronização em nuvem está operando em Modo de Contingência Local (comum ao usar Opera, Brave ou bloqueador de anúncios que restringem conexões do Firebase). Seus dados estão salvos localmente em segurança!");
        setUsingFirebase(false);
        loadLocalStorageBackup();
      };

      const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
        if (snapshot.empty) {
          // If Firestore is empty, check if we had reset intentionally
          const hasReset = localStorage.getItem('bv_was_reset') === 'true';
          if (hasReset) {
            setProducts([]);
            localStorage.setItem('bv_products', safeJsonStringify([]));
          } else {
            // If Firestore is empty, auto-seed with initial data
            seedInitialFirestoreData();
          }
        } else {
          const prods: Product[] = [];
          snapshot.forEach((d) => {
            const p = d.data() as Product;
            if (pendingDeletedIdsRef.current.has(p.id)) {
              return;
            }
            // Preserva o estado local otimista se houver um ajuste rápido em andamento para este item
            if (pendingAdjustmentsRef.current[p.id]) {
              prods.push(pendingAdjustmentsRef.current[p.id].latestProduct);
            } else {
              prods.push(p);
            }
          });
          const sortedProds = sortProductsAlphabetically(prods);
          setProducts(sortedProds);
          localStorage.setItem('bv_products', safeJsonStringify(sortedProds));
          setUsingFirebase(true);
        }
      }, (err) => {
        handleSyncError(err, 'products');
      });

      const unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
        const txs: Transaction[] = [];
        const seenIds = new Set<string>();
        snapshot.forEach((d) => {
          const tx = d.data() as Transaction;
          txs.push(tx);
          seenIds.add(tx.id);
        });
        // Preserva transações otimistas pendentes em voo para evitar oscilação de saldo
        Object.values(pendingAdjustmentsRef.current).forEach((pending) => {
          pending.txs.forEach((pTx) => {
            if (!seenIds.has(pTx.id)) {
              txs.push(pTx);
              seenIds.add(pTx.id);
            }
          });
        });
        // Sort transactions desc by timestamp
        txs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTransactions(txs);
        localStorage.setItem('bv_transactions', safeJsonStringify(txs));
      }, (err) => {
        handleSyncError(err, 'transactions');
      });

      const unsubCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
        if (!snapshot.empty) {
          const cats: Category[] = [];
          snapshot.forEach((d) => {
            const raw = d.data() as Category;
            cats.push({
              ...raw,
              subcategories: Array.isArray(raw.subcategories) ? raw.subcategories : []
            });
          });
          setCategories(cats);
          localStorage.setItem('bv_categories', safeJsonStringify(cats));
        } else {
          const hasReset = localStorage.getItem('bv_was_reset') === 'true';
          if (hasReset) {
            setCategories([]);
            localStorage.setItem('bv_categories', safeJsonStringify([]));
          }
        }
      }, (err) => {
        handleSyncError(err, 'categories');
      });

      const unsubGtinLogs = onSnapshot(collection(db, 'historico_gtin'), (snapshot) => {
        const logs: any[] = [];
        snapshot.forEach((d) => logs.push(d.data()));
        logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setGtinHistory(logs);
        localStorage.setItem('bv_historico_gtin', safeJsonStringify(logs));
      }, (err) => {
        console.warn("Firestore Error historico_gtin subscriber: ", err);
      });

      const unsubPurchaseOrders = onSnapshot(collection(db, 'purchase_orders'), (snapshot) => {
        const orders: PurchaseOrder[] = [];
        snapshot.forEach((d) => orders.push(d.data() as PurchaseOrder));
        orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setPurchaseOrders(orders);
        localStorage.setItem('bv_purchase_orders', safeJsonStringify(orders));
      }, (err) => {
        console.warn("Firestore Error purchase_orders subscriber: ", err);
      });

      return () => {
        unsubProducts();
        unsubTransactions();
        unsubCategories();
        unsubGtinLogs();
        unsubPurchaseOrders();
      };
    } else {
      // Fetch or initialize with LocalStorage fallback
      console.log('Loading local fallback data...');
      setFirebaseSyncError(null);
      loadLocalStorageBackup();
    }
  }, [currentUser, authLoading]);

  // Seeding engine to make user's experience instantly complete
  const seedInitialFirestoreData = async () => {
    setIsSeeding(true);
    try {
      console.log('Seeding initial collections to Firestore...');
      const batch = writeBatch(db);

      // Seed categories
      INITIAL_CATEGORIES.forEach((cat) => {
        const docRef = doc(db, 'categories', cat.id);
        batch.set(docRef, cat);
      });

      // Seed products
      INITIAL_PRODUCTS.forEach((prod) => {
        const docRef = doc(db, 'products', prod.id);
        batch.set(docRef, prod);
      });

      // Seed transactions
      INITIAL_TRANSACTIONS.forEach((tx) => {
        const docRef = doc(db, 'transactions', tx.id);
        batch.set(docRef, tx);
      });

      await batch.commit();
      console.log('Successfully seeded database!');
    } catch (err) {
      console.error('Error seeding data: ', err);
    } finally {
      setIsSeeding(false);
    }
  };

  // 3. Authentication flows
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e: any) {
      console.error('Sign in failed: ', e);
      const msg = e?.message || String(e);
      const isPartitioned = msg.includes('missing initial state') || msg.includes('sessionStorage') || msg.includes('storage') || msg.includes('cookie') || msg.includes('iframe') || msg.includes('start-fail');
      
      if (isPartitioned || window.self !== window.top) {
        setAuthError(
          "O navegador Opera (ou outro com bloqueio de cookies) impediu o login dentro do iframe de testes do AI Studio. Para resolver isso, abra o aplicativo em uma nova aba clicando em 'Abrir em Nova Aba' no alerta vermelho exibido no topo do painel."
        );
      } else {
        setAuthError(
          `Erro de autenticação Google: ${msg}. Certifique-se de permitir pop-ups e cookies nas configurações.`
        );
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Sign out failed: ', e);
    }
  };

  // Helper date calculation relative to static anchor 24th of May 2026
  const getDaysRemaining = (dateStr: string) => {
    if (!dateStr || !dateStr.trim()) return 9999;
    const targetDate = new Date(dateStr);
    if (isNaN(targetDate.getTime())) return 9999;
    const anchorDate = new Date(ANCHOR_DATE_STR);
    const diffTime = targetDate.getTime() - anchorDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Helper to extract clean summary of product's expiration/validade
  const getProductValidadeSummary = (prod: Product) => {
    if (!prod.batches || prod.batches.length === 0) {
      return { 
        text: 'Sem validade definida', 
        dateFormatted: 'A definir', 
        isExpired: false, 
        isCritical: false,
        hasNoDate: true 
      };
    }

    // Filter only batches that have a date set
    const datedBatches = prod.batches.filter(b => b.date && b.date.trim() !== '');
    if (datedBatches.length === 0) {
      return { 
        text: 'Sem validade definida', 
        dateFormatted: 'A definir', 
        isExpired: false, 
        isCritical: false,
        hasNoDate: true 
      };
    }

    const sortedBatches = [...datedBatches].sort((a, b) => a.date.localeCompare(b.date));
    const closest = sortedBatches[0];
    const days = getDaysRemaining(closest.date);
    const dateFormatted = closest.date.split('-').reverse().join('/');

    if (sortedBatches.length === 1) {
      if (days < 0) {
        return { 
          text: `Validade: ${dateFormatted} (VENCIDO há ${Math.abs(days)}d)`, 
          dateFormatted, 
          isExpired: true, 
          isCritical: false,
          hasNoDate: false 
        };
      }
      if (days <= 30) {
        return { 
          text: `Validade: ${dateFormatted} (Vence em ${days}d)`, 
          dateFormatted, 
          isExpired: false, 
          isCritical: true,
          hasNoDate: false 
        };
      }
      return { 
        text: `Validade: ${dateFormatted}`, 
        dateFormatted, 
        isExpired: false, 
        isCritical: false,
        hasNoDate: false 
      };
    }

    // Multiple batches
    if (days < 0) {
      return { 
        text: `Validade: ${dateFormatted} (VENCIDO • ${sortedBatches.length} lotes)`, 
        dateFormatted, 
        isExpired: true, 
        isCritical: false,
        hasNoDate: false 
      };
    }
    if (days <= 30) {
      return { 
        text: `Validade: ${dateFormatted} (Vence em ${days}d • ${sortedBatches.length} lotes)`, 
        dateFormatted, 
        isExpired: false, 
        isCritical: true,
        hasNoDate: false 
      };
    }
    return { 
      text: `Validade: ${dateFormatted} (${sortedBatches.length} lotes)`, 
      dateFormatted, 
      isExpired: false, 
      isCritical: false,
      hasNoDate: false 
    };
  };

  // Helper inside reactive loop to assign bright, vivid, distinctive colors to subcategories
  const getSubcategoryBadgeClass = (subcat: string) => {
    return 'bg-black text-white border border-neutral-800 font-bold';
  };

  const getCategoryBadgeClass = (category: string) => {
    const c = category ? category.toLowerCase() : '';
    if (isCosmic) {
      if (c.includes('alimento')) {
        return 'bg-amber-100 text-amber-800 border border-amber-200/60';
      }
      if (c.includes('bebida')) {
        return 'bg-sky-100 text-sky-800 border border-sky-200/60';
      }
      if (c.includes('limpeza')) {
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200/60';
      }
      if (c.includes('frio') || c.includes('congelado')) {
        return 'bg-rose-100 text-rose-800 border border-rose-200/60';
      }
      return 'bg-slate-100 text-slate-700 border border-slate-200';
    } else {
      if (c.includes('alimento')) {
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      }
      if (c.includes('bebida')) {
        return 'bg-[#3b82f6]/10 text-[#60a5fa] border border-[#3b82f6]/20';
      }
      if (c.includes('limpeza')) {
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      }
      if (c.includes('frio') || c.includes('congelado')) {
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      }
      return 'bg-slate-800 text-slate-300 border border-slate-700';
    }
  };

  // Crisp warning beep using Web Audio API
  const playBeep = (double = false) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playOne = (timeOffset: number) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + timeOffset); // 880Hz warning pitch
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime + timeOffset);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(audioCtx.currentTime + timeOffset);
        oscillator.stop(audioCtx.currentTime + timeOffset + 0.12);
      };
      
      playOne(0);
      if (double) {
        playOne(0.24);
        setTimeout(() => {
          audioCtx.close().catch(() => {});
        }, 500);
      } else {
        setTimeout(() => {
          audioCtx.close().catch(() => {});
        }, 200);
      }
    } catch (e) {
      console.warn('Audio feedback blocked or failed:', e);
    }
  };

  // Sound sequence for "Apito Sonoro" (Nextel PTT Chirp style)
  const playApitoSonoro = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const playChirpAt = (timeOffset: number, pitch = 1680, length = 0.035, isLast = false) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        // We use 'sine' or 'triangle' for the iconic high-pitch nextel PTT tone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(pitch, audioCtx.currentTime + timeOffset);
        
        // Quick subtle pitch ramp down at the end of each chirp for a more natural click sound
        osc.frequency.exponentialRampToValueAtTime(pitch * 0.95, audioCtx.currentTime + timeOffset + length);
        
        // snappiest electronic gate
        gain.gain.setValueAtTime(0, audioCtx.currentTime + timeOffset);
        gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + timeOffset + 0.003); // ultra-fast attack
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime + timeOffset + length - 0.005);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + timeOffset + length); // fast decay to zero clicks
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(audioCtx.currentTime + timeOffset);
        osc.stop(audioCtx.currentTime + timeOffset + length);
      };

      // Perfect Nextel PTT tone: 3 ultra brief chirps followed by a slightly longer sustained beep
      const chirpDuration = 0.04;
      const spacing = 0.06; // very dense
      
      playChirpAt(0, 1650, chirpDuration);
      playChirpAt(spacing, 1650, chirpDuration);
      playChirpAt(spacing * 2, 1650, chirpDuration);
      playChirpAt(spacing * 3, 1650, 0.12, true); // final beep is longer

      setTimeout(() => {
        audioCtx.close().catch(() => {});
      }, 800);
    } catch (err) {
      console.warn("Audio Context blocked while trying to chirp:", err);
    }
  };

  // Warning milestone batches: <= audioAlertThresholdDays (default 45 days), triggered every 15 days (45, 30, 15, 0 remaining)
  const milestoneBatches = useMemo(() => {
    const alerts: { product: Product; batch: Batch; days: number }[] = [];
    products.forEach((prod) => {
      prod.batches.forEach((b) => {
        const days = getDaysRemaining(b.date);
        // Expiram em até o limite configurado (default 45 dias) com intervalo de 15 dias (45, 30, 15, 0)
        if (days >= 0 && days <= audioAlertThresholdDays) {
          if (days % 15 === 0) {
            alerts.push({ product: prod, batch: b, days });
          }
        }
      });
    });
    return alerts;
  }, [products, audioAlertThresholdDays]);

  // Core routine to compute and trigger the Nextel chirp if we're in an alert window
  const checkAndTriggerAudioAlert = (isUserInteraction = false) => {
    if (!useAudioAlert || milestoneBatches.length === 0) return false;

    const now = new Date();
    const nowMs = now.getTime();
    let shouldBeep = false;

    if (audioAlertInterval === 'agendado_nextel') {
      const scheduledHours = [8, 9, 11, 15, 16];
      const currentHour = now.getHours();
      
      if (scheduledHours.includes(currentHour)) {
        // Unique slot string, e.g. "2026-6-11-8" (representing hour 8 on June 11, 2026)
        const todaySlotKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${currentHour}`;
        const lastSlot = localStorage.getItem('bv_last_scheduled_slot');
        if (lastSlot !== todaySlotKey) {
          shouldBeep = true;
        }
      }
    } else {
      // standard time intervals (1 day or 15 days)
      const lastBeepStr = localStorage.getItem('bv_last_apito_timestamp');
      if (!lastBeepStr) {
        shouldBeep = true;
      } else {
        const lastBeep = parseInt(lastBeepStr, 10);
        const elapsedMs = nowMs - lastBeep;
        const thresholdMs = audioAlertInterval === '1_dia' ? 24 * 60 * 60 * 1000 : 15 * 24 * 60 * 60 * 1000;
        if (elapsedMs >= thresholdMs) {
          shouldBeep = true;
        }
      }
    }

    if (shouldBeep) {
      try {
        playApitoSonoro();
        
        // Persist trigger completion
        if (audioAlertInterval === 'agendado_nextel') {
          const currentHour = now.getHours();
          const todaySlotKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${currentHour}`;
          localStorage.setItem('bv_last_scheduled_slot', todaySlotKey);
        } else {
          localStorage.setItem('bv_last_apito_timestamp', nowMs.toString());
        }
        return true;
      } catch (err) {
        if (isUserInteraction) {
          console.warn("Audio Context failed to start even inside user interaction:", err);
        }
      }
    }
    return false;
  };

  // Play audio alarm on first user interaction with the application
  useEffect(() => {
    if (!useAudioAlert || milestoneBatches.length === 0) return;
    
    let active = false;
    const triggerAudioAlert = () => {
      if (active) return;
      const triggered = checkAndTriggerAudioAlert(true);
      if (triggered) {
        active = true;
        window.removeEventListener('click', triggerAudioAlert);
        window.removeEventListener('keydown', triggerAudioAlert);
        window.removeEventListener('touchstart', triggerAudioAlert);
      }
    };

    window.addEventListener('click', triggerAudioAlert);
    window.addEventListener('keydown', triggerAudioAlert);
    window.addEventListener('touchstart', triggerAudioAlert);

    // Run safe background check immediately (in case tab was loaded with pre-granted permissions)
    checkAndTriggerAudioAlert(false);

    return () => {
      window.removeEventListener('click', triggerAudioAlert);
      window.removeEventListener('keydown', triggerAudioAlert);
      window.removeEventListener('touchstart', triggerAudioAlert);
    };
  }, [milestoneBatches, useAudioAlert, audioAlertInterval]);

  // Keep a background task check every 25 seconds for tabs left open
  useEffect(() => {
    if (!useAudioAlert || milestoneBatches.length === 0) return;

    const intervalId = setInterval(() => {
      checkAndTriggerAudioAlert(false);
    }, 25000);

    return () => {
      clearInterval(intervalId);
    };
  }, [milestoneBatches, useAudioAlert, audioAlertInterval]);

  // 4. Products Statistics Analysis
  const stats = useMemo(() => {
    let totalItems = 0;
    let expiredBatchesCount = 0;
    let criticalBatchesCount = 0; // Expiram em até 30 dias
    let lowStockCount = 0;

    products.forEach((prod) => {
      let prodTotalQty = 0;
      prod.batches.forEach((b) => {
        prodTotalQty += b.quantity;
        const days = getDaysRemaining(b.date);
        if (days < 0) {
          expiredBatchesCount++;
        } else if (days <= 30) {
          criticalBatchesCount++;
        }
      });
      const activeTotal = prodTotalQty + (productSectorsSums[prod.id]?.totalTransferred || 0);
      totalItems += activeTotal;
      if (activeTotal < prod.minStock) {
        lowStockCount++;
      }
    });

    return {
      totalProductsCount: products.length,
      totalStockQty: totalItems,
      expiredCount: expiredBatchesCount,
      criticalCount: criticalBatchesCount,
      lowStockCount
    };
  }, [products, productSectorsSums]);

  // 4.1 Analytical Datasets for Interactive Animated Dashboard Widgets
  const categoryChartData = useMemo(() => {
    const counts: { [key: string]: number } = {};
    categories.forEach(c => {
      counts[c.name] = 0;
    });

    products.forEach(p => {
      const cat = p.category || 'Outros';
      const prodTotal = p.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[p.id]?.totalTransferred || 0);
      counts[cat] = (counts[cat] || 0) + prodTotal;
    });

    const list = Object.entries(counts).map(([name, value]) => ({
      name,
      value
    }));

    if (!products.length || list.every(item => item.value === 0)) {
      return [
        { name: 'Alimentos', value: 380 },
        { name: 'Bebidas', value: 250 },
        { name: 'Limpeza', value: 160 },
        { name: 'Higiene', value: 110 },
        { name: 'Frios e Laticínios', value: 95 }
      ];
    }
    return list;
  }, [products, categories, productSectorsSums]);

  const batchStatusChartData = useMemo(() => {
    let safe = 0;
    let critical = 0;
    let expired = 0;

    products.forEach(p => {
      p.batches.forEach(b => {
        const days = getDaysRemaining(b.date);
        if (days < 0) {
          expired += b.quantity;
        } else if (days <= 30) {
          critical += b.quantity;
        } else {
          safe += b.quantity;
        }
      });
    });

    const total = safe + critical + expired;
    if (total === 0) {
      return [
        { name: 'Seguros', value: 75, color: '#00BFFF' },
        { name: 'Críticos', value: 18, color: '#F59E0B' },
        { name: 'Vencidos', value: 7, color: '#EF4444' }
      ];
    }

    return [
      { name: 'Seguros', value: safe, color: isDarkPro ? '#00BFFF' : '#10B981' },
      { name: 'Críticos (<30d)', value: critical, color: '#F59E0B' },
      { name: 'Vencidos', value: expired, color: '#EF4444' }
    ].filter(item => item.value > 0);
  }, [products, isDarkPro]);

  // Handle auto-updating the subcategories list when creating a product
  useEffect(() => {
    if (categories.length === 0) return;
    const categoryObj = categories.find(c => c.name === newProdCategory);
    if (!categoryObj) {
      setNewProdCategory(categories[0].name);
      setNewProdSubcategory(categories[0].subcategories?.[0] || '');
      return;
    }
    if (categoryObj.subcategories && categoryObj.subcategories.length > 0) {
      if (!categoryObj.subcategories.includes(newProdSubcategory)) {
        setNewProdSubcategory(categoryObj.subcategories[0]);
      }
    } else {
      setNewProdSubcategory('');
    }
  }, [newProdCategory, categories]);

  // Reset subcategory filter when category filter changes
  useEffect(() => {
    if (!selectedCategory) {
      setSelectedSubcategory('');
      return;
    }
    const matchCat = categories.find(
      c => c.name.trim().toLowerCase() === selectedCategory.trim().toLowerCase()
    );
    if (
      selectedSubcategory &&
      matchCat &&
      !(matchCat.subcategories || []).some(
        s => s.trim().toLowerCase() === selectedSubcategory.trim().toLowerCase()
      )
    ) {
      setSelectedSubcategory('');
    }
  }, [selectedCategory, categories]);

  // Auto-expand category group in Estoque when selectedCategory is set
  useEffect(() => {
    if (!selectedCategory) return;
    const normSel = selectedCategory.trim().toLowerCase();
    setExpandedCategories(prev => {
      const next = { ...prev, [selectedCategory]: true };
      products.forEach(p => {
        if ((p.category || '').trim().toLowerCase() === normSel && p.category) {
          next[p.category] = true;
        }
      });
      return next;
    });
  }, [selectedCategory, products]);

  // 5. Filter & Search matching products (sempre em ordem alfabética)
  const filteredProducts = useMemo(() => {
    const normSelectedCat = selectedCategory.trim().toLowerCase();
    const normSelectedSub = selectedSubcategory.trim().toLowerCase();
    return sortProductsAlphabetically(
      products.filter((prod) => {
        // Direct Search matching name, barcode, category/subcategory, etc with helper
        const matchesSearch = matchProductWithKeywords(prod, searchQuery);

        // Category matching (case & whitespace insensitive)
        const matchesCategory =
          normSelectedCat === '' ||
          (prod.category || '').trim().toLowerCase() === normSelectedCat;

        // Subcategory matching (case & whitespace insensitive)
        const matchesSubcategory =
          normSelectedSub === '' ||
          (prod.subcategory || '').trim().toLowerCase() === normSelectedSub;

        // Manufacturer / Brand matching
        const matchesBrand = selectedBrand === '' || 
          (selectedBrand === 'sem_fabricante' ? (!prod.brand || !prod.brand.trim()) : (prod.brand?.trim().toLowerCase() === selectedBrand.trim().toLowerCase()));

        // Status filters: 'vencidos', 'criticos', 'ok', 'todos'
        let matchesStatus = true;
        if (selectedStatusFilter === 'vencidos') {
          matchesStatus = prod.batches.some(b => getDaysRemaining(b.date) < 0);
        } else if (selectedStatusFilter === 'criticos') {
          matchesStatus = prod.batches.some(b => {
            const days = getDaysRemaining(b.date);
            return days >= 0 && days <= 30;
          });
        } else if (selectedStatusFilter === 'ok') {
          matchesStatus = prod.batches.every(b => getDaysRemaining(b.date) > 30);
        }

        return matchesSearch && matchesCategory && matchesSubcategory && matchesBrand && matchesStatus;
      })
    );
  }, [products, searchQuery, selectedCategory, selectedSubcategory, selectedBrand, selectedStatusFilter]);

  // Top beverage and food manufacturer presets for autocomplete & quick chips
  const TOP_FABRICANTES_PRESETS = [
    'Ambev',
    'Coca-Cola FEMSA',
    'Heineken Brasil',
    'Grupo Petrópolis',
    'Nestlé',
    'Unilever',
    'M. Dias Branco',
    'Pirahy Alimentos',
    'Gallo Worldwide',
    'Mondelez Brasil',
    'JBS / Seara',
    'BRF / Sadia',
    'Camil Alimentos',
    'Yoki / General Mills',
    'Solar Coca-Cola'
  ];

  // Distinct sorted list of all manufacturers present in inventory or top presets
  const allBrandsList = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.brand && p.brand.trim()) {
        set.add(p.brand.trim());
      }
    });
    TOP_FABRICANTES_PRESETS.forEach(b => set.add(b));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [products]);

  // Distinct manufacturers that exist in the active catalog
  const catalogBrandsList = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.brand && p.brand.trim()) {
        set.add(p.brand.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [products]);

  // Group products by category
  const productsByCategory = useMemo(() => {
    const groups: { [category: string]: Product[] } = {};
    filteredProducts.forEach((product) => {
      const cat = product.category || 'Sem Categoria';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(product);
    });
    return groups;
  }, [filteredProducts]);

  // Group products by manufacturer / brand
  const productsByBrand = useMemo(() => {
    const groups: { [brand: string]: Product[] } = {};
    filteredProducts.forEach((product) => {
      const brand = product.brand?.trim() || 'Sem Fabricante';
      if (!groups[brand]) {
        groups[brand] = [];
      }
      groups[brand].push(product);
    });
    return groups;
  }, [filteredProducts]);

  // Manufacturer stats for visual boxes and overview
  const brandStats = useMemo(() => {
    const stats: { 
      [brandName: string]: { 
        count: number; 
        totalQty: number; 
        anyExpired: boolean; 
        anyCritical: boolean;
        categories: string[];
      } 
    } = {};

    products.forEach(p => {
      const brand = p.brand?.trim() || 'Sem Fabricante';
      if (!stats[brand]) {
        stats[brand] = { count: 0, totalQty: 0, anyExpired: false, anyCritical: false, categories: [] };
      }
      stats[brand].count += 1;
      if (p.category && !stats[brand].categories.includes(p.category)) {
        stats[brand].categories.push(p.category);
      }
      const totalQty = p.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[p.id]?.totalTransferred || 0);
      stats[brand].totalQty += totalQty;

      p.batches.forEach(b => {
        const remaining = getDaysRemaining(b.date);
        if (remaining < 0) {
          stats[brand].anyExpired = true;
        } else if (remaining >= 0 && remaining <= 30) {
          stats[brand].anyCritical = true;
        }
      });
    });

    return stats;
  }, [products, productSectorsSums]);

  // Category stats for visual boxes
  const categoryStats = useMemo(() => {
    const stats: { [catName: string]: { count: number; totalQty: number; anyExpired: boolean; anyCritical: boolean } } = {};
    const canonicalByLower: { [lower: string]: string } = {};

    // Ensure that categories list names exist in stats
    categories.forEach(cat => {
      stats[cat.name] = { count: 0, totalQty: 0, anyExpired: false, anyCritical: false };
      canonicalByLower[cat.name.trim().toLowerCase()] = cat.name;
    });

    // Count products and batches details
    products.forEach(p => {
      const rawCat = (p.category || 'Outros').trim();
      const cat = canonicalByLower[rawCat.toLowerCase()] || rawCat;
      if (!stats[cat]) {
        stats[cat] = { count: 0, totalQty: 0, anyExpired: false, anyCritical: false };
      }
      stats[cat].count += 1;
      const totalQty = p.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[p.id]?.totalTransferred || 0);
      stats[cat].totalQty += totalQty;

      p.batches.forEach(b => {
        const remaining = getDaysRemaining(b.date);
        if (remaining < 0) {
          stats[cat].anyExpired = true;
        } else if (remaining >= 0 && remaining <= 30) {
          stats[cat].anyCritical = true;
        }
      });
    });

    return stats;
  }, [products, categories, productSectorsSums]);

  const getCategoryIcon = (categoryName: string) => {
    const name = categoryName.toLowerCase();
    if (name.includes('alimento') || name.includes('mercearia') || name.includes('comida') || name.includes('grão')) {
      return <Layers className="w-4 h-4 text-indigo-500" />;
    }
    if (name.includes('refrigerante') || name.includes('refri') || name.includes('cola')) {
      return <GlassWater className="w-4 h-4 text-rose-504 text-rose-500" />;
    }
    if (name.includes('bebida') || name.includes('suco') || name.includes('água')) {
      return <GlassWater className="w-4 h-4 text-sky-505 text-blue-400" />;
    }
    if (name.includes('limpeza') || name.includes('higiene') || name.includes('químico')) {
      return <Sparkles className="w-4 h-4 text-emerald-400" />;
    }
    if (name.includes('frio') || name.includes('congelado') || name.includes('carne') || name.includes('sorvete')) {
      return <Snowflake className="w-4 h-4 text-cyan-400" />;
    }
    if (name.includes('doce') || name.includes('confeito') || name.includes('sobremesa') || name.includes('biscoito') || name.includes('chocolate')) {
      return <Cookie className="w-4 h-4 text-amber-500" />;
    }
    return <Package className="w-4 h-4 text-slate-400" />;
  };

  // 5.5. Consulta automática na rede ("disponível na rede")
  const fetchProductFromNetwork = async (barcode: string): Promise<string | null> => {
    if (!barcode || !barcode.trim()) return null;
    lastAttemptedBarcodeRef.current = barcode.trim();
    setIsSearchingNetwork(true);
    setNetworkError(null);
    
    let namePart = '';
    let brandPart = '';
    let quantityPart = '';
    let imagePart = '';
    let categoryPart = '';

    const cleanBarcode = barcode.trim();

    try {
      // 1. Chamada para a API Livre do Open Food Facts
      try {
        const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`);
        if (offRes.ok) {
          const offData = await offRes.json();
          if (offData.status === 1 && offData.product) {
            const p = offData.product;
            namePart = p.product_name_pt || p.product_name || p.generic_name_pt || p.generic_name || '';
            brandPart = p.brands || '';
            quantityPart = p.quantity || '';
            imagePart = p.image_url || p.image_front_url || p.image_front_small_url || p.image_thumb_url || '';
            categoryPart = p.categories || '';
          }
        }
      } catch (err) {
        console.warn('Open Food Facts failed:', err);
      }

      // 1.2. Fallback: Open Beauty Facts (Higiene, Maquiagem, Sabonetes, Shampoos)
      if (!namePart) {
        try {
          const obfRes = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${cleanBarcode}.json`);
          if (obfRes.ok) {
            const obfData = await obfRes.json();
            if (obfData.status === 1 && obfData.product) {
              const p = obfData.product;
              namePart = p.product_name_pt || p.product_name || p.generic_name_pt || p.generic_name || '';
              brandPart = p.brands || '';
              quantityPart = p.quantity || '';
              imagePart = p.image_url || p.image_front_url || p.image_front_small_url || p.image_thumb_url || '';
              categoryPart = p.categories || '';
            }
          }
        } catch (err) {
          console.warn('Open Beauty Facts failed:', err);
        }
      }

      // 1.3. Fallback: Open Products Facts (Materiais domésticos, papelaria, utilidades)
      if (!namePart) {
        try {
          const opfRes = await fetch(`https://world.openproductsfacts.org/api/v2/product/${cleanBarcode}.json`);
          if (opfRes.ok) {
            const opfData = await opfRes.json();
            if (opfData.status === 1 && opfData.product) {
              const p = opfData.product;
              namePart = p.product_name_pt || p.product_name || p.generic_name_pt || p.generic_name || '';
              brandPart = p.brands || '';
              quantityPart = p.quantity || '';
              imagePart = p.image_url || p.image_front_url || p.image_front_small_url || p.image_thumb_url || '';
              categoryPart = p.categories || '';
            }
          }
        } catch (err) {
          console.warn('Open Products Facts failed:', err);
        }
      }

      // 2. Fallback / Complementar: API EanPictures (Especializada em produtos nacionais brasileiros)
      if (!namePart || !brandPart || !imagePart) {
        try {
          const eanRes = await fetch(`https://api.eanpictures.com.br/v1/ean/${cleanBarcode}`);
          if (eanRes.ok) {
            const eanData = await eanRes.json();
            if (eanData) {
              const eanName = eanData.nome || eanData.name || eanData.title || '';
              const eanBrand = eanData.marca || eanData.brand || '';
              const eanImage = eanData.imagem || eanData.image || eanData.logo || '';
              const eanWeight = eanData.peso || eanData.volume || eanData.quantity || '';
              const eanCat = eanData.categoria || eanData.category || '';

              if (eanName && !namePart) namePart = eanName;
              if (eanBrand && !brandPart) brandPart = eanBrand;
              if (eanImage && !imagePart) imagePart = eanImage;
              if (eanWeight && !quantityPart) quantityPart = eanWeight;
              if (eanCat && !categoryPart) categoryPart = eanCat;
            }
          }
        } catch (err) {
          console.warn('EanPictures failed:', err);
        }
      }

      // Se obtivemos pelo menos o nome do produto, preenchemos o cadastro!
      const resolvedName = namePart.trim();
      if (resolvedName) {
        // Formata o Nome com a primeira letra maiúscula para melhor apelo visual
        const formattedName = resolvedName
          .split(' ')
          .map(word => {
            if (word.length <= 2) return word.toLowerCase();
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          })
          .join(' ');

        setNewProdName(formattedName);
        setNewProdBrand(brandPart.trim() || 'Fabricante Geral');
        setNewProdWeightVolume(quantityPart.trim() || 'unidade');
        setNewProdImage(imagePart.trim());

        // Tenta mapear alguma categoria heurística com base nas tags de ingredientes / categorias
        const catString = ((categoryPart || '') + ' ' + resolvedName).toLowerCase();
        
        let matchedCategoryName = 'Alimentos'; // default fallback
        let matchedSubcategoryName = '';

        if (
          catString.includes('limpeza') || 
          catString.includes('detergente') || 
          catString.includes('sabão') || 
          catString.includes('sabonete') || 
          catString.includes('shampoo') || 
          catString.includes('condicionador') || 
          catString.includes('creme') || 
          catString.includes('desinfetante') || 
          catString.includes('amaciante') || 
          catString.includes('higiene') || 
          catString.includes('fralda') || 
          catString.includes('cloro') || 
          catString.includes('multiuso') || 
          catString.includes('clean') || 
          catString.includes('soap')
        ) {
          matchedCategoryName = 'Limpeza';
          if (catString.includes('detergente')) matchedSubcategoryName = 'Detergentes';
          else if (catString.includes('sabão')) matchedSubcategoryName = 'Sabão em Pó';
          else if (catString.includes('amaciante')) matchedSubcategoryName = 'Amaciantes';
          else matchedSubcategoryName = 'Desinfetantes';
        } else if (
          catString.includes('coca-cola') || 
          catString.includes('coca') || 
          catString.includes('refrigerante') || 
          catString.includes('guaraná') || 
          catString.includes('fanta') || 
          catString.includes('pepsi') || 
          catString.includes('sprite') || 
          catString.includes('soda') || 
          catString.includes('schweppes') || 
          catString.includes('refrigerant')
        ) {
          matchedCategoryName = 'Refrigerantes';
          if (catString.includes('coca')) matchedSubcategoryName = 'Coca-Cola';
          else if (catString.includes('guaraná')) matchedSubcategoryName = 'Guaraná';
          else if (catString.includes('fanta')) matchedSubcategoryName = 'Fanta';
          else matchedSubcategoryName = 'Outros';
        } else if (
          catString.includes('cerveja') || 
          catString.includes('suco') || 
          catString.includes('chá') || 
          catString.includes('água') || 
          catString.includes('agua') || 
          catString.includes('laticínio') || 
          catString.includes('leite') || 
          catString.includes('lácteo') || 
          catString.includes('iogurte') || 
          catString.includes('energético') || 
          catString.includes('red bull') || 
          catString.includes('monster') || 
          catString.includes('bebida') || 
          catString.includes('juice') || 
          catString.includes('water') || 
          catString.includes('milk') || 
          catString.includes('lata')
        ) {
          matchedCategoryName = 'Bebidas';
          if (catString.includes('leite') || catString.includes('iogurte')) matchedSubcategoryName = 'Laticínios';
          else if (catString.includes('energético') || catString.includes('red bull') || catString.includes('monster')) matchedSubcategoryName = 'Energéticos';
          else matchedSubcategoryName = 'Sucos e Águas';
        } else if (
          catString.includes('chocolate') || 
          catString.includes('biscoito') || 
          catString.includes('bolacha') || 
          catString.includes('doce') || 
          catString.includes('bala') || 
          catString.includes('goma') || 
          catString.includes('marshmallow') || 
          catString.includes('cookies') || 
          catString.includes('candy') || 
          catString.includes('sweet')
        ) {
          matchedCategoryName = 'Doces e Confeitos';
          if (catString.includes('chocolate')) matchedSubcategoryName = 'Chocolates';
          else if (catString.includes('biscoito') || catString.includes('bolacha')) matchedSubcategoryName = 'Biscoitos Doces';
          else if (catString.includes('bala')) matchedSubcategoryName = 'Balas';
          else matchedSubcategoryName = 'Gomas';
        } else if (
          catString.includes('carne') || 
          catString.includes('bacon') || 
          catString.includes('frango') || 
          catString.includes('bife') || 
          catString.includes('picanha') || 
          catString.includes('congelado') || 
          catString.includes('prato pronto') || 
          catString.includes('sorvete') || 
          catString.includes('ice cream') || 
          catString.includes('pães congelados') || 
          catString.includes('pão congelado')
        ) {
          matchedCategoryName = 'Frios e Congelados';
          if (catString.includes('carne') || catString.includes('bacon') || catString.includes('frango')) matchedSubcategoryName = 'Carnes';
          else if (catString.includes('sorvete')) matchedSubcategoryName = 'Sorvetes';
          else if (catString.includes('congelado') && catString.includes('pão')) matchedSubcategoryName = 'Pães Congelados';
          else matchedSubcategoryName = 'Pratos Prontos';
        } else {
          matchedCategoryName = 'Alimentos';
          if (catString.includes('arroz') || catString.includes('feijão') || catString.includes('grão')) matchedSubcategoryName = 'Arroz e Grãos';
          else if (catString.includes('óleo') || catString.includes('azeite')) matchedSubcategoryName = 'Óleos e Azeites';
          else if (catString.includes('massa') || catString.includes('macarrão') || catString.includes('pasta')) matchedSubcategoryName = 'Massas';
          else matchedSubcategoryName = 'Arroz e Grãos';
        }

        const parentCatObj = categories.find(c => c.name.toLowerCase() === matchedCategoryName.toLowerCase()) || categories[0];
        setNewProdCategory(parentCatObj.name);

        if (parentCatObj) {
          const matchedSub = parentCatObj.subcategories.find(s => s.toLowerCase() === matchedSubcategoryName.toLowerCase());
          setNewProdSubcategory(matchedSub || parentCatObj.subcategories[0] || '');
        }
        
        return resolvedName;
      }

      setNetworkError('Não localizado nos bancos globais e nacional (Open Food/Beauty/Product Facts & EanPictures).');
    } catch (e) {
      console.warn('Network search error: ', e);
      setNetworkError('Falha ao buscar dados na rede ou sem conexão.');
    } finally {
      setIsSearchingNetwork(false);
    }
    return null;
  };

  // 6. Barcode scaneado handler - Fluxo automático de Entrada/Saída e Auto-Cadastro
  const handleBarcodeScanned = async (barcode: string) => {
    const cleanScan = barcode ? barcode.trim() : '';
    if (!cleanScan) return;

    // Busca se o produto já está cadastrado no sistema (pelo código de barras)
    const matched = products.find(p => p.barcode && p.barcode.trim() === cleanScan);

    if (matched) {
      // 1. PRODUTO JÁ CADASTRADO NO APLICATIVO:
      // Automaticamente aparece na frente da tela as duas opções: ENTRADA ou SAÍDA de produto!
      setShowScanner(false);
      playApitoSonoro();
      setScannedRegisteredProduct(matched);
      setScannedExistingAlert({ 
        name: matched.name, 
        barcode: matched.barcode, 
        mode: 'escolha' 
      });

      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 }
      });
    } else {
      // 2. PRODUTO AINDA NÃO CADASTRADO NO APLICATIVO:
      // Automaticamente faz a leitura do código de barras e, se for encontrado no banco de dados,
      // faz o preenchimento automático para o cadastro!
      setShowScanner(false);
      playApitoSonoro();

      // Preenche o código lido e limpa os campos para o novo cadastro
      setNewProdBarcode(cleanScan);
      setNewProdName('');
      setNewProdBrand('');
      setNewProdWeightVolume('');
      setNewProdImage('');
      setNewProdDescription('');
      setNewProdBatchId(`l-${Date.now().toString().slice(-4)}`);
      setNewProdBatchDate('');
      setNewProdBatchQty('10');

      // Abre automaticamente o modal de cadastro com notificação de leitura e busca
      setAutoFillNotification({
        barcode: cleanScan,
        status: 'searching'
      });
      setShowAddProductModal(true);

      // Consulta automática nos bancos de dados e catálogos (Open Food/Beauty Facts & EanPictures)
      try {
        const resolvedName = await fetchProductFromNetwork(cleanScan);
        if (resolvedName) {
          setAutoFillNotification({
            barcode: cleanScan,
            status: 'found',
            productName: resolvedName
          });
          confetti({
            particleCount: 60,
            colors: ['#10b981', '#38bdf8', '#fbbf24']
          });
        } else {
          setAutoFillNotification({
            barcode: cleanScan,
            status: 'notFound'
          });
        }
      } catch (err) {
        console.warn('Erro ao consultar banco de dados de produtos:', err);
        setAutoFillNotification({
          barcode: cleanScan,
          status: 'notFound'
        });
      }
    }
  };

  // 7. Operations/Actions Handlers
  const handleUpdateCategories = async (updatedCategories: Category[]) => {
    if (currentUser && usingFirebase) {
      try {
        const existingIds = categories.map(c => c.id);
        const updatedIds = updatedCategories.map(c => c.id);
        const deletedIds = existingIds.filter(id => !updatedIds.includes(id));
        
        const batch = writeBatch(db);
        
        // Save current and newly added categories in Firestore
        updatedCategories.forEach((cat) => {
          batch.set(doc(db, 'categories', cat.id), cat);
        });
        
        // Delete any removed categories in Firestore
        deletedIds.forEach((id) => {
          batch.delete(doc(db, 'categories', id));
        });
        
        await batch.commit();
        setCategories(updatedCategories);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'categories');
      }
    } else {
      setCategories(updatedCategories);
      localStorage.setItem('bv_categories', JSON.stringify(updatedCategories));
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    const name = newCategoryName.trim();
    // Check duplication (case insensitive)
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      alert(`A categoria "${name}" já existe.`);
      return;
    }

    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name,
      subcategories: []
    };

    const updated = [...categories, newCat];
    await handleUpdateCategories(updated);
    setNewCategoryName('');
    
    // Auto-select newly created category if none or safe
    if (updated.length === 1) {
      setNewProdCategory(name);
    }
    
    confetti({
      particleCount: 20,
      colors: ['#0ea5e9', '#38bdf8']
    });
  };

  const handleCreateCategoryOnTheFly = async () => {
    const catName = onTheFlyCategoryName.trim();
    if (!catName) {
      alert('Por favor, informe o nome da nova categoria.');
      return;
    }

    const subName = onTheFlySubcategoryName.trim();

    // Check duplication (case insensitive)
    const existingCat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
    if (existingCat) {
      alert(`A categoria "${catName}" já existe. Selecionamos ela para você!`);
      if (subName && !existingCat.subcategories.some(s => s.toLowerCase() === subName.toLowerCase())) {
        const updatedSubs = [...existingCat.subcategories, subName];
        const updatedCats = categories.map(c => 
          c.id === existingCat.id ? { ...c, subcategories: updatedSubs } : c
        );
        await handleUpdateCategories(updatedCats);
      }
      setNewProdCategory(existingCat.name);
      setNewProdSubcategory(subName || existingCat.subcategories[0] || '');
      setIsCreatingCategoryOnTheFly(false);
      setOnTheFlyCategoryName('');
      setOnTheFlySubcategoryName('');
      return;
    }

    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: catName,
      subcategories: subName ? [subName] : []
    };

    const updated = [...categories, newCat];
    await handleUpdateCategories(updated);

    // Auto select
    setNewProdCategory(catName);
    setNewProdSubcategory(subName);

    // Reset states
    setIsCreatingCategoryOnTheFly(false);
    setOnTheFlyCategoryName('');
    setOnTheFlySubcategoryName('');

    confetti({
      particleCount: 20,
      colors: ['#0ea5e9', '#38bdf8']
    });
  };

  const handleAddNewSubcategoryInline = async () => {
    const value = newSubcategoryInputValue.trim();
    if (!value) {
      alert('Por favor, informe o nome da nova subcategoria.');
      return;
    }

    const matchedCat = categories.find(c => c.name === newProdCategory);
    if (!matchedCat) {
      alert('Selecione primeiro uma categoria válida.');
      return;
    }

    const alreadyExists = (matchedCat.subcategories || []).some(
      sub => sub.toLowerCase() === value.toLowerCase()
    );

    if (alreadyExists) {
      alert('Esta subcategoria já existe nesta categoria!');
      setNewProdSubcategory(value);
      setIsAddingNewSubcategory(false);
      setNewSubcategoryInputValue('');
      return;
    }

    const updatedSubs = [...(matchedCat.subcategories || []), value];
    const updatedCats = categories.map(c => 
      c.id === matchedCat.id ? { ...c, subcategories: updatedSubs } : c
    );

    await handleUpdateCategories(updatedCats);
    setNewProdSubcategory(value);
    setIsAddingNewSubcategory(false);
    setNewSubcategoryInputValue('');
    confetti({
      particleCount: 15,
      colors: ['#10b981', '#34d399']
    });
  };

  const handleRemoveCategory = async (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    // Check if any product is associated
    const associatedProducts = products.filter(p => p.category === category.name);
    if (associatedProducts.length > 0) {
      if (!window.confirm(`Atenção: Existem ${associatedProducts.length} produtos cadastrados na categoria "${category.name}". Se você a excluir, os filtros correspondentes podem não os mostrar corretamente. Deseja mesmo excluir?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Deseja mesmo excluir a categoria "${category.name}"?`)) {
        return;
      }
    }

    const updated = categories.filter(c => c.id !== categoryId);
    await handleUpdateCategories(updated);

    // If active new prod select is this deleted one, move it
    if (newProdCategory === category.name) {
      if (updated.length > 0) {
        setNewProdCategory(updated[0].name);
        setNewProdSubcategory((updated[0].subcategories || [])[0] || '');
      } else {
        setNewProdCategory('');
        setNewProdSubcategory('');
      }
    }
  };

  const handleAddSubcategory = async (categoryId: string) => {
    const subName = newSubcategoryName[categoryId]?.trim();
    if (!subName) return;

    const catIndex = categories.findIndex(c => c.id === categoryId);
    if (catIndex === -1) return;

    const category = categories[catIndex];
    const existingSubs = category.subcategories || [];
    if (existingSubs.some(sub => sub.toLowerCase() === subName.toLowerCase())) {
      alert(`A subcategoria "${subName}" já existe nesta categoria.`);
      return;
    }

    const updatedSubcategories = [...existingSubs, subName];
    const updatedCategories = categories.map((c, idx) => 
      idx === catIndex ? { ...c, subcategories: updatedSubcategories } : c
    );

    await handleUpdateCategories(updatedCategories);
    setNewSubcategoryName(prev => ({ ...prev, [categoryId]: '' }));

    // Reset current form subcategory if needed
    if (newProdCategory === category.name && !newProdSubcategory) {
      setNewProdSubcategory(subName);
    }
  };

  const handleRemoveSubcategory = async (categoryId: string, subName: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    const associatedProducts = products.filter(p => p.category === category.name && p.subcategory === subName);
    if (associatedProducts.length > 0) {
      if (!window.confirm(`Atenção: Existem ${associatedProducts.length} produtos cadastrados na subcategoria "${subName}". Deseja mesmo excluí-la?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Deseja mesmo remover a subcategoria "${subName}" da categoria "${category.name}"?`)) {
        return;
      }
    }

    const updatedCategories = categories.map(c => {
      if (c.id === categoryId) {
        return {
          ...c,
          subcategories: c.subcategories.filter(sub => sub !== subName)
        };
      }
      return c;
    });

    await handleUpdateCategories(updatedCategories);

    // If active new prod select is this subcategory, fall back or reset
    if (newProdCategory === category.name && newProdSubcategory === subName) {
      const match = updatedCategories.find(c => c.id === categoryId);
      if (match && match.subcategories.length > 0) {
        setNewProdSubcategory(match.subcategories[0]);
      } else {
        setNewProdSubcategory('');
      }
    }
  };

  const handleDeleteProduct = (product: Product) => {
    const totalQty = product.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[product.id]?.totalTransferred || 0);
    const description = totalQty > 0
      ? `O item "${product.name}" possui ${totalQty} ${formatOnlyPackagingSingularPlural(totalQty, product.packaging || 'un')} em estoque. Ao confirmar, o cadastro deste produto e seus lotes serão removidos permanentemente.`
      : `Tem certeza de que deseja excluir permanentemente o item cadastrado "${product.name}"? Esta ação não pode ser desfeita.`;

    setDeleteConfirmModal({
      mode: 'single',
      title: 'Excluir Item Cadastrado',
      description,
      products: [product]
    });
  };

  const handleDeleteSelectedProducts = (prodsToDelete: Product[]) => {
    if (prodsToDelete.length === 0) return;
    setDeleteConfirmModal({
      mode: 'bulk',
      title: `Excluir ${prodsToDelete.length} ${prodsToDelete.length === 1 ? 'Item Selecionado' : 'Itens Selecionados'}`,
      description: `Você está prestes a excluir permanentemente ${prodsToDelete.length} ${prodsToDelete.length === 1 ? 'produto cadastrado' : 'produtos cadastrados'} do sistema. Esta ação remove os cadastros e lotes selecionados.`,
      products: prodsToDelete
    });
  };

  const handleDeleteAllProductsInCategory = (categoryName: string) => {
    const prodsToDelete = products.filter(
      p => p.category?.trim().toLowerCase() === categoryName.trim().toLowerCase()
    );
    if (prodsToDelete.length === 0) {
      setDeleteSuccessMessage(`Não existem produtos cadastrados na categoria "${categoryName}".`);
      return;
    }
    setDeleteConfirmModal({
      mode: 'category',
      title: `Excluir Todos da Categoria "${categoryName}"`,
      description: `Tem certeza de que deseja excluir permanentemente todos os ${prodsToDelete.length} produto(s) cadastrados na categoria "${categoryName}"?`,
      products: prodsToDelete,
      categoryName
    });
  };

  const executeConfirmedDelete = async () => {
    if (!deleteConfirmModal || isDeletingProducts) return;
    const targets = deleteConfirmModal.products;
    if (targets.length === 0) {
      setDeleteConfirmModal(null);
      return;
    }

    setIsDeletingProducts(true);
    const targetIds = new Set(targets.map(p => p.id));

    // Cancela ajustes rápidos pendentes para os itens excluídos e trava reaparecimento no snapshot
    targets.forEach((prod) => {
      const pending = pendingAdjustmentsRef.current[prod.id];
      if (pending?.timer) {
        clearTimeout(pending.timer);
      }
      delete pendingAdjustmentsRef.current[prod.id];
      pendingDeletedIdsRef.current.add(prod.id);
    });

    // Atualização otimista local imediata
    const updatedProducts = products.filter(p => !targetIds.has(p.id));
    if (updatedProducts.length === 0) {
      localStorage.setItem('bv_was_reset', 'true');
    }
    setProducts(updatedProducts);
    localStorage.setItem('bv_products', safeJsonStringify(updatedProducts));

    if (expandedProductId && targetIds.has(expandedProductId)) {
      setExpandedProductId(null);
    }
    if (selectedProductForDetails && targetIds.has(selectedProductForDetails.id)) {
      setShowProductDetailsModal(false);
      setSelectedProductForDetails(null);
    }
    if (productSavedSuccess && targetIds.has(productSavedSuccess.id)) {
      setProductSavedSuccess(null);
    }
    setSelectedProdutoIdsToDelete(prev => prev.filter(id => !targetIds.has(id)));
    if (deleteConfirmModal.mode === 'bulk') {
      setIsSelectionModeProdutos(false);
    }

    const modalInfo = deleteConfirmModal;
    setDeleteConfirmModal(null);

    if (currentUser && usingFirebase) {
      try {
        if (targets.length === 1) {
          await deleteDoc(doc(db, 'products', targets[0].id));
        } else {
          const CHUNK_SIZE = 350;
          for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
            const chunk = targets.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(prod => {
              batch.delete(doc(db, 'products', prod.id));
            });
            await batch.commit();
          }
        }
      } catch (err) {
        setFirebaseSyncError('Erro ao confirmar a exclusão na nuvem. Verifique sua conexão ou permissões.');
        try {
          handleFirestoreError(
            err,
            OperationType.DELETE,
            targets.length === 1 ? `products/${targets[0].id}` : `products/bulk_delete`
          );
        } catch (loggedErr) {
          console.error(loggedErr);
        }
      } finally {
        setTimeout(() => {
          targets.forEach(prod => pendingDeletedIdsRef.current.delete(prod.id));
        }, 800);
        setIsDeletingProducts(false);
      }
    } else {
      targets.forEach(prod => pendingDeletedIdsRef.current.delete(prod.id));
      setIsDeletingProducts(false);
    }

    setDeleteSuccessMessage(
      modalInfo.mode === 'single'
        ? `Item "${targets[0].name}" excluído com sucesso.`
        : `${targets.length} item(ns) excluído(s) com sucesso.`
    );
  };
  
  const handleUpdateBarcode = async (productId: string, newBarcode: string) => {
    const trimmedBarcode = newBarcode ? newBarcode.trim() : '';

    if (trimmedBarcode) {
      const duplicated = products.find(p => p.barcode && p.barcode.trim().toLowerCase() === trimmedBarcode.toLowerCase() && p.id !== productId);
      if (duplicated) {
        alert(`Este código de barras já está cadastrado no produto "${duplicated.name}"!`);
        return;
      }
    }

    const currentProduct = products.find(p => p.id === productId);
    if (!currentProduct) return;

    const updatedProduct = {
      ...currentProduct,
      barcode: trimmedBarcode
    };

    const updatedTransactions = transactions.map(t => {
      if (t.productId === productId) {
        return { ...t, barcode: trimmedBarcode };
      }
      return t;
    });

    setProducts(prev => {
      const next = prev.map(p => p.id === productId ? updatedProduct : p);
      localStorage.setItem('bv_products', JSON.stringify(next));
      return next;
    });

    setTransactions(prev => {
      localStorage.setItem('bv_transactions', JSON.stringify(updatedTransactions));
      return updatedTransactions;
    });

    if (selectedProductForDetails && selectedProductForDetails.id === productId) {
      setSelectedProductForDetails(updatedProduct);
    }

    setIsEditingBarcode(false);

    if (currentUser && usingFirebase) {
      try {
        await setDoc(doc(db, 'products', productId), sanitizeForFirestore(updatedProduct));
        console.log(`[Código de Barras] Produto ${productId} atualizado no Firestore com novo código: ${trimmedBarcode}`);
      } catch (err) {
        console.error("Erro ao atualizar o código de barras no Firestore:", err);
        handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
      }
    }
  };

  const openCategoryEditModal = (product: Product) => {
    setCategoryEditProduct(product);
    setModalEditCategory(product.category || (categories[0]?.name || ''));
    setModalEditSubcategory(product.subcategory || '');
    setIsCreatingCatInModal(false);
    setIsCreatingSubInModal(false);
    setModalNewCategoryInput('');
    setModalNewSubcategoryInput('');
  };

  const handleUpdateProductCategory = async (productId: string, newCategory: string, newSubcategory: string) => {
    const trimmedCategory = newCategory.trim();
    const trimmedSubcategory = newSubcategory.trim();
    if (!trimmedCategory) return;

    const currentProduct =
      pendingAdjustmentsRef.current[productId]?.latestProduct ||
      products.find(p => p.id === productId);
    if (!currentProduct) return;

    const updatedProduct: Product = {
      ...currentProduct,
      category: trimmedCategory,
      subcategory: trimmedSubcategory
    };

    // Garante que a nova categoria / subcategoria exista no catálogo de categorias
    const existingCatIdx = categories.findIndex(
      c => c.name.trim().toLowerCase() === trimmedCategory.toLowerCase()
    );
    if (existingCatIdx === -1) {
      const newCat: Category = {
        id: `cat-${Date.now()}`,
        name: trimmedCategory,
        subcategories: trimmedSubcategory ? [trimmedSubcategory] : []
      };
      handleUpdateCategories([...categories, newCat]);
    } else if (
      trimmedSubcategory &&
      !categories[existingCatIdx].subcategories.some(
        s => s.trim().toLowerCase() === trimmedSubcategory.toLowerCase()
      )
    ) {
      const nextCats = categories.map((c, idx) =>
        idx === existingCatIdx
          ? { ...c, subcategories: [...c.subcategories, trimmedSubcategory] }
          : c
      );
      handleUpdateCategories(nextCats);
    }

    setProducts(prev => {
      const next = sortProductsAlphabetically(
        prev.map(p => p.id === productId ? updatedProduct : p)
      );
      localStorage.setItem('bv_products', safeJsonStringify(next));
      return next;
    });

    if (selectedProductForDetails && selectedProductForDetails.id === productId) {
      setSelectedProductForDetails(updatedProduct);
    }

    setIsEditingCategory(false);
    setCategoryEditProduct(null);
    setCategorySuccessMessage(
      `Categoria atualizada: "${updatedProduct.name}" → ${trimmedCategory}${trimmedSubcategory ? ` > ${trimmedSubcategory}` : ''}`
    );

    if (currentUser && usingFirebase) {
      try {
        await setDoc(doc(db, 'products', productId), sanitizeForFirestore(updatedProduct));
        console.log(`[Categoria] Produto ${productId} atualizado no Firestore com a categoria: ${trimmedCategory}/${trimmedSubcategory}`);
      } catch (err) {
        setFirebaseSyncError('Não foi possível confirmar a troca de categoria na nuvem neste momento, mas ela foi salva localmente.');
        try {
          handleFirestoreError(err, OperationType.UPDATE, `products/${productId}`);
        } catch (loggedErr) {
          console.error(loggedErr);
        }
      }
    }
  };

  const handleUpdateProductPackaging = async (productId: string, newPackaging: string) => {
    if (!newPackaging.trim()) return;
    const currentProduct = products.find(p => p.id === productId);
    if (!currentProduct) return;

    const updatedProduct = {
      ...currentProduct,
      packaging: newPackaging.trim()
    };

    setProducts(prev => {
      const next = prev.map(p => p.id === productId ? updatedProduct : p);
      localStorage.setItem('bv_products', JSON.stringify(next));
      return next;
    });

    if (selectedProductForDetails && selectedProductForDetails.id === productId) {
      setSelectedProductForDetails(updatedProduct);
    }

    setIsEditingPackaging(false);

    if (currentUser && usingFirebase) {
      try {
        await setDoc(doc(db, 'products', productId), sanitizeForFirestore(updatedProduct));
        console.log(`[Embalagem] Produto ${productId} atualizado no Firestore com a embalagem: ${newPackaging}`);
      } catch (err) {
        console.error("Erro ao atualizar a embalagem no Firestore:", err);
        handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
      }
    }
  };

  const handleUpdateProductBrand = async (productId: string, newBrand: string) => {
    const currentProduct = products.find(p => p.id === productId);
    if (!currentProduct) return;

    const trimmedBrand = newBrand ? newBrand.trim() : '';
    const updatedProduct = {
      ...currentProduct,
      brand: trimmedBrand
    };

    setProducts(prev => {
      const next = prev.map(p => p.id === productId ? updatedProduct : p);
      localStorage.setItem('bv_products', JSON.stringify(next));
      return next;
    });

    if (selectedProductForDetails && selectedProductForDetails.id === productId) {
      setSelectedProductForDetails(updatedProduct);
    }

    setIsEditingBrand(false);

    if (currentUser && usingFirebase) {
      try {
        await setDoc(doc(db, 'products', productId), sanitizeForFirestore(updatedProduct));
        console.log(`[Fabricante] Produto ${productId} atualizado no Firestore com o fabricante: ${trimmedBrand}`);
      } catch (err) {
        console.error("Erro ao atualizar o fabricante no Firestore:", err);
        handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
      }
    }
  };

  const handleUpdateBatchDate = async (productId: string, batchId: string, newDate: string) => {
    const currentProduct = products.find(p => p.id === productId);
    if (!currentProduct) return;

    const trimmedDate = newDate ? newDate.trim() : '';
    const updatedBatches = currentProduct.batches.map(b => {
      if (b.id === batchId) {
        return { ...b, date: trimmedDate };
      }
      return b;
    });

    const updatedProduct = {
      ...currentProduct,
      batches: updatedBatches
    };

    setProducts(prev => {
      const next = prev.map(p => p.id === productId ? updatedProduct : p);
      localStorage.setItem('bv_products', JSON.stringify(next));
      return next;
    });

    if (selectedProductForDetails && selectedProductForDetails.id === productId) {
      setSelectedProductForDetails(updatedProduct);
    }

    setEditingBatchDateId(null);
    setTempBatchEditDate('');

    if (currentUser && usingFirebase) {
      try {
        await setDoc(doc(db, 'products', productId), sanitizeForFirestore(updatedProduct));
        console.log(`[Validade Lote] Validade do lote ${batchId} atualizada para ${trimmedDate}`);
      } catch (err) {
        console.error("Erro ao atualizar data de validade no Firestore:", err);
        handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
      }
    }
  };

  const handleAddBatchToProduct = async (productId: string, batchDate: string, qty: number, customBatchId?: string) => {
    const currentProduct = products.find(p => p.id === productId);
    if (!currentProduct) return;

    const batchId = customBatchId?.trim() || `l-${Date.now().toString().slice(-4)}`;
    const trimmedDate = batchDate ? batchDate.trim() : '';
    const quantity = Math.max(0, qty);

    const newBatch: Batch = {
      id: batchId,
      date: trimmedDate,
      quantity
    };

    const updatedProduct = {
      ...currentProduct,
      batches: [...currentProduct.batches, newBatch]
    };

    let newTx: Transaction | null = null;
    if (quantity > 0) {
      newTx = {
        id: `t-${Date.now()}`,
        productId: currentProduct.id,
        productName: currentProduct.name,
        barcode: currentProduct.barcode,
        type: 'entrada',
        quantity,
        operatorName: currentUser?.displayName || 'Operador',
        timestamp: new Date().toISOString(),
        packaging: currentProduct.packaging,
        batchId,
        batchDate: trimmedDate
      };
    }

    setProducts(prev => {
      const next = prev.map(p => p.id === productId ? updatedProduct : p);
      localStorage.setItem('bv_products', JSON.stringify(next));
      return next;
    });

    if (newTx) {
      setTransactions(prev => {
        const next = [newTx!, ...prev];
        localStorage.setItem('bv_transactions', JSON.stringify(next));
        return next;
      });
    }

    if (selectedProductForDetails && selectedProductForDetails.id === productId) {
      setSelectedProductForDetails(updatedProduct);
    }

    setShowAddNewBatchForm(false);
    setNewBatchFormDate('');
    setNewBatchFormQty('10');
    setNewBatchFormId('');

    if (currentUser && usingFirebase) {
      try {
        await setDoc(doc(db, 'products', productId), sanitizeForFirestore(updatedProduct));
        if (newTx) {
          await setDoc(doc(db, 'transactions', newTx.id), sanitizeForFirestore(newTx));
        }
      } catch (err) {
        console.error("Erro ao adicionar lote ao Firestore:", err);
      }
    }
  };

  const handleClearAllData = async () => {
    if (!window.confirm("BVE Estoque: VOCÊ DESEJA EXCLUIR TODOS OS ITENS, CATEGORIAS E TRANSAÇÕES DO SISTEMA? Esta ação é permanente e limpará a nuvem/localstorage.")) return;
    
    localStorage.setItem('bv_was_reset', 'true');
    setProducts([]);
    setCategories([]);
    setTransactions([]);
    localStorage.setItem('bv_products', JSON.stringify([]));
    localStorage.setItem('bv_categories', JSON.stringify([]));
    localStorage.setItem('bv_transactions', JSON.stringify([]));

    if (currentUser && usingFirebase) {
      try {
        const prodDocs = await getDocs(collection(db, 'products'));
        const catDocs = await getDocs(collection(db, 'categories'));
        const txDocs = await getDocs(collection(db, 'transactions'));

        const batch = writeBatch(db);
        prodDocs.forEach((d) => batch.delete(d.ref));
        catDocs.forEach((d) => batch.delete(d.ref));
        txDocs.forEach((d) => batch.delete(d.ref));

        await batch.commit();
        alert("Nuvem e Armazenamento Local resetados com sucesso! Você iniciou do zero.");
      } catch (err) {
        console.error("Erro deletando base do Firestore:", err);
        alert("Dados limpos localmente. Ocorreu um erro na nuvem (talvez faltem permissões de escrita/leitura): " + err);
      }
    } else {
      alert("Armazenamento local limpo com sucesso!");
    }
  };

  const handleZeroAllQuantities = async () => {
    if (!window.confirm("Atenção: VOCÊ DESEJA REALMENTE ZERAR A QUANTIDADE DE TODOS OS ITENS? Isso removerá todos os lotes e o histórico de transações, zerando o estoque atual de todos os produtos do sistema, mas manterá o cadastro de produtos e categorias intactos.")) return;

    const zeroedProducts = products.map(p => ({
      ...p,
      batches: []
    }));

    setProducts(zeroedProducts);
    setTransactions([]);
    localStorage.setItem('bv_products', JSON.stringify(zeroedProducts));
    localStorage.setItem('bv_transactions', JSON.stringify([]));

    if (currentUser && usingFirebase) {
      try {
        const prodDocs = await getDocs(collection(db, 'products'));
        const txDocs = await getDocs(collection(db, 'transactions'));

        const batch = writeBatch(db);
        prodDocs.forEach((d) => {
          const productData = d.data();
          batch.set(d.ref, sanitizeForFirestore({
            ...productData,
            batches: []
          }));
        });
        txDocs.forEach((d) => batch.delete(d.ref));

        await batch.commit();
        alert("Quantidade de todos os itens zerada com sucesso na nuvem!");
      } catch (err) {
        console.error("Erro ao zerar estoque no Firestore:", err);
        alert("Estoque zerado localmente. Ocorreu um erro ao sincronizar com a nuvem (talvez faltem permissões de escrita): " + err);
      }
    } else {
      alert("Quantidade de todos os itens zerada com sucesso!");
    }
  };

  const handleRestoreDemoData = async () => {
    if (!window.confirm("Deseja restaurar os itens e categorias de demonstração padrão do sistema?")) return;
    localStorage.removeItem('bv_was_reset');
    if (currentUser && usingFirebase) {
      await seedInitialFirestoreData();
    } else {
      setProducts(INITIAL_PRODUCTS);
      setCategories(INITIAL_CATEGORIES);
      setTransactions(INITIAL_TRANSACTIONS);
      localStorage.setItem('bv_products', JSON.stringify(INITIAL_PRODUCTS));
      localStorage.setItem('bv_categories', JSON.stringify(INITIAL_CATEGORIES));
      localStorage.setItem('bv_transactions', JSON.stringify(INITIAL_TRANSACTIONS));
      alert("Dados de teste locais restaurados!");
    }
  };

  const handleQuickQuantityChange = async (productArg: Product, delta: number) => {
    const productId = productArg.id;
    const defaultBatchId = 'b-' + Date.now();
    const defaultBatchDate = '';

    // Pega o produto mais atualizado em andamento, ou do estado do React se for o primeiro clique
    const product = pendingAdjustmentsRef.current[productId]?.latestProduct || products.find(p => p.id === productId) || productArg;

    let updatedBatches = (product.batches || []).map(b => ({ ...b }));
    const depQty = updatedBatches.reduce((sum, b) => sum + b.quantity, 0);
    const sectorSums = productSectorsSums[productId] || { loja: 0, anexo: 0, '3019': 0, totalTransferred: 0 };
    const totalAvailable = depQty + sectorSums.totalTransferred;

    const opName = currentUser?.displayName || 'Ajuste Rápido';
    const createdTxs: Transaction[] = [];

    if (delta > 0) {
      let bId = '';
      let bDate = '';
      // Entrada rápida
      if (updatedBatches.length > 0) {
        const lastBatchIndex = updatedBatches.length - 1;
        const targetBatch = updatedBatches[lastBatchIndex];
        updatedBatches[lastBatchIndex] = {
          ...targetBatch,
          quantity: targetBatch.quantity + delta
        };
        bId = targetBatch.id;
        bDate = targetBatch.date;
      } else {
        const newBatch: Batch = {
          id: defaultBatchId,
          quantity: delta,
          date: defaultBatchDate
        };
        updatedBatches.push(newBatch);
        bId = defaultBatchId;
        bDate = defaultBatchDate;
      }

      createdTxs.push({
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id,
        productName: product.name,
        barcode: product.barcode || '',
        type: 'entrada',
        quantity: delta,
        operatorName: opName,
        timestamp: new Date().toISOString(),
        packaging: product.packaging || 'Unidade',
        batchId: bId || defaultBatchId,
        batchDate: bDate
      });
    } else if (delta < 0) {
      // Saída rápida
      let amountToDeduct = Math.abs(delta);
      if (totalAvailable < amountToDeduct) {
        alert(`Estoque insuficiente! Saldo total atual disponível: ${totalAvailable} ${product.packaging || 'un'}.`);
        return;
      }

      if (depQty > 0) {
        let deductedDep = 0;
        let lastBatchId = '';
        let lastBatchDate = '';
        for (let i = 0; i < updatedBatches.length; i++) {
          if (amountToDeduct <= 0) break;
          if (updatedBatches[i].quantity > 0) {
            const available = updatedBatches[i].quantity;
            const deduct = Math.min(available, amountToDeduct);
            updatedBatches[i].quantity -= deduct;
            amountToDeduct -= deduct;
            deductedDep += deduct;
            lastBatchId = updatedBatches[i].id;
            lastBatchDate = updatedBatches[i].date;
          }
        }
        updatedBatches = updatedBatches.filter(b => b.quantity > 0);
        if (deductedDep > 0) {
          createdTxs.push({
            id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            productId: product.id,
            productName: product.name,
            barcode: product.barcode || '',
            type: 'saida',
            quantity: deductedDep,
            operatorName: opName,
            timestamp: new Date().toISOString(),
            packaging: product.packaging || 'Unidade',
            batchId: lastBatchId || 'sem-lote',
            batchDate: lastBatchDate || '',
            sourceSector: 'deposito'
          });
        }
      }

      if (amountToDeduct > 0) {
        const sectorsOrder: Array<'loja' | 'anexo' | '3019'> = ['loja', 'anexo', '3019'];
        for (const sec of sectorsOrder) {
          if (amountToDeduct <= 0) break;
          const secAvail = sectorSums[sec] || 0;
          if (secAvail > 0) {
            const deductSec = Math.min(secAvail, amountToDeduct);
            amountToDeduct -= deductSec;
            createdTxs.push({
              id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              productId: product.id,
              productName: product.name,
              barcode: product.barcode || '',
              type: 'saida',
              quantity: deductSec,
              operatorName: opName,
              timestamp: new Date().toISOString(),
              packaging: product.packaging || 'Unidade',
              batchId: sec,
              batchDate: '',
              sourceSector: sec,
              transferDestination: sec
            });
          }
        }
      }
    }

    if (createdTxs.length === 0) return;

    const updatedProduct: Product = {
      ...product,
      batches: updatedBatches
    };

    // 1. Atualização instantânea e suave na interface local do React
    setProducts(prev => {
      const next = prev.map(p => p.id === productId ? updatedProduct : p);
      localStorage.setItem('bv_products', safeJsonStringify(next));
      return next;
    });

    setTransactions(prev => {
      const next = [...createdTxs, ...prev];
      localStorage.setItem('bv_transactions', safeJsonStringify(next));
      return next;
    });

    // 2. Acumula no ref para evitar múltiplas escritas concorrentes no banco
    if (!pendingAdjustmentsRef.current[productId]) {
      pendingAdjustmentsRef.current[productId] = {
        timer: null,
        latestProduct: updatedProduct,
        txs: [...createdTxs]
      };
    } else {
      pendingAdjustmentsRef.current[productId].latestProduct = updatedProduct;
      pendingAdjustmentsRef.current[productId].txs.push(...createdTxs);
    }

    // 3. Debounce de gravação para enviar em lote ao Firestore somente depois que o usuário parar de clicar
    if (pendingAdjustmentsRef.current[productId].timer) {
      clearTimeout(pendingAdjustmentsRef.current[productId].timer!);
    }

    pendingAdjustmentsRef.current[productId].timer = setTimeout(async () => {
      const info = pendingAdjustmentsRef.current[productId];
      if (!info) return;

      if (currentUser && usingFirebase) {
        try {
          const b = writeBatch(db);
          b.set(doc(db, 'products', productId), sanitizeForFirestore(info.latestProduct));
          info.txs.forEach(t => {
            b.set(doc(db, 'transactions', t.id), sanitizeForFirestore(t));
          });
          await b.commit();
          console.log(`[Ajuste Rápido] Produto ${productId} e suas transações sincronizados com sucesso.`);
        } catch (err) {
          console.error("Erro ao persistir ajuste rápido na nuvem:", err);
        } finally {
          setTimeout(() => {
            if (pendingAdjustmentsRef.current[productId] === info) {
              delete pendingAdjustmentsRef.current[productId];
            }
          }, 500);
        }
      } else {
        delete pendingAdjustmentsRef.current[productId];
      }
    }, 600);
  };

  const handleQuickBatchQuantityChange = async (productArg: Product, batchId: string, delta: number) => {
    const productId = productArg.id;

    // Pega o produto mais atualizado em andamento, ou do estado do React se for o primeiro clique
    const product = pendingAdjustmentsRef.current[productId]?.latestProduct || products.find(p => p.id === productId) || productArg;

    let updatedBatches = product.batches.map(b => ({ ...b }));
    const targetIdx = updatedBatches.findIndex(b => b.id === batchId);
    if (targetIdx === -1) return;

    const targetBatch = updatedBatches[targetIdx];
    const newQty = targetBatch.quantity + delta;

    if (newQty < 0) {
      alert("Não é possível ter saldo negativo neste lote.");
      return;
    }

    if (newQty === 0) {
      if (!window.confirm(`O lote "${batchId}" ficará com saldo zero e será removido. Confirmar?`)) {
        return;
      }
      updatedBatches = updatedBatches.filter(b => b.id !== batchId);
    } else {
      updatedBatches[targetIdx] = {
        ...targetBatch,
        quantity: newQty
      };
    }

    const updatedProduct: Product = {
      ...product,
      batches: updatedBatches
    };

    const opName = currentUser?.displayName || 'Ajuste de Lote Rápido';
    const tx: Transaction = {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productId: product.id,
      productName: product.name,
      barcode: product.barcode || '',
      type: delta > 0 ? 'entrada' : 'saida',
      quantity: Math.abs(delta),
      operatorName: opName,
      timestamp: new Date().toISOString(),
      packaging: product.packaging || 'Unidade',
      batchId: batchId,
      batchDate: targetBatch.date,
      sourceSector: 'deposito'
    };

    // 1. Atualização instantânea na interface local
    setProducts(prev => {
      const next = prev.map(p => p.id === productId ? updatedProduct : p);
      localStorage.setItem('bv_products', safeJsonStringify(next));
      return next;
    });

    setTransactions(prev => {
      const next = [tx, ...prev];
      localStorage.setItem('bv_transactions', safeJsonStringify(next));
      return next;
    });

    // 2. Acumula no ref
    if (!pendingAdjustmentsRef.current[productId]) {
      pendingAdjustmentsRef.current[productId] = {
        timer: null,
        latestProduct: updatedProduct,
        txs: [tx]
      };
    } else {
      pendingAdjustmentsRef.current[productId].latestProduct = updatedProduct;
      pendingAdjustmentsRef.current[productId].txs.push(tx);
    }

    // 3. Debounce para persistência remota no Firestore
    if (pendingAdjustmentsRef.current[productId].timer) {
      clearTimeout(pendingAdjustmentsRef.current[productId].timer!);
    }

    pendingAdjustmentsRef.current[productId].timer = setTimeout(async () => {
      const info = pendingAdjustmentsRef.current[productId];
      if (!info) return;

      if (currentUser && usingFirebase) {
        try {
          const b = writeBatch(db);
          b.set(doc(db, 'products', productId), sanitizeForFirestore(info.latestProduct));
          info.txs.forEach(t => {
            b.set(doc(db, 'transactions', t.id), sanitizeForFirestore(t));
          });
          await b.commit();
          console.log(`[Ajuste de Lote Rápido] Lote de produto ${productId} sincronizado com sucesso.`);
        } catch (err) {
          console.error("Erro ao persistir ajuste de lote na nuvem:", err);
        } finally {
          setTimeout(() => {
            if (pendingAdjustmentsRef.current[productId] === info) {
              delete pendingAdjustmentsRef.current[productId];
            }
          }, 500);
        }
      } else {
        delete pendingAdjustmentsRef.current[productId];
      }
    }, 600);
  };

  const handleExportCSV = () => {
    if (products.length === 0) {
      alert("Nenhum produto em estoque para exportar.");
      return;
    }

    // Cabecalhos do CSV em Portugues para facil leitura no Excel
    const headers = [
      "ID do Produto",
      "Codigo de Barras",
      "Nome",
      "Categoria",
      "Subcategoria",
      "Estoque Minimo",
      "Embalagem",
      "Quantidade Total",
      "Descricao",
      "ID do Lote",
      "Validade do Lote",
      "Dias Restantes",
      "Quantidade do Lote",
      "Status do Lote"
    ];

    const rows: string[][] = [headers];

    products.forEach((product) => {
      const totalQty = product.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[product.id]?.totalTransferred || 0);
      const desc = (product.description || "").replace(/"/g, '""');

      if (product.batches.length === 0) {
        // Produto cadastrado sem lotes ou com estoque zerado
        rows.push([
          product.id,
          product.barcode,
          `"${product.name.replace(/"/g, '""')}"`,
          `"${product.category.replace(/"/g, '""')}"`,
          `"${product.subcategory.replace(/"/g, '""')}"`,
          product.minStock.toString(),
          `"${product.packaging.replace(/"/g, '""')}"`,
          totalQty.toString(),
          `"${desc}"`,
          "-",
          "-",
          "-",
          "0",
          "Sem Lote Ativo"
        ]);
      } else {
        product.batches.forEach((batch) => {
          const hasDate = Boolean(batch.date && batch.date.trim());
          const days = hasDate ? getDaysRemaining(batch.date) : 9999;
          let statusStr = "Sem Validade";
          if (hasDate) {
            if (days < 0) {
              statusStr = "Vencido";
            } else if (days <= 30) {
              statusStr = "Critico (Vence em breve)";
            } else {
              statusStr = "OK";
            }
          }

          rows.push([
            product.id,
            product.barcode,
            `"${product.name.replace(/"/g, '""')}"`,
            `"${product.category.replace(/"/g, '""')}"`,
            `"${product.subcategory.replace(/"/g, '""')}"`,
            product.minStock.toString(),
            `"${product.packaging.replace(/"/g, '""')}"`,
            totalQty.toString(),
            `"${desc}"`,
            batch.id,
            hasDate ? batch.date.split("-").reverse().join("/") : "A definir",
            hasDate ? days.toString() : "-",
            batch.quantity.toString(),
            statusStr
          ]);
        });
      }
    });

    // Usando ponto-e-virgula (;) e BOM UTF-8 (\uFEFF) para compatibilidade nativa com Excel no Windows/Mac brasileiro
    const csvContent = "\uFEFF" + rows.map((row) => row.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const DateStamp = new Date().toISOString().split('T')[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `BVE_Inventario_Export_${DateStamp}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCategorySummaryCSV = () => {
    const headers = [
      "Categoria",
      "Itens Cadastrados (Tipos)",
      "Estoque Total (Unidades)",
      "Lotes Ativos",
      "Lotes Vencidos",
      "Lotes em Alerta Critico"
    ];

    const rows: string[][] = [headers];

    categories.forEach((cat) => {
      const catProducts = products.filter(p => p.category === cat.name);
      const distinctTypes = catProducts.length;
      let totalStock = 0;
      let totalBatchesCount = 0;
      let expiredBatchesCount = 0;
      let criticalBatchesCount = 0;

      catProducts.forEach((prod) => {
        prod.batches.forEach((batch) => {
          totalStock += batch.quantity;
          totalBatchesCount++;
          const days = getDaysRemaining(batch.date);
          if (days < 0) {
            expiredBatchesCount++;
          } else if (days <= 30) {
            criticalBatchesCount++;
          }
        });
      });

      rows.push([
        `"${cat.name.replace(/"/g, '""')}"`,
        distinctTypes.toString(),
        totalStock.toString(),
        totalBatchesCount.toString(),
        expiredBatchesCount.toString(),
        criticalBatchesCount.toString()
      ]);
    });

    // Subtotal Row
    const overallDistinctTypes = products.length;
    let overallStock = 0;
    let overallBatches = 0;
    let overallExpired = 0;
    let overallCritical = 0;

    products.forEach((prod) => {
      prod.batches.forEach((b) => {
        overallStock += b.quantity;
        overallBatches++;
        const days = getDaysRemaining(b.date);
        if (days < 0) {
          overallExpired++;
        } else if (days <= 30) {
          overallCritical++;
        }
      });
    });

    rows.push([
      "TOTAL DE TODAS CATEGORIAS",
      overallDistinctTypes.toString(),
      overallStock.toString(),
      overallBatches.toString(),
      overallExpired.toString(),
      overallCritical.toString()
    ]);

    const csvContent = "\uFEFF" + rows.map((row) => row.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const DateStamp = new Date().toISOString().split('T')[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `BVE_Relatorio_Consolidado_Categorias_${DateStamp}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportSpecificCategoryCSV = (categoryName?: string, subcategoryName?: string) => {
    const cat = (categoryName && categoryName !== 'all') ? categoryName : undefined;
    const sub = (subcategoryName && subcategoryName !== 'all') ? subcategoryName : undefined;

    let filtered = products;
    if (cat) filtered = filtered.filter(p => p.category === cat);
    if (sub) filtered = filtered.filter(p => p.subcategory === sub);

    if (filtered.length === 0) {
      const filterDesc = cat && sub 
        ? `na categoria "${cat}" e subcategoria "${sub}"` 
        : cat 
          ? `na categoria "${cat}"` 
          : sub 
            ? `na subcategoria "${sub}"` 
            : '';
      alert(`Nenhum produto cadastrado ${filterDesc}.`);
      return;
    }

    const headers = [
      "ID do Produto",
      "Codigo de Barras",
      "Nome",
      "Categoria",
      "Subcategoria",
      "Estoque Minimo",
      "Embalagem",
      "Quantidade Total",
      "Descricao",
      "ID do Lote",
      "Validade do Lote",
      "Dias Restantes",
      "Quantidade do Lote",
      "Status do Lote"
    ];

    const rows: string[][] = [headers];

    filtered.forEach((product) => {
      const totalQty = product.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[product.id]?.totalTransferred || 0);
      const desc = (product.description || "").replace(/"/g, '""');

      if (product.batches.length === 0) {
        rows.push([
          product.id,
          product.barcode || 'S/B',
          `"${product.name.replace(/"/g, '""')}"`,
          `"${product.category.replace(/"/g, '""')}"`,
          `"${(product.subcategory || '').replace(/"/g, '""')}"`,
          product.minStock.toString(),
          `"${(product.packaging || 'un').replace(/"/g, '""')}"`,
          totalQty.toString(),
          `"${desc}"`,
          "-",
          "-",
          "-",
          "0",
          "Sem Lote Ativo"
        ]);
      } else {
        product.batches.forEach((batch) => {
          const hasDate = Boolean(batch.date && batch.date.trim());
          const days = hasDate ? getDaysRemaining(batch.date) : 9999;
          let statusStr = "Sem Validade";
          if (hasDate) {
            if (days < 0) {
              statusStr = "Vencido";
            } else if (days <= 30) {
              statusStr = "Critico (Vence em breve)";
            } else {
              statusStr = "OK";
            }
          }

          rows.push([
            product.id,
            product.barcode || 'S/B',
            `"${product.name.replace(/"/g, '""')}"`,
            `"${product.category.replace(/"/g, '""')}"`,
            `"${(product.subcategory || '').replace(/"/g, '""')}"`,
            product.minStock.toString(),
            `"${(product.packaging || 'un').replace(/"/g, '""')}"`,
            totalQty.toString(),
            `"${desc}"`,
            batch.id,
            hasDate ? batch.date.split("-").reverse().join("/") : "A definir",
            hasDate ? days.toString() : "-",
            batch.quantity.toString(),
            statusStr
          ]);
        });
      }
    });

    const csvContent = "\uFEFF" + rows.map((row) => row.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const DateStamp = new Date().toISOString().split('T')[0];
    let fileSuffix = '';
    if (cat) fileSuffix += `_${cat.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (sub) fileSuffix += `_${sub.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    link.setAttribute("href", url);
    link.setAttribute("download", `BVE_Relatorio${fileSuffix || '_Geral'}_${DateStamp}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = (filterCategory?: string, filterSubcategory?: string) => {
    if (products.length === 0) {
      alert("Nenhum produto em estoque para gerar o PDF.");
      return;
    }

    const cat = (filterCategory && filterCategory !== 'all') ? filterCategory : undefined;
    const sub = (filterSubcategory && filterSubcategory !== 'all') ? filterSubcategory : undefined;

    let filtered = products;
    if (cat) {
      filtered = filtered.filter(p => p.category === cat);
    }
    if (sub) {
      filtered = filtered.filter(p => p.subcategory === sub);
    }

    if (filtered.length === 0) {
      const filterDesc = cat && sub 
        ? `na categoria "${cat}" e subcategoria "${sub}"` 
        : cat 
          ? `na categoria "${cat}"` 
          : sub 
            ? `na subcategoria "${sub}"` 
            : '';
      alert(`Nenhum produto cadastrado ${filterDesc}.`);
      return;
    }

    // Ordenar de forma limpa por Categoria, Subcategoria e Nome do Produto
    const sorted = [...filtered].sort((a, b) => {
      const cA = a.category || '';
      const cB = b.category || '';
      if (cA !== cB) return cA.localeCompare(cB);
      const sA = a.subcategory || '';
      const sB = b.subcategory || '';
      if (sA !== sB) return sA.localeCompare(sB);
      return a.name.localeCompare(b.name);
    });

    const doc = new jsPDF();
    
    // Coletar totais e alertas
    let totalStock = 0;
    let expiredCount = 0;
    let criticalCount = 0;
    let lowStockCount = 0;

    sorted.forEach(p => {
      const activeTotal = p.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[p.id]?.totalTransferred || 0);
      totalStock += activeTotal;
      if (activeTotal < p.minStock) lowStockCount++;
      
      p.batches.forEach(b => {
        const d = getDaysRemaining(b.date);
        if (d < 0) expiredCount++;
        else if (d <= 30) criticalCount++;
      });
    });

    // Elegant Header Banner
    doc.setFillColor(15, 23, 42); // slate-900 background for top banner
    doc.rect(0, 0, 210, 42, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('BV ATACAREJO - LOGÍSTICA & ESTOQUE', 14, 15);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(203, 213, 225); // slate-300
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    doc.text(`Relatório Gerencial do Inventário • Gerado em ${formattedDate}`, 14, 22);

    // Linha de filtro explícito por categoria e subcategoria
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(245, 158, 11); // amber-400
    if (cat && sub) {
      doc.text(`FILTRO: Categoria "${cat.toUpperCase()}"  >  Subcategoria "${sub.toUpperCase()}"`, 14, 30);
    } else if (cat) {
      doc.text(`FILTRO: Categoria "${cat.toUpperCase()}" (Todas as Subcategorias)`, 14, 30);
    } else if (sub) {
      doc.text(`FILTRO: Subcategoria "${sub.toUpperCase()}" (Todas as Categorias)`, 14, 30);
    } else {
      doc.text('FILTRO: Inventário Geral (Consolidado por Categoria e Subcategoria)', 14, 30);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Assinatura digital do sistema • Total de ${sorted.length} itens listados`, 14, 36);

    // Info cards/boxes inside the PDF
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('Métricas Consolidadas do Filtro:', 14, 49);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85); // slate-700
    
    doc.rect(14, 53, 182, 15, 'S'); // border
    doc.line(58, 53, 58, 68);
    doc.line(102, 53, 102, 68);
    doc.line(146, 53, 146, 68);

    doc.text(`Total SKU: ${sorted.length}`, 17, 62);
    doc.text(`Total Volumes: ${totalStock} un`, 61, 62);
    
    if (expiredCount > 0) {
      doc.setTextColor(220, 38, 38); // red
      doc.text(`Vencidos: ${expiredCount} itens 🚨`, 105, 62);
    } else {
      doc.setTextColor(22, 163, 74); // green
      doc.text(`Vencidos: 0 conformidade`, 105, 62);
    }
    
    doc.setTextColor(51, 65, 85);
    if (lowStockCount > 0) {
      doc.setTextColor(217, 119, 6); // amber
      doc.text(`Baixo Estoque: ${lowStockCount} itens`, 149, 62);
    } else {
      doc.text(`Estoques Estáveis`, 149, 62);
    }

    const tableRows = sorted.map(product => {
      const activeTotalQty = product.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[product.id]?.totalTransferred || 0);
      const prExpired = product.batches.filter(b => getDaysRemaining(b.date) < 0).length;
      const prCritical = product.batches.filter(b => {
        const days = getDaysRemaining(b.date);
        return days >= 0 && days <= 30;
      }).length;

      let alertStatus = 'CONFORME';
      if (prExpired > 0) {
        alertStatus = `🚨 ${prExpired} VENCIDO`;
      } else if (activeTotalQty === 0) {
        alertStatus = '❌ SEM ESTOQUE';
      } else if (prCritical > 0) {
        alertStatus = `⏰ CRÍTICO`;
      } else if (activeTotalQty < product.minStock) {
        alertStatus = `⚠️ BAIXO`;
      }

      // Format batches text cleanly
      const batchesText = product.batches.map(b => {
        if (!b.date || !b.date.trim()) {
          return `[Lote: ${b.id}; Val: Sem data; Qtd: ${b.quantity}un]`;
        }
        const remDays = getDaysRemaining(b.date);
        const dateFormatted = b.date.split('-').reverse().join('/');
        let label = '';
        if (remDays < 0) label = ' (VENCIDO)';
        else if (remDays <= 30) label = ' (CRÍTICO)';
        return `[Lote: ${b.id}; Val: ${dateFormatted}; Qtd: ${b.quantity}un${label}]`;
      }).join('\n') || 'Nenhum lote ativo registrado';

      return [
        product.barcode || 'S/B',
        product.name + (product.brand ? ` [${product.brand}]` : ''),
        product.category || 'Geral',
        product.subcategory || '-',
        batchesText,
        `${activeTotalQty} ${product.packaging || 'un'}`,
        alertStatus
      ];
    });

    doc.setTextColor(15, 23, 42); // slate-900 for general texts
    
    // AutoTable generating
    autoTable(doc, {
      startY: 74,
      head: [['Código/EAN', 'Produto / Marca', 'Categoria', 'Subcategoria', 'Lotes / Validades', 'Estoque', 'Status']],
      body: tableRows,
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        valign: 'middle'
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 23 }, // EAN
        1: { cellWidth: 38, fontStyle: 'bold' }, // Produto
        2: { cellWidth: 24 }, // Categoria
        3: { cellWidth: 24 }, // Subcategoria
        4: { cellWidth: 41 }, // Lotes Info
        5: { cellWidth: 16, fontStyle: 'bold', halign: 'center' }, // Total qty
        6: { cellWidth: 16, fontStyle: 'bold', halign: 'center' } // Status
      },
      didDrawPage: (data) => {
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // slate-400
        const filterStr = cat ? ` • Categoria: ${cat}${sub ? ` > ${sub}` : ''}` : '';
        const str = `Página ${data.pageNumber} • BV Atacarejo Sistema de Logística${filterStr}`;
        doc.text(str, 14, doc.internal.pageSize.height - 10);
      }
    });

    const DateStamp = new Date().toISOString().split('T')[0];
    let fileSuffix = '';
    if (cat) fileSuffix += `_${cat.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (sub) fileSuffix += `_${sub.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    doc.save(`BV_Atacarejo_Relatorio${fileSuffix || '_Geral'}_${DateStamp}.pdf`);
  };

  const handleExportPDFByBrand = (brandName: string) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const brandProducts = products.filter(p => (brandName === 'Sem Fabricante' ? (!p.brand || !p.brand.trim()) : p.brand?.trim() === brandName));
    
    if (brandProducts.length === 0) {
      alert(`Nenhum produto cadastrado para o fabricante "${brandName}".`);
      return;
    }

    const sorted = [...brandProducts].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    
    let totalStock = 0;
    let expiredCount = 0;
    let criticalCount = 0;
    let lowStockCount = 0;

    sorted.forEach(p => {
      const activeTotal = p.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[p.id]?.totalTransferred || 0);
      totalStock += activeTotal;
      if (activeTotal < p.minStock) lowStockCount++;
      p.batches.forEach(b => {
        const d = getDaysRemaining(b.date);
        if (d < 0) expiredCount++;
        else if (d <= 30) criticalCount++;
      });
    });

    // Elegant Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 42, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('BV ATACAREJO - LOGÍSTICA & ESTOQUE', 14, 15);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(203, 213, 225);
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    doc.text(`Relatório do Fabricante • Gerado em ${formattedDate}`, 14, 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(16, 185, 129); // emerald-400
    doc.text(`FABRICANTE / INDÚSTRIA: ${brandName.toUpperCase()}`, 14, 31);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Catálogo oficial • Total de ${sorted.length} itens cadastrados deste fabricante`, 14, 37);

    // KPI boxes
    doc.rect(14, 46, 182, 14, 'S');
    doc.line(60, 46, 60, 60);
    doc.line(106, 46, 106, 60);
    doc.line(152, 46, 152, 60);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`Total SKUs: ${sorted.length}`, 17, 54);
    doc.text(`Total Volumes: ${totalStock} un`, 63, 54);
    if (expiredCount > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text(`Vencidos: ${expiredCount} itens 🚨`, 109, 54);
    } else {
      doc.setTextColor(22, 163, 74);
      doc.text(`Vencidos: 0 conformidade`, 109, 54);
    }
    doc.setTextColor(lowStockCount > 0 ? 217 : 30, lowStockCount > 0 ? 119 : 41, lowStockCount > 0 ? 6 : 59);
    doc.text(lowStockCount > 0 ? `Baixo Estoque: ${lowStockCount}` : `Estoque Normal`, 155, 54);

    const tableRows = sorted.map(product => {
      const activeTotalQty = product.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[product.id]?.totalTransferred || 0);
      const prExpired = product.batches.filter(b => getDaysRemaining(b.date) < 0).length;
      const prCritical = product.batches.filter(b => {
        const days = getDaysRemaining(b.date);
        return days >= 0 && days <= 30;
      }).length;

      let alertStatus = 'CONFORME';
      if (prExpired > 0) {
        alertStatus = `🚨 ${prExpired} VENCIDO`;
      } else if (activeTotalQty === 0) {
        alertStatus = '❌ SEM ESTOQUE';
      } else if (prCritical > 0) {
        alertStatus = `⏰ CRÍTICO`;
      } else if (activeTotalQty < product.minStock) {
        alertStatus = `⚠️ BAIXO`;
      }

      const validadeSumm = getProductValidadeSummary(product).text;

      return [
        product.barcode || 'S/B',
        product.name,
        product.category,
        product.packaging || 'unidade',
        `${activeTotalQty} un`,
        validadeSumm,
        alertStatus
      ];
    });

    autoTable(doc, {
      startY: 65,
      head: [['Código (EAN)', 'Nome do Item', 'Categoria', 'Embalagem', 'Saldo', 'Validade', 'Situação']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left'
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: [30, 41, 59]
      },
      columnStyles: {
        0: { cellWidth: 26, font: 'courier' },
        1: { cellWidth: 46 },
        2: { cellWidth: 25 },
        3: { cellWidth: 22 },
        4: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 25, halign: 'center' },
        6: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }
      }
    });

    const DateStamp = new Date().toISOString().split('T')[0];
    const safeBrand = brandName.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`BVE_Fabricante_${safeBrand}_${DateStamp}.pdf`);
  };

  const handleShareWhatsApp = (filterCategory?: string, filterSubcategory?: string) => {
    const cat = (filterCategory && filterCategory !== 'all') ? filterCategory : undefined;
    const sub = (filterSubcategory && filterSubcategory !== 'all') ? filterSubcategory : undefined;

    let filtered = products;
    if (cat) filtered = filtered.filter(p => p.category === cat);
    if (sub) filtered = filtered.filter(p => p.subcategory === sub);

    if (filtered.length === 0) {
      alert("Nenhum produto cadastrado para compartilhar no WhatsApp.");
      return;
    }

    let totalStock = 0;
    let expiredCount = 0;
    let criticalCount = 0;
    let lowStockCount = 0;

    filtered.forEach(p => {
      const activeTotal = p.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[p.id]?.totalTransferred || 0);
      totalStock += activeTotal;
      if (activeTotal < p.minStock) lowStockCount++;
      
      p.batches.forEach(b => {
        const d = getDaysRemaining(b.date);
        if (d < 0) expiredCount++;
        else if (d <= 30) criticalCount++;
      });
    });

    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let filterLabel = 'Geral (Todos os Setores)';
    if (cat && sub) filterLabel = `${cat.toUpperCase()} > ${sub.toUpperCase()}`;
    else if (cat) filterLabel = `${cat.toUpperCase()} (Todas as Subcategorias)`;
    else if (sub) filterLabel = `Subcategoria: ${sub.toUpperCase()}`;

    let msg = `*${whatsappPreamble}*\n\n`;
    msg += `📦 *RELATÓRIO DE ESTOQUE - BV ATACAREJO*\n`;
    msg += `📅 *Gerado em:* ${formattedDate}\n`;
    msg += `📂 *Filtro:* ${filterLabel}\n\n`;
    
    msg += `📊 *MÉTRICAS DE CONTROLE:*\n`;
    msg += `• SKU Cadastrados: *${filtered.length}*\n`;
    msg += `• Quantidade Total no Estoque: *${totalStock} volumes*\n`;
    
    if (expiredCount > 0) {
      msg += `• Itens Vencidos: *${expiredCount}* 🚨\n`;
    } else {
      msg += `• Itens Vencidos: *Nenhum (Tudo em dia)* ✅\n`;
    }

    if (criticalCount > 0) {
      msg += `• Itens Críticos (Próximos do Vencimento): *${criticalCount}* ⏰\n`;
    }
    if (lowStockCount > 0) {
      msg += `• Itens com Baixo Estoque: *${lowStockCount}* ⚠️\n`;
    }
    
    msg += `\n🚨 *ITENS EM DESTAQUE / ALERTA:*\n`;
    let itemsInFocus = 0;

    filtered.forEach(p => {
      const activeTotal = p.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[p.id]?.totalTransferred || 0);
      const prExpired = p.batches.filter(b => getDaysRemaining(b.date) < 0).length;
      const prCritical = p.batches.filter(b => {
        const days = getDaysRemaining(b.date);
        return days >= 0 && days <= 30;
      }).length;

      if (prExpired > 0 || prCritical > 0 || activeTotal < p.minStock || activeTotal === 0) {
        itemsInFocus++;
        if (itemsInFocus <= 10) {
          let statusLabel = '';
          if (prExpired > 0) statusLabel = '🚨 VENCIDO';
          else if (activeTotal === 0) statusLabel = '❌ SEM ESTOQUE';
          else if (prCritical > 0) statusLabel = '⏰ CRÍTICO VALIDADE';
          else if (activeTotal < p.minStock) statusLabel = '⚠️ BAIXO ESTOQUE';

          msg += `- *${p.name}* (${p.barcode || 'S/B'}): *${activeTotal} ${p.packaging || 'un'}* [${statusLabel}]\n`;
        }
      }
    });

    if (itemsInFocus === 0) {
      msg += `_Nenhum alerta pendente! Estoques estão em dia e seguros._ ✅\n`;
    } else if (itemsInFocus > 10) {
      msg += `_e mais ${itemsInFocus - 10} outros itens em alerta no PDF completo._\n`;
    }

    msg += `\n📥 *Nota:* O arquivo PDF completo filtrado foi gerado e baixado no seu aparelho. Adicione ele à conversa do WhatsApp para o relatório oficial empresarial.`;

    // Automatically trigger PDF download first so they have it
    handleExportPDF(cat, sub);

    // Encode message
    const encodedMessage = encodeURIComponent(msg);
    
    // Check if phone number is provided, format it
    let cleanPhone = whatsappNumber.replace(/\D/g, '');
    if (cleanPhone && !cleanPhone.startsWith('55') && cleanPhone.length <= 11) {
      cleanPhone = '55' + cleanPhone; // prepend Brazilian country code if missing
    }

    const whatsappUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`
      : `https://api.whatsapp.com/send?text=${encodedMessage}`;

    // Open WhatsApp
    window.open(whatsappUrl, '_blank');
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || isSavingProduct) return;

    // Se o item já estiver cadastrado (por código de barras ou por nome), NÃO aceitar o cadastramento e avisar o motivo!
    if (duplicateConflict) {
      setIsSavingProduct(false);
      setDuplicateRejectionModal(duplicateConflict);
      return;
    }

    setIsSavingProduct(true);

    const trimmedBarcode = newProdBarcode ? newProdBarcode.trim() : '';
    // Código de barras 100% opcional: pode ser deixado em branco
    const finalBarcode = trimmedBarcode;

    const newProdId = `p-${Date.now()}`;
    const initialQty = parseInt(newProdBatchQty) || 0;
    const finalBatchDate = newProdBatchDate ? newProdBatchDate.trim() : '';
    
    // Create initial batch with optional expiration date
    const initialBatches: Batch[] = [];
    if (initialQty > 0 || finalBatchDate || newProdBatchId.trim()) {
      initialBatches.push({
        id: newProdBatchId.trim() || `l-${Date.now().toString().slice(-4)}`,
        date: finalBatchDate, // Empty string if user chooses to define validity later
        quantity: Math.max(0, initialQty)
      });
    }

    const newProduct: Product = {
      id: newProdId,
      name: newProdName.trim(),
      barcode: finalBarcode,
      category: newProdCategory,
      subcategory: newProdSubcategory,
      minStock: Math.max(0, parseInt(newProdMinStock) || 0),
      packaging: newProdPackaging,
      batches: initialBatches,
      ...(newProdDescription.trim() ? { description: newProdDescription.trim() } : {}),
      ...(newProdBrand.trim() ? { brand: newProdBrand.trim() } : {}),
      ...(newProdWeightVolume.trim() ? { weightVolume: newProdWeightVolume.trim() } : {}),
      ...(newProdImage.trim() ? { image: newProdImage.trim() } : {})
    };

    const operatorName = currentUser?.displayName || 'Operador Central';
    let initialTx: Transaction | null = null;
    if (initialBatches.length > 0 && initialBatches[0].quantity > 0) {
      initialTx = {
        id: `t-${Date.now()}`,
        productId: newProduct.id,
        productName: newProduct.name,
        barcode: newProduct.barcode,
        type: 'entrada',
        quantity: initialBatches[0].quantity,
        operatorName,
        timestamp: new Date().toISOString(),
        packaging: newProduct.packaging,
        batchId: initialBatches[0].id,
        batchDate: initialBatches[0].date,
        ...(newProdNfPhoto ? { nfPhoto: newProdNfPhoto } : {})
      };
    }

    // 1. UPDATE STATE OPTIMISTICALLY IMMEDIATELY (Feels instant, 0 delay regardless of network speed!)
    const updatedProducts = [newProduct, ...products];
    const updatedTxs = initialTx ? [initialTx, ...transactions] : transactions;
    setProducts(updatedProducts);
    setTransactions(updatedTxs);
    localStorage.setItem('bv_products', JSON.stringify(updatedProducts));
    localStorage.setItem('bv_transactions', JSON.stringify(updatedTxs));

    // 2. TRIGGER SUCCESS NOTIFICATION, CONFETTI & CLOSE MODAL INSTANTLY
    setNewProdName('');
    setNewProdBarcode('');
    setNewProdDescription('');
    setNewProdBrand('');
    setNewProdWeightVolume('');
    setNewProdImage('');
    setNewProdNfPhoto('');
    setNewProdBatchId('');
    setNewProdBatchDate('');
    setNewProdBatchQty('10');
    setShowAddProductModal(false);
    setProductSavedSuccess(newProduct);
    confetti({ particleCount: 70 });
    setIsSavingProduct(false);

    // 3. PERSIST TO FIREBASE ASYNCHRONOUSLY IN THE BACKGROUND
    if (currentUser && usingFirebase) {
      setDoc(doc(db, 'products', newProduct.id), sanitizeForFirestore(newProduct))
        .catch(err => {
          console.error("Erro em background ao persistir produto:", err);
          handleFirestoreError(err, OperationType.WRITE, `products/${newProduct.id}`);
        });
      if (initialTx) {
        setDoc(doc(db, 'transactions', initialTx.id), sanitizeForFirestore(initialTx))
          .catch(err => {
            console.error("Erro em background ao persistir transação inicial:", err);
            handleFirestoreError(err, OperationType.WRITE, `transactions/${initialTx.id}`);
          });
      }
    }
  };

  // Permite alterar a embalagem de um produto já cadastrado diretamente pelo formulário ou modal de duplicidade
  const handleUpdateExistingProductPackaging = async (
    existingProduct: Product,
    newPackaging: string,
    includeBatch: boolean = true
  ) => {
    setIsSavingProduct(true);
    const finalPackaging = newPackaging.trim() || 'unidade';
    const initialQty = parseInt(newProdBatchQty) || 0;
    const finalBatchDate = newProdBatchDate ? newProdBatchDate.trim() : '';

    let updatedBatches = [...(existingProduct.batches || [])];
    let initialTx: Transaction | null = null;

    if (includeBatch && initialQty > 0) {
      const newBatchId = newProdBatchId.trim() || `l-${Date.now().toString().slice(-4)}`;
      const newBatch: Batch = {
        id: newBatchId,
        date: finalBatchDate,
        quantity: Math.max(0, initialQty)
      };
      updatedBatches.push(newBatch);

      initialTx = {
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: existingProduct.id,
        productName: existingProduct.name,
        barcode: existingProduct.barcode || '',
        type: 'entrada',
        quantity: initialQty,
        operatorName: currentUser?.displayName || 'Operador Central',
        timestamp: new Date().toISOString(),
        packaging: finalPackaging,
        batchId: newBatch.id,
        batchDate: newBatch.date,
        ...(newProdNfPhoto ? { nfPhoto: newProdNfPhoto } : {})
      };
    }

    const updatedProduct: Product = {
      ...existingProduct,
      packaging: finalPackaging,
      batches: updatedBatches
    };

    // 1. Atualiza estado imediatamente (otimista)
    const updatedProducts = products.map(p => p.id === existingProduct.id ? updatedProduct : p);
    const updatedTxs = initialTx ? [initialTx, ...transactions] : transactions;
    setProducts(updatedProducts);
    setTransactions(updatedTxs);
    localStorage.setItem('bv_products', JSON.stringify(updatedProducts));
    localStorage.setItem('bv_transactions', JSON.stringify(updatedTxs));

    // 2. Limpa o formulário e fecha os modais
    setNewProdName('');
    setNewProdBarcode('');
    setNewProdDescription('');
    setNewProdBrand('');
    setNewProdWeightVolume('');
    setNewProdImage('');
    setNewProdNfPhoto('');
    setNewProdBatchId('');
    setNewProdBatchDate('');
    setNewProdBatchQty('10');
    setShowAddProductModal(false);
    setDuplicateRejectionModal(null);
    setIsSavingProduct(false);

    // 3. Efeito de sucesso e feedback
    setProductSavedSuccess(updatedProduct);
    confetti({ particleCount: 70 });

    // 4. Persiste no Firebase em background
    if (currentUser && usingFirebase) {
      setDoc(doc(db, 'products', existingProduct.id), sanitizeForFirestore(updatedProduct))
        .catch(err => {
          console.error("Erro ao atualizar embalagem no Firestore:", err);
          handleFirestoreError(err, OperationType.WRITE, `products/${existingProduct.id}`);
        });
      if (initialTx) {
        setDoc(doc(db, 'transactions', initialTx.id), sanitizeForFirestore(initialTx))
          .catch(err => {
            console.error("Erro ao registrar entrada no Firestore:", err);
            handleFirestoreError(err, OperationType.WRITE, `transactions/${initialTx.id}`);
          });
      }
    }
  };

  // Permite cadastrar como uma nova variação de embalagem do produto
  const handleSaveAsPackagingVariation = async (existingProduct: Product) => {
    setIsSavingProduct(true);
    const finalBarcode = newProdBarcode ? newProdBarcode.trim() : '';
    const newProdId = `p-${Date.now()}`;
    const initialQty = parseInt(newProdBatchQty) || 0;
    const finalBatchDate = newProdBatchDate ? newProdBatchDate.trim() : '';
    const finalPackaging = newProdPackaging.trim() || 'unidade';
    
    const initialBatches: Batch[] = [];
    if (initialQty > 0 || finalBatchDate || newProdBatchId.trim()) {
      initialBatches.push({
        id: newProdBatchId.trim() || `l-${Date.now().toString().slice(-4)}`,
        date: finalBatchDate,
        quantity: Math.max(0, initialQty)
      });
    }

    const variationName = `${newProdName.trim()} (${finalPackaging})`;

    const newProduct: Product = {
      id: newProdId,
      name: variationName,
      barcode: finalBarcode,
      category: newProdCategory,
      subcategory: newProdSubcategory,
      minStock: Math.max(0, parseInt(newProdMinStock) || 0),
      packaging: finalPackaging,
      batches: initialBatches,
      ...(newProdDescription.trim() ? { description: newProdDescription.trim() } : {}),
      ...(newProdBrand.trim() ? { brand: newProdBrand.trim() } : {}),
      ...(newProdWeightVolume.trim() ? { weightVolume: newProdWeightVolume.trim() } : {}),
      ...(newProdImage.trim() ? { image: newProdImage.trim() } : {})
    };

    let initialTx: Transaction | null = null;
    if (initialBatches.length > 0 && initialBatches[0].quantity > 0) {
      initialTx = {
        id: `t-${Date.now()}`,
        productId: newProduct.id,
        productName: newProduct.name,
        barcode: newProduct.barcode,
        type: 'entrada',
        quantity: initialBatches[0].quantity,
        operatorName: currentUser?.displayName || 'Operador Central',
        timestamp: new Date().toISOString(),
        packaging: newProduct.packaging,
        batchId: initialBatches[0].id,
        batchDate: initialBatches[0].date,
        ...(newProdNfPhoto ? { nfPhoto: newProdNfPhoto } : {})
      };
    }

    const updatedProducts = [newProduct, ...products];
    const updatedTxs = initialTx ? [initialTx, ...transactions] : transactions;
    setProducts(updatedProducts);
    setTransactions(updatedTxs);
    localStorage.setItem('bv_products', JSON.stringify(updatedProducts));
    localStorage.setItem('bv_transactions', JSON.stringify(updatedTxs));

    setNewProdName('');
    setNewProdBarcode('');
    setNewProdDescription('');
    setNewProdBrand('');
    setNewProdWeightVolume('');
    setNewProdImage('');
    setNewProdNfPhoto('');
    setNewProdBatchId('');
    setNewProdBatchDate('');
    setNewProdBatchQty('10');
    setShowAddProductModal(false);
    setDuplicateRejectionModal(null);
    setProductSavedSuccess(newProduct);
    confetti({ particleCount: 70 });
    setIsSavingProduct(false);

    if (currentUser && usingFirebase) {
      setDoc(doc(db, 'products', newProduct.id), sanitizeForFirestore(newProduct))
        .catch(err => {
          console.error("Erro ao persistir variação no Firestore:", err);
          handleFirestoreError(err, OperationType.WRITE, `products/${newProduct.id}`);
        });
      if (initialTx) {
        setDoc(doc(db, 'transactions', initialTx.id), sanitizeForFirestore(initialTx))
          .catch(err => {
            console.error("Erro ao persistir transação no Firestore:", err);
            handleFirestoreError(err, OperationType.WRITE, `transactions/${initialTx.id}`);
          });
      }
    }
  };

  const handleAddProductFromGtin = async (product: Product, tx: Transaction) => {
    const updatedProducts = [...products, product];
    const updatedTxs = [tx, ...transactions];
    setProducts(updatedProducts);
    setTransactions(updatedTxs);
    localStorage.setItem('bv_products', JSON.stringify(updatedProducts));
    localStorage.setItem('bv_transactions', JSON.stringify(updatedTxs));

    if (currentUser && usingFirebase) {
      try {
        await setDoc(doc(db, 'products', product.id), sanitizeForFirestore(product));
        await setDoc(doc(db, 'transactions', tx.id), sanitizeForFirestore(tx));
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `products/${product.id}`);
      }
    }
    setProductSavedSuccess(product);
    confetti({ particleCount: 70 });
  };

  const handleImportProductsAndTransactions = async (updatedProductsList: Product[], newTransactions: Transaction[]) => {
    setProducts(updatedProductsList);
    setTransactions(prev => [...newTransactions, ...prev]);
    localStorage.setItem('bv_products', JSON.stringify(updatedProductsList));
    localStorage.setItem('bv_transactions', JSON.stringify([...newTransactions, ...transactions]));

    if (currentUser && usingFirebase) {
      try {
        const batch = writeBatch(db);
        updatedProductsList.forEach(p => {
          batch.set(doc(db, 'products', p.id), sanitizeForFirestore(p));
        });
        newTransactions.forEach(tx => {
          batch.set(doc(db, 'transactions', tx.id), sanitizeForFirestore(tx));
        });
        await batch.commit();
        console.log("[NF-e Import] Batched products and transactions saved successfully to Cloud Firestore.");
      } catch (err) {
        console.error("Firestore batch commit failed for NF-e import:", err);
      }
    }
  };

  // Mass Excel/CSV bulk import handler with chunked Firestore batch writes
  const handleBulkImportConfirmed = async (
    newProducts: Product[],
    updatedProducts: Product[],
    newTransactions: Transaction[]
  ) => {
    // 1. Build unified updated products list
    const updatedMap = new Map<string, Product>();
    updatedProducts.forEach(p => updatedMap.set(p.id, p));

    const finalProductsList = [
      ...newProducts,
      ...products.map(p => updatedMap.get(p.id) || p)
    ];

    const finalTransactionsList = [...newTransactions, ...transactions];

    // 2. Optimistic UI and local storage update
    setProducts(finalProductsList);
    setTransactions(finalTransactionsList);
    localStorage.setItem('bv_products', safeJsonStringify(finalProductsList));
    localStorage.setItem('bv_transactions', safeJsonStringify(finalTransactionsList));

    // 3. Auto-add any new categories introduced by the imported products
    const newCategoryNames = new Set<string>();
    newProducts.forEach(p => {
      if (p.category && !categories.some(c => c.name.toLowerCase() === p.category.toLowerCase())) {
        newCategoryNames.add(p.category);
      }
    });
    if (newCategoryNames.size > 0) {
      const addedCats: Category[] = Array.from(newCategoryNames).map(catName => ({
        id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: catName,
        subcategories: []
      }));
      const updatedCategoriesList = [...categories, ...addedCats];
      handleUpdateCategories(updatedCategoriesList);
    }

    // 4. Persist to Firestore in safe chunks (max 350 writes per batch to respect 500 limit)
    if (currentUser && usingFirebase) {
      try {
        const allOperations: { type: 'product' | 'tx'; data: any; id: string }[] = [];
        newProducts.forEach(p => allOperations.push({ type: 'product', data: p, id: p.id }));
        updatedProducts.forEach(p => allOperations.push({ type: 'product', data: p, id: p.id }));
        newTransactions.forEach(t => allOperations.push({ type: 'tx', data: t, id: t.id }));

        const CHUNK_SIZE = 350;
        for (let i = 0; i < allOperations.length; i += CHUNK_SIZE) {
          const chunk = allOperations.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach(op => {
            if (op.type === 'product') {
              batch.set(doc(db, 'products', op.id), sanitizeForFirestore(op.data));
            } else {
              batch.set(doc(db, 'transactions', op.id), sanitizeForFirestore(op.data));
            }
          });
          await batch.commit();
        }
        console.log(`[Bulk Import] ${allOperations.length} operações salvas com sucesso no Cloud Firestore.`);
      } catch (err) {
        console.error("Erro ao sincronizar importação em massa no Firestore:", err);
        handleFirestoreError(err, OperationType.WRITE, 'products/bulk_import');
      }
    }
  };

  const handleUpdateProductFromGtin = async (product: Product) => {
    const updated = products.map(p => p.id === product.id ? product : p);
    setProducts(updated);
    localStorage.setItem('bv_products', JSON.stringify(updated));

    if (currentUser && usingFirebase) {
      try {
        await setDoc(doc(db, 'products', product.id), sanitizeForFirestore(product));
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `products/${product.id}`);
      }
    }
  };

  const handleAddGtinHistory = async (history: any) => {
    const updated = [history, ...gtinHistory];
    setGtinHistory(updated);
    localStorage.setItem('bv_historico_gtin', JSON.stringify(updated));

    if (currentUser && usingFirebase) {
      try {
        await setDoc(doc(db, 'historico_gtin', history.id), sanitizeForFirestore(history));
      } catch (err) {
        console.error("Firestore error historico_gtin write: ", err);
      }
    }
  };

  const handleRegisterMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForMovement) return;

    // Resolve sempre a versão mais atualizada do produto para evitar estado obsoleto
    const targetProduct =
      pendingAdjustmentsRef.current[selectedProductForMovement.id]?.latestProduct ||
      products.find(p => p.id === selectedProductForMovement.id) ||
      selectedProductForMovement;

    const qty = Math.max(1, Math.abs(parseInt(moveQuantity) || 0));
    const opName = moveOperatorName.trim() || currentUser?.displayName || 'Operador Geral';

    const depQty = (targetProduct.batches || []).reduce((sum, b) => sum + b.quantity, 0);
    const sectorSums = productSectorsSums[targetProduct.id] || { loja: 0, anexo: 0, '3019': 0, totalTransferred: 0 };
    const totalAvailable = depQty + sectorSums.totalTransferred;

    const isSemLote = 
      moveBatchId === 'sem-lote' || 
      moveBatchId === 'loja' ||
      moveBatchId === 'anexo' ||
      moveBatchId === '3019' ||
      !moveBatchId || 
      !targetProduct.batches || 
      targetProduct.batches.length === 0;

    // Preliminary client-side validations to give fast feedback
    if (movementType === 'saida') {
      if (totalAvailable <= 0) {
        alert(`O produto "${targetProduct.name}" está com saldo zerado no estoque.`);
        return;
      }
      if (qty > totalAvailable) {
        alert(`Estoque insuficiente! Saldo total disponível: ${totalAvailable} ${targetProduct.packaging || 'un'}. Solicitado para baixa: ${qty}.`);
        return;
      }
    } else if (movementType === 'transferencia') {
      if (!transferDestination) {
        alert('Selecione o destino da transferência (Loja, Anexo ou Setor 3019)!');
        return;
      }
      if (depQty < qty) {
        alert(`Saldo insuficiente no Depósito para transferência! Disponível no depósito: ${depQty} ${targetProduct.packaging || 'un'}. Solicitado: ${qty}.`);
        return;
      }
    }

    let updatedBatches = (targetProduct.batches || []).map(b => ({ ...b }));
    const createdTxs: Transaction[] = [];
    let bId = moveBatchId.trim() || (isSemLote ? 'sem-lote' : `l-${Date.now()}`);
    let bDate = moveBatchDate ? moveBatchDate.trim() : '';

    const deductFromDepositoBatches = (needed: number): { deducted: number; usedBatchId: string; usedBatchDate: string } => {
      let rem = needed;
      let deducted = 0;
      let usedBatchId = '';
      let usedBatchDate = '';

      if (!isSemLote) {
        const batchIndex = updatedBatches.findIndex(b => b.id === moveBatchId);
        if (batchIndex >= 0 && updatedBatches[batchIndex].quantity > 0) {
          usedBatchId = updatedBatches[batchIndex].id;
          usedBatchDate = updatedBatches[batchIndex].date || '';
          const canTake = Math.min(updatedBatches[batchIndex].quantity, rem);
          updatedBatches[batchIndex].quantity -= canTake;
          rem -= canTake;
          deducted += canTake;
        }
      }

      if (rem > 0) {
        updatedBatches = updatedBatches.map(b => {
          if (rem <= 0 || b.quantity <= 0) return b;
          if (!usedBatchId) {
            usedBatchId = b.id;
            usedBatchDate = b.date || '';
          }
          const canTake = Math.min(b.quantity, rem);
          rem -= canTake;
          deducted += canTake;
          return { ...b, quantity: b.quantity - canTake };
        });
      }

      updatedBatches = updatedBatches.filter(b => b.quantity > 0);
      return {
        deducted,
        usedBatchId: usedBatchId || 'sem-lote',
        usedBatchDate
      };
    };

    if (movementType === 'entrada') {
      const existingBatchIdx = updatedBatches.findIndex(b => b.id === bId);
      if (existingBatchIdx >= 0) {
        if (bDate && (!updatedBatches[existingBatchIdx].date || !updatedBatches[existingBatchIdx].date.trim())) {
          updatedBatches[existingBatchIdx].date = bDate;
        } else {
          bDate = updatedBatches[existingBatchIdx].date;
        }
        updatedBatches[existingBatchIdx] = {
          ...updatedBatches[existingBatchIdx],
          quantity: updatedBatches[existingBatchIdx].quantity + qty
        };
      } else {
        updatedBatches.push({
          id: bId,
          date: bDate,
          quantity: qty
        });
      }

      createdTxs.push({
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: targetProduct.id,
        productName: targetProduct.name,
        barcode: targetProduct.barcode || '',
        type: 'entrada',
        quantity: qty,
        operatorName: opName,
        timestamp: new Date().toISOString(),
        packaging: targetProduct.packaging || 'Unidade',
        batchId: bId,
        batchDate: bDate,
        ...(moveNfPhoto ? { nfPhoto: moveNfPhoto } : {})
      });
    } else if (movementType === 'saida') {
      // Baixa exata do estoque garantindo conservação da quantidade total (ex: 10 - 4 = 6)
      let remaining = qty;
      const nowIso = new Date().toISOString();

      if (moveSourceSector === 'loja' || moveSourceSector === 'anexo' || moveSourceSector === '3019') {
        const sectorStock = sectorSums[moveSourceSector] || 0;
        const fromSelectedSector = Math.min(remaining, sectorStock);
        if (fromSelectedSector > 0) {
          remaining -= fromSelectedSector;
          createdTxs.push({
            id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            productId: targetProduct.id,
            productName: targetProduct.name,
            barcode: targetProduct.barcode || '',
            type: 'saida',
            quantity: fromSelectedSector,
            operatorName: opName,
            timestamp: nowIso,
            packaging: targetProduct.packaging || 'Unidade',
            batchId: moveSourceSector,
            batchDate: '',
            sourceSector: moveSourceSector,
            transferDestination: moveSourceSector
          });
        }

        // Se o setor escolhido não cobrir tudo, desconta o restante do Depósito
        if (remaining > 0 && depQty > 0) {
          const depResult = deductFromDepositoBatches(remaining);
          if (depResult.deducted > 0) {
            remaining -= depResult.deducted;
            createdTxs.push({
              id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              productId: targetProduct.id,
              productName: targetProduct.name,
              barcode: targetProduct.barcode || '',
              type: 'saida',
              quantity: depResult.deducted,
              operatorName: opName,
              timestamp: nowIso,
              packaging: targetProduct.packaging || 'Unidade',
              batchId: depResult.usedBatchId,
              batchDate: depResult.usedBatchDate,
              sourceSector: 'deposito'
            });
          }
        }

        // Se ainda houver restante, desconta dos demais setores com saldo
        if (remaining > 0) {
          const otherSectors = (['loja', 'anexo', '3019'] as const).filter(s => s !== moveSourceSector);
          for (const sec of otherSectors) {
            if (remaining <= 0) break;
            const avail = sectorSums[sec] || 0;
            if (avail > 0) {
              const take = Math.min(avail, remaining);
              remaining -= take;
              createdTxs.push({
                id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                productId: targetProduct.id,
                productName: targetProduct.name,
                barcode: targetProduct.barcode || '',
                type: 'saida',
                quantity: take,
                operatorName: opName,
                timestamp: nowIso,
                packaging: targetProduct.packaging || 'Unidade',
                batchId: sec,
                batchDate: '',
                sourceSector: sec,
                transferDestination: sec
              });
            }
          }
        }
      } else {
        // Baixa iniciando pelo Depósito
        if (depQty > 0) {
          const depResult = deductFromDepositoBatches(remaining);
          if (depResult.deducted > 0) {
            remaining -= depResult.deducted;
            createdTxs.push({
              id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              productId: targetProduct.id,
              productName: targetProduct.name,
              barcode: targetProduct.barcode || '',
              type: 'saida',
              quantity: depResult.deducted,
              operatorName: opName,
              timestamp: nowIso,
              packaging: targetProduct.packaging || 'Unidade',
              batchId: depResult.usedBatchId,
              batchDate: depResult.usedBatchDate,
              sourceSector: 'deposito'
            });
          }
        }

        // Se o Depósito não tinha o total, desconta o restante dos setores (Loja -> Anexo -> 3019)
        if (remaining > 0) {
          const sectorsOrder: Array<'loja' | 'anexo' | '3019'> = ['loja', 'anexo', '3019'];
          for (const sec of sectorsOrder) {
            if (remaining <= 0) break;
            const avail = sectorSums[sec] || 0;
            if (avail > 0) {
              const take = Math.min(avail, remaining);
              remaining -= take;
              createdTxs.push({
                id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                productId: targetProduct.id,
                productName: targetProduct.name,
                barcode: targetProduct.barcode || '',
                type: 'saida',
                quantity: take,
                operatorName: opName,
                timestamp: nowIso,
                packaging: targetProduct.packaging || 'Unidade',
                batchId: sec,
                batchDate: '',
                sourceSector: sec,
                transferDestination: sec
              });
            }
          }
        }
      }
    } else {
      // Transferência entre setores (Depósito -> Loja / Anexo / 3019)
      const depResult = deductFromDepositoBatches(qty);
      createdTxs.push({
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: targetProduct.id,
        productName: targetProduct.name,
        barcode: targetProduct.barcode || '',
        type: 'transferencia',
        quantity: qty,
        operatorName: opName,
        timestamp: new Date().toISOString(),
        packaging: targetProduct.packaging || 'Unidade',
        batchId: depResult.usedBatchId || bId || 'deposito',
        batchDate: depResult.usedBatchDate || bDate,
        transferDestination: transferDestination as 'anexo' | 'loja' | '3019',
        sourceSector: 'deposito'
      });
    }

    const updatedProduct: Product = {
      ...targetProduct,
      batches: updatedBatches
    };

    // 1. UPDATE STATE OPTIMISTICALLY IMMEDIATELY (Instantly completes the UI flow!)
    setProducts(prev => {
      const next = prev.map(p => p.id === targetProduct.id ? updatedProduct : p);
      localStorage.setItem('bv_products', safeJsonStringify(next));
      return next;
    });

    setTransactions(prev => {
      const next = [...createdTxs, ...prev];
      localStorage.setItem('bv_transactions', safeJsonStringify(next));
      return next;
    });

    // Close the movement setup modal instantly
    setShowMovementModal(false);
    setSelectedProductForMovement(null);
    setMoveNfPhoto('');

    // Play visual celebration & success toast instantly
    setProductSavedSuccess(updatedProduct);
    confetti({ particleCount: 50 });

    // 2. LOCK STATE VIA pendingAdjustmentsRef TO PREVENT FIRESTORE ON_SNAPSHOT FLICKERING
    const lockEntry = {
      timer: null as NodeJS.Timeout | null,
      latestProduct: updatedProduct,
      txs: [...createdTxs]
    };
    pendingAdjustmentsRef.current[updatedProduct.id] = lockEntry;

    // 3. PERSIST COHERENTLY TO FIRESTORE ASYNCHRONOUSLY IN THE BACKGROUND
    if (currentUser && usingFirebase) {
      try {
        const b = writeBatch(db);
        b.set(doc(db, 'products', updatedProduct.id), sanitizeForFirestore(updatedProduct));
        createdTxs.forEach(t => {
          b.set(doc(db, 'transactions', t.id), sanitizeForFirestore(t));
        });
        await b.commit();
        console.log(`[Lançamento de Movimentação] Estoque de "${updatedProduct.name}" sincronizado com a nuvem.`);
      } catch (err) {
        console.error("Erro ao salvar movimentação no Firestore:", err);
        setFirebaseSyncError("Não foi possível confirmar a gravação na nuvem neste momento, mas seu saldo local foi atualizado. Verifique sua conexão ou permissões.");
      } finally {
        setTimeout(() => {
          if (pendingAdjustmentsRef.current[updatedProduct.id] === lockEntry) {
            delete pendingAdjustmentsRef.current[updatedProduct.id];
          }
        }, 800);
      }
    } else {
      setTimeout(() => {
        if (pendingAdjustmentsRef.current[updatedProduct.id] === lockEntry) {
          delete pendingAdjustmentsRef.current[updatedProduct.id];
        }
      }, 500);
    }
  };

  const handleOpenMovement = (product: Product, type: 'entrada' | 'saida' | 'transferencia') => {
    setScannedExistingAlert(null);
    setSelectedProductForMovement(product);
    setMovementType(type);
    setMoveNfPhoto('');
    const normalizedPackaging = (product.packaging || '').trim().toLowerCase();
    if (type === 'saida') {
      setMoveQuantity('-1');
    } else if (normalizedPackaging && normalizedPackaging !== 'unidade' && normalizedPackaging !== 'un' && normalizedPackaging !== 'unidades') {
      setMoveQuantity('1');
    } else {
      setMoveQuantity('5');
    }
    setMoveOperatorName(currentUser?.displayName || '');
    
    if (type === 'entrada') {
      setIsNewBatchForEntrada(true);
      setMoveBatchId(`l-${Date.now()}`);
      setMoveBatchDate('');
      setTransferDestination('');
      setMoveSourceSector('deposito');
    } else if (type === 'transferencia') {
      setIsNewBatchForEntrada(false);
      setTransferDestination('loja');
      setMoveSourceSector('deposito');
      if (product.batches && product.batches.length > 0) {
        setMoveBatchId(product.batches[0].id);
      } else {
        setMoveBatchId('sem-lote');
      }
    } else {
      // Saída (Baixa)
      setIsNewBatchForEntrada(false);
      setTransferDestination('');
      setMoveSourceSector('deposito');
      if (product.batches && product.batches.length > 0) {
        setMoveBatchId(product.batches[0].id);
      } else {
        setMoveBatchId('sem-lote');
      }
    }
    
    setShowMovementModal(true);
  };

  const handleNfPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'new' | 'move') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; // Optimal resolution for NF/Invoice details
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
            if (target === 'new') {
              setNewProdNfPhoto(compressedBase64);
            } else {
              setMoveNfPhoto(compressedBase64);
            }
          } else {
            const raw = reader.result as string;
            if (target === 'new') {
              setNewProdNfPhoto(raw);
            } else {
              setMoveNfPhoto(raw);
            }
          }
        };
        img.src = reader.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 600; // Optimal resolution for catalog product images
          const MAX_HEIGHT = 600;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
            setNewProdImage(compressedBase64);
          } else {
            setNewProdImage(reader.result as string);
          }
        };
        img.src = reader.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateProductImage = async (productId: string, base64Image: string) => {
    const currentProduct = products.find(p => p.id === productId);
    if (!currentProduct) return;

    const updatedProduct = {
      ...currentProduct,
      image: base64Image
    };

    setProducts(prev => {
      const next = prev.map(p => p.id === productId ? updatedProduct : p);
      localStorage.setItem('bv_products', JSON.stringify(next));
      return next;
    });

    if (selectedProductForDetails && selectedProductForDetails.id === productId) {
      setSelectedProductForDetails(updatedProduct);
    }

    if (currentUser && usingFirebase) {
      try {
        await setDoc(doc(db, 'products', productId), sanitizeForFirestore(updatedProduct));
        console.log(`[Imagem Produto] Produto ${productId} atualizado no Firestore com nova imagem.`);
      } catch (err) {
        console.error("Erro ao atualizar a imagem do produto no Firestore:", err);
        handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
      }
    }
  };

  const handleDetailProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>, productId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 600;
          const MAX_HEIGHT = 600;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
            handleUpdateProductImage(productId, compressedBase64);
          } else {
            handleUpdateProductImage(productId, reader.result as string);
          }
        };
        img.src = reader.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={`min-h-screen w-full max-w-full overflow-x-hidden ${themeStyles.bgPage} flex flex-col font-sans transition-colors duration-500`}>
      
      {/* Dynamic Design Customizer Style Injection Block */}
      <style>{`
        :root {
          --custom-bg-page: ${designConfig.colorBgPage};
          --custom-bg-card: ${designConfig.colorBgCard};
          --custom-bg-card-subtleIndex: ${designConfig.colorBgCardSubtle};
          --custom-bg-card-subtle: ${designConfig.colorBgCardSubtle};
          --custom-border: ${designConfig.colorBorder};
          --custom-text-title: ${designConfig.colorTextTitle};
          --custom-text-main: ${designConfig.colorTextMain};
          --custom-text-muted: ${designConfig.colorTextMuted};
          --custom-navbar: ${designConfig.colorNavbar};
          --custom-footer: ${designConfig.colorFooter};
          --custom-buttons: ${designConfig.colorButtons};
          --custom-buttons-text: ${designConfig.colorButtonsText};
          --custom-accent: ${designConfig.colorAccent};
          --custom-logo: ${designConfig.colorLogo};
        }

        /* Mobile safe global constraints */
        html, body, #root {
          max-width: 100% !important;
          width: 100% !important;
          overflow-x: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
        }

        /* Universally Bold Text */
        * {
          box-sizing: border-box !important;
          font-weight: 700 !important;
          -webkit-font-smoothing: antialiased;
        }
        
        /* Heading text weight */
        h1, h2, h3, h4, .font-display, .font-black, .font-bold {
          font-weight: 900 !important;
        }

        /* Pure white cards/boxes and container overwrites */
        .bg-\[\#101715\], 
        .bg-\[\#1B2622\], 
        .bg-slate-950, 
        .bg-slate-900, 
        .bg-slate-900\/50, 
        .bg-slate-950\/40, 
        .bg-slate-950\/60,
        .bg-slate-950\/80,
        .bg-[#101715], 
        .bg-[#1B2622], 
        .bg-[#0F111E],
        .bg-[#0C1D18],
        .bg-slate-900\/40,
        .bg-slate-950\/45,
        .bg-\[\#141720\]\/40 {
          background-color: #FFFFFF !important;
          color: #0F172A !important;
          border-color: #CBD5E1 !important;
        }

        /* Light grey borders universally */
        .border-slate-800, 
        .border-slate-850, 
        .border-slate-705, 
        .border-slate-750, 
        .border-slate-755, 
        .border-slate-750\/80, 
        .border-slate-800\/80, 
        .border-slate-800\/85 {
          border-color: #CBD5E1 !important;
        }

        /* Subtle gray backgrounds for sub-cards, secondary fields, options selection */
        .bg-slate-950\/80, 
        .bg-[#0C1210], 
        .bg-slate-950\/45, 
        .bg-slate-950\/40, 
        .bg-slate-900\/40,
        .bg-[#1B2622] {
          background-color: #F8FAFC !important;
          border-color: #CBD5E1 !important;
          color: #0F172A !important;
        }

        /* Interactive cards hover effects */
        .hover\:bg-slate-900\/35:hover,
        .hover\:bg-slate-900\/40:hover,
        .hover\:bg-[#1B2622]\/85:hover {
          background-color: #F1F5F9 !important;
        }

        /* High Contrast Overlapping Input Field Labels style */
        .relative-input-container {
          position: relative;
          margin-top: 16px;
          margin-bottom: 4px;
        }
        .relative-input-container label {
          position: absolute !important;
          top: -8.5px !important;
          left: 12px !important;
          background-color: #FFFFFF !important;
          padding: 0 8px !important;
          font-size: 10px !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          color: #059669 !important;
          border: 1.5px solid #CBD5E1 !important;
          letter-spacing: 0.05em !important;
          z-index: 20 !important;
          pointer-events: none !important;
          border-radius: 6px !important;
          box-shadow: 0 1px 2.5px rgba(15,23,42,0.06);
        }

        /* Input typography and high contrast layout */
        input, select, textarea {
          background-color: #FFFFFF !important;
          border: 1.5px solid #CBD5E1 !important;
          color: #0F172A !important;
          font-weight: 700 !important;
          -webkit-user-select: text !important;
          user-select: text !important;
          pointer-events: auto !important;
          touch-action: manipulation;
        }
        input:focus, select:focus, textarea:focus {
          border-color: #10B981 !important;
          outline: none !important;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
        }

        /* General text utility contrast fixes */
        .text-slate-100, 
        .text-slate-200, 
        .text-slate-300, 
        .text-slate-400, 
        .text-slate-450, 
        .text-slate-500, 
        .text-slate-205,
        .text-\[\#F1F5F9\],
        .text-\[\#F9FAFB\],
        .text-slate-400 {
          color: #0F172A !important;
        }
        
        .text-\[\#86EFAC\], .text-\[\#34D399\] {
          color: #047857 !important;
          font-weight: 900 !important;
        }
        
        .text-slate-405, .text-slate-550, .text-slate-600 {
          color: #475569 !important;
        }

        /* Fix headers or cards styling */
        header {
          background-color: #FFFFFF !important;
          border-bottom: 2px solid #CBD5E1 !important;
        }
        
        header *, footer * {
          color: #0F172A !important;
        }

        /* Typography Override */
        ${isCustom ? `
          body, .font-sans {
            font-family: ${
              designConfig.fontFamily === 'serif' 
                ? '"Playfair Display", Georgia, serif' 
                : designConfig.fontFamily === 'mono' 
                  ? '"JetBrains Mono", Courier, monospace' 
                  : '"Inter", sans-serif'
            } !important;
          }
          
          .font-display {
            font-family: ${
              designConfig.fontFamily === 'serif' 
                ? '"Playfair Display", Georgia, serif' 
                : designConfig.fontFamily === 'mono' 
                  ? '"Space Grotesk", sans-serif' 
                  : '"Outfit", sans-serif'
            } !important;
            font-weight: ${designConfig.titleFontWeight || 'bold'} !important;
          }

          /* Dynamic Font Sizes mapping based on user choices */
          .text-2xl, .text-3xl, h1, h2, h3 {
            font-size: ${
              designConfig.titleFontSize === 'sm' ? '1.15rem' :
              designConfig.titleFontSize === 'md' ? '1.35rem' :
              designConfig.titleFontSize === 'lg' ? '1.65rem' :
              designConfig.titleFontSize === 'xl' ? '2.1rem' : '2.6rem'
            } !important;
          }

          p, span, td, th, input, button, select, label {
            font-size: ${
              designConfig.bodyFontSize === 'xs' ? '0.75rem' :
              designConfig.bodyFontSize === 'sm' ? '0.85rem' :
              designConfig.bodyFontSize === 'md' ? '0.95rem' : '1.1rem'
            } !important;
          }

          /* Border Radius Override */
          .rounded-2xl, .rounded-xl, .rounded-lg, .rounded-md {
            border-radius: ${
              designConfig.borderRadius === 'none' ? '0px' :
              designConfig.borderRadius === 'sm' ? '4px' :
              designConfig.borderRadius === 'md' ? '8px' :
              designConfig.borderRadius === 'lg' ? '12px' :
              designConfig.borderRadius === 'xl' ? '16px' :
              designConfig.borderRadius === '2xl' ? '24px' : '9999px'
            } !important;
          }

          /* Shadow styling */
          .shadow-xl, .shadow-lg, .shadow-md, .shadow-sm {
            box-shadow: ${
              designConfig.shadowStyle === 'none' ? 'none' :
              designConfig.shadowStyle === 'sm' ? '0 1px 2px 0 rgba(0,0,0,0.05)' :
              designConfig.shadowStyle === 'md' ? '0 4px 6px -1px rgba(0,0,0,0.1)' :
              designConfig.shadowStyle === 'lg' ? '0 10px 15px -3px rgba(0,0,0,0.1)' :
              designConfig.shadowStyle === 'xl' ? '0 20px 25px -5px rgba(0,0,0,0.1)' :
              `0 0 20px ${designConfig.glowColor || designConfig.colorAccent}${Math.round((designConfig.glowOpacity || 0.25) * 255).toString(16).padStart(2, '0')}`
            } !important;
          }
        ` : ''}
      `}</style>
      
      {/* Decorative top bar */}
      <div className={`h-1.5 w-full ${themeStyles.headerLine} transition-all duration-500`} />

      {/* Streamlined Clean Header */}
      {designConfig.showHeader && (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3">
            
            {/* Logo Menor & Nome da Tela Atual */}
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setActiveTab('inicio')}
                className="w-10 h-10 rounded-xl bg-white border border-black hover:bg-slate-50 text-black flex items-center justify-center font-black text-lg tracking-tight shadow-xs shrink-0 cursor-pointer transition-all"
                style={{ backgroundColor: '#ffffff', borderColor: '#000000' }}
                title="Ir para o Início"
              >
                BV
              </button>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm sm:text-base font-black tracking-tight text-black font-sans">
                    BV Atacarejo
                  </h1>
                  <span className="text-slate-300">/</span>
                  <span className="text-xs sm:text-sm font-extrabold text-emerald-700 capitalize">
                    {activeTab === 'inicio' || activeTab === 'dashboard' ? 'Início'
                      : activeTab === 'produtos' ? 'Produtos'
                      : activeTab === 'estoque' ? 'Estoque'
                      : activeTab === 'movimentacoes' || activeTab === 'historico' ? 'Movimentações'
                      : activeTab === 'checklist' ? 'Checklist'
                      : activeTab === 'checklist_compra' ? 'Novo checklist de compra'
                      : activeTab === 'relatorios' ? 'Relatórios'
                      : activeTab === 'configuracoes' ? 'Configurações'
                      : activeTab === 'nota_fiscal' ? 'Nota Fiscal'
                      : 'Vasilhames'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
                  Controle Logístico & Gestão Operacional
                </p>
              </div>
            </div>

            {/* Status discreto & Usuário */}
            <div className="flex items-center gap-2 sm:gap-3">
              
              {/* Indicador discreto de sincronização */}
              <div 
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                  usingFirebase && isOnline 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : isOnline 
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
                title={usingFirebase ? "Sincronizado em tempo real com o Firestore" : "Modo de contingência local"}
              >
                <span className={`w-2 h-2 rounded-full ${
                  usingFirebase && isOnline 
                    ? 'bg-emerald-500' 
                    : isOnline ? 'bg-amber-500' : 'bg-rose-500'
                } animate-pulse`} />
                <span className="hidden sm:inline">
                  {usingFirebase && isOnline ? '🟢 Dados sincronizados' : isOnline ? '🟡 Modo Local' : '🔴 Offline'}
                </span>
                <span className="sm:hidden text-[10px]">
                  {usingFirebase && isOnline ? '🟢 Sinc' : 'Local'}
                </span>
              </div>

              {/* Botão Atalho Rápido de Importação em Massa */}
              <button
                onClick={() => setShowBulkImportModal(true)}
                className="hidden md:flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 cursor-pointer transition-all active:scale-95"
                title="Importar catálogo em lote via planilha Excel ou CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Importar em Massa</span>
              </button>

              {/* Usuário / Login */}
              {authLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader className="w-4 h-4 animate-spin" />
                </div>
              ) : currentUser ? (
                <div className="flex items-center gap-2 bg-white pl-1.5 pr-2.5 py-1 rounded-full border border-slate-200 shadow-xs">
                  {currentUser.photoURL ? (
                    <img src={currentUser.photoURL} alt={currentUser.displayName || 'Usuário'} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                      {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <span className="text-xs font-semibold text-slate-700 hidden sm:inline">
                    {currentUser.displayName?.split(' ')[0]}
                  </span>
                  <button 
                    onClick={handleSignOut}
                    className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer ml-0.5" 
                    title="Sair da Conta"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleSignIn}
                  className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Entrar</span>
                </button>
              )}

            </div>
          </div>
        </header>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3.5 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-28 lg:pb-8">

        {/* Alerta de erro de autenticação para navegadores com cookies bloqueados (ex: Opera/Brave em Iframe) */}
        {authError && (
          <div className="bg-linear-to-r from-red-950/60 to-rose-950/40 border border-red-500/40 p-4.5 rounded-2xl flex flex-col md:flex-row items-start justify-between gap-4 shadow-[0_8px_30px_rgba(239,68,68,0.15)] animate-fade-in">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 bg-red-500/15 rounded-xl flex items-center justify-center text-red-400 shrink-0 border border-red-500/30">
                <AlertTriangle className="w-5.5 h-5.5" />
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono bg-red-500/20 text-red-300 font-extrabold px-1.5 py-0.5 rounded uppercase">AVISO DE AUTENTICAÇÃO</span>
                  <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest font-mono">Restrição de Armazenamento Detectada (Opera/Brave/Safari)</h4>
                </div>
                <p className="text-[11.5px] text-slate-205 leading-relaxed font-sans">
                  Navegadores como o **Opera, Brave ou Safari** bloqueiam cookies de terceiros integrados ao iframe do AI Studio. Para sincronizar com a nuvem normalmente, basta abrir o app diretamente em uma aba cheia própria usando o botão abaixo.
                </p>
                <div className="text-[10px] text-slate-400 font-mono">
                  Se preferir, você não precisa fazer login: apenas digite seu nome de operador e registre as ações normalmente offline!
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto shrink-0 pt-1 md:pt-0">
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-red-550 hover:bg-red-450 active:scale-95 text-white font-black text-[10px] uppercase tracking-wider px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-[0_4px_12px_rgba(239,68,68,0.3)] text-center cursor-pointer no-underline"
              >
                <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" /> Abrir em Nova Aba
              </a>
              <button
                type="button"
                onClick={() => setAuthError(null)}
                className="bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-bold text-[10px] uppercase px-3 py-2.5 rounded-xl border border-slate-800/80 transition-all cursor-pointer text-center"
              >
                Ignorar
              </button>
            </div>
          </div>
        )}

        {/* PWA Promotion Banner if app is not standalone and install option is available */}
        {deferredPrompt && (
          <div className="bg-linear-to-r from-amber-950/20 to-orange-950/10 border border-amber-800/40 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-[0_4px_20px_rgba(245,158,11,0.05)]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-500 shrink-0 border border-amber-500/20">
                <Download className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono bg-amber-500/20 text-amber-400 font-bold px-1.5 py-0.5 rounded">APP DISPONÍVEL</span>
                  <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest font-mono">BV Atacarejo PWA Nativo</h4>
                </div>
                <p className="text-[11px] text-slate-300">Instale o aplicativo em sua tela inicial para trabalhar offline de forma ultra fluida com suporte a cache instantâneo.</p>
              </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto shrink-0 pt-2 md:pt-0">
              <button
                onClick={initiatePWAInstall}
                className="bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 text-slate-950 font-black text-xs px-4 py-2.5 rounded-lg uppercase tracking-wider transition-all shadow-[0_2px_8px_rgba(245,158,11,0.25)] flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                Instalar App
              </button>
              <button
                onClick={() => setDeferredPrompt(null)}
                className="hover:bg-slate-800 text-slate-400 hover:text-slate-100 font-medium text-xs px-3 py-2.5 rounded-lg transition-all cursor-pointer"
              >
                Dispensar
              </button>
            </div>
          </div>
        )}


        {firebaseSyncError && (
          <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl flex items-start gap-2.5">
            <span className="text-amber-500 mt-0.5 animate-pulse text-xs">⚠️</span>
            <div>
              <p className="text-xs text-amber-400 font-bold leading-none mb-1">
                Modo de Contingência Ativo (Opera / Offline)
              </p>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {firebaseSyncError}
              </p>
            </div>
          </div>
        )}

        {/* Global Task-Oriented Navigation Bar (Organized by Task - Point 5) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-2 sm:p-2.5 shadow-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
            
            <button
              onClick={() => setActiveTab('inicio')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'inicio' || activeTab === 'dashboard'
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Início</span>
              {(stats.criticalCount > 0 || stats.expiredCount > 0) && (
                <span className={`w-2 h-2 rounded-full ${stats.expiredCount > 0 ? 'bg-rose-400' : 'bg-amber-400'} animate-pulse`} />
              )}
            </button>

            <button
              onClick={() => setActiveTab('produtos')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'produtos'
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Produtos</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#efefef] text-[#1b9d37] font-bold">
                {stats.totalProductsCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('estoque')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'estoque'
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50'
              }`}
            >
              <Warehouse className="w-4 h-4" />
              <span>Estoque</span>
            </button>

            <button
              onClick={() => setActiveTab('movimentacoes')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'movimentacoes' || activeTab === 'historico'
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Movimentações</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                activeTab === 'movimentacoes' || activeTab === 'historico'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#efefef] text-slate-700'
              }`}>
                {transactions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('checklist')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'checklist'
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Checklist</span>
              {stats.lowStockCount > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">
                  {stats.lowStockCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setPurchaseChecklistResetToken(t => t + 1);
                setActiveTab('checklist_compra');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'checklist_compra'
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Novo checklist de compra</span>
            </button>

            <button
              onClick={() => setActiveTab('relatorios')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'relatorios'
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Relatórios</span>
            </button>

            <button
              onClick={() => setActiveTab('configuracoes')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'configuracoes' || activeTab === 'fabricantes' || activeTab === 'gtin'
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              <span>Configurações</span>
            </button>

            {/* Separador e Atalhos Rápidos */}
            <div className="h-5 w-px bg-slate-200 mx-1 shrink-0 hidden sm:block" />

            <button
              onClick={() => setActiveTab('nota_fiscal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                activeTab === 'nota_fiscal'
                  ? 'bg-slate-900 text-white border-black font-bold'
                  : 'text-slate-700 hover:text-black hover:bg-slate-50 border-black/80'
              }`}
              title="Decodificar Nota Fiscal por chave ou saneamento"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Nota Fiscal</span>
            </button>

            <button
              onClick={() => setActiveTab('vasilhames')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                activeTab === 'vasilhames'
                  ? 'bg-slate-900 text-white border-black font-bold'
                  : 'text-slate-700 hover:text-black hover:bg-slate-50 border-black/80'
              }`}
              title="Controle de Vasilhames e Engradados"
            >
              <Boxes className="w-3.5 h-3.5 text-blue-600" />
              <span>Vasilhames</span>
            </button>

          </div>
        </div>

        {/* =========================================================================
            TELA 1: INÍCIO (Ordem: 1. Resumo e data, 2. Ações rápidas, 3. Indicadores,
            4. Pendências de hoje, 5. Últimas movimentações)
           ========================================================================= */}
        {(activeTab === 'inicio' || activeTab === 'dashboard') && (
          <div className="space-y-5 animate-fade-in text-left">
            

            {/* 2. Ações rápidas no alto */}
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-black mb-2.5">
                Ações Rápidas
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                
                {/* AÇÃO 1: Dar entrada */}
                <button
                  onClick={() => {
                    setShowAllInEntrada(false);
                    setShowGlobalEntradaModal(true);
                  }}
                  className="bg-white hover:bg-emerald-50/50 border-2 border-emerald-500/40 hover:border-emerald-500 p-4 rounded-2xl text-left transition-all group cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <div className="w-10 h-10 rounded-xl bg-white border border-black text-[#007a29] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform shadow-xs">
                    <ArrowDownLeft className="w-5 h-5 stroke-[2.5] text-[#007a29]" />
                  </div>
                  <h3 className="text-sm font-black text-[#238f00] group-hover:text-emerald-700 transition-colors">
                    Dar entrada
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Receber mercadorias no estoque com lote e NF
                  </p>
                </button>

                {/* AÇÃO 2: Registrar saída */}
                <button
                  onClick={() => {
                    setShowAllInSaida(false);
                    setShowGlobalSaidaModal(true);
                  }}
                  className="bg-white hover:bg-amber-50/50 border-2 border-amber-500/40 hover:border-amber-500 p-4 rounded-2xl text-left transition-all group cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <div className="w-10 h-10 rounded-xl bg-white border border-black text-[#a6061a] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform shadow-xs">
                    <ArrowUpRight className="w-5 h-5 stroke-[2.5] text-[#a6061a]" />
                  </div>
                  <h3 className="text-sm font-black text-[#238f00] group-hover:text-amber-700 transition-colors">
                    Registrar saída
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Baixa por vendas, consumo ou avarias
                  </p>
                </button>

                {/* AÇÃO 3: Fazer checklist */}
                <button
                  onClick={() => setActiveTab('checklist')}
                  className="bg-white hover:bg-teal-50/50 border-2 border-teal-500/40 hover:border-teal-500 p-4 rounded-2xl text-left transition-all group cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <div className="w-10 h-10 rounded-xl bg-white border border-black text-teal-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform shadow-xs">
                    <ClipboardCheck className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <h3 className="text-sm font-black text-[#238f00] group-hover:text-teal-700 transition-colors">
                    Fazer checklist
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Conferência diária de reposição e validades
                  </p>
                </button>

              </div>
            </div>

            {/* 3. Indicadores simplificados (Point 4: Padronizados com número grande, descrição curta e ação) */}
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-black mb-2.5">
                Indicadores Principais
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                
                {/* CARD 1: Total em Estoque e Produtos */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block">
                      Total em Estoque
                    </span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-3xl font-black text-emerald-700 font-sans">
                        {stats.totalStockQty}
                      </span>
                      <span className="text-xs font-bold text-slate-600">unidades</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {stats.totalProductsCount} produtos no catálogo
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('estoque')}
                    className="mt-3.5 w-full py-1.5 px-3 bg-white hover:bg-slate-100 text-black border border-black rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                  >
                    Ver estoque completo →
                  </button>
                </div>

                {/* CARD 2: Precisam de reposição */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 block">
                        Precisam de reposição
                      </span>
                      {stats.lowStockCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className={`text-3xl font-black font-sans ${stats.lowStockCount > 0 ? 'text-amber-600' : 'text-black'}`}>
                        {stats.lowStockCount}
                      </span>
                      <span className="text-xs font-medium text-slate-500">produtos</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Abaixo do estoque mínimo
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('checklist')}
                    className="mt-3.5 w-full py-1.5 px-3 bg-white hover:bg-amber-50 text-black border border-black rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                  >
                    Abrir checklist →
                  </button>
                </div>

                {/* CARD 3: Próximos do vencimento */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 block">
                        Próximos do vencimento
                      </span>
                      {stats.criticalCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className={`text-3xl font-black font-sans ${stats.criticalCount > 0 ? 'text-amber-600' : 'text-black'}`}>
                        {stats.criticalCount}
                      </span>
                      <span className="text-xs font-medium text-slate-500">lotes</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Vencem em até 30 dias
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedStatusFilter('criticos');
                      setActiveTab('estoque');
                    }}
                    className="mt-3.5 w-full py-1.5 px-3 bg-white hover:bg-slate-100 text-black border border-black rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                  >
                    Ver lotes →
                  </button>
                </div>

                {/* CARD 4: Vencidos */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#b00605] block">
                        Vencidos
                      </span>
                      {stats.expiredCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-3xl font-black font-sans text-[#ee000a]">
                        {stats.expiredCount}
                      </span>
                      <span className="text-xs font-medium text-[#0d0b0b]">lotes</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Lotes fora da validade
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedStatusFilter('vencidos');
                      setActiveTab('estoque');
                    }}
                    className="mt-3.5 w-full py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-black border border-black rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                  >
                    Conferir agora →
                  </button>
                </div>

              </div>
            </div>

            {/* 4. Pendências de hoje (produtos que exigem ação) */}
            <div className="bg-white border-2 border-[#0a0a0a] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-black uppercase tracking-wide flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Pendências de Hoje
                  </h3>
                  <p className="text-xs text-slate-500">
                    Produtos e lotes com atenção imediata necessária na rotina de hoje
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('checklist')}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  Abrir checklist completo →
                </button>
              </div>

              {/* Items in need of attention */}
              {(() => {
                const urgentItems = products.filter(p => {
                  const activeTotal = p.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[p.id]?.totalTransferred || 0);
                  const hasExpired = p.batches.some(b => getDaysRemaining(b.date) < 0);
                  const hasCritical = p.batches.some(b => {
                    const d = getDaysRemaining(b.date);
                    return d >= 0 && d <= 30;
                  });
                  const isLow = activeTotal < p.minStock;
                  return hasExpired || hasCritical || isLow;
                }).slice(0, 5);

                if (urgentItems.length === 0) {
                  return (
                    <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2.5">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Tudo em dia! Nenhum produto com estoque crítico ou lote vencido detectado hoje.</span>
                    </div>
                  );
                }

                return (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                    {urgentItems.map(item => {
                      const activeTotal = item.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[item.id]?.totalTransferred || 0);
                      const hasExpired = item.batches.some(b => getDaysRemaining(b.date) < 0);
                      const hasCritical = item.batches.some(b => {
                        const d = getDaysRemaining(b.date);
                        return d >= 0 && d <= 30;
                      });
                      const isLow = activeTotal < item.minStock;

                      return (
                        <div key={item.id} className="p-3 hover:bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-black">{item.name}</span>
                              {item.brand && (
                                <span className="text-[10px] font-normal text-white bg-black px-1.5 py-0.2 rounded">
                                  Fabricante: {item.brand}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="text-slate-500 font-mono text-[11px]">EAN: {item.barcode || 'S/B'}</span>
                              {hasExpired && (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                                  🚨 Lote vencido
                                </span>
                              )}
                              {hasCritical && (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                  ⏰ Vence em até 30 dias
                                </span>
                              )}
                              {isLow && (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                  ⚠️ Estoque baixo ({activeTotal}/{item.minStock})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleOpenMovement(item, 'entrada')}
                              className="text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                            >
                              + Entrada
                            </button>
                            <button
                              onClick={() => {
                                setSelectedProductForDetails(item);
                                setShowProductDetailsModal(true);
                              }}
                              className="text-xs font-bold bg-[#040000] hover:bg-neutral-800 text-white border border-black px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                            >
                              Ver ficha
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* 5. Últimas movimentações (produto, quantidade, local, responsável) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-black uppercase tracking-wide flex items-center gap-2">
                    <History className="w-4 h-4 text-emerald-600" />
                    Últimas Movimentações
                  </h3>
                  <p className="text-xs text-slate-500">
                    Histórico recente de entradas, saídas e transferências
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('movimentacoes')}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  Ver todas as movimentações ({transactions.length}) →
                </button>
              </div>

              {transactions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Nenhuma movimentação registrada recentemente.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                  {transactions.slice(0, 5).map(tx => (
                    <div key={tx.id} className="p-3 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          tx.type === 'entrada' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : tx.type === 'transferencia'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-rose-100 text-rose-700'
                        }`}>
                          {tx.type === 'entrada' ? <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" /> : tx.type === 'transferencia' ? <ArrowLeftRight className="w-4 h-4 stroke-[2.5]" /> : <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />}
                        </span>
                        <div>
                          <p className="text-xs font-black text-black">{tx.productName}</p>
                          <div className="flex items-center gap-2 text-[11px] text-[#525258]">
                            <span className="capitalize font-bold text-slate-700">
                              {tx.type === 'transferencia' ? `Transferência → ${tx.transferDestination?.toUpperCase() || 'LOJA'}` : tx.type}
                            </span>
                            <span>•</span>
                            <span>Operador: {tx.operatorName}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-sm font-black text-[#139305] font-mono">
                          {tx.quantity} {tx.packaging?.split(' ')[0] || 'un'}
                        </span>
                        <p className="text-[10px] text-slate-400">
                          {new Date(tx.timestamp).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* =========================================================================
            TELA 2: PRODUTOS (Point 3: Pesquisa aberta sempre visível, filtros próximos,
            cadastro rápido e importação em massa)
           ========================================================================= */}
        {activeTab === 'produtos' && (
          <div className="space-y-4 animate-fade-in text-left">
            
            {/* Top action header: Novo Produto & Importação em Massa */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-black font-sans tracking-tight" style={{ color: '#058c00' }}>
                  Cadastro de Produtos
                </h2>
                <p className="text-xs text-slate-500">
                  Gerencie o catálogo completo, códigos EAN, marcas, volumes e embalagens.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowManageCategoriesModal(true)}
                  className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-xs whitespace-nowrap"
                  title="Abrir e gerenciar categorias e subcategorias"
                >
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span>Categorias</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowBulkImportModal(true)}
                  className="flex-1 sm:flex-initial bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-xs"
                  title="Importar catálogo em lote via planilha Excel ou CSV"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Importar Produtos em Massa</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNewProdBarcode('');
                    setNewProdName('');
                    setNewProdBrand('');
                    setNewProdWeightVolume('');
                    setNewProdImage('');
                    setNewProdDescription('');
                    setNewProdBatchId(`l-${Date.now()}`);
                    setNewProdBatchDate('');
                    setNewProdBatchQty('10');
                    setShowAddProductModal(true);
                  }}
                  className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Produto</span>
                </button>
              </div>
            </div>

            {/* 3. Pesquisa sempre visível (Point 3) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              
              {/* Campo Amplo de Busca */}
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#000000] rounded-[1px]" />
                <input
                  type="text"
                  placeholder="🔍 Buscar produto por nome ou código de barras..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 rounded-xl border-[3px] border-[#000000] bg-white text-slate-900 placeholder-slate-400 text-sm focus:border-[#000000] focus:outline-none shadow-xs font-sans"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filtros próximos: Categoria, Subcategoria, Fabricante e Seleção */}
              <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 pt-1 text-xs">

                {/* Filtro por Categoria */}
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setSelectedSubcategory('');
                  }}
                  aria-label="Filtrar por Categoria"
                  className="w-full sm:w-auto bg-white border border-black text-slate-800 text-xs rounded-lg px-2.5 py-2 focus:border-black focus:outline-none cursor-pointer"
                >
                  <option value="">Todas as Categorias</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>

                {/* Filtro por Subcategoria */}
                <select
                  value={selectedSubcategory}
                  onChange={(e) => setSelectedSubcategory(e.target.value)}
                  aria-label="Filtrar por Subcategoria"
                  className="w-full sm:w-auto bg-white border border-black text-slate-800 text-xs rounded-lg px-2.5 py-2 focus:border-black focus:outline-none cursor-pointer"
                >
                  <option value="">Todas as Subcategorias</option>
                  {(selectedCategory
                    ? categories.find(c => c.name.trim().toLowerCase() === selectedCategory.trim().toLowerCase())?.subcategories || []
                    : Array.from(new Set(categories.flatMap(c => c.subcategories || [])))
                  )
                    .slice()
                    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
                    .map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                </select>

                {/* Filtro por Fabricante */}
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  aria-label="Filtrar por Fabricante"
                  className="w-full sm:w-auto bg-white border border-black text-slate-800 text-xs rounded-lg px-2.5 py-2 focus:border-black focus:outline-none cursor-pointer"
                >
                  <option value="">Todos os Fabricantes</option>
                  {allBrandsList.map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>

                {/* Alternar seleção múltipla para exclusão */}
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectionModeProdutos(prev => !prev);
                    setSelectedProdutoIdsToDelete([]);
                  }}
                  className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    isSelectionModeProdutos
                      ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                      : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'
                  }`}
                  title="Selecionar vários itens cadastrados para excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isSelectionModeProdutos ? 'Cancelar Seleção' : 'Excluir Vários'}</span>
                </button>

                {/* Limpar Filtros */}
                {(searchQuery || selectedCategory || selectedSubcategory || selectedBrand) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('');
                      setSelectedSubcategory('');
                      setSelectedBrand('');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-700 font-bold sm:ml-auto cursor-pointer py-1.5"
                  >
                    Limpar Filtros ✕
                  </button>
                )}

              </div>
            </div>

            {/* Lista de Produtos Encontrados */}
            <div className="space-y-2">
              {(() => {
                const results = filteredProducts;

                if (results.length === 0) {
                  return (
                    <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
                      <Package className="w-10 h-10 text-slate-300 mx-auto" />
                      <p className="text-sm font-bold text-slate-800">Nenhum produto encontrado</p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Tente ajustar a busca ou clique no botão acima para adicionar um novo produto ou importar em massa via planilha.
                      </p>
                    </div>
                  );
                }

                const selectedInResults = results.filter(p => selectedProdutoIdsToDelete.includes(p.id));
                const allSelectedInResults = results.length > 0 && selectedInResults.length === results.length;

                return (
                  <div className="space-y-2">
                    {isSelectionModeProdutos && (
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-rose-900 font-bold">
                          <CheckSquare className="w-4 h-4 text-rose-600" />
                          <span>
                            {selectedInResults.length === 0
                              ? 'Marque os itens cadastrados que deseja excluir:'
                              : `${selectedInResults.length} item(ns) marcado(s) para exclusão`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (allSelectedInResults) {
                                setSelectedProdutoIdsToDelete([]);
                              } else {
                                setSelectedProdutoIdsToDelete(results.map(r => r.id));
                              }
                            }}
                            className="text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                          >
                            {allSelectedInResults ? 'Desmarcar Todos' : `Selecionar Todos (${results.length})`}
                          </button>
                          <button
                            type="button"
                            disabled={selectedInResults.length === 0}
                            onClick={() => handleDeleteSelectedProducts(selectedInResults)}
                            className="text-xs font-black bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Excluir Selecionados ({selectedInResults.length})</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-xs">
                      {results.map(prod => {
                        const depQty = prod.batches.reduce((sum, b) => sum + b.quantity, 0);
                        const totalQty = depQty + (productSectorsSums[prod.id]?.totalTransferred || 0);
                        const isChecked = selectedProdutoIdsToDelete.includes(prod.id);

                        return (
                          <div 
                            key={prod.id} 
                            onClick={() => {
                              if (isSelectionModeProdutos) {
                                setSelectedProdutoIdsToDelete(prev =>
                                  prev.includes(prod.id) ? prev.filter(id => id !== prod.id) : [...prev, prod.id]
                                );
                              } else {
                                setSelectedProductForDetails(prod);
                                setShowProductDetailsModal(true);
                              }
                            }}
                            className={`p-3.5 sm:p-4 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors cursor-pointer group ${
                              isChecked ? 'bg-rose-50/70' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {isSelectionModeProdutos && (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={() => {
                                    setSelectedProdutoIdsToDelete(prev =>
                                      prev.includes(prod.id) ? prev.filter(id => id !== prod.id) : [...prev, prod.id]
                                    );
                                  }}
                                  className="w-4.5 h-4.5 accent-rose-600 cursor-pointer shrink-0"
                                  aria-label={`Selecionar ${prod.name} para exclusão`}
                                />
                              )}
                              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                {prod.image ? (
                                  <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                              <div className="space-y-1">
                                <div>
                                  <span className="text-[9px] uppercase font-mono font-bold text-slate-500 block">
                                    Nome do Item Comercial (Cadastrado):
                                  </span>
                                  <h3 
                                    className="text-sm sm:text-base font-black leading-snug group-hover:text-emerald-700 transition-colors px-1 py-0.5 rounded"
                                    style={{ backgroundColor: '#ffffff', color: '#0a9600' }}
                                  >
                                    {prod.name}
                                  </h3>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                  <span className="text-xs font-mono font-bold text-[#391b1b] bg-white border border-black px-1.5 py-0.2 rounded">
                                    {prod.barcode || 'Sem código'}
                                  </span>
                                  {prod.brand && (
                                    <span 
                                      className="text-xs font-medium px-1.5 py-0.2 rounded border border-slate-600 shadow-2xs"
                                      style={{ backgroundColor: '#5f5a5a', color: '#ffffff' }}
                                    >
                                      Fabricante: <strong style={{ color: '#ffffff' }}>{prod.brand}</strong>
                                    </span>
                                  )}
                                  <span className="text-xs text-slate-500">
                                    {prod.category} {prod.subcategory ? `> ${prod.subcategory}` : ''}
                                  </span>
                                  <span className="text-xs text-slate-500 font-medium">
                                    • Embalagem: <strong className="text-slate-700">{prod.packaging || 'Unidade'}</strong> {prod.weightVolume ? `• ${prod.weightVolume}` : ''}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex-wrap">
                              {/* Estoque: Quantidade Total */}
                              <div className="flex items-center gap-2 text-right">
                                <div className="bg-emerald-50 border-2 border-emerald-500/80 px-3 py-1 rounded-xl shadow-xs text-center">
                                  <span className="text-[9px] text-emerald-800 uppercase font-black block tracking-wider">Quantidade Total</span>
                                  <span className="text-sm font-black text-emerald-950 font-mono">
                                    {totalQty} <span className="text-[10px] font-bold text-emerald-700">{formatOnlyPackagingSingularPlural(totalQty, prod.packaging || 'un')}</span>
                                  </span>
                                </div>
                              </div>

                              {/* Ações */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenMovement(prod, 'entrada');
                                  }}
                                  className="text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                                  title="Dar entrada em estoque"
                                >
                                  + Entrada
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenMovement(prod, 'saida');
                                  }}
                                  className="text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                                  title="Registrar saída"
                                >
                                  - Saída
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCategoryEditModal(prod);
                                  }}
                                  className="text-xs font-bold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                                  title="Trocar categoria e subcategoria deste item"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  <span>Categoria</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedProductForDetails(prod);
                                    setShowProductDetailsModal(true);
                                  }}
                                  className="text-xs font-bold bg-white hover:bg-slate-50 text-[#391b1b] border border-black px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                                  title="Ver ficha técnica e alterar embalagem"
                                >
                                  Ficha
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteProduct(prod);
                                  }}
                                  className="text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                                  title="Excluir item cadastrado permanentemente"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Excluir</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>
        )}

        {/* =========================================================================
            TELA 5: CHECKLIST (Conferência e abastecimento diário)
           ========================================================================= */}
        {activeTab === 'checklist' && (
          <div className="space-y-4 animate-fade-in text-left">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-teal-50 border border-teal-200 rounded-xl text-teal-700">
                    <ClipboardCheck className="w-5 h-5 stroke-[2.5]" />
                  </span>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-center text-[#068c06]" style={{ fontFamily: 'Arial, sans-serif' }}>
                      Checklist Diário de Conferência & Abastecimento
                    </h2>
                    <p className="text-xs text-slate-500">
                      Ronda operacional para reposição de gôndolas e controle de validades (FEFO).
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPurchaseChecklistResetToken(t => t + 1);
                    setActiveTab('checklist_compra');
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs px-3.5 py-2 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Novo checklist de compra</span>
                </button>
                <div className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200">
                  Operador: {currentUser?.displayName || 'Equipe BV'}
                </div>
              </div>
            </div>

            {/* SEÇÃO 1: Lotes Próximos do Vencimento (FEFO - Primeiro que Vence, Primeiro que Sai) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    1. Lotes que Vencem em até 30 Dias (FEFO)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Priorize a saída destes lotes antes dos mais novos ou promova queima rápida
                  </p>
                </div>
              </div>

              {(() => {
                const nearExpiryItems: { product: Product; batch: Batch; days: number }[] = [];
                products.forEach(p => {
                  p.batches.forEach(b => {
                    const days = getDaysRemaining(b.date);
                    if (days >= 0 && days <= 30) {
                      nearExpiryItems.push({ product: p, batch: b, days });
                    }
                  });
                });

                if (nearExpiryItems.length === 0) {
                  return (
                    <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span>Nenhum lote vencendo nos próximos 30 dias. Todos os produtos com data segura.</span>
                    </div>
                  );
                }

                return (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                    {nearExpiryItems.map(({ product, batch, days }) => (
                      <div key={`${product.id}-${batch.id}`} className="p-3 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex-1">
                          <p className="text-xs font-bold text-[#070707] text-center" style={{ fontFamily: 'Times New Roman, serif' }}>{product.name}</p>
                          <p className="text-xs text-slate-500">
                            Lote: <strong className="font-mono text-slate-700">{batch.id}</strong> • Vence em: <strong className="text-amber-700">{days} dias ({batch.date.split('-').reverse().join('/')})</strong> • Qtd: {batch.quantity}
                          </p>
                        </div>

                        <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                          Priorizar Saída (FEFO)
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* SEÇÃO 2: Lotes Vencidos (Retirada Imediata) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4 text-rose-600" />
                    2. Lotes Vencidos (Retirada e Descarte Imediato)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Itens que ultrapassaram a data de validade e devem ser baixados do estoque
                  </p>
                </div>
              </div>

              {(() => {
                const expiredItems: { product: Product; batch: Batch; days: number }[] = [];
                products.forEach(p => {
                  p.batches.forEach(b => {
                    const days = getDaysRemaining(b.date);
                    if (days < 0) {
                      expiredItems.push({ product: p, batch: b, days });
                    }
                  });
                });

                if (expiredItems.length === 0) {
                  return (
                    <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span>Zero lotes vencidos no estoque. Total conformidade sanitária!</span>
                    </div>
                  );
                }

                return (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                    {expiredItems.map(({ product, batch, days }) => (
                      <div key={`${product.id}-${batch.id}`} className="p-3 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex-1">
                          <p className="text-xs font-bold text-[#070707] text-center" style={{ fontFamily: 'Times New Roman, serif' }}>{product.name}</p>
                          <p className="text-xs text-slate-500">
                            Lote: <strong className="font-mono text-slate-700">{batch.id}</strong> • Vencido há: <strong className="text-rose-700">{Math.abs(days)} dias</strong> • Qtd: {batch.quantity}
                          </p>
                        </div>

                        <button
                          onClick={() => handleOpenMovement(product, 'saida')}
                          className="bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Dar Baixa / Descarte</span>
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

          </div>
        )}

        {activeTab === 'checklist_compra' && (
          <PurchaseChecklistPanel
            products={products}
            categories={categories}
            productSectorsSums={productSectorsSums}
            savedOrders={purchaseOrders}
            operatorName={currentUser?.displayName || 'Equipe BV'}
            resetToken={purchaseChecklistResetToken}
            onSaveOrder={async (order) => {
              const updated = [order, ...purchaseOrders];
              setPurchaseOrders(updated);
              localStorage.setItem('bv_purchase_orders', safeJsonStringify(updated));
              if (currentUser && usingFirebase) {
                try {
                  await setDoc(doc(db, 'purchase_orders', order.id), sanitizeForFirestore(order));
                } catch (err) {
                  handleFirestoreError(err, OperationType.WRITE, `purchase_orders/${order.id}`);
                }
              }
            }}
            onDeleteOrder={async (orderId) => {
              const updated = purchaseOrders.filter(o => o.id !== orderId);
              setPurchaseOrders(updated);
              localStorage.setItem('bv_purchase_orders', safeJsonStringify(updated));
              if (currentUser && usingFirebase) {
                try {
                  await deleteDoc(doc(db, 'purchase_orders', orderId));
                } catch (err) {
                  handleFirestoreError(err, OperationType.DELETE, `purchase_orders/${orderId}`);
                }
              }
            }}
          />
        )}

        {/* =========================================================================
            TELA 6: RELATÓRIOS (Exportação PDF por categoria/fabricante e CSV)
           ========================================================================= */}
        {activeTab === 'relatorios' && (
          <div className="space-y-4 animate-fade-in text-left">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-center items-center text-center gap-2">
              <div className="w-full text-center">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-center text-[#004ee8]" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Central de Relatórios & Exportações
                </h2>
                <p className="text-xs text-slate-500 mt-1 text-center">
                  Gere relatórios oficiais em PDF por categoria ou fabricante, planilhas CSV e envie no WhatsApp.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Opção 1: Relatório em PDF por Categoria e Subcategoria */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                      <FileText className="w-5 h-5 stroke-[2.5]" />
                    </span>
                    <h3 className="text-sm font-black text-[#7d6b6b]">
                      Relatório PDF por Categoria & Subcategoria
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Documento formal em PDF com tabela zebrada, alertas de validade e total de volumes.
                  </p>

                  <div className="space-y-2 mt-4">
                    <div>
                      <label className="text-xs font-bold text-[#7d6b6b] block mb-1 text-center font-sans" style={{ fontFamily: 'Arial, sans-serif' }}>Filtrar por Categoria:</label>
                      <select
                        value={exportSelectedCategoryName}
                        onChange={(e) => {
                          setExportSelectedCategoryName(e.target.value);
                          setExportSelectedSubcategoryName('all');
                        }}
                        className="w-full bg-white border border-slate-300 text-xs text-slate-800 rounded-lg p-2.5 focus:border-emerald-500 focus:outline-none cursor-pointer"
                      >
                        <option value="all">Todas as Categorias (Inventário Completo)</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.name}>{cat.name}</option>
                        ))}
                      </select>
                    </div>

                    {exportSelectedCategoryName !== 'all' && (
                      <div>
                        <label className="text-xs font-bold text-[#7d6b6b] block mb-1 text-center font-sans" style={{ fontFamily: 'Arial, sans-serif' }}>Filtrar por Subcategoria:</label>
                        <select
                          value={exportSelectedSubcategoryName}
                          onChange={(e) => setExportSelectedSubcategoryName(e.target.value)}
                          className="w-full bg-white border border-slate-300 text-xs text-slate-800 rounded-lg p-2.5 focus:border-emerald-500 focus:outline-none cursor-pointer"
                        >
                          <option value="all">Todas as Subcategorias</option>
                          {categories.find(c => c.name === exportSelectedCategoryName)?.subcategories.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handleExportPDF(exportSelectedCategoryName, exportSelectedSubcategoryName)}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Relatório em PDF</span>
                  </button>
                  <button
                    onClick={() => handleShareWhatsApp(exportSelectedCategoryName, exportSelectedSubcategoryName)}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 text-[#02d37a]" />
                    <span>Enviar Resumo p/ WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Opção 2: Relatório em PDF por Fabricante / Indústria */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                      <Factory className="w-5 h-5 stroke-[2.5]" />
                    </span>
                    <h3 className="text-sm font-black text-[#7d6b6b]">
                      Relatório PDF por Fabricante / Indústria
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Balancete de conformidade específico para apresentação aos promotores e indústrias parceiras.
                  </p>

                  <div className="space-y-2 mt-4">
                    <div>
                      <label className="text-xs font-bold text-[#7d6b6b] block mb-1 text-center font-sans" style={{ fontFamily: 'Arial, sans-serif' }}>Selecione o Fabricante:</label>
                      <select
                        value={selectedBrand}
                        onChange={(e) => setSelectedBrand(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-xs text-slate-800 rounded-lg p-2.5 focus:border-emerald-500 focus:outline-none cursor-pointer"
                      >
                        <option value="">Selecione um Fabricante...</option>
                        {allBrandsList.map(brand => (
                          <option key={brand} value={brand}>{brand}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      if (!selectedBrand) {
                        alert('Selecione um fabricante no campo acima para gerar o PDF correspondente.');
                        return;
                      }
                      handleExportPDFByBrand(selectedBrand);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Relatório do Fabricante ({selectedBrand || 'Selecione'})</span>
                  </button>
                </div>
              </div>

              {/* Opção 3: Planilha CSV Completa */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 md:col-span-2">
                <div>
                  <h4 className="text-sm font-black text-[#2a1414]">Planilha Excel / CSV do Inventário Completo</h4>
                  <p className="text-xs text-slate-500">Exporte a base bruta com todos os dados cadastrados, lotes e validades para abrir no Excel.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-[#ef210d]" />
                    <span>Baixar Inventário Geral (.CSV)</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* =========================================================================
            TELA 7: CONFIGURAÇÕES (Fabricantes, Códigos GTIN, Vasilhames e Administração)
            Point 1: "Tire a manutenção da tela inicial - Mova Zerar quantidades,
            Recarregar simulação e Apagar tudo do banco para Configurações → Administração"
           ========================================================================= */}
        {activeTab === 'configuracoes' && (
          <div className="space-y-4 animate-fade-in text-left">
            
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-center items-center text-center gap-2">
              <div className="w-full text-center">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-center text-[#000000]" style={{ fontFamily: 'Arial, sans-serif', color: '#000000' }}>
                  Configurações do Sistema
                </h2>
                <p className="text-xs text-slate-500 mt-1 text-center">
                  Gerencie cadastros estruturais, fabricantes, códigos GTIN e ferramentas administrativas.
                </p>
              </div>
            </div>

            {/* Sub-navegação interna de configurações */}
            <div className="flex gap-1.5 p-1 rounded-xl border border-slate-200 overflow-x-auto" style={{ backgroundColor: '#ffffff' }}>
              <button
                type="button"
                onClick={() => setShowManageCategoriesModal(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border border-sky-300 bg-sky-50 hover:bg-sky-100"
                style={{ color: '#0369a1' }}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Categorias & Subcategorias</span>
              </button>
              <button
                onClick={() => setConfigSubTab('fabricantes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  configSubTab === 'fabricantes' ? 'bg-white shadow-xs' : 'hover:bg-slate-50'
                }`}
                style={{ color: '#000000' }}
              >
                Fabricantes & Marcas
              </button>
              <button
                onClick={() => setConfigSubTab('gtin')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  configSubTab === 'gtin' ? 'shadow-xs' : 'hover:bg-slate-50'
                }`}
                style={{ backgroundColor: '#ffffff', color: '#000000' }}
              >
                Automação GTIN
              </button>
              <button
                onClick={() => setConfigSubTab('vasilhames')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  configSubTab === 'vasilhames' ? 'shadow-xs' : 'hover:bg-slate-50'
                }`}
                style={{ backgroundColor: '#ffffff', color: '#000000' }}
              >
                Vasilhames Retornáveis
              </button>
              <button
                onClick={() => setConfigSubTab('administracao')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border border-black ${
                  configSubTab === 'administracao' ? 'shadow-xs' : 'hover:opacity-90'
                }`}
                style={{ backgroundColor: '#030000', borderColor: '#000000', color: '#ffffff' }}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                <span>Administração & Manutenção</span>
              </button>
            </div>

            {/* SUB-TELA: FABRICANTES */}
            {configSubTab === 'fabricantes' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between" style={{ color: '#000000' }}>
                  <h3 className="text-sm font-black uppercase tracking-wide text-left" style={{ color: '#000000', fontFamily: 'Arial, sans-serif' }}>
                    Fabricantes & Indústrias Parceiras ({allBrandsList.length})
                  </h3>
                  <button
                    onClick={() => setActiveTab('fabricantes')}
                    className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Ver catálogo expandido por fabricante →
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {allBrandsList.map(b => (
                    <div key={b} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                      <span className="font-bold text-center" style={{ color: '#000000', fontFamily: 'Arial, sans-serif' }}>{b}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {products.filter(p => p.brand === b).length} SKUs
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-TELA: AUTOMAÇÃO GTIN */}
            {configSubTab === 'gtin' && (
              <div className="space-y-4">
                <GtinAutomationPanel 
                  products={products}
                  categories={categories}
                  transactions={transactions}
                  currentUser={currentUser}
                  onAddProduct={handleAddProductFromGtin}
                  onUpdateProduct={handleUpdateProductFromGtin}
                  onAddGtinHistory={handleAddGtinHistory}
                  gtinHistory={gtinHistory}
                  theme={currentTheme === 'personalizado' ? 'dark-pro' : currentTheme}
                />
              </div>
            )}

            {/* SUB-TELA: VASILHAMES */}
            {configSubTab === 'vasilhames' && (
              <div className="space-y-4">
                <VasilhamesPanel 
                  vasilhames={vasilhames}
                  transactions={vasilhameTransactions}
                  onUpdateVasilhames={async (updated) => {
                    setVasilhames(updated);
                    localStorage.setItem('bv_vasilhames', JSON.stringify(updated));
                    if (currentUser && usingFirebase) {
                      try {
                        const batch = writeBatch(db);
                        updated.forEach(v => {
                          batch.set(doc(db, 'vasilhames', v.id), v);
                        });
                        await batch.commit();
                      } catch (err) {
                        handleFirestoreError(err, OperationType.WRITE, 'vasilhames');
                      }
                    }
                  }}
                  onAddTransaction={async (txData) => {
                    const newTx: VasilhameTransaction = {
                      ...txData,
                      id: `vtx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                      data: new Date().toISOString()
                    };
                    const updatedList = [newTx, ...vasilhameTransactions];
                    setVasilhameTransactions(updatedList);
                    localStorage.setItem('bv_vasilhame_transactions', JSON.stringify(updatedList));
                    if (currentUser && usingFirebase) {
                      try {
                        await setDoc(doc(db, 'vasilhame_transactions', newTx.id), newTx);
                      } catch (err) {
                        handleFirestoreError(err, OperationType.WRITE, `vasilhame_transactions/${newTx.id}`);
                      }
                    }
                  }}
                  operatorName={currentUser?.displayName || 'Operador Central'}
                  isCosmic={isCosmic}
                />
              </div>
            )}

            {/* SUB-TELA: ADMINISTRAÇÃO & MANUTENÇÃO (POINT 1) */}
            {configSubTab === 'administracao' && (
              <div className="space-y-4">
                
                {/* Banner de Aviso de Área Restrita */}
                <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase text-amber-900 tracking-wider">
                      Área Restrita ao Administrador
                    </h4>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      As rotinas abaixo alteram e afetam de forma definitiva as quantidades e registros do banco de dados na nuvem e no armazenamento local. Para evitar cliques acidentais durante a operação, confirme a autorização abaixo antes de executar.
                    </p>
                  </div>
                </div>

                {/* Trava de Segurança */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    {adminUnlocked ? <Unlock className="w-4 h-4 text-emerald-600" /> : <Lock className="w-4 h-4 text-slate-400" />}
                    <span className="text-xs font-bold text-slate-800">
                      {adminUnlocked ? 'Acesso Administrativo Liberado' : 'Ações bloqueadas por segurança'}
                    </span>
                  </div>
                  <button
                    onClick={() => setAdminUnlocked(!adminUnlocked)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                      adminUnlocked 
                        ? 'bg-rose-50 text-rose-700 border-rose-300' 
                        : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500'
                    }`}
                  >
                    {adminUnlocked ? 'Bloquear Ferramentas' : 'Liberar Ações de Manutenção'}
                  </button>
                </div>

                {/* As 3 Ferramentas de Manutenção (Point 1) */}
                <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 transition-opacity ${adminUnlocked ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  
                  {/* CARD 1: Zerar Quantidades do Estoque */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between space-y-3 shadow-xs">
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs uppercase mb-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        Zerar Quantidades do Estoque
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Define o estoque de todos os produtos do catálogo para 0 removendo todos os lotes ativos e logs de movimentações. O cadastro de produtos e categorias permanece intacto.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm("⚠️ ATENÇÃO: Deseja realmente zerar o estoque de todos os produtos para 0? O cadastro de produtos será mantido.")) {
                          handleZeroAllQuantities();
                        }
                      }}
                      className="w-full py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-black uppercase transition-all cursor-pointer"
                    >
                      Zerar Todas as Quantidades
                    </button>
                  </div>

                  {/* CARD 2: Carregar Dados de Teste */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between space-y-3 shadow-xs">
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs uppercase mb-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        Recarregar Simulação
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Restaura o conjunto padrão de produtos e categorias de simulação para desenvolvimento e validação rápida de fluxos operacionais.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm("Deseja restaurar os dados de simulação padrão no sistema?")) {
                          handleRestoreDemoData();
                        }
                      }}
                      className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-xl text-xs font-black uppercase transition-all cursor-pointer"
                    >
                      Recarregar Simulação
                    </button>
                  </div>

                  {/* CARD 3: Limpar Todo o Sistema */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between space-y-3 shadow-xs">
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs uppercase mb-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                        Apagar Tudo do Banco
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Apaga absolutamente tudo da nuvem e do armazenamento local de forma irreversível: todos os produtos, categorias cadastrados, lotes e transações.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm("🚨 PERIGO: Esta ação apagará permanentemente todos os produtos, lotes e transações do banco de dados na nuvem e local. Confirmar exclusão total?")) {
                          handleClearAllData();
                        }
                      }}
                      className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-black uppercase transition-all cursor-pointer"
                    >
                      Apagar Tudo do Banco
                    </button>
                  </div>

                </div>

                {/* Parâmetros do Sistema (Data Âncora e Alertas) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Parâmetros Temporais & Alertas
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-slate-500 block mb-1">Data Âncora de Conferência:</span>
                      <span className="font-mono font-black text-slate-900 text-sm">{ANCHOR_DATE_STR}</span>
                      <p className="text-[11px] text-slate-400 mt-1">Utilizada para cálculo de dias restantes de lotes válidos.</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-slate-500 block mb-1">Alertas Sonoros de Vencimento:</span>
                      <span className="font-bold text-emerald-700">{useAudioAlert ? 'Ativado' : 'Desativado'}</span>
                      <p className="text-[11px] text-slate-400 mt-1">Avisos de lote a cada {audioAlertThresholdDays} dias.</p>
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

    {/* ACTIVEVIEW: STOCK / ESTOQUE MANAGEMENT */}
    {activeTab === 'estoque' && (
      <div className="space-y-4 sm:space-y-6">

        {/* Action Buttons Hub & Scanner Control Toggle */}
        {designConfig.showQuickActions && (
        <div className={`p-4 border rounded-2xl ${isCosmic ? 'bg-white border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)]' : 'bg-slate-900/40 border-slate-800'}`}>
          
          <div className="flex flex-wrap gap-2 w-full">
            <button
              onClick={() => {
                // Toggle camera scanner view
                setShowScanner(!showScanner);
              }}
              className={`font-semibold text-xs px-4 py-2.5 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-2 flex-1 sm:flex-initial cursor-pointer ${
                showScanner 
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_15px_rgba(225,29,72,0.3)]'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.35)] font-bold'
              }`}
            >
              <Scan className="w-4 h-4 stroke-[2.5]" />
              <span className="truncate">{showScanner ? 'Fechar Leitor_UI' : 'Scanner'}</span>
            </button>

            <button
              onClick={() => {
                setNewProdBarcode('');
                setNewProdName('');
                setNewProdBrand('');
                setNewProdWeightVolume('');
                setNewProdImage('');
                setNewProdDescription('');
                setNewProdBatchId(`l-${Date.now()}`);
                setNewProdBatchDate('');
                setNewProdBatchQty('10');
                setShowAddProductModal(true);
              }}
              className={`font-semibold text-xs px-3.5 py-2.5 rounded-xl uppercase tracking-wider transition-all border flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer active:scale-95 ${
                isCosmic 
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-sm' 
                  : 'bg-slate-800 hover:bg-slate-705 text-slate-100 border-slate-700'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span className="truncate">Novo Produto</span>
            </button>

            <button
              onClick={() => setShowBulkImportModal(true)}
              className="font-bold text-xs px-3.5 py-2.5 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer active:scale-95 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-[0_4px_12px_rgba(16,185,129,0.25)] border border-emerald-400/30"
              title="Importar catálogo em lote via planilha Excel (.xlsx, .xls) ou CSV"
            >
              <FileSpreadsheet className="w-4 h-4 stroke-[2.2]" />
              <span className="truncate">IMPORTAR EM MASSA</span>
            </button>

            <button
              onClick={() => setShowManageCategoriesModal(true)}
              className={`font-bold text-xs px-3.5 py-2.5 rounded-xl uppercase tracking-wider transition-all border flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer active:scale-95 bg-white border-slate-300 shadow-xs`}
              style={{ backgroundColor: '#ffffff', color: '#000000' }}
            >
              <Layers className="w-4 h-4 stroke-[2.5]" style={{ color: '#010101' }} />
              <span className="truncate" style={{ color: '#000000' }}>Categorias</span>
            </button>

            <button
              onClick={() => {
                setShowAllInEntrada(false);
                setShowGlobalEntradaModal(true);
              }}
              className={`font-bold text-xs px-3.5 py-2.5 rounded-xl uppercase tracking-wider transition-all border flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer active:scale-95 bg-white border-slate-300 shadow-xs`}
              style={{ backgroundColor: '#ffffff', color: '#000000' }}
            >
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" style={{ color: '#000000' }} />
              <span className="truncate" style={{ color: '#000000' }}>Entrada</span>
            </button>

            <button
              onClick={() => {
                setShowAllInSaida(false);
                setShowGlobalSaidaModal(true);
              }}
              className={`font-bold text-xs px-3.5 py-2.5 rounded-xl uppercase tracking-wider transition-all border flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer active:scale-95 bg-white border-slate-300 shadow-xs`}
              style={{ backgroundColor: '#ffffff' }}
            >
              <ArrowDownLeft className="w-4 h-4 text-rose-505 stroke-[2.5]" />
              <span className="truncate">Saída</span>
            </button>

            <button
              onClick={() => {
                setShowQuickSearch(true);
                setQuickSearchQuery('');
              }}
              className={`font-bold text-xs px-3.5 py-2.5 rounded-xl uppercase tracking-wider transition-all border flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer active:scale-95 bg-white border-slate-300 shadow-xs`}
              style={{ backgroundColor: '#ffffff', color: '#000000' }}
            >
              <Search 
                className="w-4 h-4 p-0.5 rounded stroke-[2.5]" 
                style={{ backgroundColor: '#fcf1f1', color: '#040404' }} 
              />
              <span className="truncate" style={{ color: '#000000' }}>Buscar</span>
            </button>
          </div>

        </div>
        )}

        {/* Display Active Camera Scanner Module */}
        {showScanner && (
          <div className="max-w-2xl mx-auto">
            <BarcodeScanner 
              onScan={handleBarcodeScanned} 
              onClose={() => setShowScanner(false)} 
              scanActionMode={scanActionMode}
              setScanActionMode={setScanActionMode}
            />
          </div>
        )}

        {/* Organization Mode Switcher: Categorias vs Fabricantes */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-300 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 shrink-0">
              {inventoryGrouping === 'categoria' ? <Layers className="w-4.5 h-4.5 stroke-[2.5]" /> : <Factory className="w-4.5 h-4.5 stroke-[2.5]" />}
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 leading-none">
                Modo de Organização do Inventário
              </h3>
              <p className="text-[10.5px] text-slate-500 font-sans mt-0.5">
                {inventoryGrouping === 'categoria' 
                  ? 'Exibindo produtos distribuídos por Categorias e Subcategorias' 
                  : 'Exibindo produtos organizados por Fabricante, Indústria e Marcas Parceiras'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setInventoryGrouping('categoria');
                setSelectedBrand('');
              }}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                inventoryGrouping === 'categoria'
                  ? 'bg-emerald-500 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Por Categorias</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInventoryGrouping('fabricante');
                setSelectedCategory('');
              }}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                inventoryGrouping === 'fabricante'
                  ? 'bg-emerald-500 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Factory className="w-3.5 h-3.5" />
              <span>Por Fabricantes</span>
            </button>
          </div>
        </div>

        {inventoryGrouping === 'categoria' ? (
          /* Visual Category Boxes (Caixas de Categoria) */
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                <h3 className={`text-xs font-black uppercase tracking-wider font-sans ${isCosmic ? 'text-slate-800' : 'text-slate-205'}`}>
                  Visualizar por Caixas de Categoria
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowManageCategoriesModal(true)}
                  className="text-[10px] font-bold text-sky-700 hover:text-sky-900 bg-sky-50 border border-sky-300 px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                >
                  <Layers className="w-3 h-3" />
                  Gerenciar
                </button>
                {(selectedCategory || selectedSubcategory) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('');
                      setSelectedSubcategory('');
                    }}
                    className="text-[10px] font-mono font-bold text-rose-500 hover:text-rose-400 uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                  >
                    ✕ Limpar Filtro
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Box "TODAS" */}
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('');
                  setSelectedSubcategory('');
                }}
                className={`relative text-left w-full cursor-pointer p-3 rounded-2xl border transition-all duration-300 flex flex-col justify-between min-h-[6rem] shadow-xs active:scale-[0.98] group ${
                  selectedCategory === ''
                    ? (isCosmic 
                        ? 'bg-slate-100 ring-2 ring-indigo-600/10' 
                        : 'bg-emerald-500/10 ring-2 ring-emerald-500/15')
                    : (isCosmic 
                        ? 'bg-white hover:bg-slate-50' 
                        : 'bg-slate-905/60 hover:bg-[#141720]/80')
                }`}
                style={{ borderColor: '#000000' }}
              >
                <div className="flex justify-between items-start w-full">
                  <div className={`p-1.5 rounded-xl transition-colors ${
                    selectedCategory === '' 
                      ? (isCosmic ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-[#090b10]') 
                      : (isCosmic ? 'bg-slate-100 text-slate-500' : 'bg-slate-800/80 text-slate-400')
                  }`}>
                    <Package className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${
                    selectedCategory === '' 
                      ? (isCosmic ? 'text-indigo-700' : 'text-emerald-400') 
                      : (isCosmic ? 'text-slate-400' : 'text-slate-500')
                  }`}>
                    {products.length} itens
                  </span>
                </div>
                
                <div className="w-full">
                  <p className={`text-xs font-black truncate uppercase tracking-tight ${
                    selectedCategory === '' 
                      ? (isCosmic ? 'text-indigo-600' : 'text-emerald-400') 
                      : (isCosmic ? 'text-slate-800' : 'text-slate-200')
                  }`}>
                    Todos
                  </p>
                  <div className="flex items-center gap-1">
                    <span className={`text-[9px] font-mono ${isCosmic ? 'text-slate-500' : 'text-slate-400'}`}>Estoque Completo</span>
                  </div>
                </div>
              </button>

              {/* Individual Registered Categories */}
              {categories.map((cat) => {
                const stats = categoryStats[cat.name] || { count: 0, totalQty: 0, anyExpired: false, anyCritical: false };
                const isSelected = selectedCategory.trim().toLowerCase() === cat.name.trim().toLowerCase();
                const subCount = (cat.subcategories || []).length;

                return (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedCategory('');
                        setSelectedSubcategory('');
                      } else {
                        setSelectedCategory(cat.name);
                        setSelectedSubcategory('');
                        setExpandedCategories(prev => ({ ...prev, [cat.name]: true }));
                      }
                    }}
                    className={`relative text-left w-full cursor-pointer p-3 rounded-2xl border transition-all duration-300 flex flex-col justify-between min-h-[6rem] shadow-xs active:scale-[0.98] group ${
                      isSelected
                        ? (isCosmic 
                            ? 'bg-indigo-50 ring-2 ring-indigo-600/10' 
                            : 'bg-emerald-50 ring-2 ring-emerald-500/40')
                        : (isCosmic 
                            ? 'bg-white hover:bg-slate-50' 
                            : 'bg-slate-905/60 hover:bg-[#141720]/80')
                    }`}
                    style={{ borderColor: '#000000' }}
                  >
                    {/* Alarm indicator dots */}
                    <div className="absolute top-2.5 right-2.5 flex gap-1">
                      {stats.anyExpired && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Possui produtos vencidos!" />
                      )}
                      {stats.anyCritical && !stats.anyExpired && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Possui produtos perto de vencer" />
                      )}
                    </div>

                    <div className="flex justify-between items-start w-full">
                      <div className={`p-1.5 rounded-xl transition-colors ${
                        isSelected 
                          ? (isCosmic ? 'bg-indigo-600 text-white' : 'bg-[#14b8a6] text-[#090b10]') 
                          : (isCosmic ? 'bg-slate-100 text-slate-500' : 'bg-slate-805 text-slate-400')
                      }`}>
                        {getCategoryIcon(cat.name)}
                      </div>
                      <span className={`text-[10px] font-mono font-bold ${
                        isSelected 
                          ? (isCosmic ? 'text-indigo-700' : 'text-emerald-700') 
                          : (isCosmic ? 'text-slate-400' : 'text-slate-500')
                      }`}>
                        {stats.count} {stats.count === 1 ? 'item' : 'itens'}
                      </span>
                    </div>

                    <div className="w-full">
                      <h4 className={`text-xs font-black truncate uppercase tracking-tight ${
                        isSelected 
                          ? (isCosmic ? 'text-indigo-600 font-extrabold' : 'text-emerald-800 font-extrabold') 
                          : (isCosmic ? 'text-slate-800 group-hover:text-indigo-600' : 'text-slate-205 group-hover:text-emerald-400')
                      }`}>
                        {cat.name}
                      </h4>
                      <p className={`text-[10px] font-mono leading-none mt-0.5 ${isCosmic ? 'text-slate-500' : 'text-slate-400'}`}>
                        {stats.totalQty} un. • {subCount} {subCount === 1 ? 'subcat.' : 'subcats.'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Subcategories Bar when a Category is selected */}
            {selectedCategory && (() => {
              const activeCatObj = categories.find(
                c => c.name.trim().toLowerCase() === selectedCategory.trim().toLowerCase()
              );
              const subsList = [...(activeCatObj?.subcategories || [])].sort((a, b) =>
                a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
              );
              return (
                <div className="bg-white border-2 border-slate-900 rounded-2xl p-3.5 space-y-2.5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-700" />
                      <span className="text-xs font-black uppercase tracking-wide text-slate-900">
                        Subcategorias de {activeCatObj?.name || selectedCategory} ({subsList.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowManageCategoriesModal(true)}
                      className="text-[10px] font-bold text-sky-700 hover:text-sky-900 bg-sky-50 border border-sky-300 px-2.5 py-1 rounded-lg cursor-pointer"
                    >
                      + Editar / Criar Subcategoria
                    </button>
                  </div>
                  {subsList.length === 0 ? (
                    <p className="text-xs text-slate-600">
                      Nenhuma subcategoria vinculada a esta categoria. Toque em "+ Editar / Criar Subcategoria" para adicionar.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSubcategory('')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                          selectedSubcategory === ''
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                            : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        Todas
                      </button>
                      {subsList.map((sub) => {
                        const isSubActive = selectedSubcategory.trim().toLowerCase() === sub.trim().toLowerCase();
                        return (
                          <button
                            key={sub}
                            type="button"
                            onClick={() => setSelectedSubcategory(isSubActive ? '' : sub)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                              isSubActive
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {sub}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          /* Visual Manufacturer Boxes (Caixas de Fabricante) */
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                <h3 className={`text-xs font-black uppercase tracking-wider font-sans ${isCosmic ? 'text-slate-800' : 'text-slate-205'}`}>
                  Visualizar por Caixas de Fabricante
                </h3>
              </div>
              {selectedBrand && (
                <button
                  onClick={() => setSelectedBrand('')}
                  className="text-[10px] font-mono font-bold text-rose-500 hover:text-rose-400 uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                >
                  ✕ Limpar Filtro de Fabricante
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Box "TODOS OS FABRICANTES" */}
              <div
                onClick={() => setSelectedBrand('')}
                className={`relative cursor-pointer p-3 rounded-2xl border transition-all duration-300 flex flex-col justify-between h-24 shadow-xs select-none active:scale-[0.98] group ${
                  selectedBrand === ''
                    ? (isCosmic 
                        ? 'bg-slate-100 ring-2 ring-indigo-600/10' 
                        : 'bg-emerald-500/10 ring-2 ring-emerald-500/15')
                    : (isCosmic 
                        ? 'bg-white hover:bg-slate-50' 
                        : 'bg-slate-905/60 hover:bg-[#141720]/80')
                }`}
                style={{ borderColor: '#000000' }}
              >
                <div className="flex justify-between items-start">
                  <div className={`p-1.5 rounded-xl transition-colors ${
                    selectedBrand === '' 
                      ? (isCosmic ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-[#090b10]') 
                      : (isCosmic ? 'bg-slate-100 text-slate-500' : 'bg-slate-800/80 text-slate-400')
                  }`}>
                    <Factory className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${
                    selectedBrand === '' 
                      ? (isCosmic ? 'text-indigo-700' : 'text-emerald-400') 
                      : (isCosmic ? 'text-slate-400' : 'text-slate-500')
                  }`}>
                    {products.length} itens
                  </span>
                </div>
                
                <div>
                  <p className={`text-xs font-black truncate uppercase tracking-tight ${
                    selectedBrand === '' 
                      ? (isCosmic ? 'text-indigo-600' : 'text-emerald-400') 
                      : (isCosmic ? 'text-slate-800' : 'text-slate-200')
                  }`}>
                    Todos Fabricantes
                  </p>
                  <div className="flex items-center gap-1">
                    <span className={`text-[9px] font-mono ${isCosmic ? 'text-slate-500' : 'text-slate-400'}`}>Estoque Completo</span>
                  </div>
                </div>
              </div>

              {/* Individual Registered Brands / Manufacturers */}
              {catalogBrandsList.map((brandName) => {
                const stats = brandStats[brandName] || { count: 0, totalQty: 0, anyExpired: false, anyCritical: false };
                const isSelected = selectedBrand === brandName;

                return (
                  <div
                    key={brandName}
                    onClick={() => setSelectedBrand(isSelected ? '' : brandName)}
                    className={`relative cursor-pointer p-3 rounded-2xl border transition-all duration-300 flex flex-col justify-between h-24 shadow-xs select-none active:scale-[0.98] group ${
                      isSelected
                        ? (isCosmic 
                            ? 'bg-indigo-50 ring-2 ring-indigo-600/10' 
                            : 'bg-emerald-500/15 ring-2 ring-emerald-500/30 border-emerald-500')
                        : (isCosmic 
                            ? 'bg-white hover:bg-slate-50' 
                            : 'bg-slate-905/60 hover:bg-[#141720]/80')
                    }`}
                    style={{ borderColor: '#000000' }}
                  >
                    {/* Alarm indicator dots */}
                    <div className="absolute top-2.5 right-2.5 flex gap-1">
                      {stats.anyExpired && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Possui produtos vencidos deste fabricante!" />
                      )}
                      {stats.anyCritical && !stats.anyExpired && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Possui produtos perto de vencer deste fabricante" />
                      )}
                    </div>

                    <div className="flex justify-between items-start">
                      <div className={`p-1.5 rounded-xl transition-colors ${
                        isSelected 
                          ? (isCosmic ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-[#090b10]') 
                          : (isCosmic ? 'bg-slate-100 text-slate-500' : 'bg-slate-805 text-slate-400')
                      }`}>
                        <Factory className="w-4 h-4" />
                      </div>
                      <span className={`text-[10px] font-mono font-bold ${
                        isSelected 
                          ? (isCosmic ? 'text-indigo-700' : 'text-emerald-400') 
                          : (isCosmic ? 'text-slate-400' : 'text-slate-500')
                      }`}>
                        {stats.count} {stats.count === 1 ? 'item' : 'itens'}
                      </span>
                    </div>

                    <div>
                      <h4 className={`text-xs font-black truncate uppercase tracking-tight ${
                        isSelected 
                          ? (isCosmic ? 'text-indigo-600 font-extrabold' : 'text-emerald-400 font-extrabold') 
                          : (isCosmic ? 'text-slate-800 group-hover:text-indigo-600' : 'text-slate-205 group-hover:text-emerald-400')
                      }`}>
                        {brandName}
                      </h4>
                      <p className={`text-[10px] font-mono leading-none ${isCosmic ? 'text-slate-500' : 'text-slate-400'}`}>
                        {stats.totalQty} un.
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

            {/* Search Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Pesquisar por produto, código..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full ${themeStyles.inputBg} rounded-xl pl-10 pr-4 py-3 text-xs focus:outline-none placeholder-slate-505 font-sans transition-all`}
                  style={{ borderColor: '#000000' }}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold hover:text-slate-350"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setSelectedSubcategory('');
                  }}
                  aria-label="Filtrar estoque por Categoria"
                  className={`w-full ${themeStyles.inputBg} rounded-xl px-4 py-3 text-xs focus:outline-none cursor-pointer`}
                  style={{ borderColor: '#000000' }}
                >
                  <option value="" className={isCosmic ? 'text-slate-900 bg-white' : 'text-slate-100 bg-[#101218]'}>Todas as Categorias</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.name} className={isCosmic ? 'text-slate-900 bg-white' : 'text-slate-100 bg-[#101218]'}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={selectedSubcategory}
                  onChange={(e) => setSelectedSubcategory(e.target.value)}
                  aria-label="Filtrar estoque por Subcategoria"
                  className={`w-full ${themeStyles.inputBg} rounded-xl px-4 py-3 text-xs focus:outline-none cursor-pointer`}
                  style={{ borderColor: '#000000' }}
                >
                  <option value="">Todas as Subcategorias</option>
                  {(selectedCategory
                    ? categories.find(c => c.name.trim().toLowerCase() === selectedCategory.trim().toLowerCase())?.subcategories || []
                    : Array.from(new Set(categories.flatMap(c => c.subcategories || [])))
                  )
                    .slice()
                    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
                    .map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                </select>
              </div>

              <div>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className={`w-full ${themeStyles.inputBg} rounded-xl px-4 py-3 text-xs focus:outline-none cursor-pointer font-sans`}
                  style={{ borderColor: '#000000' }}
                >
                  <option value="" className={isCosmic ? 'text-slate-900 bg-white' : 'text-slate-100 bg-[#101218]'}>Todos os Fabricantes</option>
                  {catalogBrandsList.map(brandName => (
                    <option key={brandName} value={brandName} className={isCosmic ? 'text-slate-900 bg-white' : 'text-slate-100 bg-[#101218]'}>
                      🏭 {brandName} ({brandStats[brandName]?.count || 0})
                    </option>
                  ))}
                  {products.some(p => !p.brand || !p.brand.trim()) && (
                    <option value="sem_fabricante" className={isCosmic ? 'text-slate-900 bg-white' : 'text-slate-100 bg-[#101218]'}>
                      Sem Fabricante Informado ({brandStats['Sem Fabricante']?.count || 0})
                    </option>
                  )}
                </select>
              </div>

              <div 
                className={`flex items-center gap-1.5 ${themeStyles.bgCard} p-1.5 rounded-xl border`}
                style={{ borderColor: '#000000' }}
              >
                <span className={`text-[10px] ${themeStyles.textMuted} font-mono font-bold uppercase pl-2`}>Estoque:</span>
                <div className="flex-1 flex gap-1">
                  {(['todos', 'vencidos', 'criticos'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setSelectedStatusFilter(filter)}
                      className={`flex-1 text-[10px] font-semibold py-1.5 px-2 rounded-lg capitalize transition-all cursor-pointer ${
                        selectedStatusFilter === filter 
                          ? (isCosmic ? 'bg-indigo-600 text-white font-bold' : 'bg-[#14b8a6] text-[#090b10] font-black')
                          : `${themeStyles.textMuted} hover:text-slate-100`
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Inventory Listing */}
            {filteredProducts.length === 0 ? (
              <div className={`${themeStyles.bgCard} border rounded-2xl py-12 px-6 text-center text-slate-550`}>
                <HelpCircle className="w-10 h-10 mx-auto text-slate-500 mb-2" />
                <p className="text-xs font-semibold mb-1">Nenhum produto correspondente encontrado</p>
                <p className="text-[10px]">Tente limpar os filtros, redefinir a busca ou cadastrar novos itens.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(inventoryGrouping === 'categoria' ? productsByCategory : productsByBrand)
                  .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
                  .map(([groupName, groupProducts], groupIndex) => {
                  const isExpanded = inventoryGrouping === 'categoria'
                    ? !!(
                        expandedCategories[groupName] || 
                        searchQuery !== '' || 
                        selectedStatusFilter !== 'todos' ||
                        selectedSubcategory !== ''
                      )
                    : !!(
                        expandedBrands[groupName] || 
                        searchQuery !== '' || 
                        selectedStatusFilter !== 'todos' || 
                        selectedBrand === groupName
                      );

                  return (
                    <div 
                      key={groupName} 
                      className="bg-white rounded-2xl overflow-hidden border transition-all duration-300 shadow-xs"
                      style={{ borderColor: '#000000', backgroundColor: '#ffffff' }}
                    >
                      {/* Collapsible Box Header */}
                      <div 
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => {
                          if (inventoryGrouping === 'categoria') {
                            setExpandedCategories(prev => ({
                              ...prev,
                              [groupName]: !isExpanded
                            }));
                          } else {
                            setExpandedBrands(prev => ({
                              ...prev,
                              [groupName]: !isExpanded
                            }));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (inventoryGrouping === 'categoria') {
                              setExpandedCategories(prev => ({
                                ...prev,
                                [groupName]: !isExpanded
                              }));
                            } else {
                              setExpandedBrands(prev => ({
                                ...prev,
                                [groupName]: !isExpanded
                              }));
                            }
                          }
                        }}
                        className="px-3.5 sm:px-5 py-3.5 sm:py-4 flex items-center justify-between gap-2 cursor-pointer transition-all duration-150 border-b bg-white hover:bg-slate-50 text-slate-900 touch-manipulation"
                        style={{ borderColor: '#000000', backgroundColor: '#ffffff', color: '#000000' }}
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                          <div className={`p-2 rounded-xl transition-all duration-200 shrink-0 ${
                            isExpanded 
                              ? (isCosmic ? 'bg-indigo-600 text-white' : 'bg-[#14b8a6] text-[#090b10]')
                              : (isCosmic ? 'bg-slate-100 text-slate-500 shadow-inner' : 'bg-slate-805 text-slate-400')
                          }`}>
                            {inventoryGrouping === 'categoria' ? getCategoryIcon(groupName) : <Factory className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-black uppercase tracking-wider font-sans block leading-tight truncate">
                              {groupName}
                            </span>
                            <span className={`text-[9px] font-mono leading-none mt-1 block uppercase tracking-tight ${isCosmic ? 'text-slate-555' : 'text-slate-500'}`}>
                              {inventoryGrouping === 'categoria' ? 'Toque para abrir/fechar categoria' : 'Caixa do Fabricante'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                          {inventoryGrouping === 'fabricante' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNewProdBarcode('');
                                setNewProdName('');
                                setNewProdBrand(groupName === 'Sem Fabricante' ? '' : groupName);
                                setNewProdWeightVolume('');
                                setNewProdImage('');
                                setNewProdDescription('');
                                setNewProdBatchId(`l-${Date.now()}`);
                                setNewProdBatchDate('');
                                setNewProdBatchQty('10');
                                setShowAddProductModal(true);
                              }}
                              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:text-slate-950 bg-emerald-500/10 hover:bg-emerald-400 border border-emerald-500/25 rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
                              title={`Cadastrar novo produto para o fabricante ${groupName}`}
                            >
                              <Plus className="w-3 h-3 stroke-[2.5]" />
                              <span className="hidden sm:inline">+ Cadastrar Item</span>
                            </button>
                          )}
                          {groupProducts.length > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (inventoryGrouping === 'categoria') {
                                    handleExportPDF(groupName);
                                  } else {
                                    handleExportPDFByBrand(groupName);
                                  }
                                }}
                                className="px-2 sm:px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-600 hover:text-white bg-sky-50 hover:bg-sky-600 border border-sky-200 hover:border-sky-600 rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
                                title={`Exportar relatório em PDF`}
                              >
                                <FileText className="w-3 h-3" />
                                <span className="hidden sm:inline">PDF</span>
                              </button>
                              {inventoryGrouping === 'categoria' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteAllProductsInCategory(groupName);
                                  }}
                                  className="px-2 sm:px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
                                  title={`Excluir todos os produtos da categoria ${groupName}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span className="hidden sm:inline">Excluir Todos</span>
                                </button>
                              )}
                            </>
                          )}
                          <span className={`text-[10px] font-mono px-2 sm:px-2.5 py-1 rounded-full font-bold whitespace-nowrap ${
                            isCosmic ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                          }`}>
                            <strong className="font-black font-mono">
                              {categoryStats[groupName]?.totalQty ?? groupProducts.reduce((sum, p) => sum + p.batches.reduce((s, b) => s + b.quantity, 0) + (productSectorsSums[p.id]?.totalTransferred || 0), 0)}
                            </strong> un • {groupProducts.length}
                          </span>
                          <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                            <ChevronDown className={`w-4.5 h-4.5 ${isExpanded ? (isCosmic ? 'text-indigo-600' : 'text-[#14b8a6]') : 'text-slate-500'}`} />
                          </div>
                        </div>
                      </div>

                      {/* Expanded Section with Products list */}
                      {isExpanded && (
                        <div>
                          <div className={`divide-y divide-[#000000] ${isCosmic ? 'divide-slate-205/60' : 'divide-slate-800/60'}`} style={{ borderColor: '#000000' }}>
                              {groupProducts.map((product, productIndex) => {
                    const isExpanded = expandedProductId === product.id || searchQuery.trim() !== '';
                    const totalQty = product.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[product.id]?.totalTransferred || 0);
                    const isLowStock = totalQty < product.minStock;

                    // Expiration alarms summary
                    const expiredCount = product.batches.filter(b => getDaysRemaining(b.date) < 0).length;
                    const criticalCount = product.batches.filter(b => {
                      const days = getDaysRemaining(b.date);
                      return days >= 0 && days <= 30;
                    }).length;

                    // Standardize clean white styling for all category boxes and product cards
                    const isTargetBox = true;

                    // Dynamically set high-contrast status colors and labels
                    let cardStatusColor = 'bg-white border-l-4 border-l-slate-300 hover:bg-slate-50/50';
                    let qtyBadgeStyle = 'bg-white border-white text-[#0F172A] font-black shadow-none';

                    if (expiredCount > 0) {
                      cardStatusColor = 'bg-white border-l-4 border-l-rose-500 hover:bg-rose-50/40';
                      qtyBadgeStyle = 'bg-white border-white text-rose-700 font-black shadow-none';
                    } else if (totalQty === 0) {
                      cardStatusColor = 'bg-white border-l-4 border-l-red-500 hover:bg-red-50/30';
                      qtyBadgeStyle = 'bg-white border-white text-red-700 font-black animate-pulse shadow-none';
                    } else if (criticalCount > 0) {
                      cardStatusColor = 'bg-white border-l-4 border-l-amber-500 hover:bg-amber-50/30 font-bold';
                      qtyBadgeStyle = 'bg-white border-white text-amber-850 font-black shadow-none';
                    } else if (isLowStock) {
                      cardStatusColor = 'bg-white border-l-4 border-l-amber-400 hover:bg-amber-50/20';
                      qtyBadgeStyle = 'bg-white border-white text-amber-700 font-black shadow-none';
                    } else {
                      cardStatusColor = 'bg-white border-l-4 border-l-emerald-500 hover:bg-slate-50';
                      qtyBadgeStyle = 'bg-white border-white text-emerald-700 font-black shadow-none';
                    }

                    return (
                      <div key={product.id} className={`transition-all duration-150 bg-white ${cardStatusColor}`} style={{ borderColor: '#000000', backgroundColor: '#ffffff' }}>
                        {/* Summary Header of product */}
                        <div 
                          onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                          className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 cursor-pointer select-none bg-white"
                          style={{ borderColor: '#000000', backgroundColor: '#ffffff' }}
                        >
                          <div className="flex items-center gap-3.5 flex-1 min-w-0">
                            {/* Imagem do Produto */}
                            <div 
                              className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center overflow-hidden relative shadow-inner border bg-white border-slate-200"
                              style={{ borderColor: '#000000' }}
                            >
                              {product.image ? (
                                <img 
                                  src={product.image} 
                                  alt={product.name} 
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover" 
                                />
                              ) : (
                                <Package className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0 space-y-1 bg-white" style={{ backgroundColor: '#ffffff' }}>
                              <div>
                                <span className="text-[9px] uppercase font-mono font-bold text-slate-500 block">
                                  Nome do Item Comercial (Cadastrado):
                                </span>
                                <h3 
                                  className="text-base font-black tracking-tight leading-snug text-slate-900 bg-white"
                                  style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                >
                                  {product.name}
                                </h3>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
                                <span 
                                  className="text-[10px] font-mono px-2 py-0.5 rounded border font-bold bg-white border-slate-300 shadow-xs"
                                  style={{ color: '#ad1515', backgroundColor: '#ffffff' }}
                                >
                                  {product.barcode ? product.barcode : (
                                    <span className="text-slate-400 font-normal italic">Sem código</span>
                                  )}
                                </span>
                                {(() => {
                                  const val = getProductValidadeSummary(product);
                                  return (
                                    <span 
                                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 bg-white border-slate-300 shadow-xs"
                                      style={{ color: '#010101', backgroundColor: '#ffffff' }}
                                    >
                                      <Calendar className="w-3 h-3 text-[#010101]" />
                                      <span style={{ color: '#010101' }}>{val.text}</span>
                                    </span>
                                  );
                                })()}
                                {product.brand ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedBrand(selectedBrand === product.brand ? '' : product.brand!);
                                    }}
                                    className="text-[9.5px] font-medium font-mono px-2 py-0.5 rounded border transition-all flex items-center gap-1 cursor-pointer active:scale-95 bg-white border-slate-300 shadow-xs"
                                    style={{ color: '#333333', backgroundColor: '#ffffff' }}
                                    title={`Filtrar pelo fabricante ${product.brand}`}
                                  >
                                    <Factory className="w-2.5 h-2.5 shrink-0 text-slate-500" />
                                    <span style={{ color: '#333333' }}>Fabricante: <strong className="text-black">{product.brand}</strong></span>
                                  </button>
                                ) : (
                                  <span className="text-[9px] font-mono text-slate-500 bg-white border border-slate-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Factory className="w-2.5 h-2.5 opacity-50" />
                                    <span>Sem fabricante</span>
                                  </span>
                                )}
                                {product.weightVolume && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-white text-slate-700 border-slate-200" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
                                    {product.weightVolume}
                                  </span>
                                )}
                              </div>
                              <div 
                                className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 pt-0.5 bg-white"
                                style={{ backgroundColor: '#ffffff', color: '#000000' }}
                              >
                                <span>Embalagem: <strong className="text-slate-900 font-bold">{product.packaging}</strong></span>
                                <span>•</span>
                                <span>Mínimo ideal: <strong className="text-slate-900 font-mono font-bold">{product.minStock}</strong></span>
                              </div>
                            </div>
                          </div>

                          {/* Quantities and action control badge */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-5">
                            {/* Ajuste de Estoque Rápido (+ / -) */}
                            <div className="flex items-center gap-1.5 rounded-xl shrink-0 select-none border p-1 sm:p-1.5 bg-white border-slate-205 shadow-md">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickQuantityChange(product, -1);
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg font-black border active:scale-90 transition-all cursor-pointer text-sm bg-white hover:bg-rose-55 text-rose-600 border-slate-200 shadow-sm"
                                title="Subtrair 1 unidade do estoque"
                              >
                                -
                              </button>
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenMovement(product, 'entrada');
                                }}
                                className="text-center min-w-[62px] px-2 py-1 rounded-lg border transition-all cursor-pointer select-none bg-slate-50 border-slate-250 text-black font-black"
                                title="Clique para realizar uma movimentação rápida (Entrada/Saída)"
                              >
                                <span className="text-sm sm:text-base font-black font-mono leading-none block text-black">
                                  {totalQty}
                                </span>
                                <span className="text-[9.5px] uppercase tracking-wider font-black leading-none block mt-0.5 text-black" title={product.packaging}>
                                  {formatOnlyPackagingSingularPlural(totalQty, product.packaging || 'un')}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickQuantityChange(product, 1);
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg font-black border active:scale-90 transition-all cursor-pointer text-sm bg-white hover:bg-emerald-55 text-emerald-600 border-slate-200 shadow-sm"
                                title="Adicionar 1 ao estoque"
                              >
                                +
                              </button>
                            </div>

                            <div className="text-right col-span-1 min-w-[105px]">
                              <div className="flex flex-col gap-1 items-end">
                                {expiredCount > 0 && (
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider leading-none whitespace-nowrap ${themeStyles.badgeExpired}`}>
                                    {expiredCount} VENCIDO
                                  </span>
                                )}
                                {criticalCount > 0 && (
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider leading-none whitespace-nowrap ${themeStyles.badgeCritical}`}>
                                    {criticalCount} CRÍTICO
                                  </span>
                                )}
                                {totalQty === 0 && (
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider leading-none whitespace-nowrap animate-pulse ${themeStyles.badgeExpired}`}>
                                    SEM ESTOQUE
                                  </span>
                                )}
                                {totalQty > 0 && isLowStock && (
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider leading-none whitespace-nowrap ${themeStyles.badgeCritical}`}>
                                    BAIXO ESTOQUE
                                  </span>
                                )}
                                {totalQty > product.minStock && expiredCount === 0 && criticalCount === 0 && (
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider leading-none whitespace-nowrap ${themeStyles.badgeOk}`}>
                                    ESTOQUE OK
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProduct(product);
                              }}
                              className={`inline-flex p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${isCosmic ? 'bg-slate-50 border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300' : 'bg-slate-800 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 border-slate-700/80 hover:border-rose-500/30'}`}
                              title="Excluir produto permanentemente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenMovement(product, 'entrada');
                              }}
                              className={`hidden sm:inline-flex p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${isCosmic ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'}`}
                              title="Registrar movimentação rápida"
                            >
                              <Plus className="w-4 h-4" />
                            </button>

                            <div className={isCosmic ? 'text-slate-400' : 'text-slate-600'}>
                              {isExpanded ? <ChevronUp className={`w-4 h-4 ${themeStyles.textAccent}`} /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>
                        </div>

                        {/* Collapsible details of lots & batches */}
                        {isExpanded && (
                          <div 
                            className="px-5 py-4 border-t space-y-4"
                            style={{ backgroundColor: '#fcfcfc' }}
                          >
                            {/* Banner Destacado com Nome do Item Comercial Cadastrado */}
                            <div className="p-3.5 bg-white border border-slate-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
                              <div>
                                <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-extrabold inline-block mb-1">
                                  Nome do Item Comercial Cadastrado
                                </span>
                                <h4 className="text-base sm:text-lg font-black text-slate-950 leading-snug">
                                  {product.name}
                                </h4>
                              </div>
                              {product.brand && (
                                <div className="sm:text-right shrink-0">
                                  <span className="text-[9px] font-mono uppercase text-slate-500 font-bold block">
                                    Fabricante / Marca:
                                  </span>
                                  <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 inline-block mt-0.5">
                                    {product.brand}
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            {/* Especificações Detalhadas do Produto */}
                            {(product.image || product.brand || product.weightVolume || product.description) && (
                              <div 
                                className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl border border-slate-300 shadow-xs"
                                style={{ backgroundColor: '#ffffff', borderColor: '#000000' }}
                              >
                                {product.image && (
                                  <div 
                                    className="md:col-span-1 flex items-center justify-center p-2 rounded-lg overflow-hidden h-28 w-full border bg-slate-50"
                                    style={{ borderColor: '#000000' }}
                                  >
                                    <img 
                                      src={product.image} 
                                      alt={product.name} 
                                      referrerPolicy="no-referrer"
                                      className="h-full object-contain hover:scale-105 transition-transform" 
                                    />
                                  </div>
                                )}
                                <div className={`${product.image ? 'md:col-span-3' : 'md:col-span-4'} flex flex-col justify-between space-y-3 text-xs`}>
                                  {/* Item Comercial Cadastrado - Destaque Principal */}
                                  <div className="pb-2 border-b border-slate-200">
                                    <span className="font-mono text-[9px] block uppercase tracking-wider text-slate-500 font-bold">
                                      Nome do Item Comercial (Cadastrado)
                                    </span>
                                    <h4 className="text-sm sm:text-base font-black text-slate-900 leading-snug">
                                      {product.name}
                                    </h4>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div style={{ borderColor: '#000000', color: '#000000' }}>
                                      <span className="font-mono text-[9px] block uppercase tracking-wider text-slate-500 font-bold" style={{ color: '#000000' }}>
                                        Fabricante / Indústria / Marca
                                      </span>
                                      <span className="font-bold text-slate-900" style={{ color: '#000000' }}>{product.brand || 'Não especificada'}</span>
                                    </div>
                                    <div style={{ borderColor: '#000000' }}>
                                      <span 
                                        className="font-mono text-[9px] block uppercase tracking-wider text-slate-500 font-bold"
                                        style={{ borderColor: '#000000' }}
                                      >
                                        Peso / Volume / Conteúdo
                                      </span>
                                      <span className="font-bold text-slate-900">{product.weightVolume || 'Não especificado'}</span>
                                    </div>
                                  </div>
                                  {product.description && (
                                    <div className="pt-2 border-t border-slate-200">
                                      <span className="font-mono text-[9px] block uppercase tracking-wider text-slate-500 font-bold">Descrição Comercial</span>
                                      <p className="mt-1.5 leading-relaxed text-slate-800 font-medium">{product.description}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Notas Fiscais Digitalizadas do Produto */}
                            {(() => {
                              const productNfTxs = transactions.filter(
                                (t) => t.productId === product.id && t.nfPhoto
                              );
                              if (productNfTxs.length === 0) return null;

                              return (
                                <div className={`p-4 rounded-xl border ${isCosmic ? 'bg-white border-slate-200' : 'bg-[#141720]/40 border-slate-800'} space-y-3`}>
                                  <div className="flex items-center gap-2 border-b pb-2 border-slate-800/40">
                                    <Camera className="w-4 h-4 text-emerald-400" />
                                    <h4 className={`text-xs font-bold uppercase tracking-wider font-mono ${isCosmic ? 'text-slate-800' : 'text-slate-200'}`}>
                                      Comprovantes de Nota Fiscal (NF) • Entrada ({productNfTxs.length})
                                    </h4>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {productNfTxs.map((tx) => (
                                      <div 
                                        key={tx.id} 
                                        className={`flex items-center gap-3 p-2.5 rounded-lg border ${isCosmic ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-950/60 border-slate-850/80'}`}
                                      >
                                        <div className="shrink-0">
                                          <img 
                                            src={tx.nfPhoto} 
                                            alt={`Nota Fiscal Lote ${tx.batchId}`} 
                                            onClick={() => setSelectedNfPhotoForZoom(tx.nfPhoto || null)}
                                            className="w-12 h-12 object-cover rounded-md border border-slate-700 cursor-zoom-in hover:opacity-80 transition-all"
                                          />
                                        </div>
                                        <div className="text-[10px] space-y-0.5 min-w-0 flex-1">
                                          <p className={`font-bold truncate ${isCosmic ? 'text-slate-800' : 'text-slate-200'}`}>Lote: {tx.batchId}</p>
                                          <p className="text-slate-500 font-mono">Entrada: {new Date(tx.timestamp).toLocaleString('pt-BR')}</p>
                                          <div className={`flex items-center gap-1.5 flex-wrap font-mono text-[9px] ${isCosmic ? 'text-slate-600' : 'text-slate-400'}`}>
                                            <span>Qtd: {tx.quantity}</span>
                                            <span>•</span>
                                            <span>Op: {tx.operatorName}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setSelectedNfPhotoForZoom(tx.nfPhoto || null)}
                                            className="text-[9px] text-emerald-400 hover:text-emerald-300 font-extrabold flex items-center gap-0.5 cursor-pointer mt-0.5 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20"
                                          >
                                            <Camera className="w-2.5 h-2.5" /> Ampliar Nota Fiscal
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}

                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <h4 className={`text-xs font-bold uppercase tracking-widest font-mono ${themeStyles.textMuted}`}>
                                  Lotes Associados ({product.batches.length})
                                </h4>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDeleteProduct(product)}
                                    className="text-[10px] font-black px-2 py-1.5 rounded transition-all flex items-center gap-1 cursor-pointer border bg-white border-slate-300 text-black hover:bg-slate-50 shadow-xs"
                                    title="Excluir produto definitivamente"
                                  >
                                    <Trash2 className="w-3 h-3 text-red-600 font-bold stroke-[3]" /> Excluir Item
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openCategoryEditModal(product)}
                                    className="text-[10px] font-black px-2 py-1.5 rounded transition-all flex items-center gap-1 cursor-pointer border bg-sky-50 border-sky-300 text-sky-900 hover:bg-sky-100 shadow-xs"
                                    title="Alterar categoria e subcategoria do produto"
                                  >
                                    <Edit2 className="w-3 h-3 text-sky-700" /> Categoria
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedProductForDetails(product);
                                      setShowProductDetailsModal(true);
                                    }}
                                    className="text-[10px] font-black px-2 py-1.5 rounded transition-all flex items-center gap-1 cursor-pointer border bg-white border-slate-300 text-black hover:bg-slate-50 shadow-xs"
                                    title="Visualizar ficha de detalhes e localizações físicas"
                                  >
                                    <Search className="w-3.5 h-3.5 text-black font-black" /> Localizar / Ficha
                                  </button>
                                  <button
                                    onClick={() => handleOpenMovement(product, 'entrada')}
                                    className="text-[10px] font-black px-2 py-1.5 rounded transition-all cursor-pointer border bg-white border-emerald-400 text-black hover:bg-emerald-50 shadow-xs"
                                  >
                                    + Entrada de Lote
                                  </button>
                                  <button
                                    onClick={() => handleOpenMovement(product, 'saida')}
                                    className="text-[10px] font-black px-2 py-1.5 rounded transition-all cursor-pointer border bg-white border-red-400 text-black hover:bg-red-50 shadow-xs"
                                  >
                                    - Dar Baixa (Saída)
                                  </button>
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className={`border-b text-slate-500 ${isCosmic ? 'border-slate-200 text-slate-400' : 'border-slate-800/80'}`}>
                                      <th className="py-2 px-1 font-mono font-black uppercase text-[10px]" style={{ borderColor: '#000000', backgroundColor: '#ffffff', color: '#000000' }}>
                                        <span className="bg-white text-black font-black px-2 py-0.5 rounded border shadow-xs inline-block" style={{ borderColor: '#000000', backgroundColor: '#ffffff', color: '#000000' }}>Lote</span>
                                      </th>
                                      <th className="py-2 px-1 font-mono font-black uppercase text-[10px]" style={{ borderColor: '#a21a1a', backgroundColor: '#ffffff', color: '#000000' }}>
                                        <span className="bg-white text-black font-black px-2 py-0.5 rounded border shadow-xs inline-block" style={{ borderColor: '#a21a1a', backgroundColor: '#ffffff', color: '#000000' }}>Validade</span>
                                      </th>
                                      <th className="py-2 px-1 font-mono font-black uppercase text-[10px]" style={{ borderColor: '#000000', backgroundColor: '#ffffff', color: '#000000' }}>
                                        <span className="bg-white text-black font-black px-2 py-0.5 rounded border shadow-xs inline-block" style={{ borderColor: '#000000', backgroundColor: '#ffffff', color: '#000000' }}>Estágio</span>
                                      </th>
                                      <th className="py-2 px-1 font-mono font-black uppercase text-[10px] text-right" style={{ backgroundColor: '#fff5f5', color: '#000000' }}>
                                        <span className="bg-white text-black font-black px-2 py-0.5 rounded border shadow-xs inline-block" style={{ backgroundColor: '#fff5f5', color: '#000000' }}>Saldo</span>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className={`divide-y ${isCosmic ? 'divide-slate-200/50' : 'divide-slate-800/40'}`}>
                                    {product.batches.map((batch) => {
                                      const days = getDaysRemaining(batch.date);
                                      const associatedTx = transactions.find(
                                        (t) => t.productId === product.id && t.batchId === batch.id && t.nfPhoto
                                      );

                                      return (
                                        <tr key={batch.id} className={isCosmic ? 'hover:bg-slate-100/40' : 'hover:bg-slate-900/25'}>
                                          <td className="py-2 px-1 font-mono" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
                                            <div className="inline-flex items-center gap-1.5 bg-white text-black font-black font-mono text-[11px] px-2 py-1 rounded-md border border-slate-300 shadow-xs flex-wrap">
                                              <span>{batch.id}</span>
                                              {associatedTx && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedNfPhotoForZoom(associatedTx.nfPhoto || null);
                                                  }}
                                                  className="inline-flex items-center gap-1 text-[9px] bg-white border border-slate-300 hover:bg-slate-100 text-black font-black px-1.5 py-0.5 rounded transition-all cursor-pointer select-none"
                                                  title="Ver Nota Fiscal anexada ao lote"
                                                >
                                                  <Camera className="w-2.5 h-2.5 stroke-[2.5]" /> NF
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                          <td className="py-2 px-1 font-mono" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
                                            <div className="inline-block bg-white text-black font-black font-mono text-[11px] px-2 py-1 rounded-md border border-slate-300 shadow-xs">
                                              {batch.date && batch.date.trim() ? batch.date.split('-').reverse().join('/') : 'A definir'}
                                            </div>
                                          </td>
                                          <td className="py-2 px-1 text-[11px] font-mono" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
                                            <div className="inline-flex items-center gap-1.5 bg-white text-black font-black font-mono text-[11px] px-2 py-1 rounded-md border border-slate-300 shadow-xs">
                                              {!batch.date || !batch.date.trim() ? (
                                                <>
                                                  <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                                                  <span className="text-slate-600 font-bold">SEM VALIDADE</span>
                                                </>
                                              ) : days < 0 ? (
                                                <>
                                                  <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
                                                  <span className="text-black font-black">VENCIDO ({Math.abs(days)}d)</span>
                                                </>
                                              ) : days <= 30 ? (
                                                <>
                                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                                  <span className="text-black font-black">VENCE EM {days} DIAS</span>
                                                </>
                                              ) : (
                                                <>
                                                  <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                                                  <span className="text-black font-black">SEGURO</span>
                                                </>
                                              )}
                                            </div>
                                          </td>
                                          <td className="py-2 px-1 text-right font-bold font-mono" style={{ borderColor: '#ffffff', color: '#000000' }}>
                                            <div className="inline-flex items-center gap-1.5 border border-slate-300 p-0.5 rounded-lg select-none bg-white shadow-xs">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleQuickBatchQuantityChange(product, batch.id, -1);
                                                }}
                                                className="w-5 h-5 flex items-center justify-center rounded active:scale-90 transition-all cursor-pointer text-[10px] font-black bg-white border border-slate-300 text-black hover:bg-slate-100"
                                                title="Subtrair 1 unidade deste lote"
                                              >
                                                -
                                              </button>
                                              <span className="min-w-[22px] text-center text-[11px] font-mono font-black text-black">
                                                {batch.quantity}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleQuickBatchQuantityChange(product, batch.id, 1);
                                                }}
                                                className="w-5 h-5 flex items-center justify-center rounded active:scale-90 transition-all cursor-pointer text-[10px] font-black bg-white border border-slate-300 text-black hover:bg-slate-100"
                                                title="Adicionar 1 unidade a este lote"
                                              >
                                                +
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    {product.batches.length === 0 && (
                                      <tr>
                                        <td colSpan={4} className="py-3 px-1 text-center">
                                          <div className="bg-white border border-slate-300 rounded-lg p-3 text-black font-black font-mono text-xs shadow-xs">
                                            Sem lotes em estoque ativo. Cadastre uma entrada.
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

        {/* DEDICATED FABRICANTES (MANUFACTURERS) DIRECTORY & CATALOG VIEW */}
        {activeTab === 'fabricantes' && (
          <div className="space-y-6">
            {/* Top Banner & Quick Controls */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                      <Factory className="w-5 h-5 stroke-[2.5]" />
                    </span>
                    <div>
                      <h2 className="text-lg sm:text-xl font-black text-slate-100 tracking-tight font-display flex items-center gap-2">
                        GESTÃO E CADASTRO POR FABRICANTES
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase">
                          Indústrias & Fornecedores
                        </span>
                      </h2>
                      <p className="text-xs text-slate-400 font-sans">
                        Organize todo o catálogo de produtos e estoques físicos agrupados pelas marcas e indústrias parceiras (Ambev, Coca-Cola FEMSA, Heineken, Nestlé, Unilever, etc.).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <button
                    onClick={() => {
                      setNewProdBrand('');
                      setShowAddProductModal(true);
                    }}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_4px_12px_rgba(16,185,129,0.25)] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>Cadastrar Novo Produto</span>
                  </button>

                  <button
                    onClick={() => setShowBulkImportModal(true)}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_4px_12px_rgba(16,185,129,0.25)] border border-emerald-400/40 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 stroke-[2.2]" />
                    <span>Importar em Massa (Excel/CSV)</span>
                  </button>

                  <button
                    onClick={() => {
                      setInventoryGrouping('fabricante');
                      setActiveTab('estoque');
                    }}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Package className="w-4 h-4 text-emerald-400" />
                    <span>Ver Estoque por Fabricante</span>
                  </button>
                </div>
              </div>

              {/* Analytical KPI Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800/80">
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block mb-1">
                    Fabricantes Ativos
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-black text-slate-100 font-mono">
                      {catalogBrandsList.length}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">marcas com SKU</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block mb-1">
                    Total de SKUs
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-black text-slate-100 font-mono">
                      {products.length}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">produtos</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block mb-1">
                    Itens em Estoque Total
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
                      {stats.totalStockQty}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">unidades</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block mb-1">
                    Alertas de Validade
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                      {Object.values(brandStats).filter(s => s.anyExpired || s.anyCritical).length}
                    </span>
                    <span className="text-[10px] text-amber-400/80 font-mono">marcas c/ atenção</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Brand Filter & Preset Pills */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-black text-slate-200 text-xs sm:text-sm uppercase tracking-wider font-display">
                    Catálogo de Fabricantes & Contratos de Indústria
                  </h3>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Exibindo {Object.keys(brandStats).length} indústrias cadastradas
                </div>
              </div>

              {/* Quick presets for common brands */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] uppercase font-mono font-bold text-slate-500 mr-1">
                  Filtro Rápido:
                </span>
                <button
                  onClick={() => setSelectedBrand('')}
                  className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    selectedBrand === ''
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Todos os Fabricantes
                </button>
                {catalogBrandsList.map(brandName => {
                  const bStat = brandStats[brandName];
                  return (
                    <button
                      key={brandName}
                      onClick={() => setSelectedBrand(selectedBrand === brandName ? '' : brandName)}
                      className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                        selectedBrand === brandName
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span>{brandName}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                        selectedBrand === brandName ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {bStat?.count || 0}
                      </span>
                      {bStat?.anyExpired && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Possui lote vencido" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grid of Manufacturer Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(brandStats)
                .filter(([brandName]) => {
                  if (!selectedBrand) return true;
                  if (selectedBrand === 'sem_fabricante') return brandName === 'Sem Fabricante';
                  return brandName.toLowerCase() === selectedBrand.toLowerCase();
                })
                .map(([brandName, bStat]) => {
                  const brandProducts = products.filter(p => {
                    if (brandName === 'Sem Fabricante') return !p.brand || !p.brand.trim();
                    return p.brand?.trim().toLowerCase() === brandName.toLowerCase();
                  });

                  return (
                    <div
                      key={brandName}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4 transition-all"
                    >
                      <div>
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
                              <Factory className="w-5 h-5 stroke-[2.2]" />
                            </div>
                            <div>
                              <h4 className="font-black text-sm sm:text-base text-slate-100 uppercase tracking-tight font-display leading-tight">
                                {brandName}
                              </h4>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                                  {bStat.count} {bStat.count === 1 ? 'produto cadastrado' : 'produtos cadastrados'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Expiry Pill */}
                          {bStat.anyExpired ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30">
                              Vencido
                            </span>
                          ) : bStat.anyCritical ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              Crítico
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              Regular
                            </span>
                          )}
                        </div>

                        {/* Stock metric & categories */}
                        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                            <span className="text-[9px] uppercase font-mono text-slate-500 font-bold block">
                              Volume Total
                            </span>
                            <span className="font-mono font-extrabold text-sm text-slate-200">
                              {bStat.totalQty} unidades
                            </span>
                          </div>

                          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                            <span className="text-[9px] uppercase font-mono text-slate-500 font-bold block">
                              Categorias
                            </span>
                            <span className="text-[10px] text-slate-300 font-semibold truncate block" title={bStat.categories.join(', ')}>
                              {bStat.categories.length > 0 ? bStat.categories.join(', ') : 'Geral'}
                            </span>
                          </div>
                        </div>

                        {/* Products list preview */}
                        <div className="mt-3.5 space-y-1.5">
                          <span className="text-[9px] uppercase font-mono text-slate-500 font-bold tracking-wider block">
                            Itens Deste Fabricante:
                          </span>
                          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                            {brandProducts.slice(0, 5).map(prod => {
                              const prodQty = prod.batches.reduce((s, b) => s + b.quantity, 0) + (productSectorsSums[prod.id]?.totalTransferred || 0);
                              return (
                                <div
                                  key={prod.id}
                                  onClick={() => {
                                    setSelectedProductForDetails(prod);
                                    setShowProductDetailsModal(true);
                                  }}
                                  className="bg-slate-950/70 hover:bg-slate-850 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs cursor-pointer transition-colors"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                    <span className="text-slate-200 font-medium truncate text-[11px]">
                                      {prod.name}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400 font-bold shrink-0 ml-2">
                                    {prodQty} {prod.packaging.split(' ')[0]}
                                  </span>
                                </div>
                              );
                            })}
                            {brandProducts.length > 5 && (
                              <p className="text-[10px] text-slate-500 font-mono italic text-center pt-1">
                                + {brandProducts.length - 5} outros itens deste fabricante
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="pt-3 border-t border-slate-800/80 flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setSelectedBrand(brandName === 'Sem Fabricante' ? 'sem_fabricante' : brandName);
                            setInventoryGrouping('fabricante');
                            setActiveTab('estoque');
                          }}
                          className="flex-1 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-xl text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Package className="w-3.5 h-3.5" />
                          <span>Ver no Estoque</span>
                        </button>

                        <button
                          onClick={() => handleExportPDFByBrand(brandName)}
                          className="px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          title={`Exportar relatório em PDF de ${brandName}`}
                        >
                          <Download className="w-3.5 h-3.5 text-amber-400" />
                          <span>PDF</span>
                        </button>

                        <button
                          onClick={() => {
                            setNewProdBrand(brandName === 'Sem Fabricante' ? '' : brandName);
                            setShowAddProductModal(true);
                          }}
                          className="px-2.5 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-[11px] font-bold flex items-center justify-center transition-all cursor-pointer"
                          title={`Cadastrar novo produto para o fabricante ${brandName}`}
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {(activeTab === 'movimentacoes' || activeTab === 'historico') && (() => {
          const sortedTransactions = [...transactions].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          const totalEntradas = sortedTransactions.filter(t => t.type === 'entrada').length;
          const totalSaidas = sortedTransactions.filter(t => t.type === 'saida').length;

          const q = historySearchQuery.trim().toLowerCase();
          const filteredTransactions = sortedTransactions.filter(tx => {
            if (historyTypeFilter !== 'todos' && tx.type !== historyTypeFilter) return false;
            if (!q) return true;
            return (
              (tx.productName || '').toLowerCase().includes(q) ||
              (tx.barcode || '').toLowerCase().includes(q) ||
              (tx.operatorName || '').toLowerCase().includes(q) ||
              (tx.batchId || '').toLowerCase().includes(q)
            );
          });

          return (
            <div className="space-y-4 animate-fade-in text-left">
              {/* Cabeçalho + Resumo */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-black flex items-center gap-2">
                      <History className="w-5 h-5 text-emerald-600" />
                      Histórico de Movimentações
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Registro completo de entradas e saídas (baixas) no estoque.
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 font-bold uppercase self-start sm:self-center">
                    Auditoria Ativa • {sortedTransactions.length} registros
                  </span>
                </div>

                {/* Cards Resumo */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setHistoryTypeFilter('todos')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      historyTypeFilter === 'todos'
                        ? 'bg-slate-900 text-white border-black shadow-xs'
                        : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className={`text-[10px] uppercase font-bold block ${historyTypeFilter === 'todos' ? 'text-slate-300' : 'text-slate-500'}`}>
                      Todas
                    </span>
                    <span className="text-xl font-black font-mono">{sortedTransactions.length}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHistoryTypeFilter('entrada')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      historyTypeFilter === 'entrada'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-emerald-50/70 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    <span className={`text-[10px] uppercase font-bold block ${historyTypeFilter === 'entrada' ? 'text-emerald-100' : 'text-emerald-700'}`}>
                      Entradas (+)
                    </span>
                    <span className="text-xl font-black font-mono">{totalEntradas}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHistoryTypeFilter('saida')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      historyTypeFilter === 'saida'
                        ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                        : 'bg-rose-50/70 text-rose-900 border-rose-200 hover:bg-rose-100'
                    }`}
                  >
                    <span className={`text-[10px] uppercase font-bold block ${historyTypeFilter === 'saida' ? 'text-rose-100' : 'text-rose-700'}`}>
                      Saídas / Baixas (-)
                    </span>
                    <span className="text-xl font-black font-mono">{totalSaidas}</span>
                  </button>
                </div>

                {/* Barra de Busca */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Buscar por produto, código de barras, lote ou operador..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-9 py-2.5 text-xs text-black font-medium focus:border-emerald-600 focus:bg-white focus:outline-none"
                  />
                  {historySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setHistorySearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      title="Limpar busca"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Tabela / Lista de Movimentações */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 font-mono font-bold text-[10px] uppercase">Data / Hora</th>
                        <th className="py-3 px-4 font-mono font-bold text-[10px] uppercase">Operação</th>
                        <th className="py-3 px-4 font-mono font-bold text-[10px] uppercase">Produto</th>
                        <th className="py-3 px-4 font-mono font-bold text-[10px] uppercase">Lote / Validade</th>
                        <th className="py-3 px-4 font-mono font-bold text-[10px] uppercase">Operador</th>
                        <th className="py-3 px-4 font-mono font-bold text-[10px] uppercase text-right">Qtd</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTransactions.map((tx) => {
                        const prod = products.find(p => p.id === tx.productId);
                        const sectorLabel = tx.type === 'transferencia'
                          ? (tx.transferDestination === '3019' ? 'Setor 3019' : (tx.transferDestination || 'Loja').toUpperCase())
                          : tx.type === 'saida' && tx.sourceSector
                            ? (tx.sourceSector === '3019' ? 'Setor 3019' : tx.sourceSector === 'deposito' ? 'Depósito' : tx.sourceSector.toUpperCase())
                            : null;

                        return (
                          <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                              {new Date(tx.timestamp).toLocaleString('pt-BR')}
                            </td>
                            <td className="py-3.5 px-4">
                              {tx.type === 'entrada' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold px-2 py-0.5 rounded-lg font-mono uppercase tracking-wider">
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                  Entrada
                                </span>
                              ) : tx.type === 'transferencia' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 border border-amber-200 text-amber-800 font-extrabold px-2 py-0.5 rounded-lg font-mono uppercase tracking-wider">
                                  <RefreshCw className="w-3 h-3" />
                                  Transf. {sectorLabel ? `(${sectorLabel})` : ''}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 border border-rose-200 text-rose-700 font-bold px-2 py-0.5 rounded-lg font-mono uppercase tracking-wider">
                                  <ArrowDownLeft className="w-3.5 h-3.5" />
                                  Saída {sectorLabel ? `(${sectorLabel})` : ''}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <p
                                onClick={() => {
                                  if (prod) {
                                    setSelectedProductForDetails(prod);
                                    setShowProductDetailsModal(true);
                                  }
                                }}
                                className={`font-bold text-black ${prod ? 'hover:text-emerald-700 cursor-pointer' : ''}`}
                              >
                                {tx.productName}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className="text-[10px] font-mono text-slate-500">EAN: {tx.barcode || 'Sem código'}</span>
                                {tx.nfPhoto && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedNfPhotoForZoom(tx.nfPhoto || null)}
                                    className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-extrabold px-1.5 py-0.2 rounded font-mono uppercase transition-all cursor-pointer"
                                    title="Visualizar Nota Fiscal de Entrada"
                                  >
                                    <Camera className="w-2.5 h-2.5 stroke-[2.5]" /> NF ANEXA
                                  </button>
                                )}
                                {prod && (
                                  <>
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase font-mono bg-slate-100 text-slate-700 border border-slate-200">
                                      {prod.category}
                                    </span>
                                    {prod.subcategory && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase font-mono bg-slate-100 text-slate-600">
                                        {prod.subcategory}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <p className="text-slate-800 font-mono text-xs font-bold">{tx.batchId || 'sem-lote'}</p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                Val: {tx.batchDate ? tx.batchDate.split('-').reverse().join('/') : 'Sem validade'}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 text-slate-700 font-semibold">{tx.operatorName || 'Operador'}</td>
                            <td className={`py-3.5 px-4 text-right font-mono font-black text-sm ${
                              tx.type === 'entrada' ? 'text-emerald-700' : tx.type === 'saida' ? 'text-rose-700' : 'text-amber-700'
                            }`}>
                              {tx.type === 'entrada' ? '+' : tx.type === 'saida' ? '-' : ''}{tx.quantity}{' '}
                              <span className="text-[10px] text-slate-500 font-normal">
                                {(tx.packaging || 'un').split(' ')[0]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredTransactions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 font-mono italic">
                            Nenhuma movimentação encontrada para o filtro selecionado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card list view */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {filteredTransactions.map((tx) => {
                    const prod = products.find(p => p.id === tx.productId);
                    const sectorLabel = tx.type === 'transferencia'
                      ? (tx.transferDestination === '3019' ? 'Setor 3019' : (tx.transferDestination || 'Loja').toUpperCase())
                      : tx.type === 'saida' && tx.sourceSector
                        ? (tx.sourceSector === '3019' ? 'Setor 3019' : tx.sourceSector === 'deposito' ? 'Depósito' : tx.sourceSector.toUpperCase())
                        : null;

                    return (
                      <div key={tx.id} className="p-4 space-y-2.5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-slate-500">
                            {new Date(tx.timestamp).toLocaleString('pt-BR')}
                          </span>
                          {tx.type === 'entrada' ? (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                              <ArrowUpRight className="w-3 h-3" />
                              Entrada
                            </span>
                          ) : tx.type === 'transferencia' ? (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-amber-50 border border-amber-200 text-amber-800 font-extrabold px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                              <RefreshCw className="w-2.5 h-2.5" />
                              Transf. {sectorLabel ? `(${sectorLabel})` : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-rose-50 border border-rose-200 text-rose-700 font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                              <ArrowDownLeft className="w-3 h-3" />
                              Saída {sectorLabel ? `(${sectorLabel})` : ''}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <p
                            onClick={() => {
                              if (prod) {
                                setSelectedProductForDetails(prod);
                                setShowProductDetailsModal(true);
                              }
                            }}
                            className={`font-extrabold text-black text-xs ${prod ? 'cursor-pointer hover:text-emerald-700' : ''}`}
                          >
                            {tx.productName}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-mono text-slate-500">EAN: {tx.barcode || 'Sem código'}</span>
                            {tx.nfPhoto && (
                              <button
                                type="button"
                                onClick={() => setSelectedNfPhotoForZoom(tx.nfPhoto || null)}
                                className="inline-flex items-center gap-1 text-[8.5px] bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.2 rounded font-mono uppercase transition-all cursor-pointer"
                              >
                                <Camera className="w-2 h-2" /> NF ANEXA
                              </button>
                            )}
                            {prod && (
                              <span className="text-[8.5px] font-bold px-1.5 py-0.2 rounded uppercase font-mono bg-slate-100 text-slate-700 border border-slate-200">
                                {prod.category}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[11px] pt-2 border-t border-slate-100">
                          <div className="space-y-0.5">
                            <p className="text-slate-500 font-mono text-[10px]">
                              Lote: <span className="font-bold text-slate-800">{tx.batchId || 'sem-lote'}</span>
                            </p>
                            <p className="text-[9px] text-slate-500 font-mono">
                              Val: {tx.batchDate ? tx.batchDate.split('-').reverse().join('/') : 'Sem validade'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-500">
                              Operador: <span className="text-slate-800 font-semibold">{tx.operatorName || 'Operador'}</span>
                            </p>
                            <p className={`font-mono font-black text-xs ${
                              tx.type === 'entrada' ? 'text-emerald-700' : tx.type === 'saida' ? 'text-rose-700' : 'text-amber-700'
                            }`}>
                              {tx.type === 'entrada' ? '+' : tx.type === 'saida' ? '-' : ''}{tx.quantity}{' '}
                              <span className="text-[9px] text-slate-500 font-normal">
                                {(tx.packaging || 'un').split(' ')[0]}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredTransactions.length === 0 && (
                    <div className="py-12 text-center text-slate-500 font-mono italic text-xs">
                      Nenhuma movimentação encontrada para o filtro selecionado.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {activeTab === 'gtin' && (
          <GtinAutomationPanel 
            products={products}
            categories={categories}
            transactions={transactions}
            currentUser={currentUser}
            onAddProduct={handleAddProductFromGtin}
            onUpdateProduct={handleUpdateProductFromGtin}
            onAddGtinHistory={handleAddGtinHistory}
            gtinHistory={gtinHistory}
            theme={currentTheme === 'personalizado' ? 'dark-pro' : currentTheme}
          />
        )}

        {activeTab === 'nota_fiscal' && (
          <NfImportPanel
            products={products}
            categories={categories}
            currentUser={currentUser}
            onImportProductsAndTransactions={handleImportProductsAndTransactions}
            playApitoSonoro={playApitoSonoro}
            theme={currentTheme === 'personalizado' ? 'dark-pro' : currentTheme}
          />
        )}

        {activeTab === 'vasilhames' && (
          <VasilhamesPanel
            vasilhames={vasilhames}
            transactions={vasilhameTransactions}
            onUpdateVasilhames={async (updated) => {
              setVasilhames(updated);
              localStorage.setItem('bv_vasilhames', JSON.stringify(updated));
              if (currentUser && usingFirebase) {
                try {
                  const batch = writeBatch(db);
                  updated.forEach(v => {
                    batch.set(doc(db, 'vasilhames', v.id), v);
                  });
                  await batch.commit();
                } catch (err) {
                  handleFirestoreError(err, OperationType.WRITE, 'vasilhames');
                }
              }
            }}
            onAddTransaction={async (txData) => {
              const newTx: VasilhameTransaction = {
                ...txData,
                id: `vtx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                data: new Date().toISOString()
              };
              const updatedList = [newTx, ...vasilhameTransactions];
              setVasilhameTransactions(updatedList);
              localStorage.setItem('bv_vasilhame_transactions', JSON.stringify(updatedList));
              if (currentUser && usingFirebase) {
                try {
                  await setDoc(doc(db, 'vasilhame_transactions', newTx.id), newTx);
                } catch (err) {
                  handleFirestoreError(err, OperationType.WRITE, `vasilhame_transactions/${newTx.id}`);
                }
              }
            }}
            operatorName={currentUser?.displayName || 'Operador Central'}
            isCosmic={isCosmic}
          />
        )}

      </main>

      {/* FOOTER */}
      {designConfig.showFooter && (
        <footer className={`${isCustom ? 'border-t transition-all' : 'bg-slate-900 border-t border-slate-800'} py-6 text-center text-slate-500 text-xs`} style={isCustom ? { backgroundColor: 'var(--custom-footer)', borderColor: 'var(--custom-border)', color: 'var(--custom-text-muted)' } : undefined}>
          <div className="max-w-7xl mx-auto px-4 space-y-1">
            <p>© 2026 BV Atacarejo & Logística S/A. Todos os direitos reservados.</p>
            <p className="text-[10px] font-mono tracking-wide" style={{ color: '#000000' }}>
              Powered by Cloud Firestore & Google Authenticated Accounts
            </p>
          </div>
        </footer>
      )}

      {/* FIXED BOTTOM NAVIGATION BAR FOR MOBILE OPERATIONS */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t px-2 pb-[calc(6px+env(safe-area-inset-bottom,0px))] pt-1.5 transition-all duration-500 backdrop-blur-lg ${
        isCustom 
          ? 'bg-[var(--custom-bg-card)]/95 border-[var(--custom-border)]/50 text-[var(--custom-text-main)] shadow-[0_-8px_30px_rgba(0,0,0,0.3)]'
          : isDarkPro 
            ? 'bg-[#101715]/95 border-[#1D2B27] shadow-[0_-8px_30px_rgba(16,185,129,0.12)] text-[#F1F5F9]' 
            : isCosmic 
              ? 'bg-[#FFFFFF]/95 border-[#D1E7DD] shadow-[0_-4px_20px_rgba(4,47,26,0.06)] text-[#0B1F15]' 
              : 'bg-[#060F0C]/95 border-[#16332A] shadow-[0_-8px_30px_rgba(52,211,153,0.15)] text-[#FFFFFF]'
      }`}>
        <div className="flex items-center justify-around w-full max-w-lg mx-auto gap-0.5">
          {/* Tab Início */}
          <button
            onClick={() => setActiveTab('inicio')}
            className={`flex flex-col items-center justify-center p-1 transition-all active:scale-95 cursor-pointer flex-1 min-w-0 ${
              activeTab === 'inicio' || activeTab === 'dashboard'
                ? 'text-emerald-700 font-bold' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[9px] font-semibold truncate w-full text-center leading-none">Início</span>
          </button>

          {/* Tab Produtos */}
          <button
            onClick={() => setActiveTab('produtos')}
            className={`flex flex-col items-center justify-center p-1 transition-all active:scale-95 cursor-pointer flex-1 min-w-0 ${
              activeTab === 'produtos'
                ? 'text-emerald-700 font-bold' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-5 h-5 mb-0.5" />
            <span className="text-[9px] font-semibold truncate w-full text-center leading-none">Produtos</span>
          </button>

          {/* Quick Scanner center action */}
          <button
            onClick={() => {
              setShowScanner(!showScanner);
              setActiveTab('estoque');
            }}
            className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center transition-all duration-300 shadow-md cursor-pointer shrink-0 active:scale-90"
            title="Ativar Leitor de Código de Barras"
          >
            <Scan className="w-5 h-5" />
          </button>

          {/* Tab Checklist */}
          <button
            onClick={() => setActiveTab('checklist')}
            className={`flex flex-col items-center justify-center p-1 transition-all active:scale-95 cursor-pointer flex-1 min-w-0 ${
              activeTab === 'checklist'
                ? 'text-emerald-700 font-bold' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ClipboardCheck className="w-5 h-5 mb-0.5" />
            <span className="text-[9px] font-semibold truncate w-full text-center leading-none">Checklist</span>
          </button>

          {/* Tab Configurações */}
          <button
            onClick={() => setActiveTab('configuracoes')}
            className={`flex flex-col items-center justify-center p-1 transition-all active:scale-95 cursor-pointer flex-1 min-w-0 ${
              activeTab === 'configuracoes' || activeTab === 'fabricantes'
                ? 'text-emerald-700 font-bold' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings2 className="w-5 h-5 mb-0.5" />
            <span className="text-[9px] font-semibold truncate w-full text-center leading-none">Config</span>
          </button>
        </div>
      </div>
      
      {/* MODAL: CONFIGURADOR DYNAMIC DESIGN SYSTEM */}
      {false && showDesignCustomizer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div 
            className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-[#0F111E] overflow-hidden shadow-2xl flex flex-col max-h-[90vh] text-slate-200"
            id="modal-design-customizer"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Palette className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-lg font-display uppercase tracking-wider">Configurações de Design & Visual</h3>
                  <p className="text-xs text-slate-400">Personalize cores, tipografia, remova blocos e crie seu layout corporativo exclusivo.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDesignCustomizer(false)}
                className="p-2 hover:bg-slate-800 rounded-xl transition text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Tabs Selector */}
            <div className="flex border-b border-slate-800 bg-slate-950/20 shrink-0">
              <button
                onClick={() => setCustomizerTab('layout')}
                className={`flex-1 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                  customizerTab === 'layout' 
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900/40' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                1. Visibilidade do Layout
              </button>
              <button
                onClick={() => setCustomizerTab('colors')}
                className={`flex-1 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                  customizerTab === 'colors' 
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900/40' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                2. Cores & Paletas 🎨
              </button>
              <button
                onClick={() => setCustomizerTab('font')}
                className={`flex-1 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                  customizerTab === 'font' 
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900/40' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                3. Fontes, Bordas & Brilhos ⚙️
              </button>
            </div>

            {/* Scrollable Form Area */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-900/20">
              
              {customizerTab === 'layout' && (
                <div className="space-y-4">
                  <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-2xl">
                    <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4" />
                      Remover / Desativar Seções do Site
                    </h4>
                    <p className="text-[11px] text-slate-400">Ative ou remova blocos operacionais inteiros para criar um painel super limpo e focado no seu negócio.</p>
                  </div>

                  <div className="space-y-3.5 mt-2 bg-slate-950/40 p-4 rounded-2xl border border-slate-800">
                    <label className="flex items-center justify-between p-3.5 rounded-xl hover:bg-slate-800/40 cursor-pointer transition">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-slate-100 flex items-center gap-2">Exibir Cabeçalho (Header)</span>
                        <p className="text-[11px] text-slate-400">Controla a exibição do menu de topo, barra de sincronização e seletor de perfil.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={designConfig.showHeader}
                        onChange={(e) => setDesignConfig({ ...designConfig, showHeader: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-700 bg-slate-850 text-emerald-500 focus:ring-emerald-500/25 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3.5 rounded-xl hover:bg-slate-800/40 cursor-pointer transition">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-slate-100">Exibir Rodapé (Footer)</span>
                        <p className="text-[11px] text-slate-400">Exibe ou oculta os direitos autorais e as credenciais do banco no fim da página.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={designConfig.showFooter}
                        onChange={(e) => setDesignConfig({ ...designConfig, showFooter: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-700 bg-slate-850 text-emerald-500 focus:ring-emerald-500/25 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3.5 rounded-xl hover:bg-slate-800/40 cursor-pointer transition">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-slate-100">Exibir Logotipo "BV"</span>
                        <p className="text-[11px] text-slate-400">Controla a visualização da marca retangular no canto esquerdo superior.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={designConfig.showLogo}
                        onChange={(e) => setDesignConfig({ ...designConfig, showLogo: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-700 bg-slate-850 text-emerald-500 focus:ring-emerald-500/25 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3.5 rounded-xl hover:bg-slate-800/40 cursor-pointer transition">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-slate-100">Painel de Métricas (Bento Cards)</span>
                        <p className="text-[11px] text-slate-400 font-medium">Remove ou exibe a linha superior de cartões estatísticos (Cadastrados, Estoque, Vencidos, Críticos).</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={designConfig.showStatsCards}
                        onChange={(e) => setDesignConfig({ ...designConfig, showStatsCards: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-700 bg-slate-850 text-emerald-500 focus:ring-emerald-500/25 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3.5 rounded-xl hover:bg-slate-800/40 cursor-pointer transition">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-slate-100">Painel Slogans Informativos</span>
                        <p className="text-[11px] text-slate-400">Faixa com os quatro quadros explicativos de monitoramento, resumos e controle real-time.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={designConfig.showAutomationsFooterBox}
                        onChange={(e) => setDesignConfig({ ...designConfig, showAutomationsFooterBox: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-700 bg-slate-850 text-emerald-500 focus:ring-emerald-500/25 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3.5 rounded-xl hover:bg-slate-800/40 cursor-pointer transition">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-slate-100">Barra de Operações Rápidas e Tabs</span>
                        <p className="text-[11px] text-slate-400">Oculta a barra contendo Novo Produto, Categorias, Entrada, Saída, Busca e troca de abas.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={designConfig.showQuickActions}
                        onChange={(e) => setDesignConfig({ ...designConfig, showQuickActions: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-700 bg-slate-850 text-emerald-500 focus:ring-emerald-500/25 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3.5 rounded-xl hover:bg-slate-800/40 cursor-pointer transition">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-slate-100">Gráficos Analíticos de Estoque</span>
                        <p className="text-[11px] text-slate-400">Oculta o contêiner Recharts de barras por categoria e fluxo de alertas.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={designConfig.showCharts}
                        onChange={(e) => setDesignConfig({ ...designConfig, showCharts: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-700 bg-slate-850 text-emerald-500 focus:ring-emerald-500/25 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              )}

              {customizerTab === 'colors' && (
                <div className="space-y-5">
                  {/* Presets Grid */}
                  <div>
                    <h4 className="text-xs font-black text-indigo-400 uppercase tracking-wider mb-2.5">
                      Selecione uma Paleta Pronta de Alto Impacto
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {PRESET_PALETTES.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setDesignConfig({
                              ...designConfig,
                              ...preset.config
                            });
                          }}
                          className="bg-slate-950 hover:bg-slate-800 p-3 rounded-2xl border border-slate-800 hover:border-emerald-500/30 transition-all text-left text-xs space-y-2 cursor-pointer group"
                        >
                          <span className="font-extrabold text-slate-100 group-hover:text-emerald-400 truncate block">{preset.name}</span>
                          <div className="flex gap-1">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.config.colorBgPage }} title="Fundo" />
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.config.colorBgCard }} title="Cards" />
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.config.colorButtons }} title="Botões" />
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.config.colorAccent }} title="Destaque" />
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.config.colorTextTitle }} title="Letra" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Manual color picking block */}
                  <div className="border-t border-slate-800/80 pt-4 space-y-3.5">
                    <h4 className="text-xs font-black text-amber-500 uppercase tracking-wider mb-1">
                      Ajustes Manuais Finos (Autonomia de Letras & Cores)
                    </h4>
                    <p className="text-xs text-slate-400">Clique livremente nos seletores de cores abaixo para configurar cada parte do estoque.</p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-950/40 p-4 rounded-2xl border border-slate-800 max-h-[300px] overflow-y-auto pr-2">
                      
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Fundo Principal do Site</span>
                        <input 
                          type="color" 
                          value={designConfig.colorBgPage} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorBgPage: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Fundo dos Cards</span>
                        <input 
                          type="color" 
                          value={designConfig.colorBgCard} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorBgCard: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Fundo Card Secundário (Tabelas)</span>
                        <input 
                          type="color" 
                          value={designConfig.colorBgCardSubtle} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorBgCardSubtle: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Bordas e Divisores</span>
                        <input 
                          type="color" 
                          value={designConfig.colorBorder} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorBorder: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Texto dos Títulos</span>
                        <input 
                          type="color" 
                          value={designConfig.colorTextTitle} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorTextTitle: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Texto Principal do Corpo</span>
                        <input 
                          type="color" 
                          value={designConfig.colorTextMain} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorTextMain: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Texto Mutado / Legendas</span>
                        <input 
                          type="color" 
                          value={designConfig.colorTextMuted} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorTextMuted: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Fundo Cabeçalho (Header)</span>
                        <input 
                          type="color" 
                          value={designConfig.colorNavbar} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorNavbar: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Fundo Rodapé (Footer)</span>
                        <input 
                          type="color" 
                          value={designConfig.colorFooter} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorFooter: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Fundo dos Botões Principais</span>
                        <input 
                          type="color" 
                          value={designConfig.colorButtons} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorButtons: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Texto dos Botões</span>
                        <input 
                          type="color" 
                          value={designConfig.colorButtonsText} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorButtonsText: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Cor de Destaque / Acentos</span>
                        <input 
                          type="color" 
                          value={designConfig.colorAccent} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorAccent: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="text-xs font-bold text-slate-300">Logotipo Sign</span>
                        <input 
                          type="color" 
                          value={designConfig.colorLogo} 
                          onChange={(e) => setDesignConfig({ ...designConfig, colorLogo: e.target.value })}
                          className="w-10 h-7 rounded bg-transparent cursor-pointer border-none"
                        />
                      </div>

                    </div>
                  </div>
                </div>
              )}

              {customizerTab === 'font' && (
                <div className="space-y-4">
                  {/* Typography Format selection */}
                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 space-y-4">
                    <h4 className="text-xs font-black text-sky-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Type className="w-4 h-4 text-sky-400" />
                      Tipologia de Fontes & Tamanhos de Letras
                    </h4>
                    
                    <div>
                      <span className="text-xs font-extrabold text-slate-300 block mb-1">Família Font-Style Primária</span>
                      <select
                        value={designConfig.fontFamily}
                        onChange={(e) => setDesignConfig({ ...designConfig, fontFamily: e.target.value })}
                        className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 w-full focus:ring-emerald-550 focus:border-emerald-550 cursor-pointer"
                      >
                        <option value="sans">Sans-Serif (Inter Moderno, Altamente Legível)</option>
                        <option value="serif">Serif (Playfair Display, Elegante e Editorial)</option>
                        <option value="mono">Monospace (JetBrains Mono, Focado em Logística)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-xs font-extrabold text-slate-300 block mb-1">Tamanho de Letras do Título</span>
                        <select
                          value={designConfig.titleFontSize}
                          onChange={(e) => setDesignConfig({ ...designConfig, titleFontSize: e.target.value })}
                          className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 w-full cursor-pointer"
                        >
                          <option value="sm">Pequeno</option>
                          <option value="md">Médio</option>
                          <option value="lg">Grande (Padrão)</option>
                          <option value="xl">Extra Grande</option>
                          <option value="2xl">Arrasador / Display</option>
                        </select>
                      </div>

                      <div>
                        <span className="text-xs font-extrabold text-slate-300 block mb-1">Tamanho de Letras do Corpo</span>
                        <select
                          value={designConfig.bodyFontSize}
                          onChange={(e) => setDesignConfig({ ...designConfig, bodyFontSize: e.target.value })}
                          className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 w-full cursor-pointer"
                        >
                          <option value="xs">Mínimo / Compacto</option>
                          <option value="sm">Pequeno (Recomendado)</option>
                          <option value="md">Médio</option>
                          <option value="lg">Confortável / Acessível</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-extrabold text-slate-300 block mb-1">Peso da Fonte de Títulos</span>
                      <select
                        value={designConfig.titleFontWeight}
                        onChange={(e) => setDesignConfig({ ...designConfig, titleFontWeight: e.target.value })}
                        className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 w-full cursor-pointer"
                      >
                        <option value="normal">Fina / Normal</option>
                        <option value="semibold">Semi-Negrito</option>
                        <option value="bold">Negrito Corporativo Professional</option>
                        <option value="black">Extremo / Super Bold</option>
                      </select>
                    </div>
                  </div>

                  {/* Radii and shadows */}
                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 space-y-4">
                    <h4 className="text-xs font-black text-rose-450 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Arredondamento e Sombreamento / Glow
                    </h4>

                    <div>
                      <span className="text-xs font-extrabold text-slate-300 block mb-1">Curvatura das Bordas (Arredondado)</span>
                      <select
                        value={designConfig.borderRadius}
                        onChange={(e) => setDesignConfig({ ...designConfig, borderRadius: e.target.value })}
                        className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 w-full cursor-pointer"
                      >
                        <option value="none">Retangular Seco (Aparência Rústica)</option>
                        <option value="sm">Suave (Arredondamento leve)</option>
                        <option value="md">Médio</option>
                        <option value="lg">Acolhedor (Grande)</option>
                        <option value="xl">Super Moderno / Premium (Extra Grande)</option>
                        <option value="2xl">Cápsula / Formatos Arredondados</option>
                      </select>
                    </div>

                    <div>
                      <span className="text-xs font-extrabold text-slate-300 block mb-1">Estilo de Sombreamento (Sombra / Brilho Neon)</span>
                      <select
                        value={designConfig.shadowStyle}
                        onChange={(e) => setDesignConfig({ ...designConfig, shadowStyle: e.target.value })}
                        className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 w-full cursor-pointer"
                      >
                        <option value="none">Sem Sombras</option>
                        <option value="sm">Sombra Sutil Corporativa</option>
                        <option value="md">Sombra Média</option>
                        <option value="lg">Sombra Difusa Profunda</option>
                        <option value="xl">Efeito 3D Volumétrico</option>
                        <option value="glow">Brilho Neon Ativo (Tema Customizado)</option>
                      </select>
                    </div>

                    {designConfig.shadowStyle === 'glow' && (
                      <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 block mb-1">Cor do Brilho (Neon Glow)</span>
                          <input 
                            type="color" 
                            value={designConfig.glowColor || designConfig.colorAccent} 
                            onChange={(e) => setDesignConfig({ ...designConfig, glowColor: e.target.value })}
                            className="w-full h-8 rounded bg-transparent cursor-pointer border-none"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 block mb-1">Intensidade: {Math.round(designConfig.glowOpacity * 100)}%</span>
                          <input 
                            type="range" 
                            min="0.1" 
                            max="0.8" 
                            step="0.05"
                            value={designConfig.glowOpacity} 
                            onChange={(e) => setDesignConfig({ ...designConfig, glowOpacity: parseFloat(e.target.value) })}
                            className="w-full h-8 cursor-pointer mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Footer buttons actions controls */}
            <div className="p-5 border-t border-slate-800 bg-slate-950/60 flex flex-wrap justify-between items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const def = {
                    showHeader: true,
                    showFooter: true,
                    showLogo: true,
                    showStatsCards: true,
                    showAutomationsFooterBox: true,
                    showQuickActions: true,
                    showCharts: true,
                    colorBgPage: "#0A0B10",
                    colorBgCard: "#12141F",
                    colorBgCardSubtle: "#181B28",
                    colorBorder: "#1F2937",
                    colorTextTitle: "#FFFFFF",
                    colorTextMain: "#E2E8F0",
                    colorTextMuted: "#94A3B8",
                    colorNavbar: "#12141F",
                    colorFooter: "#0A0B10",
                    colorButtons: "#00BFFF",
                    colorButtonsText: "#000000",
                    colorAccent: "#00BFFF",
                    colorLogo: "#00BFFF",
                    fontFamily: "sans",
                    titleFontSize: "lg",
                    bodyFontSize: "sm",
                    titleFontWeight: "bold",
                    borderRadius: "xl",
                    shadowStyle: "glow",
                    glowColor: "#00BFFF",
                    glowOpacity: 0.25,
                    gradientStyle: true
                  };
                  setDesignConfig(def);
                  setCurrentTheme('dark-pro');
                  localStorage.setItem('bv_theme', 'dark-pro');
                  alert('Configurações originais de fábrica restauradas com sucesso!');
                }}
                className="bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-705 text-slate-400 hover:text-white font-mono text-[10px] font-bold uppercase tracking-wider px-3 w-full sm:w-auto py-2.5 rounded-xl transition active:scale-95 cursor-pointer"
              >
                Restaurar Fábrica 🔄
              </button>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    // Force Custom Theme selected
                    setCurrentTheme('personalizado');
                    localStorage.setItem('bv_theme', 'personalizado');
                    setShowDesignCustomizer(false);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition duration-150 flex items-center justify-center gap-1 w-full sm:w-auto active:scale-95 cursor-pointer shadow-[0_4px_15px_rgba(16,185,129,0.3)]"
                >
                  Salvar Mudanças ✓
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: MANUAL PWA INSTALL REGISTRATION GUIDE */}
      {showPWAHelpModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <Download className="w-5 h-5 stroke-[2.25]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-100 font-display text-sm sm:text-base tracking-wide uppercase">Como Instalar no Celular</h3>
                  <p className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase">Aplicativo Progressivo Nativo (PWA)</p>
                </div>
              </div>
              <button 
                onClick={() => setShowPWAHelpModal(false)}
                className="text-slate-500 hover:text-slate-200 p-1.5 bg-slate-800 hover:bg-slate-700/80 rounded-lg cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh] scrollbar-thin scrollbar-thumb-slate-800 text-xs">
              
              <div className="bg-slate-950 p-4 border border-slate-800 rounded-2xl space-y-2">
                <p className="text-slate-200 font-bold text-xs">Por que baixar o aplicativo?</p>
                <ul className="text-slate-400 space-y-1.5 list-disc pl-4 font-sans text-[11px]">
                  <li><strong className="text-slate-300">Acesso Offline:</strong> Consulte itens e histórico mesmo sem sinal de internet no galpão.</li>
                  <li><strong className="text-slate-300">Leitor de Códigos:</strong> O leitor de código de barras funciona com câmera nativa e alta performance.</li>
                  <li><strong className="text-slate-300">Instalação Leve:</strong> Ocupa menos de 1MB e não requer lojas como Google Play ou App Store.</li>
                </ul>
              </div>

              <div className="space-y-4">
                
                {/* 1. Android / Chrome */}
                <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-2xl space-y-2.5">
                  <div className="flex items-center gap-2 border-b border-slate-800/60 pb-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center justify-center">1</span>
                    <h4 className="font-black text-slate-200 uppercase tracking-wider text-[11px]">Dispositivos Android (Chrome)</h4>
                  </div>
                  <div className="space-y-2 text-slate-300 text-[11px] leading-relaxed pl-1">
                    <p className="flex items-start gap-2">
                      <span className="text-amber-500 font-bold font-mono">▸</span>
                      <span>Toque no botão de <strong>três pontos (⋮)</strong> no canto superior direito do navegador Chrome.</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-amber-500 font-bold font-mono">▸</span>
                      <span>Selecione a opção <strong className="text-emerald-400">"Instalar aplicativo"</strong> ou <strong className="text-emerald-400">"Adicionar à Tela Principal"</strong>.</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-amber-500 font-bold font-mono">▸</span>
                      <span>Confirme a instalação e o ícone do sistema aparecerá diretamente na sua tela de apps.</span>
                    </p>
                  </div>
                </div>

                {/* 2. iOS / Safari */}
                <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-2xl space-y-2.5">
                  <div className="flex items-center gap-2 border-b border-slate-800/60 pb-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center justify-center">2</span>
                    <h4 className="font-black text-slate-200 uppercase tracking-wider text-[11px]">No iPhone / iPad (Safari)</h4>
                  </div>
                  <div className="space-y-2 text-slate-300 text-[11px] leading-relaxed pl-1">
                    <p className="flex items-start gap-2">
                      <span className="text-amber-500 font-bold font-mono">▸</span>
                      <span>Abra o link do sistema no navegador oficial <strong className="text-sky-400">Safari</strong>.</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-amber-500 font-bold font-mono">▸</span>
                      <span>Toque no botão <strong className="text-sky-400">Compartilhar</strong> (ícone de quadrado com seta para cima na barra inferior).</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-amber-500 font-bold font-mono">▸</span>
                      <span>Role as opções para baixo e toque em <strong className="text-emerald-400">"Adicionar à Tela de Início"</strong>.</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-amber-500 font-bold font-mono">▸</span>
                      <span>Confirme adicionando e o app passará a abrir em tela cheia sem barras de navegação!</span>
                    </p>
                  </div>
                </div>

              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPWAHelpModal(false)}
                className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 font-bold uppercase tracking-wider text-[11px] px-5 py-2.5 rounded-xl cursor-pointer border border-slate-700"
              >
                Entendido
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: EXPORTAR RELATÓRIOS E CSV */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                  <FileText className="w-5 h-5 mx-auto" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-50 font-display text-xs sm:text-sm tracking-wide uppercase">Exportar Relatórios</h3>
                  <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Selecione o tipo de relatório desejado</p>
                </div>
              </div>
              <button 
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-100 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-[11px] sm:text-xs text-slate-300">
              
              {/* Opcao 1: Gerar PDF de Alta Definição Filtrado por Categoria e Subcategoria */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border-2 border-sky-500/40 space-y-3.5 hover:border-sky-500/60 transition-all shadow-xl">
                <div className="space-y-1">
                  <span className="text-[10px] bg-sky-500/20 border border-sky-500/40 text-sky-400 font-extrabold px-2.5 py-0.5 rounded-full uppercase font-mono tracking-wider inline-flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Relatório PDF Formatado
                  </span>
                  <h4 className="font-extrabold text-slate-100 text-sm sm:text-base mt-1 font-display">
                    Exportar Relatório em PDF por Categoria e Subcategoria
                  </h4>
                  <p className="text-[10.5px] sm:text-[11px] text-slate-400 leading-relaxed">
                    Compila um documento PDF oficial pronto para impressão ou arquivo, com assinaturas de conferência, métricas consolidadas, código EAN, lotes, validades e estoques filtrados.
                  </p>
                </div>

                {/* Filtros Interativos de Categoria e Subcategoria */}
                <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-slate-800 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Select Categoria */}
                    <div>
                      <label className="text-[10px] uppercase font-mono font-black text-sky-400 tracking-wider block mb-1">
                        1. Categoria:
                      </label>
                      <select
                        value={exportSelectedCategoryName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setExportSelectedCategoryName(val);
                          setExportSelectedSubcategoryName('all'); // reset subcategory on category change
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-bold focus:outline-none focus:border-sky-500 cursor-pointer shadow-inner"
                      >
                        <option value="all">📦 Todas as Categorias (Geral)</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Select Subcategoria */}
                    <div>
                      <label className="text-[10px] uppercase font-mono font-black text-sky-400 tracking-wider block mb-1">
                        2. Subcategoria:
                      </label>
                      <select
                        value={exportSelectedSubcategoryName}
                        onChange={(e) => setExportSelectedSubcategoryName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-bold focus:outline-none focus:border-sky-500 cursor-pointer shadow-inner"
                      >
                        <option value="all">📂 Todas as Subcategorias</option>
                        {(() => {
                          if (exportSelectedCategoryName !== 'all') {
                            const cat = categories.find(c => c.name === exportSelectedCategoryName);
                            return (cat?.subcategories || []).map(sub => (
                              <option key={sub} value={sub}>{sub}</option>
                            ));
                          } else {
                            const allSubcats = Array.from(new Set(
                              products.map(p => p.subcategory).filter(Boolean)
                            )).sort();
                            return allSubcats.map(sub => (
                              <option key={sub} value={sub}>{sub}</option>
                            ));
                          }
                        })()}
                      </select>
                    </div>
                  </div>

                  {/* Resumo Dinâmico do Filtro Selecionado */}
                  {(() => {
                    const catFilter = exportSelectedCategoryName !== 'all' ? exportSelectedCategoryName : undefined;
                    const subFilter = exportSelectedSubcategoryName !== 'all' ? exportSelectedSubcategoryName : undefined;
                    let count = products;
                    if (catFilter) count = count.filter(p => p.category === catFilter);
                    if (subFilter) count = count.filter(p => p.subcategory === subFilter);
                    const totalVolumes = count.reduce((sum, p) => sum + p.batches.reduce((bSum, b) => bSum + b.quantity, 0) + (productSectorsSums[p.id]?.totalTransferred || 0), 0);
                    
                    return (
                      <div className="flex items-center justify-between text-[11px] font-mono bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800">
                        <span className="text-slate-400">
                          Filtro: <strong className="text-slate-200">{catFilter || 'Todas as Categorias'}</strong> {subFilter ? `> ${subFilter}` : ''}
                        </span>
                        <span className="text-emerald-400 font-black">
                          {count.length} SKU ({totalVolumes} un)
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Botão de Download do PDF */}
                <button
                  type="button"
                  onClick={() => {
                    handleExportPDF(exportSelectedCategoryName, exportSelectedSubcategoryName);
                    setShowExportModal(false);
                  }}
                  className="w-full bg-linear-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-slate-950 font-black text-xs uppercase tracking-wider py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-[0_4px_16px_rgba(14,165,233,0.3)]"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    Baixar Relatório em PDF
                    {exportSelectedCategoryName !== 'all' ? ` (${exportSelectedCategoryName}${exportSelectedSubcategoryName !== 'all' ? ` > ${exportSelectedSubcategoryName}` : ''})` : ' (Inventário Completo)'}
                  </span>
                </button>
              </div>

              {/* Opcao 2: Integrador WhatsApp API */}
              <div className="p-4 rounded-2xl bg-emerald-950/15 border border-emerald-500/25 space-y-3.5 hover:border-emerald-500/40 transition-all">
                <div className="space-y-1">
                  <span className="text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold px-2 py-0.5 rounded uppercase font-mono tracking-wider flex items-center gap-1.5 w-fit">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                    BVE Integrador WhatsApp API
                  </span>
                  <h4 className="font-bold text-slate-200 text-sm mt-1.5">Enviar Resumo de Estoque para o WhatsApp</h4>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 leading-relaxed">
                    Gera e salva o PDF com o filtro selecionado (categoria/subcategoria) no aparelho e inicia o WhatsApp com um resumo das métricas, alertas e quantidades.
                  </p>
                </div>

                {/* WhatsApp parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 select-none">
                  <div>
                    <label className="text-[9px] uppercase font-mono font-bold text-emerald-400 tracking-wider block mb-1">
                      WhatsApp do Destinatário (Opcional)
                    </label>
                    <input 
                      type="tel"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="Ex: 5511999999999"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[8px] text-slate-500 font-mono mt-0.5 block">Não obrigatório para compartilhar geral</span>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-mono font-bold text-emerald-400 tracking-wider block mb-1">
                      Assunto / Mensagem Inicial
                    </label>
                    <input 
                      type="text"
                      value={whatsappPreamble}
                      onChange={(e) => setWhatsappPreamble(e.target.value)}
                      placeholder="Digite um assunto..."
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    onClick={() => {
                      handleShareWhatsApp(exportSelectedCategoryName, exportSelectedSubcategoryName);
                      setShowExportModal(false);
                    }}
                    className="w-full bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-black text-[10px] uppercase tracking-wider py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
                  >
                    <Share2 className="w-4 h-4" /> Enviar p/ WhatsApp & Salvar PDF {exportSelectedCategoryName !== 'all' ? `(${exportSelectedCategoryName})` : ''}
                  </button>
                </div>
              </div>

              {/* Opcao 3: Planilha CSV e Auditorias Legacy */}
              <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                  <div className="space-y-0.5">
                    <h4 className="font-bold text-slate-300 font-mono">Planilha Excel / CSV Legacy</h4>
                    <p className="text-[9px] text-slate-500 uppercase font-bold">Exportar base de dados crua</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        handleExportCSV();
                        setShowExportModal(false);
                      }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[9px] uppercase tracking-wider px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 cursor-pointer active:scale-95 transition-all"
                      title="Exportar inventário geral em formato de planilha CSV"
                    >
                      Inventário Geral
                    </button>
                    <button
                      onClick={() => {
                        handleExportCategorySummaryCSV();
                        setShowExportModal(false);
                      }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[9px] uppercase tracking-wider px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 cursor-pointer active:scale-95 transition-all"
                      title="Exportar resumo geral por grupo de categoria"
                    >
                      Consolidado grupos
                    </button>
                    <button
                      onClick={() => {
                        handleExportSpecificCategoryCSV(exportSelectedCategoryName, exportSelectedSubcategoryName);
                        setShowExportModal(false);
                      }}
                      className="bg-amber-500 hover:bg-amber-450 text-slate-950 font-bold text-[9px] uppercase tracking-wider px-3 py-1.5 rounded-lg border border-amber-600 hover:border-amber-500 cursor-pointer active:scale-95 transition-all flex items-center gap-1"
                      title="Exportar CSV com o filtro atual de categoria e subcategoria"
                    >
                      <Download className="w-3 h-3" /> CSV Filtrado
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL: GERENCIAR CATEGORIAS E SUBCATEGORIAS */}
      {showManageCategoriesModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-[130]">
          <div className="bg-white border-2 border-slate-900 rounded-3xl max-w-3xl w-full max-h-[92dvh] overflow-hidden flex flex-col shadow-2xl">
            
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
                  <Layers className="w-5 h-5 stroke-[2.25]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-slate-900 font-display text-sm sm:text-base tracking-wide uppercase truncate">
                    Gerenciar Categorias & Subcategorias
                  </h3>
                  <p className="text-[10px] text-slate-600 uppercase font-mono tracking-wider truncate">
                    Crie e remova as divisões operacionais do BV Atacarejo
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowManageCategoriesModal(false);
                  setNewCategoryName('');
                }}
                className="text-slate-700 hover:text-black p-2 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-all active:scale-95 shrink-0"
                aria-label="Fechar modal de categorias"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form: Add Category Row */}
            <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 shrink-0">
              <form onSubmit={handleAddCategory} className="space-y-2">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-700 font-bold">
                  Criar Nova Categoria Primária
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Ex: Utilidades Domésticas, Higiene Pessoal..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="w-full sm:flex-1 bg-white border border-slate-300 focus:border-sky-600 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-bold text-xs px-5 py-2.5 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Adicionar Categoria</span>
                  </button>
                </div>
              </form>
            </div>

            {/* List of Categories in a Grid */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 bg-white">
              {categories.length === 0 ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <AlertOctagon className="w-12 h-12 mx-auto text-slate-400" />
                  <p className="text-sm font-bold text-slate-800">Sem categorias disponíveis</p>
                  <p className="text-xs max-w-sm mx-auto text-slate-600">
                    Crie sua primeira categoria primária utilizando o formulário acima para inicializar a categorização de estoque.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {categories.map((cat) => (
                    <div 
                      key={cat.id}
                      className="bg-slate-50 p-4 rounded-2xl border border-slate-300 flex flex-col justify-between space-y-3 shadow-xs relative"
                    >
                      {/* Category Header */}
                      <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-slate-200">
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider truncate">{cat.name}</h4>
                          <span className="text-[9px] font-mono text-slate-500">ID: {cat.id}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCategory(cat.id)}
                          className="text-rose-600 hover:text-rose-700 p-2 hover:bg-rose-50 rounded-lg cursor-pointer transition-all shrink-0"
                          title={`Excluir categoria "${cat.name}"`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Subcategories list */}
                      <div className="flex-1 space-y-2">
                        <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">
                          Subcategorias vinculadas ({cat.subcategories?.length || 0}):
                        </p>
                        
                        {!cat.subcategories || cat.subcategories.length === 0 ? (
                          <p className="text-[11px] text-slate-500 italic">Nenhuma subcategoria cadastrada de momento.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {cat.subcategories.map((sub) => (
                              <span 
                                key={sub}
                                className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-extrabold px-2.5 py-1 rounded-md transition-all shadow-xs ${getSubcategoryBadgeClass(sub)}`}
                              >
                                <span>{sub}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSubcategory(cat.id, sub)}
                                  className="text-slate-700 hover:text-rose-600 hover:bg-rose-100 p-1 rounded transition-all cursor-pointer font-black"
                                  title={`Deletar subcategoria "${sub}"`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Inline Form Add Subcategory */}
                      <div className="pt-2 border-t border-slate-200">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Nova subcategoria..."
                            value={newSubcategoryName[cat.id] || ''}
                            onChange={(e) => setNewSubcategoryName(prev => ({ ...prev, [cat.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddSubcategory(cat.id);
                              }
                            }}
                            className="flex-1 bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 rounded-xl px-3 py-2 focus:outline-none focus:border-sky-600"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddSubcategory(cat.id)}
                            className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-2 rounded-xl border border-sky-700 transition-colors flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
                            title="Adicionar Subcategoria"
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer notice */}
            <div className="p-3.5 bg-slate-50 text-center border-t border-slate-200 shrink-0">
              <p className="text-[10px] text-slate-600">
                Lembre-se: Ao alterar as divisões primárias, você atualizará as opções disponíveis ao cadastrar produtos. 
              </p>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: SELECIONAR PRODUTO PARA REGISTRAR ENTRADA */}
      {showGlobalEntradaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            
            <div className="p-4 sm:p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                  <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 font-display text-sm tracking-wide font-sans">REGISTRAR ENTRADA DE PRODUTO</h3>
                  <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Selecione o item para abastecer o estoque</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowGlobalEntradaModal(false);
                  setGlobalEntradaSearch('');
                }}
                className="text-slate-500 hover:text-slate-200 p-1.5 bg-slate-800 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-950/40 border-b border-slate-800/80 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Pesquisar por nome ou código de barras..."
                  value={globalEntradaSearch}
                  onChange={(e) => setGlobalEntradaSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none placeholder-slate-500 font-sans font-medium"
                />
              </div>
              <button
                onClick={() => {
                  setShowGlobalEntradaModal(false);
                  setScanActionMode('entrada');
                  setShowScanner(true);
                }}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 text-emerald-400 font-bold text-xs px-4 py-2.5 rounded-xl border border-emerald-500/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                title="Escanear código de barras do produto para dar entrada"
              >
                <Scan className="w-4 h-4 stroke-[2.5]" />
                <span>Escanear Código</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 select-none">
              {(() => {
                if (globalEntradaSearch.trim() === "" && !showAllInEntrada) {
                  return (
                    <div className="text-center py-10 px-4 text-slate-400 space-y-4">
                      <Search className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold leading-relaxed text-slate-300">
                          Busca inteligente de produtos
                        </p>
                        <p className="text-[10.5px] text-slate-550 max-w-xs mx-auto">
                          Digite o nome ou código de barras no campo acima para pesquisar o produto, ou clique em Escanear Código.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAllInEntrada(true)}
                        className="mx-auto text-[10.5px] font-bold text-emerald-400 hover:text-emerald-350 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 hover:bg-slate-900 cursor-pointer transition-all flex items-center justify-center gap-1.5"
                      >
                        <Layers className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Visualizar Lista Completa</span>
                      </button>
                    </div>
                  );
                }

                const filtered = sortProductsAlphabetically(
                  products.filter(p => matchProductWithKeywords(p, globalEntradaSearch))
                );

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-10 text-slate-500 space-y-1">
                      <HelpCircle className="w-8 h-8 mx-auto text-slate-705" />
                      <p className="text-xs font-semibold">Nenhum produto correspondente</p>
                      <p className="text-[10px]">Tente digitar outro termo ou cadastrar um novo item.</p>
                    </div>
                  );
                }

                return filtered.map((product) => {
                  const totalQty = product.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[product.id]?.totalTransferred || 0);

                  return (
                    <div 
                      key={product.id}
                      onClick={() => {
                        setShowGlobalEntradaModal(false);
                        setGlobalEntradaSearch('');
                        handleOpenMovement(product, 'entrada');
                      }}
                      className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 hover:border-slate-700 hover:bg-slate-900/40 flex items-center justify-between gap-4 cursor-pointer transition-all duration-200"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono font-bold text-amber-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">{product.barcode}</span>
                          {(() => {
                            const val = getProductValidadeSummary(product);
                            return (
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                                val.isExpired 
                                  ? 'text-rose-400 bg-rose-950/30 border-rose-900/40' 
                                  : val.isCritical 
                                  ? 'text-amber-400 bg-amber-950/30 border-amber-900/40' 
                                  : 'text-emerald-400 bg-emerald-950/30 border-emerald-900/40'
                              }`}>
                                <Calendar className="w-3 h-3" />
                                {val.text}
                              </span>
                            );
                          })()}
                        </div>
                        <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{product.name}</h4>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Lotes ativos: <span className="text-slate-400 font-bold">{product.batches.length}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-xs font-mono font-bold block ${totalQty > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                          {formatPackaging(totalQty, product.packaging)}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider block">Estoque</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

          </div>
        </div>
      )}
      
      {/* MODAL: SELECIONAR PRODUTO PARA REGISTRAR SAÍDA */}
      {showGlobalSaidaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            
            <div className="p-4 sm:p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
                  <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 font-display text-sm tracking-wide font-sans">REGISTRAR SAÍDA DE PRODUTO</h3>
                  <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Selecione o item para registrar a baixa</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowGlobalSaidaModal(false);
                  setGlobalSaidaSearch('');
                }}
                className="text-slate-500 hover:text-slate-200 p-1.5 bg-slate-800 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-950/40 border-b border-slate-800/80 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Pesquisar por nome ou código de barras..."
                  value={globalSaidaSearch}
                  onChange={(e) => setGlobalSaidaSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-100 focus:border-rose-500 focus:outline-none placeholder-slate-500 font-sans font-medium"
                />
              </div>
              <button
                onClick={() => {
                  setShowGlobalSaidaModal(false);
                  setScanActionMode('saida');
                  setShowScanner(true);
                }}
                className="bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 font-bold text-xs px-4 py-2.5 rounded-xl border border-rose-500/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                title="Escanear código de barras do produto usando a câmera"
              >
                <Scan className="w-4 h-4 stroke-[2.5]" />
                <span>Escanear Código</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 select-none">
              {(() => {
                if (globalSaidaSearch.trim() === "" && !showAllInSaida) {
                  return (
                    <div className="text-center py-10 px-4 text-slate-400 space-y-4">
                      <Search className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold leading-relaxed text-slate-300">
                          Busca inteligente de produtos
                        </p>
                        <p className="text-[10.5px] text-slate-550 max-w-xs mx-auto">
                          Digite o nome ou código de barras no campo acima para pesquisar o produto, ou clique em Escanear Código.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAllInSaida(true)}
                        className="mx-auto text-[10.5px] font-bold text-rose-450 hover:text-rose-400 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 hover:bg-slate-900 cursor-pointer transition-all flex items-center justify-center gap-1.5"
                      >
                        <Layers className="w-3.5 h-3.5 text-rose-500" />
                        <span>Visualizar Lista Completa</span>
                      </button>
                    </div>
                  );
                }

                const filtered = sortProductsAlphabetically(
                  products.filter(p => matchProductWithKeywords(p, globalSaidaSearch))
                );

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-10 text-slate-500 space-y-1">
                      <HelpCircle className="w-8 h-8 mx-auto text-slate-705" />
                      <p className="text-xs font-semibold">Nenhum produto correspondente</p>
                      <p className="text-[10px]">Tente digitar outro termo ou cadastrar um novo item.</p>
                    </div>
                  );
                }

                return filtered.map((product) => {
                  const totalQty = product.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[product.id]?.totalTransferred || 0);

                  return (
                    <div 
                      key={product.id}
                      onClick={() => {
                        setShowGlobalSaidaModal(false);
                        setGlobalSaidaSearch('');
                        handleOpenMovement(product, 'saida');
                      }}
                      className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 hover:border-slate-700 hover:bg-slate-900/40 flex items-center justify-between gap-4 cursor-pointer transition-all duration-200"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono font-bold text-amber-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">{product.barcode}</span>
                          {(() => {
                            const val = getProductValidadeSummary(product);
                            return (
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                                val.isExpired 
                                  ? 'text-rose-400 bg-rose-950/30 border-rose-900/40' 
                                  : val.isCritical 
                                  ? 'text-amber-400 bg-amber-950/30 border-amber-900/40' 
                                  : 'text-emerald-400 bg-emerald-950/30 border-emerald-900/40'
                              }`}>
                                <Calendar className="w-3 h-3" />
                                {val.text}
                              </span>
                            );
                          })()}
                        </div>
                        <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{product.name}</h4>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Lotes ativos: <span className="text-slate-400 font-bold">{product.batches.length}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-xs font-mono font-bold block ${totalQty > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                          {formatPackaging(totalQty, product.packaging)}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider block">Estoque</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

          </div>
        </div>
      )}

      {/* MODAL: LUPA DE PESQUISA DE ITENS - QUICK GLOBAL SEARCH */}
      {showQuickSearch && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in animate-duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
            
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.1)]">
                  <Search className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-50 font-display text-base tracking-wide uppercase">Lupa de Pesquisa Inteligente</h3>
                  <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Busca instantânea de produtos, lotes e validades no estoque</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowQuickSearch(false);
                  setQuickSearchQuery('');
                }}
                className="text-slate-400 hover:text-slate-100 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sticky Search bar input with prominent magnifying glass styling */}
            <div className="p-5 bg-slate-950/80 border-b border-slate-800/80">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-500" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Pesquise por nome, código de barras, categoria ou lote..."
                  value={quickSearchQuery}
                  onChange={(e) => setQuickSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-12 pr-12 py-3.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none placeholder-slate-500 font-sans shadow-inner transition-colors animate-duration-100"
                />
                {quickSearchQuery && (
                  <button 
                    onClick={() => setQuickSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-100 font-bold bg-slate-800 px-2.5 py-1 rounded-md"
                  >
                    Limpar
                  </button>
                )}
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Dica: Digite parte do nome ou código para busca instantânea</span>
                <span>Itens cadastrados: <strong className="text-amber-400">{products.length}</strong></span>
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-slate-900/40">
              {(() => {
                const filtered = sortProductsAlphabetically(
                  products.filter(p => matchProductWithKeywords(p, quickSearchQuery))
                );

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-16 text-slate-500 space-y-2">
                      <HelpCircle className="w-12 h-12 mx-auto text-slate-800" />
                      <p className="text-sm font-bold text-slate-300">Nenhum produto encontrado</p>
                      <p className="text-xs max-w-sm mx-auto text-slate-500">
                        Não encontramos nenhum produto com "{quickSearchQuery}". Verifique a grafia ou cadastre o item primeiro no estoque.
                      </p>
                    </div>
                  );
                }

                return filtered.map((product, pIndex) => {
                  const sectorSums = productSectorsSums[product.id] || { loja: 0, anexo: 0, '3019': 0, totalTransferred: 0 };
                  const totalQty = product.batches.reduce((sum, b) => sum + b.quantity, 0) + sectorSums.totalTransferred;
                  const qtyLoja = sectorSums.loja;
                  const qtyAnexo = sectorSums.anexo;
                  const qty3019 = sectorSums['3019'];

                  const isP1 = pIndex === 0;
                  const isP2 = pIndex === 1;

                  return (
                    <div 
                      key={product.id}
                      className="bg-slate-950 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all duration-300 space-y-3 shadow-md"
                      style={{ borderColor: '#000000' }}
                    >
                      {/* Product header */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span 
                              className="text-[10px] font-mono font-black bg-slate-900 px-2 py-0.5 rounded-md border"
                              style={{ 
                                color: '#000000', 
                                borderColor: '#000000',
                                backgroundColor: '#ffffff'
                              }}
                            >
                              {product.barcode}
                            </span>
                            {(() => {
                              const val = getProductValidadeSummary(product);
                              let valClass = "text-emerald-400 bg-emerald-950/30 border-emerald-900/40";
                              if (val.isExpired) valClass = "text-rose-400 bg-rose-950/30 border-rose-900/40 font-bold";
                              else if (val.isCritical) valClass = "text-amber-400 bg-amber-950/30 border-amber-900/40 font-bold";
                              return (
                                <span 
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-black flex items-center gap-1 ${valClass}`}
                                  style={{
                                    borderColor: '#000000',
                                    ...(isP1 ? { color: '#1ba009' } : {})
                                  }}
                                >
                                  <Calendar className="w-3 h-3" />
                                  {val.text}
                                </span>
                              );
                            })()}
                          </div>
                          <h4 className="text-sm font-black text-slate-100 leading-tight">{product.name}</h4>
                          <p className="text-[11px] text-slate-400 line-clamp-1 italic">{product.description || 'Sem descrição cadastrada'}</p>
                        </div>

                        {/* Actions drawer inline */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              setShowQuickSearch(false);
                              setSelectedProductForDetails(product);
                              setShowProductDetailsModal(true);
                            }}
                            className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 transition-all hover:bg-indigo-500 hover:text-white text-indigo-400 flex items-center justify-center cursor-pointer"
                            title="Ver Ficha Detalhada"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setShowQuickSearch(false);
                              handleOpenMovement(product, 'entrada');
                            }}
                            className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 transition-all hover:bg-emerald-500 hover:text-slate-950 text-emerald-400 flex items-center justify-center cursor-pointer"
                            title="Entrada / Lote"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setShowQuickSearch(false);
                              handleOpenMovement(product, 'saida');
                            }}
                            className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 transition-all hover:bg-rose-500 hover:text-slate-950 text-rose-400 flex items-center justify-center cursor-pointer"
                            title="Saída"
                          >
                            <ArrowDownLeft className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Estoque Total Simplificado */}
                      <div 
                        className="flex items-center justify-between text-center text-[10px] bg-slate-900/60 px-3 py-2 rounded-xl border"
                        style={{ borderColor: '#000000' }}
                      >
                        <span 
                          className="uppercase font-mono tracking-tight font-bold text-[9px]"
                          style={isP1 ? { color: '#009816' } : { color: '#64748b' }}
                        >
                          Estoque Total
                        </span>
                        <span 
                          className="font-extrabold font-mono text-xs"
                          style={isP1 ? { color: '#068717' } : { color: '#14b8a6' }}
                        >
                          {totalQty} {product.packaging.split(' ')[0]}
                        </span>
                      </div>

                      {/* Batches Sub-list */}
                      {product.batches.length > 0 ? (
                        <div className="border-t border-slate-900 pt-3 space-y-1.5">
                          <p className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">Lotes vinculados ({product.batches.length}):</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {product.batches.map((batch) => {
                              const remaining = getDaysRemaining(batch.date);

                              return (
                                <div key={batch.id} className="bg-white p-2.5 rounded-xl border border-slate-300 flex justify-between items-center text-xs shadow-xs">
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono text-[10px] bg-white border border-slate-300 px-2 py-0.5 rounded text-black font-black">
                                        Lote: {batch.id}
                                      </span>
                                      <span className="text-black font-black font-mono">
                                        {formatPackaging(batch.quantity, product.packaging)}
                                      </span>
                                    </div>
                                    <p className="text-[10.5px] text-black font-black font-mono">
                                      Validade: {batch.date.split('-').reverse().join('/')}
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-mono font-black px-2 py-1 rounded border border-slate-300 bg-white text-black shadow-xs">
                                    {remaining < 0 ? `Vencido (${Math.abs(remaining)}d)` : `${remaining}d`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-1 text-slate-500 text-xs italic">
                          Nenhum lote ativo cadastrado.
                        </div>
                      )}

                    </div>
                  );
                });
              })()}
            </div>

          </div>
        </div>
      )}

      {/* MODAL: ADD PRODUCT FORM */}
      {showAddProductModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-[120]">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[92dvh] overflow-y-auto overscroll-contain shadow-2xl">
            
            <div className="p-4 sm:p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-slate-100 font-display text-base">CADASTRAR NOVO PRODUTO</h3>
              </div>
              <button 
                onClick={handleCloseAddProductModal}
                className="text-slate-500 hover:text-slate-200 p-1 bg-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={saveProduct} className="p-4 sm:p-6 space-y-4 text-xs">
              
              {/* NOTIFICAÇÃO DE CÓDIGO ESCANEADO E PREENCHIMENTO AUTOMÁTICO VIA BANCO DE DADOS */}
              {autoFillNotification && !duplicateConflict && (
                <div className={`p-4 rounded-2xl border text-left space-y-2 animate-in fade-in slide-in-from-top-2 ${
                  autoFillNotification.status === 'found'
                    ? 'bg-emerald-950/40 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)] text-emerald-200'
                    : autoFillNotification.status === 'searching'
                    ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                    : 'bg-sky-950/40 border-sky-500/40 text-sky-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl shrink-0 mt-0.5 border ${
                      autoFillNotification.status === 'found'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : autoFillNotification.status === 'searching'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                    }`}>
                      {autoFillNotification.status === 'found' ? (
                        <CheckCircle className="w-5 h-5 stroke-[2.5]" />
                      ) : autoFillNotification.status === 'searching' ? (
                        <Loader className="w-5 h-5 animate-spin" />
                      ) : (
                        <Scan className="w-5 h-5 stroke-[2.5]" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded ${
                          autoFillNotification.status === 'found'
                            ? 'bg-emerald-500 text-slate-950'
                            : autoFillNotification.status === 'searching'
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-sky-500 text-slate-950'
                        }`}>
                          {autoFillNotification.status === 'found' 
                            ? 'DADOS ENCONTRADOS NO BANCO' 
                            : autoFillNotification.status === 'searching'
                            ? 'BUSCANDO NO BANCO DE DADOS'
                            : 'LEITURA CONCLUÍDA'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          EAN: <strong className="text-slate-200 font-bold">{autoFillNotification.barcode}</strong>
                        </span>
                      </div>

                      <h4 className="font-bold text-xs sm:text-sm text-slate-100">
                        {autoFillNotification.status === 'found'
                          ? `Identificado: "${autoFillNotification.productName || newProdName}"`
                          : autoFillNotification.status === 'searching'
                          ? 'Consultando catálogo de produtos...'
                          : 'Produto não catalogado nos bancos externos'}
                      </h4>

                      <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                        {autoFillNotification.status === 'found'
                          ? 'Os dados do item (nome comercial, fabricante, volume e imagem) foram encontrados e preenchidos automaticamente no formulário! Revise os detalhes e clique em Salvar para concluir o cadastro.'
                          : autoFillNotification.status === 'searching'
                          ? 'Fazendo leitura do código de barras e pesquisando nos bancos de dados para preencher automaticamente as informações do produto...'
                          : 'O código de barras foi lido com sucesso pela câmera. Preencha o nome e a categoria para cadastrar este novo item no seu estoque.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoFillNotification(null)}
                      className="text-slate-500 hover:text-slate-300 p-1 rounded-lg cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* BANNER DE RECUSA SE O ITEM JÁ ESTIVER CADASTRADO */}
              {duplicateConflict && (
                <div className="p-4 rounded-2xl bg-rose-950/40 border-2 border-rose-500/60 shadow-[0_0_25px_rgba(244,63,94,0.2)] space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0 mt-0.5">
                      <AlertOctagon className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div className="flex-1 text-left space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-rose-500 text-slate-950 text-[10px] font-black uppercase px-2 py-0.5 rounded font-mono tracking-wider">
                          CADASTRO NÃO ACEITO
                        </span>
                        <h4 className="font-bold text-rose-200 text-sm">
                          {duplicateConflict.title}
                        </h4>
                      </div>
                      <p className="text-xs text-rose-300 font-semibold leading-relaxed">
                        {duplicateConflict.reason}
                      </p>
                    </div>
                  </div>

                  {/* Motivo detalhado da recusa */}
                  <div className="p-2.5 rounded-lg bg-rose-900/20 border border-rose-500/25 text-left text-[11px] text-slate-300">
                    <strong className="text-rose-400 uppercase tracking-wide text-[10px] block mb-1">Motivo do bloqueio:</strong>
                    <span>{duplicateConflict.detailedReason}</span>
                  </div>

                  {/* Ficha resumida do item já cadastrado com botões diretos de ação */}
                  <div className="bg-slate-950/90 rounded-xl p-3 border border-rose-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase font-mono font-bold flex items-center gap-1.5">
                        <span>Item Existente no Estoque:</span>
                        <span className="text-emerald-400">{duplicateConflict.existingProduct.category}</span>
                      </div>
                      <p className="text-slate-100 font-bold text-sm">
                        {duplicateConflict.existingProduct.name}
                        {duplicateConflict.existingProduct.brand && (
                          <span className="text-slate-400 text-xs font-normal ml-1.5">({duplicateConflict.existingProduct.brand})</span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
                        <span>EAN: <strong className="text-slate-200">{duplicateConflict.existingProduct.barcode || 'Sem código'}</strong></span>
                        <span>•</span>
                        <span>Saldo: <strong className="text-emerald-400">{duplicateConflict.existingProduct.batches?.reduce((acc, b) => acc + (b.quantity || 0), 0) || 0} {duplicateConflict.existingProduct.packaging || 'un'}</strong></span>
                        <span>•</span>
                        <span>Lotes: <strong className="text-slate-200">{duplicateConflict.existingProduct.batches?.length || 0}</strong></span>
                      </div>
                    </div>

                    <div className="flex sm:flex-col gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddProductModal(false);
                          setSelectedProductForDetails(duplicateConflict.existingProduct);
                          setShowProductDetailsModal(true);
                        }}
                        className="flex-1 sm:flex-none px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold rounded-lg border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-sky-400" />
                        <span>Ver Ficha Técnica</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddProductModal(false);
                          setSelectedProductForMovement(duplicateConflict.existingProduct);
                          setMovementType('entrada');
                          setShowMovementModal(true);
                        }}
                        className="flex-1 sm:flex-none px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-[11px] font-extrabold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Dar Entrada (+)</span>
                      </button>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5 italic text-left">
                    <CheckCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{duplicateConflict.suggestion}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative-input-container">
                  <div className="flex items-center justify-between mb-1">
                    <label className="m-0 flex items-center gap-1.5 font-bold">
                      <span>Código de Barras</span>
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase font-mono">
                        Opcional
                      </span>
                    </label>
                    {newProdBarcode && (
                      <button
                        type="button"
                        onClick={() => setNewProdBarcode('')}
                        className="text-[9px] text-slate-400 hover:text-rose-400 font-mono transition-colors cursor-pointer"
                        title="Limpar para cadastrar sem código de barras"
                      >
                        ✕ Limpar (Sem código)
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={newProdBarcode}
                    onChange={(e) => setNewProdBarcode(e.target.value)}
                    placeholder="7890000000000 (ou deixe em branco se não possuir)"
                    className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-slate-205 font-mono focus:outline-none transition-colors ${
                      duplicateConflict && duplicateConflict.type === 'barcode'
                        ? 'border-rose-500 text-rose-300 focus:border-rose-400'
                        : 'border-slate-800 focus:border-emerald-500'
                    }`}
                  />
                  
                  {/* Dica explicativa clara de que o código é opcional */}
                  <div className="mt-1 flex items-center gap-1.5 text-[9.5px] text-slate-400">
                    <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>Não tem código de barras? Pode deixar em branco e cadastrar normalmente.</span>
                  </div>

                  {/* AVISO INLINE ESPECÍFICO SE O CÓDIGO FOR DUPLICADO */}
                  {duplicateConflict && duplicateConflict.type === 'barcode' && (
                    <div className="mt-2.5 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 text-left space-y-1">
                      <p 
                        onClick={() => {
                          setShowAddProductModal(false);
                          setSelectedProductForDetails(duplicateConflict.existingProduct);
                          setShowProductDetailsModal(true);
                        }} 
                        className="flex items-center gap-1.5 cursor-pointer font-extrabold text-[11px] text-rose-400 hover:underline hover:text-rose-300"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                        <span>Código Já Cadastrado: "{duplicateConflict.existingProduct.name}"</span>
                      </p>
                      <p className="text-[10px] text-slate-400 font-normal leading-normal">
                        Este código pertence a um item ativo. Não é permitido reutilizar o mesmo código. Clique no link acima para ver a ficha.
                      </p>
                    </div>
                  )}

                  {/* Busca na rede feedback */}
                  {newProdBarcode.trim() && !duplicateConflict && (
                    <div className="flex justify-between items-center mt-1.5 text-[9px] px-0.5">
                      {networkError ? (
                        <span className="text-rose-450 font-mono truncate max-w-[130px] sm:max-w-[160px]" title={networkError}>{networkError}</span>
                      ) : isSearchingNetwork ? (
                        <span className="text-emerald-400 font-mono flex items-center gap-1 animate-pulse">
                          <Loader className="w-2.5 h-2.5 animate-spin" /> Buscando na rede...
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono">Buscador automático</span>
                      )}
                      <button
                        type="button"
                        onClick={() => fetchProductFromNetwork(newProdBarcode)}
                        disabled={isSearchingNetwork || !newProdBarcode.trim()}
                        className="text-[9px] text-emerald-400 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 font-bold uppercase transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1"
                      >
                        <Globe className="w-2.5 h-2.5 text-emerald-500" /> Buscar na Rede
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative-input-container">
                  <label className="flex items-center justify-between">
                    <span className="font-bold text-slate-100 text-xs">Item</span>
                    {duplicateConflict && duplicateConflict.type === 'name' && (
                      <span className="text-[9px] font-bold text-rose-400 font-mono uppercase">
                        Nome Já Cadastrado
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-slate-205 focus:outline-none ${
                      duplicateConflict && duplicateConflict.type === 'name'
                        ? 'border-rose-500 text-rose-300 focus:border-rose-400'
                        : 'border-slate-800 focus:border-emerald-500'
                    }`}
                  />
                  
                  {/* AVISO INLINE ESPECÍFICO SE O NOME FOR DUPLICADO */}
                  {duplicateConflict && duplicateConflict.type === 'name' && (
                    <div className="mt-2.5 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 text-left space-y-1">
                      <p 
                        onClick={() => {
                          setShowAddProductModal(false);
                          setSelectedProductForDetails(duplicateConflict.existingProduct);
                          setShowProductDetailsModal(true);
                        }} 
                        className="flex items-center gap-1.5 cursor-pointer font-extrabold text-[11px] text-rose-400 hover:underline hover:text-rose-300"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                        <span>Item já cadastrado no catálogo</span>
                      </p>
                      <p className="text-[10px] text-slate-400 font-normal leading-normal">
                        O item "{duplicateConflict.existingProduct.name}" já está no sistema ({duplicateConflict.existingProduct.category}). Não crie duplicatas.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative-input-container">
                  <div className="flex items-center justify-between mb-1">
                    <label className="m-0 flex items-center gap-1.5 font-bold">
                      <Factory className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Fabricante / Indústria / Marca</span>
                    </label>
                    <span className="text-[9px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase">
                      Organização Ativa
                    </span>
                  </div>
                  <input
                    type="text"
                    list="fabricantes-form-datalist"
                    value={newProdBrand}
                    onChange={(e) => setNewProdBrand(e.target.value)}
                    placeholder="Ex: Ambev, Coca-Cola FEMSA, Nestlé, Unilever..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:border-emerald-500 focus:outline-none"
                  />
                  <datalist id="fabricantes-form-datalist">
                    {allBrandsList.map((brandOption) => (
                      <option key={brandOption} value={brandOption} />
                    ))}
                  </datalist>

                  {/* 1-Click Fast Presets Chips */}
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-[9px] uppercase font-mono font-bold text-slate-500 mr-0.5">
                      Sugestões:
                    </span>
                    {TOP_FABRICANTES_PRESETS.slice(0, 7).map((presetBrand) => (
                      <button
                        key={presetBrand}
                        type="button"
                        onClick={() => setNewProdBrand(presetBrand)}
                        className={`text-[9.5px] font-mono px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                          newProdBrand.toLowerCase() === presetBrand.toLowerCase()
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {presetBrand}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative-input-container">
                  <label>Peso / Volume / Conteúdo</label>
                  <input
                    type="text"
                    value={newProdWeightVolume}
                    onChange={(e) => setNewProdWeightVolume(e.target.value)}
                    placeholder="Ex: 1kg, 500ml, 12 unidades"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-205 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="relative-input-container">
                <div className="flex justify-between items-center mb-1">
                  <label className="m-0">Imagem do Produto (Opcional)</label>
                  {newProdImage && (
                    <button
                      type="button"
                      onClick={() => setNewProdImage('')}
                      className="text-rose-450 hover:text-rose-300 font-bold text-[10px] uppercase flex items-center gap-1 bg-rose-950/20 px-2 py-0.5 rounded border border-rose-900/40 cursor-pointer"
                    >
                      Remover
                    </button>
                  )}
                </div>
                <div className="space-y-2.5">
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={newProdImage.startsWith('data:') ? 'Imagem capturada pela câmera (Base64)' : newProdImage}
                      onChange={(e) => setNewProdImage(e.target.value)}
                      disabled={newProdImage.startsWith('data:')}
                      placeholder="https://exemplo.com/imagem.png ou capture abaixo"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-205 focus:border-emerald-500 focus:outline-none font-mono text-[11px] disabled:opacity-65"
                    />
                    {newProdImage && (
                      <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={newProdImage} alt="Preview" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                  
                  {/* Tirar Foto do Produto */}
                  <label className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 hover:text-emerald-300 font-bold text-[11px] uppercase tracking-wider py-2.5 rounded-xl cursor-pointer transition-all">
                    <Camera className="w-4 h-4" />
                    Tirar Foto do Produto (Catálogo)
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleProductImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-800/80 space-y-3.5">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/40">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span className="font-bold text-slate-300 tracking-wide text-[10px] sm:text-xs">DIVISÃO DE CATEGORIA</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingCategoryOnTheFly(!isCreatingCategoryOnTheFly);
                      setOnTheFlyCategoryName('');
                      setOnTheFlySubcategoryName('');
                    }}
                    className="text-[9px] uppercase font-bold text-sky-450 hover:text-sky-300 px-2 py-1 rounded bg-slate-900 hover:bg-slate-850 cursor-pointer border border-sky-500/10 transition-all text-sky-400"
                  >
                    {isCreatingCategoryOnTheFly ? "Selecionar Existente" : "+ Criar Nova Categoria"}
                  </button>
                </div>

                {!isCreatingCategoryOnTheFly ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="relative-input-container">
                      <label>Categoria</label>
                      <select
                        value={newProdCategory}
                        onChange={(e) => {
                          const catName = e.target.value;
                          setNewProdCategory(catName);
                          const matched = categories.find(c => c.name === catName);
                          setNewProdSubcategory((matched?.subcategories || [])[0] || '');
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-205 focus:border-emerald-500 focus:outline-none cursor-pointer"
                      >
                        {categories.length === 0 ? (
                          <option value="">Sem categorias</option>
                        ) : (
                          categories.map(c => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))
                        )}
                      </select>
                    </div>
                    <div className="relative-input-container">
                      {!isAddingNewSubcategory ? (
                        <>
                          <label>Subcategoria</label>
                          <select
                            value={newProdSubcategory}
                            onChange={(e) => setNewProdSubcategory(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-205 focus:border-emerald-500 focus:outline-none cursor-pointer"
                          >
                            {(() => {
                              const subs = categories.find(c => c.name === newProdCategory)?.subcategories || [];
                              if (subs.length === 0) {
                                return <option value="">Sem subcategoria</option>;
                              }
                              return (
                                <>
                                  <option value="">Sem subcategoria</option>
                                  {subs.map(sub => (
                                    <option key={sub} value={sub}>{sub}</option>
                                  ))}
                                </>
                              );
                            })()}
                          </select>
                          <div className="mt-1.5 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingNewSubcategory(true);
                                setNewSubcategoryInputValue('');
                              }}
                              className="text-[9px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer bg-sky-500/5 px-2.5 py-1 rounded-lg border border-sky-500/10 hover:border-sky-500/25 transition-all uppercase font-mono tracking-wider"
                            >
                              + Criar Subcategoria
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-1.5 text-left">
                          <div className="flex justify-between items-center">
                            <label className="text-emerald-400 font-mono text-[10px] font-bold uppercase mb-0">Nova Subcategoria</label>
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingNewSubcategory(false);
                                setNewSubcategoryInputValue('');
                              }}
                              className="text-[9px] uppercase font-mono font-bold text-rose-500 hover:text-rose-400 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              required
                              placeholder="Digite..."
                              value={newSubcategoryInputValue}
                              onChange={(e) => setNewSubcategoryInputValue(e.target.value)}
                              className="flex-1 bg-slate-950 border border-emerald-500/30 rounded-xl px-3 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none text-xs"
                            />
                            <button
                              type="button"
                              onClick={handleAddNewSubcategoryInline}
                              className="bg-emerald-500 text-slate-950 font-black text-[11px] px-2.5 py-2 rounded-xl hover:bg-emerald-400 transition-all cursor-pointer active:scale-95 uppercase font-mono"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-amber-550 font-mono uppercase text-[10px] font-bold mb-1.5 text-amber-400">Nome da Nova Categoria</label>
                        <input
                          type="text"
                          placeholder="Ex: Açougue, Laticínios..."
                          value={onTheFlyCategoryName}
                          onChange={(e) => setOnTheFlyCategoryName(e.target.value)}
                          className="w-full bg-slate-950 border border-amber-500/30 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 font-mono uppercase text-[10px] font-bold mb-1.5">Nova Subcategoria (Opcional)</label>
                        <input
                          type="text"
                          placeholder="Ex: Frango fatiado, Queijo prato..."
                          value={onTheFlySubcategoryName}
                          onChange={(e) => setOnTheFlySubcategoryName(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingCategoryOnTheFly(false);
                          setOnTheFlyCategoryName('');
                          setOnTheFlySubcategoryName('');
                        }}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-405 font-bold uppercase text-[9px] rounded-lg cursor-pointer transition-all border border-slate-800 text-slate-400"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateCategoryOnTheFly}
                        className="px-3.5 py-2 bg-sky-505 hover:bg-sky-400 text-slate-950 font-bold uppercase text-[9px] rounded-lg cursor-pointer transition-all shadow-[0_0_12px_rgba(14,165,233,0.15)] bg-sky-500"
                      >
                        Criar e Selecionar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative-input-container">
                  <label>Estoque Mínimo Alerta</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newProdMinStock}
                    onChange={(e) => setNewProdMinStock(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-205 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="relative-input-container">
                  <label>Formato Embalagem</label>
                  <input
                    type="text"
                    list="packaging-list"
                    value={newProdPackaging}
                    placeholder="Ex: palete, caixa, fardo, kg, unidade"
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewProdPackaging(val);
                      // If the packaging format enters as a larger unit, instantly suggest default batch qty as 1!
                      const lowerVal = val.trim().toLowerCase();
                      if (lowerVal && lowerVal !== 'unidade' && lowerVal !== 'un' && lowerVal !== 'unidades') {
                        setNewProdBatchQty('1');
                      } else {
                        setNewProdBatchQty('10');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-205 focus:border-emerald-500 focus:outline-none"
                  />
                  <datalist id="packaging-list">
                    <option value="unidade" />
                    <option value="caixa" />
                    <option value="palete" />
                    <option value="fardo" />
                    <option value="kg" />
                    <option value="caixa de 12un" />
                    <option value="fardo de 6un" />
                  </datalist>
                </div>
              </div>

              {/* Advanced desc */}
              <div className="relative-input-container">
                <label>Descrição (Opcional)</label>
                <textarea
                  value={newProdDescription}
                  onChange={(e) => setNewProdDescription(e.target.value)}
                  placeholder="Observações de peso, armazenagem frigobar, fornecedores..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-205 focus:border-emerald-500 focus:outline-none placeholder-slate-600 font-sans"
                />
              </div>

              {/* Sub Header for Initial Batch setting */}
              <div className="border-t border-slate-800 pt-4 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-500 animate-pulse" />
                    <h4 className="font-bold text-slate-300 font-display text-[11px] tracking-wider uppercase">DADOS DO LOTE E VALIDADE</h4>
                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase font-mono">
                      Opcional
                    </span>
                  </div>
                  {newProdBatchDate && (
                    <button
                      type="button"
                      onClick={() => setNewProdBatchDate('')}
                      className="text-[9px] text-slate-400 hover:text-rose-400 font-mono transition-colors cursor-pointer"
                      title="Deixar validade em branco para definir posteriormente"
                    >
                      ✕ Deixar sem validade agora
                    </button>
                  )}
                </div>

                {/* Dica explicativa sobre a validade ser opcional */}
                <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/80 mb-3 text-[10px] text-slate-400 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-200">A validade é opcional:</span> Você pode cadastrar o produto agora sem data de validade e defini-la posteriormente na ficha técnica do item ou na entrada de mercadoria.
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="relative-input-container">
                    <label>Identificação Lote (Opcional)</label>
                    <input
                      type="text"
                      value={newProdBatchId}
                      onChange={(e) => setNewProdBatchId(e.target.value)}
                      placeholder="Ex: L26-04 (ou deixe em branco)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-205 font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div className="relative-input-container">
                    <div className="flex justify-between items-center mb-1">
                      <label className="m-0 font-bold">Validade (Opcional)</label>
                      {newProdBatchDate && (
                        <button
                          type="button"
                          onClick={() => setNewProdBatchDate('')}
                          className="text-[9px] text-rose-450 hover:underline cursor-pointer"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={newProdBatchDate}
                      onChange={(e) => setNewProdBatchDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-205 font-mono focus:border-emerald-500 focus:outline-none cursor-pointer"
                    />
                    <span className="text-[9px] text-slate-500 block mt-1">
                      {newProdBatchDate ? 'Data definida' : 'Em branco = Definir validade posteriormente'}
                    </span>
                  </div>
                  <div className="relative-input-container">
                    <label>Saldo inicial (Opcional)</label>
                    <input
                      type="number"
                      min={0}
                      value={newProdBatchQty}
                      onChange={(e) => setNewProdBatchQty(e.target.value)}
                      placeholder="10"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-205 font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* NF Photo input option */}
              <div className="border-t border-slate-800 pt-4 mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-bold text-slate-300 font-display text-[11px] tracking-wider uppercase">FOTO DA NF (NOTA FISCAL) - OPCIONAL</h4>
                  </div>
                  {newProdNfPhoto && (
                    <button
                      type="button"
                      onClick={() => setNewProdNfPhoto('')}
                      className="text-rose-450 hover:text-rose-300 font-bold text-[10px] uppercase flex items-center gap-1 bg-rose-950/20 px-2 py-0.5 rounded border border-rose-900/40 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Limpar
                    </button>
                  )}
                </div>

                {!newProdNfPhoto ? (
                  <div className="relative group border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 bg-slate-950/40 transition-all text-center">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleNfPhotoUpload(e, 'new')}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      title="Escolher arquivo ou Capturar foto da Nota Fiscal"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none py-2">
                      <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800 group-hover:bg-emerald-500/10 group-hover:border-emerald-500 transition-all">
                        <Camera className="w-5 h-5 text-slate-400 group-hover:text-emerald-400" />
                      </div>
                      <div className="text-xs font-bold text-slate-300 group-hover:text-emerald-400">
                        Tirar Foto ou Anexar Nota Fiscal
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Clique aqui para abrir a câmera do celular ou escolher imagem
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <img 
                      src={newProdNfPhoto} 
                      alt="NF Nota Fiscal" 
                      onClick={() => setSelectedNfPhotoForZoom(newProdNfPhoto)}
                      className="w-14 h-14 object-cover rounded-lg border border-slate-700 cursor-zoom-in hover:opacity-80 transition-all"
                    />
                    <div className="flex-1 space-y-1">
                      <p className="text-xs font-bold text-slate-300">Nota Fiscal Capturada</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedNfPhotoForZoom(newProdNfPhoto)}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded cursor-pointer"
                        >
                          Visualizar Ampliado
                        </button>
                        <label className="text-[10px] text-slate-400 hover:text-slate-300 font-bold bg-slate-900 border border-slate-805 px-2 py-1 rounded cursor-pointer relative">
                          Substituir Foto
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handleNfPhotoUpload(e, 'new')}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Save or Packaging Alteration on Duplicate */}
              {duplicateConflict ? (
                <div className="space-y-3 mt-5 p-4 bg-slate-950/90 rounded-2xl border-2 border-amber-500/50 text-left shadow-2xl animate-fade-in">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-amber-500/15 text-amber-400 rounded-xl border border-amber-500/30 shrink-0 mt-0.5">
                      <Package className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="text-[10px] font-mono font-black uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                          PRODUTO JÁ EXISTE NO SISTEMA
                        </span>
                        <button
                          type="button"
                          onClick={() => setDuplicateRejectionModal(duplicateConflict)}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer"
                        >
                          Ver detalhes do bloqueio →
                        </button>
                      </div>
                      <p className="text-xs font-black text-slate-100 truncate mt-1">
                        {duplicateConflict.existingProduct.name}
                        {duplicateConflict.existingProduct.brand && (
                          <span className="text-slate-400 font-normal ml-1">({duplicateConflict.existingProduct.brand})</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Packaging comparison box */}
                  <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400 font-bold">Embalagem atual cadastrada:</span>
                      <span className="font-extrabold text-slate-200 uppercase bg-slate-800 px-2.5 py-0.5 rounded border border-slate-700">
                        {duplicateConflict.existingProduct.packaging || 'unidade'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-amber-400 font-bold">Nova embalagem desejada:</span>
                      <span className="font-black text-amber-300 uppercase bg-amber-500/20 px-2.5 py-0.5 rounded border border-amber-500/40 animate-pulse">
                        {newProdPackaging || 'unidade'}
                      </span>
                    </div>

                    {/* Quick selection chips for packaging */}
                    <div className="pt-2 border-t border-slate-800">
                      <span className="text-[10px] text-slate-400 font-sans font-bold block mb-1.5">
                        Escolha ou altere o formato da embalagem:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {['unidade', 'caixa', 'fardo', 'caixa de 12un', 'caixa de 24un', 'fardo de 6un', 'litrão', 'engradado', 'barril'].map((pkg) => (
                          <button
                            key={pkg}
                            type="button"
                            onClick={() => {
                              setNewProdPackaging(pkg);
                              if (pkg !== 'unidade' && pkg !== 'un') {
                                setNewProdBatchQty('1');
                              }
                            }}
                            className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                              (newProdPackaging || '').trim().toLowerCase() === pkg
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {pkg}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Checkbox option to also register the batch if quantity was filled */}
                  {(parseInt(newProdBatchQty) || 0) > 0 && (
                    <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none px-1">
                      <input
                        type="checkbox"
                        checked={addFormIncludeBatchOnPackagingUpdate}
                        onChange={(e) => setAddFormIncludeBatchOnPackagingUpdate(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>
                        Também registrar entrada de <strong>{newProdBatchQty} {newProdPackaging || 'un'}</strong> no estoque
                        {newProdBatchDate ? ` (Val: ${newProdBatchDate.split('-').reverse().join('/')})` : ''}
                      </span>
                    </label>
                  )}

                  {/* Primary Action Button: Alterar Embalagem */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      disabled={isSavingProduct}
                      onClick={() => handleUpdateExistingProductPackaging(
                        duplicateConflict.existingProduct,
                        newProdPackaging || 'unidade',
                        addFormIncludeBatchOnPackagingUpdate
                      )}
                      className="w-full bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs py-3 px-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all uppercase tracking-wider"
                    >
                      {isSavingProduct ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-slate-950 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Atualizando...
                        </>
                      ) : (
                        <>
                          <Package className="w-4 h-4 stroke-[2.5]" />
                          <span>
                            Alterar Embalagem para &quot;{newProdPackaging || 'unidade'}&quot;
                            {addFormIncludeBatchOnPackagingUpdate && (parseInt(newProdBatchQty) || 0) > 0 ? ` (+${newProdBatchQty} un)` : ''}
                          </span>
                        </>
                      )}
                    </button>

                    {/* Se o conflito for apenas por nome e o código de barras for diferente ou ausente, permite salvar como variação */}
                    {duplicateConflict.type === 'name' && (
                      <button
                        type="button"
                        disabled={isSavingProduct}
                        onClick={() => handleSaveAsPackagingVariation(duplicateConflict.existingProduct)}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100 font-bold text-[11px] py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer border border-slate-800 transition-all font-mono"
                      >
                        <Layers className="w-3.5 h-3.5 text-sky-400" />
                        <span>Cadastrar como Nova Variação: &quot;{newProdName} ({newProdPackaging})&quot;</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="w-full bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 cursor-pointer text-slate-950 font-extrabold text-xs py-3.5 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 mt-5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingProduct ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2.5 h-4 w-4 text-slate-950 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 stroke-[2.5]" />
                      Salvar Produto e Batch no Estoque
                    </>
                  )}
                </button>
              )}

            </form>

          </div>
        </div>
      )}

      {/* MODAL: AVISO DE RECUSA DE CADASTRAMENTO DUPLICADO */}
      {duplicateRejectionModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border-2 border-rose-500/60 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 shrink-0">
                <AlertOctagon className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="flex-1 text-left">
                <span className="bg-rose-500/20 text-rose-300 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-rose-500/30 font-mono">
                  CADASTRAMENTO NÃO ACEITO
                </span>
                <h3 className="font-bold text-slate-100 text-lg mt-1 font-display">
                  {duplicateRejectionModal.title}
                </h3>
                <p className="text-xs text-rose-300 font-semibold mt-0.5">
                  O item que você tentou cadastrar já existe no banco de dados do estoque.
                </p>
              </div>
              <button
                onClick={() => setDuplicateRejectionModal(null)}
                className="text-slate-500 hover:text-slate-300 p-1 bg-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-rose-950/30 border border-rose-900/60 rounded-xl text-left space-y-1.5">
              <div className="text-[11px] font-bold text-rose-400 uppercase tracking-wide">
                MOTIVO DA NÃO ACEITAÇÃO:
              </div>
              <p className="text-xs text-slate-200 leading-relaxed font-normal">
                {duplicateRejectionModal.detailedReason}
              </p>
            </div>

            <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800 text-left space-y-2">
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                Ficha do Produto Já Cadastrado:
              </div>
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-100 text-sm">
                  {duplicateRejectionModal.existingProduct.name}
                  {duplicateRejectionModal.existingProduct.brand && (
                    <span className="text-slate-400 font-normal text-xs ml-1.5">
                      ({duplicateRejectionModal.existingProduct.brand})
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  {duplicateRejectionModal.existingProduct.category}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-slate-400 font-mono">
                <div>
                  Código EAN: <strong className="text-slate-200">{duplicateRejectionModal.existingProduct.barcode || 'Sem código'}</strong>
                </div>
                <div>
                  Saldo Atual: <strong className="text-emerald-400">{duplicateRejectionModal.existingProduct.batches?.reduce((a, b) => a + (b.quantity || 0), 0) || 0} {duplicateRejectionModal.existingProduct.packaging || 'un'}</strong>
                </div>
              </div>
            </div>

            {/* SEÇÃO ESPECIAL DE ALTERAÇÃO DE EMBALAGEM */}
            <div className="bg-slate-950 p-4 rounded-xl border-2 border-amber-500/50 text-left space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-amber-400 stroke-[2.5]" />
                  <span className="text-xs font-black uppercase text-amber-300 font-mono tracking-wider">
                    Alteração de Embalagem
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  Atual: <strong className="text-slate-200 uppercase">{duplicateRejectionModal.existingProduct.packaging || 'unidade'}</strong>
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-semibold">
                Mesmo que este produto já esteja cadastrado, você pode alterar o formato de embalagem dele diretamente agora:
              </p>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 font-mono shrink-0">Nova Embalagem:</span>
                  <input
                    type="text"
                    value={rejectionModalPackaging}
                    onChange={(e) => setRejectionModalPackaging(e.target.value)}
                    placeholder="Ex: caixa, fardo, caixa de 24un, barril..."
                    className="flex-1 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-amber-200 font-bold focus:outline-none"
                  />
                </div>

                {/* Quick chips */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {['unidade', 'caixa', 'fardo', 'caixa de 12un', 'caixa de 24un', 'fardo de 6un', 'litrão', 'engradado', 'barril'].map((pkg) => (
                    <button
                      key={pkg}
                      type="button"
                      onClick={() => setRejectionModalPackaging(pkg)}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                        (rejectionModalPackaging || '').trim().toLowerCase() === pkg
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {pkg}
                    </button>
                  ))}
                </div>

                {(parseInt(newProdBatchQty) || 0) > 0 && (
                  <label className="flex items-center gap-2 pt-1 text-[11px] text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rejectionModalIncludeBatch}
                      onChange={(e) => setRejectionModalIncludeBatch(e.target.checked)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>
                      Também registrar entrada de <strong>{newProdBatchQty} {rejectionModalPackaging || 'un'}</strong> no estoque
                      {newProdBatchDate ? ` (Validade: ${newProdBatchDate.split('-').reverse().join('/')})` : ''}
                    </span>
                  </label>
                )}
              </div>

              <button
                type="button"
                disabled={isSavingProduct}
                onClick={() => handleUpdateExistingProductPackaging(
                  duplicateRejectionModal.existingProduct,
                  rejectionModalPackaging || newProdPackaging || 'unidade',
                  rejectionModalIncludeBatch
                )}
                className="w-full bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all uppercase tracking-wider"
              >
                <Package className="w-4 h-4 stroke-[2.5]" />
                <span>Confirmar Alteração de Embalagem para &quot;{rejectionModalPackaging || newProdPackaging || 'unidade'}&quot;</span>
              </button>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-left text-[11px] text-slate-400 space-y-1">
              <span className="font-bold text-slate-300 block">Como proceder:</span>
              <span>{duplicateRejectionModal.suggestion}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDuplicateRejectionModal(null);
                  setShowAddProductModal(false);
                  setSelectedProductForDetails(duplicateRejectionModal.existingProduct);
                  setShowProductDetailsModal(true);
                }}
                className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700 transition-colors"
              >
                <Eye className="w-4 h-4 text-sky-400" />
                <span>Ver Ficha do Produto</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicateRejectionModal(null);
                  setShowAddProductModal(false);
                  setSelectedProductForMovement(duplicateRejectionModal.existingProduct);
                  setMovementType('entrada');
                  setShowMovementModal(true);
                }}
                className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <ArrowDownLeft className="w-4 h-4 stroke-[3]" />
                <span>Dar Entrada (+)</span>
              </button>
              <button
                type="button"
                onClick={() => setDuplicateRejectionModal(null)}
                className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl font-bold text-xs cursor-pointer border border-slate-800 transition-colors"
              >
                Voltar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: AÇÕES RÁPIDAS PÓS-ESCANEAMENTO DE PRODUTO CADASTRADO (ENTRADA OU SAÍDA) */}
      {scannedRegisteredProduct && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-slate-900 border-2 border-emerald-500/60 rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-[0_25px_70px_rgba(0,0,0,0.95)] flex flex-col text-slate-100">
            
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
                  <Scan className="w-5 h-5 stroke-[2.5] animate-pulse" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[9.5px] font-mono font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 tracking-wider">
                      PRODUTO LOCALIZADO NO ESTOQUE
                    </span>
                  </div>
                  <h3 className="font-extrabold text-slate-50 text-base sm:text-lg font-display tracking-tight mt-0.5">
                    O que deseja registrar agora?
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => setScannedRegisteredProduct(null)}
                className="text-slate-400 hover:text-slate-100 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer transition-all active:scale-95"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5 text-left">
              {/* Product Info Card */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                {scannedRegisteredProduct.image ? (
                  <div className="w-20 h-20 rounded-xl bg-slate-900 border border-slate-800 p-1.5 flex items-center justify-center shrink-0 mx-auto sm:mx-0 overflow-hidden">
                    <img 
                      src={scannedRegisteredProduct.image} 
                      alt={scannedRegisteredProduct.name}
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 shrink-0 mx-auto sm:mx-0">
                    <Package className="w-8 h-8 stroke-[1.5]" />
                  </div>
                )}

                <div className="flex-1 space-y-1.5 min-w-0 w-full text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                    <span className="text-[10px] font-mono font-black bg-slate-900 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30">
                      EAN: {scannedRegisteredProduct.barcode}
                    </span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded font-mono ${getCategoryBadgeClass(scannedRegisteredProduct.category)}`}>
                      {scannedRegisteredProduct.category}
                    </span>
                    {scannedRegisteredProduct.packaging && (
                      <span className="text-[9px] font-bold text-slate-300 bg-slate-850 px-2 py-0.5 rounded border border-slate-700">
                        📦 {scannedRegisteredProduct.packaging}
                      </span>
                    )}
                  </div>

                  <h4 className="font-extrabold text-sm sm:text-base text-slate-100 uppercase tracking-tight leading-snug">
                    {scannedRegisteredProduct.name}
                  </h4>

                  {scannedRegisteredProduct.brand && (
                    <p className="text-[11px] text-slate-400 font-medium">
                      Marca / Fabricante: <strong className="text-slate-200">{scannedRegisteredProduct.brand}</strong>
                    </p>
                  )}

                  {/* Stock and lot metrics */}
                  {(() => {
                    const totalQty = scannedRegisteredProduct.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[scannedRegisteredProduct.id]?.totalTransferred || 0);
                    const val = getProductValidadeSummary(scannedRegisteredProduct);
                    return (
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 text-xs">
                        <span className="text-slate-400">
                          Estoque Atual: <strong className="text-emerald-400 font-mono font-black text-sm">{formatPackaging(totalQty, scannedRegisteredProduct.packaging)}</strong>
                        </span>
                        <span>•</span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          val.isExpired 
                            ? 'text-rose-400 bg-rose-950/40 border-rose-900/50' 
                            : val.isCritical 
                            ? 'text-amber-400 bg-amber-950/40 border-amber-900/50' 
                            : 'text-emerald-400 bg-emerald-950/40 border-emerald-900/50'
                        }`}>
                          {val.text}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* AS DUAS OPÇÕES PRINCIPAIS SOLICITADAS: ENTRADA OU SAÍDA */}
              <div className="space-y-3">
                <p className="text-[11px] font-mono uppercase font-black tracking-wider text-slate-400 text-center sm:text-left">
                  Selecione a operação para o código escaneado:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  
                  {/* OPÇÃO 1: ENTRADA DE PRODUTO */}
                  <button
                    type="button"
                    onClick={() => {
                      const prod = scannedRegisteredProduct;
                      setScannedRegisteredProduct(null);
                      handleOpenMovement(prod, 'entrada');
                    }}
                    className="p-5 rounded-2xl bg-linear-to-br from-emerald-600 via-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 active:scale-[0.98] text-slate-950 border border-emerald-400/50 shadow-[0_8px_25px_rgba(16,185,129,0.35)] transition-all cursor-pointer flex flex-col justify-between group text-left"
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-950/20 border border-slate-950/30 flex items-center justify-center text-slate-950 group-hover:scale-110 transition-transform">
                        <ArrowUpRight className="w-7 h-7 stroke-[3]" />
                      </div>
                      <span className="text-[10px] font-mono font-black uppercase px-2.5 py-1 rounded-full bg-slate-950 text-emerald-400">
                        + Adicionar
                      </span>
                    </div>
                    <div>
                      <h5 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-950 font-display">
                        Entrada de Produto (+)
                      </h5>
                      <p className="text-[11px] text-emerald-950/80 font-bold leading-tight mt-1">
                        Abastecer estoque, registrar compra de mercadoria ou cadastrar novo lote.
                      </p>
                    </div>
                  </button>

                  {/* OPÇÃO 2: SAÍDA DE PRODUTO */}
                  <button
                    type="button"
                    onClick={() => {
                      const prod = scannedRegisteredProduct;
                      setScannedRegisteredProduct(null);
                      handleOpenMovement(prod, 'saida');
                    }}
                    className="p-5 rounded-2xl bg-linear-to-br from-rose-600 via-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 active:scale-[0.98] text-slate-50 border border-rose-400/50 shadow-[0_8px_25px_rgba(244,63,94,0.35)] transition-all cursor-pointer flex flex-col justify-between group text-left"
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-950/30 border border-slate-950/40 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                        <ArrowDownLeft className="w-7 h-7 stroke-[3]" />
                      </div>
                      <span className="text-[10px] font-mono font-black uppercase px-2.5 py-1 rounded-full bg-slate-950 text-rose-400">
                        - Baixa
                      </span>
                    </div>
                    <div>
                      <h5 className="text-base sm:text-lg font-black uppercase tracking-tight text-white font-display">
                        Saída de Produto (-)
                      </h5>
                      <p className="text-[11px] text-rose-100/80 font-bold leading-tight mt-1">
                        Registrar venda, saída para gôndola, devolução ou baixa de avaria.
                      </p>
                    </div>
                  </button>

                </div>
              </div>

              {/* Ações complementares */}
              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const prod = scannedRegisteredProduct;
                      setScannedRegisteredProduct(null);
                      setSelectedProductForDetails(prod);
                      setShowProductDetailsModal(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    <span>Ver Ficha Técnica</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setScannedRegisteredProduct(null);
                    setShowScanner(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-slate-200 text-xs font-bold border border-slate-800 cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>Escanear Outro</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL: MOVEMENT FLOW (ENTRADA / SAÍDA DE LOTES) */}
      {showMovementModal && selectedProductForMovement && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            
            <div className="p-4 sm:p-6 border-b border-slate-800 flex justify-between items-start bg-slate-950">
              <div className="text-left space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-mono bg-slate-850 text-amber-500 px-2 py-0.5 rounded border border-slate-700/80 font-bold">
                    {selectedProductForMovement.barcode}
                  </span>
                  <span
                    className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${getCategoryBadgeClass(selectedProductForMovement.category)}`}
                    style={{ backgroundColor: '#6c6c6c' }}
                  >
                    {selectedProductForMovement.category}
                  </span>
                  {selectedProductForMovement.subcategory && (
                    <span className={`text-[9.5px] font-extrabold px-1.5 py-0.5 rounded uppercase font-mono ${getSubcategoryBadgeClass(selectedProductForMovement.subcategory)}`}>
                      {selectedProductForMovement.subcategory}
                    </span>
                  )}
                </div>

                <div>
                  {movementType === 'entrada' ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-extrabold text-[11px] uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Lançamento de Entrada (+)
                    </div>
                  ) : movementType === 'transferencia' ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/50 border border-amber-800/80 text-amber-400 font-black text-[11px] uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.15)] animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                      Lançamento de Transferência
                    </div>
                  ) : (
                    <div
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-900/85 text-red-400 font-black text-[11px] uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse"
                      style={{ backgroundColor: '#6c6464' }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                      Lançamento de Saída (Baixa)
                    </div>
                  )}
                </div>

                <p
                  className="text-[14.5px] text-center text-slate-200 font-bold mt-1 bg-slate-900/80 px-3 py-2 rounded-xl border-[3px] border-[#040404] shadow-inner"
                  style={{ fontSize: '14.5px', textAlign: 'center', borderWidth: '3px', borderColor: '#040404' }}
                >
                  {selectedProductForMovement.name}
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowMovementModal(false);
                  setSelectedProductForMovement(null);
                  setTransferDestination('');
                  setScannedExistingAlert(null); // Clear scanning alert!
                }}
                className="text-slate-400 hover:text-slate-100 p-1.5 bg-slate-800/85 hover:bg-slate-700/90 rounded-xl transition-all border border-slate-755 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ALERTA DE PRODUTO SCANEADO QUE JÁ TEM CADASTRO NO SISTEMA (DENTRO DA MOVIMENTAÇÃO) */}
            {scannedExistingAlert && scannedExistingAlert.barcode === selectedProductForMovement.barcode && (
              <div className="mx-4 sm:mx-6 mt-4 p-3.5 bg-amber-500/10 border border-amber-500/35 rounded-xl flex items-start gap-2.5 text-xs text-amber-205">
                <AlertTriangle className="w-4 h-4 text-amber-450 flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1 text-left">
                  <p className="font-extrabold text-amber-300 uppercase tracking-wider text-[9.5px]">
                    ⚠️ Produto já cadastrado!
                  </p>
                  <p className="text-[10.5px] text-slate-300 leading-relaxed font-sans font-medium">
                    O produto <strong className="text-slate-100 font-extrabold">"{selectedProductForMovement.name}"</strong> (Código de Barras: <strong className="font-mono text-amber-400 font-bold">{selectedProductForMovement.barcode}</strong>) já possui um cadastro ativo.
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Direcionando você para o lançamento rápido do lote de <span className="font-bold text-amber-350 uppercase">{scannedExistingAlert.mode === 'entrada' ? 'entrada (+)' : 'saída (-)'}</span> correspondente.
                  </p>
                </div>
                <button 
                  onClick={() => setScannedExistingAlert(null)}
                  className="text-slate-550 hover:text-slate-350 font-bold text-[9px] font-mono cursor-pointer bg-slate-950 border border-slate-850 px-1.5 py-0.5 rounded transition-all shrink-0 self-center"
                >
                  Confirmar
                </button>
              </div>
            )}

            <form onSubmit={handleRegisterMovement} className="p-4 sm:p-6 space-y-4 text-xs select-none animate-fade-in">
              
              <div className="grid grid-cols-2 gap-1.5 bg-slate-950 border border-black rounded-2xl p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMovementType('entrada');
                    setIsNewBatchForEntrada(true);
                    setMoveBatchId(`l-${Date.now()}`);
                    setTransferDestination('');
                    setMoveSourceSector('deposito');
                    setMoveQuantity(Math.max(1, Math.abs(parseInt(moveQuantity) || 1)).toString());
                  }}
                  className={`text-center text-[10.5px] py-2.5 rounded-xl font-black font-sans uppercase tracking-wider transition-all cursor-pointer border border-black ${
                    movementType === 'entrada' 
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_4px_12px_rgba(16,185,129,0.25)]' 
                      : 'bg-transparent text-slate-450 hover:text-slate-200 hover:bg-slate-900/35'
                  }`}
                >
                  Entrada (+)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMovementType('saida');
                    setIsNewBatchForEntrada(false);
                    setTransferDestination('');
                    setMoveSourceSector('deposito');
                    setMoveQuantity((-Math.max(1, Math.abs(parseInt(moveQuantity) || 1))).toString());
                    if (selectedProductForMovement.batches && selectedProductForMovement.batches.length > 0) {
                      setMoveBatchId(selectedProductForMovement.batches[0].id);
                    } else {
                      setMoveBatchId('sem-lote');
                    }
                  }}
                  className={`text-center text-[10.5px] py-2.5 rounded-xl font-black font-sans uppercase tracking-wide transition-all cursor-pointer border border-black ${
                    movementType === 'saida' 
                      ? 'bg-red-800 hover:bg-red-700 text-red-50 shadow-[0_4px_12px_rgba(153,27,27,0.45)]' 
                      : 'bg-transparent text-slate-450 hover:text-slate-200 hover:bg-slate-900/35'
                  }`}
                >
                  Saída (-)
                </button>
              </div>

              {/* ENTRADA TIER SELECTION */}
              {movementType === 'entrada' && (
                <div className="flex items-center gap-3 border border-black p-2 rounded-xl bg-slate-950">
                  <span
                    className="text-[10px] font-mono font-black uppercase"
                    style={{ borderColor: '#000000', color: '#000000' }}
                  >
                    Tipo de Lote:
                  </span>
                  <div className="flex gap-2 flex-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewBatchForEntrada(true);
                        setMoveBatchId(`l-${Date.now()}`);
                        setMoveBatchDate('');
                      }}
                      style={{ backgroundColor: '#ffffff', color: '#000000' }}
                      className={`flex-1 text-[10px] py-1.5 rounded-lg border transition-all cursor-pointer uppercase tracking-wider font-black ${
                        isNewBatchForEntrada 
                          ? 'border-amber-500 ring-1 ring-amber-500' 
                          : 'border-black'
                      }`}
                    >
                      Criar Novo Lote
                    </button>
                    <button
                      type="button"
                      disabled={selectedProductForMovement.batches.length === 0}
                      onClick={() => {
                        setIsNewBatchForEntrada(false);
                        if (selectedProductForMovement.batches.length > 0) {
                          setMoveBatchId(selectedProductForMovement.batches[0].id);
                        }
                      }}
                      style={{ backgroundColor: '#ffffff', color: '#000000' }}
                      className={`flex-1 text-[10px] py-1.5 rounded-lg border transition-all cursor-pointer disabled:opacity-35 uppercase tracking-wider font-black ${
                        !isNewBatchForEntrada 
                          ? 'border-amber-500 ring-1 ring-amber-500' 
                          : 'border-black'
                      }`}
                    >
                      Abastecer Existente
                    </button>
                  </div>
                </div>
              )}

              {/* Dynamic Batch Selector or Creator */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* LOTE IDENTIFIER */}
                <div className="relative-input-container">
                  <label>Identificação do Lote</label>
                  {isNewBatchForEntrada ? (
                    <input
                      type="text"
                      required
                      value={moveBatchId}
                      onChange={(e) => setMoveBatchId(e.target.value)}
                      placeholder="Ex: L26-04"
                      className="w-full bg-slate-950 border border-black rounded-xl px-3.5 py-2.5 text-slate-205 font-mono font-black text-xs focus:border-black focus:outline-none placeholder:text-slate-650 shadow-inner"
                    />
                  ) : (
                    <select
                      value={moveBatchId}
                      onChange={(e) => setMoveBatchId(e.target.value)}
                      className="w-full bg-slate-950 border border-black rounded-xl px-3.5 py-2.5 text-slate-205 font-mono font-black text-xs focus:border-black focus:outline-none cursor-pointer shadow-inner"
                    >
                      {selectedProductForMovement.batches && selectedProductForMovement.batches.length > 0 ? (
                        <>
                          <option value="sem-lote">📦 Baixa Geral / Automático (Todos os Lotes)</option>
                          {selectedProductForMovement.batches.map(b => (
                            <option key={b.id} value={b.id}>
                              Lote {b.id.toUpperCase()} ({b.quantity} un) - Val: {b.date ? b.date.split('-').reverse().join('/') : 'Sem validade'}
                            </option>
                          ))}
                        </>
                      ) : (
                        <option value="sem-lote">📦 Estoque Geral / Item sem lote cadastrado</option>
                      )}
                    </select>
                  )}
                </div>

                {/* EXPIRY DATE */}
                <div className="relative-input-container">
                  <label>Data de Validade</label>
                  {isNewBatchForEntrada ? (
                    <input
                      type="date"
                      value={moveBatchDate}
                      onChange={(e) => setMoveBatchDate(e.target.value)}
                      className="w-full bg-slate-950 border border-black rounded-xl px-3.5 py-2.5 text-slate-205 font-mono font-black text-xs focus:border-black focus:outline-none cursor-pointer shadow-inner"
                    />
                  ) : (
                    <input
                      type="text"
                      disabled
                      value={
                        moveBatchId === 'sem-lote' || !selectedProductForMovement.batches || selectedProductForMovement.batches.length === 0
                          ? 'Automático / Todos os Lotes'
                          : (selectedProductForMovement.batches.find(b => b.id === moveBatchId)?.date
                              ? selectedProductForMovement.batches.find(b => b.id === moveBatchId)!.date.split('-').reverse().join('/')
                              : 'Sem validade definida')
                      }
                      className="w-full bg-slate-900 border border-black rounded-xl px-3.5 py-2.5 text-emerald-400 font-mono font-black text-xs focus:outline-none cursor-not-allowed shadow-inner"
                    />
                  )}
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* QUANTITY */}
                <div className="sm:col-span-2 space-y-3 bg-slate-950 p-4 rounded-xl border border-black shadow-md">
                  <div className="flex justify-between items-center">
                    <label className="block text-slate-200 font-mono text-[11px] uppercase font-black tracking-wider">
                      Quantidade ({selectedProductForMovement.packaging})
                    </label>
                    <span className="text-[10.5px] text-amber-450 font-mono font-black bg-slate-900 px-2.5 py-1 rounded border border-black uppercase tracking-widest shadow-xs">
                      TOTAL: {movementType === 'saida' ? `-${formatPackaging(Math.abs(parseInt(moveQuantity) || 0), selectedProductForMovement.packaging)}` : formatPackaging(Math.abs(parseInt(moveQuantity) || 0), selectedProductForMovement.packaging)}
                    </span>
                  </div>
                  
                  <div className="flex gap-2 items-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (movementType === 'saida') {
                          const current = parseInt(moveQuantity) || 0;
                          const next = current <= 0 ? current - 1 : -current;
                          setMoveQuantity(next.toString());
                        } else {
                          const val = Math.max(1, (parseInt(moveQuantity) || 0) - 1);
                          setMoveQuantity(val.toString());
                        }
                      }}
                      className="w-10 h-10 flex items-center justify-center bg-slate-900 border border-black text-[#c80016] rounded-lg font-black active:scale-95 transition-all text-base cursor-pointer hover:bg-rose-950/20"
                      title={movementType === 'saida' ? 'Aumentar baixa (-1, -2, -3...)' : 'Subtrair 1'}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      required
                      min={movementType === 'saida' ? undefined : 1}
                      value={moveQuantity}
                      onChange={(e) => setMoveQuantity(e.target.value)}
                      style={{ borderColor: '#000000' }}
                      className="flex-1 text-center bg-slate-900 border border-black rounded-lg py-2 text-slate-100 font-mono font-black text-lg focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (movementType === 'saida') {
                          const current = parseInt(moveQuantity) || 0;
                          const next = current < 0 ? Math.min(-1, current + 1) : -1;
                          setMoveQuantity(next.toString());
                        } else {
                          const val = (parseInt(moveQuantity) || 0) + 1;
                          setMoveQuantity(val.toString());
                        }
                      }}
                      className="w-10 h-10 flex items-center justify-center bg-slate-900 border border-black text-[#078b6c] rounded-lg font-black active:scale-95 transition-all text-base cursor-pointer hover:bg-emerald-950/20"
                      title={movementType === 'saida' ? 'Reduzir baixa em 1' : 'Adicionar 1'}
                    >
                      +
                    </button>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="space-y-2">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-[#191616] font-black font-mono block mb-1">Definir Valor Rápido</span>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[1, 5, 12, 24, 50].map(val => (
                          <button
                            key={`set-${val}`}
                            type="button"
                            onClick={() => setMoveQuantity(movementType === 'saida' ? (-val).toString() : val.toString())}
                            style={{ backgroundColor: '#ffffff', color: '#000000' }}
                            className={`py-1 rounded-md text-[11px] font-mono font-black border transition-all cursor-pointer ${
                              Math.abs(parseInt(moveQuantity) || 0) === val
                                ? 'border-amber-500 ring-1 ring-amber-500 shadow-xs'
                                : 'border-black'
                            }`}
                          >
                            {movementType === 'saida' ? `-${val}` : val}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-[#0d0c0c] font-black font-mono block mb-1">Soma / Subtração Rápida</span>
                      <div className="grid grid-cols-6 gap-1">
                        {[-50, -10, -5, +5, +10, +50].map(delta => (
                          <button
                            key={`adjust-${delta}`}
                            type="button"
                            onClick={() => {
                              const current = parseInt(moveQuantity) || 0;
                              if (movementType === 'saida') {
                                const base = current > 0 ? -current : current;
                                const next = Math.min(-1, base + delta);
                                setMoveQuantity(next.toString());
                              } else {
                                const next = Math.max(1, current + delta);
                                setMoveQuantity(next.toString());
                              }
                            }}
                            style={{ color: delta < 0 ? '#b0001f' : '#009267' }}
                            className={`py-1 rounded text-[10px] font-mono font-black border border-black transition-all cursor-pointer ${
                              delta < 0
                                ? 'bg-rose-950/15 hover:bg-rose-950/30'
                                : 'bg-emerald-950/15 hover:bg-emerald-950/30'
                            }`}
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* NF Photo input option for Entry/Intake (Movimentação de Entrada) */}
                {movementType === 'entrada' && (
                  <div className="sm:col-span-2 space-y-2 bg-slate-950/40 p-4 rounded-xl border border-black">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold text-slate-300 font-mono text-[10.5px] uppercase tracking-wider">FOTO DA NF (NOTA FISCAL) - OPCIONAL</span>
                      </div>
                      {moveNfPhoto && (
                        <button
                          type="button"
                          onClick={() => setMoveNfPhoto('')}
                          className="text-rose-450 hover:text-rose-350 font-extrabold text-[9.5px] uppercase flex items-center gap-1 bg-rose-950/20 px-2 py-0.5 rounded border border-black cursor-pointer animate-fade-in"
                        >
                          <Trash2 className="w-2.5 h-2.5" /> Limpar
                        </button>
                      )}
                    </div>

                    {!moveNfPhoto ? (
                      <div className="relative group border border-dashed border-black hover:border-black rounded-xl p-3 bg-slate-950/20 transition-all text-center">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handleNfPhotoUpload(e, 'move')}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          title="Tirar foto da Nota Fiscal da entrada"
                        />
                        <div className="flex flex-col items-center justify-center space-y-1 pointer-events-none py-1">
                          <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center border border-black group-hover:bg-emerald-500/10 transition-all">
                            <Camera className="w-4 h-4 text-slate-400 group-hover:text-emerald-400" />
                          </div>
                          <div className="text-[11px] font-bold text-slate-300 group-hover:text-emerald-400">
                            Tirar Foto da NF
                          </div>
                          <p className="text-[9px] text-slate-500 font-mono">
                            Toque para abrir a câmera ou anexar comprovante
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 bg-slate-950/40 p-2 rounded-lg border border-black animate-fade-in">
                        <img 
                          src={moveNfPhoto} 
                          alt="NF Entrada" 
                          onClick={() => setSelectedNfPhotoForZoom(moveNfPhoto)}
                          className="w-12 h-12 object-cover rounded-md border border-black cursor-zoom-in hover:opacity-85 transition-all"
                        />
                        <div className="flex-1 space-y-0.5">
                          <p className="text-[11px] font-bold text-slate-300">Nota Fiscal Escaneada</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedNfPhotoForZoom(moveNfPhoto)}
                              className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold bg-emerald-500/10 border border-black px-1.5 py-0.5 rounded cursor-pointer"
                            >
                              Ver Foto
                            </button>
                            <label className="text-[9px] text-slate-400 hover:text-slate-300 font-bold bg-slate-900 border border-black px-1.5 py-0.5 rounded cursor-pointer relative">
                              Substituir
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => handleNfPhotoUpload(e, 'move')}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* OPERATOR NAME */}
                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex justify-between items-center border-b border-black pb-1">
                    <label className="block text-slate-200 font-mono text-[10.5px] uppercase font-black tracking-wide">Nome do Operador Executante</label>
                    {currentUser && (
                      <span className="text-[10px] font-black text-emerald-400 font-mono flex items-center gap-1 bg-emerald-500/15 px-2 py-0.5 rounded-lg border border-black shadow-xs">
                        {currentUser.photoURL ? (
                          <img src={currentUser.photoURL} alt="" className="w-3.5 h-3.5 rounded-full" referrerPolicy="no-referrer" />
                        ) : (
                          <CheckCircle className="w-3 h-3 text-emerald-400 animate-pulse" />
                        )}
                        Autenticado via Google
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={moveOperatorName}
                      onChange={(e) => setMoveOperatorName(e.target.value)}
                      placeholder="Beto Vasconcelos"
                      style={{ borderColor: '#000000' }}
                      className="w-full bg-slate-950 border border-black rounded-xl px-3.5 py-2.5 text-slate-100 font-extrabold focus:outline-none text-xs shadow-inner"
                    />
                  </div>
                  {!currentUser ? (
                    <div className="bg-slate-950/60 border border-black p-2.5 rounded-xl flex items-center justify-between gap-3 mt-1.5">
                      <p className="text-[10px] sm:text-[10.5px] text-slate-405 leading-normal">
                        Para registrar e assinar movimentações com sua credencial oficial corporativa de operador:
                      </p>
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[9.5px] uppercase tracking-wider px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-[0_2px_8.5px_rgba(245,158,11,0.25)] border border-black"
                      >
                        <User className="w-3.5 h-3.5 stroke-[2.5]" /> Entrar c/ Google
                      </button>
                    </div>
                  ) : (
                    <div className="text-[10.5px] text-slate-400 flex items-center gap-1 pl-1">
                      <span>Identidade de Operador: </span>
                      <strong className="text-slate-300 font-mono font-bold">{currentUser.displayName || currentUser.email}</strong>
                    </div>
                  )}
                </div>
              </div>

               {/* Warnings and messages */}
              {movementType === 'saida' && (() => {
                const depQty = (selectedProductForMovement.batches || []).reduce((sum, b) => sum + b.quantity, 0);
                const sectorSums = productSectorsSums[selectedProductForMovement.id] || { loja: 0, anexo: 0, '3019': 0, totalTransferred: 0 };
                const currentTotal = depQty + sectorSums.totalTransferred;
                const deduct = Math.abs(parseInt(moveQuantity) || 0);
                const projectedTotal = Math.max(0, currentTotal - deduct);

                return (
                  <div className="space-y-2">
                    {/* Painel de Cálculo em Tempo Real */}
                    <div className="bg-emerald-50 border-2 border-emerald-600 rounded-xl p-3 flex items-center justify-between shadow-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-600 block">Estoque Total Atual</span>
                        <span className="text-base sm:text-lg font-black font-mono text-slate-900">{currentTotal} un</span>
                      </div>
                      <div className="text-center font-black text-rose-600 text-xs sm:text-sm px-2">
                        ➔ Baixa de -{deduct} un ➔
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-extrabold text-emerald-800 block">Novo Saldo Total</span>
                        <span className="text-base sm:text-lg font-black font-mono text-emerald-700">{projectedTotal} un</span>
                      </div>
                    </div>

                    <div className="bg-white border-2 border-black p-3 rounded-xl flex items-start gap-2 text-[11px] text-black shadow-sm">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#189300' }} />
                      <div className="text-black">
                        <span
                          className="font-black block mb-0.5 uppercase tracking-wide"
                          style={{ color: '#0078ff' }}
                        >
                          Confirmação de Baixa — Origem: {moveSourceSector === 'loja' ? 'LOJA' : (moveSourceSector === 'deposito' ? 'DEPÓSITO' : moveSourceSector.toUpperCase())}
                        </span>
                        Ao registrar a <strong className="font-black text-black" style={{ backgroundColor: '#ffffff' }}>BAIXA</strong>, a quantidade de <span className="font-black text-black underline">{formatPackaging(deduct, selectedProductForMovement.packaging)}</span> será subtraída e o total passará de <strong className="text-black">{currentTotal}</strong> para <strong className="text-emerald-700">{projectedTotal} {selectedProductForMovement.packaging || 'un'}</strong>.
                      </div>
                    </div>
                  </div>
                );
              })()}

              {movementType === 'transferencia' && (
                <div className="bg-white border-2 border-black p-3 rounded-xl flex items-start gap-2 text-[11px] text-black">
                  <RefreshCw className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#189300' }} />
                  <div className="text-black">
                    <span
                      className="font-black block mb-0.5 uppercase tracking-wide"
                      style={{ color: '#0078ff' }}
                    >
                      Garantia de Transferência entre Setores
                    </span>
                    A quantidade de <span className="font-black text-black underline">{formatPackaging(parseInt(moveQuantity) || 0, selectedProductForMovement.packaging)}</span> {moveBatchId && moveBatchId !== 'sem-lote' ? `será reduzida do LOTE ${moveBatchId.toUpperCase()}` : 'será transferida do estoque geral'} e registrada como enviada para o destino <strong className="font-black text-black uppercase px-1.5 py-0.5 rounded border border-black" style={{ backgroundColor: '#ffffff' }}>{transferDestination ? (transferDestination === '3019' ? 'SETOR 3019' : transferDestination.toUpperCase()) : 'A DEFINIR'}</strong>.
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                style={{ backgroundColor: '#000000' }}
                className="w-full font-black text-xs py-3.5 rounded-xl uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer border-2 border-black text-white hover:opacity-90 shadow-md"
              >
                {movementType === 'entrada' ? (
                  <>
                    <ArrowUpRight className="w-4 h-4 stroke-[3]" style={{ color: '#0aed00' }} />
                    Registrar Entrada de Lote
                  </>
                ) : movementType === 'transferencia' ? (
                  <>
                    <RefreshCw className="w-4 h-4" style={{ color: '#0aed00' }} />
                    Registrar Transferência {transferDestination && `para ${transferDestination.toUpperCase()}`}
                  </>
                ) : (
                  <>
                    <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" style={{ color: '#0aed00' }} />
                    Confirmar Baixa de Estoque
                  </>
                )}
              </button>
            </form>

          </div>
        </div>
      )}

      {/* LIGHTBOX: VER NF EM ALTA DEFINIÇÃO */}
      {selectedNfPhotoForZoom && (
        <div 
          onClick={() => setSelectedNfPhotoForZoom(null)}
          className="fixed inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 z-[60] animate-fade-in"
        >
          {/* Controls bar */}
          <div className="max-w-4xl w-full flex justify-between items-center mb-3 text-slate-200 select-none px-2 z-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="font-extrabold text-xs uppercase tracking-wider text-slate-100">Visualizador de Comprovante de Entrada</p>
                <p className="text-[10px] text-slate-400">Nota Fiscal Digitalizada • BV Atacarejo</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <a 
                href={selectedNfPhotoForZoom} 
                download={`comprovante_nf_${Date.now()}.jpg`}
                className="bg-slate-800 hover:bg-slate-700 text-[10.5px] font-bold text-slate-250 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all text-xs cursor-pointer shadow-lg"
                title="Fazer download da imagem da NF"
              >
                <Download className="w-4 h-4" /> Baixar Imagem
              </a>
              <button 
                onClick={() => setSelectedNfPhotoForZoom(null)}
                className="text-slate-200 hover:text-white p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all border border-slate-700 cursor-pointer"
                title="Fechar visualização"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* High Res Image container */}
          <div className="relative max-w-4xl max-h-[80vh] flex items-center justify-center rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img 
              src={selectedNfPhotoForZoom} 
              alt="Nota Fiscal Ampliada" 
              className="max-w-full max-h-[75vh] object-contain cursor-default"
            />
          </div>
          
          <p className="mt-3 text-[10.5px] text-slate-500 font-mono select-none">
            Toque/Clique fora da imagem ou pressione Esc para retornar ao painel principal.
          </p>
        </div>
      )}

      {/* MODAL: FICHA DETALHADA E LOCALIZAÇÃO DE PRODUTO SCANEADO */}
      {showProductDetailsModal && selectedProductForDetails && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in text-left">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl transition-all">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-505/10 border border-sky-500/20 text-sky-400 rounded-xl">
                  <Search className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-xs uppercase tracking-widest text-[#0ea5e9]">
                    Ficha Técnica: {selectedProductForDetails.name}
                  </h3>
                  <p className="text-[10px] text-slate-500">Documento do item comercial cadastrado e lotes no sistema</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowProductDetailsModal(false);
                  setSelectedProductForDetails(null);
                  setScannedExistingAlert(null); // Clear scanning alert!
                  setIsEditingBarcode(false);
                  setTempBarcode('');
                  setIsEditingCategory(false);
                  setTempCategory('');
                  setTempSubcategory('');
                  setIsEditingPackaging(false);
                  setTempPackaging('');
                }}
                className="text-slate-200 hover:text-white p-2 bg-slate-800 hover:bg-slate-700/85 rounded-xl transition-all border border-slate-700 cursor-pointer text-xs font-bold font-mono"
                title="Fechar ficha"
              >
                Fechar
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* DESTAQUE PRINCIPAL: NOME DO ITEM COMERCIAL CADASTRADO */}
              <div
                className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left"
                style={{ color: '#023da2' }}
              >
                <span
                  className="text-[10px] uppercase font-mono font-extrabold block tracking-wider"
                  style={{ color: '#000000' }}
                >
                  Nome do Item Comercial Cadastrado:
                </span>
                <h2
                  className="font-sans font-black text-lg sm:text-xl uppercase tracking-tight leading-snug mt-1"
                  style={{ color: '#019100' }}
                >
                  {selectedProductForDetails.name}
                </h2>
                {selectedProductForDetails.brand && (
                  <p className="text-xs text-slate-400 mt-1">
                    Fabricante / Indústria: <strong className="text-slate-200">{selectedProductForDetails.brand}</strong>
                  </p>
                )}
              </div>
              
              {/* ALERTA DE PRODUTO SCANEADO QUE JÁ TEM CADASTRO NO SISTEMA */}
              {scannedExistingAlert && scannedExistingAlert.barcode === selectedProductForDetails.barcode && (
                <div className="bg-amber-500/10 border border-amber-500/35 p-3.5 rounded-xl flex items-start gap-3 text-xs text-amber-205">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1 text-left">
                    <p className="font-extrabold text-amber-300 uppercase tracking-wider text-[10.5px]">
                      ⚠️ Produto já cadastrado no sistema!
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed font-sans font-medium">
                      O produto <strong className="text-slate-100 font-extrabold">"{selectedProductForDetails.name}"</strong> (Código de Barras: <strong className="font-mono text-amber-400 font-bold">{selectedProductForDetails.barcode}</strong>) já possui um cadastro de estoque ativo e consolidado no BV Atacarejo.
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Exibindo sua ficha técnica rápida com os lotes e posicionamento físico abaixo para a sua conferência.
                    </p>
                  </div>
                  <button 
                    onClick={() => setScannedExistingAlert(null)}
                    className="text-slate-400 hover:text-slate-200 font-bold text-[9px] font-mono cursor-pointer bg-slate-950 border border-slate-800 hover:bg-slate-850 px-2 py-1 rounded transition-all shrink-0 self-center"
                  >
                    Entendido
                  </button>
                </div>
              )}
              
              {/* Product Profile Top Card */}
              <div
                className="flex flex-col sm:flex-row gap-5 p-4 rounded-xl border-[3px] border-[#000000] bg-slate-950/40"
                style={{ borderWidth: '3px', borderColor: '#000000' }}
              >
                <div className="flex flex-col items-center gap-2 shrink-0">
                  {selectedProductForDetails.image ? (
                    <div className="w-24 h-24 sm:w-28 sm:h-28 mx-auto sm:mx-0 flex items-center justify-center p-2 rounded-xl bg-slate-950 border border-slate-850 overflow-hidden shrink-0">
                      <img 
                        src={selectedProductForDetails.image} 
                        alt={selectedProductForDetails.name} 
                        referrerPolicy="no-referrer"
                        className="h-full max-w-full object-contain hover:scale-105 transition-transform"
                      />
                    </div>
                  ) : (
                    <div className="w-24 h-24 sm:w-28 sm:h-28 mx-auto sm:mx-0 flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950 border border-slate-850 text-slate-600 shrink-0 select-none">
                      <Package className="w-10 h-10 stroke-[1.25]" />
                      <span className="text-[8.5px] uppercase font-mono mt-1">Sem Imagem</span>
                    </div>
                  )}
                  
                  {/* Tirar / Trocar Foto do Produto */}
                  <label className="text-[9px] font-extrabold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-500/25 cursor-pointer flex items-center gap-1 transition-all">
                    <Camera className="w-3 h-3" />
                    {selectedProductForDetails.image ? 'Trocar Foto' : 'Tirar Foto'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleDetailProductImageUpload(e, selectedProductForDetails.id)}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isEditingBarcode ? (
                      <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <input
                          type="text"
                          value={tempBarcode}
                          onChange={(e) => setTempBarcode(e.target.value)}
                          className="bg-transparent text-[11px] font-mono text-amber-500 font-bold w-36 px-2 py-0.5 focus:outline-none"
                          placeholder="Novo código"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateBarcode(selectedProductForDetails.id, tempBarcode);
                            } else if (e.key === 'Escape') {
                              setIsEditingBarcode(false);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateBarcode(selectedProductForDetails.id, tempBarcode)}
                          className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 p-1 rounded-lg border border-emerald-500/20 cursor-pointer"
                          title="Salvar Código de Barras"
                        >
                          <Check className="w-3 h-3 stroke-[2.5]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingBarcode(false);
                            setTempBarcode('');
                          }}
                          className="bg-rose-500/20 text-rose-450 hover:bg-rose-500/30 p-1 rounded-lg border border-rose-500/20 cursor-pointer"
                          title="Cancelar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-mono font-black uppercase tracking-wider px-2.5 py-0.5 rounded border ${
                            selectedProductForDetails.barcode
                              ? 'bg-slate-850 border-slate-750'
                              : 'bg-slate-900 border-slate-800'
                          }`}
                          style={{ color: '#767700' }}
                        >
                          {selectedProductForDetails.barcode || 'Sem Código de Barras'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingBarcode(true);
                            setTempBarcode(selectedProductForDetails.barcode || '');
                          }}
                          className="text-[9px] font-extrabold text-[#0ea5e9] bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/20 px-2 py-0.5 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                          title="Editar ou Definir Código de Barras"
                        >
                          <Edit2 className="w-2.5 h-2.5" />
                          <span>{selectedProductForDetails.barcode ? 'Alterar' : '+ Adicionar Código'}</span>
                        </button>
                      </div>
                    )}
                    {isEditingCategory ? (
                      <div className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-300 w-full sm:w-auto shadow-sm">
                        <div className="flex flex-col gap-1 text-left">
                          <label className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">Categoria</label>
                          <select
                            value={tempCategory}
                            onChange={(e) => {
                              const selectedName = e.target.value;
                              setTempCategory(selectedName);
                              const matchCat = categories.find(c => c.name === selectedName);
                              if (matchCat && matchCat.subcategories.length > 0) {
                                setTempSubcategory(matchCat.subcategories[0]);
                              } else {
                                setTempSubcategory('');
                              }
                            }}
                            className="bg-white border border-slate-300 text-xs font-bold rounded-lg px-2 py-1.5 text-slate-900 focus:outline-none focus:border-emerald-600 cursor-pointer"
                          >
                            {tempCategory && !categories.some(c => c.name === tempCategory) && (
                              <option value={tempCategory}>{tempCategory}</option>
                            )}
                            {[...categories]
                              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
                              .map((cat) => (
                                <option key={cat.id} value={cat.name}>
                                  {cat.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1 text-left">
                          <label className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">Subcategoria</label>
                          <select
                            value={tempSubcategory}
                            onChange={(e) => setTempSubcategory(e.target.value)}
                            className="bg-white border border-slate-300 text-xs font-bold rounded-lg px-2 py-1.5 text-slate-900 focus:outline-none focus:border-emerald-600 cursor-pointer"
                          >
                            <option value="">Sem subcategoria</option>
                            {tempSubcategory &&
                              !(categories.find(c => c.name === tempCategory)?.subcategories || []).includes(tempSubcategory) && (
                                <option value={tempSubcategory}>{tempSubcategory}</option>
                              )}
                            {[...(categories.find((c) => c.name === tempCategory)?.subcategories || [])]
                              .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
                              .map((sub, idx) => (
                                <option key={idx} value={sub}>
                                  {sub}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5 self-end">
                          <button
                            type="button"
                            onClick={() => handleUpdateProductCategory(selectedProductForDetails.id, tempCategory, tempSubcategory)}
                            className="bg-emerald-600 text-white hover:bg-emerald-700 p-1.5 rounded-lg border border-emerald-700 cursor-pointer"
                            title="Salvar Categoria e Subcategoria"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingCategory(false);
                            }}
                            className="bg-rose-100 text-rose-700 hover:bg-rose-200 p-1.5 rounded-lg border border-rose-300 cursor-pointer"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase font-mono ${getCategoryBadgeClass(selectedProductForDetails.category)}`}
                          style={{ color: '#1956b3' }}
                        >
                          {selectedProductForDetails.category}
                        </span>
                        {selectedProductForDetails.subcategory && (
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase font-mono bg-slate-800 border border-slate-700 text-slate-300`}>
                            {selectedProductForDetails.subcategory}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingCategory(true);
                            setTempCategory(selectedProductForDetails.category || (categories[0]?.name || ''));
                            setTempSubcategory(selectedProductForDetails.subcategory || '');
                          }}
                          className="text-[9px] font-extrabold text-[#0ea5e9] bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/20 px-2 py-0.5 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                          title="Alterar Categoria do Produto"
                        >
                          <Edit2 className="w-2.5 h-2.5" /> Alterar Categoria
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-1">
                    <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-slate-400 block">
                      Nome do Item Comercial (Cadastrado)
                    </span>
                    <h2 className="font-sans font-black text-sm sm:text-base text-slate-100 uppercase tracking-tight leading-snug">
                      {selectedProductForDetails.name}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] pt-2 border-t border-slate-900">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[9px] uppercase tracking-wider font-mono flex items-center gap-1">
                          <Factory className="w-3 h-3 text-emerald-400" /> Fabricante / Indústria
                        </span>
                        {!isEditingBrand && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingBrand(true);
                              setTempBrand(selectedProductForDetails.brand || '');
                            }}
                            className="text-[9px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer transition-colors"
                            title="Editar Fabricante / Marca"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                            <span>Alterar</span>
                          </button>
                        )}
                      </div>

                      {isEditingBrand ? (
                        <div className="flex items-center gap-1.5 mt-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                          <input
                            type="text"
                            list="detail-fabricante-list"
                            value={tempBrand}
                            onChange={(e) => setTempBrand(e.target.value)}
                            placeholder="Nome do Fabricante..."
                            className="bg-transparent text-xs text-slate-200 font-bold w-full px-1.5 py-0.5 focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdateProductBrand(selectedProductForDetails.id, tempBrand);
                              } else if (e.key === 'Escape') {
                                setIsEditingBrand(false);
                              }
                            }}
                          />
                          <datalist id="detail-fabricante-list">
                            {allBrandsList.map(b => (
                              <option key={b} value={b} />
                            ))}
                          </datalist>
                          <button
                            type="button"
                            onClick={() => handleUpdateProductBrand(selectedProductForDetails.id, tempBrand)}
                            className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 p-1 rounded-lg border border-emerald-500/20 cursor-pointer"
                            title="Salvar Fabricante"
                          >
                            <Check className="w-3 h-3 stroke-[2.5]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingBrand(false)}
                            className="bg-rose-500/20 text-rose-450 hover:bg-rose-500/30 p-1 rounded-lg border border-rose-500/20 cursor-pointer"
                            title="Cancelar"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-slate-200 uppercase font-black text-xs">
                            {selectedProductForDetails.brand || 'Não Informado'}
                          </strong>
                          {selectedProductForDetails.brand && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowProductDetailsModal(false);
                                setSelectedBrand(selectedProductForDetails.brand || '');
                                setInventoryGrouping('fabricante');
                                setActiveTab('estoque');
                              }}
                              className="text-[9px] font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 cursor-pointer transition-all"
                              style={{ color: '#027753' }}
                              title="Filtrar estoque por este fabricante"
                            >
                              Filtrar Marca
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-mono">Conteúdo / Peso</span>
                      <strong className="text-slate-300 uppercase font-bold">{selectedProductForDetails.weightVolume || 'Não Informado'}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bento Grid layouts */}
              {(() => {
                const sectorSums = productSectorsSums[selectedProductForDetails.id] || { loja: 0, anexo: 0, '3019': 0, totalTransferred: 0 };
                const totalQty = selectedProductForDetails.batches.reduce((sum, b) => sum + b.quantity, 0) + sectorSums.totalTransferred;
                const isUnderMinStock = totalQty < selectedProductForDetails.minStock;
                
                // Expiry calculation
                const expiredLots = selectedProductForDetails.batches.filter(b => b.date && b.date.trim() !== '' && getDaysRemaining(b.date) < 0);
                const criticalLots = selectedProductForDetails.batches.filter(b => {
                  if (!b.date || !b.date.trim()) return false;
                  const d = getDaysRemaining(b.date);
                  return d >= 0 && d <= 30;
                });
                const noDateLots = selectedProductForDetails.batches.filter(b => !b.date || !b.date.trim());

                return (
                  <>
                    {/* Stock KPI Boxes */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      
                      {/* Box 1: Stock Total */}
                      <div className="bg-slate-955/50 border border-slate-800 p-4 rounded-xl text-left flex flex-col justify-between" style={{ borderColor: '#000000' }}>
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block font-bold">Estoque Total</span>
                        <div className="my-2 flex items-baseline gap-1.5">
                          <span className={`text-2xl font-black ${totalQty === 0 ? 'text-red-500 font-extrabold' : 'text-slate-100'}`}>
                            {totalQty}
                          </span>
                          <span className="text-slate-400 text-xs font-semibold lowercase">
                            {formatPackaging(totalQty, selectedProductForDetails.packaging)}
                          </span>
                        </div>
                        {isUnderMinStock ? (
                          <span className="text-[8.5px] font-sans font-black uppercase text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded leading-none border border-amber-500/20 max-w-fit flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" /> Crítico • Sob o mínimo ({selectedProductForDetails.minStock})
                          </span>
                        ) : (
                          <span className="text-[8.5px] font-sans font-black uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded leading-none border border-emerald-500/20 max-w-fit flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 shrink-0" /> Meta atingida ({selectedProductForDetails.minStock})
                          </span>
                        )}
                      </div>

                      {/* Box 2: Expiry Alerts */}
                      <div className="bg-slate-955/50 border border-slate-800 p-4 rounded-xl text-left flex flex-col justify-between" style={{ borderColor: '#000000' }}>
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block font-bold">Alertas de Validade</span>
                        <div className="my-2.5 flex flex-col gap-0.5">
                          {expiredLots.length > 0 && (
                            <p className="text-[11px] font-black font-sans flex items-center gap-1" style={{ color: '#767700' }}>
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                              {expiredLots.length} {expiredLots.length === 1 ? 'Lote Vencido' : 'Lotes Vencidos'}!
                            </p>
                          )}
                          {criticalLots.length > 0 && (
                            <p
                              className="text-[11px] font-black font-sans flex items-center gap-1"
                              style={expiredLots.length === 0 ? { color: '#767700' } : undefined}
                            >
                              <span className="w-2 h-2 rounded-full bg-amber-405 shrink-0" />
                              {criticalLots.length} {criticalLots.length === 1 ? 'Lote Crítico' : 'Lotes Críticos'}
                            </p>
                          )}
                          {noDateLots.length > 0 && expiredLots.length === 0 && criticalLots.length === 0 && (
                            <p className="text-[11px] font-bold font-sans flex items-center gap-1" style={{ color: '#767700' }}>
                              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                              {noDateLots.length === 1 ? '1 lote sem validade definida' : `${noDateLots.length} lotes sem validade`}
                            </p>
                          )}
                          {expiredLots.length === 0 && criticalLots.length === 0 && noDateLots.length === 0 && (
                            <p className="text-xs font-bold font-sans flex items-center gap-1" style={{ color: '#767700' }}>
                              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                              Validades Normais
                            </p>
                          )}
                        </div>
                        <span className="text-[8.5px] text-slate-550 uppercase font-mono block">
                          Segurança Alimentar
                        </span>
                      </div>

                      {/* Box 3: Packaging Style */}
                      <div className="bg-slate-955/50 border border-slate-800 p-4 rounded-xl text-left flex flex-col justify-between min-h-[120px]" style={{ borderColor: '#000000' }}>
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block font-bold">Modo de Embalagem</span>
                          {!isEditingPackaging && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingPackaging(true);
                                setTempPackaging(selectedProductForDetails.packaging || 'Unidade');
                              }}
                              className="text-[9px] font-extrabold text-[#0ea5e9] hover:underline flex items-center gap-1 cursor-pointer"
                              title="Alterar modo de embalagem"
                            >
                              <Edit2 className="w-2.5 h-2.5" /> Editar
                            </button>
                          )}
                        </div>
                        
                        <div className="my-2 flex flex-col w-full">
                          {isEditingPackaging ? (
                            <div className="flex items-center gap-1.5 w-full mt-1">
                              <input
                                type="text"
                                list="packaging-list"
                                value={tempPackaging}
                                onChange={(e) => setTempPackaging(e.target.value)}
                                className="flex-1 bg-slate-900 border border-slate-800 text-xs font-semibold rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 min-w-0"
                                placeholder="unidade, caixa, fardo..."
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateProductPackaging(selectedProductForDetails.id, tempPackaging)}
                                className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 p-1 rounded-lg border border-emerald-500/20 cursor-pointer shrink-0"
                                title="Salvar Embalagem"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsEditingPackaging(false)}
                                className="bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 p-1 rounded-lg border border-rose-500/20 cursor-pointer shrink-0"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs font-black text-slate-300 uppercase truncate">
                                {selectedProductForDetails.packaging || 'Unidades'}
                              </p>
                              <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                                Fração padrão usada no checkout.
                              </p>
                            </>
                          )}
                        </div>
                        <span className="text-[8.5px] text-slate-550 uppercase font-mono block">
                          Unidade de Medida
                        </span>
                      </div>

                    </div>

                    {/* Active Batches */}
                    <div className="space-y-2 text-left">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <span className="text-[10px] uppercase font-mono font-black text-slate-350 tracking-wider">
                          Lotes Ativos em Estoque ({selectedProductForDetails.batches.length})
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddNewBatchForm(!showAddNewBatchForm);
                              setNewBatchFormDate('');
                              setNewBatchFormQty('10');
                              setNewBatchFormId(`L-${Date.now().toString().slice(-4)}`);
                            }}
                            className="text-[9.5px] font-extrabold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 px-2.5 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1 font-mono uppercase"
                          >
                            <Plus className="w-3 h-3 stroke-[2.5]" />
                            {showAddNewBatchForm ? 'Fechar Formulário' : '+ Adicionar Lote / Validade'}
                          </button>
                        </div>
                      </div>

                      {/* Add New Batch Form Collapsible */}
                      {showAddNewBatchForm && (
                        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-slate-950/80 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-emerald-400 font-mono uppercase flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" /> Novo Lote com Validade
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowAddNewBatchForm(false)}
                              className="text-slate-400 hover:text-rose-400 text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="text-[9px] uppercase font-mono text-slate-400 block font-bold mb-1">ID do Lote</label>
                              <input
                                type="text"
                                value={newBatchFormId}
                                onChange={(e) => setNewBatchFormId(e.target.value)}
                                placeholder="Ex: L26-05"
                                className="w-full bg-slate-900 border border-slate-750 text-xs font-mono rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] uppercase font-mono text-slate-400 block font-bold mb-1">Data de Validade</label>
                              <input
                                type="date"
                                value={newBatchFormDate}
                                onChange={(e) => setNewBatchFormDate(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-750 text-xs font-mono rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] uppercase font-mono text-slate-400 block font-bold mb-1">Quantidade</label>
                              <div className="flex gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  value={newBatchFormQty}
                                  onChange={(e) => setNewBatchFormQty(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-750 text-xs font-mono rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddBatchToProduct(
                                    selectedProductForDetails.id,
                                    newBatchFormDate,
                                    parseInt(newBatchFormQty) || 0,
                                    newBatchFormId
                                  )}
                                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] px-3 py-1.5 rounded-lg cursor-pointer uppercase transition-all whitespace-nowrap"
                                >
                                  Salvar
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {selectedProductForDetails.batches.length === 0 ? (
                        <div className="bg-slate-950 border border-slate-850 rounded-xl p-6 text-center text-slate-500 text-xs font-medium space-y-2.5" style={{ borderColor: '#000000' }}>
                          <p>Nenhum lote ativo em estoque. Produto cadastrado sem lote inicial ou estoque zerado.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddNewBatchForm(true);
                              setNewBatchFormDate('');
                              setNewBatchFormQty('10');
                              setNewBatchFormId(`L-${Date.now().toString().slice(-4)}`);
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-xl cursor-pointer transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" /> Definir Validade / Cadastrar Lote
                          </button>
                        </div>
                      ) : (
                        <div className="bg-slate-950 border border-slate-850 rounded-xl divide-y divide-slate-850 overflow-hidden font-mono text-xs" style={{ borderColor: '#000000' }}>
                          {selectedProductForDetails.batches.map((b) => {
                            const hasDate = Boolean(b.date && b.date.trim());
                            const days = hasDate ? getDaysRemaining(b.date) : 9999;
                            const isExpired = hasDate && days < 0;
                            const isCritical = hasDate && days >= 0 && days <= 30;

                            let dateStyle = 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10';
                            let statusText = hasDate ? `Vence em ${days} dias` : 'Sem validade definida';

                            if (isExpired) {
                              dateStyle = 'text-rose-500 bg-rose-500/10 border-rose-500/20 font-bold';
                              statusText = `VENCIDO HÁ ${Math.abs(days)} DIAS!!`;
                            } else if (isCritical) {
                              dateStyle = 'text-amber-500 bg-amber-500/10 border-amber-500/20 font-bold';
                              statusText = days === 0 ? 'Vence HOJE!' : `Vence em ${days} dias! Atenção`;
                            }

                            const isEditingThisBatch = editingBatchDateId === b.id;

                            return (
                              <div key={b.id} className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                <div className="space-y-1">
                                  <p className="font-extrabold uppercase tracking-wide" style={{ color: '#010101' }}>
                                    LOTE: {b.id.toUpperCase()}
                                  </p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[9px] text-slate-500 font-bold">Validade:</span>
                                    {isEditingThisBatch ? (
                                      <div className="inline-flex items-center gap-1.5 bg-slate-900 border border-emerald-500/40 rounded-lg p-1">
                                        <input
                                          type="date"
                                          value={tempBatchEditDate}
                                          onChange={(e) => setTempBatchEditDate(e.target.value)}
                                          className="bg-transparent text-[11px] font-mono text-slate-200 px-1 py-0.5 focus:outline-none cursor-pointer"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateBatchDate(selectedProductForDetails.id, b.id, tempBatchEditDate)}
                                          className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 p-1 rounded border border-emerald-500/20 cursor-pointer"
                                          title="Salvar Data de Validade"
                                        >
                                          <Check className="w-3 h-3 stroke-[2.5]" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingBatchDateId(null);
                                            setTempBatchEditDate('');
                                          }}
                                          className="bg-rose-500/20 text-rose-450 hover:bg-rose-500/30 p-1 rounded border border-rose-500/20 cursor-pointer"
                                          title="Cancelar"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="inline-flex items-center gap-1.5">
                                        {hasDate ? (
                                          <span 
                                            className={`text-[10px] font-bold px-1.5 rounded border leading-none py-0.5 ${dateStyle}`}
                                            style={{ color: '#3b7d14' }}
                                          >
                                            {b.date.split('-').reverse().join('/')}
                                          </span>
                                        ) : (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border leading-none bg-slate-900 text-amber-400 border-amber-500/20">
                                            Não definida
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingBatchDateId(b.id);
                                            setTempBatchEditDate(b.date || '');
                                          }}
                                          className="text-[9px] font-bold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-pointer transition-all"
                                          title="Definir ou alterar data de validade deste lote"
                                        >
                                          <Edit2 className="w-2.5 h-2.5" />
                                          <span>{hasDate ? 'Alterar' : '+ Definir Validade'}</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="text-right sm:text-right flex sm:flex-col justify-between sm:justify-start items-center sm:items-end">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-slate-500">Saldo:</span>
                                    <span className="text-sm font-black text-slate-100">{b.quantity}</span>
                                    <span className="text-[9px] text-slate-500 font-sans lowercase">
                                      {formatPackaging(b.quantity, selectedProductForDetails.packaging)}
                                    </span>
                                  </div>
                                  <p 
                                    className={`text-[9.5px] font-bold sm:mt-1 uppercase tracking-tight ${
                                      isExpired ? 'text-rose-500 animate-pulse' : isCritical ? 'text-amber-500' : hasDate ? 'text-slate-500' : 'text-slate-400'
                                    }`}
                                    style={isExpired ? { color: '#f20000' } : isCritical ? { color: '#d97706' } : undefined}
                                  >
                                    {statusText}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Operational Trigger row for fast edits */}
                    <div className="border-t border-slate-800 pt-4 flex flex-wrap gap-2" style={{ borderColor: '#000000' }}>
                      <button
                        onClick={() => {
                          setShowProductDetailsModal(false);
                          handleOpenMovement(selectedProductForDetails, 'entrada');
                        }}
                        className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-[10px] sm:text-[10.5px] uppercase tracking-wider px-3.5 py-3 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 flex-1 whitespace-nowrap font-sans border"
                        style={{ borderColor: '#000000' }}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                        Dar Entrada (+)
                      </button>
                      
                      <button
                        disabled={totalQty === 0}
                        onClick={() => {
                          setShowProductDetailsModal(false);
                          handleOpenMovement(selectedProductForDetails, 'saida');
                        }}
                        className={`font-black text-[10px] sm:text-[10.5px] uppercase tracking-wider px-3.5 py-3 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 flex-1 whitespace-nowrap font-sans border ${
                          totalQty === 0
                            ? 'bg-slate-800 text-slate-500 border-slate-750 cursor-not-allowed opacity-50'
                            : 'active:scale-95'
                        }`}
                        style={{ borderColor: '#000000', backgroundColor: '#080808', color: '#ffffff' }}
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5 stroke-[2.5]" style={{ color: '#c30909' }} />
                        Registrar Saída (-)
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(selectedProductForDetails)}
                        className="font-black text-[10.5px] uppercase tracking-wider px-3.5 py-3 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 whitespace-nowrap font-sans border border-rose-600 bg-rose-600 hover:bg-rose-700 text-white active:scale-95"
                        title="Excluir este item cadastrado do sistema"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir Item
                      </button>
                    </div>

                  </>
                );
              })()}

            </div>

          </div>
        </div>
      )}

      {/* SUCCESS TOAST: CONFIRMAÇÃO DE SALVAMENTO DE PRODUTO */}
      <AnimatePresence>
        {productSavedSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] max-w-md w-11/12 text-left shadow-2xl"
          >
            <div className="bg-slate-900/98 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-4 sm:p-5 flex gap-4 items-start relative overflow-hidden shadow-[0_12px_40px_rgba(16,185,129,0.18)]">
              {/* Shine effect overlay */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500" />
              
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl shrink-0 self-center">
                <CheckCircle className="w-5.5 h-5.5 animate-bounce stroke-[2.5]" />
              </div>
              
              <div className="flex-1 space-y-1 sm:space-y-1.5 select-none">
                <span className="text-[9.5px] font-mono leading-none tracking-widest font-black text-emerald-400 uppercase block">
                  PRODUTO SALVO COM SUCESSO!
                </span>
                
                <h4 className="text-xs sm:text-sm font-black text-slate-50 uppercase tracking-tight line-clamp-2 leading-snug">
                  {productSavedSuccess.name}
                </h4>
                
                <div className="flex flex-wrap items-center gap-1.5 text-[9.5px]">
                  <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 font-mono text-slate-400">
                    {productSavedSuccess.barcode ? `EAN: ${productSavedSuccess.barcode}` : 'Sem Código de Barras'}
                  </span>
                  <span className="bg-emerald-500/5 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/15 font-sans font-bold capitalize">
                    {productSavedSuccess.category}
                  </span>
                </div>
                
                <div className="flex gap-2 pt-2.5">
                  <button
                    onClick={() => {
                      setSelectedProductForDetails(productSavedSuccess);
                      setShowProductDetailsModal(true);
                      setProductSavedSuccess(null);
                    }}
                    className="flex-1 py-2 px-3 text-[10.5px] font-black font-sans bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md uppercase tracking-wider"
                  >
                    <Search className="w-3.5 h-3.5 stroke-[2.5]" />
                    Ver Ficha
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(productSavedSuccess)}
                    className="py-2 px-3 text-[10.5px] font-black font-sans bg-rose-600/90 hover:bg-rose-600 text-white rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer uppercase tracking-wider"
                    title="Excluir item caso tenha sido adicionado errado"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir
                  </button>
                  <button
                    onClick={() => setProductSavedSuccess(null)}
                    className="py-2 px-3.5 text-[10.5px] font-bold font-sans bg-slate-950 hover:bg-slate-800 text-slate-350 hover:text-slate-100 rounded-xl transition-all border border-slate-800 hover:border-slate-705 cursor-pointer uppercase tracking-wider"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOAST DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <AnimatePresence>
        {deleteSuccessMessage && (
          <motion.div
            initial={{ opacity: 0, y: 25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] max-w-md w-11/12"
          >
            <div className="bg-slate-900 text-white border border-rose-500/40 rounded-2xl px-4 py-3 shadow-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs font-bold">
                <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{deleteSuccessMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setDeleteSuccessMessage(null)}
                className="text-slate-400 hover:text-white cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL IN-APP DE CONFIRMAÇÃO DE EXCLUSÃO DE ITEM(NS) */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[120] flex items-center justify-center p-4">
          <div className="bg-white border-2 border-rose-500 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden text-left animate-fade-in">
            <div className="bg-rose-50 border-b border-rose-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-600 text-white">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-rose-950 uppercase tracking-wide">
                  {deleteConfirmModal.title}
                </h3>
              </div>
              <button
                type="button"
                disabled={isDeletingProducts}
                onClick={() => setDeleteConfirmModal(null)}
                className="text-slate-500 hover:text-slate-800 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs sm:text-sm text-slate-700 font-medium leading-relaxed">
                {deleteConfirmModal.description}
              </p>

              {deleteConfirmModal.products.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5">
                  {deleteConfirmModal.products.slice(0, 10).map(prod => {
                    const qty = prod.batches.reduce((sum, b) => sum + b.quantity, 0) + (productSectorsSums[prod.id]?.totalTransferred || 0);
                    return (
                      <div key={prod.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-900 truncate">{prod.name}</span>
                        <span className="font-mono text-[11px] text-slate-600 shrink-0">
                          {qty} {formatOnlyPackagingSingularPlural(qty, prod.packaging || 'un')}
                        </span>
                      </div>
                    );
                  })}
                  {deleteConfirmModal.products.length > 10 && (
                    <p className="text-[11px] text-slate-500 font-semibold pt-1">
                      ... e mais {deleteConfirmModal.products.length - 10} item(ns).
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeletingProducts}
                  onClick={() => setDeleteConfirmModal(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeletingProducts}
                  onClick={executeConfirmedDelete}
                  className="px-4 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {isDeletingProducts ? (
                    <>
                      <Loader className="w-3.5 h-3.5 animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirmar Exclusão</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST DE CONFIRMAÇÃO DE CATEGORIA ATUALIZADA */}
      <AnimatePresence>
        {categorySuccessMessage && (
          <motion.div
            initial={{ opacity: 0, y: 25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] max-w-md w-11/12"
          >
            <div className="bg-emerald-950 text-white border border-emerald-500/50 rounded-2xl px-4 py-3 shadow-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs font-bold">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{categorySuccessMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setCategorySuccessMessage(null)}
                className="text-emerald-300 hover:text-white cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: ALTERAR CATEGORIA E SUBCATEGORIA DO PRODUTO CADASTRADO */}
      {categoryEditProduct && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[120] flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border-2 border-slate-900 rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto overscroll-contain shadow-2xl text-left animate-fade-in">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500 text-slate-950">
                  <Layers className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide">
                    Alterar Categoria e Subcategoria
                  </h3>
                  <p className="text-[10px] text-slate-300 font-mono truncate max-w-[260px]">
                    {categoryEditProduct.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingCategoryEdit}
                onClick={() => setCategoryEditProduct(null)}
                className="text-slate-300 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const finalCat = isCreatingCatInModal ? modalNewCategoryInput.trim() : modalEditCategory.trim();
                const finalSub = isCreatingSubInModal ? modalNewSubcategoryInput.trim() : modalEditSubcategory.trim();
                if (!finalCat) return;
                setIsSavingCategoryEdit(true);
                try {
                  await handleUpdateProductCategory(categoryEditProduct.id, finalCat, finalSub);
                } finally {
                  setIsSavingCategoryEdit(false);
                }
              }}
              className="p-5 space-y-4"
            >
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                <span className="text-[10px] font-mono uppercase font-bold text-slate-500 block">
                  Classificação Atual
                </span>
                <p className="font-bold text-slate-900">
                  {categoryEditProduct.category || 'Sem categoria'}
                  {categoryEditProduct.subcategory ? ` › ${categoryEditProduct.subcategory}` : ''}
                </p>
              </div>

              {/* Categoria */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    Categoria *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingCatInModal(prev => !prev);
                      setModalNewCategoryInput('');
                      if (!isCreatingCatInModal) {
                        setIsCreatingSubInModal(false);
                        setModalEditSubcategory('');
                      }
                    }}
                    className="text-[11px] font-bold text-sky-700 hover:text-sky-800 cursor-pointer"
                  >
                    {isCreatingCatInModal ? 'Selecionar Existente' : '+ Nova Categoria'}
                  </button>
                </div>

                {isCreatingCatInModal ? (
                  <input
                    type="text"
                    required
                    autoFocus
                    value={modalNewCategoryInput}
                    onChange={(e) => setModalNewCategoryInput(e.target.value)}
                    placeholder="Digite o nome da nova categoria"
                    className="w-full bg-white border-2 border-slate-900 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none"
                  />
                ) : (
                  <select
                    required
                    value={modalEditCategory}
                    onChange={(e) => {
                      const chosen = e.target.value;
                      setModalEditCategory(chosen);
                      const matchCat = categories.find(c => c.name === chosen);
                      if (matchCat && matchCat.subcategories.length > 0) {
                        setModalEditSubcategory(matchCat.subcategories[0]);
                      } else {
                        setModalEditSubcategory('');
                      }
                      setIsCreatingSubInModal(false);
                    }}
                    className="w-full bg-white border-2 border-slate-900 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                  >
                    {modalEditCategory && !categories.some(c => c.name === modalEditCategory) && (
                      <option value={modalEditCategory}>{modalEditCategory}</option>
                    )}
                    {[...categories]
                      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
                      .map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>

              {/* Subcategoria */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    Subcategoria
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingSubInModal(prev => !prev);
                      setModalNewSubcategoryInput('');
                    }}
                    className="text-[11px] font-bold text-sky-700 hover:text-sky-800 cursor-pointer"
                  >
                    {isCreatingSubInModal ? 'Selecionar Existente' : '+ Nova Subcategoria'}
                  </button>
                </div>

                {isCreatingSubInModal ? (
                  <input
                    type="text"
                    value={modalNewSubcategoryInput}
                    onChange={(e) => setModalNewSubcategoryInput(e.target.value)}
                    placeholder="Digite o nome da nova subcategoria (ou deixe vazio)"
                    className="w-full bg-white border-2 border-slate-900 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none"
                  />
                ) : (
                  <select
                    value={modalEditSubcategory}
                    onChange={(e) => setModalEditSubcategory(e.target.value)}
                    className="w-full bg-white border-2 border-slate-900 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                  >
                    <option value="">Sem subcategoria</option>
                    {modalEditSubcategory &&
                      !(categories.find(c => c.name === modalEditCategory)?.subcategories || []).includes(modalEditSubcategory) && (
                        <option value={modalEditSubcategory}>{modalEditSubcategory}</option>
                      )}
                    {[...(categories.find(c => c.name === modalEditCategory)?.subcategories || [])]
                      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
                      .map((sub, idx) => (
                        <option key={idx} value={sub}>
                          {sub}
                        </option>
                      ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingCategoryEdit}
                  onClick={() => setCategoryEditProduct(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategoryEdit}
                  className="px-4 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {isSavingCategoryEdit ? (
                    <>
                      <Loader className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Salvar Alteração</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK IMPORT MODAL (EXCEL & CSV CADASTRO EM MASSA) */}
      <BulkImportModal
        isOpen={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        existingProducts={products}
        categories={categories}
        allBrandsList={allBrandsList}
        currentUser={currentUser}
        onConfirmImport={handleBulkImportConfirmed}
      />

    </div>
  );
}
