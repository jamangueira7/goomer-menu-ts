import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

// bigint (count(*), ids BIGSERIAL) vira number: os ids do projeto cabem com folga no inteiro seguro do JS.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
}

export type Params = readonly unknown[];

/** SQLSTATE do Postgres que os repositórios traduzem em erro de domínio. */
export const SqlState = {
  UNIQUE_VIOLATION: '23505',
  EXCLUSION_VIOLATION: '23P01',
} as const;

export function sqlStateOf(error: unknown): string | null {
  return error instanceof pg.DatabaseError ? (error.code ?? null) : null;
}

/**
 * Embrulho fino sobre o `pg.Pool`: SQL à mão com parâmetros posicionais ($1, $2...) e transações.
 * Dentro de `transactional`, todas as consultas usam o mesmo cliente (AsyncLocalStorage), sem passar
 * a conexão de mão em mão pelos repositórios.
 */
export class Database {
  private readonly scope = new AsyncLocalStorage<pg.PoolClient>();

  constructor(private readonly pool: pg.Pool) {}

  static connect(config: DatabaseConfig): Database {
    return new Database(
      new pg.Pool({
        host: config.host,
        port: config.port,
        database: config.name,
        user: config.user,
        password: config.password,
        max: 10,
      }),
    );
  }

  async query<T extends pg.QueryResultRow>(sql: string, params: Params = []): Promise<T[]> {
    const runner = this.scope.getStore() ?? this.pool;
    const result = await runner.query<T>(sql, [...params]);
    return result.rows;
  }

  async one<T extends pg.QueryResultRow>(sql: string, params: Params = []): Promise<T | null> {
    return (await this.query<T>(sql, params))[0] ?? null;
  }

  async int(sql: string, params: Params = []): Promise<number> {
    const row = await this.one<Record<string, unknown>>(sql, params);
    const value = row === null ? 0 : Object.values(row)[0];
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  async transactional<T>(work: () => Promise<T>): Promise<T> {
    if (this.scope.getStore() !== undefined) {
      return work();
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.scope.run(client, work);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
