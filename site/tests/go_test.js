/**
 * Test: Go rules and strength.
 *
 * @file Checks the Go engine and computer player in plain Node (no browser). Asserts that a
 * surrounded stone is captured, that a suicide move is illegal, and that a one-stone capture
 * sets the ko square. Then plays four 9x9 games of the 150-playout computer against a random
 * player and prints how many it won, and times 3,000 playouts on an empty board.
 *
 * Run: {@code node tests/go_test.js}
 *
 * @see js/games/go.js
 */
global.window = global; global.localStorage = {getItem(){return null}, setItem(){}}; global.addEventListener = ()=>{};
global.performance = require('perf_hooks').performance;
require('../js/core.js'); require('../js/games/go.js');
const {Board, Thinker, deadStones} = CC._go;
const assert = require('assert');
// capture test: white stone at (1,1) surrounded
let b = new Board(9); const P=(x,y)=>y*9+x;
b.play(P(1,0)); b.play(P(1,1)); b.play(P(0,1)); b.play(P(8,8)); b.play(P(2,1)); b.play(P(8,7)); b.play(P(1,2));
assert.equal(b.b[P(1,1)],0); assert.equal(b.caps[1],1);
// suicide illegal: white at corner 0,0 surrounded by black (1,0),(0,1)
assert.equal(b.turn,2); assert.equal(b.legal(P(0,0)), false);
// ko
b = new Board(9);
[[1,0],[2,0],[0,1],[3,1],[1,2],[2,2],[8,8],[1,1]].forEach(([x,y])=>b.play(P(x,y))); // B W B W B W B(8,8) W(1,1)?
console.log('turn',b.turn);
// simple ko shape: black at (1,0),(0,1),(1,2) ; white (2,0),(3,1),(2,2),(1,1); black plays (2,1) capturing (1,1)
const ok = b.play(P(2,1)); console.log('black captures at 2,1', ok, 'ko', b.ko, 'expect', P(1,1));
assert.equal(b.ko, P(1,1)); assert.equal(b.legal(P(1,1)), false);
// AI vs random, time budget
function game(budget, aiColor){ const bd=new Board(9); let moves=0;
  while(bd.passes<2 && moves<200){ let p;
    if(bd.turn===aiColor){ const t=new Thinker(bd,budget); while(!t.step(50)); const r=t.ranked(); p=r.length? r[0].p : -1; }
    else { const legal=[]; for(let q=0;q<81;q++) if(bd.b[q]===0 && !bd.isEye(q,bd.turn) && bd.legal(q)) legal.push(q); p = legal.length? legal[Math.floor(Math.random()*legal.length)] : -1; }
    bd.play(p); moves++; }
  const s = bd.score(deadStones(bd, 1)); return (s.diff>0) === (aiColor===1); }
let t0=Date.now(), w=0; for(let i=0;i<4;i++) w+=game(150, i%2?1:2); console.log('150 playouts vs random wins',w,'/4', (Date.now()-t0)+'ms');
t0=Date.now(); const bd=new Board(9); const t=new Thinker(bd,3000); while(!t.step(1000)); console.log('3000 playouts empty 9x9', Date.now()-t0,'ms, best', t.ranked()[0].p);
