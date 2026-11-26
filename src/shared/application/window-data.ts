import { TimeWindow } from '../domain/time-window.js';

/** Janela no formato primitivo de entrada e saída: `{ weekday: 3, start: "18:00", end: "20:00" }`. */
export interface WindowData {
  weekday: number;
  start: string;
  end: string;
}

export function toTimeWindows(windows: readonly WindowData[]): TimeWindow[] {
  return windows.map((w) => TimeWindow.fromStrings(w.weekday, w.start, w.end));
}

export function toWindowData(windows: readonly TimeWindow[]): WindowData[] {
  return windows.map((w) => ({ weekday: w.weekday.value, start: w.start.format(), end: w.end.format() }));
}
