import { NotFound } from '../../shared/domain/errors.js';
import type { Category } from './category.js';
import type { Product } from './product.js';

export class ProductNotFound extends NotFound {
  static withId(id: number): ProductNotFound {
    return new ProductNotFound(`Produto ${id} não encontrado.`);
  }
}

export interface ProductSearch {
  category: Category | null;
  visible: boolean | null;
  page: number;
  perPage: number;
}

export interface ProductRepository {
  nextId(): Promise<number>;
  save(product: Product): Promise<void>;
  /** Só devolve o produto se ele for do restaurante informado. */
  find(restaurantId: number, id: number): Promise<Product | null>;
  search(restaurantId: number, filter: ProductSearch): Promise<{ items: Product[]; total: number }>;
  lastPosition(restaurantId: number): Promise<number>;
  /** Ids de todos os produtos do restaurante, na ordem atual do cardápio. */
  idsOf(restaurantId: number): Promise<number[]>;
  /** id do produto => nova posição. */
  savePositions(restaurantId: number, positions: ReadonlyMap<number, number>): Promise<void>;
  delete(restaurantId: number, id: number): Promise<void>;
}
