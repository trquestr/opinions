import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  buildPath,
  defineEndpoint,
  successStatus,
  type BodyInput,
  type EndpointRequest,
  type ParamsOutput,
  type PathParamNames,
  type QueryOutput,
  type ResponseInput,
  type ResponseOutput,
} from './endpoint.js';

const getOpinion = defineEndpoint({
  method: 'GET',
  path: '/questions/:questionId/opinions/:opinionId',
  access: 'public',
  params: z.object({ questionId: z.string(), opinionId: z.string() }),
  query: z.object({ limit: z.coerce.number().default(10) }),
  response: z.object({ id: z.string(), createdAt: z.string().transform((value) => new Date(value)) }),
});

const createOpinion = defineEndpoint({
  method: 'POST',
  path: '/opinions',
  access: 'user',
  status: 201,
  body: z.object({ text: z.string().trim() }),
  response: z.object({ id: z.string() }),
});

describe('defineEndpoint', () => {
  it('возвращает тот же объект', () => {
    expect(createOpinion.path).toBe('/opinions');
    expect(successStatus(createOpinion)).toBe(201);
    expect(successStatus(getOpinion)).toBe(200);
  });

  it('выводит имена параметров из шаблона пути', () => {
    expectTypeOf<PathParamNames<'/a/:x/b/:y'>>().toEqualTypeOf<'x' | 'y'>();
    expectTypeOf<PathParamNames<'/a'>>().toEqualTypeOf<never>();
  });

  it('разделяет вход клиента и выход сервера', () => {
    expectTypeOf<ParamsOutput<typeof getOpinion>>().toEqualTypeOf<{
      questionId: string;
      opinionId: string;
    }>();
    expectTypeOf<QueryOutput<typeof getOpinion>>().toEqualTypeOf<{ limit: number }>();
    expectTypeOf<ResponseInput<typeof getOpinion>>().toEqualTypeOf<{ id: string; createdAt: string }>();
    expectTypeOf<ResponseOutput<typeof getOpinion>>().toEqualTypeOf<{ id: string; createdAt: Date }>();
    expectTypeOf<BodyInput<typeof createOpinion>>().toEqualTypeOf<{ text: string }>();
  });

  it('требует params, если они есть в пути, и запрещает лишние части запроса', () => {
    expectTypeOf<EndpointRequest<typeof createOpinion>>().toExtend<{ body: { text: string } }>();
    // @ts-expect-error — у POST /opinions нет params
    const withParams: EndpointRequest<typeof createOpinion> = { body: { text: 'a' }, params: {} };
    // @ts-expect-error — без обязательных params
    const withoutParams: EndpointRequest<typeof getOpinion> = {};
    expect([withParams, withoutParams]).toHaveLength(2);
  });

  it('не компилирует рассинхрон params с путём и тело у GET', () => {
    defineEndpoint({
      method: 'GET',
      path: '/items/:id',
      access: 'public',
      // @ts-expect-error — в схеме нет параметра id из пути
      params: z.object({ slug: z.string() }),
      response: z.object({}),
    });
    // @ts-expect-error — в пути есть :id, а params не объявлены
    defineEndpoint({ method: 'GET', path: '/items/:id', access: 'public', response: z.object({}) });
    // Объект — отдельно, чтобы вызов оставался одной строкой: при конфликте TS сообщает ошибку по всем полям,
    // и многострочный литерал не накрыть одной директивой @ts-expect-error.
    const getWithBody = {
      method: 'GET',
      path: '/items',
      access: 'public',
      body: z.object({}),
      response: z.object({}),
    } as const;
    // @ts-expect-error — у GET не бывает тела
    defineEndpoint(getWithBody);
    // А у POST — можно.
    defineEndpoint({
      method: 'POST',
      path: '/items',
      access: 'user',
      body: z.object({}),
      response: z.object({}),
    });
    // @ts-expect-error — уровень доступа обязателен
    defineEndpoint({ method: 'GET', path: '/items', response: z.object({}) });
  });
});

describe('buildPath', () => {
  it('подставляет и кодирует параметры', () => {
    expect(buildPath('/q/:id/o/:oid', { id: 'a b', oid: 'x/y' })).toBe('/q/a%20b/o/x%2Fy');
    expect(buildPath('/health')).toBe('/health');
    expect(buildPath('/n/:num', { num: 5 })).toBe('/n/5');
  });

  it('падает на отсутствующем параметре, а не вставляет undefined', () => {
    expect(() => buildPath('/q/:id', {})).toThrow('id');
    expect(() => buildPath('/q/:id')).toThrow('id');
    expect(() => buildPath('/q/:id', { id: '' })).toThrow('id');
    expect(() => buildPath('/q/:id', { id: null })).toThrow('id');
  });
});
