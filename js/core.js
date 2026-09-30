/* Cocktail Cabinet — shared core: math, RNG, input, sound, storage.
   Every game registers itself with CC.register({...}); main.js runs the shell. 
   */
(() => {
  'use strict';
  const CC = (window.CC = { games: [], muted: false });
  CC.register = (g) => CC.games.push(g);

  // ---------- math ----------
  CC.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  CC.lerp = (a, b, t) => a + (b - a) * t;
  CC.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  CC.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  CC.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  CC.gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  CC.angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  CC.shuffle = (arr, rnd = Math.random) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  // mulberry32: deterministic RNG (used where two browsers must agree)
  CC.seeded = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  // ---------- storage (best effort) ----------
  CC.store = {
    get(k, def) { try { const v = localStorage.getItem('cc:' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem('cc:' + k, JSON.stringify(v)); } catch (e) { /* private mode etc. */ } },
  };
  CC.muted = CC.store.get('muted', false);

  // ---------- sound ----------
  let actx = null;
  function ac() {
    if (CC.muted) return null;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; } catch (e) { return null; }
  }
  CC.beep = (f = 440, d = 0.08, type = 'square', v = 0.035, slide = 0) => {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  };
  CC.boom = (d = 0.35, v = 0.09) => {
    const a = ac(); if (!a) return;
    const n = Math.floor(a.sampleRate * d), buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = v;
    s.buffer = buf; s.connect(f); f.connect(g); g.connect(a.destination); s.start();
  };

  // ---------- input ----------
  const input = (CC.input = {
    keys: Object.create(null), pressed: Object.create(null),
    mouse: { x: 0, y: 0, down: false, clicked: false, released: false, inside: false, downX: 0, downY: 0 },
    clearFrame() { this.pressed = Object.create(null); this.mouse.clicked = false; this.mouse.released = false; },
    reset() { this.keys = Object.create(null); this.clearFrame(); this.mouse.down = false; },
  });
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  const typingTarget = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  window.addEventListener('keydown', (e) => {
    if (typingTarget(e.target)) return;
    if (!input.keys[e.code]) input.pressed[e.code] = true;
    input.keys[e.code] = true;
    if (CC.activeCanvasGame && GAME_KEYS.has(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  window.addEventListener('blur', () => { input.keys = Object.create(null); input.mouse.down = false; });

  CC.bindCanvas = (canvas) => {
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height }; };
    canvas.addEventListener('pointermove', (e) => { const p = pos(e); input.mouse.x = p.x; input.mouse.y = p.y; input.mouse.inside = true; });
    canvas.addEventListener('pointerleave', () => { input.mouse.inside = false; });
    canvas.addEventListener('pointerdown', (e) => {
      const p = pos(e); input.mouse.x = p.x; input.mouse.y = p.y; input.mouse.down = true; input.mouse.clicked = true; input.mouse.inside = true;
      input.mouse.downX = p.x; input.mouse.downY = p.y; canvas.focus();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    const up = (e) => { if (!input.mouse.down) return; const p = pos(e); input.mouse.x = p.x; input.mouse.y = p.y; input.mouse.down = false; input.mouse.released = true; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  // ---------- drawing helpers ----------
  CC.glow = (ctx, color, blur) => { ctx.shadowColor = color; ctx.shadowBlur = blur; };
  CC.noGlow = (ctx) => { ctx.shadowBlur = 0; };
  CC.text = (ctx, s, x, y, { size = 20, color = '#f3e6cf', align = 'center', font = 'Bungee, Impact, sans-serif', base = 'middle' } = {}) => {
    ctx.font = `${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y);
  };
  CC.el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };
})();
