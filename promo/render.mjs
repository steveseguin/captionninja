#!/usr/bin/env node
// Renders promo/index.html into caption-ninja-promo.mp4, frame by frame.
//
//   node promo/render.mjs [--workers 3] [--from 0] [--to 114] [--crf 20] [--skip-audio]
//   node promo/render.mjs --teaser-only      (re-cut the 30 s teaser from an existing full render)
//
// Needs: Node 18+, Playwright with Chromium (npm i -g playwright && npx playwright install chromium),
// ffmpeg with libx264 (or set FFMPEG=/path/to/ffmpeg), and python3 with numpy + scipy for the soundtrack.
// Outputs next to this file: caption-ninja-promo.mp4, caption-ninja-teaser-30s.mp4, soundtrack.mp3 (used by the
// live page) and poster.jpg.

import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// use a local install if there is one, otherwise the global one from `npm install -g playwright`
function loadPlaywright() {
  try { return require('playwright'); } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}
const { chromium } = loadPlaywright();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const PYTHON = process.env.PYTHON || 'python3';
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const flag = name => process.argv.includes('--' + name);

const WORKERS = parseInt(arg('workers', '3'), 10);
const CRF = arg('crf', '20');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-promo-'));
const OUT = path.join(HERE, 'caption-ninja-promo.mp4');
const TEASER = path.join(HERE, 'caption-ninja-teaser-30s.mp4');

function run(cmd, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)));
    if (input) input(p.stdin);
  });
}

// 30-second social cut: the opening (hook, logo, audience) spliced onto the call to action.
// Both cut points sit at the same position within a beat, so the music stays on the grid.
async function cutTeaser() {
  const a = 22, b = 106;
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', OUT, '-filter_complex',
    `[0:v]trim=0:${a},setpts=PTS-STARTPTS[v0];[0:v]trim=start=${b},setpts=PTS-STARTPTS[v1];` +
    `[0:a]atrim=0:${a},asetpts=PTS-STARTPTS,afade=t=out:st=${(a - 0.012).toFixed(3)}:d=0.012[a0];[0:a]atrim=start=${b},asetpts=PTS-STARTPTS,afade=t=in:d=0.012[a1];` +
    `[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]`,
    '-map', '[v]', '-map', '[a]', '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', TEASER]);
  console.log(`teaser -> ${TEASER}`);
}
if (flag('teaser-only')) { await cutTeaser(); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(0); }

// minimal static server for the repo, so fonts and relative assets load exactly as on the site
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/promo/index.html?render=1`;

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.evaluate(() => window.__ready);
  return page;
}

const browser = await chromium.launch();
const probe = await openPage(browser);
const { fps, duration, cues } = await probe.evaluate(() => ({ fps: window.__fps, duration: window.__duration, cues: window.__sfx.slice().sort((a, b) => a[0] - b[0]) }));
const from = parseFloat(arg('from', '0')), to = Math.min(duration, parseFloat(arg('to', String(duration))));
const first = Math.round(from * fps), last = Math.round(to * fps); // [first, last)
const FULL = from === 0 && to === duration;
// partial renders are previews: keep them out of the repo so they never replace the finished video
const DEST = FULL ? OUT : path.join(os.tmpdir(), `caption-ninja-preview-${from}-${to}.mp4`);
console.log(`rendering frames ${first}..${last - 1} at ${fps} fps with ${WORKERS} workers -> ${TMP}`);

// poster frame (logo + badges)
await probe.evaluate(t => window.__seek(t), 13.4);
fs.writeFileSync(path.join(HERE, 'poster.jpg'), await probe.screenshot({ type: 'jpeg', quality: 90 }));
await probe.close();

// soundtrack
const wav = path.join(TMP, 'soundtrack.wav');
if (!flag('skip-audio')) {
  fs.writeFileSync(path.join(TMP, 'cues.json'), JSON.stringify(cues));
  await run(PYTHON, [path.join(HERE, 'soundtrack.py'), path.join(TMP, 'cues.json'), wav]);
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', path.join(HERE, 'soundtrack.mp3')]);
}

// frames: each worker renders a contiguous chunk into its own H.264 segment
const X264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-tune', 'animation', '-g', String(fps * 2),
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const total = last - first, per = Math.ceil(total / WORKERS);
let done = 0;
const t0 = Date.now();
const segments = [];
await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
  const a = first + w * per, b = Math.min(last, a + per);
  if (a >= b) return;
  const seg = path.join(TMP, `seg${w}.mp4`); segments[w] = seg;
  const page = await openPage(browser);
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...X264, seg], {
    input: async stdin => {
      for (let f = a; f < b; f++) {
        await page.evaluate(t => window.__seek(t), f / fps);
        // JPEG at q97 is visually lossless here and ~5x faster to capture than PNG
        const img = await page.screenshot({ type: 'jpeg', quality: 97 });
        if (!stdin.write(img)) await new Promise(r => stdin.once('drain', r));
        if (++done % 150 === 0) { const s = (Date.now() - t0) / 1000; console.log(`${done}/${total} frames, ${(done / s).toFixed(1)} fps, ~${Math.round((total - done) / (done / s))}s left`); }
      }
      stdin.end();
    },
  });
  await page.close();
}));
await browser.close();
server.close();

// join segments and add the soundtrack
const list = path.join(TMP, 'segments.txt');
fs.writeFileSync(list, segments.filter(Boolean).map(s => `file '${s}'`).join('\n'));
const audioIn = flag('skip-audio') ? [] : ['-ss', String(from), '-t', String(to - from), '-i', wav];
await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, ...audioIn,
  '-map', '0:v', ...(audioIn.length ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '192k'] : []), '-c:v', 'copy', '-movflags', '+faststart', '-shortest', DEST]);
fs.rmSync(TMP, { recursive: true, force: true });
if (FULL && !flag('skip-audio')) await cutTeaser();
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s -> ${DEST}`);
