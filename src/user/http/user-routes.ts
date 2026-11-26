import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { actorOf, authOf } from '../../auth/http/jwt-guard.js';
import { bodyOf, routeId } from '../../shared/http/http-kit.js';
import type { CreateUserUseCase, DeleteUserUseCase, ListUsersUseCase } from '../application/user-use-cases.js';

const UserBody = Type.Object({
  name: Type.String({ examples: ['Ana'] }),
  email: Type.String({ examples: ['ana@bardojoao.com'] }),
  password: Type.String({ description: 'Pelo menos 8 caracteres' }),
});
const IdParams = Type.Object({ id: Type.String() });

export interface UserRouteDeps {
  list: ListUsersUseCase;
  create: CreateUserUseCase;
  delete: DeleteUserUseCase;
}

export function userRoutes(app: FastifyInstance, deps: UserRouteDeps): void {
  const tags = ['Usuários'];
  const security = [{ bearerAuth: [] }];

  app.get('/users', { schema: { tags, security, summary: 'Lista os usuários do restaurante' } }, async (request) => ({
    data: await deps.list.execute(authOf(request).restaurantId),
  }));

  app.post(
    '/users',
    { schema: { tags, security, summary: 'Cadastra usuário (409 se o e-mail já existe)', body: UserBody } },
    async (request, reply) => {
      const output = await deps.create.execute(
        authOf(request).restaurantId,
        bodyOf(request, UserBody),
        actorOf(request),
      );
      return reply.code(201).header('Location', `/api/v1/users/${output.id}`).send(output);
    },
  );

  app.delete(
    '/users/:id',
    { schema: { tags, security, summary: 'Remove um usuário (422 para si mesmo)', params: IdParams } },
    async (request, reply) => {
      await deps.delete.execute(actorOf(request), routeId(request));
      return reply.code(204).send();
    },
  );
}
