/**
 * Game: Wheel of Terror.
 *
 * @file A ball swings round a pivot on a rod. Directly below, a conveyor belt touches the
 * bottom of the ball's circle and carries objects in from both sides toward the point under
 * the pivot. Smash them with the ball before they get there. The ball always turns, slowly;
 * holding Space (or the mouse button, or a finger) spins it faster, and letting go lets it
 * slow back down. Every so often a spike warns, then pops out of the rim at some angle
 * round the circle; the ball must not be there while it is out, so you speed up or slow
 * down to arrive early or late, while still catching the objects.
 *
 * Objects: crates (1 hit), barrels (2 hits) and iron blocks (2 hits, and only a fast ball
 * can damage them). An object that reaches the point under the pivot, or a spike that
 * touches the ball, costs one of the wheel's lives.
 *
 * Sides:
 *  - swing  : you spin the ball; the computer sends objects and spikes in waves. Waves last
 *    25 seconds; each is a little faster, with shorter spike warnings.
 *  - sender : the flip. The computer spins the ball with the same speed limits and the same
 *    one control you have; you spend credits to drop objects on the belt (crate 1, barrel 2,
 *    iron 3) and to plant spikes on the rim (4). A spike is only accepted if the ball has
 *    some way to dodge it. Take all the wheel's lives to win; the wheel wins by surviving
 *    six waves, and the computer swinger sharpens every wave.
 *  - watch  : the computer swings against the computer sender.
 *
 * The computer swinger tries about fifty short plans (hold or release, with up to two
 * changes) by simulating the ball, the objects and the spikes ahead, and follows the best.
 * Skill sets how far ahead it looks, how often it re-plans and how often it slips.
 * The computer sender places only spikes that the ball could dodge.
 *
 * Test hook: the object returned by create() exposes {@code state}, {@code think(skill)}
 * and {@code tools} (sendObject, sendSpike).
 *
 * @module games/wheel
 * @requires js/core.js
 */
