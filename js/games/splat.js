/* SPLAT — flap between the columns.
   flap    : you flap; the computer lays out the columns (tighter and wilder as you go).
   columns : you lay out the columns; the computer flaps through them using the same physics and input you have.
   Every gap you place is clamped to a band the bird can physically reach, so there are no impossible columns. */
(() => {
  'use strict';
  const CC = window.CC;
  const W = 480, H = 640, GROUND = 600, BX = 110, BRAD = 13, HITR = 12;
  const G = 1500, FLAP = -440, CW = 62, SPACING = 240, DT = 1 / 60;

  const speedFor = (lvl) => Math.min(150 + 9 * (lvl - 1), 240);
  // the widest gap-to-gap shift the bird can make between two columns at this speed (with a safety margin)
  function maxDeltaFor(v) {
    const tf = (SPACING - CW - 2 * BRAD) / v;
    return 0.8 * Math.min(-FLAP * tf, 0.5 * G * tf * tf);
  }
  const clampGap = (y, gap) => CC.clamp(y, gap / 2 + 30, GROUND - gap / 2 - 30);

  function circleRect(cx, cy, r, x, y, w, h) {
    const nx = CC.clamp(cx, x, x + w), ny = CC.clamp(cy, y, y + h), dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }
  function hitsColumn(y, col) {
    if (BX + HITR < col.x || BX - HITR > col.x + CW) return false;
    return circleRect(BX, y, HITR, col.x, -50, CW, col.gy - col.gap / 2 + 50) || circleRect(BX, y, HITR, col.x, col.gy + col.gap / 2, CW, GROUND - (col.gy + col.gap / 2));
  }

  // The bird's brain: search over flap/no-flap every few frames, simulated with the real physics.
  function birdPlan(bird, cols, v, skill, targetOffset) {
    const chunk = skill > 0.6 ? 4 : skill > 0.25 ? 6 : 8;
    const depth = Math.round(CC.lerp(3, 8, skill));
    // how far ahead the bird pays attention grows with skill; it cannot react to what it has not noticed
    const vision = BX + CC.lerp(150, 420, skill);
    const ahead = cols.filter((c) => c.x + CW > BX - HITR && c.x < vision).slice(0, 3);
    const next = ahead[0];
    const targetY = next ? next.gy + (targetOffset || 0) + next.gap * 0.08 : GROUND * 0.5;
    let bestScore = -Infinity, bestFirst = false;
    const xs = ahead.map((c) => c.x);
    function rec(y, vy, t, d, first) {
      if (d === depth) {
        const sc = -Math.abs(y - targetY) - Math.abs(vy) * 0.03;
        if (sc > bestScore) { bestScore = sc; bestFirst = first; }
        return;
      }
      for (const flap of [false, true]) {
        let yy = y, vv = vy, dead = false, tt = t;
        for (let f = 0; f < chunk; f++) {
          if (flap && f === 0) vv = FLAP;
          vv += G * DT; yy += vv * DT; tt++;
          if (yy < BRAD) { yy = BRAD; vv = 0; }
          if (yy + BRAD > GROUND) { dead = true; break; }
          for (let i = 0; i < ahead.length; i++) {
            const c = ahead[i], cx = xs[i] - v * DT * tt;
            if (hitsColumn(yy, { x: cx, gy: c.gy, gap: c.gap })) { dead = true; break; }
          }
          if (dead) break;
        }
        const f0 = d === 0 ? flap : first;
        if (dead) { const sc = -1e6 + tt * 1000; if (sc > bestScore) { bestScore = sc; bestFirst = f0; } continue; }
        rec(yy, vv, tt, d + 1, f0);
      }
    }
    rec(bird.y, bird.vy, 0, 0, false);
    return { flap: bestFirst, chunk };
  }

  CC.register({
    id: 'splat', title: 'Splat',
    blurb: 'Flap through the columns, or build columns the computer has to thread.',
    icon: `<svg viewBox="0 0 64 64"><rect x="36" y="0" width="12" height="22" fill="#7ee07a"/><rect x="36" y="42" width="12" height="22" fill="#7ee07a"/><circle cx="18" cy="30" r="7" fill="#ffb347"/><path d="M22 29 l6 2 -6 2z" fill="#e0405a"/></svg>`,
    size: { w: W, h: H },
    roles: [
      { id: 'flap', label: 'You flap · computer builds columns', help: '<kbd>Space</kbd>, <kbd>↑</kbd> or click to flap. The gaps shrink, move further and come faster as you go.' },
      { id: 'columns', label: 'You build columns · computer flaps', help: 'Move the mouse up and down (or <kbd>↑</kbd> <kbd>↓</kbd>) to set the gap of the next column — the lit band shows what the bird can physically reach. Splat the bird 4 times to win; it wins at 40 columns and gets steadier as it goes.' },
      { id: 'watch', label: 'Watch computer vs computer', help: 'Both sides are played by the computer.' },
    ],
    create(api) {
      const role = api.role, humanBird = role === 'flap', humanBuilder = role === 'columns';
      const st = {
        bird: { y: H / 2, vy: 0, rot: 0 }, cols: [], passed: 0, splats: 0, best: CC.store.get('splatBest', 0),
        prevGap: H / 2, ghost: H / 2, dead: 0, over: false, started: !humanBird, frame: 0, plan: { flap: false, chunk: 6 },
        offset: 0, parts: [], scroll: 0,
      };
      const level = () => 1 + Math.floor(st.passed / (humanBuilder ? 6 : 8));
      // the bird never becomes perfect against a human builder, so a sharp builder can always win
      const skill = () => (humanBuilder ? Math.min(0.62, (level() - 1) * 0.09) : CC.clamp((level() - 1) / 6, 0, 1));
      const gapSize = () => (humanBuilder ? 150 : Math.max(125, 185 - 6 * (level() - 1)));

      function nextGapByComputer() {
        const md = maxDeltaFor(speedFor(level())), spread = Math.min(1, 0.3 + 0.12 * (level() - 1));
        return clampGap(st.prevGap + CC.rand(-1, 1) * md * spread, gapSize());
      }
      function ghostBand() { const md = maxDeltaFor(speedFor(level())); const g = gapSize(); return [clampGap(st.prevGap - md, g), clampGap(st.prevGap + md, g)]; }
      function spawnColumn() {
        const gap = gapSize();
        let gy;
        if (humanBuilder) { const [lo, hi] = ghostBand(); gy = CC.clamp(st.ghost, lo, hi); } else gy = nextGapByComputer();
        st.cols.push({ x: W + 10, gy, gap, passed: false });
        st.prevGap = gy;
      }
      function reset() {
        st.bird = { y: H / 2 - 40, vy: 0, rot: 0 }; st.cols = []; st.prevGap = H / 2; st.dead = 0; st.offset = 0;
        spawnColumn();
      }
      reset();
      api.banner('Splat', humanBird ? 'Press Space to flap' : humanBuilder ? 'Aim the gaps with your mouse' : 'Attract mode', 1600);

      function splat() {
        CC.boom(0.35); st.dead = 1.1;
        for (let i = 0; i < 20; i++) st.parts.push({ x: BX, y: st.bird.y, vx: CC.rand(-200, 200), vy: CC.rand(-250, 50), t: 0.8 });
        if (humanBird) {
          st.over = true; if (st.passed > st.best) { st.best = st.passed; CC.store.set('splatBest', st.best); }
          api.banner('Splat!', `${st.passed} columns · best ${st.best}. Press R to go again.`, 0);
        } else {
          st.splats++;
          if (humanBuilder && st.splats >= 4) { st.over = true; api.banner('You win', `The bird cleared ${st.passed} columns. Press R to play again.`, 0); }
          else api.banner('Splat!', humanBuilder ? `${st.splats} of 4` : '', 900);
        }
      }
      function flap() { st.bird.vy = FLAP; CC.beep(700, 0.04, 'triangle', 0.025, 1.4); }

      return {
        update(dt) {
          const inp = api.input, v = speedFor(level());
          st.frame++;
          for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.t -= dt; }
          st.parts = st.parts.filter((p) => p.t > 0);
          // builder input: the ghost gap follows the mouse / arrow keys
          if (humanBuilder) {
            if (inp.mouse.inside) st.ghost = inp.mouse.y;
            if (inp.keys.ArrowUp || inp.keys.KeyW) st.ghost -= 320 * dt;
            if (inp.keys.ArrowDown || inp.keys.KeyS) st.ghost += 320 * dt;
            st.ghost = CC.clamp(st.ghost, 0, GROUND);
          }
          if (st.over) return;
          if (st.dead > 0) { st.dead -= dt; if (st.dead <= 0) { reset(); api.hideBanner(); } return; }
          const flapPressed = inp.pressed.Space || inp.pressed.ArrowUp || inp.pressed.KeyW || inp.mouse.clicked;
          if (humanBird && !st.started) { if (flapPressed) { st.started = true; flap(); } else { st.bird.y = H / 2 - 40 + Math.sin(st.frame / 12) * 6; return; } }
          // bird control
          if (humanBird) { if (flapPressed) flap(); }
          else {
            const s = skill();
            if (st.frame % st.plan.chunk === 0) {
              st.plan = birdPlan(st.bird, st.cols, v, s, st.offset);
              if (st.plan.flap) flap();
            }
          }
          // physics
          const b = st.bird;
          b.vy += G * dt; b.y += b.vy * dt;
          if (b.y < BRAD) { b.y = BRAD; b.vy = 0; }
          b.rot = CC.clamp(b.vy / 700, -0.5, 1.2);
          st.scroll += v * dt;
          for (const c of st.cols) {
            c.x -= v * dt;
            if (!c.passed && c.x + CW < BX - HITR) {
              c.passed = true; st.passed++; CC.beep(980, 0.05, 'square', 0.02);
              // a new aiming wobble for the next column: sloppy early, precise later
              st.offset = CC.gauss() * 0.22 * st.cols[0].gap * (1 - skill());
              if (humanBuilder && st.passed >= 40) { st.over = true; api.banner('The bird wins', 'It cleared 40 columns. Press R to play again.', 0); }
            }
          }
          st.cols = st.cols.filter((c) => c.x > -CW - 10);
          const last = st.cols[st.cols.length - 1];
          if (!last || last.x < W + 10 - SPACING) spawnColumn();
          if (b.y + BRAD > GROUND || st.cols.some((c) => hitsColumn(b.y, c))) splat();
          if (humanBuilder) api.hud(`You ${st.splats} / 4 splats`, `Level ${level()}`, `Bird ${st.passed} / 40`);
          else api.hud(humanBird ? `You ${st.passed}` : `Bird ${st.passed}`, `Level ${level()}`, humanBird ? `Best ${st.best}` : `Splats ${st.splats}`);
        },
        draw(ctx) {
          const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, '#1b2a44'); g.addColorStop(1, '#3a2a3a');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // distant skyline
          ctx.fillStyle = 'rgba(0,0,0,.25)';
          for (let i = 0; i < 12; i++) { const x = ((i * 70 - st.scroll * 0.2) % (W + 70) + W + 70) % (W + 70) - 70; ctx.fillRect(x, GROUND - 60 - ((i * 37) % 70), 50, 200); }
          for (const c of st.cols) {
            const top = c.gy - c.gap / 2, bot = c.gy + c.gap / 2;
            ctx.fillStyle = '#4caf50'; ctx.fillRect(c.x, 0, CW, top); ctx.fillRect(c.x, bot, CW, GROUND - bot);
            ctx.fillStyle = '#7ee07a'; ctx.fillRect(c.x - 4, top - 18, CW + 8, 18); ctx.fillRect(c.x - 4, bot, CW + 8, 18);
            ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(c.x + CW - 12, 0, 12, top - 18); ctx.fillRect(c.x + CW - 12, bot + 18, 12, GROUND - bot - 18);
          }
          ctx.fillStyle = '#5b3a22'; ctx.fillRect(0, GROUND, W, H - GROUND);
          ctx.fillStyle = '#7ee07a'; ctx.fillRect(0, GROUND, W, 6);
          if (humanBuilder && !st.over) {
            const [lo, hi] = ghostBand(), gap = gapSize(), gy = CC.clamp(st.ghost, lo, hi);
            ctx.fillStyle = 'rgba(255,179,71,.12)'; ctx.fillRect(W - 26, lo - gap / 2, 26, hi - lo + gap);
            ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3; ctx.strokeRect(W - 24, gy - gap / 2, 22, gap);
            CC.text(ctx, 'next gap', W - 30, gy, { size: 12, align: 'right', color: '#ffb347', font: 'Chivo, sans-serif' });
          }
          if (st.dead <= 0 || st.dead > 1.0) {
            const b = st.bird;
            ctx.save(); ctx.translate(BX, b.y); ctx.rotate(b.rot);
            ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(0, 0, BRAD + 2, BRAD, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -4, 4.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(7.5, -4, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#e0405a'; ctx.beginPath(); ctx.moveTo(12, 1); ctx.lineTo(22, 4); ctx.lineTo(12, 7); ctx.fill();
            ctx.fillStyle = '#e89a2e'; ctx.beginPath(); ctx.ellipse(-5, 3, 7, 4, -0.4 + (st.bird.vy < 0 ? -0.6 : 0.3), 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
          for (const p of st.parts) { ctx.globalAlpha = Math.min(1, p.t * 2); ctx.fillStyle = '#ffb347'; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); } ctx.globalAlpha = 1;
          CC.text(ctx, String(st.passed), W / 2, 50, { size: 40, color: '#f3e6cf' });
          if (humanBird && !st.started && !st.over) CC.text(ctx, 'Space to flap', W / 2, H / 2 + 40, { size: 18, color: '#ffb347' });
        },
      };
    },
  });
  CC._splat = { birdPlan, hitsColumn, maxDeltaFor, speedFor, clampGap, consts: { W, H, GROUND, BX, BRAD, HITR, G, FLAP, CW, SPACING, DT } };
})();
