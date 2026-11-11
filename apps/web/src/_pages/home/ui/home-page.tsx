import { Hero } from './hero';
import { LandingScripts } from './landing-scripts';
import '../landing.css';

export function HomePage() {
  return (
    <>
      <Hero />

      <canvas id="gl-canvas" className="gl-layer" aria-hidden="true"></canvas>

      <LandingScripts />
    </>
  );
}
