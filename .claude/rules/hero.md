---
paths:
  - "apps/web/public/js/**"
  - "apps/web/src/_pages/home/**"
---

# WebGL landing hero

- The modules `apps/web/public/js/*.js` (landing, cloud-relief, three.min, gsap.min) are vanilla JS, IIFE,
  `'use strict'`, globals `THREE`/`gsap`, and start immediately on load. Do not import them into React and do not insert
  `<script>` in JSX: the DOM they change breaks hydration. They are loaded only via
  `src/_pages/home/ui/landing-scripts.tsx`, in order, after hydration.
- The night scene (承) is not a `public/js` module: it is TypeScript in `src/_pages/home/lib/night/`, started by the
  client leaf `ui/night-scene-driver.tsx` via a dynamic import after hydration, so it is typed, linted and tested.
  Its dot sources are baked by `scripts/bake_night.py`; re-run it after changing a figure or its star fit.
- The clouds scene (起) is built the same way: TypeScript in `src/_pages/home/lib/clouds/`, started by
  `ui/clouds-scene-driver.tsx`. Day turns into night there by the dusk veil (`dusk-veil.ts`), a canvas blended with
  `mix-blend-mode: difference` that inverts everything under it — do not recolor the background or the ink for the
  night separately. The veil leaves no light dust of its own (owner's decision 2026-11-14): only the ink drops go into
  the night — they land on the star positions published by the night scene through `lib/sky-landing.ts`, the night draws
  twin drops at the same spots and fades them while the stars ignite; do not cross-fade unrelated particle sets at the
  scene seam. The night stars use the same light-ink color as the figures (owner's decision 2026-11-12).
- The hero markup is `src/_pages/home/ui/hero.tsx` (a server component), styles — `src/_pages/home/landing.css`.
  New UI around the hero — in Tailwind; `landing.css` — only for the hero.
- Tailwind Preflight is already in effect: the `landing.css` rules are outside a layer and win over `@layer base`, but the properties
  that Preflight sets and `landing.css` does not (display/max-width of img/svg/canvas, line-height) must be set explicitly.
- Assets — absolute paths `/assets/...` from `public/`. Cache busting with `?v=` is not needed: Next serves `public/` with an ETag.
- 60 FPS is a requirement: no allocations in `requestAnimationFrame`, do not upload `uniform`s every frame without need.
- Respect `prefers-reduced-motion`, handle WebGL context loss, have a no-WebGL fallback.
- Mobile: touch events, `viewport-fit=cover`, devicePixelRatio is capped.
- Comments on shaders and physics are written in Russian, in detail, with formulas.
- Do not read heavy files (`three.min.js`, `gsap.min.js`) in full — grep and pieces.
- Visual quality (droplet shape, smoothness, composition) is judged by the main session or the owner, not by agents.
