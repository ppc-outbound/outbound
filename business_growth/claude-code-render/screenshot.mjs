import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';

const reactJs = readFileSync('.cdn-cache/react.min.js', 'utf8');
const reactDomJs = readFileSync('.cdn-cache/react-dom.min.js', 'utf8');
const babelJs = readFileSync('.cdn-cache/babel.min.js', 'utf8');

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920 });

await page.setRequestInterception(true);
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

page.on('console', async (m) => {
  if (m.type() === 'error') console.log('[err]', m.text());
});

await page.goto('http://localhost:8765/animation.html', { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('svg[data-om-exportable-video-with-duration-secs]', { timeout: 30000 });
await new Promise(r => setTimeout(r, 4000));

for (const t of [0, 2, 5, 10, 20]) {
  await page.evaluate((time) => {
    const el = document.querySelector('svg[data-om-exportable-video-with-duration-secs]');
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;margin:0';
    el.dispatchEvent(new CustomEvent('data-om-seek-to-time-frame', { detail: { time, frame: Math.round(time*30) } }));
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: `/tmp/frame_t${t}.png`, clip: { x: 0, y: 0, width: 1080, height: 400 } });
  console.log(`Screenshot at t=${t}s saved`);
}

await browser.close();
