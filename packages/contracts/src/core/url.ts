/**
 * Строковое представление значения для URL (сегмент пути или параметр query).
 * Допускаются только скаляры: объект превратился бы в `[object Object]` и молча ушёл бы на сервер.
 * `undefined` — значения нет (пустая строка, `null`, `undefined`) или оно не скаляр: решает вызывающий.
 */
export function toUrlValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}
