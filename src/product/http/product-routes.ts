import { Type, type Static } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { actorOf, authOf } from '../../auth/http/jwt-guard.js';
import { bodyOf, intFromQuery, QueryInt, queryOf, routeId, WindowSchema } from '../../shared/http/http-kit.js';
import type { ProductData } from '../application/product-dto.js';
import type {
  ChangeProductVisibilityUseCase,
  CreateProductUseCase,
  DeleteProductUseCase,
  GetProductUseCase,
  ListProductsUseCase,
  ReorderProductsUseCase,
  UpdateProductUseCase,
} from '../application/product-use-cases.js';

// A categoria é só texto no schema: a regra (e a mensagem do 422) é do domínio, em Category.fromString.
const ProductBody = Type.Object({
  name: Type.String({ examples: ['Chopp 300 ml'] }),
  price: Type.Integer({ description: 'Preço em centavos', examples: [1400] }),
  category: Type.String({ description: 'entradas, pratos_principais, sobremesas ou bebidas', examples: ['bebidas'] }),
  visible: Type.Optional(Type.Boolean({ description: 'Padrão: true' })),
  availability: Type.Optional(Type.Array(WindowSchema, { description: 'Sem janelas, está sempre disponível' })),
});
const ListQuery = Type.Object({
  category: Type.Optional(Type.String()),
  visible: Type.Optional(Type.String({ enum: ['true', 'false', '1', '0', ''] })),
  page: Type.Optional(QueryInt),
  perPage: Type.Optional(QueryInt),
});
const VisibilityBody = Type.Object({ visible: Type.Boolean() });
const OrderBody = Type.Object({ ids: Type.Array(Type.Integer(), { description: 'Ids na nova ordem do cardápio' }) });
const IdParams = Type.Object({ id: Type.String() });

export interface ProductRouteDeps {
  list: ListProductsUseCase;
  create: CreateProductUseCase;
  get: GetProductUseCase;
  update: UpdateProductUseCase;
  visibility: ChangeProductVisibilityUseCase;
  reorder: ReorderProductsUseCase;
  delete: DeleteProductUseCase;
}

function productData(body: Static<typeof ProductBody>): ProductData {
  return {
    name: body.name,
    priceCents: body.price,
    category: body.category,
    visible: body.visible ?? true,
    availability: body.availability ?? [],
  };
}

export function productRoutes(app: FastifyInstance, deps: ProductRouteDeps): void {
  const tags = ['Produtos'];
  const security = [{ bearerAuth: [] }];

  app.get(
    '/products',
    { schema: { tags, security, summary: 'Lista com filtros category e visible e paginação', querystring: ListQuery } },
    async (request) => {
      const query = queryOf(request, ListQuery);
      const page = await deps.list.execute(authOf(request).restaurantId, {
        category: query.category || null,
        visible: query.visible ? ['true', '1'].includes(query.visible) : null,
        page: intFromQuery(query.page),
        perPage: intFromQuery(query.perPage),
      });
      return { data: page.items, meta: { page: page.page, perPage: page.perPage, total: page.total } };
    },
  );

  app.post(
    '/products',
    { schema: { tags, security, summary: 'Cria produto (201 com Location)', body: ProductBody } },
    async (request, reply) => {
      const output = await deps.create.execute(actorOf(request), productData(bodyOf(request, ProductBody)));
      return reply.code(201).header('Location', `/api/v1/products/${output.id}`).send(output);
    },
  );

  app.put(
    '/products/order',
    { schema: { tags, security, summary: 'Define a ordem dos produtos no cardápio', body: OrderBody } },
    async (request, reply) => {
      await deps.reorder.execute(actorOf(request), bodyOf(request, OrderBody).ids);
      return reply.code(204).send();
    },
  );

  app.get('/products/:id', { schema: { tags, security, summary: 'Detalha um produto', params: IdParams } }, (request) =>
    deps.get.execute(authOf(request).restaurantId, routeId(request)),
  );

  app.put(
    '/products/:id',
    { schema: { tags, security, summary: 'Atualiza o produto inteiro', params: IdParams, body: ProductBody } },
    (request) => deps.update.execute(actorOf(request), routeId(request), productData(bodyOf(request, ProductBody))),
  );

  app.patch(
    '/products/:id/visibility',
    { schema: { tags, security, summary: 'Mostra ou esconde no cardápio', params: IdParams, body: VisibilityBody } },
    (request) => deps.visibility.execute(actorOf(request), routeId(request), bodyOf(request, VisibilityBody).visible),
  );

  app.delete(
    '/products/:id',
    { schema: { tags, security, summary: 'Exclui o produto e as promoções dele', params: IdParams } },
    async (request, reply) => {
      await deps.delete.execute(actorOf(request), routeId(request));
      return reply.code(204).send();
    },
  );
}
