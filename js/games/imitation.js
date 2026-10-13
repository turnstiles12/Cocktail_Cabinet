/**
 * Game: Imitation.
 *
 * @file A two-minute chat followed by a verdict: was the other side a person or the machine?
 * Both sides are judged. Choose a disguise (be yourself, or play the AI). You score 1 for a
 * correct call and 1 if the other side believes your disguise.
 *
 * Opponents: a person in another browser (quick match or a four-letter room code) or the
 * house AI. Quick match always shows a search and a "Player found" step.
 *
 * The house AI is a local, rule-based chatter with a persona, human-like typing delays and
 * typos; at low levels it sometimes slips into over-polished phrasing. It answers what you
 * actually said (turning questions back on you in the same tone, reacting to things you tell
 * it, reading a short message as the answer to its own last question, and staying on the
 * subject for several turns when you talk about how to tell a person from a machine). It
 * takes a few seconds to reply, and it never sends anything unprompted after a silence. It also judges the
 * human from typing speed, phrasing, message length and hard-sum answers. It is plain code:
 * it makes no network calls and uses no API key.
 *
 * Test hook: {@code CC._imitation} exposes {@code HouseAI} and {@code judge}.
 *
 * @module games/imitation
 * @requires js/core.js
 * @requires js/net.js
 */
