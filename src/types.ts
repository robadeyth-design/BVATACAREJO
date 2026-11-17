export interface Batch {
  id: string;
  date: string; // Expiration date YYYY-MM-DD
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  category: string;
  subcategory: string;
  minStock: number;
  packaging: string;
  batches: Batch[];
  image?: string;
  brand?: string;
  weightVolume?: string;
  description?: string;
}

export interface Transaction {
  id: string;
  productId: string;
  productName: string;
  barcode: string;
  type: 'entrada' | 'saida' | 'transferencia';
  quantity: number;
  operatorName: string;
  timestamp: string; // ISO string
  packaging: string;
  batchId: string;
  batchDate: string; // Expiration date
  transferDestination?: 'anexo' | 'loja' | '3019';
  sourceSector?: 'deposito' | 'loja' | 'anexo' | '3019';
  nfPhoto?: string; // Base64 or URL photo of invoice (NF)
}

export interface Category {
  id: string;
  name: string;
  subcategories: string[];
}

export type CiaVasilhame = 'ambev' | 'heineken' | 'coca_cola';

export type TipoVasilhame = 
  | 'garrafeira_600'
  | 'litrinho_300'
  | 'litrao_1000'
  | 'barril_30'
  | 'barril_50'
  | 'refpet_2l'
  | 'vidro_1l'
  | 'vidro_ks';

export interface VasilhameItem {
  id: string;
  name: string;
  cia: CiaVasilhame;
  ciaLabel: string;
  tipo: TipoVasilhame;
  volume: string;
  capacidadeCaixa: number; // e.g. 24, 12, 9, or 1 (keg)
  unidadeMedida: 'caixa' | 'engradado' | 'barril';
  exemplosMarcas: string[];
  // Regra de Ouro do Saldo Triplo
  estoqueCheio: number; // quantidade em unidades individuais
  estoqueVazio: number; // quantidade em unidades individuais
  patrimonioTotal: number; // estoqueCheio + estoqueVazio
  pendentesCaucao: number; // cascos na rua com clientes (caução)
  valorCaucaoUnitario?: number; // valor monetário estimado do vasilhame
  observacoes?: string;
}

export type TipoMovimentacaoVasilhame = 
  | 'venda_troca' // Venda com Troca: Cheio -X, Vazio +X (Patrimônio inalterado)
  | 'venda_sem_casco' // Venda sem Casco: Cheio -X, Pendente +X
  | 'reposicao_caminhao' // Reposição do Fornecedor: Cheio +Y, Vazio -Y
  | 'quebra_avaria' // Quebra/Avaria: Reduz Cheio ou Vazio e diminui Patrimônio
  | 'devolucao_caucao' // Retorno de vasilhame de cliente: Pendente -X, Vazio +X
  | 'ajuste_inventario'; // Contagem e ajuste físico de auditoria

export interface VasilhameTransaction {
  id: string;
  vasilhameId: string;
  vasilhameName: string;
  cia: CiaVasilhame;
  tipo: TipoMovimentacaoVasilhame;
  quantidade: number; // em unidades
  quantidadeCaixas?: number; // equivalente em caixas
  quantidadeAvulsas?: number; // garrafas soltas
  data: string; // ISO string
  operador: string;
  motivoAvaria?: string;
  origemAvaria?: 'cheio' | 'vazio';
  statusAlerta?: string;
  documentoRef?: string;
  observacao?: string;
}

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  packaging: string;
  weightVolume?: string;
  purchaseUnit: string;
  quantity: number;
}

export interface PurchaseOrder {
  id: string;
  createdAt: string;
  operatorName: string;
  items: PurchaseOrderItem[];
  totalItemsCount: number;
  totalUnitsCount: number;
}
