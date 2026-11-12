"""Подготовка гравюрных деталей ночной сцены (承) для сайта.

Источники — output/imagegen/scene-02/detail-*.png: чёрная гравюра на белом фоне (не уходят на сайт).
Результат — apps/web/public/assets/night/details/<имя>.webp: светлые штрихи на чёрном, оттенки серого.

Зачем инверсия и уровни. Деталь кладётся на сцену с mix-blend-mode: screen: чёрный фон при этом исчезает,
светлые штрихи добавляются к ночному фону. Поэтому фон должен быть ровно чёрным:
  L = 255 - яркость исходника;
  L <= BLACK_POINT -> 0, иначе линейная растяжка BLACK_POINT..255 -> 0..255 (шум бумаги уходит в ноль).
Обрезка по рамке пикселей ярче CROP_THRESHOLD плюс поля CROP_PADDING от размера рамки: пустые поля не грузим.
Длинная сторона не больше MAX_SIDE_WIDE у широких деталей (пропорции от WIDE_ASPECT: дюна, борозда) и MAX_SIDE у
остальных (без увеличения): страница не должна тянуть лишние мегабайты.

Ещё один файл — stipple.png: бесшовная плитка случайных точек для маски растворения (landing.css, .night-detail).
Генератор с зерном (STIPPLE_SEED), поэтому результат одинаков при каждом запуске.

Запуск: python scripts/prepare_night_details.py
"""
import sys
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "output/imagegen/scene-02"
OUT = ROOT / "apps/web/public/assets/night/details"

NAMES = [
    "detail-pine-branch",
    "detail-ionic-capital",
    "detail-furrow",
    "detail-wheat",
    "detail-wheel",
    "detail-xiangyun",
    "detail-dune",
    "detail-crescent",
]

BLACK_POINT = 20
CROP_THRESHOLD = 28
CROP_PADDING = 0.02
MAX_SIDE = 800
MAX_SIDE_WIDE = 1200
WIDE_ASPECT = 2.0
WEBP_QUALITY = 80


def stretch_levels(value: int) -> int:
    """Уровни одного значения: до чёрной точки — 0, дальше линейная растяжка на 0..255."""
    if value <= BLACK_POINT:
        return 0
    return round((value - BLACK_POINT) * 255 / (255 - BLACK_POINT))


def prepare(image: Image.Image) -> Image.Image:
    """Инверсия, уровни, обрезка по рамке штрихов, уменьшение."""
    light = image.convert("L").point(lambda v: stretch_levels(255 - v))
    box = light.point(lambda v: 255 if v > CROP_THRESHOLD else 0).getbbox()
    if box is None:
        raise ValueError("на картинке нет штрихов")
    left, top, right, bottom = box
    pad_x = round((right - left) * CROP_PADDING)
    pad_y = round((bottom - top) * CROP_PADDING)
    cropped = light.crop(
        (max(0, left - pad_x), max(0, top - pad_y), min(light.width, right + pad_x), min(light.height, bottom + pad_y))
    )
    aspect = cropped.width / cropped.height
    limit = MAX_SIDE_WIDE if aspect >= WIDE_ASPECT else MAX_SIDE
    scale = min(1.0, limit / max(cropped.size))
    if scale < 1.0:
        size = (round(cropped.width * scale), round(cropped.height * scale))
        cropped = cropped.resize(size, Image.LANCZOS)
    return cropped


STIPPLE_SEED = 7
STIPPLE_SIZE = 128
STIPPLE_SUPERSAMPLE = 4
# Цель по сумме площадей кругов. Итоговое покрытие ~0.35 (печатается): края кругов при рисовании чуть шире идеальных.
STIPPLE_AREA_TARGET = 0.29
STIPPLE_RADIUS = (0.8, 1.6)
STIPPLE_GAP = 0.3
STIPPLE_MAX_TRIES = 200000


def torus_distance_sq(a: tuple, b: tuple, size: float) -> float:
    """Квадрат расстояния на торе: плитка бесшовная, края замкнуты."""
    dx = abs(a[0] - b[0])
    dy = abs(a[1] - b[1])
    dx = min(dx, size - dx)
    dy = min(dy, size - dy)
    return dx * dx + dy * dy


def scatter_dots(rng: random.Random) -> list:
    """Бросок дротиков: случайные точки радиуса STIPPLE_RADIUS, не ближе (r_i + r_j + STIPPLE_GAP), пока не наберётся покрытие."""
    dots: list = []
    area = 0.0
    target = STIPPLE_AREA_TARGET * STIPPLE_SIZE * STIPPLE_SIZE
    for _ in range(STIPPLE_MAX_TRIES):
        if area >= target:
            break
        radius = rng.uniform(*STIPPLE_RADIUS)
        at = (rng.uniform(0, STIPPLE_SIZE), rng.uniform(0, STIPPLE_SIZE))
        fits = all(
            torus_distance_sq(at, (x, y), STIPPLE_SIZE) >= (radius + r + STIPPLE_GAP) ** 2 for x, y, r in dots
        )
        if fits:
            dots.append((at[0], at[1], radius))
            area += 3.14159265 * radius * radius
    return dots


def make_stipple() -> Image.Image:
    """Плитка RGBA: маску задаёт альфа. Рисуется в увеличенном виде с обёрткой через края и сжимается (сглаживание)."""
    scale = STIPPLE_SUPERSAMPLE
    size = STIPPLE_SIZE * scale
    alpha = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(alpha)
    for x, y, r in scatter_dots(random.Random(STIPPLE_SEED)):
        for ox in (-STIPPLE_SIZE, 0, STIPPLE_SIZE):
            for oy in (-STIPPLE_SIZE, 0, STIPPLE_SIZE):
                cx, cy = (x + ox) * scale, (y + oy) * scale
                draw.ellipse((cx - r * scale, cy - r * scale, cx + r * scale, cy + r * scale), fill=255)
    alpha = alpha.resize((STIPPLE_SIZE, STIPPLE_SIZE), Image.LANCZOS)
    tile = Image.new("RGBA", (STIPPLE_SIZE, STIPPLE_SIZE), (0, 0, 0, 255))
    tile.putalpha(alpha)
    return tile


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name in NAMES:
        with Image.open(SRC / f"{name}.png") as source:
            result = prepare(source)
        target = OUT / f"{name}.webp"
        result.save(target, "WEBP", quality=WEBP_QUALITY)
        size = target.stat().st_size
        total += size
        print(f"{name}: {result.width}x{result.height}, {size} байт")
    stipple = make_stipple()
    stipple.save(OUT / "stipple.png", "PNG", optimize=True)
    coverage = float(np.asarray(stipple.getchannel("A")).mean()) / 255
    print(f"stipple: покрытие {coverage:.2f}, {(OUT / 'stipple.png').stat().st_size} байт")
    print(f"итого (без плитки): {total} байт")
    return 0


if __name__ == "__main__":
    sys.exit(main())
