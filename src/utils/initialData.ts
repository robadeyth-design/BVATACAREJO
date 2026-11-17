import { Product, Category, Transaction, VasilhameItem, VasilhameTransaction } from '../types';

export const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'cat-1',
    name: 'Alimentos',
    subcategories: ['Arroz e Grãos', 'Óleos e Azeites', 'Massas']
  },
  {
    id: 'cat-2',
    name: 'Bebidas',
    subcategories: ['Chás e Sucos', 'Sucos e Águas', 'Laticínios', 'Energéticos', 'Cervejas']
  },
  {
    id: 'cat-rfg',
    name: 'Refrigerantes',
    subcategories: ['Coca-Cola', 'Guaraná', 'Fanta', 'Outros']
  },
  {
    id: 'cat-doces',
    name: 'Doces e Confeitos',
    subcategories: ['Chocolates', 'Balas', 'Gomas', 'Biscoitos Doces']
  },
  {
    id: 'cat-3',
    name: 'Limpeza',
    subcategories: ['Detergentes', 'Sabão em Pó', 'Desinfetantes', 'Amaciantes']
  },
  {
    id: 'cat-4',
    name: 'Frios e Congelados',
    subcategories: ['Carnes', 'Pratos Prontos', 'Sorvetes', 'Pães Congelados']
  }
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'p-1',
    name: 'Arroz Agulha Tipo 1 Prato Fino',
    barcode: '7891000123456',
    category: 'Alimentos',
    subcategory: 'Arroz e Grãos',
    brand: 'Pirahy Alimentos',
    minStock: 10,
    packaging: 'fardo de 5kg',
    description: 'Arroz agulha polido tipo 1, fardo contendo 6 pacotes de 5kg cada.',
    batches: [
      { id: 'b1-1', date: '2026-11-20', quantity: 15 },
      { id: 'b1-2', date: '2026-05-30', quantity: 4 } // Soon to expire based on target anchor 2026-05-19
    ]
  },
  {
    id: 'p-2',
    name: 'Azeite de Oliva Extra Virgem Gallo 500ml',
    barcode: '5601008001024',
    category: 'Alimentos',
    subcategory: 'Óleos e Azeites',
    brand: 'Gallo Worldwide',
    minStock: 15,
    packaging: 'caixa de 12un',
    description: 'Azeite de oliva extra virgem de origem portuguesa, garrafa de garrafa de vidro de 500ml.',
    batches: [
      { id: 'b2-1', date: '2027-04-12', quantity: 18 }
    ]
  },
  {
    id: 'p-3',
    name: 'Coca-Cola Original Pet 2 Litros',
    barcode: '7894900700046',
    category: 'Refrigerantes',
    subcategory: 'Coca-Cola',
    brand: 'Coca-Cola FEMSA',
    minStock: 25,
    packaging: 'fardo de 6un',
    description: 'Refrigerante sabor cola original, garrafa pet de 2L.',
    batches: [
      { id: 'b3-1', date: '2026-08-10', quantity: 30 },
      { id: 'b3-2', date: '2026-05-22', quantity: 5 } // expiring very soon from 2026-05-19
    ]
  },
  {
    id: 'p-matte-leao',
    name: 'Chá Matte Leão Limão 1.5 Litros',
    barcode: '7894900530018',
    category: 'Bebidas',
    subcategory: 'Chás e Sucos',
    brand: 'Coca-Cola FEMSA',
    minStock: 20,
    packaging: 'fardo de 6un',
    weightVolume: '1.5 Litros',
    description: 'Chá mate pronto sabor limão Matte Leão, garrafa pet de 1.5L.',
    batches: [
      { id: 'b-matte-1', date: '2027-01-20', quantity: 36 }
    ]
  },
  {
    id: 'p-4',
    name: 'Sabão em Pó OMO Lavagem Perfeita 1.6kg',
    barcode: '7891024036122',
    category: 'Limpeza',
    subcategory: 'Sabão em Pó',
    brand: 'Unilever',
    minStock: 8,
    packaging: 'caixa master de 10un',
    description: 'Sabão em pó para lavandeira ativa Omo Lavagem Perfeita, caixa de 1.6kg.',
    batches: [
      { id: 'b4-1', date: '2028-02-18', quantity: 12 }
    ]
  },
  {
    id: 'p-5',
    name: 'Cerveja Brahma Chopp Lata 350ml',
    barcode: '7891991000826',
    category: 'Bebidas',
    subcategory: 'Cervejas',
    brand: 'Ambev',
    minStock: 20,
    packaging: 'pack de 12un',
    description: 'Cerveja Pilsen clássica Brahma Chopp lata 350ml.',
    batches: [
      { id: 'b5-1', date: '2026-10-15', quantity: 40 }
    ]
  },
  {
    id: 'p-6',
    name: 'Biscoito Recheado Passatempo Chocolate 130g',
    barcode: '7891000053508',
    category: 'Doces e Confeitos',
    subcategory: 'Biscoitos Doces',
    brand: 'Nestlé',
    minStock: 15,
    packaging: 'caixa de 30un',
    description: 'Biscoito recheado sabor chocolate com leite Passatempo Nestlé 130g.',
    batches: [
      { id: 'b6-1', date: '2026-12-05', quantity: 24 }
    ]
  }
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 't-1',
    productId: 'p-1',
    productName: 'Arroz Agulha Tipo 1 Prato Fino',
    barcode: '7891000123456',
    type: 'entrada',
    quantity: 15,
    operatorName: 'Beto Vasconcelos',
    timestamp: '2026-05-15T09:30:00Z',
    packaging: 'fardo de 5kg',
    batchId: 'b1-1',
    batchDate: '2026-11-20'
  },
  {
    id: 't-2',
    productId: 'p-1',
    productName: 'Arroz Agulha Tipo 1 Prato Fino',
    barcode: '7891000123456',
    type: 'entrada',
    quantity: 4,
    operatorName: 'Ana Clara',
    timestamp: '2026-05-18T14:15:00Z',
    packaging: 'fardo de 5kg',
    batchId: 'b1-2',
    batchDate: '2026-05-30'
  },
  {
    id: 't-3',
    productId: 'p-3',
    productName: 'Coca-Cola Original Pet 2 Litros',
    barcode: '7894900700046',
    type: 'entrada',
    quantity: 35,
    operatorName: 'Beto Vasconcelos',
    timestamp: '2026-05-19T10:00:00Z',
    packaging: 'fardo de 6un',
    batchId: 'b3-1',
    batchDate: '2026-08-10'
  },
  {
    id: 't-4',
    productId: 'p-3',
    productName: 'Coca-Cola Original Pet 2 Litros',
    barcode: '7894900700046',
    type: 'saida',
    quantity: 5,
    operatorName: 'Ana Clara',
    timestamp: '2026-05-19T11:30:00Z',
    packaging: 'fardo de 6un',
    batchId: 'b3-1',
    batchDate: '2026-08-10'
  }
];

