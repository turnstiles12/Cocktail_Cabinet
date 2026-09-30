// Headless: runs a game's real update() with a scripted "human" to measure how the computer side holds up.
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {} }; global.addEventListener = () => {};
global.setTimeout = (f) => 0;
require('../js/core.js');
const games = {}; CC.register = (g) => (games[g.id] = g);
require('../js/games/asteroids.js'); require('../js/games/missile.js');
function harness(id, role) {
  const hud = { l: '', c: '', r: '' }, input = { keys: {}, pressed: {}, mouse: { x: 0, y: 0, down: false, clicked: false, released: false, inside: true } };
  const api = { ctx: null, W: 800, H: 600, role, input, panel: null, hud(l, c, r) { Object.assign(hud, { l, c, r }); }, banner() {}, hideBanner() {}, setHelp() {} };
  const inst = games[id].create(api);
  return { inst, input, hud };
}
function asteroidsSender(runs) {
  let waves = [];
  for (let k = 0; k < runs; k++) {
    const { inst, input, hud } = harness('asteroids', 'sender');
    let t = 0, phase = 0;
    for (let f = 0; f < 60 * 600; f++) {
      input.mouse.clicked = false; input.mouse.released = false;
      // every ~1s: click-drag a rock aimed at where the ship is, from 200px away, at full speed
      if (f % 60 === 0) {
        const m = /Wave (\d+)/.exec(hud.c); // unused
        const sx = 400 + 240 * Math.cos(f), sy = 300 + 240 * Math.sin(f);
        input.mouse.x = ((sx % 800) + 800) % 800; input.mouse.y = ((sy % 600) + 600) % 600; input.mouse.clicked = true;
      }
      if (f % 60 === 1) { input.mouse.released = true; /* quick click: aims at ship */ }
      inst.update(1 / 60);
      if (/Ships left 0/.test(hud.l) || /Wave 8/.test(hud.c) && /rocks 0/.test(hud.r) && false) break;
    }
    waves.push(hud.c + ' ' + hud.l);
  }
  return waves;
}
console.log('asteroids sender (click-spam at ship):'); console.log(asteroidsSender(5).join('\n'));
function missileAttack(runs) {
  const out = [];
  for (let k = 0; k < runs; k++) {
    const { inst, input, hud } = harness('missile', 'attack');
    const cities = [140, 205, 270, 530, 595, 660];
    for (let f = 0; f < 60 * 400; f++) {
      input.mouse.clicked = false; input.pressed = {};
      if (f % 25 === 0) { input.mouse.x = cities[Math.floor(Math.random() * 6)]; input.mouse.y = 550; input.mouse.clicked = true; }
      if (f % 240 === 120) input.pressed.Space = true;
      inst.update(1 / 60);
    }
    out.push(hud.l + ' ' + hud.c);
  }
  return out;
}
console.log('missile attack (random city spam + splits):'); console.log(missileAttack(5).join('\n'));
