#!/usr/bin/env node
/**
 * render-video.mjs — Render "Outbound Click Ad" to an MP4.
 *
 * Strategy: deterministic frame-stepping. The animation is a pure function of
 * time, so we seek to each frame, screenshot it at native 1080x1920, and hand
 * the PNG sequence to ffmpeg. This is frame-accurate (no realtime dropped
 * frames) and produces a clean export with no playback UI.
 *
 * Usage:
 *   npm install
 *   node render-video.mjs                 # -> outbound-click-ad.mp4 (30fps)
 *   node render-video.mjs --fps 60        # smoother, larger file
 *   node render-video.mjs --out promo.mp4 # custom filename
 *
 * Requires: Node 18+, ffmpeg on PATH (https://ffmpeg.org/download.html).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { existsSync, createReadStream } from 'node:fs';
import http from 'node:http';

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const FPS = parseInt(getArg('fps', '30'), 10);
const OUT = resolve(getArg('out', 'outbound-click-ad.mp4'));
const ROOT = resolve('.');
const HTML = resolve('render.html');

if (!existsSync(HTML)) {
  console.error('✗ render.html not found. Run this from inside the claude_code_mp4 folder.');
  process.exit(1);
}

// ── static file server ──────────────────────────────────────────────────────
// A real HTTP origin is required: file:// pages can't load crossorigin
// <script> tags or XHR the .jsx source (both hit CORS under file:// origin).
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.jsx': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
function startServer() {
  return new Promise((res) => {
    const server = http.createServer((req, r) => {
      const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !existsSync(p)) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
      createReadStream(p).pipe(r);
    });
    server.listen(0, '127.0.0.1', () => res(server));
  });
}

function hasFfmpeg() {
  return new Promise((res) => {
    const p = spawn('ffmpeg', ['-version']);
    p.on('error', () => res(false));
    p.on('exit', (code) => res(code === 0));
  });
}

async function main() {
  if (!(await hasFfmpeg())) {
    console.error('✗ ffmpeg not found on PATH. Install it: https://ffmpeg.org/download.html');
    process.exit(1);
  }

  const frameDir = await mkdtemp(join(tmpdir(), 'oc-frames-'));
  const server = await startServer();
  const port = server.address().port;

  console.log('• Launching headless Chromium…');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
  });
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [page error]', m.text()); });
  page.on('pageerror', (e) => console.log('  [page error]', e.message));

  console.log('• Loading render harness…');
  await page.goto(`http://127.0.0.1:${port}/render.html`, { waitUntil: 'load' });

  // Wait until the harness has mounted and exposed its seek hook.
  await page.waitForFunction('window.__renderReady === true && window.OutboundAdMeta', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);

  const meta = await page.evaluate(() => window.OutboundAdMeta);
  const DURATION = meta.duration;          // seconds
  const totalFrames = Math.round(DURATION * FPS);
  console.log(`• Duration ${DURATION}s · ${FPS}fps · ${totalFrames} frames @ ${meta.width}×${meta.height}`);

  for (let f = 0; f < totalFrames; f++) {
    const t = f / FPS;
    await page.evaluate((time) => {
      window.__seekFrame(time);
      // resolve after two RAFs so React has committed + the browser painted
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, t);
    const name = String(f).padStart(5, '0') + '.png';
    await page.screenshot({ path: join(frameDir, name), type: 'png' });
    if (f % 30 === 0 || f === totalFrames - 1) {
      process.stdout.write(`\r  captured ${f + 1}/${totalFrames} frames`);
    }
  }
  process.stdout.write('\n');
  await browser.close();
  server.close();

  console.log('• Encoding MP4 with ffmpeg…');
  await new Promise((res, reject) => {
    const ff = spawn('ffmpeg', [
      '-y',
      '-framerate', String(FPS),
      '-i', join(frameDir, '%05d.png'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'high',
      '-crf', '18',
      '-movflags', '+faststart',
      OUT,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    ff.on('error', reject);
    ff.on('exit', (code) => (code === 0 ? res() : reject(new Error('ffmpeg exited ' + code))));
  });

  await rm(frameDir, { recursive: true, force: true });
  console.log(`\n✓ Done → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
