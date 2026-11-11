import { z } from 'zod';
import { defineEndpoint } from './core/endpoint.js';

/**
 * Служебные ручки состояния. Liveness — процесс жив (без внешних зависимостей, для рестарта
 * контейнера). Readiness — готов принимать трафик (БД и Redis отвечают), для балансировщика.
 */

export const healthContract = defineEndpoint({
  method: 'GET',
  path: '/health',
  access: 'public',
  summary: 'Liveness: процесс жив',
  response: z.object({ status: z.literal('ok') }),
});

/**
 * Если хоть одна зависимость не ответила за отведённое время — 503 в общем формате ошибки
 * (`code: 'SERVICE_UNAVAILABLE'`), как у любой другой ручки. 200 означает: всё поднято.
 */
export const readinessContract = defineEndpoint({
  method: 'GET',
  path: '/health/ready',
  access: 'public',
  summary: 'Readiness: БД и Redis отвечают',
  response: z.object({
    status: z.literal('ok'),
    checks: z.object({
      database: z.literal('up'),
      redis: z.literal('up'),
    }),
  }),
});
