// Разметка героя целиком рендерится на сервере (в HTML уже есть h1);
// WebGL и анимации поднимает на клиенте LandingScripts. id и классы — контракт с public/js/landing.js:
// менять их можно только вместе с ним.
export function Hero() {
  return (
    <main className="hero">
      {/* Слой дрейфующих облаков поверх текста героя (наполняет landing.js) */}
      <div className="drifting-clouds-layer" id="drifting-clouds-layer" aria-hidden="true"></div>

      <h1 className="wordmark">UNTESIS</h1>
    </main>
  );
}
