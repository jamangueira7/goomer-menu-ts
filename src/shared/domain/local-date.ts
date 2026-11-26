import { ValidationError } from './errors.js';

/**
 * Data de calendário sem hora nem fuso, no formato ISO `YYYY-MM-DD` (o fuso entra só ao virar instante).
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {}

  static fromString(value: string, field = 'date'): LocalDate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const [year, month, day] = [Number(match?.[1]), Number(match?.[2]), Number(match?.[3])];
    const probe = new Date(Date.UTC(year, month - 1, day));
    // Date.UTC aceita 31/02 e "vira" para março; a data só vale se voltar igual.
    if (match === null || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
      throw new ValidationError(`Data "${value}" inválida; use o formato AAAA-MM-DD.`, field);
    }
    return new LocalDate(year, month, day);
  }

  /** O dia seguinte (para o fim inclusivo virar um limite exclusivo). */
  next(): LocalDate {
    const probe = new Date(Date.UTC(this.year, this.month - 1, this.day + 1));
    return new LocalDate(probe.getUTCFullYear(), probe.getUTCMonth() + 1, probe.getUTCDate());
  }

  isBefore(other: LocalDate): boolean {
    return this.toString() < other.toString();
  }

  toString(): string {
    return `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}-${String(this.day).padStart(2, '0')}`;
  }
}
