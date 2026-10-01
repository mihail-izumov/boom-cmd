#!/usr/bin/env python3
"""Генератор QR для ТВ-экрана у кассы «Пополни карту» (media/kassa/).

Пишет kassa-qr.js рядом с собой. Тот же приём, что у «Твоей карты»
(media/loyalty/build_loyalty_qr.py) и турбо: segno, ECC Q, рамка 2 модуля,
код вшит одним <path> — на панели на один запрос меньше, и картинка не
«поедет» при сбое сети.

Адреса НЕ вписаны руками: правило построения ссылки — здесь, а слаг парка
берётся из kassa.data.json (поле slug). Так страница сайта и QR не могут
разойтись по опечатке.

⚠ Метка ?from=kassa-tv нужна счётчику b00m.fun (список SOURCES в
  boom-fun/.vitepress/analytics/boom-stat.js). Не менять и не «чистить»:
  без неё переходы с экрана придут с пустым источником.

Запуск:  pip install segno && python3 media/kassa/build_kassa_qr.py
"""
import io
import json
import pathlib
import re

import segno

HERE = pathlib.Path(__file__).parent
DATA = json.loads((HERE / 'kassa.data.json').read_text(encoding='utf-8'))

# Единственное правило ссылки экрана у кассы.
URL = 'https://b00m.fun/popolnit/{slug}?from=kassa-tv'

out = {}
for park in DATA['park_order']:
    url = URL.format(slug=DATA['parks'][park]['slug'])
    qr = segno.make(url, error='q', micro=False)
    buf = io.BytesIO()
    qr.save(buf, kind='svg', border=2, xmldecl=False, nl=False)
    svg = buf.getvalue().decode()
    vb = re.search(r'viewBox="([^"]+)"', svg)
    w = re.search(r'width="(\d+)"', svg).group(1)
    h = re.search(r'height="(\d+)"', svg).group(1)
    d = re.search(r' d="([^"]+)"', svg).group(1)
    out[park] = {
        'url': url,
        'viewBox': vb.group(1) if vb else f'0 0 {w} {h}',
        'd': d,
    }

HEAD = '''/* СГЕНЕРИРОВАНО media/kassa/build_kassa_qr.py — НЕ ПРАВИТЬ РУКАМИ.
 *
 * QR-коды на страницу «Пополнить карту» (b00m.fun/popolnit/<парк>), по
 * одному на парк. Ключи — коды ?park= этой ТВ-страницы (ohta | piterland |
 * iyun), слаги сайта — из kassa.data.json.
 *
 * ⚠ Рисовать ТОЛЬКО через stroke: путь состоит из штрихов, а не из
 *   прямоугольников. С `fill` получится пустой квадрат.
 *
 * ⚠ Метка ?from=kassa-tv нужна счётчику b00m.fun — не менять и не «чистить».
 */
export const KASSA_QR = '''

target = HERE / 'kassa-qr.js'
target.write_text(HEAD + json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('записано', target, {k: (v['url'], v['viewBox']) for k, v in out.items()})
