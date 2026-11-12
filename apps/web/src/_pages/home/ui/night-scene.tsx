import { detailSrc, NIGHT_DETAILS } from '../model/night-details';
import { NIGHT_EPILOGUE, NIGHT_PHRASES } from '../model/night-script';
import { NightSceneDriver } from './night-scene-driver';
import { RevealText } from './reveal-text';

// Ночная сцена (承). Тексты — настоящий HTML с сервера (видны поисковикам и читалкам экрана); туша, звёзды и рисование —
// на клиенте (NightSceneDriver). data-атрибуты — контракт с lib/night/scene.ts.
// Секция задаёт длину скролла (8 экранов: 0,5 смены дня на ночь до неё + 6,5 сцены + 0,5 стоп-кадра + последний экран),
// сама сцена закреплена на весь экран и до прихода скролла прозрачна.
// Гравюрные детали — фон за фигурами: один <img> на деталь, под тушью. Положение и прозрачность ведёт lib/night/details-layer.ts.
function NightDetails() {
  return (
    <div
      data-night-details
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {NIGHT_DETAILS.map((detail, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={detail.name}
          data-night-detail
          data-index={index}
          data-src={detailSrc(detail.name)}
          alt=""
          decoding="async"
          fetchPriority="low"
          draggable={false}
          className="night-detail"
        />
      ))}
    </div>
  );
}

export function NightScene() {
  return (
    <section id="night" aria-label="Ночь" className="relative h-[800svh] h-[800vh]">
      <div data-night-stage className="night-stage invisible fixed inset-0 z-[60] touch-pan-y opacity-0">
        <NightDetails />
        <canvas data-night-canvas aria-hidden="true" className="absolute inset-0 block h-full w-full" />
        {NIGHT_PHRASES.map((phrase) =>
          phrase.isMain ? (
            <h2
              key={phrase.text}
              data-night-phrase
              className="night-phrase absolute inset-x-4 top-1/2 mx-auto max-w-[22ch] -translate-y-1/2 text-center text-3xl leading-tight opacity-0 sm:text-5xl"
            >
              <RevealText text={phrase.text} />
            </h2>
          ) : (
            <p
              key={phrase.text}
              data-night-phrase
              data-side={phrase.side}
              className="night-phrase absolute inset-x-4 bottom-[14%] mx-auto max-w-[28ch] text-center text-xl leading-snug opacity-0 sm:text-2xl"
            >
              <RevealText text={phrase.text} />
            </p>
          ),
        )}
        <p
          data-night-epilogue
          className="night-phrase absolute inset-x-4 bottom-[14%] mx-auto max-w-[28ch] text-center text-xl leading-snug opacity-0 transition-opacity duration-1000 sm:text-2xl"
        >
          <RevealText text={NIGHT_EPILOGUE} />
        </p>
      </div>
      <NightSceneDriver rootId="night" />
    </section>
  );
}
