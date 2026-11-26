import { ValidationError } from './errors.js';
import { LocalMoment } from './local-moment.js';
import { Weekday } from './weekday.js';

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Fuso horário IANA do restaurante (ex.: America/Sao_Paulo), validado contra a lista do ICU do Node.
 */
export class Timezone {
  private static known: ReadonlySet<string> | null = null;

  private readonly formatter: Intl.DateTimeFormat;

  private constructor(readonly name: string) {
    this.formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: name,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'longOffset',
    });
  }

  static fromString(name: string): Timezone {
    Timezone.known ??= new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
    if (!Timezone.known.has(name)) {
      throw new ValidationError(`Fuso horário "${name}" não está na lista IANA.`, 'timezone');
    }
    return new Timezone(name);
  }

  /** Converte um instante (UTC) no dia da semana e na hora locais do fuso. */
  localize(instant: Date): LocalMoment {
    // O Intl sempre devolve todas as partes pedidas no construtor; o String() só satisfaz o tipo.
    const parts = new Map(this.formatter.formatToParts(instant).map((p) => [p.type, p.value]));
    const part = (type: Intl.DateTimeFormatPartTypes): string => String(parts.get(type));
    const [hour, minute, second] = [part('hour'), part('minute'), part('second')];
    // "GMT-03:00" vira "-03:00"; o UTC puro vem como "GMT".
    const offset = part('timeZoneName').replace('GMT', '') || '+00:00';
    return new LocalMoment(
      Weekday.fromInt(Number(WEEKDAYS[part('weekday')])),
      Number(hour) * 60 + Number(minute),
      `${hour}:${minute}:${second}`,
      `${part('year')}-${part('month')}-${part('day')}T${hour}:${minute}:${second}${offset}`,
    );
  }
}
