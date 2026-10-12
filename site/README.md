# Cocktail Cabinet

Eight arcade games on one static page. Every game can be played from either side: you take one side and the computer takes the other, or you watch the computer play both.

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
| Breakout | A brick breaker: one paddle, one ball, and a wall of five rows. A brick's strength is its row number, so row 1 (nearest the paddle) takes 1 hit and row 5 (the back) takes 5; each brick shows the hits it has left. The wall creeps down the screen, faster with time and level, and eases off as you clear it. Clear it for the next level (extra ball, narrower paddle, faster ball and creep); lose all balls or let a brick reach the red line and it's over. | You are the brick-layer and the computer plays the paddle. You get credits (20 to start, plus 0.5 a second). A level-N brick costs N credits and takes N hits (1 to 5 credits); 5 credits lowers every brick one row. Win a round by making the paddle lose its 3 balls or pushing a brick to the red line; the computer wins a round by clearing every brick. Win 6 rounds before it wins 3; the paddle sharpens each round you win. After 2.5 minutes the wall starts to creep by itself so no round can stall. |
| Splat | You flap; the computer lays columns (smaller gaps, wider swings, faster scroll). | You set each gap with the mouse; the computer flaps using the same physics and one input. Every gap is clamped to a band the bird can physically reach. Splat it 4 times to win; it wins at 40 columns. |
| Asteroids | You fly; the computer sends waves. | You drag to fling asteroids (not inside the ring around the ship); the computer flies with the same turn rate, thrust and gun. Destroy 3 ships to win; the pilot wins by clearing wave 8. |
| Missile Command | You defend six cities. | **Designed flip:** you command the attack — click a target, press Space to split warheads high in the sky (limited per wave). The computer runs the three batteries with the same interceptor speed, blast size and ammo you get. Flatten all six cities to win; the defense wins by surviving wave 7. |
| Imitation | Two minutes of chat, then both players decide: person or machine? You pick a disguise: be yourself, or play the AI. +1 for a correct call, +1 if they believe your disguise. | Opponent is either the house AI or a person in a second browser. |
| Go | 9×9 or 13×13 against the computer, as black or white. | A person in a second browser (quick match or room code). |
| Wheel of Terror | A ball swings round a pivot and a conveyor belt touching the bottom of its circle carries crates, barrels and iron blocks in from both sides. Smash them before they reach the middle. The ball turns slowly all the time; hold Space (or the mouse button, or a finger) to spin it faster. Spikes warn, then pop out at points on the circle, so you speed up or slow down to miss them. Iron only breaks when the ball is fast. Waves last 25 seconds and get faster; the computer sender is the wave generator. | You send: spend credits on objects (crate 1, barrel 2, iron 3) dropped on the belt and spikes (4) planted on the ring; the computer swings with the same speed limits and one control. A spike is only accepted if the ball has some way to dodge it. Take all the wheel's lives to win; the wheel wins by lasting six waves, and the computer swinger sharpens every wave. |

Every game except Imitation also has "Watch computer vs computer", which is a quick way to check that the computer really plays.

## How the computer plays

Nothing is scripted. Every computer player reads the same state the human sees and acts through the same controls and limits.

- **Snake** — time-aware breadth-first search to the apple; at higher skill it simulates eating the apple and checks it can still reach its own tail, and tail-chases instead of taking a trap. Low skill is greedy and occasionally fumbles. The apple placer scores cells by path distance, wall contact and body contact, and only picks cells the snake can reach.
- **Breakout** — the computer paddle simulates the ball (walls and bricks) forward until it comes back down and moves to meet it, with reaction delay, aim error and paddle speed that improve with level (full strength at level 6); at higher skill it aims its returns at the front-most bricks. In watch mode a computer brick-layer spends credits in the same shop a human uses (it can only buy bricks and lower the wall with the credits it has).
- **Wheel of Terror** — the computer swinger tries about fifty short plans (hold or release, with up to two changes) by simulating the ball, the objects and the spikes a second or three ahead, and follows the best. Skill sets how far ahead it looks, how often it re-plans and how often it slips; it starts steady and is at full strength by wave 6. The computer sender plants a spike only at an angle the ball could dodge.
- **Splat** — plans flap / no-flap every few frames by simulating the real physics a short way ahead. Skill controls how far ahead it looks and how precisely it aims. Against a human builder it is capped below perfect, so a sharp builder can always win.
- **Asteroids** — computes intercept angles for its bullets, estimates closest approach for every rock, and dodges when a collision is coming. Aim noise and reaction time improve with each wave.
- **Missile Command** — attacker: timed waves with random targets and warhead splits from wave 3. Defender: solves for an intercept point per warhead, skips warheads already covered by a blast, and (at higher skill) ignores warheads aimed at rubble.
- **Imitation** — a local rule-based chatter with a persona, human-like typing delays and typos. At low levels it occasionally slips into over-polished phrasing; that fades as you beat it. It also judges you from typing speed, phrasing, message length and whether you did a hard sum instantly.
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
- `node tests/breakout_sim.js` — scripted humans on the paddle side (three skill grades) and scripted brick-layers (never lowers, mixed, always lowers) against the computer paddle at levels 1 to 7. `HORIZON=1500` lets the paddle-side runs go longer; `SKIP_PADDLE=1` runs only the brick-layer side.
- `node tests/wheel_sim.js` — the planner standing in for a human at three skill settings against the computer sender, and scripted senders (objects only, and one that also plants spikes where the ball is heading) against the computer swinger.
- `node tests/flip_sim.js` — scripted human vs the computer pilot (Asteroids) and defense (Missile Command).
- `node tests/imitation_judge.js` — judge verdicts by level, sample chatter replies.
- `python3 tests/breakout_ui.py` — Breakout in a browser on each side: placing a level-5 brick costs 5 credits, pressing L costs 5 more, watch mode runs.
- `python3 tests/wheel_ui.py` — Wheel of Terror in a browser on each side: a crate costs 1 credit, a spike 4, watch mode runs.
- `python3 tests/smoke.py`, `tests/twotab.py`, `tests/endure.py` — Playwright: every game and role loads without errors, two tabs match and chat in Imitation, a Go room connects and moves sync, and watch modes run for a minute. Set `CHROME=/path/to/chrome` if Playwright's own browser isn't installed.

## Deploy on Netlify with your own domain

1. **GitHub** — create an empty repository and push this folder to `main`.
2. **Netlify** — Add new site → Import an existing project → GitHub → pick the repository. Leave the build command empty; publish directory is `.` (already set in `netlify.toml`). Every push to `main` now deploys automatically.
3. **Domain** — buy one (Netlify Domains, or any registrar). In Netlify: Domain management → Add a domain → enter e.g. `games.yourdomain.com`.
   - Registrar DNS: add a `CNAME` record `games` → `your-site-name.netlify.app`.
   - Or move the whole domain to Netlify DNS by switching the registrar's nameservers to the four Netlify gives you.
4. **HTTPS** — once DNS resolves, Netlify issues a Let's Encrypt certificate automatically (Domain management → HTTPS). Turn on "Force HTTPS". WebRTC and the online games need HTTPS.
5. **Check continuous deployment** — change something small, push, watch the deploy appear under Deploys, and confirm the change is live on your domain.
