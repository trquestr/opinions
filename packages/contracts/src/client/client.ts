import { apiErrorCodeForStatus, apiErrorSchema, type ApiError } from '../core/error.js';
import {
  API_PREFIX,
  buildPath,
  successStatus,
  type EndpointConfig,
  type EndpointRequest,
  type ResponseOutput,
} from '../core/endpoint.js';
import { toUrlValue } from '../core/url.js';
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

/** Настройки клиента после подстановки значений по умолчанию. */
interface ClientSettings {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
  readonly retry: RetryPolicy;
  readonly headers: ApiClientOptions['headers'];
  readonly random: () => number;
  readonly sleep: (ms: number) => Promise<void>;
}

/** Запрос, готовый к отправке: всё, что не меняется между попытками. */
interface PreparedRequest {
  readonly label: string;
  readonly url: string;
  readonly init: RequestInit;
  readonly maxRetries: number;
}

/** Итог одной попытки. Ошибка вызывающего (отмена) сюда не попадает — она пробрасывается сразу. */
type AttemptOutcome =
  | { readonly kind: 'success'; readonly response: Response }
  | { readonly kind: 'http-error'; readonly response: Response; readonly retryable: boolean }
  | { readonly kind: 'network-error'; readonly error: ApiNetworkError; readonly retryable: true };

/** Сырые части запроса: типы конкретного эндпоинта проверены в сигнатуре `call`. */
interface RequestParts {
  readonly params?: Readonly<Record<string, unknown>>;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const settings: ClientSettings = {
    baseUrl: options.baseUrl,
    fetch: options.fetch ?? globalThis.fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retry: { ...DEFAULT_RETRY, ...options.retry },
    headers: options.headers,
    random: options.random ?? Math.random,
    sleep: options.sleep ?? defaultSleep,
  };

  async function call<TEndpoint extends EndpointConfig>(
    endpoint: TEndpoint,
    request: EndpointRequest<TEndpoint>,
    callOptions: CallOptions = {},
  ): Promise<ResponseOutput<TEndpoint>> {
    const prepared = await prepareRequest({
      endpoint,
      parts: request as RequestParts,
      callOptions,
      settings,
    });
    for (let attempt = 0; ; attempt += 1) {
      const outcome = await attemptOnce(prepared, callOptions, settings);
      if (outcome.kind === 'success') return parseSuccess(endpoint, outcome.response, prepared.label);
      if (attempt >= prepared.maxRetries || !outcome.retryable) throw await toError(outcome);
      if (outcome.kind === 'http-error') await outcome.response.body?.cancel();
      await settings.sleep(backoffDelay(settings.retry, attempt, settings.random));
    }
  }

  return { call };
}

/**
 * Проверяет вход до отправки (ошибка программиста видна сразу, а не как 400 от сервера) и собирает
 * URL, заголовки и тело. Отправляются исходные данные (z.input) — сервер сам применит схему.
 */
async function prepareRequest(args: {
  readonly endpoint: EndpointConfig;
  readonly parts: RequestParts;
  readonly callOptions: CallOptions;
  readonly settings: ClientSettings;
}): Promise<PreparedRequest> {
  const { endpoint, parts, callOptions, settings } = args;
  const label = `${endpoint.method} ${endpoint.path}`;
  assertValid(endpoint.params, parts.params, `${label}: params`);
  // Не переданный query сервер видит как `{}` — так и проверяем.
  assertValid(endpoint.query, parts.query ?? {}, `${label}: query`);
  assertValid(endpoint.body, parts.body, `${label}: body`);

  const headers = new Headers(await settings.headers?.());
  new Headers(callOptions.headers).forEach((value, key) => headers.set(key, value));
  headers.set('accept', 'application/json');
  const hasBody = endpoint.body !== undefined;
  if (hasBody) headers.set('content-type', 'application/json');

  const path = `${settings.baseUrl.replace(/\/+$/, '')}${API_PREFIX}${buildPath(endpoint.path, parts.params)}`;
  return {
    label,
    url: withQuery(path, parts.query),
    init: {
      ...callOptions.init,
      method: endpoint.method,
      headers,
      body: hasBody ? JSON.stringify(parts.body) : undefined,
    },
    // Повторяем только идемпотентный GET.
    maxRetries: endpoint.method === 'GET' ? settings.retry.retries : 0,
  };
}

/** Одна попытка с собственным таймаутом; отмена вызывающим — не сбой сети, её пробрасываем как есть. */
async function attemptOnce(
  prepared: PreparedRequest,
  callOptions: CallOptions,
  settings: ClientSettings,
): Promise<AttemptOutcome> {
  const timeout = AbortSignal.timeout(callOptions.timeoutMs ?? settings.timeoutMs);
  const signal = callOptions.signal ? AbortSignal.any([callOptions.signal, timeout]) : timeout;
  try {
    const response = await settings.fetch(prepared.url, { ...prepared.init, signal });
    if (response.ok) return { kind: 'success', response };
    return { kind: 'http-error', response, retryable: RETRYABLE_STATUSES.has(response.status) };
  } catch (cause) {
    if (callOptions.signal?.aborted) throw cause;
    const error = new ApiNetworkError(prepared.label, timeout.aborted, { cause });
    return { kind: 'network-error', error, retryable: true };
  }
}

async function toError(outcome: Exclude<AttemptOutcome, { kind: 'success' }>): Promise<Error> {
  if (outcome.kind === 'network-error') return outcome.error;
  return new ApiRequestError(outcome.response.status, await parseError(outcome.response));
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

/**
 * Дописывает query-строку. `undefined`/`null`/пустые значения пропускаются, массив — повтором ключа
 * (`tags=a&tags=b`). Не скаляр (объект) — ошибка: в URL он стал бы `[object Object]`.
 */
function withQuery(path: string, query: Readonly<Record<string, unknown>> | undefined): string {
  if (!query) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const items: readonly unknown[] = Array.isArray(value) ? value : [value];
    for (const item of items) appendQueryValue({ search, key, value: item });
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

function appendQueryValue(args: {
  readonly search: URLSearchParams;
  readonly key: string;
  readonly value: unknown;
}): void {
  const { search, key, value } = args;
  if (value === undefined || value === null || value === '') return;
  const text = toUrlValue(value);
  if (text === undefined) throw new TypeError(`Параметр query "${key}" не скаляр`);
  search.append(key, text);
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
