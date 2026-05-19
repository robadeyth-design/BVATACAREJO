/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExpirationBatch {
  id: string; // unique ID for tracking specific batch
  date: string; // YYYY-MM-DD
  quantity: number; // Quantity belonging to this expiration date
}

export type PackagingType = 'palete' | 'fardo' | 'pacote' | 'unidade' | 'kg';

export interface Product {
  id: string; // usually the barcode
  barcode: string;
  name: string;
  category: string;
  subcategory: string;
  packaging: PackagingType;
  minStock: number; // Minimum security stock
  batches: ExpirationBatch[]; // Up to 5 expiration dates tracking quantities
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  productId: string;
  productName: string;
  barcode: string;
  type: 'entrada' | 'saida'; // Entry or Exit
  quantity: number;
  operatorName: string; // Name of who is performing
  timestamp: string; // Exact ISO date string
  packaging: PackagingType;
  batchId?: string; // which expiration batch was added/removed (if any)
  batchDate?: string;
}

export interface Category {
  id: string;
  name: string;
  subcategories: string[];
}
