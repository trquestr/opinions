import { envSchema, resolveLogFormat } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('envSchema', () => {
  it('подставляет дефолты', () => {
    const env = envSchema.parse(base);
    expect(env).toMatchObject({ PORT: 4000, DB_POOL_MAX: 10, NODE_ENV: 'development' });
    expect(env.LOG_FORMAT).toBeUndefined();
  });

  it('требует DATABASE_URL и REDIS_URL', () => {
    expect(envSchema.safeParse({}).success).toBe(false);
    expect(envSchema.safeParse({ REDIS_URL: base.REDIS_URL }).success).toBe(false);
    expect(envSchema.safeParse({ DATABASE_URL: base.DATABASE_URL }).success).toBe(false);
  });

  it('принимает postgresql:// и rediss://', () => {
    expect(
      envSchema.safeParse({ DATABASE_URL: 'postgresql://u@h/db', REDIS_URL: 'rediss://h:6380' }).success,
    ).toBe(true);
  });

  it('отклоняет чужие протоколы', () => {
    expect(envSchema.safeParse({ ...base, DATABASE_URL: 'mysql://u@h/db' }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, REDIS_URL: 'http://h' }).success).toBe(false);
  });

  it('DB_POOL_MAX: границы 1..100', () => {
    expect(envSchema.safeParse({ ...base, DB_POOL_MAX: '0' }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, DB_POOL_MAX: '101' }).success).toBe(false);
    expect(envSchema.parse({ ...base, DB_POOL_MAX: '25' }).DB_POOL_MAX).toBe(25);
  });

  it('LOG_FORMAT: только json или pretty', () => {
    expect(envSchema.safeParse({ ...base, LOG_FORMAT: 'xml' }).success).toBe(false);
    expect(envSchema.parse({ ...base, LOG_FORMAT: 'json' }).LOG_FORMAT).toBe('json');
  });
});

describe('resolveLogFormat', () => {
  it('явное значение главнее NODE_ENV', () => {
    expect(resolveLogFormat({ NODE_ENV: 'production', LOG_FORMAT: 'pretty' })).toBe('pretty');
  });
  it('в production по умолчанию json, иначе pretty', () => {
    expect(resolveLogFormat({ NODE_ENV: 'production', LOG_FORMAT: undefined })).toBe('json');
    expect(resolveLogFormat({ NODE_ENV: 'development', LOG_FORMAT: undefined })).toBe('pretty');
  });
});
