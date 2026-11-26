import type { Weekday } from './weekday.js';

/**
 * Dia da semana e hora locais de um restaurante (minutos livres, não só de 15 em 15).
 */
export class LocalMoment {
  constructor(
    readonly weekday: Weekday,
    /** Minutos desde a meia-noite local. */
    readonly minuteOfDay: number,
    /** Hora local `HH:mm:ss`, pronta para comparar com colunas `time`. */
    readonly time: string,
    /** Data e hora locais com o deslocamento do fuso (ex.: 2026-12-02T18:30:00-03:00). */
    readonly iso: string,
  ) {}
}
