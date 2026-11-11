import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiErrorCodeForStatus, apiErrorSchema } from './error.js';
import { cursorPageQuerySchema, cursorPageSchema, PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from './pagination.js';
import { idSchema, isoDateSchema, isoDateTimeSchema, userText } from './primitives.js';
import { healthContract, readinessContract } from '../health.js';

describe('primitives', () => {
  it('idSchema принимает только UUID v7', () => {
    expect(idSchema.safeParse('01938d5c-8a4e-7b2c-9f1a-0123456789ab').success).toBe(true);
    // v4
    expect(idSchema.safeParse('3b241101-e2bb-4255-8caf-4136c566a962').success).toBe(false);
    expect(idSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('даты — строго ISO', () => {
    expect(isoDateTimeSchema.safeParse('2026-11-11T08:00:00+03:00').success).toBe(true);
    expect(isoDateTimeSchema.safeParse('2026-11-11T08:00:00Z').success).toBe(true);
    expect(isoDateTimeSchema.safeParse('11.11.2026').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-11-11').success).toBe(true);
    expect(isoDateSchema.safeParse('2026-13-01').success).toBe(false);
  });

  it('userText обрезает пробелы и держит границы', () => {
    const text = userText({ max: 5 });
    expect(text.parse('  да  ')).toBe('да');
    expect(text.safeParse('   ').success).toBe(false);
    expect(text.safeParse('слишком длинно').success).toBe(false);
    expect(userText({ min: 3, max: 10 }).safeParse('ab').success).toBe(false);
  });
});

describe('pagination', () => {
  it('limit по умолчанию, приводится из строки и ограничен сверху', () => {
    expect(cursorPageQuerySchema.parse({})).toEqual({ limit: PAGE_LIMIT_DEFAULT });
    expect(cursorPageQuerySchema.parse({ limit: '7', cursor: 'abc' })).toEqual({ limit: 7, cursor: 'abc' });
    expect(cursorPageQuerySchema.safeParse({ limit: String(PAGE_LIMIT_MAX + 1) }).success).toBe(false);
    expect(cursorPageQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('страница — элементы и курсор', () => {
    const page = cursorPageSchema(z.object({ id: z.string() }));
    expect(page.parse({ items: [{ id: 'a' }], nextCursor: null })).toEqual({
      items: [{ id: 'a' }],
      nextCursor: null,
    });
    expect(page.safeParse({ items: [{ id: 1 }], nextCursor: null }).success).toBe(false);
  });
});

describe('errors', () => {
  it('код по статусу', () => {
    const cases: [number, string][] = [
      [400, 'BAD_REQUEST'],
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [409, 'CONFLICT'],
      [413, 'PAYLOAD_TOO_LARGE'],
      [415, 'UNSUPPORTED_MEDIA_TYPE'],
      [422, 'VALIDATION_FAILED'],
      [429, 'RATE_LIMITED'],
      [503, 'SERVICE_UNAVAILABLE'],
      [500, 'INTERNAL'],
      [502, 'INTERNAL'],
      [418, 'BAD_REQUEST'],
    ];
    for (const [status, code] of cases) expect(apiErrorCodeForStatus(status)).toBe(code);
  });

  it('схема ошибки отбрасывает лишние поля (стек не утечёт)', () => {
    const parsed = apiErrorSchema.parse({ statusCode: 500, code: 'INTERNAL', message: 'x', stack: 'secret' });
    expect(parsed).not.toHaveProperty('stack');
    expect(apiErrorSchema.safeParse({ statusCode: 200, code: 'INTERNAL', message: 'x' }).success).toBe(false);
  });
});

describe('health', () => {
  it('контракты состояния', () => {
    expect(healthContract.response.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(
      readinessContract.response.safeParse({ status: 'ok', checks: { database: 'up', redis: 'up' } }).success,
    ).toBe(true);
    expect(
      readinessContract.response.safeParse({ status: 'ok', checks: { database: 'down', redis: 'up' } })
        .success,
    ).toBe(false);
  });
});
