// Packs the Vite build into one self-contained HTML page for the shareable
// test link, which can't fetch files: the stylesheet and script are inlined
// and the binary assets (Zero's model, the market song) are embedded as
// base64 in window.__ASSETS (see src/engine/assets.ts).
//   npm run build && node tools/build-single.mjs dist/index.html out/game.html
import fs from 'fs';
import path from 'path';

const [src = 'dist/index.html', dst = 'dist/single.html'] = process.argv.slice(2);
const dir = path.dirname(src);
let html = fs.readFileSync(src, 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_, href) => {
  return `<style>${fs.readFileSync(path.join(dir, href), 'utf8')}</style>`;
});
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g, (_, s) => {
  const js = fs.readFileSync(path.join(dir, s), 'utf8').replace(/<\/script/g, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

const assets = Object.fromEntries(
  ['models/zero.glb', 'music/market.mp3'].map((p) => [p, fs.readFileSync(path.join(dir, p)).toString('base64')]),
);
html = html.replace('</head>', `<script>window.__ASSETS=${JSON.stringify(assets)}</script></head>`);

fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, html);
console.log(`wrote ${dst} (${(fs.statSync(dst).size / 1e6).toFixed(2)} MB)`);