(() => {
  'use strict';
  const CC = window.CC;

  // ---------- geometry ----------
  const W = 800, H = 600, CX = 400, CY = 215, R = 150, BR = 14;   // pivot, orbit radius, ball radius
  const BELT_Y = CY + R + BR, OBJ_H = 28;                         // the belt touches the bottom of the ball's circle
  const REACH = 12;                                               // an object this close to the centre has reached the wheel

  // ---------- the swing ----------
  const W0 = 1.4, WMAX = 8, A_UP = 9, A_DOWN = 5;                 // rad/s: slow speed, top speed, speeding up and slowing down (rad/s²)
  const IRON_MIN = 4.5;                                           // iron blocks only break when the ball is at least this fast

  // ---------- spikes ----------
  const RISE = 0.12, RETRACT = 0.25, SPIKE_LEN = 52, SPIKE_BASE_R = R + 40;

  // ---------- waves ----------
  const WAVE_SECONDS = 25, WAVES_TO_WIN = 6;

  // ---------- the sender's shop ----------
  const START_CREDITS = 15, INCOME = 2.0, CREDIT_CAP = 25, SPIKE_COST = 4;
  const TYPES = {
    crate: { hp: 1, w: 30, color: '#e6b34a', cost: 1, pts: 10, armored: false },
    barrel: { hp: 2, w: 34, color: '#e07b3c', cost: 2, pts: 25, armored: false },
    iron: { hp: 2, w: 34, color: '#8aa0c4', cost: 3, pts: 40, armored: true },
  };

  const ballXY = (th) => ({ x: CX + R * Math.sin(th), y: CY + R * Math.cos(th) });

  /** Speeds the ball up while `hold` is true, slows it toward the slow speed otherwise, then turns it. */
  function spinStep(b, hold, dt) {
    b.w = hold ? Math.min(WMAX, b.w + A_UP * dt) : Math.max(W0, b.w - A_DOWN * dt);
    b.th += b.w * dt;
  }

  /** How far out a spike is at time t: 0 hidden, 1 fully out. A spike warns until `upAt`, rises, holds, then retracts. */
  function spikeExt(sp, t) {
    const u = t - sp.upAt;
    if (u < 0) return 0;
    if (u < RISE) return u / RISE;
    if (u < RISE + sp.hold) return 1;
    if (u < RISE + sp.hold + RETRACT) return 1 - (u - RISE - sp.hold) / RETRACT;
    return 0;
  }

  /** Does a spike at this extension touch a ball centred at (bx, by)? */
  function spikeTouch(sp, ext, bx, by) {
    if (ext < 0.15) return false;
    const ox = CX + SPIKE_BASE_R * Math.sin(sp.a), oy = CY + SPIKE_BASE_R * Math.cos(sp.a);
    const tr = SPIKE_BASE_R - SPIKE_LEN * ext, tx = CX + tr * Math.sin(sp.a), ty = CY + tr * Math.cos(sp.a);
    const dx = tx - ox, dy = ty - oy, u = CC.clamp(((bx - ox) * dx + (by - oy) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(bx - (ox + u * dx), by - (oy + u * dy)) < BR + 5;
  }

  /** Does a ball centred at (bx, by) touch an object standing on the belt? */
  function ballHitsObj(bx, by, o) {
    const cx = CC.clamp(bx, o.x - o.w / 2, o.x + o.w / 2), cy = CC.clamp(by, BELT_Y - OBJ_H, BELT_Y);
    return (bx - cx) * (bx - cx) + (by - cy) * (by - cy) < BR * BR;
  }

  // ---------- plans: hold or release, changing up to twice ----------
  const POLICIES = [];
  for (const first of [true, false]) {
    for (const s1 of [Infinity, 0, 0.15, 0.3, 0.5, 0.8, 1.2, 1.8, 2.5]) POLICIES.push({ first, s1, s2: Infinity });
    for (const s1 of [0.2, 0.5, 0.9, 1.4]) for (const d of [0.3, 0.6, 1.0, 1.6]) POLICIES.push({ first, s1, s2: s1 + d });
  }
  const polHold = (p, t) => (((t >= p.s1 ? 1 : 0) + (t >= p.s2 ? 1 : 0)) % 2 === 0 ? p.first : !p.first);

  CC.register({
    id: 'wheel', title: 'Wheel of Terror',
    blurb: 'Swing a ball to smash what the belt carries in, and dodge the spikes.',
    icon: `<svg viewBox="0 0 64 64"><circle cx="32" cy="24" r="17" fill="none" stroke="#c9a15a" stroke-width="2" stroke-dasharray="3 3"/><line x1="32" y1="24" x2="44" y2="36" stroke="#f3e6cf" stroke-width="2"/><circle cx="44" cy="36" r="5" fill="#ffb347"/><path d="M14 20 l5 -4 0 8z" fill="#e0405a"/><rect x="4" y="50" width="56" height="6" rx="2" fill="#5a4630"/><rect x="12" y="42" width="9" height="8" fill="#e6b34a"/><rect x="43" y="42" width="9" height="8" fill="#8aa0c4"/></svg>`,
    size: { w: W, h: H },
    roles: [
      { id: 'swing', label: 'You swing · computer sends objects and spikes', help: 'Hold <kbd>Space</kbd> (or the mouse button, or a finger) to spin the ball faster; let go and it slows. Smash the objects on the belt before they reach the middle. When a spike glows, make sure the ball is not at that spot while it is out — speed up or slow down to arrive early or late. Iron blocks only break when the ball is fast.' },
      { id: 'sender', label: 'You send objects and spikes · computer swings', layout: 'split', help: 'You are the sender. Click the belt (not too near the middle) to drop the chosen object, and click the ring to plant a spike. Objects cost 1 to 3 credits and spikes 4. A spike is only accepted if the ball has some way to dodge it. Take all the wheel\'s lives to win; the wheel wins by lasting six waves, and the computer swinger sharpens every wave.' },
      { id: 'watch', label: 'Watch computer vs computer', help: 'The computer swings against the computer sender.' },
    ],
    create(api) {
      const role = api.role;
      const humanSwing = role === 'swing', humanSend = role === 'sender';
      const st = {
        T: 0, th: 0.6, w: W0, hold: false, trail: [], lives: 3, score: 0, best: CC.store.get('wheelBest', 0),
        wave: 1, waveT: 0, objs: [], spikes: [], parts: [], inv: 0, over: false, pending: null, flash: 0, msg: null,
        credits: START_CREDITS, sel: 'crate', cool: 0, spikeCool: 0, gen: { objT: 2.5, spikeT: 10 }, ai: { t: 0, hold: false }, killed: 0,
      };
      const ramp = () => CC.clamp((st.wave - 1) / 9, 0, 1);
      const skill = () => CC.clamp(0.35 + (st.wave - 1) * 0.13, 0, 1);  // the computer swinger's dial: starts steady, full strength at wave 6
      const objSpeed = () => CC.lerp(46, 100, ramp());                    // belt speed in px/s
      const warnTime = () => CC.lerp(1.7, 1.0, ramp());
      const holdTime = () => CC.lerp(0.7, 1.0, ramp());

      // ---------- the sender's shop panel ----------
      let shop = null;
      if (humanSend) {
        const credEl = CC.el('p', { class: 'status' });
        const buy = Object.keys(TYPES).map((k) => CC.el('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === st.sel), onclick: () => select(k) },
          CC.el('span', { style: `display:inline-block;width:.8em;height:.8em;border-radius:2px;margin-right:.5em;background:${TYPES[k].color}` }),
          `${k[0].toUpperCase()}${k.slice(1)} · ${TYPES[k].cost} credit${TYPES[k].cost > 1 ? 's' : ''} · ${TYPES[k].hp} hit${TYPES[k].hp > 1 ? 's' : ''}${TYPES[k].armored ? ' · fast ball only' : ''}`));
        api.panel.append(CC.el('div', { class: 'stack' },
          CC.el('h4', { text: "Sender's shop" }), credEl,
          CC.el('p', { text: 'Pick an object, then click the belt (at least 100 px from the middle) to drop it.' }), ...buy,
          CC.el('p', { text: `Click the ring to plant a spike for ${SPIKE_COST} credits. It only goes in if the ball can still dodge it.` }),
          CC.el('p', { text: 'Keys: 1 crate, 2 barrel, 3 iron. Credits trickle in all the time.' })));
        shop = { credEl, buy, last: '' };
      }
      function refreshShop() {
        if (!shop) return;
        const c = Math.floor(st.credits), key = c + '|' + st.sel;
        if (key === shop.last) return; shop.last = key;
        shop.credEl.textContent = `Credits: ${c}`;
        Object.keys(TYPES).forEach((k, i) => { shop.buy[i].setAttribute('aria-pressed', String(k === st.sel)); shop.buy[i].disabled = c < TYPES[k].cost; });
      }
      function select(k) { st.sel = k; if (shop) shop.last = ''; }
      const say = (text) => { st.msg = { text, t: 1.4 }; };

      // ---------- what the sender can put in ----------
      function addObject(type, x, v) {
        const t = TYPES[type];
        st.objs.push({ type, x, w: t.w, hp: t.hp, max: t.hp, armored: t.armored, v, cool: 0, flash: 0 });
      }
      /** Could the ball dodge every one of these spikes using some plan, starting from where it is now? */
      function feasible(spikes) {
        const end = Math.max(...spikes.map((s) => s.upAt + RISE + s.hold + RETRACT)) - st.T, hz = CC.clamp(end, 0.5, 7);
        for (const pol of POLICIES) {
          const b = { th: st.th, w: st.w }; let ok = true;
          for (let t = 0; t < hz && ok; t += 1 / 120) {
            spinStep(b, polHold(pol, t), 1 / 120);
            const p = ballXY(b.th);
            for (const s of spikes) if (spikeTouch(s, spikeExt(s, st.T + t), p.x, p.y)) { ok = false; break; }
          }
          if (ok) return true;
        }
        return false;
      }
      function addSpike(a) {
        const live = st.spikes.filter((s) => st.T < s.upAt + RISE + s.hold + RETRACT);
        if (live.length >= 3) return 'Three spikes are already out';
        const sp = { a, upAt: st.T + warnTime(), hold: holdTime() };
        if (!feasible(live.concat([sp]))) return "The wheel couldn't dodge that one";
        st.spikes.push(sp);
        return null;
      }
      function sendObject(type, x) {
        const t = TYPES[type];
        if (!t) return 'No such object';
        if (Math.abs(x - CX) < 100) return 'Too close to the middle';
        if (x < 20 || x > W - 20) return 'Off the belt';
        if (st.credits < t.cost) return 'Not enough credits';
        if (st.objs.length >= 14) return 'The belt is full';
        st.credits -= t.cost; addObject(type, x, objSpeed()); CC.beep(240, 0.08, 'sawtooth', 0.03);
        if (shop) shop.last = '';
        return null;
      }
      function sendSpike(a) {
        if (st.credits < SPIKE_COST) return 'Not enough credits';
        if (st.spikeCool > 0) return 'Wait a moment';
        const why = addSpike(a);
        if (why) return why;
        st.credits -= SPIKE_COST; st.spikeCool = 0.8; CC.beep(180, 0.15, 'square', 0.03);
        if (shop) shop.last = '';
        return null;
      }

      // ---------- the computer sender ----------
      function genStep(dt) {
        const g = st.gen;
        g.objT -= dt;
        if (g.objT <= 0) {
          g.objT = CC.lerp(3.0, 1.1, ramp()) * CC.rand(0.7, 1.3);
          const r = Math.random(), type = st.wave >= 5 && r < 0.25 ? 'iron' : st.wave >= 3 && r < 0.55 ? 'barrel' : 'crate';
          addObject(type, Math.random() < 0.5 ? -20 : W + 20, objSpeed());
        }
        g.spikeT -= dt;
        if (g.spikeT <= 0) {
          g.spikeT = CC.lerp(12, 5.5, ramp()) * CC.rand(0.8, 1.2);
          if (st.spikes.filter((s) => st.T < s.upAt + RISE + s.hold + RETRACT).length < 1 + Math.floor((st.wave - 1) / 3)) {
            for (let tries = 0; tries < 12; tries++) if (!addSpike(CC.rand(-Math.PI, Math.PI))) break; // keep trying angles until one is dodgeable
          }
        }
      }

      // ---------- the computer swinger ----------
      /** Plays one plan forward and scores it: smashed objects up, objects reaching the wheel and spike hits down. */
      function evalPolicy(pol, hz) {
        const b = { th: st.th, w: st.w }, objs = st.objs.map((o) => ({ x: o.x, w: o.w, hp: o.hp, v: o.v, armored: o.armored, cool: o.cool, gone: false }));
        const hitSpike = new Set(); let score = 0;
        const dt = 1 / 90;
        for (let t = 0; t < hz; t += dt) {
          spinStep(b, polHold(pol, t), dt);
          const p = ballXY(b.th);
          for (const s of st.spikes) if (!hitSpike.has(s) && spikeTouch(s, spikeExt(s, st.T + t), p.x, p.y)) { hitSpike.add(s); score -= 400; }
          for (const o of objs) {
            if (o.gone) continue;
            o.x += (o.x > CX ? -o.v : o.v) * dt; o.cool -= dt;
            if (Math.abs(o.x - CX) <= REACH) { o.gone = true; score -= 70; continue; }
            if (o.cool <= 0 && ballHitsObj(p.x, p.y, o)) {
              o.cool = 0.3; o.x += (o.x > CX ? 22 : -22);
              if (o.armored && b.w < IRON_MIN) continue;
              o.hp--; if (o.hp <= 0) { o.gone = true; score += 25; } else score += 8;
            }
          }
          score -= 0.1 * b.w * dt;
        }
        return score;
      }
      /** Chooses hold or release for the next moment by looking ahead; `s` is the skill dial from 0 to 1. */
      function think(s) {
        const hz = CC.lerp(1.3, 3.4, s);
        let best = -Infinity, act = false;
        for (const pol of POLICIES) { const sc = evalPolicy(pol, hz); if (sc > best) { best = sc; act = polHold(pol, 0); } }
        if (Math.random() < 0.12 * (1 - s)) act = !act;     // a clumsy swinger sometimes slips
        return act;
      }

      // ---------- rounds ----------
      function loseLife(why) {
        st.lives--; CC.boom(0.4, 0.08); st.flash = 1;
        if (st.lives <= 0) {
          st.over = true;
          if (humanSend) api.banner('You win', 'The wheel is out of lives. Press R to play again.', 0);
          else if (humanSwing) {
            if (st.score > st.best) { st.best = st.score; CC.store.set('wheelBest', st.best); }
            api.banner('The wheel is wrecked', `${why} Score ${st.score}. Press R to play again.`, 0);
          } else { api.banner('The wheel is wrecked', why, 0); st.pending = { t: 3 }; }
        } else api.banner(why, `${st.lives} ${st.lives === 1 ? 'life' : 'lives'} left`, 1000);
      }
      function nextWave() {
        st.wave++; st.waveT = 0;
        if (humanSend && st.wave > WAVES_TO_WIN) { st.over = true; api.banner('The wheel holds', 'The computer swinger lasted six waves. Press R to play again.', 0); return; }
        if (st.wave % 2 === 1 && st.lives < 4) st.lives++;
        api.banner(`Wave ${st.wave}`, st.wave % 2 === 1 ? 'Extra life' : '', 1400); CC.beep(700, 0.15, 'triangle');
      }
      function burst(x, y, color) { for (let i = 0; i < 10; i++) st.parts.push({ x, y, vx: CC.rand(-160, 160), vy: CC.rand(-200, 40), t: CC.rand(0.3, 0.7), color }); }

      function hud() {
        const hearts = '♥'.repeat(Math.max(0, st.lives)) || '–';
        if (humanSwing) api.hud(`Score ${st.score}`, `Wave ${st.wave}`, `Lives ${hearts} · best ${st.best}`);
        else if (humanSend) api.hud(`Credits ${Math.floor(st.credits)}`, `Wave ${Math.min(st.wave, WAVES_TO_WIN)} of ${WAVES_TO_WIN}`, `Wheel lives ${hearts}`);
        else api.hud(`Score ${st.score}`, `Wave ${st.wave}`, `Lives ${hearts}`);
      }

      hud(); refreshShop();
      api.banner('Wheel of Terror', humanSwing ? 'Hold Space to spin faster' : humanSend ? 'Click the belt and the ring' : 'The computer plays both sides', 1500);

      return {
        state: st, think, tools: { sendObject, sendSpike },
        update(dt) {
          const inp = api.input;
          for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.t -= dt; }
          st.parts = st.parts.filter((p) => p.t > 0);
          st.flash = Math.max(0, st.flash - dt * 2); if (st.msg) { st.msg.t -= dt; if (st.msg.t <= 0) st.msg = null; }
          if (st.pending) { st.pending.t -= dt; if (st.pending.t <= 0) { Object.assign(st, { T: 0, th: 0.6, w: W0, lives: 3, score: 0, wave: 1, waveT: 0, objs: [], spikes: [], over: false, pending: null, inv: 0, credits: START_CREDITS, gen: { objT: 2.5, spikeT: 10 } }); api.hideBanner(); } }
          if (st.over) { hud(); return; }
          st.T += dt; st.waveT += dt; st.inv = Math.max(0, st.inv - dt); st.cool = Math.max(0, st.cool - dt); st.spikeCool = Math.max(0, st.spikeCool - dt);
          if (st.waveT >= WAVE_SECONDS) nextWave();
          if (st.over) { hud(); return; }
          // who is on the controls
          if (humanSwing) st.hold = !!(inp.keys.Space || inp.mouse.down);
          else { st.ai.t -= dt; if (st.ai.t <= 0) { const s = skill(); st.ai.t = CC.lerp(0.32, 0.07, s); st.ai.hold = think(s); } st.hold = st.ai.hold; }
          // who sends
          if (humanSend) {
            st.credits = Math.min(CREDIT_CAP, st.credits + INCOME * dt);
            ['crate', 'barrel', 'iron'].forEach((k, i) => { if (inp.pressed['Digit' + (i + 1)]) select(k); });
            if (inp.mouse.clicked) {
              const mx = inp.mouse.x, my = inp.mouse.y, d = Math.hypot(mx - CX, my - CY);
              let why;
              if (my > BELT_Y - 60 && my < BELT_Y + 40 && d > R + 30) why = sendObject(st.sel, mx);
              else if (d > R - 60 && d < R + 70) why = sendSpike(Math.atan2(mx - CX, my - CY));
              else why = 'Click the belt or the ring';
              if (why) { say(why); CC.beep(120, 0.08); }
            }
          } else genStep(dt);
          // objects ride the belt
          for (const o of st.objs) {
            o.x += (o.x > CX ? -o.v : o.v) * dt; o.cool -= dt; o.flash = Math.max(0, o.flash - dt * 4);
            if (Math.abs(o.x - CX) <= REACH) { o.dead = true; burst(CX, BELT_Y - 14, '#e0405a'); loseLife('An object reached the wheel'); }
          }
          // the ball, in small steps so a fast ball cannot skip over anything
          const n = 4, h = dt / n;
          for (let i = 0; i < n && !st.over; i++) {
            spinStep(st, st.hold, h);
            const p = ballXY(st.th);
            for (const o of st.objs) {
              if (o.dead || o.cool > 0 || !ballHitsObj(p.x, p.y, o)) continue;
              o.cool = 0.3; o.flash = 1; o.x += (o.x > CX ? 22 : -22);
              if (o.armored && st.w < IRON_MIN) { CC.beep(150, 0.08, 'square', 0.04); say('Too slow to dent iron'); continue; }
              o.hp--; burst(p.x, p.y, TYPES[o.type].color);
              if (o.hp <= 0) { o.dead = true; st.score += TYPES[o.type].pts; st.killed++; CC.beep(700, 0.06, 'square', 0.04); } else CC.beep(420, 0.05, 'square', 0.04);
            }
            if (st.inv <= 0) for (const s of st.spikes) if (spikeTouch(s, spikeExt(s, st.T), p.x, p.y)) { st.inv = 1.6; burst(p.x, p.y, '#e0405a'); loseLife('Impaled'); break; }
          }
          st.objs = st.objs.filter((o) => !o.dead);
          st.spikes = st.spikes.filter((s) => st.T < s.upAt + RISE + s.hold + RETRACT + 0.05);
          const pb = ballXY(st.th); st.trail.push(pb); if (st.trail.length > 12) st.trail.shift();
          hud(); refreshShop();
        },
        draw(ctx) {
          const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#180d1c'); g.addColorStop(1, '#0a0c12');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          if (st.flash > 0) { ctx.fillStyle = `rgba(224,64,90,${0.25 * st.flash})`; ctx.fillRect(0, 0, W, H); }
          // orbit
          ctx.strokeStyle = 'rgba(201,161,90,.28)'; ctx.setLineDash([4, 8]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          // spikes: a warning marker first, then the spike itself
          for (const s of st.spikes) {
            const e = spikeExt(s, st.T), ox = CX + SPIKE_BASE_R * Math.sin(s.a), oy = CY + SPIKE_BASE_R * Math.cos(s.a);
            const nx = Math.cos(s.a), ny = -Math.sin(s.a);
            if (st.T < s.upAt) {
              const left = s.upAt - st.T, pulse = 0.5 + 0.5 * Math.sin(st.T * 14);
              ctx.strokeStyle = `rgba(224,64,90,${0.35 + 0.5 * pulse})`; ctx.lineWidth = 2;
              const tr = SPIKE_BASE_R - SPIKE_LEN, tx = CX + tr * Math.sin(s.a), ty = CY + tr * Math.cos(s.a);
              ctx.beginPath(); ctx.moveTo(ox + nx * 6, oy + ny * 6); ctx.lineTo(tx, ty); ctx.lineTo(ox - nx * 6, oy - ny * 6); ctx.closePath(); ctx.stroke();
              CC.text(ctx, left.toFixed(1), CX + (SPIKE_BASE_R + 18) * Math.sin(s.a), CY + (SPIKE_BASE_R + 18) * Math.cos(s.a), { size: 12, color: '#e0405a', font: 'Chivo, sans-serif' });
            }
            if (e > 0) {
              const tr = SPIKE_BASE_R - SPIKE_LEN * e, tx = CX + tr * Math.sin(s.a), ty = CY + tr * Math.cos(s.a);
              CC.glow(ctx, '#e0405a', 12); ctx.fillStyle = '#ff6b7f';
              ctx.beginPath(); ctx.moveTo(ox + nx * 6, oy + ny * 6); ctx.lineTo(tx, ty); ctx.lineTo(ox - nx * 6, oy - ny * 6); ctx.closePath(); ctx.fill(); CC.noGlow(ctx);
            }
          }
          // belt
          ctx.fillStyle = '#2b2218'; ctx.fillRect(0, BELT_Y, W, 22);
          ctx.fillStyle = '#4a3a26'; const off = ((st.T * (humanSend || role === 'watch' || humanSwing ? objSpeed() : 60)) % 40);
          for (let x = -40; x < W + 40; x += 40) {
            const xl = x + off, xr = x + 40 - off; // chevrons run toward the middle from both sides
            if (xl < CX) ctx.fillRect(xl, BELT_Y + 4, 16, 4); if (xr > CX) ctx.fillRect(xr - 16, BELT_Y + 4, 16, 4);
          }
          ctx.fillStyle = '#c9a15a'; ctx.fillRect(0, BELT_Y, W, 2);
          ctx.strokeStyle = 'rgba(224,64,90,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CX - REACH, BELT_Y - 36); ctx.lineTo(CX - REACH, BELT_Y); ctx.moveTo(CX + REACH, BELT_Y - 36); ctx.lineTo(CX + REACH, BELT_Y); ctx.stroke();
          // objects
          for (const o of st.objs) {
            ctx.fillStyle = o.flash > 0 ? '#ffffff' : TYPES[o.type].color; ctx.fillRect(o.x - o.w / 2, BELT_Y - OBJ_H, o.w, OBJ_H);
            ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.strokeRect(o.x - o.w / 2 + 1, BELT_Y - OBJ_H + 1, o.w - 2, OBJ_H - 2);
            if (o.armored) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(o.x - o.w / 2 + 4, BELT_Y - OBJ_H + 4, o.w - 8, 4); }
            CC.text(ctx, String(o.hp), o.x, BELT_Y - OBJ_H / 2 + 1, { size: 13, color: '#1a1006', font: 'Chivo, sans-serif' });
          }
          // rod, hub and ball
          const b = ballXY(st.th);
          for (let i = 0; i < st.trail.length; i++) { const q = st.trail[i]; ctx.globalAlpha = (i / st.trail.length) * 0.35; ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(q.x, q.y, BR * (0.4 + 0.5 * i / st.trail.length), 0, 6.28); ctx.fill(); } ctx.globalAlpha = 1;
          ctx.strokeStyle = '#c9a15a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.fillStyle = '#c9a15a'; ctx.beginPath(); ctx.arc(CX, CY, 9, 0, 6.28); ctx.fill();
          const blink = st.inv > 0 && Math.floor(st.inv * 10) % 2;
          if (!blink) { CC.glow(ctx, st.w >= IRON_MIN ? '#ff6b7f' : '#ffb347', 6 + st.w * 2); ctx.fillStyle = st.w >= IRON_MIN ? '#ffd0d8' : '#ffb347'; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, 6.28); ctx.fill(); CC.noGlow(ctx); }
          for (const p of st.parts) { ctx.globalAlpha = Math.min(1, p.t * 3); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); } ctx.globalAlpha = 1;
          // speed gauge
          ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(20, H - 34, 180, 10);
          ctx.fillStyle = st.w >= IRON_MIN ? '#ff6b7f' : '#ffb347'; ctx.fillRect(20, H - 34, 180 * (st.w - W0) / (WMAX - W0) + 4, 10);
          ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(20 + 180 * (IRON_MIN - W0) / (WMAX - W0), H - 38, 2, 18);
          CC.text(ctx, 'SPEED', 20, H - 46, { size: 11, align: 'left', color: 'rgba(243,230,207,.6)', font: 'Chivo, sans-serif' });
          CC.text(ctx, 'iron', 20 + 180 * (IRON_MIN - W0) / (WMAX - W0), H - 14, { size: 10, color: 'rgba(243,230,207,.55)', font: 'Chivo, sans-serif' });
          if (humanSwing && st.T < 4) CC.text(ctx, 'Hold Space to spin faster', CX, 80, { size: 16, color: '#ffb347' });
          if (st.msg) CC.text(ctx, st.msg.text, CX, 560, { size: 15, color: '#e0405a' });
          if (humanSend && !st.over && api.input.mouse.inside) {
            const m = api.input.mouse, d = Math.hypot(m.x - CX, m.y - CY);
            if (m.y > BELT_Y - 60 && m.y < BELT_Y + 40 && d > R + 30) { const ok = Math.abs(m.x - CX) >= 100; ctx.globalAlpha = 0.5; ctx.fillStyle = ok ? TYPES[st.sel].color : '#e0405a'; ctx.fillRect(m.x - TYPES[st.sel].w / 2, BELT_Y - OBJ_H, TYPES[st.sel].w, OBJ_H); ctx.globalAlpha = 1; }
            else if (d > R - 60 && d < R + 70) { const a = Math.atan2(m.x - CX, m.y - CY); ctx.strokeStyle = '#e0405a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX + R * Math.sin(a), CY + R * Math.cos(a), 12, 0, 6.28); ctx.stroke(); }
          }
        },
      };
    },
  });
})();
