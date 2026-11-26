import { ValidationError } from './errors.js';
import type { LocalMoment } from './local-moment.js';
import { TimeOfDay } from './time-of-day.js';
import { Weekday } from './weekday.js';

/**
 * Janela de um dia da semana, do início (inclusive) ao fim (exclusive).
 *
 * O fim fica pelo menos 15 minutos depois do início; janela que vira a meia-noite é rejeitada.
 */
export class TimeWindow {
  private constructor(
    readonly weekday: Weekday,
    readonly start: TimeOfDay,
    readonly end: TimeOfDay,
  ) {}

  static of(weekday: Weekday, start: TimeOfDay, end: TimeOfDay): TimeWindow {
    if (end.minutes <= start.minutes) {
      throw new ValidationError(
        `A janela ${start.format()}–${end.format()} vira a meia-noite ou termina antes de começar; cadastre uma janela em cada dia.`,
        'windows',
      );
    }
    // Com minutos de 15 em 15 e fim depois do início, a duração mínima de 15 minutos já está garantida.
    return new TimeWindow(weekday, start, end);
  }

  static fromStrings(weekday: number, start: string, end: string): TimeWindow {
    return TimeWindow.of(
      Weekday.fromInt(weekday),
      TimeOfDay.fromString(start, 'start'),
      TimeOfDay.fromString(end, 'end'),
    );
  }

  overlaps(other: TimeWindow): boolean {
    return (
      this.weekday === other.weekday && this.start.minutes < other.end.minutes && other.start.minutes < this.end.minutes
    );
  }

  contains(moment: LocalMoment): boolean {
    return (
      this.weekday === moment.weekday &&
      moment.minuteOfDay >= this.start.minutes &&
      moment.minuteOfDay < this.end.minutes
    );
  }

  static anyOverlap(windows: readonly TimeWindow[]): boolean {
    return windows.some((a, i) => windows.slice(i + 1).some((b) => a.overlaps(b)));
  }
}