export const INITIAL_VASILHAMES: VasilhameItem[] = [
  // AMBEV
  {
    id: 'vas-amb-600',
    name: 'Garrafeira 600ml (Caixa c/ 24)',
    cia: 'ambev',
    ciaLabel: 'Ambev',
    tipo: 'garrafeira_600',
    volume: '600ml',
    capacidadeCaixa: 24,
    unidadeMedida: 'caixa',
    exemplosMarcas: ['Brahma Chopp', 'Skol Pilsen', 'Antarctica Original', 'Spaten Munich', 'Bohemia'],
    estoqueCheio: 168, // 7 caixas
    estoqueVazio: 96,  // 4 caixas
    patrimonioTotal: 264, // 11 caixas
    pendentesCaucao: 24, // 1 caixa na rua
    valorCaucaoUnitario: 3.50,
    observacoes: 'Engradado amarelo/vermelho padrão Ambev 24 garrafas'
  },
  {
    id: 'vas-amb-300',
    name: 'Garrafeira Litrinho 300ml (Caixa c/ 24)',
    cia: 'ambev',
    ciaLabel: 'Ambev',
    tipo: 'litrinho_300',
    volume: '300ml',
    capacidadeCaixa: 24,
    unidadeMedida: 'caixa',
    exemplosMarcas: ['Skol Litrinho', 'Brahma Duplo Malte', 'Antarctica Subzero'],
    estoqueCheio: 192, // 8 caixas
    estoqueVazio: 72,  // 3 caixas
    patrimonioTotal: 264,
    pendentesCaucao: 0,
    valorCaucaoUnitario: 2.50,
    observacoes: 'Garrafinhas âmbar 300ml retornáveis Ambev'
  },
  {
    id: 'vas-amb-1000',
    name: 'Garrafeira Litrão 1000ml (Caixa c/ 12)',
    cia: 'ambev',
    ciaLabel: 'Ambev',
    tipo: 'litrao_1000',
    volume: '1000ml',
    capacidadeCaixa: 12,
    unidadeMedida: 'caixa',
    exemplosMarcas: ['Brahma Chopp 1L', 'Skol 1L', 'Antarctica 1L'],
    estoqueCheio: 72,  // 6 caixas
    estoqueVazio: 36,  // 3 caixas
    patrimonioTotal: 108,
    pendentesCaucao: 12,
    valorCaucaoUnitario: 5.00,
    observacoes: 'Caixa plástica pesada para 12 garrafões'
  },
  {
    id: 'vas-amb-chopp30',
    name: 'Barril de Chopp 30 Litros',
    cia: 'ambev',
    ciaLabel: 'Ambev',
    tipo: 'barril_30',
    volume: '30L',
    capacidadeCaixa: 1,
    unidadeMedida: 'barril',
    exemplosMarcas: ['Chopp Brahma Claro', 'Chopp Stella Artois', 'Chopp Spaten'],
    estoqueCheio: 6,
    estoqueVazio: 4,
    patrimonioTotal: 10,
    pendentesCaucao: 2,
    valorCaucaoUnitario: 250.00,
    observacoes: 'Barril inox padrão válvula S (europeia/Ambev)'
  },
  {
    id: 'vas-amb-chopp50',
    name: 'Barril de Chopp 50 Litros',
    cia: 'ambev',
    ciaLabel: 'Ambev',
    tipo: 'barril_50',
    volume: '50L',
    capacidadeCaixa: 1,
    unidadeMedida: 'barril',
    exemplosMarcas: ['Chopp Brahma Claro 50L', 'Chopp Brahma Black', 'Chopp Spaten 50L'],
    estoqueCheio: 5,
    estoqueVazio: 3,
    patrimonioTotal: 8,
    pendentesCaucao: 1,
    valorCaucaoUnitario: 350.00,
    observacoes: 'Barril inox 50L com engate rápido e lacre'
  },

  // GRUPO HEINEKEN
  {
    id: 'vas-hei-600',
    name: 'Garrafeira 600ml (Caixa c/ 24)',
    cia: 'heineken',
    ciaLabel: 'Grupo Heineken',
    tipo: 'garrafeira_600',
    volume: '600ml',
    capacidadeCaixa: 24,
    unidadeMedida: 'caixa',
    exemplosMarcas: ['Heineken Lager', 'Amstel Puro Malte', 'Devassa Loura', 'Eisenbahn Pilsen', 'Kaiser'],
    estoqueCheio: 120, // 5 caixas
    estoqueVazio: 72,  // 3 caixas
    patrimonioTotal: 192,
    pendentesCaucao: 24,
    valorCaucaoUnitario: 4.00,
    observacoes: 'Engradados verdes Heineken e vermelhos Amstel 24x600'
  },
  {
    id: 'vas-hei-1000',
    name: 'Garrafeira 1000ml / Litrão (Caixa c/ 12)',
    cia: 'heineken',
    ciaLabel: 'Grupo Heineken',
    tipo: 'litrao_1000',
    volume: '1000ml',
    capacidadeCaixa: 12,
    unidadeMedida: 'caixa',
    exemplosMarcas: ['Amstel Litrão', 'Devassa Litrão', 'Kaiser Litrão'],
    estoqueCheio: 48, // 4 caixas
    estoqueVazio: 24, // 2 caixas
    patrimonioTotal: 72,
    pendentesCaucao: 0,
    valorCaucaoUnitario: 5.00,
    observacoes: 'Caixas plásticas 12 unidades Litrão Heineken'
  },
  {
    id: 'vas-hei-chopp30',
    name: 'Barril de Chopp / Draft 30 Litros',
    cia: 'heineken',
    ciaLabel: 'Grupo Heineken',
    tipo: 'barril_30',
    volume: '30L',
    capacidadeCaixa: 1,
    unidadeMedida: 'barril',
    exemplosMarcas: ['Heineken Draft 30L', 'Amstel Chopp 30L', 'Eisenbahn Draft'],
    estoqueCheio: 4,
    estoqueVazio: 2,
    patrimonioTotal: 6,
    pendentesCaucao: 1,
    valorCaucaoUnitario: 300.00,
    observacoes: 'Barril inox com válvula A/M Heineken'
  },
  {
    id: 'vas-hei-chopp50',
    name: 'Barril de Chopp / Draft 50 Litros',
    cia: 'heineken',
    ciaLabel: 'Grupo Heineken',
    tipo: 'barril_50',
    volume: '50L',
    capacidadeCaixa: 1,
    unidadeMedida: 'barril',
    exemplosMarcas: ['Heineken Draft 50L', 'Amstel Chopp 50L'],
    estoqueCheio: 7,
    estoqueVazio: 4,
    patrimonioTotal: 11,
    pendentesCaucao: 2,
    valorCaucaoUnitario: 400.00,
    observacoes: 'Barril 50L oficial Grupo Heineken'
  },

  // COCA-COLA (FEMSA / ANDINA)
  {
    id: 'vas-coca-refpet',
    name: 'RefPet 2 Litros (Engradado c/ 9)',
    cia: 'coca_cola',
    ciaLabel: 'Coca-Cola (FEMSA)',
    tipo: 'refpet_2l',
    volume: '2.0L',
    capacidadeCaixa: 9,
    unidadeMedida: 'engradado',
    exemplosMarcas: ['Coca-Cola Original RefPet', 'Coca-Cola Sem Açúcar', 'Fanta Laranja Retornável', 'Kuat Guaraná'],
    estoqueCheio: 81, // 9 engradados
    estoqueVazio: 54, // 6 engradados
    patrimonioTotal: 135,
    pendentesCaucao: 18, // 2 engradados com clientes
    valorCaucaoUnitario: 4.50,
    observacoes: 'Garrafas PET retornáveis de alta densidade 2L'
  },
  {
    id: 'vas-coca-vidro1l',
    name: 'Garrafa Vidro Retornável 1 Litro (Caixa c/ 12)',
    cia: 'coca_cola',
    ciaLabel: 'Coca-Cola (FEMSA)',
    tipo: 'vidro_1l',
    volume: '1.0L',
    capacidadeCaixa: 12,
    unidadeMedida: 'caixa',
    exemplosMarcas: ['Coca-Cola Vidro 1L Retornável', 'Fanta Vidro 1L'],
    estoqueCheio: 60, // 5 caixas
    estoqueVazio: 36, // 3 caixas
    patrimonioTotal: 96,
    pendentesCaucao: 12,
    valorCaucaoUnitario: 5.50,
    observacoes: 'Caixa vermelha tradicional Coca-Cola 1 Litro'
  },
  {
    id: 'vas-coca-ks',
    name: 'Garrafa Vidro KS 290ml / 250ml (Caixa c/ 24)',
    cia: 'coca_cola',
    ciaLabel: 'Coca-Cola (FEMSA)',
    tipo: 'vidro_ks',
    volume: '290ml',
    capacidadeCaixa: 24,
    unidadeMedida: 'caixa',
    exemplosMarcas: ['Coca-Cola KS', 'Fanta Laranja KS', 'Sprite KS', 'Guaraná Jesus KS'],
    estoqueCheio: 144, // 6 caixas
    estoqueVazio: 72,  // 3 caixas
    patrimonioTotal: 216,
    pendentesCaucao: 24,
    valorCaucaoUnitario: 3.00,
    observacoes: 'Caixa clássica vermelha King Size 24 garrafas'
  }
];

