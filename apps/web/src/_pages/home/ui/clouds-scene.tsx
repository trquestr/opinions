import { CLOUDS_FORMATION } from '../lib/clouds/clouds-formation';
import { CLOUDS_PHRASES } from '../model/clouds-script';
import { CloudsSceneDriver } from './clouds-scene-driver';

/**
 * Сцена «Облака» (起) — 3 экрана скролла (Раскадровка.md, О1–О6).
 * Тексты рендерятся на сервере в семантическом HTML для SEO и читалок экрана.
 * 3D-пролёт сквозь облака и влёт в чашу буквы U поднимаются через CloudsSceneDriver.
 */
export function CloudsScene() {
  return (
    <section id="clouds" aria-label="Облака" className="relative h-[300svh] h-[300vh]">
      <div
        data-clouds-stage
        className="clouds-stage pointer-events-none invisible fixed inset-0 z-[35] touch-pan-y overflow-hidden opacity-0"
      >
        {/* Холст для капель туши ПОД облаками */}
        <canvas
          data-clouds-canvas
          data-clouds-canvas-back
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 block h-full w-full"
        />

        {/* 3D-эшелоны облаков: расходятся радиально от центра по вектору пролёта */}
        {CLOUDS_FORMATION.map((cloud) => (
          <div
            key={cloud.id}
            data-cloud-id={cloud.id}
            className="pointer-events-none absolute top-0 left-0 z-20 -translate-x-1/2 -translate-y-1/2 opacity-0 will-change-transform"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cloud.src}
              alt=""
              aria-hidden="true"
              className="pointer-events-none block h-auto w-full select-none"
            />
          </div>
        ))}

        {/* Холст для капель туши НАД облаками */}
        <canvas
          data-clouds-canvas
          data-clouds-canvas-front
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 block h-full w-full"
        />

        {/* Фразы рассказа О2–О5 */}
        {CLOUDS_PHRASES.map((phrase) => (
          <p
            key={phrase.text}
            data-clouds-phrase
            className="clouds-phrase absolute inset-x-4 bottom-[14%] z-40 mx-auto max-w-[28ch] text-center text-xl leading-snug opacity-0 sm:text-2xl"
          >
            {phrase.text}
          </p>
        ))}
      </div>

      <CloudsSceneDriver rootId="clouds" />
    </section>
  );
}
