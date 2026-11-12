import { CLOUDS_FORMATION, projectCloud } from './clouds-formation';
import { CloudsSimulation } from './clouds-sim';
import { createCloudsRenderer, type CloudsRenderer } from './clouds-renderer';
import { createDuskVeil, VEIL_FALLBACK_COLOR, type DuskVeil } from './dusk-veil';
import { frameAt, type CloudsFrame } from './timeline';
import { computeWordmarkCameraZoom } from './wordmark-zoom';

export interface CloudsElements {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly canvasBack?: HTMLCanvasElement | null;
  readonly canvasFront?: HTMLCanvasElement | null;
  /** Холст вуали сумерек: лежит поверх сцены и инвертирует её (mix-blend-mode: difference). */
  readonly veil?: HTMLCanvasElement | null;
  readonly cloudItems: readonly HTMLElement[];
  readonly phrases: readonly HTMLElement[];
  readonly glCanvas: HTMLElement | null;
  readonly wordmark: HTMLElement | null;
  readonly hero: HTMLElement | null;
}

const SMALL_SCREEN_QUERY = '(max-width: 767px), (pointer: coarse)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function matchesMedia(query: string): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;
}

/**
 * Количество капель туши. В О2–О3 в кадре их треть (аккуратная горсть), к О5 поднимаются все:
 * 44 на компьютере, 20 на телефоне.
 */
function pickDropCount(isSmallScreen: boolean): number {
  return isSmallScreen ? 20 : 44;
}

interface Renderers {
  readonly back: CloudsRenderer | null;
  readonly front: CloudsRenderer | null;
}

function initRenderers(el: CloudsElements): Renderers {
  if (el.canvasBack && el.canvasFront) {
    return {
      back: createCloudsRenderer(el.canvasBack),
      front: createCloudsRenderer(el.canvasFront),
    };
  }
  return {
    back: null,
    front: el.canvas ? createCloudsRenderer(el.canvas) : null,
  };
}

export class CloudsScene {
  private readonly sim: CloudsSimulation;
  private rendererBack: CloudsRenderer | null = null;
  private rendererFront: CloudsRenderer | null = null;
  private veil: DuskVeil | null = null;
  private readonly isSmallScreen: boolean;
  private readonly isReducedMotion: boolean;
  private readonly cursor = { x: -9999, y: -9999, isInside: false };
  private frame: CloudsFrame = frameAt(-1);
  private lastTimeMs = 0;
  private lastScrollY = 0;
  private frameId = 0;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private isDestroyed = false;

  constructor(private readonly el: CloudsElements) {
    this.isSmallScreen = matchesMedia(SMALL_SCREEN_QUERY);
    this.isReducedMotion = matchesMedia(REDUCED_MOTION_QUERY);
    this.sim = new CloudsSimulation({
      count: pickDropCount(this.isSmallScreen),
      isSmallScreen: this.isSmallScreen,
    });
    const { back, front } = initRenderers(el);
    this.rendererBack = back;
    this.rendererFront = front;
    this.initVeil();
  }

  /** Без WebGL и после потери контекста холст вуали работает ровной заливкой: та же инверсия, но без пунктира. */
  private initVeil(): void {
    const canvas = this.el.veil;
    if (!canvas) return;
    this.veil = createDuskVeil(canvas, { onContextLost: this.onVeilLost });
    if (!this.veil) canvas.style.backgroundColor = VEIL_FALLBACK_COLOR;
  }

  private readonly onVeilLost = (): void => {
    this.veil = null;
    if (this.el.veil) this.el.veil.style.backgroundColor = VEIL_FALLBACK_COLOR;
  };

  start(): () => void {
    this.handleResize();
    this.lastScrollY = window.scrollY || window.pageYOffset || 0;
    window.addEventListener('resize', this.onResize);
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    document.addEventListener('mouseleave', this.onMouseLeave);

    this.onScroll();
    this.lastTimeMs = performance.now();
    this.frameId = requestAnimationFrame(this.onFrame);

    return () => this.dispose();
  }

  private readonly onResize = (): void => {
    this.handleResize();
  };

  private readonly onScroll = (): void => {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const delta = scrollY - this.lastScrollY;
    this.lastScrollY = scrollY;

    if (Math.abs(delta) > 0.5) {
      this.sim.addScrollImpulse(delta);
    }

    const rect = this.el.root.getBoundingClientRect();
    const u = -rect.top / Math.max(1, this.height);
    this.frame = frameAt(u);
    this.updateDom();
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    this.cursor.x = event.clientX;
    this.cursor.y = event.clientY;
    this.cursor.isInside = true;
  };

  private readonly onMouseLeave = (): void => {
    this.cursor.isInside = false;
  };

