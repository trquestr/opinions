import { CloudsScene } from './clouds-scene';
import { Hero } from './hero';
import { LandingScripts } from './landing-scripts';
import { NightScene } from './night-scene';
import { SmoothScrollDriver } from './smooth-scroll-driver';
import '../landing.css';

export function HomePage() {
  return (
    <>
      <Hero />

      <CloudsScene />

      <NightScene />

      <canvas id="gl-canvas" className="gl-layer" aria-hidden="true"></canvas>

      <LandingScripts />

      <SmoothScrollDriver />
    </>
  );
}
