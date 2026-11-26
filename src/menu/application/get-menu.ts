import type { Clock } from '../../shared/domain/clock.js';
import type { LocalMoment } from '../../shared/domain/local-moment.js';
import { Category } from '../../product/domain/category.js';
import { RestaurantNotFound, type RestaurantRepository } from '../domain/restaurant.js';

/** Linha do cardápio já filtrada: produto visível e disponível, com a promoção ativa (se houver). */
export interface MenuItem {
  id: number;
  name: string;
  category: string;
  price: number;
  promotion: { description: string; price: number; endsAt: string } | null;
}

/** Consulta de leitura do cardápio (no Postgres, uma única query com LEFT JOIN LATERAL). */
export interface MenuReader {
  /** Produtos visíveis e disponíveis no momento local, ordenados por categoria, posição e nome. */
  itemsAt(restaurantId: number, moment: LocalMoment): Promise<MenuItem[]>;
}

export interface Menu {
  restaurant: { id: number; name: string; timezone: string };
  generatedAt: string;
  categories: {
    key: string;
    name: string;
    products: { id: number; name: string; price: number; promotion: MenuItem['promotion'] }[];
  }[];
}

export class GetMenuUseCase {
  constructor(
    private readonly restaurants: RestaurantRepository,
    private readonly reader: MenuReader,
    private readonly clock: Clock,
  ) {}

  async execute(restaurantId: number): Promise<Menu> {
    const restaurant = await this.restaurants.find(restaurantId);
    if (restaurant === null) {
      throw RestaurantNotFound.withId(restaurantId);
    }
    const moment = restaurant.timezone.localize(this.clock.now());
    const items = await this.reader.itemsAt(restaurant.id, moment);
    const categories = Category.all
      .map((category) => ({
        key: category.value,
        name: category.label,
        products: items
          .filter((item) => item.category === category.value)
          .map(({ id, name, price, promotion }) => ({ id, name, price, promotion })),
      }))
      .filter((category) => category.products.length > 0);
    return {
      restaurant: { id: restaurant.id, name: restaurant.name, timezone: restaurant.timezone.name },
      generatedAt: moment.iso,
      categories,
    };
  }
}
