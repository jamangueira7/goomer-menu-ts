import { changedFields, type Actor, type Auditor } from '../../shared/application/audit.js';
import { toTimeWindows } from '../../shared/application/window-data.js';
import { ValidationError } from '../../shared/domain/errors.js';
import { Money } from '../../shared/domain/money.js';
import type { PromotionRepository } from '../../promotion/domain/promotion-repository.js';
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

/** Retrato do produto para o log de auditoria (a saída, sem o id, que já vai em entity_id). */
function snapshot(output: ProductOutput): Record<string, unknown> {
  const { id: _id, ...fields } = output;
  return fields;
}

async function findOrFail(products: ProductRepository, restaurantId: number, id: number): Promise<Product> {
  const product = await products.find(restaurantId, id);
  if (product === null) {
    throw ProductNotFound.withId(id);
  }
  return product;
}

export class CreateProductUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly auditor: Auditor,
  ) {}

  execute(actor: Actor, data: ProductData): Promise<ProductOutput> {
    return this.auditor.run(actor, async () => {
      const changes = changesFrom(data);
      const product = Product.create({
        ...changes,
        id: await this.products.nextId(),
        restaurantId: actor.restaurantId,
        position: (await this.products.lastPosition(actor.restaurantId)) + 1,
      });
      await this.products.save(product);
      const result = toProductOutput(product);
      return {
        result,
        audit: {
          action: 'product.created',
          entityType: 'product',
          entityId: result.id,
          changes: { after: snapshot(result) },
        },
      };
    });
  }
}

export class GetProductUseCase {
  constructor(private readonly products: ProductRepository) {}

  async execute(restaurantId: number, id: number): Promise<ProductOutput> {
    return toProductOutput(await findOrFail(this.products, restaurantId, id));
  }
}

export class UpdateProductUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly auditor: Auditor,
  ) {}

  execute(actor: Actor, id: number, data: ProductData): Promise<ProductOutput> {
    return this.auditor.run(actor, async () => {
      const product = await findOrFail(this.products, actor.restaurantId, id);
      const before = snapshot(toProductOutput(product));
      product.update(changesFrom(data));
      await this.products.save(product);
      const result = toProductOutput(product);
      return {
        result,
        audit: {
          action: 'product.updated',
          entityType: 'product',
          entityId: id,
          changes: changedFields(before, snapshot(result)),
        },
      };
    });
  }
}

export class ChangeProductVisibilityUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly auditor: Auditor,
  ) {}

  execute(actor: Actor, id: number, visible: boolean): Promise<ProductOutput> {
    return this.auditor.run(actor, async () => {
      const product = await findOrFail(this.products, actor.restaurantId, id);
      const before = product.visible;
      if (visible) {
        product.show();
      } else {
        product.hide();
      }
      await this.products.save(product);
      return {
        result: toProductOutput(product),
        audit: {
          action: 'product.visibility_changed',
          entityType: 'product',
          entityId: id,
          changes: { before: { visible: before }, after: { visible } },
        },
      };
    });
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
  constructor(
    private readonly products: ProductRepository,
    private readonly auditor: Auditor,
  ) {}

  async execute(actor: Actor, ids: readonly number[]): Promise<void> {
    if (ids.length === 0) {
      throw new ValidationError('Informe ao menos um id de produto.', 'ids');
    }
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('A lista de ids tem repetições.', 'ids');
    }
    await this.auditor.run(actor, async () => {
      const existing = await this.products.idsOf(actor.restaurantId);
      const unknown = ids.filter((id) => !existing.includes(id));
      if (unknown.length > 0) {
        throw new ValidationError(`Produtos inexistentes: ${unknown.join(', ')}.`, 'ids');
      }
      const ordered = [...ids, ...existing.filter((id) => !ids.includes(id))];
      await this.products.savePositions(actor.restaurantId, new Map(ordered.map((id, index) => [id, index + 1])));
      return {
        result: undefined,
        audit: { action: 'product.reordered', entityType: 'product', entityId: null, changes: { after: { ids } } },
      };
    });
  }
}

/** Exclui o produto; as promoções dele saem junto (ON DELETE CASCADE no banco), e o log conta quantas. */
export class DeleteProductUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly promotions: PromotionRepository,
    private readonly auditor: Auditor,
  ) {}

  async execute(actor: Actor, id: number): Promise<void> {
    await this.auditor.run(actor, async () => {
      const product = await findOrFail(this.products, actor.restaurantId, id);
      const promotionsDeleted = (await this.promotions.ofProduct(id)).length;
      await this.products.delete(actor.restaurantId, id);
      return {
        result: undefined,
        audit: {
          action: 'product.deleted',
          entityType: 'product',
          entityId: id,
          changes: { before: { ...snapshot(toProductOutput(product)), promotionsDeleted } },
        },
      };
    });
  }
}
