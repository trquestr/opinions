import type { NextFunction, Request, Response } from 'express';
import { requestIdMiddleware, resolveRequestId } from './request-id.middleware.js';

function run(incoming?: unknown) {
  const req = { headers: { 'x-request-id': incoming } } as unknown as Request;
  const setHeader = vi.fn();
  const res = { setHeader } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  requestIdMiddleware(req, res, next);
  return { req, setHeader, next };
}

describe('requestIdMiddleware', () => {
  it('сохраняет безопасный входящий id', () => {
    const { req, setHeader, next } = run('abc-123_X.y');
    expect(req.requestId).toBe('abc-123_X.y');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'abc-123_X.y');
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([['bad id with spaces'], ['a'.repeat(129)], ['line\r\nbreak'], [''], [undefined], [['a', 'b']]])(
    'заменяет небезопасный id %j на uuid',
    (incoming) => {
      const { req } = run(incoming);
      expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it('resolveRequestId принимает ровно 128 символов', () => {
    expect(resolveRequestId('a'.repeat(128))).toBe('a'.repeat(128));
  });
});
