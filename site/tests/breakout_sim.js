/**
 * Test: Breakout balance.
 *
 * @file Runs the real Breakout update loop headlessly.
 *  1. Paddle side: a scripted human who tracks the ball (with reaction lag and aiming error,
 *     in three skill grades) plays from level 1 and the script reports, per level, how long
 *     each wall took to clear or how the run ended.
 *  2. Brick-layer side: scripted brick-layers (a turtle that never lowers, an aggressor that
 *     lowers whenever it can, and a mixed player) each play single rounds against the
 *     computer paddle at levels 1 to 7; the script reports how often the layer wins a round
 *     and how long rounds last.
 *
 * Run: {@code node tests/breakout_sim.js [quick]}
 * @see js/games/breakout.js
 */
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {} }; global.addEventListener = () => {};
global.setTimeout = () => 0;
require('../js/core.js');
const games = {}; CC.register = (g) => (games[g.id] = g);
require(process.env.BO_PATH || '../js/games/breakout.js');
const quick = process.argv[2] === 'quick';
const G = games.breakout, DT = 1 / 60;
const COLS = 8, BW = 63, GAP = 4, X0 = 14, RH = 24, TOP = 40;

function make(role) {
  const input = { keys: {}, pressed: {}, mouse: { x: 280, y: 0, down: false, clicked: false, released: false, inside: true } };
  const log = [];
  const api = { ctx: null, W: 560, H: 720, role, input, panel: { append() {} }, hud() {}, banner(t, s) { log.push(t + ' ' + s); }, hideBanner() {}, setHelp() {}, isPaused: () => false };
  // the shop panel needs a DOM; stub CC.el for headless runs
  CC.el = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids, setAttribute() {}, set disabled(v) {}, set textContent(v) {} });
  const inst = G.create(api);
  return { inst, input, st: inst.state, log };
}
const gauss = () => CC.gauss();

// ---------------------------------------------------------------- paddle side
function wallLanding(b, padY) { // where a sharp-eyed person expects the ball to land, counting wall bounces but not bricks
  if (b.vy <= 0) return b.x;
  let x = b.x + b.vx * ((padY - b.y) / b.vy); const span = 560 - 14, m = (((x - 7) % (2 * span)) + 2 * span) % (2 * span);
  return m <= span ? 7 + m : 7 + 2 * span - m;
}
function humanRun(grade, maxSeconds) {
  const { inst, input, st, log } = make('paddle');
  const lag = { weak: 14, average: 9, good: 5 }[grade], err = { weak: 34, average: 18, good: 8 }[grade];
  let off = 0, noise = 0, prevVy = 0, waited = 0, levelStart = 0, t = 0; const levels = [];
  for (let f = 0; f < maxSeconds * 60; f++) {
    input.pressed = {}; input.mouse.clicked = false;
    const b = st.ball;
    if (b.vy > 0 && prevVy <= 0) { off = (Math.random() * 2 - 1) * 0.7; noise = gauss() * err; waited = lag; }
    prevVy = b.vy;
    if (b.vy > 0) { if (waited > 0) waited--; else input.mouse.x = wallLanding(b, 676) - off * st.pw / 2 + noise; }
    else input.mouse.x = b.x * 0.5 + 140;
    if (st.serving && st.pause <= 0) input.pressed.Space = true;
    const lvBefore = st.level;
    inst.update(DT); t += DT;
    if (st.level !== lvBefore) { levels.push(`L${lvBefore} cleared in ${(t - levelStart).toFixed(0)}s`); levelStart = t; }
    if (st.over) return { result: `game over at level ${st.level} after ${t.toFixed(0)}s (score ${st.score}); ${log[log.length - 1].replace(/Press R.*/, '').trim()} bricks left ${st.bricks.length}, hits left ${st.bricks.reduce((a, b) => a + b.hp, 0)}`, levels };
  }
  return { result: `still alive at level ${st.level} after ${maxSeconds}s`, levels };
}

// ---------------------------------------------------------------- brick-layer side
function layerRound(strategy, level, maxSeconds) {
  const { inst, input, st } = make('bricks');
  st.level = level; let t = 0, cool = 0;
  const cellOf = (c, r) => ({ x: X0 + c * (BW + GAP) + BW / 2, y: TOP + r * RH + 9 });
  const frontRow = () => st.bricks.length ? Math.max(...st.bricks.map((b) => Math.round((b.ty - TOP) / RH))) : 4;
  for (let f = 0; f < maxSeconds * 60; f++) {
    input.pressed = {}; input.mouse.clicked = false; input.mouse.inside = true;
    cool -= DT;
    if (cool <= 0 && !st.pending) {
      cool = 0.45 + Math.random() * 0.3;
      const cr = Math.floor(st.credits);
      if (strategy === 'aggressor') {
        if (cr >= 5) input.pressed.KeyL = true;
        else if (cr >= 1) place(1, cr >= 2 ? 1 : 1);
      } else if (strategy === 'mixed') {
        if (cr >= 5 && Math.random() < 0.55) input.pressed.KeyL = true;
        else if (cr >= 1) place(Math.min(cr, 1 + Math.floor(Math.random() * 3)), 0);
      } else { // turtle
        if (cr >= 1) place(Math.min(cr, 3), -2);
      }
    }
    function place(level, bias) {
      input.pressed['Digit' + level] = true;
      const fr = frontRow();
      for (let tries = 0; tries < 20; tries++) {
        const c = Math.floor(Math.random() * COLS), r = Math.max(0, fr + bias + Math.floor(Math.random() * 3) - 1);
        const pos = cellOf(c, r); input.mouse.x = pos.x; input.mouse.y = pos.y; input.mouse.clicked = true;
        return;
      }
    }
    const w0 = st.wins.layer + st.wins.paddle;
    inst.update(DT); t += DT;
    if (st.wins.layer + st.wins.paddle > w0) return { win: st.wins.layer > 0, t, why: st.pending ? 'round' : 'match' };
  }
  return { win: false, t: maxSeconds, why: 'timeout' };
}

console.log('=== Paddle side: scripted human tracking the ball ===');
const runs = quick ? 2 : 6; const horizon = Number(process.env.HORIZON || 420);
for (const grade of (process.env.SKIP_PADDLE ? [] : ['weak', 'average', 'good'])) {
  const outs = [];
  for (let i = 0; i < runs; i++) outs.push(humanRun(grade, horizon));
  console.log(`-- ${grade} human, ${runs} runs`);
  outs.forEach((o) => console.log('   ', o.result, '|', o.levels.join(', ') || 'no level cleared'));
}

console.log('\n=== Brick-layer side: single rounds against the computer paddle ===');
const trials = quick ? 8 : 24;
for (const strategy of ['turtle', 'mixed', 'aggressor']) {
  const row = [];
  for (let level = 1; level <= 7; level++) {
    let wins = 0, total = 0, timeouts = 0;
    for (let i = 0; i < trials; i++) { const r = layerRound(strategy, level, 300); if (r.why === 'timeout') timeouts++; if (r.win) wins++; total += r.t; }
    row.push(`L${level}: ${(100 * wins / trials).toFixed(0)}% win, ${(total / trials).toFixed(0)}s${timeouts ? ` (${timeouts} timeouts)` : ''}`);
  }
  console.log(strategy.padEnd(10), row.join(' | '));
}
