/**
 * Game: Breakout (brick breaker).
 *
 * @file One paddle, one ball and a wall of bricks. The wall has five rows and a brick's
 * strength is its row number: row 1 (the row nearest the paddle) breaks in 1 hit, row 2 in
 * 2 hits, up to row 5 (the back row) which needs 5 hits. A brick shows how many hits it has
 * left. Playable from either side:
 *  - paddle : you play the paddle. The wall creeps down the screen, faster as time and
 *    level go up. Clear the wall for the next level; lose all 3 balls, or let a brick reach
 *    the red line, and the game is over.
 *  - bricks : the flip. You are the brick-layer and the computer plays the paddle. You get
 *    credits (a starting pile plus a steady trickle). Spend them in the shop: a level-N
 *    brick costs N credits and takes N hits to destroy, and 5 credits lowers every brick
 *    one step. You win a round if the computer loses its 3 balls or a brick reaches the
 *    red line; the computer wins a round if it clears every brick. Win 6 rounds before the
 *    computer wins 3; the paddle sharpens every time you win a round, reaching full strength
 *    at level 6. If a round drags on past 2.5 minutes the wall starts to creep by itself.
 *  - watch : the computer plays the paddle and a computer brick-layer spends credits.
 *
 * The computer paddle looks ahead by simulating the ball (walls and bricks) until it comes
 * back down, with reaction delay, aim error and paddle speed that improve with level, and
 * at higher skill aims its returns at the front-most bricks. The computer brick-layer only
 * uses the same shop and the same credits a human gets.
 *
 * Test hook: the object returned by create() exposes its state as {@code state}.
 *
 * @module games/breakout
 * @requires js/core.js
 */
