import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RevealText } from './reveal-text';

afterEach(cleanup);

describe('RevealText', () => {
  it('оставляет текст фразы прежним для поисковика и читалки экрана', () => {
    const { container } = render(
      <p>
        <RevealText text="Никто не видел откуда." />
      </p>,
    );

    expect(container.querySelector('p')?.textContent).toBe('Никто не видел откуда.');
  });

  it('слова обёрнуты целиком, чтобы строка не рвалась посреди слова', () => {
    const { container } = render(
      <p>
        <RevealText text="а бв" />
      </p>,
    );

    const words = [...container.querySelectorAll('.phrase-word')].map((el) => el.textContent);
    expect(words).toEqual(['а', 'бв']);
  });

  it('каждая буква — отдельный элемент внутри своего слова', () => {
    const { container } = render(
      <p>
        <RevealText text="а бв" />
      </p>,
    );

    const letters = [...container.querySelectorAll('.phrase-word > .phrase-letter')].map(
      (el) => el.textContent,
    );
    expect(letters).toEqual(['а', 'б', 'в']);
  });

  it('буквы получают задержку проявления по очереди', () => {
    const { container } = render(
      <p>
        <RevealText text="а бв" />
      </p>,
    );

    const delays = [...container.querySelectorAll<HTMLElement>('.phrase-letter')].map((el) =>
      el.style.getPropertyValue('--reveal-delay'),
    );
    expect(delays).toEqual(['0ms', '55ms', '110ms']);
  });
});
