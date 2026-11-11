import { z } from 'zod';

/**
 * Базовые типы значений, общие для всех доменов. Новые доменные схемы собираются из них,
 * чтобы формат id, дат и текстов был одинаковым на фронте, бэке и в БД.
 */

/** Идентификатор сущности: UUID v7 (генерирует Postgres 18 — `uuidv7()`, сортируется по времени). */
export const idSchema = z.uuid({ version: 'v7' });
export type Id = z.output<typeof idSchema>;

/** Момент времени в ответах API: ISO 8601 с часовым поясом (в БД — `timestamptz`). */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export type IsoDateTime = z.output<typeof isoDateTimeSchema>;

/** Календарная дата без времени (серии дней, «вопрос дня»): `YYYY-MM-DD`. */
export const isoDateSchema = z.iso.date();
export type IsoDate = z.output<typeof isoDateSchema>;

/**
 * Короткий пользовательский текст: обрезаем пробелы по краям, пустая строка запрещена.
 * Лимиты задаёт домен (ответ, «потому что», комментарий) — здесь только общее поведение.
 */
export function userText(options: { readonly max: number; readonly min?: number }) {
  return z
    .string()
    .trim()
    .min(options.min ?? 1)
    .max(options.max);
}