export const INITIAL_VASILHAME_TRANSACTIONS: VasilhameTransaction[] = [
  {
    id: 'vt-1',
    vasilhameId: 'vas-amb-600',
    vasilhameName: 'Garrafeira 600ml (Caixa c/ 24)',
    cia: 'ambev',
    tipo: 'reposicao_caminhao',
    quantidade: 48,
    quantidadeCaixas: 2,
    quantidadeAvulsas: 0,
    data: '2026-05-18T08:30:00Z',
    operador: 'Beto Vasconcelos',
    documentoRef: 'ROM-98442 Ambev',
    observacao: 'Troca de 2 caixas com o caminhão de rota'
  },
  {
    id: 'vt-2',
    vasilhameId: 'vas-coca-refpet',
    vasilhameName: 'RefPet 2 Litros (Engradado c/ 9)',
    cia: 'coca_cola',
    tipo: 'venda_troca',
    quantidade: 18,
    quantidadeCaixas: 2,
    quantidadeAvulsas: 0,
    data: '2026-05-19T10:15:00Z',
    operador: 'Ana Clara',
    observacao: 'Cliente trouxe 2 engradados vazios na compra de 2 cheios'
  },
  {
    id: 'vt-3',
    vasilhameId: 'vas-hei-600',
    vasilhameName: 'Garrafeira 600ml (Caixa c/ 24)',
    cia: 'heineken',
    tipo: 'venda_sem_casco',
    quantidade: 24,
    quantidadeCaixas: 1,
    quantidadeAvulsas: 0,
    data: '2026-05-19T11:45:00Z',
    operador: 'Beto Vasconcelos',
    observacao: 'Evento Restaurante Família Silva - Caução de 1 caixa cobrado'
  }
];
