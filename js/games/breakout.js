/* BREAKOUT — head to head.
   Each side has a paddle and a shield wall in front of its goal line; a brick field sits in the middle.
   Knock holes in the other shield and put the ball through. Sit at the bottom or the top. */
(() => {
  'use strict';
  const CC = window.CC;
  const W = 560, H = 720, PW = 88, PH = 12, BR = 7;
  const COLS = 10, BW = 51, BH = 14, GAP = 4, X0 = 7;
  const TOP_Y = 64, BOT_Y = H - 64;

  function makeShields() {
    const s = [];
    for (let c = 0; c < COLS; c++) for (const y of [14]) s.push({ x: X0 + c * (BW + GAP), y, w: BW, h: BH, side: 'top', alive: true });
    for (let c = 0; c < COLS; c++) for (const y of [H - 28]) s.push({ x: X0 + c * (BW + GAP), y, w: BW, h: BH, side: 'bottom', alive: true });
    return s;
  }
  function makeField(level) {
    const f = [], rows = 5, hues = [8, 28, 45, 200, 280];
    const pattern = level % 3; // vary the middle each set
    for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) {
      if (pattern === 1 && (r + c) % 2 === 0) continue;
      if (pattern === 2 && (c === 2 || c === 7) && r !== 2) continue;
      f.push({ x: X0 + c * (BW + GAP), y: 300 + r * 24 - 12, w: BW, h: 18, hue: hues[r], alive: true, mid: true });
    }
    return f;
  }
  const hitRect = (b, r) => b.x + BR > r.x && b.x - BR < r.x + r.w && b.y + BR > r.y && b.y - BR < r.y + r.h;

  CC.register({
    id: 'breakout', title: 'Breakout',
    blurb: 'Head to head: break through their wall before they break yours.',
    icon: `<svg viewBox="0 0 64 64"><g fill="#ffb347"><rect x="6" y="8" width="14" height="6"/><rect x="25" y="8" width="14" height="6"/><rect x="44" y="8" width="14" height="6"/></g><g fill="#e0405a"><rect x="6" y="50" width="14" height="6"/><rect x="44" y="50" width="14" height="6"/></g><circle cx="34" cy="32" r="4" fill="#f3e6cf"/><rect x="18" y="42" width="22" height="4" rx="2" fill="#f3e6cf"/></svg>`,
    size: { w: W, h: H },
    roles: [
      { id: 'bottom', label: 'You at the bottom · computer on top', help: 'Move with the mouse or <kbd>←</kbd> <kbd>→</kbd>. <kbd>Space</kbd> or click to serve. Where the ball hits your paddle sets its angle. First to 3 goals takes the set; win a set and the computer sharpens up.' },
      { id: 'top', label: 'You on top · computer at the bottom', help: 'Same game, other seat. Move with the mouse or <kbd>←</kbd> <kbd>→</kbd>; <kbd>Space</kbd> or click to serve.' },
      { id: 'watch', label: 'Watch computer vs computer', help: 'Both paddles are played by the computer.' },
    ],
    create(api) {
      const role = api.role;
      const humanSide = role === 'bottom' ? 'bottom' : role === 'top' ? 'top' : null;
      const st = {
        level: 1, sets: { top: 0, bottom: 0 }, goals: { top: 0, bottom: 0 },
        pad: { top: { x: W / 2, y: TOP_Y }, bottom: { x: W / 2, y: BOT_Y } },
        ball: { x: W / 2, y: BOT_Y - 20, vx: 0, vy: 0, sp: 0 }, owner: 'bottom',
        serving: 'bottom', serveT: 0, shields: makeShields(), field: makeField(1), parts: [], pause: 0,
        ai: { top: { t: 0, target: W / 2 }, bottom: { t: 0, target: W / 2 } }, lastMouseX: null,
      };
      st.serving = Math.random() < 0.5 ? 'top' : 'bottom';
      const baseSpeed = () => 300 * (1 + 0.07 * (st.level - 1));
      const cpuSkill = () => CC.clamp((st.level - 1) / 5, 0, 1);
      api.banner('Set 1', humanSide ? 'First to 3 goals' : 'Computer vs computer', 1400);

      function hudUpdate() {
        const name = (s) => (s === humanSide ? 'You' : 'CPU');
        api.hud(`${name('top')} (top) ${st.goals.top}  · sets ${st.sets.top}`, `Set ${st.sets.top + st.sets.bottom + 1} · level ${st.level}`, `${name('bottom')} (bottom) ${st.goals.bottom}  · sets ${st.sets.bottom}`);
      }
      function serve() {
        const s = st.serving, p = st.pad[s], sp = baseSpeed(), a = CC.rand(-0.45, 0.45);
        st.ball = { x: p.x, y: s === 'bottom' ? p.y - PH / 2 - BR - 1 : p.y + PH / 2 + BR + 1, vx: sp * Math.sin(a), vy: (s === 'bottom' ? -1 : 1) * sp * Math.cos(a), sp };
        st.owner = s; st.serving = null; CC.beep(440, 0.05);
      }
      function goal(scorer) {
        st.goals[scorer]++; CC.boom(0.3, 0.06); CC.beep(scorer === humanSide ? 880 : 220, 0.25, 'triangle');
        const loser = scorer === 'top' ? 'bottom' : 'top';
        if (st.goals[scorer] >= 3) {
          st.sets[scorer]++;
          if (!humanSide || scorer === humanSide) st.level++;
          api.banner(humanSide ? (scorer === humanSide ? 'Set to you' : 'Set to the computer') : `Set to ${scorer}`, scorer === humanSide ? 'The computer gets sharper' : 'Next set', 1800);
          st.goals = { top: 0, bottom: 0 }; st.shields = makeShields(); st.field = makeField(st.level);
        } else api.banner(scorer === humanSide ? 'Goal!' : humanSide ? 'Conceded' : 'Goal', '', 800);
        st.serving = loser; st.serveT = 0; st.pause = 0.6;
      }
      function burst(x, y, color) { for (let i = 0; i < 10; i++) st.parts.push({ x, y, vx: CC.rand(-150, 150), vy: CC.rand(-150, 150), t: 0.4, color }); }

      // predict where the ball crosses row y, reflecting off the side walls only
      function predictX(b, y) {
        if ((y - b.y) / b.vy < 0) return null;
        let x = b.x + b.vx * ((y - b.y) / b.vy);
        const lo = BR, span = W - 2 * BR, m = ((x - lo) % (2 * span) + 2 * span) % (2 * span);
        x = m <= span ? lo + m : lo + 2 * span - m;
        return x;
      }
      function aiThink(side) {
        const s = cpuSkill(), me = st.pad[side], b = st.ball, ai = st.ai[side];
        const coming = st.serving ? false : side === 'bottom' ? b.vy > 0 : b.vy < 0;
        if (st.serving === side) { ai.target = W / 2 + CC.rand(-80, 80); return; }
        if (!coming) { ai.target = CC.lerp(me.x, st.serving ? W / 2 : b.x, 0.35 + 0.3 * s); return; }
        let px = s < 0.15 ? b.x : predictX(b, me.y);
        if (px == null) px = b.x;
        px += CC.gauss() * (6 + 55 * (1 - s));
        // aim: at higher skill pick the paddle offset that sends the ball toward a hole in the other shield
        let off = CC.rand(-0.35, 0.35);
        if (s > 0.35) {
          const other = side === 'bottom' ? 'top' : 'bottom', gy = other === 'top' ? 30 : H - 30;
          let best = -Infinity;
          for (let o = -0.85; o <= 0.85; o += 0.17) {
            const a = o * 1.0, sp = b.sp, vx = sp * Math.sin(a), vy = (side === 'bottom' ? -1 : 1) * sp * Math.cos(a);
            const lx = predictX({ x: px, y: me.y, vx, vy }, gy);
            if (lx == null) continue;
            const hole = st.shields.some((r) => r.side === other && !r.alive && lx > r.x - 4 && lx < r.x + r.w + 4) ? 1 : 0;
            const sc = hole * 2 + Math.abs(lx - st.pad[other].x) / W + Math.random() * 0.3;
            if (sc > best) { best = sc; off = o; }
          }
          off *= CC.lerp(0.6, 1, s);
        }
        ai.target = px - off * (PW / 2);
      }
      function movePaddle(side, dt) {
        const p = st.pad[side];
        if (side === humanSide) {
          const inp = api.input, kd = (inp.keys.ArrowRight || inp.keys.KeyD ? 1 : 0) - (inp.keys.ArrowLeft || inp.keys.KeyA ? 1 : 0);
          if (kd) { p.x += kd * 540 * dt; st.lastMouseX = inp.mouse.x; }
          else if (inp.mouse.inside && inp.mouse.x !== st.lastMouseX) { const d = inp.mouse.x - p.x, m = 1100 * dt; p.x += CC.clamp(d, -m, m); if (Math.abs(d) < 1) st.lastMouseX = inp.mouse.x; }
          if ((inp.pressed.Space || inp.mouse.clicked) && st.serving === side && st.pause <= 0) serve();
        } else {
          const ai = st.ai[side], s = cpuSkill();
          ai.t -= dt; if (ai.t <= 0) { ai.t = 0.26 - 0.19 * s; aiThink(side); }
          const m = (300 + 330 * s) * dt; p.x += CC.clamp(ai.target - p.x, -m, m);
          if (st.serving === side && st.pause <= 0) { st.serveT += dt; if (st.serveT > 0.9) serve(); }
        }
        p.x = CC.clamp(p.x, PW / 2, W - PW / 2);
      }
      function paddleHit(side) {
        const p = st.pad[side], b = st.ball;
        const dirOk = side === 'bottom' ? b.vy > 0 : b.vy < 0;
        if (!dirOk) return false;
        if (Math.abs(b.y - p.y) > PH / 2 + BR || Math.abs(b.x - p.x) > PW / 2 + BR) return false;
        const off = CC.clamp((b.x - p.x) / (PW / 2), -1, 1), a = off * 1.0;
        b.sp = Math.min(b.sp * 1.03, baseSpeed() * 1.6);
        b.vx = b.sp * Math.sin(a); b.vy = (side === 'bottom' ? -1 : 1) * b.sp * Math.cos(a);
        b.y = side === 'bottom' ? p.y - PH / 2 - BR : p.y + PH / 2 + BR;
        st.owner = side; CC.beep(side === 'bottom' ? 330 : 390, 0.04);
        return true;
      }
      function brickCheck() {
        const b = st.ball;
        for (const list of [st.field, st.shields]) for (const r of list) {
          if (r.alive && hitRect(b, r)) {
            r.alive = false; burst(b.x, b.y, r.mid ? `hsl(${r.hue},80%,60%)` : r.side === 'top' ? '#e0405a' : '#ffb347');
            CC.beep(r.mid ? 600 : 260, 0.04, 'square');
            if (st.field.every((f) => !f.alive)) st.field = makeField(st.level + 1);
            return true;
          }
        }
        return false;
      }
      function physics(dt) {
        const b = st.ball;
        if (st.serving) { const p = st.pad[st.serving]; b.x = p.x; b.y = st.serving === 'bottom' ? p.y - PH / 2 - BR - 1 : p.y + PH / 2 + BR + 1; return; }
        const n = Math.max(1, Math.ceil((b.sp * dt) / 4)), h = dt / n;
        for (let i = 0; i < n; i++) {
          b.x += b.vx * h;
          if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); } else if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx); }
          if (brickCheck()) { b.x -= b.vx * h; b.vx = -b.vx; }
          b.y += b.vy * h;
          if (brickCheck()) { b.y -= b.vy * h; b.vy = -b.vy; }
          paddleHit('bottom'); paddleHit('top');
          if (b.y < -BR) return goal('bottom');
          if (b.y > H + BR) return goal('top');
        }
      }
      hudUpdate();
      return {
        update(dt) {
          st.pause = Math.max(0, st.pause - dt);
          movePaddle('top', dt); movePaddle('bottom', dt);
          if (st.pause <= 0) physics(dt);
          for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
          st.parts = st.parts.filter((p) => p.t > 0);
          hudUpdate();
        },
        draw(ctx) {
          const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0a10'); g.addColorStop(0.5, '#07090e'); g.addColorStop(1, '#1a1206');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = 'rgba(243,230,207,0.08)'; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.setLineDash([]);
          for (const r of st.field) if (r.alive) { ctx.fillStyle = `hsl(${r.hue},70%,55%)`; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(r.x, r.y, r.w, 3); }
          for (const r of st.shields) if (r.alive) { ctx.fillStyle = r.side === 'top' ? '#b8324a' : '#d98f2e'; ctx.fillRect(r.x, r.y, r.w, r.h); }
          for (const side of ['top', 'bottom']) {
            const p = st.pad[side], col = side === 'top' ? '#ff6f86' : '#ffc46e';
            CC.glow(ctx, col, 12); ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(p.x - PW / 2, p.y - PH / 2, PW, PH, 6); ctx.fill(); CC.noGlow(ctx);
            CC.text(ctx, side === humanSide ? 'YOU' : 'CPU', p.x, side === 'top' ? p.y + 20 : p.y - 20, { size: 11, color: 'rgba(243,230,207,.55)', font: 'Chivo, sans-serif' });
          }
          const b = st.ball;
          CC.glow(ctx, '#fff', 10); ctx.fillStyle = st.owner === 'top' ? '#ffd0d8' : '#fff0d0'; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, Math.PI * 2); ctx.fill(); CC.noGlow(ctx);
          for (const p of st.parts) { ctx.globalAlpha = p.t * 2.5; ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); } ctx.globalAlpha = 1;
          if (humanSide && st.serving === humanSide && st.pause <= 0) CC.text(ctx, 'Space or click to serve', W / 2, H / 2, { size: 16, color: '#ffb347' });
        },
      };
    },
  });
})();
