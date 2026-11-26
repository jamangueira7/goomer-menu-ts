import { ValidationError } from './errors.js';

/**
 * Valor monetário em centavos (inteiro), nunca negativo e nunca ponto flutuante.
 */
export class Money {
  private constructor(readonly cents: number) {}

  static ofCents(cents: number): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new ValidationError('O valor precisa ser um inteiro em centavos.', 'price');
    }
    if (cents < 0) {
      throw new ValidationError('O valor em centavos não pode ser negativo.', 'price');
    }
    return new Money(cents);
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isLessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }
}