  private handleResize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.rendererBack?.resize(this.width, this.height, this.dpr);
    this.rendererFront?.resize(this.width, this.height, this.dpr);
    this.veil?.resize(this.width, this.height, this.dpr);
    this.onScroll();
  }

  private renderParticles(): void {
    if (this.rendererBack && this.rendererFront) {
      this.rendererBack.render(this.sim.back);
      this.rendererFront.render(this.sim.front);
    } else {
      this.rendererFront?.render(this.sim);
    }
  }

  /** Вуаль сумерек: пунктир рисует шейдер; в запасном режиме холст просто проявляется ровной заливкой. */
  private renderVeil(nowMs: number): void {
    const canvas = this.el.veil;
    if (!canvas) return;
    const progress = this.frame.stage > 0 ? this.frame.veil : 0;
    const visibility = progress > 0 ? 'visible' : 'hidden';
    if (canvas.style.visibility !== visibility) canvas.style.visibility = visibility;
    if (progress <= 0) return;
    if (this.veil) {
      this.veil.render(progress, this.isReducedMotion ? 0 : nowMs / 1000);
    } else {
      canvas.style.opacity = progress.toFixed(3);
    }
  }

  private readonly onFrame = (nowMs: number): void => {
    if (this.isDestroyed) return;

    const dt = Math.min(0.06, Math.max(0.001, (nowMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = nowMs;

    this.updateDom();
    if (this.frame.stage > 0) {
      this.sim.step(dt, this.frame, { cursor: this.cursor, width: this.width, height: this.height });
      this.renderParticles();
    }
    this.renderVeil(nowMs);

    this.frameId = requestAnimationFrame(this.onFrame);
  };

  private updateDom(): void {
    const { stage, phrases } = this.el;
    const f = this.frame;

    this.updateUZoom(f);

    if (f.stage <= 0) {
      if (stage.style.visibility !== 'hidden') {
        stage.style.visibility = 'hidden';
        stage.style.opacity = '0';
      }
      return;
    }

    if (stage.style.visibility !== 'visible') {
      stage.style.visibility = 'visible';
    }
    stage.style.opacity = '1';

    this.update3DClouds(f);

    // Фразы рассказа (Georgia, нижняя треть)
    for (let i = 0; i < phrases.length; i++) {
      const phraseEl = phrases[i];
      if (!phraseEl) continue;
      const opacity = f.phrases[i] ?? 0;
      phraseEl.style.opacity = opacity.toFixed(3);
      // Буквы проявляются из расфокуса по времени (landing.css): скролл только включает фразу
      const shown = opacity > 0 ? 'true' : 'false';
      if (phraseEl.dataset.shown !== shown) phraseEl.dataset.shown = shown;
    }
  }

  private updateUZoom(f: CloudsFrame): void {
    const cam = computeWordmarkCameraZoom({
      u: f.u,
      scale: f.wordmarkScale,
      opacity: f.wordmarkOpacity,
      width: this.width,
      height: this.height,
    });

    // 1. Векторный зум прямо в WebGL-шейдере вордмарка:
    // Шейдер рендерит математический SDF на нативном разрешении экрана без растяжения растра
    if (typeof window !== 'undefined') {
      if (window.__setWordmarkCameraZoom) {
        window.__setWordmarkCameraZoom(cam);
      } else {
        window.__pendingWordmarkZoom = cam;
      }
    }

    // 2. Слой canvas: сам элемент остаётся unscaled (transform: none) на весь экран
    if (this.el.glCanvas) {
      this.el.glCanvas.style.transform = 'none';
      this.el.glCanvas.style.visibility = cam.isVisible ? 'visible' : 'hidden';
      this.el.glCanvas.style.opacity = '1';
    }

    // 3. Слой героя (дрейфующие облака пролога): плавно уходит
    if (this.el.hero) {
      this.el.hero.style.visibility = cam.isVisible ? 'visible' : 'hidden';
      this.el.hero.style.opacity = cam.opacity.toFixed(3);
    }
  }

  private update3DClouds(f: CloudsFrame): void {
    const count = Math.min(this.el.cloudItems.length, CLOUDS_FORMATION.length);
    for (let i = 0; i < count; i++) {
      const el = this.el.cloudItems[i];
      const cloud = CLOUDS_FORMATION[i];
      if (!el || !cloud) continue;

      const proj = projectCloud(cloud, f.zCam, { width: this.width, height: this.height });
      const totalOpacity = proj.opacity * f.cloudsVisibility;
      if (!proj.isVisible || totalOpacity <= 0.005) {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
      } else {
        el.style.visibility = 'visible';
        el.style.transform = `translate3d(${proj.xPx.toFixed(1)}px, ${proj.yPx.toFixed(1)}px, 0)`;
        el.style.width = `${proj.widthPx.toFixed(1)}px`;
        el.style.opacity = totalOpacity.toFixed(3);
      }
    }
  }

  private dispose(): void {
    this.isDestroyed = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseleave', this.onMouseLeave);
    if (this.el.glCanvas) {
      this.el.glCanvas.style.transform = 'none';
      this.el.glCanvas.style.opacity = '1';
      this.el.glCanvas.style.visibility = 'visible';
    }
    if (this.el.hero) {
      this.el.hero.style.transform = 'none';
      this.el.hero.style.opacity = '1';
      this.el.hero.style.visibility = 'visible';
    }
    this.rendererBack?.dispose();
    this.rendererFront?.dispose();
    this.veil?.dispose();
    this.veil = null;
    this.rendererBack = null;
    this.rendererFront = null;
  }
}

export function startCloudsScene(elements: CloudsElements): () => void {
  const scene = new CloudsScene(elements);
  return scene.start();
}
