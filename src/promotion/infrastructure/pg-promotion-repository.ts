import { Money } from '../../shared/domain/money.js';
import { SqlState, sqlStateOf, type Database } from '../../shared/infrastructure/database.js';
import { groupWindows, type WindowRow } from '../../shared/infrastructure/rows.js';
import { OverlappingPromotion, Promotion } from '../domain/promotion.js';
import type { PromotionRepository } from '../domain/promotion-repository.js';

interface PromotionRow {
  id: number;
  product_id: number;
  description: string;
  promo_price_cents: number;
}

export class PgPromotionRepository implements PromotionRepository {
  constructor(private readonly db: Database) {}

  nextId(): Promise<number> {
    return this.db.int("SELECT nextval(pg_get_serial_sequence('promotions', 'id'))");
  }

  async save(promotion: Promotion): Promise<void> {
    try {
      await this.db.transactional(async () => {
        await this.db.query(
          `INSERT INTO promotions (id, product_id, description, promo_price_cents)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             description = EXCLUDED.description,
             promo_price_cents = EXCLUDED.promo_price_cents,
             updated_at = now()`,
          [promotion.id, promotion.productId, promotion.description, promotion.price.cents],
        );
        await this.db.query('DELETE FROM promotion_windows WHERE promotion_id = $1', [promotion.id]);
        for (const window of promotion.windows) {
          await this.db.query(
            `INSERT INTO promotion_windows (promotion_id, product_id, weekday, start_time, end_time)
             VALUES ($1, $2, $3, $4::time, $5::time)`,
            [promotion.id, promotion.productId, window.weekday.value, window.start.format(), window.end.format()],
          );
        }
      });
    } catch (error) {
      if (sqlStateOf(error) === SqlState.EXCLUSION_VIOLATION) {
        throw new OverlappingPromotion('Já existe outra promoção deste produto nesse dia e horário.', {
          cause: error,
        });
      }
      throw error;
    }
  }

  async find(restaurantId: number, id: number): Promise<Promotion | null> {
    const rows = await this.db.query<PromotionRow>(
      `SELECT pr.id, pr.product_id, pr.description, pr.promo_price_cents
       FROM promotions pr JOIN products p ON p.id = pr.product_id
       WHERE pr.id = $1 AND p.restaurant_id = $2`,
      [id, restaurantId],
    );
    return (await this.hydrate(rows))[0] ?? null;
  }

  async ofProduct(productId: number): Promise<Promotion[]> {
    return this.hydrate(
      await this.db.query<PromotionRow>(
        'SELECT id, product_id, description, promo_price_cents FROM promotions WHERE product_id = $1 ORDER BY id',
        [productId],
      ),
    );
  }

  async ofRestaurant(restaurantId: number, productId: number | null): Promise<Promotion[]> {
    // `$2::bigint IS NULL` deixa o filtro opcional sem montar SQL por concatenação.
    return this.hydrate(
      await this.db.query<PromotionRow>(
        `SELECT pr.id, pr.product_id, pr.description, pr.promo_price_cents
         FROM promotions pr JOIN products p ON p.id = pr.product_id
         WHERE p.restaurant_id = $1 AND ($2::bigint IS NULL OR pr.product_id = $2)
         ORDER BY pr.id`,
        [restaurantId, productId],
      ),
    );
  }

  async delete(id: number): Promise<void> {
    await this.db.query('DELETE FROM promotions WHERE id = $1', [id]);
  }

  private async hydrate(rows: readonly PromotionRow[]): Promise<Promotion[]> {
    if (rows.length === 0) {
      return [];
    }
    const windows = groupWindows(
      await this.db.query<WindowRow>(
        `SELECT promotion_id AS owner_id, weekday, start_time, end_time FROM promotion_windows
         WHERE promotion_id = ANY($1::bigint[]) ORDER BY weekday, start_time`,
        [rows.map((row) => row.id)],
      ),
    );
    return rows.map((row) =>
      Promotion.restore(
        row.id,
        row.product_id,
        row.description,
        Money.ofCents(row.promo_price_cents),
        windows.get(row.id) ?? [],
      ),
    );
  }
}
