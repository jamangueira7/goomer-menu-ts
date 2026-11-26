/**
 * Base de todos os erros de regra de negócio. A camada HTTP traduz cada subtipo num status.
 */
export abstract class DomainError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Dado que viola uma regra de negócio (HTTP 422). */
export class ValidationError extends DomainError {
  constructor(
    message: string,
    readonly field: string | null = null,
  ) {
    super(message);
  }
}

/** Recurso inexistente ou de outro restaurante (HTTP 404, para não revelar que existe). */
export class NotFound extends DomainError {}

/** Estado conflitante, como janelas de promoção sobrepostas ou e-mail repetido (HTTP 409). */
export class Conflict extends DomainError {}
