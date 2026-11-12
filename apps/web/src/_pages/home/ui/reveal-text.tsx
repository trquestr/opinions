import { Fragment } from 'react';
import { toRevealWords } from '../lib/reveal-text';

declare module 'react' {
  interface CSSProperties {
    /** Задержка проявления буквы; читается в landing.css только при появлении фразы. */
    '--reveal-delay'?: string;
  }
}

/**
 * Текст фразы рассказчика, разложенный на слова и буквы для проявления (landing.css, .phrase-letter):
 * буква поднимается снизу и выходит из расфокуса. Между словами — обычные пробелы, поэтому textContent фразы
 * не меняется: поисковик и читалка экрана видят ту же строку.
 * Проявление включает сцена атрибутом data-shown на самой фразе.
 */
export function RevealText({ text }: { readonly text: string }) {
  return (
    <>
      {toRevealWords(text).map((word, wordIndex) => (
        <Fragment key={`${wordIndex}-${word.letters.map((letter) => letter.char).join('')}`}>
          {wordIndex > 0 ? ' ' : null}
          <span className="phrase-word">
            {word.letters.map((letter) => (
              <span
                key={letter.delayMs}
                className="phrase-letter"
                style={{ '--reveal-delay': `${letter.delayMs}ms` }}
              >
                {letter.char}
              </span>
            ))}
          </span>
        </Fragment>
      ))}
    </>
  );
}
