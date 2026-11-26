import { textLength } from '../../shared/domain/text.js';
import { ValidationError } from '../../shared/domain/errors.js';

/**
 * Senha em texto puro, só em memória: tem no mínimo 8 caracteres e só é guardada como hash.
 */
export class Password {
  static readonly MIN_LENGTH = 8;
  static readonly MAX_LENGTH = 128;

  readonly #plain: string;

  private constructor(plain: string) {
    this.#plain = plain;
  }

  static fromString(plain: string): Password {
    const length = textLength(plain);
    if (length < Password.MIN_LENGTH) {
      throw new ValidationError('A senha precisa ter no mínimo 8 caracteres.', 'password');
    }
    if (length > Password.MAX_LENGTH) {
      throw new ValidationError('A senha tem no máximo 128 caracteres.', 'password');
    }
    return new Password(plain);
  }

  plain(): string {
    return this.#plain;
  }

  /** Evita que a senha apareça em logs e em JSON.stringify. */
  toJSON(): string {
    return '***';
  }

  toString(): string {
    return '***';
  }
}
