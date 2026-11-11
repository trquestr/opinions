import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button, buttonStyles } from './button';

afterEach(cleanup);

describe('Button', () => {
  it('по умолчанию type=button и вариант primary', () => {
    render(<Button>Ок</Button>);
    const button = screen.getByRole('button', { name: 'Ок' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('bg-foreground');
  });

  it('вариант secondary и размер lg меняют классы', () => {
    render(
      <Button variant="secondary" size="lg">
        Ещё
      </Button>,
    );
    const { className } = screen.getByRole('button', { name: 'Ещё' });
    expect(className).toContain('border-border');
    expect(className).toContain('h-12');
    expect(className).not.toContain('bg-foreground ');
  });

  it('добавляет className и пробрасывает onClick', () => {
    const onClick = vi.fn();
    render(
      <Button className="extra" onClick={onClick}>
        Клик
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Клик' });
    expect(button.className).toContain('extra');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('пробрасывает disabled и позволяет задать type=submit', () => {
    render(
      <>
        <Button disabled>Нельзя</Button>
        <Button type="submit">Отправить</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Нельзя' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Отправить' }).getAttribute('type')).toBe('submit');
  });
});

describe('buttonStyles', () => {
  it('без аргументов даёт стили primary/md', () => {
    const classes = buttonStyles();
    expect(classes).toContain('bg-foreground');
    expect(classes).toContain('h-10');
  });
});
