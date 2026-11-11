import { z } from 'zod';

/**
 * Единый формат ошибки API. Бэк отдаёт его из глобального фильтра исключений для ЛЮБОЙ ошибки,
 * фронт разбирает им ответ не-2xx. Внутренние подробности (стек, SQL) сюда не попадают никогда.
 */

/** Машинные коды ошибок: по ним фронт решает, что показать. Расширять — только добавлением. */
export const apiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL',
  'SERVICE_UNAVAILABLE',
]);
export type ApiErrorCode = z.output<typeof apiErrorCodeSchema>;

/** Проблема в конкретном поле входных данных (для подсветки формы). */
export const apiErrorIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type ApiErrorIssue = z.output<typeof apiErrorIssueSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: apiErrorCodeSchema,
  /** Сообщение для человека, без внутренних деталей. */
  message: z.string(),
  /** Ошибки валидации по полям — только для VALIDATION_FAILED. */
  issues: z.array(apiErrorIssueSchema).optional(),
  /** Id запроса для связи с логами сервера (заголовок `x-request-id`). */
  requestId: z.string().optional(),
});
export type ApiError = z.output<typeof apiErrorSchema>;

/** Коды для статусов, у которых есть точное соответствие; остальные — по классу статуса. */
const ERROR_CODE_BY_STATUS: Readonly<Partial<Record<number, ApiErrorCode>>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/** Код ошибки по HTTP-статусу — для фильтра исключений, когда код не задан явно. */
export function apiErrorCodeForStatus(statusCode: number): ApiErrorCode {
  return ERROR_CODE_BY_STATUS[statusCode] ?? (statusCode >= 500 ? 'INTERNAL' : 'BAD_REQUEST');
}
