import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PgMenuReader, PgRestaurantRepository } from '../../src/menu/infrastructure/pg-menu.js';
import { CreateProductUseCase, ReorderProductsUseCase } from '../../src/product/application/product-use-cases.js';
import { PgProductRepository } from '../../src/product/infrastructure/pg-product-repository.js';
import { CreatePromotionUseCase } from '../../src/promotion/application/promotion-use-cases.js';
import { PgPromotionRepository } from '../../src/promotion/infrastructure/pg-promotion-repository.js';
import { Timezone } from '../../src/shared/domain/timezone.js';
import { TestDatabase } from '../support/test-database.js';

const saoPaulo = Timezone.fromString('America/Sao_Paulo');

describe('PgMenuReader (consulta única do cardápio no Postgres)', () => {
  let reader: PgMenuReader;

  beforeEach(async () => {
    const db = await TestDatabase.reset();
    reader = new PgMenuReader(db);
    const products = new PgProductRepository(db);
    const create = new CreateProductUseCase(products);
    const chopp = (await create.execute(1, { name: 'Chopp', priceCents: 1400, category: 'bebidas' })).id;
    const agua = (await create.execute(1, { name: 'Água', priceCents: 500, category: 'bebidas' })).id;
    await create.execute(1, { name: 'Pudim', priceCents: 1800, category: 'sobremesas' });
    await create.execute(1, { name: 'Bolinho', priceCents: 3200, category: 'entradas' });
    await create.execute(1, { name: 'Escondido', priceCents: 1000, category: 'entradas', visible: false });
    await create.execute(1, {
      name: 'Feijoada',
      priceCents: 6500,
      category: 'pratos_principais',
      availability: [{ weekday: 6, start: '11:00', end: '16:00' }],
    });
    await create.execute(2, { name: 'De outro restaurante', priceCents: 1000, category: 'bebidas' });
    await new ReorderProductsUseCase(products).execute(1, [agua, chopp]);
    await new CreatePromotionUseCase(products, new PgPromotionRepository(db)).execute(1, chopp, {
      description: 'Happy hour',
      priceCents: 700,
      windows: [{ weekday: 3, start: '18:00', end: '20:00' }],
    });
  });

  afterAll(() => TestDatabase.close());

  const namesAt = async (instant: string) =>
    (await reader.itemsAt(1, saoPaulo.localize(new Date(instant)))).map((item) => item.name);

  it('filtra, ordena por categoria e posição e aplica a promoção ativa', async () => {
    const items = await reader.itemsAt(1, saoPaulo.localize(new Date('2026-12-02T21:30:00Z')));

    expect(items.map((i) => i.name)).toEqual(['Bolinho', 'Pudim', 'Água', 'Chopp']);
    expect(items[3]?.promotion).toEqual({ description: 'Happy hour', price: 700, endsAt: '20:00' });
    expect(items[2]?.promotion).toBeNull();
  });

  it('janela de promoção é semiaberta: às 20:00 já acabou', async () => {
    const items = await reader.itemsAt(1, saoPaulo.localize(new Date('2026-12-02T23:00:00Z')));

    expect(items.find((i) => i.name === 'Chopp')?.promotion).toBeNull();
  });

  it('janela de disponibilidade do produto', async () => {
    expect(await namesAt('2026-12-02T21:30:00Z')).not.toContain('Feijoada');
    expect(await namesAt('2026-12-05T15:00:00Z')).toContain('Feijoada');
    expect(await namesAt('2026-12-05T19:00:00Z')).not.toContain('Feijoada'); // sábado 16:00 já fechou
  });

  it('repositório de restaurantes', async () => {
    const restaurants = new PgRestaurantRepository(TestDatabase.db());

    expect((await restaurants.find(2))?.timezone.name).toBe('Asia/Tokyo');
    expect(await restaurants.find(99)).toBeNull();
  });
});
