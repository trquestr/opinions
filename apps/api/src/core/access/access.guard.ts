import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { EndpointConfig } from '@opinions/contracts';
import type { Request } from 'express';
import { ENDPOINT_CONTRACT } from '../contracts/endpoint.decorator.js';
import { apiException } from '../errors/api-exception.filter.js';

/**
 * Доступ задаётся контрактом (`access`), а не декораторами на ручках, поэтому «забыть закрыть» нельзя.
 * Fail closed: нет контракта — отказ.
 *
 * `request.user` пока никто не заполняет: сессию будет класть будущий AuthModule, до тех пор
 * ручки с `access: 'user'` всегда отвечают 401. Проверку прав на конкретный объект (IDOR) делает сервис.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const contract = this.reflector.getAllAndOverride<EndpointConfig | undefined>(ENDPOINT_CONTRACT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!contract) throw apiException(403, 'FORBIDDEN', 'Доступ запрещён');
    if (contract.access === 'public') return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (request.user === undefined || request.user === null) {
      throw apiException(401, 'UNAUTHORIZED', 'Требуется вход');
    }
    return true;
  }
}
