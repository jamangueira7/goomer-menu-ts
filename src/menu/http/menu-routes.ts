import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { routeId } from '../../shared/http/http-kit.js';
import type { GetMenuUseCase } from '../application/get-menu.js';

/** Rota pública: o cardápio não pede token. */
export function menuRoutes(app: FastifyInstance, menu: GetMenuUseCase): void {
  app.get(
    '/restaurants/:id/menu',
    {
      schema: {
        tags: ['Cardápio'],
        summary: 'Cardápio consolidado (público)',
        description:
          'Só produtos visíveis e disponíveis agora no fuso do restaurante, agrupados por categoria, com a promoção ativa.',
        params: Type.Object({ id: Type.String() }),
      },
    },
    (request) => menu.execute(routeId(request)),
  );
}
