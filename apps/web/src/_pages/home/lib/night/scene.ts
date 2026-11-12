import {
  EMPTY_DRAWING,
  FINISH_IDLE_MS,
  findStarAt,
  HIT_RADIUS_MOUSE_PX,
  HIT_RADIUS_TOUCH_PX,
  pressStar,
  releaseAnchor,
} from './drawing';
import { Camera, figureAnchor, figureBounds, figureFrame, figureSide, SIDE_LAYOUT_QUERY } from './camera';
import { Cursor } from './cursor';
import { CursorField } from './cursor-field';
import { createHaze, createOutline, loadFigures, pickInkCount } from './ink';
import { InkGrid } from './ink-grid';
import { InkSimulation } from './ink-sim';
import { computeLayout, pxToUnits } from './layout';
import { createInputState, createNightRenderer, MAX_LINE_SEGMENTS } from './renderer';
import { buildStarTable, DIPPER_CENTER, DIPPER_OUTLINE, DIPPER_STARS, DRAWABLE_STARS, FIGURE_BOUNDS } from './stars';
import { frameAt, HAZE, NIGHT_SCREENS } from './timeline';
import type { Shot } from './camera';
import type { Drawing } from './drawing';
import type { InkStep } from './ink-sim';
import type { Layout, Point, Size } from './layout';
import type { NightRenderer, RenderInput } from './renderer';
import type { NightFrame } from './timeline';

/*
 * Ночная сцена (承): связывает скролл, таймлайн, симуляцию туши, рендерер, тексты и рисование зрителя.
 * Скролл не перехватывается: сцена только читает положение своей дорожки (секции высотой в TRACK_SCREENS экранов).
 */

/** Состояние туши «пунктир вдоль линий зрителя» — после дымки (0) и четырёх фигур (1…4). */
const OUTLINE_STATE = 5;
/** Дрейф капель в покое, единицы ковша: дымка плывёт заметно, фигура едва дышит, пунктир почти стоит. */
const HAZE_DRIFT = 0.9;
const FIGURE_DRIFT = 0.12;
const OUTLINE_DRIFT = 0.04;
/**
 * Множитель радиуса капель на экране. Капли запечены тонкими (0.75–2.3 px), множитель сохраняет
 * лёгкую гравюрную зернистость и защищает от слипания в сплошные белые пятна.
 */
const RADIUS_SCALE = 1.05;
const SMALL_SCREEN_RADIUS_SCALE = 1.3;
const EPILOGUE_DELAY_MS = 900;
const HOVER_MS = 600;
const HOVER_RADIUS_PX = 22;
/** Линии не упираются в звёзды: зазор в единицах ковша, чтобы ядро звезды оставалось чистым. */
const LINE_GAP = 1.6;
const SMALL_SCREEN_QUERY = '(max-width: 767px), (pointer: coarse)';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface NightElements {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly phrases: readonly HTMLElement[];
  readonly epilogue: HTMLElement;
}

function viewSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Пишет отрезок между двумя точками, укороченный на LINE_GAP с обоих концов. */
function writeSegment(target: Float32Array, index: number, ends: readonly [Point, Point]): void {
  const [a, b] = ends;
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const gap = Math.min(LINE_GAP, length / 3) / length;
  target.set([a.x + (b.x - a.x) * gap, a.y + (b.y - a.y) * gap, b.x - (b.x - a.x) * gap, b.y - (b.y - a.y) * gap], index * 4);
}

function starAt(index: number): Point {
  return DRAWABLE_STARS[index] ?? DIPPER_CENTER;
}

function driftOf(state: number): number {
  if (state === HAZE) return HAZE_DRIFT;
  return state === OUTLINE_STATE ? OUTLINE_DRIFT : FIGURE_DRIFT;
}

