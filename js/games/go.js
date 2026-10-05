/**
 * Game: Go.
 *
 * @file Go on 9 by 9 or 13 by 13, with area scoring, komi 6.5 and a simple ko rule.
 * Play black or white against the computer, play a person in another browser (quick match
 * or room code), or watch the computer play itself.
 *
 * Contains a rules engine ({@code Board}: captures, suicide, ko, area scoring), the computer
 * player ({@code Thinker}: Monte Carlo search with thousands of random playouts per move,
 * all-moves-as-first statistics and a small atari heuristic), and a dead-stone estimator that
 * uses a seeded random generator so both browsers of an online game agree on the result.
 *
 * Playouts per move rise with the level, which rises each time the human wins.
 *
 * Test hook: {@code CC._go} exposes {@code Board}, {@code Thinker}, {@code playout} and
 * {@code deadStones}.
 *
 * @module games/go
 * @requires js/core.js
 * @requires js/net.js
 */
(() => {
  'use strict';
  const CC = window.CC;
  const KOMI = 6.5;

  // ---------------------------------------------------------------- engine
  const geoCache = {};
  function geo(n) {
    if (geoCache[n]) return geoCache[n];
    const N = n * n, nb = [], dg = [];
    for (let p = 0; p < N; p++) {
      const x = p % n, y = (p / n) | 0, a = [], d = [];
      if (x > 0) a.push(p - 1); if (x < n - 1) a.push(p + 1); if (y > 0) a.push(p - n); if (y < n - 1) a.push(p + n);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < n && yy < n) d.push(yy * n + xx); }
      nb.push(a); dg.push(d);
    }
    return (geoCache[n] = { n, N, nb, dg });
  }

  class Board {
    constructor(n) {
      this.g = geo(n); const N = this.g.N;
      this.b = new Int8Array(N); this.ko = -1; this.turn = 1; this.passes = 0; this.caps = [0, 0, 0]; this.moves = 0; this.last = -1;
      this.mark = new Int32Array(N); this.lmark = new Int32Array(N); this.stamp = 0; this.stack = new Int32Array(N); this.lastLib = -1;
    }
    clone() {
      const c = new Board(this.g.n);
      c.b.set(this.b); c.ko = this.ko; c.turn = this.turn; c.passes = this.passes; c.caps = this.caps.slice(); c.moves = this.moves; c.last = this.last;
      return c;
    }
    copyFrom(o) { this.b.set(o.b); this.ko = o.ko; this.turn = o.turn; this.passes = o.passes; this.caps[1] = o.caps[1]; this.caps[2] = o.caps[2]; this.moves = o.moves; this.last = o.last; }
    // number of liberties of the group at p, stopping once it exceeds `limit`
    libs(p, limit) {
      const b = this.b, nb = this.g.nb, c = b[p], s = ++this.stamp, mark = this.mark, lm = this.lmark, stack = this.stack;
      let sp = 0, count = 0; stack[sp++] = p; mark[p] = s;
      while (sp) {
        const q = stack[--sp], ns = nb[q];
        for (let i = 0; i < ns.length; i++) {
          const r = ns[i], v = b[r];
          if (v === 0) { if (lm[r] !== s) { lm[r] = s; count++; this.lastLib = r; if (count > limit) return count; } }
          else if (v === c && mark[r] !== s) { mark[r] = s; stack[sp++] = r; }
        }
      }
      return count;
    }
    removeGroup(p) {
      const b = this.b, nb = this.g.nb, c = b[p], stack = this.stack;
      let sp = 0, n = 0; stack[sp++] = p; b[p] = 0;
      while (sp) { const q = stack[--sp]; n++; const ns = nb[q]; for (let i = 0; i < ns.length; i++) { const r = ns[i]; if (b[r] === c) { b[r] = 0; stack[sp++] = r; } } }
      return n;
    }
    play(p) {
      const c = this.turn, o = 3 - c;
      if (p < 0) { this.passes++; this.ko = -1; this.turn = o; this.moves++; this.last = -1; return true; }
      const b = this.b;
      if (b[p] !== 0 || p === this.ko) return false;
      b[p] = c;
      let cap = 0, capPt = -1;
      const ns = this.g.nb[p];
      for (let i = 0; i < ns.length; i++) { const q = ns[i]; if (b[q] === o && this.libs(q, 0) === 0) { cap += this.removeGroup(q); capPt = q; } }
      if (cap === 0 && this.libs(p, 0) === 0) { b[p] = 0; return false; } // suicide
      let single = true; for (let i = 0; i < ns.length; i++) if (b[ns[i]] === c) { single = false; break; }
      this.ko = cap === 1 && single && this.libs(p, 1) === 1 ? capPt : -1;
      this.caps[c] += cap; this.passes = 0; this.turn = o; this.moves++; this.last = p;
      return true;
    }
    legal(p) { if (p < 0) return true; if (this.b[p] !== 0 || p === this.ko) return false; const t = this.clone(); return t.play(p); }
    // a point surrounded by one colour that the opponent cannot really contest
    isEye(p, c) {
      const b = this.b; if (b[p] !== 0) return false;
      for (const q of this.g.nb[p]) if (b[q] !== c) return false;
      let bad = 0; const d = this.g.dg[p];
      for (const q of d) if (b[q] === 3 - c) bad++;
      return d.length < 4 ? bad === 0 : bad < 2;
    }
    // area score, black minus white (komi applied). Empty regions touching one colour only count for it.
    score(dead) {
      const n = this.g.N, b = Int8Array.from(this.b), nb = this.g.nb;
      if (dead) for (let p = 0; p < n; p++) if (dead[p]) b[p] = 0;
      const owner = new Int8Array(n), seen = new Uint8Array(n);
      let bl = 0, wh = 0;
      for (let p = 0; p < n; p++) { if (b[p] === 1) { bl++; owner[p] = 1; } else if (b[p] === 2) { wh++; owner[p] = 2; } }
      for (let p = 0; p < n; p++) {
        if (b[p] !== 0 || seen[p]) continue;
        const region = [p], touch = new Set(); seen[p] = 1;
        for (let i = 0; i < region.length; i++) for (const q of nb[region[i]]) { if (b[q] === 0) { if (!seen[q]) { seen[q] = 1; region.push(q); } } else touch.add(b[q]); }
        if (touch.size === 1) { const c = [...touch][0]; for (const q of region) owner[q] = c; if (c === 1) bl += region.length; else wh += region.length; }
      }
      return { diff: bl - wh - KOMI, black: bl, white: wh + KOMI, owner };
    }
  }

  // ---------------------------------------------------------------- playouts
  function quickScore(bd) { // for finished playouts: stones + single-colour-bordered empties
    const b = bd.b, nb = bd.g.nb; let s = 0;
    for (let p = 0; p < b.length; p++) {
      const v = b[p];
      if (v === 1) s++; else if (v === 2) s--;
      else { let c = 0, ok = true; for (const q of nb[p]) { if (c === 0) c = b[q]; else if (b[q] !== c) { ok = false; break; } } if (ok) s += c === 1 ? 1 : c === 2 ? -1 : 0; }
    }
    return s - KOMI;
  }
  // plays random non-eye-filling moves to the end; records who played each point first (for AMAF)
  function playout(bd, rnd, first) {
    const N = bd.g.N, limit = N * 3;
    let count = 0;
    while (bd.passes < 2 && count < limit) {
      const c = bd.turn;
      let moved = false;
      // light tactics: answer an atari next to the last move
      if (bd.last >= 0 && rnd() < 0.8) {
        for (const q of bd.g.nb[bd.last]) {
          if (bd.b[q] !== 0 && bd.libs(q, 1) === 1) {
            const lib = bd.lastLib;
            if (!bd.isEye(lib, c) && bd.play(lib)) { if (first && !first[lib]) first[lib] = c; moved = true; break; }
          }
        }
      }
      if (!moved) {
        const start = Math.floor(rnd() * N), step = [1, 3, 5, 7, 11, 13][Math.floor(rnd() * 6)];
        for (let i = 0; i < N; i++) {
          const p = (start + i * step) % N;
          if (bd.b[p] !== 0 || bd.isEye(p, c)) continue;
          if (bd.play(p)) { if (first && !first[p]) first[p] = c; moved = true; break; }
        }
        if (!moved && N % step === 0) { // step not coprime with N: fall back to a linear scan
          for (let p = 0; p < N; p++) { if (bd.b[p] === 0 && !bd.isEye(p, c) && bd.play(p)) { if (first && !first[p]) first[p] = c; moved = true; break; } }
        }
      }
      if (!moved) bd.play(-1);
      count++;
    }
    return quickScore(bd);
  }

  // estimate which stones are dead: those the opponent owns in most playouts
  function deadStones(board, seed) {
    const rnd = CC.seeded(seed), N = board.g.N, own = new Float32Array(N), tmp = new Board(board.g.n), R = 160;
    for (let k = 0; k < R; k++) {
      tmp.copyFrom(board); tmp.passes = 0; playout(tmp, rnd, null);
      const b = tmp.b, nb = tmp.g.nb;
      for (let p = 0; p < N; p++) {
        let v = b[p];
        if (v === 0) { let c = 0, ok = true; for (const q of nb[p]) { if (c === 0) c = b[q]; else if (b[q] !== c) ok = false; } v = ok ? c : 0; }
        own[p] += v === 1 ? 1 : v === 2 ? -1 : 0;
      }
    }
    const dead = new Uint8Array(N);
    for (let p = 0; p < N; p++) { const o = own[p] / R; if (board.b[p] === 1 && o < -0.5) dead[p] = 1; if (board.b[p] === 2 && o > 0.5) dead[p] = 1; }
    return dead;
  }

  // Monte Carlo search with UCB at the root and all-moves-as-first statistics. Runs in slices.
  class Thinker {
    constructor(board, budget) {
      this.root = board; this.color = board.turn; this.budget = budget; this.done = 0; this.rnd = Math.random;
      this.tmp = new Board(board.g.n); this.first = new Int8Array(board.g.N);
      this.cands = [];
      for (let p = 0; p < board.g.N; p++) if (board.b[p] === 0 && !board.isEye(p, this.color) && board.legal(p)) this.cands.push({ p, n: 0, w: 0, an: 0, aw: 0 });
      this.byP = new Map(this.cands.map((c) => [c.p, c]));
    }
    value(c) { const k = 300, beta = Math.sqrt(k / (3 * c.n + k)), mc = c.n ? c.w / c.n : 0.5, am = c.an ? c.aw / c.an : 0.5; return (1 - beta) * mc + beta * am; }
    step(ms) {
      const t0 = performance.now();
      while (this.done < this.budget && performance.now() - t0 < ms && this.cands.length) {
        let best = null, bv = -1; const logT = Math.log(this.done + 1);
        for (const c of this.cands) { const v = this.value(c) + 0.9 * Math.sqrt(logT / (c.n + 1)); if (v > bv) { bv = v; best = c; } }
        this.tmp.copyFrom(this.root); this.first.fill(0);
        this.tmp.play(best.p); this.first[best.p] = this.color;
        const s = playout(this.tmp, this.rnd, this.first);
        const win = (s > 0) === (this.color === 1) ? 1 : 0;
        best.n++; best.w += win;
        for (let p = 0; p < this.first.length; p++) if (this.first[p] === this.color) { const c = this.byP.get(p); if (c) { c.an++; c.aw += win; } }
        this.done++;
      }
      return this.done >= this.budget || !this.cands.length;
    }
    ranked() { return this.cands.slice().sort((a, b) => b.n - a.n || this.value(b) - this.value(a)); }
  }

  // ---------------------------------------------------------------- the game
  CC.register({
    id: 'go', title: 'Go',
    blurb: 'Surround more of the board. Against the computer or a friend online.',
    icon: `<svg viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="4" fill="#c99a52"/><g stroke="#3b2417" stroke-width="1.5"><path d="M12 12H52M12 24H52M12 36H52M12 48H52M12 12V52M24 12V52M36 12V52M48 12V52"/></g><circle cx="24" cy="24" r="6" fill="#111"/><circle cx="36" cy="36" r="6" fill="#f3e6cf"/><circle cx="36" cy="24" r="6" fill="#111"/></svg>`,
    size: { w: 600, h: 600 }, layout: 'split', noRestartKey: true,
    roles: [
      { id: 'black', label: 'You play black · computer white', help: 'Click a point to place a stone. Black moves first. Two passes in a row end the game; dead stones are estimated and the area is counted, with 6.5 komi to white.' },
      { id: 'white', label: 'You play white · computer black', help: 'The computer opens as black. Click a point to place a stone. Two passes end the game.' },
      { id: 'online', label: 'Play a person in another browser', help: 'Find a match, or open a room and send the code to a friend. Colours are drawn at random.' },
      { id: 'watch', label: 'Watch computer vs computer', help: 'Both sides are played by the computer.' },
    ],
    create(api) {
      const role = api.role, P = api.panel, ctx = api.ctx, W = api.W;
      const st = {
        n: CC.store.get('goSize', 9), board: null, human: 0, over: false, result: null, dead: null, thinker: null, thinkDelay: 0,
        level: CC.store.get('goLevel', 1), link: null, mm: null, online: role === 'online', connected: false, history: [],
      };
      st.board = new Board(st.n);
      if (role === 'black') st.human = 1; else if (role === 'white') st.human = 2;
      const budget = () => (role === 'watch' ? 2500 : [0, 150, 500, 1200, 3000, 6000, 10000, 16000][Math.min(st.level, 7)]);

      // ---------- panel ----------
      const status = CC.el('p', { class: 'status' });
      const capsEl = CC.el('p');
      const passBtn = CC.el('button', { class: 'chip', type: 'button', text: 'Pass', onclick: () => humanMove(-1) });
      const resignBtn = CC.el('button', { class: 'chip', type: 'button', text: 'Resign', onclick: () => resign() });
      const newBtn = CC.el('button', { class: 'chip', type: 'button', text: 'New game', onclick: () => newGame(true) });
      const sizeRow = CC.el('div', { class: 'row' }, CC.el('span', { text: 'Board' }),
        ...[9, 13].map((n) => CC.el('button', { class: 'chip', type: 'button', 'aria-pressed': String(st.n === n), text: `${n}×${n}`, onclick: () => { st.n = n; CC.store.set('goSize', n); sizeRow.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent.startsWith(String(n))))); newGame(true); } })));
      const levelEl = CC.el('p');
      const netBox = CC.el('div', { class: 'stack' });
      P.append(CC.el('div', { class: 'stack' }, CC.el('h4', { text: 'Go' }), status, capsEl, CC.el('div', { class: 'row' }, passBtn, resignBtn, newBtn), st.online ? null : sizeRow, st.online ? null : levelEl, st.online ? netBox : null));

      function colorName(c) { return c === 1 ? 'black' : 'white'; }
      function isHumanTurn() { return !st.over && (st.online ? st.connected && st.board.turn === st.human : st.board.turn === st.human); }
      function refresh() {
        const b = st.board;
        if (st.over) status.textContent = st.result;
        else if (st.online && !st.connected) status.textContent = 'Not connected yet.';
        else if (isHumanTurn()) status.textContent = `Your move (${colorName(st.human)})${b.passes ? ' — they passed' : ''}`;
        else if (st.online) status.textContent = `Their move (${colorName(b.turn)})`;
        else status.textContent = `Computer thinking (${colorName(b.turn)})…`;
        capsEl.textContent = `Captured — by black ${b.caps[1]}, by white ${b.caps[2]}`;
        levelEl.textContent = role === 'watch' ? 'Computer vs computer.' : `Computer level ${st.level}. It thinks harder after each of your wins.`;
        passBtn.disabled = resignBtn.disabled = !isHumanTurn();
        newBtn.hidden = st.online && !(st.connected && st.isHost);
        api.hud(`Black ${st.human === 1 ? '(you)' : st.online || role === 'watch' ? '' : '(computer)'}`, `Move ${b.moves + 1}`, `White ${st.human === 2 ? '(you)' : st.online || role === 'watch' ? '' : '(computer)'}`);
      }

      function newGame(fromButton) {
        if (st.online && fromButton) { if (!st.isHost || !st.connected) return; const hostColor = Math.random() < 0.5 ? 1 : 2; st.link.send({ t: 'start', hostColor, n: st.n }); startOnline(hostColor); return; }
        st.board = new Board(st.n); st.over = false; st.result = null; st.dead = null; st.thinker = null; st.thinkDelay = 0.4;
        api.hideBanner(); refresh();
      }

      function endGame(text) {
        st.over = true; st.thinker = null; st.result = text; api.banner('Game over', text, 0); refresh();
      }
      function finishByScore() {
        st.dead = deadStones(st.board, st.board.moves * 7919 + st.n);
        const s = st.board.score(st.dead);
        st.territory = s.owner;
        const winner = s.diff > 0 ? 1 : 2, margin = Math.abs(s.diff);
        const who = st.human === winner ? 'You win' : st.human ? (st.online ? 'They win' : 'The computer wins') : `${colorName(winner)} wins`;
        if (!st.online && st.human && winner === st.human) { st.level = Math.min(7, st.level + 1); CC.store.set('goLevel', st.level); }
        endGame(`${who} — ${colorName(winner)} by ${margin} (black ${s.black}, white ${s.white})`);
        CC.beep(winner === st.human ? 880 : 330, 0.3, 'triangle');
      }
      function applyMove(p) {
        if (!st.board.play(p)) return false;
        st.history.push(p);
        CC.beep(p < 0 ? 300 : 520, 0.05, 'triangle', 0.03);
        if (st.board.passes >= 2) finishByScore();
        refresh();
        return true;
      }
      function humanMove(p) {
        if (!isHumanTurn()) return;
        if (p >= 0 && !st.board.legal(p)) { CC.beep(120, 0.08); return; }
        if (st.online && st.link) st.link.send({ t: 'move', p });
        applyMove(p); st.thinkDelay = 0.3;
      }
      function resign() {
        if (!isHumanTurn() && !(st.online && st.connected)) return;
        if (st.online && st.link) st.link.send({ t: 'resign' });
        endGame(st.online ? 'You resigned.' : 'You resigned. The computer wins.');
      }

      // ---------- computer move ----------
      function computerStep(dt) {
        if (st.over || st.online || st.board.turn === st.human) return;
        if (st.thinkDelay > 0) { st.thinkDelay -= dt; return; }
        if (!st.thinker) st.thinker = new Thinker(st.board, budget());
        if (!st.thinker.step(9)) return;
        const t = st.thinker; st.thinker = null;
        const ranked = t.ranked();
        let move = -1;
        if (ranked.length) {
          const top = ranked[0], rate = top.n ? top.w / top.n : 0;
          const oppPassed = st.board.passes === 1;
          // pass when the opponent passed and we are ahead once dead stones are counted
          if (oppPassed) {
            const s = st.board.score(deadStones(st.board, st.board.moves * 131 + 7));
            if ((s.diff > 0) === (st.board.turn === 1)) move = -1; else move = top.p;
          } else if (rate > 0.97 && st.board.moves > st.board.g.N * 0.6) {
            move = -1; // nothing left worth playing
          } else {
            move = top.p;
            const sloppy = [0, 0.35, 0.18, 0.08, 0, 0, 0, 0][Math.min(st.level, 7)];
            if (role !== 'watch' && Math.random() < sloppy) move = CC.pick(ranked.slice(0, Math.min(6, ranked.length))).p;
          }
        }
        applyMove(move);
        st.thinkDelay = role === 'watch' ? 0.35 : 0.1;
      }

      // ---------- online ----------
      function startOnline(hostColor) {
        st.human = st.isHost ? hostColor : 3 - hostColor;
        st.board = new Board(st.n); st.over = false; st.result = null; st.dead = null; st.history = [];
        api.banner(`You are ${colorName(st.human)}`, st.human === 1 ? 'You move first' : 'They move first', 1600);
        refresh();
      }
      function bindLink(link, host) {
        st.link = link; st.connected = true; st.isHost = host;
        link.onClose(() => { st.connected = false; st.link = null; if (!st.over) endGame('The other player left.'); netLobby('Connection closed.'); });
        link.onMessage((m) => {
          if (!m) return;
          if (m.t === 'start') { st.n = m.n === 13 ? 13 : 9; startOnline(m.hostColor); }
          else if (m.t === 'move' && !st.over && st.board.turn !== st.human) { const p = m.p | 0; if (p < -1 || p >= st.board.g.N || !applyMove(p)) console.warn('bad move from peer', m); }
          else if (m.t === 'resign' && !st.over) endGame('They resigned. You win.');
        });
        netBox.innerHTML = ''; netBox.append(CC.el('p', { class: 'status', text: 'Connected to another player.' }));
        if (host) { const hostColor = Math.random() < 0.5 ? 1 : 2; link.send({ t: 'start', hostColor, n: st.n }); startOnline(hostColor); }
        refresh();
      }
      function netLobby(note) {
        netBox.innerHTML = '';
        const code = CC.el('input', { class: 'field', maxlength: '4', placeholder: 'CODE', 'aria-label': 'Room code', style: 'width:6.5em;text-transform:uppercase' });
        const msg = CC.el('p', { class: 'status dim', text: note || '' });
        const busy = (text, h) => { msg.textContent = text; st.mm = h; h.promise.then((res) => { st.mm = null; if (st.gone) { if (res && res.link) res.link.close(); return; } if (!res) { msg.textContent = 'Nobody else was searching. Try again, open a room, or play the computer.'; return; } if (res.error) { msg.textContent = res.error; return; } bindLink(res.link, res.host); }); };
        netBox.append(
          CC.el('h4', { text: 'Find an opponent' }),
          CC.el('div', { class: 'row' },
            CC.el('button', { class: 'chip primary', type: 'button', text: 'Find a match', onclick: () => { if (!st.mm) busy('Looking for another player… (up to 30 s)', CC.net.quickMatch('go', 30000)); } }),
            CC.el('button', { class: 'chip', type: 'button', text: 'Cancel', onclick: () => { if (st.mm) st.mm.cancel(); } })),
          CC.el('div', { class: 'row' },
            CC.el('button', { class: 'chip', type: 'button', text: 'Open a room', onclick: () => { if (st.mm) return; const c = CC.net.roomCode(); busy(`Room ${c} — send this code to your friend.`, CC.net.hostRoom('go', c)); } }),
            code,
            CC.el('button', { class: 'chip', type: 'button', text: 'Join room', onclick: () => { const c = code.value.trim().toUpperCase(); if (st.mm || !/^[A-Z]{4}$/.test(c)) return; busy(`Joining ${c}…`, CC.net.joinRoom('go', c)); } })),
          msg);
      }
      if (st.online) netLobby();

      // ---------- board drawing ----------
      const layout = () => { const n = st.board.g.n, m = 40, cell = (W - 2 * m) / (n - 1); return { n, m, cell }; };
      const pointAt = (x, y) => { const { n, m, cell } = layout(); const i = Math.round((x - m) / cell), j = Math.round((y - m) / cell); if (i < 0 || j < 0 || i >= n || j >= n) return -1; if (Math.hypot(x - (m + i * cell), y - (m + j * cell)) > cell * 0.48) return -1; return j * n + i; };

      newGame(false);
      return {
        update(dt) {
          const inp = api.input;
          if (inp.mouse.clicked && isHumanTurn()) { const p = pointAt(inp.mouse.x, inp.mouse.y); if (p >= 0) humanMove(p); }
          if (!st.online && st.human === 0 && st.over) { st.restartT = (st.restartT || 0) + dt; if (st.restartT > 4) { st.restartT = 0; newGame(false); } }
          computerStep(dt);
          if (st.thinker || (!st.online && !st.over && st.board.turn !== st.human)) refresh();
        },
        draw() {
          const { n, m, cell } = layout(), b = st.board.b;
          ctx.fillStyle = '#c99a52'; ctx.fillRect(0, 0, W, W);
          ctx.fillStyle = 'rgba(90,50,20,.08)'; for (let i = 0; i < 40; i++) ctx.fillRect(0, i * 15 + ((i * 7) % 5), W, 2);
          ctx.strokeStyle = '#3b2417'; ctx.lineWidth = 1.2;
          for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(m, m + i * cell); ctx.lineTo(m + (n - 1) * cell, m + i * cell); ctx.stroke(); ctx.beginPath(); ctx.moveTo(m + i * cell, m); ctx.lineTo(m + i * cell, m + (n - 1) * cell); ctx.stroke(); }
          const stars = n === 9 ? [2, 6] : [3, 9], mids = n === 9 ? [4] : [6];
          ctx.fillStyle = '#3b2417';
          for (const x of stars.concat(mids)) for (const y of stars.concat(mids)) if ((stars.includes(x) && stars.includes(y)) || (x === y && mids.includes(x))) { ctx.beginPath(); ctx.arc(m + x * cell, m + y * cell, 3.5, 0, 6.28); ctx.fill(); }
          const r = cell * 0.46;
          for (let p = 0; p < b.length; p++) {
            if (!b[p]) continue;
            const x = m + (p % n) * cell, y = m + ((p / n) | 0) * cell;
            const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
            if (b[p] === 1) { g.addColorStop(0, '#555'); g.addColorStop(1, '#0c0c0c'); } else { g.addColorStop(0, '#fff'); g.addColorStop(1, '#cfc6b4'); }
            ctx.globalAlpha = st.dead && st.dead[p] ? 0.45 : 1;
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
            ctx.globalAlpha = 1;
            if (p === st.board.last) { ctx.strokeStyle = b[p] === 1 ? '#ffb347' : '#e0405a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 6.28); ctx.stroke(); }
          }
          if (st.over && st.territory) {
            for (let p = 0; p < b.length; p++) {
              const o = st.territory[p]; if (!o || (b[p] && !(st.dead && st.dead[p]))) continue;
              const x = m + (p % n) * cell, y = m + ((p / n) | 0) * cell;
              ctx.fillStyle = o === 1 ? '#111' : '#f3e6cf'; ctx.fillRect(x - cell * 0.13, y - cell * 0.13, cell * 0.26, cell * 0.26);
            }
          }
          const mo = api.input.mouse;
          if (isHumanTurn() && mo.inside) {
            const p = pointAt(mo.x, mo.y);
            if (p >= 0 && !b[p]) { ctx.globalAlpha = 0.4; ctx.fillStyle = st.human === 1 ? '#111' : '#fff'; ctx.beginPath(); ctx.arc(m + (p % n) * cell, m + ((p / n) | 0) * cell, r, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; }
          }
        },
        destroy() { st.gone = true; if (st.mm) st.mm.cancel(); if (st.link) st.link.close(); },
      };
    },
  });
  CC._go = { Board, Thinker, playout, deadStones };
})();
