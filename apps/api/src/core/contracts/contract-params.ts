import { Body, Param, Query } from '@nestjs/common';
import type { EndpointConfig } from '@untesis/contracts';
import type { z } from 'zod';

/** Контракт, у которого обязательно есть часть `K`. */
type WithPart<K extends 'body' | 'params' | 'query'> = EndpointConfig & { readonly [P in K]: z.ZodType };

// Схема из контракта прогоняется глобальным StandardSchemaValidationPipe: неверные типы, форматы и длины
// отклоняются на границе (400 VALIDATION_FAILED), обработчик получает уже разобранные данные.

export function ContractBody<TContract extends WithPart<'body'>>(contract: TContract): ParameterDecorator {
  return Body({ schema: contract.body });
}

export function ContractParams<TContract extends WithPart<'params'>>(
  contract: TContract,
): ParameterDecorator {
  return Param({ schema: contract.params });
}

export function ContractQuery<TContract extends WithPart<'query'>>(contract: TContract): ParameterDecorator {
  return Query({ schema: contract.query });
}
