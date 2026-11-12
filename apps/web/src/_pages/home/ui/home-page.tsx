import { Hero } from './hero';
import { LandingScripts } from './landing-scripts';
import { NightScene } from './night-scene';
import '../landing.css';

export function HomePage() {
  return (
    <>
      <Hero />

      <NightScene />

      <canvas id="gl-canvas" className="gl-layer" aria-hidden="true"></canvas>

      <LandingScripts />
    </>
  );
}
