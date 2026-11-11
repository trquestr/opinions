import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

// Входящий id попадёт в логи и заголовок ответа, поэтому пускаем только безопасный алфавит и длину
// (защита от log injection и раздувания заголовков).
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/**
 * Ставит id корреляции в запрос и в заголовок ответа. Подключается через `app.use` в configureApp
 * ДО body-parser: ошибки разбора тела тоже должны получить requestId.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
