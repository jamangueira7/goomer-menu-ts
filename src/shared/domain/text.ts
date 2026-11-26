/** Tamanho em caracteres (code points), como o `mb_strlen` do PHP e o `length()` do Postgres. */
export function textLength(value: string): number {
  return Array.from(value).length;
}
