import { toTimeWindows, toWindowData, type WindowData } from '../../shared/application/window-data.js';
import { Money } from '../../shared/domain/money.js';
import type { Product } from '../../product/domain/product.js';
import { ProductNotFound, type ProductRepository } from '../../product/domain/product-repository.js';
import { Promotion, PromotionNotFound, type PromotionChanges } from '../domain/promotion.js';
import type { PromotionRepository } from '../domain/promotion-repository.js';

/** Descrição, preço e janelas de uma promoção (entrada de criação e de atualização). */
export interface PromotionData {
  description: string;
  priceCents: number;
  windows: WindowData[];
}

export interface PromotionOutput {
  id: number;
  productId: number;
  description: string;
  price: number;
  windows: WindowData[];
}

export function toPromotionOutput(promotion: Promotion): PromotionOutput {
  return {
    id: promotion.id,
    productId: promotion.productId,
    description: promotion.description,
    price: promotion.price.cents,
    windows: toWindowData(promotion.windows),
  };
}

function changesFrom(product: Product, data: PromotionData): PromotionChanges {
  return {
    regularPrice: product.price,
    description: data.description,
    price: Money.ofCents(data.priceCents),
    windows: toTimeWindows(data.windows),
  };
}

export class CreatePromotionUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(restaurantId: number, productId: number, data: PromotionData): Promise<PromotionOutput> {
    const product = await this.products.find(restaurantId, productId);
    if (product === null) {
      throw ProductNotFound.withId(productId);
    }
    const promotion = Promotion.create(await this.promotions.nextId(), product.id, changesFrom(product, data));
    promotion.assertNoOverlapWith(await this.promotions.ofProduct(product.id));
    await this.promotions.save(promotion);
    return toPromotionOutput(promotion);
  }
}

export class UpdatePromotionUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(restaurantId: number, id: number, data: PromotionData): Promise<PromotionOutput> {
    const promotion = await this.promotions.find(restaurantId, id);
    const product = promotion && (await this.products.find(restaurantId, promotion.productId));
    if (!promotion || !product) {
      throw PromotionNotFound.withId(id);
    }
    promotion.update(changesFrom(product, data));
    promotion.assertNoOverlapWith(await this.promotions.ofProduct(product.id));
    await this.promotions.save(promotion);
    return toPromotionOutput(promotion);
  }
}

export class GetPromotionUseCase {
  constructor(private readonly promotions: PromotionRepository) {}

  async execute(restaurantId: number, id: number): Promise<PromotionOutput> {
    const promotion = await this.promotions.find(restaurantId, id);
    if (promotion === null) {
      throw PromotionNotFound.withId(id);
    }
    return toPromotionOutput(promotion);
  }
}

export class ListPromotionsUseCase {
  constructor(private readonly promotions: PromotionRepository) {}

  async execute(restaurantId: number, productId: number | null = null): Promise<PromotionOutput[]> {
    return (await this.promotions.ofRestaurant(restaurantId, productId)).map(toPromotionOutput);
  }
}

export class DeletePromotionUseCase {
  constructor(private readonly promotions: PromotionRepository) {}

  async execute(restaurantId: number, id: number): Promise<void> {
    const promotion = await this.promotions.find(restaurantId, id);
    if (promotion === null) {
      throw PromotionNotFound.withId(id);
    }
    await this.promotions.delete(promotion.id);
  }
}
