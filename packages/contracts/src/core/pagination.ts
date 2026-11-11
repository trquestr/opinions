import { z } from 'zod';

/**
 * Курсорная пагинация: стабильна при вставках (новые мнения не сдвигают страницы, как offset),
 * и индексируется по (created_at, id). Списки без пагинации в API запрещены.
 */

export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 50;

/** Query-параметры страницы. Значения приходят строками — `limit` приводится к числу. */
export const cursorPageQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});
export type CursorPageQuery = z.output<typeof cursorPageQuerySchema>;

/** Ответ со страницей элементов. `nextCursor: null` — это последняя страница. */
export function cursorPageSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
export type CursorPage<TItem> = { readonly items: readonly TItem[]; readonly nextCursor: string | null };
