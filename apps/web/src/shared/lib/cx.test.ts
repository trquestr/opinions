import { describe, expect, it } from 'vitest';
import { cx } from './cx';

describe('cx', () => {
  it('склеивает классы через пробел', () => {
    expect(cx('a', 'b')).toBe('a b');
  });

  it('пропускает false, null, undefined и пустые строки', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('без аргументов возвращает пустую строку', () => {
    expect(cx()).toBe('');
  });

  it('поддерживает условные классы', () => {
    const isActive = false;
    expect(cx('base', isActive && 'active')).toBe('base');
  });
});
