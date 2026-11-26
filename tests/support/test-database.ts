import { loadConfig } from '../../src/bootstrap/config.js';
import { Database } from '../../src/shared/infrastructure/database.js';

let database: Database | null = null;

/**
 * Banco de teste (o Postgres do Testcontainers, configurado pelo global-setup), limpo a cada teste.
 * Por segurança, recusa rodar num banco cujo nome não termine em `_test`.
 */
export const TestDatabase = {
  db(): Database {
    if (database === null) {
      const config = loadConfig({ JWT_SECRET: 'nao-usado-aqui', ...process.env }).database;
      if (!config.name.endsWith('_test')) {
        throw new Error(`Recusando rodar testes no banco "${config.name}": o nome precisa terminar em _test.`);
      }
      database = Database.connect(config);
    }
    return database;
  },

  /** Limpa tudo e recria os restaurantes 1 (São Paulo) e 2 (Tóquio). */
  async reset(): Promise<Database> {
    const db = TestDatabase.db();
    await db.query(
      `TRUNCATE restaurants, products, product_availability, promotions, promotion_windows, users,
       password_reset_tokens, password_reset_requests RESTART IDENTITY CASCADE`,
    );
    await db.query(
      `INSERT INTO restaurants (id, name, timezone) VALUES
       (1, 'Bar do João', 'America/Sao_Paulo'), (2, 'Izakaya', 'Asia/Tokyo')`,
    );
    await db.query("SELECT setval(pg_get_serial_sequence('restaurants', 'id'), 2)");
    return db;
  },

  async close(): Promise<void> {
    await database?.close();
    database = null;
  },
};
