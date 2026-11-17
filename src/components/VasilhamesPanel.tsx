import React, { useState, useMemo } from 'react';
import { 
  Boxes, Truck, RefreshCw, AlertTriangle, CheckCircle, 
  Plus, Search, ArrowUpRight, ArrowDownLeft, Trash2, 
  Calendar, FileText, Download, ShieldAlert, 
  HelpCircle, Sparkles, Filter, X, Check, Eye, AlertOctagon,
  Share2, ArrowLeftRight, Clock, Award
} from 'lucide-react';
import { VasilhameItem, VasilhameTransaction, CiaVasilhame, TipoMovimentacaoVasilhame } from '../types';

interface VasilhamesPanelProps {
  vasilhames: VasilhameItem[];
  transactions: VasilhameTransaction[];
  onUpdateVasilhames: (updated: VasilhameItem[]) => Promise<void>;
  onAddTransaction: (tx: Omit<VasilhameTransaction, 'id' | 'data'>) => Promise<void>;
  operatorName: string;
  isCosmic?: boolean;
}

export default function VasilhamesPanel({
  vasilhames,
  transactions,
  onUpdateVasilhames,
  onAddTransaction,
  operatorName,
  isCosmic = false
}: VasilhamesPanelProps) {
  // Filters & State
  const [selectedCia, setSelectedCia] = useState<'todos' | CiaVasilhame>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'ativos' | 'historico' | 'contagem'>('ativos');

  // Modal State for Operations
  const [selectedVasilhame, setSelectedVasilhame] = useState<VasilhameItem | null>(null);
  const [operationType, setOperationType] = useState<TipoMovimentacaoVasilhame>('venda_troca');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Operation Form State
  const [qtdCaixas, setQtdCaixas] = useState<number>(1);
  const [qtdAvulsas, setQtdAvulsas] = useState<number>(0);
  const [motivoQuebra, setMotivoQuebra] = useState('Avaria no manuseio/transporte');
  const [origemQuebra, setOrigemQuebra] = useState<'cheio' | 'vazio'>('vazio');
  const [documentoRef, setDocumentoRef] = useState('');
  const [observacao, setObservacao] = useState('');

  // Physical Inventory Count Mode State
  const [countTarget, setCountTarget] = useState<'cheio' | 'vazio'>('vazio');
  const [countCaixas, setCountCaixas] = useState<number>(0);
  const [countAvulsas, setCountAvulsas] = useState<number>(0);

  // New Custom Vasilhame Modal State
  const [isNewVasilhameModalOpen, setIsNewVasilhameModalOpen] = useState(false);
  const [newVasilhameName, setNewVasilhameName] = useState('');
  const [newVasilhameCia, setNewVasilhameCia] = useState<CiaVasilhame>('ambev');
  const [newVasilhameCapacidade, setNewVasilhameCapacidade] = useState<number>(24);
  const [newVasilhameVolume, setNewVasilhameVolume] = useState('600ml');
  const [newVasilhameMarcas, setNewVasilhameMarcas] = useState('');
  const [newVasilhameCheio, setNewVasilhameCheio] = useState<number>(0);
  const [newVasilhameVazio, setNewVasilhameVazio] = useState<number>(0);
  const [newVasilhameCaucao, setNewVasilhameCaucao] = useState<number>(4.0);

  // Filtered List
  const filteredVasilhames = useMemo(() => {
    return vasilhames.filter((v) => {
      const matchCia = selectedCia === 'todos' || v.cia === selectedCia;
      const query = searchQuery.trim().toLowerCase();
      if (!query) return matchCia;

      const matchText = 
        v.name.toLowerCase().includes(query) ||
        v.ciaLabel.toLowerCase().includes(query) ||
        v.volume.toLowerCase().includes(query) ||
        v.exemplosMarcas.some(m => m.toLowerCase().includes(query));

      return matchCia && matchText;
    });
  }, [vasilhames, selectedCia, searchQuery]);

  // Overall Statistics (Consolidado de Giro)
  const stats = useMemo(() => {
    let totalCheio = 0;
    let totalVazio = 0;
    let totalPatrimonio = 0;
    let totalPendentes = 0;
    let valorPatrimonialEstimado = 0;

    vasilhames.forEach(v => {
      totalCheio += v.estoqueCheio;
      totalVazio += v.estoqueVazio;
      totalPatrimonio += v.patrimonioTotal;
      totalPendentes += (v.pendentesCaucao || 0);
      const precoCasco = v.valorCaucaoUnitario || 3.5;
      valorPatrimonialEstimado += (v.patrimonioTotal + (v.pendentesCaucao || 0)) * precoCasco;
    });

    const percentualCheio = totalPatrimonio > 0 ? Math.round((totalCheio / totalPatrimonio) * 100) : 0;
    const percentualVazio = totalPatrimonio > 0 ? Math.round((totalVazio / totalPatrimonio) * 100) : 0;

    return {
      totalCheio,
      totalVazio,
      totalPatrimonio,
      totalPendentes,
      valorPatrimonialEstimado,
      percentualCheio,
      percentualVazio
    };
  }, [vasilhames]);

  // Helper function to format boxes + loose bottles
  const formatBoxesAndLoose = (totalUnits: number, boxCapacity: number, unitLabel: string = 'caixa') => {
    if (boxCapacity <= 1) {
      return `${totalUnits} ${unitLabel}${totalUnits === 1 ? '' : 's'}`;
    }
    const boxes = Math.floor(totalUnits / boxCapacity);
    const loose = totalUnits % boxCapacity;

    if (boxes === 0 && loose === 0) return '0 un';
    if (boxes === 0) return `${loose} un avulsa${loose === 1 ? '' : 's'}`;
    if (loose === 0) return `${boxes} cx (${totalUnits} un)`;
    return `${boxes} cx e ${loose} un (${totalUnits} un)`;
  };

  // Cia Color Theming Helpers
  const getCiaTheme = (cia: CiaVasilhame) => {
    switch (cia) {
      case 'ambev':
        return {
          name: 'Ambev',
          bgHeader: 'from-blue-900/40 via-blue-950/30 to-amber-950/20',
          borderBadge: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
          cardBorder: 'hover:border-blue-500/50',
          accentColor: '#3b82f6',
          brandPill: 'bg-blue-600 text-white',
          tag: 'AMBEV • SKOL • BRAHMA • SPATEN • ANTARCTICA'
        };
      case 'heineken':
        return {
          name: 'Grupo Heineken',
          bgHeader: 'from-emerald-950/40 via-emerald-900/30 to-slate-950/40',
          borderBadge: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
          cardBorder: 'hover:border-emerald-500/50',
          accentColor: '#10b981',
          brandPill: 'bg-emerald-600 text-white',
          tag: 'HEINEKEN • AMSTEL • DEVASSA • EISENBAHN'
        };
      case 'coca_cola':
        return {
          name: 'Coca-Cola (FEMSA)',
          bgHeader: 'from-rose-950/40 via-red-950/30 to-slate-950/40',
          borderBadge: 'border-rose-500/40 text-rose-400 bg-rose-500/10',
          cardBorder: 'hover:border-rose-500/50',
          accentColor: '#f43f5e',
          brandPill: 'bg-rose-600 text-white',
          tag: 'COCA-COLA • REFPET 2L • VIDRO 1L • KS 290ML'
        };
      default:
        return {
          name: 'Distribuidora',
          bgHeader: 'from-slate-900 to-slate-950',
          borderBadge: 'border-slate-700 text-slate-300 bg-slate-800',
          cardBorder: 'hover:border-slate-700',
          accentColor: '#94a3b8',
          brandPill: 'bg-slate-700 text-white',
          tag: 'RETORNÁVEIS'
        };
    }
  };

  // Open Operation Modal
  const handleOpenOperation = (item: VasilhameItem, type: TipoMovimentacaoVasilhame) => {
    setSelectedVasilhame(item);
    setOperationType(type);
    setQtdCaixas(1);
    setQtdAvulsas(0);
    setDocumentoRef('');
    setObservacao('');
    setOrigemQuebra('vazio');
    setCountTarget('vazio');
    setCountCaixas(Math.floor(item.estoqueVazio / item.capacidadeCaixa));
    setCountAvulsas(item.estoqueVazio % item.capacidadeCaixa);
    setIsModalOpen(true);
  };

  // Execute Business Logic for Vasilhame Movement
  const handleConfirmOperation = async () => {
    if (!selectedVasilhame) return;

    const capacidade = selectedVasilhame.capacidadeCaixa;
    const totalUnidades = (qtdCaixas * capacidade) + qtdAvulsas;

    if (operationType !== 'ajuste_inventario' && totalUnidades <= 0) {
      alert('Informe uma quantidade válida para a movimentação.');
      return;
    }

    let novoCheio = selectedVasilhame.estoqueCheio;
    let novoVazio = selectedVasilhame.estoqueVazio;
    let novosPendentes = selectedVasilhame.pendentesCaucao || 0;
    let statusAlerta = '';

    // Business rules per scenario
    switch (operationType) {
      case 'venda_troca':
        // Venda com Troca (Casco por Casco): Cheio -X, Vazio +X (Patrimônio Total inalterado)
        if (novoCheio < totalUnidades) {
          alert(`Estoque insuficiente de vasilhames CHEIOS! Você tem apenas ${novoCheio} unidades disponíveis para venda.`);
          return;
        }
        novoCheio -= totalUnidades;
        novoVazio += totalUnidades;
        break;

      case 'venda_sem_casco':
        // Venda sem Casco (Empréstimo/Caução): Cheio -X, Vazio inalterado, Pendente +X
        if (novoCheio < totalUnidades) {
          alert(`Estoque insuficiente de vasilhames CHEIOS! Você tem apenas ${novoCheio} unidades disponíveis.`);
          return;
        }
        novoCheio -= totalUnidades;
        novosPendentes += totalUnidades;
        statusAlerta = `Caução cobrado / Casco pendente com cliente (${totalUnidades} un)`;
        break;

      case 'reposicao_caminhao':
        // Reposição do Fornecedor: Cheio +Y, Vazio -Y
        if (novoVazio < totalUnidades) {
          const faltam = totalUnidades - novoVazio;
          const proceed = window.confirm(
            `⚠️ ALERTA DE DÉFICIT DE CASCOS:\n\n` +
            `O caminhão está entregando ${totalUnidades} garrafas cheias, mas o depósito possui apenas ${novoVazio} garrafas vazias para troca imediata.\n` +
            `FALTAM ${faltam} CASCOS VAZIOS para troca 1:1.\n\n` +
            `Deseja prosseguir mesmo assim gerando um saldo negativo ou cobrando caução com a transportadora?`
          );
          if (!proceed) return;
          statusAlerta = `Déficit de ${faltam} cascos vazios na entrega do caminhão`;
        }
        novoCheio += totalUnidades;
        novoVazio = Math.max(0, novoVazio - totalUnidades);
        break;

      case 'quebra_avaria':
        // Quebra / Avaria: Abate de Cheio ou Vazio e reduz Patrimônio Total
        if (origemQuebra === 'cheio') {
          if (novoCheio < totalUnidades) {
            alert(`Quantidade de cheios informada (${totalUnidades}) é maior que o saldo em estoque (${novoCheio}).`);
            return;
          }
          novoCheio -= totalUnidades;
        } else {
          if (novoVazio < totalUnidades) {
            alert(`Quantidade de vazios informada (${totalUnidades}) é maior que o saldo em estoque (${novoVazio}).`);
            return;
          }
          novoVazio -= totalUnidades;
        }
        statusAlerta = `Baixa de Avaria: ${totalUnidades} un (${origemQuebra.toUpperCase()}) - ${motivoQuebra}`;
        break;

      case 'devolucao_caucao':
        // Cliente devolve casco emprestado / estorno de caução: Pendente -X, Vazio +X
        const devolvidos = Math.min(novosPendentes, totalUnidades);
        novosPendentes = Math.max(0, novosPendentes - totalUnidades);
        novoVazio += totalUnidades;
        statusAlerta = `Retorno de ${totalUnidades} cascos devolvidos por cliente`;
        break;

      case 'ajuste_inventario':
        // Contagem Rápida / Auditoria Física
        const totalContado = (countCaixas * capacidade) + countAvulsas;
        if (countTarget === 'cheio') {
          novoCheio = totalContado;
        } else {
          novoVazio = totalContado;
        }
        statusAlerta = `Inventário Físico Auditado: ${countTarget.toUpperCase()} ajustado para ${totalContado} un (${countCaixas} cx e ${countAvulsas} un)`;
        break;
    }

    const novoPatrimonio = novoCheio + novoVazio;

    // Update item
    const updatedItems = vasilhames.map(v => {
      if (v.id === selectedVasilhame.id) {
        return {
          ...v,
          estoqueCheio: novoCheio,
          estoqueVazio: novoVazio,
          patrimonioTotal: novoPatrimonio,
          pendentesCaucao: novosPendentes
        };
      }
      return v;
    });

    await onUpdateVasilhames(updatedItems);

    // Record Transaction
    await onAddTransaction({
      vasilhameId: selectedVasilhame.id,
      vasilhameName: selectedVasilhame.name,
      cia: selectedVasilhame.cia,
      tipo: operationType,
      quantidade: operationType === 'ajuste_inventario' 
        ? ((countCaixas * capacidade) + countAvulsas) 
        : totalUnidades,
      quantidadeCaixas: operationType === 'ajuste_inventario' ? countCaixas : qtdCaixas,
      quantidadeAvulsas: operationType === 'ajuste_inventario' ? countAvulsas : qtdAvulsas,
      operador: operatorName || 'Operador Depósito',
      motivoAvaria: operationType === 'quebra_avaria' ? motivoQuebra : undefined,
      origemAvaria: operationType === 'quebra_avaria' ? origemQuebra : undefined,
      statusAlerta: statusAlerta || undefined,
      documentoRef: documentoRef.trim() || undefined,
      observacao: observacao.trim() || undefined
    });

    setIsModalOpen(false);
    setSelectedVasilhame(null);
  };

  // Add Custom Vasilhame to Catalog
  const handleCreateCustomVasilhame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVasilhameName.trim()) {
      alert('Informe o nome do vasilhame.');
      return;
    }

    const capacidade = Number(newVasilhameCapacidade) || 24;
    const cheio = Number(newVasilhameCheio) || 0;
    const vazio = Number(newVasilhameVazio) || 0;
    const marcasArray = newVasilhameMarcas
      .split(',')
      .map(m => m.trim())
      .filter(Boolean);

    const novoItem: VasilhameItem = {
      id: `vas-custom-${Date.now()}`,
      name: newVasilhameName.trim(),
      cia: newVasilhameCia,
      ciaLabel: newVasilhameCia === 'ambev' ? 'Ambev' : newVasilhameCia === 'heineken' ? 'Grupo Heineken' : 'Coca-Cola',
      tipo: 'garrafeira_600',
      volume: newVasilhameVolume.trim() || '600ml',
      capacidadeCaixa: capacidade,
      unidadeMedida: capacidade === 1 ? 'barril' : 'caixa',
      exemplosMarcas: marcasArray.length > 0 ? marcasArray : [newVasilhameName.trim()],
      estoqueCheio: cheio,
      estoqueVazio: vazio,
      patrimonioTotal: cheio + vazio,
      pendentesCaucao: 0,
      valorCaucaoUnitario: Number(newVasilhameCaucao) || 4.0,
      observacoes: 'Cadastrado manualmente no catálogo da distribuidora'
    };

    const updated = [...vasilhames, novoItem];
    await onUpdateVasilhames(updated);

    // Reset Form
    setNewVasilhameName('');
    setNewVasilhameMarcas('');
    setNewVasilhameCheio(0);
    setNewVasilhameVazio(0);
    setIsNewVasilhameModalOpen(false);
  };

  // Export Vasilhames Report as CSV
  const handleExportVasilhamesCSV = () => {
    const headers = [
      'ID',
      'Companhia',
      'Vasilhame',
      'Volume',
      'Capacidade Caixa',
      'Estoque Cheio (un)',
      'Cheio (Caixas)',
      'Estoque Vazio (un)',
      'Vazio (Caixas)',
      'Patrimonio Total (un)',
      'Total (Caixas)',
      'Cascos Pendentes (Caução)',
      'Valor Caucao Unitario (R$)',
      'Valor Total Cascos (R$)'
    ];

    const rows = vasilhames.map(v => {
      const cxCheio = (v.estoqueCheio / v.capacidadeCaixa).toFixed(1);
      const cxVazio = (v.estoqueVazio / v.capacidadeCaixa).toFixed(1);
      const cxTotal = (v.patrimonioTotal / v.capacidadeCaixa).toFixed(1);
      const valorTotal = (v.patrimonioTotal + (v.pendentesCaucao || 0)) * (v.valorCaucaoUnitario || 3.5);

      return [
        v.id,
        v.ciaLabel,
        `"${v.name}"`,
        v.volume,
        v.capacidadeCaixa,
        v.estoqueCheio,
        cxCheio,
        v.estoqueVazio,
        cxVazio,
        v.patrimonioTotal,
        cxTotal,
        v.pendentesCaucao || 0,
        (v.valorCaucaoUnitario || 3.5).toFixed(2),
        valorTotal.toFixed(2)
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-vasilhames-retornaveis-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Top Banner & Corporate Header */}
      <div className={`p-5 sm:p-6 rounded-3xl border ${isCosmic ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <Boxes className="w-6 h-6 stroke-[2.25]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className={`text-lg sm:text-xl font-black uppercase tracking-tight font-sans ${isCosmic ? 'text-slate-900' : 'text-slate-100'}`}>
                  Módulo de Vasilhames & Cascos Retornáveis
                </h2>
                <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 uppercase tracking-widest">
                  Saldo Triplo de Giro
                </span>
              </div>
              <p className={`text-xs mt-1 ${isCosmic ? 'text-slate-600' : 'text-slate-400'}`}>
                Controle operacional simultâneo de garrafas cheias, cascos vazios e patrimônio físico de Ambev, Grupo Heineken e Coca-Cola.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <button
              onClick={() => setIsNewVasilhameModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Novo Casco
            </button>
            <button
              onClick={handleExportVasilhamesCSV}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border active:scale-95 cursor-pointer ${
                isCosmic 
                  ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200' 
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750'
              }`}
              title="Exportar balanço de vasilhames em planilha CSV"
            >
              <Download className="w-4 h-4" />
              Exportar Balanço
            </button>
          </div>
        </div>

        {/* 4 Saldo Triplo KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
          {/* Card 1: Patrimônio Total */}
          <div className={`p-4 rounded-2xl border transition-all ${isCosmic ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase font-black tracking-wider text-slate-400">
                1. Patrimônio de Giro
              </span>
              <ShieldAlert className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-2xl sm:text-3xl font-black font-sans ${isCosmic ? 'text-slate-900' : 'text-slate-100'}`}>
                {stats.totalPatrimonio.toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] font-mono text-slate-500 font-bold">un</span>
            </div>
            <p className="text-[10px] text-slate-500 font-sans mt-1">
              Ativo físico total da loja (Cheios + Vazios)
            </p>
          </div>

          {/* Card 2: Estoque Cheio */}
          <div className={`p-4 rounded-2xl border transition-all ${isCosmic ? 'bg-emerald-50/50 border-emerald-200' : 'bg-emerald-950/20 border-emerald-500/30'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase font-black tracking-wider text-emerald-400">
                2. Estoque Cheio
              </span>
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black font-sans text-emerald-400">
                {stats.totalCheio.toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] font-mono text-emerald-500 font-bold">
                ({stats.percentualCheio}%)
              </span>
            </div>
            <p className="text-[10px] text-emerald-500/80 font-sans mt-1">
              Bebidas prontas para venda e entrega
            </p>
          </div>

          {/* Card 3: Estoque Vazio (Cascos de Troca) */}
          <div className={`p-4 rounded-2xl border transition-all ${isCosmic ? 'bg-amber-50/50 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase font-black tracking-wider text-amber-400">
                3. Estoque Vazio (Cascos)
              </span>
              <Truck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black font-sans text-amber-400">
                {stats.totalVazio.toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] font-mono text-amber-500 font-bold">
                ({stats.percentualVazio}%)
              </span>
            </div>
            <p className="text-[10px] text-amber-500/80 font-sans mt-1">
              Cascos prontos para troca c/ caminhão
            </p>
          </div>

          {/* Card 4: Cascos Pendentes / Caução com Clientes */}
          <div className={`p-4 rounded-2xl border transition-all ${isCosmic ? 'bg-purple-50/50 border-purple-200' : 'bg-purple-950/20 border-purple-500/30'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase font-black tracking-wider text-purple-400">
                Cascos na Rua (Caução)
              </span>
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black font-sans text-purple-400">
                {stats.totalPendentes.toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] font-mono text-purple-400/80 font-bold">un</span>
            </div>
            <p className="text-[10px] text-purple-400/80 font-sans mt-1">
              R$ {stats.valorPatrimonialEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em vasilhames
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Brand Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Sub-tabs: Ativos de Vasilhames vs Histórico */}
        <div className={`flex gap-1.5 p-1 rounded-2xl border ${isCosmic ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
          <button
            onClick={() => setActiveSubTab('ativos')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'ativos'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Boxes className="w-4 h-4" />
            Estoque & Cascos ({vasilhames.length})
          </button>
          <button
            onClick={() => setActiveSubTab('historico')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'historico'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Histórico de Trocas ({transactions.length})
          </button>
        </div>

        {/* Brand/Company Fast Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCia('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
              selectedCia === 'todos'
                ? 'bg-slate-100 text-slate-900 border-slate-300 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Todas ({vasilhames.length})
          </button>
          
          {/* Ambev Filter */}
          <button
            onClick={() => setSelectedCia('ambev')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border flex items-center gap-1.5 ${
              selectedCia === 'ambev'
                ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.3)]'
                : 'bg-blue-950/30 text-blue-400 border-blue-800/60 hover:bg-blue-900/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            Ambev
          </button>

          {/* Heineken Filter */}
          <button
            onClick={() => setSelectedCia('heineken')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border flex items-center gap-1.5 ${
              selectedCia === 'heineken'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_0_15px_rgba(5,150,105,0.3)]'
                : 'bg-emerald-950/30 text-emerald-400 border-emerald-800/60 hover:bg-emerald-900/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Heineken
          </button>

          {/* Coca-Cola Filter */}
          <button
            onClick={() => setSelectedCia('coca_cola')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border flex items-center gap-1.5 ${
              selectedCia === 'coca_cola'
                ? 'bg-rose-600 text-white border-rose-500 shadow-[0_0_15px_rgba(225,29,72,0.3)]'
                : 'bg-rose-950/30 text-rose-400 border-rose-800/60 hover:bg-rose-900/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            Coca-Cola
          </button>
        </div>
      </div>

      {/* Search Input Filter */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filtrar por garrafeira, cerveja (ex: Brahma, Heineken, Skol, KS), litrão, barril..."
          className={`w-full rounded-2xl pl-11 pr-4 py-3 text-xs focus:outline-none transition-all border ${
            isCosmic 
              ? 'bg-white border-slate-300 text-slate-800 focus:border-amber-500' 
              : 'bg-slate-900/60 border-slate-800 text-slate-200 focus:border-amber-500'
          }`}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 hover:text-slate-200 bg-slate-800 px-2 py-0.5 rounded cursor-pointer"
          >
            Limpar
          </button>
        )}
      </div>

      {/* SUB-TAB 1: CARDS DE VASILHAMES (ATIVOS DE GIRO) */}
      {activeSubTab === 'ativos' && (
        <div className="space-y-4">
          {filteredVasilhames.length === 0 ? (
            <div className={`p-12 text-center rounded-3xl border ${isCosmic ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'}`}>
              <HelpCircle className="w-10 h-10 mx-auto text-slate-500 mb-2" />
              <p className="text-sm font-bold text-slate-300">Nenhum vasilhame encontrado</p>
              <p className="text-xs text-slate-500 mt-1">Altere o filtro de cervejaria ou limpe o termo de busca.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVasilhames.map((item) => {
                const theme = getCiaTheme(item.cia);
                const percentCheio = item.patrimonioTotal > 0 
                  ? Math.round((item.estoqueCheio / item.patrimonioTotal) * 100) 
                  : 0;
                const percentVazio = item.patrimonioTotal > 0 
                  ? Math.round((item.estoqueVazio / item.patrimonioTotal) * 100) 
                  : 0;

                const caixasCheias = formatBoxesAndLoose(item.estoqueCheio, item.capacidadeCaixa, item.unidadeMedida);
                const caixasVazias = formatBoxesAndLoose(item.estoqueVazio, item.capacidadeCaixa, item.unidadeMedida);
                const caixasTotal = formatBoxesAndLoose(item.patrimonioTotal, item.capacidadeCaixa, item.unidadeMedida);

                // Warehouse alert
                const hasTruckRestockOpportunity = percentVazio >= 60;
                const isCriticallyLowOnFull = percentCheio <= 20;

                return (
                  <div
                    key={item.id}
                    className={`rounded-3xl border p-5 flex flex-col justify-between transition-all duration-300 shadow-md ${
                      isCosmic ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Cia Badge & Name */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={`text-[9px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${theme.borderBadge}`}>
                          {item.ciaLabel} • {item.volume}
                        </span>
                        <span className="text-[9.5px] font-mono font-bold text-slate-400">
                          {item.capacidadeCaixa === 1 ? '1 un/barril' : `${item.capacidadeCaixa} un/cx`}
                        </span>
                      </div>

                      <h3 className={`text-sm sm:text-base font-black tracking-tight uppercase leading-snug ${isCosmic ? 'text-slate-900' : 'text-slate-100'}`}>
                        {item.name}
                      </h3>

                      {/* Compatible Brands List */}
                      <p className="text-[10px] text-slate-500 font-sans mt-1 line-clamp-2">
                        Marcas: <strong className="text-slate-400 font-semibold">{item.exemplosMarcas.join(', ')}</strong>
                      </p>

                      {/* Visual Ratio Progress Bar (Cheio vs Vazio) */}
                      <div className="mt-4 space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-mono font-bold">
                          <span className="text-emerald-400 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            Cheio: {percentCheio}%
                          </span>
                          <span className="text-amber-400 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            Vazio: {percentVazio}%
                          </span>
                        </div>
                        
                        <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800 p-0.5">
                          <div 
                            style={{ width: `${percentCheio}%` }} 
                            className="h-full bg-emerald-500 rounded-l-full transition-all duration-500 shadow-xs" 
                            title={`Cheios: ${item.estoqueCheio} un`}
                          />
                          <div 
                            style={{ width: `${percentVazio}%` }} 
                            className="h-full bg-amber-500 rounded-r-full transition-all duration-500 shadow-xs" 
                            title={`Vazios: ${item.estoqueVazio} un`}
                          />
                        </div>
                      </div>

                      {/* Status Warnings */}
                      {hasTruckRestockOpportunity && (
                        <div className="mt-2.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          <span>Muitos cascos vazios ({caixasVazias}) • Pronto p/ troca c/ caminhão</span>
                        </div>
                      )}

                      {isCriticallyLowOnFull && (
                        <div className="mt-2.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[10px] font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                          <span>Estoque cheio baixo ({caixasCheias}) • Necessita pedido</span>
                        </div>
                      )}

                      {/* Saldo Triplo Detailed Breakdown */}
                      <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs font-mono">
                        {/* Cheio */}
                        <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-850">
                          <span className="text-[8.5px] uppercase text-emerald-400 font-bold block mb-0.5">Estoque Cheio</span>
                          <span className="text-sm font-black text-emerald-400 block">{item.estoqueCheio} un</span>
                          <span className="text-[9px] text-slate-500 truncate block">{caixasCheias}</span>
                        </div>

                        {/* Vazio */}
                        <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-850">
                          <span className="text-[8.5px] uppercase text-amber-400 font-bold block mb-0.5">Estoque Vazio</span>
                          <span className="text-sm font-black text-amber-400 block">{item.estoqueVazio} un</span>
                          <span className="text-[9px] text-slate-500 truncate block">{caixasVazias}</span>
                        </div>

                        {/* Patrimonio */}
                        <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-850">
                          <span className="text-[8.5px] uppercase text-slate-400 font-bold block mb-0.5">Patrimônio Total</span>
                          <span className="text-sm font-black text-slate-200 block">{item.patrimonioTotal} un</span>
                          <span className="text-[9px] text-slate-500 truncate block">{caixasTotal}</span>
                        </div>

                        {/* Pendentes / Caução */}
                        <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-850">
                          <span className="text-[8.5px] uppercase text-purple-400 font-bold block mb-0.5">Caução c/ Cliente</span>
                          <span className="text-sm font-black text-purple-400 block">{item.pendentesCaucao || 0} un</span>
                          <span className="text-[9px] text-slate-500 truncate block">
                            {formatBoxesAndLoose(item.pendentesCaucao || 0, item.capacidadeCaixa, item.unidadeMedida)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Operational Actions Grid */}
                    <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-bold">
                        Ações Operacionais Rápidas:
                      </span>
                      
                      <div className="grid grid-cols-2 gap-1.5">
                        {/* Ação 1: Venda com Troca */}
                        <button
                          type="button"
                          onClick={() => handleOpenOperation(item, 'venda_troca')}
                          className="px-2.5 py-2 rounded-xl text-[10.5px] font-bold uppercase tracking-wider bg-slate-950 hover:bg-slate-850 text-emerald-400 border border-emerald-500/30 transition-all flex items-center justify-center gap-1 cursor-pointer"
                          title="Venda Casco por Casco: diminui cheio e soma vazio"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Venda c/ Troca
                        </button>

                        {/* Ação 2: Reposição Caminhão */}
                        <button
                          type="button"
                          onClick={() => handleOpenOperation(item, 'reposicao_caminhao')}
                          className="px-2.5 py-2 rounded-xl text-[10.5px] font-bold uppercase tracking-wider bg-slate-950 hover:bg-slate-850 text-sky-400 border border-sky-500/30 transition-all flex items-center justify-center gap-1 cursor-pointer"
                          title="Chegada do fornecedor: entra cheio e baixa vazio entregue"
                        >
                          <Truck className="w-3 h-3" />
                          Caminhão
                        </button>

                        {/* Ação 3: Venda sem Casco / Caução */}
                        <button
                          type="button"
                          onClick={() => handleOpenOperation(item, 'venda_sem_casco')}
                          className="px-2.5 py-2 rounded-xl text-[10.5px] font-bold uppercase tracking-wider bg-slate-950 hover:bg-slate-850 text-purple-400 border border-purple-500/30 transition-all flex items-center justify-center gap-1 cursor-pointer"
                          title="Cliente comprou sem vasilhame ou ficou com caução pendente"
                        >
                          <Clock className="w-3 h-3" />
                          Sem Casco
                        </button>

                        {/* Ação 4: Contagem Física Rápida */}
                        <button
                          type="button"
                          onClick={() => handleOpenOperation(item, 'ajuste_inventario')}
                          className="px-2.5 py-2 rounded-xl text-[10.5px] font-bold uppercase tracking-wider bg-slate-950 hover:bg-slate-850 text-amber-400 border border-amber-500/30 transition-all flex items-center justify-center gap-1 cursor-pointer"
                          title="Auditar contagem de caixas fechadas e garrafas soltas"
                        >
                          <Boxes className="w-3 h-3" />
                          Contar Físico
                        </button>
                      </div>

                      {/* Extra options row */}
                      <div className="flex gap-1.5 pt-0.5">
                        {item.pendentesCaucao && item.pendentesCaucao > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleOpenOperation(item, 'devolucao_caucao')}
                            className="flex-1 py-1.5 rounded-lg text-[9.5px] font-bold uppercase tracking-wider bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border border-purple-800/60 transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <ArrowDownLeft className="w-3 h-3" />
                            Retorno de Caução
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleOpenOperation(item, 'quebra_avaria')}
                          className="flex-1 py-1.5 rounded-lg text-[9.5px] font-bold uppercase tracking-wider bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 border border-rose-800/50 transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <AlertOctagon className="w-3 h-3" />
                          Quebra / Avaria
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: HISTÓRICO DE TRANSAÇÕES DE VASILHAMES */}
      {activeSubTab === 'historico' && (
        <div className={`rounded-3xl border overflow-hidden ${isCosmic ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'}`}>
          <div className="p-4 sm:p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
            <div>
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                Registro de Movimentações de Vasilhames & Trocas
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">
                Rastreabilidade de compras casco por casco, trocas com fornecedores e cauções
              </p>
            </div>
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full font-bold bg-slate-900 text-slate-300 border border-slate-800">
              {transactions.length} registros
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase text-[9.5px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-bold">Data / Hora</th>
                  <th className="py-3 px-4 font-bold">Operação</th>
                  <th className="py-3 px-4 font-bold">Companhia</th>
                  <th className="py-3 px-4 font-bold">Vasilhame</th>
                  <th className="py-3 px-4 font-bold text-center">Caixas</th>
                  <th className="py-3 px-4 font-bold text-right">Qtd Total</th>
                  <th className="py-3 px-4 font-bold">Operador / Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                      Nenhuma movimentação de vasilhame registrada até o momento.
                    </td>
                  </tr>
                ) : (
                  transactions.slice().reverse().map((tx) => {
                    const dateStr = new Date(tx.data).toLocaleString('pt-BR');

                    let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
                    let typeLabel: string = tx.tipo;

                    if (tx.tipo === 'venda_troca') {
                      badgeColor = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
                      typeLabel = 'Venda c/ Troca (1:1)';
                    } else if (tx.tipo === 'reposicao_caminhao') {
                      badgeColor = 'bg-sky-500/15 text-sky-400 border-sky-500/30';
                      typeLabel = 'Reposição Caminhão';
                    } else if (tx.tipo === 'venda_sem_casco') {
                      badgeColor = 'bg-purple-500/15 text-purple-400 border-purple-500/30';
                      typeLabel = 'Venda s/ Casco (Caução)';
                    } else if (tx.tipo === 'quebra_avaria') {
                      badgeColor = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
                      typeLabel = 'Quebra / Avaria';
                    } else if (tx.tipo === 'devolucao_caucao') {
                      badgeColor = 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
                      typeLabel = 'Retorno de Caução';
                    } else if (tx.tipo === 'ajuste_inventario') {
                      badgeColor = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
                      typeLabel = 'Ajuste de Inventário';
                    }

                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                          {dateStr}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-lg border text-[9.5px] uppercase ${badgeColor}`}>
                            {typeLabel}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-bold text-slate-300 uppercase font-mono text-[10px]">
                            {tx.cia === 'ambev' ? 'Ambev' : tx.cia === 'heineken' ? 'Heineken' : 'Coca-Cola'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-200">
                          {tx.vasilhameName}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-300">
                          {tx.quantidadeCaixas !== undefined ? `${tx.quantidadeCaixas} cx` : '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-amber-400 text-xs">
                          {tx.quantidade} un
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-300 block">{tx.operador}</span>
                            {tx.statusAlerta && (
                              <span className="text-[10px] text-amber-400 block font-mono">
                                ⚠️ {tx.statusAlerta}
                              </span>
                            )}
                            {tx.observacao && (
                              <span className="text-[10px] text-slate-500 block italic">
                                {tx.observacao}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: MOVIMENTAÇÃO DE VASILHAME (4 CENÁRIOS REAIS) */}
      {isModalOpen && selectedVasilhame && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div>
                <span className="text-[9.5px] font-mono uppercase font-black tracking-wider text-amber-400 block">
                  {selectedVasilhame.ciaLabel} • {selectedVasilhame.volume}
                </span>
                <h3 className="text-base font-black text-slate-100 uppercase tracking-tight">
                  {selectedVasilhame.name}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content Form */}
            <div className="p-5 space-y-4 text-xs select-none">
              {/* Operation Tabs Selector */}
              <div>
                <label className="text-[10px] uppercase font-mono font-bold text-slate-400 tracking-wider block mb-1.5">
                  Tipo de Operação:
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setOperationType('venda_troca')}
                    className={`py-2 px-2 rounded-xl text-[10.5px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      operationType === 'venda_troca'
                        ? 'bg-emerald-500 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    1. Troca (1:1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperationType('reposicao_caminhao')}
                    className={`py-2 px-2 rounded-xl text-[10.5px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      operationType === 'reposicao_caminhao'
                        ? 'bg-sky-500 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    2. Caminhão
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperationType('venda_sem_casco')}
                    className={`py-2 px-2 rounded-xl text-[10.5px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      operationType === 'venda_sem_casco'
                        ? 'bg-purple-500 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    3. Sem Casco (Caução)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperationType('quebra_avaria')}
                    className={`py-2 px-2 rounded-xl text-[10.5px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      operationType === 'quebra_avaria'
                        ? 'bg-rose-500 text-white font-black shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    4. Quebra / Avaria
                  </button>
                </div>
              </div>

              {/* Explanatory Banner per Mode */}
              <div className="p-3.5 rounded-2xl border bg-slate-950 border-slate-800 text-[11px] leading-relaxed">
                {operationType === 'venda_troca' && (
                  <p className="text-emerald-300">
                    <strong>Venda com Troca Casco a Casco:</strong> O cliente leva a bebida cheia e devolve o vasilhame vazio. O sistema subtrai <strong>Cheios</strong> e adiciona automaticamente em <strong>Vazios</strong>. O patrimônio total permanece inalterado.
                  </p>
                )}
                {operationType === 'reposicao_caminhao' && (
                  <p className="text-sky-300">
                    <strong>Reposição do Caminhão (Fornecedor):</strong> Descarregamento da carga nova de cheios da Ambev/Heineken/Coca-Cola. O sistema soma nos <strong>Cheios</strong> e abate dos <strong>Vazios</strong> entregues ao motorista.
                  </p>
                )}
                {operationType === 'venda_sem_casco' && (
                  <p className="text-purple-300">
                    <strong>Venda sem Casco / Empréstimo:</strong> O cliente não trouxe o casco vazio. Subtrai de <strong>Cheios</strong> e registra o casco como <strong>Pendente / Caução</strong> na rua.
                  </p>
                )}
                {operationType === 'quebra_avaria' && (
                  <p className="text-rose-300">
                    <strong>Baixa por Quebra / Garrafa Trincada:</strong> Remove a garrafa definitivamente do estoque, reduzindo o <strong>Patrimônio Total</strong> da loja.
                  </p>
                )}
                {operationType === 'ajuste_inventario' && (
                  <p className="text-amber-300">
                    <strong>Modo de Contagem Rápida:</strong> Insira a quantidade física real de caixas fechadas e garrafas avulsas no chão do depósito para calibrar o estoque.
                  </p>
                )}
              </div>

              {/* Inputs for Standard Modes: Caixas & Avulsas */}
              {operationType !== 'ajuste_inventario' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                    <div>
                      <label className="text-[10px] font-mono uppercase font-black tracking-wider text-slate-400 block mb-1">
                        Caixas Fechadas ({selectedVasilhame.capacidadeCaixa} un):
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={qtdCaixas}
                        onChange={(e) => setQtdCaixas(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-100 font-mono font-black text-lg text-center rounded-xl py-2 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase font-black tracking-wider text-slate-400 block mb-1">
                        Garrafas Avulsas (Soltas):
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={qtdAvulsas}
                        onChange={(e) => setQtdAvulsas(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-100 font-mono font-black text-lg text-center rounded-xl py-2 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {/* Calculated Total Result */}
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between font-mono">
                    <span className="text-slate-400 text-[10.5px] uppercase font-bold">Total a Movimentar:</span>
                    <span className="text-amber-400 font-black text-sm">
                      {(qtdCaixas * selectedVasilhame.capacidadeCaixa) + qtdAvulsas} unidades ({qtdCaixas} cx e {qtdAvulsas} un)
                    </span>
                  </div>

                  {/* Warning if Truck exchange exceeds empty bottles */}
                  {operationType === 'reposicao_caminhao' && (
                    (() => {
                      const totalMov = (qtdCaixas * selectedVasilhame.capacidadeCaixa) + qtdAvulsas;
                      const deficit = totalMov - selectedVasilhame.estoqueVazio;

                      if (deficit > 0) {
                        return (
                          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 space-y-1">
                            <p className="font-black flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                              Falta de Vasilhame para Troca!
                            </p>
                            <p className="text-[10.5px] leading-relaxed">
                              Você está dando entrada em <strong>{totalMov}</strong> cheios, mas tem apenas <strong>{selectedVasilhame.estoqueVazio}</strong> cascos vazios. Faltarão <strong>{deficit}</strong> cascos para entregar ao caminhoneiro.
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()
                  )}

                  {/* Origin of Damage for Avaria */}
                  {operationType === 'quebra_avaria' && (
                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setOrigemQuebra('vazio')}
                          className={`py-2 text-[10px] font-black uppercase rounded-xl border transition-all cursor-pointer ${
                            origemQuebra === 'vazio'
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                              : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          Quebrou Vazia (Casco)
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrigemQuebra('cheio')}
                          className={`py-2 text-[10px] font-black uppercase rounded-xl border transition-all cursor-pointer ${
                            origemQuebra === 'cheio'
                              ? 'bg-rose-500 text-white border-rose-400 font-black'
                              : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          Quebrou Cheia (Com Bebida)
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">Motivo / Causa da Quebra:</label>
                        <select
                          value={motivoQuebra}
                          onChange={(e) => setMotivoQuebra(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none"
                        >
                          <option value="Avaria no manuseio/transporte">Avaria no manuseio/transporte</option>
                          <option value="Garrafa trincada ou bocal quebrado">Garrafa trincada ou bocal quebrado</option>
                          <option value="Queda de engradado no salão da loja">Queda de engradado no salão da loja</option>
                          <option value="Defeito de fábrica / Válvula de barril avariada">Defeito de fábrica / Válvula de barril avariada</option>
                          <option value="Casco refugado pelo caminhoneiro">Casco refugado pelo caminhoneiro</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Document & Observation Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                        Nota Fiscal / Romaneio (Opcional):
                      </label>
                      <input
                        type="text"
                        value={documentoRef}
                        onChange={(e) => setDocumentoRef(e.target.value)}
                        placeholder="Ex: NF 14920 / Romaneio 88"
                        className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                        Observação / Cliente:
                      </label>
                      <input
                        type="text"
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Ex: Troca de bar parceiro..."
                        className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* INVENTORY PHYSICAL COUNT FORM */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCountTarget('vazio');
                        setCountCaixas(Math.floor(selectedVasilhame.estoqueVazio / selectedVasilhame.capacidadeCaixa));
                        setCountAvulsas(selectedVasilhame.estoqueVazio % selectedVasilhame.capacidadeCaixa);
                      }}
                      className={`py-2 text-xs font-black uppercase rounded-xl border transition-all cursor-pointer ${
                        countTarget === 'vazio'
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      Auditar VAZIOS (Cascos)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCountTarget('cheio');
                        setCountCaixas(Math.floor(selectedVasilhame.estoqueCheio / selectedVasilhame.capacidadeCaixa));
                        setCountAvulsas(selectedVasilhame.estoqueCheio % selectedVasilhame.capacidadeCaixa);
                      }}
                      className={`py-2 text-xs font-black uppercase rounded-xl border transition-all cursor-pointer ${
                        countTarget === 'cheio'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      Auditar CHEIOS (Bebida)
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                    <div>
                      <label className="text-[10px] font-mono uppercase font-black tracking-wider text-slate-400 block mb-1">
                        Caixas Contadas:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={countCaixas}
                        onChange={(e) => setCountCaixas(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-100 font-mono font-black text-xl text-center rounded-xl py-2 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase font-black tracking-wider text-slate-400 block mb-1">
                        Garrafas Soltas:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={countAvulsas}
                        onChange={(e) => setCountAvulsas(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-100 font-mono font-black text-xl text-center rounded-xl py-2 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs flex justify-between items-center">
                    <span className="text-slate-400">Novo Saldo Total em Unidades:</span>
                    <strong className="text-amber-400 text-sm">
                      {(countCaixas * selectedVasilhame.capacidadeCaixa) + countAvulsas} garrafas
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-800 flex justify-end gap-2 bg-slate-950">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmOperation}
                className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                Confirmar Lançamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVO VASILHAME NO CATÁLOGO */}
      {isNewVasilhameModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                    Cadastrar Novo Vasilhame
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">Adicione novo vasilhame retornável ao depósito</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewVasilhameModalOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomVasilhame} className="p-5 space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                  Companhia / Fabricante *
                </label>
                <select
                  value={newVasilhameCia}
                  onChange={(e) => setNewVasilhameCia(e.target.value as CiaVasilhame)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-semibold focus:outline-none focus:border-amber-500"
                >
                  <option value="ambev">Ambev (Brahma, Skol, Spaten, Antarctica)</option>
                  <option value="heineken">Grupo Heineken (Heineken, Amstel, Devassa, Eisenbahn)</option>
                  <option value="coca_cola">Coca-Cola (FEMSA / Andina - RefPet, KS, 1L)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                  Nome do Tipo de Casco / Garrafeira *
                </label>
                <input
                  type="text"
                  required
                  value={newVasilhameName}
                  onChange={(e) => setNewVasilhameName(e.target.value)}
                  placeholder="Ex: Garrafeira 600ml Ambev"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-semibold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                    Volume da Garrafa
                  </label>
                  <input
                    type="text"
                    value={newVasilhameVolume}
                    onChange={(e) => setNewVasilhameVolume(e.target.value)}
                    placeholder="Ex: 600ml, 1000ml, 30L"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                    Capacidade da Caixa (un)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newVasilhameCapacidade}
                    onChange={(e) => setNewVasilhameCapacidade(parseInt(e.target.value) || 24)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                  Exemplos de Marcas Compatíveis (separadas por vírgula):
                </label>
                <input
                  type="text"
                  value={newVasilhameMarcas}
                  onChange={(e) => setNewVasilhameMarcas(e.target.value)}
                  placeholder="Ex: Brahma, Skol, Original"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] font-mono text-slate-400 uppercase font-bold block mb-1">
                    Inicial Cheio
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newVasilhameCheio}
                    onChange={(e) => setNewVasilhameCheio(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-center font-mono text-emerald-400 font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-slate-400 uppercase font-bold block mb-1">
                    Inicial Vazio
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newVasilhameVazio}
                    onChange={(e) => setNewVasilhameVazio(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-center font-mono text-amber-400 font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-slate-400 uppercase font-bold block mb-1">
                    Caução Unitário
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={newVasilhameCaucao}
                    onChange={(e) => setNewVasilhameCaucao(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-center font-mono text-purple-400 font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewVasilhameModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase text-slate-400 hover:text-white bg-slate-900 border border-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer shadow-sm active:scale-95"
                >
                  Salvar Vasilhame
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
