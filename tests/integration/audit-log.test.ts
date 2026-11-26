import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ListAuditLogsUseCase } from '../../src/audit/application/list-audit-logs.js';
import { PgAuditLog, PgAuditLogReader, PgTransactionManager } from '../../src/audit/infrastructure/pg-audit.js';
import { PgRestaurantRepository } from '../../src/menu/infrastructure/pg-menu.js';
import { CreateProductUseCase } from '../../src/product/application/product-use-cases.js';
import { PgProductRepository } from '../../src/product/infrastructure/pg-product-repository.js';
import { Auditor, type AuditLog } from '../../src/shared/application/audit.js';
import type { Database } from '../../src/shared/infrastructure/database.js';
import { PgUserRepository } from '../../src/user/infrastructure/pg-user-repository.js';
import { FixedClock } from '../support/fixed-clock.js';
import { actorOf } from '../support/in-memory.js';
import { TestDatabase } from '../support/test-database.js';

describe('log de auditoria no Postgres', () => {
  let db: Database;
  let clock: FixedClock;
  let log: PgAuditLog;

  beforeEach(async () => {
    db = await TestDatabase.reset();
    clock = new FixedClock();
    log = new PgAuditLog(db, clock);
  });

  afterAll(() => TestDatabase.close());

  const createProduct = (auditLog: AuditLog) =>
    new CreateProductUseCase(new PgProductRepository(db), new Auditor(auditLog, new PgTransactionManager(db)));

  it('grava a entrada com jsonb, inet e a hora do Clock', async () => {
    await createProduct(log).execute(actorOf(1, 7, 'ana@bar.com'), {
      name: 'Chopp',
      priceCents: 1400,
      category: 'bebidas',
    });

    const row = await db.one<Record<string, unknown>>(
      'SELECT actor_user_id, actor_email, action, entity_type, entity_id, changes, host(ip) AS ip, created_at FROM audit_logs',
    );
    expect(row).toEqual({
      actor_user_id: 7,
      actor_email: 'ana@bar.com',
      action: 'product.created',
      entity_type: 'product',
      entity_id: 1,
      changes: {
        after: { name: 'Chopp', price: 1400, category: 'bebidas', visible: true, position: 1, availability: [] },
      },
      ip: '10.0.0.1',
      created_at: new Date('2026-12-02T21:30:00Z'),
    });
  });

  it('se o INSERT do log falha, a escrita é desfeita (mesma transação)', async () => {
    const failing: AuditLog = {
      record: (entry) => log.record({ ...entry, actor: { ...entry.actor, ip: 'não é um ip' } }),
    };

    await expect(
      createProduct(failing).execute(actorOf(1), { name: 'Chopp', priceCents: 1400, category: 'bebidas' }),
    ).rejects.toThrow();
    expect(await db.int('SELECT count(*) FROM products')).toBe(0);
    expect(await db.int('SELECT count(*) FROM audit_logs')).toBe(0);
  });

  it('filtra por período no fuso do restaurante, pagina e mantém o log de usuário excluído', async () => {
    const create = createProduct(log);
    const ana = actorOf(1, 7, 'ana@bar.com');
    for (const [instant, name] of [
      ['2026-11-25T03:00:00Z', 'Antes'], // 25/11 00:00 em São Paulo: primeiro instante do dia
      ['2026-11-27T02:59:59Z', 'Último'], // 26/11 23:59:59 em São Paulo
      ['2026-11-27T03:00:00Z', 'Depois'], // 27/11 00:00: já fora
    ] as const) {
      clock.set(instant);
      await create.execute(ana, { name, priceCents: 100, category: 'bebidas' });
    }
    await create.execute(actorOf(2, 7, 'ana@bar.com'), { name: 'Tóquio', priceCents: 100, category: 'bebidas' });
    clock.set('2026-12-02T21:30:00Z');

    const list = new ListAuditLogsUseCase(
      new PgRestaurantRepository(db),
      new PgUserRepository(db),
      new PgAuditLogReader(db),
      clock,
    );
    const page = await list.execute(1, 7, { dateIni: '2026-11-25', dateEnd: '2026-11-26' });

    expect(page.data.map((e) => (e.changes['after'] as { name: string }).name)).toEqual(['Último', 'Antes']);
    expect(page.data[0]?.createdAt).toBe('2026-11-26T23:59:59-03:00');
    expect(page.user).toEqual({ id: 7, email: 'ana@bar.com' }); // o usuário 7 não existe mais na tabela users
    expect((await list.execute(1, 7, { dateIni: '2026-11-25' })).meta.total).toBe(3);
    expect((await list.execute(1, 7, { dateIni: '2026-11-25', perPage: 1, page: 3 })).data).toHaveLength(1);
    await expect(list.execute(1, 8, { dateIni: '2026-11-25' })).rejects.toThrow('Usuário 8 não encontrado.');
  });
});
