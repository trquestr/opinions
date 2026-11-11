"""Постобработка черновиков генерации: чистый белый фон, оттенки серого, уровни.

Запуск из папки output/imagegen:  python postprocess.py
Исходники не меняются, результат пишется в final/ с той же структурой сцен.

Что делается с каждой картинкой:
  1. Перевод в оттенки серого — у черновиков слабый цветной оттенок (до 32 единиц между каналами).
  2. Уровни: out = (g - black) / (WHITE - black). Белая точка WHITE одна на все файлы: фон черновиков
     не #FFFFFF, а около 253 с лёгкой текстурой, после растяжения он становится ровно 255.
     Чёрная точка black по умолчанию 0; для бледных картинок она поднята, чтобы штрих не терялся
     при инверсии на ночном небе.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).parent
OUT = ROOT / "final"
WHITE = 245

# Имя файла -> чёрная точка. Значения подобраны по листу night-preview/night-levels-test.png.
BLACK_POINT = {
    "scene-01/clouds-drift-wide.png": 0,
    "scene-02/figure-bear.png": 0,
    "scene-02/figure-plough.png": 0,
    "scene-02/figure-chariot.png": 0,
    "scene-02/figure-procession.png": 0,
    "scene-02/detail-pine-branch.png": 0,
    "scene-02/detail-ionic-capital.png": 0,
    "scene-02/detail-dune.png": 0,
    "scene-02/detail-crescent.png": 0,
    "scene-02/detail-lantern.png": 0,
    "scene-02/detail-furrow.png": 140,  # самая бледная: без подъёма в инверсии почти не видна
    "scene-02/detail-wheat.png": 0,
    "scene-02/detail-wheel.png": 0,
    "scene-02/detail-xiangyun.png": 0,
    "scene-02/sky-armillary.png": 0,
    "scene-02/sky-astrolabe.png": 0,
    "scene-02/sky-comet.png": 0,
    "scene-02/sky-atlas-fragment.png": 120,  # тонкий штрих и тон бумаги
    "scene-04/clouds-from-above.png": 0,
    "scene-05/hourglass-upright.png": 8,  # подтянуть тени к лежащим часам из Figma (p5: 25 -> 17)
}


def apply_levels(gray: np.ndarray, black: int) -> np.ndarray:
    stretched = (gray.astype(np.float32) - black) / (WHITE - black)
    return (np.clip(stretched, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def process(relative: str, black: int) -> str:
    gray = np.asarray(Image.open(ROOT / relative).convert("L"))
    result = apply_levels(gray, black)
    target = OUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(result, "L").save(target, optimize=True)
    border = np.concatenate([result[0], result[-1], result[:, 0], result[:, -1]])
    white_share = float((result == 255).mean())
    return (
        f"{relative:42} {result.shape[1]}x{result.shape[0]}  "
        f"край мин {int(border.min()):3}  белого {white_share:.2f}  чёрного {float((result == 0).mean()):.3f}"
    )


if __name__ == "__main__":
    # Консоль Windows по умолчанию не в UTF-8 — без этого русские подписи в отчёте превращаются в мусор
    sys.stdout.reconfigure(encoding="utf-8")
    for name, black_point in BLACK_POINT.items():
        print(process(name, black_point))
