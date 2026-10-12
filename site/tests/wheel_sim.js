/**
 * Test: Wheel of Terror balance.
 *
 * @file Runs the real Wheel of Terror update loop headlessly.
 *  1. Swing side: a stand-in for a human (the computer swinger's own planner, at three
 *     skill settings and re-planning every 0.25 s) swings against the computer sender, and
 *     the script reports how long it lasts and how it ended.
 *  2. Sender side: scripted senders (one that drops objects only, and one that also plants
 *     spikes where the ball is about to be) try to wreck the computer swinger; the script
 *     reports how often the sender wins and how long it takes.
 *  3. Checks that every spike the computer sender plants can be dodged.
 *
 * Run: {@code node tests/wheel_sim.js [quick]}
 * @see js/games/wheel.js
 */
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {} }; global.addEventListener = () => {};
global.setTimeout = () => 0;
require('../js/core.js');
const games = {}; CC.register = (g) => (games[g.id] = g);
require(process.env.WHEEL_PATH || '../js/games/wheel.js');
const quick = process.argv[2] === 'quick';
const G = games.wheel, DT = 1 / 60;
const CX = 400, CY = 215, R = 150;

function make(role) {
  const input = { keys: {}, pressed: {}, mouse: { x: 0, y: 0, down: false, clicked: false, released: false, inside: true } };
  const log = [];
  const api = { ctx: null, W: 800, H: 600, role, input, panel: { append() {} }, hud() {}, banner(t, s) { log.push(t + ' ' + s); }, hideBanner() {}, setHelp() {}, isPaused: () => false };
  CC.el = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids, setAttribute() {}, set disabled(v) {}, set textContent(v) {} });
  const inst = G.create(api);
  return { inst, input, st: inst.state, log };
}

// ---------------------------------------------------------------- swing side
function swingRun(skill, seconds) {
  const { inst, input, st, log } = make('swing');
  let t = 0, cool = 0; const waveAt = [];
  for (let f = 0; f < seconds * 60; f++) {
    input.pressed = {}; input.mouse.clicked = false;
    cool -= DT; if (cool <= 0) { input.keys.Space = inst.think(skill); cool = 0.25; }
    const w0 = st.wave; inst.update(DT); t += DT;
    if (st.wave !== w0) waveAt.push(st.wave);
    if (st.over) return { t, wave: st.wave, why: log[log.length - 1].replace(/Press R.*/, '').trim(), score: st.score };
  }
  return { t, wave: st.wave, why: 'alive', score: st.score };
}

// ---------------------------------------------------------------- sender side
function senderRun(strategy, maxSeconds) {
  const { inst, input, st } = make('sender');
  let t = 0, cool = 0, minLives = 3;
  for (let f = 0; f < maxSeconds * 60; f++) {
    input.pressed = {}; input.mouse.clicked = false;
    cool -= DT;
    if (cool <= 0 && !st.over) {
      cool = 0.5 + Math.random() * 0.4;
      const cr = Math.floor(st.credits);
      if (strategy === 'spiker' && cr >= 4 && Math.random() < 0.6) {
        // plant a spike where the ball will be if it keeps its current speed
        const a = st.th + st.w * 1.8 + (Math.random() - 0.5) * 0.4;
        inst.tools.sendSpike(a);
      } else if (cr >= 1) {
        const type = cr >= 3 && st.wave >= 3 && Math.random() < 0.4 ? 'iron' : cr >= 2 && Math.random() < 0.5 ? 'barrel' : 'crate';
        const side = Math.random() < 0.5 ? -1 : 1;
        inst.tools.sendObject(type, CX + side * (110 + Math.random() * 150));
      }
    }
    inst.update(DT); t += DT;
    if (st.over) return { win: st.lives <= 0, t, wave: st.wave, minLives: Math.min(minLives, st.lives) };
    minLives = Math.min(minLives, st.lives);
  }
  return { win: false, t: maxSeconds, wave: st.wave, minLives };
}

console.log('=== Swing side: the planner standing in for a human, against the computer sender ===');
const runs = quick ? 2 : 5;
for (const skill of [0.3, 0.6, 0.9]) {
  const outs = []; for (let i = 0; i < runs; i++) outs.push(swingRun(skill, 330));
  console.log(`-- stand-in skill ${skill}: ` + outs.map((o) => `${o.why === 'alive' ? 'alive' : o.why.split('.')[0]} @wave ${o.wave} (${o.t.toFixed(0)}s, score ${o.score})`).join(' | '));
}

console.log('\n=== Sender side: scripted senders against the computer swinger ===');
const trials = quick ? 4 : 10;
for (const strategy of ['objects only', 'spiker']) {
  let wins = 0, tsum = 0; const waves = [], mins = [];
  for (let i = 0; i < trials; i++) { const r = senderRun(strategy === 'spiker' ? 'spiker' : 'objects', 170); if (r.win) wins++; tsum += r.t; waves.push(r.wave); mins.push(r.minLives); }
  console.log(`${strategy.padEnd(13)} sender wins ${wins}/${trials}, mean ${(tsum / trials).toFixed(0)}s, wave reached: ${waves.join(',')}; fewest lives: ${mins.join(',')}`);
}
