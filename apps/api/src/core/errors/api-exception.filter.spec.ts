import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { apiErrorSchema } from '@untesis/contracts';
import { ApiExceptionFilter, apiException } from './api-exception.filter.js';
import { createValidationPipe } from './validation.pipe.js';

function run(exception: unknown, { requestId = 'rid-1', type = 'http' } = {}) {
  const json = vi.fn();
  const status = vi.fn((_code: number) => ({ json }));
  const host = {
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => ({ requestId, method: 'GET' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  const body: unknown = json.mock.calls[0]?.[0];
  return { status: status.mock.calls[0]?.[0], body: apiErrorSchema.parse(body) };
}

describe('ApiExceptionFilter', () => {
  const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  afterEach(() => error.mockClear());

  it('HttpException 4xx: статус, код по статусу, сообщение, requestId', () => {
    const { status, body } = run(new NotFoundException('нет такого'));
    expect(status).toBe(404);
    expect(body).toEqual({ statusCode: 404, code: 'NOT_FOUND', message: 'нет такого', requestId: 'rid-1' });
  });

  it('берёт валидный code из тела исключения и issues', () => {
    const { body } = run(
      apiException({
        status: 409,
        code: 'CONFLICT',
        message: 'Уже есть',
        issues: [{ path: ['a', 0], message: 'dup' }],
      }),
    );
    expect(body).toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
      issues: [{ path: ['a', 0], message: 'dup' }],
    });
  });

  it('невалидный code в теле игнорируется', () => {
    const { body } = run(new HttpException({ code: 'HACKED', message: 'm' }, 403));
    expect(body.code).toBe('FORBIDDEN');
  });

  it('сообщение-массив (стандартный пайп Nest) приводится к строке исключения', () => {
    const { body } = run(new BadRequestException(['a: bad']));
    expect(typeof body.message).toBe('string');
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('5xx: общее сообщение, детали наружу не уходят, пишется в лог', () => {
    const { status, body } = run(new ServiceUnavailableException('БД: secret-host'));
    expect(status).toBe(503);
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.message).toBe('Внутренняя ошибка сервера');
    expect(error).toHaveBeenCalled();
  });

  it('ThrottlerException: 429 RATE_LIMITED', () => {
    const { status, body } = run(new ThrottlerException());
    expect(status).toBe(429);
    expect(body.code).toBe('RATE_LIMITED');
  });

  it('ошибка пайпа Standard Schema: 400 VALIDATION_FAILED со структурированными issues', async () => {
    const { z } = await import('zod');
    const pipe = createValidationPipe();
    const schema = z.object({ name: z.string(), tags: z.array(z.string()) });
    const thrown = await pipe
      .transform({ name: 1, tags: ['a', 2] }, { type: 'body', schema })
      .catch((e: unknown) => e);
    const { status, body } = run(thrown);
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['name'] }),
        expect.objectContaining({ path: ['tags', 1] }),
      ]),
    );
  });

  it('body-parser: слишком большое тело → 413', () => {
    const { status, body } = run(
      Object.assign(new Error('too large'), { type: 'entity.too.large', status: 413 }),
    );
    expect(status).toBe(413);
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('body-parser: битый JSON → 400 BAD_REQUEST', () => {
    const { status, body } = run(
      Object.assign(new SyntaxError('Unexpected'), { type: 'entity.parse.failed', status: 400 }),
    );
    expect(status).toBe(400);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.message).not.toContain('Unexpected');
  });

  it('неизвестная ошибка: 500 INTERNAL без деталей, стек в лог', () => {
    const { status, body } = run(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(body).toMatchObject({ code: 'INTERNAL', message: 'Внутренняя ошибка сервера' });
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(error).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('hunter2'));
  });

  it('не-Error (строка) тоже даёт 500', () => {
    expect(run('boom').status).toBe(500);
  });

  it('без requestId поле опускается', () => {
    const { body } = run(new ForbiddenException(), { requestId: '' });
    expect(body.requestId).toBeUndefined();
  });

  it('не-HTTP контекст пробрасывает исключение', () => {
    expect(() => run(new Error('x'), { type: 'rpc' })).toThrow('x');
  });
});
