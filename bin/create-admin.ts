/*
 * Cria um usuário administrador num restaurante existente.
 * Uso: node dist/bin/create-admin.js --email=ana@bar.com --password=segredo123 [--name="Ana"] [--restaurant=1]
 */
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/bootstrap/config.js';
import { createContainer } from '../src/bootstrap/container.js';
import { DomainError } from '../src/shared/domain/errors.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string', default: 'Administrador' },
    restaurant: { type: 'string', default: '1' },
  },
});

if (!values.email || !values.password) {
  console.error('Uso: create-admin --email=<e-mail> --password=<senha> [--name=<nome>] [--restaurant=<id>]');
  process.exit(1);
}

const container = createContainer(loadConfig());
try {
  const user = await container.users.create.execute(Number(values.restaurant), {
    name: values.name,
    email: values.email,
    password: values.password,
  });
  console.log(`Usuário ${user.id} criado: ${user.email} (restaurante ${user.restaurantId}).`);
} catch (error) {
  if (!(error instanceof DomainError)) {
    throw error;
  }
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
} finally {
  await container.close();
}
