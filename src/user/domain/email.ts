import { ValidationError } from '../../shared/domain/errors.js';

// Formato prático: algo@dominio.tld, sem espaços; o envio de verdade é quem confirma o endereço.
const FORMAT =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * E-mail normalizado em minúsculas, sem espaços nas pontas.
 */
export class Email {
  private constructor(readonly value: string) {}

  static fromString(value: string): Email {
    const normalized = value.trim().toLowerCase();
    if (normalized.length > 254 || !FORMAT.test(normalized)) {
      throw new ValidationError('E-mail inválido.', 'email');
    }
    return new Email(normalized);
  }
}
