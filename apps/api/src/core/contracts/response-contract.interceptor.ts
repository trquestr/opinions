import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { EndpointConfig } from '@opinions/contracts';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import { ENDPOINT_CONTRACT } from './endpoint.decorator.js';

/**
 * Прогоняет результат обработчика через `contract.response`. Лишние поля (например, хеш пароля из
 * сущности ORM) отрезаются, а несоответствие контракту — это баг сервера: логируем и отдаём 500,
 * а не сырые данные (fail closed).
 */
@Injectable()
export class ResponseContractInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseContractInterceptor.name);

  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const contract = this.reflector.getAllAndOverride<EndpointConfig | undefined>(ENDPOINT_CONTRACT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!contract) return next.handle();

    return next.handle().pipe(
      map((result: unknown) => {
        // 204 по определению без тела: ничего не сериализуем, чтобы не отдать лишнего.
        if (contract.status === 204) return undefined;
        const parsed = contract.response.safeParse(result);
        if (parsed.success) return parsed.data;

        const request = context.switchToHttp().getRequest<Request>();
        this.logger.error({
          message: 'Ответ обработчика не соответствует контракту',
          route: `${contract.method} ${contract.path}`,
          requestId: request.requestId,
          issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        });
        throw new InternalServerErrorException();
      }),
    );
  }
}
