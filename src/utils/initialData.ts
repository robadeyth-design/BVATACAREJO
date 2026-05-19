/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product, Transaction, Category } from '../types';

export const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'cat-1',
    name: 'Alimentos',
    subcategories: ['Grãos', 'Massas', 'Óleos e Condimentos', 'Conservas']
  },
  {
    id: 'cat-2',
    name: 'Bebidas',
    subcategories: ['Refrigerantes', 'Sucos', 'Cervejas', 'Águas']
  },
  {
    id: 'cat-3',
    name: 'Limpeza e Higiene',
    subcategories: ['Detergentes', 'Amaciantes', 'Sabão em Pó', 'Papel Higiênico']
  },
  {
    id: 'cat-4',
    name: 'Descartáveis',
    subcategories: ['Copos e Pratos', 'Guardanapos', 'Sacolas']
  }
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: '7891000100104',
    barcode: '7891000100104',
    name: 'Arroz Prato Fino Tipo 1 - 5kg',
    category: 'Alimentos',
    subcategory: 'Grãos',
    packaging: 'fardo',
    minStock: 10,
    batches: [
      { id: 'b1-1', date: '2026-06-15', quantity: 24 }, // Soon to expire (relative to May 2026)
      { id: 'b1-2', date: '2026-10-20', quantity: 80 },
      { id: 'b1-3', date: '2027-02-15', quantity: 120 }
    ],
    notes: 'Empilhar no máximo 6 fardos de altura.',
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-05-19T14:30:00Z'
  },
  {
    id: '7891000200200',
    barcode: '7891000200200',
    name: 'Feijão Carioca Kicaldo - 1kg',
    category: 'Alimentos',
    subcategory: 'Grãos',
    packaging: 'fardo',
    minStock: 20,
    batches: [
      { id: 'b2-1', date: '2026-05-30', quantity: 15 }, // Extremely soon to expire
      { id: 'b2-2', date: '2026-09-12', quantity: 150 }
    ],
    notes: 'Proteger da umidade.',
    createdAt: '2026-04-20T08:00:00Z',
    updatedAt: '2026-05-18T11:00:00Z'
  },
  {
    id: '7891000300306',
    barcode: '7891000300306',
    name: 'Refrigerante Coca-Cola PET - 2L',
    category: 'Bebidas',
    subcategory: 'Refrigerantes',
    packaging: 'fardo',
    minStock: 40,
    batches: [
      { id: 'b3-1', date: '2026-08-30', quantity: 120 },
      { id: 'b3-2', date: '2026-11-15', quantity: 180 }
    ],
    notes: 'Mantenha em local fresco.',
    createdAt: '2026-05-10T15:20:00Z',
    updatedAt: '2026-05-19T10:15:00Z'
  },
  {
    id: '7891000400402',
    barcode: '7891000400402',
    name: 'Detergente Líquido Limpol Neutro - 500ml',
    category: 'Limpeza e Higiene',
    subcategory: 'Detergentes',
    packaging: 'pacote',
    minStock: 50,
    batches: [
      { id: 'b4-1', date: '2028-04-01', quantity: 300 } // Long expiration
    ],
    notes: 'Caixas com 24 unidades.',
    createdAt: '2026-05-05T09:40:00Z',
    updatedAt: '2026-05-05T09:40:00Z'
  },
  {
    id: '7891000500508',
    barcode: '7891000500508',
    name: 'Cerveja Skol Lata - 350ml',
    category: 'Bebidas',
    subcategory: 'Cervejas',
    packaging: 'palete',
    minStock: 5,
    batches: [
      { id: 'b5-1', date: '2026-06-05', quantity: 2 }, // Expiring
      { id: 'b5-2', date: '2026-07-20', quantity: 4 },
      { id: 'b5-3', date: '2026-11-10', quantity: 12 }
    ],
    notes: 'Palete padrão PBR com 120 fardos.',
    createdAt: '2026-05-12T11:00:00Z',
    updatedAt: '2026-05-19T13:45:00Z'
  }
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 't-1',
    productId: '7891000100104',
    productName: 'Arroz Prato Fino Tipo 1 - 5kg',
    barcode: '7891000100104',
    type: 'entrada',
    quantity: 100,
    operatorName: 'Carlos Silva (Almoxarife)',
    timestamp: '2026-05-19T08:30:00Z',
    packaging: 'fardo',
    batchId: 'b1-2',
    batchDate: '2026-10-20'
  },
  {
    id: 't-2',
    productId: '7891000100104',
    productName: 'Arroz Prato Fino Tipo 1 - 5kg',
    barcode: '7891000100104',
    type: 'saida',
    quantity: 20,
    operatorName: 'Carlos Silva (Almoxarife)',
    timestamp: '2026-05-19T14:30:00Z',
    packaging: 'fardo',
    batchId: 'b1-2',
    batchDate: '2026-10-20'
  },
  {
    id: 't-3',
    productId: '7891000300306',
    productName: 'Refrigerante Coca-Cola PET - 2L',
    barcode: '7891000300306',
    type: 'entrada',
    quantity: 180,
    operatorName: 'Amanda Costa (Logística)',
    timestamp: '2026-05-19T10:15:00Z',
    packaging: 'fardo',
    batchId: 'b3-2',
    batchDate: '2026-11-15'
  },
  {
    id: 't-4',
    productId: '7891000500508',
    barcode: '7891000500508',
    productName: 'Cerveja Skol Lata - 350ml',
    type: 'entrada',
    quantity: 12,
    operatorName: 'Roberto Souza (Gerente)',
    timestamp: '2026-05-19T13:45:00Z',
    packaging: 'palete',
    batchId: 'b5-3',
    batchDate: '2026-11-10'
  }
];
