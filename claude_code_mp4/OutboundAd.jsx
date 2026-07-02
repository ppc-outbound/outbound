/* OutboundAd.jsx — self-contained 9:16 animated Meta ad for Outbound Click.
   Includes a trimmed timeline engine (Stage/Sprite/easing) + the ad scenes.
   Registers window.OutboundAd. */

// ── Easing ───────────────────────────────────────────────────────────────────
const Easing = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  easeOutQuart: (t) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  easeInOutExpo: (t) => {
    if (t === 0) return 0; if (t === 1) return 1;
    if (t < 0.5) return 0.5 * Math.pow(2, 20 * t - 10);
    return 1 - 0.5 * Math.pow(2, -20 * t + 10);
  },
  easeOutBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    if (t === 0) return 0; if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function interpolate(input, output, ease = Easing.linear) {
  return (t) => {
    if (t <= input[0]) return output[0];
    if (t >= input[input.length - 1]) return output[output.length - 1];
    for (let i = 0; i < input.length - 1; i++) {
      if (t >= input[i] && t <= input[i + 1]) {
        const span = input[i + 1] - input[i];
        const local = span === 0 ? 0 : (t - input[i]) / span;
        const ef = Array.isArray(ease) ? (ease[i] || Easing.linear) : ease;
        return output[i] + (output[i + 1] - output[i]) * ef(local);
      }
    }
    return output[output.length - 1];
  };
}
function animate({ from = 0, to = 1, start = 0, end = 1, ease = Easing.easeInOutCubic }) {
  return (t) => {
    if (t <= start) return from;
    if (t >= end) return to;
    return from + (to - from) * ease((t - start) / (end - start));
  };
}

// ── Timeline context ─────────────────────────────────────────────────────────
const TimelineContext = React.createContext({ time: 0, duration: 10, playing: false });
const useTimeline = () => React.useContext(TimelineContext);
const useTime = () => React.useContext(TimelineContext).time;

const SpriteContext = React.createContext({ localTime: 0, progress: 0, duration: 0 });
const useSprite = () => React.useContext(SpriteContext);

function Sprite({ start = 0, end = Infinity, children, keepMounted = false }) {
  const { time } = useTimeline();
  const visible = time >= start && time <= end;
  if (!visible && !keepMounted) return null;
  const duration = end - start;
  const localTime = Math.max(0, time - start);
  const progress = duration > 0 && isFinite(duration) ? clamp(localTime / duration, 0, 1) : 0;
  const value = { localTime, progress, duration, visible };
  return React.createElement(SpriteContext.Provider, { value },
    typeof children === 'function' ? children(value) : children);
}

