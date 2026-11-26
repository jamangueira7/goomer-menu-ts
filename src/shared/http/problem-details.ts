import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyReply, FastifyRequest, FastifySchemaValidationError } from 'fastify';
import { TooManyRequests, Unauthenticated } from '../application/errors.js';
import { Conflict, NotFound, ValidationError } from '../domain/errors.js';

/** Corpo que não é JSON válido (HTTP 400). */
export class MalformedBody extends Error {
  override readonly name = 'MalformedBody';

  constructor() {
    super('O corpo da requisição não é um JSON válido.');
  }
}

interface Problem {
  status: number;
  detail: string;
  errors?: Record<string, string>;
  headers?: Record<string, string>;
}

const TYPE_NAMES: Record<string, string> = {
  string: 'texto',
  integer: 'inteiro',
  number: 'número',
  boolean: 'booleano',
  array: 'lista',
  object: 'objeto',
};

/** "/windows/0/start" vira "windows[0].start"; a raiz do corpo vira "body". */
function fieldOf(error: FastifySchemaValidationError): string {
  const segments = error.instancePath.split('/').filter((s) => s !== '');
  const missing = error.params['missingProperty'];
  if (error.keyword === 'required' && typeof missing === 'string') {
    segments.push(missing);
  }
  const field = segments.reduce((path, s) => (/^\d+$/.test(s) ? `${path}[${s}]` : path ? `${path}.${s}` : s), '');
  return field === '' ? 'body' : field;
}

function messageOf(error: FastifySchemaValidationError): string {
  switch (error.keyword) {
    case 'required':
      return 'Obrigatório.';
    case 'type':
      return `Precisa ser do tipo ${TYPE_NAMES[String(error.params['type'])] ?? String(error.params['type'])}.`;
    case 'enum':
      return `Use um destes valores: ${(error.params['allowedValues'] as unknown[]).filter((v) => v !== '').join(', ')}.`;
    case 'pattern':
      return 'Formato inválido.';
    default:
      return error.message ?? 'Valor inválido.';
  }
}

/** Erros de schema do Fastify num mapa campo => mensagem (o primeiro erro de cada campo). */
export function validationErrors(errors: readonly FastifySchemaValidationError[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const error of errors) {
    result[fieldOf(error)] ??= messageOf(error);
  }
  return result;
}

function toProblem(error: FastifyError | Error): Problem {
  if ('validation' in error && Array.isArray(error.validation)) {
    return { status: 422, detail: 'Dados inválidos.', errors: validationErrors(error.validation) };
  }
  if (error instanceof MalformedBody) {
    return { status: 400, detail: error.message };
  }
  if (error instanceof ValidationError) {
    return { status: 422, detail: error.message, ...(error.field ? { errors: { [error.field]: error.message } } : {}) };
  }
  if (error instanceof NotFound) {
    return { status: 404, detail: error.message };
  }
  if (error instanceof Conflict) {
    return { status: 409, detail: error.message };
  }
  if (error instanceof Unauthenticated) {
    return { status: 401, detail: error.message, headers: { 'WWW-Authenticate': 'Bearer' } };
  }
  if (error instanceof TooManyRequests) {
    return { status: 429, detail: error.message, headers: { 'Retry-After': String(error.retryAfterSeconds) } };
  }
  const status = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  if (status >= 400 && status < 500) {
    return { status, detail: error.message };
  }
  return { status: 500, detail: 'Erro interno. Tente de novo mais tarde.' };
}

/** Responde no formato Problem Details (RFC 9457, `application/problem+json`). */
export function sendProblem(reply: FastifyReply, request: FastifyRequest, problem: Problem): FastifyReply {
  const body = {
    type: 'about:blank',
    title: STATUS_CODES[problem.status] ?? 'Error',
    status: problem.status,
    detail: problem.detail,
    instance: request.url.split('?')[0],
    ...(problem.errors ? { errors: problem.errors } : {}),
  };
  return reply
    .code(problem.status)
    .headers(problem.headers ?? {})
    .type('application/problem+json')
    .send(JSON.stringify(body));
}

/** Traduz qualquer exceção em Problem Details; 500 vai para o log com a pilha, mas sem detalhe na resposta. */
export function problemDetailsHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const problem = toProblem(error);
  if (problem.status === 500) {
    request.log.error({ err: error }, 'erro não tratado');
  }
  return sendProblem(reply, request, problem);
}
