# Cocktail Cabinet

Seven arcade games on one static page. Every game can be played from either side: you take one side and the computer takes the other, or you watch the computer play both.

Plain HTML, CSS and JavaScript. No build step, no framework, no server code, no API keys.

## Run it locally

```bash
python3 -m http.server 8000     # or: npx serve .
# open http://localhost:8000
```

Opening `index.html` straight from disk works for the five arcade games; the online parts of Imitation and Go need to be served over http(s).

## The games and their flips

| Game | Normal | Flipped |
|---|---|---|
| Snake | You steer; the computer places each apple (farther, tighter to walls and your tail as you level up — always reachable). | You click to place apples; the computer steers. Each apple grows it by 3. Apples rot if it dawdles (+1), crashes are +2. First to 6 wins; the snake wins at 30 apples. |
| Breakout | You play the paddle; the computer's only job is to add bricks. Rows of bricks of strength 1 to 4 march down toward you; break them before they reach the red line. Power-ups drop from broken bricks: ball tripler, paddle extender, speed increaser. Three lives. | Watch the computer play (it also plays the paddle). |
| Splat | You flap; the computer lays columns (smaller gaps, wider swings, faster scroll). | You set each gap with the mouse; the computer flaps using the same physics and one input. Every gap is clamped to a band the bird can physically reach. Splat it 4 times to win; it wins at 40 columns. |
| Asteroids | You fly; the computer sends waves. Drifting tokens give power-ups when you fly into them: rapid fire, homing missiles (X or click), a shield and a triple shot. | You drag to fling asteroids (not inside the ring around the ship); the computer flies with the same turn rate, thrust and gun. Destroy 3 ships to win; the pilot wins by clearing wave 8. |
| Missile Command | You defend six cities. | **Designed flip:** you command the attack — click a target, press Space to split warheads high in the sky (limited per wave). The computer runs the three batteries with the same interceptor speed, blast size and ammo you get. Flatten all six cities to win; the defense wins by surviving wave 7. From wave 2 a random condition can change the rules for that wave (calm skies, charged batteries, supply drop, shield domes help the defense; meteor storm, armored warheads, radar jam, MIRV rain help the attack), and it leans toward whoever is losing. A wave with no city lost rebuilds one (defend side). |
| Imitation | Two minutes of chat, then both players decide: person or machine? You pick a disguise: be yourself, or play the AI. +1 for a correct call, +1 if they believe your disguise. | Opponent is either the house AI or a person in a second browser. |
| Go | 9×9 or 13×13 against the computer, as black or white. | A person in a second browser (quick match or room code). |

Every game except Imitation also has "Watch computer vs computer", which is a quick way to check that the computer really plays.

## How the computer plays

Nothing is scripted. Every computer player reads the same state the human sees and acts through the same controls and limits.

- **Snake** — time-aware breadth-first search to the apple; at higher skill it simulates eating the apple and checks it can still reach its own tail, and tail-chases instead of taking a trap. Low skill is greedy and occasionally fumbles. The apple placer scores cells by path distance, wall contact and body contact, and only picks cells the snake can reach.
- **Breakout** — the computer adds bricks: a new row (with random gaps and mixed strengths, stronger as the level rises) whenever the last one has marched far enough down, and it hurries new rows in if you clear the board. In watch mode its paddle follows the lowest falling ball and predicts where it will land, bouncing off the side walls.
- **Splat** — plans flap / no-flap every few frames by simulating the real physics a short way ahead. Skill controls how far ahead it looks and how precisely it aims. Against a human builder it is capped below perfect, so a sharp builder can always win.
- **Asteroids** — computes intercept angles for its bullets, estimates closest approach for every rock, and dodges when a collision is coming. Aim noise and reaction time improve with each wave.
- **Missile Command** — attacker: timed waves with random targets and warhead splits from wave 3. Defender: solves for an intercept point per warhead, skips warheads already covered by a blast, and (at higher skill) ignores warheads aimed at rubble. The defense now starts a little sharper against a human attacker, and the computer attack's wave size and speed ramp more gently than before.
- **Imitation** — a local rule-based chatter with a persona, human-like typing delays and typos. It answers what you actually said: questions are turned back on you in the same tone ("why are you here?" gets "idk why are you here?"), things you tell it (likes, pets, outings, moods) are picked up in the reply, a short message is read as the answer to its own last question, and when you talk about how to tell a person from a machine it stays on that subject for several turns. It takes a few seconds to answer and never speaks on its own after a silence. At low levels it occasionally slips into over-polished phrasing; that fades as you beat it. It also judges you from typing speed, phrasing, message length and whether you did a hard sum instantly.
- **Go** — Monte Carlo search: thousands of random playouts per move, with all-moves-as-first statistics and a small atari heuristic. Playouts per move rise after each of your wins (150 at level 1 up to 16,000 at level 7). At the end, dead stones are estimated with seeded playouts so both browsers in an online game agree on the count.

