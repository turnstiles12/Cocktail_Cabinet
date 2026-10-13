/**
 * Test: Missile Command wave conditions.
 *
 * @file Runs the real Missile Command update loop headlessly and checks the random wave
 * conditions: none on wave 1, every condition can appear, each does what it says (shield
 * dome soaks a hit, armored warheads need two blasts, supply drop adds interceptors, charged
 * batteries widen the blast, calm skies and meteor storm change warhead speed), the
 * condition leans toward helping whoever is losing, and a clean wave rebuilds a city.
 *
 * Run: {@code node tests/missile_events.js}
 * @see js/games/missile.js
 */
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {} }; global.addEventListener = () => {};
global.setTimeout = () => 0;
require('../js/core.js');
const games = {}; CC.register = (g) => (games[g.id] = g);
require(process.env.MISSILE_PATH || '../js/games/missile.js');
const G = games.missile, DT = 1 / 60;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
function make(role) {
  const input = { keys: {}, pressed: {}, mouse: { x: 400, y: 300, down: false, clicked: false, released: false, inside: true } };
  const api = { W: 800, H: 600, role, input, hud() {}, banner() {}, hideBanner() {}, setHelp() {}, isPaused: () => false };
  const inst = G.create(api);
  return { inst, st: inst.state, input };
}
const run = (inst, s) => { for (let i = 0; i < s * 60; i++) inst.update(DT); };
/** Sets up a quiet board so a single condition can be observed. */
function stage(role, ev) {
  const g = make(role), st = g.st;
  st.ev = ev ? { id: ev, side: 'x', name: ev, text: '' } : null; st.inc = []; st.ctr = []; st.exp = []; st.toSpawn = 0; st.atkAmmo = 0; st.gap = 99;
  for (const b of st.bats) { b.alive = true; b.ammo = 12; } for (const c of st.cities) { c.alive = true; c.sh = ev === 'shield'; }
  return g;
}
const warhead = (st, x, y, hp = 1) => st.inc.push({ id: ++st.id, hp, sx: x, sy: y, x, y, tx: x, ty: 560, vx: 0, vy: 40, split: false, splitY: 9999, seen: 0, assigned: 0 });

{ // wave 1 has no condition; later waves sometimes do and every one turns up
  const first = new Set(); for (let i = 0; i < 40; i++) first.add(make('defend').st.ev);
  ok(first.size === 1 && first.has(null), 'wave 1 never has a condition');
  const seen = new Set();
  for (let i = 0; i < 600; i++) { const { inst, st } = make('watch'); st.wave = 1; st.inc = []; st.toSpawn = 0; st.gap = 0; st.ai.cool = 99; st.cities.forEach((c) => (c.alive = true)); run(inst, 0.1); if (st.ev) seen.add(String(st.ev.id)); }
  ok(seen.size === 8, `all 8 conditions can occur (saw ${[...seen].join(', ')})`);
}
{ // shield dome
  const { inst, st } = stage('defend', 'shield'); const city = st.cities[0]; warhead(st, city.x, 540);
  run(inst, 1);
  ok(city.alive && !city.sh, 'shield dome: the first hit is absorbed and the dome pops');
  run(inst, 2); warhead(st, city.x, 540); run(inst, 1);
  ok(!city.alive, 'shield dome: the second hit destroys the city');
}
{ // armored: one blast is not enough, two bursts are
  const { inst, st } = stage('defend', 'armored'); warhead(st, 400, 300, 2); const m = st.inc[0]; m.vy = 0;
  st.exp.push({ x: 400, y: 300, r: 30, max: 30, t: 0.2, kind: 'def' }); run(inst, 0.05);
  ok(!m.dead && m.hp === 1, 'armored warhead survives its first blast, now at 1');
  st.exp.push({ x: 400, y: 300, r: 30, max: 30, t: 0.2, kind: 'def' }); run(inst, 0.05);
  ok(st.inc.every((x) => x.id !== m.id), 'armored warhead dies to a second blast');
}
{ // supply drop / charged batteries / speed
  const a = make('defend'); a.st.wave = 1; a.st.cities.forEach((c) => (c.alive = true));
  const sup = (() => { for (let i = 0; i < 400; i++) { const g = make('watch'); g.st.wave = 1; g.st.gap = 0; g.st.inc = []; g.st.toSpawn = 0; g.inst.update(DT); if (g.st.ev && g.st.ev.id === 'resupply') return g; } return null; })();
  ok(sup && sup.st.bats.every((b) => b.ammo >= 16), 'supply drop: batteries start the wave with extra interceptors');
  const { inst, st } = stage('defend', 'bigblast'); st.bats[1].ammo = 5; st.mouse; 
  const g2 = make('defend'); g2.st.ev = { id: 'bigblast' }; g2.st.inc = []; g2.st.toSpawn = 0; g2.st.gap = 99;
  g2.input.mouse.x = 400; g2.input.mouse.y = 300; g2.input.mouse.clicked = true; g2.inst.update(DT); g2.input.mouse.clicked = false; run(g2.inst, 1.5);
  ok(g2.st.exp.some((e) => e.kind === 'def' && e.max > 55), `charged batteries: blast radius ${Math.max(...g2.st.exp.map((e) => e.max)).toFixed(0)} vs 42 normally`);
  const sp = (id) => { const g = make('watch'); g.st.ev = { id }; g.st.toSpawn = 5; g.st.spawnT = 0; g.st.ai.cool = 99; g.inst.update(DT); return Math.hypot(g.st.inc[0].vx, g.st.inc[0].vy); };
  const base = sp(null), slow = sp('slow'), fast = sp('fast');
  ok(Math.abs(slow / base - 0.8) < 0.02 && Math.abs(fast / base - 1.25) < 0.02, `warhead speed: slow ${slow.toFixed(0)} / normal ${base.toFixed(0)} / fast ${fast.toFixed(0)}`);
}
{ // rubber band: a losing defender mostly gets defence help, an untouched one mostly attack help
  const share = (role, dead) => {
    let def = 0, n = 0;
    for (let i = 0; i < 800; i++) {
      const g = make(role); g.st.wave = 1; g.st.cities.forEach((c, k) => (c.alive = k >= dead)); g.st.inc = []; g.st.toSpawn = 0; g.st.gap = 0; g.st.ai.cool = 99; g.st.atkAmmo = 0;
      g.inst.update(DT); if (g.st.ev) { n++; if (g.st.ev.side === 'def') def++; }
    }
    return def / n;
  };
  const losing = share('defend', 4), safe = share('defend', 0), atkLosing = share('attack', 0), atkWinning = share('attack', 4);
  ok(losing > 0.65 && safe < 0.4, `defender: help for defense ${(losing * 100).toFixed(0)}% when 4 cities are down, ${(safe * 100).toFixed(0)}% when none are`);
  ok(atkLosing < 0.4 && atkWinning > 0.6, `attacker: help for defense ${(atkWinning * 100).toFixed(0)}% when 4 cities are down, ${(atkLosing * 100).toFixed(0)}% when all stand`);
}
{ // a clean wave rebuilds a city (defender side), a messy one does not
  const a = stage('defend', null); a.st.cities[2].alive = false; a.st.lost = 0; a.st.gap = 0.01; run(a.inst, 0.1);
  ok(a.st.cities[2].alive, 'a wave with no city lost rebuilds one');
  const b = stage('defend', null); b.st.cities[2].alive = false; b.st.lost = 1; b.st.gap = 0.01; run(b.inst, 0.1);
  ok(!b.st.cities[2].alive, 'a wave that lost a city does not');
}
process.exit(fails ? 1 : 0);
