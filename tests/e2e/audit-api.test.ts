import { describe, expect, it } from 'vitest';
import { Api, ADMIN_EMAIL } from './api-harness.js';

interface AuditPage {
  data: {
    action: string;
    entityType: string;
    entityId: number | null;
    changes: Record<string, unknown>;
    ip: string;
    createdAt: string;
  }[];
  user: { id: number; email: string };
  meta: { page: number; perPage: number; total: number };
}

describe('log de auditoria (ponta a ponta)', () => {
  const api = Api.setup();

  const adminId = () => api.db.int('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);

  it('produto e promoção criados, alterados e excluídos aparecem no log do admin', async () => {
    const token = await api.login();
    const chopp = await api.createProduct(token, { name: 'Chopp', price: 1400, category: 'bebidas' });
    await api.request(
      'PUT',
      `/api/v1/products/${chopp}`,
      { name: 'Chopp 500 ml', price: 1900, category: 'bebidas' },
      token,
    );
    const promotion = await api.request(
      'POST',
      '/api/v1/promotions',
      { productId: chopp, description: 'HH', price: 700, windows: [{ weekday: 3, start: '18:00', end: '20:00' }] },
      token,
    );
    const promotionId = promotion.json<{ id: number }>().id;
    await api.request(
      'PUT',
      `/api/v1/promotions/${promotionId}`,
      { description: 'HH', price: 650, windows: [{ weekday: 3, start: '18:00', end: '20:00' }] },
      token,
    );
    await api.request('DELETE', `/api/v1/products/${chopp}`, undefined, token);

    const response = await api.request(
      'GET',
      `/api/v1/users/${await adminId()}/audit-logs?dateIni=2026-12-02`,
      undefined,
      token,
    );

    expect(response.statusCode, response.body).toBe(200);
    const page = response.json<AuditPage>();
    expect(page.data.map((e) => e.action)).toEqual([
      'product.deleted',
      'promotion.updated',
      'promotion.created',
      'product.updated',
      'product.created',
      'user.created',
    ]);
    expect(page.data[0]).toMatchObject({
      entityType: 'product',
      entityId: chopp,
      ip: '10.0.0.1',
      createdAt: '2026-12-02T18:30:00-03:00',
      changes: { before: { name: 'Chopp 500 ml', promotionsDeleted: 1 } },
    });
    expect(page.data[1]?.changes).toEqual({ before: { price: 700 }, after: { price: 650 } });
    expect(page.user).toEqual({ id: await adminId(), email: ADMIN_EMAIL });
    expect(page.meta).toEqual({ page: 1, perPage: 50, total: 6 });
    expect(response.body).not.toMatch(/goomer123|argon2|accessToken/);
  });

  it('filtro com e sem dateEnd, no fuso do restaurante', async () => {
    const token = await api.login();
    api.clock.set('2026-11-25T13:00:00Z');
    await api.createProduct(token, { name: 'A', price: 100, category: 'bebidas' });
    api.clock.set('2026-12-01T13:00:00Z');
    const fresh = await api.login();
    await api.createProduct(fresh, { name: 'B', price: 100, category: 'bebidas' });
    const url = `/api/v1/users/${await adminId()}/audit-logs`;

    const range = await api.request('GET', `${url}?dateIni=2026-11-25&dateEnd=2026-11-25`, undefined, fresh);
    const open = await api.request('GET', `${url}?dateIni=2026-11-25`, undefined, fresh);

    expect(range.json<AuditPage>().data.map((e) => e.changes)).toEqual([
      { after: expect.objectContaining({ name: 'A' }) },
    ]);
    expect(open.json<AuditPage>().meta.total).toBe(2);
    expect(token).not.toBe(fresh);
  });

  it('usuário excluído ainda tem log; outro restaurante é 404; sem token é 401; datas inválidas são 422', async () => {
    const token = await api.login();
    const bia = await api.request(
      'POST',
      '/api/v1/users',
      { name: 'Bia', email: 'bia@bardojoao.com', password: 'senha-da-bia' },
      token,
    );
    const biaId = bia.json<{ id: number }>().id;
    const biaToken = await api.login('bia@bardojoao.com', 'senha-da-bia');
    await api.createProduct(biaToken, { name: 'Da Bia', price: 100, category: 'bebidas' });
    await api.request('DELETE', `/api/v1/users/${biaId}`, undefined, token);

    const deleted = await api.request('GET', `/api/v1/users/${biaId}/audit-logs?dateIni=2026-12-02`, undefined, token);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json<AuditPage>().user).toEqual({ id: biaId, email: 'bia@bardojoao.com' });
    expect(deleted.json<AuditPage>().data.map((e) => e.action)).toEqual(['product.created']);

    await api.db.query(
      "INSERT INTO users (restaurant_id, name, email, password_hash) VALUES (2, 'Caio', 'caio@izakaya.jp', 'x')",
    );
    const foreign = await api.db.int("SELECT id FROM users WHERE email = 'caio@izakaya.jp'");
    expect(
      (await api.request('GET', `/api/v1/users/${foreign}/audit-logs?dateIni=2026-12-02`, undefined, token)).statusCode,
    ).toBe(404);
    expect((await api.request('GET', `/api/v1/users/${biaId}/audit-logs?dateIni=2026-12-02`)).statusCode).toBe(401);

    const invalid = await api.request(
      'GET',
      `/api/v1/users/${biaId}/audit-logs?dateIni=2026-12-02&dateEnd=2026-12-01`,
      undefined,
      token,
    );
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json<{ errors: Record<string, string> }>().errors).toHaveProperty('dateEnd');
    const missing = await api.request('GET', `/api/v1/users/${biaId}/audit-logs`, undefined, token);
    expect(missing.json<{ errors: Record<string, string> }>().errors).toHaveProperty('dateIni');
    expect(
      (await api.request('GET', `/api/v1/users/${biaId}/audit-logs?dateIni=ontem`, undefined, token)).statusCode,
    ).toBe(422);
  });

  it('recuperação de senha entra no log do dono da conta', async () => {
    await api.request('POST', '/api/v1/auth/forgot-password', { email: ADMIN_EMAIL });
    const token = await api.login();

    const page = (
      await api.request('GET', `/api/v1/users/${await adminId()}/audit-logs?dateIni=2026-12-02`, undefined, token)
    ).json<AuditPage>();

    expect(page.data.map((e) => e.action)).toEqual(['auth.password_reset_requested', 'user.created']);
  });
});
