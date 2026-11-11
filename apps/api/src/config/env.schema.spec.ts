import { envSchema } from './env.schema.js';

describe('envSchema', () => {
  it('применяет значения по умолчанию', () => {
    expect(envSchema.parse({})).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      WEB_ORIGIN: 'http://localhost:3000',
      THROTTLE_TTL_MS: 60000,
      THROTTLE_LIMIT: 100,
    });
  });

  it('приводит строки к числам', () => {
    const env = envSchema.parse({ PORT: '5000', THROTTLE_LIMIT: '7' });
    expect(env.PORT).toBe(5000);
    expect(env.THROTTLE_LIMIT).toBe(7);
  });

  it('отклоняет невалидный WEB_ORIGIN', () => {
    expect(envSchema.safeParse({ WEB_ORIGIN: 'не url' }).success).toBe(false);
  });

  it('отклоняет PORT=0 и PORT вне диапазона', () => {
    expect(envSchema.safeParse({ PORT: '0' }).success).toBe(false);
    expect(envSchema.safeParse({ PORT: '70000' }).success).toBe(false);
  });

  it('отклоняет нулевые и отрицательные лимиты throttler', () => {
    expect(envSchema.safeParse({ THROTTLE_LIMIT: '0' }).success).toBe(false);
    expect(envSchema.safeParse({ THROTTLE_TTL_MS: '-1' }).success).toBe(false);
  });

  it('отклоняет неизвестный NODE_ENV', () => {
    expect(envSchema.safeParse({ NODE_ENV: 'staging' }).success).toBe(false);
  });
});
