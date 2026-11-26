import { Type, type Static, type TSchema } from '@sinclair/typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { NotFound } from '../domain/errors.js';
import { MalformedBody, sendProblem } from './problem-details.js';

export class RouteNotFound extends NotFound {}

/** Id numérico de rota; qualquer outra coisa vira 404 (o recurso não existe). */
export function routeId(request: FastifyRequest, name = 'id'): number {
  const value = (request.params as Record<string, string | undefined>)[name] ?? '';
  if (!/^[1-9]\d{0,14}$/.test(value)) {
    throw new RouteNotFound(`Recurso "${value}" não encontrado.`);
  }
  return Number(value);
}

/** Corpo já validado pelo schema da rota, com o tipo estático que o TypeBox deriva do mesmo schema. */
export function bodyOf<S extends TSchema>(request: FastifyRequest, _schema: S): Static<S> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- o schema da rota já validou o corpo
  return request.body as Static<S>;
}

export function queryOf<S extends TSchema>(request: FastifyRequest, _schema: S): Static<S> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- idem para a query string
  return request.query as Static<S>;
}

export const WindowSchema = Type.Object({
  weekday: Type.Integer({ description: '0 (domingo) a 6 (sábado)', examples: [3] }),
  start: Type.String({ description: 'HH:mm, minutos 00, 15, 30 ou 45', examples: ['18:00'] }),
  end: Type.String({ description: 'HH:mm, pelo menos 15 minutos depois do início', examples: ['20:00'] }),
});

/** Inteiro vindo da query string (sem coerção automática do Ajv, para 422 em vez de conversão silenciosa). */
export const QueryInt = Type.String({ pattern: '^(-?\\d{1,9})?$' });

export function intFromQuery(value: string | undefined): number | undefined {
  return value === undefined || value === '' ? undefined : Number(value);
}

/**
 * JSON do corpo: vazio vira `{}` (o schema então aponta os campos que faltam) e JSON quebrado vira 400.
 */
export function registerJsonParser(app: FastifyInstance): void {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new MalformedBody(), undefined);
    }
  });
}

/**
 * 404 para rota desconhecida e 405 (com Allow) quando a rota existe com outro método.
 * O Fastify responde 404 nos dois casos; o mapa de rotas vem do hook onRoute.
 */
export function registerNotFound(app: FastifyInstance): void {
  const routes: { method: string; pattern: RegExp }[] = [];
  app.addHook('onRoute', (route) => {
    const pattern = new RegExp(`^${route.url.replace(/:[^/]+/g, '[^/]+')}/?$`);
    for (const method of [route.method].flat()) {
      routes.push({ method, pattern });
    }
  });
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0] ?? '';
    const allowed = [...new Set(routes.filter((r) => r.pattern.test(path)).map((r) => r.method))];
    if (allowed.length > 0) {
      return sendProblem(reply, request, {
        status: 405,
        detail: `Método ${request.method} não permitido nesta rota. Use: ${allowed.join(', ')}.`,
        headers: { Allow: allowed.join(', ') },
      });
    }
    return sendProblem(reply, request, { status: 404, detail: `Rota ${request.method} ${path} não encontrada.` });
  });
}
