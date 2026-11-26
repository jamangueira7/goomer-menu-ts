import { describe, expect, it } from 'vitest';
import { Api, ADMIN_EMAIL } from './api-harness.js';

const PROBLEM_JSON = /^application\/problem\+json/;

describe('produtos e promoções (ponta a ponta)', () => {
  const api = Api.setup();

  it('rotas protegidas exigem token válido', async () => {
    for (const url of ['/api/v1/products', '/api/v1/promotions', '/api/v1/users']) {
      const response = await api.request('GET', url);
      expect(response.statusCode, url).toBe(401);
      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(response.headers['www-authenticate']).toBe('Bearer');
    }
    expect((await api.request('GET', '/api/v1/products', undefined, 'lixo')).statusCode).toBe(401);

    const token = await api.login();
    api.clock.advanceMinutes(61);
    expect((await api.request('GET', '/api/v1/products', undefined, token)).statusCode, 'token vencido').toBe(401);
  });

  it('login com senha errada é 401; corpo errado é 422; JSON quebrado é 400', async () => {
    expect(
      (await api.request('POST', '/api/v1/auth/login', { email: ADMIN_EMAIL, password: 'errada' })).statusCode,
    ).toBe(401);
    expect((await api.request('POST', '/api/v1/auth/login', { email: 1 })).statusCode).toBe(422);
    expect((await api.request('POST', '/api/v1/auth/login', '{não é json')).statusCode).toBe(400);
  });

  it('CRUD de produto', async () => {
    const token = await api.login();
    const create = await api.request(
      'POST',
      '/api/v1/products',
      {
        name: 'Chopp 300 ml',
        price: 1400,
        category: 'bebidas',
        availability: [{ weekday: 3, start: '17:00', end: '23:00' }],
      },
      token,
    );
    expect(create.statusCode).toBe(201);
    const product = create.json<{ id: number; visible: boolean }>();
    expect(create.headers['location']).toBe(`/api/v1/products/${product.id}`);
    expect(product.visible).toBe(true);
    const url = `/api/v1/products/${product.id}`;

    expect((await api.request('GET', url, undefined, token)).json<{ name: string }>().name).toBe('Chopp 300 ml');
    const put = await api.request('PUT', url, { name: 'Chopp 500 ml', price: 1900, category: 'bebidas' }, token);
    expect(put.statusCode).toBe(200);
    expect(put.json<{ availability: unknown }>().availability).toEqual([]);
    const hide = await api.request('PATCH', `${url}/visibility`, { visible: false }, token);
    expect(hide.json<{ visible: boolean }>().visible).toBe(false);
    const list = await api.request('GET', '/api/v1/products?visible=false&category=bebidas', undefined, token);
    expect(list.json<{ meta: unknown }>().meta).toEqual({ page: 1, perPage: 20, total: 1 });
    expect((await api.request('DELETE', url, undefined, token)).statusCode).toBe(204);
    expect((await api.request('GET', url, undefined, token)).statusCode).toBe(404);
    expect((await api.request('GET', '/api/v1/products/abc', undefined, token)).statusCode).toBe(404);
  });

  it('erros de validação saem em Problem Details', async () => {
    const token = await api.login();
    const response = await api.request(
      'POST',
      '/api/v1/products',
      { name: 'X', price: '10', category: 'bebidas' },
      token,
    );
    expect(response.statusCode).toBe(422);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
    const problem = response.json<{ status: number; errors: Record<string, string> }>();
    expect(problem.status).toBe(422);
    expect(problem.errors).toHaveProperty('price');

    const badTime = await api.request(
      'POST',
      '/api/v1/products',
      { name: 'X', price: 100, category: 'bebidas', availability: [{ weekday: 1, start: '10:10', end: '11:00' }] },
      token,
    );
    expect(badTime.statusCode).toBe(422);
    expect(
      (await api.request('POST', '/api/v1/products', { name: 'X', price: 100, category: 'lanches' }, token)).statusCode,
    ).toBe(422);
    expect((await api.request('GET', '/api/v1/products?visible=talvez', undefined, token)).statusCode).toBe(422);
  });

  it('produtos de outro restaurante são invisíveis', async () => {
    await api.db.query(
      "INSERT INTO products (restaurant_id, name, price_cents, category) VALUES (2, 'Lámen', 4500, 'pratos_principais')",
    );
    const foreignId = await api.db.int('SELECT id FROM products WHERE restaurant_id = 2');
    const token = await api.login();

    expect((await api.request('GET', `/api/v1/products/${foreignId}`, undefined, token)).statusCode).toBe(404);
    expect((await api.request('DELETE', `/api/v1/products/${foreignId}`, undefined, token)).statusCode).toBe(404);
    expect((await api.request('GET', '/api/v1/products', undefined, token)).json<{ meta: unknown }>().meta).toEqual({
      page: 1,
      perPage: 20,
      total: 0,
    });
  });

  it('reordena os produtos', async () => {
    const token = await api.login();
    const a = await api.createProduct(token, { name: 'A', price: 100, category: 'bebidas' });
    const b = await api.createProduct(token, { name: 'B', price: 100, category: 'bebidas' });

    expect((await api.request('PUT', '/api/v1/products/order', { ids: [b, a] }, token)).statusCode).toBe(204);
    const data = (await api.request('GET', '/api/v1/products', undefined, token)).json<{ data: { id: number }[] }>()
      .data;
    expect(data.map((p) => p.id)).toEqual([b, a]);
    expect((await api.request('PUT', '/api/v1/products/order', { ids: [999] }, token)).statusCode).toBe(422);
  });

  it('regras e CRUD de promoção', async () => {
    const token = await api.login();
    const chopp = await api.createProduct(token, { name: 'Chopp', price: 1400, category: 'bebidas' });
    const happyHour = {
      productId: chopp,
      description: 'Happy hour',
      price: 700,
      windows: [{ weekday: 3, start: '18:00', end: '20:00' }],
    };
    const post = (body: Record<string, unknown>) => api.request('POST', '/api/v1/promotions', body, token);

    const create = await post(happyHour);
    expect(create.statusCode, create.body).toBe(201);
    const id = create.json<{ id: number }>().id;
    expect(create.headers['location']).toBe(`/api/v1/promotions/${id}`);

    expect((await post({ ...happyHour, windows: [{ weekday: 3, start: '19:00', end: '21:00' }] })).statusCode).toBe(
      409,
    );
    expect((await post({ ...happyHour, price: 1400 })).statusCode, 'preço >= normal').toBe(422);
    expect(
      (await post({ ...happyHour, windows: [{ weekday: 4, start: '18:00', end: '18:10' }] })).statusCode,
      '15 min',
    ).toBe(422);
    expect(
      (await post({ ...happyHour, windows: [{ weekday: 5, start: '22:00', end: '02:00' }] })).statusCode,
      'meia-noite',
    ).toBe(422);
    expect((await post({ ...happyHour, productId: 999 })).statusCode).toBe(404);

    const put = await api.request(
      'PUT',
      `/api/v1/promotions/${id}`,
      { description: 'Happy hour estendido', price: 650, windows: [{ weekday: 3, start: '17:00', end: '20:00' }] },
      token,
    );
    expect(put.statusCode, put.body).toBe(200);
    expect(
      (await api.request('GET', `/api/v1/promotions/${id}`, undefined, token)).json<{ description: string }>()
        .description,
    ).toBe('Happy hour estendido');
    const filtered = await api.request('GET', `/api/v1/promotions?productId=${chopp}`, undefined, token);
    expect(filtered.json<{ data: unknown[] }>().data).toHaveLength(1);
    expect((await api.request('DELETE', `/api/v1/promotions/${id}`, undefined, token)).statusCode).toBe(204);
    expect((await api.request('GET', `/api/v1/promotions/${id}`, undefined, token)).statusCode).toBe(404);
  });

  it('excluir o produto exclui as promoções dele', async () => {
    const token = await api.login();
    const chopp = await api.createProduct(token, { name: 'Chopp', price: 1400, category: 'bebidas' });
    await api.request(
      'POST',
      '/api/v1/promotions',
      { productId: chopp, description: 'HH', price: 700, windows: [{ weekday: 3, start: '18:00', end: '20:00' }] },
      token,
    );
    await api.request('DELETE', `/api/v1/products/${chopp}`, undefined, token);

    expect((await api.request('GET', '/api/v1/promotions', undefined, token)).json<{ data: unknown }>().data).toEqual(
      [],
    );
  });

  it('rota desconhecida é 404 e método errado é 405', async () => {
    expect((await api.request('GET', '/api/v1/nada')).statusCode).toBe(404);
    const wrongMethod = await api.request('DELETE', '/api/v1/auth/login');
    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers['allow']).toBe('POST');
  });
});
