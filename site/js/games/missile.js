/**
 * Game: Missile Command.
 *
 * @file Defend six cities from falling missiles, or lead the attack.
 *  - defend : you fire interceptors from three batteries; the computer attacks in waves.
 *  - attack : the designed flip. You pick targets and can break high warheads into three
 *    (limited per wave). The computer runs the three batteries with the same interceptor
 *    speed, blast size and ammunition a human defender gets. Flatten all six cities to win;
 *    the defense wins by surviving wave 7.
 *  - watch : the computer plays both sides.
 *
 * The computer defense solves for an intercept point per warhead, skips warheads already
 * covered by a blast, and at higher skill ignores warheads aimed at rubble.
 *
 * @module games/missile
 * @requires js/core.js
 */
(() => {
  'use strict';
  const CC = window.CC;
  const W = 800, H = 600, GROUND = 560;
  const CITY_X = [140, 205, 270, 530, 595, 660], BAT_X = [50, 400, 750];
  const BLAST = 36, GROW = 90, HOLD = 0.3, AMMO = 10;
  const counterSpeed = (i) => (i === 1 ? 700 : 520);

  CC.register({
    id: 'missile', title: 'Missile Command',
    blurb: 'Defend six cities, or lead the attack against a computer defense.',
    icon: `<svg viewBox="0 0 64 64" fill="none" stroke-width="2.5"><path d="M8 4 L22 46 M40 2 L30 44" stroke="#e0405a"/><path d="M32 60 L48 30" stroke="#f3e6cf"/><circle cx="48" cy="28" r="8" stroke="#ffb347"/><path d="M4 58 H60" stroke="#c9a15a" stroke-width="4"/></svg>`,
    size: { w: W, h: H },
    roles: [
      { id: 'defend', label: 'You defend · computer attacks', help: 'Click to fire from the nearest battery with ammo, or aim with the mouse and press <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> for the left, middle or right battery. Interceptors burst where you click. Waves grow and speed up.' },
      { id: 'attack', label: 'You attack · computer defends', help: 'Click near the ground to send a missile at that spot. Press <kbd>Space</kbd> to split every warhead still high in the sky into three (limited per wave). Flatten all six cities to win; the defense wins by surviving wave 7 and sharpens up each wave. Cities stay destroyed; batteries are rebuilt between waves.' },
      { id: 'watch', label: 'Watch computer vs computer', help: 'Both sides are played by the computer.' },
    ],
    create(api) {
      const role = api.role, humanDef = role === 'defend', humanAtk = role === 'attack';
      const st = {
        cities: CITY_X.map((x) => ({ x, alive: true })), bats: BAT_X.map((x) => ({ x, alive: true, ammo: AMMO })),
        inc: [], ctr: [], exp: [], parts: [], wave: 0, score: 0, over: false, gap: 2,
        toSpawn: 0, spawnT: 0, atkAmmo: 0, mirv: 0, atkCool: 0, ai: { cool: 0, atkT: 0 }, nextCity: 10000, id: 0, mouseSeen: false,
      };
      const L = () => st.wave;
      const defSkill = () => (humanAtk ? Math.min(0.9, 0.1 + (L() - 1) * 0.13) : CC.clamp((L() - 1) / 6, 0, 1));
      const missileSpeed = () => (humanAtk ? Math.min(55 + 6 * L(), 150) : Math.min(40 + 8 * L(), 150));

      function startWave() {
        st.wave++;
        for (const b of st.bats) { b.alive = true; b.ammo = AMMO; }
        if (humanAtk) { st.atkAmmo = 7 + 2 * L(); st.mirv = 1 + Math.floor(L() / 2); api.banner(`Wave ${L()}`, `${st.atkAmmo} missiles · ${st.mirv} split${st.mirv > 1 ? 's' : ''}`, 1500); }
        else { st.toSpawn = 8 + 3 * L(); st.spawnT = 1; api.banner(`Wave ${L()}`, humanDef ? 'Defend the cities' : '', 1300); }
      }
      function targets() {
        const t = [];
        for (const c of st.cities) if (c.alive) t.push({ x: c.x, w: 3 });
        for (const b of st.bats) if (b.alive) t.push({ x: b.x, w: 1 });
        return t;
      }
      function launchIncoming(sx, tx, speed, from) {
        const sy = from ? from.y : 0, d = Math.hypot(tx - sx, GROUND - sy);
        st.inc.push({ id: ++st.id, sx, sy, x: sx, y: sy, tx, ty: GROUND, vx: ((tx - sx) / d) * speed, vy: ((GROUND - sy) / d) * speed, split: !!from, splitY: CC.rand(150, 280), seen: 0, assigned: 0 });
      }
      function split(m, n, spread) {
        m.dead = true;
        for (let i = 0; i < n; i++) {
          const tx = CC.clamp(m.tx + (i - (n - 1) / 2) * spread + CC.rand(-15, 15), 10, W - 10);
          launchIncoming(m.x, tx, Math.hypot(m.vx, m.vy), m);
        }
        CC.beep(300, 0.1, 'sawtooth', 0.03, 1.5);
      }
      function fireCounter(bi, tx, ty, target) {
        const b = st.bats[bi];
        if (!b.alive || b.ammo <= 0) return false;
        ty = Math.min(ty, GROUND - 30);
        b.ammo--;
        st.ctr.push({ id: ++st.id, sx: b.x, sy: GROUND - 14, x: b.x, y: GROUND - 14, tx, ty, sp: counterSpeed(bi), target });
        CC.beep(1000, 0.05, 'square', 0.02, 0.6);
        return true;
      }
      function boom(x, y, max, kind) { st.exp.push({ x, y, r: 1, max, t: 0, kind }); }

      // ---------- computer defense ----------
      function mPos(m, t) { return { x: m.x + m.vx * t, y: m.y + m.vy * t }; }
      function aiDefend(dt) {
        const s = defSkill(), ai = st.ai;
        ai.cool = Math.max(0, ai.cool - dt);
        for (const m of st.inc) m.seen += dt;
        if (ai.cool > 0) return;
        const react = CC.lerp(0.9, 0.2, s);
        const alive = targets();
        const cand = st.inc.filter((m) => !m.dead && !m.assigned && m.seen > react && m.y < GROUND - 60 &&
          (s < 0.5 || alive.some((t) => Math.abs(t.x - m.tx) < 30))) // a sharp defense ignores warheads aimed at rubble
          .sort((a, b) => (GROUND - a.y) / a.vy - (GROUND - b.y) / b.vy);
        for (const m of cand) {
          // is a blast already going to catch it?
          if (s > 0.3) {
            const covered = st.ctr.some((c) => { const tl = Math.hypot(c.tx - c.x, c.ty - c.y) / c.sp + 0.2, p = mPos(m, tl); return Math.hypot(p.x - c.tx, p.y - c.ty) < BLAST * 0.7; });
            if (covered) { m.assigned = -1; continue; }
          }
          let best = null;
          st.bats.forEach((b, i) => {
            if (!b.alive || b.ammo <= 0) return;
            let t = 0.3, p = null;
            for (let k = 0; k < 6; k++) { p = mPos(m, t + 0.15); t = Math.hypot(p.x - b.x, p.y - (GROUND - 14)) / counterSpeed(i); }
            if (p.y > GROUND - 35) return;
            const pref = s < 0.3 ? Math.random() : t;
            if (!best || pref < best.pref) best = { i, p, pref };
          });
          if (!best) continue;
          const err = 3 + 34 * (1 - s);
          if (fireCounter(best.i, best.p.x + CC.gauss() * err, best.p.y + CC.gauss() * err, m.id)) { m.assigned = st.id; ai.cool = CC.lerp(0.55, 0.14, s); }
          break;
        }
      }
      // ---------- computer attack ----------
      function aiAttack(dt) {
        if (st.toSpawn <= 0) return;
        st.spawnT -= dt;
        if (st.spawnT > 0) return;
        st.spawnT = Math.max(0.35, 1.7 - 0.12 * L()) * CC.rand(0.6, 1.4);
        const t = targets(); if (!t.length) return;
        const total = t.reduce((a, b) => a + b.w, 0); let r = CC.rand(total), pick = t[0];
        for (const x of t) { r -= x.w; if (r <= 0) { pick = x; break; } }
        launchIncoming(CC.rand(20, W - 20), pick.x + CC.rand(-8, 8), missileSpeed());
        const m = st.inc[st.inc.length - 1];
        if (L() >= 3 && Math.random() < 0.2) m.willSplit = 2 + (L() >= 6 ? 1 : 0);
        st.toSpawn--;
      }

      function hitGround(m) {
        m.dead = true; boom(m.x, GROUND - 4, 30, 'hit'); CC.boom(0.4, 0.07);
        for (const c of st.cities) if (c.alive && Math.abs(c.x - m.x) < 28) { c.alive = false; if (humanAtk) { st.score += 100; CC.beep(880, 0.15, 'triangle'); } }
        for (const b of st.bats) if (b.alive && Math.abs(b.x - m.x) < 28) { b.alive = false; b.ammo = 0; if (humanAtk) st.score += 50; }
      }

      function hudNow(citiesLeft) {
        if (humanAtk) api.hud(`Cities down ${6 - citiesLeft} / 6`, `Wave ${L()} of 7`, `Missiles ${st.atkAmmo} · splits ${st.mirv}`);
        else api.hud(`${humanDef ? 'You' : 'Defense'} ${st.score}`, `Wave ${L()}`, `Cities ${citiesLeft} · ammo ${st.bats.map((b) => (b.alive ? b.ammo : 'x')).join(' ')}`);
      }

      startWave();
      return {
        update(dt) {
          const inp = api.input;
          for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; } st.parts = st.parts.filter((p) => p.t > 0);
          // explosions
          for (const e of st.exp) {
            e.t += dt;
            const grow = e.max / GROW;
            e.r = e.t < grow ? e.t * GROW : e.t < grow + HOLD ? e.max : e.max - (e.t - grow - HOLD) * GROW;
          }
          st.exp = st.exp.filter((e) => e.r > 0);
          if (st.over) return;
          // human input
          if (humanDef) {
            const my = Math.min(inp.mouse.y, GROUND - 30);
            let bi = -1;
            if (inp.pressed.KeyA) bi = 0; else if (inp.pressed.KeyS) bi = 1; else if (inp.pressed.KeyD) bi = 2;
            if (bi >= 0) fireCounter(bi, inp.mouse.x, my);
            if (inp.mouse.clicked) {
              const order = [0, 1, 2].filter((i) => st.bats[i].alive && st.bats[i].ammo > 0).sort((a, b) => Math.abs(st.bats[a].x - inp.mouse.x) - Math.abs(st.bats[b].x - inp.mouse.x));
              if (order.length) fireCounter(order[0], inp.mouse.x, my); else CC.beep(100, 0.1);
            }
          } else aiDefend(dt);
          if (humanAtk) {
            st.atkCool = Math.max(0, st.atkCool - dt);
            if (inp.mouse.clicked && st.atkAmmo > 0 && st.atkCool <= 0) {
              const tx = CC.clamp(inp.mouse.x, 10, W - 10);
              launchIncoming(CC.clamp(tx + CC.rand(-220, 220), 10, W - 10), tx, missileSpeed());
              st.atkAmmo--; st.atkCool = 0.35; CC.beep(200, 0.08, 'sawtooth', 0.03);
            }
            if (inp.pressed.Space && st.mirv > 0) {
              const high = st.inc.filter((m) => !m.dead && m.y < 380);
              if (high.length) { st.mirv--; for (const m of high) split(m, 3, 70); }
            }
          } else aiAttack(dt);
          // counters
          for (const c of st.ctr) {
            const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy), step = c.sp * dt;
            if (d <= step) { c.done = true; boom(c.tx, c.ty, BLAST, 'def'); CC.boom(0.2, 0.04); }
            else { c.x += (dx / d) * step; c.y += (dy / d) * step; }
          }
          st.ctr = st.ctr.filter((c) => !c.done);
          // incoming
          for (const m of st.inc) {
            if (m.dead) continue;
            m.x += m.vx * dt; m.y += m.vy * dt;
            if (m.willSplit && m.y > m.splitY) { split(m, m.willSplit, 60); continue; }
            for (const e of st.exp) if (Math.hypot(m.x - e.x, m.y - e.y) < e.r) {
              m.dead = true; boom(m.x, m.y, 22, 'chain');
              if (humanDef) st.score += 25;
              break;
            }
            if (!m.dead && m.y >= m.ty) hitGround(m);
          }
          // an interceptor that burst without killing its target frees the target for another try
          for (const m of st.inc) if (m.assigned > 0 && !st.ctr.some((c) => c.id === m.assigned) && !st.exp.some((e) => e.kind === 'def' && e.t < 0.7)) m.assigned = 0;
          for (const m of st.inc) if (m.assigned === -1 && !st.ctr.length) m.assigned = 0;
          st.inc = st.inc.filter((m) => !m.dead);
          // end conditions
          const citiesLeft = st.cities.filter((c) => c.alive).length;
          if (!citiesLeft) {
            st.over = true; hudNow(0);
            if (humanAtk) api.banner('You win', `Every city fell on wave ${L()}. Press R to play again.`, 0);
            else if (humanDef) api.banner('The end', `Score ${st.score}. Press R to play again.`, 0);
            else setTimeout(() => { if (!st.destroyed) { st.cities.forEach((c) => (c.alive = true)); st.wave = 0; st.inc = []; st.ctr = []; st.over = false; startWave(); } }, 2500);
            return;
          }
          const waveDone = st.inc.length === 0 && st.ctr.length === 0 && (humanAtk ? st.atkAmmo <= 0 : st.toSpawn <= 0);
          if (waveDone) {
            st.gap -= dt;
            if (st.gap <= 0) {
              st.gap = 2;
              if (humanDef) {
                const bonus = citiesLeft * 100 + st.bats.reduce((a, b) => a + b.ammo * 5, 0); st.score += bonus;
                while (st.score >= st.nextCity) { st.nextCity += 10000; const dead = st.cities.find((c) => !c.alive); if (dead) dead.alive = true; }
              }
              if (humanAtk && L() >= 7) { st.over = true; api.banner('The defense holds', `${citiesLeft} ${citiesLeft === 1 ? 'city' : 'cities'} survived 7 waves. Press R to play again.`, 0); return; }
              startWave();
            }
          }
          hudNow(citiesLeft);
        },
        draw(ctx) {
          const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#060812'); g.addColorStop(1, '#1d1420');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#8a6a36'; ctx.fillRect(0, GROUND, W, H - GROUND);
          ctx.fillStyle = '#c9a15a'; ctx.fillRect(0, GROUND, W, 3);
          for (const c of st.cities) {
            if (c.alive) {
              ctx.fillStyle = '#ffb347';
              [[-18, 10, 14], [-6, 7, 22], [4, 8, 16], [13, 6, 11]].forEach(([dx, w, h]) => ctx.fillRect(c.x + dx, GROUND - h, w, h));
            } else { ctx.fillStyle = '#4a3a2a'; ctx.fillRect(c.x - 18, GROUND - 4, 36, 4); }
          }
          st.bats.forEach((b) => {
            ctx.fillStyle = b.alive ? '#c9a15a' : '#4a3a2a';
            ctx.beginPath(); ctx.moveTo(b.x - 30, GROUND); ctx.lineTo(b.x - 14, GROUND - 16); ctx.lineTo(b.x + 14, GROUND - 16); ctx.lineTo(b.x + 30, GROUND); ctx.fill();
            if (b.alive) { ctx.fillStyle = '#f3e6cf'; for (let i = 0; i < b.ammo; i++) ctx.fillRect(b.x - 19 + (i % 5) * 8, GROUND + 10 + Math.floor(i / 5) * 8, 5, 5); }
          });
          ctx.lineWidth = 1.5;
          for (const m of st.inc) {
            ctx.strokeStyle = 'rgba(224,64,90,.8)'; ctx.beginPath(); ctx.moveTo(m.sx, m.sy); ctx.lineTo(m.x, m.y); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
          }
          for (const c of st.ctr) {
            ctx.strokeStyle = 'rgba(243,230,207,.8)'; ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(c.x, c.y); ctx.stroke();
            ctx.strokeStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(c.tx - 4, c.ty - 4); ctx.lineTo(c.tx + 4, c.ty + 4); ctx.moveTo(c.tx + 4, c.ty - 4); ctx.lineTo(c.tx - 4, c.ty + 4); ctx.stroke();
          }
          for (const e of st.exp) {
            const hue = (e.t * 900) % 360;
            ctx.fillStyle = e.kind === 'hit' ? `hsla(${20 + (e.t * 200) % 40},90%,60%,.85)` : `hsla(${hue},90%,65%,.85)`;
            ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(0, e.r), 0, 6.28); ctx.fill();
          }
          const m = api.input.mouse;
          if (m.inside && !st.over && (humanDef || humanAtk)) {
            ctx.strokeStyle = humanAtk ? '#e0405a' : '#ffb347'; ctx.lineWidth = 2;
            const y = humanDef ? Math.min(m.y, GROUND - 30) : GROUND - 6;
            ctx.beginPath(); ctx.arc(m.x, y, 8, 0, 6.28); ctx.moveTo(m.x - 13, y); ctx.lineTo(m.x + 13, y); ctx.moveTo(m.x, y - 13); ctx.lineTo(m.x, y + 13); ctx.stroke();
            if (humanAtk) { ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(224,64,90,.35)'; ctx.beginPath(); ctx.moveTo(m.x, 0); ctx.lineTo(m.x, GROUND); ctx.stroke(); ctx.setLineDash([]); }
          }
        },
        destroy() { st.destroyed = true; },
      };
    },
  });
})();
