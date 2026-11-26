import { describe, expect, it } from 'vitest';
import { Api } from './api-harness.js';

describe('cardápio público (ponta a ponta)', () => {
  const api = Api.setup();

  it('quarta às 18:30, com o happy hour ativo, sem token', async () => {
    const token = await api.login();
    const chopp = await api.createProduct(token, { name: 'Chopp 300 ml', price: 1400, category: 'bebidas' });
    await api.createProduct(token, { name: 'Bolinho', price: 3200, category: 'entradas' });
    await api.createProduct(token, { name: 'Secreto', price: 9900, category: 'pratos_principais', visible: false });
    await api.createProduct(token, {
      name: 'Feijoada',
      price: 6500,
      category: 'pratos_principais',
      availability: [{ weekday: 6, start: '11:00', end: '16:00' }],
    });
    await api.request(
      'POST',
      '/api/v1/promotions',
      {
        productId: chopp,
        description: 'Happy hour: chopp pela metade do preço',
        price: 700,
        windows: [{ weekday: 3, start: '18:00', end: '20:00' }],
      },
      token,
    );

    const response = await api.request('GET', '/api/v1/restaurants/1/menu');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      restaurant: { id: 1, name: 'Bar do João', timezone: 'America/Sao_Paulo' },
      generatedAt: '2026-12-02T18:30:00-03:00',
      categories: [
        {
          key: 'entradas',
          name: 'Entradas',
          products: [{ id: chopp + 1, name: 'Bolinho', price: 3200, promotion: null }],
        },
        {
          key: 'bebidas',
          name: 'Bebidas',
          products: [
            {
              id: chopp,
              name: 'Chopp 300 ml',
              price: 1400,
              promotion: { description: 'Happy hour: chopp pela metade do preço', price: 700, endsAt: '20:00' },
            },
          ],
        },
      ],
    });
  });

  it('depois do happy hour e restaurante desconhecido', async () => {
    const token = await api.login();
    const chopp = await api.createProduct(token, { name: 'Chopp', price: 1400, category: 'bebidas' });
    await api.request(
      'POST',
      '/api/v1/promotions',
      { productId: chopp, description: 'HH', price: 700, windows: [{ weekday: 3, start: '18:00', end: '20:00' }] },
      token,
    );
    api.clock.set('2026-12-02T23:00:00Z');

    const menu = (await api.request('GET', '/api/v1/restaurants/1/menu')).json<{ categories: unknown }>();

    expect(menu.categories).toEqual([
      { key: 'bebidas', name: 'Bebidas', products: [{ id: chopp, name: 'Chopp', price: 1400, promotion: null }] },
    ]);
    expect((await api.request('GET', '/api/v1/restaurants/99/menu')).statusCode).toBe(404);
    expect((await api.request('GET', '/api/v1/restaurants/x/menu')).statusCode).toBe(404);
  });
});
