// Rendu complet : node src/render.mjs [--scale 1] [--step 1] [--workers 4] [--frames dossier] [--from a --to b]
// Chaque « worker » est une page Chromium headless (WebGL logiciel) qui calcule des images indépendantes
// et les envoie en JPEG au serveur local ; ffmpeg assemble ensuite la séquence avec la bande-son.
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process';
import { startServer } from './server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const scale = parseFloat(arg('scale', '1')), step = parseInt(arg('step', '1'), 10), workers = parseInt(arg('workers', '4'), 10);
const framesDir = path.resolve(arg('frames', 'build/frames')), out = path.resolve(arg('out', 'out/tokyo-drift.mp4'));
const audio = path.resolve(arg('audio', 'build/audio.wav'));
const FPS = 30, TOTAL = 2025;
const from = parseInt(arg('from', '0'), 10), to = parseInt(arg('to', String(TOTAL)), 10);
fs.mkdirSync(framesDir, { recursive: true }); fs.mkdirSync(path.dirname(out), { recursive: true });
const name = (i) => path.join(framesDir, String(i / step).padStart(5, '0') + '.jpg');
const queue = []; for (let i = from; i < to; i += step) if (!fs.existsSync(name(i))) queue.push(i);
console.log(`${queue.length} images à calculer (échelle ${scale}, pas ${step}, ${workers} workers)`);
const { srv, port } = await startServer(process.cwd(), async (i, buf) => { await fs.promises.writeFile(name(i) + '.tmp', buf); await fs.promises.rename(name(i) + '.tmp', name(i)); });
let done = 0; const t0 = Date.now(); const totalJobs = queue.length;
if (totalJobs) {
  await Promise.all(Array.from({ length: workers }, async () => {
    // un navigateur par worker : chacun a son propre processus GPU (sinon les rendus se sérialisent)
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 400)));
    await page.goto(`http://127.0.0.1:${port}/src/index.html?scale=${scale}`);
    await page.waitForFunction('window.ready', null, { timeout: 180000 });
    while (queue.length) {
      // lots contigus : limite les recalculs de carte d'environnement entre plans
      const batch = queue.splice(0, 12);
      for (const i of batch) await page.evaluate((i) => window.postFrame(i, 0.93), i);
      done += batch.length;
      if (done % 60 < 12) { const el = (Date.now() - t0) / 1000; console.log(`${done}/${totalJobs}  ${(el / done).toFixed(2)} s/image  reste ~${((totalJobs - done) * el / done / 60).toFixed(1)} min`); }
    }
    await browser.close();
  }));
}
srv.close();
if (to - from < TOTAL) process.exit(0);
const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS / step), '-i', path.join(framesDir, '%05d.jpg')];
if (fs.existsSync(audio)) args.push('-i', audio);
args.push('-vf', `scale=1080:1920:flags=lanczos,fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', arg('crf', '21'), '-maxrate', '7M', '-bufsize', '14M',
  '-profile:v', 'high', '-level', '4.2', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart');
if (fs.existsSync(audio)) args.push('-af', 'volume=-1.5dB', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest');
args.push(out);
const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
console.log(r.status === 0 ? `Vidéo écrite : ${out}` : 'Échec ffmpeg');
