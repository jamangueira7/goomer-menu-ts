import type { Clock } from '../../src/shared/domain/clock.js';

/** Relógio parado num instante; o padrão é quarta-feira, 2 de dezembro de 2026, 18:30 em São Paulo. */
export class FixedClock implements Clock {
  private instant: Date;

  constructor(iso = '2026-12-02T21:30:00Z') {
    this.instant = new Date(iso);
  }

  now(): Date {
    return new Date(this.instant);
  }

  set(iso: string): void {
    this.instant = new Date(iso);
  }

  advanceMinutes(minutes: number): void {
    this.instant = new Date(this.instant.getTime() + minutes * 60_000);
  }
}
