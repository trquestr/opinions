import type { z } from 'zod';
import { toUrlValue } from './url.js';

/**
 * Контракт эндпоинта — единственный источник правды о форме HTTP-ручки.
 *
 * Один и тот же объект использует:
 * - бэк (apps/api): маршрут, коды ответа, валидация входа и сериализация ответа;
 * - фронт (apps/web): типизированный клиент, который сам строит URL и проверяет ответ.
 *
 * Типы выводятся из zod-схем: входные данные клиента — `z.input`, что получает сервер после
 * валидации — `z.output`; для ответа наоборот (сервер отдаёт `z.input`, клиент получает `z.output`).
 */

/** Префикс всех ручек API (глобальный префикс Nest, маршрут прокси). */
export const API_PREFIX = '/api';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Успешные коды ответа, которые может объявить контракт. */
export type SuccessStatus = 200 | 201 | 202 | 204;

/**
 * Кто может вызывать ручку. Объявляется в контракте, а бэк проверяет его глобальным guard'ом,
 * поэтому «забыть закрыть ручку» нельзя: доступ не указан — контракт не скомпилируется.
 */
export type EndpointAccess = 'public' | 'user';

/** Путь относительно {@link API_PREFIX}: начинается с `/`, параметры — `:name`. */
export type EndpointPath = `/${string}`;

/** Имена параметров из шаблона пути: `/questions/:questionId/opinions/:id` → `'questionId' | 'id'`. */
export type PathParamNames<TPath extends string> = TPath extends `${string}:${infer Name}/${infer Rest}`
  ? Name | PathParamNames<`/${Rest}`>
  : TPath extends `${string}:${infer Name}`
    ? Name
    : never;

/** Схема объекта: params и query обязаны быть объектами (ключ → значение). */
export type ObjectSchema = z.ZodType<Record<string, unknown>, Record<string, unknown>>;

export interface EndpointConfig {
  readonly method: HttpMethod;
  readonly path: EndpointPath;
  readonly access: EndpointAccess;
  /** Параметры пути. Значения приходят строками — числа описывать через `z.coerce`. */
  readonly params?: ObjectSchema;
  /** Query-строка. Значения приходят строками — числа описывать через `z.coerce`. */
  readonly query?: ObjectSchema;
  /** Тело запроса. Только для POST/PUT/PATCH. */
  readonly body?: z.ZodType;
  /** Схема успешного ответа. Для 204 — `z.void()`/`z.undefined()`. */
  readonly response: z.ZodType;
  /** Код успешного ответа; по умолчанию 200 (201 для POST задавать явно). */
  readonly status?: SuccessStatus;
  /** Краткое описание для документации и логов. */
  readonly summary?: string;
}

/** Набор параметров пути обязан ровно совпадать с `:name` в шаблоне. */
type ParamsConstraint<TPath extends string> = [PathParamNames<TPath>] extends [never]
  ? { readonly params?: never }
  : {
      readonly params: z.ZodType<
        Record<PathParamNames<TPath>, unknown>,
        Record<PathParamNames<TPath>, unknown>
      >;
    };

/** Тело запрещено у GET и DELETE: часть прокси и кэшей его отбрасывают. */
type BodyConstraint<TMethod extends HttpMethod> = TMethod extends 'GET' | 'DELETE'
  ? { readonly body?: never }
  : unknown;

/**
 * Объявить эндпоинт. Проверяет на этапе компиляции, что params совпадают с шаблоном пути,
 * а у GET/DELETE нет тела. Возвращает тот же объект с сохранёнными литеральными типами.
 */
export function defineEndpoint<const TEndpoint extends EndpointConfig>(
  endpoint: TEndpoint & ParamsConstraint<TEndpoint['path']> & BodyConstraint<TEndpoint['method']>,
): TEndpoint {
  return endpoint;
}

type SchemaInput<TSchema> = TSchema extends z.ZodType ? z.input<TSchema> : undefined;
type SchemaOutput<TSchema> = TSchema extends z.ZodType ? z.output<TSchema> : undefined;

/** Что клиент передаёт в params (до валидации). */
export type ParamsInput<TEndpoint extends EndpointConfig> = SchemaInput<TEndpoint['params']>;
/** Что сервер получает в params (после валидации). */
export type ParamsOutput<TEndpoint extends EndpointConfig> = SchemaOutput<TEndpoint['params']>;
export type QueryInput<TEndpoint extends EndpointConfig> = SchemaInput<TEndpoint['query']>;
export type QueryOutput<TEndpoint extends EndpointConfig> = SchemaOutput<TEndpoint['query']>;
export type BodyInput<TEndpoint extends EndpointConfig> = SchemaInput<TEndpoint['body']>;
export type BodyOutput<TEndpoint extends EndpointConfig> = SchemaOutput<TEndpoint['body']>;
/** Что обработчик на сервере обязан вернуть (до сериализации схемой ответа). */
export type ResponseInput<TEndpoint extends EndpointConfig> = z.input<TEndpoint['response']>;
/** Что клиент получает после проверки ответа схемой. */
export type ResponseOutput<TEndpoint extends EndpointConfig> = z.output<TEndpoint['response']>;

/** Ключи запроса, которые есть у этого эндпоинта (`params`/`query`/`body`). */
type RequestParts<TEndpoint extends EndpointConfig> = (TEndpoint['params'] extends z.ZodType
  ? { readonly params: ParamsInput<TEndpoint> }
  : { readonly params?: never }) &
  (TEndpoint['query'] extends z.ZodType
    ? // Все поля query необязательны (фильтры, пагинация) — тогда и сам query можно не передавать.
      {} extends QueryInput<TEndpoint>
      ? { readonly query?: QueryInput<TEndpoint> }
      : { readonly query: QueryInput<TEndpoint> }
    : { readonly query?: never }) &
  (TEndpoint['body'] extends z.ZodType ? { readonly body: BodyInput<TEndpoint> } : { readonly body?: never });

/** Аргументы вызова эндпоинта клиентом. */
export type EndpointRequest<TEndpoint extends EndpointConfig> = RequestParts<TEndpoint>;

/** Код успешного ответа эндпоинта с учётом умолчания. */
export function successStatus(endpoint: EndpointConfig): SuccessStatus {
  return endpoint.status ?? 200;
}

/**
 * Подставить параметры в шаблон пути. Значения кодируются (`encodeURIComponent`),
 * поэтому `/` или `?` внутри id не сломают маршрут. Отсутствующий параметр — ошибка, а не `undefined` в URL.
 */
export function buildPath(path: EndpointPath, params?: Readonly<Record<string, unknown>>): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = toUrlValue(params?.[name]);
    if (value === undefined) {
      throw new Error(`Параметр пути "${name}" для ${path} не задан или не скаляр`);
    }
    return encodeURIComponent(value);
  });
}
