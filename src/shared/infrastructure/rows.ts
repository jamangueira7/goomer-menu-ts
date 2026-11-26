import { TimeWindow } from '../domain/time-window.js';

/** Linha de `product_availability` ou `promotion_windows` (colunas `time` chegam como "HH:MM:SS"). */
export interface WindowRow {
  owner_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
}

export function windowFromRow(row: WindowRow): TimeWindow {
  return TimeWindow.fromStrings(row.weekday, row.start_time.slice(0, 5), row.end_time.slice(0, 5));
}

/** Agrupa as janelas pelo dono (produto ou promoção). */
export function groupWindows(rows: readonly WindowRow[]): Map<number, TimeWindow[]> {
  const grouped = new Map<number, TimeWindow[]>();
  for (const row of rows) {
    const list = grouped.get(row.owner_id) ?? [];
    list.push(windowFromRow(row));
    grouped.set(row.owner_id, list);
  }
  return grouped;
}
