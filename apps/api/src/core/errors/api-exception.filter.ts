import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  apiErrorCodeForStatus,
  apiErrorCodeSchema,
  apiErrorIssueSchema,
  apiErrorSchema,
  type ApiError,
  type ApiErrorCode,
  type ApiErrorIssue,
} from '@opinions/contracts';
import type { Request, Response } from 'express';
import { z } from 'zod';

const INTERNAL_MESSAGE = 'Внутренняя ошибка сервера';

/**
 * Исключение с кодом из контракта ошибок — для доменного кода (`throw apiException(404, 'NOT_FOUND', '…')`).
 * Фильтр отдаст его в формате ApiError без переделок.
 */
export function apiException(
  status: number,
  code: ApiErrorCode,
  message: string,
  issues?: readonly ApiErrorIssue[],
): HttpException {
  return new HttpException({ code, message, ...(issues ? { issues } : {}) }, status);
}

type ErrorParts = Pick<ApiError, 'statusCode' | 'code' | 'message' | 'issues'>;

const exceptionBodySchema = z.object({
  code: apiErrorCodeSchema.optional(),
  message: z.unknown().optional(),
  issues: z.array(apiErrorIssueSchema).optional(),
});

/** Ошибки body-parser (http-errors): не HttpException, различаются по `type`. */
const bodyParserErrorSchema = z.object({
  type: z.string(),
  status: z.number().int(),
});

function fromBodyParser(exception: unknown): ErrorParts | undefined {
  const parsed = bodyParserErrorSchema.safeParse(exception);
  if (!parsed.success) return undefined;
  if (parsed.data.type === 'entity.too.large') {
    return { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Слишком большое тело запроса' };
  }
  if (parsed.data.type === 'entity.parse.failed' || parsed.data.type === 'encoding.unsupported') {
    return { statusCode: 400, code: 'BAD_REQUEST', message: 'Некорректный JSON в теле запроса' };
  }
  return undefined;
}

function fromHttpException(exception: HttpException): ErrorParts {
  const statusCode = exception.getStatus();
  if (statusCode >= 500) {
    return { statusCode, code: apiErrorCodeForStatus(statusCode), message: INTERNAL_MESSAGE };
  }
  const body = exceptionBodySchema.safeParse(exception.getResponse());
  const code = body.success && body.data.code ? body.data.code : apiErrorCodeForStatus(statusCode);
  let message = exception.message;
  if (body.success && typeof body.data.message === 'string') message = body.data.message;
  if (exception instanceof ThrottlerException) {
    return { statusCode: 429, code: 'RATE_LIMITED', message: 'Слишком много запросов, попробуйте позже' };
  }
  return {
    statusCode,
    code,
    message,
    ...(body.success && body.data.issues ? { issues: body.data.issues } : {}),
  };
}

/**
 * Любая ошибка → тело строго по `apiErrorSchema`. Наружу не уходят стеки и внутренние сообщения:
 * подробности пишем в лог вместе с requestId, а клиенту отдаём только id для обращения в поддержку.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const parts = this.toParts(exception, request);
    const body = {
      ...parts,
      ...(request.requestId ? { requestId: request.requestId } : {}),
    } satisfies ApiError;

    // Страховка формата: если собрали что-то невалидное — лучше общий 500, чем сломанный контракт.
    const checked = apiErrorSchema.safeParse(body);
    if (!checked.success) {
      this.logger.error({ message: 'Невалидное тело ошибки', requestId: request.requestId });
      response.status(500).json({
        statusCode: 500,
        code: 'INTERNAL',
        message: INTERNAL_MESSAGE,
        ...(request.requestId ? { requestId: request.requestId } : {}),
      } satisfies ApiError);
      return;
    }
    response.status(checked.data.statusCode).json(checked.data);
  }

  private toParts(exception: unknown, request: Request): ErrorParts {
    const parserError = fromBodyParser(exception);
    if (parserError) return parserError;

    if (exception instanceof HttpException) {
      const parts = fromHttpException(exception);
      if (parts.statusCode >= 500) this.logUnexpected(exception, request);
      return parts;
    }

    this.logUnexpected(exception, request);
    return { statusCode: 500, code: 'INTERNAL', message: INTERNAL_MESSAGE };
  }

  private logUnexpected(exception: unknown, request: Request): void {
    this.logger.error(
      { message: 'Необработанная ошибка', requestId: request.requestId, method: request.method },
      exception instanceof Error ? exception.stack : String(exception),
    );
  }
}
