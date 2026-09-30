/* Cocktail Cabinet — shell: the table (menu), routing, role picker, fixed-step loop. */
(() => {
  'use strict';
  const CC = window.CC;
  const $ = (id) => document.getElementById(id);
  const STEP = 1 / 60;

  const menu = $('menu'), gameEl = $('game'), deck = $('deck');
  const canvas = $('screen'), ctx = canvas.getContext('2d');
  const panel = $('panel'), bezel = $('bezel');
  const banner = $('banner'), bannerTitle = $('bannerTitle'), bannerSub = $('bannerSub');
  CC.bindCanvas(canvas);

  let current = null; // { game, inst, role }
  let paused = false, bannerTimer = 0;

  // ---------- menu ----------
  for (const g of CC.games) {
    const card = CC.el('button', { class: 'cab', type: 'button', role: 'listitem', onclick: () => { location.hash = g.id; } });
    card.innerHTML = g.icon || '';
    card.append(CC.el('div', {}, CC.el('h3', { text: g.title }), CC.el('p', { text: g.blurb })));
    deck.append(card);
  }
  const muteBtn = $('muteBtn');
  const syncMute = () => { muteBtn.textContent = CC.muted ? 'Sound off' : 'Sound on'; muteBtn.setAttribute('aria-pressed', String(CC.muted)); };
  muteBtn.onclick = () => { CC.muted = !CC.muted; CC.store.set('muted', CC.muted); syncMute(); };
  syncMute();

  // ---------- api handed to each game ----------
  function makeApi(game, role) {
    return {
      canvas, ctx, W: canvas.width, H: canvas.height, role, input: CC.input, panel,
      hud(l, c, r) { $('hudL').textContent = l ?? ''; $('hudC').textContent = c ?? ''; $('hudR').textContent = r ?? ''; },
      banner(title, sub = '', ms = 1800) {
        bannerTitle.textContent = title; bannerSub.textContent = sub; banner.hidden = false;
        clearTimeout(bannerTimer); if (ms > 0) bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
      },
      hideBanner() { clearTimeout(bannerTimer); banner.hidden = true; },
      setHelp(html) { $('help').innerHTML = html; },
      isPaused: () => paused,
    };
  }

  function stopCurrent() {
    if (current && current.inst && current.inst.destroy) { try { current.inst.destroy(); } catch (e) { console.error(e); } }
    current = null; CC.activeCanvasGame = false;
    panel.innerHTML = ''; panel.hidden = true; banner.hidden = true;
    bezel.classList.remove('with-panel', 'split');
  }

  function startGame(game, roleId) {
    stopCurrent();
    const role = game.roles.find((r) => r.id === roleId) || game.roles[0];
    CC.store.set('role:' + game.id, role.id);
    const size = game.size || { w: 800, h: 600 };
    canvas.width = size.w; canvas.height = size.h;
    canvas.style.aspectRatio = `${size.w} / ${size.h}`;
    // keep the element's box at the game's aspect ratio so pointer coordinates map 1:1
    canvas.style.width = `min(100%, calc((100vh - 250px) * ${size.w / size.h}))`;
    const layout = game.layout || 'canvas';
    if (layout === 'panel') { bezel.classList.add('with-panel'); panel.hidden = false; }
    if (layout === 'split') { bezel.classList.add('split'); panel.hidden = false; }
    CC.activeCanvasGame = layout !== 'panel';
    $('gameTitle').textContent = game.title;
    $('help').innerHTML = role.help || '';
    $('pauseBtn').hidden = !!game.noPause;
    // role buttons
    const roles = $('roles'); roles.innerHTML = '';
    for (const r of game.roles) {
      const b = CC.el('button', { class: 'role', type: 'button', role: 'radio', 'aria-checked': String(r.id === role.id), text: r.label, onclick: () => startGame(game, r.id) });
      roles.append(b);
    }
    paused = false; $('pauseBtn').textContent = 'Pause';
    CC.input.reset();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const api = makeApi(game, role.id);
    api.hud('', '', '');
    current = { game, role: role.id, inst: game.create(api) };
    if (layout !== 'panel') canvas.focus({ preventScroll: true });
  }

  function route() {
    const id = location.hash.replace('#', '');
    const game = CC.games.find((g) => g.id === id);
    if (!game) { stopCurrent(); gameEl.hidden = true; menu.hidden = false; document.title = 'Cocktail Cabinet — seven games, either side'; return; }
    menu.hidden = true; gameEl.hidden = false; document.title = game.title + ' — Cocktail Cabinet';
    startGame(game, CC.store.get('role:' + game.id, game.roles[0].id));
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  const togglePause = () => {
    if (!current || current.game.noPause) return;
    paused = !paused; $('pauseBtn').textContent = paused ? 'Resume' : 'Pause';
    if (paused) { bannerTitle.textContent = 'Paused'; bannerSub.textContent = 'Press P to resume'; banner.hidden = false; clearTimeout(bannerTimer); } else banner.hidden = true;
  };
  $('backBtn').onclick = () => { location.hash = ''; };
  $('pauseBtn').onclick = togglePause;
  $('restartBtn').onclick = () => current && startGame(current.game, current.role);
  window.addEventListener('keydown', (e) => {
    if (!current || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) return;
    if (e.code === 'Escape') location.hash = '';
    else if (e.code === 'KeyP') togglePause();
    else if (e.code === 'KeyR' && !current.game.noRestartKey) startGame(current.game, current.role);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && current && !paused && !current.game.noPause) togglePause(); });

  // ---------- loop ----------
  let last = performance.now(), acc = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (t - last) / 1000); last = t;
    if (!current) return;
    const inst = current.inst;
    try {
      if (!paused) {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 6) { if (inst.update) inst.update(STEP); CC.input.clearFrame(); acc -= STEP; steps++; }
        if (steps === 6) acc = 0;
      }
      if (inst.draw && current.game.layout !== 'panel') inst.draw(ctx);
    } catch (err) {
      console.error(err);
      paused = true;
      bannerTitle.textContent = 'Something broke'; bannerSub.textContent = String(err.message || err); banner.hidden = false;
    }
  }
  requestAnimationFrame(frame);
  route();
})();
