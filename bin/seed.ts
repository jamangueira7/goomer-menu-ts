/*
 * Seed idempotente: restaurante "Bar do João", admin de exemplo e um cardápio pequeno.
 * Usa os próprios casos de uso, então as regras de negócio valem também aqui.
 * Uso: node dist/bin/seed.js
 */
import { loadConfig } from '../src/bootstrap/config.js';
import { createContainer } from '../src/bootstrap/container.js';

const container = createContainer(loadConfig());
const { database, users, products, promotions } = container;

try {
  if ((await database.int('SELECT count(*) FROM restaurants WHERE id = 1')) > 0) {
    console.log('Seed já aplicado; nada a fazer.');
  } else {
    await database.query("INSERT INTO restaurants (id, name, timezone) VALUES (1, 'Bar do João', 'America/Sao_Paulo')");
    await database.query("SELECT setval(pg_get_serial_sequence('restaurants', 'id'), 1)");

    await users.create.execute(1, {
      name: 'Admin do Bar do João',
      email: 'admin@bardojoao.com',
      password: 'goomer123',
    });

    const product = (name: string, priceCents: number, category: string, extra = {}) =>
      products.create.execute(1, { name, priceCents, category, ...extra });
    const chopp = await product('Chopp 300 ml', 1400, 'bebidas');
    await product('Refrigerante lata', 700, 'bebidas');
    await product('Bolinho de bacalhau (6 un.)', 3200, 'entradas');
    await product('Picanha na chapa', 8900, 'pratos_principais');
    await product('Feijoada (só sábado no almoço)', 6500, 'pratos_principais', {
      availability: [{ weekday: 6, start: '11:00', end: '16:00' }],
    });
    await product('Pudim de leite', 1800, 'sobremesas');
    await product('Prato secreto do chef', 9900, 'pratos_principais', { visible: false });

    await promotions.create.execute(1, chopp.id, {
      description: 'Happy hour: chopp pela metade do preço',
      priceCents: 700,
      windows: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '18:00', end: '20:00' })),
    });
    console.log('Seed aplicado: restaurante 1 (Bar do João), admin admin@bardojoao.com / goomer123.');
  }
} finally {
  await container.close();
}
