# Delegation log

What I asked Claude to do, what it produced, and how it was verified. Rows marked **(you)** are for your own checks — fill them in as you do them.

| # | What I asked | What Claude produced | How it was verified |
|---|---|---|---|
| 1 | Build the whole cabinet from the brief: seven games, both sides each, static only, no API keys. | `index.html`, `css/style.css`, `js/core.js` (input, sound, RNG), `js/main.js` (menu, routing, fixed-step loop), one file per game in `js/games/`. | Claude: `node --check` on every file; Playwright smoke test opened every game in every role, sent clicks and keys, and recorded no page errors (`tests/smoke.py`). **(you)** Play each game on both sides for a few minutes. |
| 2 | Make each game fair on both sides and ramp difficulty. | Skill/level ramps in every game; placement clamps (Splat gap band, Snake reachable apples, Asteroids no-spawn ring). | Claude ran headless sims: Splat bird never dies at first → added a vision limit and a skill cap vs human builders (`tests/splat_grid.js`); Snake trap placer won ~2% → added growth 3 per apple and a tighter rot allowance, now ~33% for a strong placer (`tests/snake_sim2.js`); Asteroids sender and Missile attacker retuned until a scripted naive human sometimes wins and sometimes loses (`tests/flip_sim.js`). **(you)** Does it feel easy at the start and hard later? |
| 3 | Design the Missile Command flip. | You command the attack (targets + limited warhead splits); the computer runs the batteries with your exact limits. | Claude: scripted attacker in `tests/flip_sim.js`. **(you)** |
| 4 | Two browsers play each other; Imitation matchmaking must not reveal the AI. | `js/net.js`: PeerJS (vendored) + BroadcastChannel; quick match with a minimum search time and identical "Player found" step for person or AI; room codes. | Claude: `tests/twotab.py` matched two tabs, exchanged chat, voted and revealed; a Go room connected and a move synced. Claude could not test two separate machines (sandbox has no internet). **(you)** Test from two different browsers/devices on the deployed site. |
| 5 | Go against the computer. | Rules engine (captures, suicide, ko, area scoring, komi 6.5) and Monte Carlo AI. | Claude: `tests/go_test.js` (rules), `tests/go_full.js` (full game to the end). **(you)** |
| 6 | Deployment. | `netlify.toml`, deploy steps in the README. | **(you)** Domain purchased: ____ · Netlify site live at ____ · push-to-deploy confirmed on commit ____ |

## Things I changed after reviewing Claude's work

- **(you)**
