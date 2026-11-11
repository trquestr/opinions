"""Пробное запекание фигуры в точки — в том же виде, что BAKED_SLIDES у бюста: [x, y, r].

У бюста 3.5–5.4 тыс. точек на слайд, радиус 1.25–5.8 px (медиана 2.3). Здесь тот же диапазон.
Алгоритм: «броски дротиков» с плотностью по темноте картинки и переменным радиусом:
  плотность кандидатов  p ~ d^GAMMA,  d = 1 - яркость (нормирована на 99-й перцентиль)
  радиус точки          r = R_MIN + (R_MAX - R_MIN) * d^0.8
  кандидат принимается, если до любой уже стоящей точки не ближе PACK * (r_i + r_j)
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1200, 675          # размер фигуры на экране, px
R_MIN, R_MAX = 1.25, 5.8  # как у бюста
GAMMA = 1.15
PACK = 0.92               # < 1: соседние капли чуть слипаются, как метаболлы бюста
CELL = 14
NIGHT = (11, 11, 13)
rng = np.random.default_rng(7)


def darkness(path: Path) -> np.ndarray:
    img = Image.open(path).convert("L").resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.6))
    d = 1.0 - np.asarray(img, dtype=np.float32) / 255.0
    return np.clip(d / max(np.percentile(d[d > 0.02], 99), 1e-3), 0.0, 1.0)


def bake(d: np.ndarray, count: int) -> np.ndarray:
    weights = (d ** GAMMA).ravel().astype(np.float64)
    weights /= weights.sum()
    grid: dict[tuple[int, int], list[tuple[float, float, float]]] = {}
    points: list[tuple[float, float, float]] = []
    tries = 0
    while len(points) < count and tries < 60:
        tries += 1
        for flat in rng.choice(weights.size, size=20000, p=weights):
            y, x = divmod(int(flat), W)
            px, py = x + rng.random(), y + rng.random()
            r = R_MIN + (R_MAX - R_MIN) * float(d[y, x]) ** 0.8
            cx, cy = int(px // CELL), int(py // CELL)
            near = (p for i in (-1, 0, 1) for j in (-1, 0, 1) for p in grid.get((cx + i, cy + j), ()))
            if all((px - qx) ** 2 + (py - qy) ** 2 >= (PACK * (r + qr)) ** 2 for qx, qy, qr in near):
                points.append((px, py, r))
                grid.setdefault((cx, cy), []).append((px, py, r))
                if len(points) >= count:
                    break
    return np.array(points, dtype=np.float32)


def render(points: np.ndarray, night: bool) -> Image.Image:
    scale = 2
    canvas = Image.new("RGB", (W * scale, H * scale), NIGHT if night else (255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    ink = (236, 236, 232) if night else (14, 14, 16)
    for x, y, r in points:
        draw.ellipse([(x - r) * scale, (y - r) * scale, (x + r) * scale, (y + r) * scale], fill=ink)
    return canvas.resize((W, H), Image.LANCZOS)


def main() -> None:
    src_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
    names = sys.argv[3:]
    cell_w, cell_h = 640, 360
    sheet = Image.new("RGB", (cell_w * 4, cell_h * len(names)), (255, 255, 255))
    for row, name in enumerate(names):
        d = darkness(src_dir / f"{name}.png")
        full, half = bake(d, 5000), bake(d, 2500)
        source = Image.open(src_dir / f"{name}.png").convert("RGB").resize((W, H), Image.LANCZOS)
        tiles = [source, render(full, False), render(full, True), render(half, True)]
        for col, tile in enumerate(tiles):
            sheet.paste(tile.resize((cell_w, cell_h), Image.LANCZOS), (col * cell_w, row * cell_h))
        print(name, "точек:", len(full), "/", len(half), "покрытие чернилами", round(float((d > 0.15).mean()), 3))
        render(full, True).save(out.parent / f"bake-{name}-night-5000.png")
    sheet.save(out)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
