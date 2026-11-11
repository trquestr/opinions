// Разметка героя целиком рендерится на сервере (в HTML уже есть h1);
// WebGL и анимации поднимает на клиенте LandingScripts. id и классы — контракт с public/js/landing.js:
// менять их можно только вместе с ним.
export function Hero() {
  return (
    <main className="hero">
      <div className="hero-composition" id="hero-composition" aria-hidden="true">
        <HeroAxis />
        <HeroOrbits />
        {/* Арки справа внизу, поверх большой орбиты */}
        <div className="hero-asset hero-arches" id="hero-arches">
          {/* eslint-disable-next-line @next/next/no-img-element -- статичный декор, его двигает landing.js */}
          <img src="/assets/hero-arches.png" alt="" draggable={false} />
        </div>
      </div>

      {/* Слой дрейфующих облаков поверх текста героя (наполняет landing.js) */}
      <div className="drifting-clouds-layer" id="drifting-clouds-layer" aria-hidden="true"></div>

      <h1 className="wordmark">UNTESIS</h1>

      <ScrollDownPrompt />
    </main>
  );
}

/** Горизонтальная ось: ровно 70% ширины экрана. */
function HeroAxis() {
  return (
    <svg className="hero-axis-svg" id="hero-axis-svg" viewBox="0 0 1000 8" preserveAspectRatio="none">
      <line className="hero-dashes-axis" x1="0" y1="4" x2="1000" y2="4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Орбиты (наклонный эллипс и большая орбита, проходят под облаком и арками) и бегущие по ним точки. */
function HeroOrbits() {
  return (
    <div className="hero-orbits-wrapper" id="hero-orbits-wrapper">
      <svg
        className="hero-orbits"
        id="hero-orbits"
        viewBox="-1000 -600 2000 1200"
        preserveAspectRatio="xMidYMid meet"
      >
        <g className="orbit-group-paths">
          <ellipse
            className="hero-orbit-path hero-dashes-ellipse"
            cx="0"
            cy="0"
            rx="650"
            ry="230"
            transform="rotate(-11)"
            vectorEffect="non-scaling-stroke"
          />
          <ellipse
            className="hero-orbit-path hero-dashes-large"
            cx="0"
            cy="0"
            rx="800"
            ry="740"
            transform="rotate(26)"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        <g className="orbit-group-runners" id="orbit-group-runners">
          <g transform="rotate(26)">
            <g className="hero-circle-runner-group" id="hero-circle-runner-group">
              <circle className="hero-orbit-runner hero-circle-runner" cx="800" cy="0" r="3.4" />
            </g>
          </g>
          <circle
            className="hero-orbit-runner hero-ellipse-runner"
            id="hero-ellipse-runner"
            cx="638"
            cy="-124"
            r="3.8"
          />
        </g>
      </svg>
    </div>
  );
}

/** Подсказка «скролл вниз»: три точки (их анимирует landing.js) и подпись. */
function ScrollDownPrompt() {
  return (
    <a href="#sculpture-section" className="hero-scroll-down" id="hero-scroll-down" aria-label="Скролл вниз">
      <svg
        className="scroll-dots-svg"
        id="scroll-dots-svg"
        viewBox="-20 -36 40 72"
        width="34"
        height="60"
        aria-hidden="true"
      >
        <circle className="scroll-dot" id="scroll-dot-0" cx="3" cy="-22.5" r="6.2" />
        <circle className="scroll-dot" id="scroll-dot-1" cx="-5.5" cy="-1" r="5.2" />
        <circle className="scroll-dot" id="scroll-dot-2" cx="-0.8" cy="19" r="2.4" />
      </svg>
      <span className="scroll-text">scroll</span>
    </a>
  );
}
