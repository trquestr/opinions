import { Hero } from './hero';
import { LandingScripts } from './landing-scripts';
import '../landing.css';

export function HomePage() {
  return (
    <>
      <Hero />

      {/* Интерактивный точечный бюст */}
      <section className="sculpture-section" id="sculpture-section">
        <canvas
          id="bust-canvas"
          className="bust-canvas"
          aria-label="Интерактивный точечный бюст Давида"
        ></canvas>
      </section>

      <canvas id="gl-canvas" className="gl-layer" aria-hidden="true"></canvas>

      <LandingScripts />
    </>
  );
}
