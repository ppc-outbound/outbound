# Business Growth Stages → MP4

A self-contained animation (9:16 vertical, ~44s) plus a script that renders it to an MP4.
Hand this whole folder to Claude Code and say: **"render the animation to MP4."**

---

## TL;DR

```bash
cd claude-code-render
npm install          # installs puppeteer (downloads a headless Chromium)
node render.mjs      # → out.mp4
```

You also need **ffmpeg** on your PATH:
- macOS: `brew install ffmpeg`
- Debian/Ubuntu: `sudo apt-get install ffmpeg`
- Windows: https://ffmpeg.org/download.html (or `winget install ffmpeg`)

That's it. `out.mp4` lands in this folder.

---

## What's in here

| File | What it is |
|------|------------|
| `animation.html` | The entire animation, fully self-contained (no internet needed). Open it in any browser to preview — it autoplays, and you can scrub with the timeline bar or ← / → / space. |
| `render.mjs` | Headless renderer. Loads `animation.html`, seeks every frame, screenshots it, and stitches the frames into an MP4 with ffmpeg. |
| `package.json` | Declares the one dependency (puppeteer). |

## How it works (so you can tweak it)

The animation is **deterministic and timeline-driven** — every visual is a pure function of one number, the playhead time. The renderer drives that playhead frame by frame instead of relying on wall-clock playback, so the output is frame-accurate and reproducible:

1. Launch headless Chromium via Puppeteer.
2. Load `animation.html` and wait for the canvas (`svg[data-om-exportable-video-with-duration-secs]`) to mount.
3. Read the canvas's natural size (1080×1920) and total duration straight off that element.
4. For each frame, dispatch a `data-om-seek-to-time-frame` event to set the exact timestamp, let it paint, and screenshot.
5. Pipe the PNG frames through ffmpeg → H.264 MP4 (`yuv420p`, `+faststart`, CRF 18).

## Options

```bash
node render.mjs --fps 60          # frame rate (default 30)
node render.mjs --scale 2         # 2× resolution → 2160×3840 (default 1 → 1080×1920)
node render.mjs --out reel.mp4    # output filename (default out.mp4)
node render.mjs --settle 100      # ms to wait per frame before capture (default 60; raise if a frame looks half-painted)
node render.mjs --keep-frames     # keep the intermediate PNGs in ./frames
npm run render:hq                 # shortcut for --fps 60 --scale 2
```

## Notes & troubleshooting

- **Render time:** capturing ~1,300 frames (44s @ 30fps) takes a few minutes — it's screenshotting a real browser, not playing in real time. Higher `--fps`/`--scale` take longer.
- **Output:** default is 1080×1920, 30fps, H.264 — drops straight into Reels / TikTok / Shorts.
- **Audio:** none. The piece is visual-only; add a music bed in your editor if you want one.
- **Blank/black output?** Increase `--settle` (e.g. `--settle 150`) so each frame has time to paint, and make sure `animation.html` opens correctly in a normal browser first.
- **Puppeteer can't find Chromium / sandbox errors on Linux:** the script already passes `--no-sandbox`. In a locked-down container you may need `sudo apt-get install -y libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2`.
- **No internet:** fine. `animation.html` is fully inlined (fonts, logos, code) and `render.mjs` uses Puppeteer's bundled Chromium. Only `npm install` needs the network.

## Editing the animation

`animation.html` is a compiled bundle — don't hand-edit it. The editable source lives one level up:
`anim-bundle.jsx` (scenes + timeline) and `Business Growth Stages.dc.html` (the page shell).
Edit there, re-bundle, then re-render.
