import { beforeEach, describe, expect, it } from 'vitest';
import { ListAuditLogsUseCase } from '../../src/audit/application/list-audit-logs.js';
import { ForgotPasswordUseCase, ResetPasswordUseCase } from '../../src/auth/application/auth-use-cases.js';
import { Restaurant } from '../../src/menu/domain/restaurant.js';
import { CreateProductUseCase } from '../../src/product/application/product-use-cases.js';
import { Auditor, changedFields, type AuditLog } from '../../src/shared/application/audit.js';
import { ValidationError } from '../../src/shared/domain/errors.js';
import { Timezone } from '../../src/shared/domain/timezone.js';
import { CreateUserUseCase, DeleteUserUseCase } from '../../src/user/application/user-use-cases.js';
import { UserNotFound } from '../../src/user/domain/user.js';
import { FixedClock } from '../support/fixed-clock.js';
import {
  actorOf,
  AuthFakes,
  FakeHasher,
  InMemoryAuditLog,
  InMemoryMenu,
  InMemoryProductRepository,
  InMemoryPromotionRepository,
  InMemoryUserRepository,
} from '../support/in-memory.js';

describe('log de auditoria nos casos de uso', () => {
  let clock: FixedClock;
  let audit: InMemoryAuditLog;
  let users: InMemoryUserRepository;
  let products: InMemoryProductRepository;
  let restaurants: InMemoryMenu;
  let adminId: number;

  beforeEach(async () => {
    clock = new FixedClock(); // quarta, 2/12/2026, 18:30 em São Paulo
    audit = new InMemoryAuditLog(clock);
    users = new InMemoryUserRepository();
    products = new InMemoryProductRepository();
    restaurants = new InMemoryMenu(products, new InMemoryPromotionRepository(products));
    restaurants.addRestaurant(new Restaurant(1, 'Bar do João', Timezone.fromString('America/Sao_Paulo')));
    restaurants.addRestaurant(new Restaurant(2, 'Izakaya', Timezone.fromString('Asia/Tokyo')));
    adminId = (
      await new CreateUserUseCase(users, new FakeHasher(), audit.auditor()).execute(1, {
        name: 'Admin',
        email: 'admin@bardojoao.com',
        password: 'goomer123',
      })
    ).id;
  });

  const list = () => new ListAuditLogsUseCase(restaurants, users, audit, clock);
  const admin = () => actorOf(1, adminId);

  it('sem ninguém logado (seed, create-admin), o próprio usuário criado assina o log', () => {
    expect(audit.entries[0]).toMatchObject({
      actor: { userId: adminId, email: 'admin@bardojoao.com', restaurantId: 1, ip: null },
      action: 'user.created',
      entityId: adminId,
      changes: { after: { name: 'Admin', email: 'admin@bardojoao.com' } },
    });
    expect(JSON.stringify(audit.entries)).not.toContain('goomer123');
  });

  it('pela rota, quem cria é o ator do token; nunca grava senha nem hash', async () => {
    await new CreateUserUseCase(users, new FakeHasher(), audit.auditor()).execute(
      1,
      { name: 'Bia', email: 'bia@bardojoao.com', password: 'senha-da-bia' },
      admin(),
    );

    expect(audit.entries[1]?.actor.userId).toBe(adminId);
    expect(JSON.stringify(audit.entries)).not.toMatch(/senha-da-bia|hashed:/);
  });

  it('recuperação de senha: pedido e troca ficam no log do dono da conta, sem o token', async () => {
    const fakes = new AuthFakes();
    const forgot = new ForgotPasswordUseCase(users, fakes, fakes, fakes, clock, audit.auditor(), 'http://x/reset');
    await forgot.execute('admin@bardojoao.com', '10.9.9.9');
    await forgot.execute('ninguem@bardojoao.com', '10.9.9.9');
    await new ResetPasswordUseCase(users, fakes, new FakeHasher(), clock, audit.auditor()).execute(
      fakes.lastToken(),
      'senha-nova-123',
      '10.9.9.9',
    );

    expect(audit.entries.slice(1)).toEqual([
      expect.objectContaining({
        action: 'auth.password_reset_requested',
        actor: { userId: adminId, email: 'admin@bardojoao.com', restaurantId: 1, ip: '10.9.9.9' },
        entityType: 'user',
        entityId: adminId,
        changes: {},
      }),
      expect.objectContaining({ action: 'auth.password_reset', entityId: adminId, changes: {} }),
    ]);
    expect(JSON.stringify(audit.entries)).not.toContain(fakes.lastToken());
  });

  it('se o log falha, o erro sobe (a transação de verdade desfaz a escrita)', async () => {
    const broken: AuditLog = { record: () => Promise.reject(new Error('disco cheio')) };
    const create = new CreateProductUseCase(products, new Auditor(broken, audit));

    await expect(create.execute(admin(), { name: 'Chopp', priceCents: 1400, category: 'bebidas' })).rejects.toThrow(
      'disco cheio',
    );
  });

  it('changedFields guarda só o que mudou', () => {
    expect(changedFields({ a: 1, b: [1], c: 'x' }, { a: 1, b: [2], c: 'y' })).toEqual({
      before: { b: [1], c: 'x' },
      after: { b: [2], c: 'y' },
    });
  });

  describe('ListAuditLogsUseCase', () => {
    beforeEach(async () => {
      const create = new CreateProductUseCase(products, audit.auditor());
      clock.set('2026-11-25T13:00:00Z'); // 25/11 10:00 local
      await create.execute(admin(), { name: 'A', priceCents: 100, category: 'bebidas' });
      clock.set('2026-11-27T02:30:00Z'); // 26/11 23:30 local (27/11 em UTC)
      await create.execute(admin(), { name: 'B', priceCents: 100, category: 'bebidas' });
      clock.set('2026-12-02T21:30:00Z');
      await create.execute(admin(), { name: 'C', priceCents: 100, category: 'bebidas' });
    });

    it('filtra por dias inclusivos no fuso do restaurante, mais recente primeiro', async () => {
      const page = await list().execute(1, adminId, { dateIni: '2026-11-25', dateEnd: '2026-11-26' });

      expect(page.data.map((e) => e.changes)).toEqual([
        { after: expect.objectContaining({ name: 'B' }) },
        { after: expect.objectContaining({ name: 'A' }) },
      ]);
      expect(page.data[0]).toMatchObject({
        action: 'product.created',
        entityType: 'product',
        ip: '10.0.0.1',
        createdAt: '2026-11-26T23:30:00-03:00',
      });
      expect(page.user).toEqual({ id: adminId, email: 'admin@bardojoao.com' });
      expect(page.meta).toEqual({ page: 1, perPage: 50, total: 2 });
    });

    it('sem dateEnd vai até agora, e pagina', async () => {
      const all = await list().execute(1, adminId, { dateIni: '2026-11-01' });
      const second = await list().execute(1, adminId, { dateIni: '2026-11-01', page: 2, perPage: 2 });

      expect(all.meta.total).toBe(4); // user.created (seed) + 3 produtos
      expect(second.data).toHaveLength(2);
      expect(second.meta).toEqual({ page: 2, perPage: 2, total: 4 });
    });

    it('usuário excluído ainda tem log; de outro restaurante ou inexistente é 404', async () => {
      const bia = await new CreateUserUseCase(users, new FakeHasher(), audit.auditor()).execute(1, {
        name: 'Bia',
        email: 'bia@bardojoao.com',
        password: 'senha-da-bia',
      });
      await new DeleteUserUseCase(users, audit.auditor()).execute(admin(), bia.id);

      const log = await list().execute(1, bia.id, { dateIni: '2026-12-01' });
      expect(log.user).toEqual({ id: bia.id, email: 'bia@bardojoao.com' });
      expect(log.data.map((e) => e.action)).toEqual(['user.created']);
      await expect(list().execute(2, adminId, { dateIni: '2026-11-01' })).rejects.toThrow(UserNotFound);
      await expect(list().execute(1, 999, { dateIni: '2026-11-01' })).rejects.toThrow(UserNotFound);
    });

    it('datas inválidas e paginação fora da faixa são 422', async () => {
      const run = (query: Parameters<ListAuditLogsUseCase['execute']>[2]) => list().execute(1, adminId, query);

      await expect(run({ dateIni: '2026-02-30' })).rejects.toMatchObject({ field: 'dateIni' });
      await expect(run({ dateIni: '2026-11-26', dateEnd: '2026-11-25' })).rejects.toMatchObject({ field: 'dateEnd' });
      await expect(run({ dateIni: '25/11/2026' })).rejects.toThrow(ValidationError);
      await expect(run({ dateIni: '2026-11-25', perPage: 101 })).rejects.toThrow(ValidationError);
      await expect(list().execute(99, adminId, { dateIni: '2026-11-25' })).rejects.toThrow('Restaurante 99');
    });
  });
});