Difficulty ramps are in each file under `js/games/`; search for `skill` or `level`.

## Two browsers, no server

`js/net.js` links two browsers with WebRTC via PeerJS (vendored in `js/vendor/`, MIT licence). PeerJS's free public broker (`0.peerjs.com`) only introduces the two browsers; game traffic then goes peer to peer. It needs no account or key. Two tabs of the same browser also find each other through `BroadcastChannel`, which works offline and is handy for testing.

- **Quick match** tries four lobby slots as a guest, then hosts one and waits. Imitation always shows a search of at least a few seconds and a "Player found… Connecting" step whether it finds a person or falls back to the house AI, so the lobby never gives the opponent away. The reveal at the end of each round says who it was.
- **Rooms** use a four-letter code and only ever connect two people.

If the public broker is unreachable, Imitation's quick match falls back to the house AI and Go shows a message; everything else is unaffected.

## Tests

`tests/` holds the checks used while building:

- `node tests/go_test.js` — capture, suicide and ko rules; AI beats a random player.
- `node tests/go_full.js` — computer vs computer 9×9 game to the end, with dead-stone marking.
- `node tests/splat_grid.js` — bird survival by skill and speed against a worst-case builder.
- `node tests/snake_sim2.js` — trap-seeking apple placer vs the snake AI, win rates by rot allowance.
- `node tests/flip_sim.js` — scripted human vs the computer pilot (Asteroids) and defense (Missile Command).
- `node tests/imitation_judge.js` — judge verdicts by level, sample chatter replies.
- `node tests/imitation_chat.js` — the house AI answers what was said, stays on the subject, takes a few seconds, and never talks unprompted.
- `python3 tests/smoke.py`, `tests/twotab.py`, `tests/endure.py` — Playwright: every game and role loads without errors, two tabs match and chat in Imitation, a Go room connects and moves sync, and watch modes run for a minute. Set `CHROME=/path/to/chrome` if Playwright's own browser isn't installed.

## Deploy on Netlify with your own domain

1. **GitHub** — create an empty repository and push this folder to `main`.
2. **Netlify** — Add new site → Import an existing project → GitHub → pick the repository. Leave the build command empty; publish directory is `.` (already set in `netlify.toml`). Every push to `main` now deploys automatically.
3. **Domain** — buy one (Netlify Domains, or any registrar). In Netlify: Domain management → Add a domain → enter e.g. `games.yourdomain.com`.
   - Registrar DNS: add a `CNAME` record `games` → `your-site-name.netlify.app`.
   - Or move the whole domain to Netlify DNS by switching the registrar's nameservers to the four Netlify gives you.
4. **HTTPS** — once DNS resolves, Netlify issues a Let's Encrypt certificate automatically (Domain management → HTTPS). Turn on "Force HTTPS". WebRTC and the online games need HTTPS.
5. **Check continuous deployment** — change something small, push, watch the deploy appear under Deploys, and confirm the change is live on your domain.
