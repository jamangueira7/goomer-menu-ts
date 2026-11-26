import { ValidationError } from './errors.js';

const FORMAT = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Horário `HH:mm` de uma janela, com minutos de 15 em 15 (00, 15, 30 ou 45).
 */
export class TimeOfDay {
  static readonly STEP_MINUTES = 15;

  /** Minutos desde a meia-noite. */
  private constructor(readonly minutes: number) {}

  static fromString(value: string, field = 'time'): TimeOfDay {
    const match = FORMAT.exec(value);
    if (match === null) {
      throw new ValidationError(`Horário "${value}" fora do formato HH:mm.`, field);
    }
    return TimeOfDay.fromMinutes(Number(match[1]) * 60 + Number(match[2]), field);
  }

  static fromMinutes(minutes: number, field = 'time'): TimeOfDay {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
      throw new ValidationError('O horário precisa ficar entre 00:00 e 23:45.', field);
    }
    if (minutes % TimeOfDay.STEP_MINUTES !== 0) {
      throw new ValidationError('Os minutos só aceitam 00, 15, 30 ou 45.', field);
    }
    return new TimeOfDay(minutes);
  }

  format(): string {
    const hours = Math.floor(this.minutes / 60);
    return `${String(hours).padStart(2, '0')}:${String(this.minutes % 60).padStart(2, '0')}`;
  }
}
