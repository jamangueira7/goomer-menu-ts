import { toTimeWindows } from '../../shared/application/window-data.js';
import { ValidationError } from '../../shared/domain/errors.js';
import { Money } from '../../shared/domain/money.js';
import { Category } from '../domain/category.js';
import { Product, type ProductChanges } from '../domain/product.js';
import { ProductNotFound, type ProductRepository } from '../domain/product-repository.js';
import { toProductOutput, type ProductData, type ProductOutput, type ProductPage } from './product-dto.js';

function changesFrom(data: ProductData): ProductChanges {
  return {
    name: data.name,
    price: Money.ofCents(data.priceCents),
    category: Category.fromString(data.category),
    visible: data.visible ?? true,
    availability: toTimeWindows(data.availability ?? []),
  };
}

export class CreateProductUseCase {
  constructor(private readonly products: ProductRepository) {}

  async execute(restaurantId: number, data: ProductData): Promise<ProductOutput> {
    const changes = changesFrom(data);
    const product = Product.create({
      ...changes,
      id: await this.products.nextId(),
      restaurantId,
      position: (await this.products.lastPosition(restaurantId)) + 1,
    });
    await this.products.save(product);
    return toProductOutput(product);
  }
}

export class GetProductUseCase {
  constructor(private readonly products: ProductRepository) {}

  async execute(restaurantId: number, id: number): Promise<ProductOutput> {
    const product = await this.products.find(restaurantId, id);
    if (product === null) {
      throw ProductNotFound.withId(id);
    }
    return toProductOutput(product);
  }
}

export class UpdateProductUseCase {
  constructor(private readonly products: ProductRepository) {}

  async execute(restaurantId: number, id: number, data: ProductData): Promise<ProductOutput> {
    const product = await this.products.find(restaurantId, id);
    if (product === null) {
      throw ProductNotFound.withId(id);
    }
    product.update(changesFrom(data));
    await this.products.save(product);
    return toProductOutput(product);
  }
}

export class ChangeProductVisibilityUseCase {
  constructor(private readonly products: ProductRepository) {}

  async execute(restaurantId: number, id: number, visible: boolean): Promise<ProductOutput> {
    const product = await this.products.find(restaurantId, id);
    if (product === null) {
      throw ProductNotFound.withId(id);
    }
    if (visible) {
      product.show();
    } else {
      product.hide();
    }
    await this.products.save(product);
    return toProductOutput(product);
  }
}

export interface ListProductsQuery {
  category?: string | null | undefined;
  visible?: boolean | null | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}

export class ListProductsUseCase {
  static readonly MAX_PER_PAGE = 100;

  constructor(private readonly products: ProductRepository) {}

  async execute(restaurantId: number, query: ListProductsQuery = {}): Promise<ProductPage> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    if (page < 1 || perPage < 1 || perPage > ListProductsUseCase.MAX_PER_PAGE) {
      throw new ValidationError('page precisa ser >= 1 e perPage entre 1 e 100.', 'page');
    }
    const result = await this.products.search(restaurantId, {
      category: query.category == null ? null : Category.fromString(query.category),
      visible: query.visible ?? null,
      page,
      perPage,
    });
    return { items: result.items.map(toProductOutput), page, perPage, total: result.total };
  }
}

/**
 * Recebe os ids na nova ordem do cardápio. Os ids listados ganham as posições 1..n; os que ficaram de fora
 * vão para depois deles, mantendo a ordem relativa que já tinham.
 */
export class ReorderProductsUseCase {
  constructor(private readonly products: ProductRepository) {}

  async execute(restaurantId: number, ids: readonly number[]): Promise<void> {
    if (ids.length === 0) {
      throw new ValidationError('Informe ao menos um id de produto.', 'ids');
    }
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('A lista de ids tem repetições.', 'ids');
    }
    const existing = await this.products.idsOf(restaurantId);
    const unknown = ids.filter((id) => !existing.includes(id));
    if (unknown.length > 0) {
      throw new ValidationError(`Produtos inexistentes: ${unknown.join(', ')}.`, 'ids');
    }
    const ordered = [...ids, ...existing.filter((id) => !ids.includes(id))];
    await this.products.savePositions(restaurantId, new Map(ordered.map((id, index) => [id, index + 1])));
  }
}

/** Exclui o produto; as promoções dele saem junto (ON DELETE CASCADE no banco). */
export class DeleteProductUseCase {
  constructor(private readonly products: ProductRepository) {}

  async execute(restaurantId: number, id: number): Promise<void> {
    if ((await this.products.find(restaurantId, id)) === null) {
      throw ProductNotFound.withId(id);
    }
    await this.products.delete(restaurantId, id);
  }
}
