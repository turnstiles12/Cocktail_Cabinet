/* SNAKE
   steer  : you steer, the computer places apples (it picks harder spots as you level up).
   apples : you place apples, the computer steers (it learns caution as it levels up).
   watch  : computer on both sides. */
(() => {
  'use strict';
  const CC = window.CC;
  const C = 32, R = 24, S = 25;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // right, down, left, up
  const idx = (x, y) => y * C + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < C && y < R;
  const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  // ---------- planning helpers (shared by the snake AI and the apple AI) ----------
  // freeAt[cell] = how many moves until that body cell is vacated (tail = 1).
  function freeGrid(body) {
    const g = new Int16Array(C * R), n = body.length;
    for (let i = 0; i < n; i++) g[idx(body[i].x, body[i].y)] = n - i;
    return g;
  }
  // Time-aware BFS from the head: a body cell may be entered once it will have moved on.
  function bfs(body) {
    const g = freeGrid(body), dist = new Int16Array(C * R).fill(-1), first = new Int8Array(C * R).fill(-1), par = new Int32Array(C * R).fill(-1);
    const h = idx(body[0].x, body[0].y), q = [h]; dist[h] = 0; let area = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], cx = c % C, cy = (c / C) | 0, d = dist[c];
      for (let k = 0; k < 4; k++) {
        const nx = cx + DIRS[k][0], ny = cy + DIRS[k][1];
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (dist[ni] >= 0 || g[ni] > d + 1) continue;
        dist[ni] = d + 1; first[ni] = d === 0 ? k : first[c]; par[ni] = c; q.push(ni); area++;
      }
    }
    return { dist, first, par, area };
  }
  // Exact legality of one move right now.
  function legal(body, k, apple, growing) {
    const h = body[0], nx = h.x + DIRS[k][0], ny = h.y + DIRS[k][1];
    if (!inb(nx, ny)) return false;
    const grows = growing || (apple && apple.x === nx && apple.y === ny);
    for (let i = 0; i < body.length; i++) {
      if (body[i].x === nx && body[i].y === ny) { if (i === body.length - 1 && !grows && body.length > 1) return true; return false; }
    }
    return true;
  }
  function stepBody(body, k, apple) {
    const h = body[0], nh = { x: h.x + DIRS[k][0], y: h.y + DIRS[k][1] };
    const grows = apple && apple.x === nh.x && apple.y === nh.y;
    const nb = [nh, ...body]; if (!grows) nb.pop();
    return nb;
  }
  function tailReachable(body) {
    if (body.length < 3) return true;
    const t = body[body.length - 1], B = bfs(body);
    return B.dist[idx(t.x, t.y)] > 0;
  }
  // After following the BFS path to the apple, could the snake still reach its own tail?
  function safeAfterEating(body, B, appleIdx) {
    const path = []; let c = appleIdx; const h = idx(body[0].x, body[0].y);
    while (c !== h && c >= 0) { path.push(c); c = B.par[c]; }
    const nb = path.map((p) => ({ x: p % C, y: (p / C) | 0 })).concat(body).slice(0, body.length + 1);
    return tailReachable(nb);
  }

  // The snake's brain. skill 0 = greedy and careless, 1 = checks every apple for a trap.
  function snakeAI(body, dir, apple, skill, growing) {
    const cands = [];
    for (let k = 0; k < 4; k++) { if (body.length > 1 && k === (dir + 2) % 4) continue; if (legal(body, k, apple, growing)) cands.push(k); }
    if (!cands.length) return dir; // boxed in: it will crash, honestly
    if (Math.random() < 0.05 * (1 - skill)) return CC.pick(cands); // an occasional fumble at low skill
    const B = bfs(body);
    if (apple) {
      const ai = idx(apple.x, apple.y);
      if (B.dist[ai] > 0 && cands.includes(B.first[ai])) {
        const careful = Math.random() < skill;
        if (!careful || safeAfterEating(body, B, ai)) return B.first[ai];
      }
    }
    // No safe route to the apple: survive. Keep the tail reachable, keep room, drift toward the apple.
    let best = -Infinity, bk = cands[0];
    for (const k of cands) {
      const nb = stepBody(body, k, apple), B2 = bfs(nb);
      const t = nb[nb.length - 1], reach = nb.length < 3 || B2.dist[idx(t.x, t.y)] > 0;
      let sc = B2.area * (0.15 + skill) + (reach ? 400 * skill + 40 : 0);
      if (apple) sc -= man(nb[0], apple) * (1.4 - skill);
      sc += Math.random() * 3;
      if (sc > best) { best = sc; bk = k; }
    }
    return bk;
  }

  // The apple-placer's brain: far, walled-in and body-hugging spots as the level climbs, but always reachable.
  function placeApple(body, level) {
    const B = bfs(body), occ = freeGrid(body);
    const target = Math.min(5 + level * 3, 34);
    let best = null, bs = -Infinity;
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
      const i = idx(x, y); if (occ[i] || B.dist[i] <= 1) continue;
      let wall = (x === 0 || x === C - 1 ? 1 : 0) + (y === 0 || y === R - 1 ? 1 : 0), hug = 0;
      for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && occ[idx(nx, ny)]) hug++; }
      let sc = -Math.abs(B.dist[i] - target) + Math.random() * 3;
      if (level >= 2) sc += wall * Math.min(level - 1, 3) * 0.7;
      if (level >= 3) sc += hug * Math.min(level - 2, 4) * 0.8;
      if (sc > bs) { bs = sc; best = { x, y }; }
    }
    return best;
  }

  CC.register({
    id: 'snake', title: 'Snake',
    blurb: 'Steer the snake, or set the apples and try to trap it.',
    icon: `<svg viewBox="0 0 64 64"><path d="M10 50 H30 V30 H50 V14" fill="none" stroke="#7ee07a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="50" r="6" fill="#e0405a"/></svg>`,
    size: { w: C * S, h: R * S },
    roles: [
      { id: 'steer', label: 'You steer · computer sets apples', help: '<kbd>Arrows</kbd> or <kbd>WASD</kbd> to steer. The computer drops each apple — farther away and tighter to the walls and your tail as you level up.' },
      { id: 'apples', label: 'You set apples · computer steers', help: 'Click an empty square to drop the next apple. Each apple makes the snake 3 longer. Apples rot if the snake dawdles (+1 for you) — it gets a few spare moves beyond the shortest route, more as it levels up; crash the snake into its tail or a wall for +2. First to 6 wins — the snake wins at 30 apples. It gets warier of traps as it grows.' },
      { id: 'watch', label: 'Watch computer vs computer', help: 'Both sides are played by the computer.' },
    ],
    create(api) {
      const role = api.role;
      const humanSnake = role === 'steer', humanApples = role === 'apples';
      const GROWTH = humanApples ? 3 : 1; // bait grows the snake fast, so traps become possible
      const st = {
        body: [], dir: 0, queue: [], apple: null, appleTicks: 0, appleLife: 0, placeTimer: 0,
        tickAcc: 0, grow: 0, eaten: 0, lifeEaten: 0, lives: 3, you: 0, over: false, respawn: 0, parts: [], flash: 0,
      };
      const level = () => 1 + Math.floor(st.eaten / (humanApples ? 4 : 5));
      const skill = () => CC.clamp((level() - 1) / 6, 0, 1);
      const tps = () => (humanSnake ? Math.min(6 + level() * 0.9, 16) : Math.min(7 + level() * 0.6, 13));

      function spawnSnake() {
        st.body = []; for (let i = 0; i < 4; i++) st.body.push({ x: 8 - i, y: 12 });
        st.dir = 0; st.queue = []; st.apple = null; st.grow = 0; st.lifeEaten = 0; st.placeTimer = 4;
        if (!humanApples) st.apple = placeApple(st.body, level());
      }
      spawnSnake();
      api.banner(humanSnake ? 'Snake' : humanApples ? 'Set a trap' : 'Snake — attract mode', humanApples ? 'Click to drop the first apple' : 'Eat, grow, survive', 1600);

      function setApple(p, byHuman) {
        st.apple = p;
        if (byHuman) { const B = bfs(st.body); st.appleLife = B.dist[idx(p.x, p.y)] + 3 + level(); st.appleTicks = 0; } // a few spare moves, more as the snake levels up
        CC.beep(660, 0.05, 'triangle');
      }
      function tryHumanPlace(x, y) {
        if (!inb(x, y) || st.apple || st.respawn > 0) return;
        if (st.body.some((b) => b.x === x && b.y === y)) return CC.beep(120, 0.08);
        if (man(st.body[0], { x, y }) < 3) { api.banner('Too close', 'Give the snake at least 3 squares', 900); return CC.beep(120, 0.08); }
        const B = bfs(st.body); if (B.dist[idx(x, y)] <= 0) { api.banner('Unreachable', 'The snake could never get there', 900); return CC.beep(120, 0.08); }
        setApple({ x, y }, true);
      }
      function crash() {
        CC.boom(0.4); st.flash = 1; st.respawn = 1.1;
        if (humanApples) { st.you += 2; api.banner('Splat!', '+2 for you', 1000); }
        else { st.lives--; api.banner(st.lives > 0 ? 'Crashed' : 'Game over', st.lives > 0 ? `${st.lives} ${st.lives === 1 ? 'life' : 'lives'} left` : `Final length ${st.body.length}`, st.lives > 0 ? 1000 : 0); }
        checkEnd();
      }
      function checkEnd() {
        if (humanApples) {
          if (st.you >= 6) { st.over = true; api.banner('You win', `The snake managed ${st.eaten} apples. Press R to play again.`, 0); }
          else if (st.eaten >= 30) { st.over = true; api.banner('The snake wins', 'It reached 30 apples. Press R to play again.', 0); }
        } else if (st.lives <= 0) {
          st.over = true;
          if (role === 'watch') setTimeout(() => { if (!st.destroyed) { Object.assign(st, { lives: 3, eaten: 0, over: false }); spawnSnake(); api.hideBanner(); } }, 2500);
        }
      }

      function tick() {
        let k;
        if (humanSnake) {
          while (st.queue.length) { const q = st.queue.shift(); if (q !== (st.dir + 2) % 4 && q !== st.dir) { k = q; break; } }
          if (k === undefined) k = st.dir;
        } else k = snakeAI(st.body, st.dir, st.apple, skill(), st.grow > 0);
        st.dir = k;
        if (!legal(st.body, k, st.apple, st.grow > 0)) { crash(); return; }
        const h = st.body[0], nh = { x: h.x + DIRS[k][0], y: h.y + DIRS[k][1] };
        const eats = st.apple && st.apple.x === nh.x && st.apple.y === nh.y;
        st.body.unshift(nh);
        if (eats) st.grow += GROWTH - 1; else if (st.grow > 0) st.grow--; else st.body.pop();
        if (eats) {
          st.eaten++; st.lifeEaten++;
          for (let i = 0; i < 14; i++) st.parts.push({ x: nh.x * S + S / 2, y: nh.y * S + S / 2, vx: CC.rand(-120, 120), vy: CC.rand(-120, 120), t: 0.5 });
          CC.beep(520 + Math.min(st.lifeEaten, 20) * 25, 0.07, 'square');
          st.apple = null; st.placeTimer = 4;
          if (!humanApples) st.apple = placeApple(st.body, level());
          checkEnd();
        }
        if (humanApples && st.apple) {
          st.appleTicks++;
          if (st.appleTicks >= st.appleLife) { st.apple = null; st.you++; st.placeTimer = 4; CC.beep(180, 0.2, 'sawtooth', 0.03, 0.5); api.banner('Rotted', '+1 for you', 800); checkEnd(); }
        }
      }

      return {
        update(dt) {
          const inp = api.input;
          for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
          st.parts = st.parts.filter((p) => p.t > 0);
          st.flash = Math.max(0, st.flash - dt * 2);
          if (st.over) { if (inp.mouse.clicked && role !== 'watch') { /* restart via R */ } return; }
          if (humanSnake) {
            const map = { ArrowRight: 0, KeyD: 0, ArrowDown: 1, KeyS: 1, ArrowLeft: 2, KeyA: 2, ArrowUp: 3, KeyW: 3 };
            for (const code in inp.pressed) if (code in map && st.queue.length < 3) st.queue.push(map[code]);
          }
          if (st.respawn > 0) { st.respawn -= dt; if (st.respawn <= 0) { spawnSnake(); if (!st.over) api.hideBanner(); } return; }
          if (humanApples && !st.apple) {
            if (inp.mouse.clicked) tryHumanPlace(Math.floor(inp.mouse.x / S), Math.floor(inp.mouse.y / S));
            st.placeTimer -= dt;
            if (!st.apple && st.placeTimer <= 0) { // idle: a random reachable apple, no penalty either way
              const B = bfs(st.body), free = [];
              for (let i = 0; i < C * R; i++) if (B.dist[i] >= 3) free.push(i);
              if (free.length) { const i = CC.pick(free); setApple({ x: i % C, y: (i / C) | 0 }, true); }
            }
            if (!st.apple) return; // the snake waits for the first apple of a life
          }
          st.tickAcc += dt;
          const per = 1 / tps();
          while (st.tickAcc >= per && st.respawn <= 0 && !st.over) { st.tickAcc -= per; tick(); }
          if (humanApples) api.hud(`You ${st.you} / 6`, `Level ${level()}`, `Snake ${st.eaten} / 30`);
          else api.hud(`${role === 'watch' ? 'Snake' : 'You'} ${st.eaten * 10}`, `Level ${level()}`, `Lives ${Math.max(0, st.lives)}`);
        },
        draw(ctx) {
          ctx.fillStyle = '#081009'; ctx.fillRect(0, 0, C * S, R * S);
          ctx.strokeStyle = 'rgba(126,224,122,0.06)'; ctx.lineWidth = 1;
          for (let x = 0; x <= C; x++) { ctx.beginPath(); ctx.moveTo(x * S + 0.5, 0); ctx.lineTo(x * S + 0.5, R * S); ctx.stroke(); }
          for (let y = 0; y <= R; y++) { ctx.beginPath(); ctx.moveTo(0, y * S + 0.5); ctx.lineTo(C * S, y * S + 0.5); ctx.stroke(); }
          // apple
          if (st.apple) {
            const ax = st.apple.x * S + S / 2, ay = st.apple.y * S + S / 2;
            CC.glow(ctx, '#e0405a', 14); ctx.fillStyle = '#e0405a'; ctx.beginPath(); ctx.arc(ax, ay + 1, S * 0.36, 0, Math.PI * 2); ctx.fill(); CC.noGlow(ctx);
            ctx.fillStyle = '#7ee07a'; ctx.fillRect(ax, ay - S * 0.45, 3, 6);
            if (humanApples) {
              const left = 1 - st.appleTicks / st.appleLife;
              ctx.strokeStyle = left < 0.3 ? '#ff6b6b' : '#ffb347'; ctx.lineWidth = 3;
              ctx.beginPath(); ctx.arc(ax, ay, S * 0.62, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2); ctx.stroke();
            }
          }
          // placement cursor
          if (humanApples && !st.apple && !st.over && api.input.mouse.inside) {
            const x = Math.floor(api.input.mouse.x / S), y = Math.floor(api.input.mouse.y / S);
            ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.strokeRect(x * S + 2, y * S + 2, S - 4, S - 4);
            CC.text(ctx, `Place an apple · ${Math.max(0, Math.ceil(st.placeTimer))}`, C * S / 2, 20, { size: 16, color: '#ffb347' });
          }
          // snake
          const n = st.body.length;
          for (let i = n - 1; i >= 0; i--) {
            const b = st.body[i], t = i / Math.max(1, n - 1);
            ctx.fillStyle = st.respawn > 0 ? `rgba(255,120,120,${0.4 + 0.6 * st.flash})` : `hsl(${115 - t * 40}, 65%, ${62 - t * 22}%)`;
            const pad = i === 0 ? 1 : 3;
            ctx.beginPath(); ctx.roundRect(b.x * S + pad, b.y * S + pad, S - pad * 2, S - pad * 2, 6); ctx.fill();
          }
          if (n) { // eyes
            const h = st.body[0], [dx, dy] = DIRS[st.dir], cx = h.x * S + S / 2, cy = h.y * S + S / 2;
            ctx.fillStyle = '#081009';
            for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + dx * 5 - dy * 5 * sgn, cy + dy * 5 + dx * 5 * sgn, 2.6, 0, Math.PI * 2); ctx.fill(); }
          }
          for (const p of st.parts) { ctx.fillStyle = `rgba(255,179,71,${p.t * 2})`; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        },
        destroy() { st.destroyed = true; },
      };
    },
  });
  // exported for tests
  CC._snake = { snakeAI, placeApple, legal, bfs, safeAfterEating, C, R };
})();
