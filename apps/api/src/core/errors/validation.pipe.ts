import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { ApiErrorIssue } from '@opinions/contracts';
import { apiException } from './api-exception.filter.js';

/**
 * Глобальный пайп валидации по схемам контрактов (`@ContractBody` и др.). Стандартный пайп склеивает
 * проблемы в строки, а клиенту нужны структурированные `issues` (путь + сообщение) для подсветки полей.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      apiException(
        400,
        'VALIDATION_FAILED',
        'Некорректные данные запроса',
        issues.map((issue): ApiErrorIssue => ({
          path: (issue.path ?? []).map((segment) => {
            const key = typeof segment === 'object' ? segment.key : segment;
            return typeof key === 'number' ? key : String(key);
          }),
          message: issue.message,
        })),
      ),
  });
}
