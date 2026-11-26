import type { Promotion } from './promotion.js';

export interface PromotionRepository {
  nextId(): Promise<number>;
  /** Grava a promoção e as janelas. Lança OverlappingPromotion se o banco recusar a sobreposição. */
  save(promotion: Promotion): Promise<void>;
  /** Só devolve a promoção se o produto dela for do restaurante informado. */
  find(restaurantId: number, id: number): Promise<Promotion | null>;
  ofProduct(productId: number): Promise<Promotion[]>;
  ofRestaurant(restaurantId: number, productId: number | null): Promise<Promotion[]>;
  delete(id: number): Promise<void>;
}
