#!/usr/bin/env python3
"""Слои карты для ТВ-экрана «Твоя карта» (media/loyalty/).

Источник — векторный макет лицевой стороны карты от владельца (01.10):
card-src/card-front.svg (вертикальная карта 674×1063, оранжевый акцент).
Пишет img/card-<слой>.svg — каждый элемент лицевой стороны отдельным
векторным файлом во весь холст карты (674×1063, прозрачный фон), поэтому
в CSS все слои просто накладываются друг на друга (inset:0) — координаты
переносить не нужно.

⚠ Оранжевый акцент макета (#f37121) перекрашивается в лайм экрана
  (--lime, #c6f52e). Поменяли --lime в index.html — поменяй TARGET_LIME.
⚠ Фон карты (#2c2a6c) слоем не выпускается — это фон .card в CSS.

Запуск:  python3 media/loyalty/build_card_layers.py
"""
import pathlib
import re

HERE = pathlib.Path(__file__).parent
SRC = HERE / 'card-src/card-front.svg'
OUT = HERE / 'img'
SRC_ORANGE = 'rgb(243,113,33)'
TARGET_LIME = 'rgb(198,245,46)'

# Слой → номера групп верхнего уровня внутри обрезки карты (по порядку в
# файле макета). 0 — фон, он не слой.
LAYERS = {
    'tab':   [5, 10],   # полукруг + «ИГРАТЬ»
    'name':  [6],       # БУМБАСТИК
    'boom':  [7],       # логотип БООМ!
    'smart': [8],       # «Это умная карта»
    'num':   [9],       # номер карты
    'f1':    [4, 2],    # стрелка + «Майнит тикеты»
    'f2':    [3, 1],    # стрелка + «Бустит заряды»
}

s = SRC.read_text(encoding='utf-8')
a = s.index('<g clip-path="url(#_clip1)">')
inner = s.index('<g>', a) + 3
tok = re.compile(r'<(/?)(g|clipPath)\b[^>]*?(/?)>')
depth, kids, start, end_inner = 0, [], None, None
for m in tok.finditer(s, inner):
    close, _, selfc = m.groups()
    if selfc:
        continue
    if not close:
        if depth == 0:
            start = m.start()
        depth += 1
    else:
        depth -= 1
        if depth == 0:
            kids.append(s[start:m.end()])
        if depth < 0:
            end_inner = m.start()
            break
pre, post = s[:inner], s[end_inner:]
pre = re.sub(r'<\?xml[^>]*>|<!DOCTYPE[^>]*>', '', pre).replace('width="100%" height="100%"', 'width="674" height="1063"')

OUT.mkdir(exist_ok=True)
for name, idx in LAYERS.items():
    svg = (pre + ''.join(kids[i] for i in idx) + post).replace(SRC_ORANGE, TARGET_LIME)
    (OUT / f'card-{name}.svg').write_text(svg.strip() + '\n', encoding='utf-8')
    print('записано', OUT / f'card-{name}.svg')
