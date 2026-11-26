import { toWindowData, type WindowData } from '../../shared/application/window-data.js';
import type { Product } from '../domain/product.js';

/** Entrada de criação e de atualização completa de um produto (dados já no formato primitivo). */
export interface ProductData {
  name: string;
  priceCents: number;
  category: string;
  visible?: boolean;
  availability?: WindowData[];
}

export interface ProductOutput {
  id: number;
  name: string;
  price: number;
  category: string;
  visible: boolean;
  position: number;
  availability: WindowData[];
}

export interface ProductPage {
  items: ProductOutput[];
  page: number;
  perPage: number;
  total: number;
}

export function toProductOutput(product: Product): ProductOutput {
  return {
    id: product.id,
    name: product.name,
    price: product.price.cents,
    category: product.category.value,
    visible: product.visible,
    position: product.position,
    availability: toWindowData(product.availability),
  };
}
