export type ClassValue = string | false | null | undefined;

/**
 * Склейка CSS-классов: пропускает пустые значения (`false`, `null`, `undefined`, '').
 * Это не tailwind-merge: конфликтующие утилиты не разрешает — порядок решает CSS, а не строка.
 */
export function cx(...values: readonly ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
