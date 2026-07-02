# Outbound Click — Animated Meta Ad → MP4

This folder renders the **Outbound Click** vertical (9:16) animated ad to an MP4 file.
Hand this whole folder to Claude Code and ask it to "render the video"; the steps below
are everything it needs.

---

## TL;DR for Claude Code

```bash
cd claude_code_mp4
npm install            # installs playwright (uses its bundled Chromium)
node render-video.mjs  # -> outbound-click-ad.mp4
```

Requirements on the machine: **Node 18+** and **ffmpeg** on the PATH
(`brew install ffmpeg` / `apt-get install ffmpeg` / https://ffmpeg.org/download.html).

Output: `outbound-click-ad.mp4` — 1080×1920, ~33s, H.264 (yuv420p, faststart),
ready for Meta (Reels/Stories), TikTok, YouTube Shorts.

---

## What's in here

| File | Purpose |
|------|---------|
| `render.html` | The animation mounted at native 1080×1920 with **no** playback UI — a clean render surface. Loads React, Babel, and Montserrat from local vendored files (no CDN) and the animation source. |
| `OutboundAd.jsx` | The full animation: timeline engine + all six scenes. Exposes `window.mountOutboundRender()`, `window.__seekFrame(t)`, and `window.OutboundAdMeta`. |
| `render-video.mjs` | Headless runner. Serves this folder over a local HTTP server (required so `render.html` can load its scripts without hitting `file://` CORS restrictions), steps frame-by-frame, screenshots each frame, encodes with ffmpeg. |
| `package.json` | Declares the `playwright` dependency. |
| `react.production.min.js`, `react-dom.production.min.js`, `babel.min.js` | Vendored copies of React 18 / Babel standalone so the render is fully offline and deterministic. |
| `montserrat.css`, `fonts/*.woff2` | Vendored Montserrat webfont (variable font, weights 500–900) so the render doesn't depend on Google Fonts at render time. |
| `logo-white.png`, `logo-blue.png` | Brand logos used by the final CTA scene. Keep them next to `render.html`. |

## How the render works (frame-stepping, not screen-recording)

The animation is a **pure function of time** — every visual is derived from a single
`time` value. The runner therefore does NOT screen-record in realtime (which can drop
frames). Instead it:

1. Launches headless Chromium at a 1080×1920 viewport.
2. Loads `render.html`, waits for `window.__renderReady` and `document.fonts.ready`.
3. For each frame `f`, calls `window.__seekFrame(f / fps)`, waits two animation
   frames so React commits and the browser paints, then screenshots a PNG.
4. Pipes the PNG sequence to `ffmpeg` → H.264 MP4.

This yields a frame-accurate, deterministic export every time.

## Options

```bash
node render-video.mjs --fps 60            # smoother motion, larger file (default 30)
node render-video.mjs --out promo.mp4     # custom output filename
```

The duration and dimensions come from `window.OutboundAdMeta` inside `OutboundAd.jsx`
(`{ width: 1080, height: 1920, duration: 33, fps: 30 }`) — no need to pass them.

## Editing the ad before rendering

All copy, colors, timing, and scenes live in `OutboundAd.jsx`:

- **Brand colors** — constants near the top: `NAVY #182033`, `BLUE #0f59fc`, `WHITE #ffffff`.
- **Fonts** — `HEAD` = Montserrat (headlines), `BODY` = Helvetica (body).
- **Scene timing** — the `S` object maps each scene to its `[start, end]` in seconds.
  If you change total length, update `DURATION` (and `OutboundAdMeta.duration` follows it).
- **Copy** — each `*Scene` function holds its own text (e.g. `HookScene`, `CtaScene`).
- **The lead-flow chart** — `LeadChart` morphs from erratic (`CHAOS`) to steady (`STEADY`).

Re-run `node render-video.mjs` after any edit. To preview interactively, open the
original `Outbound Click Ad.dc.html` (the version with play/scrub controls) in the design tool.

## Offline / locked-down environments

`render.html` is fully offline already: React, Babel, and Montserrat are vendored
locally (see the file table above), and `render-video.mjs` serves the folder over
`http://127.0.0.1` itself, so no internet access or CDN is required to render.

## Troubleshooting

- **`ffmpeg not found`** — install ffmpeg and ensure it's on PATH.
- **Chromium fails to launch / sandbox error** — already passing `--no-sandbox`; on
  CI you may also need the system libs Chromium depends on (`apt-get install -y
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2`).
- **Blank/black frames** — make sure `logo-white.png` sits next to `render.html`.

---

### Specs
- **Resolution:** 1080×1920 (9:16)
- **Duration:** ~33s · **Default fps:** 30
- **Codec:** H.264 / yuv420p, CRF 18, `+faststart`
- **Brand:** Outbound Click — #0f59fc / #ffffff / #182033 · Montserrat + Helvetica