// ── Stage + playback ──────────────────────────────────────────────────────────
function IconButton({ children, onClick, title }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f6f4ef',
        cursor: 'pointer', padding: 0, transition: 'background 120ms' }}>
      {children}
    </button>
  );
}
function PlaybackBar({ time, duration, playing, onPlayPause, onReset, onSeek, onHover }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const timeFromEvent = React.useCallback((e) => {
    const rect = trackRef.current.getBoundingClientRect();
    return clamp((e.clientX - rect.left) / rect.width, 0, 1) * duration;
  }, [duration]);
  const onTrackMove = (e) => { if (!trackRef.current) return; const t = timeFromEvent(e); dragging ? onSeek(t) : onHover(t); };
  const onTrackLeave = () => { if (!dragging) onHover(null); };
  const onTrackDown = (e) => { setDragging(true); onSeek(timeFromEvent(e)); onHover(null); };
  React.useEffect(() => {
    if (!dragging) return;
    const onUp = () => setDragging(false);
    const onMove = (e) => { if (trackRef.current) onSeek(timeFromEvent(e)); };
    window.addEventListener('mouseup', onUp); window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mouseup', onUp); window.removeEventListener('mousemove', onMove); };
  }, [dragging, timeFromEvent, onSeek]);
  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const fmt = (t) => { const tot = Math.max(0, t); const m = Math.floor(tot / 60); const s = Math.floor(tot % 60); const cs = Math.floor((tot * 100) % 100); return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`; };
  const mono = 'JetBrains Mono, ui-monospace, monospace';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
      background: 'rgba(20,20,20,0.92)', borderTop: '1px solid rgba(255,255,255,0.08)',
      width: '100%', maxWidth: 680, alignSelf: 'center', borderRadius: 8, color: '#f6f4ef',
      fontFamily: 'Inter, system-ui, sans-serif', userSelect: 'none', flexShrink: 0 }}>
      <IconButton onClick={onReset} title="Return to start (0)">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 2v10M12 2L5 7l7 5V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/></svg>
      </IconButton>
      <IconButton onClick={onPlayPause} title="Play/pause (space)">
        {playing ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3" y="2" width="3" height="10" fill="currentColor"/><rect x="8" y="2" width="3" height="10" fill="currentColor"/></svg>
                 : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 2l9 5-9 5V2z" fill="currentColor"/></svg>}
      </IconButton>
      <div style={{ fontFamily: mono, fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 64, textAlign: 'right' }}>{fmt(time)}</div>
      <div ref={trackRef} onMouseMove={onTrackMove} onMouseLeave={onTrackLeave} onMouseDown={onTrackDown}
        style={{ flex: 1, height: 22, position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2 }}/>
        <div style={{ position: 'absolute', left: 0, width: `${pct}%`, height: 4, background: '#0f59fc', borderRadius: 2 }}/>
        <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', width: 12, height: 12, marginLeft: -6, marginTop: -6, background: '#fff', borderRadius: 6, boxShadow: '0 2px 4px rgba(0,0,0,0.4)' }}/>
      </div>
      <div style={{ fontFamily: mono, fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 64, textAlign: 'left', color: 'rgba(246,244,239,0.55)' }}>{fmt(duration)}</div>
    </div>
  );
}
function Stage({ width = 1080, height = 1920, duration = 10, background = '#182033', loop = true, autoplay = true, persistKey = 'outboundad', children }) {
  const [time, setTime] = React.useState(() => { try { const v = parseFloat(localStorage.getItem(persistKey + ':t') || '0'); return isFinite(v) ? clamp(v, 0, duration) : 0; } catch { return 0; } });
  const [playing, setPlaying] = React.useState(autoplay);
  const [hoverTime, setHoverTime] = React.useState(null);
  const [scale, setScale] = React.useState(1);
  const stageRef = React.useRef(null);
  const rafRef = React.useRef(null);
  const lastTsRef = React.useRef(null);
  React.useEffect(() => { try { localStorage.setItem(persistKey + ':t', String(time)); } catch {} }, [time, persistKey]);
  React.useEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const measure = () => { const barH = 44; setScale(Math.max(0.05, Math.min(el.clientWidth / width, (el.clientHeight - barH) / height))); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el); window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [width, height]);
  React.useEffect(() => {
    if (!playing) { lastTsRef.current = null; return; }
    const step = (ts) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000; lastTsRef.current = ts;
      setTime((t) => { let next = t + dt; if (next >= duration) { if (loop) next = next % duration; else { next = duration; setPlaying(false); } } return next; });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); lastTsRef.current = null; };
  }, [playing, duration, loop]);
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(p => !p); }
      else if (e.code === 'ArrowLeft') setTime(t => clamp(t - (e.shiftKey ? 1 : 0.1), 0, duration));
      else if (e.code === 'ArrowRight') setTime(t => clamp(t + (e.shiftKey ? 1 : 0.1), 0, duration));
      else if (e.key === '0' || e.code === 'Home') setTime(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration]);
  const displayTime = hoverTime != null ? hoverTime : time;
  React.useEffect(() => { window.__ad = { seek: (t) => { setPlaying(false); setTime(clamp(t, 0, duration)); }, play: () => setPlaying(true) }; }, [duration]);
  const ctxValue = React.useMemo(() => ({ time: displayTime, duration, playing, setTime, setPlaying }), [displayTime, duration, playing]);
  return (
    <div ref={stageRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0a0a0a', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ width, height, background, position: 'relative', transform: `scale(${scale})`, transformOrigin: 'center', flexShrink: 0, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
          <TimelineContext.Provider value={ctxValue}>{children}</TimelineContext.Provider>
        </div>
      </div>
      <PlaybackBar time={displayTime} duration={duration} playing={playing}
        onPlayPause={() => setPlaying(p => !p)} onReset={() => setTime(0)} onSeek={setTime} onHover={setHoverTime} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  AD SCENES
// ═══════════════════════════════════════════════════════════════════════════
const NAVY = '#182033';
const BLUE = '#0f59fc';
const WHITE = '#ffffff';
const HEAD = "'Montserrat', sans-serif";
const BODY = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const W = 1080, H = 1920;
const DURATION = 33;

// Scene boundaries (s)
const S = {
  hook:   [0.0, 6.0],
  reveal: [6.0, 11.0],
  problem:[11.0, 19.0],
  shift:  [19.0, 25.0],
  solve:  [25.0, 29.5],
  cta:    [29.5, 33.0],
};

// Persistent animated background: navy with a drifting blue glow + subtle grid.
function Background() {
  const t = useTime();
  const gx = 540 + Math.sin(t * 0.35) * 260;
  const gy = 760 + Math.cos(t * 0.27) * 320;
  // glow intensity rises through the "solve" phase
  const intensity = interpolate([0, S.problem[1], S.solve[0], DURATION], [0.16, 0.16, 0.34, 0.34], Easing.easeInOutQuad)(t);
  return (
    <div style={{ position: 'absolute', inset: 0, background: NAVY, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
        backgroundSize: '90px 90px', maskImage: 'radial-gradient(circle at 50% 42%, #000 0%, transparent 78%)', WebkitMaskImage: 'radial-gradient(circle at 50% 42%, #000 0%, transparent 78%)' }}/>
      <div style={{ position: 'absolute', left: gx, top: gy, width: 1100, height: 1100, transform: 'translate(-50%,-50%)',
        background: `radial-gradient(circle, rgba(15,89,252,${intensity}) 0%, rgba(15,89,252,0) 62%)`, filter: 'blur(8px)' }}/>
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 240px 60px rgba(8,12,24,0.6)' }}/>
    </div>
  );
}

// Small uppercase eyebrow/kicker chip
function Kicker({ children, localTime }) {
  const op = clamp(localTime / 0.5, 0, 1);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, opacity: op,
      transform: `translateY(${(1 - op) * 12}px)` }}>
      <span style={{ width: 46, height: 3, background: BLUE, borderRadius: 2 }}/>
      <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 26, letterSpacing: '0.32em', color: BLUE, textTransform: 'uppercase' }}>{children}</span>
    </div>
  );
}

// A line of headline text that reveals with a clip + rise.
function Line({ children, localTime, delay = 0, size = 96, color = WHITE, weight = 800, lh = 1.05, ls = '-0.02em' }) {
  const lt = clamp((localTime - delay) / 0.6, 0, 1);
  const e = Easing.easeOutExpo(lt);
  return (
    <div style={{ overflow: 'hidden', padding: '2px 0' }}>
      <div style={{ fontFamily: HEAD, fontWeight: weight, fontSize: size, lineHeight: lh, letterSpacing: ls, color,
        transform: `translateY(${(1 - e) * 1.1}em)`, opacity: lt > 0 ? 1 : 0, willChange: 'transform' }}>
        {children}
      </div>
    </div>
  );
}

// ── Scene 1 : HOOK ─────────────────────────────────────────────────────────
function HookScene({ localTime, duration }) {
  const exit = clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  // "bad service" gets struck-through after it lands
  const strike = clamp((localTime - 3.2) / 0.7, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 96px', opacity: 1 - exit, transform: `translateY(${-exit * 40}px)` }}>
      <div style={{ marginBottom: 44 }}><Kicker localTime={localTime}>For local service businesses</Kicker></div>
      <Line localTime={localTime} delay={0.3} size={100}>Your business</Line>
      <Line localTime={localTime} delay={0.65} size={100}>isn't struggling</Line>
      <Line localTime={localTime} delay={1.0} size={100}>because of</Line>
      <div style={{ position: 'relative', display: 'inline-block', width: 'fit-content' }}>
        <Line localTime={localTime} delay={1.35} size={100} color="rgba(255,255,255,0.5)">bad service.</Line>
        <div style={{ position: 'absolute', top: '52%', left: 0, height: 7, background: BLUE, borderRadius: 3,
          width: `${strike * 100}%`, maxWidth: '100%', boxShadow: `0 0 24px ${BLUE}` }}/>
      </div>
    </div>
  );
}

// ── Scene 2 : REVEAL ─────────────────────────────────────────────────────────
function RevealScene({ localTime, duration }) {
  const exit = clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  const hl = clamp((localTime - 1.8) / 0.6, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 96px', opacity: 1 - exit, transform: `translateY(${-exit * 40}px)` }}>
      <div style={{ marginBottom: 44 }}><Kicker localTime={localTime}>The real problem</Kicker></div>
      <Line localTime={localTime} delay={0.2} size={104}>It's struggling</Line>
      <Line localTime={localTime} delay={0.5} size={104}>because your leads</Line>
      <div style={{ position: 'relative', width: 'fit-content', marginTop: 6 }}>
        <div style={{ position: 'absolute', left: -16, top: '12%', bottom: '12%', width: `calc(100% + 32px)`,
          background: BLUE, borderRadius: 10, transform: `scaleX(${Easing.easeOutExpo(hl)})`, transformOrigin: 'left',
          opacity: hl > 0 ? 1 : 0 }}/>
        <div style={{ position: 'relative' }}>
          <Line localTime={localTime} delay={0.85} size={104} color={WHITE}>are unpredictable.</Line>
        </div>
      </div>
    </div>
  );
}

// ── Lead-flow chart : erratic → steady, driven by `steady` 0..1 ──────────────
const CHAOS  = [0.86, 0.18, 0.7, 0.12, 0.95, 0.22, 0.6, 0.1];
const STEADY = [0.34, 0.41, 0.49, 0.57, 0.66, 0.75, 0.85, 0.96];
function LeadChart({ steady, reveal }) {
  // reveal: 0..1 grows bars in from left; steady: 0..1 morph chaos→steady
  const cw = 760, ch = 560, n = 8, gap = 22;
  const bw = (cw - gap * (n - 1)) / n;
  const heights = CHAOS.map((c, i) => c + (STEADY[i] - c) * steady);
  const pts = heights.map((h, i) => {
    const x = i * (bw + gap) + bw / 2;
    const y = ch - h * ch;
    return [x, y];
  });
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const lineColor = `rgb(${Math.round(255 - (255 - 15) * steady)}, ${Math.round(90 + (89 - 90) * steady)}, ${Math.round(110 + (252 - 110) * steady)})`;
  return (
    <div style={{ position: 'relative', width: cw, height: ch }}>
      {/* baseline */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'rgba(255,255,255,0.16)' }}/>
      {heights.map((h, i) => {
        const appear = clamp((reveal * n) - i, 0, 1);
        const eh = h * ch * Easing.easeOutCubic(appear);
        const isUp = steady > 0.5;
        return (
          <div key={i} style={{ position: 'absolute', left: i * (bw + gap), bottom: 0, width: bw, height: eh,
            borderRadius: '8px 8px 0 0', opacity: appear,
            background: isUp ? `linear-gradient(180deg, ${BLUE} 0%, rgba(15,89,252,0.35) 100%)`
                             : 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.07) 100%)',
            boxShadow: isUp ? `0 0 24px rgba(15,89,252,0.45)` : 'none', transition: 'none' }}/>
        );
      })}
      <svg width={cw} height={ch} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round"
          style={{ filter: steady > 0.5 ? `drop-shadow(0 0 10px ${BLUE})` : 'none', strokeDasharray: 2600, strokeDashoffset: 2600 * (1 - clamp(reveal, 0, 1)) }}/>
        {pts.map((p, i) => {
          const appear = clamp((reveal * n) - i, 0, 1);
          return <circle key={i} cx={p[0]} cy={p[1]} r={9} fill={WHITE} opacity={appear}
            style={{ filter: steady > 0.5 ? `drop-shadow(0 0 8px ${BLUE})` : 'none' }}/>;
        })}
      </svg>
    </div>
  );
}

// ── Scene 3 : PROBLEM (feast or famine) ──────────────────────────────────────
function ProblemScene({ localTime, duration }) {
  const exit = clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  const reveal = clamp((localTime - 0.6) / 1.6, 0, 1);
  // caption swap
  const cap1 = clamp(localTime / 0.5, 0, 1) - clamp((localTime - 3.4) / 0.5, 0, 1);
  const cap2 = clamp((localTime - 3.6) / 0.5, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      padding: '0 96px', opacity: 1 - exit, transform: `translateY(${-exit * 30}px)` }}>
      <div style={{ marginBottom: 60 }}><Kicker localTime={localTime}>Feast or famine</Kicker></div>
      <LeadChart steady={0} reveal={reveal} />
      <div style={{ marginTop: 64, height: 150, position: 'relative', width: '100%', textAlign: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: cap1, transform: `translateY(${(1 - cap1) * 16}px)` }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 58, color: WHITE, lineHeight: 1.1 }}>Some weeks the phone<br/>won't stop ringing.</div>
        </div>
        <div style={{ position: 'absolute', inset: 0, opacity: cap2, transform: `translateY(${(1 - cap2) * 16}px)` }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 58, color: WHITE, lineHeight: 1.1 }}>Other weeks…<br/><span style={{ color: 'rgba(255,255,255,0.45)' }}>complete silence.</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Scene 4 : SHIFT (chart smooths into steady climb) ────────────────────────
function ShiftScene({ localTime, duration }) {
  const exit = clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  const steady = Easing.easeInOutCubic(clamp((localTime - 0.8) / 2.2, 0, 1));
  const t1 = clamp((localTime - 0.1) / 0.6, 0, 1);
  const t2 = clamp((localTime - 3.4) / 0.6, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      padding: '0 96px', opacity: 1 - exit, transform: `translateY(${-exit * 30}px)` }}>
      <div style={{ textAlign: 'center', marginBottom: 56, opacity: t1, transform: `translateY(${(1 - t1) * 16}px)` }}>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 62, color: WHITE, lineHeight: 1.08 }}>The fix isn't<br/>working <span style={{ color: 'rgba(255,255,255,0.4)' }}>harder.</span></div>
      </div>
      <LeadChart steady={steady} reveal={1} />
      <div style={{ textAlign: 'center', marginTop: 56, opacity: t2, transform: `translateY(${(1 - t2) * 16}px)` }}>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 62, color: WHITE, lineHeight: 1.08 }}>It's a system that brings<br/>leads <span style={{ color: BLUE }}>every single week.</span></div>
      </div>
    </div>
  );
}

// ── Scene 5 : SOLVE ──────────────────────────────────────────────────────────
function SolveScene({ localTime, duration }) {
  const exit = clamp((localTime - (duration - 0.5)) / 0.5, 0, 1);
  const items = ['Targeted Meta Ads', 'Qualified leads, weekly', 'A pipeline you can scale'];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 96px', opacity: 1 - exit, transform: `translateY(${-exit * 30}px)` }}>
      <div style={{ marginBottom: 40 }}><Kicker localTime={localTime}>The system</Kicker></div>
      <Line localTime={localTime} delay={0.2} size={92}>Predictable</Line>
      <Line localTime={localTime} delay={0.45} size={92} color={BLUE}>lead flow.</Line>
      <div style={{ marginTop: 56, display: 'flex', flexDirection: 'column', gap: 28 }}>
        {items.map((it, i) => {
          const lt = clamp((localTime - (1.1 + i * 0.4)) / 0.5, 0, 1);
          const e = Easing.easeOutBack(lt);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 26, opacity: lt, transform: `translateX(${(1 - lt) * -30}px)` }}>
              <span style={{ width: 56, height: 56, flexShrink: 0, borderRadius: '50%', background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${e})` }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 6.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              <span style={{ fontFamily: BODY, fontWeight: 500, fontSize: 50, color: WHITE }}>{it}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Scene 6 : CTA ─────────────────────────────────────────────────────────────
function CtaScene({ localTime }) {
  const logo = Easing.easeOutCubic(clamp(localTime / 0.7, 0, 1));
  const head = clamp((localTime - 0.6) / 0.6, 0, 1);
  const btn = Easing.easeOutBack(clamp((localTime - 1.2) / 0.6, 0, 1));
  const url = clamp((localTime - 1.8) / 0.6, 0, 1);
  const pulse = 1 + Math.sin(Math.max(0, localTime - 1.8) * 3.2) * 0.02;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 96px', textAlign: 'center' }}>
      <img src="logo-white.png" alt="Outbound Click" style={{ width: 560, opacity: logo, transform: `translateY(${(1 - logo) * 20}px)`, marginBottom: 70 }}/>
      <div style={{ opacity: head, transform: `translateY(${(1 - head) * 18}px)` }}>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 84, color: WHITE, lineHeight: 1.05, letterSpacing: '-0.02em' }}>Build a predictable<br/><span style={{ color: BLUE }}>lead flow.</span></div>
      </div>
      <div style={{ marginTop: 64, opacity: btn ? 1 : 0, transform: `scale(${btn})` }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 20, background: BLUE, color: WHITE, fontFamily: HEAD, fontWeight: 700, fontSize: 46, padding: '34px 64px', borderRadius: 100, boxShadow: `0 18px 50px rgba(15,89,252,0.5)`, transform: `scale(${pulse})` }}>
          Book your free growth call
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
      </div>
      <div style={{ marginTop: 48, fontFamily: BODY, fontWeight: 500, fontSize: 40, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.7)', opacity: url }}>outboundclick.com</div>
    </div>
  );
}

