/**
 * Test: Missile Command balance.
 *
 * @file Runs the real Missile Command update loop headlessly with two scripted stand-ins
 * for a human and reports how each side fares, so changes to the rules can be judged by
 * numbers rather than feel.
 *  1. Defender stand-in: reacts after a short delay, leads each warhead, and clicks with
 *     some aim error and a limited clicking rate, against the computer's attack.
 *     Reports how many waves it lasts and how often it is still alive after wave 7.
 *  2. Attacker stand-in: fires at random cities as fast as allowed and splits warheads when
 *     several are high, against the computer defense. Reports how often it flattens all
 *     six cities before the defense survives wave 7.
 *
 * Run: {@code node tests/missile_sim.js [games] } (default 30 games per side)
 * Set MISSILE_PATH to test another copy of the game file.
 * @see js/games/missile.js
 */
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {} }; global.addEventListener = () => {};
global.setTimeout = () => 0;
require('../js/core.js');
const games = {}; CC.register = (g) => (games[g.id] = g);
require(process.env.MISSILE_PATH || '../js/games/missile.js');
const G = games.missile, DT = 1 / 60, N = +process.argv[2] || 30;
const GROUND = 560;

function make(role) {
  const input = { keys: {}, pressed: {}, mouse: { x: 400, y: 300, down: false, clicked: false, released: false, inside: true } };
  const api = { W: 800, H: 600, role, input, hud() {}, banner() {}, hideBanner() {}, setHelp() {}, isPaused: () => false };
  const inst = G.create(api);
  return { inst, st: inst.state, input };
}
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function defenderRun(skill) {
  const { inst, st, input } = make('defend');
  let cool = 0, react = new Map(), t = 0, maxWave = 0;
  for (let f = 0; f < 60 * 900 && !st.over; f++) {
    input.pressed = {}; input.mouse.clicked = false; cool -= DT; t += DT;
    maxWave = Math.max(maxWave, st.wave);
    if (cool <= 0) {
      const alive = st.cities.filter((c) => c.alive).map((c) => c.x).concat(st.bats.filter((b) => b.alive).map((b) => b.x));
      const cands = st.inc.filter((m) => !m.dead && m.y < GROUND - 70 && !m.shot && alive.some((x) => Math.abs(x - m.tx) < 40));
      for (const m of cands) if (!react.has(m.id)) react.set(m.id, t);
      const ready = cands.filter((m) => t - react.get(m.id) > skill.react).sort((a, b) => (GROUND - a.y) / a.vy - (GROUND - b.y) / b.vy);
      if (ready.length) {
        const m = ready[0], order = [0, 1, 2].filter((i) => st.bats[i].alive && st.bats[i].ammo > 0);
        if (order.length) {
          const bi = order.sort((a, b) => Math.abs(st.bats[a].x - m.x) - Math.abs(st.bats[b].x - m.x))[0], b = st.bats[bi], sp = bi === 1 ? 700 : 520;
          let tt = 0.4, p = { x: m.x, y: m.y };
          for (let k = 0; k < 6; k++) { p = { x: m.x + m.vx * (tt + 0.1), y: m.y + m.vy * (tt + 0.1) }; tt = Math.hypot(p.x - b.x, p.y - (GROUND - 14)) / sp; }
          if (p.y < GROUND - 40) {
            input.mouse.x = p.x + gauss() * skill.err; input.mouse.y = p.y + gauss() * skill.err; input.mouse.clicked = true; m.shot = true; cool = skill.rate;
            // let the same warhead be shot again later if it survives
            ((mm) => { mm.shotAt = t; })(m);
          }
        }
      }
      for (const m of st.inc) if (m.shot && t - (m.shotAt || 0) > 1.2) m.shot = false;
    }
    inst.update(DT);
  }
  return { waves: maxWave, over: st.over, cities: st.cities.filter((c) => c.alive).length };
}
function attackerRun(skill) {
  const { inst, st, input } = make('attack');
  let cool = 0, won = false;
  for (let f = 0; f < 60 * 900 && !st.over; f++) {
    input.pressed = {}; input.mouse.clicked = false; cool -= DT;
    if (cool <= 0 && st.atkAmmo > 0) {
      const alive = st.cities.filter((c) => c.alive).map((c) => c.x);
      if (alive.length) { input.mouse.x = alive[Math.floor(Math.random() * alive.length)] + gauss() * 10; input.mouse.clicked = true; cool = skill.rate; }
    }
    if (st.mirv > 0 && st.inc.filter((m) => !m.dead && m.y < 380).length >= skill.splitAt) input.pressed.Space = true;
    inst.update(DT);
  }
  const left = st.cities.filter((c) => c.alive).length;
  return { win: left === 0, left, wave: st.wave };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a) => (100 * a.filter(Boolean).length / a.length).toFixed(0) + '%';
const D = { average: { react: 0.45, err: 18, rate: 0.28 }, sharp: { react: 0.25, err: 9, rate: 0.2 } };
for (const [name, sk] of Object.entries(D)) {
  const r = Array.from({ length: N }, () => defenderRun(sk));
  const w = r.map((x) => x.waves).sort((a, b) => a - b);
  console.log(`DEFENDER (${name} stand-in): median wave reached ${w[Math.floor(N / 2)]}, mean ${mean(w).toFixed(1)}, reached wave 6+: ${pct(r.map((x) => x.waves >= 6))}, wave 9+: ${pct(r.map((x) => x.waves >= 9))}`);
}
const A = { average: { rate: 0.45, splitAt: 3 }, sharp: { rate: 0.36, splitAt: 2 } };
for (const [name, sk] of Object.entries(A)) {
  const r = Array.from({ length: N }, () => attackerRun(sk));
  console.log(`ATTACKER (${name} stand-in): flattens all six cities ${pct(r.map((x) => x.win))}, mean cities left ${mean(r.map((x) => x.left)).toFixed(1)}`);
}
