/**
 * Test: Imitation house AI conversation quality and pacing.
 *
 * @file Checks, without a browser, that the house AI answers what was actually said:
 *  - "why are you here?" is turned back on the user in the same tone ("idk why are you here?");
 *  - things the user says (likes, pets, outings, feelings, answers to the bot's own question)
 *    are picked up in the reply instead of getting a canned line;
 *  - when the talk is about how to tell a person from a machine it stays on that subject for
 *    several turns instead of jumping to unrelated small talk;
 *  - replies take a few seconds, and the page code has no timer that makes the bot speak on its
 *    own after a silence.
 *
 * Run: {@code node tests/imitation_chat.js}
 * @see js/games/imitation.js
 */
const fs = require('fs'), path = require('path');
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {} }; global.addEventListener = () => {};
require('../js/core.js'); require('../js/games/imitation.js');
const { HouseAI: Raw } = CC._imitation;
// typos are on purpose in the game, but they would make wording checks flaky, so these tests switch them off
class HouseAI extends Raw { constructor(l) { super(l); this.typoRate = 0; } }
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const ask = (b, s) => b.reply(s).join(' ').toLowerCase();
const frac = (n, f) => { let k = 0; for (let i = 0; i < n; i++) if (f()) k++; return k / n; };
const LEVEL = 6; // high levels never "leak" polished machine-like text, so wording can be checked

ok(frac(300, () => /why are you|you\?|\byou$/.test(ask(new HouseAI(LEVEL), 'why are you here?'))) === 1, '"why are you here?" is answered and turned back on the user every time');
ok(frac(300, () => /^idk|no clue|no idea|bored|same reason|dunno/.test(ask(new HouseAI(LEVEL), 'why are you here?'))) === 1, '...in a casual "idk"-style tone');
ok(frac(200, () => ask(new HouseAI(LEVEL), 'i love pizza').includes('pizza')) > 0.6, 'a statement about pizza gets a reply that mentions pizza');
ok(frac(200, () => /dog/.test(ask(new HouseAI(LEVEL), 'my dog is sick today'))) > 0.7, 'a statement about the dog gets a reply about the dog');
ok(frac(200, () => /sorry|oh no|what happened|dog/.test(ask(new HouseAI(LEVEL), 'my dog is sick today'))) === 1, '...with a sympathetic or curious tone');
ok(frac(200, () => /pizza|yeah|nah|kinda|sometimes/.test(ask(new HouseAI(LEVEL), 'do you like pizza?'))) === 1, '"do you like pizza?" gets a direct yes/no style answer');
ok(frac(200, () => { const b = new HouseAI(LEVEL); b.reply('hey'); return /bored|same|me too|nothing/.test(ask(b, 'im so bored')); }) === 1, '"im so bored" gets a matching reaction');

{ // answer to the bot's own question is understood as an answer
  let hit = 0, n = 200;
  for (let i = 0; i < n; i++) { const b = new HouseAI(LEVEL); b.expect = 'job'; if (ask(b, 'teacher').includes('teacher')) hit++; }
  ok(hit === n, 'after the bot asks what you do, "teacher" is picked up in the reply');
  hit = 0; for (let i = 0; i < n; i++) { const b = new HouseAI(LEVEL); b.expect = 'place'; const r = ask(b, 'ohio, you?'); if (r.includes('ohio') && /\w/.test(r.replace('ohio', ''))) hit++; }
  ok(hit === n, 'after the bot asks where you are from, "ohio, you?" is acknowledged and answered about itself');
  hit = 0; for (let i = 0; i < n; i++) { const b = new HouseAI(LEVEL); b.expect = 'plans'; if (!/\bplans\b|after this/.test(ask(b, 'why do you ask'))) hit++; }
  ok(hit === n, 'a question in reply ("why do you ask") is not mistaken for an answer');
}
{ // staying on the subject of working out who is who
  let stay = 0, n = 150;
  for (let i = 0; i < n; i++) {
    const b = new HouseAI(LEVEL), r = [
      ask(b, 'how are we supposed to figure out which of us is the bot?'),
      ask(b, 'maybe we should ask each other random stuff'),
      ask(b, 'ok whats something a bot wouldnt know'),
      ask(b, 'bots are always too polite'),
    ];
    const off = /pets?|lunch|games? much|watching anything|where are you from|what do you do|after this|what time/;
    if (r.every((x) => !off.test(x)) && /ask|random|breakfast|look|typing|polite|talk|slip|weird|questions|go for|hit me|tell|tell/.test(r.join(' '))) stay++;
  }
  ok(stay === n, 'for four turns about how to tell person from machine, the bot never changes the subject');
  ok(frac(150, () => /ask|typing|random|talk|weird|personal|slip|no idea|polite/.test(ask(new HouseAI(LEVEL), 'how are we supposed to figure out who the bot is?'))) === 1, 'asking how to figure out who the bot is gets an actual answer about that, not "no?? are you"');
  const b = new HouseAI(LEVEL); ask(b, 'how do we figure this out'); ask(b, 'ask me anything');
  ok(/scarecrow|joke|knock|cooking/.test(ask(b, 'tell me a joke')), 'but it does follow the user to a new topic when they change it');
}
// pacing
{
  const b = new HouseAI(LEVEL), t = [];
  for (let i = 0; i < 2000; i++) { const x = b.timing('yeah i guess so', 20); t.push(x.think + x.type); }
  t.sort((a, b2) => a - b2);
  console.log(`  reply delay once it starts thinking: min ${(t[0] / 1000).toFixed(1)} s, median ${(t[1000] / 1000).toFixed(1)} s, 90th percentile ${(t[1800] / 1000).toFixed(1)} s`);
  ok(t[0] >= 1800 && t[1000] >= 3000, 'a short reply takes at least 1.8 s and typically 3 s or more to appear (plus the 0.8 to 1.6 s the page waits for more typing)');
}
// no unprompted messages
{
  const src = fs.readFileSync(path.join(__dirname, process.env.IMITATION_PATH || '../js/games/imitation.js'), 'utf8');
  ok(!/botIdle|quiet >/.test(src), 'the page code has no idle timer that makes the bot talk after a silence');
}
process.exit(fails ? 1 : 0);
