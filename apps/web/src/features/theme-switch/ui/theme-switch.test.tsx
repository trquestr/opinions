import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeSwitch } from '../index';

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  delete root.dataset.theme;
});

afterEach(cleanup);

describe('ThemeSwitch', () => {
  it('в светлой теме предлагает включить тёмную', () => {
    render(<ThemeSwitch />);
    expect(screen.getByRole('button', { name: 'Включить тёмную тему' })).toBeTruthy();
  });

  it('клик переключает тему, атрибут <html> и подпись', () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole('button', { name: 'Включить тёмную тему' }));
    expect(root.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Включить светлую тему' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Включить светлую тему' }));
    expect(root.dataset.theme).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Включить тёмную тему' })).toBeTruthy();
  });

  it('подхватывает тёмную тему, уже выставленную скриптом инициализации', () => {
    root.dataset.theme = 'dark';
    render(<ThemeSwitch />);
    expect(screen.getByRole('button', { name: 'Включить светлую тему' })).toBeTruthy();
  });
});
