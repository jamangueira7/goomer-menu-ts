import { loadConfig } from './bootstrap/config.js';
import { createContainer } from './bootstrap/container.js';
import { buildHttpApp } from './bootstrap/http-app.js';

const container = createContainer(loadConfig());
const app = await buildHttpApp(container);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => container.close());
  });
}

await app.listen({ host: '0.0.0.0', port: container.config.port });
