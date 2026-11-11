import { ConsoleLogger, type LoggerService } from '@nestjs/common';
import type { LogFormat } from '../../config/env.schema.js';

/**
 * Логгер приложения. В json-режиме каждая запись — одна JSON-строка (для агрегатора логов).
 * Значения секретов маскируем по имени ключа на случай, если их передадут в структурированные параметры.
 * Персональные данные в логи не пишем вообще — только id и технические поля.
 */
export function createLogger(format: LogFormat): LoggerService {
  return new ConsoleLogger({
    json: format === 'json',
    colors: format === 'pretty',
    redact: ['password', 'token', 'authorization', 'cookie', 'secret'],
  });
}
