#!/usr/bin/env python3
"""Build the AI Tool Pre-Adoption Check.
Source: tool-check.src.html (page body, with a /*FONTS*/ marker).
Fonts: the subset @font-face rules embedded in index.html (the 4Cs course), so the page makes no third-party requests.
Outputs: aisg-tool-check.html (standalone page for the Netlify site) and, with --artifact OUT, a body-only copy."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'tool-check.src.html').read_text(encoding='utf-8')
faces = re.findall(r'@font-face\{[^}]+\}', (root / 'index.html').read_text(encoding='utf-8'))
assert len(faces) == 2, 'expected the two embedded AISG font faces in index.html'
body = src.replace('/*FONTS*/', '\n'.join(faces), 1)
head, rest = body.split('<header', 1)
page = ('<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + '</head>\n<body>\n<header' + rest + '\n</body>\n</html>\n')
(root / 'aisg-tool-check.html').write_text(page, encoding='utf-8')
if '--artifact' in sys.argv:
    pathlib.Path(sys.argv[sys.argv.index('--artifact') + 1]).write_text(body, encoding='utf-8')
print('built', len(page), 'bytes')
