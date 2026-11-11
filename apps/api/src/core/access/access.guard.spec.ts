import { type ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENDPOINT_CONTRACT } from '../contracts/endpoint.decorator.js';
import { AccessGuard } from './access.guard.js';

function context(access: 'public' | 'user' | undefined, user?: unknown, type = 'http'): ExecutionContext {
  const handler = () => undefined;
  if (access) Reflect.defineMetadata(ENDPOINT_CONTRACT, { access }, handler);
  return {
    getType: () => type,
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : undefined;
  }
  return undefined;
}

describe('AccessGuard', () => {
  const guard = new AccessGuard(new Reflector());

  it('public: пропускает без пользователя', () => {
    expect(guard.canActivate(context('public'))).toBe(true);
  });

  it('user без сессии: 401', () => {
    expect(statusOf(() => guard.canActivate(context('user')))).toBe(401);
    expect(statusOf(() => guard.canActivate(context('user', null)))).toBe(401);
  });

  it('user с сессией: пропускает', () => {
    expect(guard.canActivate(context('user', { id: 'u1' }))).toBe(true);
  });

  it('нет контракта: отказ (fail closed)', () => {
    expect(statusOf(() => guard.canActivate(context(undefined)))).toBe(403);
  });

  it('не-HTTP контекст не трогает', () => {
    expect(guard.canActivate(context(undefined, undefined, 'rpc'))).toBe(true);
  });
});
