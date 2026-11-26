import type { FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import { Unauthenticated } from '../../shared/application/errors.js';
import type { AccessTokens, AuthContext } from '../application/ports.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/**
 * Único guarda de autenticação, aplicado ao escopo das rotas protegidas (e só a ele).
 */
export function jwtGuard(tokens: AccessTokens): onRequestAsyncHookHandler {
  return async (request) => {
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
    if (match?.[1] === undefined) {
      throw new Unauthenticated('Envie o header Authorization: Bearer <token>.');
    }
    request.auth = await tokens.verify(match[1]);
  };
}

/** Contexto do token; o restaurante das rotas protegidas vem sempre daqui, nunca da URL. */
export function authOf(request: FastifyRequest): AuthContext {
  if (request.auth === null) {
    throw new Unauthenticated('Requisição sem autenticação.');
  }
  return request.auth;
}
