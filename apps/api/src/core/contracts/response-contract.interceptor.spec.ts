import {
  type CallHandler,
  type ExecutionContext,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defineEndpoint } from '@opinions/contracts';
import { lastValueFrom, of } from 'rxjs';
import { z } from 'zod';
import { ENDPOINT_CONTRACT } from './endpoint.decorator.js';
import { ResponseContractInterceptor } from './response-contract.interceptor.js';

const contract = defineEndpoint({
  method: 'GET',
  path: '/x',
  access: 'public',
  response: z.object({ id: z.string() }),
});
const noContent = defineEndpoint({
  method: 'DELETE',
  path: '/x',
  access: 'public',
  status: 204,
  response: z.void(),
});

function context(meta: unknown, type = 'http'): ExecutionContext {
  const handler = () => undefined;
  if (meta) Reflect.defineMetadata(ENDPOINT_CONTRACT, meta, handler);
  return {
    getType: () => type,
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ requestId: 'rid-1' }) }),
  } as unknown as ExecutionContext;
}

const handle = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('ResponseContractInterceptor', () => {
  const interceptor = new ResponseContractInterceptor(new Reflector());

  afterEach(() => vi.restoreAllMocks());

  it('пропускает валидный ответ и отрезает лишние поля', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(context(contract), handle({ id: '1', passwordHash: 'secret' })),
    );
    expect(result).toEqual({ id: '1' });
  });

  it('невалидный ответ: 500 и запись в лог с requestId', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(
      lastValueFrom(interceptor.intercept(context(contract), handle({ id: 5 }))),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'rid-1', route: 'GET /x' }));
  });

  it('204: тело не отдаётся', async () => {
    const result = await lastValueFrom(interceptor.intercept(context(noContent), handle({ leak: true })));
    expect(result).toBeUndefined();
  });

  it('без контракта и не-HTTP контекст: пропускает как есть', async () => {
    expect(await lastValueFrom(interceptor.intercept(context(undefined), handle('raw')))).toBe('raw');
    expect(await lastValueFrom(interceptor.intercept(context(contract, 'rpc'), handle('raw')))).toBe('raw');
  });
});
