import { apiErrorCodeForStatus, apiErrorSchema, type ApiError } from '../core/error.js';
import {
  API_PREFIX,
  buildPath,
  successStatus,
  type EndpointConfig,
  type EndpointRequest,
  type ResponseOutput,
} from '../core/endpoint.js';
import { ApiContractError, ApiNetworkError, ApiRequestError } from './errors.js';

/**
 * Типизированный HTTP-клиент по контрактам. Изоморфный: работает и в Server Components Next,
 * и в браузере, и в тестах (fetch подменяется).
 *
 * Устойчивость к отказам:
 * - таймаут на каждый запрос (`AbortSignal.timeout`), без него запрос может висеть вечно;
 * - ретраи ТОЛЬКО для идемпотентного GET и только на временные сбои (сеть, таймаут, 429, 502–504),
 *   с экспоненциальной задержкой и full jitter: delay = random · min(maxDelay, baseDelay · 2^attempt);
 * - ответ всегда проверяется схемой контракта — рассинхрон с бэком виден сразу, а не в UI.
 */

export interface RetryPolicy {
  /** Сколько раз повторить после первой попытки. 0 — без повторов. */
  readonly retries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export interface ApiClientOptions {
  /** Origin API без префикса: `http://api:4000` на сервере, `''` (тот же origin) в браузере. */
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  /** Таймаут одной попытки, мс. */
  readonly timeoutMs?: number;
  readonly retry?: Partial<RetryPolicy>;
  /** Заголовки на каждый запрос (например, пробросить cookie сессии из Server Component). */
  readonly headers?: () => HeadersInit | Promise<HeadersInit>;
  /** Для тестов: источник случайности и ожидание. */
  readonly random?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Дополнительные параметры одного вызова. `init` пробрасывается в fetch (в Next — `next`, `cache`). */
export interface CallOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly headers?: HeadersInit;
  readonly init?: Omit<RequestInit, 'method' | 'body' | 'signal' | 'headers'>;
}

export interface ApiClient {
  call<TEndpoint extends EndpointConfig>(
    endpoint: TEndpoint,
    request: EndpointRequest<TEndpoint>,
    options?: CallOptions,
  ): Promise<ResponseOutput<TEndpoint>>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY: RetryPolicy = { retries: 2, baseDelayMs: 200, maxDelayMs: 2_000 };
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const retry: RetryPolicy = { ...DEFAULT_RETRY, ...options.retry };
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  async function call<TEndpoint extends EndpointConfig>(
    endpoint: TEndpoint,
    request: EndpointRequest<TEndpoint>,
    callOptions: CallOptions = {},
  ): Promise<ResponseOutput<TEndpoint>> {
    const label = `${endpoint.method} ${endpoint.path}`;
    const req = request as {
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: unknown;
    };

    // Вход проверяем до отправки: ошибка программиста видна сразу, а не как 400 от сервера.
    // Отправляем исходные данные (z.input) — сервер сам применит схему.
    assertValid(endpoint.params, req.params, `${label}: params`);
    // Не переданный query сервер видит как `{}` — так и проверяем.
    assertValid(endpoint.query, req.query ?? {}, `${label}: query`);
    assertValid(endpoint.body, req.body, `${label}: body`);

    const url = buildUrl(options.baseUrl, endpoint, req.params, req.query);
    const headers = new Headers(await options.headers?.());
    new Headers(callOptions.headers).forEach((value, key) => headers.set(key, value));
    headers.set('accept', 'application/json');
    const hasBody = endpoint.body !== undefined;
    if (hasBody) headers.set('content-type', 'application/json');

    const maxRetries = endpoint.method === 'GET' ? retry.retries : 0;

    for (let attempt = 0; ; attempt += 1) {
      const timeout = AbortSignal.timeout(callOptions.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const signal = callOptions.signal ? AbortSignal.any([callOptions.signal, timeout]) : timeout;

      let response: Response;
      try {
        response = await fetchImpl(url, {
          ...callOptions.init,
          method: endpoint.method,
          headers,
          body: hasBody ? JSON.stringify(req.body) : undefined,
          signal,
        });
      } catch (cause) {
        // Отмена вызывающим — не сбой сети: не ретраим и пробрасываем как есть.
        if (callOptions.signal?.aborted) throw cause;
        const error = new ApiNetworkError(label, timeout.aborted, { cause });
        if (attempt < maxRetries) {
          await sleep(backoffDelay(retry, attempt, random));
          continue;
        }
        throw error;
      }

      if (response.ok) return parseSuccess(endpoint, response, label);

      if (attempt < maxRetries && RETRYABLE_STATUSES.has(response.status)) {
        await response.body?.cancel();
        await sleep(backoffDelay(retry, attempt, random));
        continue;
      }
      throw new ApiRequestError(response.status, await parseError(response));
    }
  }

  return { call };
}

/** Full jitter: равномерно в [0, min(max, base·2^attempt)] — разносит повторы разных клиентов. */
export function backoffDelay(policy: RetryPolicy, attempt: number, random: () => number): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

function assertValid(schema: EndpointConfig['body'], value: unknown, label: string): void {
  if (!schema) return;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new TypeError(`${label} не проходит схему контракта: ${result.error.message}`);
  }
}

function buildUrl(
  baseUrl: string,
  endpoint: EndpointConfig,
  params: Record<string, unknown> | undefined,
  query: Record<string, unknown> | undefined,
): string {
  const path = `${baseUrl.replace(/\/+$/, '')}${API_PREFIX}${buildPath(endpoint.path, params)}`;
  if (!query) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

async function parseSuccess<TEndpoint extends EndpointConfig>(
  endpoint: TEndpoint,
  response: Response,
  label: string,
): Promise<ResponseOutput<TEndpoint>> {
  const isEmpty = response.status === 204 || successStatus(endpoint) === 204;
  const raw: unknown = isEmpty ? undefined : await readJson(response);
  const result = endpoint.response.safeParse(raw);
  if (!result.success) {
    throw new ApiContractError(
      label,
      result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }
  return result.data as ResponseOutput<TEndpoint>;
}

async function parseError(response: Response): Promise<ApiError> {
  const raw = await readJson(response);
  const parsed = apiErrorSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Ошибку отдал не наш бэк (прокси, балансировщик) — собираем общий формат сами.
  return {
    statusCode: response.status,
    code: apiErrorCodeForStatus(response.status),
    message: 'Неожиданный ответ сервера',
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
