"""Ковш через N лет: полное движение звёзд в пространстве, а не линейный сдвиг по небу.

Для каждой звезды:
  r0 = d * (cos δ cos α, cos δ sin α, sin δ),            d = 1000 / параллакс [пк]
  v  = v_r * r̂ + v_α * α̂ + v_δ * δ̂,                     v_α,δ = 4.74047 * μ["/год] * d [км/с]
  r(t) = r0 + v * t,                                      1 км/с = 1.0227e-6 пк/год
Потом r(t) снова переводится в (α, δ) и проецируется на касательную плоскость (гномоническая
проекция) с центром в сегодняшнем центре ковша. Ось x — в сторону роста α, как в ТЗ на генерацию
(Дубхе слева, Алькаид справа), ось y — вниз.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

KM_S_TO_PC_YR = 1.0227e-6
ORDER = ["Dubhe", "Merak", "Phecda", "Megrez", "Alioth", "Mizar", "Alkaid"]
# Контур ковша: чаша замкнута, дальше ручка
EDGES = [(0, 1), (1, 2), (2, 3), (3, 0), (3, 4), (4, 5), (5, 6)]


def cartesian(star: dict) -> tuple[np.ndarray, np.ndarray]:
    a, d = np.radians(star["ra_deg"]), np.radians(star["dec_deg"])
    dist = 1000.0 / star["plx_mas"]
    r_hat = np.array([np.cos(d) * np.cos(a), np.cos(d) * np.sin(a), np.sin(d)])
    a_hat = np.array([-np.sin(a), np.cos(a), 0.0])
    d_hat = np.array([-np.sin(d) * np.cos(a), -np.sin(d) * np.sin(a), np.cos(d)])
    v_a = 4.74047 * star["pm_ra_mas"] / 1000.0 * dist
    v_d = 4.74047 * star["pm_dec_mas"] / 1000.0 * dist
    velocity = (star["rv_km_s"] * r_hat + v_a * a_hat + v_d * d_hat) * KM_S_TO_PC_YR
    return dist * r_hat, velocity


def project(position: np.ndarray, centre: tuple[float, float]) -> tuple[float, float]:
    x, y, z = position / np.linalg.norm(position)
    a, d = np.arctan2(y, x), np.arcsin(z)
    a0, d0 = centre
    cos_c = np.sin(d0) * np.sin(d) + np.cos(d0) * np.cos(d) * np.cos(a - a0)
    px = np.cos(d) * np.sin(a - a0) / cos_c
    py = (np.cos(d0) * np.sin(d) - np.sin(d0) * np.cos(d) * np.cos(a - a0)) / cos_c
    return float(np.degrees(px)), float(-np.degrees(py))


def layout(stars: dict, years: float, centre: tuple[float, float]) -> np.ndarray:
    points = []
    for name in ORDER:
        r0, velocity = cartesian(stars[name])
        points.append(project(r0 + velocity * years, centre))
    return np.array(points)


def draw_panel(draw: ImageDraw.ImageDraw, pts: np.ndarray, origin: tuple[float, float], scale: float, ink) -> None:
    xy = [(origin[0] + x * scale, origin[1] + y * scale) for x, y in pts]
    for i, j in EDGES:
        draw.line([xy[i], xy[j]], fill=ink, width=2)
    for x, y in xy:
        draw.ellipse([x - 6, y - 6, x + 6, y + 6], fill=ink)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    stars = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    ra0 = np.radians(np.mean([stars[n]["ra_deg"] for n in ORDER]))
    dec0 = np.radians(np.mean([stars[n]["dec_deg"] for n in ORDER]))
    epochs = [int(a) for a in sys.argv[3:]] or [0, 25_000, 50_000, 100_000]
    now = layout(stars, 0, (ra0, dec0))
    span = now[:, 0].max() - now[:, 0].min()
    panel_w, panel_h, scale = 620, 460, 15.0
    sheet = Image.new("RGB", (panel_w * len(epochs), panel_h), (11, 11, 13))
    draw = ImageDraw.Draw(sheet)
    for index, years in enumerate(epochs):
        pts = layout(stars, years, (ra0, dec0))
        origin = (index * panel_w + panel_w / 2, panel_h / 2)
        if years:
            draw_panel(draw, now, origin, scale, (70, 70, 76))  # сегодняшний ковш — бледным
        draw_panel(draw, pts, origin, scale, (236, 236, 232))
        shift = np.linalg.norm(pts - now, axis=1)
        print(f"+{years:>7} лет: сдвиг по звёздам, градусы:", " ".join(f"{n[:3]} {s:4.1f}" for n, s in zip(ORDER, shift)),
              f"| в долях ширины ковша: макс {shift.max() / span:.2f}")
    sheet.save(out)
    print("ширина ковша сегодня, градусы:", round(float(span), 1))


if __name__ == "__main__":
    main()
