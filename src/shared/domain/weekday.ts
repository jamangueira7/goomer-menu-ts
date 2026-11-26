import { ValidationError } from './errors.js';

/**
 * Dia da semana no padrão do JavaScript e do Postgres: 0 é domingo, 6 é sábado.
 * As instâncias são únicas, então dá para comparar com `===`.
 */
export class Weekday {
  private static readonly days = [0, 1, 2, 3, 4, 5, 6].map((value) => new Weekday(value));

  private constructor(readonly value: number) {}

  static fromInt(value: number): Weekday {
    const day = Number.isInteger(value) ? Weekday.days[value] : undefined;
    if (day === undefined) {
      throw new ValidationError('O dia da semana vai de 0 (domingo) a 6 (sábado).', 'weekday');
    }
    return day;
  }
}
