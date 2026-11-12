"""Запекание фигур ночной сцены (承) в точки туши.

Источники — гравюры output/imagegen/final/scene-02/figure-*.png (не уходят на сайт).
Результат — apps/web/public/assets/night/:
  points-<N>.bin   все состояния подряд, на точку три int16: x, y, r в сотых долях «единицы ковша»;
Манифест (порядок состояний, число точек, звёзды, общие границы фигур) импортирует код сцены:
  apps/web/src/_pages/home/lib/night/night-manifest.json

Система координат — «единицы ковша» из ТЗ-генерация.md (сцена 2): Дубхе (1, 0) … Алькаид (100, 53),
x вправо, y вниз. Звёзды стоят на экране неподвижно, поэтому фигура подгоняется к ним, а не наоборот.

Подгонка. На каждой гравюре вручную отмечено, куда «по смыслу» должна лечь каждая звезда (TARGETS, в процентах
ширины и высоты картинки). По семи парам методом наименьших квадратов находится подобие
  p_img = s · R(θ) · p_star + t
(масштаб s, поворот θ, сдвиг t; без перекоса, чтобы фигура не искажалась). Точки, запечённые в пикселях картинки,
переводятся обратным преобразованием в единицы ковша. Остаток подгонки печатается: если звезда уехала от своей
отметки дальше нескольких единиц — отметки надо поправить.

Запекание — как в output/imagegen/bake-trial/bake_trial.py: «броски дротиков» с плотностью по темноте,
  плотность кандидатов  p ~ d^GAMMA,  d = 1 - яркость (нормирована на 99-й перцентиль)
  радиус                r = R_MIN + (R_MAX - R_MIN) · d^0.8
  кандидат принят, если до соседей не ближе PACK · (r_i + r_j).
Затем точки сортируются по углу вокруг центра ковша: i-я точка одной фигуры летит в i-ю точку следующей,
и при таком порядке перелёт читается как закрутка вокруг ковша, а не как перемешивание.

Запуск: python scripts/bake_night.py [--sheet путь.png]
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "output/imagegen/final/scene-02"
OUT = ROOT / "apps/web/public/assets/night"
MANIFEST = ROOT / "apps/web/src/_pages/home/lib/night/night-manifest.json"

STARS = {  # единицы ковша, ТЗ-генерация.md
    "Dubhe": (1, 0), "Merak": (0, 22), "Phecda": (31, 34), "Megrez": (44, 20),
    "Alioth": (68, 24), "Mizar": (86, 29), "Alkaid": (100, 53),
}
STAR_ORDER = list(STARS)
DIPPER_CENTER = (50.0, 26.5)

# Куда ложится каждая звезда на гравюре, % ширины и высоты (порядок как в STAR_ORDER).
# Сверено с точными координатами маркеров из output/imagegen/scene-02/star-coordinates.json.
TARGETS = {
    # ковш — холка, грудь, бедро, корень хвоста; ручка — вдоль хвоста
    "bear": [
        (21.806, 21.692),  # Dubhe
        (20.517, 43.540),  # Merak
        (38.834, 56.035),  # Phecda
        (46.322, 40.994),  # Megrez
        (60.206, 45.191),  # Alioth
        (71.818, 49.987),  # Mizar
        (86.720, 75.264),  # Alkaid
    ],
    # ковш — рукояти и лемех; ручка — грядиль до кольца
    "plough": [
        (20.196, 23.339),
        (20.151, 46.468),
        (39.040, 57.745),
        (45.232, 44.567),
        (59.649, 50.075),
        (71.475, 55.944),
        (81.471, 76.361),
    ],
    # ковш — кузов; ручка — дышло
    "chariot": [
        (22.446, 21.457),
        (20.656, 43.818),
        (38.041, 59.038),
        (46.484, 45.988),
        (60.292, 49.430),
        (71.438, 55.725),
        (81.385, 78.172),
    ],
    # ковш — четыре угла носилок; ручка — три плакальщицы
    "procession": [
        (21.505, 21.546),
        (19.745, 44.541),
        (38.171, 57.324),
        (46.301, 40.508),
        (59.880, 44.725),
        (72.805, 50.744),
        (82.477, 76.445),
    ],
}
FIGURES = list(TARGETS)  # порядок появления: Н2…Н5

W, H = 1600, 900          # рабочий размер картинки при запекании, px
# Параметры запекания: мелкие точки (0.75–2.3 px) с естественной вариацией радиуса
# и распределением по полутонам (gamma = 0.85). Это даёт тонкую гравюрную текстуру
# и мягкие переходы без слипания в сплошные белые пятна.
R_MIN, R_MAX = 0.75, 2.3
GAMMA = 0.85
BLUR_PX = 0.4
HIGHLIGHT_CUTOFF = 0.015  # мягкий порог для тонких штрихов и градиентов
PACK = 0.96               # точки сохраняют раздельность и читаемость
CELL = 8
FIXED_POINT = 100         # int16 хранит сотые доли единицы ковша
COUNTS = (3600, 1800)     # десктоп / телефон (как 3519 точек у бюста)
NIGHT = (11, 11, 13)


def fit_similarity(src: np.ndarray, dst: np.ndarray) -> tuple[float, float, np.ndarray]:
    """Подобие src→dst по МНК (Umeyama без отражения): возвращает s, θ, t."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    a, b = src - mu_s, dst - mu_d
    # Комплексная запись: z_d ≈ k · z_s, k = s·e^{iθ}; k = Σ conj(z_s)·z_d / Σ |z_s|²
    zs, zd = a[:, 0] + 1j * a[:, 1], b[:, 0] + 1j * b[:, 1]
    k = np.vdot(zs, zd) / np.vdot(zs, zs).real
    s, theta = abs(k), float(np.angle(k))
    t = mu_d - s * rotate(mu_s, theta)
    return s, theta, t


