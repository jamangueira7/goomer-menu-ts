/** Credenciais ou token inválidos, ausentes ou vencidos (HTTP 401). */
export class Unauthenticated extends Error {
  override readonly name = 'Unauthenticated';
}

/** Limite de pedidos estourado (HTTP 429, com Retry-After). */
export class TooManyRequests extends Error {
  override readonly name = 'TooManyRequests';

  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}