class NightScene {
  private readonly input: RenderInput = createInputState();
  private readonly abort = new AbortController();
  private readonly isSmallScreen = window.matchMedia(SMALL_SCREEN_QUERY).matches;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly haze = createHaze(pickInkCount(this.isSmallScreen));
  private readonly ink = new InkSimulation(pickInkCount(this.isSmallScreen), {
    center: DIPPER_CENTER,
    dipper: DIPPER_STARS,
    bounds: FIGURE_BOUNDS,
    radiusScale: this.isSmallScreen ? SMALL_SCREEN_RADIUS_SCALE : RADIUS_SCALE,
  });
  private readonly grid = new InkGrid();
  /** Вход симуляции туши: один объект, меняется на месте каждый кадр (без аллокаций в rAF). */
  private readonly hover = { x: 0, y: 0 };
  private readonly cursor = new Cursor();
  /** Капли курсора — как в прологе. */
  private readonly cursorField = new CursorField();
  private lastFrameAt = 0;
  private readonly inkStep: Mutable<InkStep> = {
    target: HAZE,
    isDirect: false,
    drift: HAZE_DRIFT,
    isReducedMotion: false,
    nowMs: 0,
    hover: this.hover,
    hoverStrength: 0,
    cursor: this.cursor,
  };
  private readonly phraseOpacity: number[];
  private renderer: NightRenderer | null;
  private frame: NightFrame = frameAt(-1);
  private view: Size = viewSize();
  /** Общий план (Н1, Н6–Н9) и камера; layout — текущий кадр камеры (один объект, меняется на месте). */
  private overview: Layout = computeLayout(this.view, FIGURE_BOUNDS);
  private readonly camera = new Camera();
  private readonly layout: Layout = this.camera.current;
  private readonly sideLayout = window.matchMedia(SIDE_LAYOUT_QUERY);
  private cameraKey = -1;
  /** Фоновые звёзды смещаются на эту долю хода камеры — они «дальше» ковша (глубина). */
  private readonly parallaxShare = 0.2;
  private readonly parallax = { x: 0, y: 0 };
  /** Множитель прозрачности боковых фраз: растёт к концу хода камеры. */
  private sideFade = 1;
  private drawing: Drawing = EMPTY_DRAWING;
  private finishedAt: number | null = null;
  private isEpilogueDue = false;
  private pointer: Point | null = null;
  private hoverStar: number | null = null;
  private hoverAt = -Infinity;
  private frameId = 0;
  private timers: number[] = [];

  constructor(private readonly el: NightElements) {
    this.phraseOpacity = el.phrases.map(() => -1);
    this.renderer = createNightRenderer(el.canvas, { stars: buildStarTable() });
    if (!this.renderer) el.canvas.hidden = true;
    this.ink.setState(HAZE, this.haze);
    this.listen();
    this.loadFiguresNearby();
    this.handleResize();
  }

  dispose(): void {
    this.abort.abort();
    cancelAnimationFrame(this.frameId);
    this.timers.forEach((id) => window.clearTimeout(id));
    this.renderer?.dispose();
  }

  private listen(): void {
    const options = { signal: this.abort.signal, passive: true };
    window.addEventListener('scroll', () => this.handleScroll(), options);
    window.addEventListener('resize', () => this.handleResize(), options);
    window.addEventListener('pointermove', (event) => this.handlePointerMove(event), options);
    window.addEventListener('pointerdown', (event) => this.handlePointerDown(event), options);
    document.addEventListener('mouseleave', () => this.handlePointerLeave(), options);
    window.addEventListener('blur', () => this.handlePointerLeave(), options);
    this.el.canvas.addEventListener('webglcontextlost', (event) => this.handleContextLost(event), {
      signal: this.abort.signal,
    });
  }

