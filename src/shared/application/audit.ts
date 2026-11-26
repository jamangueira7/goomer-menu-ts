/** Quem fez a ação: vem do token (usuário, e-mail e restaurante) e da requisição (IP). */
export interface Actor {
  userId: number;
  email: string;
  restaurantId: number;
  ip: string | null;
}

export type EntityType = 'product' | 'promotion' | 'user';

/** O que aconteceu, sem o "quem": `changes` nunca leva senha, hash, token ou JWT. */
export interface AuditRecord {
  action: string;
  entityType: EntityType;
  entityId: number | null;
  changes: Record<string, unknown>;
}

export interface AuditEntry extends AuditRecord {
  actor: Actor;
}

/** Porta do log de auditoria (só INSERT). A hora da entrada vem do Clock, na implementação. */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}

/** Porta de transação: tudo o que roda dentro de `run` é gravado junto, ou nada é. */
export interface TransactionManager {
  run<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * Faz a escrita e grava a entrada de auditoria na mesma transação: se a escrita falhar, não há log;
 * se o log falhar, a escrita é desfeita.
 */
export class Auditor {
  constructor(
    private readonly log: AuditLog,
    private readonly transactions: TransactionManager,
  ) {}

  run<T>(actor: Actor, work: () => Promise<{ result: T; audit: AuditRecord }>): Promise<T> {
    return this.transactions.run(async () => {
      const { result, audit } = await work();
      await this.log.record({ ...audit, actor });
      return result;
    });
  }
}

/** Só os campos que mudaram, no formato `{ before: {...}, after: {...} }`. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const result = { before: {} as Record<string, unknown>, after: {} as Record<string, unknown> };
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      result.before[key] = before[key];
      result.after[key] = after[key];
    }
  }
  return result;
}
