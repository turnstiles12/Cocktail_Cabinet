/* Cocktail Cabinet — browser-to-browser links. No server of our own:
   - PeerJS (WebRTC) connects two different browsers; its free public broker only introduces the peers.
   - BroadcastChannel connects two tabs of the same browser (handy for testing, works offline).
   A link looks the same either way: link.send(obj), link.onMessage(fn), link.onClose(fn), link.close(). */
(() => {
  'use strict';
  const CC = window.CC;
  const PREFIX = 'cocktailcab-v1-';
  const SLOTS = 4;
  const rid = () => Math.random().toString(36).slice(2, 10);

  function makeLink(kind, sendRaw, closeRaw) {
    let onMsg = null, onClose = null, closed = false, lastHeard = performance.now();
    const queue = [];
    const link = {
      kind,
      send(d) { if (!closed) { try { sendRaw({ t: 'm', d }); } catch (e) { /* ignore */ } } },
      onMessage(fn) { onMsg = fn; while (queue.length) fn(queue.shift()); },
      onClose(fn) { onClose = fn; if (closed) fn(); },
      close() { if (closed) return; closed = true; clearInterval(hb); try { sendRaw({ t: 'bye' }); } catch (e) { /* ignore */ } setTimeout(() => closeRaw(), 200); },
      _in(raw) {
        lastHeard = performance.now();
        if (!raw || closed) return;
        if (raw.t === 'm') { onMsg ? onMsg(raw.d) : queue.push(raw.d); }
        else if (raw.t === 'bye') link._dead();
      },
      _dead() { if (closed) return; closed = true; clearInterval(hb); try { closeRaw(); } catch (e) { /* ignore */ } if (onClose) onClose(); },
      get closed() { return closed; },
    };
    const hb = setInterval(() => {
      try { sendRaw({ t: 'ping' }); } catch (e) { /* ignore */ }
      if (performance.now() - lastHeard > 15000) link._dead();
    }, 3000);
    return link;
  }

  // ---------- PeerJS helpers ----------
  function openPeer(id) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) return reject(new Error('no-peerjs'));
      let p;
      try { p = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 }); } catch (e) { return reject(e); }
      const t = setTimeout(() => { try { p.destroy(); } catch (e) { /* ignore */ } reject(new Error('timeout')); }, 8000);
      p.once('open', () => { clearTimeout(t); resolve(p); });
      p.once('error', (err) => { clearTimeout(t); try { p.destroy(); } catch (e) { /* ignore */ } reject(err); });
    });
  }
  function peerLink(conn, peer, ownsPeer) {
    const link = makeLink('peer', (x) => conn.send(x), () => { try { conn.close(); } catch (e) { /* ignore */ } if (ownsPeer) setTimeout(() => { try { peer.destroy(); } catch (e) { /* ignore */ } }, 300); });
    conn.on('data', (d) => link._in(d));
    conn.on('close', () => link._dead());
    conn.on('error', () => link._dead());
    return link;
  }
  // As guest: ask a host id for a seat. Resolves a link, or null if absent/busy/slow.
  function tryJoin(peer, hostId, ms) {
    return new Promise((resolve) => {
      let done = false;
      const conn = peer.connect(hostId, { reliable: true, serialization: 'json' });
      const finish = (v) => { if (done) return; done = true; clearTimeout(t); peer.off('error', onErr); if (!v) { try { conn.close(); } catch (e) { /* ignore */ } } resolve(v); };
      const onErr = (err) => { if (err && err.type === 'peer-unavailable' && String(err.message || '').includes(hostId)) finish(null); };
      const t = setTimeout(() => finish(null), ms);
      peer.on('error', onErr);
      conn.on('data', (d) => {
        if (done) return;
        if (d && d.t === 'accept') { const link = peerLink(conn, peer, true); finish(link); }
        else if (d && d.t === 'busy') finish(null);
      });
      conn.on('error', () => finish(null));
    });
  }
  // As host: wait for the first guest; later arrivals are told the seat is taken.
  function waitGuest(host, ms, isDone) {
    return new Promise((resolve) => {
      let matched = false;
      const t = ms ? setTimeout(() => { if (!matched) { matched = true; resolve(null); } }, ms) : 0;
      const poll = setInterval(() => { if (isDone() && !matched) { matched = true; clearTimeout(t); clearInterval(poll); resolve(null); } }, 250);
      host.on('connection', (conn) => {
        if (matched) { conn.on('open', () => { try { conn.send({ t: 'busy' }); } catch (e) { /* ignore */ } setTimeout(() => conn.close(), 800); }); return; }
        matched = true; clearTimeout(t); clearInterval(poll);
        const go = () => { conn.send({ t: 'accept' }); resolve(peerLink(conn, host, true)); };
        if (conn.open) go(); else conn.on('open', go);
      });
    });
  }

  // ---------- BroadcastChannel (same browser) ----------
  function bcMatch(channel, isDone, found) {
    if (!('BroadcastChannel' in window)) return () => {};
    const ch = new BroadcastChannel(channel), me = rid();
    let matched = false;
    const mkLink = (other) => {
      const link = makeLink('tab', (x) => ch.postMessage({ from: me, to: other, x }), () => ch.close());
      ch.onmessage = (e) => { const m = e.data; if (m && m.from === other && m.to === me && m.x) link._in(m.x); };
      return link;
    };
    ch.onmessage = (e) => {
      const m = e.data; if (!m || m.from === me || matched || isDone()) return;
      if (m.t === 'seek') { if (me < m.from) ch.postMessage({ t: 'offer', from: me, to: m.from }); else ch.postMessage({ t: 'seek', from: me }); }
      else if (m.t === 'offer' && m.to === me) { matched = true; ch.postMessage({ t: 'accept', from: me, to: m.from }); found(mkLink(m.from), false); }
      else if (m.t === 'accept' && m.to === me) { matched = true; found(mkLink(m.from), true); }
    };
    ch.postMessage({ t: 'seek', from: me });
    return () => { if (!matched) ch.close(); };
  }

  /* quickMatch(game, ms): look for anyone else searching the same game.
     Returns { promise -> {link, host} | null, cancel() }. */
  function quickMatch(game, ms) {
    let done = false, resolveFn;
    const promise = new Promise((r) => (resolveFn = r));
    const isDone = () => done;
    const stray = new Set();
    const finish = (res) => {
      if (done) { if (res && res.link) res.link.close(); return; }
      done = true; clearTimeout(timer); stopBc();
      for (const p of stray) if (!res || !res.peer || res.peer !== p) { try { p.destroy(); } catch (e) { /* ignore */ } }
      resolveFn(res ? { link: res.link, host: res.host } : null);
    };
    const timer = setTimeout(() => finish(null), ms);
    const stopBc = bcMatch(PREFIX + 'bc-' + game, isDone, (link, host) => finish({ link, host }));
    (async () => {
      if (!window.Peer) return;
      const base = PREFIX + game + '-q';
      let guest;
      try { guest = await openPeer(null); stray.add(guest); } catch (e) { return; }
      while (!done) {
        for (let s = 0; s < SLOTS && !done; s++) {
          const link = await tryJoin(guest, base + s, 2500);
          if (link) { stray.delete(guest); return finish({ link, host: false, peer: guest }); }
        }
        for (let s = 0; s < SLOTS && !done; s++) {
          let host;
          try { host = await openPeer(base + s); } catch (e) { if (e && e.type === 'unavailable-id') continue; return; }
          stray.add(host);
          const link = await waitGuest(host, CC.rand(5000, 9000), isDone);
          if (link) { stray.delete(host); return finish({ link, host: true, peer: host }); }
          stray.delete(host); try { host.destroy(); } catch (e) { /* ignore */ }
          break;
        }
      }
    })();
    return { promise, cancel: () => finish(null) };
  }

  /* Private rooms: a 4-letter code both players type. Only ever connects two people. */
  const roomCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  function hostRoom(game, code) {
    let done = false, resolveFn, host = null, stopBc = () => {};
    const promise = new Promise((r) => (resolveFn = r));
    const finish = (v) => { if (done) { if (v) v.link.close(); return; } done = true; stopBc(); if (!v && host) { try { host.destroy(); } catch (e) { /* ignore */ } } resolveFn(v); };
    stopBc = bcRoom(game, code, true, () => done, (link) => finish({ link, host: true }));
    (async () => {
      try { host = await openPeer(PREFIX + game + '-room-' + code); } catch (e) { if (e && e.type === 'unavailable-id') finish({ error: 'That code is already in use. Pick another.' }); return; }
      const link = await waitGuest(host, 0, () => done);
      if (link) finish({ link, host: true });
    })();
    return { promise, cancel: () => finish(null) };
  }
  function joinRoom(game, code) {
    let done = false, resolveFn, stopBc = () => {};
    const promise = new Promise((r) => (resolveFn = r));
    const finish = (v) => { if (done) { if (v && v.link) v.link.close(); return; } done = true; stopBc(); resolveFn(v); };
    stopBc = bcRoom(game, code, false, () => done, (link) => finish({ link, host: false }));
    (async () => {
      let g; try { g = await openPeer(null); } catch (e) { setTimeout(() => finish({ error: 'Could not reach the matchmaking broker. Check your connection.' }), 4000); return; }
      for (let i = 0; i < 3 && !done; i++) {
        const link = await tryJoin(g, PREFIX + game + '-room-' + code, 4000);
        if (link) return finish({ link, host: false });
      }
      if (!done) { try { g.destroy(); } catch (e) { /* ignore */ } finish({ error: 'No room with that code. Check it with your friend.' }); }
    })();
    return { promise, cancel: () => finish(null) };
  }
  function bcRoom(game, code, isHost, isDone, found) {
    if (!('BroadcastChannel' in window)) return () => {};
    const ch = new BroadcastChannel(PREFIX + 'room-' + game + '-' + code), me = rid();
    let matched = false;
    const mk = (other) => { const link = makeLink('tab', (x) => ch.postMessage({ from: me, to: other, x }), () => ch.close()); ch.onmessage = (e) => { const m = e.data; if (m && m.from === other && m.to === me && m.x) link._in(m.x); }; return link; };
    ch.onmessage = (e) => {
      const m = e.data; if (!m || m.from === me || matched || isDone()) return;
      if (isHost && m.t === 'join') { matched = true; ch.postMessage({ t: 'welcome', from: me, to: m.from }); found(mk(m.from)); }
      if (!isHost && m.t === 'welcome' && m.to === me) { matched = true; found(mk(m.from)); }
    };
    if (!isHost) { ch.postMessage({ t: 'join', from: me }); setTimeout(() => { if (!matched && !isDone()) ch.postMessage({ t: 'join', from: me }); }, 1000); }
    return () => { if (!matched) ch.close(); };
  }

  CC.net = { quickMatch, hostRoom, joinRoom, roomCode, hasPeer: () => !!window.Peer };
})();