def rotate(p: np.ndarray, theta: float) -> np.ndarray:
    c, si = np.cos(theta), np.sin(theta)
    return np.stack([c * p[..., 0] - si * p[..., 1], si * p[..., 0] + c * p[..., 1]], -1)


def darkness(path: Path) -> np.ndarray:
    img = Image.open(path).convert("L").resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(BLUR_PX))
    d = 1.0 - np.asarray(img, dtype=np.float32) / 255.0
    d = np.clip(d / max(np.percentile(d[d > 0.02], 99), 1e-3), 0.0, 1.0)
    return np.where(d < HIGHLIGHT_CUTOFF, 0.0, d)


def bake(d: np.ndarray, count: int, rng: np.random.Generator, radius_scale: float = 1.0) -> np.ndarray:
    """Запекает ровно count точек с заданным масштабом радиуса."""
    for step in range(8):
        scale = radius_scale * (0.95 ** step)
        points = scatter(d, count, rng, scale)
        if len(points) == count:
            return points
    raise RuntimeError(f"не набралось {count} точек")


def scatter(d: np.ndarray, count: int, rng: np.random.Generator, radius_scale: float) -> np.ndarray:
    weights = (d ** GAMMA).ravel().astype(np.float64)
    weights += 0.00003 * (d.ravel() > HIGHLIGHT_CUTOFF)
    weights /= weights.sum()
    grid: dict[tuple[int, int], list[tuple[float, float, float]]] = {}
    points: list[tuple[float, float, float]] = []
    for _ in range(160):
        for flat in rng.choice(weights.size, size=25000, p=weights):
            y, x = divmod(int(flat), W)
            px, py = x + rng.random(), y + rng.random()
            val = float(d[y, x])
            r = (R_MIN + (R_MAX - R_MIN) * (val ** 1.3)) * (0.85 + 0.3 * rng.random()) * radius_scale
            cx, cy = int(px // CELL), int(py // CELL)
            near = (p for i in (-1, 0, 1) for j in (-1, 0, 1) for p in grid.get((cx + i, cy + j), ()))
            if all((px - qx) ** 2 + (py - qy) ** 2 >= (PACK * (r + qr)) ** 2 for qx, qy, qr in near):
                points.append((px, py, r))
                grid.setdefault((cx, cy), []).append((px, py, r))
                if len(points) == count:
                    return np.array(points, dtype=np.float64)
    return np.array(points, dtype=np.float64)


def bounds_of(points: np.ndarray) -> dict[str, float]:
    """Рамка точек в единицах ковша, с округлением до десятых."""
    return {
        "minX": round(float(points[:, 0].min()), 1), "minY": round(float(points[:, 1].min()), 1),
        "maxX": round(float(points[:, 0].max()), 1), "maxY": round(float(points[:, 1].max()), 1),
    }


def to_dipper(points_px: np.ndarray, s: float, theta: float, t: np.ndarray) -> np.ndarray:
    """Пиксели картинки → единицы ковша (обратное подобие); радиус делится на масштаб."""
    xy = rotate((points_px[:, :2] - t) / s, -theta)
    return np.column_stack([xy, points_px[:, 2] / s])


def sort_by_angle(points: np.ndarray) -> np.ndarray:
    ang = np.arctan2(points[:, 1] - DIPPER_CENTER[1], points[:, 0] - DIPPER_CENTER[0])
    return points[np.argsort(ang, kind="stable")]


def fit_figure(name: str) -> tuple[float, float, np.ndarray]:
    stars = np.array([STARS[k] for k in STAR_ORDER], dtype=np.float64)
    marks = np.array(TARGETS[name], dtype=np.float64) * [W / 100, H / 100]
    s, theta, t = fit_similarity(stars, marks)
    residual = np.linalg.norm(rotate(stars, theta) * s + t - marks, axis=1) / s
    print(f"{name}: масштаб {s:.2f} px/ед, поворот {np.degrees(theta):+.1f}°, "
          f"остаток по звёздам (ед) {np.round(residual, 1).tolist()}")
    return s, theta, t


def render_check(name: str, pts: np.ndarray, size: tuple[int, int]) -> Image.Image:
    """Ночной кадр в единицах ковша: точки туши + семь звёзд + привычный контур ковша."""
    cw, ch = size
    scale = cw / 220  # 220 единиц по ширине кадра: ковш (100 ед) занимает меньше половины
    ox, oy = cw / 2 - DIPPER_CENTER[0] * scale, ch / 2 - DIPPER_CENTER[1] * scale
    img = Image.new("RGB", (cw * 2, ch * 2), NIGHT)
    dr = ImageDraw.Draw(img)
    ink = (236, 236, 232)
    for x, y, r in pts:
        X, Y, R = (ox + x * scale) * 2, (oy + y * scale) * 2, max(r * scale, 0.5) * 2
        dr.ellipse([X - R, Y - R, X + R, Y + R], fill=ink)
    star_px = [((ox + x * scale) * 2, (oy + y * scale) * 2) for x, y in STARS.values()]
    for a, b in zip(STAR_ORDER, STAR_ORDER[1:]):
        dr.line([star_px[STAR_ORDER.index(a)], star_px[STAR_ORDER.index(b)]], fill=(255, 190, 60), width=2)
    dr.line([star_px[0], star_px[3]], fill=(255, 190, 60), width=2)  # замыкаем чашу Дубхе–Мегрец
    for X, Y in star_px:
        dr.ellipse([X - 9, Y - 9, X + 9, Y + 9], fill=(255, 255, 255), outline=(255, 190, 60), width=3)
    dr.text((16, 12), name, fill=(255, 190, 60))
    return img.resize(size, Image.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sheet", type=Path, help="контрольный лист подгонки (PNG)")
    args = parser.parse_args()

    baked: dict[int, list[np.ndarray]] = {n: [] for n in COUNTS}
    for i, name in enumerate(FIGURES):
        s, theta, t = fit_figure(name)
        d = darkness(SRC / f"figure-{name}.png")
        for n in COUNTS:
            rng = np.random.default_rng(1000 * i + n)
            r_scale = 1.0 if n == COUNTS[0] else 1.25
            pts = bake(d, n, rng, r_scale)
            baked[n].append(sort_by_angle(to_dipper(pts, s, theta, t)))

    OUT.mkdir(parents=True, exist_ok=True)
    for n, states in baked.items():
        data = np.round(np.concatenate(states) * FIXED_POINT)
        if np.abs(data).max() > np.iinfo(np.int16).max:
            raise ValueError("координаты вышли за int16 — уменьшите FIXED_POINT")
        data.astype("<i2").tofile(OUT / f"points-{n}.bin")
    union = np.concatenate(baked[COUNTS[0]])
    manifest = {
        "fixedPoint": FIXED_POINT,
        "stars": [{"name": k, "x": v[0], "y": v[1]} for k, v in STARS.items()],
        "figures": FIGURES,
        "counts": list(COUNTS),
        # Общие границы всех фигур в единицах ковша: по ним сцена выбирает масштаб на экране.
        "bounds": bounds_of(union),
        # Границы каждой фигуры: по ним камера выбирает кадр фигуры.
        "figureBounds": [bounds_of(pts) for pts in baked[COUNTS[0]]],
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    sheet_path = args.sheet or (ROOT / "output/night/fit-sheet.png")
    sheet_path.parent.mkdir(parents=True, exist_ok=True)
    cell = (800, 450)
    sheet = Image.new("RGB", (cell[0] * 2, cell[1] * 2))
    for i, (name, pts) in enumerate(zip(FIGURES, baked[COUNTS[0]])):
        sheet.paste(render_check(name, pts, cell), ((i % 2) * cell[0], (i // 2) * cell[1]))
    sheet.save(sheet_path)
    print(f"Контрольный лист сохранён: {sheet_path}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