  /** Фигуры грузятся, когда до сцены остаётся экран: первый экран (LCP) их не ждёт. */
  private loadFiguresNearby(): void {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        this.loadFigures().catch((error: unknown) => console.error(error));
      },
      { rootMargin: '100% 0px' },
    );
    observer.observe(this.el.root);
    this.abort.signal.addEventListener('abort', () => observer.disconnect());
  }

  private async loadFigures(): Promise<void> {
    const figures = await loadFigures(pickInkCount(this.isSmallScreen), this.abort.signal);
    figures.forEach((data, i) => this.ink.setState(HAZE + 1 + i, data));
    this.scheduleRender();
  }

  private handleContextLost(event: Event): void {
    event.preventDefault();
    // Запасной режим без WebGL: тексты остаются, туши и звёзд нет.
    this.renderer = null;
    this.el.canvas.hidden = true;
  }

  private handleResize(): void {
    this.view = viewSize();
    this.overview = computeLayout(this.view, FIGURE_BOUNDS);
    this.cameraKey = this.cameraKeyFor(this.inkStep.target);
    this.camera.snap(this.shotFor(this.inkStep.target));
    this.grid.resize(this.view);
    this.cursorField.build(this.view);
    this.ink.resetMotion();
    this.renderer?.resize(this.view, this.layout);
    this.writeSegments();
    this.handleScroll();
  }

  private handleScroll(): void {
    const u = -this.el.root.getBoundingClientRect().top / this.view.height;
    this.frame = frameAt(u);
    this.applyDom();
    if (u >= NIGHT_SCREENS && this.drawing.segments.length > 0) this.finishDrawing();
    this.scheduleRender();
  }

  /** Тексты и сама сцена — обычный DOM; пишем стиль, только если значение изменилось. */
  private applyDom(): void {
    const { stage, epilogue } = this.el;
    stage.style.opacity = String(this.frame.stage);
    stage.style.visibility = this.frame.stage > 0 ? 'visible' : 'hidden';
    stage.style.pointerEvents = this.canDraw() ? 'auto' : 'none';
    // Эпилог стоит на месте приглашения «Проведи своё.» и сменяет его; выше Н9 его нет
    const hasEpilogue = this.isEpilogueDue && this.frame.isDrawing;
    epilogue.style.opacity = hasEpilogue ? '1' : '0';
    this.applyPhrases(hasEpilogue);
  }

  private applyPhrases(isInvitationReplaced: boolean): void {
    const invitation = this.el.phrases.length - 1;
    this.frame.phrases.forEach((value, i) => {
      const phrase = this.el.phrases[i];
      // Фраза при фигуре стоит сбоку и проступает, только когда камера почти доехала (иначе ляжет на галактику)
      const side = phrase?.dataset.side ? this.sideFade : 1;
      const opacity = isInvitationReplaced && i === invitation ? 0 : value * side;
      if (!phrase || this.phraseOpacity[i] === opacity) return;
      this.phraseOpacity[i] = opacity;
      phrase.style.opacity = String(opacity);
    });
  }

  private canDraw(): boolean {
    return this.frame.isDrawing && this.finishedAt === null && this.renderer !== null;
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.frame.stage <= 0) return;
    this.pointer = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'mouse') {
      this.cursor.move(event.clientX, event.clientY);
      this.cursorField.pointer.moveTo(event.clientX, event.clientY);
    }
    const star = findStarAt(this.layout, { point: this.pointer, radiusPx: HOVER_RADIUS_PX });
    if (star !== null && star !== this.hoverStar && !this.reducedMotion.matches) {
      this.hoverAt = performance.now();
      const at = starAt(star);
      this.hover.x = at.x;
      this.hover.y = at.y;
    }
    this.hoverStar = star;
    if (this.drawing.anchor !== null && event.pointerType === 'mouse') this.writeSegments();
    this.scheduleRender();
  }

  private handlePointerLeave(): void {
    this.cursor.leave();
    this.cursorField.pointer.leave();
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.frame.stage <= 0) return;
    // Щелчок по ночи пускает по туши волну, как у бюста; в Н9 он же рисует
    if (!this.reducedMotion.matches) {
      this.cursor.click(event.clientX, event.clientY, performance.now());
      this.cursorField.click(event.clientX, event.clientY);
    }
    this.scheduleRender();
    if (!this.canDraw()) return;
    const radiusPx = event.pointerType === 'mouse' ? HIT_RADIUS_MOUSE_PX : HIT_RADIUS_TOUCH_PX;
    this.pointer = { x: event.clientX, y: event.clientY };
    const star = findStarAt(this.layout, { point: this.pointer, radiusPx });
    const before = this.drawing.segments.length;
    this.drawing = star === null ? releaseAnchor(this.drawing) : pressStar(this.drawing, star);
    if (this.drawing.segments.length > before) this.restartFinishTimer();
    this.writeSegments();
    this.scheduleRender();
  }

  private restartFinishTimer(): void {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers = [window.setTimeout(() => this.finishDrawing(), FINISH_IDLE_MS)];
  }

  /** Фигура закончена: тушь подплывает и обводит её пунктиром, по времени проступает строка эпилога. */
  private finishDrawing(): void {
    if (this.finishedAt !== null || this.drawing.segments.length === 0) return;
    this.finishedAt = performance.now();
    this.drawing = releaseAnchor(this.drawing);
    this.ink.setState(OUTLINE_STATE, createOutline(this.haze, this.drawing.segments));
    this.writeSegments();
    this.applyDom();
    this.timers.push(window.setTimeout(() => this.showEpilogue(), EPILOGUE_DELAY_MS));
    this.scheduleRender();
  }

  private showEpilogue(): void {
    this.isEpilogueDue = true;
    // Приглашение гаснет плавно, пока проступает эпилог (дальше его прозрачность снова ведёт скролл)
    this.el.phrases.at(-1)?.style.setProperty('transition', 'opacity 0.8s');
    this.applyDom();
  }

  /** Контур ковша, затем линии зрителя, затем линия от якоря к курсору (только мышь: на телефоне — касания). */
  private writeSegments(): void {
    const { segments } = this.input;
    DIPPER_OUTLINE.forEach(([a, b], i) => writeSegment(segments, i, [starAt(a), starAt(b)]));
    let count = DIPPER_OUTLINE.length;
    this.drawing.segments.forEach(([a, b]) => writeSegment(segments, count++, [starAt(a), starAt(b)]));
    const { anchor } = this.drawing;
    if (anchor !== null && this.pointer && count < MAX_LINE_SEGMENTS) {
      writeSegment(segments, count++, [starAt(anchor), pxToUnits(this.layout, this.pointer)]);
    }
    this.input.outlineCount = DIPPER_OUTLINE.length;
    this.input.segmentCount = count;
    this.input.segmentsDirty = true;
  }

  private scheduleRender(): void {
    if (this.frameId || !this.renderer) return;
    this.frameId = requestAnimationFrame((now) => this.renderFrame(now));
  }

  /**
   * Кадр: симуляция туши → сетка → текстура → отрисовка. Пока сцена на экране и движение не отключено,
   * кадры идут непрерывно (тушь дрейфует и в покое); без анимации — только по событиям.
   */
  private renderFrame(now: number): void {
    this.frameId = 0;
    if (!this.renderer || this.frame.stage <= 0) return;
    const isAnimating = this.updateInput(now);
    const isCameraMoving = this.moveCamera(now);
    this.updateSideFade(now);
    this.ink.step(this.inkStep, this.layout, this.grid);
    // Длительность кадра для поля курсора: после паузы (вкладка, скролл издалека) — не больше 50 мс
    this.cursorField.step(Math.min(50, now - this.lastFrameAt) || 16.667);
    this.lastFrameAt = now;
    this.renderer.uploadInk(this.grid);
    this.renderer.uploadCursor(this.cursorField);
    this.renderer.render(this.input);
    if (isAnimating || isCameraMoving || !this.inkStep.isReducedMotion) this.scheduleRender();
  }

  /**
   * Проявление боковых фраз по ходу камеры: f = smoothstep((p − 0.55) / 0.4), p — доля хода. Шаг 0.02 —
   * чтобы не писать стиль каждый кадр. На узком экране фразы внизу и от камеры не зависят.
   */
  private updateSideFade(now: number): void {
    const progress = this.camera.progress(now);
    const t = Math.min(1, Math.max(0, (progress - 0.55) / 0.4));
    const fade = this.sideLayout.matches ? Math.round(t * t * (3 - 2 * t) * 50) / 50 : 1;
    if (fade === this.sideFade) return;
    this.sideFade = fade;
    this.applyDom();
  }

  /** Ключ кадра камеры: состояние туши и то, помещается ли текст сбоку (на узком экране кадр всегда общий). */
  private cameraKeyFor(state: number): number {
    return state * 2 + Number(this.sideLayout.matches);
  }

  /** Кадр камеры для состояния туши: фигура сбоку (Н2–Н5 на широком экране) или общий план с опорой в центре. */
  private shotFor(state: number): Shot {
    const key = this.cameraKeyFor(state);
    const side = this.sideLayout.matches ? figureSide(state) : null;
    const bounds = figureBounds(state);
    if (side && bounds) {
      return { key, frame: figureFrame(this.view, bounds, side), anchor: figureAnchor(this.view, side) };
    }
    return { key, frame: this.overview, anchor: { x: this.view.width / 2, y: this.view.height / 2 } };
  }

  /** Наводит камеру на цель кадра, двигает её и отдаёт кадр рендереру. Возвращает, едет ли камера. */
  private moveCamera(now: number): boolean {
    const key = this.cameraKeyFor(this.inkStep.target);
    if (key !== this.cameraKey) {
      this.cameraKey = key;
      // Без анимации камера не едет, а сразу встаёт в новый кадр
      const shot = this.shotFor(this.inkStep.target);
      if (this.inkStep.isReducedMotion) this.camera.snap(shot);
      else this.camera.aim(shot, now);
    }
    const isMoving = this.camera.update(now);
    const share = this.parallaxShare;
    this.parallax.x = (this.layout.originX - this.overview.originX) * share;
    this.parallax.y = (this.layout.originY - this.overview.originY) * share;
    this.renderer?.setLayout(this.layout, this.parallax);
    return isMoving;
  }

  /** Заполняет входы рендерера и симуляции из кадра таймлайна и состояния зрителя. Возвращает, нужен ли следующий кадр. */
  private updateInput(now: number): boolean {
    const { input, frame, inkStep } = this;
    input.backgroundStars = frame.backgroundStars;
    input.dipperStars = frame.dipperStars;
    // Тусклые звёзды видны едва-едва с самого начала и разгораются в Н9
    input.inviteStars = 0.25 * frame.dipperStars + 0.75 * frame.invite;
    input.outlineAlpha = frame.outline;
    input.userLinesAlpha = frame.invite;
    inkStep.isReducedMotion = this.reducedMotion.matches;
    // Сияние звёзд идёт по времени; без анимации — замирает
    if (!inkStep.isReducedMotion) input.starTimeSeconds = now / 1000;
    inkStep.nowMs = now;
    inkStep.hoverStrength = Math.max(0, 1 - (now - this.hoverAt) / HOVER_MS);
    this.cursor.tick(now);
    // После законченной фигуры зрителя (и пока он в Н9) тушь идёт к пунктиру вдоль его линий — напрямую, без галактики
    const isOutline = this.finishedAt !== null && frame.isDrawing;
    inkStep.target = isOutline ? OUTLINE_STATE : frame.figure;
    inkStep.isDirect = isOutline;
    inkStep.drift = driftOf(inkStep.target);
    return (
      inkStep.hoverStrength > 0 ||
      this.cursor.isActive() ||
      this.cursorField.isActive() ||
      this.ink.isTransitioning(now, inkStep.isReducedMotion)
    );
  }
}

/** Запускает сцену; возвращает функцию остановки (снимает слушатели, таймеры, освобождает WebGL). */
export function startNightScene(elements: NightElements): () => void {
  const scene = new NightScene(elements);
  return () => scene.dispose();
}
