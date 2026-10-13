/**
 * Game: Breakout (falling bricks).
 *
 * @file One paddle against a wall of bricks that slowly marches down toward it. The
 * computer's only job is to add bricks: it feeds new rows in at the top, with gaps and with
 * bricks of different strengths (1 to 4 hits). Smash them faster than they arrive. If a brick
 * reaches the danger line it costs a life and the bricks that got through are wiped away; a
 * ball that falls past the paddle costs a life too. Three lives, then the game is over.
 *
 * Bricks: strength 1 to 4 (the number on the brick is the hits it still needs). Higher
 * levels bring stronger bricks and a faster march. Level rises every 20 bricks destroyed.
 *
 * Power-ups drop from some broken bricks; catch them with the paddle:
 *  - T (blue)  : ball tripler, every ball in play becomes three
 *  - W (green) : paddle extender, a much wider paddle for 15 seconds
 *  - S (pink)  : speed increaser, balls fly faster for 10 seconds
 *
 * Sides: play the paddle against the computer's bricks, or watch the computer play the
 * paddle too (a simple paddle that follows the lowest falling ball).
 *
 * Test hook: the object returned by create() exposes {@code state}.
 *
 * @module games/breakout
 * @requires js/core.js
 */
(() => {
  'use strict';
  const CC = window.CC;
  const W = 560, H = 720, PW = 88, PH = 12, BR = 7;
  const COLS = 10, BW = 51, BH = 20, GAP = 4, X0 = 7, ROW_H = BH + GAP;
  const SPAWN_Y = 10;                       // where a new row appears
  const PAD_Y = H - 44;                     // the paddle's height on the screen
  const DANGER_Y = PAD_Y - 70;              // a brick whose bottom reaches this line costs a life
  const START_LIVES = 3, MAX_BALLS = 12, BRICKS_PER_LEVEL = 20;
  const WIDE_TIME = 15, WIDE_FACTOR = 1.6, FAST_TIME = 10, FAST_FACTOR = 1.35;
  const HP_COLOR = { 1: '#7ee07a', 2: '#ffd24a', 3: '#ff8a3c', 4: '#e0405a' };
  const POWER = {
    triple: { letter: 'T', color: '#5ec8ff', weight: 0.35 },
    wide: { letter: 'W', color: '#7ee07a', weight: 0.35 },
    fast: { letter: 'S', color: '#ff5fd2', weight: 0.30 },
  };

  const hitRect = (b, r) => b.x + BR > r.x && b.x - BR < r.x + r.w && b.y + BR > r.y && b.y - BR < r.y + r.h;
  const pickWeighted = (weights) => {
    let t = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) { t -= weights[i]; if (t <= 0) return i; }
    return weights.length - 1;
  };

  CC.register({
    id: 'breakout', title: 'Breakout',
    blurb: 'Smash the bricks marching down at you. Catch power-ups: triple ball, wide paddle, speed.',
    icon: `<svg viewBox="0 0 64 64"><g fill="#7ee07a"><rect x="6" y="6" width="14" height="6"/><rect x="25" y="6" width="14" height="6"/></g><g fill="#ffd24a"><rect x="44" y="6" width="14" height="6"/><rect x="6" y="16" width="14" height="6"/></g><g fill="#ff8a3c"><rect x="25" y="16" width="14" height="6"/></g><g fill="#e0405a"><rect x="44" y="16" width="14" height="6"/></g><path d="M32 28 V38 M28 34 L32 39 L36 34" fill="none" stroke="#f3e6cf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="46" r="3.5" fill="#f3e6cf"/><rect x="18" y="54" width="28" height="4" rx="2" fill="#ffb347"/></svg>`,
    size: { w: W, h: H },
    roles: [
      { id: 'paddle', label: 'You play the paddle · computer adds bricks', help: 'Move with the mouse or <kbd>←</kbd> <kbd>→</kbd>. <kbd>Space</kbd> or click to serve. The computer keeps adding rows of bricks; the number on a brick is how many hits it takes. Break them before they reach the red line. Catch power-ups: <b>T</b> triples your balls, <b>W</b> widens the paddle, <b>S</b> speeds the balls up. Three lives.' },
      { id: 'watch', label: 'Watch the computer play', help: 'The computer plays the paddle and also adds the bricks. The game restarts by itself when it ends.' },
    ],
    create(api) {
      const humanPaddle = api.role !== 'watch';
      const st = {
        level: 1, score: 0, lives: START_LIVES, destroyed: 0, best: CC.store.get('breakoutBest', 0),
        bricks: [], balls: [], caps: [], parts: [], pad: { x: W / 2 }, pw: PW,
        eff: { wide: 0, fast: 0 }, serving: true, serveT: 0, pause: 0, T: 0, over: false, pending: null, flash: 0,
        aiT: 0, aiTarget: W / 2, lastMouseX: null,
      };
      const baseSpeed = () => 330 * (1 + 0.05 * (st.level - 1));
      const ballSpeed = () => baseSpeed() * (st.eff.fast > 0 ? FAST_FACTOR : 1);
      const march = () => 9 + 1.2 * (st.level - 1);                       // px per second the bricks move down
      const padWidth = () => PW * (st.eff.wide > 0 ? WIDE_FACTOR : 1);

      // ---------- the computer adds bricks ----------
      /** Strength of a new brick: mostly weak early on, more strong ones as the level rises. */
      function randomHp() {
        const L = st.level;
        return 1 + pickWeighted([CC.clamp(0.6 - 0.06 * (L - 1), 0.15, 1), 0.28, CC.clamp(0.1 + 0.03 * L, 0, 0.3), CC.clamp(0.02 * L, 0, 0.25)]);
      }
      function addBrick(col, y, hp) {
        st.bricks.push({ x: X0 + col * (BW + GAP), y, w: BW, h: BH, hp, max: hp, flash: 0 });
      }
      /** A whole row with random gaps. */
      function addRow(y) {
        for (let c = 0; c < COLS; c++) if (Math.random() > 0.2) addBrick(c, y, randomHp());
      }
      function fillStart() { for (let i = 0; i < 4; i++) addRow(SPAWN_Y + (3 - i) * ROW_H); }
      function feedBricks(dt) {
        if (!st.bricks.length) { fillStart(); return; }
        const top = Math.min(...st.bricks.map((b) => b.y));
        const catchUp = 1 + CC.clamp((top - 110) / 120, 0, 3);          // clear the board and the next rows hurry in
        for (const b of st.bricks) b.y += march() * catchUp * dt;
        if (top + march() * catchUp * dt >= SPAWN_Y + ROW_H) addRow(SPAWN_Y);
      }

      // ---------- balls, power-ups, lives ----------
      function newBall(x, y, vx, vy) { return { x, y, vx, vy, last: null, lastT: 0 }; }
      function serve() {
        const a = CC.rand(-0.4, 0.4), sp = ballSpeed();
        st.balls = [newBall(st.pad.x, PAD_Y - PH / 2 - BR - 1, sp * Math.sin(a), -sp * Math.cos(a))];
        st.serving = false; st.serveT = 0; CC.beep(440, 0.05);
      }
      function triple() {
        const extra = [];
        for (const b of st.balls) for (const turn of [-0.4, 0.4]) {
          if (st.balls.length + extra.length >= MAX_BALLS) break;
          const c = Math.cos(turn), s = Math.sin(turn);
          extra.push(newBall(b.x, b.y, b.vx * c - b.vy * s, b.vx * s + b.vy * c));
        }
        st.balls.push(...extra);
      }
      function applyPower(type) {
        if (type === 'triple') triple();
        else if (type === 'wide') st.eff.wide = WIDE_TIME;
        else if (type === 'fast') st.eff.fast = FAST_TIME;
        CC.beep(type === 'triple' ? 740 : type === 'wide' ? 560 : 880, 0.12, 'triangle');
        api.banner(type === 'triple' ? 'Triple ball!' : type === 'wide' ? 'Wide paddle!' : 'Speed up!', '', 700);
      }
      function maybeDrop(r) {
        if (Math.random() > (r.max >= 3 ? 0.3 : 0.16)) return;
        const types = Object.keys(POWER), type = types[pickWeighted(types.map((k) => POWER[k].weight))];
        st.caps.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, type });
      }
      function burst(x, y, color) { for (let i = 0; i < 10; i++) st.parts.push({ x, y, vx: CC.rand(-150, 150), vy: CC.rand(-150, 150), t: 0.4, color }); }
      function damage(r, b) {
        if (b.last === r && st.T - b.lastT < 0.05) return;
        b.last = r; b.lastT = st.T;
        r.hp--; r.flash = 0.1; st.score += 10;
        if (r.hp > 0) { CC.beep(300 + 60 * (4 - r.hp), 0.04, 'square'); return; }
        st.score += 10 * r.max; st.destroyed++;
        burst(r.x + r.w / 2, r.y + r.h / 2, HP_COLOR[r.max]); CC.beep(620, 0.05, 'square');
        maybeDrop(r);
        const lvl = 1 + Math.floor(st.destroyed / BRICKS_PER_LEVEL);
        if (lvl > st.level) { st.level = lvl; api.banner(`Level ${lvl}`, 'Stronger bricks, faster march', 1200); }
      }
      function endGame(why) {
        st.over = true;
        if (humanPaddle && st.score > st.best) { st.best = st.score; CC.store.set('breakoutBest', st.best); }
        if (humanPaddle) api.banner('Game over', `${why} Score ${st.score}. Press R to play again.`, 0);
        else { api.banner('Game over', why, 0); st.pending = { t: 3 }; }
      }
      function loseLife(why) {
        st.lives--; CC.boom(0.4, 0.08); st.flash = 1;
        if (st.lives <= 0) return endGame(why);
        api.banner(why, `${st.lives} ${st.lives === 1 ? 'life' : 'lives'} left`, 1100);
      }
      function reset() {
        Object.assign(st, { level: 1, score: 0, lives: START_LIVES, destroyed: 0, bricks: [], balls: [], caps: [], parts: [], pad: { x: W / 2 }, pw: PW, eff: { wide: 0, fast: 0 }, serving: true, serveT: 0, pause: 0.4, over: false, pending: null, flash: 0 });
        fillStart(); api.hideBanner && api.hideBanner();
      }

      // ---------- the paddle ----------
      function predictX(b, y) {
        if (b.vy <= 0) return null;
        let x = b.x + b.vx * ((y - b.y) / b.vy);
        const lo = BR, span = W - 2 * BR, m = ((x - lo) % (2 * span) + 2 * span) % (2 * span);
        return m <= span ? lo + m : lo + 2 * span - m;
      }
      function movePaddle(dt) {
        const p = st.pad;
        if (humanPaddle) {
          const inp = api.input, kd = (inp.keys.ArrowRight || inp.keys.KeyD ? 1 : 0) - (inp.keys.ArrowLeft || inp.keys.KeyA ? 1 : 0);
          if (kd) { p.x += kd * 540 * dt; st.lastMouseX = inp.mouse.x; }
          else if (inp.mouse.inside && inp.mouse.x !== st.lastMouseX) { const d = inp.mouse.x - p.x, m = 1100 * dt; p.x += CC.clamp(d, -m, m); if (Math.abs(d) < 1) st.lastMouseX = inp.mouse.x; }
          if ((inp.pressed.Space || inp.mouse.clicked) && st.serving && st.pause <= 0) serve();
        } else {
          st.aiT -= dt;
          if (st.aiT <= 0) {
            st.aiT = 0.12;
            const low = st.balls.filter((b) => b.vy > 0).sort((a, b) => b.y - a.y)[0];
            st.aiTarget = low ? (predictX(low, PAD_Y) ?? low.x) + CC.gauss() * 6 : st.serving ? W / 2 : st.aiTarget;
          }
          const m = 560 * dt; p.x += CC.clamp(st.aiTarget - p.x, -m, m);
          if (st.serving && st.pause <= 0) { st.serveT += dt; if (st.serveT > 0.9) serve(); }
        }
        st.pw += CC.clamp(padWidth() - st.pw, -300 * dt, 300 * dt);
        p.x = CC.clamp(p.x, st.pw / 2, W - st.pw / 2);
      }

      // ---------- physics ----------
      function brickAt(b) { for (const r of st.bricks) if (r.hp > 0 && hitRect(b, r)) return r; return null; }
      function stepBall(b, dt) {
        const sp = ballSpeed(), m = Math.hypot(b.vx, b.vy) || 1;
        b.vx *= sp / m; b.vy *= sp / m;
        if (Math.abs(b.vy) < 0.2 * sp) { b.vy = (b.vy < 0 ? -1 : 1) * 0.2 * sp; const k = Math.sqrt(sp * sp - b.vy * b.vy) / (Math.abs(b.vx) || 1); b.vx *= k; }
        const n = Math.max(1, Math.ceil((sp * dt) / 4)), h = dt / n;
        for (let i = 0; i < n; i++) {
          b.x += b.vx * h;
          if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); } else if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx); }
          let r = brickAt(b);
          if (r) { damage(r, b); b.x -= b.vx * h; b.vx = -b.vx; }
          b.y += b.vy * h;
          if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy); }
          r = brickAt(b);
          if (r) { damage(r, b); b.y -= b.vy * h; b.vy = -b.vy; }
          if (b.vy > 0 && Math.abs(b.y - PAD_Y) <= PH / 2 + BR && Math.abs(b.x - st.pad.x) <= st.pw / 2 + BR) {
            const a = CC.clamp((b.x - st.pad.x) / (st.pw / 2), -1, 1) * 1.0;
            b.vx = sp * Math.sin(a); b.vy = -sp * Math.cos(a); b.y = PAD_Y - PH / 2 - BR; CC.beep(330, 0.04);
          }
          if (b.y > H + BR) { b.dead = true; return; }
        }
      }
      function physics(dt) {
        for (const b of st.balls) stepBall(b, dt);
        st.balls = st.balls.filter((b) => !b.dead);
        st.bricks = st.bricks.filter((r) => r.hp > 0);
        if (!st.balls.length && !st.serving) { st.serving = true; st.serveT = 0; st.caps = []; st.eff = { wide: 0, fast: 0 }; loseLife('Ball lost'); }
        // power-ups fall and are caught by the paddle
        for (const c of st.caps) {
          c.y += 120 * dt;
          if (Math.abs(c.y - PAD_Y) < PH / 2 + 11 && Math.abs(c.x - st.pad.x) < st.pw / 2 + 11) { c.got = true; applyPower(c.type); }
        }
        st.caps = st.caps.filter((c) => !c.got && c.y < H + 20);
        // bricks that reach the danger line
        if (!st.over && st.bricks.some((r) => r.y + r.h >= DANGER_Y)) {
          for (const r of st.bricks) if (r.y + r.h >= DANGER_Y) burst(r.x + r.w / 2, r.y + r.h / 2, '#e0405a');
          st.bricks = st.bricks.filter((r) => r.y + r.h < DANGER_Y);
          loseLife('The bricks got through');
        }
      }

      api.banner('Level 1', humanPaddle ? 'Space or click to serve' : 'Computer vs the bricks', 1400);
      reset();
      const hudUpdate = () => api.hud(`Score ${st.score}`, `Level ${st.level} · best ${st.best}`, `Lives ${Math.max(0, st.lives)}`);
      return {
        state: st,
        update(dt) {
          if (st.over) { if (st.pending && (st.pending.t -= dt) <= 0) reset(); hudUpdate(); return; }
          st.T += dt; st.pause = Math.max(0, st.pause - dt); st.flash = Math.max(0, st.flash - dt * 2);
          st.eff.wide = Math.max(0, st.eff.wide - dt); st.eff.fast = Math.max(0, st.eff.fast - dt);
          movePaddle(dt);
          if (st.pause <= 0) {
            if (st.serving) { const b = st.balls[0]; if (b) { b.x = st.pad.x; b.y = PAD_Y - PH / 2 - BR - 1; } }
            else feedBricks(dt);
            if (st.serving && !st.bricks.length) feedBricks(dt);
            physics(dt);
          }
          for (const r of st.bricks) r.flash = Math.max(0, r.flash - dt);
          for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
          st.parts = st.parts.filter((p) => p.t > 0);
          hudUpdate();
        },
        draw(ctx) {
          const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#120a1c'); g.addColorStop(0.7, '#07090e'); g.addColorStop(1, '#1a0a10');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          if (st.flash > 0) { ctx.fillStyle = `rgba(224,64,90,${st.flash * 0.25})`; ctx.fillRect(0, 0, W, H); }
          // danger line
          ctx.strokeStyle = 'rgba(224,64,90,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(0, DANGER_Y); ctx.lineTo(W, DANGER_Y); ctx.stroke(); ctx.setLineDash([]);
          // bricks
          for (const r of st.bricks) {
            ctx.fillStyle = r.flash > 0 ? '#ffffff' : HP_COLOR[r.hp] || HP_COLOR[4];
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(r.x, r.y, r.w, 3);
            ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
            CC.text(ctx, String(r.hp), r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 13, color: '#1a1006', font: 'Chivo, sans-serif' });
          }
          // power-up capsules
          for (const c of st.caps) {
            const P = POWER[c.type];
            CC.glow(ctx, P.color, 10); ctx.fillStyle = P.color; ctx.beginPath(); ctx.arc(c.x, c.y, 11, 0, Math.PI * 2); ctx.fill(); CC.noGlow(ctx);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            CC.text(ctx, P.letter, c.x, c.y + 1, { size: 13, color: '#101018', font: 'Chivo, sans-serif' });
          }
          // paddle
          const p = st.pad, wide = st.eff.wide > 0;
          CC.glow(ctx, wide ? '#7ee07a' : '#ffc46e', 12); ctx.fillStyle = wide ? '#9af08f' : '#ffc46e';
          ctx.beginPath(); ctx.roundRect(p.x - st.pw / 2, PAD_Y - PH / 2, st.pw, PH, 6); ctx.fill(); CC.noGlow(ctx);
          // balls
          const fast = st.eff.fast > 0;
          for (const b of st.balls) { CC.glow(ctx, fast ? '#ff5fd2' : '#fff', 10); ctx.fillStyle = fast ? '#ffd0f2' : '#fff0d0'; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, Math.PI * 2); ctx.fill(); CC.noGlow(ctx); }
          if (st.serving && !st.balls.length) { CC.glow(ctx, '#fff', 10); ctx.fillStyle = '#fff0d0'; ctx.beginPath(); ctx.arc(p.x, PAD_Y - PH / 2 - BR - 1, BR, 0, Math.PI * 2); ctx.fill(); CC.noGlow(ctx); }
          for (const q of st.parts) { ctx.globalAlpha = q.t * 2.5; ctx.fillStyle = q.color; ctx.fillRect(q.x - 2, q.y - 2, 4, 4); } ctx.globalAlpha = 1;
          // active effects
          const tags = []; if (wide) tags.push(`WIDE ${Math.ceil(st.eff.wide)}s`); if (fast) tags.push(`FAST ${Math.ceil(st.eff.fast)}s`);
          if (st.balls.length > 1) tags.push(`${st.balls.length} BALLS`);
          if (tags.length) CC.text(ctx, tags.join('  ·  '), W / 2, H - 14, { size: 12, color: '#ffb347', font: 'Chivo, sans-serif' });
          if (humanPaddle && st.serving && st.pause <= 0 && !st.over) CC.text(ctx, 'Space or click to serve', W / 2, DANGER_Y + 40, { size: 16, color: '#ffb347' });
        },
        destroy() { /* nothing to clean up */ },
      };
    },
  });
})();
