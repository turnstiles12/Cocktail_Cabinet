// How often does the house AI's judge call a casual typist "human" and a polished fast typist "ai", by level?
global.window = global; global.localStorage = { getItem() { return null; }, setItem() {} }; global.addEventListener = () => {};
require('../js/core.js'); require('../js/games/imitation.js');
const { judge, HouseAI } = CC._imitation;
const casual = { msgs: ['hey lol', 'idk tbh, kinda tired', 'im from ohio wbu', 'nah never played it', 'haha ok fair'].map((t) => ({ text: t, cps: 4.5, pasted: false })) };
const polished = { msgs: ['Hello! It is nice to meet you.', 'I am certainly happy to help with any questions you might have.', 'However, I do not have personal experiences with food.', 'That is an interesting question indeed.'].map((t) => ({ text: t, cps: 16, pasted: false })) };
for (const L of [1, 3, 5, 8]) {
  let h = 0, a = 0; const N = 2000;
  for (let i = 0; i < N; i++) { if (judge(casual, L).guess === 'human') h++; if (judge(polished, L).guess === 'ai') a++; }
  console.log(`level ${L}: casual judged human ${(100 * h / N).toFixed(0)}%, polished judged ai ${(100 * a / N).toFixed(0)}%`);
}
const bot = new HouseAI(3);
for (const q of ['hi', 'are you a bot', 'whats 44 times 17', 'where are you from', 'what do you do', 'tell me a joke', 'say "pancake" backwards', 'ok']) console.log('>', q, '=>', bot.reply(q).join(' / '));
