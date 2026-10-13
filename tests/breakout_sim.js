/**
 * Test: Breakout (falling bricks) headless checks.
 *
 * @file Runs the real Breakout update loop without a browser and checks that:
 *  1. bricks are added by the computer and march down toward the paddle over time;
 *  2. bricks come in several strengths (1 to 4) and the higher ones take that many hits;
 *  3. each power-up does its job (ball tripler makes three balls from one, the paddle
 *     extender widens the paddle, the speed increaser speeds the ball up) and wears off;
 *  4. the computer-played paddle keeps the game going for a while and the game ends cleanly
 *     (and restarts itself in watch mode).
 *
 * Run: {@code node tests/breakout_sim.js}
 * @see js/games/breakout.js
 */
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {} }; global.addEventListener = () => {};
global.setTimeout = () => 0;
require('../js/core.js');
const games = {}; CC.register = (g) => (games[g.id] = g);
require(process.env.BREAKOUT_PATH || '../js/games/breakout.js');
const G = games.breakout, DT = 1 / 60;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

function make(role) {
  const input = { keys: {}, pressed: {}, mouse: { x: 280, y: 0, down: false, clicked: false, released: false, inside: false } };
  const log = [];
  const api = { W: 560, H: 720, role, input, hud() {}, banner(t, s) { log.push(t + ' ' + (s || '')); }, hideBanner() {}, setHelp() {}, isPaused: () => false };
  const inst = G.create(api);
  return { inst, st: inst.state, input, log };
}
const run = (inst, seconds) => { for (let i = 0; i < seconds * 60; i++) inst.update(DT); };

// 1 + 2: bricks arrive, march down, vary in strength
{
  const { inst, st } = make('paddle');
  const start = st.bricks.length, minY0 = Math.min(...st.bricks.map((b) => b.y));
  ok(start > 0, `board starts with bricks (${start})`);
  const hps = new Set(); for (let i = 0; i < 40; i++) { const g = make('paddle'); for (const b of g.st.bricks) hps.add(b.hp); }
  ok(hps.size >= 3 && Math.min(...hps) === 1, `several strengths appear: ${[...hps].sort().join(',')}`);
  st.serving = false; st.balls = [{ x: 5, y: 700, vx: 0, vy: -300, last: null, lastT: 0 }]; // park a ball so time passes
  st.pad.x = 280; run(inst, 10);
  ok(Math.min(...st.bricks.map((b) => b.y)) > minY0 || st.bricks.length > start, 'bricks march down / new rows arrive');
}
// hits needed
{
  const { inst, st } = make('paddle');
  st.bricks = [{ x: 200, y: 300, w: 51, h: 20, hp: 3, max: 3, flash: 0 }]; st.serving = false;
  let hits = 0; const r = st.bricks[0];
  for (let k = 0; k < 6 && r.hp > 0; k++) {
    st.balls = [{ x: 225, y: 340, vx: 0, vy: -330, last: null, lastT: 0 }];
    const before = r.hp; for (let i = 0; i < 40 && r.hp === before; i++) inst.update(DT); hits++;
  }
  ok(r.hp <= 0 && hits === 3, `a 3-strength brick needs exactly 3 hits (took ${hits})`);
}
// power-ups
{
  const { inst, st } = make('paddle');
  st.serving = false; st.bricks = [{ x: 0, y: 100, w: 51, h: 20, hp: 4, max: 4, flash: 0 }]; st.balls = [{ x: 280, y: 400, vx: 100, vy: -300, last: null, lastT: 0 }];
  const sp0 = Math.hypot(st.balls[0].vx, st.balls[0].vy);
  st.pause = 0; st.caps = [{ x: st.pad.x, y: 660, type: 'triple' }]; run(inst, 0.3);
  ok(st.balls.length === 3, `triple: 1 ball became ${st.balls.length}`);
  st.caps = [{ x: st.pad.x, y: 660, type: 'wide' }]; st.pad.x = 280; run(inst, 2);
  ok(st.pw > 88 * 1.5, `wide: paddle width ${st.pw.toFixed(0)} > 132`);
  st.caps = [{ x: st.pad.x, y: 660, type: 'fast' }]; run(inst, 0.5);
  const sp1 = Math.hypot(st.balls[0].vx, st.balls[0].vy);
  ok(sp1 > sp0 * 1.25, `fast: ball speed ${sp0.toFixed(0)} -> ${sp1.toFixed(0)}`);
  st.balls = st.balls.slice(0, 1); st.balls[0].y = 300; st.eff.wide = 0.2; st.eff.fast = 0.2; run(inst, 3);
  ok(st.pw <= 88.5 && st.eff.fast === 0, 'effects wear off');
}
// computer-played paddle (watch): survives a while, game can end and restarts
{
  const { inst, st, log } = make('watch');
  let maxBalls = 1, ended = 0, restarted = 0, was = false;
  for (let i = 0; i < 60 * 600; i++) {
    inst.update(DT); maxBalls = Math.max(maxBalls, st.balls.length);
    if (st.over && !was) ended++; if (!st.over && was) restarted++; was = st.over;
  }
  ok(maxBalls >= 3, `power-ups appeared and were caught in 10 min of watch play (max balls ${maxBalls})`);
  ok(ended >= 1 && restarted >= 1, `game over (${ended}x) and auto-restart (${restarted}x) work`);
  console.log('level reached overall:', st.level, 'score:', st.score);
}
// human side with no input: ball lost then game over, no crash
{
  const { inst, st, input } = make('paddle');
  input.pressed.Space = true; inst.update(DT); input.pressed = {};
  for (let i = 0; i < 60 * 400 && !st.over; i++) { inst.update(DT); if (st.serving && st.lives > 0) { input.pressed.Space = true; inst.update(DT); input.pressed = {}; } }
  ok(st.over && st.lives <= 0, `idle human loses all lives and the game ends (lives ${st.lives})`);
}
process.exit(fails ? 1 : 0);
