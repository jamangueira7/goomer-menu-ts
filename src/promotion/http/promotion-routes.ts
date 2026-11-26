import { Type, type Static } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { actorOf, authOf } from '../../auth/http/jwt-guard.js';
import { bodyOf, intFromQuery, QueryInt, queryOf, routeId, WindowSchema } from '../../shared/http/http-kit.js';
import type {
  CreatePromotionUseCase,
  DeletePromotionUseCase,
  GetPromotionUseCase,
  ListPromotionsUseCase,
  PromotionData,
  UpdatePromotionUseCase,
} from '../application/promotion-use-cases.js';

const PromotionBody = Type.Object({
  description: Type.String({ examples: ['Happy hour: chopp pela metade do preço'] }),
  price: Type.Integer({ description: 'Preço promocional em centavos, menor que o normal', examples: [700] }),
  windows: Type.Array(WindowSchema, { description: 'Dias e horários em que a promoção vale' }),
});
const CreateBody = Type.Object({ productId: Type.Integer({ examples: [1] }), ...PromotionBody.properties });
const ListQuery = Type.Object({ productId: Type.Optional(QueryInt) });
const IdParams = Type.Object({ id: Type.String() });

export interface PromotionRouteDeps {
  list: ListPromotionsUseCase;
  create: CreatePromotionUseCase;
  get: GetPromotionUseCase;
  update: UpdatePromotionUseCase;
  delete: DeletePromotionUseCase;
}

function promotionData(body: Static<typeof PromotionBody>): PromotionData {
  return { description: body.description, priceCents: body.price, windows: body.windows };
}

export function promotionRoutes(app: FastifyInstance, deps: PromotionRouteDeps): void {
  const tags = ['Promoções'];
  const security = [{ bearerAuth: [] }];

  app.get(
    '/promotions',
    { schema: { tags, security, summary: 'Lista promoções, com filtro productId', querystring: ListQuery } },
    async (request) => {
      const productId = intFromQuery(queryOf(request, ListQuery).productId) ?? null;
      return { data: await deps.list.execute(authOf(request).restaurantId, productId) };
    },
  );

  app.post(
    '/promotions',
    { schema: { tags, security, summary: 'Cria promoção (409 se a janela se sobrepõe)', body: CreateBody } },
    async (request, reply) => {
      const body = bodyOf(request, CreateBody);
      const output = await deps.create.execute(actorOf(request), body.productId, promotionData(body));
      return reply.code(201).header('Location', `/api/v1/promotions/${output.id}`).send(output);
    },
  );

  app.get('/promotions/:id', { schema: { tags, security, summary: 'Detalha', params: IdParams } }, (request) =>
    deps.get.execute(authOf(request).restaurantId, routeId(request)),
  );

  app.put(
    '/promotions/:id',
    {
      schema: { tags, security, summary: 'Atualiza descrição, preço e janelas', params: IdParams, body: PromotionBody },
    },
    (request) => deps.update.execute(actorOf(request), routeId(request), promotionData(bodyOf(request, PromotionBody))),
  );

  app.delete(
    '/promotions/:id',
    { schema: { tags, security, summary: 'Exclui a promoção', params: IdParams } },
    async (request, reply) => {
      await deps.delete.execute(actorOf(request), routeId(request));
      return reply.code(204).send();
    },
  );
}
