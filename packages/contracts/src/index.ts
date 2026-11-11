/**
 * @opinions/contracts — контракты API «Мнений».
 *
 * Правила пакета:
 * - только схемы, типы и чистые функции; никакого доступа к БД, env, DOM, фреймворкам;
 * - домен — отдельный файл/папка (`questions`, `opinions`, `profiles`…), экспорт — через этот индекс;
 * - менять существующий контракт совместимо: новое поле — optional, удаление — через версию ручки.
 */
export * from './core/endpoint.js';
export * from './core/error.js';
export * from './core/pagination.js';
export * from './core/primitives.js';
export * from './health.js';
