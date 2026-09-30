#!/usr/bin/env python3
"""Вырезка элементов карты для ТВ-экрана «Твоя карта» (media/loyalty/).

Источник — реальный макет «Новая игровая карта», вариант 1 (лайм):
public/materials/new-game-card_v2.jpg. Пишет img/card-<элемент>.webp —
каждый элемент лицевой стороны отдельно, с прозрачным фоном.

⚠ Не резать макет полосами: полоса несёт кусок фона и режет элементы
  пополам (v5.1). Фон карты однотонный — прозрачность считается по
  расстоянию до цвета фона.

⚠ Лайм макета (#e6fe60) перекрашивается в лайм экрана (--lime, #c6f52e),
  чтобы карта и тексты страницы были одним цветом. Поменяли --lime в
  index.html — поменяй TARGET_LIME здесь и перезапусти.

Координаты элементов — в пикселях вырезки карты 486×775; они же
переведены в em в CSS (.card .e-*, 27em = 486px).

Запуск:  pip install pillow numpy && python3 media/loyalty/build_card_layers.py
"""
import pathlib

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'public/materials/new-game-card_v2.jpg'
OUT = pathlib.Path(__file__).with_name('img')

CARD_BOX = (270, 763, 756, 1538)            # лицевая сторона варианта 1 в макете
BG = np.array([59, 68, 111.])               # фон карты в макете
SRC_LIME = np.array([230, 254, 96.])        # лайм макета (медиана)
TARGET_LIME = np.array([198, 245, 46.])     # --lime экрана, #c6f52e

ELEMENTS = {                                 # x, y, w, h — в пикселях вырезки
    'tab':   (135, 0, 218, 97),              # «Играть»
    'name':  (24, 114, 438, 75),             # БУМБАСТИК
    'site':  (25, 199, 442, 101),            # табло B00M.FUN
    'boom':  (27, 304, 438, 131),            # БООМ!
    'smart': (25, 448, 439, 68),             # «Это умная карта»
    'num':   (51, 527, 54, 201),             # номер карты
    'f1':    (130, 527, 338, 105),           # «Копит заряды»
    'f2':    (130, 630, 338, 98),            # «Начисляет бонусы»
}


def recolor_lime(rgb):
    """Лаймовые пиксели → лайм экрана, с сохранением яркости сглаживания."""
    lime_ness = np.clip((rgb[..., 1] - rgb[..., 2] - 70) / 90, 0, 1)[..., None]
    scale = np.clip(rgb[..., 1:2] / SRC_LIME[1], 0, 1.1)
    return rgb * (1 - lime_ness) + TARGET_LIME * scale * lime_ness


card = np.array(Image.open(SRC).convert('RGB').crop(CARD_BOX)).astype(float)
OUT.mkdir(exist_ok=True)
for key, (x, y, w, h) in ELEMENTS.items():
    reg = card[y:y + h, x:x + w]
    edge = np.concatenate([reg[0], reg[-1], reg[:, 0], reg[:, -1]])
    local_bg = BG if key == 'tab' else np.median(edge, axis=0)
    alpha = np.clip((np.abs(reg - local_bg).sum(2) - 18) / 70, 0, 1)
    a = np.maximum(alpha[..., None], 0.01)
    rgb = np.where(alpha[..., None] > 0.01, local_bg + (reg - local_bg) / a, reg)
    rgb = recolor_lime(np.clip(rgb, 0, 255))
    img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype('uint8'), 'RGBA')
    img.save(OUT / f'card-{key}.webp', quality=94)
    print('записано', OUT / f'card-{key}.webp')