// Scene-progress label updates for commenting
function SecondLabel() {
  const t = useTime();
  React.useEffect(() => {
    const root = document.querySelector('[data-screen-label]');
    if (root) root.setAttribute('data-screen-label', `t=${t.toFixed(0)}s`);
  }, [Math.floor(t)]);
  return null;
}

// All scene content, driven purely by the surrounding TimelineContext.
// Shared by the interactive Stage and the chrome-free MP4 render harness.
function AdContent() {
  return (
    <React.Fragment>
      <Background />
      <SecondLabel />
      <Sprite start={S.hook[0]} end={S.hook[1]}>{({ localTime, duration }) => <HookScene localTime={localTime} duration={duration} />}</Sprite>
      <Sprite start={S.reveal[0]} end={S.reveal[1]}>{({ localTime, duration }) => <RevealScene localTime={localTime} duration={duration} />}</Sprite>
      <Sprite start={S.problem[0]} end={S.problem[1]}>{({ localTime, duration }) => <ProblemScene localTime={localTime} duration={duration} />}</Sprite>
      <Sprite start={S.shift[0]} end={S.shift[1]}>{({ localTime, duration }) => <ShiftScene localTime={localTime} duration={duration} />}</Sprite>
      <Sprite start={S.solve[0]} end={S.solve[1]}>{({ localTime, duration }) => <SolveScene localTime={localTime} duration={duration} />}</Sprite>
      <Sprite start={S.cta[0]} end={S.cta[1]}>{({ localTime }) => <CtaScene localTime={localTime} />}</Sprite>
    </React.Fragment>
  );
}

