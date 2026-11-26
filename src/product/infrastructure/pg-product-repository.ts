import { Money } from '../../shared/domain/money.js';
import type { Database } from '../../shared/infrastructure/database.js';
import { groupWindows, type WindowRow } from '../../shared/infrastructure/rows.js';
import { Category } from '../domain/category.js';
import { Product } from '../domain/product.js';
import type { ProductRepository, ProductSearch } from '../domain/product-repository.js';

interface ProductRow {
  id: number;
  restaurant_id: number;
  name: string;
  price_cents: number;
  category: string;
  visible: boolean;
  position: number;
}

const COLUMNS = 'id, restaurant_id, name, price_cents, category, visible, position';

export class PgProductRepository implements ProductRepository {
  constructor(private readonly db: Database) {}

  nextId(): Promise<number> {
    return this.db.int("SELECT nextval(pg_get_serial_sequence('products', 'id'))");
  }

  async save(product: Product): Promise<void> {
    await this.db.transactional(async () => {
      await this.db.query(
        `INSERT INTO products (id, restaurant_id, name, price_cents, category, visible, position)
         VALUES ($1, $2, $3, $4, $5::product_category, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           price_cents = EXCLUDED.price_cents,
           category = EXCLUDED.category,
           visible = EXCLUDED.visible,
           position = EXCLUDED.position,
           updated_at = now()`,
        [
          product.id,
          product.restaurantId,
          product.name,
          product.price.cents,
          product.category.value,
          product.visible,
          product.position,
        ],
      );
      await this.db.query('DELETE FROM product_availability WHERE product_id = $1', [product.id]);
      for (const window of product.availability) {
        await this.db.query(
          `INSERT INTO product_availability (product_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3::time, $4::time)`,
          [product.id, window.weekday.value, window.start.format(), window.end.format()],
        );
      }
    });
  }

  async find(restaurantId: number, id: number): Promise<Product | null> {
    const rows = await this.db.query<ProductRow>(
      `SELECT ${COLUMNS} FROM products WHERE id = $1 AND restaurant_id = $2`,
      [id, restaurantId],
    );
    return (await this.hydrate(rows))[0] ?? null;
  }

  async search(restaurantId: number, filter: ProductSearch): Promise<{ items: Product[]; total: number }> {
    const params: unknown[] = [restaurantId];
    let where = 'restaurant_id = $1';
    if (filter.category !== null) {
      params.push(filter.category.value);
      where += ` AND category = $${params.length}::product_category`;
    }
    if (filter.visible !== null) {
      params.push(filter.visible);
      where += ` AND visible = $${params.length}`;
    }
    const total = await this.db.int(`SELECT count(*) FROM products WHERE ${where}`, params);
    const limit = params.length + 1;
    const rows = await this.db.query<ProductRow>(
      `SELECT ${COLUMNS} FROM products WHERE ${where} ORDER BY position, id LIMIT $${limit} OFFSET $${limit + 1}`,
      [...params, filter.perPage, (filter.page - 1) * filter.perPage],
    );
    return { items: await this.hydrate(rows), total };
  }

  lastPosition(restaurantId: number): Promise<number> {
    return this.db.int('SELECT COALESCE(max(position), 0) FROM products WHERE restaurant_id = $1', [restaurantId]);
  }

  async idsOf(restaurantId: number): Promise<number[]> {
    const rows = await this.db.query<{ id: number }>(
      'SELECT id FROM products WHERE restaurant_id = $1 ORDER BY position, id',
      [restaurantId],
    );
    return rows.map((row) => row.id);
  }

  async savePositions(restaurantId: number, positions: ReadonlyMap<number, number>): Promise<void> {
    // Um UPDATE só, com os pares (id, posição) desenrolados de dois arrays.
    await this.db.query(
      `UPDATE products p SET position = v.position, updated_at = now()
       FROM unnest($2::bigint[], $3::int[]) AS v(id, position)
       WHERE p.id = v.id AND p.restaurant_id = $1`,
      [restaurantId, [...positions.keys()], [...positions.values()]],
    );
  }

  async delete(restaurantId: number, id: number): Promise<void> {
    await this.db.query('DELETE FROM products WHERE id = $1 AND restaurant_id = $2', [id, restaurantId]);
  }

  private async hydrate(rows: readonly ProductRow[]): Promise<Product[]> {
    if (rows.length === 0) {
      return [];
    }
    const windows = groupWindows(
      await this.db.query<WindowRow>(
        `SELECT product_id AS owner_id, weekday, start_time, end_time FROM product_availability
         WHERE product_id = ANY($1::bigint[]) ORDER BY weekday, start_time`,
        [rows.map((row) => row.id)],
      ),
    );
    return rows.map((row) =>
      Product.restore({
        id: row.id,
        restaurantId: row.restaurant_id,
        name: row.name,
        price: Money.ofCents(row.price_cents),
        category: Category.fromString(row.category),
        visible: row.visible,
        position: row.position,
        availability: windows.get(row.id) ?? [],
      }),
    );
  }
}
