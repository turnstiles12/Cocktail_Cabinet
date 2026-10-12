/**
 * Test: Go computer against computer.
 *
 * @file Plays one whole 9x9 game of the computer against itself using the same pass logic
 * as the real game, then prints the final board (lower case marks stones judged dead), the
 * number of moves, the score difference and the time taken.
 *
 * Run: {@code node tests/go_full.js}
 *
 * @see js/games/go.js
 */
global.window = global; global.localStorage = {getItem(){return null}, setItem(){}}; global.addEventListener = ()=>{};
global.performance = require('perf_hooks').performance;
require('../js/core.js'); require('../js/games/go.js');
const {Board, Thinker, deadStones} = CC._go;
// mimic computerStep pass logic
const bd = new Board(9); let t0=Date.now();
while (bd.passes < 2 && bd.moves < 250) {
  const t = new Thinker(bd, 1500); while(!t.step(100));
  const r = t.ranked(); let move=-1;
  if (r.length) { const top=r[0], rate=top.w/Math.max(1,top.n);
    if (bd.passes===1) { const s=bd.score(deadStones(bd, bd.moves*131+7)); move = ((s.diff>0)===(bd.turn===1)) ? -1 : top.p; }
    else if (rate>0.97 && bd.moves>81*0.6) move=-1; else move=top.p; }
  bd.play(move);
}
const dead = deadStones(bd, 42), s = bd.score(dead);
let str=''; for(let y=0;y<9;y++){ for(let x=0;x<9;x++){ const p=y*9+x; str+= bd.b[p]===1?(dead[p]?'x':'X'): bd.b[p]===2?(dead[p]?'o':'O'):'.'; } str+='\n'; }
console.log(str, 'moves', bd.moves, 'diff', s.diff, 'time', Date.now()-t0);