function OutboundAd() {
  return (
    <div data-screen-label="t=0s" style={{ position: 'absolute', inset: 0 }}>
      <Stage width={W} height={H} duration={DURATION} background={NAVY} persistKey="outboundclick-ad">
        <AdContent />
      </Stage>
    </div>
  );
}

// ── MP4 render harness ───────────────────────────────────────────────────────
// Renders the ad at native 1080x1920 with NO playback chrome, fully controlled
// by an external frame setter. Used by render.html + render-video.mjs.
function RenderRoot() {
  const [t, setT] = React.useState(0);
  React.useEffect(() => { window.__seekFrame = (x) => setT(x); window.__renderReady = true; }, []);
  const ctx = { time: t, duration: DURATION, playing: false, setTime: setT, setPlaying: () => {} };
  return React.createElement(
    TimelineContext.Provider, { value: ctx },
    React.createElement('div', {
      style: { width: W, height: H, position: 'relative', overflow: 'hidden', background: NAVY }
    }, React.createElement(AdContent))
  );
}

window.OutboundAd = OutboundAd;
window.OutboundAdMeta = { width: W, height: H, duration: DURATION, fps: 30 };
window.mountOutboundRender = function (el) {
  const root = ReactDOM.createRoot(el);
  root.render(React.createElement(RenderRoot));
};
