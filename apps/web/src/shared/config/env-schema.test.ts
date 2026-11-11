import { describe, expect, it } from 'vitest';
import { parsePublicEnv, parseServerEnv } from './env-schema';

describe('parseServerEnv', () => {
  it('подставляет значение по умолчанию', () => {
    expect(parseServerEnv({})).toEqual({ API_INTERNAL_URL: 'http://localhost:4000' });
  });

  it('принимает валидный URL', () => {
    expect(parseServerEnv({ API_INTERNAL_URL: 'http://api:4000' }).API_INTERNAL_URL).toBe('http://api:4000');
  });

  it('пустая строка = не задано', () => {
    expect(parseServerEnv({ API_INTERNAL_URL: '' }).API_INTERNAL_URL).toBe('http://localhost:4000');
  });

  it('отклоняет не-URL с понятным сообщением', () => {
    expect(() => parseServerEnv({ API_INTERNAL_URL: 'not a url' })).toThrow(
      /серверное окружение.*API_INTERNAL_URL/,
    );
  });

  it('отклоняет схемы кроме http(s)', () => {
    expect(() => parseServerEnv({ API_INTERNAL_URL: 'javascript:alert(1)' })).toThrow(/API_INTERNAL_URL/);
  });

  it('не показывает значение переменной в сообщении', () => {
    expect(() => parseServerEnv({ API_INTERNAL_URL: 'secret-value' })).not.toThrow(/secret-value/);
  });
});

describe('parsePublicEnv', () => {
  it('подставляет значение по умолчанию', () => {
    expect(parsePublicEnv({}).NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000');
  });

  it('убирает завершающий слэш', () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_SITE_URL: 'https://untesis.example/' }).NEXT_PUBLIC_SITE_URL).toBe(
      'https://untesis.example',
    );
  });

  it('отклоняет невалидный URL', () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SITE_URL: 'нет' })).toThrow(
      /публичное окружение.*NEXT_PUBLIC_SITE_URL/,
    );
  });
});
