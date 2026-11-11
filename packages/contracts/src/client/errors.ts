import type { ApiError } from '../core/error.js';

/** Сервер ответил ошибкой (не-2xx). `error` — уже разобранный общий формат ошибки. */
export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError';

  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(`${status} ${error.code}: ${error.message}`);
  }
}

/** Ответ пришёл, но не совпал со схемой контракта: рассинхрон фронта и бэка, это баг. */
export class ApiContractError extends Error {
  override readonly name = 'ApiContractError';

  constructor(
    readonly endpoint: string,
    readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
  ) {
    super(`Ответ ${endpoint} не соответствует контракту`);
  }
}

/** Запрос не дошёл до сервера или не дождался ответа (сеть, DNS, таймаут). */
export class ApiNetworkError extends Error {
  override readonly name = 'ApiNetworkError';

  constructor(
    readonly endpoint: string,
    readonly timedOut: boolean,
    options?: { readonly cause?: unknown },
  ) {
    super(timedOut ? `Таймаут запроса ${endpoint}` : `Сетевая ошибка при запросе ${endpoint}`, options);
  }
}
