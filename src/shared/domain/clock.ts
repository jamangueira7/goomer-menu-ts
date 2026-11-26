/**
 * Relógio injetável: a hora "agora" nunca vem de `new Date()` espalhado pelo código.
 */
export interface Clock {
  now(): Date;
}
