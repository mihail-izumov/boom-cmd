#!/usr/bin/env python3
"""Генератор QR для ТВ-страницы «Твоя карта» (media/loyalty/).

Пишет loyalty-qr.js рядом с собой. Тот же приём, что у турбо-страницы
(boom-cmd-data/tools/build_turbo_qr.py): segno, ECC Q, рамка 2 модуля,
код вшит одним <path> — на панели на один запрос меньше, и картинка не
«поедет» при сбое сети.

⚠ Ссылки — ровно те, что в ТЗ. Метка ?from=loyalty-tv нужна счётчику
  b00m.fun (список SOURCES в .vitepress/analytics/boom-stat.js). Не менять
  и не «чистить»: без неё переходы с экрана придут с пустым источником.

Запуск:  pip install segno && python3 media/loyalty/build_loyalty_qr.py
"""
import io
import json
import pathlib
import re

import segno

LINKS = {
    'ohta':      'https://b00m.fun/karta/ohtamall?from=loyalty-tv',
    'piterland': 'https://b00m.fun/karta/piterland?from=loyalty-tv',
    'iyun':      'https://b00m.fun/karta/june?from=loyalty-tv',
}

out = {}
for park, url in LINKS.items():
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

HEAD = '''/* СГЕНЕРИРОВАНО media/loyalty/build_loyalty_qr.py — НЕ ПРАВИТЬ РУКАМИ.
 *
 * QR-коды на страницу «Твоя карта» (b00m.fun/karta/<парк>), по одному на парк.
 * Ключи — коды ?park= этой ТВ-страницы (ohta | piterland | iyun).
 *
 * ⚠ Рисовать ТОЛЬКО через stroke: путь состоит из штрихов, а не из
 *   прямоугольников. С `fill` получится пустой квадрат.
 *
 * ⚠ Метка ?from=loyalty-tv нужна счётчику b00m.fun — не менять и не «чистить».
 */
export const LOYALTY_QR = '''

target = pathlib.Path(__file__).with_name('loyalty-qr.js')
target.write_text(HEAD + json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('записано', target, {k: v['viewBox'] for k, v in out.items()})