(() => {
  'use strict';
  const CC = window.CC;

  // ---------- geometry ----------
  const W = 560, H = 720;
  const COLS = 8, BW = 63, BH = 18, GAP = 4, X0 = 14;   // brick size and column layout (8 columns of 63)
  const RH = 24, TOP = 40;                              // rows are 24 apart; the grid starts at y = 40
  const ROWS = 5;
  const PH = 12, PAD_Y = H - 44, BR = 7;               // paddle height and row, ball radius (the paddle's width shrinks with level: see pw())
  const DANGER_Y = 600;                                 // a brick whose bottom reaches this line ends the round
  const BUILD_MAX = 440;                                // the brick-layer may only build above this y
  const WALL_DROP = 96;                                 // the wall starts four rows below the top, so the ball does not have far to travel

  // ---------- the shop (brick-layer side) ----------
  const LOWER_COST = 5;        // credits to lower every brick one step
  const LOWER_STEP = 24;       // how far one purchase lowers the bricks, in pixels (one row)
  const START_CREDITS = 20, INCOME = 0.5, CREDIT_CAP = 40;   // credits at the start, per second, and the most you can hold
  const OVERTIME = 150;        // seconds into a round after which the wall starts to creep by itself, so no round can stall for ever
  const LAYER_WINS = 6, PADDLE_WINS = 3;   // the brick-layer must win six rounds before the paddle wins three

  // one colour per remaining hit (index = hits left)
  const HP_COLOR = ['', '#4fc3d9', '#6fcf6f', '#e6c84a', '#f08a3c', '#e0405a'];

  const colX = (c) => X0 + c * (BW + GAP);
  const rowY = (r) => TOP + r * RH;

  /** Builds the five-row wall: row n (1 = nearest the paddle) has n hits. Starts `drop` pixels lower. */
  function makeField(drop = 0) {
    const bricks = [];
    for (let n = 1; n <= ROWS; n++) {
      const y = rowY(ROWS + 1 - n) + WALL_DROP + drop;
      for (let c = 0; c < COLS; c++) bricks.push({ x: colX(c), y, ty: y, w: BW, h: BH, hp: n, max: n });
    }
    return bricks;
  }

  /**
   * Moves the ball one small step and bounces it off the side walls, the ceiling and the
   * bricks. `alive(brick)` says whether a brick still counts and `onHit(brick)` is told
   * about each contact, so the real game can damage bricks while the computer paddle can
   * run the same physics as a dry run.
   */
  function stepOnce(b, h, bricks, alive, onHit) {
    b.x += b.vx * h; b.y += b.vy * h;
    if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); } else if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx); }
    if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy); }
    let best = null, bd = 0, bnx = 0, bny = 0;
    for (const r of bricks) {
      if (!alive(r)) continue;
      if (b.x + BR < r.x || b.x - BR > r.x + r.w || b.y + BR < r.y || b.y - BR > r.y + r.h) continue;
      const cx = CC.clamp(b.x, r.x, r.x + r.w), cy = CC.clamp(b.y, r.y, r.y + r.h);
      const dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= BR * BR) continue;
      let nx, ny, pen;
      if (d2 > 1e-6) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = BR - d; }
      else { // the centre is inside the brick: push out the nearest side
        const l = b.x - r.x, rr = r.x + r.w - b.x, t = b.y - r.y, bo = r.y + r.h - b.y, m = Math.min(l, rr, t, bo);
        if (m === t) { nx = 0; ny = -1; } else if (m === bo) { nx = 0; ny = 1; } else if (m === l) { nx = -1; ny = 0; } else { nx = 1; ny = 0; }
        pen = m + BR;
      }
      if (pen > bd) { bd = pen; best = r; bnx = nx; bny = ny; }
    }
    if (best) {
      b.x += bnx * bd; b.y += bny * bd;
      const vn = b.vx * bnx + b.vy * bny;
      if (vn < 0) { b.vx -= 2 * vn * bnx; b.vy -= 2 * vn * bny; }
      const minVy = 0.22 * b.sp; // never let the ball slide almost flat
      if (Math.abs(b.vy) < minVy) {
        b.vy = (b.vy < 0 ? -1 : b.vy > 0 ? 1 : bny < 0 ? -1 : 1) * minVy;
        b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(Math.max(0, b.sp * b.sp - b.vy * b.vy));
      }
      onHit(best);
    }
  }

  CC.register({
    id: 'breakout', title: 'Breakout',
    blurb: 'Smash a five-row wall with a paddle, or be the brick-layer who spends credits to stop it.',
    icon: `<svg viewBox="0 0 64 64"><g><rect x="6" y="8" width="14" height="6" fill="#e0405a"/><rect x="25" y="8" width="14" height="6" fill="#e0405a"/><rect x="44" y="8" width="14" height="6" fill="#e0405a"/><rect x="6" y="17" width="14" height="6" fill="#f08a3c"/><rect x="25" y="17" width="14" height="6" fill="#f08a3c"/><rect x="44" y="17" width="14" height="6" fill="#f08a3c"/><rect x="6" y="26" width="14" height="6" fill="#e6c84a"/><rect x="44" y="26" width="14" height="6" fill="#e6c84a"/></g><circle cx="34" cy="40" r="4" fill="#f3e6cf"/><rect x="18" y="54" width="28" height="5" rx="2.5" fill="#f3e6cf"/></svg>`,
    size: { w: W, h: H },
    roles: [
      { id: 'paddle', label: 'You play the paddle · computer lays the bricks', help: 'Move with the mouse or <kbd>←</kbd> <kbd>→</kbd>; <kbd>Space</kbd> or click to serve. A brick shows the hits it has left: the front row takes 1 hit, the back row 5. The wall creeps toward the red line — clear it before it gets there. You have 3 balls.' },
      { id: 'bricks', label: 'You lay the bricks · computer plays the paddle', layout: 'split', help: 'You are the brick-layer. Pick a brick in the shop (or press <kbd>1</kbd>–<kbd>5</kbd>) and click an empty square above the dotted line to place it; a level-N brick costs N credits and takes N hits. Press <kbd>L</kbd> or the shop button to spend 5 credits lowering every brick. Win a round by making the computer lose 3 balls or by pushing a brick to the red line. Win 6 rounds before the computer wins 3; the paddle sharpens each time you win a round.' },
      { id: 'watch', label: 'Watch computer vs computer', help: 'The computer plays the paddle and a computer brick-layer spends credits in the shop.' },
    ],
    create(api) {
      const role = api.role;
      const humanPad = role === 'paddle', humanLayer = role === 'bricks', econ = !humanPad; // econ: credits, no automatic creep
      const st = {
        level: 1, lives: 3, score: 0, best: CC.store.get('breakoutBest', 0), t: 0,
        bricks: makeField(), hp0: 120, ball: { x: W / 2, y: PAD_Y - 20, vx: 0, vy: 0, sp: 300 }, pad: { x: W / 2 },
        serving: true, serveT: 0, pause: 0.5, pending: null, over: false, roundNo: 1, wins: { layer: 0, paddle: 0 },
        credits: START_CREDITS, selected: 1, lowerCool: 0, parts: [], lastMouseX: null,
        ai: { t: 0, target: W / 2 }, layer: { t: 1 }, pw: humanPad ? 104 : 88,
      };
      const baseSpeed = () => 340 * (1 + 0.08 * (st.level - 1));
      const pw = () => (humanPad ? CC.clamp(104 - 4 * (st.level - 1), 72, 104) : 88);   // your paddle starts wide and narrows each level; the computer paddle is always 88
      const padSkill = () => CC.clamp((st.level - 1) / 5, 0, 1);              // the computer paddle's dial: full strength at level 6
      // px/s the wall drops (paddle side only): faster with level and time, easing off as you chew the wall down
      const creep = () => Math.min((1.2 + 0.5 * (st.level - 1)) * (1 + st.t / 300), 12) * (0.4 + 0.6 * Math.min(1, st.bricks.reduce((a, b) => a + b.hp, 0) / st.hp0));
      const lowestBottom = () => st.bricks.reduce((m, b) => Math.max(m, b.y + BH), 0);

      // ---------- the shop panel (brick-layer side) ----------
      let shop = null;
      if (humanLayer) {
        const credEl = CC.el('p', { class: 'status' });
        const buy = [];
        for (let k = 1; k <= 5; k++) {
          const sw = CC.el('span', { style: `display:inline-block;width:.8em;height:.8em;border-radius:2px;margin-right:.5em;background:${HP_COLOR[k]}` });
          buy.push(CC.el('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === st.selected), onclick: () => select(k) }, sw, `Level ${k} brick · ${k} credit${k > 1 ? 's' : ''} · ${k} hit${k > 1 ? 's' : ''}`));
        }
        const lowerBtn = CC.el('button', { class: 'chip', type: 'button', text: `Lower all bricks · ${LOWER_COST} credits`, onclick: () => lowerAll() });
        api.panel.append(CC.el('div', { class: 'stack' },
          CC.el('h4', { text: "Brick-layer's shop" }), credEl,
          CC.el('p', { text: 'Pick a brick, then click an empty square above the dotted line.' }),
          ...buy, lowerBtn,
          CC.el('p', { text: 'Keys: 1 to 5 pick a brick, L lowers every brick. Credits trickle in all the time.' })));
        shop = { credEl, buy, lowerBtn, last: '' };
      }
      function refreshShop() {
        if (!shop) return;
        const c = Math.floor(st.credits), key = c + '|' + st.selected + '|' + (st.lowerCool > 0);
        if (key === shop.last) return; shop.last = key;
        shop.credEl.textContent = `Credits: ${c}`;
        shop.buy.forEach((b, i) => { b.setAttribute('aria-pressed', String(i + 1 === st.selected)); b.disabled = c < i + 1; });
        shop.lowerBtn.disabled = c < LOWER_COST || st.lowerCool > 0;
      }
      function select(k) { st.selected = k; if (shop) shop.last = ''; }

      // ---------- shop actions (used by the human layer and the computer layer) ----------
      function cellRect(c, r) { return { x: colX(c), y: rowY(r), w: BW, h: BH }; }
      function canPlace(c, r, level) {
        if (c < 0 || c >= COLS || r < 0) return 'Outside the field';
        const rc = cellRect(c, r);
        if (rc.y > BUILD_MAX) return 'Too low: build above the dotted line';
        if (st.credits < level) return 'Not enough credits';
        for (const b of st.bricks) if (rc.x < b.x + b.w && rc.x + rc.w > b.x && rc.y < b.ty + b.h && rc.y + rc.h > b.ty) return 'That square is taken';
        const cx = CC.clamp(st.ball.x, rc.x, rc.x + rc.w), cy = CC.clamp(st.ball.y, rc.y, rc.y + rc.h);
        if (Math.hypot(st.ball.x - cx, st.ball.y - cy) < BR + 8) return 'The ball is in the way';
        return null;
      }
      function place(c, r, level) {
        const why = canPlace(c, r, level);
        if (why) return why;
        const rc = cellRect(c, r);
        st.credits -= level;
        st.bricks.push({ x: rc.x, y: rc.y, ty: rc.y, w: BW, h: BH, hp: level, max: level });
        CC.beep(500 + level * 80, 0.06, 'triangle');
        if (shop) shop.last = '';
        return null;
      }
      function lowerAll() {
        if (st.over || st.pending) return false;
        if (st.credits < LOWER_COST || st.lowerCool > 0 || !st.bricks.length) { CC.beep(120, 0.08); return false; }
        st.credits -= LOWER_COST; st.lowerCool = 0.6;
        for (const b of st.bricks) b.ty += LOWER_STEP;
        CC.beep(160, 0.25, 'sawtooth', 0.04, 0.5);
        if (shop) shop.last = '';
        return true;
      }

      // ---------- rounds and levels ----------
      function resetBall(note) {
        st.serving = true; st.serveT = 0; st.pause = 0.6; st.ball.vx = st.ball.vy = 0; st.ball.sp = baseSpeed();
        if (note) api.banner(note, '', 900);
      }
      function newWall() {
        // each level starts the wall a little lower (paddle side); the brick-layer side always starts at the top
        st.bricks = makeField(humanPad ? Math.min(72, Math.round(((st.level - 1) * 12) / 4) * 4) : 0);
        st.t = 0; st.hp0 = st.bricks.reduce((a, b) => a + b.max, 0);
      }
      function newRound() {
        newWall(); st.credits = START_CREDITS; st.lives = 3; st.lowerCool = 0; st.pending = null; st.overtime = false;
        resetBall(); api.banner(`Round ${st.roundNo}`, `Level ${st.level}`, 1300);
      }
      function endRound(winner, why) {
        if (st.pending) return;
        st.wins[winner]++;
        const youWin = (winner === 'layer' && humanLayer) || (winner === 'paddle' && humanPad);
        CC.boom(0.35, 0.07); CC.beep(youWin ? 880 : 300, 0.3, 'triangle');
        if (winner === 'layer') st.level++;      // the computer paddle gets sharper each time the layer wins
        st.roundNo++;
        const matchOver = st.wins[winner] >= (winner === 'layer' ? LAYER_WINS : PADDLE_WINS);
        if (matchOver) {
          st.over = true;
          const title = humanLayer ? (winner === 'layer' ? 'You win the match' : 'The paddle wins the match') : `${winner === 'layer' ? 'Brick-layer' : 'Paddle'} wins the match`;
          api.banner(title, `Rounds: brick-layer ${st.wins.layer}, paddle ${st.wins.paddle}.${role === 'watch' ? '' : ' Press R to play again.'}`, 0);
          if (role === 'watch') st.pending = { t: 3, fn: () => { st.over = false; st.wins = { layer: 0, paddle: 0 }; st.level = 1; st.roundNo = 1; newRound(); } };
        } else {
          api.banner(winner === 'layer' ? (humanLayer ? 'Round to you' : 'Round to the brick-layer') : (humanLayer ? 'Round to the paddle' : 'Round to the paddle'), why, 1800);
          st.pending = { t: 2, fn: newRound };
        }
      }
      function gameOver(why) {
        st.over = true;
        if (st.score > st.best) { st.best = st.score; CC.store.set('breakoutBest', st.best); }
        CC.boom(0.5, 0.09);
        api.banner('Game over', `${why} Score ${st.score}. Press R to play again.`, 0);
      }
      function wallCleared() {
        if (humanPad) {
          st.level++; st.score += 100 * (st.level - 1); st.lives = Math.min(5, st.lives + 1); newWall(); resetBall();
          api.banner(`Level ${st.level}`, 'Extra ball. The wall comes down faster', 1500);
          CC.beep(900, 0.25, 'triangle');
        } else endRound('paddle', 'The paddle cleared every brick.');
      }
      function loseBall() {
        st.lives--; CC.beep(180, 0.3, 'sawtooth', 0.04, 0.5);
        if (st.lives <= 0) {
          if (humanPad) gameOver('Out of balls.'); else endRound('layer', 'The paddle ran out of balls.');
        } else resetBall(humanPad ? `${st.lives} ball${st.lives > 1 ? 's' : ''} left` : '');
      }

      // ---------- hitting bricks ----------
      function burst(x, y, color) { for (let i = 0; i < 8; i++) st.parts.push({ x, y, vx: CC.rand(-140, 140), vy: CC.rand(-140, 140), t: 0.4, color }); }
      function hitBrick(r) {
        r.hp--; burst(st.ball.x, st.ball.y, HP_COLOR[Math.max(1, r.hp + 1)]);
        if (humanPad) st.score += 10;
        if (r.hp <= 0) { r.dead = true; if (humanPad) st.score += 10 * r.max; CC.beep(700, 0.05, 'square', 0.03); } else CC.beep(320 + r.hp * 40, 0.04, 'square', 0.03);
      }
      const isAlive = (r) => !r.dead;

      // ---------- the computer paddle ----------
      /** Runs the ball forward without touching the real bricks and returns where it will meet the paddle row. */
      function predictLanding(b0, aware, horizon) {
        const b = { x: b0.x, y: b0.y, vx: b0.vx, vy: b0.vy, sp: b0.sp }, hp = new Map();
        const left = (r) => (hp.has(r) ? hp.get(r) : r.hp);
        const list = aware ? st.bricks : [];
        const n = Math.max(1, Math.ceil((b.sp / 60) / 4)), h = 1 / 60 / n;
        for (let i = 0; i < horizon * 60; i++) {
          for (let k = 0; k < n; k++) stepOnce(b, h, list, (r) => !r.dead && left(r) > 0, (r) => hp.set(r, left(r) - 1));
          if (b.vy > 0 && b.y >= PAD_Y - PH / 2 - BR) return b.x;
        }
        return null;
      }
      function padThink() {
        const s = padSkill(), b = st.ball, ai = st.ai;
        if (st.serving) { ai.target = W / 2 + CC.rand(-80, 80); return; }
        let px = null;
        if (s >= 0.15) px = predictLanding(b, s >= 0.3, CC.lerp(1.6, 5, s));
        if (px == null) px = b.vy > 0 ? b.x : CC.lerp(st.pad.x, b.x, 0.4);
        px += CC.gauss() * (6 + 55 * (1 - s));
        let off = CC.rand(-0.35, 0.35);
        if (s > 0.4 && st.bricks.length) { // aim the return at the front-most brick
          let front = st.bricks[0];
          for (const r of st.bricks) if (r.y > front.y) front = r;
          const a = Math.atan2(front.x + front.w / 2 - px, PAD_Y - front.y - BH / 2);
          off = CC.clamp(a, -0.85, 0.85) * CC.lerp(0.5, 1, s);
        }
        ai.target = px - off * (st.pw / 2);
      }
      function movePaddle(dt) {
        const p = st.pad;
        if (humanPad) {
          const inp = api.input, kd = (inp.keys.ArrowRight || inp.keys.KeyD ? 1 : 0) - (inp.keys.ArrowLeft || inp.keys.KeyA ? 1 : 0);
          if (kd) { p.x += kd * 540 * dt; st.lastMouseX = inp.mouse.x; }
          else if (inp.mouse.inside && inp.mouse.x !== st.lastMouseX) { const d = inp.mouse.x - p.x, m = 1100 * dt; p.x += CC.clamp(d, -m, m); if (Math.abs(d) < 1) st.lastMouseX = inp.mouse.x; }
          if ((inp.pressed.Space || inp.mouse.clicked) && st.serving && st.pause <= 0) serve();
        } else {
          const ai = st.ai, s = padSkill();
          ai.t -= dt; if (ai.t <= 0) { ai.t = 0.26 - 0.19 * s; padThink(); }
          const m = (300 + 330 * s) * dt; p.x += CC.clamp(ai.target - p.x, -m, m);
          if (st.serving && st.pause <= 0) { st.serveT += dt; if (st.serveT > 0.9) serve(); }
        }
        p.x = CC.clamp(p.x, st.pw / 2, W - st.pw / 2);
      }
      function serve() {
        const sp = baseSpeed(), a = CC.rand(-0.4, 0.4);
        st.ball.x = st.pad.x; st.ball.y = PAD_Y - PH / 2 - BR - 1;
        st.ball.sp = sp; st.ball.vx = sp * Math.sin(a); st.ball.vy = -sp * Math.cos(a); st.serving = false; CC.beep(440, 0.05);
      }
      function paddleHit() {
        const b = st.ball, p = st.pad;
        if (b.vy <= 0 || Math.abs(b.y - PAD_Y) > PH / 2 + BR || Math.abs(b.x - p.x) > st.pw / 2 + BR) return;
        const off = CC.clamp((b.x - p.x) / (st.pw / 2), -1, 1), a = off * 1.0;
        b.sp = Math.min(b.sp * 1.01, baseSpeed() * 1.35);
        b.vx = b.sp * Math.sin(a); b.vy = -b.sp * Math.cos(a);
        b.y = PAD_Y - PH / 2 - BR; CC.beep(330, 0.04);
      }

      // ---------- the computer brick-layer (watch mode) ----------
      function layerThink() {
        const L = st.layer;
        if (st.credits >= LOWER_COST && st.bricks.length > 12 && Math.random() < 0.3) { lowerAll(); return; }
        if (st.credits < 1) return;
        const level = Math.max(1, Math.min(5, Math.floor(st.credits), CC.randInt(2, 5)));
        const rowsUsed = st.bricks.map((b) => Math.round((b.ty - TOP) / RH)), low = rowsUsed.length ? Math.max(...rowsUsed) : 4;
        for (let tries = 0; tries < 30; tries++) {
          const c = CC.randInt(0, COLS - 1), r = Math.max(0, low + CC.randInt(-3, 1));
          if (!canPlace(c, r, level)) { place(c, r, level); return; }
        }
      }

      // ---------- per-tick update ----------
      function updateWall(dt) {
        const over = econ && st.t > OVERTIME;
        if (over && !st.overtime) { st.overtime = true; api.banner('Overtime', 'The wall starts to creep', 1400); }
        for (const b of st.bricks) {
          if (humanPad) { b.y += creep() * dt; b.ty = b.y; }
          else {
            if (over) b.ty += (1.5 + 0.03 * (st.t - OVERTIME)) * dt;   // overtime: the wall creeps, faster and faster, even if nobody pays to lower it
            if (b.y < b.ty) b.y = Math.min(b.ty, b.y + 200 * dt);
          }
        }
      }
      function physics(dt) {
        const b = st.ball;
        if (st.serving) { b.x = st.pad.x; b.y = PAD_Y - PH / 2 - BR - 1; return; }
        const n = Math.max(1, Math.ceil((b.sp * dt) / 4)), h = dt / n;
        for (let i = 0; i < n; i++) {
          stepOnce(b, h, st.bricks, isAlive, hitBrick);
          paddleHit();
          if (b.y > H + BR) { loseBall(); return; }
        }
      }
      function hud() {
        const lives = '●'.repeat(Math.max(0, st.lives)) || '–';
        if (humanPad) api.hud(`Score ${st.score}`, `Level ${st.level}`, `Balls ${lives} · best ${st.best}`);
        else api.hud(`Credits ${Math.floor(st.credits)}`, `Round ${st.roundNo} · level ${st.level}`, `Balls ${lives} · ${humanLayer ? 'you' : 'layer'} ${st.wins.layer}/${LAYER_WINS} · paddle ${st.wins.paddle}/${PADDLE_WINS}`);
      }

      hud(); refreshShop();
      api.banner(humanPad ? 'Breakout' : humanLayer ? 'Lay the bricks' : 'Breakout — attract mode', humanPad ? 'Serve with Space or a click' : humanLayer ? 'Pick a brick and click to place it' : 'The computer plays both sides', 1500);

      return {
        state: st,
        update(dt) {
          const inp = api.input;
          st.pw = pw();
          for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
          st.parts = st.parts.filter((p) => p.t > 0);
          st.lowerCool = Math.max(0, st.lowerCool - dt);
          if (st.pending) { st.pending.t -= dt; if (st.pending.t <= 0) { const f = st.pending.fn; st.pending = null; f(); } }
          if (st.over && !st.pending) { hud(); refreshShop(); return; }
          st.pause = Math.max(0, st.pause - dt);
          movePaddle(dt);
          // brick-layer actions
          if (humanLayer && !st.over) {
            for (let k = 1; k <= 5; k++) if (inp.pressed['Digit' + k] || inp.pressed['Numpad' + k]) select(k);
            if (inp.pressed.KeyL) lowerAll();
            if (inp.mouse.clicked) {
              const c = Math.floor((inp.mouse.x - X0) / (BW + GAP)), r = Math.floor((inp.mouse.y - TOP) / RH);
              const why = place(c, r, st.selected);
              if (why) { api.banner(why, '', 900); CC.beep(120, 0.08); }
            }
          } else if (role === 'watch' && !st.over && !st.pending) {
            st.layer.t -= dt; if (st.layer.t <= 0) { st.layer.t = CC.rand(0.5, 1.2); layerThink(); }
          }
          if (!st.pending && !st.over) {
            if (st.pause <= 0) {
              st.t += dt;
              if (econ) st.credits = Math.min(CREDIT_CAP, st.credits + INCOME * dt);
              updateWall(dt);
              if (st.bricks.some((r) => r.y + BH >= DANGER_Y)) {
                if (humanPad) gameOver('The bricks reached the paddle.'); else endRound('layer', 'A brick reached the red line.');
              } else {
                physics(dt);
                st.bricks = st.bricks.filter((r) => !r.dead);
                if (!st.bricks.length && !st.pending && !st.over) wallCleared();
              }
            } else { for (const b of st.bricks) if (b.y < b.ty) b.y = Math.min(b.ty, b.y + 200 * dt); physics(0); }
          }
          hud(); refreshShop();
        },
        draw(ctx) {
          const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#120a14'); g.addColorStop(0.6, '#07090e'); g.addColorStop(1, '#14100a');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // the build zone and the danger line
          if (econ) { ctx.strokeStyle = 'rgba(255,179,71,.55)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(0, BUILD_MAX + BH + 3); ctx.lineTo(W, BUILD_MAX + BH + 3); ctx.stroke(); ctx.setLineDash([]); }
          ctx.strokeStyle = 'rgba(224,64,90,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, DANGER_Y); ctx.lineTo(W, DANGER_Y); ctx.stroke(); ctx.lineWidth = 1;
          CC.text(ctx, 'DANGER', W - 44, DANGER_Y - 9, { size: 10, color: 'rgba(224,64,90,.8)', font: 'Chivo, sans-serif' });
          for (const r of st.bricks) {
            ctx.fillStyle = HP_COLOR[Math.max(1, Math.min(5, r.hp))]; ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(r.x, r.y, r.w, 3);
            CC.text(ctx, String(r.hp), r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 12, color: '#1a1006', font: 'Chivo, sans-serif' });
          }
          // brick-layer's ghost brick
          const m = api.input.mouse;
          if (humanLayer && !st.over && m.inside) {
            const c = Math.floor((m.x - X0) / (BW + GAP)), r = Math.floor((m.y - TOP) / RH);
            if (c >= 0 && c < COLS && r >= 0) {
              const ok = !canPlace(c, r, st.selected), rc = cellRect(c, r);
              ctx.globalAlpha = 0.55; ctx.fillStyle = ok ? HP_COLOR[st.selected] : '#e0405a'; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); ctx.globalAlpha = 1;
            }
          }
          // paddle and ball
          const p = st.pad;
          CC.glow(ctx, '#ffc46e', 12); ctx.fillStyle = '#ffc46e'; ctx.beginPath(); ctx.roundRect(p.x - st.pw / 2, PAD_Y - PH / 2, st.pw, PH, 6); ctx.fill(); CC.noGlow(ctx);
          const b = st.ball;
          CC.glow(ctx, '#fff', 10); ctx.fillStyle = '#fff0d0'; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, Math.PI * 2); ctx.fill(); CC.noGlow(ctx);
          for (const q of st.parts) { ctx.globalAlpha = Math.min(1, q.t * 2.5); ctx.fillStyle = q.color; ctx.fillRect(q.x - 2, q.y - 2, 4, 4); } ctx.globalAlpha = 1;
          if (humanPad && st.serving && st.pause <= 0 && !st.over) CC.text(ctx, 'Space or click to serve', W / 2, PAD_Y - 60, { size: 16, color: '#ffb347' });
        },
      };
    },
  });
})();
