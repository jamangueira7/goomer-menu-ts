import { defineConfig } from 'vitest/config';

/**
 * Quatro níveis, cada um num projeto do Vitest:
 *   unit e usecase       sem banco, em milissegundos;
 *   integration e e2e    Postgres real (Testcontainers), com o banco limpo a cada teste.
 * Os arquivos rodam um de cada vez: os níveis com banco dividem o mesmo Postgres e o mesmo Mailpit.
 */
const database = {
  globalSetup: ['tests/support/global-setup.ts'],
  testTimeout: 30_000,
  hookTimeout: 180_000,
};

export default defineConfig({
  test: {
    fileParallelism: false,
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      { extends: true, test: { name: 'usecase', include: ['tests/usecase/**/*.test.ts'] } },
      { extends: true, test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], ...database } },
      { extends: true, test: { name: 'e2e', include: ['tests/e2e/**/*.test.ts'], ...database } },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'text', 'json-summary'],
      reportsDirectory: 'coverage',
      // Meta do plano: 90% em domínio e casos de uso. As camadas de fora entram no relatório, sem meta.
      thresholds: {
        'src/*/domain/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        'src/*/application/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
    },
  },
});
