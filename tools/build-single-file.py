# Inline the Vite build (plus the Zero model and market song) into one HTML
# page, for hosts that only serve a single file. Usage:
#   npm run build && python3 tools/build-single-file.py dist out.html
import base64, glob, json, re, sys
d, out_path = sys.argv[1], sys.argv[2]
html = open(d + '/index.html').read()
css = open(glob.glob(d + '/assets/*.css')[0]).read()
js = open(glob.glob(d + '/assets/*.js')[0]).read()
assets = {p: base64.b64encode(open(d + '/' + p, 'rb').read()).decode() for p in ['models/zero.glb', 'music/market.mp3']}
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
body = re.sub(r'<script[^>]*></script>', '', body)
out = (f'<!doctype html><html><head><meta charset="UTF-8"><title>Mega Man Legends 3 Tech Demo</title><style>{css}</style></head>'
       f'<body>{body}<script>window.__ASSETS={json.dumps(assets)};</script><script type="module">{js}</script></body></html>')
open(out_path, 'w').write(out)
print(len(out))
