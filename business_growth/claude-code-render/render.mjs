#!/usr/bin/env node
/**
 * render.mjs — renders animation.html to an MP4 by capturing every frame.
 *
 * The animation is a deterministic, timeline-driven SVG. This script loads it
 * in headless Chromium, seeks to each frame, screenshots it, then stitches the
 * frames into an H.264 MP4 with ffmpeg.
 *
 * Usage:
 *   node render.mjs                       # 30 fps, 1x scale -> out.mp4
 *   node render.mjs --fps 60              # smoother
 *   node render.mjs --scale 2            # 2x resolution (2160x3840)
 *   node render.mjs --out reel.mp4        # custom output name
 *   node render.mjs --keep-frames         # don't delete the PNG frames
 *
 * Requirements: Node 18+, ffmpeg on PATH, and `npm install` (puppeteer).
 */

import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const hasFlag = (name) => args.includes('--' + name);

const FPS = parseInt(getArg('fps', '30'), 10);
const SCALE = parseFloat(getArg('scale', '1'));
const OUT = getArg('out', 'out.mp4');
const INPUT = getArg('input', 'animation.html');
const KEEP = hasFlag('keep-frames');
const SETTLE = parseInt(getArg('settle', '60'), 10); // ms to let React paint each frame

const inputPath = resolve(__dirname, INPUT);
const framesDir = join(__dirname, 'frames');
const outPath = resolve(__dirname, OUT);

if (!existsSync(inputPath)) {
  console.error(`✗ Cannot find ${INPUT} next to this script.`);
  process.exit(1);
}

// ── ffmpeg presence check ─────────────────────────────────────────────────────
function ffmpegExists() {
  return new Promise((res) => {
    const p = spawn('ffmpeg', ['-version']);
    p.on('error', () => res(false));
    p.on('close', (code) => res(code === 0));
  });
}

function runFfmpeg(fps, framesGlob, out) {
  return new Promise((res, rej) => {
    const a = [
      '-y',
      '-framerate', String(fps),
      '-i', framesGlob,
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      out,
    ];
    const p = spawn('ffmpeg', a, { stdio: 'inherit' });
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res() : rej(new Error('ffmpeg exit ' + code))));
  });
}

// ── main ───────────────────────────────────────────────────────────────────
(async () => {
  if (!(await ffmpegExists())) {
    console.error('✗ ffmpeg not found on PATH. Install it (e.g. `brew install ffmpeg`,');
    console.error('  `apt-get install ffmpeg`, or https://ffmpeg.org/download.html) and retry.');
    process.exit(1);
  }

  // fresh frames dir
  if (existsSync(framesDir)) rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  console.log('▶ Launching headless Chromium…');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage();

  // Load the self-contained animation. We size the viewport later once we know
  // the canvas's natural dimensions.
  page.on('console', (m) => {
    const t = m.text();
    if (/error/i.test(t)) console.log('  [page]', t);
  });

  const animUrl = process.env.ANIM_URL || pathToFileURL(inputPath).href;
  // Intercept CDN requests (React, ReactDOM, Babel) and serve locally cached copies
  await page.setRequestInterception(true);
  const fs = await import('node:fs');
  const cdnDir = join(__dirname, '.cdn-cache');
  const reactJs = fs.readFileSync(join(cdnDir, 'react.min.js'), 'utf8');
  const reactDomJs = fs.readFileSync(join(cdnDir, 'react-dom.min.js'), 'utf8');
  const babelJs = fs.readFileSync(join(cdnDir, 'babel.min.js'), 'utf8');
  const jsHeaders = { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' };
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('unpkg.com/react@') && !url.includes('react-dom')) {
      req.respond({ status: 200, headers: jsHeaders, body: reactJs });
    } else if (url.includes('unpkg.com/react-dom@')) {
      req.respond({ status: 200, headers: jsHeaders, body: reactDomJs });
    } else if (url.includes('unpkg.com/@babel/standalone')) {
      req.respond({ status: 200, headers: jsHeaders, body: babelJs });
    } else {
      req.continue();
    }
  });

  await page.goto(animUrl, { waitUntil: 'load' });

  // Wait for the deterministic canvas to mount (the bundle unpacks async).
  console.log('▶ Waiting for animation to mount…');
  await page.waitForSelector('svg[data-om-exportable-video-with-duration-secs]', { timeout: 90000 });

  // Read canvas size + duration, then neutralize on-screen scaling/chrome so the
  // capture is pixel-exact and the playback bar is hidden.
  const meta = await page.evaluate(() => {
    const svg = document.querySelector('svg[data-om-exportable-video-with-duration-secs]');
    const W = parseInt(svg.getAttribute('width'), 10);
    const H = parseInt(svg.getAttribute('height'), 10);
    const duration = parseFloat(svg.getAttribute('data-om-exportable-video-with-duration-secs'));
    // Pin the canvas to the top-left at natural size, above all other UI.
    svg.style.transform = 'none';
    svg.style.transformOrigin = 'top left';
    svg.style.position = 'fixed';
    svg.style.left = '0px';
    svg.style.top = '0px';
    svg.style.margin = '0';
    svg.style.zIndex = '2147483647';
    document.documentElement.style.background = '#000';
    document.body.style.background = '#000';
    return { W, H, duration };
  });

  const { W, H, duration } = meta;
  const totalFrames = Math.round(duration * FPS);
  console.log(`▶ Canvas ${W}x${H}, duration ${duration}s -> ${totalFrames} frames @ ${FPS}fps (scale ${SCALE}x)`);

  await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));

  // ── capture loop ─────────────────────────────────────────────────────────
  const pad = String(totalFrames).length;
  const t0 = Date.now();
  for (let i = 0; i < totalFrames; i++) {
    const t = i / FPS;
    await page.evaluate((time, frame) => {
      const svg = document.querySelector('svg[data-om-exportable-video-with-duration-secs]');
      svg.dispatchEvent(new CustomEvent('data-om-seek-to-time-frame', { detail: { time, frame } }));
      // let React commit, then settle on the next two animation frames
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, t, i);
    if (SETTLE) await new Promise((r) => setTimeout(r, SETTLE));

    await page.screenshot({
      path: join(framesDir, `f${String(i).padStart(pad, '0')}.png`),
      clip: { x: 0, y: 0, width: W, height: H },
      optimizeForSpeed: true,
    });

    if (i % 30 === 0 || i === totalFrames - 1) {
      const pct = (((i + 1) / totalFrames) * 100).toFixed(0);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      process.stdout.write(`\r  frame ${i + 1}/${totalFrames}  (${pct}%, ${elapsed}s) `);
    }
  }
  process.stdout.write('\n');

  await browser.close();

  // ── encode ─────────────────────────────────────────────────────────────────
  console.log('▶ Encoding MP4 with ffmpeg…');
  const glob = join(framesDir, `f%0${pad}d.png`);
  await runFfmpeg(FPS, glob, outPath);

  if (!KEEP) rmSync(framesDir, { recursive: true, force: true });

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n✓ Done in ${secs}s → ${OUT}`);
  console.log(`  ${W * SCALE}x${H * SCALE}, ${duration}s, ${FPS}fps, H.264`);
})().catch((err) => {
  console.error('\n✗ Render failed:', err);
  process.exit(1);
});
