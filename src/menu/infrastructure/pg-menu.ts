import { Timezone } from '../../shared/domain/timezone.js';
import type { LocalMoment } from '../../shared/domain/local-moment.js';
import type { Database } from '../../shared/infrastructure/database.js';
import type { MenuItem, MenuReader } from '../application/get-menu.js';
import { Restaurant, type RestaurantRepository } from '../domain/restaurant.js';

interface MenuRow {
  id: number;
  name: string;
  category: string;
  price_cents: number;
  promo_description: string | null;
  promo_price_cents: number | null;
  promo_ends_at: string | null;
}

/**
 * O cardápio sai de uma única consulta: visibilidade, disponibilidade, promoção ativa (LEFT JOIN LATERAL)
 * e ordenação por categoria (ordem do ENUM), posição e nome. Dia e hora locais entram como $2 e $3.
 */
const MENU_SQL = `
  SELECT p.id, p.name, p.category, p.price_cents,
         pr.description AS promo_description, pr.promo_price_cents,
         to_char(w.end_time, 'HH24:MI') AS promo_ends_at
  FROM products p
  LEFT JOIN LATERAL (
    SELECT pw.promotion_id, pw.end_time
    FROM promotion_windows pw
    WHERE pw.product_id = p.id AND pw.weekday = $2
      AND $3::time >= pw.start_time AND $3::time < pw.end_time
    LIMIT 1
  ) w ON TRUE
  LEFT JOIN promotions pr ON pr.id = w.promotion_id
  WHERE p.restaurant_id = $1
    AND p.visible
    AND (NOT EXISTS (SELECT 1 FROM product_availability a WHERE a.product_id = p.id)
         OR EXISTS (SELECT 1 FROM product_availability a
                    WHERE a.product_id = p.id AND a.weekday = $2
                      AND $3::time >= a.start_time AND $3::time < a.end_time))
  ORDER BY p.category, p.position, p.name`;

export class PgMenuReader implements MenuReader {
  constructor(private readonly db: Database) {}

  async itemsAt(restaurantId: number, moment: LocalMoment): Promise<MenuItem[]> {
    const rows = await this.db.query<MenuRow>(MENU_SQL, [restaurantId, moment.weekday.value, moment.time]);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      price: row.price_cents,
      promotion:
        row.promo_description === null || row.promo_price_cents === null || row.promo_ends_at === null
          ? null
          : { description: row.promo_description, price: row.promo_price_cents, endsAt: row.promo_ends_at },
    }));
  }
}

export class PgRestaurantRepository implements RestaurantRepository {
  constructor(private readonly db: Database) {}

  async find(id: number): Promise<Restaurant | null> {
    const row = await this.db.one<{ id: number; name: string; timezone: string }>(
      'SELECT id, name, timezone FROM restaurants WHERE id = $1',
      [id],
    );
    return row === null ? null : new Restaurant(row.id, row.name, Timezone.fromString(row.timezone));
  }
}
