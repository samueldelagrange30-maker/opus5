// Aperçus : node src/preview.mjs <dossier> <scale> t1 t2 ...
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
import { startServer } from './server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [dir, scale, ...times] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const { srv, port } = await startServer(process.cwd(), async () => {});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 600)));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/src/index.html?scale=${scale}&sub=${process.env.SUB || 1}&msaa=${process.env.MSAA || 4}`);
await page.waitForFunction('window.ready', null, { timeout: 120000 });
console.log('init', Date.now() - t0, 'ms');
for (const t of times) {
  const t1 = Date.now();
  const b64 = await page.evaluate(async (t) => { const b = await window.frameBlob(Math.round(t * 30), 0.9); const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); return btoa(s); }, parseFloat(t));
  fs.writeFileSync(path.join(dir, `t${String(t).padStart(5, '0')}.jpg`), Buffer.from(b64, 'base64'));
  console.log('t', t, Date.now() - t1, 'ms');
}
await browser.close(); srv.close();
