import {
  EMPTY_DRAWING,
  FINISH_IDLE_MS,
  findStarAt,
  HIT_RADIUS_MOUSE_PX,
  HIT_RADIUS_TOUCH_PX,
  pressStar,
  releaseAnchor,
} from './drawing';
import {
  Camera,
  figureBounds,
  figureShot,
  figureSide,
  figureYaw,
  overviewShot,
  SIDE_LAYOUT_QUERY,
} from './camera';
import { Cursor } from './cursor';
import { CursorField } from './cursor-field';
import { createDetailMotion, detailFade, detailOutFade } from './details';
import { DetailsLayer } from './details-layer';
import { createHaze, createOutline, loadFigures, pickInkCount } from './ink';
import { InkGrid } from './ink-grid';
import { InkSimulation } from './ink-sim';
import { computeLayout } from './layout';
import { Projector, SKY_FOLLOW } from './projection';
import { createInputState, createNightRenderer, MAX_LINE_SEGMENTS } from './renderer';
import { StarField } from './star-field';
import { DIPPER_CENTER, DIPPER_OUTLINE, DIPPER_STARS, DRAWABLE_STARS, FIGURE_BOUNDS } from './stars';
import { frameAt, HAZE, NIGHT_SCREENS } from './timeline';
import type { Shot } from './camera';
import type { Drawing } from './drawing';
import type { InkStep } from './ink-sim';
import type { Point, Size } from './layout';
import type { Projected } from './projection';
import type { NightRenderer, RenderInput } from './renderer';
import type { NightFrame } from './timeline';

/*
 * Ночная сцена (承): связывает скролл, таймлайн, 3D-камеру, симуляцию туши, рендерер, тексты и рисование зрителя.
 * Скролл не перехватывается: сцена только читает положение своей дорожки (секции высотой в TRACK_SCREENS экранов).
 * Всё, что видно, проходит через одну проекцию (projection.ts): тушь, звёзды, линии и попадание курсора по звёздам.
 */

/** Состояние туши «пунктир вдоль линий зрителя» — после дымки (0) и четырёх фигур (1…4). */
const OUTLINE_STATE = 5;
/** Дрейф капель в покое, единицы ковша: дымка плывёт заметно, фигура едва дышит, пунктир почти стоит. */
const HAZE_DRIFT = 0.9;
const FIGURE_DRIFT = 0.04;
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
/** Линии не упираются в звёзды: зазор у каждого конца, px — чтобы ядро звезды оставалось чистым. */
const LINE_GAP_PX = 10;
/** Область захвата и удержания орбитального роя капель курсора вокруг звёзд созвездия. */
const STAR_CAPTURE_RADIUS_PX = 70;
const STAR_RELEASE_RADIUS_PX = 85;
const SMALL_SCREEN_QUERY = '(max-width: 767px), (pointer: coarse)';
/**
 * Ракурс за курсором (владелец 2026-11-12: «эффект присутствия объёма»). Курсор в долях экрана n ∈ [−1, 1]:
 * цель ψ = −n_x·3°, θ = −n_y·1.8° (было 4° и 2.5° — владелец: «всё сильно поехало») — ведёшь мышь вправо, видишь сцену чуть справа (как будто сдвинул голову).
 * Поворот догоняет цель экспоненциально: L += (L* − L)·(1 − 0.94^s), s — кадр в долях 60 Гц.
 * Гаснет к рисованию в Н9 (вес 1 − invite), без мыши, без анимации и на касаниях — ноль.
 */
const LOOK_YAW = (3 * Math.PI) / 180;
const LOOK_PITCH = (1.8 * Math.PI) / 180;
const LOOK_EASE = 0.06;
const LOOK_EPSILON = 1e-4;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface NightElements {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly details: readonly HTMLImageElement[];
  readonly phrases: readonly HTMLElement[];
  readonly epilogue: HTMLElement;
}

function viewSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Пишет отрезок (экранные px) в массив, укороченный на LINE_GAP_PX с обоих концов. Без аллокаций. */
function writeSegment(
  target: Float32Array,
  index: number,
  ends: { readonly a: Point; readonly b: Point },
): void {
  const { a, b } = ends;
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const gap = Math.min(LINE_GAP_PX, length / 3) / length;
  const at = index * 4;
  target[at] = a.x + (b.x - a.x) * gap;
  target[at + 1] = a.y + (b.y - a.y) * gap;
  target[at + 2] = b.x - (b.x - a.x) * gap;
  target[at + 3] = b.y - (b.y - a.y) * gap;
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
  private readonly sideLayout = window.matchMedia(SIDE_LAYOUT_QUERY);
  private readonly haze = createHaze(pickInkCount(this.isSmallScreen));
  private readonly ink = new InkSimulation(pickInkCount(this.isSmallScreen), {
    center: DIPPER_CENTER,
    dipper: DIPPER_STARS,
    bounds: FIGURE_BOUNDS,
    radiusScale: this.isSmallScreen ? SMALL_SCREEN_RADIUS_SCALE : RADIUS_SCALE,
  });
  private readonly grid = new InkGrid();
  private readonly projector = new Projector();
  private readonly camera = new Camera();
  private readonly stars = new StarField();
  /** Вход симуляции туши: один объект, меняется на месте каждый кадр (без аллокаций в rAF). */
  private readonly hover = { x: 0, y: 0 };
  private readonly cursor = new Cursor();
  /** Капли курсора — как в прологе. */
  private readonly cursorField = new CursorField();
  private readonly inkStep: Mutable<InkStep> = {
    target: HAZE,
    sweep: 1,
    isDirect: false,
    drift: HAZE_DRIFT,
    isReducedMotion: false,
    nowMs: 0,
    hover: this.hover,
    hoverStrength: 0,
    cursor: this.cursor,
  };
  /** Скретчи концов отрезков (экранные px) — без аллокаций в кадре. */
  private readonly endA: Projected = { x: 0, y: 0, k: 0 };
  private readonly endB: Projected = { x: 0, y: 0, k: 0 };
  private readonly ends = { a: this.endA, b: this.endB };
  private readonly phraseOpacity: number[];
  private readonly details: DetailsLayer;
  private renderer: NightRenderer | null;
  private frame: NightFrame = frameAt(-1);
  private view: Size = viewSize();
  private cameraKey = -1;
  private figures: Int16Array[] = [];
  private wasSideLayout = this.sideLayout.matches;
  /** Ракурс за курсором: цель по положению мыши и сглаженное текущее значение (рад). */
  private lookTargetX = 0;
  private lookTargetY = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  /** Множитель прозрачности боковых фраз: растёт к концу хода камеры. */
  private sideFade = 1;
  /** Движение гравюрных деталей в кадре и сдвиг неба — рабочие объекты без аллокаций в rAF. */
  private readonly detailMotion = createDetailMotion();
  private readonly skyLag = { yaw: 0, pitch: 0 };
  private readonly skyDrift = { yaw: 0, pitch: 0 };
  private activeDetailFigure = 0;
  private lastFrameAt = 0;
  private drawing: Drawing = EMPTY_DRAWING;
  private finishedAt: number | null = null;
  private isEpilogueDue = false;
  private pointer: Point | null = null;
  private swarmStarIndex: number | null = null;
  private readonly starAnchorPoint = { x: 0, y: 0 };
  private hoverStar: number | null = null;
  private hoverAt = -Infinity;
  private frameId = 0;
  private timers: number[] = [];

  constructor(private readonly el: NightElements) {
    this.phraseOpacity = el.phrases.map(() => -1);
    this.details = new DetailsLayer(el.details);
    this.renderer = createNightRenderer(el.canvas, { stars: this.stars.table });
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
        // Гравюры качаются независимо от фигур: сбой одного не мешает другому
        this.details.load();
        this.loadFigures().catch((error: unknown) => console.error(error));
      },
      { rootMargin: '100% 0px' },
    );
    observer.observe(this.el.root);
    this.abort.signal.addEventListener('abort', () => observer.disconnect());
  }

  private async loadFigures(): Promise<void> {
    this.figures = await loadFigures(pickInkCount(this.isSmallScreen), this.abort.signal);
    this.setFigureStates();
    this.scheduleRender();
  }

  /** Фигуры с объёмом вдоль линии взгляда их ракурса (на узком экране ракурс прямой, ψ = 0). */
  private setFigureStates(): void {
    this.figures.forEach((data, i) => {
      const state = HAZE + 1 + i;
      const yaw = this.sideLayout.matches ? figureYaw(figureSide(state)) : 0;
      this.ink.setState(state, data, yaw);
    });
  }

  private handleContextLost(event: Event): void {
    event.preventDefault();
    // Запасной режим без WebGL: тексты остаются, туши и звёзд нет.
    this.renderer = null;
    this.el.canvas.hidden = true;
  }

  private handleResize(): void {
    this.view = viewSize();
    this.projector.setView(this.view.width, this.view.height);
    this.cameraKey = this.cameraKeyFor(this.inkStep.target);
    this.camera.snap(this.shotFor(this.inkStep.target));
    this.applyCamera();
    if (this.sideLayout.matches !== this.wasSideLayout) {
      // Ракурсы фигур сменились (широкий ↔ узкий экран) — объём должен лечь вдоль новых линий взгляда
      this.wasSideLayout = this.sideLayout.matches;
      this.setFigureStates();
    }
    this.grid.resize(this.view);
    this.cursorField.build(this.view);
    this.ink.resetMotion();
    this.renderer?.resize(this.view);
    this.writeSegments();
    this.handleScroll();
  }

  private handleScroll(): void {
    const u = -this.el.root.getBoundingClientRect().top / this.view.height;
    this.frame = frameAt(u);
    this.applyDom();
    // Без WebGL кадры не идут, а гравюры и тексты остаются: детали кладутся по скроллу
    if (!this.renderer) this.updateDetails();
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
    epilogue.dataset.shown = hasEpilogue ? 'true' : 'false';
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
      // Буквы проявляются из расфокуса по времени (landing.css): скролл только включает фразу
      phrase.dataset.shown = opacity > 0 ? 'true' : 'false';
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
      this.lookTargetX = (event.clientX / this.view.width) * 2 - 1;
      this.lookTargetY = (event.clientY / this.view.height) * 2 - 1;
    }
    const star = findStarAt(this.stars.drawablePoints(), { point: this.pointer, radiusPx: HOVER_RADIUS_PX });
    if (star !== null && star !== this.hoverStar && !this.reducedMotion.matches) {
      this.hoverAt = performance.now();
      const at = starAt(star);
      this.hover.x = at.x;
      this.hover.y = at.y;
    }
    this.hoverStar = star;
    this.scheduleRender();
  }

  private handlePointerLeave(): void {
    this.lookTargetX = 0;
    this.lookTargetY = 0;
    this.cursor.leave();
    this.cursorField.pointer.leave();
    this.cursorField.setStarAnchor(null);
    this.swarmStarIndex = null;
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
    const star = findStarAt(this.stars.drawablePoints(), { point: this.pointer, radiusPx });
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

  /**
   * Линии в экранных px по текущей проекции звёзд: контур ковша, линии зрителя, линия от якоря к курсору
   * (только мышь: на телефоне — касания). Пересчитывается каждый кадр — камера двигает звёзды на экране.
   */
  private writeSegments(): void {
    let count = 0;
    for (const [a, b] of DIPPER_OUTLINE) count = this.addSegment(count, a, b);
    for (const [a, b] of this.drawing.segments) count = this.addSegment(count, a, b);
    const { anchor } = this.drawing;
    if (anchor !== null && this.pointer && count < MAX_LINE_SEGMENTS)
      count = this.addSegment(count, anchor, null);
    this.input.outlineCount = DIPPER_OUTLINE.length;
    this.input.segmentCount = count;
    this.input.segmentsDirty = true;
  }

  /** Отрезок от звезды a к звезде b (или к курсору, если b = null) под номером index; возвращает следующий номер. */
  private addSegment(index: number, a: number, b: number | null): number {
    this.stars.drawablePoint(a, this.endA);
    if (b === null && this.pointer) {
      this.endB.x = this.pointer.x;
      this.endB.y = this.pointer.y;
    } else {
      this.stars.drawablePoint(b ?? a, this.endB);
    }
    writeSegment(this.input.segments, index, this.ends);
    return index + 1;
  }

  private scheduleRender(): void {
    if (this.frameId || !this.renderer) return;
    this.frameId = requestAnimationFrame((now) => this.renderFrame(now));
  }

  /**
   * Кадр: камера → проекция звёзд и линий → симуляция туши → сетка → текстура → отрисовка. Пока сцена на экране
   * и движение не отключено, кадры идут непрерывно (тушь дрейфует, камера дышит); без анимации — только по событиям.
   */
  private renderFrame(now: number): void {
    this.frameId = 0;
    if (!this.renderer || this.frame.stage <= 0) return;
    const isAnimating = this.updateInput(now);
    const isLooking = this.updateLook(now);
    const isCameraMoving = this.moveCamera(now);
    this.updateDetailMotion(now);
    this.updateDetails();
    this.writeSegments();
    this.updateSideFade(now);
    this.ink.step(this.inkStep, this.projector, this.grid);
    this.updateStarSwarm();
    // Длительность кадра для поля курсора: после паузы (вкладка, скролл издалека) — не больше 50 мс
    this.cursorField.step(Math.min(50, now - this.lastFrameAt) || 16.667);
    this.lastFrameAt = now;
    this.renderer.uploadStars(this.stars.table);
    this.renderer.uploadInk(this.grid);
    this.renderer.uploadCursor(this.cursorField);
    this.renderer.render(this.input);
    if (isAnimating || isLooking || isCameraMoving || !this.inkStep.isReducedMotion) this.scheduleRender();
  }

  /**
   * При наведении на область вокруг звёзд созвездия капли курсора отрываются и закручиваются
   * по 3D-орбитальным траекториям вокруг звезды (по принципу облачка в герое).
   */
  private updateStarSwarm(): void {
    if (!this.pointer || this.reducedMotion.matches) {
      this.cursorField.setStarAnchor(null);
      this.swarmStarIndex = null;
      return;
    }
    const dipperCount = DIPPER_STARS.length;
    // Гистерезис: если звезда уже захвачена, отпускаем только при выходе за пределы STAR_RELEASE_RADIUS_PX
    if (this.swarmStarIndex !== null) {
      this.stars.drawablePoint(this.swarmStarIndex, this.endA);
      const curDist = Math.hypot(this.endA.x - this.pointer.x, this.endA.y - this.pointer.y);
      if (curDist > STAR_RELEASE_RADIUS_PX) {
        this.swarmStarIndex = null;
      }
    }
    // Поиск ближайшей звезды созвездия в радиусе захвата
    let closestIndex = this.swarmStarIndex;
    let minDist = STAR_CAPTURE_RADIUS_PX;
    for (let i = 0; i < dipperCount; i++) {
      this.stars.drawablePoint(i, this.endA);
      const d = Math.hypot(this.endA.x - this.pointer.x, this.endA.y - this.pointer.y);
      if (d < minDist) {
        minDist = d;
        closestIndex = i;
      }
    }
    this.swarmStarIndex = closestIndex;
    if (this.swarmStarIndex !== null) {
      this.stars.drawablePoint(this.swarmStarIndex, this.endA);
      this.starAnchorPoint.x = this.endA.x;
      this.starAnchorPoint.y = this.endA.y;
      this.cursorField.setStarAnchor(this.starAnchorPoint);
    } else {
      this.cursorField.setStarAnchor(null);
    }
  }

  /** Гравюрные детали по кадру таймлайна и движению камеры (detailMotion). */
  private updateDetails(): void {
    this.details.update(this.view, this.frame, this.detailMotion);
  }

  /**
   * Движение деталей по ходу камеры: проявление detailFade(p), угасание уходящей фигуры detailOutFade(p)
   * и сдвиг вместе с небом −f·(Δψ, Δθ), включая поворот взгляда за курсором lookYaw/lookPitch (details.ts).
   */
  private updateDetailMotion(now: number): void {
    const motion = this.detailMotion;
    const lookX = -this.projector.focal * this.lookYaw * SKY_FOLLOW;
    const lookY = -this.projector.focal * this.lookPitch * SKY_FOLLOW;
    if (!this.sideLayout.matches) {
      motion.fade = 1;
      motion.shiftX = lookX;
      motion.shiftY = lookY;
      motion.leavingFigure = null;
      motion.leavingFade = 0;
      return;
    }
    const progress = this.camera.progress(now);
    motion.fade = detailFade(progress);
    this.camera.skyLag(this.skyLag);
    motion.shiftX = -this.projector.focal * this.skyLag.yaw + lookX;
    motion.shiftY = -this.projector.focal * this.skyLag.pitch + lookY;
    this.updateLeavingMotion(progress, lookX, lookY);
  }

  /** Сдвиг и угасание уходящей фигуры: старт из угла, плавный уход в сторону движения неба + взгляд за курсором. */
  private updateLeavingMotion(progress: number, lookX: number, lookY: number): void {
    const motion = this.detailMotion;
    if (progress >= 1 || motion.leavingFigure === null) {
      motion.leavingFigure = null;
      motion.leavingFade = 0;
      return;
    }
    motion.leavingFade = detailOutFade(progress);
    this.camera.skyDrift(this.skyDrift);
    motion.leavingShiftX = -this.projector.focal * this.skyDrift.yaw + lookX;
    motion.leavingShiftY = -this.projector.focal * this.skyDrift.pitch + lookY;
  }

  /** Сглаживает ракурс за курсором и отдаёт его камере. Возвращает, догоняет ли он ещё цель. */
  private updateLook(now: number): boolean {
    const s = Math.min(3, (now - this.lastFrameAt) / 16.667 || 1);
    const weight = this.inkStep.isReducedMotion ? 0 : 1 - this.frame.invite;
    const targetYaw = -this.lookTargetX * LOOK_YAW * weight;
    const targetPitch = -this.lookTargetY * LOOK_PITCH * weight;
    const ease = 1 - (1 - LOOK_EASE) ** s;
    this.lookYaw += (targetYaw - this.lookYaw) * ease;
    this.lookPitch += (targetPitch - this.lookPitch) * ease;
    this.camera.setLook(this.lookYaw, this.lookPitch);
    return Math.abs(targetYaw - this.lookYaw) + Math.abs(targetPitch - this.lookPitch) > LOOK_EPSILON;
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

  /** Ключ ракурса: состояние туши и то, помещается ли текст сбоку (на узком экране ракурс всегда общий). */
  private cameraKeyFor(state: number): number {
    return state * 2 + Number(this.sideLayout.matches);
  }

  /** Ракурс для состояния туши: фигура сбоку под своим углом (Н2–Н5 на широком экране) или общий план. */
  private shotFor(state: number): Shot {
    const input = { view: this.view, focal: this.projector.focal, key: this.cameraKeyFor(state) };
    const side = this.sideLayout.matches ? figureSide(state) : null;
    const bounds = figureBounds(state);
    if (side && bounds) return figureShot(input, { state, bounds, side });
    return overviewShot(input, computeLayout(this.view, FIGURE_BOUNDS));
  }

  /** Запоминает уходящую фигуру (если была) для плавного исчезновения по ходу движения камеры. */
  private updateLeavingFigure(): void {
    const next = this.inkStep.target;
    const prev = this.activeDetailFigure;
    const isAnimated = !this.inkStep.isReducedMotion && this.sideLayout.matches && prev >= 1 && prev !== next;
    this.detailMotion.leavingFigure = isAnimated ? prev : null;
    this.activeDetailFigure = next;
  }

  /** Наводит камеру на ракурс состояния, двигает её и проецирует звёзды. Возвращает, меняется ли ракурс. */
  private moveCamera(now: number): boolean {
    const key = this.cameraKeyFor(this.inkStep.target);
    if (key !== this.cameraKey) {
      this.cameraKey = key;
      this.updateLeavingFigure();
      // Без анимации камера не едет, а сразу встаёт в новый ракурс
      const shot = this.shotFor(this.inkStep.target);
      if (this.inkStep.isReducedMotion) this.camera.snap(shot);
      else this.camera.aim(shot, now);
    }
    const isMoving = this.camera.update(now, this.inkStep.isReducedMotion);
    this.applyCamera();
    return isMoving;
  }

  /** Текущий ракурс → проекция → экранные положения звёзд. */
  private applyCamera(): void {
    this.projector.setPose(this.camera.current);
    this.input.viewYaw = this.camera.current.yaw;
    this.input.viewPitch = this.camera.current.pitch;
    this.stars.project(this.projector, this.projector.focal / this.camera.current.distance);
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
    // Рой течёт туда, где встанет новая фигура; к общему плану — от правого края к центру
    inkStep.sweep = figureSide(inkStep.target) === 'left' ? -1 : 1;
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
