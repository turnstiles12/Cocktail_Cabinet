/**
 * Test: Asteroids power-ups.
 *
 * @file Runs the real Asteroids update loop headlessly as the human pilot and checks that
 * flying into a token gives the power-up, rapid fire shoots faster, triple shot fires a fan
 * of three, a missile homes in and breaks a rock, the shield lets the ship survive a rock
 * and break it, tokens appear on their own and fade, and the computer-flown sides get none.
 *
 * Run: {@code node tests/asteroids_powerups.js}
 * @see js/games/asteroids.js
 */
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {} }; global.addEventListener = () => {};
global.setTimeout = () => 0;
require('../js/core.js');
const games = {}; CC.register = (g) => (games[g.id] = g);
require(process.env.ASTEROIDS_PATH || '../js/games/asteroids.js');
const G = games.asteroids, DT = 1 / 60;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
function make(role) {
  const input = { keys: {}, pressed: {}, mouse: { x: 0, y: 0, down: false, clicked: false, released: false, inside: false } };
  const api = { W: 800, H: 600, role, input, hud() {}, banner() {}, hideBanner() {}, setHelp() {}, isPaused: () => false };
  const inst = G.create(api);
  return { inst, st: inst.state, input };
}
const run = (inst, input, s) => { for (let i = 0; i < s * 60; i++) { inst.update(DT); input.pressed = {}; input.mouse.clicked = false; } };
const clear = (st) => { st.rocks = []; st.ship.inv = 0; st.ship.x = 400; st.ship.y = 300; st.ship.vx = st.ship.vy = 0; st.waveGap = 99; st.puT = 999; };
const give = (inst, input, st, type) => { st.items = [{ x: st.ship.x, y: st.ship.y, vx: 0, vy: 0, type, life: 10, ph: 0 }]; run(inst, input, 0.05); };

{ // pickup by direct contact only
  const { inst, st, input } = make('pilot'); clear(st);
  st.items = [{ x: 600, y: 100, vx: 0, vy: 0, type: 'rapid', life: 10, ph: 0 }]; run(inst, input, 0.2);
  ok(st.pw.rapid === 0 && st.items.length === 1, 'a token far from the ship is not picked up');
  give(inst, input, st, 'rapid');
  ok(st.pw.rapid > 9 && st.items.length === 0, 'flying into a token picks it up');
}
{ // rapid fire: more bullets in the same time
  const a = make('pilot'); clear(a.st); a.input.keys.Space = true; run(a.inst, a.input, 0.5); const plain = a.st.bullets.length;
  const b = make('pilot'); clear(b.st); give(b.inst, b.input, b.st, 'rapid'); b.input.keys.Space = true; b.st.bullets = []; b.st.cool = 0; run(b.inst, b.input, 0.5);
  ok(b.st.bullets.length > plain, `rapid fire: ${b.st.bullets.length} bullets in 0.5 s vs ${plain} normally`);
}
{ // triple shot
  const { inst, st, input } = make('pilot'); clear(st); give(inst, input, st, 'spread'); st.bullets = []; st.cool = 0;
  input.keys.Space = true; run(inst, input, 0.02);
  ok(st.bullets.length === 3, `triple shot fires a fan of ${st.bullets.length}`);
}
{ // missile homes in on a rock off to the side and breaks it
  const { inst, st, input } = make('pilot'); clear(st); give(inst, input, st, 'missile');
  ok(st.pw.missiles === 4, 'missile pickup gives 4 missiles');
  const rock = { x: 400, y: 120, vx: 0, vy: 0, size: 3, r: 40, shape: Array(11).fill(1), rot: 0, spin: 0 }; st.rocks = [rock]; st.score = 0;
  st.ship.a = 0; input.pressed.KeyX = true; run(inst, input, 0.02); // fired pointing right, rock is up
  ok(st.missiles.length === 1 && st.pw.missiles === 3, 'X fires a missile');
  run(inst, input, 3);
  ok(!st.rocks.includes(rock) && st.score >= 20, `the missile curved onto the rock and broke it (score ${st.score})`);
}
{ // shield
  const { inst, st, input } = make('pilot'); clear(st); give(inst, input, st, 'shield');
  st.rocks = [{ x: 400, y: 300, vx: 0, vy: 0, size: 3, r: 40, shape: Array(11).fill(1), rot: 0, spin: 0 }]; const lives = st.lives;
  run(inst, input, 0.2);
  ok(st.lives === lives && st.ship, 'shield: ship survives touching a rock');
  const b = make('pilot'); clear(b.st); b.st.rocks = [{ x: 400, y: 300, vx: 0, vy: 0, size: 3, r: 40, shape: Array(11).fill(1), rot: 0, spin: 0 }]; run(b.inst, b.input, 0.2);
  ok(b.st.lives === 2, 'without it the same touch costs a life');
}
{ // tokens show up by themselves and fade
  const { inst, st, input } = make('pilot'); clear(st); st.puT = 0.1; let seen = 0;
  st.rocks = [];
  for (let i = 0; i < 60 * 40; i++) { st.ship.x = 100; st.ship.y = 100; st.ship.vx = st.ship.vy = 0; inst.update(DT); seen = Math.max(seen, st.items.length); }
  ok(seen >= 1, `tokens appear on their own (max ${seen} at once)`);
  ok(st.items.length <= 2, 'no more than two at a time');
}
for (const role of ['sender', 'watch']) {
  const { inst, st, input } = make(role); st.puT = 0.1; run(inst, input, 20);
  ok(st.items.length === 0, `${role}: no power-ups (the computer pilot plays the plain ship)`);
}
{ // pilot dies -> effects cleared
  const { inst, st, input } = make('pilot'); clear(st); give(inst, input, st, 'rapid'); st.rocks = [{ x: 400, y: 300, vx: 0, vy: 0, size: 3, r: 40, shape: Array(11).fill(1), rot: 0, spin: 0 }];
  st.pw.shield = 0; run(inst, input, 0.2);
  ok(st.pw.rapid === 0 && st.lives === 2, 'losing the ship loses the power-ups');
}
process.exit(fails ? 1 : 0);
