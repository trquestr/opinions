import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineEndpoint } from '../core/endpoint.js';
import { backoffDelay, createApiClient } from './client.js';
import { ApiContractError, ApiNetworkError, ApiRequestError } from './errors.js';

const getItem = defineEndpoint({
  method: 'GET',
  path: '/items/:id',
  access: 'public',
  params: z.object({ id: z.string() }),
  query: z.object({ tags: z.array(z.string()).optional(), page: z.coerce.number().optional() }),
  response: z.object({ id: z.string() }),
});

const createItem = defineEndpoint({
  method: 'POST',
  path: '/items',
  access: 'user',
  status: 201,
  body: z.object({ name: z.string().min(1) }),
  response: z.object({ id: z.string() }),
});

const deleteItem = defineEndpoint({
  method: 'DELETE',
  path: '/items/:id',
  access: 'user',
  status: 204,
  params: z.object({ id: z.string() }),
  response: z.undefined(),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(responses: (Response | Error)[]) {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('нет ответа в моке');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async () => {});
  const client = createApiClient({
    baseUrl: 'http://api:4000/',
    fetch: fetchMock,
    sleep,
    random: () => 0.5,
    headers: () => ({ cookie: 'session=1' }),
  });
  return { client, fetchMock, sleep };
}

describe('createApiClient', () => {
  it('строит URL, передаёт заголовки и проверяет ответ', async () => {
    const { client, fetchMock } = setup([json(200, { id: 'a b', extra: 'отбросится' })]);
    const result = await client.call(getItem, {
      params: { id: 'a b' },
      query: { tags: ['x', 'y'], page: 2 },
    });
    expect(result).toEqual({ id: 'a b' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api:4000/api/items/a%20b?tags=x&tags=y&page=2');
    expect(init?.method).toBe('GET');
    const headers = new Headers(init?.headers);
    expect(headers.get('cookie')).toBe('session=1');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.has('content-type')).toBe(false);
  });

  it('отправляет тело JSON и не ретраит POST', async () => {
    const { client, fetchMock } = setup([
      json(503, { statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: 'нет' }),
    ]);
    await expect(
      client.call(createItem, { body: { name: 'x' } }, { headers: { 'x-request-id': 'r1' } }),
    ).rejects.toThrow(ApiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1];
    expect(init?.body).toBe(JSON.stringify({ name: 'x' }));
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-request-id')).toBe('r1');
  });

  it('проверяет вход до отправки', async () => {
    const { client, fetchMock } = setup([]);
    await expect(client.call(createItem, { body: { name: '' } })).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ретраит GET на 503 и сетевой сбой с backoff, потом успех', async () => {
    const { client, fetchMock, sleep } = setup([
      json(503, {}),
      new TypeError('fetch failed'),
      json(200, { id: '1' }),
    ]);
    await expect(client.call(getItem, { params: { id: '1' } })).resolves.toEqual({ id: '1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // random=0.5: 0.5·min(2000, 200·2^0)=100, затем 0.5·400=200
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });

  it('после исчерпания ретраев сетевой сбой — ApiNetworkError', async () => {
    const { client, fetchMock } = setup([new TypeError('a'), new TypeError('b'), new TypeError('c')]);
    const error = await client.call(getItem, { params: { id: '1' } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiNetworkError);
    expect((error as ApiNetworkError).timedOut).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('не ретраит 4xx и разбирает общий формат ошибки', async () => {
    const { client, fetchMock } = setup([
      json(404, { statusCode: 404, code: 'NOT_FOUND', message: 'Нет такого' }),
    ]);
    const error = await client.call(getItem, { params: { id: '1' } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).error).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Нет такого',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ошибка не нашего формата (прокси) превращается в общий формат', async () => {
    const { client } = setup([new Response('<html>Bad Gateway</html>', { status: 400 })]);
    const error = (await client
      .call(getItem, { params: { id: '1' } })
      .catch((e: unknown) => e)) as ApiRequestError;
    expect(error.error).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'Неожиданный ответ сервера',
    });
  });

  it('ответ не по контракту — ApiContractError', async () => {
    const { client } = setup([json(200, { id: 42 })]);
    const error = await client.call(getItem, { params: { id: '1' } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiContractError);
    expect((error as ApiContractError).issues[0]?.path).toEqual(['id']);
  });

  it('204 — пустое тело', async () => {
    const { client } = setup([new Response(null, { status: 204 })]);
    await expect(client.call(deleteItem, { params: { id: '1' } })).resolves.toBeUndefined();
  });

  it('пустое тело при 200 не проходит схему объекта', async () => {
    const { client } = setup([new Response('', { status: 200 })]);
    await expect(client.call(createItem, { body: { name: 'x' } })).rejects.toThrow(ApiContractError);
  });

  it('таймаут даёт ApiNetworkError с timedOut', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const client = createApiClient({ baseUrl: '', fetch: fetchMock, timeoutMs: 5, retry: { retries: 0 } });
    const error = await client.call(getItem, { params: { id: '1' } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiNetworkError);
    expect((error as ApiNetworkError).timedOut).toBe(true);
  });

  it('отмена вызывающим не ретраится и пробрасывается как есть', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    const client = createApiClient({ baseUrl: '', fetch: fetchMock });
    await expect(
      client.call(getItem, { params: { id: '1' } }, { signal: controller.signal }),
    ).rejects.toThrow('aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('backoffDelay', () => {
  it('растёт экспоненциально и упирается в потолок', () => {
    const policy = { retries: 5, baseDelayMs: 100, maxDelayMs: 1000 };
    expect(backoffDelay(policy, 0, () => 1)).toBe(100);
    expect(backoffDelay(policy, 3, () => 1)).toBe(800);
    expect(backoffDelay(policy, 10, () => 1)).toBe(1000);
    expect(backoffDelay(policy, 10, () => 0)).toBe(0);
  });
});
