export interface CloudsPhrase {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Фразы рассказчика в сцене «Облака» (起) — Раскадровка.md, О2–О5.
 * Место на экране: нижняя треть по центру, до 28 знаков в строке.
 */
export const CLOUDS_PHRASES: readonly CloudsPhrase[] = [
  { text: 'Говорят, мысли приходят в голову.', start: 0.5, end: 0.9 },
  { text: 'Никто не видел откуда.', start: 0.9, end: 1.3 },
  { text: 'Кажется, они поднимаются снизу —', start: 1.3, end: 1.8 },
  { text: 'из всего, что с тобой было.', start: 1.8, end: 2.3 },
];
