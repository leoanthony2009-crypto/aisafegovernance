#!/usr/bin/env python3
"""Build the Report Remove staff quick reference.
Inlines briefing.js into briefing.src.html and writes the script's SHA-256 into the CSP.
Usage: python3 tools/report-remove/build.py OUT.html
Regenerate after any change to briefing.js, or the CSP will block the editor."""
import base64, hashlib, pathlib, sys
here = pathlib.Path(__file__).parent
src = (here / 'briefing.src.html').read_text(encoding='utf-8')
js = (here / 'briefing.js').read_text(encoding='utf-8')
h = base64.b64encode(hashlib.sha256(js.encode('utf-8')).digest()).decode()
out = src.replace('__SCRIPT_HASH__', h).replace('<script>__SCRIPT__</script>',
      '<!-- Editor script. After changing it, rebuild with tools/report-remove/build.py so the CSP hash matches. -->\n<script>' + js + '</script>')
assert '__SCRIPT' not in out
dest = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else here / 'briefing.html')
dest.write_text(out, encoding='utf-8')
print(dest, len(out), 'bytes; sha256-' + h)
