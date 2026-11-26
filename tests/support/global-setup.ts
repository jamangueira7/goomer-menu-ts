import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Sobe um Postgres 16 descartável com o Testcontainers, aplica as migrations do Prisma e passa a conexão
 * para os testes pelas mesmas variáveis DB_* que a API lê. Os projetos `integration` e `e2e` usam este
 * arquivo; o segundo a chamar reaproveita o container do primeiro.
 */
const state = globalThis as typeof globalThis & { goomerPostgres?: StartedPostgreSqlContainer };

export default async function setup(): Promise<() => Promise<void>> {
  if (state.goomerPostgres !== undefined) {
    return () => Promise.resolve();
  }
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('goomer_test')
    .withUsername('goomer')
    .withPassword('goomer')
    .start();
  state.goomerPostgres = container;

  Object.assign(process.env, {
    DB_HOST: container.getHost(),
    DB_PORT: String(container.getPort()),
    DB_NAME: container.getDatabase(),
    DB_USER: container.getUsername(),
    DB_PASSWORD: container.getPassword(),
  });
  execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: 'pipe',
  });

  return async () => {
    await container.stop();
    delete state.goomerPostgres;
  };
}
