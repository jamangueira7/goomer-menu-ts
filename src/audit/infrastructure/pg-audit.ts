import type { AuditEntry, AuditLog, TransactionManager } from '../../shared/application/audit.js';
import type { Clock } from '../../shared/domain/clock.js';
import type { Database } from '../../shared/infrastructure/database.js';
import type { AuditLogReader, AuditSearch, StoredAuditEntry } from '../application/list-audit-logs.js';

/** Só INSERT: nenhum caso de uso atualiza ou apaga log. A hora vem do Clock, não do now() do banco. */
export class PgAuditLog implements AuditLog {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs
         (restaurant_id, actor_user_id, actor_email, action, entity_type, entity_id, changes, ip, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::inet, $9)`,
      [
        entry.actor.restaurantId,
        entry.actor.userId,
        entry.actor.email,
        entry.action,
        entry.entityType,
        entry.entityId,
        JSON.stringify(entry.changes),
        entry.actor.ip,
        this.clock.now(),
      ],
    );
  }
}

/** A transação do `Database` (o mesmo cliente do pool para tudo o que roda dentro). */
export class PgTransactionManager implements TransactionManager {
  constructor(private readonly db: Database) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.db.transactional(work);
  }
}

interface AuditRow {
  id: number;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  changes: Record<string, unknown>;
  ip: string | null;
  created_at: Date;
}

export class PgAuditLogReader implements AuditLogReader {
  constructor(private readonly db: Database) {}

  async search(query: AuditSearch): Promise<{ items: StoredAuditEntry[]; total: number }> {
    const where = 'restaurant_id = $1 AND actor_user_id = $2 AND created_at >= $3 AND created_at < $4';
    const params = [query.restaurantId, query.actorUserId, query.from, query.until];
    const total = await this.db.int(`SELECT count(*) FROM audit_logs WHERE ${where}`, params);
    const rows = await this.db.query<AuditRow>(
      `SELECT id, actor_email, action, entity_type, entity_id, changes, host(ip) AS ip, created_at
       FROM audit_logs WHERE ${where}
       ORDER BY created_at DESC, id DESC LIMIT $5 OFFSET $6`,
      [...params, query.perPage, (query.page - 1) * query.perPage],
    );
    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        actorEmail: row.actor_email,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        changes: row.changes,
        ip: row.ip,
        createdAt: row.created_at,
      })),
    };
  }

  async lastActorEmail(restaurantId: number, actorUserId: number): Promise<string | null> {
    const row = await this.db.one<{ actor_email: string }>(
      `SELECT actor_email FROM audit_logs WHERE restaurant_id = $1 AND actor_user_id = $2
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [restaurantId, actorUserId],
    );
    return row?.actor_email ?? null;
  }
}
