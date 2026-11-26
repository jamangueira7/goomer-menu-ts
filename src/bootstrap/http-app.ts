import swagger from '@fastify/swagger';
import { auditRoutes } from '../audit/http/audit-routes.js';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { authRoutes } from '../auth/http/auth-routes.js';
import { jwtGuard } from '../auth/http/jwt-guard.js';
import { menuRoutes } from '../menu/http/menu-routes.js';
import { productRoutes } from '../product/http/product-routes.js';
import { promotionRoutes } from '../promotion/http/promotion-routes.js';
import { registerJsonParser, registerNotFound } from '../shared/http/http-kit.js';
import { problemDetailsHandler } from '../shared/http/problem-details.js';
import { userRoutes } from '../user/http/user-routes.js';
import type { Container } from './container.js';

/**
 * Monta o Fastify a partir do container (usado pelo server.ts e pelos testes de ponta a ponta).
 * As rotas sem token ficam fora do escopo protegido de propósito; o escopo protegido tem um único
 * hook JWT, sem lista de exceções.
 */
export async function buildHttpApp(
  container: Container,
  options: FastifyServerOptions = { logger: true },
): Promise<FastifyInstance> {
  const app = Fastify({
    ...options,
    // Sem coerção de tipos: "10" no lugar de 10 é 422, não conversão silenciosa. allErrors junta os campos.
    ajv: { customOptions: { coerceTypes: false, allErrors: true, removeAdditional: false } },
  });
  app.decorateRequest('auth', null);
  app.setErrorHandler(problemDetailsHandler);
  registerJsonParser(app);
  registerNotFound(app);

  if (container.config.appEnv === 'dev') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Goomer Menu API',
          version: '1.0.0',
          description: 'Produtos, promoções com dia e hora e o cardápio do momento no fuso do restaurante.',
        },
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      },
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  await app.register(
    async (v1) => {
      // Públicas
      menuRoutes(v1, container.menu);
      authRoutes(v1, container.auth);
      // Protegidas
      await v1.register((protectedScope, _options, done) => {
        protectedScope.addHook('onRequest', jwtGuard(container.accessTokens));
        productRoutes(protectedScope, container.products);
        promotionRoutes(protectedScope, container.promotions);
        userRoutes(protectedScope, container.users);
        auditRoutes(protectedScope, container.audit);
        done();
      });
    },
    { prefix: '/api/v1' },
  );

  await app.ready();
  return app;
}
