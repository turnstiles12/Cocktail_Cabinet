/* ASTEROIDS
   pilot  : you fly; the computer sends waves.
   sender : the computer flies with the same turn rate, thrust and gun you get; you fling the asteroids.
   watch  : computer on both sides. */
(() => {
  'use strict';
  const CC = window.CC;
  const W = 800, H = 600;
  const ROT = 4.2, THRUST = 240, MAXV = 360, BS = 520, BLIFE = 1.0, MAXB = 5, COOL = 0.17, SHIPR = 10;
  const RAD = { 3: 40, 2: 22, 1: 11 }, PTS = { 3: 20, 2: 50, 1: 100 };
  const wrapD = (d, span) => d - span * Math.round(d / span);
  const wrap = (o) => { o.x = ((o.x % W) + W) % W; o.y = ((o.y % H) + H) % H; };

  function makeRock(x, y, vx, vy, size) {
    const n = 11, shape = [];
    for (let i = 0; i < n; i++) shape.push(CC.rand(0.72, 1.12));
    return { x, y, vx, vy, size, r: RAD[size], shape, rot: CC.rand(0, 6.28), spin: CC.rand(-1, 1) };
  }

  CC.register({
    id: 'asteroids', title: 'Asteroids',
    blurb: 'Fly the ship, or fling the rocks at a computer pilot.',
    icon: `<svg viewBox="0 0 64 64" fill="none" stroke-width="3" stroke-linejoin="round"><path d="M12 14 l10 -4 10 4 2 10 -8 8 -12 -2 -4 -8z" stroke="#f3e6cf"/><path d="M44 50 l-8 -16 -8 16 8 -4z" stroke="#ffb347"/><circle cx="50" cy="22" r="2" fill="#ffb347" stroke="none"/></svg>`,
    size: { w: W, h: H },
    roles: [
      { id: 'pilot', label: 'You fly · computer sends rocks', help: '<kbd>←</kbd> <kbd>→</kbd> turn, <kbd>↑</kbd> thrust, <kbd>Space</kbd> fire. Waves get bigger and faster.' },
      { id: 'sender', label: 'You send rocks · computer flies', help: 'Drag on the screen to fling an asteroid — drag direction and length set its course and speed. A quick click aims at the ship. You cannot launch inside the ring around the ship. Destroy all 3 ships to win; the pilot wins by clearing wave 8, and it gets sharper each wave.' },
      { id: 'watch', label: 'Watch computer vs computer', help: 'Both sides are played by the computer.' },
    ],
    create(api) {
      const role = api.role, humanPilot = role === 'pilot', humanSender = role === 'sender';
      const st = {
        ship: null, rocks: [], bullets: [], parts: [], lives: 3, score: 0, wave: 0, cool: 0,
        dead: 0, deadT: 0, over: false, waveGap: 1.2, ammo: 0, sendCool: 0, idle: 0, nextLife: 10000,
        ai: { t: 0, aim: 0, thrust: false, fire: false, noise: 0 }, drag: null, msg: null,
      };
      const skill = () => (humanSender ? Math.min(0.92, 0.3 + (st.wave - 1) * 0.1) : CC.clamp((st.wave - 1) / 6, 0, 1));
      const maxRockSpeed = () => 70 + 12 * st.wave;

      function newShip() { st.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, inv: 2.5, thrusting: false }; }
      newShip();

      function startWave() {
        st.wave++;
        if (humanSender) { st.ammo = 3 + st.wave; api.banner(`Wave ${st.wave}`, `${st.ammo} asteroids to throw`, 1500); }
        else {
          const n = 3 + st.wave;
          for (let i = 0; i < n; i++) {
            let x, y, tries = 0;
            do { if (Math.random() < 0.5) { x = CC.rand(W); y = Math.random() < 0.5 ? 0 : H; } else { x = Math.random() < 0.5 ? 0 : W; y = CC.rand(H); } tries++; }
            while (tries < 20 && Math.hypot(wrapD(x - st.ship.x, W), wrapD(y - st.ship.y, H)) < 230);
            const a = CC.rand(0, 6.28), sp = CC.rand(35, 60) * (1 + 0.12 * (st.wave - 1));
            st.rocks.push(makeRock(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 3));
          }
          api.banner(`Wave ${st.wave}`, '', 1200);
        }
      }
      function explode(x, y, n, col) { for (let i = 0; i < n; i++) { const a = CC.rand(0, 6.28), s = CC.rand(30, 180); st.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: CC.rand(0.3, 0.9), col }); } }
      function splitRock(r, i) {
        st.rocks.splice(i, 1); explode(r.x, r.y, 8 + r.size * 4, '#f3e6cf'); CC.boom(0.15 + r.size * 0.08, 0.05);
        st.score += PTS[r.size];
        if (st.score >= st.nextLife && !humanSender) { st.lives++; st.nextLife += 10000; CC.beep(1200, 0.2, 'triangle'); }
        if (r.size > 1) {
          const sp = Math.min(Math.hypot(r.vx, r.vy) * 1.3 + 15, 200), base = Math.atan2(r.vy, r.vx);
          for (const s of [-1, 1]) { const a = base + s * CC.rand(0.3, 0.8); st.rocks.push(makeRock(r.x, r.y, Math.cos(a) * sp, Math.sin(a) * sp, r.size - 1)); }
        }
      }
      function shipDies() {
        const s = st.ship; explode(s.x, s.y, 40, '#ffb347'); CC.boom(0.7, 0.1);
        st.ship = null; st.lives--; st.deadT = 0;
        if (st.lives <= 0) {
          st.over = true;
          if (humanSender) api.banner('You win', `The pilot fell on wave ${st.wave}. Press R to play again.`, 0);
          else if (humanPilot) api.banner('Game over', `Score ${st.score}. Press R to play again.`, 0);
          else setTimeout(() => { if (!st.destroyed) { Object.assign(st, { lives: 3, score: 0, wave: 0, over: false, rocks: [] }); newShip(); startWave(); } }, 2500);
        } else api.banner('Ship down', `${st.lives} left`, 1000);
      }
      function fire() {
        const s = st.ship;
        if (!s || st.cool > 0 || st.bullets.length >= MAXB) return;
        st.bullets.push({ x: s.x + Math.cos(s.a) * 14, y: s.y + Math.sin(s.a) * 14, vx: s.vx + Math.cos(s.a) * BS, vy: s.vy + Math.sin(s.a) * BS, t: BLIFE });
        st.cool = COOL; CC.beep(900, 0.04, 'square', 0.02, 0.5);
      }
      function launch(x, y, vx, vy) {
        const s = st.ship;
        if (s && Math.hypot(wrapD(x - s.x, W), wrapD(y - s.y, H)) < 200) { st.msg = { text: 'Too close to the ship', t: 1 }; return CC.beep(140, 0.08); }
        if (!s) { st.msg = { text: 'Wait for the ship to respawn', t: 1 }; return; }
        if (st.ammo <= 0 || st.sendCool > 0) return;
        st.rocks.push(makeRock(x, y, vx, vy, 3)); st.ammo--; st.sendCool = 0.9; st.idle = 0; CC.beep(160, 0.15, 'sawtooth', 0.03, 0.6);
      }

      // ---------- the pilot AI ----------
      function aiThink() {
        const s = st.ship, ai = st.ai, sk = skill();
        ai.noise = CC.gauss() * 0.16 * (1 - sk);
        const horizon = 0.6 + 1.2 * sk;
        let urgent = null, uT = Infinity;
        for (const r of st.rocks) {
          const dx = wrapD(r.x - s.x, W), dy = wrapD(r.y - s.y, H), rvx = r.vx - s.vx, rvy = r.vy - s.vy;
          const vv = rvx * rvx + rvy * rvy || 1e-6, t = CC.clamp(-(dx * rvx + dy * rvy) / vv, 0, 3);
          const cx = dx + rvx * t, cy = dy + rvy * t, miss = Math.hypot(cx, cy);
          if (miss < r.r + SHIPR + 16 && t < horizon && t < uT) { uT = t; urgent = { r, cx, cy, rvx, rvy, t, dist: Math.hypot(dx, dy) }; }
        }
        // best shot: smallest turn + flight time
        let best = null, bc = Infinity;
        for (const r of st.rocks) {
          const dx = wrapD(r.x - s.x, W), dy = wrapD(r.y - s.y, H), rvx = r.vx, rvy = r.vy; // bullets inherit ship velocity, so aim in the ship's frame
          const ux = rvx - s.vx, uy = rvy - s.vy;
          const a = ux * ux + uy * uy - BS * BS, b = 2 * (dx * ux + dy * uy), c = dx * dx + dy * dy;
          const disc = b * b - 4 * a * c; if (disc < 0) continue;
          const t = (-b - Math.sqrt(disc)) / (2 * a), t2 = (-b + Math.sqrt(disc)) / (2 * a);
          const tt = t > 0 ? t : t2 > 0 ? t2 : -1; if (tt < 0) continue;
          const ang = Math.atan2(dy + uy * tt, dx + ux * tt), turn = Math.abs(CC.angleDiff(s.a, ang));
          const cost = turn / ROT + tt + (tt > BLIFE * 0.95 ? 2 : 0) + (urgent && urgent.r === r ? -1 : 0);
          if (cost < bc) { bc = cost; best = { ang, tt, r, dist: Math.sqrt(c) }; }
        }
        ai.thrust = false; ai.fire = false;
        if (urgent && (urgent.t < 0.45 || !best || best.r !== urgent.r || Math.abs(CC.angleDiff(s.a, best.ang)) > 0.6)) {
          // dodge: push away from where the rock will pass closest
          let ex = -urgent.cx, ey = -urgent.cy;
          if (Math.hypot(ex, ey) < 4) { ex = -urgent.rvy; ey = urgent.rvx; }
          ai.aim = Math.atan2(ey, ex); ai.thrust = true; ai.dodging = true;
          if (best && Math.abs(CC.angleDiff(s.a, best.ang)) < 0.25) ai.fire = true;
        } else if (best) {
          ai.dodging = false; ai.aim = best.ang + ai.noise; ai.fire = best.tt < BLIFE * 0.95; ai.tol = 0.05 + 0.12 * (1 - sk) + Math.atan(best.r.r / Math.max(40, best.dist)) * 0.8;
          if (best.tt >= BLIFE * 0.95 && sk > 0.3) ai.thrust = true; // close the distance
        } else { ai.aim = s.a; }
        if (Math.hypot(s.vx, s.vy) > 220) ai.thrust = false;
      }
      function aiControl(dt) {
        const s = st.ship, ai = st.ai;
        ai.t -= dt; if (ai.t <= 0) { ai.t = CC.lerp(0.32, 0.05, skill()); aiThink(); }
        const d = CC.angleDiff(s.a, ai.aim);
        s.a += CC.clamp(d, -ROT * dt, ROT * dt);
        s.thrusting = ai.thrust && Math.abs(d) < (ai.dodging ? 0.7 : 0.4);
        if (ai.fire && Math.abs(CC.angleDiff(s.a, ai.aim)) < (ai.tol || 0.1)) fire();
      }

      startWave();
      return {
        update(dt) {
          const inp = api.input;
          st.cool = Math.max(0, st.cool - dt); st.sendCool = Math.max(0, st.sendCool - dt);
          if (st.msg) { st.msg.t -= dt; if (st.msg.t <= 0) st.msg = null; }
          for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
          st.parts = st.parts.filter((p) => p.t > 0);
          for (const r of st.rocks) { r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt; wrap(r); }
          if (st.over) return;
          // ship
          const s = st.ship;
          if (s) {
            if (humanPilot) {
              if (inp.keys.ArrowLeft || inp.keys.KeyA) s.a -= ROT * dt;
              if (inp.keys.ArrowRight || inp.keys.KeyD) s.a += ROT * dt;
              s.thrusting = !!(inp.keys.ArrowUp || inp.keys.KeyW);
              if (inp.keys.Space) fire();
            } else aiControl(dt);
            if (s.thrusting) { s.vx += Math.cos(s.a) * THRUST * dt; s.vy += Math.sin(s.a) * THRUST * dt; }
            const sp = Math.hypot(s.vx, s.vy); if (sp > MAXV) { s.vx *= MAXV / sp; s.vy *= MAXV / sp; }
            const drag = Math.pow(0.55, dt); s.vx *= drag; s.vy *= drag;
            s.x += s.vx * dt; s.y += s.vy * dt; wrap(s); s.inv = Math.max(0, s.inv - dt);
            if (s.inv <= 0) for (const r of st.rocks) if (Math.hypot(wrapD(r.x - s.x, W), wrapD(r.y - s.y, H)) < r.r * 0.9 + SHIPR) { shipDies(); break; }
          } else {
            st.deadT += dt;
            const clear = st.rocks.every((r) => Math.hypot(wrapD(r.x - W / 2, W), wrapD(r.y - H / 2, H)) > 150);
            if (st.deadT > 1.5 && (clear || st.deadT > 4)) newShip();
          }
          // bullets
          for (const b of st.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt; wrap(b); }
          for (let i = st.bullets.length - 1; i >= 0; i--) {
            const b = st.bullets[i];
            for (let j = st.rocks.length - 1; j >= 0; j--) { const r = st.rocks[j]; if (Math.hypot(wrapD(r.x - b.x, W), wrapD(r.y - b.y, H)) < r.r) { b.t = 0; splitRock(r, j); break; } }
          }
          st.bullets = st.bullets.filter((b) => b.t > 0);
          // sender side
          if (humanSender) {
            if (inp.mouse.clicked) st.drag = { x: inp.mouse.x, y: inp.mouse.y };
            if (inp.mouse.released && st.drag) {
              const dx = inp.mouse.x - st.drag.x, dy = inp.mouse.y - st.drag.y, len = Math.hypot(dx, dy), mx = maxRockSpeed();
              let vx, vy;
              if (len < 10) {
                const sh = st.ship || { x: W / 2, y: H / 2 }, a = Math.atan2(wrapD(sh.y - st.drag.y, H), wrapD(sh.x - st.drag.x, W)) + CC.rand(-0.35, 0.35);
                vx = Math.cos(a) * mx * 0.6; vy = Math.sin(a) * mx * 0.6;
              } else { const sp = Math.min(len * 1.2, mx); vx = (dx / len) * sp; vy = (dy / len) * sp; }
              launch(st.drag.x, st.drag.y, vx, vy); st.drag = null;
            }
            if (!st.rocks.length && st.ammo > 0) { st.idle += dt; if (st.idle > 6 && st.ship) { const a = CC.rand(0, 6.28); launch(CC.rand(W), 0, Math.cos(a) * 60, Math.sin(a) * 60); } }
          }
          // wave over?
          if (!st.rocks.length && (!humanSender || st.ammo <= 0) && !st.over) {
            st.waveGap -= dt;
            if (st.waveGap <= 0) {
              st.waveGap = 1.5;
              if (humanSender && st.wave >= 8) { st.over = true; api.banner('The pilot wins', 'It cleared wave 8. Press R to play again.', 0); return; }
              startWave();
            }
          }
          if (humanSender) api.hud(`Ships left ${st.lives}`, `Wave ${st.wave} of 8`, `Your rocks ${st.ammo}`);
          else api.hud(`${humanPilot ? 'You' : 'Pilot'} ${st.score}`, `Wave ${st.wave}`, `Ships ${st.lives}`);
        },
        draw(ctx) {
          ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = 'rgba(243,230,207,.35)';
          for (let i = 0; i < 70; i++) ctx.fillRect((i * 137) % W, (i * 251) % H, 1.5, 1.5);
          const at = (x, y, r, fn) => { for (const ox of [0, -W, W]) for (const oy of [0, -H, H]) { const px = x + ox, py = y + oy; if (px > -r && px < W + r && py > -r && py < H + r) fn(px, py); } };
          ctx.lineWidth = 2;
          for (const r of st.rocks) at(r.x, r.y, r.r, (x, y) => {
            ctx.strokeStyle = '#f3e6cf'; ctx.beginPath();
            r.shape.forEach((k, i) => { const a = r.rot + (i / r.shape.length) * Math.PI * 2, px = x + Math.cos(a) * r.r * k, py = y + Math.sin(a) * r.r * k; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
            ctx.closePath(); ctx.stroke();
          });
          const s = st.ship;
          if (s && !(s.inv > 0 && Math.floor(s.inv * 8) % 2)) at(s.x, s.y, 20, (x, y) => {
            ctx.save(); ctx.translate(x, y); ctx.rotate(s.a);
            ctx.strokeStyle = '#ffb347'; CC.glow(ctx, '#ffb347', 8); ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, -9); ctx.lineTo(-6, 0); ctx.lineTo(-10, 9); ctx.closePath(); ctx.stroke(); CC.noGlow(ctx);
            if (s.thrusting && Math.random() < 0.8) { ctx.strokeStyle = '#e0405a'; ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(-17 - Math.random() * 6, 0); ctx.lineTo(-7, 4); ctx.stroke(); }
            ctx.restore();
          });
          ctx.fillStyle = '#fff';
          for (const b of st.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, 6.28); ctx.fill(); }
          for (const p of st.parts) { ctx.globalAlpha = Math.min(1, p.t * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); } ctx.globalAlpha = 1;
          if (humanSender && !st.over) {
            if (s) { ctx.strokeStyle = 'rgba(224,64,90,.35)'; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.arc(s.x, s.y, 200, 0, 6.28); ctx.stroke(); ctx.setLineDash([]); }
            if (st.drag) {
              const m = api.input.mouse, dx = m.x - st.drag.x, dy = m.y - st.drag.y, len = Math.hypot(dx, dy);
              ctx.strokeStyle = '#ffb347'; ctx.beginPath(); ctx.arc(st.drag.x, st.drag.y, RAD[3], 0, 6.28); ctx.stroke();
              if (len > 10) { const sp = Math.min(len * 1.2, maxRockSpeed()), k = sp / 1.2 / len; ctx.beginPath(); ctx.moveTo(st.drag.x, st.drag.y); ctx.lineTo(st.drag.x + dx * k, st.drag.y + dy * k); ctx.stroke(); }
            }
            const cw = 120; ctx.fillStyle = 'rgba(255,179,71,.25)'; ctx.fillRect(W - cw - 14, H - 22, cw, 8);
            ctx.fillStyle = '#ffb347'; ctx.fillRect(W - cw - 14, H - 22, cw * (1 - st.sendCool / 0.9), 8);
          }
          if (st.msg) CC.text(ctx, st.msg.text, W / 2, 30, { size: 16, color: '#e0405a' });
        },
        destroy() { st.destroyed = true; },
      };
    },
  });
})();