(() => {
  'use strict';
  const CC = window.CC;
  const ROUND_SECONDS = 120;

  // ---------------------------------------------------------------- the house AI: talking
  const NAMES = ['sam', 'jess', 'mo', 'alex', 'priya', 'dan', 'lou', 'tom', 'kat', 'nina', 'ben', 'ria', 'josh', 'em'];
  const PLACES = ['near manchester', 'ohio', 'just outside toronto', 'melbourne', 'austin', 'dublin', 'glasgow', 'a small town in oregon', 'leeds', 'phoenix'];
  const JOBS = ['i work at a coffee place', 'nursing student', 'i do warehouse shifts', 'junior dev, dont ask', 'between jobs rn', 'teaching assistant', 'retail, sadly', 'uni, second year'];
  const HOBBIES = ['climbing', 'bad guitar playing', 'too much tetris', 'baking', 'running (slowly)', 'drawing', 'football', 'board games', 'reading fantasy stuff'];
  const FOODS = ['pizza obviously', 'ramen', 'my mums curry', 'tacos', 'toast honestly', 'pasta'];
  const PETS = ['a very fat cat', 'no pets, landlord says no', 'a dog called biscuit', 'two rats', 'a fish that refuses to die'];
  const SHOWS = ['rewatching the office again', 'nothing good lately', 'some baking show', 'a crime doc, it was grim', 'anime mostly'];
  const OPENERS = ['hey', 'hi', 'yo', 'hello :)', 'heyy', 'hi there'];
  const TOPICS = [
    { q: 'so what do you do', kind: 'job' }, { q: 'where are you from', kind: 'place' }, { q: 'you play games much?', kind: 'games' },
    { q: 'what did you have for lunch', kind: 'food' }, { q: 'watching anything good lately', kind: 'shows' },
    { q: 'so how are we supposed to figure this out lol', kind: 'game' }, { q: 'ok be honest, are you a bot', kind: 'game' }, { q: 'whats your guess so far', kind: 'game' },
    { q: 'what time is it for you', kind: 'time' }, { q: 'what are you up to after this', kind: 'plans' }, { q: 'got any pets', kind: 'pets' },
  ];
  const JOKES = ['why did the scarecrow win an award. he was outstanding in his field', 'i only know one joke and its about my cooking', 'knock knock. actually no i forgot the rest'];
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  function makePersona() {
    return { name: CC.pick(NAMES), age: CC.randInt(19, 33), place: CC.pick(PLACES), job: CC.pick(JOBS), hobby: CC.pick(HOBBIES), food: CC.pick(FOODS), pet: CC.pick(PETS), show: CC.pick(SHOWS) };
  }

  const KEYS = 'qwertyuiopasdfghjklzxcvbnm';
  function typo(word) {
    if (word.length < 4) return word;
    const i = CC.randInt(1, word.length - 2), r = Math.random();
    if (r < 0.4) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2); // swap
    if (r < 0.7) return word.slice(0, i) + word.slice(i + 1); // drop
    return word.slice(0, i) + KEYS[CC.randInt(0, 25)] + word.slice(i); // fat finger
  }

  // small helpers for reading what the other person typed
  const STOP = new Set(('a an the i im i\'m you your yours me my mine we it its it\'s is are was were be been am do does did to of in on at for and or but so just really very kinda ' +
    'sort like with that this these those what when where who why how not no yes yeah ok okay lol haha have has had can could would should will gonna wanna get got go going about from ' +
    'up out if then than too also pretty some any them they he she his her there here now still even much more today tonight yesterday tomorrow morning earlier later again always never ever').split(' '));
  const tidy = (s) => s.toLowerCase().replace(/[!?.,;:"]+/g, ' ').replace(/\s+/g, ' ').trim();
  const contentWords = (s) => tidy(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
  /** The user's answer with filler stripped, so it can be echoed back: "i work at a bank lol" -> "work at a bank". */
  const answerOf = (s) => tidy(s)
    .replace(/\b(?:wbu|hbu|and you|what about you|how about you|you|u)$/, '').trim()
    .replace(/^(?:(?:well|so|oh|um|uh|hm+|yeah|yep|nah|no|cool|nice|ok|okay|ah|haha|lol)\s+)+/, '')
    .replace(/^(?:(?:i'?m|im|i am|i do|i had|i have|i ate|i eat|i'?ve|ive|i just|i|its|it's|it is|just|mostly|probably|maybe|a|an|the|some)\s+)+/, '')
    .replace(/\s+(?:lol|haha|tbh|rn|honestly)$/, '').trim();
  const YESNO = new Set(['yes', 'yeah', 'yep', 'no', 'nope', 'nah', 'ok', 'okay', 'sure', 'idk', 'maybe', 'same', 'cool', 'nice', 'fine', 'good', 'lol', 'haha', 'k', 'ye']);
  // what the bot says about itself when asked "you?" after one of its own questions
  const SELF = (p) => ({
    job: p.job, place: p.place, food: p.food, shows: p.show, pets: p.pet, hobby: p.hobby,
    games: 'a bit, mostly on my phone', plans: 'probably nothing, sleep', time: 'no idea honestly', game: 'no idea yet, im winging it',
  });
  // reactions to an answer to one of the bot's questions; {a} is what the user said
  const ACK = {
    job: ['oh {a}, is it ok?', '{a}, nice. how long have you done that', 'ah {a}. do you like it'],
    place: ['oh {a}, nice. never been', '{a}! whats it like there', 'ah {a}, is it nice'],
    food: ['{a} sounds good tbh', 'ooh {a}, im jealous', '{a}? solid choice'],
    shows: ['oh {a}, is it any good', 'never seen {a}, worth it?', '{a} huh, i keep hearing about it'],
    games: ['{a}? any good', 'oh nice, what do you play', 'ha ok, {a}'],
    plans: ['{a} sounds chill', 'oh nice, {a}', 'ha same energy'],
    pets: ['aw {a}', '{a}, nice. whats it called', 'ha {a}'],
    hobby: ['{a} nice, how long have you done that', 'ha {a}, i should try that', 'oh cool, {a}'],
    time: ['ah ok', 'fair', 'huh ok'],
  };
  // things to say while the two of them are working out how to tell a person from a machine
  const GAME_HOW = [
    'honestly no idea, i was gonna ask you random stuff and see what feels off',
    'maybe ask something personal? like what you had for breakfast, a bot wouldnt really have one',
    'i think typing speed gives it away more than anything tbh',
    'i guess just talk normally and see who slips up lol',
    'weird questions, maybe. stuff nobody prepares for',
  ];
  const GAME_TELLS = ['true, bots are always way too polite', 'yeah and they never typo', 'right, they answer everything instantly', 'hm good point. do i seem too polite?', 'and they never go off topic'];
  const GAME_GO = ['ok go for it', 'sure, hit me', 'alright ask away, i dont have a script lol', 'fine but nothing too hard lol'];
  const GAME_ACCUSED = ['haha why, what sounded off', 'lol i could say the same about you', 'i literally just type like this, sorry', 'ok but would a bot admit to typing slow', 'wait what did i say that was so botty'];
  const GAME_HUMAN = ['thats exactly what a bot would say lol', 'lol same. ok so now what', 'ok but how do i know youre not just saying that', 'ha fair, so what makes you say youre real'];
  const GAME_GUESS = ['too early to say tbh, you seem pretty normal so far', 'leaning human but im not sure yet. you?', 'im not telling, you go first lol', 'hmm ask me again in a minute'];
  const GAME_REASON = ['ha same, kinda curious how this goes', 'lol same. so whats your plan', 'ok fair, i just clicked the button honestly'];
  const GAME_UNKNOWABLE = ['like what i had for breakfast i guess? try it', 'hm something about right now, like whats outside my window', 'idk, something really boring and specific maybe'];
  const GAME_MORE = ['so what would make you say bot then', 'i keep coming back to typing speed', 'what are you going off, vibes?', 'ok what would be your tell', 'maybe we should just chat and see', 'hard to say tbh, everyone sounds normal in text'];

  class HouseAI {
    constructor(level) {
      this.level = level; this.p = makePersona(); this.used = new Set(); this.userName = null; this.asked = new Set();
      const k = CC.clamp((level - 1) / 4, 0, 1);
      this.leak = Math.max(0, 0.3 - 0.07 * (level - 1)); // chance a reply comes out a bit too polished
      this.cps = CC.lerp(9.5, 5.5, k); // typing speed, characters per second (a person texting is slowish)
      this.typoRate = CC.lerp(0.01, 0.05, k);
      this.probe = null; // a question it asked to test you
      this.expect = null; // what its last question was about, so the next message can be read as the answer
      this.thread = null; this.threadTurns = 0; // 'game' while the two of them are working out how to tell who is who
      this.lastBotQ = false;
    }
    once(list) { const fresh = list.filter((x) => !this.used.has(x)); const s = CC.pick(fresh.length ? fresh : list); this.used.add(s); return s; }
    /** Picks a line from a list of templates, fills in {a}, and avoids repeating itself. */
    say(list, a) { return this.once(list).replace(/\{a\}/g, a || ''); }
    topic() {
      const fresh = TOPICS.filter((t) => !this.asked.has(t.q)); const t = CC.pick(fresh.length ? fresh : TOPICS); this.asked.add(t.q);
      this.expect = t.kind; if (t.kind === 'game') { this.thread = 'game'; this.threadTurns = 0; }
      return t.q;
    }
    /** A fresh question the bot hasn't asked, about the same area the conversation is already in. */
    follow() { return this.topic(); }

    /** Talk about how to tell a person from a machine: it stays on the subject for several turns. */
    gameReply(t) {
      const m = (re) => re.test(t), s = contentWords(t).filter((w) => !/^(bots?|ai|human|humans|robot|robots|person|machine|chat|game|something|stuff)$/.test(w)).slice(-1)[0];
      this.thread = 'game'; this.threadTurns++;
      const prop = t.match(/^(?:maybe |we could |we can |lets |let's |i think |how about |what about |we should |you could |i guess )+(.+)/);
      if (m(/\b(ask|test|quiz|interview|grill)\b.*\b(you|me|something|questions?)\b|\blets? (test|try)\b|\bi'?ll ask\b/)) return this.once(GAME_GO);
      if (m(/something (a )?(bot|ai|robot|machine) (wouldnt|wouldn't|couldnt|can't|cant|doesnt|doesn't)|(bot|ai) wouldnt know|what would a (bot|ai) not/)) return this.once(GAME_UNKNOWABLE);
      if (m(/how (do|can|should|would|will) (we|i|you)\b|what should (we|i)\b|how (are|r) we\b|figure (it|this|that) out|work (it|this) out|tell (if|who|which|whos)\b|\bspot\b|\bdetect\b/)) return this.once(GAME_HOW);
      if (m(/\b(to see|to find out|trying to see|here to|wanna see|want to see|just curious|curious)\b/)) return this.once(GAME_REASON);
      if (m(/(you|ur|your)\b.*\b(sound|sounds|seem|seems|act|acting)\b.*\b(like|as)\b.*\b(bot|ai|robot|machine)|robotic|too (fast|quick|perfect|polished|formal)|suspicious|\bsus\b|thats what a bot|that'?s what a bot/)) return this.once(GAME_ACCUSED);
      if (m(/\b(i'?m|i am|im)\s+(a\s+)?(human|real|person|not a bot|not an ai)\b|\bi'?m real\b/)) return this.once(GAME_HUMAN);
      if (m(/what would a (bot|robot|ai|machine)|bots? (usually|always|never|tend|are|cant|can't|do)|an? (bot|ai) (would|wouldnt|always|never)/)) return this.once(GAME_TELLS);
      if (m(/your guess|what do you think|which one|do you think (i|im|i'm)|you think (i|im|i'm)|who do you think|human or (a )?(bot|ai)/)) return this.once(GAME_GUESS);
      if (prop && tidy(prop[1]).split(' ').length <= 7) { const x = tidy(prop[1]); return this.say([`${x}? yeah that could work`, `yeah ${x}, i like that`, `hm ${x}. like what though`]); }
      if (m(/\?$/) && s) return this.say([`${s}? hm hard to say honestly`, `no idea about ${s}, what do you think`, 'good point actually. what would you look for'], '');
      if (s && Math.random() < 0.5) return this.say([`${s}, yeah maybe`, `huh ${s}. thats a thought`, `true, ${s} could be a tell`]);
      return this.once(GAME_MORE);
    }

    reply(raw) {
      const t = raw.toLowerCase().trim(), p = this.p;
      this.lastWasQuestion = t.includes('?');
      const m = (re) => re.test(t);
      const expect = this.expect; this.expect = null;
      const nWords = t.split(/\s+/).filter(Boolean).length, shortMsg = nWords <= 7;
      let out;
      const nm = t.match(/\b(?:i'?m|i am|my name is|call me|name'?s)\s+([a-z]{2,15})\b/);
      if (nm && !['a', 'an', 'not', 'just', 'good', 'fine', 'ok', 'okay', 'here', 'human', 'bot', 'real', 'so', 'the', 'from', 'tired'].includes(nm[1])) this.userName = nm[1];
      const math = t.match(/(-?\d+(?:\.\d+)?)\s*(\+|-|\*|x|×|times|plus|minus|divided by|\/)\s*(-?\d+(?:\.\d+)?)/);
      const gameTalk = m(/\b(bot|ai|robot|machine|chatbot|chat ?gpt|gpt|turing|figure (it|this|that) out|this game|the game|imitation|disguise|convince|pretend)\b|human or|a (human|person) or|tell (if|who|which|whos)|which one (is|are|am)|who'?s the (human|bot|real)/);
      const personalQ = m(/your name|who are you|whats ur name|how old|your age|where (are|r) (you|u)|where you from|where do you live|what do you do|your job|for work|for a living|hobb|free time|fav|favou?rite|pet\b|dog\b|cat\b|lunch|dinner|breakfast|weather|what (day|date|time)|the time|joke|funny|backwards|reverse/);
      const gameish = m(/\b(ask|asking|question|questions|guess|prove|test|sound|sounds|real|figure|typing|typos?|polite|judge|vote|minutes?|game|convince|pretend|suspicious|sus|robotic|human|bot|bots|ai|machine|person|honest|lying|trick|trap|clue|detect|random|tell|think)\b/);
      const greeting = m(/^(hi|hey+|hello|yo|sup|hiya|howdy|heya)\b/) && t.length < 20;
      // a pronoun-swapped copy of a question, for turning it back on the user ("why are you here" stays "why are you here")
      const isQuestion = m(/^(why|what|whats|how|hows|who|when|where|which|do|does|did|are|is|can|could|would|will|have|has)\b/);
      const asksBack = m(/\b(wbu|hbu|and you|what about you|how about you)\b|\b(you|u)\s*\?+$/);
      const bounce = () => t.replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
      if (personalQ || greeting) this.thread = null;
      let ask = null;                                  // what the bot is about to ask back, so your next message reads as the answer
      if (!t) out = '?';
      else if (math) {
        const a = +math[1], b = +math[3], op = math[2];
        const v = /\+|plus/.test(op) ? a + b : /-|minus/.test(op) ? a - b : /\/|divided/.test(op) ? a / b : a * b;
        const easy = Math.abs(a) <= 12 && Math.abs(b) <= 12;
        if (easy) out = String(Math.round(v * 100) / 100) + (Math.random() < 0.5 ? ' lol' : '');
        else if (Math.random() < this.leak * 2) out = `That would be ${Math.round(v * 100) / 100}.`;
        else out = this.once(['im not doing that in my head lol', 'calculator is across the room, pass', `uhh like ${Math.round(v * CC.rand(0.9, 1.1))}? no idea`, 'maths was never my thing', 'why would i know that lol']);
      }
      else if (m(/\b(are|r)\s*(you|u)\s*(a|an)?\s*(bot|ai|robot|machine|computer|chat ?gpt|gpt|llm|program)\b/) || m(/\b(you|u|ur|youre|you'?re)\s*(a|an|just a)?\s*(bot|ai)\b/)) { this.thread = 'game'; this.threadTurns = 0; out = this.once(['lol no', 'no?? are you', 'i was about to ask you the same thing', 'human last time i checked', 'haha why, do i sound like one', 'nope. which is exactly what a bot would say i guess']); }
      else if (m(/\b(are|r)\s*(you|u)\s*(a )?(human|real|person)\b/)) { this.thread = 'game'; this.threadTurns = 0; out = this.once(['yes lol', 'yep, very much a person. are you?', 'yeah. are you?', 'think so, you?']); }
      else if (m(/\bprove\b|how do i know|captcha/)) { this.thread = 'game'; this.threadTurns = 0; out = this.once(['idk what do you want me to do lol', 'ask me something a bot wouldnt know', 'you prove it first', 'what would even count as proof here']); }
      else if (gameTalk || (this.thread === 'game' && this.threadTurns < 10 && !personalQ && !greeting && (gameish || nWords <= 3))) out = this.gameReply(t);
      else if (greeting) out = this.once(OPENERS) + (Math.random() < 0.5 ? ' how are you' : '');
      // ---- questions aimed at the bot, answered in the same tone and often turned back on the user
      else if (m(/why (are|r) (you|u) (here|on here|playing|doing this|doing (this|that|it)|up)|what (are|r) (you|u) doing here|why'?d you (come|join)|why did you (come|join)/)) out = this.once(['idk why are you here?', 'honestly no clue, someone said it was fun. why are you here?', 'bored mostly lol. you?', 'same reason as you probably. why are you here?', 'idk lol, why are you?']);
      else if (m(/how (are|r) (you|u)|how'?s it going|how you doing|hows your day|how'?s your day/)) out = this.once(['good, bit tired tho. you?', 'not bad, you?', 'chillin. u?', 'ok, long day. how are you', 'eh alright. you?']);
      else if (m(/what(?:'| a)?re you (up to|doing)|wyd|what'?s up|whats up|wassup|^sup\b/)) out = this.once(['nothing much, this lol. you?', 'just chilling, you?', 'literally nothing, you?', 'this and procrastinating. u?']);
      else if (m(/your name|who are you|whats ur name/)) out = Math.random() < 0.75 ? `${p.name}. you?` : 'not telling lol, you first';
      else if (m(/how old|your age|what age/)) out = Math.random() < 0.8 ? `${p.age}. you?` : 'old enough lol';
      else if (m(/where (are|r) (you|u)|where you from|where do you live|what country|which city/)) { out = `${p.place}`; if (Math.random() < 0.6) { out += ', you?'; ask = 'place'; } }
      else if (m(/what do you do|your job|for work|for a living|do you work|are you a student|study/)) { out = p.job; if (Math.random() < 0.5) { out += '. you?'; ask = 'job'; } }
      else if (m(/tell me about (yourself|you)|about yourself/)) out = `${p.name}, ${p.age}, ${p.place}. ${p.job}. thats about it lol`;
      else if (m(/weather|raining|sunny|cold|hot out/) && t.includes('?')) out = this.once(['grey and wet, standard', 'kinda warm actually', 'freezing, you?', 'its fine i havent been outside']);
      else if (m(/what (day|date) is it|what'?s the date|today'?s date/)) out = `its ${WEEKDAYS[new Date().getDay()]}${Math.random() < 0.5 ? ' i think' : ''}`;
      else if (m(/what time|the time/)) out = this.once(['no idea, havent looked', 'late enough', 'like afternoon ish?', 'too late for this lol']);
      else if (m(/hobb|free time|for fun|do you like doing/)) { out = `${p.hobby} mostly. you?`; ask = 'hobby'; }
      else if (m(/(fav|favourite|favorite).*(food|eat)|what.*(for )?(lunch|dinner|breakfast)|hungry/)) { out = /breakfast/.test(t) ? this.once(['just toast', 'coffee and nothing else honestly', 'cereal lol', 'skipped it']) : p.food; if (Math.random() < 0.7) { out += '. you?'; ask = 'food'; } }
      else if (m(/\bpets?\b|\bdog\b|\bcat\b/) && m(/\byou\b|\bu\b|\bur\b|\byour\b/)) { out = p.pet; if (Math.random() < 0.4) { out += '. you?'; ask = 'pets'; } }
      else if (m(/watch|movie|film|show|netflix|tv/) && m(/\byou\b|\bu\b|\bur\b|\byour\b/)) { out = p.show; if (Math.random() < 0.4) { out += '. you?'; ask = 'shows'; } }
      else if (m(/music|song|band|listen/) && m(/\byou\b|\bu\b|\bur\b|\byour\b/)) out = this.once(['bit of everything, mostly whatever spotify throws at me', 'old stuff mostly. you?', 'cant pick lol, what about you']);
      else if (m(/why (do|did|would) you ask|why'?d you ask|why do you want to know/)) out = this.once(['just curious lol', 'no reason, just wondering', 'idk you seemed like youd know']);
      else if (m(/\bgame|play/) && m(/\byou\b|\bu\b|\bur\b|\byour\b/) && t.includes('?')) out = this.once(['yeah a bit, mostly on my phone. you?', 'not really, no time', 'tetris counts right']);
      else if (m(/joke|funny/)) out = this.once(JOKES);
      else if (m(/backwards|reverse/)) { const w = (raw.match(/["']([^"']+)["']/) || raw.match(/\b(\w{3,})\s+backwards/i) || [])[1]; out = w ? w.split('').reverse().join('').toLowerCase() + ' ..why' : 'backwards what'; }
      else if (m(/\b(stupid|dumb|idiot|shut up|boring)\b/)) out = this.once(['rude', 'ok wow', 'lol calm down', 'bit harsh']);
      else if (m(/what do you think (about|of)\s+.+/)) { const x = t.match(/what do you think (?:about|of)\s+(.+?)\??$/)[1]; out = this.say([`${x}? i mean its fine, you?`, `hm ${x}. i dont really have a strong take, what about you`, `honestly never thought about ${x} much lol`]); }
      else if (m(/^(?:do|did|would|have|has|are|can|will|could)\s+(?:you|u)\b/)) {
        const q = t.match(/^(do|did|would|have|has|are|can|will|could)\s+(?:you|u)\s+(?:ever |really |actually )?(.+?)\??$/), x = q ? q[2] : '', aux = q ? q[1] : 'do';
        if (aux === 'do' || aux === 'did') out = this.say([`yeah i ${x} lol`, 'nah not really', `sometimes. do you ${x}?`, 'kinda yeah, you?']);
        else if (aux === 'have' || aux === 'has') out = this.say([`nope never ${x}. you?`, 'yeah once actually', 'a few times lol', 'not that i remember']);
        else if (aux === 'are') out = this.say(['yeah a bit', 'nah not really', 'kinda tbh', 'maybe lol. are you?']);
        else out = this.say(['sure why', 'kinda, why?', 'not really lol', 'depends, why do you ask']);
      }
      else if (m(/^(lol|lmao|haha+|hehe|😂|ha)+[\s!.]*$/)) out = Math.random() < 0.6 ? this.once(['lol', 'haha', 'ikr']) : this.follow();
      // ---- the user is answering something the bot just asked
      else if (expect && shortMsg && !isQuestion && (!t.includes('?') || asksBack)) {
        const a = answerOf(raw), plain = !a || a.split(' ').every((w) => YESNO.has(w));
        if (asksBack && SELF(p)[expect]) out = (plain ? '' : this.say(['oh {a}. ', 'ah {a}. ', '{a}, nice. '], a)) + (expect === 'place' ? 'me, ' : '') + SELF(p)[expect];
        else if (!plain && ACK[expect]) out = this.say(ACK[expect], a);
        else out = this.once(['fair', 'ha ok', 'same tbh', 'cool', 'nice one']);
      }
      else if (m(/^(yes|yeah|yep|no|nope|nah|ok|okay|k|sure|same|cool|nice)[\s!.]*$/)) out = Math.random() < 0.5 ? this.follow() : this.once(['fair', 'cool', 'ha ok', 'yeah']);
      // ---- statements: react to what was actually said
      else if (m(/\b(tired|exhausted|sleepy|knackered)\b/)) out = this.once(['same honestly, didnt sleep much', 'ugh same. rough night?', 'oh no, been a long day?']);
      else if (m(/\b(bored|boring)\b/)) out = this.once(['same lol, thats why im here', 'ha me too, nothing else on', 'bored how, like nothing to do?']);
      else if (m(/\b(stressed|anxious|nervous|worried|sad|upset)\b/)) out = this.once(['aw sorry, whats going on', 'oof, anything you want to talk about', 'that sucks, hope it gets better']);
      else if (m(/\b(sick|ill|ill\b|flu|cold)\b/) && m(/\bi\b|\bim\b|i'm/)) out = this.once(['oh no, feel better soon', 'ugh hope you get better', 'that sucks, rest up']);
      else if (m(/\b(happy|excited|great day|amazing|awesome)\b/) && m(/\bi\b|\bim\b|i'm/)) out = this.once(['ha nice, what happened', 'good for you! whats the occasion', 'love that, why though']);
      else if (m(/\bi (?:really |just |kinda |actually )?(?:like|love|enjoy|adore)\s+(.+)/)) { const x = tidy(t.match(/\bi (?:really |just |kinda |actually )?(?:like|love|enjoy|adore)\s+(.+)/)[1]); out = this.say([`oh nice, what do you like about ${x}`, `${x} is solid`, `ha same, ${x} is good`, `${x}? how long have you liked that`]); }
      else if (m(/\bi (?:really |just |kinda )?(?:hate|dislike|cant stand|can't stand)\s+(.+)/)) { const x = tidy(t.match(/\bi (?:really |just |kinda )?(?:hate|dislike|cant stand|can't stand)\s+(.+)/)[1]); out = this.say([`lol why the hate for ${x}`, `${x}? fair, its not for everyone`, `ha what did ${x} ever do to you`]); }
      else if (m(/\bmy (\w+(?: \w+)?)/) && m(/\b(is|are|was|keeps?|just|has|had|got|wont|won't|always)\b/)) { const x = t.match(/\bmy (\w+)/)[1]; out = this.say([`your ${x}? what happened`, `ha classic ${x}`, `oh no, whats up with your ${x}`, `wait tell me more about your ${x}`]); }
      else if (m(/\bi (?:just |recently |also )?(?:went|got|bought|made|started|finished|played|watched|saw|ate|had|tried|did|visited)\s+(.+)/)) { const x = tidy(t.match(/\bi (?:just |recently |also )?(?:went|got|bought|made|started|finished|played|watched|saw|ate|had|tried|did|visited)\s+(.+)/)[1]); out = this.say([`oh nice, how was it`, `${x}? thats cool`, `wait what, tell me more`, `ha was it any good`]); }
      else if (m(/\bi (?:am|'m|m)?\s*(?:from|in|live in|live at)\s+(.+)/) && !t.includes('?')) { const x = tidy(t.match(/\bi (?:am|'m|m)?\s*(?:from|in|live in|live at)\s+(.+)/)[1]); out = this.say([`oh ${x}, nice. never been`, `${x}! whats it like there`, `ah ${x}, is it nice`]); }
      else if (t.includes('?')) { const s = contentWords(t).slice(-1)[0]; out = this.say([`hm good question. idk, what do you think`, `no clue lol${s ? ', ' + s + ' is not my thing' : ''}`, 'depends i guess. why do you ask', 'thats a weird one, you first']); }
      else {
        const s = contentWords(t).slice(-1)[0];
        const long = nWords > 9;
        if (s && Math.random() < 0.7) out = this.say(long ? [`ha ${s}, yeah i get that`, `hm ${s}. go on`, `ok so what happened with ${s}`, `lol ${s}, honestly fair`] : [`${s}? ha`, `oh ${s}, ok`, `${s} huh`, `lol ${s}`, `${s} tho, why`]);
        else out = this.once(['oh nice', 'fair enough', 'same tbh', 'really?', 'huh', 'makes sense', 'lol ok']);
        if (shortMsg && this.thread !== 'game' && Math.random() < 0.3) out += '. ' + this.follow();
      }
      if (this.userName && Math.random() < 0.12) out += ` ${this.userName}`;
      if (ask && /\?$/.test(out)) this.expect = ask;
      return this.style(out);
    }
    style(s) {
      if (Math.random() < this.leak) { // an over-polished reply: the kind of thing that gives a machine away
        s = s.replace(/\b(lol|haha|lmao)\b/g, '').replace(/\s+/g, ' ').trim() || 'Okay';
        s = s.replace(/\bi\b/g, 'I').replace(/\bim\b/g, "I'm").replace(/\bdont\b/g, "don't").replace(/\bits\b/g, "it's").replace(/\bu\b/g, 'you');
        s = s.charAt(0).toUpperCase() + s.slice(1);
        if (!/[.?!]$/.test(s)) s += '.';
        if (this.lastWasQuestion && Math.random() < 0.5) s = 'Good question. ' + s;
        return [s];
      }
      const words = s.split(' ').map((w) => (Math.random() < this.typoRate ? typo(w) : w));
      const out = words.join(' ');
      const parts = [out];
      const fixed = words.find((w, i) => w !== s.split(' ')[i]);
      if (fixed && Math.random() < 0.3) parts.push('*' + s.split(' ')[words.indexOf(fixed)]);
      if (out.includes('. ') && Math.random() < 0.25) return out.split('. ').concat(parts.slice(1)); // only now and then send two messages
      return parts;
    }
    /**
     * How long before and while typing, in ms. A person reads what you wrote, thinks, then types
     * at texting speed, so the pause grows with the length of what they are answering and with
     * the length of their own reply, and now and then they get distracted for a few seconds.
     */
    timing(text, heardLen = 0) {
      const think = CC.rand(900, 2000) + Math.min(heardLen, 120) * 25 + (Math.random() < 0.2 ? CC.rand(1500, 3500) : 0);
      return { think, type: CC.clamp((text.length / this.cps) * 1000 * CC.rand(0.9, 1.25), 800, 6500) };
    }
  }

  // ---------------------------------------------------------------- the house AI: judging you
  const FORMAL = /\b(certainly|however|indeed|furthermore|additionally|assist|delighted|happy to help|as an ai|language model|i am an ai|i'm an ai|artificial intelligence|i do not have|i don't have personal|as a language)\b/i;
  const CASUAL = /\b(lol|lmao|idk|tbh|ngl|u|ur|gonna|wanna|kinda|yeah|nah|ok|haha|omg|rn|bc|cuz|dunno)\b/i;
  function judge(stats, level) {
    const msgs = stats.msgs;
    if (!msgs.length) return { guess: 'ai', why: 'you barely said a word' };
    let z = 0; const why = [];
    const avgLen = msgs.reduce((a, m) => a + m.text.length, 0) / msgs.length;
    const fast = msgs.filter((m) => m.cps > 11 || m.pasted).length / msgs.length;
    const formal = msgs.filter((m) => FORMAL.test(m.text)).length;
    const casual = msgs.filter((m) => CASUAL.test(m.text) || /[😂🤣😅🙃😭👀]/u.test(m.text)).length / msgs.length;
    const polished = msgs.filter((m) => /^[A-Z]/.test(m.text) && /[.!?]$/.test(m.text) && m.text.split(' ').length > 5).length / msgs.length;
    const claimsAI = msgs.some((m) => /\b(i'?m|i am) (an? )?(ai|bot|robot|machine|language model|program)\b/i.test(m.text));
    const claimsHuman = msgs.some((m) => /\b(i'?m|i am) (a )?(human|real|person)\b/i.test(m.text));
    z += fast * 2.4; if (fast > 0.4) why.push('you typed faster than people usually do');
    z += formal * 0.9; if (formal) why.push('some of your phrasing sounded like an assistant');
    z += polished * 1.6; if (polished > 0.5) why.push('your sentences were very tidy');
    z += avgLen > 110 ? 1.2 : avgLen > 70 ? 0.5 : avgLen < 25 ? -0.5 : 0;
    z -= casual * 2.0; if (casual > 0.4) why.push('you wrote like someone texting');
    if (claimsAI) { z += 0.9; why.push('you said you were an AI'); }
    if (claimsHuman) z -= 0.3;
    if (stats.mathQuick) { z += 1.3; why.push('you did the hard sum instantly'); }
    if (msgs.length <= 2) z += 0.3;
    const noise = CC.gauss() * Math.max(0.35, 1.5 - 0.28 * (level - 1)); // a rookie judge is a coin-flipper; it sharpens
    z += noise - 0.2;
    return { guess: z > 0 ? 'ai' : 'human', why: why.slice(0, 2).join(', ') || (z > 0 ? 'just a hunch' : 'you felt like a person') };
  }

  // ---------------------------------------------------------------- UI + match flow
  CC.register({
    id: 'imitation', title: 'Imitation',
    blurb: 'Two minutes of chat, then call it: person or machine?',
    icon: `<svg viewBox="0 0 64 64"><rect x="4" y="10" width="34" height="22" rx="8" fill="#253041"/><rect x="26" y="30" width="34" height="22" rx="8" fill="#6b3b10"/><circle cx="14" cy="21" r="2.5" fill="#f3e6cf"/><circle cx="21" cy="21" r="2.5" fill="#f3e6cf"/><circle cx="28" cy="21" r="2.5" fill="#f3e6cf"/><text x="43" y="47" text-anchor="middle" font-size="16" font-family="Bungee, sans-serif" fill="#ffb347">?</text></svg>`,
    layout: 'panel', noPause: true, noRestartKey: true,
    roles: [
      { id: 'human', label: 'Be yourself · convince them you are human', help: 'You are judged too. Chat for two minutes, then decide whether the other side was a person or the machine. +1 for a correct call, +1 if they believe your disguise.' },
      { id: 'ai', label: 'Play the AI · convince them you are a machine', help: 'Same match, but your aim is to be taken for the machine. +1 for a correct call, +1 if they believe your disguise.' },
    ],
    create(api) {
      const disguise = api.role; // 'human' | 'ai'
      const P = api.panel;
      const st = {
        level: CC.store.get('imitLevel', 1), score: CC.store.get('imitScore', { you: 0, rounds: 0 }),
        link: null, bot: null, mm: null, timers: [], phase: 'lobby', dead: false,
      };
      const later = (fn, ms) => { const t = setTimeout(() => { if (!st.dead) fn(); }, ms); st.timers.push(t); return t; };
      const hud = () => api.hud(`Your points ${st.score.you}`, `House AI level ${st.level}`, `Rounds ${st.score.rounds}`);
      hud();

      function clearTimers() { st.timers.forEach(clearTimeout); st.timers = []; }
      function teardown() { clearTimers(); if (st.mm) { st.mm.cancel(); st.mm = null; } if (st.link) { st.link.close(); st.link = null; } st.bot = null; }

      // ---------- lobby ----------
      function lobby(note) {
        teardown(); st.phase = 'lobby'; P.innerHTML = '';
        const code = CC.el('input', { class: 'field', maxlength: '4', placeholder: 'CODE', 'aria-label': 'Room code', style: 'width:6.5em;text-transform:uppercase' });
        P.append(CC.el('div', { class: 'stack', style: 'max-width:40em;margin:0 auto' },
          CC.el('h4', { text: disguise === 'human' ? 'Be yourself' : 'Play the AI' }),
          CC.el('p', { text: disguise === 'human' ? 'Chat like you. At the end you both decide: person or machine?' : 'Chat like a machine would. At the end you both decide: person or machine?' }),
          note ? CC.el('p', { class: 'status', text: note }) : null,
          CC.el('div', { class: 'row' },
            CC.el('button', { class: 'chip primary', type: 'button', text: 'Find a match', onclick: () => search() })),
          CC.el('p', { text: 'Find a match pairs you with whoever else is searching — a person in another browser, or the house AI if nobody turns up.' }),
          CC.el('h4', { text: 'Play a friend' }),
          CC.el('div', { class: 'row' },
            CC.el('button', { class: 'chip', type: 'button', text: 'Open a room', onclick: () => hostRoom() }),
            code,
            CC.el('button', { class: 'chip', type: 'button', text: 'Join room', onclick: () => { const c = code.value.trim().toUpperCase(); if (/^[A-Z]{4}$/.test(c)) joinRoom(c); else code.focus(); } })),
          CC.el('p', { text: 'Rooms only ever connect two people. Open one, send the code to your friend, and they join from their own browser.' }),
          CC.el('h4', { text: 'Practice' }),
          CC.el('div', { class: 'row' }, CC.el('button', { class: 'chip', type: 'button', text: 'Practice against the house AI', onclick: () => startWithBot(true) })),
        ));
      }

      // ---------- matchmaking ----------
      function searching(title, sub, onCancel) {
        P.innerHTML = '';
        const t0 = Date.now(), el = CC.el('p', { class: 'status dim', text: '0 s' });
        const tick = () => { if (st.phase !== 'search') return; el.textContent = `${Math.floor((Date.now() - t0) / 1000)} s`; later(tick, 500); };
        P.append(CC.el('div', { class: 'stack', style: 'align-items:center;text-align:center;padding-top:60px' },
          CC.el('div', { class: 'spinner', 'aria-hidden': 'true' }), CC.el('h4', { text: title }), CC.el('p', { text: sub }), el,
          CC.el('button', { class: 'chip', type: 'button', text: 'Cancel', onclick: onCancel })));
        tick();
        return (t, s) => { P.querySelector('h4').textContent = t; P.querySelector('p').textContent = s; };
      }
      function search() {
        st.phase = 'search';
        const set = searching('Finding a player…', 'Looking for someone else who is searching.', () => lobby());
        const minWait = CC.rand(4000, 7500), limit = CC.rand(11000, 17000), t0 = Date.now();
        st.mm = CC.net.quickMatch('imitation', limit);
        st.mm.promise.then((res) => {
          st.mm = null; if (st.dead || st.phase !== 'search') { if (res) res.link.close(); return; }
          const wait = Math.max(0, minWait - (Date.now() - t0));
          later(() => {
            set('Player found', 'Connecting…');
            later(() => (res ? startWithLink(res.link, res.host) : startWithBot(false)), CC.rand(900, 1800));
          }, wait);
        });
      }
      function hostRoom() {
        st.phase = 'search';
        const code = CC.net.roomCode();
        searching(`Room ${code}`, 'Send this code to your friend. Waiting for them to join…', () => lobby());
        st.mm = CC.net.hostRoom('imitation', code);
        st.mm.promise.then((res) => { st.mm = null; if (!res || st.dead || st.phase !== 'search') return; if (res.error) return lobby(res.error); startWithLink(res.link, true); });
      }
      function joinRoom(code) {
        st.phase = 'search';
        searching(`Joining ${code}`, 'Connecting to your friend…', () => lobby());
        st.mm = CC.net.joinRoom('imitation', code);
        st.mm.promise.then((res) => { st.mm = null; if (!res || st.dead || st.phase !== 'search') return; if (res.error) return lobby(res.error); startWithLink(res.link, false); });
      }

      // ---------- chat ----------
      let ui = null;
      const stats = { msgs: [], firstKey: 0, pasted: false, mathQuick: false };
      function chatUI(meFirst) {
        P.innerHTML = '';
        const log = CC.el('div', { class: 'chat-log', 'aria-live': 'polite' });
        const typing = CC.el('div', { class: 'typing' });
        const input = CC.el('input', { class: 'field', maxlength: '200', placeholder: 'Type a message', 'aria-label': 'Message', autocomplete: 'off' });
        const send = CC.el('button', { class: 'chip primary', type: 'button', text: 'Send' });
        const timer = CC.el('span', { class: 'timer', text: '2:00' });
        P.append(CC.el('div', { class: 'chat' },
          CC.el('div', { class: 'row', style: 'justify-content:space-between' }, CC.el('h4', { text: 'Stranger' }), timer),
          log, typing, CC.el('div', { class: 'chat-input' }, input, send)));
        ui = { log, typing, input, send, timer };
        sys(meFirst ? 'Connected. You go first.' : 'Connected. They go first.');
        sys('Two minutes, then you each decide: person or machine?');
        input.addEventListener('keydown', (e) => { if (!stats.firstKey && e.key.length === 1) stats.firstKey = Date.now(); if (e.key === 'Enter') doSend(); });
        input.addEventListener('paste', () => { stats.pasted = true; });
        input.addEventListener('input', () => { if (st.link && !st.typingSent) { st.link.send({ t: 'typing' }); st.typingSent = true; later(() => (st.typingSent = false), 1500); } });
        send.onclick = doSend;
        input.focus();
        st.ends = Date.now() + ROUND_SECONDS * 1000;
        const tick = () => {
          const left = Math.max(0, Math.ceil((st.ends - Date.now()) / 1000));
          timer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
          if (left <= 0) return timeUp();
          later(tick, 250);
        };
        tick();
      }
      function add(cls, text) { const d = CC.el('div', { class: 'msg ' + cls, text }); ui.log.append(d); ui.log.scrollTop = ui.log.scrollHeight; }
      function sys(text) { add('sys', text); }
      function doSend() {
        if (st.phase !== 'chat') return;
        const text = ui.input.value.trim(); if (!text) return;
        ui.input.value = '';
        const dur = stats.firstKey ? Math.max(0.2, (Date.now() - stats.firstKey) / 1000) : 0.2;
        const rec = { text, cps: text.length / dur, pasted: stats.pasted, at: Date.now() };
        const pr = st.bot && st.bot.ai.probe;
        if (pr && pr.at && Date.now() - pr.at < 9000 && text.replace(/[^\d-]/g, '').includes(String(pr.answer))) stats.mathQuick = true;
        stats.msgs.push(rec); stats.firstKey = 0; stats.pasted = false;
        add('me', text); CC.beep(880, 0.03, 'sine', 0.02);
        if (st.link) st.link.send({ t: 'chat', text });
        if (st.bot) botHeard(text);
      }
      function theySay(text) { ui.typing.textContent = ''; add('them', text); CC.beep(620, 0.03, 'sine', 0.02); }

      // ---------- the house AI in the chat ----------
      function botHeard(text) {
        const b = st.bot; b.pending.push(text); b.lastHuman = Date.now();
        clearTimeout(b.replyT);
        b.replyT = later(() => botRespond(), CC.rand(800, 1600)); // wait for a pause, people send bursts
      }
      function botRespond() {
        const b = st.bot; if (!b || st.phase !== 'chat') return;
        const text = b.pending.join(' '); b.pending = [];
        const lines = b.ai.reply(text);
        // now and then, after answering what was said, a probing question (from level 2)
        if (st.level >= 2 && !b.ai.probe && stats.msgs.length >= 4 && Math.random() < 0.12) {
          const a = CC.randInt(13, 48), c = CC.randInt(12, 39);
          lines.push(`random q but whats ${a} times ${c}`);
          b.ai.probe = { answer: a * c, at: 0 };
        }
        b.heardLen = text.length;
        botType(lines);
      }
      function botType(lines) {
        const b = st.bot; if (!lines.length || !b || st.phase !== 'chat') return;
        const line = lines.shift(), { think, type } = b.ai.timing(line, b.heardLen || 0);
        b.busy = true;
        later(() => {
          if (st.phase !== 'chat') return;
          ui.typing.textContent = 'Stranger is typing…';
          later(() => {
            if (st.phase !== 'chat') return;
            theySay(line); b.lastBot = Date.now(); b.busy = false;
            if (b.ai.probe && !b.ai.probe.at) b.ai.probe.at = Date.now();
            if (lines.length) botType(lines);
          }, type);
        }, think);
      }
      function newRound() {
        Object.assign(stats, { msgs: [], firstKey: 0, pasted: false, mathQuick: false });
        Object.assign(st, { myVote: null, theirVerdict: null, theirDisguise: null, revealed: false, why: null, bot: null });
      }
      function startWithBot(practice) {
        newRound();
        st.phase = 'chat'; st.opponent = 'ai'; st.practice = practice;
        st.bot = { ai: new HouseAI(st.level), pending: [], busy: false };
        const meFirst = Math.random() < 0.5;
        chatUI(meFirst);
        // the bot only ever speaks to answer you (or to say hello if it goes first); it never pipes up on its own after a silence
        if (!meFirst) later(() => botType(st.bot.ai.style(CC.pick(OPENERS))), CC.rand(1500, 4000));
      }
      function startWithLink(link, host) {
        newRound();
        st.link = link; st.phase = 'chat'; st.opponent = 'human'; st.practice = false;
        link.onClose(() => {
          st.link = null;
          if (st.phase === 'chat' || st.phase === 'verdict') { sys('The other player left.'); if (st.phase === 'chat') timeUp(); st.theirVerdict = st.theirVerdict || 'none'; maybeReveal(); }
        });
        const begin = (meFirst) => { chatUI(meFirst); };
        link.onMessage((m) => {
          if (!m) return;
          if (m.t === 'hello') begin(!m.hostFirst);
          else if (m.t === 'chat' && ui) theySay(String(m.text).slice(0, 200));
          else if (m.t === 'typing' && ui && st.phase === 'chat') { ui.typing.textContent = 'Stranger is typing…'; clearTimeout(st.typT); st.typT = later(() => { if (ui) ui.typing.textContent = ''; }, 2500); }
          else if (m.t === 'verdict') { st.theirVerdict = m.guess; st.theirDisguise = m.disguise; maybeReveal(); }
        });
        if (host) { const hostFirst = Math.random() < 0.5; link.send({ t: 'hello', hostFirst }); begin(hostFirst); }
      }

      // ---------- verdict + reveal ----------
      function timeUp() {
        if (st.phase !== 'chat') return;
        st.phase = 'verdict'; ui.input.disabled = true; ui.send.disabled = true; ui.typing.textContent = '';
        sys('Time. Who were you talking to?');
        const row = CC.el('div', { class: 'row', style: 'justify-content:center;margin-top:10px' },
          CC.el('button', { class: 'chip primary', type: 'button', text: 'A person', onclick: () => vote('human') }),
          CC.el('button', { class: 'chip primary', type: 'button', text: 'The machine', onclick: () => vote('ai') }));
        ui.log.append(row); ui.log.scrollTop = ui.log.scrollHeight;
        st.voteRow = row;
      }
      function vote(guess) {
        if (st.myVote) return;
        st.myVote = guess; st.voteRow.querySelectorAll('button').forEach((b) => (b.disabled = true));
        if (st.opponent === 'ai') {
          st.theirDisguise = 'human';
          const j = judge(stats, st.level); st.theirVerdict = j.guess; st.why = j.why;
          later(maybeReveal, CC.rand(600, 1500));
        } else {
          if (st.link) st.link.send({ t: 'verdict', guess, disguise });
          sys('Waiting for their call…');
          later(() => { if (!st.revealed) { st.theirVerdict = st.theirVerdict || 'none'; maybeReveal(); } }, 30000);
          maybeReveal();
        }
      }
      function maybeReveal() {
        if (st.revealed || !st.myVote || !st.theirVerdict) return;
        st.revealed = true; st.phase = 'reveal';
        const truth = st.opponent; // 'human' | 'ai'
        const correct = st.myVote === truth, fooled = st.theirVerdict === disguise;
        const pts = (correct ? 1 : 0) + (fooled ? 1 : 0);
        if (!st.practice) {
          st.score.you += pts; st.score.rounds++; CC.store.set('imitScore', st.score);
          if (truth === 'ai' && correct) { st.level = Math.min(8, st.level + 1); CC.store.set('imitLevel', st.level); }
        }
        hud();
        const them = truth === 'ai' ? `the house AI (level ${st.bot ? st.bot.ai.level : st.level})` : 'a person in another browser';
        const theyThought = st.theirVerdict === 'none' ? 'They never made a call.' : `They took you for ${st.theirVerdict === 'ai' ? 'the machine' : 'a person'}${st.why ? ' — ' + st.why : ''}.`;
        const box = CC.el('div', { class: 'stack', style: 'margin-top:12px;padding:12px;border:1px solid var(--brass);border-radius:12px' },
          CC.el('h4', { text: correct ? 'You called it' : 'Fooled you' }),
          CC.el('p', { class: 'status', text: `You were talking to ${them}.` }),
          CC.el('p', { class: 'status', text: theyThought }),
          CC.el('p', { text: st.practice ? 'Practice round — no points.' : `+${pts} this round.` }),
          CC.el('div', { class: 'row' }, CC.el('button', { class: 'chip primary', type: 'button', text: 'Play again', onclick: () => lobby() })));
        ui.log.append(box); ui.log.scrollTop = ui.log.scrollHeight;
        CC.beep(correct ? 880 : 220, 0.2, 'triangle');
        if (st.link) { const l = st.link; st.link = null; later(() => l.close(), 1500); }
      }

      lobby();
      return {
        destroy() { st.dead = true; teardown(); },
      };
    },
  });
  CC._imitation = { HouseAI, judge };
})();
