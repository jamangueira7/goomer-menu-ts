import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Category } from '../../src/product/domain/category.js';
import { Product } from '../../src/product/domain/product.js';
import { PgProductRepository } from '../../src/product/infrastructure/pg-product-repository.js';
import { OverlappingPromotion, Promotion } from '../../src/promotion/domain/promotion.js';
import { PgPromotionRepository } from '../../src/promotion/infrastructure/pg-promotion-repository.js';
import { Money } from '../../src/shared/domain/money.js';
import { TimeWindow } from '../../src/shared/domain/time-window.js';
import type { Database } from '../../src/shared/infrastructure/database.js';
import { TestDatabase } from '../support/test-database.js';

describe('repositórios pg de produtos e promoções', () => {
  let db: Database;
  let products: PgProductRepository;
  let promotions: PgPromotionRepository;

  beforeEach(async () => {
    db = await TestDatabase.reset();
    products = new PgProductRepository(db);
    promotions = new PgPromotionRepository(db);
  });

  afterAll(() => TestDatabase.close());

  async function product(restaurant: number, name: string, category = Category.Drinks): Promise<Product> {
    const created = Product.create({
      id: await products.nextId(),
      restaurantId: restaurant,
      name,
      price: Money.ofCents(1400),
      category,
      visible: true,
      position: (await products.lastPosition(restaurant)) + 1,
      availability: [TimeWindow.fromStrings(6, '11:00', '16:00')],
    });
    await products.save(created);
    return created;
  }

  async function promotion(productOf: Product, description: string, windows: TimeWindow[]): Promise<Promotion> {
    return Promotion.create(await promotions.nextId(), productOf.id, {
      regularPrice: productOf.price,
      description,
      price: Money.ofCents(700),
      windows,
    });
  }

  it('grava e reconstitui produto com disponibilidade', async () => {
    const saved = await product(1, 'Feijoada', Category.MainCourses);
    const found = await products.find(1, saved.id);

    expect(found?.name).toBe('Feijoada');
    expect(found?.category).toBe(Category.MainCourses);
    expect(found?.availability[0]?.end.format()).toBe('16:00');
    expect(await products.find(2, saved.id)).toBeNull(); // outro restaurante não enxerga

    found?.update({
      name: 'Feijoada completa',
      price: Money.ofCents(7000),
      category: Category.MainCourses,
      visible: false,
      availability: [],
    });
    await products.save(found!);
    const again = await products.find(1, saved.id);
    expect(again?.availability).toEqual([]);
    expect(again?.visible).toBe(false);
    expect(again?.price.cents).toBe(7000);
  });

  it('busca com filtros, pagina e reordena', async () => {
    const a = await product(1, 'A');
    const b = await product(1, 'B', Category.Desserts);
    const c = await product(1, 'C');
    await product(2, 'Outro');
    const search = (category: Category | null, visible: boolean | null, page = 1, perPage = 10) =>
      products.search(1, { category, visible, page, perPage });

    expect((await search(null, null)).total).toBe(3);
    expect((await search(Category.Desserts, true)).total).toBe(1);
    expect((await search(null, false)).total).toBe(0);
    expect((await search(null, null, 2, 2)).items[0]?.name).toBe('C');

    await products.savePositions(
      1,
      new Map([
        [c.id, 1],
        [a.id, 2],
        [b.id, 3],
      ]),
    );
    expect(await products.idsOf(1)).toEqual([c.id, a.id, b.id]);
    expect(await products.lastPosition(1)).toBe(3);
  });

  it('promoção vai e volta, e some em cascata com o produto', async () => {
    const chopp = await product(1, 'Chopp');
    const happyHour = await promotion(chopp, 'Happy hour', [
      TimeWindow.fromStrings(3, '18:00', '20:00'),
      TimeWindow.fromStrings(4, '18:00', '20:00'),
    ]);
    await promotions.save(happyHour);

    expect((await promotions.find(1, happyHour.id))?.windows).toHaveLength(2);
    expect(await promotions.find(2, happyHour.id)).toBeNull();
    expect(await promotions.ofRestaurant(1, chopp.id)).toHaveLength(1);
    expect(await promotions.ofRestaurant(1, null)).toHaveLength(1);
    expect(await promotions.ofRestaurant(1, 999)).toHaveLength(0);
    expect(await promotions.ofProduct(chopp.id)).toHaveLength(1);

    await products.delete(1, chopp.id);
    expect(await promotions.ofProduct(chopp.id)).toEqual([]);
    expect(await db.int('SELECT count(*) FROM promotion_windows')).toBe(0);
  });

  it('o banco recusa janelas sobrepostas do mesmo produto (EXCLUDE USING gist)', async () => {
    const chopp = await product(1, 'Chopp');
    await promotions.save(await promotion(chopp, 'Primeira', [TimeWindow.fromStrings(3, '18:00', '20:00')]));

    // Sem a checagem do domínio: a restrição do banco é a segunda linha de defesa.
    const second = await promotion(chopp, 'Segunda', [TimeWindow.fromStrings(3, '19:45', '21:00')]);
    await expect(promotions.save(second)).rejects.toThrow(OverlappingPromotion);
    expect(await promotions.ofProduct(chopp.id)).toHaveLength(1); // a transação foi desfeita

    const adjacent = await promotion(chopp, 'Encostada', [TimeWindow.fromStrings(3, '20:00', '21:00')]);
    await promotions.save(adjacent);
    expect(await promotions.ofProduct(chopp.id)).toHaveLength(2);
    await promotions.delete(adjacent.id);
    expect(await promotions.ofProduct(chopp.id)).toHaveLength(1);
  });

  it('CHECKs e ENUM protegem horários, preços e categorias', async () => {
    const chopp = await product(1, 'Chopp');
    const invalid = [
      `INSERT INTO product_availability VALUES (${chopp.id}, 1, '10:10', '11:00')`,
      `INSERT INTO product_availability VALUES (${chopp.id}, 1, '10:00', '10:00')`,
      `INSERT INTO product_availability VALUES (${chopp.id}, 7, '10:00', '11:00')`,
      "INSERT INTO products (restaurant_id, name, price_cents, category) VALUES (1, 'Grátis', 0, 'bebidas')",
      "INSERT INTO products (restaurant_id, name, price_cents, category) VALUES (1, 'X', 100, 'lanches')",
    ];
    for (const sql of invalid) {
      await expect(db.query(sql), sql).rejects.toThrow();
    }
  });
});
