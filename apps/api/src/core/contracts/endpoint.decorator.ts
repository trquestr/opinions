import { applyDecorators, Delete, Get, HttpCode, Patch, Post, Put, SetMetadata } from '@nestjs/common';
import { successStatus, type EndpointConfig, type HttpMethod } from '@untesis/contracts';

/** Ключ метаданных, под которым контракт лежит на обработчике (читают guard, interceptor, проверка покрытия). */
export const ENDPOINT_CONTRACT = 'untesis:endpoint-contract';

const ROUTE_BY_METHOD = {
  GET: Get,
  POST: Post,
  PUT: Put,
  PATCH: Patch,
  DELETE: Delete,
} satisfies Record<HttpMethod, (path: string) => MethodDecorator>;

/**
 * Единственный способ объявить HTTP-ручку: маршрут, код успеха и контракт берутся из `@untesis/contracts`.
 * Без `@Endpoint` приложение не стартует (см. ContractCoverage), поэтому нетипизированной ручки не бывает.
 */
export function Endpoint(contract: EndpointConfig): MethodDecorator {
  return applyDecorators(
    ROUTE_BY_METHOD[contract.method](contract.path),
    HttpCode(successStatus(contract)),
    SetMetadata(ENDPOINT_CONTRACT, contract),
  );
}
