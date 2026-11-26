import { beforeEach, describe, expect, it } from 'vitest';
import { GetMenuUseCase, type Menu } from '../../src/menu/application/get-menu.js';
import { Restaurant, RestaurantNotFound } from '../../src/menu/domain/restaurant.js';
import { CreateProductUseCase } from '../../src/product/application/product-use-cases.js';
import { CreatePromotionUseCase } from '../../src/promotion/application/promotion-use-cases.js';
import { Timezone } from '../../src/shared/domain/timezone.js';
import { FixedClock } from '../support/fixed-clock.js';
import { InMemoryMenu, InMemoryProductRepository, InMemoryPromotionRepository } from '../support/in-memory.js';

describe('GetMenuUseCase (relógio fixo, fusos diferentes)', () => {
  let menu: InMemoryMenu;
  let clock: FixedClock;

  beforeEach(async () => {
    const products = new InMemoryProductRepository();
    const promotions = new InMemoryPromotionRepository(products);
    menu = new InMemoryMenu(products, promotions);
    menu.addRestaurant(new Restaurant(1, 'Bar do João', Timezone.fromString('America/Sao_Paulo')));
    menu.addRestaurant(new Restaurant(2, 'Izakaya', Timezone.fromString('Asia/Tokyo')));
    clock = new FixedClock(); // quarta, 18:30 em São Paulo

    const create = new CreateProductUseCase(products);
    const chopp = (await create.execute(1, { name: 'Chopp 300 ml', priceCents: 1400, category: 'bebidas' })).id;
    await create.execute(1, { name: 'Pudim', priceCents: 1800, category: 'sobremesas' });
    await create.execute(1, { name: 'Bolinho', priceCents: 3200, category: 'entradas' });
    await create.execute(1, { name: 'Escondido', priceCents: 1000, category: 'entradas', visible: false });
    await create.execute(1, {
      name: 'Feijoada',
      priceCents: 6500,
      category: 'pratos_principais',
      availability: [{ weekday: 6, start: '11:00', end: '16:00' }],
    });
    await create.execute(2, {
      name: 'Lámen',
      priceCents: 4500,
      category: 'pratos_principais',
      availability: [{ weekday: 4, start: '06:00', end: '07:00' }],
    });
    await new CreatePromotionUseCase(products, promotions).execute(1, chopp, {
      description: 'Happy hour: chopp pela metade do preço',
      priceCents: 700,
      windows: [{ weekday: 3, start: '18:00', end: '20:00' }],
    });
  });

  const menuOf = (restaurant: number): Promise<Menu> => new GetMenuUseCase(menu, menu, clock).execute(restaurant);

  it('quarta às 18:30: happy hour ativo, invisível e indisponível fora', async () => {
    const result = await menuOf(1);

    expect(result.restaurant).toEqual({ id: 1, name: 'Bar do João', timezone: 'America/Sao_Paulo' });
    expect(result.generatedAt).toBe('2026-12-02T18:30:00-03:00');
    expect(result.categories.map((c) => c.name)).toEqual(['Entradas', 'Sobremesas', 'Bebidas']);
    expect(result.categories[0]?.products.map((p) => p.name)).toEqual(['Bolinho']);
    expect(result.categories[2]?.products[0]).toEqual({
      id: 1,
      name: 'Chopp 300 ml',
      price: 1400,
      promotion: { description: 'Happy hour: chopp pela metade do preço', price: 700, endsAt: '20:00' },
    });
  });

  it('a promoção acaba no fim da janela', async () => {
    clock.set('2026-12-02T23:00:00Z'); // 20:00 local

    expect((await menuOf(1)).categories[2]?.products[0]?.promotion).toBeNull();
  });

  it('feijoada aparece no sábado do almoço', async () => {
    clock.set('2026-12-05T15:00:00Z'); // sábado, 12:00 local

    expect((await menuOf(1)).categories.map((c) => c.name)).toContain('Pratos principais');
  });

  it('usa o fuso do restaurante: o mesmo instante é quinta 06:30 em Tóquio', async () => {
    const result = await menuOf(2);

    expect(result.generatedAt).toBe('2026-12-03T06:30:00+09:00');
    expect(result.categories[0]?.products[0]?.name).toBe('Lámen');
  });

  it('restaurante inexistente', async () => {
    await expect(menuOf(99)).rejects.toThrow(RestaurantNotFound);
  });
});
